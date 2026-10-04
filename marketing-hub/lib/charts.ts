// Charts from a prompt ("pie chart of revenue by vendor", "monthly spend for Marina Tower as a line").
// The numbers are always computed here from the data (live 2026 campaigns + the 2023–2025 history + the CRM lead
// sample); the AI or the built-in rules only choose WHAT to chart. Rendered by app/_components/ChartView.tsx.
import type { QueryCtx } from "./query";
import { parsePeriod, latestLiveMonth, resolve } from "./query";
import { familyOf, FAMILY_LABEL } from "./history";
import { breakdown, DIMENSIONS, type Dimension } from "./audience";
import { type Lang, tx, nm } from "./i18n";

export type ChartType = "pie" | "donut" | "bar" | "hbar" | "line" | "area" | "stacked" | "stackedh" | "grouped" | "scatter" | "table" | "kpi";
export type Metric = "sales" | "spend" | "qualified" | "contracts" | "leads" | "costToSales" | "cpql";
export type GroupBy = "vendor" | "project" | "channel" | "campaign" | "month" | "year" | Dimension;
export type ChartSpec = {
  type: ChartType; title: string; metric: Metric | string; unit: string; groupBy: GroupBy | string;
  labels: string[]; values: number[]; total: number | null; period: string; note?: string; lang: Lang;
  // Open-ended charts (lib/chart-query.ts): several series, scatter points, the query that produced it.
  subtitle?: string; series?: { name: string; values: (number | null)[]; unit?: string }[]; units?: string[];
  points?: { label: string; x: number; y: number }[]; xLabel?: string; yLabel?: string; xUnit?: string; query?: unknown;
};
export type ChartRequest = { type?: ChartType; metric?: Metric; groupBy?: GroupBy; period?: string; months?: string[]; project?: string; channel?: string; vendor?: string; top?: number };

export const METRICS: Metric[] = ["sales", "spend", "qualified", "contracts", "leads", "costToSales", "cpql"];
export const GROUPS: GroupBy[] = ["vendor", "project", "channel", "campaign", "month", "year", ...DIMENSIONS];
const ADDITIVE = new Set<Metric>(["sales", "spend", "qualified", "contracts", "leads"]);

const META: Record<Metric, { en: string; ar: string; unit: [string, string] }> = {
  sales: { en: "Revenue (contracted sales)", ar: "الإيرادات (المبيعات المتعاقد عليها)", unit: ["SAR M", "مليون ر.س"] },
  spend: { en: "Marketing spend", ar: "الإنفاق التسويقي", unit: ["SAR K", "ألف ر.س"] },
  qualified: { en: "Qualified leads (CRM)", ar: "العملاء المؤهلون (النظام)", unit: ["", ""] },
  contracts: { en: "Contracts signed", ar: "العقود الموقعة", unit: ["", ""] },
  leads: { en: "Leads (CRM sample)", ar: "العملاء المحتملون (عينة النظام)", unit: ["", ""] },
  costToSales: { en: "Cost to sales", ar: "نسبة التكلفة إلى المبيعات", unit: ["%", "%"] },
  cpql: { en: "Cost per qualified lead", ar: "تكلفة العميل المؤهل", unit: ["SAR", "ر.س"] },
};
const GROUP_LABEL: Record<string, [string, string]> = {
  vendor: ["vendor", "المورد"], project: ["project", "المشروع"], channel: ["channel", "القناة"], campaign: ["campaign", "الحملة"], month: ["month", "الشهر"], year: ["year", "السنة"],
  city: ["city", "المدينة"], nationality: ["nationality", "الجنسية"], buyerType: ["buyer type", "نوع المشتري"], budgetBand: ["budget band", "فئة الميزانية"], unitType: ["unit type", "نوع الوحدة"], ageBand: ["age band", "الفئة العمرية"], lostReason: ["reason lost", "سبب الخسارة"], responseBand: ["first response time", "زمن الاستجابة الأول"],
};

