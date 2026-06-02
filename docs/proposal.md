# 项目提案：学习浏览器智能体什么时候需要重新观察

## 1. 问题

Computer-use 和 GUI agent 通常使用“观察、思考、行动”的循环。每一次观察都是一次模型调用，经常是延迟和金钱成本的主要来源。这也是当前 agent 在同一任务上常常比人类多走很多步的原因之一。

最直接的效率优化是：在 agent 可以沿用旧计划的连续步骤里跳过观察。但跳过观察并不总是安全。如果页面在旧计划执行过程中发生变化，agent 可能会基于过期信息行动。在发送邮件、删除文件、提交表单这类不可逆或对外可见的动作前，这个风险尤其高。

现有 agent 往往要么每一步都观察，安全但昂贵；要么执行固定的多步计划，便宜但脆弱。两种方式都没有直接学习“这一次重新观察是否值得”。

## 2. 研究问题

agent 能否根据自身不确定性和便宜的状态特征，学会什么时候必须重新观察，从而减少模型调用、延迟和成本，同时不降低任务成功率，也不跳过安全关键检查？

这个 learned gate 能否在成本、成功率、安全性的 frontier 上优于人工规则？

## 3. 方法：用 Oracle 蒸馏 Observation Gate

**决策。** 每一步 agent 选择：

```text
ACT     不增加模型调用，继续执行旧计划
OBSERVE 花 1 次模型调用刷新页面状态并重新规划
```

**Oracle 标签。** always-observe oracle 运行每个任务。每一步它比较两个动作：

- 如果 agent 不观察、沿用旧计划，本来会执行的动作。
- oracle 当前重新观察后验证出的动作。

标签定义为：

```text
label = 1  旧计划动作和验证动作不同，或当前没有旧计划
label = 0  旧计划动作仍然和验证动作一致
```

采集脚本还维护一个 coasting counter，让旧计划能在 bookkeeping 里连续前进多步，所以 `steps_since_observe` 和 `remaining_plan_len` 不会一直是常数，而是能提供真实信号。

**观察前可用特征。** gate 使用的是重新观察前就能便宜得到的特征：

- 粗粒度页面变化信号
- 候选控件变化信号
- 字段值、按钮文本、下拉选项变化信号
- 距离上次观察的步数
- 旧计划剩余长度
- 下一步动作类型
- 下一步动作风险
- 模型自报 confidence
- 模型自报 `needs_observation`

**Gate。** 实现支持透明的 logistic gate 和一层隐藏层的 MLP gate。`auto` 模式会在验证集上选择表现更好的模型。部署时，learned policy 在 `P(observation needed) >= T` 时观察，并保留一个硬性 safety floor：不可逆或对外可见的动作前必须观察。扫描不同阈值 `T` 可以用一个训练好的模型得到一条 cost-success frontier。

**DAgger 风格升级。** 第 0 轮先用 always-observe oracle 收集数据。后续轮次可以让当前 learned gate（`learned@T`）访问自己会到达的状态，同时仍然向 oracle 查询监督标签。这可以减少训练分布和部署分布之间的偏移。

**为什么 handrule 故意做得有限。** 人工 baseline 只在粗粒度页面签名变化或风险动作前观察。本地诊断任务集中包含这个信号不够用的情况。例如 `drift_recipient` 中，控件集合保持不变，但 suggested-recipient 字段会从 `Resolving...` 变成真实邮箱。粗粒度 selector/status detector 可能看不见这种变化，而模型自报的不确定性可以提供有用信号。

## 4. 实验

**任务。** 项目包含结构化本地诊断任务集，包括静态 baseline、稳定多步表单、异步结果任务、value-drift 任务（`drift_recipient`、`price_drift`）和 delayed-option 任务（`resolve_language`）。稳定任务提供更多“继续沿用旧计划仍然正确”的例子；动态任务隔离观察敏感的失败模式。仓库也包含 MiniWoB++ 适配器和外部 benchmark 的任务清单。

**策略。** 所有策略都使用同一个 OpenAI 驱动的 GUI agent，只改变 observation gate：

- `always`：每个动作前都观察。
- `never`：只观察一次，然后继续旧计划。
- `handrule`：粗粒度页面变化或风险动作前观察。
- `learned@T`：learned gate 分数超过阈值 `T` 时观察，并保留 safety floor。

**指标。**

- 任务成功率
- 平均模型调用次数
- 平均延迟
- 美元成本
- checkpoint 动作的 unsafe rate
- 决策级 accuracy、false-skip rate 和 wasted-observe rate
- gate calibration
- 策略结果的任务级 bootstrap 置信区间

**假设。**

- H1：`never` 最便宜，但会在动态任务中失败或变得不安全。
- H2：某些 `learned@T` 能以更少模型调用达到接近 `always` 的成功率。
- H3：某些 `learned@T` 能在 value-drift 场景中 Pareto-dominate `handrule`。
- H4：safety floor 能让 learned policy 的 unsafe rate 保持为 0。

## 5. 相关工作

- **ReAct**（Yao et al., 2022）：经典 observe-think-act 循环；本项目研究这个循环中的每次观察是否都必要。
- **DAgger**（Ross, Gordon, Bagnell, 2011）：从 oracle 做 imitation learning；本项目使用 oracle 风格标签判断“观察是否改变了动作”。
- **Language Models (Mostly) Know What They Know**（Kadavath et al., 2022）：说明模型自报 confidence 可以作为 gating 信号，但需要谨慎评估。
- **FrugalGPT**（Chen et al., 2023）：面向成本决定什么时候使用昂贵模型调用；本项目把类似思想应用到 observation scheduling。
- **OSWorld 和 OSWorld-Human**：说明真实 computer-use agent 的效率问题有重要意义。

## 6. 局限和下一步

- 本地任务集仍然偏小。下一步需要更多任务、更多 seed，以及更干净的外部 benchmark 设置。
- MiniWoB bridge 还需要更完全可移植的 HTML root，避免依赖环境特定路径或安装方式。
- verbalized confidence 可能校准不好，需要报告 calibration，而不是默认相信它。
- 当前特征已经包含便宜的 value-change detector，但更丰富的 memory features 或 token-level uncertainty 仍可能改善 learned gate。
- final report 应该包含 ablation，尤其是移除 confidence 和 `needs_observation` 后的结果，用来说明 learned gate 是否真的在利用预期信号。
