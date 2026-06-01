#!/usr/bin/env bash
# Full selective-observation pipeline (macOS / Linux).
#   1. collect oracle-labeled steps with a real OpenAI-backed agent
#   2. optionally run additional DAgger rounds under the learned gate
#   3. train the observation gate
#   4. evaluate fixed + learned policies live, sweeping the gate threshold
#
# Requires OPENAI_API_KEY. Optional: OPENAI_MODEL, OBSERVATION_MODE, SOA_HEADFUL=1,
# SOA_COLLECT_ROUNDS, SOA_TAUS, SOA_DAGGER_ROUNDS, SOA_DAGGER_TAU, SOA_GATE_LEARNER,
# SOA_SUITE, SOA_FAMILY, SOA_DIFFICULTY, SOA_MAX_TASKS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAGGER_ROUNDS="${SOA_DAGGER_ROUNDS:-1}"
DAGGER_TAU="${SOA_DAGGER_TAU:-0.5}"
GATE_LEARNER="${SOA_GATE_LEARNER:-auto}"
RESULTS_DIR="${SOA_RESULTS_DIR:-results}"
DATA_DIR="${SOA_DATA_DIR:-data}"
COLLECT_ROUNDS_PER_CALL="${SOA_PIPELINE_COLLECT_ROUNDS:-1}"
declare -a SUITE_ARGS=()

if [[ -n "${SOA_SUITE:-}" ]]; then
  SUITE_ARGS+=(--suite "$SOA_SUITE")
fi
if [[ -n "${SOA_FAMILY:-}" ]]; then
  SUITE_ARGS+=(--family "$SOA_FAMILY")
fi
if [[ -n "${SOA_DIFFICULTY:-}" ]]; then
  SUITE_ARGS+=(--difficulty "$SOA_DIFFICULTY")
fi
if [[ -n "${SOA_MAX_TASKS:-}" ]]; then
  SUITE_ARGS+=(--max-tasks "$SOA_MAX_TASKS")
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set. Export it first." >&2
  exit 1
fi

cd "$ROOT"
npm install
npx playwright install chromium
npm run smoke

mkdir -p "$DATA_DIR" "$RESULTS_DIR"

echo "== Step 1/3: round-0 oracle collection =="
SOA_COLLECT_ROUNDS="$COLLECT_ROUNDS_PER_CALL" npm run collect -- "${SUITE_ARGS[@]-}" --policy always --out "$DATA_DIR/oracle_steps_round0.jsonl"
cp "$DATA_DIR/oracle_steps_round0.jsonl" "$DATA_DIR/oracle_steps.jsonl"

echo "== Step 2/3: train initial observation gate =="
python -m soa.gate --steps "$DATA_DIR/oracle_steps.jsonl" --out "$RESULTS_DIR/gate_model.json" --learner "$GATE_LEARNER"

if [[ "$DAGGER_ROUNDS" -gt 1 ]]; then
  for ((round=1; round<DAGGER_ROUNDS; round++)); do
    echo "== DAgger round ${round}/${DAGGER_ROUNDS}-1: collect under learned@${DAGGER_TAU} =="
    SOA_COLLECT_ROUNDS="$COLLECT_ROUNDS_PER_CALL" npm run collect -- "${SUITE_ARGS[@]-}" --policy learned --gate "$RESULTS_DIR/gate_model.json" --tau "$DAGGER_TAU" --out "$DATA_DIR/oracle_steps_round${round}.jsonl"
    cat "$DATA_DIR"/oracle_steps_round*.jsonl > "$DATA_DIR/oracle_steps.jsonl"
    echo "== Re-train gate on aggregated rounds 0..${round} =="
    python -m soa.gate --steps "$DATA_DIR/oracle_steps.jsonl" --out "$RESULTS_DIR/gate_model.json" --learner "$GATE_LEARNER"
  done
fi

echo "== Step 3/3: evaluate policies (fixed + learned, threshold sweep) =="
npm run evaluate -- "${SUITE_ARGS[@]-}" --gate "$RESULTS_DIR/gate_model.json"

echo "Done. See $RESULTS_DIR/policy_report.md, $RESULTS_DIR/pareto.svg, $RESULTS_DIR/gate_model.json"
