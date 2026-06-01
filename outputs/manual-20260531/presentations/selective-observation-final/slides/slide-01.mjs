import { STYLE, bg, text, rect, pill, footer, metric } from "./common.mjs";

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  rect(slide, ctx, 0, 0, 1280, 720, STYLE.bg, { stroke: STYLE.bg, strokeWidth: 0 });
  rect(slide, ctx, 58, 58, 8, 72, STYLE.accent, { stroke: STYLE.accent, strokeWidth: 0 });
  text(slide, ctx, "Selective Observation for Browser Agents", 90, 64, 760, 72, {
    fontSize: 34,
    bold: true,
    serif: true,
  });
  text(slide, ctx, "Final project: can a GUI agent skip some expensive re-observations without giving up success or safety?", 92, 148, 700, 46, {
    fontSize: 17,
    color: STYLE.soft,
  });

  pill(slide, ctx, "benchmark-first refactor", 92, 224, 210, STYLE.dark);
  pill(slide, ctx, "local diagnostic suite", 312, 224, 182, STYLE.amber);
  pill(slide, ctx, "MiniWoB external benchmark", 504, 224, 220, STYLE.accent);

  rect(slide, ctx, 92, 286, 660, 300, STYLE.panel, { geometry: "roundRect", stroke: STYLE.line });
  text(slide, ctx, "Project thesis", 116, 310, 220, 22, { fontSize: 16, bold: true });
  text(
    slide,
    ctx,
    "Instead of hard-coding ‘observe every step’, we learn a gate that decides when to pay for another observation. The system now runs on both a local observation-sensitive suite and a recognized external benchmark subset.",
    116,
    344,
    604,
    120,
    { fontSize: 18, color: STYLE.ink },
  );
  metric(slide, ctx, 116, 500, "0.90", "MiniWoB success", "learned@0.8 on curated external benchmark", STYLE.accent);
  metric(slide, ctx, 318, 500, "2.0", "Avg. model calls", "vs 3.0 for always-observe", STYLE.accent);
  metric(slide, ctx, 520, 500, "0", "Unsafe rate", "on the external benchmark headline run", STYLE.accent);

  rect(slide, ctx, 790, 286, 432, 300, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  text(slide, ctx, "Talk map", 822, 314, 160, 22, { fontSize: 16, bold: true, color: "#FFFFFF" });
  text(
    slide,
    ctx,
    "1. Why selective observation matters\n2. Benchmark-first system design\n3. Main external-benchmark result\n4. Why the local suite is a useful negative result\n5. What we would do next",
    822,
    356,
    360,
    186,
    { fontSize: 18, color: "#E5E7EB" },
  );
  text(slide, ctx, "Team photo / names can be inserted on the submitted title slide if needed.", 822, 556, 320, 20, { fontSize: 11, color: "#CBD5E1" });
  footer(slide, ctx, 1, "Research question + headline result");
  return slide;
}
