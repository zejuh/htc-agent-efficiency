import { STYLE, bg, titleBlock, card, footer, rect, text, bullets } from "./common.mjs";

export async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "why it works",
    "The gain comes from not forgetting hidden progress on sequence-like tasks.",
    "Repeated fresh observation can hurt when the current page does not visibly encode what was already done."
  );

  rect(slide, ctx, 58, 246, 1164, 116, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  text(slide, ctx, "Example: MiniWoB click-button-sequence", 86, 272, 360, 22, { fontSize: 18, bold: true, color: "#FFFFFF" });
  text(
    slide,
    ctx,
    "Instruction: click ONE, then click TWO. After button ONE is clicked, the page does not visibly mark that progress. If the policy re-observes and replans from scratch, it may click ONE again. Coasting on the carried plan can actually be better.",
    86,
    308,
    1040,
    34,
    { fontSize: 15, color: "#E5E7EB" },
  );

  card(slide, ctx, 58, 392, 350, 220, {
    title: "always",
    body: "Fails both sequence seeds.\n\nAverage 8 model calls on the sequence instances because it keeps re-planning from a partially observed state.",
    bodySize: 16,
    stroke: STYLE.slate,
  });
  card(slide, ctx, 436, 392, 350, 220, {
    title: "handrule",
    body: "Still fails one seed, but uses fewer calls because it sometimes keeps the stale plan when the coarse screen signature does not change.",
    bodySize: 16,
    stroke: STYLE.amber,
  });
  card(slide, ctx, 814, 392, 408, 220, {
    title: "learned@0.8",
    body: "Succeeds on one of the two sequence seeds and keeps 0 unsafe misses on the whole benchmark. This is the point that dominates the safe baselines.",
    bodySize: 16,
    stroke: STYLE.accent,
  });
  bullets(
    slide,
    ctx,
    [
      "Observation is not automatically helpful when state is partially observable.",
      "A good gate should learn when re-observation destroys useful momentum.",
    ],
    76,
    628,
    1050,
    36,
    { fontSize: 13, bulletFill: STYLE.rust, color: STYLE.soft },
  );
  footer(slide, ctx, 6, "Task-level interpretation");
  return slide;
}