// ---- Reading a chart request from free text -------------------------------------------------------------------
export const RX_CHART = /\b(chart|graph|plot|visuali[sz]e|visual|diagram|pie|donut|doughnut|bar ?chart|column chart|line chart|histogram)\b|رسم بياني|رسماً بيانياً|رسمًا بيانيًا|مخطط|دائري|أعمدة|خطي|ارسم|تصور/;

export function chartRequestFromText(text: string, c: QueryCtx): ChartRequest {
  const q = text.toLowerCase();
  const type: ChartType | undefined = /donut|doughnut|حلقي/.test(q) ? "donut" : /\bpie\b|دائري|كعكة/.test(q) ? "pie" : /line|trend|over time|evolution|خطي|اتجاه|تطور/.test(q) ? "line" : /horizontal/.test(q) ? "hbar" : /\bbar|column|histogram|أعمدة|شريطي/.test(q) ? "bar" : undefined;
  const metric: Metric | undefined =
    /cost.?to.?sales|efficien|التكلفة إلى المبيعات/.test(q) ? "costToSales" : /cpql|cost per qualified|تكلفة العميل المؤهل/.test(q) ? "cpql" :
    /spend|spent|cost|budget|إنفاق|الإنفاق|صرف|تكلفة/.test(q) ? "spend" : /qualified|مؤهل/.test(q) ? "qualified" :
    /contracts?|deals?|units sold|عقود|العقود|صفقات/.test(q) ? "contracts" : /leads?|عملاء محتملين|العملاء المحتملين/.test(q) ? "leads" :
    /revenue|sales|turnover|income|إيراد|الإيرادات|مبيعات|المبيعات/.test(q) ? "sales" : undefined;
  const dim = (DIMENSIONS as readonly string[]).find((d) => ({
    city: /\bcit(y|ies)\b|المدينة|المدن/, nationality: /nationalit|الجنسي/, buyerType: /buyer types?|investors?|end.?users?|نوع المشتري|المستثمر/, budgetBand: /budget (band|range)|فئة الميزانية/,
    unitType: /unit types?|نوع الوحدة/, ageBand: /\bage|العمر|الأعمار/, lostReason: /lost|reason|سبب الخسارة|أسباب/, responseBand: /response time|زمن الاستجابة/,
  } as Record<string, RegExp>)[d].test(q)) as Dimension | undefined;
  const groupBy: GroupBy | undefined =
    /by (vendor|agency|supplier)|per (vendor|agency)|each (vendor|agency)|(vendors|agencies)\b|حسب المورد|لكل مورد|الموردين|الوكالات/.test(q) ? "vendor" :
    /by project|per project|each project|projects\b|حسب المشروع|لكل مشروع|المشاريع/.test(q) ? "project" :
    /by channel|per channel|each channel|channels\b|حسب القناة|لكل قناة|القنوات/.test(q) ? "channel" :
    /by campaign|per campaign|each campaign|campaigns\b|حسب الحملة|لكل حملة|الحملات/.test(q) ? "campaign" :
    /by year|per year|yearly|annual|each year|year.?on.?year|حسب السنة|سنوي|لكل سنة/.test(q) ? "year" :
    /by month|per month|monthly|each month|over time|trend|حسب الشهر|شهري|لكل شهر/.test(q) ? "month" : dim;
  // Drop the chart words first ("رسم بياني" would otherwise read as the vendor Bayan).
  const ents = resolve(text.replace(/(رسم|مخطط)[اًٌ]* ?بياني[اًٌ]*|بياني[اًٌ]*|chart|graph|plot/gi, " "), c);
  const project = ents.find((e) => e.kind === "project")?.name;
  const ch = ents.find((e) => e.kind === "channel") as { family?: string } | undefined;
  const vendor = ents.find((e) => e.kind === "vendor")?.name;
  const pp = parsePeriod(text, latestLiveMonth(c));
  return {
    type, metric, groupBy, period: pp?.label, months: pp?.months,
    project: groupBy === "project" ? undefined : project,
    channel: groupBy === "channel" ? undefined : ch?.family,
    vendor: groupBy === "vendor" ? undefined : vendor,
  };
}

