// The report's charts at presentation quality, for reading the report on screen (the in-app view, the HTML download and
// the PDF): the same designs as the ▶ Play slides — gauges with ticks and outlook bars, columns with monthly targets and
// a change call-out, a donut with direct labels, cost-to-sales bars against the historical average, a smooth line — in
// Kinan's light style, animated with CSS.
//
// E-mail clients (Outlook, Gmail) can't show inline SVG, so every chart is sent twice: the table version
// (lib/report-charts.ts) and this one, hidden. The app adds class "k-screen" to the document when it shows, downloads
// or prints the report (screenHtml), which swaps them. Animations are written as `from` keyframes only, so a client or
// a PDF capture that doesn't run them still shows the finished chart.
import type { DeckSlide } from "./deck";
import { type Lang, tx } from "./i18n";
import { box, pie3d, shade, DEPTH } from "./chart3d";

const OR = "#f15a22", CH = "#2e2e2f", TAUPE = "#51473d", SOFT = "#6f6f6f", TRACK = "#efeeec", GRID = "#e6e5e2";
const GOOD = "#1f8a4c", WARN = "#d99400", CRIT = "#d03b3b";
const PAL = ["#f15a22", "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (v: number, d = 1) => (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtAuto = (v: number) => fmt(v, Math.abs(v) >= 100 ? 0 : 1);
let uid = 0;
const nid = () => `k${(++uid).toString(36)}`;

/** Wrap the e-mail-safe chart and the rich chart so the app can show the rich one. */
export const dualChart = (plain: string, rich: string | null) =>
  rich ? `<div class="k-plain">${plain}</div><div class="k-rich" style="display:none">${rich}</div>` : plain;

/** Report HTML as the app shows it (rich charts on). */
export const screenHtml = (html: string) => html.replace(/<html(\s)/, '<html class="k-screen"$1');

/** CSS for the rich charts (goes in the report's <style>). */
export const RICH_CSS = `
.k-screen .k-plain { display: none !important; }
.k-screen .k-rich { display: block !important; }
.kr { font-family: inherit; color: ${CH}; }
.kr-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 10px; }
.kr-title { font-size: 14px; font-weight: 700; color: ${CH}; }
.kr-sub { font-size: 11px; color: ${SOFT}; }
.kr-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: ${SOFT}; margin: 2px 0 8px; }
.kr-legend i { display: inline-block; width: 11px; height: 8px; margin-inline-end: 6px; vertical-align: middle; border-radius: 1px; }
.kr-legend i.dash { height: 0; width: 14px; border-top: 2px dashed ${CH}; background: none; }
.kr svg { display: block; width: 100%; height: auto; overflow: visible; }
.kr-gauges { display: grid; gap: 14px; }
.kr-g { text-align: center; }
.kr-g-l { font-size: 13px; font-weight: 600; margin-top: 2px; }
.kr-g-n { font-size: 11px; color: ${SOFT}; }
.kr-chip { display: inline-block; white-space: nowrap; border: 1px solid; border-radius: 10px; font-size: 10px; font-weight: 700; padding: 1px 8px; margin-top: 4px; background: #fff; }
.kr-ol { text-align: start; max-width: 190px; margin: 10px auto 0; font-size: 10px; color: ${SOFT}; }
.kr-ol-t { position: relative; height: 6px; background: ${TRACK}; border-radius: 3px; margin: 4px 0 3px; }
.kr-ol-f { height: 100%; border-radius: 3px; transform-origin: left center; }
[dir="rtl"] .kr-ol-f { transform-origin: right center; }
.kr-ol-m { position: absolute; top: -3px; bottom: -3px; inset-inline-end: 0; width: 2px; background: ${CH}; }
.kr-ol b { color: ${CH}; font-variant-numeric: tabular-nums; }
.kr-donut { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
.kr-donut > div:first-child { flex: 0 0 260px; }
.kr-leg { flex: 1 1 260px; }
.kr-leg-r { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid ${GRID}; font-size: 12px; }
.kr-leg-r i { width: 11px; height: 11px; border-radius: 2px; flex: none; }
.kr-leg-r span { flex: 1; }
.kr-leg-r b { font-variant-numeric: tabular-nums; }
.kr-leg-r em { font-style: normal; color: ${SOFT}; width: 40px; text-align: end; font-variant-numeric: tabular-nums; }
.kr-bars { position: relative; padding-top: 18px; }
.kr-br { display: flex; align-items: center; gap: 10px; margin: 0 0 9px; font-size: 12px; }
.kr-br-l { width: 34%; }
.kr-br-t { flex: 1; height: 13px; background: ${TRACK}; border-radius: 2px; position: relative; }
.kr-br-f { height: 100%; border-radius: 2px; transform-origin: left center; }
[dir="rtl"] .kr-br-f { transform-origin: right center; }
.kr-br-v { width: 54px; text-align: end; font-weight: 700; font-variant-numeric: tabular-nums; }
.kr-br-c { width: 64px; }
.kr-bench { position: absolute; top: 0; bottom: 0; border-inline-start: 2px dashed ${OR}; pointer-events: none; }
.kr-bench span { position: absolute; top: -2px; inset-inline-start: 6px; white-space: nowrap; font-size: 10px; color: ${OR}; background: #fff; padding: 0 4px; }
.kr-br-t { margin-top: 6px; }
.kr-br-f { position: relative; }
.k-screen .kr-br-f::before { content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 6px; background: inherit; filter: brightness(1.35); transform: skewX(-45deg); transform-origin: bottom left; }
.k-screen .kr-br-f::after { content: ""; position: absolute; top: 0; bottom: 0; left: 100%; width: 6px; background: inherit; filter: brightness(.62); transform: skewY(-45deg); transform-origin: top left; }
.kr-cap { font-size: 10.5px; color: ${SOFT}; margin-top: 8px; }
@media screen and (prefers-reduced-motion: no-preference) {
  .k-screen .kr-arc { animation: krArc 1.4s cubic-bezier(.2,.8,.2,1) both; }
  .k-screen .kr-grow-y { transform-box: fill-box; transform-origin: 50% 100%; animation: krGrowY 1s cubic-bezier(.34,1.3,.64,1) both; }
  .k-screen .kr-grow-x, .k-screen .kr-br-f, .k-screen .kr-ol-f { animation: krGrowX 1.1s cubic-bezier(.2,.8,.2,1) both; }
  .k-screen .kr-draw { stroke-dasharray: 1; animation: krDraw 1.6s cubic-bezier(.4,0,.2,1) both; }
  .k-screen .kr-fade { animation: krFade .6s ease both; }
  .k-screen .kr-pop { transform-box: fill-box; transform-origin: center; animation: krPop .5s cubic-bezier(.34,1.56,.64,1) both; }
  @supports (animation-timeline: view()) {
    .k-screen .kr { view-timeline-name: --kr; }
    .k-screen .kr .kr-arc, .k-screen .kr .kr-grow-y, .k-screen .kr .kr-grow-x, .k-screen .kr .kr-br-f, .k-screen .kr .kr-ol-f, .k-screen .kr .kr-draw, .k-screen .kr .kr-fade, .k-screen .kr .kr-pop {
      animation-timeline: --kr; animation-range: entry 10% cover 45%; animation-duration: auto; }
  }
}
@keyframes krArc { from { stroke-dashoffset: var(--len); } }
@keyframes krGrowY { from { transform: scaleY(0); } }
@keyframes krGrowX { from { transform: scaleX(0); } }
@keyframes krDraw { from { stroke-dashoffset: 1; } }
@keyframes krFade { from { opacity: 0; } }
@keyframes krPop { from { opacity: 0; transform: scale(.3); } }
`;

const head = (title: string, sub?: string) => `<div class="kr-head"><div class="kr-title">${esc(title)}</div>${sub ? `<div class="kr-sub">${esc(sub)}</div>` : ""}</div>`;
const d = (ms: number) => `animation-delay:${ms}ms`;
const tone = (pct: number) => (pct >= 95 ? [GOOD, "✓", "On track", "على المسار"] : pct >= 75 ? [WARN, "!", "Watch", "للمتابعة"] : [CRIT, "✕", "Behind", "متأخر"]) as [string, string, string, string];

function smooth(pts: [number, number][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  let s = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    s += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return s;
}

// ------------------------------------------------------------------ the charts
function gauges(s: Extract<DeckSlide, { kind: "gauges" }>, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const R = 58, C = 2 * Math.PI * R;
  const cells = s.items.map((it, i) => {
    const p = Math.max(0, it.pct), [col, ic, en, ar] = tone(p), len = (Math.min(100, p) / 100) * C;
    const ticks = Array.from({ length: 40 }, (_, k) => { const a = (k / 40) * 2 * Math.PI - Math.PI / 2, r1 = 76, r2 = k % 10 === 0 ? 70 : 73; return `<line x1="${(80 + r1 * Math.cos(a)).toFixed(1)}" y1="${(80 + r1 * Math.sin(a)).toFixed(1)}" x2="${(80 + r2 * Math.cos(a)).toFixed(1)}" y2="${(80 + r2 * Math.sin(a)).toFixed(1)}" stroke="${k / 40 <= p / 100 ? col : "#d6d5d2"}" stroke-width="${k % 10 === 0 ? 1.6 : 1}"/>`; }).join("");
    const ol = it.outlook ? (() => { const f = Math.min(100, (it.outlook.forecast / Math.max(it.outlook.target, 0.0001)) * 100), c = f >= 95 ? GOOD : f >= 75 ? WARN : CRIT;
      return `<div class="kr-ol">${esc(it.outlook.label)}<div class="kr-ol-t"><div class="kr-ol-f" style="width:${f.toFixed(1)}%;background:${c};${d(900 + i * 150)}"></div><div class="kr-ol-m"></div></div><span dir="ltr"><b>${fmt(it.outlook.forecast)}</b> / ${fmt(it.outlook.target)}</span></div>`; })() : "";
    return `<div class="kr-g"><svg viewBox="0 0 160 160" style="max-width:170px;margin:0 auto" aria-hidden="true">
      ${ticks}
      <circle cx="80" cy="84" r="${R}" fill="none" stroke="#dcdbd8" stroke-width="12"/>
      <circle class="kr-arc" cx="80" cy="84" r="${R}" fill="none" stroke="${shade(col, 0.6)}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 80 84)" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" style="--len:${len.toFixed(1)};${d(200 + i * 150)}"/>
      <circle cx="80" cy="80" r="${R}" fill="none" stroke="${TRACK}" stroke-width="12"/>
      <circle class="kr-arc" cx="80" cy="80" r="${R}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 80 80)" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" style="--len:${len.toFixed(1)};${d(200 + i * 150)}"/>
      <text x="80" y="86" text-anchor="middle" font-size="30" font-weight="700" fill="${CH}" style="font-variant-numeric:tabular-nums">${Math.round(p)}%</text>
    </svg>
    <div class="kr-chip" style="border-color:${col};color:${col}">${ic} ${T(en, ar)}</div>
    <div class="kr-g-l">${esc(it.label)}</div><div class="kr-g-n" dir="ltr">${esc(it.actual)} / ${esc(it.target)}</div>${ol}</div>`;
  }).join("");
  return `<div class="kr">${head(s.title, s.foot)}<div class="kr-gauges" style="grid-template-columns:repeat(${Math.min(3, s.items.length)},1fr)">${cells}</div></div>`;
}

function columns(s: { title: string; sub: string; labels: string[]; values: number[]; unit: string; decimals?: number; target?: (number | null)[] }, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const id = nid(), tg = s.target ?? [], n = s.values.length, W = 700, H = 230, top = 34, pad = 8;
  const max = Math.max(...s.values, ...tg.map((x) => x ?? 0), 0.0001) * 1.16;
  const slot = (W - pad * 2 - DEPTH.dx) / n, bw = Math.min(70, slot * 0.56), x = (i: number) => pad + slot * (i + 0.5), y = (v: number) => H - ((H - top) * v) / max;
  const last = n - 1, prev = s.values[last - 1], delta = prev ? ((s.values[last] - prev) / prev) * 100 : null;
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="${pad}" x2="${W - pad}" y1="${(H - (H - top) * g).toFixed(1)}" y2="${(H - (H - top) * g).toFixed(1)}" stroke="${GRID}"/>`).join("");
  const bars = s.values.map((v, i) => {
    const hot = i === last, t = tg[i] ?? null, under = t != null && v < t * 0.9;
    const yv = y(v), labelY = Math.min(yv + DEPTH.dy, t != null ? y(t) : 9e9) - 8, b = box(x(i) - bw / 2, yv, bw, H - yv), base = under ? CRIT : hot ? OR : CH;
    return `<g class="kr-grow-y" style="${d(150 + i * 110)}"><path d="${b.side}" fill="${shade(base, 0.62)}"/><path d="${b.top}" fill="${shade(base, 1.35)}"/><path d="${b.front}" fill="url(#${id}${under ? "r" : hot ? "h" : "c"})"/></g>
      ${t != null ? `<line class="kr-fade" x1="${(x(i) - bw / 2 - 7).toFixed(1)}" x2="${(x(i) + bw / 2 + 7).toFixed(1)}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${under ? CRIT : CH}" stroke-width="2" stroke-dasharray="5 4" style="${d(800 + i * 110)}"/>` : ""}
      <text class="kr-fade" x="${(x(i) + DEPTH.dx / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="${under ? CRIT : hot ? OR : CH}" style="font-variant-numeric:tabular-nums;${d(900 + i * 110)}">${fmt(v, s.decimals ?? 1)}</text>
      <text x="${x(i).toFixed(1)}" y="${H + 20}" text-anchor="middle" font-size="12" fill="${SOFT}">${esc(s.labels[i])}</text>`;
  }).join("");
  const bubble = delta != null ? (() => { const txt = `${delta >= 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(delta))}% ${T("vs", "مقابل")} ${s.labels[last - 1]}`, w = 22 + txt.length * 6.6, bx = Math.min(W - pad - w, Math.max(pad, x(last) - w / 2)), by = -28;
    return `<g class="kr-pop" style="${d(1400)}"><rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="22" rx="11" fill="#fff" stroke="${OR}"/><text x="${(bx + w / 2).toFixed(1)}" y="${(by + 15).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${CH}">${esc(txt)}</text></g>`; })() : "";
  return `<div class="kr">${head(s.title, s.sub)}<div class="kr-legend"><span><i style="background:${CH}"></i>${T("Actual", "الفعلي")}</span><span><i style="background:${OR}"></i>${T("Latest month", "آخر شهر")}</span>${tg.length ? `<span><i class="dash"></i>${T("Target", "المستهدف")}</span>` : ""}</div>
  <svg viewBox="0 ${delta != null ? -30 : 0} ${W} ${H + 28 + (delta != null ? 30 : 0)}" style="direction:ltr" aria-hidden="true"><defs>
    <linearGradient id="${id}h" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff7a45"/><stop offset="1" stop-color="${OR}"/></linearGradient>
    <linearGradient id="${id}c" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5a5a5c"/><stop offset="1" stop-color="${CH}"/></linearGradient>
    <linearGradient id="${id}r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e86a6a"/><stop offset="1" stop-color="${CRIT}"/></linearGradient></defs>
    ${grid}<path d="M${pad},${H} L${pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad},${H} Z" fill="#f1f0ee"/><line x1="${pad}" x2="${W - pad}" y1="${H}" y2="${H}" stroke="#bdbcb8"/>${bars}${bubble}</svg></div>`;
}

function donut(s: { title: string; sub: string; labels: string[]; values: number[]; unit: string }) {
  // Tilted 3D donut (lib/chart3d.ts); every slice of 6% or more carries its share.
  const total = s.values.reduce((a, b) => a + b, 0) || 1, cx = 130, cy = 92, R = 112, depth = 20, tilt = 0.58;
  let a = -Math.PI / 2;
  const segs = s.values.map((v) => { const a0 = a; a += (v / total) * Math.PI * 2; return { a0, a1: a }; });
  const g = pie3d(segs, { cx, cy, r: R, inner: 62, tilt, depth });
  const col = (i: number) => PAL[i] ?? "#9a9a9a";
  const inner = g.inner.map((w) => `<path class="kr-fade" d="${w.d}" fill="${shade(col(w.i), 0.5)}" style="${d(w.i * 90)}"/>`).join("");
  const outer = g.outer.map((w) => `<path class="kr-fade" d="${w.d}" fill="${shade(col(w.i), 0.66)}" stroke="${shade(col(w.i), 0.6)}" stroke-width=".6" style="${d(w.i * 90)}"/>`).join("");
  const tops = g.tops.map((t, i) => `<path class="kr-fade" d="${t}" fill="${col(i)}" stroke="#fff" stroke-width="1.5" fill-rule="evenodd" style="${d(i * 90)}"/>`).join("");
  const labels = segs.map((sg, i) => { const pct = (s.values[i] / total) * 100; if (pct < 6) return ""; const [x, y] = g.point((sg.a0 + sg.a1) / 2, 0.78);
    const light = ["#eda100", "#e87ba4", "#1baf7a"].includes(col(i)); return `<text class="kr-fade" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${light ? CH : "#fff"}" style="${d(500 + i * 90)}">${Math.round(pct)}%</text>`; }).join("");
  const leg = s.labels.map((l, i) => `<div class="kr-leg-r"><i style="background:${col(i)}"></i><span>${esc(l)}</span><b dir="ltr">${fmtAuto(s.values[i])}</b><em dir="ltr">${Math.round((s.values[i] / total) * 100)}%</em></div>`).join("");
  return `<div class="kr">${head(s.title, s.sub)}<div class="kr-donut"><div><svg viewBox="0 0 260 200" style="max-width:260px;direction:ltr" aria-hidden="true">
    <ellipse cx="${cx}" cy="${cy + depth + 8}" rx="${R * 0.98}" ry="${R * tilt * 0.55}" fill="rgba(46,46,47,.10)"/>
    ${inner}${outer}${tops}${labels}
    <text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="18" font-weight="700" fill="${CH}" style="font-variant-numeric:tabular-nums">${fmtAuto(total)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="8" letter-spacing="2" fill="${TAUPE}">${esc(s.unit.toUpperCase())}</text></svg></div><div class="kr-leg">${leg}</div></div></div>`;
}

function hbars(s: Extract<DeckSlide, { kind: "hbars" }>, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const max = Math.max(...s.values, s.bench ?? 0, 0.0001) * 1.1;
  const rows = s.values.map((v, i) => {
    const ratio = s.bench ? v / s.bench : null, hot = ratio != null && ratio > 1.5, best = i === 0 && s.values.length > 1;
    const col = hot ? CRIT : best ? GOOD : "#9c9ea1";
    const chip = hot ? `<span class="kr-chip" style="border-color:${CRIT};color:${CRIT};margin:0">${fmt(ratio!)}×</span>` : best ? `<span class="kr-chip" style="border-color:${GOOD};color:${GOOD};margin:0">✓ ${T("best", "الأفضل")}</span>` : "";
    return `<div class="kr-br"><div class="kr-br-l">${esc(s.labels[i])}</div><div class="kr-br-t"><div class="kr-br-f" style="width:${((v / max) * 100).toFixed(1)}%;background:linear-gradient(90deg,${col}aa,${col});${d(150 + i * 100)}"></div></div><div class="kr-br-v" dir="ltr" style="color:${hot ? CRIT : CH}">${fmt(v, 2)}${esc(s.unit)}</div><div class="kr-br-c">${chip}</div></div>`;
  }).join("");
  // The benchmark line sits over the track column: label 34%, gaps, value 54px, chip 58px.
  const bench = s.bench != null ? `<div class="kr-bench kr-fade" style="inset-inline-start:calc(34% + 10px + (100% - 34% - 148px) * ${(s.bench / max).toFixed(4)});${d(900)}"><span>${esc(s.benchLabel ?? "")}</span></div>` : "";
  return `<div class="kr">${head(s.title, s.sub)}<div class="kr-bars">${bench}${rows}</div></div>`;
}

function line(s: { title: string; sub: string; labels: string[]; values: number[]; unit: string }) {
  const id = nid(), n = s.values.length, W = 700, H = 200, top = 30, pad = 28;
  const max = Math.max(...s.values, 0.0001) * 1.18;
  const pts = s.values.map((v, i) => [pad + ((W - pad * 2) * i) / Math.max(1, n - 1), H - ((H - top) * v) / max] as [number, number]);
  const path = smooth(pts), iMax = s.values.indexOf(Math.max(...s.values));
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="${pad}" x2="${W - pad}" y1="${(H - (H - top) * g).toFixed(1)}" y2="${(H - (H - top) * g).toFixed(1)}" stroke="${GRID}"/>`).join("");
  const dots = pts.map((p, i) => `<circle class="kr-pop" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="#fff" stroke="${OR}" stroke-width="2.5" style="${d(300 + (i / Math.max(1, n - 1)) * 1300)}"/>${i === n - 1 || i === iMax ? `<text class="kr-fade" x="${p[0].toFixed(1)}" y="${(p[1] - 12).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="${CH}" style="${d(1500)}">${fmtAuto(s.values[i])}</text>` : ""}<text x="${p[0].toFixed(1)}" y="${H + 18}" text-anchor="middle" font-size="11" fill="${SOFT}">${esc(s.labels[i])}</text>`).join("");
  return `<div class="kr">${head(s.title, s.sub)}<svg viewBox="0 0 ${W} ${H + 26}" style="direction:ltr" aria-hidden="true"><defs><linearGradient id="${id}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${OR}" stop-opacity=".28"/><stop offset="1" stop-color="${OR}" stop-opacity="0"/></linearGradient></defs>
    ${grid}<line x1="${pad}" x2="${W - pad}" y1="${H}" y2="${H}" stroke="#bdbcb8"/>
    <path class="kr-fade" d="${path} L${pts[n - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z" fill="url(#${id}a)" style="${d(1000)}"/>
    <path class="kr-draw" d="${path}" fill="none" stroke="${OR}" stroke-width="3" stroke-linecap="round" pathLength="1"/>${dots}</svg></div>`;
}

/** The rich version of a report chart, from the slide the presentation uses (null for kinds without one). */
export function richChart(slide: DeckSlide | undefined, lang: Lang, caption?: string): string | null {
  if (!slide) return null;
  const cap = caption ? `<div class="kr-cap">${caption}</div>` : "";
  switch (slide.kind) {
    case "gauges": return gauges(slide, lang) + cap;
    case "columns": return columns(slide, lang) + cap;
    case "donut": return donut(slide) + cap;
    case "hbars": return hbars(slide, lang) + cap;
    case "line": return line(slide) + cap;
    default: return null;
  }
}
