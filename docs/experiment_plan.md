# Experiment Plan

## Claim

Computer-use agents are limited not only by task success, but by inefficient trajectories. A lightweight human-like trajectory compression layer can reduce steps, model calls, latency, and cost while preserving success.

## Main Hypotheses

H1. Successful computer-use trajectories contain measurable redundancy relative to human/reference trajectories.

H2. Redundant observations and safe duplicate actions can be compressed without lowering success on deterministic subroutines.

H3. Risk-aware checkpoints are necessary: compression should not skip verification before irreversible or externally visible actions.

H4. Human-like macros improve the success-cost Pareto frontier more than naive step deletion.

## Datasets

Minimum viable:

- OSWorld subset with agent logs and available reference traces.
- Mind2Web or WebArena subset for web-specific trajectory logs.
- Hand-labeled small diagnostic set of 50-100 trajectories for redundancy taxonomy validation.

Stretch:

- OSWorld-Human-style human demonstrations.
- Live browser agent traces with wall-clock latency and model-call logs.

## Baselines

- Standard observe-think-act agent.
- Reflection-heavy agent.
- Direct plan-then-act agent.
- Naive compression: remove every other observe step.
- HTC-Agent: macro retrieval, observation gate, trajectory compression.
- HTC-Agent without risk checkpoints.

## Metrics

- Task success rate.
- Executable action count.
- Model calls.
- Wall-clock latency.
- Token/cost proxy.
- Human-normalized step ratio.
- Efficiency-adjusted success.
- Recovery overhead after errors.
- Unsafe compression rate.
- Pareto frontier: success vs cost.

## Redundancy Taxonomy

- repeated observation
- duplicate safe action
- untriggered reflection
- scroll oscillation
- menu detour
- missed shortcut
- excessive state verification
- recovery after avoidable wrong click

## Paper Figures

1. Success vs action count scatter.
2. Latency breakdown by model call, observation, execution, reflection.
3. Redundancy taxonomy distribution.
4. Pareto frontier of success vs model calls.
5. Ablation table for macro retrieval, observation gate, compression, and risk checkpoints.

## Implementation Roadmap

1. Normalize trajectories from at least one real benchmark into JSONL.
2. Validate redundancy taxonomy with manual labels.
3. Mine macros from human/reference trajectories.
4. Run compression and estimate replay-safe step reduction.
5. Run live or simulator-backed execution for a subset to measure actual success.
6. Add statistical tests and bootstrap confidence intervals.

