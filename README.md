# 选择性观察的浏览器智能体

这个项目研究浏览器/GUI agent 里的一个效率问题：

**agent 什么时候应该再花一次模型调用去观察页面，什么时候可以安全地沿用已有计划继续执行？**

大多数浏览器 agent 都采用“观察、思考、行动”的循环。每一步都重新观察更稳妥，但会增加延迟和 API 成本；跳过观察更便宜，但如果页面在后台发生变化，旧计划就可能变得不安全。这个项目把这个选择建模成一个可学习的 observation gate。

## 核心想法

每一步 agent 在两个动作之间选择：

```text
OBSERVE  刷新页面状态，并让模型重新规划
ACT      继续执行上一次观察后留下来的计划
```

一个 always-observe oracle 负责收集监督标签：

```text
label = 1  这一步重新观察是必要的，因为验证后的动作和旧计划动作不同
label = 0  旧计划动作仍然正确，这次观察没有改变行动
```

Python 训练器会用一些“观察前就能便宜得到”的特征训练一个小 gate，例如页面粗略变化、候选控件变化、距离上次观察的步数、下一步动作类型、下一步风险、字段/按钮/下拉选项文本变化、模型自报置信度，以及模型自报的 `needs_observation`。

## 策略

所有策略都使用同一个 OpenAI 驱动的浏览器 agent，只区别在“什么时候观察”。

| 策略 | 行为 |
|---|---|
| `always` | 每个动作前都观察。安全，但成本高。 |
| `never` | 只观察一次，然后一直沿用旧计划。便宜，但不安全。 |
| `handrule` | 页面粗略签名变化，或下一步是风险动作时观察。 |
| `learned@T` | learned gate 分数超过阈值 `T` 时观察，并保留硬性安全底线。 |

扫不同的 `T` 可以得到一条成本、成功率、安全性的 frontier。

## 项目结构

```text
app/                         本地浏览器任务应用
tasks/tasks.json             本地诊断任务集
tasks/miniwob_curated.json   精简过的 MiniWoB++ 任务清单
tasks/miniwob_tasks.json     更小的 MiniWoB bridge 清单
runner/lib/agent.mjs         共享 agent 逻辑和 observation feature contract
runner/collect.mjs           oracle 数据采集
runner/evaluate_policies.mjs 在线策略评估和阈值扫描
runner/lib/adapters/         环境适配器
soa/gate.py                  gate 训练器：logistic、MLP 或 auto-select
soa/io.py                    JSONL 和 JSON 工具
scripts/                     pipeline、样本数据、报告生成脚本
tests/                       单元测试
docs/proposal.md             项目 proposal
docs/file_guide.md           每个文件/目录的中文说明
data/                        已有 oracle 和样本 step 数据
deliverables/                最终报告和展示 PPT
outputs/                     生成报告/PPT 时留下的中间产物
```

## 安装

需要 Node.js 和 Python 3.10+。

```powershell
npm install
node node_modules/playwright/cli.js install chromium
python -m unittest discover -s tests
npm run smoke
```

`smoke` 测试不需要 API key。它会检查本地诊断任务集能否通过 Playwright 正常加载。

## 环境变量

把 `.env.example` 复制成 `.env`，然后填入你的 key：

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Node runner 会自动读取项目根目录下的 `.env`。`.env` 已经被 Git 忽略，不应该提交。

常用可选配置：

```env
OBSERVATION_MODE=dom
SOA_MAX_STEPS=16
SOA_TAUS=0.2,0.35,0.5,0.65,0.8,0.9,0.95
SOA_DAGGER_ROUNDS=1
SOA_DAGGER_TAU=0.5
SOA_GATE_LEARNER=auto
SOA_FAMILY=value_drift
SOA_DIFFICULTY=adversarial
SOA_MAX_TASKS=5
```

## 离线运行

这条路径不会调用 OpenAI，只用合成数据测试 Python 训练器和单元测试。

```powershell
python scripts\make_sample_data.py
python -m soa.gate --steps data\sample_steps.jsonl --out results\gate_model.json --learner auto
python -m unittest discover -s tests
npm run smoke
```

## 在线运行

这条路径会调用 OpenAI API。

```powershell
npm run collect -- --out data\oracle_steps_new.jsonl
python -m soa.gate --steps data\oracle_steps_new.jsonl --out results\gate_model.json --learner auto
npm run evaluate -- --gate results\gate_model.json
```

预期输出：

```text
results/gate_model.json
results/policy_summary.json
results/policy_report.md
results/pareto.csv
results/pareto.svg
```

## 一键 Pipeline

Windows PowerShell：

```powershell
.\scripts\run_pipeline.ps1
```

Git Bash、macOS 或 Linux：

```bash
./scripts/run_pipeline.sh
```

两个脚本都会读取 `.env`，安装 Playwright Chromium，运行 smoke test，采集 oracle 标签，训练 gate，并评估策略。

`npm run collect` 默认只采集一轮。需要重复 oracle 轮次时可以显式设置 `SOA_COLLECT_ROUNDS`；需要 DAgger 风格的迭代采集时，可以在 pipeline 里设置 `SOA_DAGGER_ROUNDS`。

## 任务过滤

runner 可以从命令行参数或环境变量读取过滤条件：

```powershell
npm run smoke -- --family value_drift --difficulty adversarial
npm run evaluate -- --family async_results --max-tasks 2 --gate results\gate_model.json
```

本地任务 family 包括：

```text
static_baseline
stable_sequence
async_results
value_drift
delayed_options
```

## 当前数据说明

仓库里有几组已有 JSONL 数据：

```text
data/sample_steps.jsonl                    离线合成样本
data/local_main/oracle_steps.jsonl         干净的本地诊断聚合数据
data/local_main/oracle_steps_round0.jsonl  干净本地第 0 轮
data/local_main/oracle_steps_round1.jsonl  干净本地第 1 轮
data/oracle_steps.jsonl                    混合聚合数据，包含一些错误行
data/oracle_steps_round1.jsonl             quota-error 重试数据，不适合训练
data/oracle_steps_round1_retry.jsonl       可用的重试数据
```

`soa/io.py` 只保留同时含有 `label` 和 `features` 的行，所以训练时会自动忽略错误行。要做干净复现实验，建议使用 `data/local_main/oracle_steps.jsonl`，或者重新生成数据。

## MiniWoB 说明

MiniWoB 的任务清单已经放在仓库里，适配器可以自动从 Python `miniwob` 包里检测 HTML 根目录：

```powershell
python -m pip install miniwob==1.0
npm run smoke -- --suite tasks\miniwob_curated.json
```

也可以手动设置 HTML 根目录：

```env
SOA_MINIWOB_HTML_ROOT=path/to/miniwob/html
```

这个目录应该包含 `miniwob/`、`core/` 和 `common/` 三个子目录。如果是 flat mirror，只要里面有任务 HTML 文件，并且 `core/`、`common/` 资源可用，也可以运行。

## 已知改进方向

- 跑一套新的 live evaluation，并保存最终报告产物。
- 让 MiniWoB 设置在 Windows 和 macOS 上都更稳定。
- 增加 confidence 和 `needs_observation` 的 ablation。
- 增加更多任务和随机种子。
- 更突出地报告 calibration 和 false-skip rate，而不仅是 accuracy。
