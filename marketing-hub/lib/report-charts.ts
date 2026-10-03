// Charts for the daily report e-mail. E-mail clients (Outlook desktop above all, and Gmail) don't render SVG or
// canvas, so these are built from plain HTML tables with background colours — they look the same in Outlook, Gmail,
// Apple Mail, the in-app report view, the HTML download and the PDF. Every number comes from the chart engine
// (lib/chart-query.ts), so it matches the assistant's charts and the rest of the app.
import type { QueryCtx } from "./query";
import { runChartQuery, type ChartQuery } from "./chart-query";
import type { ChartSpec } from "./charts";
import type { DeckSlide } from "./deck";
import { type Lang, tx } from "./i18n";

// Same colour-blind-checked categorical order as the in-app charts; text stays in ink, never in a series colour.
// Kinan palette: charcoal and orange first, then greys and orange tints that stay distinct when stacked.
// Categorical hues in fixed order (validated for colour-blind separation on white); 7th+ folds into "Other".
const SERIES = ["#e8562a", "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const BASE = "#3a3a3a", WARN = "#c98500";
const INK = "#1a1a1a", SOFT = "#6b6b6b", TRACK = "#ededed", GOOD = "#1f7a4d", ALERT = "#d6334b";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 1 : 2 })}${unit === "%" ? "%" : ""}`);
const T0 = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

/** A filled bar of `pct` (0–100) on a light track — a table, so Outlook draws it. */
function bar(pct: number, color: string, h = 12) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const cell = (w: number, c: string) => `<td width="${w}%" bgcolor="${c}" style="background:${c};height:${h}px;font-size:0;line-height:0">&nbsp;</td>`;
  return `<table ${T0} width="100%" class="k-bar" style="border-collapse:collapse"><tr>${p > 0 ? cell(p, color) : ""}${p < 100 ? cell(100 - p, TRACK) : ""}</tr></table>`;
}
const swatch = (c: string) => `<span style="display:inline-block;width:9px;height:9px;background:${c};vertical-align:middle"></span>`;
const caption = (s: string) => `<div style="font-size:11px;color:${SOFT};margin:6px 0 0">${s}</div>`;
const titleRow = (t: string, sub: string) => `<div style="font-size:13px;font-weight:700;margin:0">${esc(t)}</div><div style="font-size:11px;color:${SOFT};margin:2px 0 8px">${esc(sub)}</div>`;

/** Horizontal bars: label | bar | value. */
function hbars(s: ChartSpec, opts: { color?: (i: number, v: number) => string; max?: number } = {}) {
  const vals = s.series?.[0]?.values ?? s.values, max = opts.max ?? Math.max(...vals.map((v) => v ?? 0), 0) ?? 1;
  return `<table ${T0} width="100%" style="border-collapse:collapse;font-size:12px">${s.labels.map((l, i) => {
    const v = vals[i] ?? 0;
    return `<tr><td width="34%" style="padding:3px 8px 3px 0;color:${INK};white-space:nowrap;overflow:hidden">${esc(l)}</td><td style="padding:3px 0">${bar(max ? (v / max) * 100 : 0, opts.color?.(i, v) ?? BASE)}</td><td width="16%" align="right" style="padding:3px 0 3px 8px;font-weight:700;color:${INK};white-space:nowrap">${fmt(vals[i], s.unit)}</td></tr>`;
  }).join("")}</table>`;
}
/** Part-to-whole: one 100% bar split by share, with a legend (the e-mail-safe stand-in for a pie). */
function shareBar(s: ChartSpec) {
  const vals = (s.series?.[0]?.values ?? s.values).map((v) => v ?? 0), tot = vals.reduce((a, b) => a + b, 0) || 1;
  const cells = vals.map((v, i) => { const w = Math.max(1, Math.round((v / tot) * 100)); return `<td width="${w}%" bgcolor="${(SERIES[i] ?? "#9a9a9a")}" style="background:${(SERIES[i] ?? "#9a9a9a")};height:18px;font-size:0;line-height:0;border-inline-end:2px solid #fff">&nbsp;</td>`; }).join("");
  const legend = s.labels.map((l, i) => `<tr><td width="14" style="padding:3px 0">${swatch((SERIES[i] ?? "#9a9a9a"))}</td><td style="padding:3px 6px;color:${INK}">${esc(l)}</td><td align="right" style="padding:3px 0;font-weight:700;color:${INK};white-space:nowrap">${fmt(vals[i], s.unit)}</td><td width="48" align="right" style="padding:3px 0;color:${SOFT}">${Math.round((vals[i] / tot) * 100)}%</td></tr>`).join("");
  return `<table ${T0} width="100%" class="k-bar" style="border-collapse:collapse"><tr>${cells}</tr></table><table ${T0} width="100%" style="border-collapse:collapse;font-size:12px;margin-top:8px">${legend}</table>`;
}
/** Columns over time: value on the cap, label below. */
function columns(s: ChartSpec, opts: { color?: string; highlightLast?: boolean } = {}) {
  const vals = s.series?.[0]?.values ?? s.values, max = Math.max(...vals.map((v) => v ?? 0)) || 1, H = 110;
  const col = (v: number | null, i: number) => {
    const h = Math.max(2, Math.round(((v ?? 0) / max) * H)), c = opts.highlightLast && i === vals.length - 1 ? SERIES[0] : opts.color ?? BASE;
    return `<td valign="bottom" align="center" style="padding:0 4px;height:${H + 18}px"><div style="font-size:11px;font-weight:700;color:${INK};margin-bottom:3px">${fmt(v, s.unit)}</div><table ${T0} width="70%" class="k-col" style="border-collapse:collapse;margin:0 auto;animation-delay:${200 + i * 90}ms"><tr><td height="${h}" bgcolor="${c}" style="background:${c};height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`;
  };
  return `<table ${T0} width="100%" style="border-collapse:collapse;table-layout:fixed"><tr>${vals.map(col).join("")}</tr><tr>${s.labels.map((l) => `<td align="center" style="padding:4px 2px 0;font-size:11px;color:${SOFT};border-top:1px solid #c3c2b7">${esc(l)}</td>`).join("")}</tr></table>`;
}

