$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Node = "node"

Set-Location "$Root\browser_demo"
npm install
npm run test
npm run run
node runner\make_human_reference.mjs

Set-Location $Root
foreach ($Policy in @("baseline", "naive_skip", "htc_no_risk", "htc")) {
  python -m htc_agent_efficiency.evaluate `
    --agent "results\browser_demo\$($Policy)_trajectories.jsonl" `
    --human results\browser_demo\human_reference.jsonl `
    --out "results\browser_demo\$($Policy)_eval.json"
}
python -m htc_agent_efficiency.learned_gate `
  --trajectories results\browser_demo\htc_trajectories.jsonl `
  --out results\browser_demo\gate_model.json
python -m htc_agent_efficiency.evaluate `
  --agent results\browser_demo\baseline_trajectories.jsonl `
  --human results\browser_demo\human_reference.jsonl `
  --compress `
  --out results\browser_demo\baseline_compressed_rule_eval.json
python -m htc_agent_efficiency.evaluate `
  --agent results\browser_demo\baseline_trajectories.jsonl `
  --human results\browser_demo\human_reference.jsonl `
  --compress `
  --gate-model results\browser_demo\gate_model.json `
  --out results\browser_demo\baseline_compressed_model_gate_eval.json

Write-Host "Browser demo complete. See results\browser_demo\browser_report.md"
