// The Campaigns page: every campaign that has run — the live 2026 campaigns (verified: Oracle cost, CRM leads and
// sales) and the 2023–2025 history — each with its own dashboard. What is listed, in what order, and what each
// dashboard shows come from the layout the user changes from the chat (lib/campaign-layout.ts). Read-only.
import { buildAgent } from "./agent";
import { historyState, familyOf, FAMILY_LABEL, SEASON_LABEL } from "./history";
import { prisma } from "./prisma";
import { type Lang, tx, nm } from "./i18n";
import type { QueryCtx } from "./query";
import { getCampaignLayout, campaignLayoutView, type CampaignLayout } from "./campaign-layout";
import type { ChartSpec } from "./charts";

const r1 = (x: number) => Math.round(x * 10) / 10;
const per = (num: number, den: number, k = 1) => (den > 0 ? Math.round((num * k) / den) : null);

export type BoardMonth = { month: string; spendK: number; leads: number; qualified: number; contracts: number; salesM: number };
export type CampaignBoard = {
  key: string; id: string | null; code: string; name: string; status: "live" | "paused" | "ended" | "past";
  vendor: string; vendorKey: string; project: string; projectKey: string; channel: string; family: string; season: string | null;
  start: string; end: string; year: string; health: string | null; lesson: string | null;
  k: {
    spendK: number; budgetK: number; leads: number; qualified: number; qualRate: number | null; viewings: number | null; reservations: number | null;
    contracts: number; salesM: number; costToSales: number | null; cpl: number | null; cpql: number | null; cacK: number | null; pacing: number | null; usedPct: number | null;
    benchmark: number | null; benchmarkLabel: string;
  };
  months: BoardMonth[];
  funnel: { stage: string; value: number }[];
  custom: { id: string; title: string; chart: ChartSpec | null; error?: string }[];
};

