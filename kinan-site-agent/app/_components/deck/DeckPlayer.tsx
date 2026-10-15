"use client";

// ▶ Play — a report as a full-screen presentation in Kinan's style. The deck (lib/deck.ts) is built from the report's
// data, so every chart is drawn live in SVG with real values, motion and a hover readout:
//   • scene transitions (the outgoing slide blurs away while the next one reveals), headlines that rise word by word,
//     an ambient background (drifting light, faint grid, film grain);
//   • count-up numbers; columns that spring up against dashed monthly targets with a delta call-out; ring gauges that
//     sweep to their value with a glowing end-cap and a status chip (icon + label, never colour alone); a donut that
//     draws segment by segment with outside labels; bars against a benchmark line with "× average" chips; a smooth
//     trend line drawn by a travelling light; a scan "orbit" connecting every data source; findings drawn as area
//     charts with the baseline and recent windows shaded and their averages marked;
//   • captions of the narration, a clickable timeline, keyboard (← → Space, F fullscreen, C captions, M mute, Esc).
// Narration: ElevenLabs through /api/voice when the server has a key (never exposed to the browser), else the browser
// voice. Colours: Kinan orange first, then hues validated for the dark surface (CVD + contrast); status colours are
// reserved for good / warning / critical. Respects "reduce motion".
import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./lang";
import { useVoiceInput } from "./useVoiceInput";
import { KINAN, kinanLogoHtml, chevron } from "@/lib/deck/brand";
import type { Cue, Deck, DeckSlide, Key, Kpi, Tone } from "@/lib/deck/deck";
import { refineCues, slideKeys, speakDates } from "@/lib/deck/deck";
import { box as box3d, pie3d, shade, DEPTH } from "@/lib/deck/chart3d";

// The slides follow Kinan's collateral: white faceted pages, charcoal text, orange uppercase headings, stat blocks and
// chevron bars; orange or charcoal full-bleed covers and dividers. Categorical hues validated on the light surface
// (Kinan orange first; direct labels everywhere, so colour never carries identity alone).
const PAL = ["#f15a22", "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const OR = KINAN.orange, CH = KINAN.charcoal, GOOD = "#1f8a4c", WARN = "#d99400", CRIT = "#d03b3b", INK = "#2e2e2f", SOFT = "#6f6f6f", FAINT = "rgba(46,46,47,.12)", PAPER = "#ffffff", TAUPE = KINAN.taupe, GREY = KINAN.grey;
const toneColor = (t?: Tone) => (t === "bad" ? CRIT : t === "good" ? GOOD : t === "warn" ? WARN : INK);
const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const SPRING = "cubic-bezier(.34,1.56,.64,1)", EASE = "cubic-bezier(.2,.8,.2,1)";
const HOLD = 420; // ms the slide waits behind the chevron wipe before its own motion starts

// ------------------------------------------------------------------ "what is being said" highlight
// The player publishes how far the narration has got (an index into the spoken text). Each slide looks up where its
// figures and labels are mentioned in that text and lights up the one being spoken about; the others step back.
// When the AI wrote the script it also marked which item each phrase is about (slide.cues, lib/narration.ts): then
// the highlight follows those marks, so bullet points and list items light up even when they are paraphrased.
// Without marks it falls back to finding the item's figures and labels in the spoken text.
const SpokenCtx = createContext<{ text: string; pos: number; cues?: Cue[] }>({ text: "", pos: -1 });
/** Index of the element the narration is on right now (the latest one mentioned so far), or -1 for none. The cues
 *  are the AI's marks corrected by where the text names each item (refineCues, lib/deck.ts). */
function useSpoken(anchors: Key[][]) {
  const { text, pos, cues } = useContext(SpokenCtx);
  const key = JSON.stringify(anchors);
  const refined = useMemo(() => refineCues(text, cues, anchors), [text, cues, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (pos < 0) return -1;
  let ref = -1;
  for (const c of refined) if (c.at <= pos) ref = c.ref;
  return ref >= 0 && ref < anchors.length ? ref : -1;
}
/** Class for element i of a highlighted group: lit, stepped back, or untouched (nothing mentioned yet). */
const lit = (active: number, i: number) => (active < 0 ? "" : active === i ? " kd-hi" : " kd-dim");

// ------------------------------------------------------------------ motion helpers
function useCount(target: number, ms = 1300, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now() + delay + HOLD;
    const tick = (now: number) => { const p = Math.min(1, Math.max(0, (now - t0) / ms)); setV(target * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}
function Count({ value, decimals = 0, prefix = "", suffix = "", delay = 0, sign = false }: { value: number; decimals?: number; prefix?: string; suffix?: string; delay?: number; sign?: boolean }) {
  const v = useCount(value, 1400, delay);
  return <span dir="ltr" className="kd-num-t">{prefix}{sign && value > 0 ? "+" : value < 0 ? "−" : ""}{fmt(Math.abs(v), decimals)}{suffix}</span>;
}
const In = ({ d = 0, children, style, className = "" }: { d?: number; children: React.ReactNode; style?: React.CSSProperties; className?: string }) =>
  <div className={`kd-in ${className}`} style={{ animationDelay: `${d}ms`, ...style }}>{children}</div>;
/** A headline that rises word by word behind a mask. */
function Rise({ text, d = 0, className = "kd-h2", step = 45, as: Tag = "h2" }: { text: string; d?: number; className?: string; step?: number; as?: any }) {
  const words = text.split(/\s+/).filter(Boolean);
  return <Tag className={className}>{words.map((w, i) => <Fragment key={i}><span className="kd-mask"><span className="kd-rise" style={{ animationDelay: `${d + i * step}ms` }}>{w}</span></span>{i < words.length - 1 ? " " : ""}</Fragment>)}</Tag>;
}
/** A display title that rises letter by letter; words never break apart, and Arabic rises word by word (its letters join). */
function Letters({ text, d = 0, step = 28, className }: { text: string; d?: number; step?: number; className: string }) {
  if (/[\u0600-\u06ff]/.test(text)) return <Rise as="h1" text={text} d={d} step={step * 4} className={className} />;
  let n = 0;
  const words = text.split(/\s+/).filter(Boolean);
  return <h1 className={className} aria-label={text} dir="ltr">{words.map((w, i) => <Fragment key={i}><span className="kd-word" aria-hidden>{w.split("").map((ch, j) => <span key={j} className="kd-mask"><span className="kd-rise" style={{ animationDelay: `${d + n++ * step}ms` }}>{ch}</span></span>)}</span>{i < words.length - 1 ? " " : ""}</Fragment>)}</h1>;
}
const Kicker = ({ children }: { children: React.ReactNode }) => <In><div className="kd-kicker"><span className="kd-kbar" />{children}</div></In>;
const Status = ({ pct }: { pct: number }) => {
  const [c, icon, label] = pct >= 95 ? [GOOD, "✓", "On track"] : pct >= 75 ? [WARN, "!", "Watch"] : [CRIT, "✕", "Behind"];
  const { t } = useI18n();
  return <span className="kd-status" style={{ borderColor: c, color: c }}><b>{icon}</b> {t(label)}</span>;
};

/** Tooltip shared by the charts: values lead, labels follow. */
type TipState = { x: number; y: number; title: string; rows: [string, string][] } | null;
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState>(null);
  const show = (e: React.PointerEvent | React.FocusEvent, title: string, rows: [string, string][]) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const pe = e as React.PointerEvent;
    const x = "clientX" in pe ? pe.clientX - r.left : (e.target as Element).getBoundingClientRect().left - r.left + 20;
    const y = "clientY" in pe ? pe.clientY - r.top : (e.target as Element).getBoundingClientRect().top - r.top;
    setTip({ x, y, title, rows });
  };
  const Tip = () => tip ? (
    <div className="kd-tip" style={{ left: Math.min(Math.max(tip.x + 14, 0), (box.current?.clientWidth ?? 9999) - 220), top: Math.max(0, tip.y - 70) }}>
      <div className="kd-tip-t">{tip.title}</div>
      {tip.rows.map(([v, l], i) => <div key={i} className="kd-tip-r"><b dir="ltr">{v}</b><span>{l}</span></div>)}
    </div>
  ) : null;
  return { box, show, hide: () => setTip(null), Tip };
}

/** Monotone cubic path through points (no overshoot) — smooth lines that never invent peaks. */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]), dy = pts.slice(1).map((p, i) => p[1] - pts[i][1]);
  const m = dx.map((d, i) => dy[i] / d);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return d;
}
/** A light that travels along a path while it draws. */
function Tracer({ pathRef, ms = 1800, delay: delay0 = 300, color = OR }: { pathRef: React.RefObject<SVGPathElement | null>; ms?: number; delay?: number; color?: string }) {
  const delay = delay0 + HOLD;
  const dot = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0; const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = pathRef.current, g = dot.current; if (!p || !g) return;
      const k = Math.min(1, Math.max(0, (now - t0) / ms)), e = 1 - Math.pow(1 - k, 3);
      const pt = p.getPointAtLength(p.getTotalLength() * e);
      g.setAttribute("transform", `translate(${pt.x},${pt.y})`); g.style.opacity = k > 0 ? "1" : "0";
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pathRef, ms, delay]);
  return <g ref={dot} style={{ opacity: 0 }}><circle r="16" fill={color} opacity=".18" /><circle r="7" fill={color} filter="url(#kdGlow)" /><circle r="3" fill="#fff" /></g>;
}
const Defs = () => (
  <defs>
    <filter id="kdGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    <linearGradient id="kdHot" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff7a45" /><stop offset="1" stopColor={OR} /></linearGradient>
    <linearGradient id="kdCool" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5a5a5c" /><stop offset="1" stopColor={CH} /></linearGradient>
    <linearGradient id="kdArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={OR} stopOpacity=".42" /><stop offset="1" stopColor={OR} stopOpacity="0" /></linearGradient>
    <linearGradient id="kdAreaW" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={CH} stopOpacity=".18" /><stop offset="1" stopColor={CH} stopOpacity="0" /></linearGradient>
  </defs>
);

