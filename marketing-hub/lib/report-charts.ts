// Charts for the daily report e-mail. E-mail clients (Outlook desktop above all, and Gmail) don't render SVG or
// canvas, so these are built from plain HTML tables with background colours — they look the same in Outlook, Gmail,
// Apple Mail, the in-app report view, the HTML download and the PDF. Every number comes from the chart engine
// (lib/chart-query.ts), so it matches the assistant's charts and the rest of the app.
import type { QueryCtx } from "./query";
import { runChartQuery, type ChartQuery } from "./chart-query";
import type { ChartSpec } from "./charts";
import { type Lang, tx } from "./i18n";

// Same colour-blind-checked categorical order as the in-app charts; text stays in ink, never in a series colour.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const INK = "#000919", SOFT = "#5b6170", TRACK = "#e8e7e3", GOOD = "#1f7a4d", ALERT = "#d6334b";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })}${unit === "%" ? "%" : ""}`);
const T0 = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

/** A filled bar of `pct` (0–100) on a light track — a table, so Outlook draws it. */
function bar(pct: number, color: string, h = 12) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const cell = (w: number, c: string) => `<td width="${w}%" bgcolor="${c}" style="background:${c};height:${h}px;font-size:0;line-height:0">&nbsp;</td>`;
  return `<table ${T0} width="100%" style="border-collapse:collapse"><tr>${p > 0 ? cell(p, color) : ""}${p < 100 ? cell(100 - p, TRACK) : ""}</tr></table>`;
}
const swatch = (c: string) => `<span style="display:inline-block;width:9px;height:9px;background:${c};vertical-align:middle"></span>`;
const caption = (s: string) => `<div style="font-size:11px;color:${SOFT};margin:6px 0 0">${s}</div>`;
const titleRow = (t: string, sub: string) => `<div style="font-size:13px;font-weight:700;margin:0">${esc(t)}</div><div style="font-size:11px;color:${SOFT};margin:2px 0 8px">${esc(sub)}</div>`;

/** Horizontal bars: label | bar | value. */
function hbars(s: ChartSpec, opts: { color?: (i: number, v: number) => string; max?: number } = {}) {
  const vals = s.series?.[0]?.values ?? s.values, max = opts.max ?? Math.max(...vals.map((v) => v ?? 0), 0) ?? 1;
  return `<table ${T0} width="100%" style="border-collapse:collapse;font-size:12px">${s.labels.map((l, i) => {
    const v = vals[i] ?? 0;
    return `<tr><td width="34%" style="padding:3px 8px 3px 0;color:${INK};white-space:nowrap;overflow:hidden">${esc(l)}</td><td style="padding:3px 0">${bar(max ? (v / max) * 100 : 0, opts.color?.(i, v) ?? SERIES[0])}</td><td width="16%" align="right" style="padding:3px 0 3px 8px;font-weight:700;color:${INK};white-space:nowrap">${fmt(vals[i], s.unit)}</td></tr>`;
  }).join("")}</table>`;
}
/** Part-to-whole: one 100% bar split by share, with a legend (the e-mail-safe stand-in for a pie). */
function shareBar(s: ChartSpec) {
  const vals = (s.series?.[0]?.values ?? s.values).map((v) => v ?? 0), tot = vals.reduce((a, b) => a + b, 0) || 1;
  const cells = vals.map((v, i) => { const w = Math.max(1, Math.round((v / tot) * 100)); return `<td width="${w}%" bgcolor="${SERIES[i % 8]}" style="background:${SERIES[i % 8]};height:18px;font-size:0;line-height:0;border-inline-end:2px solid #fff">&nbsp;</td>`; }).join("");
  const legend = s.labels.map((l, i) => `<tr><td width="14" style="padding:3px 0">${swatch(SERIES[i % 8])}</td><td style="padding:3px 6px;color:${INK}">${esc(l)}</td><td align="right" style="padding:3px 0;font-weight:700;color:${INK};white-space:nowrap">${fmt(vals[i], s.unit)}</td><td width="48" align="right" style="padding:3px 0;color:${SOFT}">${Math.round((vals[i] / tot) * 100)}%</td></tr>`).join("");
  return `<table ${T0} width="100%" style="border-collapse:collapse"><tr>${cells}</tr></table><table ${T0} width="100%" style="border-collapse:collapse;font-size:12px;margin-top:8px">${legend}</table>`;
}
/** Columns over time: value on the cap, label below. */
function columns(s: ChartSpec, opts: { color?: string; highlightLast?: boolean } = {}) {
  const vals = s.series?.[0]?.values ?? s.values, max = Math.max(...vals.map((v) => v ?? 0)) || 1, H = 110;
  const col = (v: number | null, i: number) => {
    const h = Math.max(2, Math.round(((v ?? 0) / max) * H)), c = opts.highlightLast && i === vals.length - 1 ? SERIES[1] : opts.color ?? SERIES[0];
    return `<td valign="bottom" align="center" style="padding:0 4px;height:${H + 18}px"><div style="font-size:11px;font-weight:700;color:${INK};margin-bottom:3px">${fmt(v, s.unit)}</div><table ${T0} width="70%" style="border-collapse:collapse;margin:0 auto"><tr><td height="${h}" bgcolor="${c}" style="background:${c};height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`;
  };
  return `<table ${T0} width="100%" style="border-collapse:collapse;table-layout:fixed"><tr>${vals.map(col).join("")}</tr><tr>${s.labels.map((l) => `<td align="center" style="padding:4px 2px 0;font-size:11px;color:${SOFT};border-top:1px solid #c3c2b7">${esc(l)}</td>`).join("")}</tr></table>`;
}

