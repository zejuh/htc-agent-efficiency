// Shared agent primitives used by both the oracle collector and the policy evaluator.
//
// The single most important thing in this file is the OBSERVATION FEATURE CONTRACT
// (OBS_FEATURES + extractObsFeatures). The collector logs these features with an
// oracle label; the Python trainer learns weights over exactly these names; the
// evaluator recomputes the same features live and applies the weights. All three
// must agree, so the feature definition lives here, once.
//
// The model backend is the OpenAI Chat Completions API (structured outputs). The key
// is read from OPENAI_API_KEY. Model via OPENAI_MODEL (default gpt-4o-mini).

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_URL = pathToFileURL(path.join(here, "..", "..", "app", "index.html")).href;

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const OBSERVATION_MODE = process.env.OBSERVATION_MODE || "dom";
export const ACTION_TIMEOUT_MS = Number(process.env.SOA_ACTION_TIMEOUT_MS || 5000);
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const CALL_TIMEOUT_MS = Number(process.env.SOA_CALL_TIMEOUT_MS || 60000);

// USD per 1M tokens (input, output). Cached input tokens billed at ~0.5x input.
export const PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
};

export function costOf(usage, model = MODEL) {
  const price = PRICING[model] || PRICING["gpt-4o-mini"];
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  const cached = usage?.cached_tokens || 0;
  return ((input - cached) * price.input + cached * price.input * 0.5 + output * price.output) / 1_000_000;
}

export function appUrlFor(task) {
  const qs = new URLSearchParams({ task: task.task_id });
  if (task.scenario) qs.set("scenario", task.scenario);
  for (const [key, value] of Object.entries(task.url_params || {})) {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  }
  return `${APP_URL}?${qs.toString()}`;
}

const SYSTEM_PROMPT = `You are a browser GUI agent controlling a browser workspace. You are given the task, the current page status, and the list of currently visible, interactive elements ("candidates"). Plan the next few concrete actions to make progress.

Rules:
- Only use a selector exactly as provided in the candidates. Never invent selectors.
- Use "fill" for text boxes/textareas, "check" for checkboxes, "select" for dropdowns (put the option label in "text"), "click" for buttons/list items, "done" when the success condition is met.
- Use candidate state to detect progress that has already happened: candidate.value for filled inputs, candidate.checked for checkboxes/radios, and candidate.selected_text for dropdowns. If the required value is already present, do not repeat the same form action; move on to the next needed action such as Submit.
- Treat the status text as real workflow state. If the page already says a setup action succeeded or a panel/results view is open (for example "Composer open", "Suggested recipient ready", "Products filtered", "Contact opened", "Selected draft.txt", "Preferences open"), do NOT repeat the opener action that led there. Continue with the next unmet step inside that state.
- Do not repeat the same opener action when its effect is already visible. Examples: after search results are visible, do not click Search again; after a folder is open, do not click Open folder again; after the composer is open, do not click Compose again.
- When a task requires acting on a selected item first (such as renaming a file), select the item before filling or submitting any dependent form fields.
- If a value is still loading or resolving, wait by planning no repeated opener clicks; resume once the status/value indicates readiness.
- Do not emit "done" merely because an intermediate field is filled or an option is selected. If the instruction says to Submit/Save/Send and that button is still visible, include that action unless the task is already visibly complete.
- Set "checkpoint": true and an appropriate "risk" when the action submits, sends, saves, renames, deletes, or checks out (externally visible or hard to reverse). Use "external" for send/checkout/submit, "irreversible" for delete/rename, "state_changing" for save/toggle, otherwise "safe".
- For EACH action also report "confidence" in [0,1] that the action is correct given ONLY what you can currently see, and "needs_observation": true if you would want to look at the page again before doing it (e.g. a value may still be loading or may have changed).
- Return the shortest correct sequence from the CURRENT state. Base every action on the candidates you can currently see; do not guess values that are still resolving.`;

