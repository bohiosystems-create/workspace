// What the Campaigns page shows, changed from the assistant's chat: which campaigns (live, past, a year, a project,
// a vendor, a channel), in what order, which figures on each campaign card, which charts in each campaign's dashboard,
// extra charts asked in plain words ("add a chart of qualified leads by month to each campaign"), and whether the
// dashboards open. Stored once (ViewLayout "campaigns"); every change is logged with what it replaced, so it can be
// undone. It only shapes the view: every number still comes from the data.
import { prisma } from "./prisma";
import { type Lang, tx, nm } from "./i18n";
import { FAMILY_LABEL } from "./history";

export const KPIS = ["spend", "budget", "leads", "qualified", "qualRate", "viewings", "reservations", "contracts", "sales", "costToSales", "cpl", "cpql", "cac", "pacing", "benchmark"] as const;
export type KpiId = (typeof KPIS)[number];
export const CHARTS = ["sales", "spend", "leads", "funnel", "benchmark", "pacing"] as const;
export type ChartId = (typeof CHARTS)[number];
export const SORTS = ["recent", "name", "spend", "sales", "contracts", "qualified", "leads", "costToSales", "cpql"] as const;
export type SortId = (typeof SORTS)[number];

export type Custom = { id: string; prompt: string; title: string; query?: unknown };
export type CampaignLayout = {
  scope: "all" | "live" | "past";
  year: string | null; project: string | null; vendor: string | null; channel: string | null;
  sort: SortId; dir: "asc" | "desc";
  kpis: KpiId[]; charts: ChartId[]; custom: Custom[];
  open: "live" | "all" | "none";
};
export const DEFAULT_CAMPAIGN_LAYOUT: CampaignLayout = {
  scope: "all", year: null, project: null, vendor: null, channel: null, sort: "recent", dir: "desc",
  kpis: ["spend", "leads", "qualified", "contracts", "sales", "costToSales"], charts: ["sales", "spend", "funnel", "benchmark"], custom: [], open: "live",
};

const KPI_NAME: Record<KpiId, [string, string]> = {
  spend: ["Spend", "الإنفاق"], budget: ["Budget", "الميزانية"], leads: ["Leads", "العملاء المحتملون"], qualified: ["Qualified leads", "العملاء المؤهلون"],
  qualRate: ["Qualified rate", "نسبة التأهيل"], viewings: ["Viewings", "المعاينات"], reservations: ["Reservations", "الحجوزات"], contracts: ["Contracts", "العقود"],
  sales: ["Sales", "المبيعات"], costToSales: ["Cost to sales", "التكلفة إلى المبيعات"], cpl: ["Cost per lead", "تكلفة العميل المحتمل"], cpql: ["Cost per qualified lead", "تكلفة العميل المؤهل"],
  cac: ["Cost per contract", "تكلفة العقد"], pacing: ["Budget pacing", "وتيرة الإنفاق"], benchmark: ["Channel benchmark", "معيار القناة"],
};
const CHART_NAME: Record<ChartId, [string, string]> = {
  sales: ["Sales by month", "المبيعات حسب الشهر"], spend: ["Spend by month", "الإنفاق حسب الشهر"], leads: ["Leads and qualified by month", "العملاء والمؤهلون حسب الشهر"],
  funnel: ["Lead-to-contract funnel", "مسار العميل حتى العقد"], benchmark: ["Cost to sales vs benchmark", "التكلفة إلى المبيعات مقابل المعيار"], pacing: ["Budget used", "الميزانية المستخدمة"],
};
const SORT_NAME: Record<SortId, [string, string]> = {
  recent: ["most recent", "الأحدث"], name: ["name", "الاسم"], spend: ["spend", "الإنفاق"], sales: ["sales", "المبيعات"], contracts: ["contracts", "العقود"],
  qualified: ["qualified leads", "العملاء المؤهلين"], leads: ["leads", "العملاء المحتملين"], costToSales: ["cost to sales", "التكلفة إلى المبيعات"], cpql: ["cost per qualified lead", "تكلفة العميل المؤهل"],
};
export const kpiName = (k: KpiId, l: Lang) => KPI_NAME[k][l === "ar" ? 1 : 0];
export const chartName = (k: ChartId, l: Lang) => CHART_NAME[k][l === "ar" ? 1 : 0];
export const sortName = (k: SortId, l: Lang) => SORT_NAME[k][l === "ar" ? 1 : 0];
/** "highest first" / "lowest first", or the natural words for dates and names. */
export const dirName = (k: SortId, dir: "asc" | "desc", l: Lang) => k === "recent" ? tx(l, dir === "desc" ? "newest first" : "oldest first", dir === "desc" ? "الأحدث أولاً" : "الأقدم أولاً")
  : k === "name" ? tx(l, dir === "asc" ? "A–Z" : "Z–A", dir === "asc" ? "أبجدياً" : "أبجدياً معكوساً") : tx(l, dir === "asc" ? "lowest first" : "highest first", dir === "asc" ? "الأقل أولاً" : "الأعلى أولاً");

