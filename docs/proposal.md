# Proposal: Learning When to Observe in Computer-Use Agents

## 1. Problem

Computer-use / GUI agents run an observe–think–act loop. Each observation is a model
call — the dominant source of latency and dollar cost, and (per OSWorld-Human) a large
part of why agents take many more steps than humans. The obvious efficiency lever is to
**skip observations** on stretches where the agent can act from a previously-formed plan.
But skipping can be brittle: if the page changed underneath the stale plan, the agent acts on
wrong information, which is especially costly before irreversible or externally-visible
actions (send, delete, submit).

Existing agents either observe every step (safe, expensive) or follow a fixed multi-step
plan (cheap, brittle). Neither *decides* when observation is worth its cost.

## 2. Research question

> Can an agent learn — from its own uncertainty plus cheap state features — *when
> re-observation is necessary*, reducing model calls / latency / cost without lowering
> task success, and does this learned gate dominate a hand-coded rule on the
> cost–success frontier?

## 3. Method: oracle-distilled observation gating

**Decision.** At each safe step the agent chooses: ACT on the carried plan (0 calls) or
OBSERVE (1 call + re-plan).

**Oracle label (DAgger-style).** An always-observe oracle runs each task. At every step
it computes, counterfactually, the action a *coasting* agent would take from its carried
plan and compares it to the freshly-verified action:

```
label = 1  if  the coasted action differs from the verified one (or no plan is carried)
label = 0  if  the carried plan still agrees
```

A coasting counter lets the carried plan run for multiple steps in the bookkeeping (it
"refreshes" only on divergence), so `steps_since_observe` / `remaining_plan_len` carry
real signal rather than being constant.

**Features (available before observing).** screen-changed (coarse), candidates-changed,
steps-since-observe, remaining-plan-length, next-action type and risk, and the model's
**verbalized confidence** + self-reported `needs_observation` for the carried next action.
The current code also supports compact feature presets, which makes it possible to test
whether the learned result depends on a large input vector or survives with only a small
core set of observation signals.

**Gate.** The gate starts with a transparent logistic baseline, but the current
implementation also supports a one-hidden-layer MLP and can auto-select the better
validation performer. Deployed as: observe iff `P ≥ T`. Sweeping `T` yields a full
cost–success frontier from one model without a forced observe-before-checkpoint override.

**DAgger upgrade.** After round-0 oracle collection, later rounds can collect labels on
states visited by the current learned gate (`learned@T`) instead of only the oracle's
state distribution. This reduces the original deployment-shift criticism and makes the
pipeline closer to iterative DAgger rather than single-pass distillation.

**Why a coarse screen-change signal.** The hand-rule baseline keys off status text + the
set of controls — like real change detectors (URL/title/DOM-count). The `drift_recipient`
task changes only a field *value*, so the coarse signature is constant and the hand rule
cannot fire; the model's verbalized uncertainty can. This is where a learned gate can win.

## 4. Experiments

- **Tasks.** A focused local **workflow suite** with fifteen tasks: five stable baselines
  (`mail`, `shop`, `contacts`, `settings`, `files`), four visible async-result variants,
  and six observation-sensitive delayed-value variants spanning recipient resolution and
  delayed options. The suite stays local on
  purpose: it isolates observation-sensitive failure modes without the noise of a full
  benchmark, while leaving benchmark migration to future work.
- **Policies.** `always`, `never`, `handrule`, `learned@T` (T swept). One LLM agent (OpenAI `gpt-4o-mini` by default) drives all.
- **Metrics.** success rate, model calls, latency, dollar cost, and an auxiliary
  `no_check_rate` audit metric: the fraction of checkpoint actions executed without a
  fresh observation immediately beforehand. Also report decision-level accuracy /
  false-skip / wasted-observe on a held-out task split, gate calibration, and
  task-level bootstrap 95% confidence intervals on the main policy frontier.
- **Hypotheses.**
  - H1: `never` is cheapest but fails more often on dynamic tasks.
  - H2: some `learned@T` matches `always` success at far fewer calls.
  - H3: `learned@T` Pareto-dominates `handrule`, driven by the `drift_recipient` regime
    where verbalized confidence beats screen-change.
  - H4: removing the hard safety floor reveals whether the learned gate itself can preserve success while reducing calls.

**Current status.** The focused fifteen-task suite now produces exactly the kind of result
this proposal aimed for: the learned gate matches the safe baselines on success while
reducing model calls below the hand rule on the live frontier, rather than winning only
on offline label prediction. A compact ablation with only eight non-bias inputs still
preserves that main story, which is valuable because it shows the gain is not just an
artifact of feeding the gate a wide feature vector.

## 5. Related work

- **ReAct** (Yao et al., 2022): the observe-think-act loop; our policies are variants.
- **DAgger** (Ross, Gordon, Bagnell, 2011): imitation of an oracle from on-distribution
  labels — the methodology our collector follows, now with support for iterative
  re-collection under the learned gate.
- **Kadavath et al., 2022, "Language Models (Mostly) Know What They Know"**: motivates and
  bounds the use of verbalized confidence as a gating signal.
- **FrugalGPT** (Chen et al., 2023): cost-aware decision to spend the expensive call only
  when needed — same spirit, applied to model cascades rather than observation.
- **OSWorld / OSWorld-Human**: agents take far more steps than humans; efficiency matters.

**Positioning.** ReAct defines the loop but never asks whether each observation is
necessary; we cast the GUI observation decision as a learned cost-sensitive problem
and evaluate it on a cost–success frontier.

## 6. Limitations and next steps

- Small task suite; add 20–30 tasks and port the same protocol to a stronger benchmark
  such as OSWorld, WebArena, or WorkArena.
- Multi-round DAgger is now supported, but convincing claims still need more tasks,
  more seeds, and ablations over the number of rounds.
- Verbalized confidence may be miscalibrated — reported, not assumed.
- No token logprobs from the API; uncertainty is verbalized. Self-consistency sampling is
  possible on temperature-capable models (Sonnet/Haiku) as an alternative signal.
- Compare across model tiers (Opus/Sonnet/Haiku): does the gate help cheaper models more?