/** Live and past campaigns as dashboards, filtered and ordered by the layout. */
export async function campaignBoards(lang: Lang, opts: { layout?: CampaignLayout; ctx?: () => Promise<QueryCtx> } = {}) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const layout = opts.layout ?? (await getCampaignLayout());
  const [agent, history, dbCampaigns] = await Promise.all([buildAgent(lang), historyState(lang), prisma.campaign.findMany()]);
  const famBench = new Map(history.byFamily.map((f) => [f.key, f]));
  const famLabel = (f: string) => tx(lang, ...(FAMILY_LABEL[f] ?? [f, f]));
  const stage = (en: string, ar: string) => T(en, ar);

  const live: CampaignBoard[] = agent.unified.campaigns.map((u) => {
    const m = agent.mkt.campaigns.find((x) => x.id === u.id)!;
    const db: any = dbCampaigns.find((x: any) => x.id === u.id);
    const fam = familyOf(u.channel), b = famBench.get(fam);
    const months = [...u.months].sort((a, z) => a.month.localeCompare(z.month)).map((mo) => ({ month: mo.month, spendK: r1(mo.costK), leads: mo.leads, qualified: mo.qualified, contracts: mo.won, salesM: r1(mo.salesM) }));
    const v = u.verified, viewings = u.months.reduce((t, mo) => t + mo.viewings, 0), reservations = u.months.reduce((t, mo) => t + mo.reservations, 0);
    const start = db?.startDate ? new Date(db.startDate).toISOString().slice(0, 7) : months[0]?.month ?? "";
    const end = db?.endDate ? new Date(db.endDate).toISOString().slice(0, 7) : months[months.length - 1]?.month ?? "";
    return {
      key: u.id, id: u.id, code: u.code ?? u.id, name: nm(lang, u.name), status: m.status === "LIVE" ? "live" : m.status === "PAUSED" ? "paused" : "ended",
      vendor: nm(lang, u.vendor), vendorKey: u.vendor, project: nm(lang, m.asset), projectKey: m.asset, channel: famLabel(fam), family: fam, season: null,
      start, end, year: start.slice(0, 4), health: m.health, lesson: null,
      k: {
        spendK: r1(v.costK), budgetK: u.budgetK, leads: v.leads, qualified: v.qualified, qualRate: v.leads ? r1((v.qualified / v.leads) * 100) : null, viewings, reservations,
        contracts: v.won, salesM: r1(v.salesM), costToSales: v.salesM > 0 ? r1((v.costK / (v.salesM * 1000)) * 100) : null,
        cpl: per(v.costK * 1000, v.leads), cpql: per(v.costK * 1000, v.qualified), cacK: v.won ? r1(v.costK / v.won) : null,
        pacing: m.pacingPct, usedPct: u.budgetK ? r1((v.costK / u.budgetK) * 100) : null, benchmark: b?.costToSalesPct ?? null, benchmarkLabel: famLabel(fam),
      },
      months,
      funnel: [{ stage: stage("Leads", "عملاء محتملون"), value: v.leads }, { stage: stage("Qualified", "مؤهلون"), value: v.qualified }, { stage: stage("Viewings", "معاينات"), value: viewings }, { stage: stage("Reservations", "حجوزات"), value: reservations }, { stage: stage("Contracts", "عقود"), value: v.won }],
      custom: [],
    };
  });

  const past: CampaignBoard[] = history.rows.map((r) => {
    const b = famBench.get(r.family);
    return {
      key: r.code, id: null, code: r.code, name: r.name, status: "past",
      vendor: r.vendor, vendorKey: r.vendorKey, project: r.project, projectKey: r.projectKey, channel: famLabel(r.family), family: r.family, season: r.seasonLabel,
      start: r.start, end: r.end, year: r.year, health: null, lesson: r.lesson,
      k: {
        spendK: r.spendK, budgetK: r.budgetK, leads: r.leads, qualified: r.qualified, qualRate: r.qualPct, viewings: null, reservations: null,
        contracts: r.contracts, salesM: r.salesM, costToSales: r.costToSalesPct, cpl: r.cplSAR, cpql: r.cpqlSAR, cacK: r.contracts ? r1(r.spendK / r.contracts) : null,
        pacing: null, usedPct: r.budgetK ? r1((r.spendK / r.budgetK) * 100) : null, benchmark: b?.costToSalesPct ?? null, benchmarkLabel: famLabel(r.family),
      },
      months: (r.months as any[]).map((mo) => ({ month: mo.month, spendK: r1(mo.spendK), leads: mo.leads ?? 0, qualified: mo.qualified, contracts: mo.contracts, salesM: r1(mo.salesM) })),
      funnel: [{ stage: stage("Leads", "عملاء محتملون"), value: r.leads }, { stage: stage("Qualified", "مؤهلون"), value: r.qualified }, { stage: stage("Contracts", "عقود"), value: r.contracts }],
      custom: [],
    };
  });

  // Which campaigns.
  const lc = (s: string | null) => (s ?? "").toLowerCase();
  let list = [...live, ...past].filter((c) =>
    (layout.scope === "all" || (layout.scope === "live" ? c.status !== "past" : c.status === "past")) &&
    (!layout.year || c.year === layout.year || c.end.slice(0, 4) === layout.year) &&
    (!layout.project || lc(c.projectKey) === lc(layout.project)) &&
    (!layout.vendor || lc(c.vendorKey) === lc(layout.vendor)) &&
    (!layout.channel || c.family === layout.channel));

  // In what order (missing values last).
  const val = (c: CampaignBoard): number | string | null => ({
    recent: c.start, name: c.name, spend: c.k.spendK, sales: c.k.salesM, contracts: c.k.contracts, qualified: c.k.qualified, leads: c.k.leads, costToSales: c.k.costToSales, cpql: c.k.cpql,
  } as Record<string, number | string | null>)[layout.sort];
  const sign = layout.dir === "asc" ? 1 : -1;
  list = list.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const d = typeof x === "string" ? x.localeCompare(String(y), lang) : x - (y as number);
    return d * sign || (a.status === "past" ? 1 : 0) - (b.status === "past" ? 1 : 0);
  });

  // Charts added from the chat, drawn per campaign.
  if (layout.custom.length && list.length) {
    const c = await (opts.ctx ? opts.ctx() : (async () => (await import("./chat")).buildChatContext(lang).then((x) => x.q))());
    const { runChartQuery } = await import("./chart-query");
    for (const board of list) {
      board.custom = layout.custom.map((cu) => {
        let q: any = cu.query ? { ...(cu.query as any) } : null;
        if (!q?.dataset) { const r = campaignChartFromText(cu.prompt, lang); if ("error" in r) return { id: cu.id, title: cu.title, chart: null, error: r.error }; q = { ...r.query }; }
        delete q.period; delete q.from; delete q.to;
        const field = q.dataset === "campaigns" ? { field: "code", value: board.code } : { field: "campaign", value: board.status === "past" ? history.rows.find((r) => r.code === board.code)?.name ?? board.name : agent.unified.campaigns.find((u) => u.id === board.id)?.name ?? board.name };
        q.filters = [...((q.filters as any[]) ?? []).filter((f) => f.field !== "code" && f.field !== "campaign"), { ...field, op: "=" }];
        const spec = runChartQuery({ ...q, title: cu.title }, c, lang);
        return "error" in spec ? { id: cu.id, title: cu.title, chart: null, error: spec.error } : { id: cu.id, title: cu.title, chart: spec };
      });
    }
  }

  const sum = (f: (c: CampaignBoard) => number) => r1(list.reduce((t, c) => t + f(c), 0));
  const totals = { campaigns: list.length, live: list.filter((c) => c.status !== "past").length, spendK: sum((c) => c.k.spendK), leads: sum((c) => c.k.leads), qualified: sum((c) => c.k.qualified), contracts: sum((c) => c.k.contracts), salesM: sum((c) => c.k.salesM) };
  const costToSales = totals.salesM > 0 ? r1((totals.spendK / (totals.salesM * 1000)) * 100) : null;
  const options = {
    years: [...new Set([...live, ...past].map((c) => c.year))].sort().reverse(),
    seasons: Object.keys(SEASON_LABEL),
  };
  return { asOf: agent.mkt.asOf, layout, view: campaignLayoutView(layout, lang), totals: { ...totals, costToSales }, campaigns: list, options, filterLabels: filterLabels(layout, lang) };
}
export type CampaignBoards = Awaited<ReturnType<typeof campaignBoards>>;

