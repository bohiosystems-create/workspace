"use client";
/**
 * Kinan chart kit for the Project tab: counting KPIs, a progress ring, gauges, 3D columns and donuts (geometry from
 * lib/chart3d.ts, shared with the marketing assistant), an S-curve and a milestone timeline. Charcoal ink, Kinan
 * orange for the focus mark, status colours always with a label, direct value labels, entrance motion that is
 * still under reduced motion (kc-* classes in globals.css).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { box, pie3d, shade, DEPTH } from "@/lib/chart3d";
import { KINAN } from "@/lib/brand";

export const C = { or: KINAN.orange, ink: "var(--ink)", inkHex: KINAN.charcoal, taupe: "var(--taupe)", mute: "var(--mute)", grid: "var(--line)", good: KINAN.green, warn: "#d99400", crit: KINAN.alert, blue: "#3b7fe0", violet: "#7a5bc9", teal: "#1aa093" };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (v: number, d = 0) => v.toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });
const d = (ms: number) => ({ animationDelay: `${ms}ms` });
let uid = 0;
const nid = () => `k${(++uid).toString(36)}`;

/** Eases a number from its previous value to `target` (instant under reduced motion). */
export function useCountUp(target: number, ms = 1000) {
  const [v, setV] = useState(() => (reduced() ? target : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      setV(start + (target - start) * e);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
/** First paint → true on the next frame; lets CSS transitions run from an initial state. */
function useMounted() { const [on, setOn] = useState(reduced()); useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, []); return on; }

// ------------------------------------------------------------------ KPI
export function Kpi({ value, text, label, sub, bad, decimals = 0, prefix = "", suffix = "" }: { value?: number; text?: string; label: string; sub?: string; bad?: boolean; decimals?: number; prefix?: string; suffix?: string }) {
  const v = useCountUp(value ?? 0);
  return (
    <div className="kpi">
      <em>{label}</em>
      <b className={bad ? "bad" : ""}>{text ?? `${prefix}${fmt(v, decimals)}${suffix}`}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

export function Panel({ title, sub, children, aside }: { title: string; sub?: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="panel"><header><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{aside}</header>{children}</section>;
}

// ------------------------------------------------------------------ progress ring
export function Ring({ pct, plan, label = "complete", size = 132 }: { pct: number; plan?: number; label?: string; size?: number }) {
  const on = useMounted(), v = useCountUp(pct), r = 46, c = 2 * Math.PI * r;
  const tick = (p: number) => { const a = (-90 + (p / 100) * 360) * (Math.PI / 180); return { x1: 60 + (r - 7) * Math.cos(a), y1: 60 + (r - 7) * Math.sin(a), x2: 60 + (r + 7) * Math.cos(a), y2: 60 + (r + 7) * Math.sin(a) }; };
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className="ring" aria-label={`${pct}% ${label}`}>
      <circle cx="60" cy="60" r={r} className="ring-t" />
      <circle cx="60" cy="60" r={r} className="ring-f" transform="rotate(-90 60 60)" style={{ strokeDasharray: c, strokeDashoffset: on ? c * (1 - Math.min(100, pct) / 100) : c }} />
      {plan != null && <line {...tick(plan)} className="ring-tick" />}
      <text x="60" y="57" textAnchor="middle" className="ring-v">{fmt(v, 1)}%</text>
      <text x="60" y="74" textAnchor="middle" className="ring-l">{label}</text>
      {plan != null && <text x="60" y="88" textAnchor="middle" className="ring-p">plan {fmt(plan, 1)}%</text>}
    </svg>
  );
}

// ------------------------------------------------------------------ gauge
export function Gauge({ value, min, max, bands, label, decimals = 2, size = 150 }: { value: number; min: number; max: number; bands: { to: number; color: string; name: string }[]; label: string; decimals?: number; size?: number }) {
  const on = useMounted(), v = useCountUp(value);
  const cx = 70, cy = 66, r = 50;
  const ang = (x: number) => Math.PI - (Math.max(min, Math.min(max, x)) - min) / (max - min) * Math.PI;
  const pt = (x: number, rr: number) => [cx + rr * Math.cos(ang(x)), cy - rr * Math.sin(ang(x))] as const;
  const arc = (a: number, b: number, rr: number) => { const [x1, y1] = pt(a, rr), [x2, y2] = pt(b, rr); return `M${x1},${y1} A${rr},${rr} 0 0 1 ${x2},${y2}`; };
  const band = bands.find((b) => value <= b.to) ?? bands[bands.length - 1];
  // The needle is drawn pointing left (= min); a clockwise SVG rotation of (180° − angle) swings it to the value.
  const deg = on ? 180 - (ang(value) * 180) / Math.PI : 0;
  let from = min;
  return (
    <div className="gauge">
      <svg viewBox="0 0 140 86" width={size} height={size * 0.62}>
        {bands.map((b, i) => { const p = <path key={i} d={arc(from, b.to, r)} stroke={b.color} strokeWidth="10" fill="none" strokeOpacity=".35" />; from = b.to; return p; })}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => { const x = min + (max - min) * t; const [x1, y1] = pt(x, r - 8), [x2, y2] = pt(x, r + 8); return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.mute} strokeWidth="1" />; })}
        <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 1.3s cubic-bezier(.2,.8,.2,1)" }}>
          <line x1={cx} y1={cy} x2={cx - r + 4} y2={cy} stroke={band.color} strokeWidth="3" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="5" fill={band.color} />
        </g>
        <text x={cx} y={cy - 14} textAnchor="middle" className="gauge-v">{fmt(v, decimals)}</text>
      </svg>
      <div className="gauge-l">{label}</div>
      <span className="kc-chip" style={{ color: band.color, borderColor: band.color }}>{band.name}</span>
    </div>
  );
}

// ------------------------------------------------------------------ 3D columns
export function Columns3D({ rows, unit = "", decimals = 0, max: max0, height = 170, targetLabel }: {
  rows: { label: string; value: number; target?: number; color?: string; sub?: string }[]; unit?: string; decimals?: number; max?: number; height?: number; targetLabel?: string;
}) {
  const id = nid(), n = rows.length, W = 360, H = height, top = 30, pad = 10;
  const max = max0 ?? Math.max(...rows.map((r) => Math.max(r.value, r.target ?? 0)), 0.0001) * 1.15;
  const slot = (W - pad * 2 - DEPTH.dx) / Math.max(1, n), bw = Math.min(52, slot * 0.58);
  const x = (i: number) => pad + slot * (i + 0.5), y = (v: number) => H - ((H - top) * v) / max;
  return (
    <div className="kc">
      <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ direction: "ltr" }} aria-hidden="true">
        <defs>{rows.map((r, i) => { const c = r.color ?? C.inkHex; return <linearGradient key={i} id={`${id}${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={shade(c, 1.25)} /><stop offset="1" stopColor={c} /></linearGradient>; })}</defs>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W - pad} y1={H - (H - top) * g} y2={H - (H - top) * g} stroke={C.grid} />)}
        <path d={`M${pad},${H} L${pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad + DEPTH.dx},${H + DEPTH.dy} L${W - pad},${H} Z`} className="kc-floor" />
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke={C.mute} />
        {rows.map((r, i) => {
          const c = r.color ?? C.inkHex, b = box(x(i) - bw / 2, y(r.value), bw, H - y(r.value));
          return (
            <g key={i}>
              {r.value > 0 && <g className="kc-gy" style={d(80 + i * 70)}>
                <path d={b.side} fill={shade(c, 0.62)} /><path d={b.top} fill={shade(c, 1.4)} /><path d={b.front} fill={`url(#${id}${i})`} />
              </g>}
              {r.target != null && <line className="kc-fade" x1={x(i) - bw / 2 - 6} x2={x(i) + bw / 2 + 6} y1={y(r.target)} y2={y(r.target)} stroke={C.or} strokeWidth="2" strokeDasharray="5 4" style={d(600 + i * 70)} />}
              <text className="kc-fade" x={x(i) + DEPTH.dx / 2} y={Math.min(y(r.value) + DEPTH.dy, r.target != null ? y(r.target) : 9e9) - 7} textAnchor="middle" fontSize="12" fontWeight="700" fill={c === C.inkHex ? "var(--ink)" : c} style={{ fontVariantNumeric: "tabular-nums", ...d(700 + i * 70) }}>{fmt(r.value, decimals)}{unit}</text>
              <text x={x(i)} y={H + 16} textAnchor="middle" fontSize="10.5" fill={C.mute}>{r.label}</text>
              {r.sub && <text x={x(i)} y={H + 27} textAnchor="middle" fontSize="9" fill={C.mute}>{r.sub}</text>}
            </g>
          );
        })}
      </svg>
      {targetLabel && <div className="kc-legend"><span><i className="dash" />{targetLabel}</span></div>}
    </div>
  );
}