const ACTION_SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action_type: { type: "string", enum: ["click", "fill", "check", "select", "done"] },
          selector: { type: "string" },
          text: { type: "string" },
          risk: { type: "string", enum: ["safe", "state_changing", "irreversible", "external"] },
          checkpoint: { type: "boolean" },
          confidence: { type: "number" },
          needs_observation: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["action_type", "selector", "text", "risk", "checkpoint", "confidence", "needs_observation", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

const RISKY_SELECTOR = /(send|checkout|save|rename|delete|submit|publish|confirm)/i;

export function isCheckpoint(action) {
  if (!action) return false;
  return (
    Boolean(action.checkpoint) ||
    action.risk === "external" ||
    action.risk === "irreversible" ||
    RISKY_SELECTOR.test(action.selector || "")
  );
}

export function isIrreversibleOrExternal(action) {
  if (!action) return false;
  return action.risk === "external" || action.risk === "irreversible" || RISKY_SELECTOR.test(action.selector || "");
}

export function sameAction(a, b) {
  if (!a || !b) return false;
  return a.action_type === b.action_type && (a.selector || "") === (b.selector || "") && (a.text || "") === (b.text || "");
}

// Is this text taken FROM the page (a field value or dropdown option) rather than
// freely composed by the model? Free-form text (an email body, a search phrase) is
// nondeterministic and should not count as a divergence; a page-derived value (the
// resolved recipient, a selected option) should.
export function isPageDerived(text, candidates) {
  const t = (text || "").trim().toLowerCase();
  if (t.length < 2) return false;
  return candidates.some(
    (c) =>
      (c.value && c.value.trim().toLowerCase() === t) ||
      (c.options || []).some((o) => o.trim().toLowerCase() === t),
  );
}

// Material divergence between the coasted action and the verified action: a different
// control or action kind always counts; a text difference counts only for page-derived
// values. This is the oracle label "would observing here have changed my action?".
export function materialDivergence(blind, verified, candidates) {
  if (!blind || !verified) return true;
  if (blind.action_type !== verified.action_type) return true;
  if ((blind.selector || "") !== (verified.selector || "")) return true;
  if (verified.text && isPageDerived(verified.text, candidates)) {
    return (blind.text || "") !== (verified.text || "");
  }
  return false;
}

export function normalizeActionType(kind) {
  return kind === "fill" ? "type" : kind;
}

export async function getCandidates(page) {
  return page.evaluate(() => {
    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }
    function labelTextFor(el) {
      const own = el.getAttribute("aria-label") || "";
      if (own.trim()) return own.trim();
      const wrapped = el.closest("label");
      if (wrapped) {
        const wrappedText = (wrapped.innerText || "").trim();
        if (wrappedText) return wrappedText;
      }
      if (el.id) {
        const explicit = document.querySelector(`label[for='${CSS.escape(el.id)}']`);
        const explicitText = (explicit?.innerText || "").trim();
        if (explicitText) return explicitText;
      }
      return "";
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
    return [...document.querySelectorAll("button,input,textarea,select,a,.alink,[role='button'],[data-contact],[data-file],[onclick]")]
      .filter((el) => visible(el) && !el.disabled)
      .map((el) => {
        const selectedText =
          el.tagName === "SELECT" && el.selectedIndex >= 0 ? (el.options[el.selectedIndex]?.textContent || "").trim() : "";
        return {
          selector: selectorFor(el),
          role: roleFor(el),
          label: (el.innerText || labelTextFor(el) || el.value || el.getAttribute("aria-label") || el.name || el.id || "").trim(),
          value: el.value || "",
          checked: Boolean(el.checked),
          selected_text: selectedText,
          options: el.tagName === "SELECT" ? [...el.options].map((o) => o.textContent.trim()) : [],
        };
      });
  });
}

// Coarse "did the screen change" signal: adapter-provided status text + the SET of
// selectors only. It is intentionally blind to field values.
export async function coarseSignature(page, statusText) {
  const candidates = await getCandidates(page);
  const selectors = candidates.map((c) => c.selector).sort().join("|");
  return `${statusText}::${selectors}`;
}

export async function executeAction(page, action) {
  if (!action || action.action_type === "done" || !action.selector) return;
  const target = page.locator(action.selector).first();
  const opts = { timeout: ACTION_TIMEOUT_MS };
  if (action.action_type === "click") await target.click(opts);
  else if (action.action_type === "fill") await target.fill(action.text || "", opts);
  else if (action.action_type === "check") await target.check(opts);
  else if (action.action_type === "select") await target.selectOption({ label: action.text }, opts);
  else throw new Error(`Unsupported action type: ${action.action_type}`);
}

function buildMessages(task, status, candidates, screenshotB64) {
  const payload = {
    task: task.instruction,
    success_status: task.success_status,
    benchmark: task.benchmark || "custom",
    task_family: task.family || "",
    task_tags: task.tags || [],
    current_status: status,
    observation_mode: OBSERVATION_MODE,
    visible_candidates: candidates,
  };
  const userParts = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
  if (screenshotB64) {
    userParts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${screenshotB64}` } });
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts },
  ];
}

function parsePlan(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON object in model response: ${text}`);
    return JSON.parse(match[0]);
  }
}

function candidateBySelector(candidates, selector) {
  return candidates.find((candidate) => candidate.selector === selector) || null;
}

function isNoOpAction(action, candidates) {
  if (!action || !action.selector) return false;
  const candidate = candidateBySelector(candidates, action.selector);
  if (!candidate) return false;
  if (action.action_type === "fill") {
    return String(candidate.value || "").trim() === String(action.text || "").trim();
  }
  if (action.action_type === "check") {
    return Boolean(candidate.checked);
  }
  if (action.action_type === "select") {
    return String(candidate.selected_text || "").trim() === String(action.text || "").trim();
  }
  return false;
}

function normalizePlannedActions(actions, candidates) {
  const kept = [];
  for (const action of actions || []) {
    if (!kept.length && isNoOpAction(action, candidates)) continue;
    kept.push(action);
  }
  return kept;
}

