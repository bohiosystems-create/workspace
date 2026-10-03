// Open-ended charts: a small query language over every dataset the assistant can see, so the AI (or anyone calling
// POST /api/chart) can ask for practically any chart — any measure formula, grouping, split, filter, period,
// transform and chart type — while every number is still computed here from the data, never typed by a model.
//
//   { dataset: "campaigns", type: "stacked", x: "quarter", series: "channel",
//     measures: [{ expr: "sum(spend)" }], filters: [{ field: "project", op: "=", value: "Marina Tower" }], period: "2025" }
//
// Formulas: sum() avg() min() max() median() count() distinct() around row fields and arithmetic (+ - * / and
// brackets), e.g. "sum(spend)*1000/sum(qualified)". Named measures (cost_to_sales, cpql, roas, …) expand to formulas.
import type { QueryCtx } from "./query";
import { parsePeriod, latestLiveMonth } from "./query";
import { familyOf, FAMILY_LABEL } from "./history";
import { marketSeries, MORTGAGE, COMPETITORS, AD_MONTHS_ALL, adsHistory } from "./market";
import { historyLeadRows } from "./audience";
import { type Lang, tx, nm } from "./i18n";
import type { ChartSpec, ChartType } from "./charts";
import { buildChart, chartRequestFromText } from "./charts";

type Row = Record<string, string | number | null>;
type Field = { name: string; kind: "dim" | "num"; about: string; unit?: string; avg?: boolean };
type Dataset = { name: string; about: string; grain: string; fields: Field[]; rows: (c: QueryCtx) => Row[] };

const quarter = (m: string) => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;
const time = (m: string) => ({ month: m, quarter: quarter(m), year: m.slice(0, 4) });
const TIME: Field[] = [
  { name: "month", kind: "dim", about: "YYYY-MM" }, { name: "quarter", kind: "dim", about: "YYYY-Qn" }, { name: "year", kind: "dim", about: "YYYY" },
];
const D = (name: string, about: string): Field => ({ name, kind: "dim", about });
const N = (name: string, about: string, unit = "", avg = false): Field => ({ name, kind: "num", about, unit, avg });
// Levels (scores, prices, rates) are averaged when written bare; amounts and counts are summed.
const A = (name: string, about: string, unit = ""): Field => N(name, about, unit, true);

// Live 2026 months get a season too, so "Ramadan 2026 vs Ramadan 2025" works: Ramadan 2026 ran mid-February to
// mid-March; otherwise launch campaigns are LAUNCH and the rest ALWAYS_ON.
const liveSeason = (month: string, name: string) => (month === "2026-02" || month === "2026-03" ? "RAMADAN" : /launch/i.test(name) ? "LAUNCH" : "ALWAYS_ON");
const ymd = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : null);