export type ReportChart = { id?: string; title: string; html: string; text: string; slide?: DeckSlide };

/** The charts in every daily report (figures as of the latest data month). */
export function reportCharts(c: QueryCtx, lang: Lang, targets: { byAsset: { asset: string; actualM: number; targetM: number; pct: number | null }[]; ytdActualM: number; ytdTargetM: number; ytdPct: number }): ReportChart[] {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const q = (x: ChartQuery) => { const r = runChartQuery(x, c, lang); return "error" in r ? null : r; };
  const out: ReportChart[] = [];
  const MON = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { month: "short", timeZone: "UTC" });

  // 1. Sales vs target by project (bars = % of year-to-date target; red below 75%).
  if (targets.byAsset.length) {
    const html = `<table ${T0} width="100%" style="border-collapse:collapse;font-size:12px">${targets.byAsset.map((x) => {
      const p = x.pct ?? 0, color = p < 75 ? ALERT : p < 95 ? WARN : GOOD;
      return `<tr><td width="34%" style="padding:4px 8px 4px 0;color:${INK}">${esc(x.asset)}</td><td style="padding:4px 0">${bar(Math.min(100, p), color, 14)}</td><td width="26%" align="right" style="padding:4px 0 4px 8px;white-space:nowrap;color:${INK}"><b>${p}%</b> <span style="color:${SOFT}">${fmt(x.actualM, "")} / ${fmt(x.targetM, "")}</span></td></tr>`;
    }).join("")}</table>` + caption(esc(T(`SAR M, CRM-verified. Total ${targets.ytdActualM} of ${targets.ytdTargetM} (${targets.ytdPct}%). Green ≥ 95%, amber 75–95%, red < 75%.`, `مليون ر.س، متحقَّق منه في النظام. الإجمالي ${targets.ytdActualM} من ${targets.ytdTargetM} (${targets.ytdPct}%). أخضر ≥ 95%، كهرماني 75–95%، أحمر < 75%.`)));
    out.push({ id: "sales", title: T("Sales vs target by project", "المبيعات مقابل المستهدف حسب المشروع"), html: titleRow(T("Sales vs target by project", "المبيعات مقابل المستهدف حسب المشروع"), T("Year to date", "منذ بداية العام")) + html,
      text: targets.byAsset.map((x) => `  ${x.asset}: ${x.pct}% (${x.actualM} / ${x.targetM} SAR M)`).join("\n"),
      slide: { kind: "gauges", kicker: T("Sales vs target", "المبيعات مقابل المستهدف"), title: T("Sales vs target by project — year to date", "المبيعات مقابل المستهدف حسب المشروع — منذ بداية العام"),
        items: targets.byAsset.map((x) => ({ label: x.asset, pct: x.pct ?? 0, actual: `${x.actualM}`, target: `${x.targetM}` })),
        foot: T(`SAR M, CRM-verified · total ${targets.ytdActualM} of ${targets.ytdTargetM} (${targets.ytdPct}%)`, `مليون ر.س، متحقَّق منه · الإجمالي ${targets.ytdActualM} من ${targets.ytdTargetM} (${targets.ytdPct}%)`),
        say: T(`Sales against target by project. ${targets.byAsset.map((x) => `${x.asset}, ${x.pct} percent`).join(". ")}.`, `المبيعات مقابل المستهدف حسب المشروع. ${targets.byAsset.map((x) => `${x.asset}، ${x.pct} في المئة`).join(". ")}.`) } });
  }
  // 2. Sales by month this year (latest month highlighted).
  const m = q({ dataset: "campaigns", x: "month", measures: ["sum(sales)"], period: "year to date", sort: "label" });
  if (m) {
    const s = { ...m, labels: m.labels.map(MON) };
    out.push({ id: "monthly", title: T("Sales by month", "المبيعات حسب الشهر"), html: titleRow(T("Sales by month", "المبيعات حسب الشهر"), T(`${m.period} · SAR M, CRM-verified · latest month highlighted`, `${m.period} · مليون ر.س، متحقَّق منه · آخر شهر مميّز`)) + columns(s, { highlightLast: true }),
      text: m.labels.map((l, i) => `  ${l}: ${m.series![0].values[i]} SAR M`).join("\n"),
      slide: { kind: "columns", kicker: T("At a glance", "نظرة سريعة"), title: T("Sales by month", "المبيعات حسب الشهر"), sub: T(`${m.period} · SAR M, CRM-verified`, `${m.period} · مليون ر.س، متحقَّق منها`), labels: m.labels.map(MON), values: (m.series![0].values as number[]).map((x) => x ?? 0), unit: T("SAR M", "مليون ر.س"), decimals: 1,
        say: T(`Sales by month: ${m.labels.map((l, i) => `${MON(l)} ${m.series![0].values[i]} million`).join(", ")}.`, `المبيعات حسب الشهر: ${m.labels.map((l, i) => `${MON(l)} ${m.series![0].values[i]} مليون`).join("، ")}.`) } });
  }
  // 3. Revenue share by vendor (part-to-whole).
  const v = q({ dataset: "campaigns", x: "vendor", measures: ["sum(sales)"], period: "year to date", limit: 7 });
  if (v) out.push({ id: "vendors", title: T("Revenue by vendor", "الإيرادات حسب المورد"), html: titleRow(T("Revenue by vendor", "الإيرادات حسب المورد"), T(`${v.period} · SAR M, contracted sales in the CRM · total ${v.total}`, `${v.period} · مليون ر.س، مبيعات متعاقد عليها في النظام · الإجمالي ${v.total}`)) + shareBar(v),
    text: v.labels.map((l, i) => `  ${l}: ${v.series![0].values[i]} SAR M`).join("\n"),
    slide: { kind: "donut", kicker: T("At a glance", "نظرة سريعة"), title: T("Revenue by vendor", "الإيرادات حسب المورد"), sub: T(`${v.period} · SAR M, contracted sales in the CRM`, `${v.period} · مليون ر.س، مبيعات متعاقد عليها`), labels: v.labels, values: (v.series![0].values as number[]).map((x) => x ?? 0), unit: T("SAR M", "مليون ر.س"),
      say: T(`Revenue by vendor, led by ${v.labels[0]} with ${v.series![0].values[0]} million.`, `الإيرادات حسب المورد، يتصدرها ${v.labels[0]} بـ${v.series![0].values[0]} مليون.`) } });
  // 4. Cost to sales by channel (lower is better; red where it's above the 2023–2025 average for all channels).
  const ch = q({ dataset: "campaigns", x: "channel", measures: ["cost_to_sales"], period: "year to date", sort: "value_asc" });
  const hist = q({ dataset: "campaigns", measures: ["cost_to_sales"], filters: [{ field: "status", op: "=", value: "past" }] });
  const bench = hist ? hist.series?.[0]?.values[0] ?? null : null;
  if (ch) out.push({ id: "channels", title: T("Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"),
    html: titleRow(T("Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"), T(`${ch.period} · marketing spend ÷ contracted sales · lower is better`, `${ch.period} · الإنفاق ÷ المبيعات المتعاقد عليها · الأقل أفضل`)) +
      hbars(ch, { color: (_i, val) => (bench !== null && val > bench * 1.5 ? ALERT : BASE) }) + (bench !== null ? caption(esc(T(`Red: more than 1.5× the 2023–2025 average (${bench}%).`, `الأحمر: أكثر من 1.5 ضعف متوسط 2023–2025 (${bench}%).`))) : ""),
    text: ch.labels.map((l, i) => `  ${l}: ${ch.series![0].values[i]}%`).join("\n") ,
    slide: { kind: "hbars", kicker: T("At a glance", "نظرة سريعة"), title: T("Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"), sub: T(`${ch.period} · spend ÷ contracted sales · lower is better`, `${ch.period} · الإنفاق ÷ المبيعات · الأقل أفضل`), labels: ch.labels, values: (ch.series![0].values as number[]).map((x) => x ?? 0), unit: "%", bench, benchLabel: bench !== null ? T(`2023–2025 average ${bench}%`, `متوسط 2023–2025: ${bench}%`) : undefined,
      say: T(`Cost to sales by channel: ${ch.labels[0]} is the most efficient at ${ch.series![0].values[0]} percent; ${ch.labels[ch.labels.length - 1]} the costliest at ${ch.series![0].values[ch.labels.length - 1]} percent.`, `نسبة التكلفة إلى المبيعات: ${ch.labels[0]} الأكفأ بـ${ch.series![0].values[0]}٪؛ و${ch.labels[ch.labels.length - 1]} الأعلى تكلفة بـ${ch.series![0].values[ch.labels.length - 1]}٪.`) } });
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
    html: titleRow(T("Meta ads — CRM revenue by month", "إعلانات ميتا — إيرادات النظام حسب الشهر"), T(`Last 6 months · SAR M · total ${total}`, `آخر 6 أشهر · مليون ر.س · الإجمالي ${total}`)) + columns({ ...r, labels: r.labels.map(MON) }, { color: SERIES[1], highlightLast: false }) +
      caption(esc(T("The linked campaign's CRM-verified sales × Meta's share of its spend.", "مبيعات الحملة المرتبطة المتحقَّق منها × حصة ميتا من إنفاقها."))),
    text: r.labels.map((l, i) => `  ${l}: ${r.series![0].values[i]} SAR M`).join("\n"),
    slide: { kind: "line", kicker: T("Meta ads", "إعلانات ميتا"), title: T("Meta ads — CRM revenue by month", "إعلانات ميتا — إيرادات النظام حسب الشهر"), sub: T(`Last 6 months · SAR M · total ${total}`, `آخر 6 أشهر · مليون ر.س · الإجمالي ${total}`), labels: r.labels.map(MON), values: (r.series![0].values as number[]).map((x) => x ?? 0), unit: T("SAR M", "مليون ر.س"),
      say: T(`Meta ads revenue over six months: ${total} million in total.`, `إيرادات إعلانات ميتا خلال ستة أشهر: ${total} مليون إجمالاً.`) },
  };
}

