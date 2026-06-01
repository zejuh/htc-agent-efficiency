import path from "node:path";
import { STYLE, bg, titleBlock, rect, text, footer, metric } from "./common.mjs";

export async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "main result",
    "On the external benchmark, the learned gate gives the best safe tradeoff.",
    "The strongest point on our frontier is learned@0.8: higher success than always/handrule, fewer model calls than both, and zero unsafe misses."
  );

  await ctx.addImage(slide, {
    path: path.join(ctx.assetDir, "miniwob_headline_bars.png"),
    left: 58,
    top: 238,
    width: 790,
    height: 388,
    fit: "contain",
  });

  rect(slide, ctx, 876, 240, 346, 386, STYLE.panel, { geometry: "roundRect", stroke: STYLE.line });
  text(slide, ctx, "Headline numbers", 904, 266, 220, 22, { fontSize: 16, bold: true });
  metric(slide, ctx, 904, 316, "0.90", "Success rate", "learned@0.8", STYLE.accent);
  metric(slide, ctx, 904, 404, "2.0", "Avg. model calls", "vs 3.0 for always", STYLE.accent);
  metric(slide, ctx, 904, 492, "0", "Unsafe rate", "same as always / handrule", STYLE.accent);
  text(slide, ctx, "Interpretation", 904, 576, 160, 18, { fontSize: 13, bold: true, color: STYLE.ink });
  text(
    slide,
    ctx,
    "This is the cleanest result in the project: the gate does not just save cost, it also improves success over the safe baselines on this curated external subset.",
    904,
    602,
    284,
    44,
    { fontSize: 13, color: STYLE.soft },
  );
  footer(slide, ctx, 5, "MiniWoB curated headline");
  return slide;
}
