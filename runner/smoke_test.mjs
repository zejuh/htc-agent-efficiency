// 不调用 API 的基本检查：确认所选任务集里的每个任务都能通过适配器加载。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createAdapter } from "./lib/adapters/index.mjs";
import { filterTasks, loadTaskSuite, parseTaskArgs, summarizeTaskSuite } from "./lib/task_suite.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tasksPath = path.join(here, "..", "tasks", "tasks.json");
const taskArgs = parseTaskArgs();
const suite = loadTaskSuite(taskArgs.suitePath || tasksPath);
const tasks = filterTasks(suite, taskArgs);
const suiteSummary = summarizeTaskSuite(suite, tasks);
if (!tasks.length) throw new Error(`No tasks matched the requested suite/filter options in ${taskArgs.suitePath || tasksPath}`);

const browser = await chromium.launch({ headless: true });
try {
  for (const task of tasks) {
    const adapter = await createAdapter(browser, task);
    try {
      const instruction = await adapter.getInstruction();
      if (!instruction || !String(instruction).trim()) {
        throw new Error(`Missing instruction for ${task.task_id}`);
      }
      await adapter.getStatusText();
      await adapter.getCoarseStatusText();
      await adapter.getEvalInfo();
    } finally {
      await adapter.close();
    }
  }
  console.log(`Smoke test passed for ${tasks.length} tasks in suite ${suiteSummary.suite_id}.`);
} finally {
  await browser.close();
}