export const DATASETS: Dataset[] = [
  {
    name: "campaigns", grain: "one row per campaign per month, 2023-01 → latest (live 2026 campaigns + 2023–2025 history)",
    about: "Marketing results. Live rows use verified sources (Oracle cost, CRM leads/sales); reported_* is what the vendor reported.",
    fields: [...TIME, D("vendor", "agency"), D("project", "development"), D("channel", "DIGITAL, INFLUENCER, PORTAL, BROKER, PR, OUTDOOR, EVENT, RADIO"), D("campaign", "campaign name"), D("code", "campaign code"),
      D("season", "RAMADAN, SUMMER, LAUNCH, EVENT, ALWAYS_ON, BRAND (live 2026 months: RAMADAN in Feb–Mar, LAUNCH for launch campaigns, else ALWAYS_ON)"), D("status", "live | past"),
      N("spend", "marketing cost", "SAR K"), N("leads", "leads (CRM)"), N("qualified", "CRM-qualified leads"), N("viewings", "site viewings (live only)"), N("reservations", "reservations (live only)"),
      N("contracts", "signed contracts (CRM)"), N("sales", "contracted sales value (CRM)", "SAR M"),
      N("reported_spend", "vendor-reported spend (live only)", "SAR K"), N("reported_leads", "vendor-reported leads (live only)"), N("reported_contracts", "vendor-reported contracts (live only)"), N("reported_sales", "vendor-reported sales (live only)", "SAR M"),
      N("impressions", "thousands (live only)", "K"), N("clicks", "clicks (live only)")],
    rows: (c) => {
      const out: Row[] = [];
      for (const u of c.agent.unified.campaigns) {
        const m = c.agent.mkt.campaigns.find((x) => x.id === u.id)!;
        for (const mo of u.months) out.push({
          ...time(mo.month), vendor: u.vendor, project: m.asset, channel: familyOf(u.channel), campaign: u.name, code: u.code, season: liveSeason(mo.month, u.name), status: "live",
          spend: mo.costK, leads: mo.leads, qualified: mo.qualified, viewings: mo.viewings, reservations: mo.reservations, contracts: mo.won, sales: mo.salesM,
          reported_spend: mo.reported.spendK, reported_leads: mo.reported.leads, reported_contracts: mo.reported.contracts, reported_sales: mo.reported.salesM, impressions: mo.reported.impressionsK, clicks: mo.reported.clicks,
        });
      }
      for (const r of c.history.rows as any[]) for (const mo of r.months) out.push({
        ...time(mo.month), vendor: r.vendorKey, project: r.projectKey, channel: r.family, campaign: r.name, code: r.code, season: r.season, status: "past",
        spend: mo.spendK, leads: mo.leads ?? 0, qualified: mo.qualified, viewings: null, reservations: null, contracts: mo.contracts, sales: mo.salesM,
        reported_spend: null, reported_leads: null, reported_contracts: null, reported_sales: null, impressions: null, clicks: null,
      });
      return out;
    },
  },
  {
    name: "leads", grain: "one row per lead: the 2026 CRM sample plus the 2023–2025 campaigns' leads (profiles reconstructed)", about: "Lead profiles and outcomes. status = live (2026 CRM) | past (2023–2025).",
    fields: [...TIME, D("vendor", ""), D("project", ""), D("channel", ""), D("campaign", ""), D("stage", "NEW, CONTACTED, QUALIFIED, VIEWING, RESERVED, WON, LOST"),
      D("city", ""), D("nationality", ""), D("buyerType", ""), D("budgetBand", ""), D("unitType", ""), D("ageBand", ""), D("lostReason", ""), D("responseBand", "first response time band"), D("status", "live | past"), D("season", "past campaigns' season; live: LIVE"),
      N("leads", "1 per lead"), N("qualified", "1 if qualified or later"), N("won", "1 if won"), N("sales", "deal value of won leads", "SAR M")],
    rows: (c) => {
      const row = (l: any, status: string, season: string) => ({
        ...time(l.month), vendor: l.vendor, project: l.project, channel: l.family, campaign: l.campaign, stage: l.stage, ...l.profile, status, season,
        leads: 1, qualified: ["QUALIFIED", "VIEWING", "RESERVED", "WON"].includes(l.stage) ? 1 : 0, won: l.stage === "WON" ? 1 : 0, sales: l.stage === "WON" ? l.dealValueM ?? 0 : 0,
      });
      const seasonOf = new Map((c.history.rows as any[]).map((r) => [r.code, r.season]));
      return [...(c.leads ?? []).map((l) => row(l, "live", "LIVE")), ...historyLeadRows(c.history as any).map((l) => row(l, "past", seasonOf.get(l.campaignCode) ?? ""))];
    },
  },
  {
    name: "creatives", grain: "one row per ad creative of the live campaigns (sample, adds up to campaign totals)", about: "Ad creatives.",
    fields: [D("vendor", ""), D("project", ""), D("channel", ""), D("campaign", ""), D("creative", ""), D("format", ""), D("message", ""), D("language", ""), D("fatigued", "yes | no"),
      N("spend", "", "SAR K"), N("impressions", ""), N("clicks", ""), N("leads", ""), N("qualified", ""), A("frequency", "avg. frequency")],
    rows: (c) => (c.creatives ?? []).map((r: any) => ({ vendor: r.vendor, project: r.project, channel: r.family, campaign: r.campaign, creative: r.creative, format: r.format, message: r.message, language: r.language, fatigued: r.fatigued ? "yes" : "no",
      spend: r.spendK, impressions: r.impressions, clicks: r.clicks, leads: r.leads, qualified: r.qualified, frequency: r.frequency })),
  },
  {
    name: "invoices", grain: "one row per supplier invoice: Oracle 2026 plus the 2023–2025 campaigns' monthly invoices (paid)", about: "Supplier invoices and payment status. source = oracle | history.",
    fields: [...TIME, D("vendor", ""), D("campaign", ""), D("payment", "Paid | Partly paid | Unpaid"), D("oracle_status", ""), D("decision", "PENDING | APPROVED | DISPUTED"), D("blocked", "yes | no"), D("overdue", "yes | no"), D("source", "oracle | history"), D("project", ""), D("channel", ""),
      N("amount", "invoiced", "SAR K"), N("paid", "", "SAR K"), N("outstanding", "", "SAR K"), A("days_overdue", "days"), N("invoices", "1 per invoice")],
    rows: (c) => {
      const camp = new Map(c.agent.mkt.campaigns.map((x: any) => [x.name, x]));
      const live = (c.agent.inv?.invoices ?? []).map((i: any) => ({
        ...time((i.period ?? i.invoiceDate).slice(0, 7)), vendor: i.vendor, campaign: i.campaign, payment: i.payment, oracle_status: i.oracleStatus, decision: i.decision, blocked: i.blocked ? "yes" : "no", overdue: i.daysOverdue > 0 ? "yes" : "no",
        source: "oracle", project: (camp.get(i.campaign) as any)?.asset ?? null, channel: camp.get(i.campaign) ? familyOf((camp.get(i.campaign) as any).channel) : null,
        amount: i.amountK, paid: i.paidK, outstanding: i.outstandingK, days_overdue: i.daysOverdue, invoices: 1,
      }));
      // Past campaigns: one invoice per campaign and month, for the month's spend, paid on time.
      const past = (c.history.rows as any[]).flatMap((r) => r.months.filter((m: any) => m.spendK > 0).map((m: any) => ({
        ...time(m.month), vendor: r.vendorKey, campaign: r.name, payment: "Paid", oracle_status: "Validated", decision: "APPROVED", blocked: "no", overdue: "no",
        source: "history", project: r.projectKey, channel: r.family, amount: m.spendK, paid: m.spendK, outstanding: 0, days_overdue: 0, invoices: 1,
      })));
      return [...live, ...past];
    },
  },
  {
    name: "vendors", grain: "one row per vendor: current, bench (pre-vetted alternatives) and past (2023–2025 only)", about: "Fair scorecard (50 = channel benchmark; current vendors only), renewal decision, trials and 2023–2025 results.",
    fields: [D("vendor", ""), D("category", ""), D("decision", "RE_ENGAGE, RENEGOTIATE, PERFORMANCE_PLAN, TEST_REPLACEMENT, EXIT"), D("confidence", ""), D("trend", ""), D("status", "current | bench | past"), D("model", "Retainer | Commission | Media buy"),
      A("score", "fair score 0–100"), A("score_low", ""), A("score_high", ""), N("cost", "verified cost", "SAR K"), N("qualified", ""), N("won", ""), A("on_time", "deliverables on time", "%"), A("revisions", "avg. revisions"), A("incremental_share", "share of results caused by the vendor", "%"),
      N("retainer", "monthly fixed fee", "SAR K"), N("trials", "head-to-head trials as challenger or incumbent"), N("past_campaigns", "2023–2025 campaigns"), N("past_spend", "2023–2025 spend", "SAR K"), N("past_sales", "2023–2025 sales", "SAR M"), N("months_to_contract_end", "months")],
    rows: (c) => {
      const ex = c.extra, today = new Date(`${latestLiveMonth(c)}-28T00:00:00Z`).getTime();
      const past = (name: string) => { const rs = (c.history.rows as any[]).filter((r) => r.vendorKey === name); return { past_campaigns: rs.length, past_spend: rs.reduce((t, r) => t + r.spendK, 0), past_sales: rs.reduce((t, r) => t + r.salesM, 0) }; };
      const trials = (id: string) => (ex?.trials ?? []).filter((t: any) => t.challengerId === id || t.incumbentId === id).length;
      const rec = (name: string) => ex?.vendors.find((v: any) => v.name === name);
      const cur = c.agent.scores.map((s: any) => {
        const d = c.agent.decisions.find((x: any) => x.vendorId === s.vendorId), v = rec(s.vendor);
        return { vendor: s.vendor, category: s.category, decision: d?.decision ?? null, confidence: s.confidence, trend: s.trend, status: "current", model: v?.model ?? null,
          score: s.score, score_low: s.low, score_high: s.high, cost: s.costK, qualified: s.qualified, won: s.won, on_time: s.onTimePct, revisions: s.avgRevisions,
          incremental_share: s.incrementalShare === null ? null : Math.round(s.incrementalShare * 1000) / 10, retainer: v?.retainerK ?? null, trials: v ? trials(v.id) : 0,
          months_to_contract_end: v ? Math.round((new Date(v.contractEnd).getTime() - today) / (30.44 * 86400000)) : null, ...past(s.vendor) };
      });
      const names = new Set(cur.map((x: any) => x.vendor));
      const bench = (ex?.vendors ?? []).filter((v: any) => v.status === "BENCH" && !names.has(v.name)).map((v: any) => ({
        vendor: v.name, category: v.category, decision: null, confidence: null, trend: null, status: "bench", model: v.model, score: null, score_low: null, score_high: null, cost: null, qualified: null, won: null,
        on_time: null, revisions: null, incremental_share: null, retainer: v.retainerK, trials: trials(v.id), months_to_contract_end: null, ...past(v.name) }));
      bench.forEach((b: any) => names.add(b.vendor));
      const gone = [...new Set((c.history.rows as any[]).map((r) => r.vendorKey))].filter((n) => !names.has(n)).map((n) => ({
        vendor: n, category: (c.history.rows as any[]).find((r) => r.vendorKey === n)?.family ?? null, decision: null, confidence: null, trend: null, status: "past", model: null, score: null, score_low: null, score_high: null,
        cost: null, qualified: null, won: null, on_time: null, revisions: null, incremental_share: null, retainer: null, trials: 0, months_to_contract_end: null, ...past(n) }));
      return [...cur, ...bench, ...gone];
    },
  },
  {
    name: "market", grain: "one row per district per month, 2023-01 → 2026-05 (sample)", about: "Residential market by district.",
    fields: [...TIME, D("district", "Jeddah North, Jeddah Corniche, Jeddah South, Riyadh North"), D("project", "our project in the district"), A("price_per_sqm", "average", "SAR"), N("transactions", "residential deals")],
    rows: () => marketSeries().flatMap((d) => d.months.map((m) => ({ ...time(m.month), district: d.district, project: d.project, price_per_sqm: m.pricePerSqmSAR, transactions: m.transactions }))),
  },
  {
    name: "mortgage", grain: "one row per month, 2023-01 → 2026-05 (sample)", about: "Mortgage market.",
    fields: [...TIME, A("rate", "rate from", "%"), N("new_mortgages", "new mortgages", "SAR bn")],
    rows: () => MORTGAGE.map((m) => ({ ...time(m.month), rate: m.rateFromPct, new_mortgages: m.newMortgagesSARbn })),
  },
  {
    name: "competitors", grain: "one row per competitor per month of Meta ads, 2025-01 → 2026-05 (sample, fictional names)", about: "Competitor developers.",
    fields: [...TIME, D("competitor", ""), D("project", "their project"), D("district", ""), D("competes_with", "our project"), N("ads", "active Meta ads"), A("price_per_sqm", "", "SAR")],
    rows: () => COMPETITORS.flatMap((x: any) => { const ads = adsHistory(x); return AD_MONTHS_ALL.map((m, i) => ({ ...time(m), competitor: x.name, project: x.project, district: x.district, competes_with: x.threatTo ?? null, ads: ads[i] ?? 0, price_per_sqm: x.pricePerSqmSAR })); }),
  },
  {
    name: "deliverables", grain: "one row per vendor deliverable (creatives, landing pages, reports, listings, events), all of 2026", about: "What vendors owe us and whether it came on time.",
    fields: [...TIME, D("vendor", ""), D("kind", "CREATIVE, LANDING_PAGE, REPORT, LISTING, EVENT"), D("state", "on time | late (received) | late (open) | due"), D("delivered", "yes | no"),
      N("deliverables", "1 per deliverable"), N("late", "1 if late (open or received)"), N("on_time", "1 if received on time"), A("days_late", "days past due (late ones)", "days"), A("revisions", "revision rounds")],
    rows: (c) => {
      const today = new Date(`${latestLiveMonth(c)}-28T00:00:00Z`).getTime() + 11 * 86400000; // demo date 8 June 2026
      const name = new Map((c.extra?.vendors ?? []).map((v: any) => [v.id, v.name]));
      return (c.extra?.deliverables ?? []).map((d: any) => {
        const due = new Date(d.dueDate).getTime(), got = d.deliveredAt ? new Date(d.deliveredAt).getTime() : null;
        const late = got ? got > due : today > due, days = late ? Math.max(1, Math.round(((got ?? today) - due) / 86400000)) : 0;
        return { ...time(ymd(d.dueDate)!.slice(0, 7)), vendor: name.get(d.vendorId) ?? d.vendorId, kind: d.kind, state: got ? (late ? "late (received)" : "on time") : late ? "late (open)" : "due", delivered: got ? "yes" : "no",
          deliverables: 1, late: late ? 1 : 0, on_time: got && !late ? 1 : 0, days_late: late ? days : null, revisions: d.revisions };
      });
    },
  },
  {
    name: "work_orders", grain: "one row per work order the agent prepared for a vendor (briefs, lead feedback, chases, notices)", about: "Vendor orchestration.",
    fields: [D("vendor", ""), D("kind", "MONTHLY_BRIEF, LEAD_FEEDBACK, DELIVERABLE_CHASE, NON_RENEWAL"), D("status", "PROPOSED (waiting for you), ISSUED (with vendor), DONE, CANCELLED"), D("routine", "yes | no"), D("overdue", "yes | no"),
      N("orders", "1 per work order")],
    rows: (c) => (c.extra?.orders ?? []).map((o: any) => ({ vendor: o.vendor, kind: o.kind, status: o.status, routine: o.routine ? "yes" : "no", overdue: o.overdue ? "yes" : "no", orders: 1 })),
  },
  {
    name: "recommendations", grain: "one row per open or recent recommendation (vendor and campaign)", about: "What the agent recommends; severity crit = urgent.",
    fields: [D("type", "RENEWAL, DATA_MISMATCH, CRM_MISMATCH, SLA_BREACH, INVOICE_EXCEPTIONS, REALLOCATE, …"), D("severity", "crit | warn | info"), D("state", "OPEN | DRAFTED | SENT | DISMISSED"), D("vendor", ""), D("handling", "EMAIL (to the vendor) | INTERNAL"),
      N("recommendations", "1 per recommendation"), N("impact", "money at stake", "SAR K")],
    rows: (c) => (c.extra?.recs ?? []).map((r: any) => ({ type: r.type, severity: r.severity, state: r.state, vendor: r.vendor ?? null, handling: r.channel ?? null, recommendations: 1, impact: r.impactK ?? 0 })),
  },
  {
    name: "daily_check", grain: "one row per item of today's per-campaign check", about: "Today's campaign-level findings.",
    fields: [D("type", "e.g. CPQL_RISING, OVER_PACING, BEHIND_BENCHMARK, DATA_STALE"), D("severity", "crit | warn | info"), D("campaign", ""), D("vendor", ""), D("project", ""), D("decision", "open | accepted | dismissed"),
      N("items", "1 per item"), A("days_open", "days the item has been open", "days")],
    rows: (c) => ((c.daily as any)?.recommendations ?? []).map((r: any) => ({ type: r.type, severity: r.severity, campaign: r.campaign, vendor: r.vendor || null, project: r.asset || null,
      decision: r.decision ? String(r.decision).toLowerCase() : "open", items: 1, days_open: r.daysOpen ?? r.days ?? null })),
  },
  {
    name: "targets", grain: "one row per project per month of 2026 (sales targets vs CRM-verified sales)", about: "Sales targets.",
    fields: [...TIME, D("project", ""), N("target", "sales target", "SAR M"), N("actual", "CRM-verified contracted sales", "SAR M"), N("target_contracts", "contracts target"), N("gap", "actual − target", "SAR M")],
    rows: (c) => {
      const act = new Map<string, number>();
      for (const u of c.agent.unified.campaigns) { const a = c.agent.mkt.campaigns.find((x) => x.id === u.id)!.asset; for (const m of u.months) act.set(`${a}|${m.month}`, (act.get(`${a}|${m.month}`) ?? 0) + m.salesM); }
      const latest = latestLiveMonth(c);
      return (c.extra?.targets ?? []).map((t: any) => {
        const a = t.month <= latest ? Math.round((act.get(`${t.asset}|${t.month}`) ?? 0) * 10) / 10 : null;
        return { ...time(t.month), project: t.asset, target: t.salesM, actual: a, target_contracts: t.contracts, gap: a === null ? null : Math.round((a - t.salesM) * 10) / 10 };
      });
    },
  },
  {
    name: "budget_plan", grain: "one row per vendor in next month's budget plan", about: "Proposed budget reallocation (same total).",
    fields: [D("vendor", ""), D("decision", "renewal decision behind the change"), N("current", "this month", "SAR K"), N("proposed", "next month", "SAR K"), N("change", "proposed − current", "SAR K"), N("expected_sales", "expected incremental sales", "SAR M")],
    rows: (c) => (c.extra?.plan?.lines ?? []).map((l: any) => ({ vendor: l.vendor, decision: l.decision, current: l.currentK, proposed: l.proposedK, change: Math.round((l.proposedK - l.currentK) * 10) / 10, expected_sales: l.expectedM })),
  },
  {
    name: "meta", grain: "one row per Meta (Facebook/Instagram) campaign per month (weekly ad-platform data rolled up), with CRM revenue",
    about: "Meta ads: spend, platform leads, and the CRM revenue they brought. revenue / contracts = the linked campaign's CRM-verified sales that month × Meta's share of that campaign's spend (campaigns without a campaign code — in-house, unknown agency — have none). Use this for 'Meta revenue', 'revenue from Facebook/Instagram ads', Meta ROAS.",
    fields: [...TIME, D("campaign", "Meta campaign name"), D("agency", "attributed vendor, or In-house / Unknown agency / Unclear"), D("kind", "VENDOR | IN_HOUSE | UNKNOWN_AGENCY | CONFLICT | UNRESOLVED"), D("confidence", "HIGH | MEDIUM | LOW"),
      D("needs_review", "yes | no"), D("account", "ad account"), D("code", "linked campaign code"), D("project", ""),
      N("spend", "Meta spend", "SAR K"), N("leads", "platform leads"), N("impressions", "thousands", "K"), N("clicks", ""), N("revenue", "CRM sales attributed to the Meta campaign", "SAR M"), N("contracts", "CRM contracts attributed (fractional)"), N("campaigns", "distinct Meta campaigns (use distinct(campaign))")],
    rows: (c) => {
      const info = new Map((c.meta?.campaigns ?? []).map((m: any) => [m.id, m]));
      const byCode = new Map(c.agent.unified.campaigns.filter((u) => u.code).map((u) => [u.code as string, u]));
      const asset = new Map(c.agent.mkt.campaigns.map((m: any) => [m.id, m.asset]));
      // Meta spend per campaign code and month (to share a campaign's CRM sales among its Meta campaigns).
      const raw = (c.extra?.metaRaw ?? []).map((m: any) => ({ m, weeks: JSON.parse(m.weeks || "[]") as { week: string; spendK: number; impressionsK?: number; clicks?: number; leads: number }[] }));
      const metaSpend = new Map<string, number>();
      for (const { m, weeks } of raw) if (m.campaignCode) for (const w of weeks) { const k = `${m.campaignCode}|${w.week.slice(0, 7)}`; metaSpend.set(k, (metaSpend.get(k) ?? 0) + w.spendK); }
      const out: Row[] = [];
      for (const { m, weeks } of raw) {
        const x: any = info.get(m.id) ?? {};
        const months = new Map<string, { spend: number; leads: number; impressions: number; clicks: number }>();
        for (const w of weeks) { const mo = w.week.slice(0, 7), a = months.get(mo) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0 }; a.spend += w.spendK; a.leads += w.leads; a.impressions += w.impressionsK ?? 0; a.clicks += w.clicks ?? 0; months.set(mo, a); }
        const u = m.campaignCode ? byCode.get(m.campaignCode) : undefined;
        for (const [mo, a] of months) {
          const um = u?.months.find((z) => z.month === mo);
          const all = metaSpend.get(`${m.campaignCode}|${mo}`) ?? 0;
          const share = um && all ? (a.spend / Math.max(um.costK, all)) : 0; // never more than the campaign's own sales
          out.push({ ...time(mo), campaign: m.name, agency: x.kind === "VENDOR" || m.kind === "VENDOR" ? (x.vendor ?? u?.vendor ?? "—") : (m.kind === "IN_HOUSE" ? "In-house" : m.kind === "UNKNOWN_AGENCY" ? "Unknown agency" : "Unclear"),
            kind: m.kind, confidence: m.confidence, needs_review: x.needsReview ? "yes" : "no", account: x.account ?? m.accountId, code: m.campaignCode ?? null, project: u ? asset.get(u.id) ?? null : null,
            spend: Math.round(a.spend * 10) / 10, leads: a.leads, impressions: Math.round(a.impressions), clicks: a.clicks,
            revenue: um ? Math.round(um.salesM * share * 100) / 100 : 0, contracts: um ? Math.round(um.won * share * 100) / 100 : 0, campaigns: 1 });
        }
      }
      return out;
    },
  }
];

