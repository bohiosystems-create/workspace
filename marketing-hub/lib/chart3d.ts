// 3D geometry for the charts (app, report read version, ▶ Play): extruded bars and tilted pies / donuts.
// Pure path strings, so React components and the HTML-string report use the same shapes. The depth is kept modest
// (a 9px extrusion, a 0.6 tilt) and every value keeps its direct label, so the third dimension adds form without
// hiding the numbers.

/** Darken (k < 1) or lighten (k > 1) a #rrggbb colour. */
export function shade(hex: string, k: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = ch.map((c) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k))));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export const DEPTH = { dx: 9, dy: -7 };
const f = (v: number) => Math.round(v * 10) / 10;

/** An extruded vertical bar: front face, right side face and top face. */
export function box(x: number, y: number, w: number, h: number, dx = DEPTH.dx, dy = DEPTH.dy) {
  return {
    front: `M${f(x)},${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`,
    side: `M${f(x + w)},${f(y)}L${f(x + w + dx)},${f(y + dy)}L${f(x + w + dx)},${f(y + h + dy)}L${f(x + w)},${f(y + h)}Z`,
    top: `M${f(x)},${f(y)}L${f(x + dx)},${f(y + dy)}L${f(x + w + dx)},${f(y + dy)}L${f(x + w)},${f(y)}Z`,
  };
}

/** An extruded horizontal bar (grows right): front, top face and end face. */
export function hbox(x: number, y: number, w: number, h: number, dx = DEPTH.dx * 0.8, dy = DEPTH.dy * 0.8) {
  return {
    front: `M${f(x)},${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`,
    top: `M${f(x)},${f(y)}L${f(x + dx)},${f(y + dy)}L${f(x + w + dx)},${f(y + dy)}L${f(x + w)},${f(y)}Z`,
    side: `M${f(x + w)},${f(y)}L${f(x + w + dx)},${f(y + dy)}L${f(x + w + dx)},${f(y + h + dy)}L${f(x + w)},${f(y + h)}Z`,
  };
}

type Seg = { a0: number; a1: number };
const P = (cx: number, cy: number, rx: number, ry: number, a: number) => `${f(cx + rx * Math.cos(a))},${f(cy + ry * Math.sin(a))}`;
const arc = (rx: number, ry: number, from: number, to: number, cx: number, cy: number) =>
  `A${f(rx)},${f(ry)} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${to > from ? 1 : 0} ${P(cx, cy, rx, ry, to)}`;
/** Overlap of [a, b] with the visible bands (front half: sin > 0; for inner walls: sin < 0), for angles in [-π/2, 3π/2]. */
function clip(a: number, b: number, front: boolean): [number, number][] {
  const bands: [number, number][] = front ? [[0, Math.PI]] : [[-Math.PI / 2, 0], [Math.PI, 1.5 * Math.PI]];
  return bands.map(([s, e]) => [Math.max(a, s), Math.min(b, e)] as [number, number]).filter(([s, e]) => e - s > 1e-4);
}

/**
 * A tilted pie or donut. Angles are screen angles starting at -π/2 (12 o'clock), clockwise, for the flat chart;
 * the tilt squashes the circle to an ellipse (ry = rx · tilt) and the depth extrudes the rim downwards.
 * Returns path strings: inner walls (behind, donut only), outer walls (front), and the top faces — draw in that order.
 */
export function pie3d(segs: Seg[], o: { cx: number; cy: number; r: number; inner?: number; tilt?: number; depth?: number }) {
  const { cx, cy, r } = o, tilt = o.tilt ?? 0.6, depth = o.depth ?? 18, rx = r, ry = r * tilt;
  const irx = o.inner ?? 0, iry = irx * tilt;
  const tops = segs.map((s) => {
    if (s.a1 - s.a0 >= 2 * Math.PI - 1e-6) {
      const full = `M${P(cx, cy, rx, ry, -Math.PI / 2)} ${arc(rx, ry, -Math.PI / 2, Math.PI / 2, cx, cy)} ${arc(rx, ry, Math.PI / 2, 1.5 * Math.PI, cx, cy)}Z`;
      return irx ? `${full} M${P(cx, cy, irx, iry, -Math.PI / 2)} ${arc(irx, iry, -Math.PI / 2, Math.PI / 2, cx, cy)} ${arc(irx, iry, Math.PI / 2, 1.5 * Math.PI, cx, cy)}Z` : full;
    }
    return irx
      ? `M${P(cx, cy, rx, ry, s.a0)} ${arc(rx, ry, s.a0, s.a1, cx, cy)} L${P(cx, cy, irx, iry, s.a1)} ${arc(irx, iry, s.a1, s.a0, cx, cy)}Z`
      : `M${f(cx)},${f(cy)} L${P(cx, cy, rx, ry, s.a0)} ${arc(rx, ry, s.a0, s.a1, cx, cy)}Z`;
  });
  const wall = (rr: number, rry: number, s: number, e: number) =>
    `M${P(cx, cy, rr, rry, s)} ${arc(rr, rry, s, e, cx, cy)} L${P(cx, cy + depth, rr, rry, e)} ${arc(rr, rry, e, s, cx, cy + depth)}Z`;
  const outer = segs.flatMap((s, i) => clip(s.a0, s.a1, true).map(([a, b]) => ({ i, d: wall(rx, ry, a, b) })));
  const inner = irx ? segs.flatMap((s, i) => clip(s.a0, s.a1, false).map(([a, b]) => ({ i, d: wall(irx, iry, a, b) }))) : [];
  // Cut faces where slices meet are hidden by the solid walls in front, so only the outer rim and the hole show.
  return { tops, outer, inner, rx, ry, depth, point: (a: number, k = 1) => [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)] as [number, number] };
}
