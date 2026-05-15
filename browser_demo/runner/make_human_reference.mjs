import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const tasks = JSON.parse(fs.readFileSync(path.join(root, "tasks.json"), "utf-8"));
const outPath = path.join(repoRoot, "results", "browser_demo", "human_reference.jsonl");

fs.mkdirSync(path.dirname(outPath), { recursive: true });

function normalizeActionType(kind) {
  if (kind === "fill") return "type";
  return kind;
}

const rows = tasks.map((task) => ({
  task_id: task.task_id,
  benchmark: task.benchmark,
  success: true,
  steps: task.actions.map((action, idx) => ({
    t: idx,
    action_type: normalizeActionType(action.action_type),
    target: action.target,
    text: action.text || "",
    model_call: false,
    latency_ms: 60,
    risk: action.risk || "safe",
    observation_required: Boolean(action.checkpoint),
    metadata: {
      policy: "human_reference",
      may_change_screen: Boolean(action.may_change_screen),
      checkpoint: Boolean(action.checkpoint),
    },
  })),
  metadata: {
    instruction: task.instruction,
    policy: "human_reference",
  },
}));

fs.writeFileSync(outPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf-8");
console.log(`Wrote ${outPath}`);