// Named measures: write them bare ("cost_to_sales") or inside a formula.
export const NAMED: Record<string, { expr: string; unit: string; about: string }> = {
  cost_to_sales: { expr: "sum(spend)/(sum(sales)*1000)*100", unit: "%", about: "spend ÷ sales (campaigns)" },
  cpl: { expr: "sum(spend)*1000/sum(leads)", unit: "SAR", about: "cost per lead" },
  cpql: { expr: "sum(spend)*1000/sum(qualified)", unit: "SAR", about: "cost per qualified lead" },
  cac: { expr: "sum(spend)/sum(contracts)", unit: "SAR K", about: "cost per contract" },
  roas: { expr: "sum(sales)*1000/sum(spend)", unit: "×", about: "sales per SAR of spend" },
  qual_rate: { expr: "sum(qualified)/sum(leads)*100", unit: "%", about: "qualified ÷ leads" },
  close_rate: { expr: "sum(contracts)/sum(qualified)*100", unit: "%", about: "contracts ÷ qualified (campaigns)" },
  win_rate: { expr: "sum(won)/sum(leads)*100", unit: "%", about: "won ÷ leads (leads)" },
  ctr: { expr: "sum(clicks)/(sum(impressions)*1000)*100", unit: "%", about: "clicks ÷ impressions" },
  avg_deal: { expr: "sum(sales)/sum(contracts)", unit: "SAR M", about: "sales per contract (campaigns)" },
  overstatement: { expr: "(sum(reported_sales)-sum(sales))/sum(sales)*100", unit: "%", about: "vendor-reported vs CRM sales (live)" },
};