// ---- Computing the chart --------------------------------------------------------------------------------------
type Acc = { spendK: number; qualified: number; contracts: number; salesM: number; leads: number };
const zero = (): Acc => ({ spendK: 0, qualified: 0, contracts: 0, salesM: 0, leads: 0 });
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildChart(req: ChartRequest, c: QueryCtx, lang: Lang): ChartSpec | { error: string } {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const latest = latestLiveMonth(c);
  let metric: Metric = req.metric && METRICS.includes(req.metric) ? req.metric : "sales";
  let groupBy: GroupBy = req.groupBy && GROUPS.includes(req.groupBy) ? req.groupBy : "vendor";
  const isDim = (DIMENSIONS as readonly string[]).includes(groupBy);
  const notes: string[] = [];

  // Period: explicit, else all history for yearly charts, else the live year to date.
  const p = req.months?.length ? { months: req.months, label: req.period ?? req.months.join(", ") } : req.period ? parsePeriod(req.period, latest) : null;
  if (req.period && !p) return { error: T(`I couldn't read the period "${req.period}". Try "May 2026", "Q1 2025", "2024" or "last month".`, `لم أفهم الفترة "${req.period}". جرّبوا "مايو 2026" أو "Q1 2025" أو "2024" أو "الشهر الماضي".`) };
  const ytd = parsePeriod("year to date", latest)!;
  const allMonths = [...new Set([...c.history.rows.flatMap((r: any) => r.months.map((m: any) => m.month)), ...c.agent.unified.campaigns.flatMap((u) => u.months.map((m) => m.month))])].sort();
  const months = p?.months ?? (groupBy === "year" ? allMonths : ytd.months);
  const periodLabel = p?.label ?? (groupBy === "year" ? `${allMonths[0]?.slice(0, 4)}–${latest.slice(0, 4)}` : ytd.label);

  const fam = (x: string) => x;
  const keep = (g: { vendor: string; project: string; family: string }) =>
    (!req.project || g.project === req.project) && (!req.channel || g.family === req.channel) && (!req.vendor || g.vendor === req.vendor);
  const groups = new Map<string, Acc>();
  const add = (k: string, x: Partial<Acc>) => { const a = groups.get(k) ?? (groups.set(k, zero()), groups.get(k)!); for (const f of Object.keys(x) as (keyof Acc)[]) a[f] += x[f] ?? 0; };

  if (isDim) {
    // Lead profiles: counts, qualified, contracts and sales from the CRM lead sample.
    if (!c.leads?.length) return { error: T("Lead profiles aren't available.", "ملفات العملاء غير متاحة.") };
    if (metric === "spend" || metric === "costToSales" || metric === "cpql") { notes.push(T("Spend isn't split by lead profile, so this shows leads.", "الإنفاق غير مقسّم حسب ملف العميل، لذا يُعرض عدد العملاء.")); metric = "leads"; }
    const b = breakdown(c.leads, groupBy as Dimension, { project: req.project, family: req.channel, vendor: req.vendor, months });
    for (const r of b.rows) add(r.value, { leads: r.leads, qualified: r.qualified, contracts: r.won, salesM: r.salesM });
  } else {
    const keyOf = (g: { vendor: string; project: string; family: string; name: string; month: string }) =>
      groupBy === "vendor" ? g.vendor : groupBy === "project" ? g.project : groupBy === "channel" ? g.family : groupBy === "campaign" ? g.name : groupBy === "month" ? g.month : g.month.slice(0, 4);
    for (const u of c.agent.unified.campaigns) {
      const m = c.agent.mkt.campaigns.find((x) => x.id === u.id)!;
      const g = { vendor: u.vendor, project: m.asset, family: fam(familyOf(u.channel)), name: u.name };
      if (!keep(g)) continue;
      for (const mo of u.months.filter((x) => months.includes(x.month))) add(keyOf({ ...g, month: mo.month }), { spendK: mo.costK, qualified: mo.qualified, contracts: mo.won, salesM: mo.salesM });
    }
    for (const r of c.history.rows as any[]) {
      const g = { vendor: r.vendorKey, project: r.projectKey, family: r.family, name: r.name };
      if (!keep(g)) continue;
      for (const mo of r.months.filter((x: any) => months.includes(x.month))) add(keyOf({ ...g, month: mo.month }), { spendK: mo.spendK, qualified: mo.qualified, contracts: mo.contracts, salesM: mo.salesM, leads: mo.leads ?? 0 });
    }
    if (metric === "leads") {
      // Live leads come from the CRM lead sample (vendor-reported leads aren't monthly).
      for (const l of c.leads ?? []) {
        if (!months.includes(l.month) || !l.vendor || !keep({ vendor: l.vendor, project: l.project ?? "", family: l.family ?? "" })) continue;
        if (groupBy === "campaign" && !l.campaign) continue;
        add(keyOf({ vendor: l.vendor, project: l.project ?? "", family: l.family ?? "", name: l.campaign ?? "", month: l.month }), { leads: 1 });
      }
    }
  }

  const val = (a: Acc) => metric === "sales" ? a.salesM : metric === "spend" ? a.spendK : metric === "qualified" ? a.qualified : metric === "contracts" ? a.contracts : metric === "leads" ? a.leads
    : metric === "costToSales" ? (a.salesM ? (a.spendK / (a.salesM * 1000)) * 100 : NaN) : a.qualified ? (a.spendK * 1000) / a.qualified : NaN;
  let rows = [...groups.entries()].map(([k, a]) => ({ k, v: val(a) })).filter((x) => Number.isFinite(x.v) && x.v > 0);
  if (!rows.length) return { error: T(`There's no ${META[metric].en.toLowerCase()} data for that selection (${periodLabel}).`, `لا توجد بيانات ${META[metric].ar} لهذا الاختيار (${periodLabel}).`) };
  const timeline = groupBy === "month" || groupBy === "year";
  rows = timeline ? rows.sort((a, b) => a.k.localeCompare(b.k)) : rows.sort((a, b) => (metric === "costToSales" || metric === "cpql" ? a.v - b.v : b.v - a.v));

  // Pie / donut need parts of a whole: a ratio (cost to sales, CPQL) or a timeline can't be a pie.
  let type: ChartType = req.type ?? (timeline ? "line" : rows.length <= 6 && ADDITIVE.has(metric) ? "pie" : "bar");
  if ((type === "pie" || type === "donut") && !ADDITIVE.has(metric)) { notes.push(T(`${META[metric].en} is a ratio, not a share of a total, so it's shown as bars.`, `${META[metric].ar} نسبة وليست حصة من إجمالي، لذا تُعرض أعمدة.`)); type = "bar"; }
  if ((type === "pie" || type === "donut") && timeline) type = "bar";
  if (type === "line" && !timeline && rows.length < 3) type = "bar";

  // Long lists: keep the top N (default 8 for pies, 12 for bars) and fold the rest into "Other" when it adds up.
  const max = Math.min(Math.max(req.top ?? (type === "pie" || type === "donut" ? 7 : 12), 2), 20);
  if (!timeline && rows.length > max) {
    const rest = rows.slice(max - (ADDITIVE.has(metric) ? 1 : 0));
    rows = rows.slice(0, max - (ADDITIVE.has(metric) ? 1 : 0));
    if (ADDITIVE.has(metric)) rows.push({ k: T(`Other (${rest.length})`, `أخرى (${rest.length})`), v: rest.reduce((s, x) => s + x.v, 0) });
    else notes.push(T(`Showing the best ${max} of ${max + rest.length}.`, `يُعرض أفضل ${max} من ${max + rest.length}.`));
  }

  const label = (k: string) => groupBy === "channel" ? T(FAMILY_LABEL[k]?.[0] ?? k, FAMILY_LABEL[k]?.[1] ?? k) : groupBy === "month" || groupBy === "year" || isDim ? k : nm(lang, k);
  // Same precision as the chart engine: 2 decimals under 10, 1 under 1,000, whole numbers above.
  const round = (x: number) => (metric === "cpql" || Math.abs(x) >= 1000 ? Math.round(x) : Math.abs(x) >= 10 ? r1(x) : Math.round(x * 100) / 100);
  const values = rows.map((x) => round(x.v));
  const scope = [req.project && nm(lang, req.project), req.channel && T(FAMILY_LABEL[req.channel]?.[0] ?? req.channel, FAMILY_LABEL[req.channel]?.[1] ?? req.channel), req.vendor && nm(lang, req.vendor)].filter(Boolean).join(", ");
  const title = T(`${META[metric].en} by ${GROUP_LABEL[groupBy][0]}${scope ? ` — ${scope}` : ""}`, `${META[metric].ar} حسب ${GROUP_LABEL[groupBy][1]}${scope ? ` — ${scope}` : ""}`);
  if (groupBy === "year" && months.includes(latest) && !latest.endsWith("-12")) notes.push(T(`${latest.slice(0, 4)} covers January to ${latest} only.`, `${latest.slice(0, 4)} يغطي من يناير حتى ${latest} فقط.`));
  if (metric === "sales") notes.push(T("Revenue = contracted sales recorded in the CRM.", "الإيرادات = المبيعات المتعاقد عليها في النظام."));
  if (isDim || metric === "leads") notes.push(T("Lead profiles are a CRM sample.", "ملفات العملاء عينة من النظام."));
  return {
    type, title, metric, unit: lang === "ar" ? META[metric].unit[1] : META[metric].unit[0], groupBy, lang,
    labels: rows.map((x) => label(x.k)), values, total: ADDITIVE.has(metric) ? round(values.reduce((s, x) => s + x, 0)) : null,
    period: periodLabel, note: notes.join(" ") || undefined,
  };
}

