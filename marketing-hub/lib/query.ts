// Data queries for the assistant — one layer used by both the AI providers (as tools) and the built-in answers.
// Resolves what a question is about (campaign, past campaign, vendor, project, channel, month) in English or Arabic,
// and returns structured, sourced numbers. Read-only.
import type { Agent } from "./agent";
import type { HistoryState } from "./history";
import type { DailyState } from "./daily";
import type { LeadRow } from "./audience";
import type { Creative } from "./creatives";
import { familyOf, FAMILY_LABEL, kpis } from "./history";
import { type Lang, nm, NAMES_AR, tx } from "./i18n";

export type QueryCtx = { agent: Agent; history: HistoryState; daily: DailyState; lang: Lang; meta: any | null; leads?: LeadRow[]; creatives?: Creative[] };
const r1 = (x: number) => Math.round(x * 10) / 10;
const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 3);
const STOP = new Set(["the", "and", "for", "how", "what", "with", "campaign", "campaigns", "doing", "about", "show", "tell", "did", "does", "our", "was", "were", "this", "that", "from", "last", "year", "month", "حمله", "حملات", "الحمله", "الحملات", "كيف", "ماذا", "عن", "هل", "في", "من", "على", "اداء", "أداء"]);
const key = (s: string) => [...new Set(words(s).filter((w) => !STOP.has(w)))];

// ----------------------------------------------------------------- entities
export type Entity =
  | { kind: "campaign"; code: string; name: string; id: string }
  | { kind: "past"; code: string; name: string }
  | { kind: "vendor"; id: string | null; name: string }
  | { kind: "project"; name: string }
  | { kind: "channel"; family: string; name: string };

const PROJECT_ALIASES: Record<string, string[]> = {
  "Ash Shati Residences": ["ash shati", "shati", "الشاطئ", "الشاطي", "شاطئ"],
  "Marina Tower": ["marina", "المارينا", "مارينا", "برج المارينا"],
  "Andalus Quarter": ["andalus", "الأندلس", "الاندلس", "اندلس"],
  "Palm Villas": ["palm villas", "palm", "فلل النخيل", "النخيل"],
  "All projects": ["cityscape", "corporate brand", "سيتي سكيب", "العلامة المؤسسية"],
};
const CHANNEL_ALIASES: Record<string, string[]> = {
  DIGITAL: ["digital", "google", "search", "social", "meta", "snap", "online", "رقمي", "الرقمي", "جوجل", "سناب", "التواصل"],
  INFLUENCER: ["influencer", "influencers", "creator", "creators", "instagram", "tiktok", "مؤثر", "المؤثرين", "المؤثرون", "مؤثرين", "صناع المحتوى", "انستغرام", "تيك توك"],
  PORTAL: ["portal", "portals", "listing", "listings", "بوابه", "البوابات", "بوابات"],
  BROKER: ["broker", "brokers", "brokerage", "وسطاء", "الوسطاء", "وساطه"],
  PR: ["pr", "press", "media relations", "علاقات عامه", "العلاقات العامه"],
  OUTDOOR: ["outdoor", "billboard", "billboards", "ooh", "لوحات", "اعلانات خارجيه", "الخارجيه"],
  EVENT: ["event", "events", "expo", "فعاليه", "الفعاليات", "معرض"],
  RADIO: ["radio", "اذاعه", "الاذاعه"],
};

