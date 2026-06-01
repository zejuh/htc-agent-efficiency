import fs from "node:fs";
import path from "node:path";

export function parseTaskArgs(argv = process.argv) {
  function get(flag, fallback = undefined) {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : fallback;
  }

  return {
    suitePath: get("--suite"),
    benchmark: get("--benchmark"),
    family: get("--family"),
    difficulty: get("--difficulty"),
    tags: get("--tags"),
    taskIds: get("--task-ids"),
    maxTasks: get("--max-tasks"),
  };
}

export function loadTaskSuite(suitePath) {
  const raw = JSON.parse(fs.readFileSync(suitePath, "utf-8"));
  if (Array.isArray(raw)) {
    return {
      suite_id: path.basename(suitePath, path.extname(suitePath)),
      description: "Legacy task list",
      source_type: "legacy",
      tasks: raw,
    };
  }
  return {
    suite_id: raw.suite_id || path.basename(suitePath, path.extname(suitePath)),
    description: raw.description || "",
    source_type: raw.source_type || "custom",
    recommended_use: raw.recommended_use || "",
    benchmark_alignment: raw.benchmark_alignment || [],
    tasks: raw.tasks || [],
  };
}

export function filterTasks(suite, opts = {}) {
  const wantedIds = opts.taskIds ? new Set(String(opts.taskIds).split(",").map((s) => s.trim()).filter(Boolean)) : null;
  const wantedTags = opts.tags ? String(opts.tags).split(",").map((s) => s.trim()).filter(Boolean) : [];
  let tasks = suite.tasks.filter((task) => {
    if (opts.benchmark && task.benchmark !== opts.benchmark) return false;
    if (opts.family && task.family !== opts.family) return false;
    if (opts.difficulty && task.difficulty !== opts.difficulty) return false;
    if (wantedIds && !wantedIds.has(task.task_id)) return false;
    if (wantedTags.length && !wantedTags.every((tag) => (task.tags || []).includes(tag))) return false;
    return true;
  });
  if (opts.maxTasks) tasks = tasks.slice(0, Number(opts.maxTasks));
  return tasks;
}

export function summarizeTaskSuite(suite, tasks) {
  function countsBy(field) {
    const counts = {};
    for (const task of tasks) {
      const key = task[field] || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  return {
    suite_id: suite.suite_id,
    description: suite.description,
    source_type: suite.source_type,
    recommended_use: suite.recommended_use,
    n_tasks: tasks.length,
    by_family: countsBy("family"),
    by_difficulty: countsBy("difficulty"),
    by_benchmark: countsBy("benchmark"),
  };
}
