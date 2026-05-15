from __future__ import annotations

import argparse
import json
from pathlib import Path


def render_markdown(payload: dict) -> str:
    agg = payload["aggregate"]
    orig = payload.get("aggregate_original", {})
    lines = [
        "# HTC-Agent Evaluation Report",
        "",
        f"- Agent file: `{payload.get('agent_file')}`",
        f"- Human/reference file: `{payload.get('human_file')}`",
        f"- Compression enabled: `{payload.get('compressed')}`",
        "",
        "## Aggregate Metrics",
        "",
        "| Metric | Original | Evaluated | Delta |",
        "|---|---:|---:|---:|",
    ]
    keys = [
        "success_rate",
        "avg_action_count",
        "avg_model_calls",
        "avg_latency_ms",
        "avg_human_step_ratio",
        "avg_efficiency_adjusted_success",
    ]
    for key in keys:
        if key not in agg and key not in orig:
            continue
        original = float(orig.get(key, 0.0))
        evaluated = float(agg.get(key, 0.0))
        lines.append(f"| `{key}` | {original:.4f} | {evaluated:.4f} | {evaluated - original:.4f} |")

    lines.extend(["", "## Redundancy Signals", ""])
    redundancy = {k: v for k, v in orig.items() if k.startswith("redundancy_")}
    if redundancy:
        for key, value in sorted(redundancy.items()):
            lines.append(f"- `{key}`: {value:g}")
    else:
        lines.append("- No redundancy signals reported.")

    lines.extend(["", "## Top Mined Macros", ""])
    macros = payload.get("macros", [])[:10]
    if macros:
        for macro in macros:
            pattern = " -> ".join(macro["pattern"])
            lines.append(f"- `{macro['name']}` support={macro['support']}: {pattern}")
    else:
        lines.append("- No macros met the support threshold.")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Render an HTC evaluation JSON file as Markdown.")
    parser.add_argument("--eval", required=True, help="Evaluation JSON path")
    parser.add_argument("--out", required=True, help="Markdown output path")
    args = parser.parse_args()

    with Path(args.eval).open("r", encoding="utf-8") as f:
        payload = json.load(f)
    markdown = render_markdown(payload)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(markdown, encoding="utf-8")


if __name__ == "__main__":
    main()

