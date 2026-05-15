from __future__ import annotations

import json
from pathlib import Path
from dataclasses import replace

from .schemas import ActionStep, Trajectory


class ObservationGate:
    """Decides whether an observation/model call is necessary after an action."""

    def __init__(self, require_before_risks: set[str] | None = None):
        self.require_before_risks = require_before_risks or {"irreversible", "external"}

    def requires_observation_after(self, step: ActionStep, next_step: ActionStep | None) -> bool:
        if step.observation_required:
            return True
        if step.risk in self.require_before_risks:
            return True
        if next_step and next_step.risk in self.require_before_risks:
            return True
        if step.action_type in {"navigate", "submit", "open_app", "drag", "drop"}:
            return True
        if step.action_type == "click" and step.metadata.get("may_change_screen", True):
            return True
        return False


class ModelBasedObservationGate(ObservationGate):
    """Observation gate backed by a trained `learned_gate.py` JSON model.

    The model predicts whether the next executable step requires observing
    before it runs. With `safety_floor=True`, explicit irreversible/external
    checkpoints still override the model prediction.
    """

    def __init__(
        self,
        model_path: str | Path,
        threshold: float = 0.5,
        safety_floor: bool = True,
        require_before_risks: set[str] | None = None,
    ):
        super().__init__(require_before_risks=require_before_risks)
        with Path(model_path).open("r", encoding="utf-8") as f:
            payload = json.load(f)
        self.weights = dict(payload.get("weights", {}))
        self.threshold = threshold
        self.safety_floor = safety_floor

    def requires_observation_after(self, step: ActionStep, next_step: ActionStep | None) -> bool:
        if self.safety_floor and (
            step.observation_required
            or step.risk in self.require_before_risks
            or (next_step is not None and (next_step.observation_required or next_step.risk in self.require_before_risks))
        ):
            return True
        if next_step is None:
            return super().requires_observation_after(step, next_step)

        from .learned_gate import features_for_step, predict

        pred, _ = predict(self.weights, features_for_step(next_step, step), threshold=self.threshold)
        return bool(pred)


class TrajectoryCompressor:
    def __init__(self, observation_gate: ObservationGate | None = None):
        self.observation_gate = observation_gate or ObservationGate()

    def compress(self, traj: Trajectory) -> Trajectory:
        steps = self._remove_repeated_observations(list(traj.steps))
        steps = self._aggregate_repeated_safe_actions(steps)
        steps = self._drop_unneeded_observe_model_calls(steps)
        return Trajectory(
            task_id=traj.task_id,
            benchmark=traj.benchmark,
            success=traj.success,
            steps=tuple(replace(step, t=i) for i, step in enumerate(steps)),
            metadata={**traj.metadata, "compressed_by": "TrajectoryCompressor"},
        )

    def _remove_repeated_observations(self, steps: list[ActionStep]) -> list[ActionStep]:
        out: list[ActionStep] = []
        prev_observe = False
        for step in steps:
            if step.action_type == "observe" and prev_observe:
                continue
            out.append(step)
            prev_observe = step.action_type == "observe"
        return out

    def _aggregate_repeated_safe_actions(self, steps: list[ActionStep]) -> list[ActionStep]:
        out: list[ActionStep] = []
        for step in steps:
            if (
                out
                and step.signature == out[-1].signature
                and step.risk == "safe"
                and out[-1].risk == "safe"
                and step.action_type in {"scroll", "press", "hotkey"}
            ):
                prev = out[-1]
                repeat_count = int(prev.metadata.get("repeat_count", 1)) + 1
                out[-1] = replace(
                    prev,
                    latency_ms=prev.latency_ms + step.latency_ms,
                    metadata={**prev.metadata, "repeat_count": repeat_count, "aggregated": True},
                )
                continue
            out.append(step)
        return out

    def _drop_unneeded_observe_model_calls(self, steps: list[ActionStep]) -> list[ActionStep]:
        out: list[ActionStep] = []
        for idx, step in enumerate(steps):
            if step.action_type != "observe":
                out.append(step)
                continue

            prev = out[-1] if out else None
            next_step = steps[idx + 1] if idx + 1 < len(steps) else None
            if prev is None:
                out.append(step)
                continue
            if self.observation_gate.requires_observation_after(prev, next_step):
                out.append(step)
                continue

            # Keep a cheap state marker but remove expensive model/VLM call.
            out.append(replace(step, model_call=False, latency_ms=min(step.latency_ms, 50.0)))
        return out
