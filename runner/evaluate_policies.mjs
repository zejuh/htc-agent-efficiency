// Live evaluation of observation policies, all driven by the same OpenAI-backed agent.
//
//   always     observe before every action                 (upper bound on calls)
//   never      observe once, then coast on the plan         (lower bound; no safety)
//   handrule   observe if the screen changed OR the next    (the hand-coded baseline
//              carried action is a risk-bearing checkpoint    this project aims to beat)
//   learned@T  observe if the trained gate's probability     (learned, threshold-swept;
//              >= T, with a hard safety floor that always     sweeping T traces a whole
//              observes before irreversible/external actions  cost-success frontier)
//
// Output: results/policy_summary.json, results/policy_report.md, results/pareto.{csv,svg}
// Requires OPENAI_API_KEY. Optional: --gate <path> (default results/gate_model.json).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createAdapter } from "./lib/adapters/index.mjs";
import { filterTasks, loadTaskSuite, parseTaskArgs, summarizeTaskSuite } from "./lib/task_suite.mjs";
import {
  MODEL,
  OBSERVATION_MODE,
  captureObservation,
  planActions,
  executeAction,
  coarseSignature,
  getCandidates,
  isCheckpoint,
  extractObsFeatures,
  decideObservation,
  costOf,
} from "./lib/agent.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const tasksPath = path.join(repoRoot, "tasks", "tasks.json");
const outRoot = path.resolve(process.env.SOA_RESULTS_DIR || path.join(repoRoot, "results"));

const MAX_STEPS = Number(process.env.SOA_MAX_STEPS || 16);
const TAUS = (process.env.SOA_TAUS || "0.2,0.35,0.5,0.65,0.8,0.9,0.95").split(",").map(Number);

function parseArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function candidateCount(page) {
  return (await getCandidates(page)).length;
}

function makeRng(seed = 7) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function summarizeRows(rows) {
  const n = rows.length || 1;
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const checkpoints = sum((r) => r.checkpoint_actions);
  return {
    n: rows.length,
    success_rate: sum((r) => (r.success ? 1 : 0)) / n,
    avg_model_calls: sum((r) => r.model_calls) / n,
    avg_latency_ms: sum((r) => r.latency_ms) / n,
    avg_cost_usd: sum((r) => r.cost_usd) / n,
    avg_exec_steps: sum((r) => r.exec_steps) / n,
    checkpoint_actions: checkpoints,
    unsafe_misses: sum((r) => r.unsafe_misses),
    unsafe_rate: checkpoints ? sum((r) => r.unsafe_misses) / checkpoints : 0,
  };
}

function bootstrapIntervals(rows, iters = Number(process.env.SOA_BOOTSTRAP_ITERS || 1000), seed = 7) {
  if (rows.length <= 1) return {};
  const rng = makeRng(seed);
  const metrics = {
    success_rate: [],
    avg_model_calls: [],
    avg_latency_ms: [],
    avg_cost_usd: [],
    avg_exec_steps: [],
    unsafe_rate: [],
  };
  for (let i = 0; i < iters; i += 1) {
    const sample = [];
    for (let j = 0; j < rows.length; j += 1) sample.push(rows[Math.floor(rng() * rows.length)]);
    const summary = summarizeRows(sample);
    for (const name of Object.keys(metrics)) metrics[name].push(summary[name]);
  }
  const out = {};
  for (const [name, values] of Object.entries(metrics)) {
    values.sort((a, b) => a - b);
    out[name] = {
      lo: percentile(values, 0.025),
      hi: percentile(values, 0.975),
    };
  }
  return out;
}