async function callOpenAI(messages) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 1024,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "action_plan", strict: true, schema: ACTION_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function captureObservation(page, adapter) {
  const status = await adapter.getStatusText();
  const candidates = await getCandidates(page);
  let screenshotB64;
  if (OBSERVATION_MODE === "screenshot_dom") {
    const shot = await page.screenshot({ type: "png", fullPage: false });
    screenshotB64 = shot.toString("base64");
  }
  return { status, candidates, screenshotB64 };
}

// One model call: observe the current page, return a short plan of actions.
export async function planActions(task, observation) {
  const t0 = performance.now();
  const data = await callOpenAI(buildMessages(task, observation.status, observation.candidates, observation.screenshotB64));
  const latency_ms = performance.now() - t0;
  const text = data.choices?.[0]?.message?.content || "{}";
  const parsed = parsePlan(text);
  const u = data.usage || {};
  const usage = {
    input_tokens: u.prompt_tokens || 0,
    output_tokens: u.completion_tokens || 0,
    cached_tokens: u.prompt_tokens_details?.cached_tokens || 0,
  };
  return { actions: normalizePlannedActions(parsed.actions || [], observation.candidates || []), usage, latency_ms };
}

// ----- Observation feature contract -----------------------------------------

export const OBS_FEATURES = [
  "bias",
  "no_plan",
  "screen_changed_last",
  "candidates_changed_last",
  "steps_since_observe",
  "remaining_plan_len",
  "next_is_click",
  "next_is_fill",
  "next_is_check",
  "next_is_select",
  "next_risk_state_changing",
  "next_risk_external",
  "next_risk_irreversible",
  "verbalized_confidence",
  "verbalized_needs_observation",
];

// ctx: { blindAction, screenChangedLast, candidatesChangedLast, stepsSinceObserve, remainingPlanLen }
export function extractObsFeatures(ctx) {
  const a = ctx.blindAction || null;
  const conf = a && typeof a.confidence === "number" ? Math.max(0, Math.min(1, a.confidence)) : a ? 0.5 : 0.0;
  return {
    bias: 1.0,
    no_plan: a ? 0.0 : 1.0,
    screen_changed_last: ctx.screenChangedLast ? 1.0 : 0.0,
    candidates_changed_last: ctx.candidatesChangedLast ? 1.0 : 0.0,
    steps_since_observe: Math.min(ctx.stepsSinceObserve || 0, 10) / 10.0,
    remaining_plan_len: Math.min(ctx.remainingPlanLen || 0, 8) / 8.0,
    next_is_click: a && a.action_type === "click" ? 1.0 : 0.0,
    next_is_fill: a && a.action_type === "fill" ? 1.0 : 0.0,
    next_is_check: a && a.action_type === "check" ? 1.0 : 0.0,
    next_is_select: a && a.action_type === "select" ? 1.0 : 0.0,
    next_risk_state_changing: a && a.risk === "state_changing" ? 1.0 : 0.0,
    next_risk_external: a && a.risk === "external" ? 1.0 : 0.0,
    next_risk_irreversible: a && a.risk === "irreversible" ? 1.0 : 0.0,
    verbalized_confidence: conf,
    verbalized_needs_observation: a && a.needs_observation ? 1.0 : 0.0,
  };
}

function sigmoid(x) {
  if (x >= 0) return 1.0 / (1.0 + Math.exp(-x));
  const z = Math.exp(x);
  return z / (1.0 + z);
}

function relu(x) {
  return x > 0 ? x : 0;
}

// Evaluate a gate exported by soa.gate. The default is a logistic baseline; newer
// runs may export an MLP gate with one hidden layer.
export function gateProbability(gateModel, features) {
  const names = gateModel.features || OBS_FEATURES;
  if (gateModel.model_type === "mlp") {
    const x = names.map((name) => features[name] || 0);
    const hidden = (gateModel.hidden_weights || []).map((row, i) => {
      const bias = (gateModel.hidden_bias || [])[i] || 0;
      let score = bias;
      for (let j = 0; j < x.length; j += 1) score += (row[j] || 0) * x[j];
      return relu(score);
    });
    let out = gateModel.output_bias || 0;
    for (let i = 0; i < hidden.length; i += 1) out += ((gateModel.output_weights || [])[i] || 0) * hidden[i];
    return sigmoid(out);
  }
  const weights = gateModel.weights || {};
  let score = 0;
  for (const name of names) score += (weights[name] || 0) * (features[name] || 0);
  return sigmoid(score);
}

export function decideObservation(policySpec, { blindAction, features }) {
  if (!blindAction) return { observe: true, probability: 1.0, reason: "no_plan" };
  switch (policySpec.kind) {
    case "always":
      return { observe: true, probability: 1.0, reason: "always" };
    case "never":
      return { observe: false, probability: 0.0, reason: "never" };
    case "handrule":
      return {
        observe: Boolean(features.screen_changed_last) || isCheckpoint(blindAction),
        probability: null,
        reason: "handrule",
      };
    case "learned": {
      const probability = gateProbability(policySpec.gate, features);
      return {
        observe: probability >= policySpec.tau,
        probability,
        reason: "learned",
      };
    }
    default:
      return { observe: true, probability: 1.0, reason: "fallback" };
  }
}
