import { STYLE, bg, titleBlock, card, bullets, footer, rect, text } from "./common.mjs";

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "motivation",
    "Modern browser agents over-observe.",
    "They often pay for a fresh model-backed observation before every action, even when the previous plan is still usable."
  );

  card(slide, ctx, 58, 246, 372, 330, {
    title: "Why this matters",
    body:
      "Observation is the expensive part of the loop: it triggers another model call, adds latency, and can still be redundant when the next few actions are already obvious.\n\nA strong policy should reuse stale-but-still-correct plans when it is safe to do so.",
    bodySize: 15,
  });

  card(slide, ctx, 454, 246, 360, 330, {
    title: "Baselines we compare against",
    body:
      "always: re-observe before every step\nnever: observe once, then coast\nhandrule: observe on coarse screen change or checkpoint\nlearned@tau: gate probability threshold + safety floor",
    bodySize: 15,
  });

  rect(slide, ctx, 838, 246, 384, 330, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  text(slide, ctx, "Research question", 868, 274, 210, 28, { fontSize: 18, bold: true, color: "#FFFFFF" });
  bullets(
    slide,
    ctx,
    [
      "Can we save model calls by skipping some observations?",
      "Can we keep success rate high while doing that?",
      "Can we hold unsafe behavior at or near zero?",
    ],
    868,
    330,
    300,
    60,
    { fontSize: 18, color: "#E5E7EB", bulletFill: STYLE.rust },
  );
  text(slide, ctx, "Our final framing: external benchmark for the headline claim, local diagnostic suite for failure-mode analysis.", 868, 548, 300, 34, { fontSize: 12, color: "#CBD5E1" });
  footer(slide, ctx, 2, "Motivation and evaluation framing");
  return slide;
}
