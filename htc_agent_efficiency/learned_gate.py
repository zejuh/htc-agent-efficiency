from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

from .io import load_jsonl, write_json
from .schemas import ActionStep, Trajectory

FEATURES = [
    "bias",
    "is_click",
    "is_type",
    "is_check",
    "is_select",
    "is_scroll",
    "is_press",
    "is_keyboard",
    "risk_safe",
    "risk_state_changing",
    "risk_irreversible",
    "risk_external",
    "may_change_screen",
    "checkpoint",
    "previous_changed_screen",
    "previous_is_click",
    "previous_is_type",
    "previous_is_scroll",
    "target_has_id",
    "target_has_data_attr",
    "target_is_button_like",
    "target_is_field_like",
    "target_length",
    "text_length",
]


@dataclass
class GateExample:
    features: dict[str, float]
    label: int
    task_id: str
    action_type: str
    target: str


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def features_for_step(step: ActionStep, previous: ActionStep | None) -> dict[str, float]:
    metadata = step.metadata or {}
    target = step.target or ""
    text = step.text or ""
    return {
        "bias": 1.0,
        "is_click": 1.0 if step.action_type == "click" else 0.0,
        "is_type": 1.0 if step.action_type == "type" else 0.0,
        "is_check": 1.0 if step.action_type == "check" else 0.0,
        "is_select": 1.0 if step.action_type == "select" else 0.0,
        "is_scroll": 1.0 if step.action_type == "scroll" else 0.0,
        "is_press": 1.0 if step.action_type == "press" else 0.0,
        "is_keyboard": 1.0 if step.action_type in {"press", "hotkey"} else 0.0,
        "risk_safe": 1.0 if step.risk == "safe" else 0.0,
        "risk_state_changing": 1.0 if step.risk == "state_changing" else 0.0,
        "risk_irreversible": 1.0 if step.risk == "irreversible" else 0.0,
        "risk_external": 1.0 if step.risk == "external" else 0.0,
        "may_change_screen": 1.0 if metadata.get("may_change_screen", False) else 0.0,
        "checkpoint": 1.0 if metadata.get("checkpoint", False) or step.observation_required else 0.0,
        "previous_changed_screen": 1.0 if previous and previous.metadata.get("may_change_screen", False) else 0.0,
        "previous_is_click": 1.0 if previous and previous.action_type == "click" else 0.0,
        "previous_is_type": 1.0 if previous and previous.action_type == "type" else 0.0,
        "previous_is_scroll": 1.0 if previous and previous.action_type == "scroll" else 0.0,
        "target_has_id": 1.0 if target.startswith("#") or "#" in target else 0.0,
        "target_has_data_attr": 1.0 if "data-" in target else 0.0,
        "target_is_button_like": 1.0 if any(token in target.lower() for token in ("button", "btn", "send", "save", "checkout", "compose", "search", "rename", "add")) else 0.0,
        "target_is_field_like": 1.0 if any(token in target.lower() for token in ("field", "input", "textarea", "search")) else 0.0,
        "target_length": min(len(target), 120) / 120.0,
        "text_length": min(len(text), 200) / 200.0,
    }


def make_examples(trajectories: list[Trajectory]) -> list[GateExample]:
    examples: list[GateExample] = []
    for traj in trajectories:
        previous_action: ActionStep | None = None
        for step in traj.steps:
            if step.action_type in {"observe", "think", "reflect", "plan", "macro"}:
                continue
            label = int(
                step.observation_required
                or step.risk in {"irreversible", "external"}
                or (previous_action is not None and previous_action.metadata.get("may_change_screen", False))
            )
            examples.append(
                GateExample(
                    features=features_for_step(step, previous_action),
                    label=label,
                    task_id=traj.task_id,
                    action_type=step.action_type,
                    target=step.target,
                )
            )
            previous_action = step
    return examples


def train_logistic(examples: list[GateExample], epochs: int = 400, lr: float = 0.1, l2: float = 0.001) -> dict[str, float]:
    weights = {name: 0.0 for name in FEATURES}
    if not examples:
        return weights

    for _ in range(epochs):
        for ex in examples:
            score = sum(weights[name] * ex.features.get(name, 0.0) for name in FEATURES)
            pred = sigmoid(score)
            err = pred - ex.label
            for name in FEATURES:
                grad = err * ex.features.get(name, 0.0) + l2 * weights[name]
                weights[name] -= lr * grad
    return weights


def predict(weights: dict[str, float], features: dict[str, float], threshold: float = 0.5) -> tuple[int, float]:
    score = sum(weights.get(name, 0.0) * features.get(name, 0.0) for name in FEATURES)
    prob = sigmoid(score)
    return int(prob >= threshold), prob


def evaluate(weights: dict[str, float], examples: list[GateExample]) -> dict[str, float]:
    if not examples:
        return {"n": 0.0, "accuracy": 0.0}
    correct = 0
    false_skip = 0
    unnecessary_observe = 0
    for ex in examples:
        pred, _ = predict(weights, ex.features)
        correct += int(pred == ex.label)
        false_skip += int(pred == 0 and ex.label == 1)
        unnecessary_observe += int(pred == 1 and ex.label == 0)
    return {
        "n": float(len(examples)),
        "accuracy": correct / len(examples),
        "false_skip_rate": false_skip / len(examples),
        "unnecessary_observe_rate": unnecessary_observe / len(examples),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a lightweight observation-gate classifier.")
    parser.add_argument("--trajectories", required=True, help="JSONL trajectories with action metadata")
    parser.add_argument("--out", required=True, help="Output model JSON path")
    args = parser.parse_args()

    trajectories = load_jsonl(args.trajectories)
    examples = make_examples(trajectories)
    weights = train_logistic(examples)
    metrics = evaluate(weights, examples)
    payload = {
        "model_type": "logistic_observation_gate",
        "features": FEATURES,
        "weights": weights,
        "train_metrics": metrics,
        "note": "This is a small supervised gate for demo-scale experiments; paper claims require larger benchmark training data.",
    }
    write_json(args.out, payload)
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
