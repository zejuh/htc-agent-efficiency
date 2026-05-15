import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appUrl = pathToFileURL(path.join(root, "app", "index.html")).href;
const tasks = JSON.parse(fs.readFileSync(path.join(root, "tasks.json"), "utf-8"));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  for (const task of tasks) {
    await page.goto(`${appUrl}?task=${encodeURIComponent(task.task_id)}`);
    const title = await page.locator("h1").textContent();
    if (title !== "HTC Browser Tasks") {
      throw new Error(`Unexpected app title for ${task.task_id}: ${title}`);
    }
    for (const action of task.actions) {
      await page.locator(action.target).first().waitFor({ state: "attached", timeout: 3000 });
    }
  }
  console.log(`Smoke test passed for ${tasks.length} tasks.`);
} finally {
  await context.close();
  await browser.close();
}

