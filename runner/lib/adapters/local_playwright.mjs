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
      // 等待异步 DOM 更新稳定下来，再进行下一次观察。这里覆盖搜索结果、
      // 收件人解析、价格变化和语言选项加载等场景。
      // app.js 会在异步操作开始时设置 document.body.dataset.loading="1"，
      // 完成后删除这个标记。
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(40); // let synchronous side-effects propagate first
      try {
        await page.waitForFunction(() => !document.body.dataset.loading, { timeout: 1600 });
      } catch {
        // timeout 可以接受：继续使用当前已经存在的页面状态。
      }
    },
    async close() {
      await context.close();
    },
  };
}