function filterLabels(l: CampaignLayout, lang: Lang) {
  return [l.project && nm(lang, l.project), l.vendor && nm(lang, l.vendor), l.channel && tx(lang, ...(FAMILY_LABEL[l.channel] ?? [l.channel, l.channel]))].filter(Boolean) as string[];
}

// ------------------------------------------------------------------ charts asked for "each campaign"
const LEAD_DIMS: [string, RegExp, [string, string]][] = [
  ["city", /\bcity|cities|مدين/i, ["city", "المدينة"]], ["nationality", /nationalit|جنسي/i, ["nationality", "الجنسية"]], ["buyerType", /buyer type|investor|end.?user|نوع المشتري|مستثمر/i, ["buyer type", "نوع المشتري"]],
  ["budgetBand", /budget band|price band|budget range|شريحة الميزانية/i, ["budget band", "شريحة الميزانية"]], ["unitType", /unit type|bedroom|apartment|villa|نوع الوحدة/i, ["unit type", "نوع الوحدة"]],
  ["ageBand", /\bage|عمر|الأعمار/i, ["age", "العمر"]], ["lostReason", /lost reason|why .*lost|reasons? lost|أسباب الخسارة/i, ["lost reason", "سبب الخسارة"]],
  ["stage", /\bstage|pipeline|مرحلة/i, ["stage", "المرحلة"]], ["responseBand", /response time|first response|زمن الاستجابة/i, ["response time", "زمن الاستجابة"]],
];
const MEASURES: [string, RegExp, [string, string], string][] = [
  ["cost_to_sales", /cost.?to.?sales|التكلفة إلى المبيعات/i, ["cost to sales", "التكلفة إلى المبيعات"], "%"], ["cpql", /cpql|cost per qualified|تكلفة العميل المؤهل/i, ["cost per qualified lead", "تكلفة العميل المؤهل"], "SAR"],
  ["cpl", /\bcpl\b|cost per lead|تكلفة العميل المحتمل/i, ["cost per lead", "تكلفة العميل المحتمل"], "SAR"], ["qual_rate", /qualif\w* rate|نسبة التأهيل/i, ["qualified rate", "نسبة التأهيل"], "%"],
  ["ctr", /\bctr\b|click.?through/i, ["click-through rate", "نسبة النقر"], "%"], ["sum(impressions)", /impressions|مشاهدات|ظهور/i, ["impressions", "مرات الظهور"], "K"], ["sum(clicks)", /clicks|نقرات/i, ["clicks", "النقرات"], ""],
  ["sum(reported_leads)", /(vendor.?)?reported leads|vendor.?reported/i, ["vendor-reported leads", "العملاء حسب المورد"], ""],
  ["sum(viewings)", /viewings?|معاينات/i, ["viewings", "المعاينات"], ""], ["sum(reservations)", /reservations?|حجوزات/i, ["reservations", "الحجوزات"], ""],
  ["sum(qualified)", /qualified( leads?)?|(العملاء )?المؤهل\S*|مؤهل\S*/i, ["qualified leads", "العملاء المؤهلون"], ""], ["sum(leads)", /\bleads?\b|عملاء/i, ["leads", "العملاء المحتملون"], ""],
  ["sum(contracts)", /contracts?|deals?|عقود/i, ["contracts", "العقود"], ""], ["sum(sales)", /\bsales|revenue|مبيعات/i, ["sales", "المبيعات"], "SAR M"], ["sum(spend)", /spend|spent|cost|إنفاق|تكلفة/i, ["spend", "الإنفاق"], "SAR K"],
];

