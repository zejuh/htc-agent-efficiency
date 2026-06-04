# Selective Observation for Computer-Use Agents

**When should a GUI agent spend a model call to look at the screen?**

Computer-use agents run an observe–think–act loop: most of their cost and latency
comes from repeatedly observing and re-planning. The cheap fix — skip observations on
"deterministic" stretches — becomes brittle when the page has quietly changed underneath a
stale plan. This project asks whether an agent can learn, from its **own uncertainty
plus cheap state features**, *when re-observation is actually necessary*, and whether
such a learned gate beats a hand-coded rule on the cost–success frontier.

This is framed as **oracle distillation** (DAgger-style): an always-observe oracle
provides, at every step, the label "would *not* observing here have changed my action?"
A lightweight gate learns to predict that label from features available *before*
observing, and is deployed directly as a cost-sensitive observation gate.
The current pipeline also supports **multi-round DAgger**: after the initial oracle
collection, later rounds can collect labels on states visited by the current learned gate.

## Research question

> Can a learned, uncertainty-aware observation gate reduce model calls / latency / cost
> on GUI tasks **without** lowering task success — and does it dominate a hand-coded
> "observe on screen change / before risky actions" rule?

## Policies (one agent, four gates)

A real LLM (OpenAI Chat Completions, default `gpt-4o-mini`) drives every policy; they differ only in *when* the agent observes.

| Policy | Observation gate |
|---|---|
| `always` | observe before every action (upper bound on calls; always verified) |
| `never` | observe once, then coast on the plan (lower bound; no safety) |
| `handrule` | observe if the screen changed **or** the next carried action is a risk-bearing checkpoint |
| `learned@T` | observe if the trained gate's probability ≥ `T` |

Sweeping `T` traces a whole cost–success curve from one model; the headline result is
whether some `learned@T` Pareto-dominates `handrule`.

## Why the tasks are built the way they are

The hand rule keys off a **coarse** screen-change signal (status text + the set of
on-screen controls) — cheap, like real change detectors. The focused suite mixes tasks
where that signal is good enough with tasks where it is intentionally blind:

- **async search** (`async_shop`, `async_contacts`): results render after a delay.
- **drifting recipient** (`drift_recipient`): a "Suggested recipient" field is
  `Resolving…` and only resolves to the real address after a delay. The *set* of controls
  never changes — only a field **value** does — so the coarse signature is constant.
  Sending to the stale value is the wrong, externally-visible action. Here the hand rule
  cannot tell that re-observation is needed, but the model's **verbalized confidence**
  (and the coasting counter) can. This is the intellectual core of the comparison.
- **delayed options** (`resolve_language`): the language dropdown keeps the same selector,
  but the correct option only appears after the settings panel finishes loading.

The result is a **focused workflow suite** rather than a generic toy demo: fifteen local
tasks, five stable baselines, four visible async variants, and six coarse-signal-blind
delayed-value tasks that stress the failure modes selector-only or status-only heuristics miss.

## How to run (live)

Requires an OpenAI API key. Default model `gpt-4o-mini` (a full run is a few cents);
override with `OPENAI_MODEL=gpt-4o` for a stronger agent.

```bash
export OPENAI_API_KEY=sk-...
./scripts/run_pipeline.sh          # collect -> (optional DAgger rounds) -> train -> evaluate
# or step by step:
npm install && npx playwright install chromium
npm run collect                                   # -> data/oracle_steps.jsonl (+ label summary)
python -m soa.gate --steps data/oracle_steps.jsonl --out results/gate_model.json --learner auto
npm run evaluate -- --gate results/gate_model.json   # -> results/policy_report.md, pareto.svg

# run only the delayed-option task
npm run evaluate -- --family delayed_options --gate results/gate_model.json
```

Useful env vars: `SOA_HEADFUL=1` (show the browser), `SOA_COLLECT_ROUNDS`,
`SOA_TAUS` (threshold sweep), `OBSERVATION_MODE=screenshot_dom`,
`SOA_DAGGER_ROUNDS` (iterate collection/training), `SOA_DAGGER_TAU` (collection-time
learned-gate threshold), `SOA_BOOTSTRAP_ITERS` (evaluation CIs), `SOA_SUITE`,
`SOA_FAMILY`, `SOA_DIFFICULTY`, `SOA_MAX_TASKS`.

**First thing to check after collection:** the printed label summary. If
`positive_rate` is 0 or 1 the tasks are degenerate and nothing is learnable — tune the
dynamic tasks before training. This is the cheap go/no-go signal for the whole approach.

## Offline (no API key)

The Python side runs without a key on a synthetic sample, to exercise the trainer/tests.
(The synthetic sample is for plumbing only; real experiments train on `data/oracle_steps.jsonl`.)

```bash
python scripts/make_sample_data.py
python -m soa.gate --steps data/sample_steps.jsonl --out results/gate_model.json
python -m unittest discover -s tests
npm install && npx playwright install chromium && npm run smoke
```

## Research upgrades