// ---- Formula parser (no eval): numbers, fields, + - * / ( ), sum/avg/min/max/median/count/distinct ----------
type Ast = { k: "num"; v: number } | { k: "field"; f: string } | { k: "bin"; op: string; a: Ast; b: Ast } | { k: "neg"; a: Ast } | { k: "agg"; fn: string; a: Ast | null };
const AGGS = new Set(["sum", "avg", "min", "max", "median", "count", "distinct"]);

function parse(src: string): Ast {
  const toks = src.match(/\d+(\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/,]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const expect = (t: string) => { if (next() !== t) throw new Error(`expected "${t}" in "${src}"`); };
  const expr = (): Ast => { let a = term(); while (peek() === "+" || peek() === "-") { const op = next()!; a = { k: "bin", op, a, b: term() }; } return a; };
  const term = (): Ast => { let a = unary(); while (peek() === "*" || peek() === "/") { const op = next()!; a = { k: "bin", op, a, b: unary() }; } return a; };
  const unary = (): Ast => (peek() === "-" ? (next(), { k: "neg", a: unary() }) : atom());
  const atom = (): Ast => {
    const t = next();
    if (t === undefined) throw new Error(`formula "${src}" ends too early`);
    if (t === "(") { const a = expr(); expect(")"); return a; }
    if (/^\d/.test(t)) return { k: "num", v: Number(t) };
    if (/^[A-Za-z_]/.test(t)) {
      const name = t.toLowerCase();
      if (peek() === "(") {
        if (!AGGS.has(name)) throw new Error(`unknown function "${t}" (use ${[...AGGS].join(", ")})`);
        next();
        if (peek() === ")") { next(); return { k: "agg", fn: name, a: null }; }
        const a = expr(); expect(")"); return { k: "agg", fn: name, a };
      }
      if (NAMED[name]) return parse(NAMED[name].expr);
      return { k: "field", f: t };
    }
    throw new Error(`unexpected "${t}" in "${src}"`);
  };
  const a = expr();
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}" in "${src}"`);
  return a;
}
const fieldsOf = (a: Ast, out = new Set<string>()): Set<string> => {
  if (a.k === "field") out.add(a.f); else if (a.k === "bin") { fieldsOf(a.a, out); fieldsOf(a.b, out); } else if (a.k === "neg") fieldsOf(a.a, out); else if (a.k === "agg" && a.a) fieldsOf(a.a, out);
  return out;
};
const hasAgg = (a: Ast): boolean => a.k === "agg" || (a.k === "bin" && (hasAgg(a.a) || hasAgg(a.b))) || (a.k === "neg" && hasAgg(a.a));
function rowVal(a: Ast, r: Row): number | null {
  switch (a.k) {
    case "num": return a.v;
    case "field": { const v = r[a.f]; return typeof v === "number" ? v : v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null; }
    case "neg": { const v = rowVal(a.a, r); return v === null ? null : -v; }
    case "bin": { const x = rowVal(a.a, r), y = rowVal(a.b, r); if (x === null || y === null) return null; return a.op === "+" ? x + y : a.op === "-" ? x - y : a.op === "*" ? x * y : y === 0 ? null : x / y; }
    default: throw new Error("aggregate inside an aggregate");
  }
}
function groupVal(a: Ast, rows: Row[]): number | null {
  switch (a.k) {
    case "num": return a.v;
    case "neg": { const v = groupVal(a.a, rows); return v === null ? null : -v; }
    case "bin": { const x = groupVal(a.a, rows), y = groupVal(a.b, rows); if (x === null || y === null) return null; return a.op === "+" ? x + y : a.op === "-" ? x - y : a.op === "*" ? x * y : y === 0 ? null : x / y; }
    case "field": return groupVal({ k: "agg", fn: "sum", a }, rows); // a bare field inside a formula means its sum
    case "agg": {
      if (a.fn === "count") return a.a ? rows.filter((r) => rowVal(a.a!, r) !== null).length : rows.length;
      if (a.fn === "distinct") return new Set(rows.map((r) => (a.a!.k === "field" ? r[a.a!.f] : rowVal(a.a!, r))).filter((v) => v !== null && v !== undefined)).size;
      const vs = rows.map((r) => rowVal(a.a!, r)).filter((v): v is number => v !== null);
      if (!vs.length) return null;
      if (a.fn === "sum") return vs.reduce((s, v) => s + v, 0);
      if (a.fn === "avg") return vs.reduce((s, v) => s + v, 0) / vs.length;
      if (a.fn === "min") return Math.min(...vs);
      if (a.fn === "max") return Math.max(...vs);
      const s = [...vs].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    }
  }
}
function unitOf(expr: string, a: Ast, ds: Dataset): string {
  const named = NAMED[expr.trim().toLowerCase()];
  if (named) return named.unit;
  if (a.k === "agg" && a.a?.k === "field" && ["sum", "avg", "min", "max", "median"].includes(a.fn)) return ds.fields.find((f) => f.name === (a.a as any).f)?.unit ?? "";
  if (a.k === "field") return ds.fields.find((f) => f.name === a.f)?.unit ?? "";
  if (a.k === "agg") return "";
  if (/\*\s*100\b/.test(expr)) return "%";
  return "";
}

