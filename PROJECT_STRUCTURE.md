# Project Structure

This project lives at:

`C:\Users\zejun\Documents\Codex\2026-05-13\project-c-users-zejun-downloads-ece283\htc-agent-efficiency`

The similarly named folders are intentional:

- `htc-agent-efficiency/` is the project root. It contains docs, scripts, data, browser demo code, test code, and results.
- `htc_agent_efficiency/` is the Python package imported by commands such as `python -m htc_agent_efficiency.evaluate`. Python package names cannot contain hyphens, so it uses underscores.

## Main Folders

| Path | Purpose |
|---|---|
| `htc_agent_efficiency/` | Core Python research code: metrics, compression, macro mining, learned gate, reports, adapters. |
| `browser_demo/` | Local browser GUI benchmark and Playwright/Ollama runners. |
| `data/` | Small sample JSONL trajectories for offline tests. |
| `docs/` | Research notes, experiment plan, current status, adapter notes, paper outline. |
| `scripts/` | One-command experiment entry points. |
| `tests/` | Unit tests for the Python modules. |
| `results/` | Generated experiment outputs, reports, videos, and model artifacts. This can be regenerated. |

## Most Useful Commands

Run unit tests:

```powershell
python -m unittest discover -s tests
```

Run the controlled browser ablation demo:

```powershell
.\scripts\run_browser_demo.ps1
```

Run the Ollama/Qwen local model demo:

```powershell
.\scripts\run_ollama_demo.ps1
```

Use Qwen 3.6 instead of the default Qwen 3.5:

```powershell
$env:OLLAMA_MODEL = "qwen3.6:latest"
.\scripts\run_ollama_demo.ps1
```

## Generated Artifacts

`results/` and `browser_demo/node_modules/` are generated. They are kept locally so you can inspect reports and videos, but they should not be treated as source code.

