import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

let miniwobServer = null;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

function html(contentType, body) {
  return { contentType, body };
}

function resolveResourceDir(root, name) {
  const direct = path.join(root, name);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    const pointer = fs.readFileSync(direct, "utf-8").trim();
    if (pointer && fs.existsSync(pointer) && fs.statSync(pointer).isDirectory()) return pointer;
  }
  return null;
}

function installedMiniwobHtmlRoots() {
  const commands = [
    ["python", ["-c", "import pathlib, miniwob; print(pathlib.Path(miniwob.__file__).resolve().parent / 'html')"]],
    ["py", ["-3", "-c", "import pathlib, miniwob; print(pathlib.Path(miniwob.__file__).resolve().parent / 'html')"]],
  ];
  const roots = [];
  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { encoding: "utf-8", timeout: 3000, windowsHide: true });
    if (result.status === 0) {
      const root = result.stdout.trim();
      if (root && fs.existsSync(root)) roots.push(root);
    }
  }
  return [...new Set(roots)];
}

function resolveMiniwobLayout(task) {
  const candidates = [
    process.env.SOA_MINIWOB_HTML_ROOT,
    task.miniwob_html_root,
    path.join(repoRoot, "external", "miniwob_site"),
    path.resolve(process.cwd(), ".conda311", "lib", "python3.11", "site-packages", "miniwob", "html"),
    ...installedMiniwobHtmlRoots(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    const coreRoot = resolveResourceDir(root, "core");
    const commonRoot = resolveResourceDir(root, "common");
    const flightRoot = resolveResourceDir(root, "flight");

    const officialMiniwobRoot = path.join(root, "miniwob");
    if (fs.existsSync(officialMiniwobRoot) && fs.statSync(officialMiniwobRoot).isDirectory() && coreRoot && commonRoot) {
      return {
        cacheKey: `${officialMiniwobRoot}|${coreRoot}|${commonRoot}|${flightRoot || ""}`,
        miniwobRoot: officialMiniwobRoot,
        coreRoot,
        commonRoot,
        flightRoot,
      };
    }

    const hasFlatHtml = fs.existsSync(path.join(root, `${task.subdomain || "click-button"}.html`));
    if (hasFlatHtml && coreRoot && commonRoot) {
      return {
        cacheKey: `${root}|${coreRoot}|${commonRoot}|${flightRoot || ""}`,
        miniwobRoot: root,
        coreRoot,
        commonRoot,
        flightRoot,
      };
    }
  }
  throw new Error(
    "MiniWoB HTML root not found. Set SOA_MINIWOB_HTML_ROOT to a directory containing miniwob/, core/, and common/. " +
      "A flat mirror is also supported if it contains the task HTML files plus usable core/ and common/ resource directories.",
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

function createServerHandler(layout) {
  return (req, res) => {
    try {
      const reqPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let filePath;
      if (reqPath.startsWith("/core/")) {
        filePath = safeJoin(layout.coreRoot, reqPath.replace("/core/", ""));
      } else if (reqPath.startsWith("/common/")) {
        filePath = safeJoin(layout.commonRoot, reqPath.replace("/common/", ""));
      } else if (reqPath.startsWith("/flight/")) {
        filePath = layout.flightRoot ? safeJoin(layout.flightRoot, reqPath.replace("/flight/", "")) : null;
      } else {
        const rel = reqPath === "/" ? "index.html" : reqPath.slice(1);
        filePath = safeJoin(layout.miniwobRoot, rel);
      }
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
  const layout = resolveMiniwobLayout(task);
  if (miniwobServer?.cacheKey === layout.cacheKey) return miniwobServer;

  const server = http.createServer(createServerHandler(layout));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  const addr = server.address();
  miniwobServer = {
    cacheKey: layout.cacheKey,
    layout,
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
