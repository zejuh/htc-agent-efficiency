# 项目文件说明

这份文档解释项目里每个主要文件/目录在做什么。范围以项目自己维护的文件为主；`node_modules/`、`external/`、`outputs/`、`results/` 这类第三方依赖或生成产物只按目录说明，不逐个展开。

## 根目录

| 文件 | 作用 |
|---|---|
| `.env` | 本地私密配置文件，通常放 `OPENAI_API_KEY`、模型名和实验参数。不要提交到 Git，也不要截图公开。 |
| `.env.example` | `.env` 的模板，告诉别人需要哪些环境变量，但不包含真实 API key。 |
| `.gitignore` | 指定 Git 不应该追踪的文件，例如 `.env`、`results/`、缓存、日志等。 |
| `README.md` | 项目的主说明文档：项目目标、安装方式、运行方式、数据说明和已知改进方向。 |
| `package.json` | Node.js 项目配置，定义 `npm run smoke`、`npm run collect`、`npm run evaluate` 等命令。 |
| `package-lock.json` | Node.js 依赖锁定文件，保证不同机器安装到一致版本。 |
| `pyproject.toml` | Python 项目配置，声明包名、Python 版本要求和可选 MiniWoB 依赖。 |

## 本地任务应用

| 文件 | 作用 |
|---|---|
| `app/index.html` | 本地浏览器任务的页面结构，包含邮件、商店、联系人、设置、文件、个人资料等模块。 |
| `app/app.js` | 本地任务页面的交互逻辑，负责异步搜索、收件人解析、价格变化、语言选项延迟、成功状态更新等。 |
| `app/styles.css` | 本地任务页面的样式文件，让任务界面更清晰可操作。 |

## 任务清单

| 文件 | 作用 |
|---|---|
| `tasks/tasks.json` | 本地诊断任务集。每个 task 定义 instruction、成功条件、场景参数、family、difficulty 和 tags。 |
| `tasks/miniwob_curated.json` | 精简后的 MiniWoB 外部 benchmark 任务集，用于 smoke test 和外部评估。 |
| `tasks/miniwob_tasks.json` | 更小的 MiniWoB bridge 任务清单，适合快速验证 MiniWoB 适配器。 |
| `tasks/benchmark_catalog.json` | benchmark 目录说明，记录当前有哪些任务集、推荐用途和定位。 |

## Runner

| 文件 | 作用 |
|---|---|
| `runner/smoke_test.mjs` | 不调用 OpenAI 的快速检查脚本，确认任务集和适配器能正常加载。 |
| `runner/collect.mjs` | 采集 oracle-labeled step 数据。它每一步都重新观察，用 oracle 动作和旧计划动作是否分歧来生成 `label`。 |
| `runner/evaluate_policies.mjs` | 在线评估不同 observation policy，包括 `always`、`never`、`handrule` 和 `learned@T`。会输出 summary、report、Pareto CSV/SVG。 |
| `runner/lib/agent.mjs` | 项目核心 agent 逻辑。负责读取 `.env`、调用 OpenAI、提取候选控件、执行动作、计算 observation features、评估 learned gate。 |
| `runner/lib/task_suite.mjs` | 读取和过滤任务集，支持按 benchmark、family、difficulty、tag、task id、最大任务数过滤。 |
| `runner/lib/adapters/index.mjs` | 根据任务类型选择对应环境适配器。 |
| `runner/lib/adapters/local_playwright.mjs` | 本地 `app/` 任务的 Playwright 适配器，负责打开页面、读取状态、判断成功、等待异步 DOM 稳定。 |
| `runner/lib/adapters/miniwob_playwright.mjs` | MiniWoB 任务的 Playwright 适配器，负责启动本地 MiniWoB HTML server、加载任务、读取 reward 和成功状态。 |

## Python 模型与工具

| 文件 | 作用 |
|---|---|
| `soa/__init__.py` | Python package 标记文件，让 `soa` 可以作为模块被导入。 |
| `soa/io.py` | JSONL/JSON 工具，读取 oracle step 数据并过滤掉错误行。 |
| `soa/gate.py` | observation gate 训练器。支持 logistic、MLP 和 `auto` 选择，并导出 JS evaluator 可读取的模型 JSON。 |
| `tests/test_gate.py` | gate 训练和指标计算的单元测试，确认 logistic/MLP 能学习低置信度信号，handrule 行为符合预期。 |