// ------------------------------------------------------------------ storage
const ID = "campaigns";
const only = <T extends string>(xs: unknown, allowed: readonly T[]) => [...new Set((Array.isArray(xs) ? xs : []).filter((x): x is T => (allowed as readonly string[]).includes(x as string)))];
export function cleanLayout(x: any): CampaignLayout {
  const d = DEFAULT_CAMPAIGN_LAYOUT, l = x && typeof x === "object" ? x : {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    scope: ["all", "live", "past"].includes(l.scope) ? l.scope : d.scope,
    year: str(l.year), project: str(l.project), vendor: str(l.vendor), channel: str(l.channel),
    sort: (SORTS as readonly string[]).includes(l.sort) ? l.sort : d.sort, dir: l.dir === "asc" ? "asc" : l.dir === "desc" ? "desc" : d.dir,
    kpis: Array.isArray(l.kpis) ? only(l.kpis, KPIS) : d.kpis, charts: Array.isArray(l.charts) ? only(l.charts, CHARTS) : d.charts,
    custom: (Array.isArray(l.custom) ? l.custom : []).filter((c: any) => c && typeof c.prompt === "string").slice(-4),
    open: ["live", "all", "none"].includes(l.open) ? l.open : d.open,
  };
}
export async function getCampaignLayout(): Promise<CampaignLayout> {
  try { const row = (await prisma.viewLayout.findMany()).find((r: any) => r.id === ID); return cleanLayout(row ? JSON.parse(row.json) : null); }
  catch { return cleanLayout(null); }
}
async function put(next: CampaignLayout, by: string) {
  const data = { json: JSON.stringify(next), updatedBy: by, updatedAt: new Date() };
  if ((await prisma.viewLayout.findMany()).some((r: any) => r.id === ID)) await prisma.viewLayout.update({ where: { id: ID }, data });
  else await prisma.viewLayout.create({ data: { id: ID, ...data } });
}
export async function campaignLayoutHistory(n = 10) {
  const rows = (await prisma.viewLayoutChange.findMany()).filter((r: any) => r.view === ID);
  return rows.sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, n)
    .map((r: any) => ({ id: r.id, at: new Date(r.createdAt).toISOString(), summary: r.summary, source: r.source, undone: !!r.undone }));
}

// ------------------------------------------------------------------ changes
export type Op =
  | { op: "add_kpi" | "remove_kpi"; kpi: KpiId }
  | { op: "add_chart" | "remove_chart"; chart: ChartId }
  | { op: "add_custom"; prompt: string }
  | { op: "remove_custom"; which: string }
  | { op: "scope"; scope: "all" | "live" | "past" }
  | { op: "year"; year: string | null }
  | { op: "filter"; field: "project" | "vendor" | "channel"; value: string | null }
  | { op: "clear_filters" }
  | { op: "sort"; by: SortId; dir?: "asc" | "desc" }
  | { op: "open"; open: "live" | "all" | "none" }
  | { op: "reset" };

