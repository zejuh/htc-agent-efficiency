# ECE283 Progress Report

**Project Title:** Human-Like Trajectory Compression for Efficient Computer-Use Agents  
**Original Proposal Theme:** Low-Cost Adaptation for Generalizable Web UI Understanding  
**Current Refined Focus:** Low-cost, risk-aware efficiency improvement for web and computer-use agents  
**Date:** May 14, 2026  
**Team:** Dingjiang Liang, Wenhui Xi, Zejun Huang

## 1. Summary

Our original proposal focused on low-cost adaptation for generalizable web UI understanding, especially under unseen websites and UI layouts. After reviewing recent work on web agents and computer-use agents, we refined the project direction toward a more specific and measurable bottleneck: the high cost and latency caused by repeated observe-plan-act loops in GUI agents.

The current project studies whether a computer-use agent can preserve task success while reducing unnecessary model calls, observations, and latency. We propose a lightweight framework called **Human-Like Trajectory Compression (HTC)**. HTC identifies deterministic local subroutines, skips unnecessary observations, and preserves risk-aware checkpoints before externally visible or irreversible actions.

This is a refinement rather than a complete topic change: the project still studies low-cost adaptation for UI agents, but the adaptation target has shifted from parameter-efficient fine-tuning of a web UI model to execution-time efficiency and safety in computer-use agents.

## 2. Motivation for Refining the Direction

Several recent papers helped motivate the refinement.

First, **Mind2Web** shows that realistic web agents must generalize across diverse real-world websites, tasks, and interaction patterns. This supported our original focus on web UI understanding. **WebArena** further emphasizes the need for realistic, reproducible web environments for autonomous agents. These works convinced us that simplified web tasks are not enough for evaluating practical agents.

Second, **OSWorld** extends the problem from websites to real computer environments and open-ended desktop workflows. This broadened our view from web-only UI grounding to general computer-use agents. However, as we examined this line of work, we noticed that many systems focus primarily on task success, perception, or reasoning quality.

Third, **OSWorld-Human** directly highlights an efficiency gap: computer-use agents often take more steps than humans, and large model calls for planning and reflection contribute substantially to latency. This observation motivated our refined research question: instead of only asking whether an agent can complete a UI task, we ask whether it can complete the task with fewer model calls and lower latency while preserving safety-critical checks.

Therefore, we adjusted the project toward **efficiency-centered evaluation and risk-aware trajectory compression**. This direction appears more novel and more directly connected to the practical cost of deploying GUI agents.

## 3. Research Question

The refined project asks:

> Can a computer-use agent reduce redundant observations and model calls during deterministic GUI subroutines while preserving task success and avoiding unsafe compression before risky actions?

We operationalize this question with four policies:

1. **Baseline observe-think-act:** observes and plans before every primitive action.
2. **Naive skipping:** aggressively skips intermediate observations.
3. **HTC without risk checkpoints:** uses macro-style execution but ignores safety checkpoints.
4. **Full HTC:** uses macro-style execution and preserves risk-aware checkpoints.

The key hypothesis is that naive skipping can reduce cost but may skip important safety checks, while full HTC can reduce model calls without increasing unsafe checkpoint misses.

## 4. Implemented System

We implemented a reproducible local browser benchmark and evaluation pipeline.

### Local GUI Task Suite

The current benchmark contains five browser-based GUI tasks:

- send an email
- search for and add a product to the cart
- search and open a contact card
- update settings
- rename a file

Each task is executed in a live browser using Playwright. The system records trajectories, model-call counts, action counts, latency, success status, and videos.

### HTC Components

We implemented the following components:

