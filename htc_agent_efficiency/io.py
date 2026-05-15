from __future__ import annotations

import json
from pathlib import Path

from .schemas import Trajectory


def load_jsonl(path: str | Path) -> list[Trajectory]:
    trajectories: list[Trajectory] = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                trajectories.append(Trajectory.from_dict(json.loads(line)))
            except Exception as exc:
                raise ValueError(f"Invalid trajectory JSONL at {path}:{line_no}") from exc
    return trajectories


def write_json(path: str | Path, payload: object) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")

