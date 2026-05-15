$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen3.5:latest" }
$ObservationMode = if ($env:OLLAMA_OBSERVATION_MODE) { $env:OLLAMA_OBSERVATION_MODE } else { "dom" }
$Tag = ($Model -replace '[^a-zA-Z0-9._-]+', '_') + "_" + ($ObservationMode -replace '[^a-zA-Z0-9._-]+', '_')

Set-Location "$Root\browser_demo"
npm install
node runner\run_ollama_demo.mjs $Model $ObservationMode

Set-Location $Root
python -m htc_agent_efficiency.evaluate `
  --agent "results\browser_demo\ollama_$($Tag)_trajectories.jsonl" `
  --out "results\browser_demo\ollama_$($Tag)_eval.json"

Write-Host "Ollama demo complete. Model: $Model. Observation mode: $ObservationMode. See results\browser_demo\ollama_$($Tag)_summary.json"
