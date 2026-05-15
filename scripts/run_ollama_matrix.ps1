$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$MainModels = @(
  "qwen3.5:9b",
  "gemma4:e4b",
  "gemma4:26b"
)

$MainObservationModes = @(
  "dom",
  "screenshot_dom"
)

function Get-SafeTag {
  param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$ObservationMode
  )

  $safeModel = $Model -replace '[^a-zA-Z0-9._-]+', '_'
  $safeMode = $ObservationMode -replace '[^a-zA-Z0-9._-]+', '_'
  return "$safeModel`_$safeMode"
}

function Invoke-CheckedNative {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

function Invoke-OllamaRun {
  param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$ObservationMode
  )

  $tag = Get-SafeTag -Model $Model -ObservationMode $ObservationMode
  Write-Host "Running Ollama matrix cell: model=$Model observation_mode=$ObservationMode"

  Set-Location "$Root\browser_demo"
  $env:OLLAMA_MODEL = $Model
  $env:OLLAMA_OBSERVATION_MODE = $ObservationMode
  Invoke-CheckedNative node runner\run_ollama_demo.mjs $Model $ObservationMode

  Set-Location $Root
  Invoke-CheckedNative python -m htc_agent_efficiency.evaluate `
    --agent "results\browser_demo\ollama_$($tag)_trajectories.jsonl" `
    --out "results\browser_demo\ollama_$($tag)_eval.json"
}

Set-Location "$Root\browser_demo"
Invoke-CheckedNative npm install

foreach ($model in $MainModels) {
  Write-Host "Ensuring Ollama model is available: $model"
  Invoke-CheckedNative ollama pull $model
}

foreach ($model in $MainModels) {
  foreach ($mode in $MainObservationModes) {
    Invoke-OllamaRun -Model $model -ObservationMode $mode
  }
}

Set-Location $Root
Write-Host "Ollama matrix complete. See results\browser_demo\ollama_*_summary.json and ollama_*_eval.json."
