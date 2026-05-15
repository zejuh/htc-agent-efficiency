$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

python -m unittest discover -s tests
python -m htc_agent_efficiency.evaluate `
  --agent data\sample_agent.jsonl `
  --human data\sample_human.jsonl `
  --compress `
  --out results\sample_eval.json
python -m htc_agent_efficiency.report `
  --eval results\sample_eval.json `
  --out results\sample_report.md

Write-Host "Wrote results\sample_eval.json and results\sample_report.md"