// ---- The query --------------------------------------------------------------------------------------------------
export type Filter = { field: string; op: "=" | "!=" | "in" | "not_in" | ">" | ">=" | "<" | "<=" | "between" | "contains"; value: unknown };
export type ChartQuery = {
  dataset: string; type?: ChartType; title?: string; subtitle?: string;
  x?: string; series?: string; measures: ({ expr: string; label?: string; unit?: string } | string)[];
  filters?: Filter[]; period?: string; from?: string; to?: string;
  transform?: "share" | "cumulative" | "index" | "change" | "change_pct" | "rank";
  sort?: "value_desc" | "value_asc" | "label" | "none"; limit?: number; other?: boolean;
};
export const CHART_TYPES: ChartType[] = ["pie", "donut", "bar", "hbar", "stacked", "stackedh", "grouped", "line", "area", "scatter", "table", "kpi"];
const TIME_DIMS = new Set(["month", "quarter", "year"]);
const NAME_DIMS = new Set(["vendor", "project", "campaign", "competitor", "district", "competes_with"]);
const norm = (v: unknown) => String(v ?? "").toLowerCase().trim();

function match(r: Row, f: Filter): boolean {
  const v = r[f.field];
  const eq = (a: unknown, b: unknown) => {
    if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
    const x = norm(a), y = norm(b);
    return x === y || (NAME_DIMS.has(f.field) && y.length >= 4 && x.includes(y));
  };
  const list = Array.isArray(f.value) ? f.value : String(f.value ?? "").split(/\s*,\s*/);
  switch (f.op) {
    case "=": return eq(v, f.value);
    case "!=": return !eq(v, f.value);
    case "in": return list.some((x) => eq(v, x));
    case "not_in": return !list.some((x) => eq(v, x));
    case "contains": return norm(v).includes(norm(f.value));
    case "between": { const [a, b] = list; return v !== null && String(v) >= String(a) && String(v) <= String(b); }
    default: {
      if (v === null || v === undefined) return false;
      const num = typeof v === "number", x: any = num ? v : String(v), y: any = num ? Number(f.value) : String(f.value);
      return f.op === ">" ? x > y : f.op === ">=" ? x >= y : f.op === "<" ? x < y : x <= y;
    }
  }
}

