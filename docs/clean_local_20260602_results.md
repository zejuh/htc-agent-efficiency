# 干净本地实验结果 - 2026-06-02

这次运行使用本地诊断任务集 `tasks/tasks.json`，共 17 个任务；模型为 `gpt-4o-mini`，观察模式为 DOM。

## 数据

```text
data/clean_local_20260602/oracle_steps_round0_clean.jsonl
data/clean_local_20260602/oracle_steps.jsonl
```

第 0 轮干净行数：210。

第一次采集时因为 `SOA_COLLECT_ROUNDS` 默认值曾是 3，意外进入了第 1 轮。为了保证训练文件干净，后续把这部分第 1 轮行排除了。

## Gate 训练

```text
results/clean_local_20260602/gate_model.json
```

`soa.gate` 给出的 held-out 决策指标：

| 模型 | Accuracy | False skip | Wasted observe |
|---|---:|---:|---:|
| learned gate | 0.943 | 0.000 | 0.057 |
| handrule | 0.171 | 0.771 | 0.057 |

最终选择的 learner 是 logistic。label base rate 是 0.9143，说明当前本地诊断数据强烈偏向“需要观察”。

## 在线策略评估

完整七个阈值的扫描被提前停止，因为低阈值 `learned@0.2` 过慢并且会继续消耗 API 调用。最终干净评估使用更聚焦的阈值扫描：`SOA_TAUS=0.8`。

```text
results/clean_local_20260602/policy_summary.json
results/clean_local_20260602/policy_report.md
results/clean_local_20260602/pareto.csv
results/clean_local_20260602/pareto.svg
```

| 策略 | Success | Avg model calls | Avg cost USD | Unsafe rate |
|---|---:|---:|---:|---:|
| always | 0.294 | 12.35 | 0.003222 | 0.000 |
| never | 0.765 | 1.59 | 0.000482 | 0.966 |
| handrule | 0.471 | 8.94 | 0.002264 | 0.000 |
| learned@0.8 | 0.294 | 12.06 | 0.003133 | 0.000 |

理解方式：在这次新本地实验中，`never` 成功率看起来较高，但 unsafe rate 很高；`handrule` 是当前最强的安全 live policy；learned gate 的行为接近 `always`，这和训练标签严重不均衡一致。

## 特征消融

```text
results/clean_local_20260602/feature_ablation.json
results/clean_local_20260602/feature_ablation.md
```

| 变体 | 移除的特征 | Learner | Test accuracy | False skip | Wasted observe |
|---|---|---:|---:|---:|---:|
| full | 无 | logistic | 0.943 | 0.000 | 0.057 |
| no_confidence | verbalized confidence 和 needs-observation | mlp | 0.943 | 0.000 | 0.057 |
| no_screen_change | screen 和 candidate change | logistic | 0.943 | 0.000 | 0.057 |
| no_plan_state | no-plan、steps-since-observe、remaining length | logistic | 0.943 | 0.000 | 0.057 |
| no_action_type | click/fill/check/select 指示特征 | mlp | 0.943 | 0.000 | 0.057 |
| no_risk | risk 指示特征 | logistic | 0.914 | 0.000 | 0.086 |

理解方式：在这个数据划分上，大多数单组特征移除不会改变 held-out 决策结果，主要原因是标签强烈偏向“观察”。移除 risk 特征会稍微增加不必要观察。这说明下一步更应该做数据平衡，并加入更多 value-change-specific 特征。

## MiniWoB 状态

MiniWoB 已经修到可以通过 smoke validation。适配器现在会自动检测 Python `miniwob` 包的 HTML root，并且 smoke test 结束后不会让 Node 进程一直挂住。

已验证命令：

```powershell
npm run smoke -- --suite tasks\miniwob_curated.json
```

结果：10 个任务通过。
