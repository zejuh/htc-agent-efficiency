# Browser HTC Live Demo Report

This report is generated from live Playwright executions on local GUI tasks.

## Policy Comparison

| Policy | Success | Exec Actions | Total Steps | Model Calls | Latency ms | Unsafe Checkpoint Misses | Unsafe Rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| `baseline` | 1.000 | 4.200 | 13.600 | 9.400 | 1810.224 | 0 | 0.000 |
| `naive_skip` | 1.000 | 4.200 | 7.200 | 2.000 | 471.484 | 5 | 1.000 |
| `htc_no_risk` | 1.000 | 4.200 | 9.400 | 4.000 | 829.630 | 4 | 0.800 |
| `htc` | 1.000 | 4.200 | 10.800 | 5.600 | 1107.829 | 0 | 0.000 |

## Delta vs Baseline

| Policy | Delta Success | Delta Steps | Delta Calls | Delta Latency ms | Delta Unsafe Rate |
|---|---:|---:|---:|---:|---:|
| `naive_skip` | 0.000 | -6.400 | -7.400 | -1338.740 | 1.000 |
| `htc_no_risk` | 0.000 | -4.200 | -5.400 | -980.594 | 0.800 |
| `htc` | 0.000 | -2.800 | -3.800 | -702.395 | 0.000 |

## Note

Full generated trajectories, videos, and raw `results/` artifacts are intentionally excluded from the repository. They can be reproduced with:

```powershell
.\scripts\run_browser_demo.ps1
```