// ------------------------------------------------------------------ small visuals
function MiniSpark({ values }: { values: number[] }) {
  const W = 220, H = 56, max = Math.max(...values, 0.0001), min = Math.min(...values) * 0.8;
  const pts = values.map((v, i) => [6 + ((W - 12) * i) / Math.max(1, values.length - 1), H - 6 - ((H - 14) * (v - min)) / Math.max(0.0001, max - min)] as [number, number]);
  const d = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="84" height="22" preserveAspectRatio="none" style={{ display: "block", direction: "ltr", flex: "none" }} aria-hidden="true">
      <Defs />
      <path d={`${d} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#kdArea)" className="kd-fade" style={{ animationDelay: "900ms" }} />
      <path d={d} fill="none" stroke={OR} strokeWidth="2.5" pathLength={1} className="kd-draw" style={{ animationDelay: "500ms" }} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4.5" fill={OR} className="kd-pop" style={{ animationDelay: "1500ms" }} />
    </svg>
  );
}
function MiniRing({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), color = pct >= 95 ? GOOD : pct >= 75 ? WARN : CRIT;
  return (
    <svg viewBox="0 0 56 56" width="44" height="44" style={{ flex: "none" }} aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" stroke={FAINT} strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" transform="rotate(-90 28 28)" strokeDasharray={c}
        style={{ strokeDashoffset: c, animation: `kdRing 1.6s ${EASE} 500ms forwards`, ["--kd-off" as any]: c * (1 - p / 100) }} />
    </svg>
  );
}

// ------------------------------------------------------------------ slides
function Cover({ s }: { s: Extract<DeckSlide, { kind: "cover" }> }) {
  return (
    <div className="kd-center kd-onbg">
      <In><div className="kd-kicker kd-kicker-w" style={{ justifyContent: "center" }}><span className="kd-kbar" />{s.kicker}</div></In>
      <Letters className="kd-cover-title" text={s.title} d={350} />
      <In d={1000}><div className="kd-cover-sub">{s.sub}</div></In>
      <div className="kd-sweep" />
    </div>
  );
}
/** A section divider as in Kinan's collateral (charcoal, diagonal orange chevron band, big chevron beside the title). */
function Divider({ s, lang }: { s: Extract<DeckSlide, { kind: "divider" }>; lang: "en" | "ar" }) {
  return (
    <div className="kd-onbg kd-div">
      <In><span className="kd-div-chev" dangerouslySetInnerHTML={{ __html: chevron(lang === "ar" ? "rtl" : "ltr", 76, OR) }} /></In>
      <div>
        <Rise as="h1" text={s.title} d={150} step={90} className="kd-div-title" />
        <In d={700}><div className="kd-div-sub">{s.sub ?? s.kicker}{s.n && s.of ? <span dir="ltr" style={{ marginInlineStart: 14, opacity: .8 }}>{s.n} / {s.of}</span> : null}</div></In>
      </div>
    </div>
  );
}
function Stat({ k, i, cls = "" }: { k: Kpi; i: number; cls?: string }) {
  return (
    <In d={300 + i * 140}>
      <div className={`kd-stat${cls}`}>
        <div className="kd-stat-l">{k.label}</div>
        <div className="kd-stat-row">
          <div className="kd-stat-v" style={{ color: toneColor(k.tone) }}><Count value={k.value} decimals={k.decimals ?? 0} prefix={k.prefix} suffix={k.suffix} delay={300 + i * 140} /></div>
          {k.ring != null && <MiniRing pct={k.ring} />}
          {k.spark && k.spark.length > 2 && <MiniSpark values={k.spark} />}
        </div>
        {k.sub && <div className="kd-stat-s">{k.sub}</div>}
      </div>
    </In>
  );
}
function Headline({ s }: { s: Extract<DeckSlide, { kind: "headline" }> }) {
  const act = useSpoken([...s.kpis.map((k) => [k.label, k.value, k.sub]), ...s.points.map((p) => [p])]);
  const nk = s.kpis.length;
  return (
    <div className="kd-hgrid">
      <div className="kd-stats">{s.kpis.map((k, i) => <Stat key={i} k={k} i={i} cls={lit(act, i)} />)}</div>
      <div>
        <Kicker>{s.kicker}</Kicker>
        <Rise text={s.headline} d={120} />
        {s.points.length > 0 && <ol className="kd-points">{s.points.map((p, i) => <In key={i} d={900 + i * 170}><li className={lit(act, nk + i).trim()}><span className="kd-cbar" /><span>{p}</span></li></In>)}</ol>}
      </div>
    </div>
  );
}
function Gauge({ pct, delay }: { pct: number; delay: number }) {
  const r = 84, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), color = pct >= 95 ? GOOD : pct >= 75 ? WARN : CRIT;
  const id = `g${Math.round(pct * 10)}${delay}`;
  return (
    <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: 250, display: "block", margin: "0 auto", overflow: "visible" }} aria-hidden="true">
      <Defs />
      <linearGradient id={id} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={OR} /><stop offset="1" stopColor={color} /></linearGradient>
      {Array.from({ length: 40 }, (_, k) => { const a = (k / 40) * 2 * Math.PI - Math.PI / 2; const r1 = 104, r2 = k % 10 === 0 ? 96 : 100; return <line key={k} x1={110 + r1 * Math.cos(a)} y1={110 + r1 * Math.sin(a)} x2={110 + r2 * Math.cos(a)} y2={110 + r2 * Math.sin(a)} stroke={k % 10 === 0 ? "rgba(46,46,47,.35)" : "rgba(46,46,47,.12)"} strokeWidth="1.5" className="kd-fade" style={{ animationDelay: `${delay + k * 12}ms` }} />; })}
      {/* coin edge: the ring's thickness, a few pixels below */}
      <circle cx="110" cy="116" r={r} fill="none" stroke="#dcdbd8" strokeWidth="14" />
      <circle cx="110" cy="116" r={r} fill="none" stroke={shade(color, 0.6)} strokeWidth="14" strokeLinecap="round" transform="rotate(-90 110 116)" strokeDasharray={c}
        style={{ strokeDashoffset: c, animation: `kdRing 1.8s ${EASE} ${delay}ms forwards`, ["--kd-off" as any]: c * (1 - p / 100) }} />
      <circle cx="110" cy="110" r={r} fill="none" stroke={FAINT} strokeWidth="14" />
      <circle cx="110" cy="110" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round" transform="rotate(-90 110 110)" strokeDasharray={c}
        style={{ strokeDashoffset: c, animation: `kdRing 1.8s ${EASE} ${delay}ms forwards`, ["--kd-off" as any]: c * (1 - p / 100) }} />
      <g style={{ transformOrigin: "110px 110px", transform: "rotate(0deg)", animation: `kdRot 1.8s ${EASE} ${delay}ms forwards`, ["--kd-rot" as any]: `${(p / 100) * 360}deg` }}>
        <circle cx="110" cy={110 - r} r="11" fill={color} opacity=".25" /><circle cx="110" cy={110 - r} r="6" fill={color} stroke="#fff" strokeWidth="2" />
      </g>
    </svg>
  );
}
function Gauges({ s }: { s: Extract<DeckSlide, { kind: "gauges" }> }) {
  const act = useSpoken(s.items.map((x) => [x.label, x.actual, x.pct, x.outlook?.label]));
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <div className="kd-ggrid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, s.items.length)}, minmax(0, 1fr))`, gap: 28, marginTop: 30 }}>
        {s.items.map((x, i) => (
          <In key={i} d={250 + i * 200} style={{ textAlign: "center" }}>
            <div className={`kd-gauge${lit(act, i)}`}>
            <div style={{ position: "relative" }}>
              <Gauge pct={x.pct} delay={300 + i * 200} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div><div className="kd-ring-v"><Count value={x.pct} suffix="%" delay={300 + i * 200} /></div><In d={1500 + i * 200}><Status pct={x.pct} /></In></div>
              </div>
            </div>
            <div className="kd-label" style={{ marginTop: 16 }}>{x.label}</div>
            <div className="kd-muted" dir="ltr">{x.actual} / {x.target}</div>
            {x.outlook && (
              <In d={1300 + i * 200}>
                <div className="kd-outlook">
                  <div className="kd-muted" style={{ fontSize: 12 }}>{x.outlook.label}</div>
                  <div className="kd-otrack"><div className="kd-ofill" style={{ width: `${Math.min(100, (x.outlook.forecast / Math.max(x.outlook.target, 0.0001)) * 100)}%`, background: x.outlook.forecast >= x.outlook.target * 0.95 ? GOOD : x.outlook.forecast >= x.outlook.target * 0.75 ? WARN : CRIT, animationDelay: `${1500 + i * 200}ms` }} /><div className="kd-omark" /></div>
                  <div dir="ltr" style={{ fontSize: 13, marginTop: 6 }}><b>{fmt(x.outlook.forecast, 1)}</b> <span className="kd-muted">/ {fmt(x.outlook.target, 1)}</span></div>
                </div>
              </In>
            )}
            </div>
          </In>
        ))}
      </div>
      {s.foot && <In d={1100}><div className="kd-foot">{s.foot}</div></In>}
    </div>
  );
}
function Columns({ s }: { s: Extract<DeckSlide, { kind: "columns" }> }) {
  const { t } = useI18n();
  const tip = useTip();
  const tg = s.target ?? [];
  const max = Math.max(...s.values, ...tg.map((x) => x ?? 0), 0.0001) * 1.18, n = s.values.length, W = 1000, H = 400, top = 30, pad = 30;
  const slot = (W - pad * 2) / n, bw = Math.min(118, slot * 0.56), x = (i: number) => pad + slot * (i + 0.5), y = (v: number) => H - ((H - top) * v) / max;
  const series = s.latest !== false; // a time series: the last column is the latest month, with its change call-out
  const last = n - 1, prev = s.values[last - 1], delta = series && prev ? ((s.values[last] - prev) / prev) * 100 : null;
  const bubble = 56 + (`${fmt(Math.abs(delta ?? 0), 1)}% ${t("vs")} ${s.labels[last - 1] ?? ""}`.length) * 11.5;
  const act = useSpoken(s.values.map((v, i) => [s.labels[i], v]));
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <In d={200}><div className="kd-sub">{s.sub}</div></In>
      <In d={260}><div className="kd-legend-row"><span><i style={{ background: "rgba(46,46,47,.85)" }} />{t("Actual")}</span>{series && <span><i style={{ background: OR }} />{t("Latest month")}</span>}{tg.length > 0 && <span><i className="kd-dash" />{t("Target")}</span>}</div></In>
      <div ref={tip.box} style={{ position: "relative", marginTop: 8, direction: "ltr" }} onPointerLeave={tip.hide}>
        <svg viewBox={`0 0 ${W} ${H + 48}`} width="100%" style={{ display: "block", maxHeight: "50vh", overflow: "visible" }}>
          <Defs />
          {[0.25, 0.5, 0.75, 1].map((g, k) => <line key={g} x1={pad} x2={W - pad} y1={H - (H - top) * g} y2={H - (H - top) * g} stroke="rgba(46,46,47,.07)" className="kd-gx" style={{ animationDelay: `${150 + k * 80}ms` }} />)}
          <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="rgba(46,46,47,.4)" className="kd-gx" />
          {s.values.map((v, i) => {
            const hot = series && i === last, target = tg[i] ?? null, under = target != null && v < target * 0.9;
            return (
              <g key={i} tabIndex={0} className={lit(act, i).trim()} onPointerMove={(e) => tip.show(e, s.labels[i], [[`${fmt(v, s.decimals ?? 1)} ${s.unit}`, t("Actual")], ...(target != null ? [[`${fmt(target, 1)} ${s.unit}`, t("Target")] as [string, string], [`${Math.round((v / target) * 100)}%`, t("Of target")] as [string, string]] : [])])} onFocus={(e) => tip.show(e, s.labels[i], [[`${fmt(v, s.decimals ?? 1)} ${s.unit}`, t("Actual")]])} onBlur={tip.hide}>
                <rect x={x(i) - slot / 2} y={top - 20} width={slot} height={H - top + 60} fill="transparent" />
                {(() => { const b = box3d(x(i) - bw / 2, y(v), bw, H - y(v), DEPTH.dx * 1.6, DEPTH.dy * 1.6), base = hot ? OR : CH; return (
                  <g className="kd-spring" style={{ animationDelay: `${300 + i * 130}ms` }} filter={hot ? "url(#kdGlow)" : undefined}>
                    <path d={b.side} fill={shade(base, 0.6)} /><path d={b.top} fill={shade(base, 1.35)} /><path d={b.front} fill={hot ? "url(#kdHot)" : "url(#kdCool)"} />
                  </g>); })()}
                {target != null && <line x1={x(i) - bw / 2 - 10} x2={x(i) + bw / 2 + 10} y1={y(target)} y2={y(target)} stroke={under ? CRIT : INK} strokeWidth="2.5" strokeDasharray="7 5" className="kd-fade" style={{ animationDelay: `${1000 + i * 130}ms` }} />}
                <text x={x(i)} y={Math.min(y(v), target != null ? y(target) : 9999) - 16} textAnchor="middle" fill={hot ? OR : INK} className="kd-fade kd-svgnum" style={{ animationDelay: `${1150 + i * 130}ms` }}>{fmt(v, s.decimals ?? 0)}</text>
                <text x={x(i)} y={H + 36} textAnchor="middle" fill={SOFT} className="kd-svglab">{s.labels[i]}</text>
              </g>
            );
          })}
          {delta != null && (
            <g className="kd-pop" style={{ animationDelay: "1700ms" }}>
              <line x1={x(last)} x2={x(last) - slot * 0.55} y1={y(s.values[last]) - 48} y2={y(s.values[last]) - 86} stroke={OR} strokeWidth="1.5" />
              <rect x={x(last) - slot * 0.55 - bubble} y={y(s.values[last]) - 108} width={bubble} height="40" rx="20" fill="#fff" stroke={OR} />
              <text x={x(last) - slot * 0.55 - bubble / 2} y={y(s.values[last]) - 82} textAnchor="middle" fill={INK} className="kd-svglab" style={{ fontWeight: 700 }}>{delta >= 0 ? "▲ +" : "▼ −"}{fmt(Math.abs(delta), 1)}% {t("vs")} {s.labels[last - 1]}</text>
            </g>
          )}
        </svg>
        <tip.Tip />
      </div>
    </div>
  );
}
function Donut({ s }: { s: Extract<DeckSlide, { kind: "donut" }> }) {
  const [hi, setHi] = useState<number | null>(null);
  const total = s.values.reduce((a, b) => a + b, 0) || 1, R = 118, c = 2 * Math.PI * R;
  let acc = 0;
  const segs = s.values.map((v, i) => { const len = (v / total) * c, start = acc; acc += len; const mid = ((start + len / 2) / c) * 2 * Math.PI - Math.PI / 2; return { i, v, len, start, mid }; });
  const act = useSpoken(s.values.map((v, i) => [s.labels[i], v, Math.round((v / total) * 100) + "%"]));
  const focus = hi ?? (act >= 0 ? act : null);
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <In d={200}><div className="kd-sub">{s.sub}</div></In>
      <div style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
        <div style={{ position: "relative", flex: "0 0 auto", width: "min(500px, 84vw)" }} onPointerLeave={() => setHi(null)}>
          {(() => {
            // Tilted 3D donut; hover lifts a slice. Shares are printed on the slices and listed in the legend.
            const segs3 = segs.map((g) => ({ a0: (g.start / c) * 2 * Math.PI - Math.PI / 2, a1: ((g.start + g.len) / c) * 2 * Math.PI - Math.PI / 2 }));
            const g3 = pie3d(segs3, { cx: 200, cy: 170, r: 190, inner: 104, tilt: 0.56, depth: 34 });
            const op = (i: number) => (focus == null || focus === i ? 1 : 0.32);
            return (
              <svg viewBox="0 0 400 300" width="100%" style={{ overflow: "visible", direction: "ltr" }}>
                <ellipse cx="200" cy="216" rx="186" ry="58" fill="rgba(46,46,47,.10)" className="kd-fade" />
                {g3.inner.map((w, k) => <path key={`i${k}`} d={w.d} fill={shade(PAL[w.i % PAL.length], 0.5)} opacity={op(w.i)} className="kd-fade" style={{ animationDelay: `${300 + w.i * 160}ms`, transition: "opacity .25s" }} />)}
                {g3.outer.map((w, k) => <path key={`o${k}`} d={w.d} fill={shade(PAL[w.i % PAL.length], 0.66)} opacity={op(w.i)} className="kd-fade" style={{ animationDelay: `${300 + w.i * 160}ms`, transition: "opacity .25s" }} />)}
                {g3.tops.map((d, k) => <path key={`t${k}`} d={d} fill={PAL[k % PAL.length]} stroke="#fff" strokeWidth="2" fillRule="evenodd" opacity={op(k)} className="kd-pop" onPointerEnter={() => setHi(k)}
                  style={{ animationDelay: `${300 + k * 160}ms`, transition: "opacity .25s, transform .25s", transform: focus === k ? "translateY(-8px)" : "none", cursor: "pointer" }} />)}
                {segs.map((g, k) => { const pct = (g.v / total) * 100; if (pct < 5) return null; const [x, y] = g3.point((segs3[k].a0 + segs3[k].a1) / 2, 0.77);
                  const light = ["#eda100", "#e87ba4", "#1baf7a"].includes(PAL[k % PAL.length]);
                  return <text key={`l${k}`} x={x} y={y + 6} textAnchor="middle" fill={light ? INK : "#fff"} className="kd-fade kd-svgnum" style={{ fontSize: 19, animationDelay: `${900 + k * 140}ms`, pointerEvents: "none" }}>{Math.round(pct)}%</text>; })}
              </svg>
            );
          })()}
          {/* The hole's visible floor: the ring's inner wall hides its top, so the label sits a little below the ring's centre. */}
          <div style={{ position: "absolute", left: "50%", top: "62.5%", transform: "translate(-50%, -50%)", width: "34%", textAlign: "center", pointerEvents: "none", lineHeight: 1.1 }}>
            {focus == null
              ? <div><div className="kd-kpi-v" style={{ fontSize: "clamp(20px,2.5vw,36px)", marginTop: 0 }}><Count value={total} decimals={s.decimals ?? 1} delay={300} /></div><div className="kd-kpi-l" style={{ fontSize: 9, marginTop: 3 }}>{s.unit}</div></div>
              : <div><div className="kd-kpi-v" style={{ fontSize: "clamp(18px,2.2vw,32px)", color: INK, marginTop: 0 }}>{fmt(s.values[focus], s.decimals ?? 1)}</div><div className="kd-kpi-l" style={{ fontSize: 8.5, letterSpacing: ".06em", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.labels[focus]}</div><div className="kd-muted" style={{ fontSize: 11 }}>{Math.round((s.values[focus] / total) * 100)}%</div></div>}
          </div>
        </div>
        <div style={{ flex: "1 1 340px" }}>
          {s.labels.map((l, i) => (
            <In key={i} d={500 + i * 140}>
              <div className={`kd-legend${focus === i ? " on" : ""}${lit(act, i)}`} onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)}>
                <i style={{ background: PAL[i % PAL.length] }} /><span style={{ flex: 1 }}>{l}</span>
                <b dir="ltr" className="kd-num-t">{fmt(s.values[i], s.decimals ?? 1)}</b><span className="kd-muted kd-num-t" dir="ltr" style={{ width: 56, textAlign: "end" }}>{Math.round((s.values[i] / total) * 100)}%</span>
              </div>
            </In>
          ))}
        </div>
      </div>
    </div>
  );
}
function HBars({ s }: { s: Extract<DeckSlide, { kind: "hbars" }> }) {
  const { t } = useI18n();
  const tip = useTip();
  const max = Math.max(...s.values, s.bench ?? 0, 0.0001) * 1.1;
  const act = useSpoken(s.values.map((v, i) => [s.labels[i], v]));
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <In d={200}><div className="kd-sub">{s.sub}</div></In>
      <div ref={tip.box} style={{ marginTop: 34, position: "relative" }} onPointerLeave={tip.hide}>
        {s.bench != null && <div className="kd-benchline" style={{ insetInlineStart: `calc(var(--kd-lab) + 16px + (100% - var(--kd-lab) - 16px - 200px) * ${s.bench / max})` }}><span>{s.benchLabel}</span></div>}
        {s.values.map((v, i) => {
          const ratio = s.bench ? v / s.bench : null, hot = ratio != null && ratio > 1.5, best = i === 0 && !s.higherIsWorse;
          const color = s.higherIsWorse ? (i === 0 ? CRIT : WARN) : hot ? CRIT : best ? GOOD : GREY, dec = s.decimals ?? 2;
          return (
            <In key={i} d={250 + i * 120}>
              <div className={`kd-hrow${lit(act, i)}`} onPointerMove={(e) => tip.show(e, s.labels[i], [[`${fmt(v, dec)}${s.unit}`, s.title], ...(ratio != null ? [[`${fmt(ratio, 1)}×`, t("of the 2023–2025 average")] as [string, string]] : [])])}>
                <div className="kd-hlabel">{s.labels[i]}</div>
                <div className="kd-htrack"><div className="kd-hfill" style={{ width: `${(v / max) * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})`, animationDelay: `${300 + i * 120}ms` }} /></div>
                <div className="kd-hval" dir="ltr" style={{ color: hot || (s.higherIsWorse && i === 0) ? CRIT : INK }}>{fmt(v, dec)}{s.unit}</div>
                <div style={{ width: 84 }}>{hot ? <span className="kd-chip" style={{ borderColor: CRIT, color: CRIT }}>{fmt(ratio!, 1)}×</span> : best ? <span className="kd-chip" style={{ borderColor: GOOD, color: GOOD }}>✓ {t("best")}</span> : null}</div>
              </div>
            </In>
          );
        })}
        <tip.Tip />
      </div>
    </div>
  );
}
function Line({ s }: { s: Extract<DeckSlide, { kind: "line" }> }) {
  const tip = useTip(); const path = useRef<SVGPathElement>(null);
  const [hx, setHx] = useState<number | null>(null);
  const W = 1000, H = 360, pad = 50, top = 40, max = Math.max(...s.values, 0.0001) * 1.18, n = s.values.length;
  const pts = s.values.map((v, i) => [pad + ((W - pad * 2) * i) / Math.max(1, n - 1), H - ((H - top) * v) / max] as [number, number]);
  const d = smoothPath(pts);
  const act = useSpoken(s.values.map((v, i) => [s.labels[i], v]));
  const mark = hx ?? (act >= 0 ? act : null);
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <In d={200}><div className="kd-sub">{s.sub}</div></In>
      <div ref={tip.box} style={{ position: "relative", marginTop: 20, direction: "ltr" }} onPointerLeave={() => { tip.hide(); setHx(null); }}
        onPointerMove={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; let k = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - vx) < Math.abs(pts[k][0] - vx)) k = i; }); setHx(k); tip.show(e, s.labels[k], [[`${fmt(s.values[k], 2)} ${s.unit}`, s.title]]); }}>
        <svg viewBox={`0 0 ${W} ${H + 50}`} width="100%" style={{ display: "block", maxHeight: "50vh", overflow: "visible" }}>
          <Defs />
          {[0.25, 0.5, 0.75, 1].map((g, k) => <line key={g} x1={pad} x2={W - pad} y1={H - (H - top) * g} y2={H - (H - top) * g} stroke="rgba(46,46,47,.07)" className="kd-gx" style={{ animationDelay: `${100 + k * 80}ms` }} />)}
          <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="rgba(46,46,47,.4)" className="kd-gx" />
          <path d={`${d} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#kdArea)" className="kd-fade" style={{ animationDelay: "1400ms" }} />
          <path ref={path} d={d} fill="none" stroke={OR} strokeWidth="4" strokeLinecap="round" pathLength={1} className="kd-draw" style={{ animationDuration: "1.8s" }} />
          <Tracer pathRef={path} ms={1800} delay={300} />
          {mark != null && <line x1={pts[mark][0]} x2={pts[mark][0]} y1={top - 10} y2={H} stroke={hx == null ? OR : "rgba(46,46,47,.35)"} strokeWidth={hx == null ? 2 : 1} strokeDasharray="4 4" />}
          {pts.map((p, i) => <g key={i} className="kd-pop" style={{ animationDelay: `${500 + (i / Math.max(1, n - 1)) * 1500}ms` }}>
            <circle cx={p[0]} cy={p[1]} r={mark === i ? 11 : 7} fill={mark === i && hx == null ? OR : "#fff"} stroke={OR} strokeWidth="3.5" style={{ transition: "r .3s, fill .3s" }} />
            {(i === n - 1 || i === s.values.indexOf(Math.max(...s.values)) || (mark === i && hx == null)) && <text x={p[0]} y={p[1] - 22} textAnchor="middle" fill={INK} className="kd-svgnum">{fmt(s.values[i], 1)}</text>}
            <text x={p[0]} y={H + 36} textAnchor="middle" fill={SOFT} className="kd-svglab">{s.labels[i]}</text>
          </g>)}
        </svg>
        <tip.Tip />
      </div>
    </div>
  );
}
function Scan({ s }: { s: Extract<DeckSlide, { kind: "scan" }> }) {
  const { t } = useI18n();
  const n = s.sources.length, total = s.sources.reduce((a, x) => a + x.found, 0);
  const pos = (i: number) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return { x: 50 + 40 * Math.cos(a), y: 50 + 38 * Math.sin(a) }; };
  const act = useSpoken(s.sources.map((x) => [x.label, x.items]));
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <Rise text={s.title} d={100} className="kd-h2 kd-or" />
      <div className="kd-orbit">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="kd-orbit-svg" aria-hidden="true">
          <ellipse cx="50" cy="50" rx="40" ry="38" fill="none" stroke="rgba(46,46,47,.08)" strokeWidth=".25" vectorEffect="non-scaling-stroke" />
          {s.sources.map((x, i) => { const p = pos(i); return <g key={i} className="kd-fade" style={{ animationDelay: `${400 + i * 140}ms` }}><line x1="50" y1="50" x2={p.x} y2={p.y} stroke={x.found ? "rgba(241,90,34,.28)" : "rgba(46,46,47,.1)"} strokeWidth={x.found ? 2 : 1} vectorEffect="non-scaling-stroke" />{x.found > 0 && <line x1={p.x} y1={p.y} x2="50" y2="50" stroke={OR} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 14" vectorEffect="non-scaling-stroke" className="kd-flow" style={{ animationDelay: `${i * 170}ms` }} />}</g>; })}
        </svg>
        <div className="kd-core">
          <span className="kd-pulse" /><span className="kd-pulse" style={{ animationDelay: "1.2s" }} />
          <div className="kd-core-in"><div className="kd-kpi-v" style={{ fontSize: "clamp(34px,4vw,60px)", color: OR }}><Count value={total} delay={1200} /></div><div className="kd-kpi-l" style={{ marginTop: 4 }}>{t("findings")}</div></div>
        </div>
        {s.sources.map((x, i) => {
          const p = pos(i);
          return (
            <div key={i} className="kd-node" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <In d={300 + i * 140}>
                <div className={`kd-node-in${lit(act, i)}`}>
                  <div className="kd-node-l">{x.label}</div>
                  <div className="kd-node-v"><Count value={x.items} delay={300 + i * 140} /></div>
                  {x.found ? <span className="kd-badge kd-pop" style={{ animationDelay: `${900 + i * 140}ms` }}>→ {x.found}</span> : <span className="kd-muted">—</span>}
                </div>
              </In>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function FindingChart({ s }: { s: Extract<DeckSlide, { kind: "finding" }> }) {
  const values = s.series!, n = values.length, W = 620, H = 300, top = 26, pad = 8;
  const max = Math.max(...values, s.baseline ?? 0, 0.0001) * 1.15;
  const x = (i: number) => pad + ((W - pad * 2) * i) / Math.max(1, n - 1), y = (v: number) => H - ((H - top) * v) / max;
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const d = smoothPath(pts), path = useRef<SVGPathElement>(null);
  const color = s.down ? CRIT : GOOD, w = s.windows;
  const band = (a: number, b: number) => { const step = (W - pad * 2) / (n - 1), x0 = Math.max(pad, x(Math.max(0, a)) - step / 2), x1 = Math.min(W - pad, x(Math.max(0, a)) - step / 2 + step * (b - Math.max(0, a))); return { x: x0, w: Math.max(0, x1 - x0) }; };
  const pill = (x: number, y: number, txt: string, size: number, end = false) => { const w = txt.length * size * 0.56 + 14; return <rect x={end ? x - w + 7 : x - 7} y={y - size - 1} width={w} height={size + 10} rx={4} fill="#fff" fillOpacity={0.88} />; };
  const bTxt = s.baseline != null ? `${fmt(s.baseline, s.baseline < 10 ? 2 : 1)} ${s.unit ?? ""}` : "", rTxt = s.recent != null ? `${fmt(s.recent, s.recent < 10 ? 2 : 1)} ${s.unit ?? ""}` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" style={{ display: "block", overflow: "visible", direction: "ltr" }} aria-hidden="true">
      <Defs />
      {w && <>
        <rect x={band(w.base[0], w.base[1]).x} y={top - 10} width={band(w.base[0], w.base[1]).w} height={H - top + 10} fill="rgba(46,46,47,.04)" className="kd-fade" style={{ animationDelay: "300ms" }} />
        <rect x={band(w.recent[0], w.recent[1]).x} y={top - 10} width={band(w.recent[0], w.recent[1]).w} height={H - top + 10} fill={s.down ? "rgba(208,59,59,.12)" : "rgba(12,163,12,.12)"} className="kd-fade" style={{ animationDelay: "500ms" }} />
      </>}
      <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="rgba(46,46,47,.35)" />
      <path d={`${d} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#kdAreaW)" className="kd-fade" style={{ animationDelay: "1200ms" }} />
      <path ref={path} d={d} fill="none" stroke={CH} strokeWidth="3" pathLength={1} className="kd-draw" style={{ animationDuration: "1.6s" }} />
      <Tracer pathRef={path} ms={1600} delay={300} color={color} />
      {w && pts.slice(w.recent[0]).map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r="6" fill={color} className="kd-pop" style={{ animationDelay: `${1500 + k * 120}ms` }} />)}
      {w && s.baseline != null && s.recent != null && <>
        <line x1={band(w.base[0], w.base[1]).x} x2={band(w.recent[0], w.recent[1]).x + band(w.recent[0], w.recent[1]).w} y1={y(s.baseline)} y2={y(s.baseline)} stroke="rgba(46,46,47,.55)" strokeDasharray="6 5" className="kd-gx" style={{ animationDelay: "1700ms" }} />
        <line x1={band(w.recent[0], w.recent[1]).x} x2={band(w.recent[0], w.recent[1]).x + band(w.recent[0], w.recent[1]).w} y1={y(s.recent)} y2={y(s.recent)} stroke={color} strokeWidth="3" className="kd-gx" style={{ animationDelay: "1900ms" }} />
        <g className="kd-fade" style={{ animationDelay: "2000ms" }}>
          {pill(band(w.base[0], w.base[1]).x + 10, y(s.baseline) - 12, bTxt, 17)}
          <text x={band(w.base[0], w.base[1]).x + 10} y={y(s.baseline) - 12} fill={INK} className="kd-svglab" style={{ fontSize: 17 }}>{bTxt}</text>
          {pill(band(w.recent[0], w.recent[1]).x + band(w.recent[0], w.recent[1]).w - 8, y(s.recent) + (s.down ? 34 : -14), rTxt, 20, true)}
          <text x={band(w.recent[0], w.recent[1]).x + band(w.recent[0], w.recent[1]).w - 8} y={y(s.recent) + (s.down ? 34 : -14)} textAnchor="end" fill={color} className="kd-svgnum" style={{ fontSize: 20 }}>{rTxt}</text>
          <path d={`M${band(w.recent[0], w.recent[1]).x - 14},${y(s.baseline) + (s.down ? 6 : -6)} L${band(w.recent[0], w.recent[1]).x - 14},${y(s.recent) + (s.down ? -8 : 8)}`} stroke={color} strokeWidth="2.5" markerEnd="" />
          <path d={`M${band(w.recent[0], w.recent[1]).x - 21},${y(s.recent) + (s.down ? -15 : 15)} L${band(w.recent[0], w.recent[1]).x - 14},${y(s.recent) + (s.down ? -5 : 5)} L${band(w.recent[0], w.recent[1]).x - 7},${y(s.recent) + (s.down ? -15 : 15)}`} fill="none" stroke={color} strokeWidth="2.5" />
        </g>
      </>}
    </svg>
  );
}
function Finding({ s }: { s: Extract<DeckSlide, { kind: "finding" }> }) {
  const act = useSpoken([[s.changePct != null ? Math.abs(s.changePct) : null], ...s.evidence.map((e) => [e.title, e.source])]);
  return (
    <div>
      <Kicker>{s.kicker} · <span dir="ltr">{s.n}/{s.of}</span></Kicker>
      <div style={{ display: "flex", gap: 44, flexWrap: "wrap", alignItems: "flex-start", marginTop: 6 }}>
        <div style={{ flex: "1 1 500px", minWidth: 0 }}>
          <In d={80}><span className="kd-tag">{s.source}</span></In>
          <Rise text={s.title} d={160} step={40} />
          <In d={500}><p className="kd-body">{s.why}</p></In>
          {s.evidence.length > 0 && <div style={{ marginTop: 18 }}>
            {s.evidence.map((e, i) => <In key={i} d={800 + i * 220}><div className={`kd-evidence${lit(act, 1 + i)}`}><span className="kd-tag" style={{ flex: "none", minWidth: 120, textAlign: "center" }}>{e.source}</span><span>{e.title}</span></div></In>)}
          </div>}
        </div>
        {(s.changePct !== null || s.series) && (
          <div style={{ flex: "0 1 460px", minWidth: 280 }}>
            {s.changePct !== null && <In d={250}><div className={`kd-big${lit(act, 0)}`} style={{ color: s.down ? CRIT : GOOD }}><Count value={s.changePct} suffix="%" sign delay={250} /></div></In>}
            {s.series && s.series.length > 2 && <In d={350}><div style={{ marginTop: 18 }}><FindingChart s={s} /></div></In>}
          </div>
        )}
      </div>
    </div>
  );
}
function RangeBar({ lo, hi, max, label, value, delay, color = OR }: { lo: number; hi: number; max: number; label: string; value: React.ReactNode; delay: number; color?: string }) {
  return (
    <div className="kd-range">
      <div className="kd-kpi-l" style={{ marginTop: 0 }}>{label}</div>
      <div className="kd-kpi-v" style={{ fontSize: "clamp(26px,3vw,44px)", marginTop: 6 }}>{value}</div>
      <div className="kd-rtrack"><div className="kd-rband" style={{ insetInlineStart: `${(lo / max) * 100}%`, width: `${((hi - lo) / max) * 100}%`, background: color, animationDelay: `${delay}ms` }} /><div className="kd-rmid kd-pop" style={{ insetInlineStart: `${(((lo + hi) / 2) / max) * 100}%`, animationDelay: `${delay + 600}ms` }} /></div>
    </div>
  );
}
function Initiative({ s }: { s: Extract<DeckSlide, { kind: "initiative" }> }) {
  const { t } = useI18n();
  const R = 54, c = 2 * Math.PI * R; let acc = 0;
  const act = useSpoken([s.channels.map((ch) => ch.label), [s.contracts[0], s.contracts[1]], [s.salesM[0], s.salesM[1]], [s.cts, s.spendK]]);
  return (
    <div>
      <Kicker>{s.kicker} · <span dir="ltr">{s.n}/{s.of}</span></Kicker>
      <In d={80}><span className="kd-tag kd-tag-or">{s.type}</span>{s.project && <span className="kd-muted" style={{ marginInlineStart: 12 }}>{s.project}</span>}</In>
      <Rise text={s.title} d={160} />
      {s.answers && <In d={420}><div className="kd-answers"><span className="kd-kpi-l" style={{ display: "block", marginTop: 0, marginBottom: 4, color: OR }}>↳ {t("Answers")}</span>{s.answers}</div></In>}
      <In d={560}><p className="kd-body">{s.idea}</p></In>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1.1fr) repeat(3, minmax(170px,1fr))", gap: 16, marginTop: 24 }} className="kd-igrid">
        <In d={700}><div className={`kd-kpi${lit(act, 0)}`} style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <svg viewBox="0 0 140 140" width="120" height="120" style={{ flex: "none" }} aria-hidden="true">
            {s.channels.map((ch, i) => { const len = (ch.pct / 100) * c, start = acc; acc += len; return <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={PAL[i % PAL.length]} strokeWidth="18" transform="rotate(-90 70 70)" strokeDasharray={`0 ${c}`} strokeDashoffset={-start} className="kd-arc" style={{ animationDelay: `${800 + i * 160}ms`, ["--kd-len" as any]: `${Math.max(0, len - 2)} ${c}` }} />; })}
          </svg>
          <div style={{ minWidth: 0 }}>{s.channels.map((ch, i) => <div key={i} className="kd-mixrow"><i style={{ background: PAL[i % PAL.length] }} /><span>{ch.label}</span><b dir="ltr">{ch.pct}%</b></div>)}</div>
        </div></In>
        <In d={850}><div className={`kd-kpi${lit(act, 1)}`}><RangeBar lo={s.contracts[0]} hi={s.contracts[1]} max={Math.max(s.contracts[1] * 1.3, 1)} label={t("Contracts (range)")} value={<><Count value={s.contracts[0]} delay={850} />–<Count value={s.contracts[1]} delay={850} /></>} delay={1000} /></div></In>
        <In d={1000}><div className={`kd-kpi${lit(act, 2)}`}><RangeBar lo={s.salesM[0]} hi={s.salesM[1]} max={Math.max(s.salesM[1] * 1.3, 1)} label={t("Sales (range)")} value={<><Count value={s.salesM[0]} decimals={1} delay={1000} />–<Count value={s.salesM[1]} decimals={1} suffix="M" delay={1000} /></>} delay={1150} color={PAL[1]} /></div></In>
        <In d={1150}><div className={`kd-kpi${lit(act, 3)}`}><div className="kd-kpi-l" style={{ marginTop: 0 }}>{t("Cost to sales")}</div><div className="kd-kpi-v" style={{ color: OR, fontSize: "clamp(26px,3vw,44px)", marginTop: 6 }}><Count value={s.cts} decimals={1} suffix="%" delay={1150} /></div><div className="kd-kpi-s">{t("Spend")} <span dir="ltr">SAR {fmt(s.spendK)}K</span></div></div></In>
      </div>
    </div>
  );
}
function List({ s }: { s: Extract<DeckSlide, { kind: "list" }> }) {
  const { t } = useI18n();
  const maxMin = Math.max(...s.items.map((x) => x.minutes ?? 0), 1);
  const ICON: Record<string, [string, string]> = { bad: ["!", CRIT], warn: ["◆", WARN], good: ["✓", GOOD], neutral: ["·", "rgba(46,46,47,.55)"] };
  const act = useSpoken(s.items.slice(0, 8).map((x) => [x.text, x.sub, x.minutes]));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div><Kicker>{s.kicker}</Kicker><Rise text={s.title} d={100} className="kd-h2 kd-or" /></div>
        {s.totalMinutes != null && <In d={300}><div className="kd-total"><div className="kd-kpi-v" style={{ fontSize: "clamp(30px,3.4vw,48px)" }}><Count value={s.totalMinutes} delay={300} /><span style={{ fontSize: ".5em", marginInlineStart: 6 }}>{t("min")}</span></div><div className="kd-kpi-l">{t("your time this week")}</div></div></In>}
      </div>
      <div style={{ marginTop: 20 }}>
        {s.items.slice(0, 8).map((x, i) => {
          const [ic, col] = ICON[x.tone ?? "neutral"] ?? ICON.neutral;
          return (
            <In key={i} d={300 + i * 120}>
              <div className={`kd-li${lit(act, i)}`}>
                <span className="kd-cbar sm" style={{ ["--c" as any]: x.tone && x.tone !== "neutral" ? col : OR }} />
                <span className="kd-ico" style={{ borderColor: col, color: col }}>{ic}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="kd-li-t">{x.text}</div>{x.sub && <div className="kd-muted" style={{ marginTop: 3 }}>{x.sub}</div>}</div>
                {x.minutes != null && <div style={{ width: 170, display: "flex", alignItems: "center", gap: 10 }}><div className="kd-htrack" style={{ height: 8 }}><div className="kd-hfill" style={{ width: `${(x.minutes / maxMin) * 100}%`, background: `linear-gradient(90deg, ${OR}55, ${OR})`, animationDelay: `${400 + i * 120}ms` }} /></div><span className="kd-muted kd-num-t" dir="ltr" style={{ width: 34 }}>{x.minutes}′</span></div>}
              </div>
            </In>
          );
        })}
      </div>
    </div>
  );
}
function Closing({ s }: { s: Extract<DeckSlide, { kind: "closing" }> }) {
  return (
    <div className="kd-center kd-onbg kd-closing">
      <div className="kd-close-tag"><Letters className="kd-tagline" text={s.title} step={45} /></div>
      <div className="kd-close-card">
        <In d={3300}><span dangerouslySetInnerHTML={{ __html: kinanLogoHtml(110, "#fff") }} /></In>
        <In d={3650}><div className="kd-social"><span>in</span><span>f</span><span>𝕏</span><span>◎</span><b>{KINAN.site}</b></div></In>
        <In d={3900}><div className="kd-cover-sub" style={{ marginTop: 18 }}>{s.sub}</div></In>
      </div>
    </div>
  );
}
function SlideView({ s, lang }: { s: DeckSlide; lang: "en" | "ar" }) {
  switch (s.kind) {
    case "cover": return <Cover s={s} />;
    case "divider": return <Divider s={s} lang={lang} />;
    case "headline": return <Headline s={s} />;
    case "gauges": return <Gauges s={s} />;
    case "columns": return <Columns s={s} />;
    case "donut": return <Donut s={s} />;
    case "hbars": return <HBars s={s} />;
    case "line": return <Line s={s} />;
    case "scan": return <Scan s={s} />;
    case "finding": return <Finding s={s} />;
    case "initiative": return <Initiative s={s} />;
    case "list": return <List s={s} />;
    case "closing": return <Closing s={s} />;
  }
}
const slideTitle = (s: DeckSlide) => ("title" in s && s.title) || ("headline" in s && s.headline) || s.kicker;