type ChartCheck = (prompt: string) => { title: string; query?: unknown } | { error: string };
export function applyCampaignOps(start: CampaignLayout, ops: Op[], lang: Lang, check?: ChartCheck) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const l: CampaignLayout = JSON.parse(JSON.stringify(cleanLayout(start)));
  const done: string[] = [], notes: string[] = [];
  const q = (s: string) => `“${s}”`;
  for (const o of ops) {
    switch (o.op) {
      case "add_kpi": if (l.kpis.includes(o.kpi)) { notes.push(T(`${q(kpiName(o.kpi, lang))} is already on the cards.`, `${q(kpiName(o.kpi, lang))} موجود بالفعل.`)); break; }
        l.kpis.push(o.kpi); done.push(T(`added ${q(kpiName(o.kpi, lang))} to every campaign`, `أُضيف ${q(kpiName(o.kpi, lang))} لكل حملة`)); break;
      case "remove_kpi": if (!l.kpis.includes(o.kpi)) { notes.push(T(`${q(kpiName(o.kpi, lang))} isn't on the cards.`, `${q(kpiName(o.kpi, lang))} غير معروض.`)); break; }
        l.kpis = l.kpis.filter((k) => k !== o.kpi); done.push(T(`removed ${q(kpiName(o.kpi, lang))}`, `أُزيل ${q(kpiName(o.kpi, lang))}`)); break;
      case "add_chart": if (l.charts.includes(o.chart)) { notes.push(T(`The ${q(chartName(o.chart, lang))} chart is already there.`, `رسم ${q(chartName(o.chart, lang))} موجود بالفعل.`)); break; }
        l.charts.push(o.chart); done.push(T(`added the ${q(chartName(o.chart, lang))} chart to each dashboard`, `أُضيف رسم ${q(chartName(o.chart, lang))} لكل لوحة`)); break;
      case "remove_chart": if (!l.charts.includes(o.chart)) { notes.push(T(`The ${q(chartName(o.chart, lang))} chart isn't shown.`, `رسم ${q(chartName(o.chart, lang))} غير معروض.`)); break; }
        l.charts = l.charts.filter((c) => c !== o.chart); done.push(T(`removed the ${q(chartName(o.chart, lang))} chart`, `أُزيل رسم ${q(chartName(o.chart, lang))}`)); break;
      case "add_custom": {
        if (l.custom.length >= 4) { notes.push(T("Each dashboard holds up to 4 added charts — remove one first.", "تتسع كل لوحة لأربعة رسوم مضافة — أزيلوا واحداً أولاً.")); break; }
        const v = check ? check(o.prompt) : { title: o.prompt };
        if ("error" in v) { notes.push(T(`I couldn't draw that per campaign: ${v.error}`, `تعذّر رسم ذلك لكل حملة: ${v.error}`)); break; }
        l.custom.push({ id: `c${Date.now().toString(36)}${l.custom.length}`, prompt: o.prompt, title: v.title, ...(v.query ? { query: v.query } : {}) });
        done.push(T(`added ${q(v.title)} to each campaign's dashboard`, `أُضيف ${q(v.title)} إلى لوحة كل حملة`)); break;
      }
      case "remove_custom": {
        const w = o.which.toLowerCase();
        const hit = w === "all" ? l.custom : w === "last" ? l.custom.slice(-1) : l.custom.filter((c) => c.title.toLowerCase().includes(w) || c.prompt.toLowerCase().includes(w));
        if (!hit.length) { notes.push(T("No added chart matches that.", "لا يوجد رسم مضاف يطابق ذلك.")); break; }
        l.custom = l.custom.filter((c) => !hit.includes(c)); done.push(T(`removed ${hit.map((c) => q(c.title)).join(", ")}`, `أُزيل ${hit.map((c) => q(c.title)).join("، ")}`)); break;
      }
      case "scope": if (l.scope === o.scope && !l.year) { notes.push(T("That's already the list.", "هذه هي القائمة بالفعل.")); break; }
        l.scope = o.scope; if (o.scope !== "past") l.year = null;
        done.push(o.scope === "live" ? T("showing live campaigns only", "عرض الحملات الحالية فقط") : o.scope === "past" ? T("showing past campaigns (2023–2025) only", "عرض الحملات السابقة (2023–2025) فقط") : T("showing all campaigns", "عرض كل الحملات")); break;
      case "year": l.year = o.year; if (o.year) l.scope = o.year === "2026" ? "live" : "past";
        done.push(o.year ? T(`showing ${o.year} campaigns`, `عرض حملات ${o.year}`) : T("all years", "كل السنوات")); break;
      case "filter": (l as any)[o.field] = o.value;
        done.push(o.value ? T(`only ${o.value}`, `${o.value} فقط`) : T(`any ${o.field}`, `أي ${o.field === "project" ? "مشروع" : o.field === "vendor" ? "مورد" : "قناة"}`)); break;
      case "clear_filters": l.project = l.vendor = l.channel = l.year = null; l.scope = "all"; done.push(T("all campaigns, no filters", "كل الحملات دون تصفية")); break;
      case "sort": {
        const dir = o.dir ?? (["costToSales", "cpql", "name"].includes(o.by) ? "asc" : "desc");
        l.sort = o.by; l.dir = dir;
        done.push(T(`sorted by ${sortName(o.by, lang)} (${dirName(o.by, dir, lang)})`, `مرتبة حسب ${sortName(o.by, lang)} (${dirName(o.by, dir, lang)})`)); break;
      }
      case "open": l.open = o.open; done.push(o.open === "all" ? T("all dashboards open", "كل اللوحات مفتوحة") : o.open === "none" ? T("dashboards closed (open one by clicking it)", "اللوحات مغلقة (افتحوا أياً منها بالنقر)") : T("live campaigns' dashboards open", "لوحات الحملات الحالية مفتوحة")); break;
      case "reset": Object.assign(l, JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_LAYOUT))); done.push(T("back to the standard campaign dashboards", "عادت لوحات الحملات إلى شكلها القياسي")); break;
    }
  }
  return { layout: cleanLayout(l), done, notes };
}

