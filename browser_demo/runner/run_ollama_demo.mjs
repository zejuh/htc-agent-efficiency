import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const appUrl = pathToFileURL(path.join(root, "app", "index.html")).href;
const tasks = JSON.parse(fs.readFileSync(path.join(root, "tasks.json"), "utf-8"));
const outRoot = path.join(repoRoot, "results", "browser_demo");
const model = process.env.OLLAMA_MODEL || process.argv[2] || "qwen3.5:latest";
const observationMode = process.env.OLLAMA_OBSERVATION_MODE || process.argv[3] || "dom";
const maxSteps = Number(process.env.OLLAMA_MAX_STEPS || 10);
const callTimeoutMs = Number(process.env.OLLAMA_CALL_TIMEOUT_MS || 300000);
const allowedObservationModes = new Set(["dom", "screenshot_dom", "screenshot"]);

if (!allowedObservationModes.has(observationMode)) {
  throw new Error(`Unsupported OLLAMA_OBSERVATION_MODE=${observationMode}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/:/g, "-");
}

function runTag() {
  return `${safeName(model)}_${safeName(observationMode)}`;
}

function usesScreenshot() {
  return observationMode === "screenshot_dom" || observationMode === "screenshot";
}

async function queryOllama(messages) {
  const started = performance.now();
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      format: "json",
      options: { temperature: 0 },
      messages,
    }),
    signal: AbortSignal.timeout(callTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }
  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const payload = JSON.parse(line);
      content += payload.message?.content || "";
    }
  }
  buffered += decoder.decode();
  if (buffered.trim()) {
    const payload = JSON.parse(buffered);
    content += payload.message?.content || "";
  }
  return {
    content,
    latency_ms: performance.now() - started,
  };
}

function parseAction(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON object in model response: ${content}`);
    return JSON.parse(match[0]);
  }
}

async function getCandidates(page) {
  return page.evaluate(() => {
    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }
    function selectorFor(el) {
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.dataset.contact) return `[data-contact='${el.dataset.contact.replace(/'/g, "\\'")}']`;
      if (el.dataset.file) return `[data-file='${el.dataset.file.replace(/'/g, "\\'")}']`;
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
      if (text) return `text=${text}`;
      return el.tagName.toLowerCase();
    }
    function roleFor(el) {
      if (el.tagName === "BUTTON") return "button";
      if (el.tagName === "TEXTAREA") return "textarea";
      if (el.tagName === "SELECT") return "select";
      if (el.tagName === "INPUT") return el.type || "input";
      return el.tagName.toLowerCase();
    }
    return [...document.querySelectorAll("button,input,textarea,select")]
      .filter((el) => visible(el) && !el.disabled)
      .map((el) => ({
        selector: selectorFor(el),
        role: roleFor(el),
        label: (el.innerText || el.value || el.getAttribute("aria-label") || el.name || el.id || "").trim(),
        value: el.value || "",
        checked: Boolean(el.checked),
        options: el.tagName === "SELECT" ? [...el.options].map((o) => o.textContent.trim()) : [],
      }));
  });
}

function normalizeActionType(kind) {
  if (kind === "fill") return "type";
  return kind || "unknown";
}

async function executeModelAction(page, action) {
  const selector = action.selector;
  if (!selector || action.action_type === "done") return;
  if (action.action_type === "click") {
    await page.locator(selector).first().click();
  } else if (action.action_type === "fill") {
    await page.locator(selector).first().fill(action.text || "");
  } else if (action.action_type === "check") {
    await page.locator(selector).first().check();
  } else if (action.action_type === "select") {
    await page.locator(selector).first().selectOption({ label: action.text });
  } else {
    throw new Error(`Unsupported model action: ${JSON.stringify(action)}`);
  }
}

async function executeScreenshotAction(page, action) {
  if (action.action_type === "done") return;
  if (action.action_type === "click_xy") {
    await page.mouse.click(Number(action.x), Number(action.y));
  } else if (action.action_type === "fill_focused") {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(action.text || "");
  } else if (action.action_type === "press") {
    await page.keyboard.press(action.text || "Enter");
  } else {
    throw new Error(`Unsupported screenshot action: ${JSON.stringify(action)}`);
  }
}

function systemPrompt() {
  if (observationMode === "screenshot") {
    return `You are a browser GUI agent using a screenshot. Choose exactly one next action.
Return only JSON with this schema:
{"action_type":"click_xy|fill_focused|press|done","x":0,"y":0,"text":"text for fill_focused/press or empty","reason":"short reason"}
Use click_xy for buttons, fields, checkboxes, dropdowns, and list items. Use fill_focused only after a text field is focused. Use press for keyboard keys such as Enter.`;
  }
  return `You are a browser GUI agent. Choose exactly one next action from the visible candidates.
Return only JSON with this schema:
{"action_type":"click|fill|check|select|done","selector":"candidate selector or empty","text":"text for fill/select or empty","reason":"short reason"}
Use fill for text boxes and textareas. Use check for checkboxes. Use select for dropdowns. Use click for buttons/list items.
Do not invent selectors. Use one selector exactly as provided.`;
}