export type ReportChart = { title: string; html: string; text: string };

/** The charts in every daily report (figures as of the latest data month). */
export function reportCharts(c: QueryCtx, lang: Lang, targets: { byAsset: { asset: string; actualM: number; targetM: number; pct: number | null }[]; ytdActualM: number; ytdTargetM: number; ytdPct: number }): ReportChart[] {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const q = (x: ChartQuery) => { const r = runChartQuery(x, c, lang); return "error" in r ? null : r; };
  const out: ReportChart[] = [];
  const MON = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { month: "short", timeZone: "UTC" });

  // 1. Sales vs target by project (bars = % of year-to-date target; red below 75%).
  if (targets.byAsset.length) {
    const html = `<table ${T0} width="100%" style="border-collapse:collapse;font-size:12px">${targets.byAsset.map((x) => {
      const p = x.pct ?? 0, color = p < 75 ? ALERT : p < 95 ? SERIES[3] : GOOD;
      return `<tr><td width="34%" style="padding:4px 8px 4px 0;color:${INK}">${esc(x.asset)}</td><td style="padding:4px 0">${bar(Math.min(100, p), color, 14)}</td><td width="26%" align="right" style="padding:4px 0 4px 8px;white-space:nowrap;color:${INK}"><b>${p}%</b> <span style="color:${SOFT}">${fmt(x.actualM, "")} / ${fmt(x.targetM, "")}</span></td></tr>`;
    }).join("")}</table>` + caption(esc(T(`SAR M, CRM-verified. Total ${targets.ytdActualM} of ${targets.ytdTargetM} (${targets.ytdPct}%). Green ≥ 95%, amber 75–95%, red < 75%.`, `مليون ر.س، متحقَّق منه في النظام. الإجمالي ${targets.ytdActualM} من ${targets.ytdTargetM} (${targets.ytdPct}%). أخضر ≥ 95%، كهرماني 75–95%، أحمر < 75%.`)));
    out.push({ title: T("Sales vs target by project", "المبيعات مقابل المستهدف حسب المشروع"), html: titleRow(T("Sales vs target by project", "المبيعات مقابل المستهدف حسب المشروع"), T("Year to date", "منذ بداية العام")) + html,
      text: targets.byAsset.map((x) => `  ${x.asset}: ${x.pct}% (${x.actualM} / ${x.targetM} SAR M)`).join("\n") });
  }
  // 2. Sales by month this year (latest month highlighted).
  const m = q({ dataset: "campaigns", x: "month", measures: ["sum(sales)"], period: "year to date", sort: "label" });
  if (m) {
    const s = { ...m, labels: m.labels.map(MON) };
    out.push({ title: T("Sales by month", "المبيعات حسب الشهر"), html: titleRow(T("Sales by month", "المبيعات حسب الشهر"), T(`${m.period} · SAR M, CRM-verified · latest month highlighted`, `${m.period} · مليون ر.س، متحقَّق منه · آخر شهر مميّز`)) + columns(s, { highlightLast: true }),
      text: m.labels.map((l, i) => `  ${l}: ${m.series![0].values[i]} SAR M`).join("\n") });
  }
  // 3. Revenue share by vendor (part-to-whole).
  const v = q({ dataset: "campaigns", x: "vendor", measures: ["sum(sales)"], period: "year to date", limit: 7 });
  if (v) out.push({ title: T("Revenue by vendor", "الإيرادات حسب المورد"), html: titleRow(T("Revenue by vendor", "الإيرادات حسب المورد"), T(`${v.period} · SAR M, contracted sales in the CRM · total ${v.total}`, `${v.period} · مليون ر.س، مبيعات متعاقد عليها في النظام · الإجمالي ${v.total}`)) + shareBar(v),
    text: v.labels.map((l, i) => `  ${l}: ${v.series![0].values[i]} SAR M`).join("\n") });
  // 4. Cost to sales by channel (lower is better; red where it's above the 2023–2025 average for all channels).
  const ch = q({ dataset: "campaigns", x: "channel", measures: ["cost_to_sales"], period: "year to date", sort: "value_asc" });
  const hist = q({ dataset: "campaigns", measures: ["cost_to_sales"], filters: [{ field: "status", op: "=", value: "past" }] });
  const bench = hist ? hist.series?.[0]?.values[0] ?? null : null;
  if (ch) out.push({ title: T("Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"),
    html: titleRow(T("Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"), T(`${ch.period} · marketing spend ÷ contracted sales · lower is better`, `${ch.period} · الإنفاق ÷ المبيعات المتعاقد عليها · الأقل أفضل`)) +
      hbars(ch, { color: (_i, val) => (bench !== null && val > bench * 1.5 ? ALERT : SERIES[0]) }) + (bench !== null ? caption(esc(T(`Red: more than 1.5× the 2023–2025 average (${bench}%).`, `الأحمر: أكثر من 1.5 ضعف متوسط 2023–2025 (${bench}%).`))) : ""),
    text: ch.labels.map((l, i) => `  ${l}: ${ch.series![0].values[i]}%`).join("\n") });
  return out;
}