export async function changeCampaignLayout(ops: Op[], lang: Lang, opts: { source?: string; check?: ChartCheck } = {}) {
  const before = await getCampaignLayout();
  const r = applyCampaignOps(before, ops, lang, opts.check);
  if (r.done.length) {
    await put(r.layout, opts.source ?? "chat");
    await prisma.viewLayoutChange.create({ data: { view: ID, summary: r.done.join(" · "), before: JSON.stringify(before), after: JSON.stringify(r.layout), source: opts.source ?? "chat", undone: false, createdAt: new Date() } });
  }
  return r;
}
export async function undoCampaignLayout(lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const last = (await prisma.viewLayoutChange.findMany()).filter((r: any) => r.view === ID && !r.undone).sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!last) return { ok: false, message: T("There is no campaign dashboard change to undo.", "لا يوجد تعديل على لوحات الحملات للتراجع عنه.") };
  await put(cleanLayout(JSON.parse(last.before)), "undo");
  await prisma.viewLayoutChange.update({ where: { id: last.id }, data: { undone: true } });
  return { ok: true, message: T(`Undone: ${last.summary}.`, `تم التراجع عن: ${last.summary}.`) };
}

/** A plain description of the layout (chat card, page bar). */
export function campaignLayoutView(l: CampaignLayout, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  return {
    scope: l.scope, year: l.year, project: l.project, vendor: l.vendor, channel: l.channel, sort: l.sort, dir: l.dir, open: l.open,
    scopeLabel: l.year ? T(`${l.year} campaigns`, `حملات ${l.year}`) : l.scope === "live" ? T("Live campaigns", "الحملات الحالية") : l.scope === "past" ? T("Past campaigns (2023–2025)", "الحملات السابقة (2023–2025)") : T("All campaigns", "كل الحملات"),
    sortLabel: l.sort === "recent" ? dirName("recent", l.dir, lang) : T(`by ${sortName(l.sort, lang)}, ${dirName(l.sort, l.dir, lang)}`, `حسب ${sortName(l.sort, lang)}، ${dirName(l.sort, l.dir, lang)}`),
    filters: [l.project && nm(lang, l.project), l.vendor && nm(lang, l.vendor), l.channel && tx(lang, ...(FAMILY_LABEL[l.channel] ?? [l.channel, l.channel]))].filter(Boolean) as string[],
    kpis: l.kpis.map((k) => ({ id: k, name: kpiName(k, lang) })), charts: l.charts.map((c) => ({ id: c, name: chartName(c, lang) })), custom: l.custom.map((c) => ({ id: c.id, title: c.title })),
    custom_: JSON.stringify(l) !== JSON.stringify(DEFAULT_CAMPAIGN_LAYOUT),
  };
}
export type CampaignLayoutView = ReturnType<typeof campaignLayoutView>;

