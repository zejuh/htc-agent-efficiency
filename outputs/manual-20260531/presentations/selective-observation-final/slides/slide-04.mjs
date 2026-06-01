import { STYLE, bg, titleBlock, card, footer, bullets, rect, text } from "./common.mjs";

export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "benchmarks",
    "We intentionally separate a diagnostic suite from the external benchmark.",
    "That gives us one environment for controlled stress tests and one environment for credibility."
  );

  card(slide, ctx, 58, 246, 548, 360, {
    title: "Local diagnostic suite (17 tasks)",
    body:
      "Purpose: controlled observation-sensitive stress testing\nFamilies: static baseline, async results, value drift, delayed options\nWhy it is useful: we can manufacture hard cases where coarse screen change misses the real state shift\nExample tasks: async contact resolution, notebook price drift, delayed language options",
    bodySize: 15,
  });
  bullets(
    slide,
    ctx,
    ["5 static baselines", "4 async result tasks", "5 value-drift tasks", "3 delayed-option tasks"],
    86,
    430,
    470,
    42,
    { fontSize: 14, bulletFill: STYLE.amber },
  );

  rect(slide, ctx, 638, 246, 584, 360, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  text(slide, ctx, "MiniWoB curated external benchmark (10 instances)", 666, 272, 430, 26, { fontSize: 16, bold: true, color: "#FFFFFF" });
  text(
    slide,
    ctx,
    "Purpose: show that the same observation-policy core runs on a recognized community benchmark.\n\nCurated tasks:\nclick-button\nfocus-text\nclick-option\nclick-checkboxes\nclick-button-sequence\n\nWe duplicated selected tasks with two seeds to make the subset slightly less fragile.",
    666,
    314,
    504,
    192,
    { fontSize: 15, color: "#E5E7EB" },
  );
  text(slide, ctx, "Final evaluation framing", 666, 524, 220, 20, { fontSize: 13, bold: true, color: "#FFFFFF" });
  text(
    slide,
    ctx,
    "External benchmark = headline result\nLocal diagnostic suite = negative result + why cheap features are not enough",
    666,
    550,
    470,
    42,
    { fontSize: 15, color: "#CBD5E1" },
  );
  footer(slide, ctx, 4, "Benchmark design");
  return slide;
}
