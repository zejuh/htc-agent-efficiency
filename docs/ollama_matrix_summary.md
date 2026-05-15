# Ollama Matrix Summary

This local browser-control matrix intentionally keeps the paper-facing experiment narrow:

- Models: `qwen3.5:9b`, `gemma4:e4b`, `gemma4:26b`
- Observation modes: `dom`, `screenshot_dom`
- Excluded from the main matrix: `qwen3.6:latest` and screenshot-only control

`qwen3.6:latest` was removed because it was slow and unstable on the local task suite. Screenshot-only control was removed because it mainly tests visual grounding and coordinate control rather than HTC trajectory efficiency.

| Model | Observation | N | Success | Calls | Exec actions | Latency ms |
|---|---|---:|---:|---:|---:|---:|
| `qwen3.5:9b` | `dom` | 5 | 1.000 | 4.00 | 4.00 | 87541.0 |
| `qwen3.5:9b` | `screenshot_dom` | 5 | 1.000 | 4.00 | 4.00 | 98033.4 |
| `gemma4:e4b` | `dom` | 5 | 1.000 | 3.80 | 3.80 | 23759.8 |
| `gemma4:e4b` | `screenshot_dom` | 5 | 0.800 | 5.00 | 5.00 | 17690.5 |
| `gemma4:26b` | `dom` | 5 | 1.000 | 3.80 | 3.80 | 59579.4 |
| `gemma4:26b` | `screenshot_dom` | 5 | 1.000 | 4.00 | 4.00 | 63653.3 |