// ------------------------------------------------------------------ reading a chat message
const KPI_RX: [KpiId, RegExp][] = [
  ["costToSales", /cost.?to.?sales|التكلفة إلى المبيعات/i], ["cpql", /\bcpql\b|cost per qualified|تكلفة العميل المؤهل/i], ["cpl", /\bcpl\b|cost per lead|تكلفة العميل المحتمل/i],
  ["cac", /\bcac\b|cost per (contract|sale|deal)|تكلفة العقد/i], ["qualRate", /qualif(ied|ication) rate|qual(ified)? ?%|نسبة التأهيل/i], ["pacing", /pacing|وتيرة/i], ["benchmark", /benchmark|معيار/i],
  ["budget", /budget|ميزانية/i], ["reservations", /reservations?|bookings?|حجوزات/i], ["viewings", /viewings?|site visits?|معاينات/i],
  ["qualified", /qualified( leads)?|مؤهل/i], ["leads", /\bleads?\b|عملاء محتملين|العملاء المحتملين/i], ["contracts", /contracts?|deals?|عقود/i], ["sales", /\bsales\b|revenue|مبيعات|إيرادات/i], ["spend", /spend|spent|إنفاق/i],
];
const CHART_RX: [ChartId, RegExp][] = [
  ["funnel", /funnel|مسار العميل/i], ["benchmark", /benchmark|vs (the )?(channel|average)|معيار/i], ["pacing", /pacing|budget used|gauge|الميزانية المستخدمة/i],
];
const RX_CTX = /dashboards?|campaigns? page|campaign (list|cards?|tiles?|view)|campaigns? (list|cards?)|لوحات? الحملات|لوحة|صفحة الحملات|بطاقات الحملات/i;
// "each campaign" alone is usually a question ("show spend for each campaign"); it's a layout change only with add/remove.
const RX_EACH = /each campaign|every campaign|per campaign|لكل حملة|كل حملة/i;
const RX_EDIT_VERB = /\b(add|remove|hide|drop|include|put|delete)\b|أضف|اضف|أزل|ازل|احذف/i;
const RX_HIDE = /\b(remove|hide|drop|delete|take (out|off)|don'?t show|do not show|without|stop showing)\b|احذف|أزل|ازل|أخف|اخف|بدون|لا تعرض/i;
const RX_ADD = /\b(add|include|show|put|bring back|display|also)\b|أضف|اضف|أظهر|اعرض|ضمّن/i;
const RX_CHARTWORD = /\b(chart|graph|plot|pie|donut|bars?|line|trend)\b|رسم|مخطط/i;

export type Parsed = { kind: "edit"; ops: Op[] } | { kind: "undo" } | { kind: "view" } | { kind: "unclear" };
/** Read a chat message as a change to the campaign dashboards; null when it isn't one. `find` resolves names. */
export function parseCampaignEdit(text: string, find: (s: string) => { project?: string; vendor?: string; channel?: string }): Parsed | null {
  const raw = text.trim(), q = raw.toLowerCase();
  const sortish = /^(please )?(sort|order|rank|re-?order)\b.*\bcampaigns?\b|\bcampaigns?\b.*\b(sorted|ordered|ranked) by\b|رتّب الحملات|رتب الحملات/i.test(q);
  if (!RX_CTX.test(q) && !sortish && !(RX_EACH.test(q) && RX_EDIT_VERB.test(q) && !/^(what|how|which|who|why|show me)\b|^(ما|كيف|أي|من|لماذا)\s/.test(q))) return null;
  if (/^(what|how|which|who|why|is|are|did|does)\b/.test(q) && !/what('?s| is) (on|in) the (campaign )?dashboards?|what do the (campaign )?dashboards show/.test(q) && !RX_EDIT_VERB.test(q)) return null;
  if (/\breport\b|التقرير/.test(q)) return null; // the daily report has its own editor
  if (/\b(all|every) (the )?(dashboards|pages)\b|everywhere|كل اللوحات|جميع اللوحات/.test(q)) return null; // every page: lib/view-blocks.ts
  if (/\b(undo|revert|roll ?back)\b|تراجع/.test(q)) return { kind: "undo" };
  if (/\breset\b|back to (the )?(default|standard)|default (layout|view)|الافتراضي|القياسي/.test(q)) return { kind: "edit", ops: [{ op: "reset" }] };
  if (/what('?s| is) (on|in) the (campaign )?dashboards?|what do the (campaign )?dashboards show|campaign dashboards? (layout|settings)|ما الذي تعرضه لوحات الحملات|ماذا تعرض لوحات/.test(q)) return { kind: "view" };
  const ops: Op[] = [];
  for (const cl of raw.split(/\s*(?:[;,]|\bthen\b|\band\b(?=\s+(?:add|remove|hide|show|sort|order|only|open|collapse|expand|drop))|،|\s+ثم\s+)\s*/i).filter(Boolean)) {
    const c = cl.toLowerCase();
    // order
    if (/\b(sort|order|rank|sorted|ordered|ranked)\b|رتّب|رتب|ترتيب/.test(c)) {
      const by: SortId | undefined = /cost.?to.?sales|التكلفة إلى المبيعات/.test(c) ? "costToSales" : /cpql|cost per qualified/.test(c) ? "cpql" : /qualified|مؤهل/.test(c) ? "qualified"
        : /contracts?|deals?|عقود/.test(c) ? "contracts" : /\bsales|revenue|مبيعات/.test(c) ? "sales" : /spend|spent|إنفاق/.test(c) ? "spend" : /\bleads?\b/.test(c) ? "leads" : /name|alphabet|الاسم/.test(c) ? "name" : /recent|latest|newest|date|الأحدث/.test(c) ? "recent" : undefined;
      if (by) { const dir = /\b(asc|ascending|lowest|smallest|cheapest|best first|worst last)\b|الأقل/.test(c) ? "asc" : /\b(desc|descending|highest|biggest|largest|most)\b|الأعلى|الأكثر/.test(c) ? "desc" : undefined; ops.push({ op: "sort", by, ...(dir ? { dir } : {}) }); continue; }
    }
    // open / close dashboards
    if (/\b(expand|open) (all|every)|all dashboards open|افتح كل/.test(c)) { ops.push({ op: "open", open: "all" }); continue; }
    if (/\b(collapse|close)\b.*dashboards?|أغلق اللوحات/.test(c)) { ops.push({ op: "open", open: "none" }); continue; }
    // which campaigns
    if (/\b(clear|remove|reset) (the )?filters?\b|all campaigns|every campaign\b(?! dashboard)|كل الحملات/.test(c) && !RX_CHARTWORD.test(c)) { ops.push({ op: "clear_filters" }); continue; }
    const yr = c.match(/\b(2023|2024|2025|2026)\b/)?.[1];
    if (yr && !RX_CHARTWORD.test(c)) { ops.push({ op: "year", year: yr }); continue; }
    if (/\b(only|just) (show )?(the )?(live|running|current|active)\b|(live|running|current|active) campaigns only|الحالية فقط|الجارية فقط/.test(c)) { ops.push({ op: "scope", scope: "live" }); continue; }
    if (/\b(only|just) (show )?(the )?(past|previous|old|ended|historical)\b|(past|previous) campaigns only|السابقة فقط/.test(c)) { ops.push({ op: "scope", scope: "past" }); continue; }
    const ent = find(cl);
    if ((ent.project || ent.vendor || ent.channel) && /\b(only|just|filter|show)\b|فقط|صفّ/.test(c) && !RX_CHARTWORD.test(c)) {
      if (ent.project) ops.push({ op: "filter", field: "project", value: ent.project });
      else if (ent.vendor) ops.push({ op: "filter", field: "vendor", value: ent.vendor });
      else if (ent.channel) ops.push({ op: "filter", field: "channel", value: ent.channel });
      continue;
    }
    const hide = RX_HIDE.test(c), add = !hide && RX_ADD.test(c);
    // built-in charts first, then added charts, then figures
    const ch = CHART_RX.find(([, rx]) => rx.test(c))?.[0] ?? (RX_CHARTWORD.test(c) ? (/^(.*\b)?(sales|revenue|مبيعات)\b.*(by month|monthly|شهر)/.test(c) && !/\bby (vendor|channel|project|city)/.test(c) ? "sales" : /^(.*\b)?(spend|spent|إنفاق)\b.*(by month|monthly|شهر)/.test(c) ? "spend" : /^(.*\b)?leads\b.*(by month|monthly|شهر)/.test(c) && !/qualified/.test(c) ? "leads" : undefined) : undefined);
    if (ch && (hide || add)) { ops.push({ op: hide ? "remove_chart" : "add_chart", chart: ch }); continue; }
    if (RX_CHARTWORD.test(c) && hide && /\b(added|custom|my|last|that|those)\b|المضاف|الأخير/.test(c)) { ops.push({ op: "remove_custom", which: /\b(all|those)\b|كل/.test(c) ? "all" : "last" }); continue; }
    if (RX_CHARTWORD.test(c) && add) {
      const prompt = cl.replace(/\b(please|can you|could you|also)\b/gi, "").replace(/\b(to|on|in|for) (each|every|the|all)? ?(campaign'?s? )?(dashboards?|campaigns? page|campaign cards?|campaigns?)\b.*$/i, "").replace(/(إلى|في|لكل) (لوحات?|حملة).*$/, "").replace(/^\s*(add|include|put|show|display|أضف|اضف|اعرض)\s+/i, "").trim();
      ops.push({ op: "add_custom", prompt }); continue;
    }
    const kpis = KPI_RX.filter(([, rx]) => rx.test(c)).map(([k]) => k);
    const first = kpis[0];
    // "cost per qualified lead" is one figure, not three: drop the words that are part of a ratio already matched.
    const partOf: Record<string, KpiId[]> = { qualified: ["qualRate", "cpql"], leads: ["cpl", "cpql", "qualified", "qualRate"], sales: ["costToSales", "cac"], spend: ["costToSales"], contracts: ["cac"], budget: ["pacing"] };
    if (first && (hide || add)) { for (const k of kpis.filter((k, i) => i === 0 || !(partOf[k] ?? []).some((r) => kpis.includes(r)))) ops.push({ op: hide ? "remove_kpi" : "add_kpi", kpi: k }); continue; }
  }
  if (ops.length) return { kind: "edit", ops };
  if (RX_HIDE.test(q) || RX_ADD.test(q) || /\b(change|edit|customi[sz]e|update)\b|عدّل|غيّر/.test(q)) return { kind: "unclear" };
  return null;
}

export const campaignLayoutHelp = (l: Lang) => tx(l,
  "You can change the Campaigns page from here, for example:\n- \"add cost per qualified lead to the campaign dashboards\" / \"remove budget from the campaign cards\"\n- \"remove the funnel from the campaign dashboards\" / \"add the pacing gauge to each campaign\"\n- \"add a chart of qualified leads by month to each campaign dashboard\"\n- \"show only live campaigns\" / \"show 2024 campaigns on the campaigns page\" / \"only Andalus Quarter campaigns on the dashboards\"\n- \"sort campaigns by cost to sales\" / \"sort campaigns by sales, highest first\"\n- \"expand all campaign dashboards\", \"what's on the campaign dashboards?\", \"undo the last campaign dashboard change\", \"reset the campaign dashboards\"",
  "يمكنكم تعديل صفحة الحملات من هنا، مثلاً:\n- «أضف تكلفة العميل المؤهل إلى لوحات الحملات» / «أزل الميزانية من بطاقات الحملات»\n- «أزل مسار العميل من لوحات الحملات» / «أضف وتيرة الإنفاق لكل حملة»\n- «أضف رسماً للعملاء المؤهلين حسب الشهر لكل لوحة حملة»\n- «اعرض الحملات الحالية فقط» / «اعرض حملات 2024 في صفحة الحملات»\n- «رتّب الحملات حسب التكلفة إلى المبيعات»\n- «ما الذي تعرضه لوحات الحملات؟»، «تراجع عن آخر تعديل على لوحات الحملات»، «أعد ضبط لوحات الحملات إلى الافتراضي»");

// ------------------------------------------------------------------ Campaigns page API (also used by the demo)
export async function campaignLayoutAction(b: any) {
  const lang: Lang = b?.lang === "ar" ? "ar" : "en";
  if (b?.action === "UNDO") return { message: (await undoCampaignLayout(lang)).message };
  if (b?.action === "OPS") { // the page's own chips: which campaigns, the order, open/closed
    const ops = (Array.isArray(b.ops) ? b.ops : []).filter((o: any) => ["scope", "year", "sort", "open", "clear_filters", "filter"].includes(o?.op));
    const r = await changeCampaignLayout(ops, lang, { source: "campaigns page" }); return { message: r.done.join("; ") || null };
  }
  if (b?.action === "RESET") { const r = await changeCampaignLayout([{ op: "reset" }], lang, { source: "campaigns page" }); return { message: r.done.join("; ") || null }; }
  throw new Error("Unknown action.");
}