/** A short text version of the chart for the chat bubble (and for the AI to comment on). */
/** A plain-language reading of a chart: what it shows, the main takeaway with its numbers, the spread or the trend,
 *  and what it suggests — written from the chart's own values (nothing invented). */
export function chartExplain(s: ChartSpec): string {
  const T = (en: string, ar: string) => tx(s.lang, en, ar);
  const pctUnit = s.unit === "%";
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const fmt = (v: number) => `${r1(v).toLocaleString("en-US")}${pctUnit ? "%" : s.unit ? ` ${s.unit}` : ""}`;
  const lowerBetter = /cost|cpl|cpql|cac|تكلفة/i.test(`${s.metric} ${s.title} ${(s.query as any)?.measures ?? ""}`);
  const series = s.series?.length ? s.series : [{ name: s.title, values: s.values }];
  const timeline = ["month", "quarter", "year", "week"].includes(String(s.groupBy)) || s.type === "line" || s.type === "area" || /month|quarter|year|week/i.test(String((s.query as any)?.x ?? ""));
  const out: string[] = [];
  if (s.type === "scatter" && s.points?.length) {
    const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y), n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), vx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), vy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
    const r = vx && vy ? cov / Math.sqrt(vx * vy) : 0;
    out.push(T(`Each point is one ${s.groupBy}. ${Math.abs(r) < 0.3 ? "There is no clear relationship" : r > 0 ? `The two move together (correlation ${r1(r)})` : `When one rises the other falls (correlation ${r1(r)})`} across ${n} points.`, `كل نقطة تمثل ${s.groupBy}. ${Math.abs(r) < 0.3 ? "لا توجد علاقة واضحة" : r > 0 ? `يتحركان معاً (ارتباط ${r1(r)})` : `عندما يرتفع أحدهما ينخفض الآخر (ارتباط ${r1(r)})`} عبر ${n} نقطة.`));
    return out.join(" ");
  }
  const vals = (series[0].values ?? []).map((v) => v ?? 0);
  if (!vals.length) return "";
  if (timeline) {
    const first = vals[0], last = vals[vals.length - 1], max = Math.max(...vals), min = Math.min(...vals);
    const ch = first ? ((last - first) / Math.abs(first)) * 100 : 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const up = last > first;
    out.push(T(`${s.title} went from ${fmt(first)} in ${s.labels[0]} to ${fmt(last)} in ${s.labels[s.labels.length - 1]}${first ? ` (${ch > 0 ? "+" : ""}${Math.round(ch)}%)` : ""}.`, `${s.title}: من ${fmt(first)} في ${s.labels[0]} إلى ${fmt(last)} في ${s.labels[s.labels.length - 1]}${first ? ` (${ch > 0 ? "+" : ""}${Math.round(ch)}%)` : ""}.`));
    out.push(T(`The peak was ${s.labels[vals.indexOf(max)]} (${fmt(max)}) and the low ${s.labels[vals.indexOf(min)]} (${fmt(min)}); the latest period is ${last >= avg ? "above" : "below"} the average of ${fmt(avg)}.`, `الذروة في ${s.labels[vals.indexOf(max)]} (${fmt(max)}) والأدنى في ${s.labels[vals.indexOf(min)]} (${fmt(min)})؛ والفترة الأخيرة ${last >= avg ? "أعلى" : "أدنى"} من المتوسط البالغ ${fmt(avg)}.`));
    if (vals.length >= 3) { const l3 = vals.slice(-3); const rising = l3[2] > l3[1] && l3[1] > l3[0], falling = l3[2] < l3[1] && l3[1] < l3[0];
      if (rising || falling) out.push(T(`The last three periods are ${rising ? "rising" : "falling"} in a row${(rising !== lowerBetter) ? " — a good sign" : " — worth watching"}.`, `آخر ثلاث فترات ${rising ? "في ارتفاع" : "في انخفاض"} متتالٍ${(rising !== lowerBetter) ? " — مؤشر جيد" : " — يستحق المتابعة"}.`)); }
    void up;
  } else {
    const rows = s.labels.map((l, i) => ({ l, v: vals[i] })).filter((x) => Number.isFinite(x.v));
    const sorted = [...rows].sort((a, b) => b.v - a.v);
    const total = rows.reduce((a, b) => a + b.v, 0);
    const additive = !pctUnit && !/rate|ratio|avg|average|cost per|per sar|نسبة|متوسط/i.test(`${s.title} ${s.unit}`);
    const best = lowerBetter ? sorted[sorted.length - 1] : sorted[0], worst = lowerBetter ? sorted[0] : sorted[sorted.length - 1];
    if (additive && total > 0) {
      const top = sorted[0], share = Math.round((top.v / total) * 100);
      const top3 = Math.round((sorted.slice(0, 3).reduce((a, b) => a + b.v, 0) / total) * 100);
      out.push(T(`${top.l} leads with ${fmt(top.v)} — ${share}% of the ${fmt(total)} total.`, `يتصدر ${top.l} بـ${fmt(top.v)} — ${share}% من الإجمالي البالغ ${fmt(total)}.`));
      if (sorted.length > 3) out.push(T(`The top three make up ${top3}% of it${top3 >= 75 ? ", so results depend on a few names" : ""}.`, `وتمثل الثلاثة الأولى ${top3}% منه${top3 >= 75 ? "، فالنتائج تعتمد على عدد قليل" : ""}.`));
      if (sorted.length > 1) out.push(T(`${sorted[sorted.length - 1].l} is lowest at ${fmt(sorted[sorted.length - 1].v)}.`, `والأدنى ${sorted[sorted.length - 1].l} بـ${fmt(sorted[sorted.length - 1].v)}.`));
    } else if (sorted.length) {
      out.push(T(`${best.l} does best at ${fmt(best.v)}${lowerBetter ? " (lower is better here)" : ""}; ${worst.l} is weakest at ${fmt(worst.v)}${best.v && worst.v ? ` — ${r1(Math.max(best.v, worst.v) / Math.max(0.0001, Math.min(best.v, worst.v)))}× apart` : ""}.`, `الأفضل ${best.l} عند ${fmt(best.v)}${lowerBetter ? " (الأقل أفضل هنا)" : ""}؛ والأضعف ${worst.l} عند ${fmt(worst.v)}${best.v && worst.v ? ` — بفارق ${r1(Math.max(best.v, worst.v) / Math.max(0.0001, Math.min(best.v, worst.v)))} مرة` : ""}.`));
      const avg = rows.reduce((a, b) => a + b.v, 0) / rows.length;
      out.push(T(`The average across the ${rows.length} is ${fmt(avg)}.`, `والمتوسط عبر ${rows.length} هو ${fmt(avg)}.`));
    }
  }
  if (series.length > 1) {
    const sum = (v: (number | null)[]) => v.reduce((a: number, b) => a + (b ?? 0), 0);
    const tops = series.map((x) => ({ n: x.name, t: sum(x.values) })).sort((a, b) => b.t - a.t);
    out.push(T(`Of the ${series.length} series, ${tops[0].n} is largest overall.`, `ومن بين ${series.length} سلاسل، ${tops[0].n} هي الأكبر إجمالاً.`));
  }
  if (lowerBetter && timeline) out.push(T("For cost measures, lower is better.", "في مقاييس التكلفة، الأقل أفضل."));
  return out.join(" ");
}