function userPrompt(task, status, candidates, history) {
  const payload = {
    task: task.instruction,
    success_status: task.success_status,
    current_status: status,
    observation_mode: observationMode,
    recent_actions: history.slice(-6),
    task_hints: {
      email_for_alice: "alice@example.com",
      email_subject: "Project update",
      email_body: "The project demo is ready for review.",
      rename_target: "final.txt",
      search_terms: {
        shop: "notebook",
        contact: "Jordan",
      },
    },
  };
  if (observationMode !== "screenshot") {
    payload.visible_candidates = candidates;
  }
  return JSON.stringify(
    payload,
    null,
    2,
  );
}

async function runTask(browser, task) {
  const videoDir = path.join(outRoot, "videos", "_tmp_ollama");
  ensureDir(videoDir);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const steps = [];
  const history = [];
  await page.goto(`${appUrl}?task=${encodeURIComponent(task.task_id)}`);

  for (let i = 0; i < maxSteps; i += 1) {
    const status = await page.locator("#status").textContent();
    if (status === task.success_status) break;
    const candidates = await getCandidates(page);
    const userMessage = { role: "user", content: userPrompt(task, status, candidates, history) };
    if (usesScreenshot()) {
      const screenshot = await page.screenshot({ type: "png", fullPage: false });
      userMessage.images = [screenshot.toString("base64")];
    }
    let content;
    let latency_ms;
    try {
      const result = await queryOllama([
        { role: "system", content: systemPrompt() },
        userMessage,
      ]);
      content = result.content;
      latency_ms = result.latency_ms;
    } catch (err) {
      steps.push({
        t: steps.length,
        action_type: "error",
        target: "ollama",
        model_call: true,
        latency_ms: callTimeoutMs,
        risk: "safe",
        metadata: {
          policy: "ollama",
          model,
          observation_mode: observationMode,
          error: String(err),
          call_timeout_ms: callTimeoutMs,
        },
      });
      break;
    }
    let action;
    try {
      action = parseAction(content);
    } catch (err) {
      steps.push({
        t: steps.length,
        action_type: "think",
        target: "ollama",
        model_call: true,
        latency_ms,
        risk: "safe",
        metadata: { policy: "ollama", model, observation_mode: observationMode, parse_error: String(err), raw_response: content },
      });
      break;
    }
    steps.push({
      t: steps.length,
      action_type: "think",
      target: action.selector || "done",
      text: action.text || "",
      model_call: true,
      latency_ms,
      risk: "safe",
      metadata: { policy: "ollama", model, observation_mode: observationMode, raw_response: content, reason: action.reason || "" },
    });
    history.push(action);
    if (action.action_type === "done") break;

    const started = performance.now();
    try {
      if (observationMode === "screenshot") {
        await executeScreenshotAction(page, action);
      } else {
        await executeModelAction(page, action);
      }
      steps.push({
        t: steps.length,
        action_type: normalizeActionType(action.action_type),
        target: action.selector || "",
        text: action.text || "",
        model_call: false,
        latency_ms: performance.now() - started,
        risk: "safe",
        metadata: { policy: "ollama", model, observation_mode: observationMode },
      });
    } catch (err) {
      steps.push({
        t: steps.length,
        action_type: "error",
        target: action.selector || "",
        text: action.text || "",
        model_call: false,
        latency_ms: performance.now() - started,
        risk: "safe",
        metadata: { policy: "ollama", model, observation_mode: observationMode, error: String(err) },
      });
      break;
    }
  }

  const finalStatus = await page.locator("#status").textContent();
  const trajectory = {
    task_id: task.task_id,
    benchmark: task.benchmark,
    success: finalStatus === task.success_status,
    steps,
    metadata: {
      instruction: task.instruction,
      policy: "ollama",
      model,
      observation_mode: observationMode,
      final_status: finalStatus,
    },
  };
  await context.close();
  if (video) {
    const rawVideoPath = await video.path();
    const namedVideoPath = path.join(outRoot, "videos", `ollama_${runTag()}_${task.task_id}.webm`);
    fs.rmSync(namedVideoPath, { force: true });
    fs.renameSync(rawVideoPath, namedVideoPath);
    trajectory.metadata.video_path = namedVideoPath;
  }
  return trajectory;
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf-8");
}

function aggregate(rows) {
  const avg = (fn) => rows.reduce((acc, row) => acc + fn(row), 0) / rows.length;
  return {
    model,
    observation_mode: observationMode,
    n: rows.length,
    success_rate: avg((row) => (row.success ? 1 : 0)),
    avg_model_calls: avg((row) => row.steps.filter((step) => step.model_call).length),
    avg_executable_actions: avg((row) => row.steps.filter((step) => !["observe", "think", "reflect", "plan", "macro", "error"].includes(step.action_type)).length),
    avg_latency_ms: avg((row) => row.steps.reduce((acc, step) => acc + step.latency_ms, 0)),
  };
}

async function main() {
  ensureDir(outRoot);
  ensureDir(path.join(outRoot, "videos"));
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const task of tasks) {
      rows.push(await runTask(browser, task));
    }
  } finally {
    await browser.close();
  }
  writeJsonl(path.join(outRoot, "ollama_trajectories.jsonl"), rows);
  fs.writeFileSync(path.join(outRoot, "ollama_summary.json"), JSON.stringify(aggregate(rows), null, 2) + "\n", "utf-8");
  writeJsonl(path.join(outRoot, `ollama_${runTag()}_trajectories.jsonl`), rows);
  fs.writeFileSync(path.join(outRoot, `ollama_${runTag()}_summary.json`), JSON.stringify(aggregate(rows), null, 2) + "\n", "utf-8");
  console.log(JSON.stringify(aggregate(rows), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
