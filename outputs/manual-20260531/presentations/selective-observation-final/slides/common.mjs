export const STYLE = {
  bg: "#F7F3EB",
  panel: "#FFFDF8",
  ink: "#111827",
  soft: "#475569",
  line: "#D6D3D1",
  accent: "#0F766E",
  amber: "#A16207",
  rust: "#C2410C",
  slate: "#6B7280",
  dark: "#0B1220",
  mint: "#D1FAE5",
  sand: "#F5E7C4",
};

export function rect(slide, ctx, x, y, w, h, fill, opts = {}) {
  return ctx.addShape(slide, {
    left: x,
    top: y,
    width: w,
    height: h,
    fill,
    line: opts.line ?? ctx.line(opts.stroke ?? STYLE.line, opts.strokeWidth ?? 1),
    geometry: opts.geometry ?? "rect",
  });
}

export function text(slide, ctx, value, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text: value,
    left: x,
    top: y,
    width: w,
    height: h,
    fontSize: opts.fontSize ?? 22,
    color: opts.color ?? STYLE.ink,
    bold: Boolean(opts.bold),
    typeface: opts.typeface ?? (opts.serif ? ctx.fonts.title : ctx.fonts.body),
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    fill: opts.fill ?? "#00000000",
    line: opts.line ?? ctx.line(),
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

export function bg(slide, ctx) {
  rect(slide, ctx, 0, 0, ctx.W, ctx.H, STYLE.bg, { stroke: STYLE.bg, strokeWidth: 0 });
}

export function rule(slide, ctx, x, y, w, color = STYLE.line, weight = 1) {
  rect(slide, ctx, x, y, w, weight, color, { stroke: color, strokeWidth: 0 });
}

export function pill(slide, ctx, label, x, y, w, fill, color = "#FFFFFF") {
  rect(slide, ctx, x, y, w, 28, fill, { geometry: "roundRect", stroke: fill, strokeWidth: 0 });
  text(slide, ctx, label, x + 10, y + 6, w - 20, 16, { fontSize: 11, color, bold: true });
}

export function titleBlock(slide, ctx, kicker, title, subtitle = "") {
  if (kicker) pill(slide, ctx, kicker.toUpperCase(), 58, 46, Math.max(120, 9 * kicker.length), STYLE.dark);
  text(slide, ctx, title, 58, 92, 1060, 88, { fontSize: 30, bold: true, serif: true, color: STYLE.ink });
  if (subtitle) text(slide, ctx, subtitle, 58, 174, 1040, 52, { fontSize: 15, color: STYLE.soft });
}

export function footer(slide, ctx, page, note) {
  rule(slide, ctx, 58, 686, 1164, STYLE.line, 1);
  text(slide, ctx, String(page).padStart(2, "0"), 58, 692, 40, 18, { fontSize: 10.5, color: STYLE.soft, bold: true });
  text(slide, ctx, note, 120, 692, 930, 18, { fontSize: 10.5, color: STYLE.soft });
  text(slide, ctx, "Selective Observation Agent", 1035, 692, 190, 18, { fontSize: 10.5, color: STYLE.soft, align: "right" });
}

export function card(slide, ctx, x, y, w, h, opts = {}) {
  rect(slide, ctx, x, y, w, h, opts.fill ?? STYLE.panel, {
    geometry: "roundRect",
    stroke: opts.stroke ?? STYLE.line,
    strokeWidth: opts.strokeWidth ?? 1.2,
  });
  if (opts.title) text(slide, ctx, opts.title, x + 18, y + 16, w - 36, 24, { fontSize: 16, bold: true, color: opts.titleColor ?? STYLE.ink });
  if (opts.body) text(slide, ctx, opts.body, x + 18, y + 46, w - 36, h - 60, { fontSize: opts.bodySize ?? 13, color: STYLE.soft });
}

export function bullets(slide, ctx, items, x, y, w, gap = 48, opts = {}) {
  items.forEach((item, idx) => {
    rect(slide, ctx, x, y + idx * gap + 6, 8, 8, opts.bulletFill ?? STYLE.accent, { geometry: "ellipse", stroke: opts.bulletFill ?? STYLE.accent, strokeWidth: 0 });
    text(slide, ctx, item, x + 20, y + idx * gap, w - 20, gap - 4, { fontSize: opts.fontSize ?? 15, color: opts.color ?? STYLE.ink });
  });
}

export function metric(slide, ctx, x, y, value, label, note, color = STYLE.accent) {
  rule(slide, ctx, x, y, 2, color, 62);
  text(slide, ctx, value, x + 14, y - 3, 150, 28, { fontSize: 26, bold: true, serif: true });
  text(slide, ctx, label, x + 14, y + 28, 160, 16, { fontSize: 10.5, color: STYLE.soft, bold: true });
  text(slide, ctx, note, x + 14, y + 46, 170, 22, { fontSize: 10, color: STYLE.soft });
}
