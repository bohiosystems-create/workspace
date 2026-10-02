"use client";

// A chart drawn by the assistant (lib/charts.ts computes the numbers). Plain SVG: pie, donut, bar, horizontal bar,
// line. The viewer can switch the type and download it as PNG or SVG.
import { useRef, useState } from "react";
import type { ChartSpec, ChartType } from "@/lib/charts";
import { saveFile } from "./saveFile";
import { useI18n } from "./lang";

const COLORS = ["#000919", "#2f5d8a", "#1d7a52", "#c9a227", "#b3473c", "#6b5b95", "#4a9bb5", "#a0522d", "#7a8b99", "#d08c60", "#3c6e47", "#9b2d5c"];
const FONT = "Inter, Helvetica, Arial, sans-serif";
const W = 560;

const fmt = (v: number, unit: string) => `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}${unit === "%" ? "%" : ""}`;
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Pie({ s, donut }: { s: ChartSpec; donut: boolean }) {
  const total = s.values.reduce((a, b) => a + b, 0) || 1;
  const cx = 150, cy = 150, r = 120, ri = donut ? 66 : 0;
  let a0 = -Math.PI / 2;
  const H = Math.max(300, 40 + s.labels.length * 24);
  const arcs = s.values.map((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    const d = s.values.length === 1
      ? `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0` + (ri ? ` M ${cx - ri},${cy} a ${ri},${ri} 0 1,1 ${2 * ri},0 a ${ri},${ri} 0 1,1 ${-2 * ri},0` : "")
      : ri ? `M ${p(a0, r)} A ${r},${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ri)} A ${ri},${ri} 0 ${large} 0 ${p(a0, ri)} Z` : `M ${cx},${cy} L ${p(a0, r)} A ${r},${r} 0 ${large} 1 ${p(a1, r)} Z`;
    const mid = (a0 + a1) / 2, pct = Math.round((v / total) * 100);
    const lab = pct >= 6 ? <text x={cx + (ri ? (r + ri) / 2 : r * 0.62) * Math.cos(mid)} y={cy + (ri ? (r + ri) / 2 : r * 0.62) * Math.sin(mid) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{pct}%</text> : null;
    a0 = a1;
    return <g key={i}><path d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1.5" fillRule="evenodd" />{lab}</g>;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT }}>
      {arcs}
      {donut && s.total !== null && <><text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="#000919">{fmt(s.total, s.unit)}</text><text x={cx} y={cy + 15} textAnchor="middle" fontSize="9" fill="#555">{s.unit}</text></>}
      {s.labels.map((l, i) => (
        <g key={i} transform={`translate(300, ${30 + i * 24})`}>
          <rect width="11" height="11" y="-9" fill={COLORS[i % COLORS.length]} />
          <text x="17" fontSize="11" fill="#000919">{short(l, 26)}</text>
          <text x="250" fontSize="11" textAnchor="end" fontWeight="700" fill="#000919">{fmt(s.values[i], s.unit)}</text>
        </g>
      ))}
    </svg>
  );
}

function Bars({ s, horizontal }: { s: ChartSpec; horizontal: boolean }) {
  const max = Math.max(...s.values) || 1;
  if (horizontal) {
    const H = 20 + s.labels.length * 26, x0 = 170, bw = W - x0 - 70;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT }}>
        {s.labels.map((l, i) => (
          <g key={i} transform={`translate(0, ${10 + i * 26})`}>
            <text x={x0 - 8} y="14" fontSize="11" textAnchor="end" fill="#000919">{short(l, 26)}</text>
            <rect x={x0} y="2" height="16" width={Math.max(2, (s.values[i] / max) * bw)} fill={COLORS[1]} />
            <text x={x0 + Math.max(2, (s.values[i] / max) * bw) + 6} y="14" fontSize="11" fontWeight="700" fill="#000919">{fmt(s.values[i], s.unit)}</text>
          </g>
        ))}
      </svg>
    );
  }
  const H = 290, top = 24, bottom = 70, left = 44, plotH = H - top - bottom, n = s.labels.length, slot = (W - left - 10) / n, bw = Math.min(46, slot * 0.66);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT }}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={left} x2={W - 10} y1={top + plotH * (1 - t)} y2={top + plotH * (1 - t)} stroke="#000919" strokeOpacity="0.12" /><text x={left - 6} y={top + plotH * (1 - t) + 4} fontSize="9" textAnchor="end" fill="#555">{fmt(max * t, s.unit)}</text></g>)}
      {s.values.map((v, i) => {
        const h = (v / max) * plotH, x = left + slot * i + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={top + plotH - h} width={bw} height={h} fill={COLORS[1]} />
            <text x={x + bw / 2} y={top + plotH - h - 5} fontSize="10" textAnchor="middle" fontWeight="700" fill="#000919">{fmt(v, s.unit)}</text>
            <text transform={`translate(${x + bw / 2}, ${top + plotH + 12}) rotate(${n > 5 ? 35 : 0})`} fontSize="10" textAnchor={n > 5 ? "start" : "middle"} fill="#000919">{short(s.labels[i], n > 5 ? 18 : 22)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Line({ s }: { s: ChartSpec }) {
  const H = 270, top = 24, bottom = 46, left = 48, plotH = H - top - bottom, n = s.labels.length;
  const max = Math.max(...s.values) || 1, step = n > 1 ? (W - left - 24) / (n - 1) : 0;
  const pts = s.values.map((v, i) => [left + step * i, top + plotH - (v / max) * plotH]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT }}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={left} x2={W - 10} y1={top + plotH * (1 - t)} y2={top + plotH * (1 - t)} stroke="#000919" strokeOpacity="0.12" /><text x={left - 6} y={top + plotH * (1 - t) + 4} fontSize="9" textAnchor="end" fill="#555">{fmt(max * t, s.unit)}</text></g>)}
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={COLORS[1]} strokeWidth="2.5" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.5" fill={COLORS[0]} />
          <text x={x} y={y - 8} fontSize="10" textAnchor="middle" fontWeight="700" fill="#000919">{fmt(s.values[i], s.unit)}</text>
          {(n <= 12 || i % Math.ceil(n / 12) === 0) && <text x={x} y={top + plotH + 16} fontSize="10" textAnchor="middle" fill="#000919">{s.labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  const { t } = useI18n();
  const [type, setType] = useState<ChartType>(spec.type);
  const ref = useRef<HTMLDivElement>(null);
  const additive = spec.total !== null, timeline = spec.groupBy === "month" || spec.groupBy === "year";
  const allowed: ChartType[] = (["pie", "donut", "bar", "hbar", "line"] as ChartType[]).filter((x) => (x === "pie" || x === "donut" ? additive && !timeline : x === "line" ? spec.labels.length >= 3 : true));
  const s = { ...spec, type };
  const name = `${spec.metric}-by-${spec.groupBy}-${spec.period}`.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  const svgText = () => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return "";
    const c = svg.cloneNode(true) as SVGSVGElement;
    const [, , w, h] = (c.getAttribute("viewBox") ?? "0 0 560 300").split(" ").map(Number);
    const head = 54, foot = 26;
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    c.setAttribute("width", String(w)); c.setAttribute("height", String(h));
    c.setAttribute("y", String(head));
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + head + foot}" viewBox="0 0 ${w} ${h + head + foot}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>` +
      `<text x="12" y="24" font-size="14" font-weight="700" fill="#000919">${esc(spec.title)}</text><text x="12" y="42" font-size="10" fill="#555">${esc(spec.period)}${spec.unit && spec.unit !== "%" ? ` · ${esc(spec.unit)}` : ""}</text>` +
      new XMLSerializer().serializeToString(c) + `<text x="12" y="${h + head + 16}" font-size="9" fill="#777">${esc(spec.note ?? "")}</text></svg>`;
  };
  const download = async (kind: "png" | "svg") => {
    const txt = svgText();
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
  const LABEL: Record<ChartType, string> = { pie: t("Pie"), donut: t("Donut"), bar: t("Bars"), hbar: t("Horizontal"), line: t("Line chart") };

  return (
    <div className="panel chart-card" style={{ padding: 14 }} dir="ltr">
      <div style={{ fontSize: 12, fontWeight: 700 }} dir="auto">{spec.title}</div>
      <div className="muted" style={{ fontSize: 10, marginBottom: 8 }} dir="auto">{spec.period}{spec.unit && spec.unit !== "%" ? ` · ${spec.unit}` : ""}{spec.total !== null ? ` · ${t("total")} ${fmt(spec.total, spec.unit)}` : ""}</div>
      <div ref={ref}>
        {type === "pie" || type === "donut" ? <Pie s={s} donut={type === "donut"} /> : type === "line" ? <Line s={s} /> : <Bars s={s} horizontal={type === "hbar"} />}
      </div>
      {spec.note && <div className="muted" style={{ fontSize: 9, marginTop: 6 }} dir="auto">{spec.note}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        {allowed.map((x) => <button key={x} className={`chip${x === type ? " on" : ""}`} style={{ fontSize: 10, ...(x === type ? { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 700 } : {}) }} onClick={() => setType(x)}>{LABEL[x]}</button>)}
        <div style={{ flex: 1 }} />
        <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => download("png")}>{t("Download PNG")}</button>
        <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => download("svg")}>SVG</button>
      </div>
    </div>
  );
}