async function runPolicyOnTask(browser, task, spec) {
  const adapter = await createAdapter(browser, task);
  const page = adapter.page;

  let carriedPlan = null;
  let idx = 1;
  let screenChangedLast = true;
  let candidatesChangedLast = true;
  let modelCalls = 0;
  let cost = 0;
  let latency = 0;
  let nSteps = 0;
  let checkpointActions = 0;
  let unsafeMisses = 0;
  let errored = false;

  for (let i = 0; i < MAX_STEPS; i += 1) {
    if (await adapter.isSuccess()) break;

    const blindAction = carriedPlan ? carriedPlan[idx] || null : null;
    const features = extractObsFeatures({
      blindAction,
      screenChangedLast,
      candidatesChangedLast,
      stepsSinceObserve: idx,
      remainingPlanLen: carriedPlan ? carriedPlan.length - idx : 0,
    });

    const decision = decideObservation(spec, { blindAction, features });
    const observe = decision.observe;

    let action;
    let verifiedBeforeAction;
    if (observe) {
      let plan;
      try {
        const runtimeTask = {
          ...task,
          instruction: await adapter.getInstruction(),
          success_status: await adapter.getSuccessConditionText(),
        };
        const observation = await captureObservation(page, adapter);
        plan = await planActions(runtimeTask, observation);
      } catch (err) {
        errored = true;
        break;
      }
      modelCalls += 1;
      latency += plan.latency_ms;
      cost += costOf(plan.usage);
      carriedPlan = plan.actions;
      idx = 1;
      action = plan.actions[0] || null;
      verifiedBeforeAction = true;
    } else {
      action = blindAction;
      verifiedBeforeAction = false;
    }

    if (!action || action.action_type === "done") break;

    nSteps += 1;
    if (isCheckpoint(action)) {
      checkpointActions += 1;
      if (!verifiedBeforeAction) unsafeMisses += 1;
    }

    const beforeStatus = await adapter.getCoarseStatusText();
    const before = await coarseSignature(page, beforeStatus);
    const beforeCount = await candidateCount(page);
    try {
      await executeAction(page, action);
      await adapter.afterAction();
    } catch (err) {
      errored = true;
      break;
    }
    const afterStatus = await adapter.getCoarseStatusText();
    const after = await coarseSignature(page, afterStatus);
    const afterCount = await candidateCount(page);
    screenChangedLast = before !== after;
    candidatesChangedLast = beforeCount !== afterCount;

    if (!observe) idx += 1; // coasted one more step into the carried plan
  }

  const finalInfo = await adapter.getEvalInfo();
  const success = await adapter.isSuccess();
  await adapter.close();
  return {
    task_id: task.task_id,
    success,
    model_calls: modelCalls,
    latency_ms: latency,
    cost_usd: cost,
    exec_steps: nSteps,
    checkpoint_actions: checkpointActions,
    unsafe_misses: unsafeMisses,
    errored,
    final_status: finalInfo.final_status,
    ...finalInfo,
  };
}

function aggregate(label, rows) {
  return {
    policy: label,
    ...summarizeRows(rows),
    ci95: bootstrapIntervals(rows),
  };
}

function buildSpecs(gate) {
  const specs = [
    { label: "always", kind: "always" },
    { label: "never", kind: "never" },
    { label: "handrule", kind: "handrule" },
  ];
  if (gate) {
    for (const tau of TAUS) specs.push({ label: `learned@${tau}`, kind: "learned", tau, gate });
  }
  return specs;
}