/** Headline figures as tiles (3 per row; a table so e-mail clients and the PDF keep the layout). */
export function kpiTiles(items: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }[]) {
  const color = (t?: string) => (t === "bad" ? ALERT : t === "good" ? GOOD : t === "warn" ? "#b7791f" : INK);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(`<tr>${items.slice(i, i + 3).map((k) => `<td width="33%" valign="top" style="padding:4px"><table ${T0} width="100%" style="border-collapse:collapse;border:1px solid #d9d7d4;background:#fff"><tr><td style="padding:10px 12px">
      <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${SOFT}">${esc(k.label)}</div>
      <div style="font-size:22px;font-weight:700;color:${color(k.tone)};margin-top:4px">${esc(k.value)}</div>
      ${k.sub ? `<div style="font-size:11px;color:${SOFT};margin-top:2px">${esc(k.sub)}</div>` : ""}</td></tr></table></td>`).join("")}${"<td></td>".repeat(Math.max(0, 3 - items.slice(i, i + 3).length))}</tr>`);
  }
  return `<table ${T0} width="100%" style="border-collapse:collapse;margin:0 -4px">${rows.join("")}</table>`;
}

/** Meta ads: CRM revenue per month over the last six months (columns). */
export function metaRevenueChart(c: QueryCtx, lang: Lang): ReportChart | null {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const r = runChartQuery({ dataset: "meta", x: "month", measures: ["sum(revenue)"], period: "last 6 months", sort: "label" }, c, lang);
  if ("error" in r || !(r.series?.[0]?.values ?? []).some((v) => v)) return null;
  const MON = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { month: "short", timeZone: "UTC" });
  const total = Math.round((r.series![0].values as number[]).reduce((a, b) => a + (b ?? 0), 0) * 10) / 10;
  return {
    title: T("Meta ads — CRM revenue", "إعلانات ميتا — إيرادات النظام"),
    html: titleRow(T("Meta ads — CRM revenue by month", "إعلانات ميتا — إيرادات النظام حسب الشهر"), T(`Last 6 months · SAR M · total ${total}`, `آخر 6 أشهر · مليون ر.س · الإجمالي ${total}`)) + columns({ ...r, labels: r.labels.map(MON) }, { color: SERIES[6], highlightLast: false }) +
      caption(esc(T("The linked campaign's CRM-verified sales × Meta's share of its spend.", "مبيعات الحملة المرتبطة المتحقَّق منها × حصة ميتا من إنفاقها."))),
    text: r.labels.map((l, i) => `  ${l}: ${r.series![0].values[i]} SAR M`).join("\n"),
  };
}