- **Multi-round DAgger.** `runner/collect.mjs` can now roll out under `always`,
  `handrule`, `never`, or `learned@T`, while still asking the oracle for the per-step
  supervision label. `scripts/run_pipeline.sh` uses this to aggregate later rounds under
  the learned gate and reduce deployment distribution shift.
- **Stronger gate family.** `soa/gate.py` now supports both a transparent **logistic**
  gate and a one-hidden-layer **MLP** gate, with `--learner auto` selecting the best
  validation performer before reporting final held-out metrics.
- **Confidence intervals.** `runner/evaluate_policies.mjs` now attaches task-level
  bootstrap 95% confidence intervals to the live success/cost frontier, so the main
  claim is not a point estimate only.
- **Checkpoint auditing.** Live evaluation also reports `no_check_rate`: the share of
  checkpoint actions such as send/save/rename/checkout that were executed without a
  fresh observation immediately beforehand. It is an audit-style behavior metric, not a
  direct failure metric.
- **Focused suite framing.** `tasks/tasks.json` is now a structured fifteen-task manifest
  with five stable workflows, four visible async variants, and six coarse-signal-blind delayed-value tasks rather than a long
  grab bag of mostly redundant demos.
- **Compact-feature ablation.** `soa/gate.py` now supports named feature presets. The
  strongest compact preset keeps only nine features total (bias + eight core signals:
  `no_plan`, `screen_changed_last`, `candidates_changed_last`, `steps_since_observe`,
  `remaining_plan_len`, `next_risk_state_changing`, `verbalized_confidence`,
  `verbalized_needs_observation`). On held-out gate prediction it reaches `0.970`
  accuracy versus `0.909` for the full feature set, and in live evaluation it still
  finds safe points that match `handrule` success at fewer calls. The full feature set
  remains the default because its live frontier is slightly steadier across thresholds.
- **Benchmark-ready task loading.** `runner/lib/task_suite.mjs` lets collection/evaluation
  load a suite manifest and filter by family/difficulty/tags, which makes it easier to
  keep this repo as a diagnostic layer while migrating headline experiments to
  WebArena/WorkArena-style benchmarks later.

## Layout

```
app/                       local GUI app (static + dynamic/adversarial scenarios)
tasks/tasks.json           focused workflow suite manifest
tasks/benchmark_catalog.json  recommended external headline benchmarks
runner/lib/agent.mjs       shared agent + the observation FEATURE CONTRACT
runner/lib/task_suite.mjs  suite loading / filtering / summary helpers
runner/collect.mjs         oracle data collection + learned-policy DAgger rollouts
runner/evaluate_policies.mjs  live policy eval + threshold sweep + Pareto + bootstrap CIs
soa/gate.py                gate trainer (logistic / MLP auto-select), calibration, hand-rule comparison
scripts/                   pipeline + sample-data generator
tests/                     unit tests
docs/proposal.md           full proposal + related work
```

## Related work (positioning)

- **ReAct** (Yao et al., 2022) — the observe-think-act loop every policy here is a variant of.
- **DAgger** (Ross et al., 2011) — the oracle-distillation method our label-collection follows.
- **"Language Models (Mostly) Know What They Know"** (Kadavath et al., 2022) — basis and caveat for using verbalized confidence.
- **FrugalGPT** (Chen et al., 2023) — cost-aware cascades; same "spend the expensive call only when needed" spirit, applied to model choice rather than observation.
- **OSWorld / OSWorld-Human** — motivation that agents take far more steps than humans.

Gap: ReAct defines the loop but never asks whether each step's observation is necessary;
no prior work casts the GUI **observation decision** as a learned, safety-constrained
problem. (Search recent work on "selective perception / observation scheduling for LLM
agents" before final submission to confirm no direct competitor appeared.)

## Limitations

- The suite is now a stronger diagnostic stress suite, but it is still **local**. The
  next credibility jump is to port the same collector/evaluator to an external benchmark
  such as WebArena, WorkArena, or OSWorld and keep this repo's tasks as diagnostic
  ablations rather than the headline benchmark.
- Multi-round DAgger is supported, but large-scale claims still need runs over more tasks
  and seeds.
- Verbalized confidence may be poorly calibrated — the calibration report is part of the
  result, not an assumption.
- Model uncertainty is currently verbalized (a self-reported `confidence` field). OpenAI
  Chat Completions can also return token `logprobs`, so using true token-level confidence
  as an additional gate feature is a natural extension.

## Current headline

On the default `soa-workflow-focus-v2` suite in [results/policy_report.md](/Users/zejun/Documents/GitHub/htc-agent-efficiency/results/policy_report.md:1), the main comparison centers on task success versus model calls, with `no_check_rate` as an auxiliary audit. In practice, the current suite shows the open problem clearly: the gate can often buy efficiency, but the strongest thresholds still need to preserve the same success level as the safer baselines while keeping checkpoint re-check behavior interpretable.

The most useful ablation is the compact gate in [results/ablation_compact_core/policy_report.md](/Users/zejun/Documents/GitHub/htc-agent-efficiency/results/ablation_compact_core/policy_report.md:1). It uses only eight non-bias inputs, which makes it possible to test whether the learned result survives a much smaller gate rather than depending on a large feature vector.
