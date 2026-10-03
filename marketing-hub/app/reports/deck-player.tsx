"use client";

// ▶ Play for reports that carry a deck (lib/deck.ts): full-screen slides in Kinan's style — charcoal stage, white
// type, orange accent — one idea per slide, with animated charts (count-up numbers, growing bars, ring gauges that
// fill, a donut and a trend line that draw themselves). Narration uses ElevenLabs through /api/voice when the server
// has a key (the key never reaches the browser), else the browser's own voice. Tap the sides or use the arrows to
// move; Space pauses; Esc closes.
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../_components/lang";
import { KINAN, kinanLogoHtml } from "../../lib/brand";
import type { Deck, DeckSlide, Kpi, Tone } from "../../lib/deck";

const OR = KINAN.orange, BAD = "#ff5a4e", GOOD = "#5fd39a", WARN = "#ffb547";
const toneColor = (t?: Tone) => (t === "bad" ? BAD : t === "good" ? GOOD : t === "warn" ? WARN : "#fff");
const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Animated number (ease-out over `ms`), restarted when the slide mounts. */
function useCount(target: number, ms = 1200, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now() + delay;
    const tick = (now: number) => { const p = Math.min(1, Math.max(0, (now - t0) / ms)); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}
function Count({ value, decimals = 0, prefix = "", suffix = "", delay = 0, sign = false }: { value: number; decimals?: number; prefix?: string; suffix?: string; delay?: number; sign?: boolean }) {
  const v = useCount(value, 1300, delay);
  return <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{prefix}{sign && value > 0 ? "+" : value < 0 ? "−" : ""}{fmt(Math.abs(v), decimals)}{suffix}</span>;
}
const In = ({ d = 0, children, style }: { d?: number; children: React.ReactNode; style?: React.CSSProperties }) => <div className="kd-in" style={{ animationDelay: `${d}ms`, ...style }}>{children}</div>;
const Kicker = ({ children }: { children: React.ReactNode }) => <In><div className="kd-kicker">{children}</div></In>;

// ------------------------------------------------------------------ slides
function Cover({ s }: { s: Extract<DeckSlide, { kind: "cover" }> }) {
  return (
    <div className="kd-center">
      <In><div style={{ display: "inline-flex", alignItems: "center", gap: 28 }}><span dangerouslySetInnerHTML={{ __html: kinanLogoHtml(110) }} /><span className="kd-chev" style={{ fontSize: 90 }}>‹</span></div></In>
      <In d={250}><div className="kd-kicker" style={{ marginTop: 44 }}>{s.kicker}</div></In>
      <In d={400}><h1 className="kd-cover-title">{s.title}</h1></In>
      <In d={600}><div className="kd-sub">{s.sub}</div></In>
      <In d={750}><div className="kd-rule" /></In>
    </div>
  );
}
function KpiCard({ k, i }: { k: Kpi; i: number }) {
  return (
    <In d={300 + i * 140} style={{ flex: "1 1 200px" }}>
      <div className="kd-kpi">
        <div className="kd-kpi-v" style={{ color: toneColor(k.tone) }}><Count value={k.value} decimals={k.decimals ?? 0} prefix={k.prefix} suffix={k.suffix} delay={300 + i * 140} /></div>
        <div className="kd-kpi-l">{k.label}</div>
        {k.sub && <div className="kd-kpi-s">{k.sub}</div>}
      </div>
    </In>
  );
}
function Headline({ s }: { s: Extract<DeckSlide, { kind: "headline" }> }) {
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={120}><h2 className="kd-h2">{s.headline}</h2></In>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 34 }}>{s.kpis.map((k, i) => <KpiCard key={i} k={k} i={i} />)}</div>
      {s.points.length > 0 && <ol className="kd-points">{s.points.map((p, i) => <In key={i} d={900 + i * 160}><li><span className="kd-num">{i + 1}</span>{p}</li></In>)}</ol>}
    </div>
  );
}
function Ring({ pct, delay }: { pct: number; delay: number }) {
  const r = 78, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  const color = pct < 75 ? BAD : pct < 95 ? OR : GOOD;
  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 220, display: "block", margin: "0 auto" }}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="16" />
      <circle cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" transform="rotate(-90 100 100)"
        strokeDasharray={c} style={{ strokeDashoffset: c, animation: `kdRing 1.4s cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`, ["--kd-off" as any]: c * (1 - p / 100) }} />
    </svg>
  );
}
function Gauges({ s }: { s: Extract<DeckSlide, { kind: "gauges" }> }) {
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, s.items.length)}, minmax(0, 1fr))`, gap: 24, marginTop: 30 }}>
        {s.items.map((x, i) => (
          <In key={i} d={250 + i * 180} style={{ textAlign: "center" }}>
            <div style={{ position: "relative" }}>
              <Ring pct={x.pct} delay={300 + i * 180} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><div className="kd-ring-v"><Count value={x.pct} suffix="%" delay={300 + i * 180} /></div></div>
            </div>
            <div className="kd-label" style={{ marginTop: 14 }}>{x.label}</div>
            <div className="kd-muted" dir="ltr">{x.actual} / {x.target}</div>
          </In>
        ))}
      </div>
      {s.foot && <In d={900}><div className="kd-foot">{s.foot}</div></In>}
    </div>
  );
}
function Columns({ s }: { s: Extract<DeckSlide, { kind: "columns" }> }) {
  const max = Math.max(...s.values, 0.0001) * 1.12, n = s.values.length, W = 1000, H = 420, pad = 40, bw = Math.min(110, ((W - pad * 2) / n) * 0.62);
  const x = (i: number) => pad + ((W - pad * 2) / n) * (i + 0.5);
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <In d={180}><div className="kd-sub">{s.sub}</div></In>
      <div dir="ltr" style={{ marginTop: 20 }}>
        <svg viewBox={`0 0 ${W} ${H + 50}`} width="100%" style={{ display: "block", maxHeight: "52vh" }}>
          {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W - pad} y1={H - (H - 40) * g} y2={H - (H - 40) * g} stroke="rgba(255,255,255,.08)" />)}
          <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="rgba(255,255,255,.35)" />
          {s.values.map((v, i) => {
            const h = ((H - 40) * v) / max, last = i === n - 1;
            return (
              <g key={i}>
                <rect x={x(i) - bw / 2} y={H - h} width={bw} height={h} rx="3" fill={last ? OR : "rgba(255,255,255,.88)"} className="kd-grow" style={{ animationDelay: `${300 + i * 120}ms` }} />
                <text x={x(i)} y={H - h - 14} textAnchor="middle" fill={last ? OR : "#fff"} className="kd-fade" style={{ animationDelay: `${700 + i * 120}ms`, font: `600 26px ${KINAN.font}` }}>{fmt(v, s.decimals ?? 0)}</text>
                <text x={x(i)} y={H + 36} textAnchor="middle" fill="rgba(255,255,255,.7)" style={{ font: `500 22px ${KINAN.font}`, letterSpacing: ".08em" }}>{s.labels[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
const PAL = [OR, "#ffffff", "#9a9a9a", "#f7a07f", "#5e5e5e", "#b8401a", "#c9c9c9", "#fbcdb9"];
function Donut({ s }: { s: Extract<DeckSlide, { kind: "donut" }> }) {
  const total = s.values.reduce((a, b) => a + b, 0) || 1, r = 120, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <In d={180}><div className="kd-sub">{s.sub}</div></In>
      <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap", marginTop: 24 }}>
        <div style={{ position: "relative", flex: "0 0 auto", width: "min(340px, 70vw)" }}>
          <svg viewBox="0 0 300 300" width="100%">
            <circle cx="150" cy="150" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="44" />
            {s.values.map((v, i) => {
              const len = (v / total) * c, off = acc; acc += len;
              return <circle key={i} cx="150" cy="150" r={r} fill="none" stroke={PAL[i % PAL.length]} strokeWidth="44" transform="rotate(-90 150 150)"
                strokeDasharray={`0 ${c}`} strokeDashoffset={-off} className="kd-arc" style={{ animationDelay: `${300 + i * 160}ms`, ["--kd-len" as any]: `${Math.max(0, len - 3)} ${c}` }} />;
            })}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div><div className="kd-kpi-v" style={{ fontSize: "clamp(28px,3.6vw,46px)" }}><Count value={total} decimals={1} delay={300} /></div><div className="kd-kpi-l">{s.unit}</div></div>
          </div>
        </div>
        <div style={{ flex: "1 1 320px" }}>
          {s.labels.map((l, i) => (
            <In key={i} d={450 + i * 140}>
              <div className="kd-legend">
                <i style={{ background: PAL[i % PAL.length] }} /><span style={{ flex: 1 }}>{l}</span>
                <b dir="ltr">{fmt(s.values[i], 1)}</b><span className="kd-muted" dir="ltr" style={{ width: 56, textAlign: "end" }}>{Math.round((s.values[i] / total) * 100)}%</span>
              </div>
            </In>
          ))}
        </div>
      </div>
    </div>
  );
}
function HBars({ s }: { s: Extract<DeckSlide, { kind: "hbars" }> }) {
  const max = Math.max(...s.values, s.bench ?? 0, 0.0001) * 1.08;
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <In d={180}><div className="kd-sub">{s.sub}</div></In>
      <div style={{ marginTop: 26, position: "relative" }}>
        {s.values.map((v, i) => {
          const hot = s.bench != null && v > s.bench * 1.5;
          return (
            <In key={i} d={250 + i * 110}>
              <div className="kd-hrow">
                <div className="kd-hlabel">{s.labels[i]}</div>
                <div className="kd-htrack">
                  <div className="kd-hfill" style={{ width: `${(v / max) * 100}%`, background: hot ? BAD : i === 0 ? GOOD : "rgba(255,255,255,.85)", animationDelay: `${300 + i * 110}ms` }} />
                  {s.bench != null && <div className="kd-bench" style={{ insetInlineStart: `${(s.bench / max) * 100}%` }} />}
                </div>
                <div className="kd-hval" dir="ltr" style={{ color: hot ? BAD : "#fff" }}>{fmt(v, 2)}{s.unit}</div>
              </div>
            </In>
          );
        })}
        {s.benchLabel && <In d={900}><div className="kd-foot"><span style={{ display: "inline-block", width: 18, borderTop: `2px dashed ${OR}`, verticalAlign: "middle", marginInlineEnd: 8 }} />{s.benchLabel}</div></In>}
      </div>
    </div>
  );
}
function Line({ s }: { s: Extract<DeckSlide, { kind: "line" }> }) {
  const W = 1000, H = 380, pad = 50, max = Math.max(...s.values, 0.0001) * 1.15, n = s.values.length;
  const pts = s.values.map((v, i) => [pad + ((W - pad * 2) * i) / Math.max(1, n - 1), H - ((H - 30) * v) / max] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <In d={180}><div className="kd-sub">{s.sub}</div></In>
      <div dir="ltr" style={{ marginTop: 20 }}>
        <svg viewBox={`0 0 ${W} ${H + 50}`} width="100%" style={{ display: "block", maxHeight: "52vh" }}>
          <defs><linearGradient id="kdArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={OR} stopOpacity=".35" /><stop offset="1" stopColor={OR} stopOpacity="0" /></linearGradient></defs>
          <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="rgba(255,255,255,.35)" />
          <path d={`${d} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#kdArea)" className="kd-fade" style={{ animationDelay: "900ms" }} />
          <path d={d} fill="none" stroke={OR} strokeWidth="5" strokeLinejoin="round" pathLength={1} className="kd-draw" />
          {pts.map((p, i) => <g key={i} className="kd-fade" style={{ animationDelay: `${400 + i * 180}ms` }}><circle cx={p[0]} cy={p[1]} r="8" fill="#141414" stroke={OR} strokeWidth="4" /><text x={p[0]} y={p[1] - 20} textAnchor="middle" fill="#fff" style={{ font: `600 24px ${KINAN.font}` }}>{fmt(s.values[i], 1)}</text><text x={p[0]} y={H + 36} textAnchor="middle" fill="rgba(255,255,255,.7)" style={{ font: `500 22px ${KINAN.font}` }}>{s.labels[i]}</text></g>)}
        </svg>
      </div>
    </div>
  );
}
function Scan({ s }: { s: Extract<DeckSlide, { kind: "scan" }> }) {
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 30 }}>
        {s.sources.map((x, i) => (
          <In key={i} d={250 + i * 120}>
            <div className="kd-kpi" style={{ minHeight: 140 }}>
              <div className="kd-kpi-l" style={{ marginTop: 0 }}>{x.label}</div>
              <div className="kd-kpi-v" style={{ fontSize: "clamp(26px,3vw,40px)", marginTop: 8 }}><Count value={x.items} delay={250 + i * 120} /></div>
              <div style={{ marginTop: 10 }}>{x.found ? <span className="kd-badge">→ <Count value={x.found} delay={700 + i * 120} /></span> : <span className="kd-muted">—</span>}</div>
            </div>
          </In>
        ))}
      </div>
    </div>
  );
}
function Spark({ values, down }: { values: number[]; down: boolean }) {
  const max = Math.max(...values, 0.0001), n = values.length, W = 600, H = 200, bw = W / n - 6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", direction: "ltr" }}>
      {values.map((v, i) => { const h = Math.max(3, (v / max) * (H - 10)), hot = i >= n - 3; return <rect key={i} x={i * (W / n) + 3} y={H - h} width={bw} height={h} rx="2" fill={hot ? (down ? BAD : GOOD) : "rgba(255,255,255,.35)"} className="kd-grow" style={{ animationDelay: `${400 + i * 60}ms` }} />; })}
    </svg>
  );
}
function Finding({ s }: { s: Extract<DeckSlide, { kind: "finding" }> }) {
  return (
    <div>
      <Kicker>{s.kicker} · <span dir="ltr">{s.n}/{s.of}</span></Kicker>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start", marginTop: 6 }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <In d={80}><span className="kd-tag">{s.source}</span></In>
          <In d={160}><h2 className="kd-h2" style={{ color: s.down ? "#fff" : "#fff" }}>{s.title}</h2></In>
          <In d={300}><p className="kd-body">{s.why}</p></In>
          {s.evidence.length > 0 && <div style={{ marginTop: 18 }}>
            <In d={500}><div className="kd-kpi-l" style={{ marginBottom: 8 }}>↳</div></In>
            {s.evidence.map((e, i) => <In key={i} d={600 + i * 200}><div className="kd-evidence" style={{ display: "flex", gap: 12, alignItems: "baseline" }}><span className="kd-tag" style={{ flex: "none", minWidth: 110, textAlign: "center" }}>{e.source}</span><span>{e.title}</span></div></In>)}
          </div>}
        </div>
        {(s.changePct !== null || s.series) && (
          <div style={{ flex: "0 1 380px", minWidth: 260 }}>
            {s.changePct !== null && <In d={250}><div className="kd-big" style={{ color: s.down ? BAD : GOOD }}><Count value={s.changePct} suffix="%" sign delay={250} /></div></In>}
            {s.series && <In d={350}><div style={{ marginTop: 16 }}><Spark values={s.series} down={s.down} /></div></In>}
          </div>
        )}
      </div>
    </div>
  );
}
function Initiative({ s }: { s: Extract<DeckSlide, { kind: "initiative" }> }) {
  const { t } = useI18n();
  return (
    <div>
      <Kicker>{s.kicker} · <span dir="ltr">{s.n}/{s.of}</span></Kicker>
      <In d={80}><span className="kd-tag kd-tag-or">{s.type}</span>{s.project && <span className="kd-muted" style={{ marginInlineStart: 12 }}>{s.project}</span>}</In>
      <In d={160}><h2 className="kd-h2">{s.title}</h2></In>
      {s.answers && <In d={260}><div className="kd-answers">{s.answers}</div></In>}
      <In d={380}><p className="kd-body">{s.idea}</p></In>
      <In d={520}>
        <div className="kd-mix">{s.channels.map((ch, i) => <div key={i} className="kd-mix-seg" style={{ width: `${ch.pct}%`, background: PAL[i % PAL.length], animationDelay: `${600 + i * 150}ms` }} />)}</div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>{s.channels.map((ch, i) => <span key={i} className="kd-muted"><i style={{ display: "inline-block", width: 10, height: 10, background: PAL[i % PAL.length], marginInlineEnd: 6 }} />{ch.label} <b style={{ color: "#fff" }} dir="ltr">{ch.pct}%</b></span>)}</div>
      </In>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 26 }}>
        <In d={800} style={{ flex: "1 1 180px" }}><div className="kd-kpi"><div className="kd-kpi-v"><Count value={s.contracts[0]} delay={800} />–<Count value={s.contracts[1]} delay={800} /></div><div className="kd-kpi-l">{t("Contracts (range)")}</div></div></In>
        <In d={950} style={{ flex: "1 1 180px" }}><div className="kd-kpi"><div className="kd-kpi-v"><Count value={s.salesM[0]} decimals={1} delay={950} />–<Count value={s.salesM[1]} decimals={1} suffix="M" delay={950} /></div><div className="kd-kpi-l">{t("Sales (range)")}</div></div></In>
        <In d={1100} style={{ flex: "1 1 180px" }}><div className="kd-kpi"><div className="kd-kpi-v" style={{ color: OR }}><Count value={s.cts} decimals={1} suffix="%" delay={1100} /></div><div className="kd-kpi-l">{t("Cost to sales")} · <span dir="ltr">{fmt(s.spendK)}K</span></div></div></In>
      </div>
    </div>
  );
}
function List({ s }: { s: Extract<DeckSlide, { kind: "list" }> }) {
  const maxMin = Math.max(...s.items.map((x) => x.minutes ?? 0), 1);
  return (
    <div>
      <Kicker>{s.kicker}</Kicker>
      <In d={100}><h2 className="kd-h2">{s.title}</h2></In>
      <div style={{ marginTop: 22 }}>
        {s.items.slice(0, 8).map((x, i) => (
          <In key={i} d={250 + i * 130}>
            <div className="kd-li">
              <span className="kd-dot" style={{ background: toneColor(x.tone) === "#fff" ? "rgba(255,255,255,.5)" : toneColor(x.tone) }} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="kd-li-t">{x.text}</div>{x.sub && <div className="kd-muted" style={{ marginTop: 3 }}>{x.sub}</div>}</div>
              {x.minutes != null && <div style={{ width: 150, display: "flex", alignItems: "center", gap: 10 }}><div className="kd-htrack" style={{ height: 8 }}><div className="kd-hfill" style={{ width: `${(x.minutes / maxMin) * 100}%`, background: OR, animationDelay: `${350 + i * 130}ms` }} /></div><span className="kd-muted" dir="ltr">{x.minutes}′</span></div>}
            </div>
          </In>
        ))}
      </div>
    </div>
  );
}
function Closing({ s }: { s: Extract<DeckSlide, { kind: "closing" }> }) {
  return (
    <div className="kd-center">
      <In><div className="kd-tagline">{s.title}</div></In>
      <In d={300}><div className="kd-rule" style={{ margin: "26px auto" }} /></In>
      <In d={450}><span dangerouslySetInnerHTML={{ __html: kinanLogoHtml(70) }} /></In>
      <In d={650}><div className="kd-sub" style={{ marginTop: 22 }}>{s.sub}</div></In>
      <In d={800}><div className="kd-muted" style={{ marginTop: 10 }}>{KINAN.site}</div></In>
    </div>
  );
}
function SlideView({ s }: { s: DeckSlide }) {
  switch (s.kind) {
    case "cover": return <Cover s={s} />;
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

// ------------------------------------------------------------------ voice
type Voice = { mode: "eleven" | "browser" | "none"; label: string };
const audioCache = new Map<string, Promise<string | null>>(); // text → object URL
/** ElevenLabs audio for a text (via /api/voice), cached; null when the server has no key or it fails. */
function elevenAudio(text: string, lang: string) {
  const key = `${lang}|${text}`;
  if (!audioCache.has(key)) audioCache.set(key, fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) })
    .then(async (r) => (r.ok && (r.headers.get("content-type") ?? "").includes("audio") ? URL.createObjectURL(await r.blob()) : null)).catch(() => null));
  return audioCache.get(key)!;
}

