#!/usr/bin/env bash
# 完整 selective-observation pipeline（macOS / Linux）。
#   1. 使用真实 OpenAI-backed agent 采集 oracle 标注 step
#   2. 可选：在 learned gate 下追加 DAgger 轮次
#   3. 训练 observation gate
#   4. 在线评估 fixed + learned policies，并扫描 gate 阈值
#
# 需要 OPENAI_API_KEY。可选：OPENAI_MODEL, OBSERVATION_MODE, SOA_HEADFUL=1,
# SOA_COLLECT_ROUNDS, SOA_TAUS, SOA_DAGGER_ROUNDS, SOA_DAGGER_TAU, SOA_GATE_LEARNER,
# SOA_SUITE, SOA_FAMILY, SOA_DIFFICULTY, SOA_MAX_TASKS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
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
  echo "OPENAI_API_KEY 未设置。请先在 .env 或当前 shell 中配置。" >&2
  exit 1
fi

cd "$ROOT"
npm install
node node_modules/playwright/cli.js install chromium
npm run smoke

mkdir -p "$DATA_DIR" "$RESULTS_DIR"

echo "== 第 1/3 步：第 0 轮 oracle 采集 =="
SOA_COLLECT_ROUNDS="$COLLECT_ROUNDS_PER_CALL" npm run collect -- "${SUITE_ARGS[@]-}" --policy always --out "$DATA_DIR/oracle_steps_round0.jsonl"
cp "$DATA_DIR/oracle_steps_round0.jsonl" "$DATA_DIR/oracle_steps.jsonl"

echo "== 第 2/3 步：训练初始 observation gate =="
python -m soa.gate --steps "$DATA_DIR/oracle_steps.jsonl" --out "$RESULTS_DIR/gate_model.json" --learner "$GATE_LEARNER"

if [[ "$DAGGER_ROUNDS" -gt 1 ]]; then
  for ((round=1; round<DAGGER_ROUNDS; round++)); do
    echo "== DAgger 第 ${round}/${DAGGER_ROUNDS}-1 轮：在 learned@${DAGGER_TAU} 下采集 =="
    SOA_COLLECT_ROUNDS="$COLLECT_ROUNDS_PER_CALL" npm run collect -- "${SUITE_ARGS[@]-}" --policy learned --gate "$RESULTS_DIR/gate_model.json" --tau "$DAGGER_TAU" --out "$DATA_DIR/oracle_steps_round${round}.jsonl"
    cat "$DATA_DIR"/oracle_steps_round*.jsonl > "$DATA_DIR/oracle_steps.jsonl"
    echo "== 使用第 0..${round} 轮聚合数据重新训练 gate =="
    python -m soa.gate --steps "$DATA_DIR/oracle_steps.jsonl" --out "$RESULTS_DIR/gate_model.json" --learner "$GATE_LEARNER"
  done
fi

echo "== 第 3/3 步：评估策略（fixed + learned，阈值扫描） =="
npm run evaluate -- "${SUITE_ARGS[@]-}" --gate "$RESULTS_DIR/gate_model.json"

echo "完成。查看 $RESULTS_DIR/policy_report.md, $RESULTS_DIR/pareto.svg, $RESULTS_DIR/gate_model.json"
