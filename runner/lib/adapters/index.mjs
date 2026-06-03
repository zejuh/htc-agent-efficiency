import { createLocalPlaywrightAdapter } from "./local_playwright.mjs";

export async function createAdapter(browser, task) {
  const adapter = task.adapter || "local_playwright";
  switch (adapter) {
    case "local_playwright":
      return createLocalPlaywrightAdapter(browser, task);
    default:
      throw new Error(`Unknown adapter: ${adapter} for task ${task.task_id}`);
  }
}