export function DeckPlayer({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { t } = useI18n();
  const lang = deck.lang, slides = deck.slides;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState<Voice>({ mode: "none", label: "" });
  const [started, setStarted] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  const audio = useRef<HTMLAudioElement | null>(null);
  const tts = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const s = slides[i];
  const dur = useMemo(() => Math.min(24000, Math.max(6500, (s.say.split(/\s+/).length / 2.5) * 1000 + 2200)), [s]);
  const go = (n: number) => { tts?.cancel(); audio.current?.pause(); setI(Math.max(0, Math.min(slides.length - 1, n))); setStarted(Date.now()); };

  // Which voice: ElevenLabs when the server has a key, else the browser's.
  useEffect(() => {
    let live = true;
    fetch("/api/voice").then((r) => r.json()).then((x) => { if (live) setVoice(x?.enabled ? { mode: "eleven", label: "ElevenLabs" } : tts ? { mode: "browser", label: "" } : { mode: "none", label: "" }); })
      .catch(() => live && setVoice(tts ? { mode: "browser", label: "" } : { mode: "none", label: "" }));
    return () => { live = false; };
  }, [tts]);
  // Prefetch the next slide's narration so it starts without a gap.
  useEffect(() => { if (voice.mode === "eleven" && voiceOn && slides[i + 1]) elevenAudio(slides[i + 1].say.slice(0, 900), lang); }, [i, voice.mode, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narration and auto-advance.
  useEffect(() => {
    if (!playing) { tts?.cancel(); audio.current?.pause(); return; }
    let done = false;
    const next = () => { if (!done) { done = true; if (i < slides.length - 1) go(i + 1); else setPlaying(false); } };
    const minShow = 3500; // let the animation play even when the narration is short
    const t0 = Date.now();
    const after = () => setTimeout(next, Math.max(800, minShow - (Date.now() - t0)));
    const guard = setTimeout(next, Math.max(dur, 40000));
    if (voiceOn && voice.mode === "eleven") {
      elevenAudio(s.say.slice(0, 900), lang).then((url) => {
        if (done) return;
        if (!url) { setVoice(tts ? { mode: "browser", label: "" } : { mode: "none", label: "" }); return; }
        const a = new Audio(url); audio.current = a; a.onended = after; a.onerror = () => setTimeout(next, dur); a.play().catch(() => setTimeout(next, dur));
      });
      return () => { done = true; clearTimeout(guard); audio.current?.pause(); };
    }
    if (voiceOn && voice.mode === "browser" && tts) {
      tts.cancel();
      const u = new SpeechSynthesisUtterance(s.say.slice(0, 600));
      u.lang = lang === "ar" ? "ar-SA" : "en-GB";
      const v = tts.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "ar" ? "ar" : "en"));
      if (v) u.voice = v;
      u.rate = 1.0; u.onend = after; u.onerror = () => setTimeout(next, dur);
      tts.speak(u);
      return () => { done = true; clearTimeout(guard); tts.cancel(); };
    }
    clearTimeout(guard);
    const id = setTimeout(next, dur);
    return () => { done = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, voiceOn, voice.mode]);
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 150); return () => clearInterval(id); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(lang === "ar" ? i - 1 : i + 1);
      else if (e.key === "ArrowLeft") go(lang === "ar" ? i + 1 : i - 1);
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); setStarted(Date.now()); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => { tts?.cancel(); audio.current?.pause(); }, [tts]);

  const narrating = voiceOn && voice.mode !== "none";
  const progress = playing && !narrating ? Math.min(1, (tick - started) / dur) : playing ? Math.min(0.95, (tick - started) / Math.max(dur, 8000)) : 0;
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 24, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: ".04em" };
  const ff = lang === "ar" ? KINAN.fontAr : KINAN.font;

  return (
    <div role="dialog" aria-label={deck.title} dir={lang === "ar" ? "rtl" : "ltr"} className="kd-root" style={{ fontFamily: ff }}>
      <div style={{ display: "flex", gap: 4, padding: "14px 18px 8px" }}>
        {slides.map((_, k) => <div key={k} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.16)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", background: OR, width: k < i ? "100%" : k === i ? `${Math.round(progress * 100)}%` : "0%", transition: k === i ? "width .15s linear" : "none" }} /></div>)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 18px 0" }}>
        <span style={{ transform: "scale(.55)", transformOrigin: lang === "ar" ? "right center" : "left center", display: "inline-block", height: 34 }} dangerouslySetInnerHTML={{ __html: kinanLogoHtml(60) }} />
        <span style={{ flex: 1 }} />
        {narrating && voice.mode === "eleven" && <span className="kd-muted" style={{ fontSize: 11 }}>🔊 ElevenLabs</span>}
        <span dir="ltr" className="kd-muted" style={{ fontSize: 12 }}>{i + 1} / {slides.length}</span>
        <button style={{ ...btn, padding: "5px 12px" }} onClick={onClose} aria-label={t("Close")}>✕</button>
      </div>
      <div className="kd-stage" onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const back = (e.clientX - r.left < r.width * 0.25) !== (lang === "ar"); go(back ? i - 1 : i + 1); }}>
        <div key={i} className="kd-slide"><SlideView s={s} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "10px 12px 22px", flexWrap: "wrap" }}>
        <button style={btn} onClick={() => go(i - 1)} disabled={i === 0}>{lang === "ar" ? "→" : "←"} {t("Back")}</button>
        <button style={{ ...btn, background: OR, borderColor: OR, fontWeight: 700 }} onClick={() => { setPlaying(!playing); setStarted(Date.now()); }}>{playing ? `❚❚ ${t("Pause")}` : `▶ ${t("Play")}`}</button>
        <button style={btn} onClick={() => go(i + 1)} disabled={i === slides.length - 1}>{t("Next")} {lang === "ar" ? "←" : "→"}</button>
        {voice.mode !== "none" && <button style={btn} onClick={() => { setVoiceOn(!voiceOn); setStarted(Date.now()); }} aria-pressed={voiceOn}>{voiceOn ? `🔊 ${t("Voice on")}` : `🔇 ${t("Voice off")}`}</button>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.kd-root { position: fixed; inset: 0; z-index: 1000; color: #fff; display: flex; flex-direction: column;
  background: radial-gradient(1200px 600px at 85% 0%, rgba(241,90,41,.16), transparent 60%), radial-gradient(900px 500px at 0% 100%, rgba(255,255,255,.05), transparent 60%), #141414; }
.kd-stage { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; padding: clamp(12px, 3vh, 36px) clamp(16px, 6vw, 96px); }
.kd-slide { width: 100%; max-width: 1240px; animation: kdSlide .55s cubic-bezier(.2,.8,.2,1); }
.kd-in { opacity: 0; animation: kdUp .7s cubic-bezier(.2,.8,.2,1) forwards; }
.kd-center { text-align: center; }
.kd-kicker { color: ${OR}; font-size: clamp(11px, 1.1vw, 14px); letter-spacing: .32em; text-transform: uppercase; font-weight: 600; }
[dir="rtl"] .kd-kicker, [dir="rtl"] .kd-kpi-l, [dir="rtl"] .kd-tag, [dir="rtl"] .kd-tagline, [dir="rtl"] .kd-cover-title { letter-spacing: 0; }
.kd-cover-title { font-weight: 300; font-size: clamp(34px, 5.6vw, 76px); line-height: 1.1; letter-spacing: .04em; text-transform: uppercase; margin: 14px 0 10px; }
.kd-h2 { font-weight: 500; font-size: clamp(24px, 3.1vw, 44px); line-height: 1.18; margin: 12px 0 0; letter-spacing: .005em; }
.kd-sub { color: rgba(255,255,255,.66); font-size: clamp(13px, 1.25vw, 17px); margin-top: 10px; }
.kd-body { color: rgba(255,255,255,.82); font-size: clamp(15px, 1.45vw, 21px); line-height: 1.55; margin: 16px 0 0; max-width: 62ch; }
.kd-muted { color: rgba(255,255,255,.6); font-size: clamp(12px, 1.05vw, 15px); }
.kd-label { font-size: clamp(14px, 1.3vw, 19px); font-weight: 500; }
.kd-foot { color: rgba(255,255,255,.6); font-size: clamp(12px, 1.05vw, 15px); margin-top: 22px; }
.kd-rule { width: 84px; height: 3px; background: ${OR}; margin: 26px auto 0; }
.kd-chev { color: ${OR}; font-weight: 700; line-height: 1; }
.kd-kpi { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-top: 3px solid ${OR}; padding: 18px 20px; height: 100%; box-sizing: border-box; }
.kd-kpi-v { font-size: clamp(30px, 3.9vw, 58px); font-weight: 600; line-height: 1.05; letter-spacing: -.01em; }
.kd-kpi-l { color: rgba(255,255,255,.62); font-size: clamp(10px, .9vw, 12px); letter-spacing: .2em; text-transform: uppercase; margin-top: 10px; }
.kd-kpi-s { color: rgba(255,255,255,.8); font-size: clamp(12px, 1vw, 14px); margin-top: 6px; }
.kd-points { list-style: none; padding: 0; margin: 30px 0 0; }
.kd-points li { display: flex; gap: 14px; align-items: baseline; font-size: clamp(14px, 1.35vw, 19px); line-height: 1.45; margin-bottom: 10px; }
.kd-num { color: ${OR}; font-weight: 700; min-width: 22px; }
.kd-ring-v { font-size: clamp(28px, 3.2vw, 46px); font-weight: 600; }
.kd-legend { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.1); font-size: clamp(14px, 1.3vw, 18px); }
.kd-legend i { width: 14px; height: 14px; display: inline-block; flex: none; }
.kd-hrow { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.kd-hlabel { width: clamp(130px, 18vw, 240px); font-size: clamp(13px, 1.25vw, 17px); }
.kd-htrack { flex: 1; height: 16px; background: rgba(255,255,255,.08); position: relative; border-radius: 2px; }
.kd-hfill { height: 100%; border-radius: 2px; transform-origin: left center; transform: scaleX(0); animation: kdGrowX 1s cubic-bezier(.2,.8,.2,1) forwards; }
[dir="rtl"] .kd-hfill { transform-origin: right center; }
.kd-bench { position: absolute; top: -6px; bottom: -6px; border-inline-start: 2px dashed ${OR}; }
.kd-hval { width: 84px; text-align: end; font-weight: 600; font-size: clamp(14px, 1.3vw, 18px); }
.kd-tag { display: inline-block; font-size: clamp(10px, .85vw, 12px); letter-spacing: .18em; text-transform: uppercase; padding: 4px 10px; border: 1px solid rgba(255,255,255,.3); color: rgba(255,255,255,.85); }
.kd-tag-or { border-color: ${OR}; color: ${OR}; }
.kd-badge { display: inline-block; background: ${OR}; color: #fff; font-weight: 700; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
.kd-big { font-size: clamp(56px, 8vw, 120px); font-weight: 600; line-height: 1; letter-spacing: -.02em; }
.kd-evidence { padding: 10px 0; border-top: 1px solid rgba(255,255,255,.1); font-size: clamp(13px, 1.2vw, 16px); color: rgba(255,255,255,.88); }
.kd-answers { margin-top: 14px; padding: 12px 16px; border-inline-start: 4px solid ${OR}; background: rgba(241,90,41,.12); font-size: clamp(13px, 1.2vw, 17px); }
.kd-mix { display: flex; height: 18px; margin-top: 22px; gap: 2px; }
.kd-mix-seg { transform-origin: left center; transform: scaleX(0); animation: kdGrowX .8s cubic-bezier(.2,.8,.2,1) forwards; }
.kd-li { display: flex; gap: 16px; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.1); }
.kd-li-t { font-size: clamp(14px, 1.35vw, 19px); line-height: 1.4; }
.kd-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.kd-tagline { font-weight: 300; font-size: clamp(40px, 7vw, 104px); letter-spacing: .14em; line-height: 1.05; }
.kd-grow { transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0); animation: kdGrowY .9s cubic-bezier(.2,.8,.2,1) forwards; }
.kd-fade { opacity: 0; animation: kdFade .6s ease forwards; }
.kd-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kdDraw 1.6s cubic-bezier(.4,0,.2,1) .3s forwards; }
.kd-arc { animation: kdArc 1s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes kdUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes kdSlide { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
@keyframes kdFade { to { opacity: 1; } }
@keyframes kdGrowY { to { transform: scaleY(1); } }
@keyframes kdGrowX { to { transform: scaleX(1); } }
@keyframes kdDraw { to { stroke-dashoffset: 0; } }
@keyframes kdRing { to { stroke-dashoffset: var(--kd-off); } }
@keyframes kdArc { to { stroke-dasharray: var(--kd-len); } }
@media (prefers-reduced-motion: reduce) { .kd-in, .kd-grow, .kd-fade, .kd-draw, .kd-arc, .kd-hfill, .kd-mix-seg, .kd-slide { animation-duration: .01s !important; animation-delay: 0s !important; } }
`;
