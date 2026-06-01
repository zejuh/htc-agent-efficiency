import fs from "node:fs";
import http from "node:http";
import path from "node:path";

let miniwobServer = null;

function html(contentType, body) {
  return { contentType, body };
}

function resolveMiniwobHtmlRoot(task) {
  const candidates = [
    process.env.SOA_MINIWOB_HTML_ROOT,
    task.miniwob_html_root,
    path.resolve(process.cwd(), ".conda311", "lib", "python3.11", "site-packages", "miniwob", "html"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const miniwobDir = path.join(candidate, "miniwob");
    const coreDir = path.join(candidate, "core");
    if (fs.existsSync(miniwobDir) && fs.existsSync(coreDir)) return candidate;
  }
  throw new Error(
    "MiniWoB HTML root not found. Set SOA_MINIWOB_HTML_ROOT or install the MiniWoB package into .conda311.",
  );
}

function safeJoin(root, rel) {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root))) throw new Error(`Path traversal blocked for ${rel}`);
  return full;
}

function getMime(filename) {
  if (filename.endsWith(".html")) return "text/html; charset=utf-8";
  if (filename.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filename.endsWith(".css")) return "text/css; charset=utf-8";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".svg")) return "image/svg+xml";
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function createServerHandler(htmlRoot) {
  return (req, res) => {
    try {
      const reqPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let filePath;
      if (reqPath.startsWith("/core/")) {
        filePath = safeJoin(path.join(htmlRoot, "core"), reqPath.replace("/core/", ""));
      } else if (reqPath.startsWith("/common/")) {
        filePath = safeJoin(path.join(htmlRoot, "common"), reqPath.replace("/common/", ""));
      } else if (reqPath.startsWith("/flight/")) {
        filePath = safeJoin(path.join(htmlRoot, "flight"), reqPath.replace("/flight/", ""));
      } else {
        const rel = reqPath === "/" ? "index.html" : reqPath.slice(1);
        filePath = safeJoin(path.join(htmlRoot, "miniwob"), rel);
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, html("text/plain; charset=utf-8", "Not found"));
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": getMime(filePath) });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, html("text/plain; charset=utf-8", "Server error"));
      res.end(String(err));
    }
  };
}

async function ensureMiniwobServer(task) {
  const htmlRoot = resolveMiniwobHtmlRoot(task);
  if (miniwobServer?.htmlRoot === htmlRoot) return miniwobServer;

  const server = http.createServer(createServerHandler(htmlRoot));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  miniwobServer = {
    htmlRoot,
    server,
    baseUrl: `http://${addr.address}:${addr.port}/`,
  };
  return miniwobServer;
}

const REMOVE_DISPLAY_SCRIPT = `
let __display_ids = ['reward-display', 'click-canvas', 'sync-task-cover'];
let __display_divs = {};
let __query_div_hidden_copy = null;

removeDisplay = function() {
  core.clearTimer();
  document.body.removeEventListener('click', core.canvasDrawClick);

  __query_div_hidden_copy = document.getElementById('query').cloneNode(true);
  document.getElementById('query').innerHTML = '';

  for (i in __display_ids) {
    elem_id = __display_ids[i];
    elem = document.getElementById(elem_id);
    if (!elem) continue;
    elem.remove();
    __display_divs[elem_id] = elem;
  }
};

bringBackDisplay = function() {
  document.getElementById('query').innerHTML = __query_div_hidden_copy.innerHTML;
  for (var elem_id in __display_divs){
    document.body.appendChild(__display_divs[elem_id]);
  }
  core.createDisplay();
};

core.endEpisode_legacy = core.endEpisode;
core.startEpisodeReal_legacy = core.startEpisodeReal;
core.getUtterance_legacy = core.getUtterance;

core.getUtterance = function () {
  bringBackDisplay();
  utterance = core.getUtterance_legacy();
  removeDisplay();
  return utterance;
};

core.endEpisode = function(reward, time_proportional, reason){
  bringBackDisplay();
  core.endEpisode_legacy(reward, time_proportional, reason);
  removeDisplay();
};

core.startEpisodeReal = function() {
  bringBackDisplay();
  core.startEpisodeReal_legacy();
  removeDisplay();
};

removeDisplay();
`;

async function getMiniwobGoal(page) {
  return page.evaluate(() => {
    const response = core.getUtterance();
    return typeof response === "object" ? response.utterance : response;
  });
}

async function getMiniwobInfo(page) {
  const [reward, rawReward, rewardReason, done, episodeId, ready] = await page.evaluate(
    () => [WOB_REWARD_GLOBAL, WOB_RAW_REWARD_GLOBAL, WOB_REWARD_REASON, WOB_DONE_GLOBAL, WOB_EPISODE_ID, WOB_TASK_READY],
  );
  return {
    REWARD_GLOBAL: reward,
    RAW_REWARD_GLOBAL: rawReward,
    REWARD_REASON: rewardReason,
    DONE_GLOBAL: done,
    EPISODE_ID: episodeId,
    TASK_READY: ready,
  };
}

export async function createMiniwobPlaywrightAdapter(browser, task) {
  const { baseUrl } = await ensureMiniwobServer(task);
  const context = await browser.newContext({ viewport: { width: 332, height: 214 } });
  const page = await context.newPage();
  const pageName = task.page_name || `${task.subdomain}.html`;
  await page.goto(`${baseUrl}${pageName}`);
  await page.waitForFunction(() => typeof window.core !== "undefined");
  await page.evaluate(REMOVE_DISPLAY_SCRIPT);
  await page.evaluate(
    ({ seed, episodeMaxTime }) => {
      Math.seedrandom(seed);
      core.EPISODE_MAX_TIME = episodeMaxTime;
      core.startEpisodeReal();
    },
    { seed: Number(task.seed || 7), episodeMaxTime: Number(task.episode_max_time || 20000) },
  );
  await page.waitForFunction(() => window.WOB_TASK_READY === true);

  const adapter = {
    kind: "miniwob_playwright",
    task,
    page,
    goal: await getMiniwobGoal(page),
    latestInfo: await getMiniwobInfo(page),
    async getInstruction() {
      this.goal = await getMiniwobGoal(page);
      return this.goal;
    },
    async getSuccessConditionText() {
      return "Solve the MiniWoB task and terminate with positive reward.";
    },
    async getStatusText() {
      this.goal = await getMiniwobGoal(page);
      return this.goal;
    },
    async getCoarseStatusText() {
      const goal = await this.getStatusText();
      return `${page.url()} :: ${goal}`;
    },
    async afterAction() {
      this.latestInfo = await getMiniwobInfo(page);
    },
    async isSuccess() {
      await this.afterAction();
      return Boolean(this.latestInfo.DONE_GLOBAL && this.latestInfo.RAW_REWARD_GLOBAL > 0);
    },
    async getEvalInfo() {
      await this.afterAction();
      return {
        final_status: await this.getStatusText(),
        reward_reason: this.latestInfo.REWARD_REASON,
        raw_reward: this.latestInfo.RAW_REWARD_GLOBAL,
        done_global: this.latestInfo.DONE_GLOBAL,
      };
    },
    async close() {
      await context.close();
    },
  };

  return adapter;
}
