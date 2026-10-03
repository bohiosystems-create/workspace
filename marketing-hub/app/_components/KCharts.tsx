"use client";
// The app's charts, at the quality of the report's ▶ Play slides and in Kinan's style: columns with targets and a
// change call-out, bars against a benchmark with chips, gauges with ticks and an outlook bar, a smooth sparkline and a
// range bar. Light surface, charcoal ink, Kinan orange for the latest / focus mark, status colours with an icon and a
// label (never colour alone), direct value labels, a hover tooltip on every mark, and entrance motion (kc-* classes in
// globals.css; still for reduced motion). Numbers are formatted here only; every value comes from the data.
import { useRef, useState } from "react";
import { useI18n } from "./lang";
import { box, shade, DEPTH } from "@/lib/chart3d";

export const KC = { or: "#f15a22", ink: "#2e2e2f", taupe: "#51473d", soft: "#6f6f6f", grey: "#9c9ea1", track: "#efeeec", grid: "#e6e5e2", good: "#1f8a4c", warn: "#d99400", crit: "#d03b3b" };
const fmt = (v: number, d = 1) => (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
let uid = 0;
const nid = () => `kc${(++uid).toString(36)}`;
const d = (ms: number) => ({ animationDelay: `${ms}ms` });

// ------------------------------------------------------------------ tooltip
type Tip = { x: number; y: number; title: string; rows: [string, string][] } | null;
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = (e: React.PointerEvent, title: string, rows: [string, string][]) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, rows });
  };
  const hide = () => setTip(null);
  const Tip = () => tip ? (
    <div className="kc-tip" style={{ left: Math.min(tip.x + 14, (box.current?.clientWidth ?? 300) - 180), top: Math.max(0, tip.y - 10) }}>
      <div className="kc-tip-t">{tip.title}</div>
      {tip.rows.map(([v, l], i) => <div key={i} className="kc-tip-r"><b dir="ltr">{v}</b><span>{l}</span></div>)}
    </div>
  ) : null;
  return { box, show, hide, Tip };
}

