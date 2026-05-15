from __future__ import annotations

import argparse
from dataclasses import asdict

from .compression import TrajectoryCompressor
from .compression import ModelBasedObservationGate
from .io import load_jsonl, write_json
from .macro_mining import mine_macros
from .metrics import aggregate_metrics, trajectory_metrics


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate computer-use agent trajectory efficiency.")
    parser.add_argument("--agent", required=True, help="JSONL file of agent trajectories")
    parser.add_argument("--human", help="Optional JSONL file of human/reference trajectories")
    parser.add_argument("--compress", action="store_true", help="Apply HTC trajectory compression before evaluation")
    parser.add_argument("--gate-model", help="Optional learned gate JSON model for compression")
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument("--min-macro-support", type=int, default=2)
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    agent = load_jsonl(args.agent)
    human = load_jsonl(args.human) if args.human else []
    human_by_task = {traj.task_id: traj for traj in human}

    macros = mine_macros(human, min_support=args.min_macro_support) if human else []

    evaluated = agent
    if args.compress:
        gate = ModelBasedObservationGate(args.gate_model) if args.gate_model else None
        compressor = TrajectoryCompressor(observation_gate=gate)
        evaluated = [compressor.compress(traj) for traj in agent]

    rows = [
        trajectory_metrics(traj, human_reference=human_by_task.get(traj.task_id))
        for traj in evaluated
    ]
    original_rows = [
        trajectory_metrics(traj, human_reference=human_by_task.get(traj.task_id))
        for traj in agent
    ]

    payload = {
        "agent_file": args.agent,
        "human_file": args.human,
        "compressed": bool(args.compress),
        "aggregate": aggregate_metrics(rows),
        "aggregate_original": aggregate_metrics(original_rows),
        "macros": [macro.to_dict() for macro in macros[:50]],
        "per_task": [asdict(row) for row in rows],
    }
    write_json(args.out, payload)


if __name__ == "__main__":
    main()
