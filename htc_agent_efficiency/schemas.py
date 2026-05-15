from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

RiskLevel = Literal["safe", "state_changing", "irreversible", "external"]


@dataclass(frozen=True)
class ActionStep:
    t: int
    action_type: str
    target: str = ""
    text: str = ""
    model_call: bool = False
    latency_ms: float = 0.0
    risk: RiskLevel = "safe"
    observation_required: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> "ActionStep":
        return ActionStep(
            t=int(raw.get("t", 0)),
            action_type=str(raw.get("action_type", "")),
            target=str(raw.get("target", "")),
            text=str(raw.get("text", "")),
            model_call=bool(raw.get("model_call", False)),
            latency_ms=float(raw.get("latency_ms", 0.0)),
            risk=raw.get("risk", "safe"),
            observation_required=bool(raw.get("observation_required", False)),
            metadata=dict(raw.get("metadata", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "t": self.t,
            "action_type": self.action_type,
            "target": self.target,
            "text": self.text,
            "model_call": self.model_call,
            "latency_ms": self.latency_ms,
            "risk": self.risk,
            "observation_required": self.observation_required,
            "metadata": self.metadata,
        }

    @property
    def signature(self) -> str:
        if self.action_type == "type" and self.text:
            return f"type:{self.target}"
        return f"{self.action_type}:{self.target}"


@dataclass(frozen=True)
class Trajectory:
    task_id: str
    benchmark: str
    success: bool
    steps: tuple[ActionStep, ...]
    metadata: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> "Trajectory":
        return Trajectory(
            task_id=str(raw["task_id"]),
            benchmark=str(raw.get("benchmark", "")),
            success=bool(raw.get("success", False)),
            steps=tuple(ActionStep.from_dict(step) for step in raw.get("steps", [])),
            metadata=dict(raw.get("metadata", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "benchmark": self.benchmark,
            "success": self.success,
            "steps": [step.to_dict() for step in self.steps],
            "metadata": self.metadata,
        }