export function chartSummary(s: ChartSpec): string {
  const T = (en: string, ar: string) => tx(s.lang, en, ar);
  const fmt = (v: number) => `${v.toLocaleString("en-US")}${s.unit === "%" ? "%" : s.unit ? ` ${s.unit}` : ""}`;
  const top = s.labels.map((l, i) => ({ l, v: s.values[i] }));
  const timeline = ["month", "quarter", "year"].includes(String(s.groupBy));
  const lead = timeline ? [] : top.slice(0, 3);
  const vals = (s.series?.[0]?.values ?? s.values).map((v) => v ?? 0);
  const trend = timeline && vals.length >= 2 && (s.series?.length ?? 1) === 1
    ? T(`${s.labels[0]}: ${fmt(vals[0])} → ${s.labels[s.labels.length - 1]}: ${fmt(vals[vals.length - 1])}; highest ${fmt(Math.max(...vals))} (${s.labels[vals.indexOf(Math.max(...vals))]}).\n`, `${s.labels[0]}: ${fmt(vals[0])} ← ${s.labels[s.labels.length - 1]}: ${fmt(vals[vals.length - 1])}؛ الأعلى ${fmt(Math.max(...vals))} (${s.labels[vals.indexOf(Math.max(...vals))]}).\n`) : "";
  return T(`**${s.title}** (${s.period})`, `**${s.title}** (${s.period})`) +
    (s.total !== null ? T(` — total ${fmt(s.total)}`, ` — الإجمالي ${fmt(s.total)}`) : "") + "\n" +
    trend + (lead.length ? lead.map((x) => `- ${x.l}: ${fmt(x.v)}${s.total ? ` (${Math.round((x.v / s.total) * 100)}%)` : ""}`).join("\n") + "\n" : "") +
    (s.note ? `\n${s.note}` : "");
}