/** Everything the text mentions, best match first per kind. */
export function resolve(text: string, c: QueryCtx): Entity[] {
  const q = norm(text), qk = new Set(key(text));
  const out: Entity[] = [];
  const score = (names: string[]) => Math.max(0, ...names.map((n) => { const k = key(n); return k.length ? k.filter((w) => qk.has(w)).length / k.length : 0; }));
  // Codes first (exact).
  for (const u of c.agent.unified.campaigns) if (u.code && q.includes(u.code.toLowerCase())) out.push({ kind: "campaign", code: u.code, name: u.name, id: u.id });
  for (const p of c.history.rows) if (q.includes(p.code.toLowerCase())) out.push({ kind: "past", code: p.code, name: p.name });
  // Names (≥ 2/3 of the distinctive words).
  const live = c.agent.unified.campaigns.map((u) => ({ u, s: score([u.name, nm("ar", u.name)]) })).filter((x) => x.s >= 0.66).sort((a, b) => b.s - a.s);
  for (const { u } of live) if (!out.some((e) => e.kind === "campaign" && e.code === u.code)) out.push({ kind: "campaign", code: u.code ?? u.id, name: u.name, id: u.id });
  const past = c.history.rows.map((p) => ({ p, s: score([p.name]) })).filter((x) => x.s >= 0.75).sort((a, b) => b.s - a.s);
  for (const { p } of past) if (!out.some((e) => "code" in e && e.code === p.code)) out.push({ kind: "past", code: p.code, name: p.name });
  // Vendors (current, bench, past).
  const vendorNames = new Set<string>([...c.agent.mkt.vendors.map((v) => v.name), ...c.agent.bench.bench.map((b: any) => b.name), ...c.history.rows.map((r) => r.vendorKey)]);
  for (const v of vendorNames) {
    const ar = NAMES_AR[v];
    const first = norm(v).split(" ")[0];
    if (q.includes(norm(v)) || (ar && q.includes(norm(ar))) || (first.length >= 4 && new RegExp(`\\b${first}\\b`).test(q)) || (ar && norm(ar).split(" ")[0].length >= 4 && q.includes(norm(ar).split(" ")[0])))
      out.push({ kind: "vendor", id: c.agent.mkt.vendors.find((x) => x.name === v)?.id ?? null, name: v });
  }
  for (const [p, al] of Object.entries(PROJECT_ALIASES)) if (al.some((a) => q.includes(norm(a)))) out.push({ kind: "project", name: p });
  for (const [f, al] of Object.entries(CHANNEL_ALIASES)) if (al.some((a) => new RegExp(`(^|\\s)${norm(a)}(\\s|$)`).test(q))) out.push({ kind: "channel", family: f, name: FAMILY_LABEL[f]?.[0] ?? f });
  return out;
}

