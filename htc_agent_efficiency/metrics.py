from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from statistics import mean

from .schemas import ActionStep, Trajectory


@dataclass(frozen=True)
class TrajectoryMetrics:
    task_id: str
    success: bool
    action_count: int
    model_calls: int
    latency_ms: float
    human_step_ratio: float | None
    efficiency_adjusted_success: float
    redundancy_counts: dict[str, int]


def is_executable(step: ActionStep) -> bool:
    return step.action_type not in {"observe", "think", "reflect", "plan", "macro"}


def count_actions(traj: Trajectory) -> int:
    return sum(1 for step in traj.steps if is_executable(step))


def count_model_calls(traj: Trajectory) -> int:
    return sum(1 for step in traj.steps if step.model_call)


def total_latency_ms(traj: Trajectory) -> float:
    return sum(step.latency_ms for step in traj.steps)


def classify_redundancy(traj: Trajectory) -> dict[str, int]:
    counts: Counter[str] = Counter()
    prev: ActionStep | None = None
    observe_streak = 0

    for step in traj.steps:
        if step.action_type == "observe":
            observe_streak += 1
            if observe_streak > 1:
                counts["repeated_observe"] += 1
        else:
            observe_streak = 0

        if prev and step.signature == prev.signature and step.action_type in {"click", "type", "press"}:
            counts["repeated_action"] += 1

        if step.action_type == "reflect" and not step.metadata.get("after_error", False):
            counts["untriggered_reflection"] += 1

        if step.action_type == "scroll" and prev and prev.action_type == "scroll":
            prev_dir = prev.metadata.get("direction")
            cur_dir = step.metadata.get("direction")
            if prev_dir and cur_dir and prev_dir != cur_dir:
                counts["scroll_oscillation"] += 1

        if step.action_type == "click" and step.metadata.get("opened_then_closed", False):
            counts["menu_detour"] += 1

        prev = step

    return dict(counts)


def trajectory_metrics(
    traj: Trajectory,
    human_reference: Trajectory | None = None,
    cost_lambda: float = 0.05,
) -> TrajectoryMetrics:
    actions = count_actions(traj)
    human_actions = count_actions(human_reference) if human_reference else None
    ratio = actions / human_actions if human_actions else None
    success_value = 1.0 if traj.success else 0.0
    efficiency_adjusted = success_value / (1.0 + cost_lambda * max(actions - 1, 0))
    return TrajectoryMetrics(
        task_id=traj.task_id,
        success=traj.success,
        action_count=actions,
        model_calls=count_model_calls(traj),
        latency_ms=total_latency_ms(traj),
        human_step_ratio=ratio,
        efficiency_adjusted_success=efficiency_adjusted,
        redundancy_counts=classify_redundancy(traj),
    )


def aggregate_metrics(rows: list[TrajectoryMetrics]) -> dict[str, float]:
    if not rows:
        return {}

    ratios = [row.human_step_ratio for row in rows if row.human_step_ratio is not None]
    redundancy_total: Counter[str] = Counter()
    for row in rows:
        redundancy_total.update(row.redundancy_counts)

    out = {
        "n": float(len(rows)),
        "success_rate": mean(1.0 if row.success else 0.0 for row in rows),
        "avg_action_count": mean(row.action_count for row in rows),
        "avg_model_calls": mean(row.model_calls for row in rows),
        "avg_latency_ms": mean(row.latency_ms for row in rows),
        "avg_efficiency_adjusted_success": mean(row.efficiency_adjusted_success for row in rows),
    }
    if ratios:
        out["avg_human_step_ratio"] = mean(ratios)
    for name, value in sorted(redundancy_total.items()):
        out[f"redundancy_{name}"] = float(value)
    return out
