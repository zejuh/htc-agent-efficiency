import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const appUrl = pathToFileURL(path.join(root, "app", "index.html")).href;
const tasksPath = path.join(root, "tasks.json");
const outRoot = path.join(repoRoot, "results", "browser_demo");

const MODEL_LATENCY_MS = 180;
const POLICIES = ["baseline", "naive_skip", "htc_no_risk", "htc"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readTasks() {
  return JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
}

function actionTarget(action) {
  return action.target || "screen";
}

class TraceRecorder {
  constructor(task, policy) {
    this.task = task;
    this.policy = policy;
    this.steps = [];
  }

  async modelStep(actionType, target, reason) {
    const t0 = performance.now();
    await sleep(MODEL_LATENCY_MS);
    this.steps.push({
      t: this.steps.length,
      action_type: actionType,
      target,
      model_call: true,
      latency_ms: performance.now() - t0,
      risk: "safe",
      metadata: { reason, policy: this.policy },
    });
  }

  async executableStep(action, fn, options = {}) {
    const t0 = performance.now();
    await fn();
    this.steps.push({
      t: this.steps.length,
      action_type: normalizeActionType(action.action_type),
      target: actionTarget(action),
      text: action.text || "",
      model_call: false,
      latency_ms: performance.now() - t0,
      risk: action.risk || "safe",
      observation_required: Boolean(action.checkpoint),
      metadata: {
        policy: this.policy,
        may_change_screen: Boolean(action.may_change_screen),
        checkpoint: Boolean(action.checkpoint),
        checkpoint_required: requiresCheckpoint(action),
        verified_before_action: Boolean(options.verifiedBeforeAction),
      },
    });
  }

  trajectory(success, statusText) {
    return {
      task_id: this.task.task_id,
      benchmark: this.task.benchmark,
      success,
      steps: this.steps,
      metadata: {
        instruction: this.task.instruction,
        policy: this.policy,
        final_status: statusText,
      },
    };
  }
}

function normalizeActionType(kind) {
  if (kind === "fill") return "type";
  if (kind === "select") return "select";
  return kind;
}

function requiresCheckpoint(action) {
  return Boolean(action.checkpoint || action.risk === "external" || action.risk === "irreversible");
}

async function executeAction(page, action) {
  const target = actionTarget(action);
  if (action.action_type === "click") {
    await page.locator(target).click();
  } else if (action.action_type === "fill") {
    await page.locator(target).fill(action.text || "");
  } else if (action.action_type === "check") {
    await page.locator(target).check();
  } else if (action.action_type === "select") {
    await page.locator(target).selectOption({ label: action.text });
  } else if (action.action_type === "press") {
    await page.keyboard.press(action.text || "Enter");
  } else {
    throw new Error(`Unsupported action type: ${action.action_type}`);
  }
}

async function verifySuccess(page, task) {
  const status = await page.locator("#status").textContent();
  return {
    success: status === task.success_status,
    status,
  };
}

async function runBaseline(page, task) {
  const rec = new TraceRecorder(task, "baseline");
  await page.goto(`${appUrl}?task=${encodeURIComponent(task.task_id)}`);
  await rec.modelStep("observe", "screen", "initial_state");
  for (const action of task.actions) {
    await rec.modelStep("observe", "screen", "before_each_action");
    await rec.modelStep("think", actionTarget(action), "single_step_plan");
    await rec.executableStep(action, () => executeAction(page, action), { verifiedBeforeAction: true });
  }
  const { success, status } = await verifySuccess(page, task);
  return rec.trajectory(success, status);
}

async function runNaiveSkip(page, task) {
  const rec = new TraceRecorder(task, "naive_skip");
  await page.goto(`${appUrl}?task=${encodeURIComponent(task.task_id)}`);
  await rec.modelStep("observe", "screen", "initial_state");
  await rec.modelStep("think", "task", "one_shot_plan_no_checkpoints");
  rec.steps.push({
    t: rec.steps.length,
    action_type: "macro",
    target: "full_task",
    model_call: false,
    latency_ms: 0,
    risk: "safe",
    observation_required: false,
    metadata: { policy: "naive_skip", reason: "execute_all_without_intermediate_observation" },
  });
  for (const action of task.actions) {
    await rec.executableStep(action, () => executeAction(page, action), { verifiedBeforeAction: false });
  }
  const { success, status } = await verifySuccess(page, task);
  return rec.trajectory(success, status);
}

function needsHtcObservation(action, previousAction) {
  if (!previousAction) return true;
  if (action.checkpoint) return true;
  if (previousAction.may_change_screen) return true;
  if (action.risk === "irreversible" || action.risk === "external") return true;
  return false;
}

function needsHtcNoRiskObservation(action, previousAction) {
  if (!previousAction) return true;
  if (previousAction.may_change_screen) return true;
  return false;
}

async function runHtcLike(page, task, policy, shouldObserve) {
  const rec = new TraceRecorder(task, policy);
  await page.goto(`${appUrl}?task=${encodeURIComponent(task.task_id)}`);
  let previousAction = null;
  let macroOpen = false;

  for (const action of task.actions) {
    let verifiedBeforeAction = false;
    if (shouldObserve(action, previousAction)) {
      await rec.modelStep("observe", "screen", previousAction ? "checkpoint_or_screen_change" : "initial_state");
      await rec.modelStep("think", actionTarget(action), action.checkpoint ? "risk_aware_checkpoint" : "macro_plan");
      macroOpen = false;
      verifiedBeforeAction = true;
    } else if (!macroOpen) {
      rec.steps.push({
        t: rec.steps.length,
        action_type: "macro",
        target: actionTarget(action),
        model_call: false,
        latency_ms: 0,
        risk: "safe",
        observation_required: false,
        metadata: { policy, reason: "continue_deterministic_macro" },
      });
      macroOpen = true;
    }
    await rec.executableStep(action, () => executeAction(page, action), { verifiedBeforeAction });
    previousAction = action;
  }

  const { success, status } = await verifySuccess(page, task);
  return rec.trajectory(success, status);
}

async function runHtcNoRisk(page, task) {
  return runHtcLike(page, task, "htc_no_risk", needsHtcNoRiskObservation);
}

async function runHtc(page, task) {
  return runHtcLike(page, task, "htc", needsHtcObservation);
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf-8");
}

function aggregate(rows) {
  const sum = (fn) => rows.reduce((acc, row) => acc + fn(row), 0);
  const executableCount = (row) => row.steps.filter((s) => !["observe", "think", "reflect", "plan", "macro"].includes(s.action_type)).length;
  const checkpointActions = (row) => row.steps.filter((s) => s.metadata?.checkpoint_required);
  const unsafeMisses = (row) => checkpointActions(row).filter((s) => !s.metadata?.verified_before_action).length;
  const totalCheckpointActions = sum((row) => checkpointActions(row).length);
  const totalUnsafeMisses = sum(unsafeMisses);
  return {
    n: rows.length,
    success_rate: sum((row) => (row.success ? 1 : 0)) / rows.length,
    avg_executable_actions: sum(executableCount) / rows.length,
    avg_total_steps: sum((row) => row.steps.length) / rows.length,
    avg_model_calls: sum((row) => row.steps.filter((s) => s.model_call).length) / rows.length,
    avg_latency_ms: sum((row) => row.steps.reduce((acc, step) => acc + step.latency_ms, 0)) / rows.length,
    checkpoint_actions: totalCheckpointActions,
    unsafe_checkpoint_misses: totalUnsafeMisses,
    unsafe_compression_rate: totalCheckpointActions ? totalUnsafeMisses / totalCheckpointActions : 0,
  };
}

function deltaFromBaseline(baseline, row) {
  return {
    success_rate: row.success_rate - baseline.success_rate,
    avg_executable_actions: row.avg_executable_actions - baseline.avg_executable_actions,
    avg_total_steps: row.avg_total_steps - baseline.avg_total_steps,
    avg_model_calls: row.avg_model_calls - baseline.avg_model_calls,
    avg_latency_ms: row.avg_latency_ms - baseline.avg_latency_ms,
    unsafe_compression_rate: row.unsafe_compression_rate - baseline.unsafe_compression_rate,
  };
}

function writeSummary(rowsByPolicy) {
  const aggregates = Object.fromEntries(Object.entries(rowsByPolicy).map(([policy, rows]) => [policy, aggregate(rows)]));
  const baseline = aggregates.baseline;
  const summary = {
    generated_at: new Date().toISOString(),
    model_latency_ms: MODEL_LATENCY_MS,
    policies: aggregates,
    delta_vs_baseline: Object.fromEntries(Object.entries(aggregates).map(([policy, row]) => [policy, deltaFromBaseline(baseline, row)])),
  };
  fs.writeFileSync(path.join(outRoot, "browser_summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  return summary;
}

function writeMarkdown(summary) {
  const lines = [
    "# Browser HTC Live Demo Report",
    "",
    "This report is generated from live Playwright executions on local GUI tasks.",
    "",
    "## Policy Comparison",
    "",
    "| Policy | Success | Exec Actions | Total Steps | Model Calls | Latency ms | Unsafe Checkpoint Misses | Unsafe Rate |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const policy of POLICIES) {
    const row = summary.policies[policy];
    lines.push(
      `| \`${policy}\` | ${row.success_rate.toFixed(3)} | ${row.avg_executable_actions.toFixed(3)} | ${row.avg_total_steps.toFixed(3)} | ${row.avg_model_calls.toFixed(3)} | ${row.avg_latency_ms.toFixed(3)} | ${row.unsafe_checkpoint_misses} | ${row.unsafe_compression_rate.toFixed(3)} |`,
    );
  }
  lines.push("", "## Delta vs Baseline", "");
  lines.push("| Policy | Δ Success | Δ Steps | Δ Calls | Δ Latency ms | Δ Unsafe Rate |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const policy of POLICIES.filter((p) => p !== "baseline")) {
    const row = summary.delta_vs_baseline[policy];
    lines.push(
      `| \`${policy}\` | ${row.success_rate.toFixed(3)} | ${row.avg_total_steps.toFixed(3)} | ${row.avg_model_calls.toFixed(3)} | ${row.avg_latency_ms.toFixed(3)} | ${row.unsafe_compression_rate.toFixed(3)} |`,
    );
  }
  lines.push("", "## Artifacts", "");
  for (const policy of POLICIES) {
    lines.push(`- \`${policy}_trajectories.jsonl\`: live ${policy} traces`);
  }
  lines.push("- `pareto.csv` and `pareto.svg`: success-cost frontier artifacts");
  lines.push("- `videos/`: Playwright videos for every task and policy");
  fs.writeFileSync(path.join(outRoot, "browser_report.md"), lines.join("\n") + "\n", "utf-8");
}

function writePareto(summary) {
  const csvLines = ["policy,success_rate,avg_model_calls,avg_latency_ms,unsafe_compression_rate"];
  for (const policy of POLICIES) {
    const row = summary.policies[policy];
    csvLines.push(`${policy},${row.success_rate},${row.avg_model_calls},${row.avg_latency_ms},${row.unsafe_compression_rate}`);
  }
  fs.writeFileSync(path.join(outRoot, "pareto.csv"), csvLines.join("\n") + "\n", "utf-8");

  const width = 760;
  const height = 440;
  const pad = 60;
  const calls = POLICIES.map((policy) => summary.policies[policy].avg_model_calls);
  const maxCalls = Math.max(...calls) + 1;
  const minCalls = Math.min(...calls) - 1;
  const x = (callsValue) => pad + ((callsValue - minCalls) / (maxCalls - minCalls)) * (width - 2 * pad);
  const y = (success) => height - pad - success * (height - 2 * pad);
  const colors = {
    baseline: "#5f6b7a",
    naive_skip: "#bb4d00",
    htc_no_risk: "#9b6a00",
    htc: "#1f7a4d",
  };
  const points = POLICIES.map((policy) => {
    const row = summary.policies[policy];
    return `<g><circle cx="${x(row.avg_model_calls).toFixed(1)}" cy="${y(row.success_rate).toFixed(1)}" r="7" fill="${colors[policy]}"/><text x="${(x(row.avg_model_calls) + 10).toFixed(1)}" y="${(y(row.success_rate) - 8).toFixed(1)}" font-size="13">${policy}</text></g>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#222"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#222"/>
  <text x="${width / 2}" y="${height - 18}" text-anchor="middle" font-size="14">Average model calls lower is better</text>
  <text x="18" y="${height / 2}" transform="rotate(-90 18 ${height / 2})" text-anchor="middle" font-size="14">Success rate higher is better</text>
  <text x="${pad}" y="${height - pad + 28}" text-anchor="middle" font-size="12">${minCalls.toFixed(1)}</text>
  <text x="${width - pad}" y="${height - pad + 28}" text-anchor="middle" font-size="12">${maxCalls.toFixed(1)}</text>
  <text x="${pad - 12}" y="${height - pad + 4}" text-anchor="end" font-size="12">0</text>
  <text x="${pad - 12}" y="${pad + 4}" text-anchor="end" font-size="12">1</text>
  ${points}
</svg>`;
  fs.writeFileSync(path.join(outRoot, "pareto.svg"), svg, "utf-8");
}

async function runPolicy(browser, policy, task) {
  const videoDir = path.join(outRoot, "videos", "_tmp");
  ensureDir(videoDir);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const runners = {
    baseline: runBaseline,
    naive_skip: runNaiveSkip,
    htc_no_risk: runHtcNoRisk,
    htc: runHtc,
  };
  const trajectory = await runners[policy](page, task);
  await context.close();
  if (video) {
    const rawVideoPath = await video.path();
    const namedVideoPath = path.join(outRoot, "videos", `${policy}_${task.task_id}.webm`);
    fs.rmSync(namedVideoPath, { force: true });
    fs.renameSync(rawVideoPath, namedVideoPath);
    trajectory.metadata.video_path = namedVideoPath;
  }
  return trajectory;
}

async function main() {
  ensureDir(outRoot);
  ensureDir(path.join(outRoot, "videos"));
  fs.rmSync(path.join(outRoot, "videos", "_tmp"), { recursive: true, force: true });
  const tasks = readTasks();
  const browser = await chromium.launch({ headless: true });
  const rowsByPolicy = Object.fromEntries(POLICIES.map((policy) => [policy, []]));

  try {
    for (const task of tasks) {
      for (const policy of POLICIES) {
        rowsByPolicy[policy].push(await runPolicy(browser, policy, task));
      }
    }
  } finally {
    await browser.close();
  }

  for (const policy of POLICIES) {
    writeJsonl(path.join(outRoot, `${policy}_trajectories.jsonl`), rowsByPolicy[policy]);
  }
  const summary = writeSummary(rowsByPolicy);
  writeMarkdown(summary);
  writePareto(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
