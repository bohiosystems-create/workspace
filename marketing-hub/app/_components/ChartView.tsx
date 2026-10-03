"use client";

// Renders any chart the assistant asks for (lib/charts.ts and lib/chart-query.ts compute the numbers): pie, donut,
// bars, horizontal bars, stacked, grouped, line, area, scatter, KPI tiles and tables. Plain SVG, a hover tooltip on
// every mark, a table view, and PNG / SVG / CSV download. Colours: a fixed, colour-blind-checked categorical order
// (never cycled — the engine folds a 9th series into "Other"); text always in ink, never in a series colour.
import { useEffect, useRef, useState } from "react";
import type { ChartSpec, ChartType } from "@/lib/charts";
import { saveFile } from "./saveFile";
import { useI18n } from "./lang";

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const INK = "#0b0b0b", INK2 = "#52514e", MUTED = "#898781", GRID = "#e1e0d9", AXIS = "#c3c2b7", SURFACE = "#fcfcfb";
const FONT = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

type Series = { name: string; values: (number | null)[] };
type Tip = { x: number; y: number; title: string; rows: { color: string; name: string; value: string }[] } | null;

const fmtNum = (v: number) => {
  const a = Math.abs(v);
  return a >= 10000 ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : v.toLocaleString("en-US", { maximumFractionDigits: a >= 100 ? 0 : 1 });
};
const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? "—" : `${fmtNum(v)}${unit === "%" ? "%" : unit === "×" ? "×" : ""}`);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Clean axis ticks (0, 50, 100 …) covering [lo, hi]. */
function ticks(lo: number, hi: number, n = 4) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out: number[] = [];
  for (let v = a; v <= b + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
/** A bar with a 4px rounded data end and a square base (vertical: up or down; horizontal: right or left). */
function barPath(x: number, y: number, w: number, h: number, dir: "up" | "down" | "right" | "left") {
  const r = Math.min(4, (dir === "up" || dir === "down" ? w : h) / 2, Math.abs(dir === "up" || dir === "down" ? h : w));
  if (dir === "up") return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  if (dir === "down") return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
  if (dir === "right") return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  return `M${x + w},${y} H${x + r} Q${x},${y} ${x},${y + r} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w} Z`;
}

function Legend({ series, kind }: { series: Series[]; kind: "rect" | "line" }) {
  if (series.length < 2) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", margin: "2px 0 8px" }}>
      {series.map((s, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: INK2 }} dir="auto">
          {kind === "rect" ? <span style={{ width: 10, height: 10, borderRadius: 2, background: SERIES[i % 8] }} /> : <span style={{ width: 14, height: 2, borderRadius: 1, background: SERIES[i % 8] }} />}
          {s.name}
        </span>
      ))}
    </div>
  );
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  const { t } = useI18n();
  const [type, setType] = useState<ChartType>(spec.type);
  const [table, setTable] = useState(spec.type === "table");
  const [tip, setTip] = useState<Tip>(null);
  const [width, setWidth] = useState(560);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 560)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const unit = spec.unit ?? "";
  const series: Series[] = spec.series?.length ? spec.series : [{ name: spec.title, values: spec.values }];
  const labels = spec.labels;
  const multi = series.length > 1;
  const timeline = ["month", "quarter", "year"].includes(String(spec.groupBy));
  const allPositive = series.every((s) => s.values.every((v) => v === null || v >= 0));
  const split = !!(spec.query as any)?.series;
  const additive = spec.total !== null || (split && (spec.series?.length ?? 0) > 1);
  const narrow = width < 440;
  const W = narrow ? 360 : 560;

  // Which views make sense for this data (the switcher offers only those).
  const options: ChartType[] = spec.type === "kpi" ? ["kpi"] : spec.type === "scatter" ? ["scatter"] : ([
    !multi && allPositive && !timeline && spec.total !== null && "pie", !multi && allPositive && !timeline && spec.total !== null && "donut",
    !multi && "bar", !multi && "hbar", multi && allPositive && additive && "stacked", multi && allPositive && additive && "stackedh", multi && "grouped",
    labels.length >= 3 && "line", labels.length >= 3 && "area",
  ].filter(Boolean) as ChartType[]);
  const view: ChartType = (() => {
    let v = options.includes(type) ? type : options[0] ?? "bar";
    if (narrow && v === "bar" && labels.length > 4) v = "hbar";
    if (narrow && v === "stacked" && labels.length > 4) v = "stackedh";
    if (narrow && v === "grouped" && labels.length > 3) v = "grouped";
    return v;
  })();

  const show = (e: React.PointerEvent | React.FocusEvent, title: string, rows: Tip extends null ? never : NonNullable<Tip>["rows"]) => {
    const r = box.current!.getBoundingClientRect();
    const p = "clientX" in e ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: r.width / 2, y: 40 };
    setTip({ x: p.x, y: p.y, title, rows });
  };
  const hide = () => setTip(null);
  const rowsAt = (i: number) => series.map((s, si) => ({ color: SERIES[si % 8], name: s.name, value: fmt(s.values[i], unit) }));
  const hit = (title: string, rows: NonNullable<Tip>["rows"]) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, title, rows), onPointerLeave: hide, onFocus: (e: React.FocusEvent) => show(e, title, rows), onBlur: hide, tabIndex: 0, style: { cursor: "default", outline: "none" } as React.CSSProperties,
  });

  // ---- Pie / donut -------------------------------------------------------------------------------------------------
  const pie = (donut: boolean) => {
    const vals = series[0].values.map((v) => v ?? 0), total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 150, cy = 150, r = 118, ri = donut ? 70 : 0, VW = narrow ? 300 : W;
    const lx = narrow ? 14 : 310, ly = narrow ? 300 : 40, lw = narrow ? 272 : 230;
    const H = narrow ? 300 + labels.length * 24 + 6 : Math.max(300, 50 + labels.length * 24);
    let a0 = -Math.PI / 2;
    const P = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    return (
      <svg viewBox={`0 0 ${VW} ${H}`} width="100%" style={{ fontFamily: FONT, display: "block" }} role="img" aria-label={spec.title}>
        {vals.map((v, i) => {
          const a1 = a0 + (v / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0, mid = (a0 + a1) / 2, pct = Math.round((v / total) * 100);
          const d = vals.length === 1 ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0` + (ri ? ` M${cx - ri},${cy} a${ri},${ri} 0 1,1 ${2 * ri},0 a${ri},${ri} 0 1,1 ${-2 * ri},0` : "")
            : ri ? `M${P(a0, r)} A${r},${r} 0 ${large} 1 ${P(a1, r)} L${P(a1, ri)} A${ri},${ri} 0 ${large} 0 ${P(a0, ri)} Z` : `M${cx},${cy} L${P(a0, r)} A${r},${r} 0 ${large} 1 ${P(a1, r)} Z`;
          const lr = ri ? (r + ri) / 2 : r * 0.64;
          const light = ["#eda100", "#e87ba4", "#1baf7a"].includes(SERIES[i % 8]);
          const el = (
            <g key={i} {...hit(labels[i], [{ color: SERIES[i % 8], name: labels[i], value: `${fmt(v, unit)} · ${pct}%` }])}>
              <path d={d} fill={SERIES[i % 8]} stroke={SURFACE} strokeWidth="2" fillRule="evenodd" />
              {pct >= 7 && <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={light ? INK : "#fff"} pointerEvents="none">{pct}%</text>}
            </g>
          );
          a0 = a1;
          return el;
        })}
        {donut && spec.total !== null && <><text x={cx} y={cy - 1} textAnchor="middle" fontSize="18" fontWeight="600" fill={INK}>{fmt(spec.total, unit)}</text><text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill={MUTED}>{unit}</text></>}
        {labels.map((l, i) => (
          <g key={i} transform={`translate(${lx}, ${ly + i * 24})`}>
            <rect width="10" height="10" y="-9" rx="2" fill={SERIES[i % 8]} />
            <text x="17" fontSize="11" fill={INK}>{short(l, narrow ? 30 : 24)}</text>
            <text x={lw} fontSize="11" textAnchor="end" fontWeight="600" fill={INK}>{fmt(series[0].values[i], unit)}</text>
          </g>
        ))}
      </svg>
    );
  };

  // ---- Vertical bars: single, grouped, stacked --------------------------------------------------------------------
  const vbars = (mode: "single" | "grouped" | "stacked") => {
    const H = 280, top = 22, left = 48, right = 12, n = labels.length, rot = n > 5 || labels.some((l) => l.length > 12);
    const bottom = rot ? 74 : 30, plotH = H - top - bottom, slot = (W - left - right) / n;
    const stackTop = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0));
    const all = mode === "stacked" ? stackTop : series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    const tk = ticks(Math.min(0, ...all), Math.max(0, ...all)), lo = tk[0], hi = tk[tk.length - 1];
    const Y = (v: number) => top + plotH * (1 - (v - lo) / (hi - lo)), y0 = Y(0);
    const k = mode === "grouped" ? series.length : 1;
    const bw = Math.min(24, (slot * 0.7 - (k - 1) * 2) / k);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, display: "block" }} role="img" aria-label={spec.title}>
        {tk.map((v) => <g key={v}><line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? AXIS : GRID} strokeWidth="1" /><text x={left - 6} y={Y(v) + 3.5} fontSize="10" textAnchor="end" fill={MUTED}>{fmt(v, unit)}</text></g>)}
        {labels.map((l, i) => {
          const cx = left + slot * i + slot / 2;
          const marks = mode === "stacked"
            ? (() => { let acc = 0; const last = series.map((s, si) => ((s.values[i] ?? 0) > 0 ? si : -1)).filter((x) => x >= 0).pop(); return series.map((s, si) => { const v = s.values[i] ?? 0; if (v <= 0) return null; const yA = Y(acc + v), yB = Y(acc); acc += v; const h = Math.max(0, yB - yA - (si === last ? 0 : 2)); return si === last ? <path key={si} d={barPath(cx - bw / 2, yA, bw, h, "up")} fill={SERIES[si % 8]} /> : <rect key={si} x={cx - bw / 2} y={yA + 2} width={bw} height={Math.max(0, h)} fill={SERIES[si % 8]} />; }); })()
            : series.map((s, si) => {
                const v = s.values[i]; if (v === null) return null;
                const x = cx - (k * bw + (k - 1) * 2) / 2 + (mode === "grouped" ? si * (bw + 2) : 0), y = v >= 0 ? Y(v) : y0, h = Math.max(1, Math.abs(Y(v) - y0));
                return <path key={si} d={barPath(x, y, bw, h, v >= 0 ? "up" : "down")} fill={SERIES[(mode === "single" ? 0 : si) % 8]} />;
              });
          const v = series[0].values[i];
          return (
            <g key={i} {...hit(l, rowsAt(i))}>
              <rect x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" />
              {marks}
              {mode === "single" && v !== null && n <= 16 && <text x={cx} y={v >= 0 ? Y(v) - 5 : Y(v) + 13} fontSize="10" textAnchor="middle" fontWeight="600" fill={INK}>{fmt(v, unit)}</text>}
              {mode === "stacked" && n <= 12 && unit !== "%" && <text x={cx} y={Y(stackTop[i]) - 5} fontSize="10" textAnchor="middle" fontWeight="600" fill={INK}>{fmt(stackTop[i], unit)}</text>}
              <text transform={`translate(${cx}, ${top + plotH + 14}) rotate(${rot ? 35 : 0})`} fontSize="10" textAnchor={rot ? "start" : "middle"} fill={INK2}>{short(l, rot ? 18 : 16)}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  // ---- Horizontal bars: single, grouped, stacked ------------------------------------------------------------------
  const hbars = (mode: "single" | "grouped" | "stacked") => {
    const k = mode === "grouped" ? series.length : 1, rowH = mode === "grouped" ? k * 14 + 12 : 28;
    const labW = narrow ? 126 : 170, right = 58, x0 = labW + 8, plotW = W - x0 - right, H = 14 + labels.length * rowH;
    const stackTot = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0));
    const all = mode === "stacked" ? stackTot : series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all) || 1;
    const X = (v: number) => x0 + plotW * ((v - lo) / (hi - lo)), xz = X(0);
    const bh = mode === "grouped" ? 12 : Math.min(18, rowH - 10);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, display: "block" }} role="img" aria-label={spec.title}>
        <line x1={xz} x2={xz} y1={6} y2={H - 4} stroke={AXIS} />
        {labels.map((l, i) => {
          const y = 8 + i * rowH;
          const marks = mode === "stacked"
            ? (() => { let acc = 0; const last = series.map((s, si) => ((s.values[i] ?? 0) > 0 ? si : -1)).filter((x) => x >= 0).pop(); return series.map((s, si) => { const v = s.values[i] ?? 0; if (v <= 0) return null; const xa = X(acc), w = X(acc + v) - xa - (si === last ? 0 : 2); acc += v; return si === last ? <path key={si} d={barPath(xa, y + (rowH - bh) / 2 - 4, Math.max(0, w), bh, "right")} fill={SERIES[si % 8]} /> : <rect key={si} x={xa} y={y + (rowH - bh) / 2 - 4} width={Math.max(0, w)} height={bh} fill={SERIES[si % 8]} />; }); })()
            : series.map((s, si) => {
                const v = s.values[i]; if (v === null) return null;
                const yy = mode === "grouped" ? y + si * 14 : y + (rowH - bh) / 2 - 4, w = Math.max(1, Math.abs(X(v) - xz));
                return <path key={si} d={barPath(v >= 0 ? xz : xz - w, yy, w, bh, v >= 0 ? "right" : "left")} fill={SERIES[(mode === "single" ? 0 : si) % 8]} />;
              });
          const end = mode === "stacked" ? (unit === "%" ? null : stackTot[i]) : mode === "single" ? series[0].values[i] : null;
          return (
            <g key={i} {...hit(l, rowsAt(i))}>
              <rect x={0} y={y - 4} width={W} height={rowH} fill="transparent" />
              <text x={labW} y={y + rowH / 2 - 0.5} fontSize="11" textAnchor="end" fill={INK}>{short(l, narrow ? 16 : 24)}</text>
              {marks}
              {end !== null && end !== undefined && <text x={X(Math.max(0, end)) + 6} y={y + rowH / 2 - 0.5} fontSize="10.5" fontWeight="600" fill={INK}>{fmt(end, unit)}</text>}
            </g>
          );
        })}
      </svg>
    );
  };

  // ---- Line / area (with a crosshair that snaps to the nearest x) -------------------------------------------------
  const lines = (area: boolean) => {
    const H = 270, top = 22, left = 50, right = narrow ? 34 : 56, bottom = 34, plotH = H - top - bottom, n = labels.length;
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    const mn = Math.min(...all), mx = Math.max(...all);
    const tk = ticks(mn < 0 ? mn : area || mn < mx * 0.5 ? 0 : mn * 0.95, mx);
    const lo = tk[0], hi = tk[tk.length - 1], step = n > 1 ? (W - left - right) / (n - 1) : 0;
    const X = (i: number) => left + step * i, Y = (v: number) => top + plotH * (1 - (v - lo) / (hi - lo));
    const every = Math.ceil(n / (narrow ? 5 : 9));
    const ends = series.map((s) => { const i = s.values.map((v, k) => (v === null ? -1 : k)).filter((k) => k >= 0).pop(); return i === undefined ? null : Y(s.values[i]!); }).filter((y): y is number => y !== null).sort((a, b) => a - b);
    const endLabels = series.length <= 4 && ends.every((y, k) => k === 0 || y - ends[k - 1] >= 12);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, display: "block" }} role="img" aria-label={spec.title}
        onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(n - 1, Math.round((vx - left) / (step || 1)))); show(e, labels[i], rowsAt(i)); setCross(i); }}
        onPointerLeave={() => { hide(); setCross(null); }}>
        {tk.map((v) => <g key={v}><line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? AXIS : GRID} /><text x={left - 6} y={Y(v) + 3.5} fontSize="10" textAnchor="end" fill={MUTED}>{fmt(v, unit)}</text></g>)}
        {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={X(i)} y={H - bottom + 16} fontSize="10" textAnchor="middle" fill={INK2}>{l}</text>)}
        {cross !== null && <line x1={X(cross)} x2={X(cross)} y1={top} y2={top + plotH} stroke={AXIS} />}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [X(i), Y(v)] as const));
          const segs: string[] = []; let cur = "";
          pts.forEach((p) => { if (p) cur += `${cur ? "L" : "M"}${p[0]},${p[1]}`; else if (cur) { segs.push(cur); cur = ""; } }); if (cur) segs.push(cur);
          const lastI = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() ?? 0;
          const firstI = s.values.findIndex((v) => v !== null);
          return (
            <g key={si}>
              {area && segs.map((d, j) => <path key={j} d={`${d}L${pts.filter(Boolean).slice(-1)[0]![0]},${Y(Math.max(lo, 0))}L${pts.find(Boolean)![0]},${Y(Math.max(lo, 0))}Z`} fill={SERIES[si % 8]} opacity="0.1" />)}
              {segs.map((d, j) => <path key={j} d={d} fill="none" stroke={SERIES[si % 8]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
              {cross !== null && s.values[cross] !== null && <circle cx={X(cross)} cy={Y(s.values[cross]!)} r="4" fill={SERIES[si % 8]} stroke={SURFACE} strokeWidth="2" />}
              {firstI >= 0 && <circle cx={X(lastI)} cy={Y(s.values[lastI]!)} r="4" fill={SERIES[si % 8]} stroke={SURFACE} strokeWidth="2" />}
              {endLabels && firstI >= 0 && <text x={X(lastI) + 7} y={Y(s.values[lastI]!) + 3.5} fontSize="10" fontWeight="600" fill={INK}>{fmt(s.values[lastI], unit)}</text>}
            </g>
          );
        })}
      </svg>
    );
  };
  const [cross, setCross] = useState<number | null>(null);

  // ---- Scatter ----------------------------------------------------------------------------------------------------
  const scatter = () => {
    const pts = spec.points ?? [];
    const H = 300, top = 18, left = 54, right = 18, bottom = 40, plotW = W - left - right, plotH = H - top - bottom;
    const tx = ticks(Math.min(0, ...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))), ty = ticks(Math.min(0, ...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
    const X = (v: number) => left + plotW * ((v - tx[0]) / (tx[tx.length - 1] - tx[0])), Y = (v: number) => top + plotH * (1 - (v - ty[0]) / (ty[ty.length - 1] - ty[0]));
    // Label the biggest points first and skip any label that would overlap one already placed.
    const placed: { x: number; y: number; w: number }[] = [], labelled = new Map<string, "start" | "end">();
    for (const p of [...pts].sort((a, b) => b.y - a.y).slice(0, pts.length <= 10 ? 10 : 6)) {
      const px = X(p.x), py = Y(p.y), w = Math.min(20, p.label.length) * 5.6, anchor = px > left + plotW * 0.62 ? "end" : "start";
      const x1 = anchor === "start" ? px + 8 : px - 8 - w;
      if (placed.some((q) => Math.abs(q.y - (py - 7)) < 12 && x1 < q.x + q.w && x1 + w > q.x)) continue;
      placed.push({ x: x1, y: py - 7, w }); labelled.set(p.label, anchor);
    }
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, display: "block" }} role="img" aria-label={spec.title}>
        {ty.map((v) => <g key={`y${v}`}><line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? AXIS : GRID} /><text x={left - 6} y={Y(v) + 3.5} fontSize="10" textAnchor="end" fill={MUTED}>{fmt(v, unit)}</text></g>)}
        {tx.map((v) => <text key={`x${v}`} x={X(v)} y={top + plotH + 14} fontSize="10" textAnchor="middle" fill={MUTED}>{fmt(v, spec.xUnit ?? "")}</text>)}
        <text x={left + plotW / 2} y={H - 6} fontSize="10" textAnchor="middle" fill={INK2}>{spec.xLabel}{spec.xUnit && spec.xUnit !== "%" ? ` (${spec.xUnit})` : ""}</text>
        <text transform={`translate(12, ${top + plotH / 2}) rotate(-90)`} fontSize="10" textAnchor="middle" fill={INK2}>{spec.yLabel}{unit && unit !== "%" ? ` (${unit})` : ""}</text>
        {pts.map((p, i) => (
          <g key={i} {...hit(p.label, [{ color: SERIES[0], name: spec.xLabel ?? "x", value: fmt(p.x, spec.xUnit ?? "") }, { color: SERIES[0], name: spec.yLabel ?? "y", value: fmt(p.y, unit) }])}>
            <circle cx={X(p.x)} cy={Y(p.y)} r="12" fill="transparent" />
            <circle cx={X(p.x)} cy={Y(p.y)} r="5" fill={SERIES[0]} stroke={SURFACE} strokeWidth="2" />
            {labelled.has(p.label) && <text x={labelled.get(p.label) === "end" ? X(p.x) - 8 : X(p.x) + 8} y={Y(p.y) - 7} fontSize="10" textAnchor={labelled.get(p.label)} fill={INK2}>{short(p.label, 20)}</text>}
          </g>
        ))}
      </svg>
    );
  };

  // ---- KPI tiles and the table view -------------------------------------------------------------------------------
  const kpi = () => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${narrow ? 120 : 140}px, 1fr))`, gap: 10 }}>
      {spec.labels.map((l, i) => (
        <div key={i} style={{ border: "1px solid rgba(11,11,11,0.10)", padding: "10px 12px", background: SURFACE }}>
          <div style={{ fontSize: 10, color: INK2 }} dir="auto">{l}</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: INK, marginTop: 4 }}>{fmt(series[0].values[i], spec.units?.[i] ?? unit)}</div>
          {(spec.units?.[i] ?? unit) && !["%", "×"].includes(spec.units?.[i] ?? unit) && <div style={{ fontSize: 10, color: MUTED }}>{spec.units?.[i] ?? unit}</div>}
        </div>
      ))}
    </div>
  );
  const tableRows = spec.type === "scatter"
    ? { head: ["", spec.xLabel ?? "x", spec.yLabel ?? "y"], body: (spec.points ?? []).map((p) => [p.label, fmt(p.x, spec.xUnit ?? ""), fmt(p.y, unit)]) }
    : { head: ["", ...series.map((s) => s.name)], body: labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i], spec.units?.[i] && spec.type === "kpi" ? spec.units[i] : unit))]) };
  const tableView = () => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        <thead><tr>{tableRows.head.map((h, i) => <th key={i} style={{ textAlign: i ? "right" : "left", padding: "5px 8px", borderBottom: `1px solid ${AXIS}`, color: INK2, fontWeight: 600 }} dir="auto">{h}</th>)}</tr></thead>
        <tbody>{tableRows.body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: j ? "right" : "left", padding: "4px 8px", borderBottom: `1px solid ${GRID}`, color: INK }} dir="auto">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  // ---- Downloads ------------------------------------------------------------------------------------------------
  const name = `${spec.title}`.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || `chart-${String(spec.metric)}-${String(spec.groupBy)}`.replace(/[^a-zA-Z0-9-]+/g, "-");
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const svgText = () => {
    const svg = box.current?.querySelector("svg");
    if (!svg) return "";
    const c = svg.cloneNode(true) as SVGSVGElement;
    const [, , w, h] = (c.getAttribute("viewBox") ?? `0 0 ${W} 300`).split(" ").map(Number);
    const legendH = series.length > 1 && view !== "pie" && view !== "donut" ? 22 * Math.ceil(series.length / 3) : 0, head = 56 + legendH, foot = 26;
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", String(w)); c.setAttribute("height", String(h)); c.setAttribute("y", String(head));
    const legend = legendH ? series.map((s, i) => `<g transform="translate(${12 + (i % 3) * ((w - 24) / 3)}, ${60 + Math.floor(i / 3) * 22})"><rect width="10" height="10" y="-9" rx="2" fill="${SERIES[i % 8]}"/><text x="16" font-size="11" fill="${INK2}">${esc(short(s.name, 26))}</text></g>`).join("") : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + head + foot}" viewBox="0 0 ${w} ${h + head + foot}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>` +
      `<text x="12" y="24" font-size="14" font-weight="600" fill="${INK}">${esc(spec.title)}</text><text x="12" y="42" font-size="10" fill="${INK2}">${esc([spec.period, unit && !["%", "×"].includes(unit) ? unit : ""].filter(Boolean).join(" · "))}</text>` +
      legend + new XMLSerializer().serializeToString(c) + `<text x="12" y="${h + head + 16}" font-size="9" fill="${MUTED}">${esc(spec.note ?? "")}</text></svg>`;
  };
  const download = async (kind: "png" | "svg" | "csv") => {
    if (kind === "csv") {
      const q = (x: string) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
      const raw = spec.type === "scatter" ? [["label", spec.xLabel ?? "x", spec.yLabel ?? "y"], ...(spec.points ?? []).map((p) => [p.label, String(p.x), String(p.y)])]
        : [[String(spec.groupBy || "item"), ...series.map((s) => s.name)], ...labels.map((l, i) => [l, ...series.map((s) => (s.values[i] === null ? "" : String(s.values[i])))])];
      return saveFile(`${name}.csv`, "﻿" + raw.map((r) => r.map(q).join(",")).join("\n"), "text/csv");
    }
    const txt = svgText();
    if (!txt) return;
    if (kind === "svg") return saveFile(`${name}.svg`, txt, "image/svg+xml");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(txt)}`;
    await img.decode();
    const k = 2, cv = document.createElement("canvas");
    cv.width = img.width * k; cv.height = img.height * k;
    const g = cv.getContext("2d")!; g.scale(k, k); g.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), "image/png"));
    await saveFile(`${name}.png`, blob, "image/png");
  };

  const LABEL: Record<ChartType, string> = { pie: t("Pie"), donut: t("Donut"), bar: t("Bars"), hbar: t("Horizontal"), line: t("Line chart"), area: t("Area"), stacked: t("Stacked"), stackedh: t("Stacked (horizontal)"), grouped: t("Side by side"), scatter: t("Scatter"), table: t("Table"), kpi: t("Figures") };
  const body = table ? tableView() : view === "kpi" ? kpi() : view === "pie" || view === "donut" ? pie(view === "donut") : view === "scatter" ? scatter()
    : view === "line" || view === "area" ? lines(view === "area") : view === "hbar" ? hbars("single") : view === "stackedh" ? hbars("stacked")
    : view === "stacked" ? vbars("stacked") : view === "grouped" ? (narrow && labels.length > 3 ? hbars("grouped") : vbars("grouped")) : vbars("single");

  return (
    <div className="panel chart-card" style={{ padding: 14, background: SURFACE, position: "relative" }} dir="ltr">
      <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }} dir="auto">{spec.title}</div>
      <div style={{ fontSize: 10, color: INK2, marginBottom: 8 }} dir="auto">
        {[spec.subtitle, spec.period, unit && spec.type !== "kpi" && !["%", "×", "index", "rank"].includes(unit) ? unit : "", spec.total !== null ? `${t("total")} ${fmt(spec.total, unit)}` : ""].filter(Boolean).join(" · ")}
      </div>
      {!table && view !== "pie" && view !== "donut" && view !== "kpi" && view !== "scatter" && <Legend series={series} kind={view === "line" || view === "area" ? "line" : "rect"} />}
      <div ref={box} style={{ position: "relative" }} onPointerLeave={hide}>
        {body}
        {tip && !table && (
          <div style={{ position: "absolute", left: Math.min(Math.max(0, tip.x + 12), Math.max(0, width - 190)), top: Math.max(0, tip.y - 12), pointerEvents: "none", background: "#fff", border: "1px solid rgba(11,11,11,0.10)", boxShadow: "0 4px 14px rgba(0,0,0,0.08)", padding: "7px 9px", fontSize: 11, minWidth: 120, maxWidth: 220, zIndex: 2 }}>
            <div style={{ color: INK2, marginBottom: 4 }} dir="auto">{tip.title}</div>
            {tip.rows.slice(0, 8).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {tip.rows.length > 1 && <span style={{ width: 10, height: 2, background: r.color, flex: "0 0 auto" }} />}
                <b style={{ color: INK }}>{r.value}</b>
                {tip.rows.length > 1 && <span style={{ color: INK2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="auto">{r.name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {spec.note && <div style={{ fontSize: 9.5, color: MUTED, marginTop: 6 }} dir="auto">{spec.note}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        {options.length > 1 && options.map((x) => <button key={x} className="chip" style={{ fontSize: 10, ...(x === view && !table ? { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 700 } : {}) }} onClick={() => { setType(x); setTable(false); }}>{LABEL[x]}</button>)}
        <button className="chip" style={{ fontSize: 10, ...(table ? { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 700 } : {}) }} onClick={() => setTable(!table)}>{t("Table")}</button>
        <div style={{ flex: 1 }} />
        {!table && view !== "kpi" && <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => download("png")}>{t("Download PNG")}</button>}
        {!table && view !== "kpi" && <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => download("svg")}>SVG</button>}
        <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => download("csv")}>CSV</button>
      </div>
    </div>
  );
}