function writePareto(points) {
  const csv = ["policy,success_rate,avg_model_calls,avg_cost_usd,avg_latency_ms,unsafe_rate"];
  for (const p of points) {
    csv.push(`${p.policy},${p.success_rate},${p.avg_model_calls},${p.avg_cost_usd},${p.avg_latency_ms},${p.unsafe_rate}`);
  }
  fs.writeFileSync(path.join(outRoot, "pareto.csv"), csv.join("\n") + "\n", "utf-8");

  const width = 780;
  const height = 460;
  const pad = 64;
  const calls = points.map((p) => p.avg_model_calls);
  const maxCalls = Math.max(...calls, 1) + 1;
  const minCalls = Math.max(0, Math.min(...calls) - 0.5);
  const x = (v) => pad + ((v - minCalls) / (maxCalls - minCalls || 1)) * (width - 2 * pad);
  const y = (s) => height - pad - s * (height - 2 * pad);
  const color = (p) =>
    p.policy.startsWith("learned") ? "#1f7a4d" : p.policy === "handrule" ? "#9b6a00" : p.policy === "never" ? "#bb4d00" : "#5f6b7a";
  const dots = points
    .map(
      (p) =>
        `<g><circle cx="${x(p.avg_model_calls).toFixed(1)}" cy="${y(p.success_rate).toFixed(1)}" r="6" fill="${color(p)}"/>` +
        `<text x="${(x(p.avg_model_calls) + 9).toFixed(1)}" y="${(y(p.success_rate) - 7).toFixed(1)}" font-size="12">${p.policy}</text></g>`,
    )
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#222"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#222"/>
  <text x="${width / 2}" y="${height - 20}" text-anchor="middle" font-size="13">Average model calls (lower is better)</text>
  <text x="20" y="${height / 2}" transform="rotate(-90 20 ${height / 2})" text-anchor="middle" font-size="13">Success rate (higher is better)</text>
  ${dots}
</svg>`;
  fs.writeFileSync(path.join(outRoot, "pareto.svg"), svg, "utf-8");
}

function writeReport(points, suiteSummary) {
  const lines = [
    "# Selective-Observation Policy Report",
    "",
    `Live run. Model: \`${MODEL}\`, observation mode: \`${OBSERVATION_MODE}\`. All policies share one agent and differ only in the observation gate.`,
    `Suite: \`${suiteSummary.suite_id}\` with ${suiteSummary.n_tasks} tasks. Families: ${Object.entries(suiteSummary.by_family).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    `95% confidence intervals use task-level bootstrap resampling with \`${process.env.SOA_BOOTSTRAP_ITERS || 1000}\` draws.`,
    "",
    "| Policy | Success (95% CI) | Model Calls (95% CI) | Latency ms | Cost USD | Exec Steps | Unsafe Rate (95% CI) |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const p of points) {
    const successCI = p.ci95?.success_rate ? `[${p.ci95.success_rate.lo.toFixed(3)}, ${p.ci95.success_rate.hi.toFixed(3)}]` : "n/a";
    const callsCI = p.ci95?.avg_model_calls ? `[${p.ci95.avg_model_calls.lo.toFixed(2)}, ${p.ci95.avg_model_calls.hi.toFixed(2)}]` : "n/a";
    const unsafeCI = p.ci95?.unsafe_rate ? `[${p.ci95.unsafe_rate.lo.toFixed(3)}, ${p.ci95.unsafe_rate.hi.toFixed(3)}]` : "n/a";
    lines.push(
      `| \`${p.policy}\` | ${p.success_rate.toFixed(3)} ${successCI} | ${p.avg_model_calls.toFixed(2)} ${callsCI} | ${p.avg_latency_ms.toFixed(1)} | ${p.avg_cost_usd.toFixed(6)} | ${p.avg_exec_steps.toFixed(2)} | ${p.unsafe_rate.toFixed(3)} ${unsafeCI} |`,
    );
  }
  lines.push(
    "",
    "Read the `learned@T` rows as a frontier: lower `T` observes more (closer to `always`), higher `T` coasts more (closer to `never`). The headline result is whether some `learned@T` dominates `handrule` — equal-or-higher success at fewer model calls, with unsafe rate held at 0 by the safety floor.",
    "",
    "Artifacts: `pareto.csv`, `pareto.svg`, `policy_summary.json`.",
  );
  fs.writeFileSync(path.join(outRoot, "policy_report.md"), lines.join("\n") + "\n", "utf-8");
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Export your key before evaluating.");
    process.exit(1);
  }
  const gatePath = parseArg("--gate") || process.env.SOA_GATE || path.join(outRoot, "gate_model.json");
  let gate = null;
  if (fs.existsSync(gatePath)) gate = JSON.parse(fs.readFileSync(gatePath, "utf-8"));
  else process.stderr.write(`No gate model at ${gatePath}; running fixed policies only.\n`);

  fs.mkdirSync(outRoot, { recursive: true });
  const taskArgs = parseTaskArgs();
  const suite = loadTaskSuite(taskArgs.suitePath || tasksPath);
  const tasks = filterTasks(suite, taskArgs);
  const suiteSummary = summarizeTaskSuite(suite, tasks);
  if (!tasks.length) {
    throw new Error(`No tasks matched the requested suite/filter options in ${taskArgs.suitePath || tasksPath}`);
  }
  const specs = buildSpecs(gate);
  const browser = await chromium.launch({ headless: process.env.SOA_HEADFUL !== "1" });

  const points = [];
  const perTask = {};
  try {
    for (const spec of specs) {
      const rows = [];
      for (const task of tasks) {
        process.stderr.write(`eval ${spec.label} :: ${task.task_id}\n`);
        rows.push(await runPolicyOnTask(browser, task, spec));
      }
      perTask[spec.label] = rows;
      points.push(aggregate(spec.label, rows));
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    path.join(outRoot, "policy_summary.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        model: MODEL,
        bootstrap_iters: Number(process.env.SOA_BOOTSTRAP_ITERS || 1000),
        suite: suiteSummary,
        points,
        per_task: perTask,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  writeReport(points, suiteSummary);
  writePareto(points);
  console.log(JSON.stringify(points, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