/** Run a chart query. Errors come back as text the AI can act on (it lists the valid choices). */
export function runChartQuery(qy: ChartQuery, c: QueryCtx, lang: Lang): ChartSpec | { error: string } {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const ds = DATASETS.find((d) => d.name === String(qy.dataset ?? "").toLowerCase());
  if (!ds) return { error: `Unknown dataset "${qy.dataset}". Use one of: ${DATASETS.map((d) => d.name).join(", ")}.` };
  const dsName = ds.name;
  const fieldNames = new Set(ds.fields.map((f) => f.name));
  const dims = ds.fields.filter((f) => f.kind === "dim").map((f) => f.name);
  const bad = (what: string, v: string) => ({ error: `Unknown ${what} "${v}" in dataset ${ds.name}. Dimensions: ${dims.join(", ")}. Numbers: ${ds.fields.filter((f) => f.kind === "num").map((f) => f.name).join(", ")}. Named measures: ${Object.keys(NAMED).join(", ")}.` });
  if (qy.x && !fieldNames.has(qy.x)) return bad("x", qy.x);
  if (qy.series && !fieldNames.has(qy.series)) return bad("series", qy.series);
  const ms = (qy.measures?.length ? qy.measures : ["count()"]).slice(0, 6).map((m) => (typeof m === "string" ? { expr: m } : m));
  let parsed: { expr: string; ast: Ast; label: string; unit: string }[];
  try {
    parsed = ms.map((m) => {
      const ast = parse(m.expr);
      for (const f of fieldsOf(ast)) if (!fieldNames.has(f)) throw new Error(bad("field", f).error);
      const avgOnly = ast.k === "field" && ds.fields.find((x) => x.name === (ast as any).f)?.avg;
      const wrapped: Ast = hasAgg(ast) ? ast : { k: "agg", fn: avgOnly ? "avg" : "sum", a: ast };
      return { expr: m.expr, ast: wrapped, label: m.label ?? measureLabel(m.expr, lang), unit: m.unit ?? unitOf(m.expr, ast, ds) };
    });
  } catch (e: any) { return { error: e.message }; }
  for (const f of qy.filters ?? []) if (!fieldNames.has(f.field)) return bad("filter field", f.field);

  // Rows: filters, then the period (on the month field) when the dataset has one.
  let rows = ds.rows(c).filter((r) => (qy.filters ?? []).every((f) => match(r, f)));
  let periodLabel = "";
  let periodMonths: string[] | null = null;
  if (fieldNames.has("month")) {
    const latest = latestLiveMonth(c);
    const p = qy.period ? parsePeriod(qy.period, latest) ?? lastN(qy.period, latest) : null;
    if (qy.period && !p) return { error: `Couldn't read period "${qy.period}". Use e.g. "May 2026", "Q1 2025", "2024", "last month", "year to date", "last 6 months", or from/to as YYYY-MM.` };
    if (p) { rows = rows.filter((r) => p.months.includes(String(r.month))); periodLabel = p.label; periodMonths = p.months.filter((m) => m <= latest); }
    if (qy.from) rows = rows.filter((r) => String(r.month) >= qy.from!);
    if (qy.to) rows = rows.filter((r) => String(r.month) <= qy.to!);
    if (qy.from || qy.to) { const mm = rows.map((r) => String(r.month)).sort(); periodLabel = `${qy.from ?? mm[0] ?? "…"} → ${qy.to ?? mm[mm.length - 1] ?? "…"}`; }
    if (!periodLabel && rows.length) { const mm = rows.map((r) => String(r.month)).sort(); periodLabel = mm[0] === mm[mm.length - 1] ? mm[0] : `${mm[0]} → ${mm[mm.length - 1]}`; }
  }
  if (!rows.length) return { error: T("No data matches that selection.", "لا توجد بيانات تطابق هذا الاختيار.") };

  let units: string[] = parsed.map((p) => p.unit);
  // KPI: one number per measure, no grouping.
  const type: ChartType = qy.type && CHART_TYPES.includes(qy.type) ? qy.type : !qy.x ? "kpi" : qy.series ? (TIME_DIMS.has(qy.x) ? "line" : "stacked") : TIME_DIMS.has(qy.x) ? "line" : parsed.length > 1 ? "grouped" : "bar";
  const label = (dim: string | undefined, k: string) => !dim ? k : dim === "channel" ? T(FAMILY_LABEL[k]?.[0] ?? k, FAMILY_LABEL[k]?.[1] ?? k) : NAME_DIMS.has(dim) ? nm(lang, k) : k;
  const round = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 10) / 10);
  const title = qy.title || (ds.name === "meta" ? T("Meta ads — ", "إعلانات ميتا — ") : "") + defaultTitle(qy, parsed.map((p) => p.label), lang);
  const notes: string[] = [];
  if (ds.name === "meta" && parsed.some((p) => /revenue|contracts/.test(p.expr))) notes.push(T("Meta revenue = the linked campaign's CRM-verified sales × Meta's share of that campaign's spend, per month; Meta campaigns without a campaign code (in-house, unknown agency) have none.", "إيرادات ميتا = مبيعات الحملة المرتبطة المتحقَّق منها في النظام × حصة ميتا من إنفاق تلك الحملة، شهرياً؛ حملات ميتا دون رمز حملة (داخلية أو وكالة غير معروفة) لا إيرادات لها."));
  if (ds.name === "leads" || ds.name === "creatives" || ds.name === "market" || ds.name === "competitors" || ds.name === "mortgage") notes.push(T("Sample data.", "بيانات عينة."));

  if (type === "kpi" || !qy.x) {
    const vals = parsed.map((p) => round(groupVal(p.ast, rows)));
    return finish({ type: "kpi", title, labels: parsed.map((p) => p.label), values: vals.map((v) => v ?? 0), series: [{ name: title, values: vals, unit: parsed[0].unit }], units: parsed.map((p) => p.unit) });
  }

  // Group by x (and by series when split).
  const keyX = (r: Row) => String(r[qy.x!] ?? "—");
  let xs = [...new Set(rows.map(keyX))];
  // An explicit period on a monthly axis shows every month of it, including months with no activity.
  if (qy.x === "month" && periodMonths) for (const m of periodMonths) if (!xs.includes(m)) xs.push(m);
  const timeline = TIME_DIMS.has(qy.x);

  if (type === "scatter") {
    if (parsed.length < 2) return { error: "A scatter needs two measures: the first is x, the second is y (e.g. [\"sum(spend)\", \"sum(sales)\"]), one point per x-dimension value." };
    const pts = xs.map((k) => { const rs = rows.filter((r) => keyX(r) === k); return { label: label(qy.x, k), x: round(groupVal(parsed[0].ast, rs)), y: round(groupVal(parsed[1].ast, rs)) }; })
      .filter((p) => p.x !== null && p.y !== null) as { label: string; x: number; y: number }[];
    return finish({ type, title, labels: pts.map((p) => p.label), values: pts.map((p) => p.y), points: pts, xLabel: parsed[0].label, yLabel: parsed[1].label, xUnit: parsed[0].unit, unit: parsed[1].unit, series: [] });
  }

  // Series: either the split dimension (one measure) or the measures themselves.
  let seriesKeys: string[] = qy.series ? [...new Set(rows.map((r) => String(r[qy.series!] ?? "—")))] : parsed.map((p) => p.label);
  const cell = (k: string, s: string, mi: number) => {
    const rs = rows.filter((r) => keyX(r) === k && (!qy.series || String(r[qy.series] ?? "—") === s));
    const ast = parsed[qy.series ? 0 : mi].ast;
    return rs.length ? groupVal(ast, rs) : qy.x === "month" && periodMonths?.includes(k) && ast.k === "agg" && ["sum", "count"].includes(ast.fn) ? 0 : null;
  };
  if (qy.series && parsed.length > 1) notes.push(T("With a split, only the first measure is drawn.", "مع التقسيم يُرسم المقياس الأول فقط."));
  units = qy.series ? [parsed[0].unit] : parsed.map((p) => p.unit);
  if (!qy.series && new Set(units).size > 1 && type !== "table") return { error: `These measures have different units (${units.join(", ")}): one chart has one axis. Ask for separate charts, or use type "table".` };

  let grid = seriesKeys.map((s, si) => xs.map((k) => cell(k, s, si)));
  // Sort x: time ascending; otherwise by total, largest first (or as asked).
  const totalOf = (xi: number) => grid.reduce((s, row) => s + (row[xi] ?? 0), 0);
  let order = xs.map((_, i) => i);
  const sort = qy.sort ?? (timeline ? "label" : "value_desc");
  if (sort === "label") order.sort((a, b) => xs[a].localeCompare(xs[b]));
  else if (sort === "value_desc") order.sort((a, b) => totalOf(b) - totalOf(a));
  else if (sort === "value_asc") order.sort((a, b) => totalOf(a) - totalOf(b));
  xs = order.map((i) => xs[i]); grid = grid.map((row) => order.map((i) => row[i]));

  // Additive measures fold the tail into "Other"; ratios just keep the top N.
  const additive = parsed.every((p) => p.ast.k === "agg" && ["sum", "count"].includes(p.ast.fn));
  const max = Math.max(2, Math.min(qy.limit ?? (type === "pie" || type === "donut" ? 7 : timeline ? 60 : 15), 60));
  if (!timeline && xs.length > max) {
    const keep = additive && qy.other !== false ? max - 1 : max, rest = xs.length - keep;
    if (additive && qy.other !== false) { grid = grid.map((row) => [...row.slice(0, keep), row.slice(keep).reduce<number>((s, v) => s + (v ?? 0), 0)]); xs = [...xs.slice(0, keep), `__other:${rest}`]; }
    else { grid = grid.map((row) => row.slice(0, keep)); xs = xs.slice(0, keep); notes.push(T(`Top ${keep} of ${keep + rest}.`, `أعلى ${keep} من ${keep + rest}.`)); }
  }
  // Series cap: 8 colours, never generated hues — the tail folds into "Other".
  if (seriesKeys.length > 8) {
    const tot = seriesKeys.map((_, si) => grid[si].reduce<number>((s, v) => s + (v ?? 0), 0));
    const idx = seriesKeys.map((_, i) => i).sort((a, b) => tot[b] - tot[a]);
    const keep = idx.slice(0, 7), rest = idx.slice(7);
    const other = xs.map((_, xi) => rest.reduce<number>((s, si) => s + (grid[si][xi] ?? 0), 0));
    seriesKeys = [...keep.map((i) => seriesKeys[i]), `__other:${rest.length}`]; grid = [...keep.map((i) => grid[i]), other];
  }

  // Transforms.
  const tf = qy.transform;
  if (tf === "share") grid = grid.map((row, si) => { const col = (xi: number) => grid.reduce((s, r) => s + (r[xi] ?? 0), 0); const t = row.reduce<number>((s, v) => s + (v ?? 0), 0); return row.map((v, xi) => (v === null ? null : qy.series ? (col(xi) ? (v / col(xi)) * 100 : null) : t ? (v / t) * 100 : null)); });
  if (tf === "cumulative") grid = grid.map((row) => { let s = 0; return row.map((v) => (s += v ?? 0)); });
  if (tf === "index") grid = grid.map((row) => { const b = row.find((v) => v); return row.map((v) => (v === null || !b ? null : (v / b) * 100)); });
  if (tf === "change") grid = grid.map((row) => row.map((v, i) => (i === 0 || v === null || row[i - 1] === null ? null : v - row[i - 1]!)));
  if (tf === "change_pct") grid = grid.map((row) => row.map((v, i) => (i === 0 || v === null || !row[i - 1] ? null : ((v - row[i - 1]!) / Math.abs(row[i - 1]!)) * 100)));
  if (tf === "rank") grid = grid.map((row) => { const s = [...row].map((v, i) => ({ v: v ?? -Infinity, i })).sort((a, b) => b.v - a.v); const r = row.map(() => 0); s.forEach((x, k) => (r[x.i] = k + 1)); return r; });
  const unit = tf === "share" || tf === "change_pct" ? "%" : tf === "index" ? "index" : tf === "rank" ? "rank" : units[0];
  if (tf === "index") notes.push(T("Indexed: first value = 100.", "مؤشر: القيمة الأولى = 100."));

  let t: ChartType = type;
  if ((t === "pie" || t === "donut") && (seriesKeys.length > 1 || !additive || tf === "change" || tf === "change_pct" || tf === "index" || tf === "rank" || grid[0].some((v) => (v ?? 0) < 0))) {
    notes.push(T("A pie only shows parts of one total, so this is drawn as bars.", "الرسم الدائري يعرض أجزاء إجمالي واحد فقط، لذا رُسم كأعمدة."));
    t = seriesKeys.length > 1 ? "grouped" : "bar";
  }
  // A line joins points in order, which only means something over time: categories get bars.
  if ((t === "line" || t === "area") && !timeline) { notes.push(T("Lines are for trends over time, so these categories are drawn as bars.", "الخطوط للاتجاهات عبر الزمن، لذا رُسمت هذه الفئات كأعمدة.")); t = seriesKeys.length > 1 ? "grouped" : "bar"; }
  if ((t === "stacked" || t === "stackedh") && (!additive || tf === "change" || tf === "change_pct" || tf === "index" || tf === "rank")) t = t === "stacked" ? "grouped" : "hbar";

  const oth = (k: string) => (k.startsWith("__other:") ? T(`Other (${k.slice(8)})`, `أخرى (${k.slice(8)})`) : null);
  const labels = xs.map((k) => oth(k) ?? label(qy.x, k));
  const series = seriesKeys.map((s, si) => ({ name: qy.series ? oth(s) ?? label(qy.series, s) : s, values: grid[si].map(round), unit }));
  if (TIME_DIMS.has(qy.x) && fieldNames.has("month") && xs.some((x) => x.startsWith(latestLiveMonth(c).slice(0, 4))) && qy.x !== "month") notes.push(T(`${latestLiveMonth(c).slice(0, 4)} is partial (to ${latestLiveMonth(c)}).`, `${latestLiveMonth(c).slice(0, 4)} جزئي (حتى ${latestLiveMonth(c)}).`));
  return finish({ type: t, title, labels, values: series[0].values.map((v) => v ?? 0), series, unit });

  function finish(x: Partial<ChartSpec> & { type: ChartType; title: string; labels: string[]; values: number[] }): ChartSpec {
    const UNIT_AR: Record<string, string> = { "SAR M": "مليون ر.س", "SAR K": "ألف ر.س", SAR: "ر.س", "SAR bn": "مليار ر.س", days: "يوم", index: "index", rank: "rank" };
    const loc = (v: string) => (lang === "ar" ? UNIT_AR[v] ?? v : v);
    const u = loc(x.unit ?? units[0] ?? parsed[0].unit);
    if (x.units) x.units = x.units.map(loc);
    if (x.series) x.series = x.series.map((z: any) => ({ ...z, unit: z.unit ? loc(z.unit) : z.unit }));
    const single = (x.series?.length ?? 0) <= 1 && x.type !== "kpi" && x.type !== "scatter";
    const total = single && additive && !tf && x.type !== "line" ? round(x.values.reduce((s, v) => s + v, 0)) : null;
    return {
      metric: dsName, groupBy: qy.x ?? "", unit: u, total, period: periodLabel, lang, subtitle: qy.subtitle, note: notes.join(" ") || undefined,
      xLabel: qy.x ? label(undefined, qy.x) : undefined, query: qy, ...x,
    } as ChartSpec;
  }
}