/** Turn "qualified leads by month" / "leads by city" into a chart query that can be drawn for one campaign. */
export function campaignChartFromText(prompt: string, lang: Lang): { title: string; query: any } | { error: string } {
  const T = (en: string, ar: string) => tx(lang, en, ar), q = prompt.toLowerCase();
  const dim = LEAD_DIMS.find(([, rx]) => rx.test(q));
  if (dim) {
    const won = /\b(won|contracts?|sales)\b|عقود|مبيعات/.test(q), qual = /qualified|مؤهل/.test(q);
    const measure = won ? "sum(won)" : qual ? "sum(qualified)" : "sum(leads)";
    const what = won ? T("Contracts", "العقود") : qual ? T("Qualified leads", "العملاء المؤهلون") : T("Leads", "العملاء المحتملون");
    const type = /\bpie\b|دائري/.test(q) ? "pie" : /donut|حلقي/.test(q) ? "donut" : "hbar";
    return { title: T(`${what} by ${dim[2][0]}`, `${what} حسب ${dim[2][1]}`), query: { dataset: "leads", type, x: dim[0], measures: [measure], sort: dim[0] === "stage" ? "none" : "value_desc", limit: 8 } };
  }
  const found: typeof MEASURES = [];
  let rest = q;
  for (const m of MEASURES) if (m[1].test(rest)) { found.push(m); rest = rest.replace(m[1], " "); }
  if (!found.length) return { error: T("say what to chart per campaign — e.g. qualified leads, cost per lead, viewings, contracts or leads by city", "حددوا ما يُرسم لكل حملة — مثل العملاء المؤهلين أو تكلفة العميل أو المعاينات أو العقود أو العملاء حسب المدينة") };
  const ms = found.slice(0, 3), x = /quarter|ربع/.test(q) ? "quarter" : "month";
  const ratio = ms.some((m) => !m[0].startsWith("sum("));
  const type = /\bline|trend|over time|خط|تطور/.test(q) || ratio ? "line" : ms.length > 1 ? "grouped" : /\barea\b|مساحة/.test(q) ? "area" : "bar";
  const name = ms.map((m) => m[2][lang === "ar" ? 1 : 0]).join(T(" and ", " و"));
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return { title: T(`${cap} by ${x}`, `${name} حسب ${x === "month" ? "الشهر" : "الربع"}`), query: { dataset: "campaigns", type, x, measures: ms.map((m) => m[0]), sort: "label" } };
}
