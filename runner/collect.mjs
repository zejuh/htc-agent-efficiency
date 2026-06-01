// Oracle data collection for the learned observation gate.
//
// The oracle observes at EVERY step and always follows the freshly-verified action.
// At each step it also asks the counterfactual question that defines the label:
//
//   "If I had been coasting on my previously-formed plan instead of observing now,
//    would the action I'm about to take differ from the verified one?"
//
//   label = 1  ->  observation was necessary (the coasted action diverges, or there
//                  is no carried plan)
//   label = 0  ->  the carried plan still agrees; observing here changed nothing
//
// We keep a "carried plan" and a coasting counter so that steps_since_observe /
// remaining_plan_len / plan_age have real variance: the counter grows for as long as
// the carried plan keeps matching the verified action, and resets on divergence.
//
// Output: one JSONL row per step -> data/oracle_steps.jsonl  (+ a label summary).
// Requires OPENAI_API_KEY.
//
// In round-0 this runs under the oracle ("always" observe). For later DAgger rounds,
// pass --policy learned --gate <model> --tau <threshold> to visit states induced by
// the current learned gate while still querying the oracle for the supervision label.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createAdapter } from "./lib/adapters/index.mjs";
import { filterTasks, loadTaskSuite, parseTaskArgs, summarizeTaskSuite } from "./lib/task_suite.mjs";
import {
  MODEL,
  captureObservation,
  planActions,
  executeAction,
  coarseSignature,
  getCandidates,
  materialDivergence,
  isCheckpoint,
  extractObsFeatures,
  OBS_FEATURES,
  decideObservation,
} from "./lib/agent.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const tasksPath = path.join(repoRoot, "tasks", "tasks.json");
const ROUNDS = Number(process.env.SOA_COLLECT_ROUNDS || 3);
const MAX_STEPS = Number(process.env.SOA_MAX_STEPS || 16);

function parseArg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function buildPolicySpec() {
  const kind = parseArg("--policy", process.env.SOA_COLLECT_POLICY || "always");
  if (kind === "learned") {
    const gatePath = parseArg("--gate", process.env.SOA_GATE);
    if (!gatePath || !fs.existsSync(gatePath)) {
      throw new Error(`Learned collection policy requested, but gate model not found: ${gatePath || "(missing --gate)"}`);
    }
    return {
      label: `learned@${parseArg("--tau", process.env.SOA_GATE_TAU || "0.5")}`,
      kind: "learned",
      tau: Number(parseArg("--tau", process.env.SOA_GATE_TAU || "0.5")),
      gate: JSON.parse(fs.readFileSync(gatePath, "utf-8")),
    };
  }
  if (kind === "handrule" || kind === "never" || kind === "always") return { label: kind, kind };
  throw new Error(`Unsupported collection policy: ${kind}`);
}

async function candidateCount(page) {
  return (await getCandidates(page)).length;
}

async function collectTask(browser, task, round, rolloutSpec) {
  const adapter = await createAdapter(browser, task);
  const page = adapter.page;

  const rows = [];
  let carriedPlan = null;
  let staleIdx = 1;
  let screenChangedLast = true;
  let candidatesChangedLast = true;

  for (let i = 0; i < MAX_STEPS; i += 1) {
    if (await adapter.isSuccess()) break;

    const blindAction = carriedPlan ? carriedPlan[staleIdx] || null : null;
    const features = extractObsFeatures({
      blindAction,
      screenChangedLast,
      candidatesChangedLast,
      stepsSinceObserve: staleIdx,
      remainingPlanLen: carriedPlan ? carriedPlan.length - staleIdx : 0,
    });

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
      rows.push({ task_id: task.task_id, round, step: i, error: String(err) });
      break;
    }
    const verified = plan.actions[0] || null;
    const candidatesNow = await getCandidates(page);
    const label = materialDivergence(blindAction, verified, candidatesNow) ? 1 : 0;
    const decision = decideObservation(rolloutSpec, { blindAction, features });
    const executedAction = decision.observe ? verified : blindAction;

    rows.push({
      task_id: task.task_id,
      benchmark: task.benchmark,
      scenario: task.scenario || "",
      round,
      step: i,
      features,
      label,
      is_checkpoint: isCheckpoint(verified),
      blind_action: blindAction,
      verified_action: verified,
      executed_action: executedAction,
      verbalized_confidence: features.verbalized_confidence,
      rollout_policy: rolloutSpec.label,
      rollout_observed: decision.observe,
      rollout_probability: decision.probability,
      rollout_reason: decision.reason,
      usage: plan.usage,
    });

    if (!executedAction || executedAction.action_type === "done") break;

    const beforeStatus = await adapter.getCoarseStatusText();
    const before = await coarseSignature(page, beforeStatus);
    const beforeCount = await candidateCount(page);
    try {
      await executeAction(page, executedAction);
      await adapter.afterAction();
    } catch (err) {
      rows.push({ task_id: task.task_id, round, step: i, exec_error: String(err), action: executedAction });
      break;
    }
    const afterStatus = await adapter.getCoarseStatusText();
    const after = await coarseSignature(page, afterStatus);
    const afterCount = await candidateCount(page);
    screenChangedLast = before !== after;
    candidatesChangedLast = beforeCount !== afterCount;

    if (decision.observe) {
      carriedPlan = plan.actions;
      staleIdx = 1;
    } else {
      staleIdx += 1;
    }
  }

  await adapter.close();
  return rows;
}

function summarize(rows) {
  const labeled = rows.filter((r) => typeof r.label === "number");
  const pos = labeled.filter((r) => r.label === 1).length;
  const safe = labeled.filter((r) => !r.is_checkpoint);
  const safePos = safe.filter((r) => r.label === 1).length;
  return {
    steps: labeled.length,
    positives: pos,
    positive_rate: labeled.length ? pos / labeled.length : 0,
    safe_steps: safe.length,
    safe_positive_rate: safe.length ? safePos / safe.length : 0,
    errors: rows.filter((r) => r.error || r.exec_error).length,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Export your key before collecting.");
    process.exit(1);
  }
  const outPath = parseArg("--out", path.join(repoRoot, "data", "oracle_steps.jsonl"));
  const taskArgs = parseTaskArgs();
  const suite = loadTaskSuite(taskArgs.suitePath || tasksPath);
  const tasks = filterTasks(suite, taskArgs);
  const suiteSummary = summarizeTaskSuite(suite, tasks);
  if (!tasks.length) {
    throw new Error(`No tasks matched the requested suite/filter options in ${taskArgs.suitePath || tasksPath}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const rolloutSpec = buildPolicySpec();

  const browser = await chromium.launch({ headless: process.env.SOA_HEADFUL !== "1" });
  const allRows = [];
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const task of tasks) {
        process.stderr.write(`collect round ${round} :: ${rolloutSpec.label} :: ${task.task_id}\n`);
        const rows = await collectTask(browser, task, round, rolloutSpec);
        allRows.push(...rows);
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(outPath, allRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
  const summary = summarize(allRows);
  console.log(JSON.stringify({ model: MODEL, out: outPath, features: OBS_FEATURES, rollout_policy: rolloutSpec.label, suite: suiteSummary, summary }, null, 2));
  if (summary.steps && (summary.positive_rate === 0 || summary.positive_rate === 1)) {
    process.stderr.write(
      "\nWARNING: labels are degenerate (all 0 or all 1). The tasks are too easy/hard for the gate to learn anything — add or tune dynamic tasks before training.\n",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
