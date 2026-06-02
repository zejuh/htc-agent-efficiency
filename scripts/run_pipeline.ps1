param(
    [string]$ResultsDir = $(if ($env:SOA_RESULTS_DIR) { $env:SOA_RESULTS_DIR } else { "results" }),
    [string]$DataDir = $(if ($env:SOA_DATA_DIR) { $env:SOA_DATA_DIR } else { "data" })
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $Root ".env"

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }
        if ($trimmed.StartsWith("export ")) {
            $trimmed = $trimmed.Substring(7).Trim()
        }

        $eq = $trimmed.IndexOf("=")
        if ($eq -le 0) {
            continue
        }

        $key = $trimmed.Substring(0, $eq).Trim()
        if ($key -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
            continue
        }
        if ([Environment]::GetEnvironmentVariable($key, "Process")) {
            continue
        }

        $value = $trimmed.Substring($eq + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

Import-DotEnv $EnvPath

$DaggerRounds = if ($env:SOA_DAGGER_ROUNDS) { [int]$env:SOA_DAGGER_ROUNDS } else { 1 }
$DaggerTau = if ($env:SOA_DAGGER_TAU) { $env:SOA_DAGGER_TAU } else { "0.5" }
$GateLearner = if ($env:SOA_GATE_LEARNER) { $env:SOA_GATE_LEARNER } else { "auto" }
$CollectRoundsPerCall = if ($env:SOA_PIPELINE_COLLECT_ROUNDS) { $env:SOA_PIPELINE_COLLECT_ROUNDS } else { "1" }

$SuiteArgs = @()
if ($env:SOA_SUITE) {
    $SuiteArgs += @("--suite", $env:SOA_SUITE)
}
if ($env:SOA_FAMILY) {
    $SuiteArgs += @("--family", $env:SOA_FAMILY)
}
if ($env:SOA_DIFFICULTY) {
    $SuiteArgs += @("--difficulty", $env:SOA_DIFFICULTY)
}
if ($env:SOA_MAX_TASKS) {
    $SuiteArgs += @("--max-tasks", $env:SOA_MAX_TASKS)
}

if (-not $env:OPENAI_API_KEY) {
    Write-Error "OPENAI_API_KEY 未设置。请放入 .env，或在当前 PowerShell session 中设置。"
}

Set-Location $Root

npm install
node node_modules/playwright/cli.js install chromium
npm run smoke

New-Item -ItemType Directory -Force -Path $DataDir, $ResultsDir | Out-Null

Write-Host "== 第 1/3 步：第 0 轮 oracle 采集 =="
$round0 = Join-Path $DataDir "oracle_steps_round0.jsonl"
$aggregate = Join-Path $DataDir "oracle_steps.jsonl"
$env:SOA_COLLECT_ROUNDS = $CollectRoundsPerCall
try {
    $collectArgs = @("run", "collect", "--") + $SuiteArgs + @("--policy", "always", "--out", $round0)
    & npm @collectArgs
}
finally {
    Remove-Item Env:\SOA_COLLECT_ROUNDS -ErrorAction SilentlyContinue
}
Copy-Item -Force $round0 $aggregate

Write-Host "== 第 2/3 步：训练初始 observation gate =="
$gatePath = Join-Path $ResultsDir "gate_model.json"
python -m soa.gate --steps $aggregate --out $gatePath --learner $GateLearner

if ($DaggerRounds -gt 1) {
    for ($round = 1; $round -lt $DaggerRounds; $round++) {
        Write-Host "== DAgger 第 $round/$($DaggerRounds - 1) 轮：在 learned@$DaggerTau 下采集 =="
        $roundOut = Join-Path $DataDir "oracle_steps_round$round.jsonl"
        $env:SOA_COLLECT_ROUNDS = $CollectRoundsPerCall
        try {
            $daggerArgs = @("run", "collect", "--") + $SuiteArgs + @("--policy", "learned", "--gate", $gatePath, "--tau", $DaggerTau, "--out", $roundOut)
            & npm @daggerArgs
        }
        finally {
            Remove-Item Env:\SOA_COLLECT_ROUNDS -ErrorAction SilentlyContinue
        }

        Get-ChildItem $DataDir -Filter "oracle_steps_round*.jsonl" |
            Sort-Object Name |
            Get-Content |
            Set-Content -Encoding utf8 $aggregate

        Write-Host "== 使用第 0..$round 轮聚合数据重新训练 gate =="
        python -m soa.gate --steps $aggregate --out $gatePath --learner $GateLearner
    }
}

Write-Host "== 第 3/3 步：评估策略（fixed + learned，阈值扫描） =="
$evaluateArgs = @("run", "evaluate", "--") + $SuiteArgs + @("--gate", $gatePath)
& npm @evaluateArgs

Write-Host "完成。查看 $ResultsDir/policy_report.md, $ResultsDir/pareto.svg, $ResultsDir/gate_model.json"