## 脚本

| 文件 | 作用 |
|---|---|
| `scripts/run_pipeline.ps1` | Windows PowerShell 一键 pipeline：读取 `.env`、安装依赖、smoke test、采集、训练、评估。 |
| `scripts/run_pipeline.sh` | macOS/Linux/Git Bash 版本的一键 pipeline，功能和 PowerShell 版本一致。 |
| `scripts/make_sample_data.py` | 生成离线合成数据 `data/sample_steps.jsonl`，不用 API key 就能测试训练器和 pipeline。 |
| `scripts/run_feature_ablation.py` | 对 gate 做 feature ablation，比较移除不同特征组后的指标变化。 |
| `scripts/build_final_report.py` | 根据实验结果生成 Word 版 final report。里面的英文正文属于报告内容，不是代码注释。 |

## 文档

| 文件 | 作用 |
|---|---|
| `docs/proposal.md` | 中文 proposal，说明研究问题、方法、实验、相关工作、局限和下一步。 |
| `docs/clean_local_20260602_results.md` | 2026-06-02 干净本地实验的中文结果说明。 |
| `docs/file_guide.md` | 当前文件：解释项目文件和目录的用途。 |

## 数据

| 文件或目录 | 作用 |
|---|---|
| `data/sample_steps.jsonl` | 合成离线训练样本，用于不调用 API 的测试。 |
| `data/oracle_steps.jsonl` | 较早的混合 oracle 数据，包含一些错误行；训练器会自动跳过没有 `label/features` 的行。 |
| `data/oracle_steps_round0.jsonl` | 旧实验第 0 轮数据。 |
| `data/oracle_steps_round1.jsonl` | 旧实验第 1 轮尝试，含 quota/error 情况，不建议直接训练。 |
| `data/oracle_steps_round1_retry.jsonl` | 第 1 轮重试后可用的数据。 |
| `data/local_main/oracle_steps.jsonl` | 较干净的本地诊断聚合数据。 |
| `data/local_main/oracle_steps_round0.jsonl` | `local_main` 第 0 轮数据。 |
| `data/local_main/oracle_steps_round1.jsonl` | `local_main` 第 1 轮数据。 |
| `data/clean_local_20260602/oracle_steps_round0_clean.jsonl` | 2026-06-02 干净实验中提取出的第 0 轮干净数据。 |
| `data/clean_local_20260602/oracle_steps_round0.jsonl` | 2026-06-02 干净实验第 0 轮原始输出。 |
| `data/clean_local_20260602/oracle_steps.jsonl` | 2026-06-02 干净实验用于训练的聚合数据。 |
| `data/balanced_local_20260602/oracle_steps.jsonl` | 用于尝试缓解标签不平衡的本地数据文件。 |

## 交付物与生成物

| 文件或目录 | 作用 |
|---|---|
| `deliverables/Selective-Observation-Final-Report.docx` | 最终项目报告 Word 文件。 |
| `deliverables/Selective-Observation-Final-Deck.pptx` | 最终展示 PPT 文件。 |
| `results/` | 运行训练和评估后生成的模型、summary、report、图表等。通常不提交，除非要归档某次实验。 |
| `outputs/` | 报告/PPT 构建过程中生成的中间产物和 manifest。 |
| `external/` | 外部 benchmark 或资源镜像目录。如果存在，通常不是项目核心代码。 |
| `node_modules/` | npm 安装的第三方依赖目录，不需要手动修改，也不应该提交。 |

## 最常用运行顺序

```powershell
npm install
node node_modules/playwright/cli.js install chromium
python -m unittest discover -s tests
npm run smoke
```

离线训练：

```powershell
python scripts\make_sample_data.py
python -m soa.gate --steps data\sample_steps.jsonl --out results\gate_model.json --learner auto
```

在线实验：

```powershell
npm run collect -- --out data\oracle_steps_new.jsonl
python -m soa.gate --steps data\oracle_steps_new.jsonl --out results\gate_model.json --learner auto
npm run evaluate -- --gate results\gate_model.json
```
