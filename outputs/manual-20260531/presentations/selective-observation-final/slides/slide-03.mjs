import { STYLE, bg, titleBlock, rect, text, footer, rule } from "./common.mjs";

export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "method",
    "We turned the repo into a benchmark-first selective-observation framework.",
    "The observation gate is the reusable core; environments plug in through adapters."
  );

  rect(slide, ctx, 76, 256, 170, 112, "#E0F2FE", { geometry: "roundRect", stroke: "#7DD3FC" });
  text(slide, ctx, "Task suite\nlocal diagnostic\nor MiniWoB", 98, 286, 130, 58, { fontSize: 19, bold: true, align: "center" });

  rect(slide, ctx, 290, 256, 180, 112, "#ECFCCB", { geometry: "roundRect", stroke: "#A3E635" });
  text(slide, ctx, "Adapter layer\nreset / observe /\nexecute / success", 314, 280, 132, 64, { fontSize: 19, bold: true, align: "center" });

  rect(slide, ctx, 520, 256, 210, 112, "#FEF3C7", { geometry: "roundRect", stroke: "#F59E0B" });
  text(slide, ctx, "Planner\nOpenAI agent plans\nshort action sequences", 544, 280, 162, 64, { fontSize: 18, bold: true, align: "center" });

  rect(slide, ctx, 786, 256, 170, 112, "#D1FAE5", { geometry: "roundRect", stroke: "#34D399" });
  text(slide, ctx, "Observation gate\ncheap features ->\nobserve or coast", 806, 280, 130, 64, { fontSize: 19, bold: true, align: "center" });

  rect(slide, ctx, 1004, 256, 180, 112, "#FCE7F3", { geometry: "roundRect", stroke: "#F472B6" });
  text(slide, ctx, "Evaluator\nsuccess, calls,\ncost, latency, unsafe", 1028, 280, 132, 64, { fontSize: 18, bold: true, align: "center" });

  rule(slide, ctx, 246, 311, 44, STYLE.soft, 2);
  rule(slide, ctx, 470, 311, 50, STYLE.soft, 2);
  rule(slide, ctx, 730, 311, 56, STYLE.soft, 2);
  rule(slide, ctx, 956, 311, 48, STYLE.soft, 2);

  rect(slide, ctx, 76, 430, 520, 188, STYLE.panel, { geometry: "roundRect", stroke: STYLE.line });
  text(slide, ctx, "What changed in the codebase", 100, 454, 300, 24, { fontSize: 16, bold: true });
  text(
    slide,
    ctx,
    "1. Added a generic adapter interface so the same collector/evaluator can drive both the local app and MiniWoB.\n2. Upgraded the gate trainer from logistic-only to logistic-or-MLP auto-selection.\n3. Added task-suite manifests, benchmark metadata, and bootstrap confidence intervals.",
    100,
    494,
    450,
    112,
    { fontSize: 15, color: STYLE.ink },
  );

  rect(slide, ctx, 626, 430, 558, 188, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  text(slide, ctx, "Training loop", 652, 454, 220, 24, { fontSize: 16, bold: true, color: "#FFFFFF" });
  text(
    slide,
    ctx,
    "Round 0: always-observe oracle collection\nRound 1: collect under learned@0.5 (DAgger)\nTrain gate on cheap observation features\nSweep thresholds at evaluation time to trace a cost/success frontier",
    652,
    494,
    484,
    112,
    { fontSize: 15, color: "#E5E7EB" },
  );
  footer(slide, ctx, 3, "Architecture and code contributions");
  return slide;
}
