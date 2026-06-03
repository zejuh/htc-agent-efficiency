import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadTaskSuite, filterTasks } from "../runner/lib/task_suite.mjs";
import {
  captureObservation,
  planActions,
  executeAction,
  coarseSignature,
  getCandidates,
  extractObsFeatures,
  decideObservation,
  isCheckpoint,
  costOf,
} from "../runner/lib/agent.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const tasksPath = path.join(repoRoot, "tasks", "tasks.json");

function parseArg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function buildPolicySpec() {
  const kind = parseArg("--policy", "always");
  if (kind === "learned") {
    const gatePath = parseArg("--gate");
    if (!gatePath || !fs.existsSync(gatePath)) {
      throw new Error(`Learned demo policy requested, but gate model not found: ${gatePath || "(missing --gate)"}`);
    }
    return {
      label: `learned@${parseArg("--tau", "0.5")}`,
      kind: "learned",
      tau: Number(parseArg("--tau", "0.5")),
      gate: JSON.parse(fs.readFileSync(gatePath, "utf-8")),
    };
  }
  if (kind === "always" || kind === "never" || kind === "handrule") return { label: kind, kind };
  throw new Error(`Unsupported policy: ${kind}`);
}

function pickTask(taskId) {
  const suite = loadTaskSuite(tasksPath);
  const tasks = filterTasks(suite, { taskIds: taskId });
  if (!tasks.length) throw new Error(`No task found for ${taskId}`);
  return tasks[0];
}

async function candidateCount(page) {
  return (await getCandidates(page)).length;
}

async function createRecordedAdapter(browser, task, videoDir) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 900 },
    },
  });
  const page = await context.newPage();
  const { appUrlFor } = await import("../runner/lib/agent.mjs");
  await page.goto(appUrlFor(task));
  return {
    kind: "local_playwright",
    task,
    page,
    async getInstruction() {
      return task.instruction;
    },
    async getSuccessConditionText() {
      return `Reach status: ${task.success_status}`;
    },
    async getStatusText() {
      return (await page.locator("#status").textContent()) || "";
    },
    async getCoarseStatusText() {
      return this.getStatusText();
    },
    async isSuccess() {
      return (await this.getStatusText()) === task.success_status;
    },
    async getEvalInfo() {
      return { final_status: await this.getStatusText() };
    },
    async afterAction() {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(250);
      try {
        await page.waitForFunction(() => !document.body.dataset.loading, { timeout: 1800 });
      } catch {
        // Keep recording whatever state is visible.
      }
      await sleep(350);
    },
    async close() {
      await context.close();
    },
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const taskId = parseArg("--task");
  if (!taskId) throw new Error("Pass --task <task_id>.");

  const policySpec = buildPolicySpec();
  const outDir = path.resolve(parseArg("--out-dir", path.join(repoRoot, "results", "videos")));
  const maxSteps = Number(parseArg("--max-steps", "16"));
  const task = pickTask(taskId);
  const runDir = path.join(outDir, `${task.task_id}__${policySpec.label.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const adapter = await createRecordedAdapter(browser, task, runDir);
  const page = adapter.page;

  const trace = [];
  let carriedPlan = null;
  let idx = 1;
  let screenChangedLast = true;
  let candidatesChangedLast = true;
  let modelCalls = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let success = false;
  let errored = false;

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (await adapter.isSuccess()) break;

      const blindAction = carriedPlan ? carriedPlan[idx] || null : null;
      const features = extractObsFeatures({
        blindAction,
        screenChangedLast,
        candidatesChangedLast,
        stepsSinceObserve: idx,
        remainingPlanLen: carriedPlan ? carriedPlan.length - idx : 0,
      });
      const decision = decideObservation(policySpec, { blindAction, features });

      let plan = null;
      let action = blindAction;
      let observationStatus = null;
      if (decision.observe) {
        const runtimeTask = {
          ...task,
          instruction: await adapter.getInstruction(),
          success_status: await adapter.getSuccessConditionText(),
        };
        const observation = await captureObservation(page, adapter);
        observationStatus = observation.status;
        plan = await planActions(runtimeTask, observation);
        modelCalls += 1;
        totalLatency += plan.latency_ms;
        totalCost += costOf(plan.usage);
        carriedPlan = plan.actions;
        idx = 1;
        action = plan.actions[0] || null;
      }

      if (!action || action.action_type === "done") {
        trace.push({
          step,
          observe: decision.observe,
          decision_reason: decision.reason,
          probability: decision.probability,
          observation_status: observationStatus,
          action,
          final_status: await adapter.getStatusText(),
        });
        break;
      }

      const beforeStatus = await adapter.getStatusText();
      const beforeCoarse = await adapter.getCoarseStatusText();
      const beforeSig = await coarseSignature(page, beforeCoarse);
      const beforeCount = await candidateCount(page);

      try {
        await executeAction(page, action);
        await adapter.afterAction();
      } catch (err) {
        errored = true;
        trace.push({
          step,
          observe: decision.observe,
          decision_reason: decision.reason,
          probability: decision.probability,
          observation_status: observationStatus,
          action,
          before_status: beforeStatus,
          error: String(err),
        });
        break;
      }

      const afterStatus = await adapter.getStatusText();
      const afterCoarse = await adapter.getCoarseStatusText();
      const afterSig = await coarseSignature(page, afterCoarse);
      const afterCount = await candidateCount(page);
      screenChangedLast = beforeSig !== afterSig;
      candidatesChangedLast = beforeCount !== afterCount;

      trace.push({
        step,
        observe: decision.observe,
        decision_reason: decision.reason,
        probability: decision.probability,
        observation_status: observationStatus,
        before_status: beforeStatus,
        after_status: afterStatus,
        action,
        checkpoint: isCheckpoint(action),
        features,
        plan_actions: plan?.actions || null,
      });

      if (!decision.observe) idx += 1;
    }

    success = await adapter.isSuccess();
  } finally {
    const video = await page.video()?.path();
    const finalStatus = await adapter.getStatusText();
    await adapter.close();
    await browser.close();

    const payload = {
      task_id: task.task_id,
      policy: policySpec.label,
      success,
      errored,
      model_calls: modelCalls,
      total_latency_ms: totalLatency,
      total_cost_usd: totalCost,
      final_status: finalStatus,
      video_path: video,
      trace,
    };
    fs.writeFileSync(path.join(runDir, "trace.json"), JSON.stringify(payload, null, 2) + "\n", "utf-8");
    console.log(JSON.stringify(payload, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
