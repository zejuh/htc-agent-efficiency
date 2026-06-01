import path from "node:path";
import { STYLE, bg, titleBlock, footer, rect, text } from "./common.mjs";

export async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "negative result",
    "The local diagnostic suite is intentionally hard, and the learned gate mostly collapses toward ‘observe a lot’.",
    "This is still a useful result: cheap features alone are not enough when 93% of labels say observation is necessary."
  );

  await ctx.addImage(slide, {
    path: path.join(ctx.assetDir, "local_headline_bars.png"),
    left: 58,
    top: 242,
    width: 690,
    height: 340,
    fit: "contain",
  });
  await ctx.addImage(slide, {
    path: path.join(ctx.assetDir, "local_label_distribution.png"),
    left: 784,
    top: 252,
    width: 414,
    height: 242,
    fit: "contain",
  });

  rect(slide, ctx, 784, 514, 414, 124, STYLE.panel, { geometry: "roundRect", stroke: STYLE.line });
  text(slide, ctx, "What the negative result means", 808, 536, 220, 22, { fontSize: 15, bold: true });
  text(
    slide,
    ctx,
    "The diagnostic suite did its job: it created many cases where stale plans really are dangerous. The next research step is not to abandon the idea, but to add richer state features or memory-aware policies.",
    808,
    570,
    354,
    54,
    { fontSize: 13, color: STYLE.soft },
  );
  footer(slide, ctx, 7, "Hard local suite = informative negative result");
  return slide;
}
