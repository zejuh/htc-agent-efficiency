# Current Status

## What Is Complete

- A reproducible local browser benchmark with five GUI tasks:
  - send an email
  - add a product to cart
  - search and open a contact
  - update settings
  - rename a file
- A Playwright live runner that executes both:
  - baseline observe-think-act policy
  - naive observation-skipping policy
  - HTC without risk checkpoints
  - full HTC macro/checkpoint policy
- Live trajectory logging in the repository JSONL schema.
- Playwright video recording for every task and policy.
- Evaluation reports for success rate, executable actions, model calls, latency, human-normalized action count, unsafe checkpoint misses, and success-cost Pareto artifacts.
- A tiny learned observation-gate model trained from demo trajectories.
- An optional Ollama local-model runner that lets local multimodal models choose browser actions from live DOM/control candidates or screenshot plus DOM/control candidates.
- A recommended Ollama matrix script covering `qwen3.5:9b`, `gemma4:e4b`, and `gemma4:26b`.
- Unit tests for metrics, compression, macro mining, statistics, and the learned gate.

## Latest Live Demo Result

Five local browser tasks, all executed live with Playwright. See `results/browser_demo/browser_report.md` for the current run.

The key comparison is no longer just baseline vs HTC. The demo now includes ablations that separate cost reduction from safety:

- `naive_skip`: minimizes observation/model calls but skips required checkpoints.
- `htc_no_risk`: uses macro execution but ignores risk-aware checkpoints.
- `htc`: preserves checkpoints before externally visible or irreversible actions.
- `ollama` in `dom` mode: local model chooses actions from live page candidates. This is a DOM/text agent, not a screenshot VLM.
- `ollama` in `screenshot_dom` mode: local multimodal model receives both a screenshot and DOM/control candidates.

The current result supports a demo claim: HTC preserves task success while reducing model calls and observe/think overhead on deterministic GUI subroutines, while avoiding unsafe checkpoint skips that naive compression introduces.

## Model Artifact

`results/browser_demo/gate_model.json` contains a trained logistic observation-gate model.

It is a real trained model artifact, but it is intentionally small. It is useful for validating the training/evaluation plumbing, not for strong paper claims by itself.

## What Is Not Yet Paper-Ready

- No OSWorld/WebArena/Mind2Web live benchmark integration yet.
- No large-scale comparison against real LLM/VLM computer-use agents yet.
- The Ollama runner is now a real local model baseline, but only on the small local task suite.
- No human subject demonstrations beyond synthetic reference trajectories.
- No statistical claims beyond the local five-task demo.
- No learned policy or VLM fine-tuning yet; HTC is currently a lightweight execution layer plus a small gate model.

## Paper-Ready Next Milestone

To make this submit-worthy, the next milestone should be:

1. Add 30-50 reproducible browser tasks or integrate OSWorld subset logs.
2. Run at least three policies:
   - observe-think-act baseline
   - naive observation skipping
   - HTC with risk checkpoints
3. Evaluate success, model calls, latency, and unsafe compression.
4. Add ablations for macro execution and learned gate.
5. Record representative videos and include a Pareto frontier plot.