// ------------------------------------------------------------------- months
const MONTHS: [string, string[]][] = [
  ["01", ["january", "jan", "يناير"]], ["02", ["february", "feb", "فبراير"]], ["03", ["march", "mar", "مارس"]], ["04", ["april", "apr", "ابريل", "أبريل"]],
  ["05", ["may", "مايو"]], ["06", ["june", "jun", "يونيو"]], ["07", ["july", "jul", "يوليو"]], ["08", ["august", "aug", "اغسطس", "أغسطس"]],
  ["09", ["september", "sep", "sept", "سبتمبر"]], ["10", ["october", "oct", "اكتوبر", "أكتوبر"]], ["11", ["november", "nov", "نوفمبر"]], ["12", ["december", "dec", "ديسمبر"]],
];
/** Months (YYYY-MM) a question refers to, or a year. Defaults to 2026 for live data. */
export function parsePeriod(text: string, latestMonth: string): { months: string[]; label: string } | null {
  const q = norm(text);
  const year = q.match(/\b(2023|2024|2025|2026)\b/)?.[1];
  const q1 = q.match(/\bq([1-4])\b/)?.[1];
  if (q1) { const y = year ?? latestMonth.slice(0, 4); const s = (Number(q1) - 1) * 3; return { months: [1, 2, 3].map((i) => `${y}-${String(s + i).padStart(2, "0")}`), label: `Q${q1} ${y}` }; }
  for (const [mm, names] of MONTHS) if (names.some((n) => new RegExp(`(^|\\s)${norm(n)}(\\s|$)`).test(q))) { const y = year ?? latestMonth.slice(0, 4); return { months: [`${y}-${mm}`], label: `${y}-${mm}` }; }
  if (/last month|this month|الشهر الماضي|هذا الشهر|آخر شهر|اخر شهر/.test(q)) return { months: [latestMonth], label: latestMonth };
  if (/year to date|ytd|this year|منذ بدايه العام|هذا العام/.test(q)) { const y = latestMonth.slice(0, 4); return { months: Array.from({ length: Number(latestMonth.slice(5)) }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`), label: `${y} YTD` }; }
  if (year) return { months: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`), label: year };
  return null;
}

// ------------------------------------------------------------------ lookups
export function liveCampaign(c: QueryCtx, codeOrId: string) {
  const u = c.agent.unified.campaigns.find((x) => x.code === codeOrId || x.id === codeOrId);
  if (!u) return null;
  const m = c.agent.mkt.campaigns.find((x) => x.id === u.id)!;
  const fam = familyOf(u.channel);
  const bench = c.history.byFamily.find((x) => x.key === fam);
  const daily = c.daily.recommendations.filter((r) => r.code === u.code).map((r) => ({ severity: r.severity, title: r.title, action: r.action, since: r.since }));
  const meta = c.meta?.campaigns?.filter((x: any) => x.code === u.code).map((x: any) => ({ metaCampaign: x.name, attributedTo: x.vendor, confidence: x.confidence, spendK: x.spendK })) ?? [];
  return {
    kind: "live", code: u.code, name: u.name, vendor: u.vendor, project: m.asset, channel: u.channel, status: u.status, budgetK: m.budgetK, spendK: m.spendK, pacingPct: m.pacingPct,
    crm: { leads: u.verified.leads, qualified: u.verified.qualified, won: u.verified.won, salesM: r1(u.verified.salesM), respHrs: u.verified.respHrs },
    kpis: { costToSalesPct: m.costToSalesPct, cplSAR: m.cplSar, qualRatePct: m.qualRatePct, leadToContractPct: m.leadToContractPct },
    vendorReported: u.reported, platform: u.platform,
    months: u.months.map((x) => ({ month: x.month, spendK: r1(x.costK), qualified: x.qualified, contracts: x.won, salesM: r1(x.salesM) })),
    benchmark: bench ? { channel: bench.label, pastCampaigns: bench.campaigns, costToSalesPct: bench.costToSalesPct, qualPct: bench.qualPct } : null,
    dailyCheck: daily, meta,
  };
}
export function pastCampaign(c: QueryCtx, code: string) {
  const p = c.history.rows.find((x) => x.code === code);
  return p ? { kind: "past", ...p } : null;
}
export function vendorDetail(c: QueryCtx, name: string) {
  const a = c.agent;
  const v = a.mkt.vendors.find((x) => x.name === name);
  const past = c.history.rows.filter((r) => r.vendorKey === name);
  const bench = a.bench.bench.find((b: any) => b.name === name);
  if (!v) return { name, current: false, onBench: !!bench, bench: bench ?? null, pastCampaigns: past.map((p) => ({ code: p.code, name: p.name, when: `${p.start}→${p.end}`, costToSalesPct: p.costToSalesPct, contracts: p.contracts, lesson: p.lesson })) };
  const s = a.scores.find((x) => x.vendorId === v.id), d = a.decisions.find((x) => x.vendorId === v.id);
  return {
    name, current: true, category: v.category, model: v.model, contractEnd: v.contractEnd, score: s ? { score: s.score, range: [s.low, s.high], confidence: s.confidence } : null,
    decision: d ? { decision: d.decision, confidence: d.confidence, headline: d.headline } : null,
    totals: { spendK: v.spendK, leads: v.leads, contracts: v.contracts, salesM: v.revenueM, costToSalesPct: v.costToSalesPct, slaBreaches: v.slaBreaches },
    campaigns: a.mkt.campaigns.filter((x) => x.vendorId === v.id).map((x) => ({ name: x.name, status: x.status, costToSalesPct: x.costToSalesPct, spendK: x.spendK, contracts: x.contracts })),
    invoices: { exceptions: a.inv.invoices.filter((i) => i.vendorId === v.id && i.flags.length).length, outstandingK: r1(a.inv.invoices.filter((i) => i.vendorId === v.id).reduce((x, i) => x + i.outstandingK, 0)) },
    pastCampaigns: past.map((p) => ({ code: p.code, name: p.name, when: `${p.start}→${p.end}`, costToSalesPct: p.costToSalesPct, contracts: p.contracts })),
  };
}
export function projectSummary(c: QueryCtx, project: string) {
  const a = c.agent;
  const live = a.mkt.campaigns.filter((x) => x.asset === project);
  const sum = live.reduce((s, x) => ({ spendK: s.spendK + x.spendK, leads: s.leads + x.leads, qualified: s.qualified + x.qualified, contracts: s.contracts + x.contracts, salesM: s.salesM + x.revenueM }), { spendK: 0, leads: 0, qualified: 0, contracts: 0, salesM: 0 });
  const hist = c.history.byProject.find((x) => x.key === project);
  return {
    project, live: { campaigns: live.length, ...kpis(sum), list: live.map((x) => ({ name: x.name, vendor: x.vendor, status: x.status, costToSalesPct: x.costToSalesPct })) },
    history: hist ? { campaigns: hist.campaigns, costToSalesPct: hist.costToSalesPct, contracts: hist.contracts, salesM: hist.salesM } : null,
    dailyCheck: c.daily.recommendations.filter((r) => live.some((x) => nm(c.lang, x.name) === r.campaign || x.name === r.campaign)).map((r) => r.title),
  };
}
export function channelSummary(c: QueryCtx, family: string) {
  const a = c.agent;
  const live = a.mkt.campaigns.filter((x) => familyOf(x.channel) === family);
  const sum = live.reduce((s, x) => ({ spendK: s.spendK + x.spendK, leads: s.leads + x.leads, qualified: s.qualified + x.qualified, contracts: s.contracts + x.contracts, salesM: s.salesM + x.revenueM }), { spendK: 0, leads: 0, qualified: 0, contracts: 0, salesM: 0 });
  const hist = c.history.byFamily.find((x) => x.key === family);
  return { channel: tx(c.lang, ...(FAMILY_LABEL[family] ?? [family, family])), live: { campaigns: live.length, ...kpis(sum), list: live.map((x) => ({ name: x.name, vendor: x.vendor, costToSalesPct: x.costToSalesPct })) }, history: hist ?? null, seasons: c.history.rows.filter((r) => r.family === family).map((r) => ({ name: r.name, season: r.seasonLabel, costToSalesPct: r.costToSalesPct })) };
}
/** Totals for months (live 2026 data from campaigns; 2023–2025 from the history), grouped. */
export function periodSummary(c: QueryCtx, months: string[], groupBy: "vendor" | "project" | "channel" | "campaign" = "vendor") {
  const rows: { group: string; spendK: number; qualified: number; contracts: number; salesM: number; leads: number }[] = [];
  const add = (g: string, x: { spendK: number; qualified: number; contracts: number; salesM: number; leads?: number }) => {
    const r = rows.find((y) => y.group === g) ?? (rows.push({ group: g, spendK: 0, qualified: 0, contracts: 0, salesM: 0, leads: 0 }), rows[rows.length - 1]);
    r.spendK += x.spendK; r.qualified += x.qualified; r.contracts += x.contracts; r.salesM += x.salesM; r.leads += x.leads ?? 0;
  };
  for (const u of c.agent.unified.campaigns) {
    const m = c.agent.mkt.campaigns.find((x) => x.id === u.id)!;
    for (const mo of u.months.filter((x) => months.includes(x.month)))
      add(groupBy === "vendor" ? u.vendor : groupBy === "project" ? m.asset : groupBy === "channel" ? familyOf(u.channel) : u.name, { spendK: mo.costK, qualified: mo.qualified, contracts: mo.won, salesM: mo.salesM });
  }
  for (const p of c.history.rows) for (const mo of p.months.filter((x: any) => months.includes(x.month)))
    add(groupBy === "vendor" ? p.vendorKey : groupBy === "project" ? p.projectKey : groupBy === "channel" ? p.family : p.name, mo);
  const out = rows.map((r) => ({ ...r, spendK: r1(r.spendK), salesM: r1(r.salesM), costToSalesPct: r.salesM ? r1((r.spendK / (r.salesM * 1000)) * 100) : null })).sort((a, b) => b.salesM - a.salesM);
  const total = out.reduce((s, r) => ({ spendK: s.spendK + r.spendK, qualified: s.qualified + r.qualified, contracts: s.contracts + r.contracts, salesM: s.salesM + r.salesM }), { spendK: 0, qualified: 0, contracts: 0, salesM: 0 });
  return { months, groupBy, rows: out, total: { ...total, spendK: r1(total.spendK), salesM: r1(total.salesM), costToSalesPct: total.salesM ? r1((total.spendK / (total.salesM * 1000)) * 100) : null } };
}
export function describe(c: QueryCtx, e: Entity) {
  if (e.kind === "campaign") return liveCampaign(c, e.code) ?? liveCampaign(c, e.id);
  if (e.kind === "past") return pastCampaign(c, e.code);
  if (e.kind === "vendor") return vendorDetail(c, e.name);
  if (e.kind === "project") return projectSummary(c, e.name);
  return channelSummary(c, e.family);
}
export function latestLiveMonth(c: QueryCtx) {
  return c.agent.unified.campaigns.flatMap((u) => u.months.map((m) => m.month)).sort().pop() ?? "2026-05";
}
