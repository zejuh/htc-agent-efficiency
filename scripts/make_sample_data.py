"""Generate a small synthetic oracle-steps file so the trainer/tests/pipeline run
offline (no API key). The synthetic labeling deliberately includes the regime that
motivates the project: stable screen + safe action + LOW model confidence -> the
observation was still needed. The hand rule (observe only on screen change / risk)
misses exactly those, leaving room for the learned gate.

This is NOT a substitute for real collection (runner/collect.mjs) — it only exercises
the pipeline. Real experiments train on data/oracle_steps.jsonl.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "sample_steps.jsonl"

FEATURES = [
    "bias", "no_plan", "screen_changed_last", "candidates_changed_last",
    "steps_since_observe", "remaining_plan_len", "plan_age",
    "next_is_click", "next_is_fill", "next_is_check", "next_is_select",
    "next_risk_state_changing", "next_risk_external", "next_risk_irreversible",
    "verbalized_confidence", "verbalized_needs_observation",
]

TASK_IDS = [
    "mail-send-update", "shop-add-notebook", "contacts-open-jordan",
    "settings-save-japanese", "files-rename-draft", "shop-add-notebook-async",
    "contacts-open-jordan-async", "mail-send-suggested",
]


def make_row(rng: random.Random, task_id: str) -> dict:
    no_plan = 1.0 if rng.random() < 0.12 else 0.0
    screen_changed = 0.0 if no_plan else (1.0 if rng.random() < 0.4 else 0.0)
    cand_changed = screen_changed if rng.random() < 0.8 else (1.0 - screen_changed)
    steps_since = 0.0 if no_plan else round(rng.randint(1, 6) / 10.0, 1)
    remaining = round(rng.randint(0, 5) / 8.0, 3)
    atype = rng.choice(["click", "fill", "check", "select"])
    risk = rng.choices(["safe", "state_changing", "external", "irreversible"], weights=[6, 2, 1, 1])[0]
    conf = round(rng.uniform(0.3, 1.0), 2)
    needs = 1.0 if (conf < 0.55 and rng.random() < 0.7) else (1.0 if rng.random() < 0.05 else 0.0)

    f = {n: 0.0 for n in FEATURES}
    f.update({
        "bias": 1.0,
        "no_plan": no_plan,
        "screen_changed_last": screen_changed,
        "candidates_changed_last": cand_changed,
        "steps_since_observe": steps_since,
        "remaining_plan_len": remaining,
        "plan_age": steps_since,
        f"next_is_{atype}": 1.0,
        "verbalized_confidence": conf,
        "verbalized_needs_observation": needs,
    })
    if risk == "state_changing":
        f["next_risk_state_changing"] = 1.0
    elif risk == "external":
        f["next_risk_external"] = 1.0
    elif risk == "irreversible":
        f["next_risk_irreversible"] = 1.0

    # Ground-truth "observation was needed": no plan, screen changed, risky,
    # OR (the key case) stable+safe but the model was unsure / had coasted a while.
    need = (
        no_plan >= 0.5
        or screen_changed >= 0.5
        or risk in ("external", "irreversible")
        or conf < 0.55
        or needs >= 0.5
        or steps_since >= 0.5
    )
    if rng.random() < 0.06:  # label noise
        need = not need
    return {
        "task_id": task_id,
        "benchmark": "synthetic",
        "features": f,
        "label": int(need),
        "is_checkpoint": risk in ("external", "irreversible"),
    }


def main() -> None:
    rng = random.Random(7)
    rows = []
    for task_id in TASK_IDS:
        for _ in range(20):
            rows.append(make_row(rng, task_id))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    pos = sum(r["label"] for r in rows)
    print(f"Wrote {len(rows)} rows to {OUT} (positive rate {pos / len(rows):.3f})")


if __name__ == "__main__":
    main()
