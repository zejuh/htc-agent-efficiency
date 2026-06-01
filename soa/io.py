from __future__ import annotations

import json
from pathlib import Path


def load_steps(path: str | Path) -> list[dict]:
    """Load oracle step rows; keep only labeled rows (drop error rows)."""
    rows: list[dict] = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception as exc:  # noqa: BLE001
                raise ValueError(f"Invalid JSONL at {path}:{line_no}") from exc
            if isinstance(row.get("label"), int) and isinstance(row.get("features"), dict):
                rows.append(row)
    return rows


def write_json(path: str | Path, payload: object) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")
