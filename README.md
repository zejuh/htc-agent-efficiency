# HTC-Agent Efficiency

Research code for **Human-like Trajectory Compression for Efficient Computer-Use Agents**.

The project studies a practical gap in computer-use agents: even when agents finish GUI tasks, they often use more steps, more model calls, and more wall-clock time than humans. This repository provides an experiment pipeline for diagnosing inefficiency and evaluating lightweight trajectory compression.

## Research Questions

1. Where do computer-use agents waste steps?
2. Can human-like action macros reduce action count and model calls without hurting task success?
3. Can observation skipping reduce latency while preserving risk-aware checkpoints?
4. Does compression improve the success-cost Pareto frontier?

## Current Scope

This scaffold supports offline trajectory experiments:

- JSONL trajectory loading
- human-normalized efficiency metrics
- redundancy taxonomy
- macro mining from reference trajectories
- rule-based HTC compression
- risk-aware observation gating
- CLI evaluation
- unit tests and sample data

The intended next adapters are OSWorld, Mind2Web, WebArena, and browser-agent logs.

## Directory Note

The project root is `htc-agent-efficiency/`. The folder `htc_agent_efficiency/` inside it is the Python package. This is normal: Python imports cannot use hyphens, so the package uses underscores. See `PROJECT_STRUCTURE.md` for the full layout.

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

All three models run `dom` and `screenshot_dom`. The matrix intentionally excludes screenshot-only control because the local demo showed that setting mostly tests visual grounding and coordinate control rather than HTC trajectory efficiency.

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

## Experiment Ideas

Paper-grade experiments should report:

- success rate
- action count
- model calls
- wall-clock latency
- token/cost proxy
- human-normalized step ratio
- efficiency-adjusted success
- unsafe compression rate
- Pareto frontier of success vs cost

Recommended ablations:

- baseline trajectories
- macro retrieval only
- observation skipping only
- trajectory rewrite only
- full HTC compression
- full HTC compression with risk checkpoints
