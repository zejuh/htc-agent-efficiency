from __future__ import annotations

from pathlib import Path

from htc_agent_efficiency.io import write_json


def convert_osworld_log_dir(input_dir: str | Path, output_jsonl: str | Path) -> None:
    """Placeholder adapter for OSWorld-style logs.

    The exact OSWorld log schema differs by runner. Keep this function as the
    stable integration point: parse raw task logs into the repository's JSONL
    trajectory schema, then evaluate with `python -m htc_agent_efficiency.evaluate`.
    """
    raise NotImplementedError(
        "Add OSWorld runner-specific parsing here. Expected output fields: "
        "task_id, benchmark, success, steps[t, action_type, target, model_call, latency_ms, risk]."
    )


def write_adapter_notes(path: str | Path) -> None:
    write_json(
        path,
        {
            "required_fields": ["task_id", "success", "steps"],
            "recommended_fields": [
                "benchmark",
                "metadata.app",
                "metadata.instruction",
                "steps[].model_call",
                "steps[].latency_ms",
                "steps[].risk",
                "steps[].metadata.screenshot",
                "steps[].metadata.accessibility_node_id",
            ],
        },
    )

