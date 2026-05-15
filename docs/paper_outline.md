# Paper Outline

## Title

Human-Like Trajectory Compression for Efficient Computer-Use Agents

## Abstract Skeleton

Computer-use agents are increasingly capable of completing realistic GUI tasks, yet their practical utility is limited by inefficient trajectories, excessive model calls, and high latency. We study the efficiency gap between GUI agents and human demonstrators, identifying redundant observations, avoidable detours, and missed action macros as major sources of overhead. We propose HTC-Agent, a lightweight trajectory compression framework that retrieves human-like action macros, selectively skips unnecessary observations, and inserts risk-aware checkpoints before irreversible actions. Across desktop and web-navigation tasks, HTC-Agent reduces action count and model calls while preserving task success, yielding a better success-cost Pareto frontier.

## Contributions

1. We introduce an efficiency-centered evaluation protocol for computer-use agent trajectories.
2. We provide a redundancy taxonomy and diagnostic analysis of successful but inefficient GUI trajectories.
3. We propose HTC-Agent, a lightweight compression layer with macro mining and risk-aware observation gating.
4. We show that efficiency can improve without sacrificing safety-critical verification.

## Sections

1. Introduction
2. Related Work
3. Efficiency Evaluation Protocol
4. Redundancy Taxonomy
5. HTC-Agent
6. Experiments
7. Analysis
8. Limitations
9. Conclusion

