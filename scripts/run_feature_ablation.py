from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from soa.gate import (
    CandidateResult,
    choose_best_candidate,
    decision_metrics,
    handrule_observe,
    metrics_for_model,
    split_train_val_test,
    train_candidate,
)
from soa.io import load_steps, write_json


ABLATIONS: dict[str, list[str]] = {
    "full": [],
    "no_value_change": ["field_value_changed_last", "button_text_changed_last", "option_text_changed_last"],
    "no_confidence": ["verbalized_confidence", "verbalized_needs_observation"],
    "no_screen_change": ["screen_changed_last", "candidates_changed_last"],
    "no_plan_state": ["no_plan", "steps_since_observe", "remaining_plan_len"],
    "no_action_type": ["next_is_click", "next_is_fill", "next_is_check", "next_is_select"],
    "no_risk": ["next_risk_state_changing", "next_risk_external", "next_risk_irreversible"],
}


def feature_names_for(rows: list[dict]) -> list[str]:
    names: set[str] = set()
    for row in rows:
        names.update(row["features"].keys())
    names.add("bias")
    return ["bias", *sorted(name for name in names if name != "bias")]


def drop_features(rows: list[dict], names_to_drop: list[str]) -> list[dict]:
    drop = set(names_to_drop)
    out = []
    for row in rows:
        clone = deepcopy(row)
        clone["features"] = {k: v for k, v in row["features"].items() if k not in drop}
        clone["features"]["bias"] = 1.0
        out.append(clone)
    return out


def train_auto(train: list[dict], val: list[dict], names: list[str], threshold: float, learner: str) -> tuple[str, dict, dict]:
    learners = ["logistic", "mlp"] if learner == "auto" else [learner]
    candidates = []
    for candidate in learners:
        model = train_candidate(train, names, candidate, use_sklearn_logistic=False)
        candidates.append(
            CandidateResult(
                learner=candidate,
                model=model,
                val_metrics=metrics_for_model(model, val, threshold),
            )
        )
    winner = choose_best_candidate(candidates)
    return winner.learner, winner.model, {item.learner: item.val_metrics for item in candidates}


def markdown_table(results: list[dict]) -> str:
    lines = [
        "| 变体 | 移除特征 | Learner | Test accuracy | False skip | Wasted observe | Val false skip |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for row in results:
        test = row["learned_test"]
        val = row["selected_val_metrics"]
        dropped = ", ".join(row["dropped_features"]) or "无"
        lines.append(
            "| {variant} | {dropped} | {learner} | {acc:.3f} | {false_skip:.3f} | {waste:.3f} | {val_false_skip:.3f} |".format(
                variant=row["variant"],
                dropped=dropped,
                learner=row["selected_learner"],
                acc=test["accuracy"],
                false_skip=test["false_skip_rate"],
                waste=test["unnecessary_observe_rate"],
                val_false_skip=val["false_skip_rate"],
            )
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="为 observation gate 运行 feature ablation。")
    parser.add_argument("--steps", required=True, help="runner/collect.mjs 生成的 JSONL")
    parser.add_argument("--out", required=True, help="输出 JSON 文件")
    parser.add_argument("--markdown-out", help="可选 Markdown 表格输出")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--learner", choices=["auto", "logistic", "mlp"], default="auto")
    args = parser.parse_args()

    rows = load_steps(args.steps)
    if not rows:
        raise SystemExit("没有找到带标签的行。")

    results = []
    for variant, dropped in ABLATIONS.items():
        ablated_rows = drop_features(rows, dropped)
        train, val, test = split_train_val_test(ablated_rows)
        names = feature_names_for(ablated_rows)
        selected, _selected_model, candidate_metrics = train_auto(train, val, names, args.threshold, args.learner)
        final_model = train_candidate(train + val, names, selected, use_sklearn_logistic=False)
        learned_test = metrics_for_model(final_model, test, args.threshold)
        selected_val = candidate_metrics[selected]

        results.append(
            {
                "variant": variant,
                "dropped_features": dropped,
                "selected_learner": selected,
                "n_features": len(names),
                "split_sizes": {"train": len(train), "val": len(val), "test": len(test)},
                "candidate_metrics_val": candidate_metrics,
                "selected_val_metrics": selected_val,
                "learned_test": learned_test,
            }
        )

    payload = {
        "steps": args.steps,
        "threshold": args.threshold,
        "learner": args.learner,
        "label_base_rate": sum(row["label"] for row in rows) / len(rows),
        "handrule_test_reference": decision_metrics(
            [handrule_observe(row["features"]) for row in split_train_val_test(rows)[2]],
            [row["label"] for row in split_train_val_test(rows)[2]],
        ),
        "ablations": results,
    }
    write_json(args.out, payload)

    table = markdown_table(results)
    if args.markdown_out:
        Path(args.markdown_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown_out).write_text(table, encoding="utf-8")
    print(table)


if __name__ == "__main__":
    main()