// ------------------------------------------------------------------ 3D donut
export function Donut3D({ segs, centre, centreSub }: { segs: { label: string; value: number; color: string }[]; centre?: string; centreSub?: string }) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  let a = -Math.PI / 2;
  const angles = segs.map((s) => { const a0 = a; a += (s.value / total) * 2 * Math.PI; return { a0, a1: a }; });
  const p = pie3d(angles, { cx: 92, cy: 66, r: 72, inner: 40, tilt: 0.58, depth: 16 });
  return (
    <div className="donut">
      <svg viewBox="0 0 184 130" width="184" height="130" aria-hidden="true">
        {p.inner.map((w, i) => <path key={`i${i}`} className="kc-fade" d={w.d} fill={shade(segs[w.i].color, 0.55)} style={d(400)} />)}
        {p.outer.map((w, i) => <path key={`o${i}`} className="kc-fade" d={w.d} fill={shade(segs[w.i].color, 0.72)} style={d(400)} />)}
        {p.tops.map((t, i) => segs[i].value > 0 && <path key={`t${i}`} className="kc-pop" d={t} fill={segs[i].color} stroke="var(--card)" strokeWidth="1" style={d(60 + i * 90)} />)}
        {centre && <text x="92" y="64" textAnchor="middle" className="donut-c">{centre}</text>}
        {centreSub && <text x="92" y="77" textAnchor="middle" className="donut-s">{centreSub}</text>}
      </svg>
      <ul className="donut-l">
        {segs.filter((s) => s.value > 0).map((s, i) => <li key={i} className="kc-fade" style={d(300 + i * 60)}><i style={{ background: s.color }} /><span>{s.label}</span><b>{fmt(s.value)}</b></li>)}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ S-curve
export function Curve({ points, height = 150 }: { points: { date: string; planned: number; actual: number | null; forecast: number; today?: boolean }[]; height?: number }) {
  const W = 360, H = height, pad = 12, top = 14;
  const t = (s: string) => Date.parse(s) / 86400000, t0 = t(points[0]?.date ?? "2026-01-01"), t1 = t(points[points.length - 1]?.date ?? "2026-12-31") || t0 + 1;
  const x = (p: { date: string }) => pad + ((W - pad * 2) * (t(p.date) - t0)) / Math.max(1, t1 - t0), y = (v: number) => H - ((H - top) * v) / 100;
  const line = (f: (p: (typeof points)[0]) => number | null) => points.filter((p) => f(p) != null).map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(f(p)!).toFixed(1)}`).join(" ");
  const planned = line((p) => p.planned), actual = line((p) => p.actual), forecast = line((p) => p.forecast);
  const now = points.find((p) => p.today) ?? points[0];
  const years = points.map((p) => ({ p, y: p.date.slice(0, 4) })).filter((q, i, arr) => i === 0 || arr[i - 1].y !== q.y);
  const right = x(now) > W * 0.55;
  return (
    <div className="kc">
      <svg viewBox={`0 0 ${W} ${H + 22}`} aria-hidden="true">
        {[25, 50, 75, 100].map((g) => <g key={g}><line x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke={C.grid} /><text x={W - pad} y={y(g) - 3} textAnchor="end" fontSize="9" fill={C.mute}>{g}%</text></g>)}
        <path d={`${forecast} L${W - pad},${H} L${pad},${H} Z`} fill={C.or} fillOpacity=".06" />
        <path d={planned} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="5 4" className="kc-draw" pathLength={1} />
        <path d={forecast} fill="none" stroke={C.or} strokeWidth="1.2" strokeOpacity=".5" strokeDasharray="2 3" className="kc-draw" pathLength={1} style={d(300)} />
        {actual && <path d={actual} fill="none" stroke={C.or} strokeWidth="3" strokeLinecap="round" className="kc-draw" pathLength={1} style={d(200)} />}
        <line x1={x(now)} x2={x(now)} y1={top} y2={H} stroke={C.or} strokeWidth="1" strokeDasharray="3 3" />
        <g className="kc-pop" style={d(1300)}><circle cx={x(now)} cy={y(now.actual ?? now.forecast)} r="5" fill={C.or} stroke="var(--card)" strokeWidth="2" /><text x={x(now) + (right ? -9 : 9)} y={y(now.actual ?? now.forecast) - 8} textAnchor={right ? "end" : "start"} fontSize="12" fontWeight="700" fill={C.or}>{fmt(now.actual ?? now.forecast, 1)}% today</text></g>
        {years.map((q) => <text key={q.y} x={x(q.p)} y={H + 16} fontSize="10" fill={C.mute}>{q.y}</text>)}
      </svg>
      <div className="kc-legend"><span><i style={{ background: C.or }} />Earned</span><span><i className="dash" />Baseline</span><span><i className="dot" style={{ background: C.or }} />Forecast</span></div>
    </div>
  );
}

// ------------------------------------------------------------------ milestone timeline
export function Timeline({ items, today }: { items: { id: string; name: string; baseline: string; forecast: string; varianceDays: number }[]; today: string }) {
  const days = (s: string) => Date.parse(s.slice(0, 10)) / 86400000;
  const all = items.flatMap((m) => [days(m.baseline), days(m.forecast)]).concat(days(today));
  const lo = Math.min(...all) - 6, hi = Math.max(...all) + 6, W = 360, L = 118, rowH = 30, H = items.length * rowH + 8;
  const x = (s: string) => L + ((W - L - 12) * (days(s) - lo)) / Math.max(1, hi - lo);
  const month = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="tl" aria-label="Milestones">
      <line x1={x(today)} x2={x(today)} y1={0} y2={H} stroke={C.or} strokeDasharray="3 3" />
      <text x={x(today) + 4} y={H + 13} fontSize="9.5" fill={C.or} fontWeight="700">today</text>
      {items.map((m, i) => {
        const cy = i * rowH + 18, late = m.varianceDays > 0, col = late ? C.crit : C.good;
        const bx = x(m.baseline), fx = x(m.forecast);
        return (
          <g key={m.id} className="kc-fade" style={d(80 + i * 90)}>
            <line x1={L} x2={W - 12} y1={cy} y2={cy} stroke={C.grid} />
            <text x={0} y={cy + 4} fontSize="10.5" fill="var(--ink)" fontWeight="600">{m.name.length > 22 ? m.name.slice(0, 21) + "…" : m.name}</text>
            {Math.abs(fx - bx) > 1 && <line x1={bx} x2={fx} y1={cy} y2={cy} stroke={col} strokeWidth="5" strokeOpacity=".35" strokeLinecap="round" />}
            <path d={`M${bx},${cy - 5} l5,5 l-5,5 l-5,-5 z`} fill="var(--card)" stroke="var(--ink)" strokeWidth="1.3" />
            <circle cx={fx} cy={cy} r="5" fill={col} stroke="var(--card)" strokeWidth="1.5" />
            {fx > W - 76
              ? <text x={fx} y={cy - 8} textAnchor="end" fontSize="9.5" fill={col} fontWeight="700">{month(m.forecast)}{late ? ` +${m.varianceDays}d` : ""}</text>
              : <text x={fx + 9} y={cy + 4} fontSize="9.5" fill={col} fontWeight="700">{month(m.forecast)}{late ? ` +${m.varianceDays}d` : ""}</text>}
          </g>
        );
      })}
    </svg>
  );
}
