# HTC-Agent Efficiency

Research code for **Human-like Trajectory Compression for Efficient Computer-Use Agents**.

The project studies a practical gap in computer-use agents: even when agents finish GUI tasks, they often use more steps, more model calls, and more wall-clock time than humans. This repository provides an experiment pipeline for diagnosing inefficiency and evaluating lightweight trajectory compression.

## Research Questions

1. Where do computer-use agents waste steps?
2. Can human-like action macros reduce action count and model calls without hurting task success?
3. Can observation skipping reduce latency while preserving risk-aware checkpoints?
4. Does compression improve the success-cost Pareto frontier?

## Implemented Scope

This repository currently supports both offline trajectory evaluation and live browser experiments:

- JSONL trajectory loading
- human-normalized efficiency metrics
- redundancy taxonomy
- parameterized macro mining from reference trajectories
- rule-based HTC compression with risk-aware observation gating
- model-based observation gate loading from a trained JSON artifact
- CLI evaluation
- Playwright browser-control benchmark
- controlled ablations: `baseline`, `naive_skip`, `htc_no_risk`, and `htc`
- Ollama local-model browser-control runner
- unit tests, sample data, and reproducible scripts

## Quick Start

```powershell
cd C:\Users\zejun\Documents\Codex\2026-05-13\project-c-users-zejun-downloads-ece283\htc-agent-efficiency
python -m pytest
python -m htc_agent_efficiency.evaluate --agent data/sample_agent.jsonl --human data/sample_human.jsonl --compress --out results/sample_eval.json
```

If `pytest` is unavailable:

```powershell
python -m unittest discover -s tests
```

## Live Browser Demo

The browser demo executes five local GUI tasks with Playwright and compares a step-by-step baseline against HTC macro execution.

```powershell
.\scripts\run_browser_demo.ps1
```

Artifacts are written to `results/browser_demo/`:

- `baseline_trajectories.jsonl`
- `naive_skip_trajectories.jsonl`
- `htc_no_risk_trajectories.jsonl`
- `htc_trajectories.jsonl`
- `human_reference.jsonl`
- `browser_summary.json`
- `browser_report.md`
- `pareto.csv`
- `pareto.svg`
- `gate_model.json`
- `videos/`

Lightweight result summaries suitable for repository review are tracked under `docs/results/`. Full generated trajectories, videos, and raw result folders are intentionally ignored by git and can be regenerated with the scripts above.

The current implementation includes a lightweight learned observation-gate classifier for demo-scale training. It is useful as a reproducible model artifact, but paper-level claims require training/evaluation on larger real benchmark logs.

## Ollama Local Model Agent Demo

If Ollama is running locally, the project can run a real local model as a browser-control agent. The default model is `qwen3.5:latest` with DOM/control candidates.

```powershell
.\scripts\run_ollama_demo.ps1
```

To use a different local model or observation mode:

```powershell
$env:OLLAMA_MODEL = "qwen3.6:latest"
$env:OLLAMA_OBSERVATION_MODE = "screenshot_dom"
.\scripts\run_ollama_demo.ps1
```

Supported observation modes:

- `dom`: text-only DOM/control candidates
- `screenshot_dom`: screenshot image plus DOM/control candidates

To run the recommended local-model matrix:

```powershell
.\scripts\run_ollama_matrix.ps1
```

The matrix runs:

- `qwen3.5:9b`
- `gemma4:e4b`
- `gemma4:26b`

Artifacts:

- `results/browser_demo/ollama_trajectories.jsonl`
- `results/browser_demo/ollama_summary.json`
- `results/browser_demo/ollama_eval.json`
- `results/browser_demo/ollama_<model>_<observation_mode>_trajectories.jsonl`
- `results/browser_demo/ollama_<model>_<observation_mode>_summary.json`
- `results/browser_demo/ollama_<model>_<observation_mode>_eval.json`
- `results/browser_demo/videos/ollama_*.webm`

The `dom` runner should be described as a local LLM browser-control agent, not a VLM agent. The `screenshot_dom` setting passes image inputs to multimodal Ollama models and can be described as a multimodal/VLM-style browser-control experiment.

## Trajectory Format

Each JSONL row is one trajectory:

```json
{
  "task_id": "email-001",
  "benchmark": "sample",
  "success": true,
  "steps": [
    {"t": 0, "action_type": "observe", "target": "screen", "model_call": true, "latency_ms": 1200},
    {"t": 1, "action_type": "click", "target": "to-field", "model_call": true, "latency_ms": 900},
    {"t": 2, "action_type": "type", "target": "to-field", "text": "alice@example.com", "model_call": false, "latency_ms": 90}
  ]
}
```

Important optional fields:

- `risk`: `safe`, `state_changing`, `irreversible`, or `external`
- `observation_required`: whether the original policy explicitly required observing after this step
- `metadata`: benchmark-specific state, app, URL, screenshot path, DOM id, accessibility node id

## Implemented Evaluation

The controlled browser demo reports:

- success rate
- executable action count
- total trajectory steps
- model calls
- wall-clock latency
- human-normalized step ratio for offline/reference comparisons
- efficiency-adjusted success
- unsafe checkpoint misses
- unsafe compression rate
- Pareto artifacts for success vs model-call cost

The currently implemented ablations are:

- `baseline`: observe-think-act before every primitive action
- `naive_skip`: aggressively skip intermediate observations
- `htc_no_risk`: macro-style execution without risk checkpoints
- `htc`: macro-style execution with risk-aware checkpoints
- `ollama`: local model chooses actions from browser observations

Latest lightweight summaries are kept in `docs/results/`; full raw artifacts are regenerated under `results/browser_demo/`.

## Future Work

The current repository is a working proof of concept. Next steps include:

- expand the local browser task suite from 5 tasks to 30-50 tasks
- integrate OSWorld, WebArena, or Mind2Web trajectory logs
- compare against stronger LLM/VLM computer-use agents
- mine macros from real human/reference demonstrations
- add confidence intervals and statistical tests across task families
- add token-cost accounting for local and API model runs
- evaluate safety on more irreversible/external-action tasks such as delete, submit, publish, and send
