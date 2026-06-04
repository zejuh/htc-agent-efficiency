"""Train a cost-sensitive observation gate from oracle-labeled steps.

The gate is learned over the observation features logged by the collector. The
label is the oracle divergence label (1 = observing here changed the action).
We export a JSON the JS evaluator consumes, and we compare the learned gate
against the hand-coded rule on held-out tasks.

Two gate families are supported:

- logistic: transparent linear baseline
- mlp: one-hidden-layer neural gate for nonlinear feature interactions

The default ``auto`` mode selects between them on a validation split, then
re-fits the winner on train+validation before reporting on the final test split.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass

from .io import load_steps, write_json


def sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


def relu(x: float) -> float:
    return x if x > 0 else 0.0


def feature_names(rows: list[dict]) -> list[str]:
    names: set[str] = set()
    for r in rows:
        names.update(r["features"].keys())
    names.add("bias")
    rest = sorted(n for n in names if n != "bias")
    return ["bias", *rest]


FEATURE_PRESETS: dict[str, list[str]] = {
    "all": [],
    "compact_core": [
        "bias",
        "no_plan",
        "screen_changed_last",
        "candidates_changed_last",
        "steps_since_observe",
        "remaining_plan_len",
        "next_risk_state_changing",
        "verbalized_confidence",
        "verbalized_needs_observation",
    ],
    "compact_plus_action": [
        "bias",
        "no_plan",
        "screen_changed_last",
        "candidates_changed_last",
        "steps_since_observe",
        "remaining_plan_len",
        "next_is_click",
        "next_is_fill",
        "next_risk_state_changing",
        "verbalized_confidence",
        "verbalized_needs_observation",
    ],
    "compact_plus_risk": [
        "bias",
        "no_plan",
        "screen_changed_last",
        "candidates_changed_last",
        "steps_since_observe",
        "remaining_plan_len",
        "next_is_click",
        "next_risk_state_changing",
        "next_risk_external",
        "next_risk_irreversible",
        "verbalized_confidence",
        "verbalized_needs_observation",
    ],
}


def resolve_feature_subset(rows: list[dict], preset: str, features_arg: str | None) -> list[str]:
    available = feature_names(rows)
    available_set = set(available)
    if features_arg:
        chosen = [name.strip() for name in features_arg.split(",") if name.strip()]
    elif preset != "all":
        chosen = FEATURE_PRESETS[preset]
    else:
        chosen = available
    missing = [name for name in chosen if name not in available_set]
    if missing:
        raise ValueError(f"Requested features not present in data: {missing}")
    if "bias" not in chosen:
        chosen = ["bias", *chosen]
    seen: set[str] = set()
    ordered = []
    for name in chosen:
        if name in seen:
            continue
        seen.add(name)
        ordered.append(name)
    return ordered


def split_by_task(rows: list[dict], holdout_every: int = 4) -> tuple[list[dict], list[dict]]:
    task_ids = sorted({r.get("task_id", "") for r in rows})
    test_ids = {tid for i, tid in enumerate(task_ids) if i % holdout_every == holdout_every - 1}
    train = [r for r in rows if r.get("task_id", "") not in test_ids]
    test = [r for r in rows if r.get("task_id", "") in test_ids]
    if not train or not test:
        train = [r for i, r in enumerate(rows) if i % holdout_every != holdout_every - 1]
        test = [r for i, r in enumerate(rows) if i % holdout_every == holdout_every - 1]
    return train, test


def split_train_val_test(rows: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    task_ids = sorted({r.get("task_id", "") for r in rows})
    if len(task_ids) >= 5:
        train_ids = {tid for i, tid in enumerate(task_ids) if i % 5 in (0, 1, 2)}
        val_ids = {tid for i, tid in enumerate(task_ids) if i % 5 == 3}
        test_ids = {tid for i, tid in enumerate(task_ids) if i % 5 == 4}
        train = [r for r in rows if r.get("task_id", "") in train_ids]
        val = [r for r in rows if r.get("task_id", "") in val_ids]
        test = [r for r in rows if r.get("task_id", "") in test_ids]
        if train and val and test:
            return train, val, test

    train_val, test = split_by_task(rows)
    train, val = split_by_task(train_val, holdout_every=3)
    if train and val and test:
        return train, val, test

    n = len(rows)
    train = [r for i, r in enumerate(rows) if i % 5 not in (3, 4)]
    val = [r for i, r in enumerate(rows) if i % 5 == 3]
    test = [r for i, r in enumerate(rows) if i % 5 == 4]
    if not train:
        train = rows[: max(1, n // 2)]
    if not val:
        val = rows[max(1, n // 2) : max(2, (3 * n) // 4)]
    if not test:
        test = rows[max(2, (3 * n) // 4) :]
    return train, val, test


def row_to_vector(row: dict, names: list[str]) -> list[float]:
    return [float(row["features"].get(n, 0.0)) for n in names]


def train_logistic(
    rows: list[dict],
    names: list[str],
    epochs: int = 600,
    lr: float = 0.2,
    l2: float = 1e-3,
) -> dict[str, float]:
    weights = {n: 0.0 for n in names}
    if not rows:
        return weights
    for _ in range(epochs):
        for r in rows:
            f = r["features"]
            score = sum(weights[n] * f.get(n, 0.0) for n in names)
            err = sigmoid(score) - r["label"]
            for n in names:
                grad = err * f.get(n, 0.0) + l2 * weights[n]
                weights[n] -= lr * grad
    return weights


def train_sklearn_logistic(rows: list[dict], names: list[str]) -> dict[str, float]:
    from sklearn.linear_model import LogisticRegression  # type: ignore

    feat_names = [n for n in names if n != "bias"]
    X = [[r["features"].get(n, 0.0) for n in feat_names] for r in rows]
    y = [r["label"] for r in rows]
    clf = LogisticRegression(max_iter=1000, C=1.0)
    clf.fit(X, y)
    weights = {n: float(c) for n, c in zip(feat_names, clf.coef_[0])}
    weights["bias"] = float(clf.intercept_[0])
    return weights


def train_mlp(
    rows: list[dict],
    names: list[str],
    hidden_dim: int = 8,
    epochs: int = 450,
    lr: float = 0.05,
    l2: float = 1e-4,
    seed: int = 7,
) -> dict:
    rng = random.Random(seed)
    in_dim = len(names)
    hidden_weights = [[rng.uniform(-0.15, 0.15) for _ in range(in_dim)] for _ in range(hidden_dim)]
    hidden_bias = [0.0 for _ in range(hidden_dim)]
    out_weights = [rng.uniform(-0.15, 0.15) for _ in range(hidden_dim)]
    out_bias = 0.0

    if not rows:
        return {
            "model_type": "mlp",
            "features": names,
            "hidden_dim": hidden_dim,
            "hidden_weights": hidden_weights,
            "hidden_bias": hidden_bias,
            "output_weights": out_weights,
            "output_bias": out_bias,
        }

    for _ in range(epochs):
        for r in rows:
            x = row_to_vector(r, names)
            y = float(r["label"])

            z1 = [
                sum(hidden_weights[h][j] * x[j] for j in range(in_dim)) + hidden_bias[h]
                for h in range(hidden_dim)
            ]
            a1 = [relu(v) for v in z1]
            z2 = sum(out_weights[h] * a1[h] for h in range(hidden_dim)) + out_bias
            p = sigmoid(z2)

            dz2 = p - y
            old_out_weights = out_weights[:]

            for h in range(hidden_dim):
                grad = dz2 * a1[h] + l2 * out_weights[h]
                out_weights[h] -= lr * grad
            out_bias -= lr * dz2

            for h in range(hidden_dim):
                dz1 = dz2 * old_out_weights[h] * (1.0 if z1[h] > 0 else 0.0)
                for j in range(in_dim):
                    grad = dz1 * x[j] + l2 * hidden_weights[h][j]
                    hidden_weights[h][j] -= lr * grad
                hidden_bias[h] -= lr * dz1

    return {
        "model_type": "mlp",
        "features": names,
        "hidden_dim": hidden_dim,
        "hidden_weights": hidden_weights,
        "hidden_bias": hidden_bias,
        "output_weights": out_weights,
        "output_bias": out_bias,
    }


def predict_prob(weights: dict[str, float], features: dict, names: list[str]) -> float:
    return sigmoid(sum(weights.get(n, 0.0) * features.get(n, 0.0) for n in names))


def predict_mlp_prob(model: dict, features: dict) -> float:
    names = model["features"]
    x = [float(features.get(n, 0.0)) for n in names]
    hidden = []
    for weights, bias in zip(model["hidden_weights"], model["hidden_bias"]):
        hidden.append(relu(sum(w * v for w, v in zip(weights, x)) + bias))
    score = sum(w * h for w, h in zip(model["output_weights"], hidden)) + model["output_bias"]
    return sigmoid(score)


def predict_model_prob(model: dict, features: dict) -> float:
    if model.get("model_type") == "mlp":
        return predict_mlp_prob(model, features)
    return predict_prob(model["weights"], features, model["features"])


def handrule_observe(features: dict) -> int:
    """The baseline the learned gate must beat: observe on screen change, before
    risky carried actions, or when there is no carried plan."""
    return int(
        features.get("no_plan", 0.0) >= 0.5
        or features.get("screen_changed_last", 0.0) >= 0.5
        or features.get("next_risk_external", 0.0) >= 0.5
        or features.get("next_risk_irreversible", 0.0) >= 0.5
    )


def decision_metrics(preds: list[int], labels: list[int]) -> dict[str, float]:
    n = len(labels) or 1
    correct = sum(int(p == y) for p, y in zip(preds, labels))
    false_skip = sum(int(p == 0 and y == 1) for p, y in zip(preds, labels))
    waste = sum(int(p == 1 and y == 0) for p, y in zip(preds, labels))
    return {
        "n": float(len(labels)),
        "accuracy": correct / n,
        "false_skip_rate": false_skip / n,
        "unnecessary_observe_rate": waste / n,
    }


def calibration(model: dict, rows: list[dict], bins: int = 10) -> list[dict]:
    buckets: list[dict] = [
        {"lo": i / bins, "hi": (i + 1) / bins, "n": 0, "sum_label": 0, "sum_prob": 0.0}
        for i in range(bins)
    ]
    for r in rows:
        p = predict_model_prob(model, r["features"])
        b = min(int(p * bins), bins - 1)
        buckets[b]["n"] += 1
        buckets[b]["sum_label"] += r["label"]
        buckets[b]["sum_prob"] += p
    out = []
    for b in buckets:
        if b["n"]:
            out.append(
                {
                    "bin": f'{b["lo"]:.1f}-{b["hi"]:.1f}',
                    "n": b["n"],
                    "mean_pred": round(b["sum_prob"] / b["n"], 4),
                    "empirical_rate": round(b["sum_label"] / b["n"], 4),
                }
            )
    return out


@dataclass
class CandidateResult:
    learner: str
    model: dict
    val_metrics: dict[str, float]


def train_candidate(rows: list[dict], names: list[str], learner: str, use_sklearn_logistic: bool) -> dict:
    if learner == "logistic":
        weights = train_sklearn_logistic(rows, names) if use_sklearn_logistic else train_logistic(rows, names)
        return {"model_type": "logistic", "features": names, "weights": weights}
    if learner == "mlp":
        return train_mlp(rows, names)
    raise ValueError(f"Unsupported learner: {learner}")


def choose_best_candidate(results: list[CandidateResult]) -> CandidateResult:
    def rank_key(item: CandidateResult) -> tuple[float, float, float]:
        m = item.val_metrics
        return (
            m["false_skip_rate"],
            -m["accuracy"],
            m["unnecessary_observe_rate"],
        )

    return sorted(results, key=rank_key)[0]


def metrics_for_model(model: dict, split: list[dict], threshold: float) -> dict[str, float]:
    preds = [int(predict_model_prob(model, r["features"]) >= threshold) for r in split]
    return decision_metrics(preds, [r["label"] for r in split])


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the observation gate from oracle-labeled steps.")
    parser.add_argument("--steps", required=True, help="JSONL produced by runner/collect.mjs")
    parser.add_argument("--out", required=True, help="Output gate model JSON")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument(
        "--learner",
        choices=["auto", "logistic", "mlp"],
        default="auto",
        help="Gate family to train. 'auto' chooses the best validation performer.",
    )
    parser.add_argument(
        "--sklearn-logistic",
        action="store_true",
        help="Use scikit-learn LogisticRegression for the logistic baseline if available.",
    )
    parser.add_argument(
        "--feature-preset",
        choices=sorted(FEATURE_PRESETS.keys()),
        default="all",
        help="Named feature subset to train on. Use 'all' for the full feature contract.",
    )
    parser.add_argument(
        "--features",
        help="Optional comma-separated feature list. Overrides --feature-preset.",
    )
    args = parser.parse_args()

    rows = load_steps(args.steps)
    if not rows:
        raise SystemExit("No labeled rows found. Run runner/collect.mjs first.")
    names = resolve_feature_subset(rows, args.feature_preset, args.features)
    train, val, test = split_train_val_test(rows)

    learners = ["logistic", "mlp"] if args.learner == "auto" else [args.learner]
    candidate_results: list[CandidateResult] = []
    for learner in learners:
        model = train_candidate(train, names, learner, args.sklearn_logistic)
        candidate_results.append(
            CandidateResult(
                learner=learner,
                model=model,
                val_metrics=metrics_for_model(model, val, args.threshold),
            )
        )

    winner = choose_best_candidate(candidate_results)
    final_train = train + val
    final_model = train_candidate(final_train, names, winner.learner, args.sklearn_logistic)

    payload = {
        **final_model,
        "threshold": args.threshold,
        "selected_learner": winner.learner,
        "selection_split_sizes": {"train": len(train), "val": len(val), "test": len(test)},
        "feature_preset": args.feature_preset if not args.features else "custom",
        "label_base_rate": round(sum(r["label"] for r in rows) / len(rows), 4),
        "candidate_metrics_val": {c.learner: c.val_metrics for c in candidate_results},
        "metrics": {
            "learned_val_selected_model": winner.val_metrics,
            "learned_test": metrics_for_model(final_model, test, args.threshold),
            "handrule_test": decision_metrics(
                [handrule_observe(r["features"]) for r in test],
                [r["label"] for r in test],
            ),
        },
        "calibration_test": calibration(final_model, test),
        "note": (
            "Auto-selection now compares a transparent logistic gate to a shallow neural gate, "
            "then reports the final model on held-out tasks."
        ),
    }
    write_json(args.out, payload)
    print(
        json.dumps(
            {
                "model_type": payload["model_type"],
                "selected_learner": payload["selected_learner"],
                "selection_split_sizes": payload["selection_split_sizes"],
                "label_base_rate": payload["label_base_rate"],
                "candidate_metrics_val": payload["candidate_metrics_val"],
                "metrics": payload["metrics"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
