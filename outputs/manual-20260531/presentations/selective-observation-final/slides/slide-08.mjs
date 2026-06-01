import { STYLE, bg, titleBlock, card, footer, bullets, rect, text } from "./common.mjs";

export async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  titleBlock(
    slide,
    ctx,
    "takeaways",
    "What we learned and what we would do next",
    ""
  );

  card(slide, ctx, 58, 246, 360, 330, {
    title: "Takeaway 1",
    body: "The benchmark-first refactor was worth it. Once the core observation policy was isolated behind adapters, the project became much easier to position as research rather than as a toy demo.",
    bodySize: 16,
  });
  card(slide, ctx, 450, 246, 360, 330, {
    title: "Takeaway 2",
    body: "On a curated external benchmark subset, selective observation can beat both always-observe and a simple hand rule while keeping unsafe behavior at zero.",
    bodySize: 16,
  });
  card(slide, ctx, 842, 246, 380, 330, {
    title: "Takeaway 3",
    body: "The hard local suite exposed the current method’s ceiling: cheap features skew the gate toward always observing. That gives us a very concrete future-work path.",
    bodySize: 16,
  });

  rect(slide, ctx, 58, 604, 1164, 54, STYLE.dark, { geometry: "roundRect", stroke: STYLE.dark });
  bullets(
    slide,
    ctx,
    [
      "Next: move the same adapter core to WebArena / WorkArena style environments.",
      "Next: add richer state features or sequence-aware memory, not just cheap single-step signals.",
      "Next: collect more balanced data so the learned gate is not trained on a 93% positive label distribution.",
    ],
    84,
    618,
    1080,
    16,
    { fontSize: 13, bulletFill: STYLE.rust, color: "#E5E7EB" },
  );
  text(slide, ctx, "Appendix-ready materials: full report, metrics tables, and prompt appendix are packaged with the submission.", 58, 674, 640, 16, { fontSize: 10.5, color: STYLE.soft });
  footer(slide, ctx, 8, "Conclusions and future work");
  return slide;
}