/** A chart the manager added to the report from the chat ("add a pie chart of spend by channel"): the stored query is
 * re-run on today's data, drawn e-mail-safe, and given a presentation slide. */
export function customReportChart(spec: ChartSpec, lang: Lang): ReportChart {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const vals = ((spec.series?.[0]?.values ?? spec.values) as (number | null)[]).map((x) => x ?? 0);
  const s: ChartSpec = { ...spec, values: vals, series: spec.series?.length ? [{ ...spec.series[0], values: vals }] : undefined };
  const part = spec.type === "pie" || spec.type === "donut";
  const time = spec.type === "line" || spec.type === "area" || /month|quarter|year|week/i.test(String(spec.groupBy ?? (spec.query as any)?.x ?? ""));
  const unit = spec.unit || "";
  const sub = [spec.period, unit].filter(Boolean).join(" · ") + (spec.series && spec.series.length > 1 ? T(` · first series: ${spec.series[0].name}`, ` · السلسلة الأولى: ${spec.series[0].name}`) : "");
  const body = part ? shareBar(s) : time && spec.type !== "hbar" ? columns(s, { highlightLast: true }) : hbars(s, { color: () => SERIES[1] });
  const added = T("Added to the report from the chat", "أُضيف إلى التقرير من المحادثة");
  const slide: DeckSlide = part
    ? { kind: "donut", kicker: T("Your charts", "رسومكم"), title: spec.title, sub: sub || added, labels: spec.labels, values: vals, unit, say: T(`${spec.title}: ${spec.labels[0]} leads with ${vals[0]}.`, `${spec.title}: يتصدر ${spec.labels[0]} بـ${vals[0]}.`) }
    : time
      ? { kind: spec.type === "line" || spec.type === "area" ? "line" : "columns", kicker: T("Your charts", "رسومكم"), title: spec.title, sub: sub || added, labels: spec.labels, values: vals, unit, say: T(`${spec.title}: latest ${spec.labels[spec.labels.length - 1]}, ${vals[vals.length - 1]}.`, `${spec.title}: الأحدث ${spec.labels[spec.labels.length - 1]}، ${vals[vals.length - 1]}.`) } as DeckSlide
      : { kind: "hbars", kicker: T("Your charts", "رسومكم"), title: spec.title, sub: sub || added, labels: spec.labels, values: vals, unit, bench: null, say: T(`${spec.title}: ${spec.labels[0]} first with ${vals[0]}.`, `${spec.title}: ${spec.labels[0]} أولاً بـ${vals[0]}.`) };
  return { id: "custom", title: spec.title, html: titleRow(spec.title, sub) + body + caption(esc(added)), text: spec.labels.map((l, i) => `  ${l}: ${vals[i]}${unit ? ` ${unit}` : ""}`).join("\n"), slide };
}
