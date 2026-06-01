import { appUrlFor } from "../agent.mjs";

export async function createLocalPlaywrightAdapter(browser, task) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
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
      // Wait for any async DOM update (search results, recipient resolution,
      // price changes, language options) to settle before the next observation.
      // app.js sets document.body.dataset.loading="1" at the start of each
      // async operation and deletes it when done.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(40); // let synchronous side-effects propagate first
      try {
        await page.waitForFunction(() => !document.body.dataset.loading, { timeout: 1600 });
      } catch {
        // timeout is acceptable — continue with whatever state is present
      }
    },
    async close() {
      await context.close();
    },
  };
}