- **Trajectory metrics:** success rate, executable actions, model calls, latency, human-normalized action ratio, and efficiency-adjusted success.
- **Redundancy taxonomy:** repeated observations, repeated actions, scroll oscillation, untriggered reflection, and menu detours.
- **Parameterized macro mining:** action sequences are abstracted by action type and target role instead of relying only on exact selector strings.
- **Safe compression:** repeated scroll/key actions are aggregated rather than discarded, preserving execution semantics.
- **Observation gate:** a rule-based gate decides when observations can be skipped.
- **Learned observation gate:** a small trained gate model predicts when observation is needed, with a safety floor that prevents skipping explicit risk checkpoints.
- **Ollama local-model runner:** local models can choose actions from live DOM/control candidates, enabling a real local LLM baseline in addition to controlled policy ablations.

## 5. Preliminary Results

The controlled browser demo was run on five local GUI tasks. All policies achieved 100% task success, but they differed in cost and safety behavior.

| Policy | Success | Exec Actions | Total Steps | Model Calls | Latency ms | Unsafe Checkpoint Misses | Unsafe Rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 1.000 | 4.200 | 13.600 | 9.400 | 1810.224 | 0 | 0.000 |
| Naive Skip | 1.000 | 4.200 | 7.200 | 2.000 | 471.484 | 5 | 1.000 |
| HTC No Risk | 1.000 | 4.200 | 9.400 | 4.000 | 829.630 | 4 | 0.800 |
| Full HTC | 1.000 | 4.200 | 10.800 | 5.600 | 1107.829 | 0 | 0.000 |

These results suggest that naive skipping is cheaper but unsafe: it skips all required checkpoints. Full HTC is more conservative, but it still reduces average model calls from 9.4 to 5.6 while keeping unsafe checkpoint misses at zero.

We also added an Ollama-based local model runner. The most recent local model run used a screenshot-plus-DOM setting and achieved 100% success on the five local tasks, but with much higher latency. This supports the motivation that real model calls are expensive and that reducing unnecessary calls is an important practical goal.

## 6. Current Artifacts

The current codebase includes:

- a Python package for metrics, compression, macro mining, learned gates, and evaluation
- a Playwright browser demo
- an Ollama local model runner
- videos for controlled policies and model-based runs
- JSONL trajectory logs
- evaluation reports
- a Pareto CSV/SVG artifact
- unit tests for the main modules

The current project directory also includes documentation explaining the directory structure and current status.

## 7. Limitations

The project is not yet paper-ready. The current evaluation is a proof of concept, not a large-scale benchmark result.

Main limitations:

- only five local browser tasks have been evaluated so far
- the task suite is synthetic and much simpler than OSWorld or WebArena
- no large-scale comparison against frontier VLM agents has been run yet
- no real human demonstration dataset has been integrated yet
- the learned gate is currently small and mainly validates the training/evaluation pipeline
- statistical significance cannot be claimed from the current task count

## 8. Next Steps

The next milestone is to move from a local proof of concept to a larger evaluation.

Planned next steps:

1. Expand the local browser task suite to 30-50 tasks or integrate an OSWorld/WebArena subset.
2. Run stronger baselines, including local Ollama models and, if available, VLM-based agents.
3. Compare rule-based HTC, learned-gate HTC, naive skipping, and reflection-heavy baselines.
4. Add real human or reference trajectories for macro mining.
5. Report success-cost Pareto frontiers with confidence intervals.
6. Quantify unsafe compression more rigorously on tasks involving sending, saving, deleting, or submitting.

## 9. References

1. Xiang Deng et al. **Mind2Web: Towards a Generalist Agent for the Web.** NeurIPS 2023. https://osu-nlp-group.github.io/Mind2Web/
2. Shuyan Zhou et al. **WebArena: A Realistic Web Environment for Building Autonomous Agents.** ICLR 2024. https://arxiv.org/abs/2307.13854
3. Tianbao Xie et al. **OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments.** NeurIPS 2024. https://arxiv.org/abs/2404.07972
4. WukLab et al. **OSWorld-Human: Benchmarking the Efficiency of Computer-Use Agents.** 2025. https://arxiv.org/abs/2506.16042
5. OS-Harm: **A Benchmark for Measuring Safety of Computer Use Agents.** 2025. https://arxiv.org/abs/2506.14866

