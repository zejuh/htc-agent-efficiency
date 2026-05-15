from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import re

from .metrics import is_executable
from .schemas import ActionStep, Trajectory


@dataclass(frozen=True)
class ActionMacro:
    name: str
    pattern: tuple[str, ...]
    support: int
    abstraction: str = "exact"

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "pattern": list(self.pattern),
            "support": self.support,
            "abstraction": self.abstraction,
        }


def executable_signatures(traj: Trajectory) -> list[str]:
    return [step.signature for step in traj.steps if is_executable(step)]


def target_kind(step: ActionStep) -> str:
    metadata = step.metadata or {}
    for key in ("role", "target_role", "element_role", "control_type"):
        if metadata.get(key):
            return str(metadata[key]).lower()

    target = step.target.lower()
    action = step.action_type.lower()
    if action == "type":
        return "text-input"
    if action == "check":
        return "checkbox"
    if action == "select":
        return "select"
    if action in {"press", "hotkey"}:
        return "keyboard"
    if action == "scroll":
        return "scroll-region"
    if any(token in target for token in ("button", "btn", "send", "save", "checkout", "compose", "search", "rename", "add")):
        return "button"
    if any(token in target for token in ("field", "input", "textarea", "search")):
        return "text-input"
    if "data-contact" in target or "data-file" in target or "row" in target:
        return "list-item"
    if target in {"screen", "page", "window"}:
        return target
    return "element"


def text_bucket(text: str) -> str:
    if not text:
        return "empty"
    if re.fullmatch(r"[\w.+-]+@[\w.-]+", text):
        return "email"
    if len(text) <= 8:
        return "short-text"
    if len(text) <= 40:
        return "medium-text"
    return "long-text"


def parameterized_signature(step: ActionStep) -> str:
    action = step.action_type
    kind = target_kind(step)
    if action == "type":
        return f"type:{kind}:{text_bucket(step.text)}"
    if action in {"click", "check", "select", "scroll", "press", "hotkey"}:
        return f"{action}:{kind}"
    return f"{action}:{kind}"


def signatures(traj: Trajectory, abstraction: str = "parameterized") -> list[str]:
    if abstraction == "exact":
        return executable_signatures(traj)
    if abstraction == "parameterized":
        return [parameterized_signature(step) for step in traj.steps if is_executable(step)]
    raise ValueError(f"Unknown macro abstraction: {abstraction}")


def mine_macros(
    trajectories: list[Trajectory],
    min_len: int = 2,
    max_len: int = 4,
    min_support: int = 2,
    abstraction: str = "parameterized",
) -> list[ActionMacro]:
    counts: Counter[tuple[str, ...]] = Counter()
    for traj in trajectories:
        sigs = signatures(traj, abstraction=abstraction)
        for n in range(min_len, max_len + 1):
            for i in range(0, max(len(sigs) - n + 1, 0)):
                counts[tuple(sigs[i : i + n])] += 1

    macros = [
        ActionMacro(name=f"macro_{idx:03d}", pattern=pattern, support=support, abstraction=abstraction)
        for idx, (pattern, support) in enumerate(counts.most_common())
        if support >= min_support
    ]
    return sorted(macros, key=lambda macro: (-len(macro.pattern), -macro.support, macro.pattern))


def macro_coverage(traj: Trajectory, macros: list[ActionMacro], abstraction: str | None = None) -> dict[str, int]:
    coverage: Counter[str] = Counter()
    for macro in macros:
        sigs = signatures(traj, abstraction=abstraction or macro.abstraction)
        n = len(macro.pattern)
        for i in range(0, max(len(sigs) - n + 1, 0)):
            if tuple(sigs[i : i + n]) == macro.pattern:
                coverage[macro.name] += 1
    return dict(coverage)