// ------------------------------------------------------------------ voice
type Voice = { mode: "eleven" | "browser" | "none" };
type Clip = { url: string; starts: number[] /* second each character of the text is spoken at (may be empty) */ };
const audioCache = new Map<string, Promise<Clip | null>>();
let lastVoiceError: string | null = null; // why the last ElevenLabs request failed (shown in the player)
const GREETING = /^\s*(?:good\s+(?:morning|afternoon|evening)|صباح\s+الخير|مساء\s+الخير)[\s,.!،]*/i;
/** "Good afternoon. …" for the time the deck is played (any greeting already in the text is replaced). */
function withGreeting(text: string, lang: "en" | "ar") {
  const h = new Date().getHours();
  const g = lang === "ar" ? (h < 12 ? "صباح الخير" : "مساء الخير") : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${g}. ${text.replace(GREETING, "")}`;
}
/** The text the player narrates for a slide (and matches highlights against): single spaces, capped. */
const spokenText = (say: string) => say.replace(/\s+/g, " ").trim().slice(0, 900);
/** ElevenLabs audio for a text (via /api/voice) with per-character timings, cached; null when the server has no key or it fails. */
function elevenAudio(text: string, lang: string, pauses: number[] = []) {
  const key = `${lang}|${pauses.join(",")}|${text}`;
  if (!audioCache.has(key)) audioCache.set(key, fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang, pauses }) })
    .then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.audio) { lastVoiceError = String(j?.error ?? `HTTP ${r.status}`); audioCache.delete(key); return null; } // not cached: the next slide tries again
      lastVoiceError = null;
      const bytes = Uint8Array.from(atob(j.audio), (c) => c.charCodeAt(0));
      return { url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })), starts: Array.isArray(j.starts) ? j.starts : [] };
    }).catch((e) => { lastVoiceError = String(e?.message ?? e); audioCache.delete(key); return null; }));
  return audioCache.get(key)!;
}
/** Where the presenter moves on to the next item: the voice takes a short breath there (lib/voice.ts). A cue can sit
 *  mid-sentence (an item named partway through, "…where freed budget goes, Mubasher…"); a breath there sounds like an
 *  odd gap between two words, so each breath is moved to the start of the sentence that cue is in, and only pauses
 *  between sentences remain. (The highlight still follows the cue itself.) */
export function pausesFor(s: DeckSlide, say: string) {
  const starts = new Set<number>();
  for (const { at } of refineCues(say, s.cues, slideKeys(s))) {
    if (at <= 0) continue;
    let i = at;
    while (i > 0 && !/[.;:!?؟]/.test(say[i - 1])) i--; // back to the end of the previous sentence
    while (i < at && /\s/.test(say[i])) i++;            // to the first word of this one
    if (i > 0) starts.add(i);
  }
  return [...starts].sort((a, b) => a - b);
}
// The presenter's stock lines, varied: a different one each day (and each time within a day), so it never sounds canned.
const LINES = {
  // said only when the answer is not ready by the end of the slide (the answer itself opens by naming the subject)
  bridge: {
    en: ["One moment, let me think about your question.", "Give me a second to look into that.", "Good question. Let me pull that together.", "Bear with me a moment while I check.", "Let me think that through for you."],
    ar: ["لحظة من فضلكم، دعوني أفكر في سؤالكم.", "امنحوني ثانية لأتحقق من ذلك.", "سؤال جيد، دعوني أجمع الإجابة.", "لحظة من فضلكم بينما أتحقق.", "دعوني أفكر في ذلك."],
  },
  // the answer is taking long: the presenter carries on with the brief and comes back to it
  carryOn: {
    en: ["I'll carry on while I work that out, and come back to it in a moment.", "Let me keep going while I look into that; I'll come back to it.", "I'll keep the brief moving while I check that, and answer in a moment."],
    ar: ["سأتابع بينما أعمل على ذلك، وأعود إليه بعد قليل.", "دعوني أكمل بينما أتحقق من ذلك؛ سأعود إليه.", "سأواصل الموجز بينما أتحقق من ذلك، وأجيب بعد لحظة."],
  },
  // after an answer, when no further question comes
  moveOn: {
    en: ["Right, let's move on.", "Good. Let's carry on.", "Then let's keep going.", "Fine, on to the next point.", "Let's pick up where we were.", "Right, back to the report."],
    ar: ["حسناً، لننتقل.", "جيد، لنتابع.", "إذن لنكمل.", "حسناً، إلى النقطة التالية.", "لنعد إلى حيث كنا.", "حسناً، نعود إلى التقرير."],
  },
};
let lineTurn = 0;
/** A stock line: rotates through the list from a starting point that changes every day. */
const line = (kind: keyof typeof LINES, lang: "en" | "ar") => {
  const xs = LINES[kind][lang];
  const day = Math.floor(Date.now() / 86_400_000);
  return xs[(day * 7 + lineTurn++) % xs.length];
};
/** How many characters have been spoken by second t (timings sorted ascending). */
function spokenChars(starts: number[], t: number) {
  let lo = 0, hi = starts.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (starts[m] <= t) lo = m + 1; else hi = m; }
  return lo;
}

// ------------------------------------------------------------------ player
/** Narration captions, one phrase at a time (paced like speech), never more than two lines. */
function chunks(say: string) {
  const out: string[] = [];
  for (const sent of say.split(/(?<=[.;!?؟])\s+/)) {
    if (sent.length <= 130) { out.push(sent); continue; }
    let cur = "";
    for (const part of sent.split(/(?<=[,،—:])\s+/)) { if ((cur + " " + part).trim().length > 130 && cur) { out.push(cur.trim()); cur = part; } else cur = `${cur} ${part}`; }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.reduce<string[]>((a, c) => { if (a.length && (a[a.length - 1].length < 40 || c.length < 25) && (a[a.length - 1] + c).length < 140) a[a.length - 1] += " " + c; else a.push(c); return a; }, []);
}
function Caption({ text, playing, pos }: { text: string; playing: boolean; pos: number }) {
  const parts = useMemo(() => chunks(text), [text]);
  // Where each caption starts in the spoken text, so captions can follow the voice exactly.
  const offsets = useMemo(() => { let cur = 0; return parts.map((p) => { const i = spokenText(text).indexOf(p, cur); if (i >= 0) cur = i; return cur; }); }, [parts, text]);
  const [k, setK] = useState(0);
  const timed = pos >= 0;
  useEffect(() => {
    if (timed || !playing || k >= parts.length - 1) return;
    const id = setTimeout(() => setK(k + 1), Math.max(1800, (parts[k].split(/\s+/).length / 2.5) * 1000));
    return () => clearTimeout(id);
  }, [k, playing, parts, timed]);
  let cur = k;
  if (timed) { cur = 0; offsets.forEach((o, i) => { if (o <= pos) cur = i; }); }
  return <div className="kd-cc"><span key={cur}>{parts[cur]}</span></div>;
}

export function DeckPlayer({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [pptBusy, setPptBusy] = useState(false);
  const { t } = useI18n();
  const lang = deck.lang, slides = deck.slides;
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [wipe, setWipe] = useState(0); // the orange chevron sweep between slides
  const [held, setHeld] = useState(true); // inner motion paused until the wipe has passed
  useEffect(() => { setHeld(true); const id = setTimeout(() => setHeld(false), HOLD); return () => clearTimeout(id); }, [i]);
  const [playing, setPlaying] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [voice, setVoice] = useState<Voice>({ mode: "none" });
  const failsRef = useRef(0); // ElevenLabs failures in a row
  const [voiceNote, setVoiceNote] = useState<string | null>(null); // why ElevenLabs is not speaking, when it is not
  const [started, setStarted] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  const audio = useRef<HTMLAudioElement | null>(null), root = useRef<HTMLDivElement>(null);
  const tts = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const s = slides[i];
  // The greeting is added when the deck is played, from the viewer's clock (a report built at 07:30 may be played at 16:00).
  // Dates are said in words here too, for reports written before the script did it (only without cues: the cue
  // positions belong to the text exactly as written).
  const said = s.cues?.length ? s.say : speakDates(s.say, lang);
  const say = spokenText(i === 0 && s.kind === "cover" ? withGreeting(said, lang) : said);
  const [pos, setPos] = useState(-1); // how far the narration has got into `say` (-1: not narrating)
  const dur = useMemo(() => Math.min(26000, Math.max(7500, (s.say.split(/\s+/).length / 2.5) * 1000 + 3000)), [s]);
  const go = (n: number) => {
    const to = Math.max(0, Math.min(slides.length - 1, n));
    if (to === i) return;
    tts?.cancel(); audio.current?.pause();
    if (asking === "speaking" || asking === "thinking") stopAnswer();
    setLeaving(i); setTimeout(() => setLeaving(null), 520); setWipe((w) => w + 1);
    setI(to); setStarted(Date.now()); setPos(-1); resumeAt.current = 0; setAwaitQ(false); setQDeadline(null); setFollowUp(false); if (followTimer.current) clearTimeout(followTimer.current);
    // A question waiting for the end of the slide is taken straight away when the manager moves on.
    if (holdRef.current != null) { holdRef.current = null; setPlaying(false); setAsking("thinking"); setAskSeq((n) => n + 1); }
  };

  useEffect(() => {
    let live = true;
    fetch("/api/voice").then((r) => r.json()).then((x) => { if (live) setVoice({ mode: x?.enabled ? "eleven" : tts ? "browser" : "none" }); })
      .catch(() => live && setVoice({ mode: tts ? "browser" : "none" }));
    return () => { live = false; };
  }, [tts]);
  useEffect(() => { const n = slides[i + 1]; if (voice.mode === "eleven" && voiceOn && n) { const t = spokenText(n.cues?.length ? n.say : speakDates(n.say, lang)); elevenAudio(t, lang, pausesFor(n, t)); } }, [i, voice.mode, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const pauses = useMemo(() => pausesFor(s, say), [s, say]);

  // ---- questions asked mid-presentation: the voice finishes its sentence, answers in the same voice, then carries on
  const [askOpen, setAskOpen] = useState(false);
  const [qText, setQText] = useState("");
  const [qa, setQa] = useState<{ q: string; a: string | null; history: { q: string; a: string }[] } | null>(null);
  const [asking, setAsking] = useState<"waiting" | "thinking" | "speaking" | null>(null); // waiting: for the sentence to end
  const [aPos, setAPos] = useState(-1); // how far the spoken answer has got
  const [askSeq, setAskSeq] = useState(0); // bumps when an answer should start (the asking state itself changes while it plays)
  const holdRef = useRef<number | null>(null); // character of `say` after which the narration pauses for the question
  const pendingRef = useRef<{ answer: Promise<string>; bridge: Promise<Clip | null> | null; ready: () => boolean } | null>(null);
  const clipRef = useRef<{ i: number; a: HTMLAudioElement } | null>(null); // the slide's narration, so a pause resumes where it stopped
  const answerRef = useRef<HTMLAudioElement | null>(null); // the answer being spoken (so Pause pauses it, not the slide)
  const [qPaused, setQPaused] = useState(false);
  // A question being written or spoken holds the presentation at the end of the slide (never mid-slide).
  const [awaitQ, setAwaitQ] = useState(false);
  // The window for questions at the end of every slide: 0 (none), seconds, or "hold" (until ▶ / Next). Remembered on this device.
  const [qPause, setQPauseRaw] = useState<number | "hold">(() => { try { const v = localStorage.getItem("kinan.deck.qpause"); return v === "hold" ? "hold" : v == null ? 8 : Number(v) || 0; } catch { return 8; } });
  const qPauseRef = useRef<number | "hold">(qPause); qPauseRef.current = qPause;
  const setQPause = (v: number | "hold") => { setQPauseRaw(v); try { localStorage.setItem("kinan.deck.qpause", String(v)); } catch { /* storage off */ } };
  const [qDeadline, setQDeadline] = useState<number | null>(null); // when the question window closes by itself
  const posRef = useRef(-1); posRef.current = pos;
  const deferredRef = useRef(false); // a slow answer is being worked out in the background while the brief carries on
  const followRecRef = useRef(false); // the microphone was opened by the presenter after an answer ("does that answer it?")
  const moveOnRef = useRef<(() => void) | null>(null); // "no further question" — set while the follow-up window is open
  const [followUp, setFollowUp] = useState(false); // the few seconds after an answer, for a follow-up question
  const [moveOnText, setMoveOnText] = useState<string | null>(null); // the line said when no further question comes
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  // ---- asking by voice (app/_components/useVoiceInput.ts): the words appear live while you speak; ElevenLabs gives the
  // final text, which is asked straight away.
  const [micNote, setMicNote] = useState<string | null>(null);
  const ACK = /^\s*(yes|yeah|yep|yup|ok|okay|sure|fine|good|great|perfect|clear|understood|got it|that(?:'s| is| was) (?:clear|fine|all|it|good|enough|helpful)|thanks?(?: you)?(?: very much)?|no|nope|no,? (?:thanks|thank you|that(?:'s| is) (?:all|fine|it))|nothing(?: else| more)?|carry on|move on|go on|continue|next|نعم|أجل|ايوه|أيوه|تمام|واضح|شكرا|شكراً|لا|لا شكرا|كمل|أكمل|تابع|استمر|ممتاز|جيد)[.!؟?\s]*$/i;
  const voiceIn = useVoiceInput({ lang, maxMs: 20000,
    onFinal: (text) => {
      setMicNote(null);
      // After an answer the presenter asked whether that covered it: "yes" / "thanks" / "no, carry on" is not a question.
      if (followRecRef.current) { followRecRef.current = false; if (ACK.test(text) || text.trim().split(/\s+/).length <= 2) { setQText(""); moveOnRef.current?.(); return; } }
      setQText(text); ask(text);
    },
    onError: (why) => {
      if (followRecRef.current) { followRecRef.current = false; moveOnRef.current?.(); return; } // nothing said after the answer: on we go
      setMicNote(why === "mic" ? t("The microphone is not available — allow it in the browser, or type the question.") : t("I didn't catch that — try again, or type the question.")); setAskOpen(true);
    } });
  const rec = voiceIn.state;
  const startRecording = () => { if (rec !== "off" || asking) return; setMicNote(null); setAskOpen(true); voiceIn.start(); };
  const stopRecording = () => voiceIn.stop();
  composingRef.current = !asking && (rec !== "off" || (askOpen && qText.trim().length > 0));
  useEffect(() => { if (awaitQ && !asking && rec === "off" && !askOpen) carryOn(); }, [awaitQ, asking, rec, askOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopAnswer = () => { answerRef.current?.pause(); answerRef.current = null; tts?.cancel(); pendingRef.current = null; setAsking(null); setAPos(-1); setQPaused(false); setAskSeq((n) => n + 1); /* cancels the answer in flight */ };
  /** Pause / Play: while an answer is being spoken it pauses the answer; otherwise the slide. */
  const togglePlay = () => {
    if (asking === "speaking") {
      const a = answerRef.current;
      if (a) { if (a.paused) { a.play().catch(() => undefined); setQPaused(false); } else { a.pause(); setQPaused(true); } }
      else if (tts) { if (qPaused) { tts.resume(); setQPaused(false); } else { tts.pause(); setQPaused(true); } }
      return;
    }
    if (asking === "thinking") return; // the answer is on its way: nothing to pause yet
    if (awaitQ) { carryOn(); return; }
    setPlaying((p) => !p); setStarted(Date.now());
  };
  const resumeAt = useRef(0); // browser voice: where to pick the text up again
  /** Leave the hold: no question after all — on to the next slide. */
  const carryOn = () => { setAwaitQ(false); setAskOpen(false); setQText(""); setQDeadline(null); resumeAt.current = 0; if (i < slides.length - 1) go(i + 1); setPlaying(true); setStarted(Date.now()); };
  // The question window counts down only while nobody is typing or speaking; at zero the brief carries on.
  useEffect(() => {
    if (!awaitQ || qDeadline == null) return;
    const id = setInterval(() => {
      if (asking) return;
      if (composingRef.current) { setQDeadline((d) => (d == null ? d : Math.max(d, Date.now() + 4000))); return; } // give a started question time
      if (Date.now() >= qDeadline) { clearInterval(id); carryOn(); }
    }, 250);
    return () => clearInterval(id);
  }, [awaitQ, qDeadline, asking]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (q: string) => {
    const question = q.replace(/\s+/g, " ").trim();
    if (!question || asking) return;
    setAwaitQ(false); setFollowUp(false); setQDeadline(null); if (followTimer.current) clearTimeout(followTimer.current);
    if (rec !== "off") followRecRef.current = false;
    const history = qa?.history ?? [];
    const answer = fetch("/api/deck-ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, lang, slide: i, title: deck.title, history, slides: slides.map((x) => ({ kind: x.kind, title: slideTitle(x), say: x.say })) }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j?.answer) throw new Error(j?.error || "no answer"); return String(j.answer); })
      .catch(() => (lang === "ar" ? "لم أستطع الإجابة عن ذلك الآن. لنتابع." : "I couldn't get an answer to that just now. Let's carry on."));
    const bridge = voice.mode === "eleven" && voiceOn ? elevenAudio(line("bridge", lang), lang) : null;
    let arrived = false; // the answer (and, with ElevenLabs, its audio) is usually ready before the slide ends
    const prepared = answer.then(async (text) => { if (bridge) await elevenAudio(text, lang); arrived = true; return text; });
    pendingRef.current = { answer: prepared, bridge, ready: () => arrived };
    setQa({ q: question, a: null, history }); setQText(""); setAskOpen(false);
    // Let the presenter finish the whole slide before taking the question; paused, it is taken at once.
    if (!playing || pos < 0) { holdRef.current = null; setPlaying(false); setAsking("thinking"); setAskSeq((n) => n + 1); }
    else { holdRef.current = say.length; setAsking("waiting"); }
  };
  // The narration has reached the end of its sentence: pause it and take the question.
  useEffect(() => {
    if (asking !== "waiting" || holdRef.current == null || holdRef.current >= say.length || pos < holdRef.current) return; // the end of the slide is taken when its voice ends
    holdRef.current = null; resumeAt.current = pos; setPlaying(false); setAsking("thinking"); setAskSeq((n) => n + 1);
  }, [pos, asking, say.length]);
  // Answer: the bridge line, then the answer (spoken with ElevenLabs or the browser voice, or shown as captions), then on with the slide.
  useEffect(() => {
    if (!askSeq || !pendingRef.current) return;
    const { answer, bridge, ready } = pendingRef.current; pendingRef.current = null;
    let live = true, follow: ReturnType<typeof setInterval> | null = null, clip: HTMLAudioElement | null = null;
    const finish = () => {
      if (!live) return; live = false; if (follow) clearInterval(follow); answerRef.current = null; setQPaused(false); setAsking(null); setAPos(-1); setStarted(Date.now());
      // The presenter has just asked whether that was clear: leave a moment for a follow-up before carrying on.
      setAskOpen(true); setQText(""); setFollowUp(true);
      // The presenter just asked whether that answered it: the microphone opens by itself for the reply. Silence, "yes" or
      // "thanks" moves on; anything else is the next question. The recording stops after 8 s if nothing was said.
      if (voice.mode === "eleven" && voiceOn && voiceIn.state === "off") { followRecRef.current = true; voiceIn.start(); setTimeout(() => { if (followRecRef.current && voiceIn.state === "recording" && !voiceIn.live) voiceIn.stop(); }, 8000); }
      const moveOn = async () => {
        setFollowUp(false); moveOnRef.current = null;
        if (composingRef.current && !followRecRef.current) { setAwaitQ(true); return; } // a follow-up is being written or spoken: wait for it, as at the end of a slide
        setAskOpen(false);
        const carry = () => {
          if (composingRef.current) { setAwaitQ(true); return; } // they started a question while the line was said
          if (resumeAt.current >= say.length) { resumeAt.current = 0; if (i < slides.length - 1) go(i + 1); else { setPlaying(false); return; } } // the slide was over: on to the next
          setPlaying(true); setStarted(Date.now());
        };
        // No further question: a short spoken line ("Right, let's move on."), then on.
        const text = line("moveOn", lang);
        setQa((x) => (x ? { ...x, a: text } : x)); setMoveOnText(text);
        if (voiceOn && voice.mode === "eleven") {
          const c = await elevenAudio(text, lang);
          if (c) { const a = new Audio(c.url); answerRef.current = a; const end = () => { answerRef.current = null; setMoveOnText(null); carry(); }; a.onended = end; a.onerror = end; a.play().catch(end); return; }
        }
        if (voiceOn && tts) { const u = new SpeechSynthesisUtterance(text); u.lang = lang === "ar" ? "ar-SA" : "en-GB"; const end = () => { setMoveOnText(null); carry(); }; u.onend = end; u.onerror = end; tts.speak(u); return; }
        setTimeout(() => { setMoveOnText(null); carry(); }, 1200);
      };
      moveOnRef.current = moveOn;
      followTimer.current = setTimeout(() => { if (followRecRef.current) return; /* the microphone decides */ moveOn(); }, 9000);
    };
    const playClip = (c: Clip | null, onEnd: () => void) => {
      if (!c) { onEnd(); return; }
      const a = new Audio(c.url); clip = a; answerRef.current = a; a.onended = onEnd; a.onerror = onEnd; a.play().catch(onEnd);
      if (follow) clearInterval(follow);
      follow = c.starts.length ? setInterval(() => setAPos(spokenChars(c.starts, a.currentTime + 0.15)), 80) : null;
    };
    const speakAnswer = async (text: string) => {
      if (!live) return;
      setQa((x) => (x ? { ...x, a: text, history: [...x.history, { q: x.q, a: text }].slice(-5) } : x)); setAsking("speaking"); setAPos(0);
      if (voice.mode === "eleven" && voiceOn) { playClip(await elevenAudio(text, lang), finish); return; }
      if (voice.mode === "browser" && voiceOn && tts) {
        const u = new SpeechSynthesisUtterance(text); u.lang = lang === "ar" ? "ar-SA" : "en-GB";
        const v = tts.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "ar" ? "ar" : "en")); if (v) u.voice = v;
        u.onend = finish; u.onerror = finish; u.onboundary = (e) => setAPos(e.charIndex + (e.charLength ?? 0)); tts.speak(u); return;
      }
      setTimeout(finish, Math.max(4000, (text.split(/\s+/).length / 2.5) * 1000)); // captions only: time to read it
    };
    (async () => {
      // The answer names the question's subject itself; the bridge line is only for when it is still on its way.
      if (bridge && !ready()) playClip(await bridge, async () => {
        if (ready()) { speakAnswer(await answer); return; }
        // Still not ready after the bridge line: wait a few seconds more, then carry on with the brief and come back to it.
        const slow = await Promise.race([answer.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 4000))]);
        if (!live) return;
        if (!slow) { speakAnswer(await answer); return; }
        const text = line("carryOn", lang);
        setQa((x) => (x ? { ...x, a: text } : x)); setMoveOnText(text);
        const resume = () => {
          if (!live) return; live = false; if (follow) clearInterval(follow); answerRef.current = null;
          setMoveOnText(null); deferredRef.current = true; setAsking("waiting"); setAPos(-1); setPlaying(true); setStarted(Date.now());
          answer.then(() => {
            if (!deferredRef.current) return; deferredRef.current = false;
            // The answer is in: pause at the end of the sentence being said (or the end of the slide) and give it.
            const p = posRef.current, m = p >= 0 ? say.indexOf(". ", p) : -1;
            pendingRef.current = { answer, bridge: null, ready: () => true };
            holdRef.current = m >= 0 ? Math.min(say.length, m + 1) : say.length;
          });
        };
        playClip(await elevenAudio(text, lang), resume);
      }); else speakAnswer(await answer);
    })();
    return () => { live = false; if (follow) clearInterval(follow); clip?.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSeq]);

  // Narration and auto-advance (the slide always gets time for its animation).
  const answering = asking === "thinking" || asking === "speaking"; // (a question merely waiting lets the slide finish)
  useEffect(() => {
    if (!playing || answering) { if (!answering) tts?.cancel(); audio.current?.pause(); return; }
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      // A question is waiting: the slide is finished, so take it now and move on afterwards.
      if (holdRef.current != null) { holdRef.current = null; resumeAt.current = say.length; setPlaying(false); setAsking("thinking"); setAskSeq((n) => n + 1); return; }
      // A question is being written or spoken: the slide is over, so wait for it here rather than move on.
      if (composingRef.current) { resumeAt.current = say.length; setPlaying(false); setAwaitQ(true); return; }
      // Time for a question before the next slide (the manager's setting: a few seconds, or hold until ▶ / Next).
      if (qPauseRef.current !== 0 && i < slides.length - 1 && asking !== "waiting") { resumeAt.current = say.length; setPlaying(false); setAwaitQ(true); setAskOpen(true); setQDeadline(qPauseRef.current === "hold" ? null : Date.now() + qPauseRef.current * 1000); return; }
      if (i < slides.length - 1) go(i + 1); else setPlaying(false);
    };
    const t0 = Date.now(), minShow = 4500;
    const after = () => setTimeout(next, Math.max(900, minShow - (Date.now() - t0)));
    const guard = setTimeout(next, Math.max(dur, 45000));
    // Without exact timings the position is paced like the captions (about 2.5 words a second).
    // Paced after a question: pick the text up where the narration stopped rather than from the top.
    const off = voice.mode !== "eleven" && resumeAt.current > 0 && resumeAt.current < say.length - 10 ? (resumeAt.current / say.length) * dur : 0;
    if (voice.mode !== "browser") resumeAt.current = 0;
    const pace = (ms: number) => setInterval(() => setPos(Math.min(say.length, Math.round(((Date.now() - t0 + off) / ms) * say.length))), 100);
    if (voiceOn && voice.mode === "eleven") {
      let follow: ReturnType<typeof setInterval> | null = null;
      elevenAudio(say, lang, pauses).then((clip) => {
        if (done) return;
        if (!clip) {
          failsRef.current += 1;
          const why = lastVoiceError ?? "";
          if (failsRef.current >= 3) { setVoice({ mode: tts ? "browser" : "none" }); setVoiceNote(why); return; }
          setVoiceNote(why);
          // This slide in the browser voice; ElevenLabs is tried again on the next one.
          if (tts) { const u = new SpeechSynthesisUtterance(say.slice(0, 600)); u.lang = lang === "ar" ? "ar-SA" : "en-GB"; u.onend = after; u.onboundary = (e) => setPos(e.charIndex + (e.charLength ?? 0)); tts.speak(u); }
          else setTimeout(next, dur);
          return;
        }
        failsRef.current = 0; setVoiceNote(null);
        // Paused on this slide (a question, or the pause button): carry on from where the voice stopped.
        const prev = clipRef.current && clipRef.current.i === i && !clipRef.current.a.ended ? clipRef.current.a : null;
        const a = prev ?? new Audio(clip.url); audio.current = a; clipRef.current = { i, a };
        a.onended = after; a.onerror = () => setTimeout(next, dur); a.play().catch(() => setTimeout(next, dur));
        follow = clip.starts.length ? setInterval(() => setPos(spokenChars(clip.starts, a.currentTime + 0.15)), 80) : pace(dur);
      });
      return () => { done = true; clearTimeout(guard); if (follow) clearInterval(follow); audio.current?.pause(); };
    }
    if (voiceOn && voice.mode === "browser" && tts) {
      tts.cancel();
      const from = resumeAt.current > 0 && resumeAt.current < say.length - 10 ? resumeAt.current : 0; resumeAt.current = 0;
      const u = new SpeechSynthesisUtterance(say.slice(from, from + 600));
      u.lang = lang === "ar" ? "ar-SA" : "en-GB";
      const v = tts.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "ar" ? "ar" : "en"));
      if (v) u.voice = v;
      u.rate = 1.0; u.onend = after; u.onerror = () => setTimeout(next, dur);
      u.onboundary = (e) => setPos(from + e.charIndex + (e.charLength ?? 0)); // fires at every word
      tts.speak(u);
      return () => { done = true; clearTimeout(guard); tts.cancel(); };
    }
    clearTimeout(guard);
    const id = setTimeout(next, Math.max(1500, dur - off)), follow = pace(dur);
    return () => { done = true; clearTimeout(id); clearInterval(follow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, voiceOn, voice.mode, answering]);
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 120); return () => clearInterval(id); }, []);
  const full = () => { const el = root.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") { if (e.key === "Escape") setAskOpen(false); return; }
      if (e.key === "Escape") { if (!document.fullscreenElement) onClose(); }
      else if (e.key === "ArrowRight") go(lang === "ar" ? i - 1 : i + 1);
      else if (e.key === "ArrowLeft") go(lang === "ar" ? i + 1 : i - 1);
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "f" || e.key === "F") full();
      else if (e.key === "c" || e.key === "C") setCaptions((c) => !c);
      else if (e.key === "m" || e.key === "M") setVoiceOn((v) => !v);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => { tts?.cancel(); audio.current?.pause(); }, [tts]);
  // The page underneath must not scroll (or show scrollbars) while the player is open.
  useEffect(() => { const el = document.documentElement, b = document.body, prev = [el.style.overflow, b.style.overflow]; el.style.overflow = "hidden"; b.style.overflow = "hidden"; return () => { el.style.overflow = prev[0]; b.style.overflow = prev[1]; }; }, []);

  const narrating = voiceOn && voice.mode !== "none";
  // Cover, dividers and the closing page are full-bleed (orange or charcoal); the chrome turns white on them.
  const bg = s.kind === "cover" ? "orange" : s.kind === "divider" || s.kind === "closing" ? "dark" : null;
  const progress = playing ? Math.min(narrating ? 0.96 : 1, (tick - started) / (narrating ? Math.max(dur, 9000) : dur)) : 0;
  const ff = lang === "ar" ? KINAN.fontAr : KINAN.font;

  return (
    <div ref={root} role="dialog" aria-label={deck.title} dir={lang === "ar" ? "rtl" : "ltr"} className={`kd-root${bg ? ` kd-on-${bg}` : ""}`} style={{ fontFamily: ff }}>
      <div className="kd-bg" aria-hidden="true">
        <span className="kd-tex" />
        {bg && <div key={`bg${i}`} className={`kd-fullbg kd-fb-${bg}${s.kind === "closing" ? " kd-fb-closing" : ""}`}><span className="kd-fb-tex" />{s.kind === "divider" && <><span className="kd-fb-band a" /><span className="kd-fb-band b" /></>}{s.kind === "cover" && <><span className="kd-fb-band w1" /><span className="kd-fb-band w2" /></>}</div>}
      </div>
      <div className="kd-top">
        <span className="kd-toplogo" dangerouslySetInnerHTML={{ __html: kinanLogoHtml(34, bg ? "#fff" : CH) }} />
        <div className="kd-timeline">
          {slides.map((x, k) => (
            <button key={k} className="kd-seg" title={`${k + 1}. ${slideTitle(x)}`} aria-label={`${k + 1}. ${slideTitle(x)}`} onClick={() => go(k)}>
              <span style={{ width: k < i ? "100%" : k === i ? `${Math.round(progress * 100)}%` : "0%", transition: k === i ? "width .12s linear" : "none" }} />
            </button>
          ))}
        </div>
        {s.kind !== "cover" && <span className="kd-topchev" dangerouslySetInnerHTML={{ __html: chevron(lang === "ar" ? "rtl" : "ltr", 34, bg ? "#fff" : OR) }} />}
        <button className="kd-btn kd-icon" onClick={onClose} aria-label={t("Close")}>✕</button>
      </div>
      <div className="kd-stage">
        <button className="kd-edge start" aria-label={t("Back")} onClick={() => go(lang === "ar" ? i + 1 : i - 1)} />
        <button className="kd-edge end" aria-label={t("Next")} onClick={() => go(lang === "ar" ? i - 1 : i + 1)} />
        <div className="kd-footline" dir="ltr"><b>{i + 1}</b><span>|</span>KINAN<span>|</span>{t(deck.title.split("—")[0].trim() || "Daily marketing report")}</div>
        {wipe > 0 && <div key={`w${wipe}`} className="kd-wipe" aria-hidden="true"><span /><span /></div>}
        <div className="kd-stack">
          {leaving != null && <div key={`l${leaving}`} className="kd-slide kd-exit" aria-hidden="true"><SlideView s={slides[leaving]} lang={lang} /></div>}
          <div key={i} className={`kd-slide kd-enter${held ? " kd-hold" : ""}`}><SpokenCtx.Provider value={{ text: say, pos, cues: s.cues }}><SlideView s={s} lang={lang} /></SpokenCtx.Provider></div>
        </div>
      </div>
      {voiceNote && <div className="kd-q" dir="ltr" title={voiceNote}><span className="kd-q-tag" style={{ background: "#b7791f" }}>ElevenLabs</span>{voiceNote.slice(0, 160)}</div>}
      {followUp && !asking && !awaitQ && <div className="kd-q"><span className="kd-q-tag">{t("Question")}</span>{t("Any other question? Type it or tap the microphone.")}</div>}
      {awaitQ && !asking && <div className="kd-q"><span className="kd-q-tag">{t("Question")}</span>{qDeadline != null ? `${t("Any question? Type it or tap the microphone.")} ${t("Carrying on in")} ${Math.max(0, Math.ceil((qDeadline - tick) / 1000))} ${t("s")} — ${t("or press Next.")}` : t("Paused for your question — send it, or press ▶ / Next to carry on.")}</div>}
      {qa && asking && <div className="kd-q" dir="auto"><span className="kd-q-tag">{t("Question")}</span>{qa.q}{asking === "thinking" && <span className="kd-q-wait"> · {t("thinking…")}</span>}</div>}
      {moveOnText ? <div className="kd-cc"><span>{moveOnText}</span></div> : asking === "speaking" && qa?.a ? <Caption key={`qa${qa.history.length}`} text={qa.a} playing={!qPaused} pos={aPos} /> : captions && <Caption key={`cc${i}`} text={say} playing={playing} pos={pos} />}
      {askOpen && (
        <form className="kd-ask" onSubmit={(e) => { e.preventDefault(); ask(qText); }}>
          <button type="button" className={`kd-btn kd-mic${rec === "recording" ? " on" : ""}`} onClick={() => (rec === "recording" ? stopRecording() : startRecording())} disabled={rec === "transcribing" || !!asking} title={rec === "recording" ? t("Stop and send") : t("Ask by voice")} aria-pressed={rec === "recording"}>{rec === "recording" ? "■" : rec === "transcribing" ? "…" : "🎤"}</button>
          <input autoFocus className="kd-ask-in" value={rec === "recording" && voiceIn.live ? voiceIn.live : qText} onChange={(e) => setQText(e.target.value)} placeholder={rec === "recording" ? t("Listening… tap ■ when you have finished") : rec === "transcribing" ? t("Writing it down…") : micNote || t("Ask the presenter a question, or tap the microphone…")} aria-label={t("Ask the presenter a question…")} maxLength={500} disabled={rec !== "off"} />
          <button type="submit" className="kd-btn kd-primary" disabled={!qText.trim() || !!asking}>{t("Ask")}</button>
          <button type="button" className="kd-btn" onClick={() => setAskOpen(false)}>✕</button>
        </form>
      )}
      <div className="kd-controls">
        <button className="kd-btn" onClick={() => go(i - 1)} disabled={i === 0}>{lang === "ar" ? "→" : "←"} {t("Back")}</button>
        <button className="kd-btn kd-primary" onClick={togglePlay} disabled={asking === "thinking"} title={(asking === "speaking" ? !qPaused : playing) ? t("Pause") : t("Play")} aria-label={(asking === "speaking" ? !qPaused : playing) ? t("Pause") : t("Play")}>{(asking === "speaking" ? !qPaused : playing) ? "❚❚" : "▶"}</button>
        <button className="kd-btn" onClick={() => go(i + 1)} disabled={i === slides.length - 1}>{t("Next")} {lang === "ar" ? "←" : "→"}</button>
        {voice.mode !== "none" && <button className="kd-btn" onClick={() => { setVoiceOn(!voiceOn); setStarted(Date.now()); }} aria-pressed={voiceOn} aria-label={voiceOn ? t("Voice on") : t("Voice off")} title={voiceOn ? t("Voice on") : t("Voice off")}>{voiceOn ? "🔊" : "🔇"}</button>}
        <button className="kd-btn" onClick={() => setAskOpen((o) => !o)} aria-pressed={askOpen} disabled={!!asking} title={t("Ask the presenter a question…")}>💬 {t("Ask")}</button>
        {voice.mode === "eleven" && <button className={`kd-btn kd-mic${rec === "recording" ? " on" : ""}`} onClick={() => (rec === "recording" ? stopRecording() : startRecording())} disabled={rec === "transcribing" || !!asking} title={t("Ask by voice")} aria-pressed={rec === "recording"}>{rec === "recording" ? `■ ${t("Stop and send")}` : rec === "transcribing" ? "…" : "🎤"}</button>}
        <button className="kd-btn" onClick={() => setQPause(qPause === 0 ? 8 : qPause === 8 ? 15 : qPause === 15 ? "hold" : 0)} title={t("Time for questions after each slide")} aria-label={t("Time for questions after each slide")}>⏱ {qPause === "hold" ? t("Hold") : qPause === 0 ? t("No pause") : `${qPause} ${t("s")}`}</button>
        <button className="kd-btn" onClick={() => setCaptions(!captions)} aria-pressed={captions}>CC</button>
        <button className="kd-btn" onClick={full} aria-label="Fullscreen">⛶</button>
        <button className="kd-btn" disabled={pptBusy} onClick={async () => {
          setPptBusy(true);
          try { const { deckToPptx } = await import("./deckPptx"); const { saveFile } = await import("./saveFile"); await saveFile(`${(deck.title || "report").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.pptx`, await deckToPptx(deck), "application/vnd.openxmlformats-officedocument.presentationml.presentation"); }
          catch (e) { console.error(e); alert(t("The PowerPoint file could not be created.")); } finally { setPptBusy(false); }
        }} title={t("Download as PowerPoint")}>{pptBusy ? t("Preparing…") : `⬇ ${t("PowerPoint")}`}</button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.kd-root { position: fixed; inset: 0; z-index: 1000; color: ${INK}; display: flex; flex-direction: column; background: ${PAPER}; overflow: hidden; }
.kd-on-orange, .kd-on-dark { color: #fff; }
.kd-tex { position: absolute; inset: 0; background: ${KINAN.texture ? `url("${KINAN.texture}") center / cover no-repeat` : "linear-gradient(135deg, #fbfbfa, #ececec)"}; opacity: .26; }
.kd-tex::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,255,255,0) 35%, rgba(255,255,255,.55) 70%, rgba(255,255,255,.75)); }
.kd-fullbg { position: absolute; inset: 0; animation: kdFade .7s ease both; }
.kd-fb-orange { background: linear-gradient(118deg, #f5602a, ${OR} 55%, #e04f22); }
.kd-fb-dark { background: ${CH}; }
.kd-fb-tex { position: absolute; inset: 0; background: ${KINAN.texture ? `url("${KINAN.texture}") center / cover no-repeat` : "none"}; mix-blend-mode: multiply; opacity: .35; }
.kd-fb-dark .kd-fb-tex { mix-blend-mode: soft-light; opacity: .3; }
.kd-fb-band { position: absolute; top: -12%; bottom: -12%; width: 24vw; background: ${OR}; clip-path: polygon(0 0, 56% 0, 100% 50%, 56% 100%, 0 100%, 44% 50%); inset-inline-end: 10vw; opacity: .96; animation: kdBand 1.3s ${EASE} .25s both; will-change: transform; }
.kd-fb-band.b { inset-inline-end: 24vw; background: rgba(255,255,255,.07); animation-delay: .15s; }
.kd-fb-band.w1 { background: rgba(255,255,255,.09); --o: 1; inset-inline-end: 6vw; width: 30vw; animation-duration: 1.6s; }
.kd-fb-band.w2 { background: rgba(255,255,255,.06); --o: 1; inset-inline-end: 26vw; width: 22vw; animation-duration: 2s; animation-delay: .2s; }
[dir="rtl"] .kd-fb-band { transform: scaleX(-1); }
.kd-fb-closing { background: ${CH}; }
.kd-fb-closing::before { content: ""; position: absolute; inset: 0; background: linear-gradient(118deg, #f5602a, ${OR} 55%, #e04f22); animation: kdWipe 1s ${EASE} 2.75s forwards; }
.kd-onbg { position: relative; }
.kd-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.kd-top { position: relative; display: flex; align-items: center; gap: 18px; padding: 14px 22px 6px; }
.kd-toplogo { display: inline-block; height: 34px; }
.kd-topchev { display: inline-flex; }
.kd-timeline { flex: 1; display: flex; gap: 4px; }
.kd-seg { flex: 1; height: 14px; background: none; border: 0; padding: 5px 0; cursor: pointer; position: relative; }
.kd-seg::before { content: ""; position: absolute; left: 0; right: 0; top: 5px; height: 4px; border-radius: 2px; background: rgba(46,46,47,.14); transition: background .2s; }
.kd-on-orange .kd-seg::before, .kd-on-dark .kd-seg::before { background: rgba(255,255,255,.28); }
.kd-on-orange .kd-seg span { background: #fff; box-shadow: none; }
.kd-seg:hover::before { background: rgba(46,46,47,.3); }
.kd-seg span { position: absolute; left: 0; top: 5px; height: 4px; border-radius: 2px; background: ${OR}; }
[dir="rtl"] .kd-seg span { left: auto; right: 0; }
.kd-stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: clamp(10px, 2.4vh, 30px) clamp(18px, 6vw, 100px); overflow: hidden; }
.kd-stack { display: grid; width: 100%; max-width: 1280px; max-height: 100%; }
.kd-slide { grid-area: 1 / 1; min-width: 0; overflow-y: auto; overflow-x: hidden; max-height: calc(100vh - 190px); padding: 14px 18px 18px; scrollbar-width: none; }
.kd-enter { animation: kdReveal 1s ${EASE} both; will-change: transform, opacity; }
.kd-exit { animation: kdExit .45s ease forwards; pointer-events: none; will-change: transform, opacity; }
.kd-hold * { animation-play-state: paused !important; }
.kd-wipe { position: absolute; inset: -10% 0; z-index: 3; pointer-events: none; overflow: hidden; }
.kd-wipe span { position: absolute; top: 0; bottom: 0; width: 36vw; left: -52vw; background: ${OR}; clip-path: polygon(0 0, 58% 0, 100% 50%, 58% 100%, 0 100%, 42% 50%); animation: kdSweep 1s cubic-bezier(.7,0,.2,1) both; will-change: transform; }
.kd-wipe span:nth-child(2) { background: ${CH}; opacity: .92; animation-delay: .08s; }
[dir="rtl"] .kd-wipe span { left: auto; right: -50vw; transform: scaleX(-1); animation-name: kdSweepR; }
.kd-edge { position: absolute; top: 0; bottom: 0; width: 8vw; min-width: 40px; background: none; border: 0; cursor: pointer; z-index: 2; }
.kd-edge.start { inset-inline-start: 0; } .kd-edge.end { inset-inline-end: 0; }
.kd-edge:hover { background: linear-gradient(var(--kd-dir, 90deg), rgba(46,46,47,.04), transparent); }
.kd-footline { position: absolute; bottom: 6px; inset-inline-start: 26px; z-index: 2; font-size: 10px; letter-spacing: .3em; text-transform: uppercase; color: ${KINAN.greyText}; display: flex; gap: 10px; align-items: center; pointer-events: none; }
.kd-footline b { color: ${OR}; font-weight: 700; } .kd-footline span { opacity: .6; }
.kd-on-orange .kd-footline, .kd-on-dark .kd-footline { color: rgba(255,255,255,.7); } .kd-on-orange .kd-footline b { color: #fff; }
.kd-cc { position: relative; text-align: center; padding: 0 12vw 6px; min-height: 30px; }
.kd-on-orange .kd-cc span, .kd-on-dark .kd-cc span { background: rgba(255,255,255,.94); color: ${INK}; }
.kd-cc span { display: inline-block; max-width: 980px; background: ${CH}; color: #fff; font-size: clamp(12px, 1.1vw, 15px); line-height: 1.5; padding: 6px 14px; border-radius: 6px; animation: kdFade .45s ease 300ms both; opacity: 0; display: -webkit-inline-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.kd-controls { position: relative; display: flex; justify-content: center; gap: 10px; padding: 8px 12px 20px; flex-wrap: wrap; }
.kd-ask { position: relative; display: flex; justify-content: center; gap: 8px; padding: 4px 12vw 6px; }
.kd-ask-in { flex: 1; max-width: 720px; border: 1px solid rgba(46,46,47,.35); border-radius: 24px; padding: 9px 16px; font-size: 14px; font-family: inherit; background: ${PAPER}; color: ${INK}; }
.kd-ask-in:focus { outline: 2px solid ${OR}; outline-offset: 1px; }
.kd-q { position: relative; text-align: center; padding: 0 12vw 4px; font-size: 12px; color: ${SOFT}; }
.kd-on-orange .kd-q, .kd-on-dark .kd-q { color: rgba(255,255,255,.85); }
.kd-q-tag { display: inline-block; margin-inline-end: 8px; padding: 1px 8px; border-radius: 10px; background: ${OR}; color: #fff; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.kd-q-wait { opacity: .7; }
.kd-mic.on { background: ${OR}; color: #fff; border-color: ${OR}; animation: kdPulse 1.2s ease-in-out infinite; }
@keyframes kdPulse { 50% { box-shadow: 0 0 0 8px rgba(241,90,34,.18); } }
.kd-on-orange .kd-btn, .kd-on-dark .kd-btn { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.4); }
.kd-on-orange .kd-primary { background: ${CH}; border-color: ${CH}; }
.kd-btn { background: ${PAPER}; color: ${INK}; border: 1px solid rgba(46,46,47,.28); border-radius: 24px; padding: 9px 18px; font-size: 13px; cursor: pointer; font-family: inherit; letter-spacing: .03em; transition: background .2s, border-color .2s, transform .15s; backdrop-filter: blur(6px); }
.kd-btn:hover:not(:disabled) { background: rgba(46,46,47,.06); border-color: rgba(46,46,47,.5); transform: translateY(-1px); }
.kd-btn:disabled { opacity: .35; cursor: default; }
.kd-btn[aria-pressed="false"] { opacity: .6; }
.kd-primary { background: ${OR}; border-color: ${OR}; color: #fff; font-weight: 700; box-shadow: 0 6px 20px rgba(241,90,34,.3); }
.kd-primary:hover:not(:disabled) { background: #ff6a37; }
.kd-icon { padding: 5px 12px; }
.kd-in { opacity: 0; animation: kdUp .8s ${EASE} forwards; animation-delay: var(--d, 0ms); }
/* narration highlight: the figure being spoken about is lit, the rest of its group steps back */
.kd-hi, .kd-dim { transition: filter .35s, box-shadow .35s, background .35s, outline-color .35s; }
.kd-dim { filter: opacity(.42) saturate(.5); }
/* an outline never changes the layout, so nothing moves or overflows when a figure lights up */
.kd-hi { outline: 3px solid ${OR}; outline-offset: 6px; border-radius: 3px; background: rgba(241,90,34,.06); box-shadow: 0 14px 36px rgba(241,90,34,.2); }
.kd-big.kd-hi { display: inline-block; }
g.kd-hi { filter: drop-shadow(0 0 7px rgba(241,90,34,.85)); }
g.kd-dim { filter: opacity(.42) saturate(.5); }
.kd-kpi.kd-hi { border-top-color: ${OR}; }
.kd-word { display: inline-block; white-space: nowrap; }
.kd-mask { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: .08em; margin-bottom: -.08em; }
.kd-rise { display: inline-block; transform: translateY(105%); animation: kdRiseW .9s ${EASE} forwards; }
.kd-center { text-align: center; }
.kd-kicker { display: flex; align-items: center; gap: 12px; color: ${TAUPE}; font-size: clamp(11px, 1.05vw, 13px); letter-spacing: .26em; text-transform: uppercase; font-weight: 600; }
.kd-kicker-w { color: rgba(255,255,255,.9); } .kd-kicker-w .kd-kbar { background: #fff; }
.kd-kbar { display: inline-block; width: 26px; height: 2px; background: ${OR}; transform-origin: left; animation: kdBar .8s ${EASE} both; }
[dir="rtl"] .kd-kicker, [dir="rtl"] .kd-kpi-l, [dir="rtl"] .kd-tag, [dir="rtl"] .kd-tagline, [dir="rtl"] .kd-cover-title { letter-spacing: 0; }
.kd-cover-title { font-weight: 600; font-size: clamp(32px, 5.2vw, 76px); line-height: 1.08; letter-spacing: .03em; text-transform: uppercase; margin: 22px 0 12px; color: #fff; }
.kd-cover-sub { color: rgba(255,255,255,.88); font-size: clamp(14px, 1.3vw, 19px); }
.kd-div { display: flex; align-items: center; gap: 34px; min-height: 52vh; padding: 0 2vw; }
.kd-div-chev { display: inline-flex; animation: kdChevIn 1s ${SPRING} both; }
.kd-div-title { font-weight: 600; font-size: clamp(34px, 5.4vw, 78px); line-height: 1.04; letter-spacing: .01em; text-transform: uppercase; margin: 0; color: #fff; max-width: 14ch; }
.kd-div-sub { color: ${OR}; font-size: clamp(12px, 1.1vw, 15px); letter-spacing: .34em; text-transform: uppercase; font-weight: 600; margin-top: 16px; }
[dir="rtl"] .kd-div-title, [dir="rtl"] .kd-div-sub, [dir="rtl"] .kd-footline, [dir="rtl"] .kd-stat-l { letter-spacing: 0; }
.kd-closing { min-height: 60vh; display: flex; flex-direction: column; justify-content: center; }
.kd-close-tag { animation: kdOut .6s ease 2.4s forwards; }
.kd-close-card { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; }
.kd-social { display: flex; gap: 16px; align-items: center; margin-top: 30px; font-size: 14px; color: #fff; }
.kd-social span { color: ${OR}; font-weight: 700; } .kd-social b { font-weight: 500; margin-inline-start: 8px; }
.kd-h2 { font-weight: 600; font-size: clamp(24px, 3vw, 44px); line-height: 1.16; margin: 14px 0 0; letter-spacing: -.005em; color: ${INK}; }
.kd-or { color: ${OR}; text-transform: uppercase; letter-spacing: .01em; }
[dir="rtl"] .kd-or { letter-spacing: 0; }
.kd-sub { color: ${SOFT}; font-size: clamp(13px, 1.2vw, 17px); margin-top: 10px; }
.kd-body { color: rgba(46,46,47,.9); font-size: clamp(15px, 1.4vw, 20px); line-height: 1.6; margin: 16px 0 0; max-width: 64ch; }
.kd-muted { color: ${SOFT}; font-size: clamp(12px, 1.02vw, 15px); }
.kd-label { font-size: clamp(14px, 1.3vw, 19px); font-weight: 500; }
.kd-foot { color: ${SOFT}; font-size: clamp(12px, 1.02vw, 15px); margin-top: 24px; }
.kd-num-t { font-variant-numeric: tabular-nums; }
.kd-rule { width: 84px; height: 3px; background: ${OR}; margin: 26px auto 0; }
.kd-hgrid { display: grid; grid-template-columns: minmax(200px, 300px) minmax(0, 1fr); gap: clamp(24px, 4vw, 64px); align-items: start; min-width: 0; }
.kd-stats { border-top: 2px solid ${OR}; min-width: 0; }
@media (max-width: 760px) { .kd-hgrid { grid-template-columns: minmax(0, 1fr); } }
.kd-stat { padding: 12px 0 10px; border-bottom: 1px solid rgba(46,46,47,.16); }
.kd-stat-l { font-size: clamp(10px, .85vw, 12px); letter-spacing: .14em; text-transform: uppercase; color: ${TAUPE}; font-weight: 600; }
.kd-stat-row { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
.kd-stat-v { font-size: clamp(26px, 2.7vw, 40px); font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kd-stat-s { color: ${SOFT}; font-size: clamp(12px, 1vw, 14px); margin-top: 2px; }
.kd-cbar { position: relative; flex: none; width: 96px; height: 11px; background: ${GREY}; margin-top: .45em; }
.kd-cbar::after { content: ""; position: absolute; inset-inline-end: -14px; top: -3px; bottom: -3px; width: 40px; background: var(--c, ${OR}); clip-path: polygon(0 0, 62% 0, 100% 50%, 62% 100%, 0 100%, 38% 50%); }
[dir="rtl"] .kd-cbar::after { transform: scaleX(-1); }
.kd-cbar.sm { width: 42px; height: 8px; margin-top: 0; } .kd-cbar.sm::after { width: 26px; inset-inline-end: -10px; top: -2px; bottom: -2px; }
.kd-chev { color: ${OR}; font-weight: 700; line-height: 1; display: inline-block; }
.kd-chev-anim { animation: kdChev 2.8s ease-in-out 1s infinite; }
.kd-sweep { height: 3px; width: 72px; margin: 26px auto 0; background: #fff; transform-origin: center; animation: kdBar 1.4s ${EASE} 1.1s both; }
.kd-kpi { background: ${PAPER}; border: 1px solid rgba(46,46,47,.12); border-top: 3px solid ${OR}; box-shadow: 0 10px 30px rgba(46,46,47,.08); padding: 18px 20px; height: 100%; box-sizing: border-box; border-radius: 4px; backdrop-filter: blur(4px); }
.kd-lift { transition: transform .25s, box-shadow .25s; } .kd-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 40px rgba(46,46,47,.16); }
.kd-kpi-v { white-space: nowrap; font-size: clamp(30px, 3.9vw, 60px); font-weight: 600; line-height: 1.05; letter-spacing: -.015em; font-variant-numeric: tabular-nums; }
.kd-kpi-l { color: ${SOFT}; font-size: clamp(10px, .9vw, 12px); letter-spacing: .2em; text-transform: uppercase; margin-top: 10px; }
.kd-kpi-s { color: ${SOFT}; font-size: clamp(12px, 1vw, 14px); margin-top: 6px; }
.kd-points { list-style: none; padding: 0; margin: 30px 0 0; }
.kd-points li { display: flex; gap: 22px; align-items: flex-start; font-size: clamp(14px, 1.35vw, 19px); line-height: 1.45; margin-bottom: 14px; }
.kd-num { color: ${OR}; font-weight: 700; min-width: 28px; font-variant-numeric: tabular-nums; }
.kd-ring-v { font-size: clamp(30px, 3.4vw, 50px); font-weight: 600; font-variant-numeric: tabular-nums; }
.kd-status { display: inline-flex; gap: 6px; align-items: center; border: 1px solid; border-radius: 20px; padding: 2px 10px; font-size: 12px; margin-top: 6px; background: ${PAPER}; }
.kd-outlook { margin: 14px auto 0; max-width: 240px; text-align: start; }
.kd-otrack { position: relative; height: 8px; background: ${FAINT}; border-radius: 4px; margin-top: 6px; }
.kd-ofill { height: 100%; border-radius: 4px; transform-origin: left center; transform: scaleX(0); animation: kdGrowX 1.1s ${EASE} forwards; }
[dir="rtl"] .kd-ofill { transform-origin: right center; }
.kd-omark { position: absolute; top: -4px; bottom: -4px; inset-inline-end: 0; width: 2px; background: ${INK}; }
.kd-legend-row { display: flex; gap: 22px; margin-top: 14px; font-size: 13px; color: ${SOFT}; flex-wrap: wrap; }
.kd-legend-row i { display: inline-block; width: 14px; height: 10px; border-radius: 2px; margin-inline-end: 8px; vertical-align: middle; }
.kd-legend-row i.kd-dash { background: none; border-top: 2px dashed ${INK}; height: 0; width: 18px; }
.kd-svgnum { font: 600 26px ${KINAN.font}; font-variant-numeric: tabular-nums; }
.kd-svglab { font: 500 21px ${KINAN.font}; letter-spacing: .06em; }
.kd-legend { display: flex; align-items: center; gap: 14px; padding: 11px 10px; border-bottom: 1px solid rgba(46,46,47,.09); font-size: clamp(14px, 1.3vw, 18px); border-radius: 4px; transition: background .2s; cursor: default; }
.kd-legend.on { background: rgba(241,90,34,.08); }
.kd-legend i { width: 14px; height: 14px; display: inline-block; flex: none; border-radius: 3px; }
.kd-hrow { --kd-lab: clamp(130px, 18vw, 240px); display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.kd-hlabel { width: var(--kd-lab); font-size: clamp(13px, 1.25vw, 17px); }
.kd-htrack { flex: 1; height: 18px; background: rgba(46,46,47,.07); position: relative; border-radius: 3px; overflow: hidden; }
.kd-hfill { height: 100%; border-radius: 3px; transform-origin: left center; transform: scaleX(0); animation: kdGrowX 1.1s ${SPRING} forwards; }
.kd-htrack { overflow: visible !important; margin-top: 8px; }
.kd-hfill { position: relative; }
.kd-hfill::before { content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 8px; background: inherit; filter: brightness(1.35); transform: skewX(-45deg); transform-origin: bottom left; }
.kd-hfill::after { content: ""; position: absolute; top: 0; bottom: 0; left: 100%; width: 8px; background: inherit; filter: brightness(.6); transform: skewY(-45deg); transform-origin: top left; }
[dir="rtl"] .kd-hfill::before { transform: skewX(45deg); transform-origin: bottom right; }
[dir="rtl"] .kd-hfill::after { left: auto; right: 100%; transform: skewY(45deg); transform-origin: top right; }
[dir="rtl"] .kd-hfill { transform-origin: right center; }
.kd-hval { width: 84px; text-align: end; font-weight: 600; font-size: clamp(14px, 1.3vw, 18px); font-variant-numeric: tabular-nums; }
.kd-benchline { --kd-lab: clamp(130px, 18vw, 240px); position: absolute; top: -22px; bottom: 0; border-inline-start: 2px dashed ${OR}; z-index: 1; animation: kdFade .6s ease 1.2s both; opacity: 0; }
.kd-benchline span { position: absolute; top: -8px; inset-inline-start: 8px; white-space: nowrap; font-size: 12px; color: ${OR}; background: ${PAPER}; padding: 0 6px; }
.kd-chip { display: inline-block; border: 1px solid; border-radius: 14px; padding: 2px 9px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.kd-tag { display: inline-block; font-size: clamp(10px, .85vw, 12px); letter-spacing: .18em; text-transform: uppercase; padding: 4px 10px; border: 1px solid rgba(46,46,47,.3); color: ${TAUPE}; border-radius: 2px; background: ${PAPER}; }
.kd-tag-or { border-color: ${OR}; color: ${OR}; }
.kd-badge { display: inline-block; background: ${OR}; color: #fff; font-weight: 700; padding: 3px 12px; border-radius: 20px; font-size: 13px; }
.kd-big { font-size: clamp(60px, 8.5vw, 132px); font-weight: 600; line-height: 1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.kd-evidence { display: flex; gap: 12px; align-items: baseline; padding: 11px 0; border-top: 1px solid rgba(46,46,47,.14); font-size: clamp(13px, 1.2vw, 16px); color: ${INK}; }
.kd-answers { margin-top: 16px; padding: 12px 16px; border-inline-start: 4px solid ${OR}; background: linear-gradient(90deg, rgba(241,90,34,.12), rgba(241,90,34,.03)); font-size: clamp(13px, 1.2vw, 17px); border-radius: 2px; }
[dir="rtl"] .kd-answers { background: linear-gradient(270deg, rgba(241,90,34,.16), rgba(241,90,34,.04)); }
.kd-mixrow { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 3px 0; }
.kd-mixrow i { width: 10px; height: 10px; border-radius: 2px; flex: none; } .kd-mixrow span { flex: 1; color: ${INK}; }
.kd-rtrack { position: relative; height: 10px; background: ${FAINT}; border-radius: 5px; margin-top: 14px; }
.kd-rband { position: absolute; top: 0; bottom: 0; border-radius: 5px; transform-origin: left center; transform: scaleX(0); animation: kdGrowX 1s ${SPRING} forwards; opacity: .9; }
.kd-rmid { position: absolute; top: -5px; width: 4px; height: 20px; background: ${INK}; border-radius: 2px; margin-inline-start: -2px; }
.kd-li { display: flex; gap: 16px; align-items: center; padding: 13px 4px; border-bottom: 1px solid rgba(46,46,47,.09); transition: background .2s; }
.kd-li:hover { background: rgba(46,46,47,.04); }
.kd-li-t { font-size: clamp(14px, 1.35vw, 19px); line-height: 1.4; }
.kd-ico { width: 26px; height: 26px; border: 1.5px solid; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: none; }
.kd-total { text-align: end; border-inline-end: 3px solid ${OR}; padding-inline-end: 14px; }
.kd-tagline { font-weight: 600; font-size: clamp(38px, 6.6vw, 100px); letter-spacing: .1em; line-height: 1.05; margin: 0; color: #fff; }
.kd-orbit { position: relative; width: 100%; height: min(58vh, 560px); margin-top: 16px; }
.kd-flow { animation: kdFlow 1.1s linear infinite; }
@keyframes kdFlow { to { stroke-dashoffset: -17; } }
.kd-orbit-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.kd-core { position: absolute; left: 50%; top: 50%; width: 170px; height: 170px; transform: translate(-50%, -50%); border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle, #fff1ea, #ffffff 70%); box-shadow: 0 10px 40px rgba(46,46,47,.14); border: 1px solid rgba(241,90,34,.5); }
.kd-core-in { text-align: center; position: relative; }
.kd-pulse { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(241,90,34,.6); animation: kdPulse 2.4s ease-out infinite; }
.kd-node { position: absolute; transform: translate(-50%, -50%); width: clamp(120px, 14vw, 180px); }
.kd-node-in { background: ${PAPER}; border: 1px solid rgba(46,46,47,.12); border-top: 2px solid ${OR}; border-radius: 4px; padding: 10px 12px; text-align: center; box-shadow: 0 8px 24px rgba(46,46,47,.1); }
.kd-node-l { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: ${SOFT}; }
.kd-node-v { font-size: clamp(20px, 2vw, 28px); font-weight: 600; margin: 4px 0 6px; font-variant-numeric: tabular-nums; }
.kd-tip { position: absolute; z-index: 5; pointer-events: none; min-width: 170px; background: ${PAPER}; border: 1px solid rgba(46,46,47,.18); border-radius: 6px; padding: 10px 12px; box-shadow: 0 12px 30px rgba(0,0,0,.5); }
.kd-tip-t { font-size: 12px; color: ${SOFT}; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
.kd-tip-r { display: flex; gap: 10px; align-items: baseline; font-size: 13px; } .kd-tip-r b { font-size: 16px; color: ${INK}; font-variant-numeric: tabular-nums; } .kd-tip-r span { color: ${SOFT}; }
.kd-spring { transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0); animation: kdGrowY 1.1s ${SPRING} forwards; }
.kd-fade { opacity: 0; animation: kdFade .7s ease forwards; }
.kd-pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: kdPop .6s ${SPRING} forwards; }
.kd-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kdDraw 1.6s cubic-bezier(.4,0,.2,1) .3s forwards; }
.kd-gx { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: kdGrowX 1s ${EASE} forwards; }
.kd-arc { animation: kdArc 1.1s ${EASE} forwards; }
@media (max-width: 600px) { .kd-ggrid { grid-template-columns: 1fr 1fr !important; gap: 18px !important; } }
@media (max-width: 900px) { .kd-igrid { grid-template-columns: 1fr 1fr !important; } .kd-orbit { height: 70vh; } .kd-node { width: 110px; } .kd-core { width: 120px; height: 120px; } }
@keyframes kdUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
@keyframes kdRiseW { to { transform: none; } }
@keyframes kdReveal { 0% { opacity: 0; transform: translateX(2.5%); } 40% { opacity: 0; transform: translateX(2.5%); } 100% { opacity: 1; transform: none; } }
[dir="rtl"] .kd-enter { animation-name: kdRevealR; } @keyframes kdRevealR { 0% { opacity: 0; transform: translateX(-3%); } 35% { opacity: 0; transform: translateX(-3%); } 100% { opacity: 1; transform: none; } }
@keyframes kdExit { to { opacity: 0; transform: translateX(-3%); } }
@keyframes kdSweep { from { transform: translateX(0); } to { transform: translateX(240vw); } }
@keyframes kdSweepR { from { transform: scaleX(-1) translateX(0); } to { transform: scaleX(-1) translateX(240vw); } }
@keyframes kdFade { to { opacity: 1; } }
@keyframes kdPop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
@keyframes kdGrowY { to { transform: scaleY(1); } }
@keyframes kdGrowX { to { transform: scaleX(1); } }
@keyframes kdDraw { to { stroke-dashoffset: 0; } }
@keyframes kdRing { to { stroke-dashoffset: var(--kd-off); } }
@keyframes kdRot { to { transform: rotate(var(--kd-rot)); } }
@keyframes kdArc { to { stroke-dasharray: var(--kd-len); } }
@keyframes kdBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes kdChev { 0%, 100% { transform: translateX(0); opacity: 1; } 50% { transform: translateX(-10px); opacity: .7; } }
@keyframes kdChevIn { from { opacity: 0; transform: translateX(-30px) scale(.6); } to { opacity: 1; transform: none; } }
@keyframes kdBand { from { transform: translateX(28%); opacity: 0; } to { opacity: var(--o, .96); } }
[dir="rtl"] .kd-fb-band { animation-name: kdBandR; } @keyframes kdBandR { from { transform: scaleX(-1) translateX(40%); opacity: 0; } to { transform: scaleX(-1); } }
@keyframes kdWipe { to { clip-path: inset(0 0 0 100%); } }
@keyframes kdOut { to { opacity: 0; transform: translateY(-16px); } }
@keyframes kdPulse { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .kd-in, .kd-rise, .kd-spring, .kd-fade, .kd-pop, .kd-draw, .kd-arc, .kd-hfill, .kd-gx, .kd-enter, .kd-exit, .kd-rband, .kd-ofill, .kd-kbar, .kd-sweep { animation-duration: .01s !important; animation-delay: 0s !important; }
  .kd-pulse, .kd-flow, .kd-chev-anim { animation: none !important; }
  .kd-fullbg, .kd-fb-band, .kd-div-chev, .kd-close-tag, .kd-fb-closing::before { animation-duration: .01s !important; animation-delay: 0s !important; }
  .kd-wipe { display: none; }
}
`;