function smooth(pts: [number, number][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  let s = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; s += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return s;
}

// ------------------------------------------------------------------ columns (actual vs target by period)
export function KColumns({ labels, values, target, unit = "", decimals = 1, title, sub, latestLabel, actualLabel, targetLabel, underPct = 0.9, height = 230 }: {
  labels: string[]; values: number[]; target?: (number | null)[]; unit?: string; decimals?: number; title?: string; sub?: string;
  latestLabel?: string; actualLabel?: string; targetLabel?: string; underPct?: number; height?: number;
}) {
  const { t } = useI18n();
  const tip = useTip(); const id = nid();
  const tg = target ?? [], n = values.length, W = 700, H = height, top = 34, pad = 8;
  const max = Math.max(...values, ...tg.map((x) => x ?? 0), 0.0001) * 1.16;
  const slot = (W - pad * 2 - DEPTH.dx) / Math.max(1, n), bw = Math.min(70, slot * 0.56), x = (i: number) => pad + slot * (i + 0.5), y = (v: number) => H - ((H - top) * v) / max;
  const callout = n > 1 && values[n - 2] ? 28 : 0; // room above the plot for the change call-out
  const last = n - 1, prev = values[last - 1], delta = prev ? ((values[last] - prev) / prev) * 100 : null;
  const bubble = delta != null ? `${delta >= 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(delta))}% ${t("vs")} ${labels[last - 1]}` : "";
  const bw2 = 22 + bubble.length * 6.6, bx = Math.min(W - pad - bw2, Math.max(pad, x(last) - bw2 / 2)), by = 2;
  return (
    <div className="kc">
      {(title || sub) && <div className="kc-head">{title && <div className="kc-title">{title}</div>}{sub && <div className="kc-sub">{sub}</div>}</div>}
      <div className="kc-legend"><span><i style={{ background: KC.ink }} />{actualLabel ?? t("Actual")}</span><span><i style={{ background: KC.or }} />{latestLabel ?? t("Latest month")}</span>{tg.length > 0 && <span><i className="dash" />{targetLabel ?? t("Target")}</span>}</div>
      <div ref={tip.box} style={{ position: "relative" }} onPointerLeave={tip.hide}>
        <svg viewBox={`0 ${-callout} ${W} ${H + 28 + callout}`} style={{ direction: "ltr" }} aria-hidden="true">
          <defs>
            <linearGradient id={`${id}h`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff7a45" /><stop offset="1" stopColor={KC.or} /></linearGradient>
            <linearGradient id={`${id}c`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5a5a5c" /><stop offset="1" stopColor={KC.ink} /></linearGradient>
            <linearGradient id={`${id}r`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e86a6a" /><stop offset="1" stopColor={KC.crit} /></linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W - pad} y1={H - (H - top) * g} y2={H - (H - top) * g} stroke={KC.grid} />)}
          <path d={`M${pad},${H} L${pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad},${H} Z`} fill="#f1f0ee" />
          <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#bdbcb8" />
          {values.map((v, i) => {
            const hot = i === last, tv = tg[i] ?? null, under = tv != null && v < tv * underPct;
            const rows: [string, string][] = [[`${fmt(v, decimals)} ${unit}`, actualLabel ?? t("Actual")], ...(tv != null ? [[`${fmt(tv, decimals)} ${unit}`, targetLabel ?? t("Target")] as [string, string], [`${Math.round((v / tv) * 100)}%`, t("Of target")] as [string, string]] : [])];
            return (
              <g key={i} onPointerMove={(e) => tip.show(e, labels[i], rows)}>
                <rect x={x(i) - slot / 2} y={top - 20} width={slot} height={H - top + 48} fill="transparent" />
                {(() => { const b = box(x(i) - bw / 2, y(v), bw, H - y(v)), base = under ? KC.crit : hot ? KC.or : KC.ink; return (
                  <g className="kc-gy" style={d(100 + i * 100)}>
                    <path d={b.side} fill={shade(base, 0.62)} />
                    <path d={b.top} fill={shade(base, 1.35)} />
                    <path d={b.front} fill={`url(#${id}${under ? "r" : hot ? "h" : "c"})`} />
                  </g>); })()}
                {tv != null && <line className="kc-fade" x1={x(i) - bw / 2 - 7} x2={x(i) + bw / 2 + 7} y1={y(tv)} y2={y(tv)} stroke={under ? KC.crit : KC.ink} strokeWidth="2" strokeDasharray="5 4" style={d(700 + i * 100)} />}
                <text className="kc-fade" x={x(i) + DEPTH.dx / 2} y={Math.min(y(v) + DEPTH.dy, tv != null ? y(tv) : 9e9) - 8} textAnchor="middle" fontSize="15" fontWeight="700" fill={under ? KC.crit : hot ? KC.or : KC.ink} style={{ fontVariantNumeric: "tabular-nums", ...d(800 + i * 100) }}>{fmt(v, decimals)}</text>
                <text x={x(i)} y={H + 20} textAnchor="middle" fontSize="12" fill={KC.soft}>{labels[i]}</text>
              </g>
            );
          })}
          {delta != null && n > 1 && <g className="kc-pop" style={d(1300)}><line x1={x(last)} x2={x(last)} y1={by + 22 - callout} y2={Math.min(y(values[last]), tg[last] != null ? y(tg[last]!) : 9e9) - 22} stroke={KC.or} strokeWidth="1" strokeDasharray="2 3" /><rect x={bx} y={by - callout} width={bw2} height="22" rx="11" fill="#fff" stroke={KC.or} /><text x={bx + bw2 / 2} y={by - callout + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill={KC.ink}>{bubble}</text></g>}
        </svg>
        <tip.Tip />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ horizontal bars with a benchmark
export function KHBars({ rows, unit = "", decimals = 1, max: max0, bench, hot, best, title, sub, labelWidth = "34%" }: {
  rows: { label: string; value: number; sub?: string; note?: string }[]; unit?: string; decimals?: number; max?: number;
  bench?: { value: number; label: string } | null; /** rows flagged red (with the chip text) */ hot?: (r: { value: number }, i: number) => string | null;
  /** rows flagged green (with the chip text) */ best?: (r: { value: number }, i: number) => string | null; title?: string; sub?: string; labelWidth?: string;
}) {
  const tip = useTip();
  const max = max0 ?? Math.max(...rows.map((r) => r.value), bench?.value ?? 0, 0.0001) * 1.1;
  return (
    <div className="kc">
      {(title || sub) && <div className="kc-head">{title && <div className="kc-title">{title}</div>}{sub && <div className="kc-sub">{sub}</div>}</div>}
      <div ref={tip.box} className="kc-bars" style={{ ["--kc-lab" as any]: labelWidth, paddingTop: bench ? 18 : 2 }} onPointerLeave={tip.hide}>
        {bench && <div className="kc-bench kc-fade" style={{ insetInlineStart: `calc(var(--kc-lab) + 10px + (100% - var(--kc-lab) - 10px - 64px - 10px - 60px) * ${Math.min(1, bench.value / max)})`, ...d(800) }}><span>{bench.label}</span></div>}
        {rows.map((r, i) => {
          const h = hot?.(r, i) ?? null, b = !h ? best?.(r, i) ?? null : null;
          const col = h ? KC.crit : b ? KC.good : KC.grey;
          return (
            <div key={i} className="kc-br" onPointerMove={(e) => tip.show(e, r.label, [[`${fmt(r.value, decimals)}${unit}`, r.sub ?? ""], ...(r.note ? [["", r.note] as [string, string]] : [])])}>
              <div className="kc-br-l">{r.label}{r.sub && <small>{r.sub}</small>}</div>
              <div className="kc-br-t"><div className="kc-br-f kc-gx" style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, background: `linear-gradient(90deg, ${col}aa, ${col})`, ...d(100 + i * 90) }} /></div>
              <div className="kc-br-v" dir="ltr" style={{ color: h ? KC.crit : KC.ink }}>{fmt(r.value, decimals)}{unit}</div>
              <div className="kc-br-c">{h ? <span className="kc-chip" style={{ borderColor: KC.crit, color: KC.crit }}>{h}</span> : b ? <span className="kc-chip" style={{ borderColor: KC.good, color: KC.good }}>{b}</span> : null}</div>
            </div>
          );
        })}
        <tip.Tip />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ gauges
export function KGauges({ items }: { items: { label: string; pct: number; actual: string; target: string; outlook?: { label: string; forecast: number; target: number } }[] }) {
  const { t } = useI18n();
  const R = 58, C = 2 * Math.PI * R;
  return (
    <div className="kc-gauges" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, items.length))}, 1fr)` }}>
      {items.map((it, i) => {
        const p = Math.max(0, it.pct), [col, ic, label] = p >= 95 ? [KC.good, "✓", t("On track")] : p >= 75 ? [KC.warn, "!", t("Watch")] : [KC.crit, "✕", t("Behind")];
        const len = (Math.min(100, p) / 100) * C;
        return (
          <div key={i} className="kc-g">
            <svg viewBox="0 0 160 160" style={{ maxWidth: 150, margin: "0 auto" }} aria-hidden="true">
              {Array.from({ length: 40 }, (_, k) => { const a = (k / 40) * 2 * Math.PI - Math.PI / 2, r1 = 76, r2 = k % 10 === 0 ? 70 : 73; return <line key={k} x1={80 + r1 * Math.cos(a)} y1={80 + r1 * Math.sin(a)} x2={80 + r2 * Math.cos(a)} y2={80 + r2 * Math.sin(a)} stroke={k / 40 <= p / 100 ? col : "#d6d5d2"} strokeWidth={k % 10 === 0 ? 1.6 : 1} />; })}
              <circle cx="80" cy="84" r={R} fill="none" stroke="#dcdbd8" strokeWidth="12" />
              <circle cx="80" cy="80" r={R} fill="none" stroke={KC.track} strokeWidth="12" />
              <circle className="kc-arc" cx="80" cy="84" r={R} fill="none" stroke={shade(col, 0.6)} strokeWidth="12" strokeLinecap="round" transform="rotate(-90 80 84)" strokeDasharray={`${len} ${C}`} style={{ ["--len" as any]: len, ...d(150 + i * 150) }} />
              <circle className="kc-arc" cx="80" cy="80" r={R} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" transform="rotate(-90 80 80)" strokeDasharray={`${len} ${C}`} style={{ ["--len" as any]: len, ...d(150 + i * 150) }} />
              <text x="80" y="88" textAnchor="middle" fontSize="30" fontWeight="700" fill={KC.ink} style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(p)}%</text>
            </svg>
            <div className="kc-chip" style={{ borderColor: col, color: col }}>{ic} {label}</div>
            <div className="kc-g-l">{it.label}</div><div className="kc-g-n" dir="ltr">{it.actual} / {it.target}</div>
            {it.outlook && (() => { const f = Math.min(100, (it.outlook.forecast / Math.max(it.outlook.target, 0.0001)) * 100), c = f >= 95 ? KC.good : f >= 75 ? KC.warn : KC.crit;
              return <div className="kc-ol">{it.outlook.label}<div className="kc-ol-t"><div className="kc-ol-f kc-gx" style={{ width: `${f}%`, background: c, ...d(900 + i * 150) }} /><div className="kc-ol-m" /></div><span dir="ltr"><b>{fmt(it.outlook.forecast)}</b> / {fmt(it.outlook.target)}</span></div>; })()}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ sparkline (smooth line + area, end dot)
export function KSpark({ values, down, width = 84, height = 24 }: { values: number[] | null | undefined; down?: boolean; width?: number; height?: number }) {
  if (!values || values.length < 4) return null;
  const id = nid(), max = Math.max(...values, 0.0001), min = Math.min(...values) * 0.85;
  const pts = values.map((v, i) => [3 + ((width - 6) * i) / (values.length - 1), height - 3 - ((height - 7) * (v - min)) / Math.max(0.0001, max - min)] as [number, number]);
  const p = smooth(pts), col = down ? KC.crit : KC.good, end = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ verticalAlign: "middle", flex: "none", overflow: "visible", direction: "ltr" }}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".28" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path className="kc-fade" d={`${p} L${end[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} style={d(600)} />
      <path className="kc-draw" d={p} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" pathLength={1} />
      <circle className="kc-pop" cx={end[0]} cy={end[1]} r="3" fill={col} stroke="#fff" strokeWidth="1.5" style={d(900)} />
    </svg>
  );
}

// ------------------------------------------------------------------ range bar (estimate with its band)
export function KRange({ lo, hi, point, par, max = 100, color = KC.or, tone }: { lo: number; hi: number; point?: number; /** reference mark (e.g. the benchmark) as a value */ par?: number; max?: number; color?: string; tone?: "good" | "bad" }) {
  const c = tone === "bad" ? KC.crit : tone === "good" ? KC.good : color, X = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="kc-range" dir="ltr">
      {par != null && <div className="kc-range-par" style={{ left: X(par) }} />}
      <div className="kc-range-band kc-gx" style={{ left: X(lo), width: `calc(${X(hi)} - ${X(lo)})`, background: `${c}66` }} />
      {point != null && <div className="kc-range-pt kc-pop" style={{ left: X(point), background: c, ...d(500) }} />}
    </div>
  );
}