function lastN(text: string, latest: string): { months: string[]; label: string } | null {
  const W: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, "ستة": 6, "ثلاثة": 3, "ستة أشهر": 6 };
  const t = text.toLowerCase().replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)\b/g, (w) => String(W[w])).replace(/(past|previous|recent)/g, "last").replace(/half a year/g, "last 6 months").replace(/last year\b(?! of)/g, "last 12 months_");
  const m = t.match(/last (\d{1,2}) months?|آخر (\d{1,2}) (?:أشهر|شهر)|آخر (ستة|ثلاثة) أشهر/);
  if (!m) return null;
  const n = Number(m[1] ?? m[2] ?? W[m[3]]), out: string[] = [];
  let y = Number(latest.slice(0, 4)), mo = Number(latest.slice(5, 7));
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(mo).padStart(2, "0")}`); if (--mo === 0) { mo = 12; y--; } }
  return { months: out, label: `${out[0]} → ${out[out.length - 1]}` };
}

const LABELS: Record<string, [string, string]> = {
  cost_to_sales: ["Cost to sales", "نسبة التكلفة إلى المبيعات"], cpl: ["Cost per lead", "تكلفة العميل المحتمل"], cpql: ["Cost per qualified lead", "تكلفة العميل المؤهل"],
  cac: ["Cost per contract", "تكلفة العقد"], roas: ["Sales per SAR spent", "المبيعات لكل ريال"], qual_rate: ["Qualified rate", "نسبة المؤهلين"], close_rate: ["Close rate", "نسبة الإغلاق"],
  win_rate: ["Win rate", "نسبة الفوز"], ctr: ["Click-through rate", "نسبة النقر"], avg_deal: ["Average deal", "متوسط الصفقة"], overstatement: ["Reported vs CRM sales", "المُبلغ مقابل مبيعات النظام"],
  spend: ["Spend", "الإنفاق"], sales: ["Revenue", "الإيرادات"], leads: ["Leads", "العملاء المحتملون"], qualified: ["Qualified leads", "العملاء المؤهلون"], contracts: ["Contracts", "العقود"],
  viewings: ["Viewings", "المعاينات"], reservations: ["Reservations", "الحجوزات"], won: ["Won", "المكتسبة"], amount: ["Invoiced", "المبالغ المفوترة"], outstanding: ["Outstanding", "غير المسدد"],
  paid: ["Paid", "المسدد"], score: ["Fair score", "التقييم العادل"], transactions: ["Transactions", "الصفقات"], price_per_sqm: ["Price per sqm", "سعر المتر"], ads: ["Active ads", "الإعلانات النشطة"],
  impressions: ["Impressions", "مرات الظهور"], clicks: ["Clicks", "النقرات"], count: ["Count", "العدد"], invoices: ["Invoices", "الفواتير"],
  reported_sales: ["Reported sales", "المبيعات المُبلغ عنها"], reported_spend: ["Reported spend", "الإنفاق المُبلغ عنه"], reported_leads: ["Reported leads", "العملاء المُبلغ عنهم"],
  vendor: ["vendor", "المورد"], project: ["project", "المشروع"], channel: ["channel", "القناة"], campaign: ["campaign", "الحملة"], month: ["month", "الشهر"], quarter: ["quarter", "الربع"], year: ["year", "السنة"],
  season: ["season", "الموسم"], city: ["city", "المدينة"], buyerType: ["buyer type", "نوع المشتري"], nationality: ["nationality", "الجنسية"], district: ["district", "الحي"], competitor: ["competitor", "المنافس"],
  payment: ["payment status", "حالة السداد"], message: ["message", "الرسالة"], format: ["format", "التنسيق"], stage: ["stage", "المرحلة"],
};
const words = (x: string, lang: Lang = "en") => LABELS[x]?.[lang === "ar" ? 1 : 0] ?? x.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const cap1 = (x: string) => x.replace(/^\w/, (c) => c.toUpperCase());
/** A readable name for a measure formula ("sum(spend)" → "Spend", "cpql" → "Cost per qualified lead"). */
export function measureLabel(expr: string, lang: Lang = "en"): string {
  const e = expr.trim();
  if (LABELS[e.toLowerCase()]) return cap1(words(e.toLowerCase(), lang));
  const m = e.match(/^(sum|avg|min|max|median|count|distinct)\(\s*([a-z_]*)\s*\)$/i);
  if (!m) return e;
  const fn = m[1].toLowerCase(), f = m[2];
  if (fn === "count" && !f) return tx(lang, "Count", "العدد");
  const base = words(f || "count", lang);
  const pre: Record<string, [string, string]> = { avg: ["Average ", "متوسط "], min: ["Lowest ", "أدنى "], max: ["Highest ", "أعلى "], median: ["Median ", "وسيط "], distinct: ["Number of ", "عدد "], count: ["Number of ", "عدد "] };
  return cap1(pre[fn] ? tx(lang, pre[fn][0], pre[fn][1]) + (lang === "ar" ? base : base.replace(/^\w/, (c) => c.toLowerCase())) : base);
}
function defaultTitle(q: ChartQuery, ms: string[], lang: Lang) {
  const TF: Record<string, [string, string]> = { share: ["share", "الحصة"], cumulative: ["cumulative", "تراكمي"], index: ["indexed", "مؤشر"], change: ["change", "التغيّر"], change_pct: ["% change", "نسبة التغيّر"], rank: ["rank", "الترتيب"] };
  const what = ms.join(" · ") + (q.transform && TF[q.transform] ? ` (${TF[q.transform][lang === "ar" ? 1 : 0]})` : "");
  return tx(lang,
    `${what}${q.x ? ` by ${words(q.x)}` : ""}${q.series ? ` and ${words(q.series)}` : ""}`,
    `${what}${q.x ? ` حسب ${words(q.x, "ar")}` : ""}${q.series ? ` و${words(q.series, "ar")}` : ""}`);
}

/** The catalogue of datasets and fields — for the AI's prompt and GET /api/chart. */
export function chartSchema() {
  return {
    datasets: DATASETS.map((d) => ({ name: d.name, grain: d.grain, about: d.about, fields: d.fields.map((f) => ({ name: f.name, kind: f.kind === "dim" ? "dimension" : "number", ...(f.unit ? { unit: f.unit } : {}), ...(f.about ? { about: f.about } : {}) })) })),
    named_measures: Object.fromEntries(Object.entries(NAMED).map(([k, v]) => [k, `${v.about} = ${v.expr} (${v.unit})`])),
    functions: [...AGGS], operators: ["=", "!=", "in", "not_in", ">", ">=", "<", "<=", "between", "contains"],
    types: CHART_TYPES, transforms: ["share", "cumulative", "index", "change", "change_pct", "rank"],
  };
}
/** The same catalogue as compact text (fits a prompt). */
export function chartSchemaText() {
  return DATASETS.map((d) => `- ${d.name} (${d.grain}): dims ${d.fields.filter((f) => f.kind === "dim").map((f) => f.name).join(", ")}; numbers ${d.fields.filter((f) => f.kind === "num").map((f) => `${f.name}${f.unit ? ` [${f.unit}]` : ""}`).join(", ")}`).join("\n") +
    `\n- named measures: ${Object.entries(NAMED).map(([k, v]) => `${k} [${v.unit}]`).join(", ")}`;
}

/** The plotted numbers as compact text (what the AI sees after drawing, to comment accurately). */
export function chartDigest(s: ChartSpec): string {
  if (s.points) return `Points (x=${s.xLabel}, y=${s.yLabel}): ${JSON.stringify(s.points.map((p) => [p.label, p.x, p.y]))}`;
  const ser = s.series?.length ? s.series : [{ name: s.title, values: s.values }];
  if (s.type === "kpi") return `Figures: ${JSON.stringify(s.labels.map((l, i) => [l, ser[0].values[i], s.units?.[i] ?? s.unit]))}`;
  const out = ser.length === 1 ? `Values: ${JSON.stringify(s.labels.map((l, i) => [l, ser[0].values[i]]))}` : `x = ${JSON.stringify(s.labels)}; ${ser.map((x) => `${x.name}: ${JSON.stringify(x.values)}`).join("; ")}`;
  return (out.length > 6000 ? out.slice(0, 6000) + "…" : out) + (s.total !== null ? `; total ${s.total}` : "");
}

/** The built-in (no-AI) reading of a chart request: Meta requests use the Meta data; the rest the simple chart. */
export function chartFromText(text: string, c: QueryCtx, lang: Lang): ChartSpec | { error: string } {
  const q = text.toLowerCase();
  if (/\bmeta\b|facebook|instagram|ميتا|فيسبوك|انستغرام|إنستغرام/.test(q)) {
    const measure = /spend|spent|cost|budget|إنفاق|الإنفاق|صرف/.test(q) ? "sum(spend)" : /lead|عملاء/.test(q) ? "sum(leads)" : /roas|return|per sar|عائد/.test(q) ? "sum(revenue)*1000/sum(spend)" : "sum(revenue)";
    const x = /agenc|vendor|by campaign|per campaign|وكال|مورد|حملة/.test(q) && !/month|trend|over time|track|شهر|تطور/.test(q) ? (/campaign|حملة/.test(q) ? "campaign" : "agency") : "month";
    const type = /\bpie\b|دائري/.test(q) && x !== "month" ? "pie" : /\bbar|column|أعمدة/.test(q) ? "bar" : x === "month" ? "line" : undefined;
    const period = lastN(text, latestLiveMonth(c)) ? text : parsePeriod(text, latestLiveMonth(c)) ? text : undefined;
    const title = tx(lang, `Meta ads — ${measure === "sum(spend)" ? "spend" : measure === "sum(leads)" ? "leads" : measure.includes("/") ? "revenue per SAR spent" : "CRM revenue"}${x === "month" ? " by month" : ` by ${x}`}`, `إعلانات ميتا — ${measure === "sum(spend)" ? "الإنفاق" : measure === "sum(leads)" ? "العملاء المحتملون" : measure.includes("/") ? "الإيراد لكل ريال" : "إيرادات النظام"}${x === "month" ? " حسب الشهر" : ` حسب ${x === "agency" ? "الوكالة" : "الحملة"}`}`);
    const r = runChartQuery({ dataset: "meta", type: type as any, x, measures: [measure], ...(period ? { period } : {}), sort: x === "month" ? "label" : "value_desc", title }, c, lang);
    if (!("error" in r)) return r;
  }
  return buildChart(chartRequestFromText(text, c), c, lang);
}
