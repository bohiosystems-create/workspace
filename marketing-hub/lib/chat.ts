import { buildRecommendations, createDraft, type Polish, type Rec } from "./recommendations";
import { buildAgent } from "./agent";
import { buildDirector } from "./director";
import { buildOrchestration } from "./orchestrator";
import { reportsState } from "./reports";
import { metaState, metaMode } from "./meta";
import { historyState } from "./history";
import { leadProfiles } from "./audience";
import { creativesFor } from "./creatives";
import { dailyState } from "./daily";
import { type QueryCtx, resolve } from "./query";
import { extraEarly, extraLate, campaignExtras } from "./chat-extra";
import { ideasAnswer, type IdeaBrief } from "./ideation";
import { scanAnswer } from "./signals";
import { kinanOutbox, kinanMode } from "./kinan";
import { closest } from "./chat-catalog";
import { prisma } from "./prisma";
import { RX_CHART, buildChart, chartRequestFromText, chartSummary, type ChartSpec } from "./charts";
import { chartFromText } from "./chart-query";
import { type Lang, tx, K, M, nm, hrs, dt, looksArabic, NAMES_AR , an, ltr, firstSentence } from "./i18n";

// What the chat can put in front of the user besides text. Cards are rendered live from
// current data, so approving / editing an email happens in the card, never through the model.
export type ChatCard = { kind: "rec"; key: string } | { kind: "email"; id: string } | { kind: "chart"; chart: ChartSpec } | { kind: "report"; view: import("./report-layout").LayoutView };
export type ChatReply = { reply: string; cards: ChatCard[]; engine: "anthropic" | "openai" | "gemini" | "rules"; model?: string; note?: string; suggest?: string[]; missed?: boolean };


export async function buildChatContext(lang: Lang = "en") {
  const agent = await buildAgent(lang);
  const recs = await buildRecommendations(lang, agent);
  const director = await buildDirector(lang, agent);
  const orch = await buildOrchestration(lang, agent);
  const meta = metaMode() === "off" ? null : await metaState(lang);
  const history = await historyState(lang);
  const daily = await dailyState(lang);
  const [leads, creatives] = [await leadProfiles(), creativesFor(agent.mkt.campaigns as any)];
  const [deliverables, vendors, targets, trials] = await Promise.all([prisma.deliverable.findMany(), prisma.vendor.findMany(), prisma.salesTarget.findMany(), prisma.trial.findMany()]);
  const metaRaw = meta ? await prisma.metaCampaign.findMany() : [];
  const extra = { deliverables, vendors, targets, recs: recs.recommendations, orders: orch.orders, plan: director.plan, trials, metaRaw };
  const q: QueryCtx = { agent, history, daily, lang, meta, leads, creatives, extra };
  return { mkt: agent.mkt, inv: agent.inv, crm: agent.crm, recs, agent, director, orch, meta, history, daily, q, lang };
}
export type ChatContext = Awaited<ReturnType<typeof buildChatContext>>;

// Stable short ids (R1, R2…) for the recommendations as currently ranked.
export const recId = (i: number) => `R${i + 1}`;

// Compact, model-friendly snapshot (no email bodies, no internal keys).
export function snapshotForModel(c: ChatContext) {
  const { mkt, inv, recs, crm } = c;
  return {
    asOf: mkt.asOf.slice(0, 10),
    currency: "SAR (spend/amounts in K, sales in M)",
    dailyCampaignCheck: { date: c.daily.date, summary: c.daily.summary, recommendations: c.daily.recommendations.map((r) => ({ severity: r.severity, campaign: r.campaign, title: r.title, why: r.why, action: r.action, openSince: r.since, status: r.status })) },
    campaignHistory: { total: c.history.total, lessons: c.history.lessons, byChannel: c.history.byFamily.map((x) => ({ channel: x.label, campaigns: x.campaigns, costToSalesPct: x.costToSalesPct, qualPct: x.qualPct })), bySeason: c.history.bySeason.map((x) => ({ season: x.label, costToSalesPct: x.costToSalesPct })), byYear: c.history.byYear.map((x) => ({ year: x.key, spendK: x.spendK, salesM: x.salesM, costToSalesPct: x.costToSalesPct })), note: "Use get_history / get_campaign for individual past campaigns." },
    totals: { ...mkt.kpis, funnel: mkt.funnel, monthly: mkt.monthly },
    vendors: mkt.vendors.map((v) => ({
      name: v.name, category: v.category, model: v.model, contact: v.contact, contractEnd: v.contractEnd.slice(0, 10),
      spendK: v.spendK, leads: v.leads, contracts: v.contracts, salesM: v.revenueM, costToSalesPct: v.costToSalesPct,
      qualifiedRatePct: v.qualRatePct, latestResponseHrs: v.latestRespHrs, slaResponseHrs: v.slaResponseHrs,
      slaQualifiedPct: v.slaQualifiedPct, slaBreaches: v.slaBreaches, score: v.score, verdict: v.verdict,
    })),
    campaigns: mkt.campaigns.map((x) => ({
      name: x.name, vendor: x.vendor, asset: x.asset, channel: x.channel, status: x.status, budgetK: x.budgetK, spendK: x.spendK,
      pacingPct: x.pacingPct, leads: x.leads, cplSar: x.cplSar, qualifiedRatePct: x.qualRatePct, viewings: x.viewings,
      reservations: x.reservations, contracts: x.contracts, salesM: x.revenueM, cacK: x.cacK, costToSalesPct: x.costToSalesPct,
      cplTrendPct: x.cplTrendPct, attribution: x.attribution, health: x.health,
    })),
    assets: mkt.assets,
    marketingAlerts: mkt.alerts.map((a) => `${a.severity}: ${a.title}`),
    invoices: {
      kpis: inv.kpis, oracleMode: inv.integration.mode,
      vendorPayables: inv.vendors.map((v) => ({ vendor: v.name, invoicedK: v.invoicedK, deliveredK: v.deliveredK, outstandingK: v.outstandingK, overdueK: v.overdueK, unbilledK: v.unbilledK })),
      exceptions: inv.invoices.filter((r) => r.flags.length).map((r) => ({
        invoice: r.invoiceNumber, vendor: r.vendor, campaign: r.campaign, amountK: r.amountK, payment: r.payment, decision: r.decision,
        flags: r.flags.map((f) => f.text),
      })),
      deliveredNotInvoiced: inv.unbilled,
      poUtilisation: inv.purchaseOrders.filter((p) => p.utilisationPct >= 90),
    },
    crmVerification: {
      mode: crm.integration.mode, attributionGapPct: crm.integration.attributionGapPct, stages: crm.stages,
      vendors: crm.vendors.map((v) => ({ vendor: v.vendor, reportedLeads: v.reportedLeads, crmLeads: v.crmLeads, leadGapPct: v.leadGapPct, reportedContracts: v.reportedContracts, crmWon: v.crmWon, reportedSalesM: v.reportedSalesM, crmSalesM: v.crmSalesM, reportedResponseHrs: v.reportedRespHrs, crmMedianResponseHrs: v.crmRespHrs, untouchedLeads: v.untouched, verifiedCostToSalesPct: v.verifiedCostToSalesPct, flags: v.flags.map((f) => f.text) })),
    },
    director: {
      brief: c.director.brief, targets: c.director.targets, budgetPlan: c.director.plan, waitingForDecision: c.director.inbox.map((x) => ({ title: x.title, minutes: x.minutes })), managerMinutes: c.director.managerMinutes,
      metaAttribution: c.meta ? { summary: c.meta.summary, accounts: c.meta.accounts, campaigns: c.meta.campaigns.map((x) => ({ name: x.name, account: x.account, createdBy: x.creator, spendK: x.spendK, leads: x.leads, utm: x.utm, attributedTo: x.kind === "VENDOR" ? `${x.vendor} ${x.code ?? ""}` : x.kind, confidence: x.confidence, evidence: x.signals, flags: x.flags.map((f) => f.text), needsReview: x.needsReview })) } : null,
      vendorOrchestration: { summary: c.orch.summary, escalations: c.orch.escalations.map((x) => x.title), workOrders: c.orch.orders.map((x) => ({ vendor: x.vendor, kind: x.kind, title: x.title, status: x.status, overdue: x.overdue, routine: x.routine, checks: x.checks.map((k) => `${k.state}: ${k.label}`) })), deliverables: c.orch.deliverables.map((x) => ({ vendor: x.vendor, item: x.title, due: x.due.slice(0, 10), state: x.state, reminders: x.chases })) },
      campaignRecommendations: c.director.campaignRecs.map((x) => ({ title: x.title, severity: x.severity, why: x.why, impactK: x.impactK, action: x.channel === "EMAIL" ? "draft vendor email" : x.href })),
      campaignQualityFromCrm: c.director.campaignQuality.map((x) => ({ code: x.code, score: x.qualityScore, verdict: x.verdict })),
    },
    fairScorecard: {
      method: c.agent.method,
      vendors: c.agent.scores.map((x) => ({ vendor: x.vendor, channel: x.category, score: x.score, range: `${x.low}-${x.high}`, confidence: x.confidence, rank: x.rank, trend: x.trend, incrementalShare: x.incrementalShare, incrementalEvidence: x.incrementalEvidence, metrics: x.metrics.map((m) => ({ metric: m.key, actual: m.actual, benchmark: m.benchmark, points: m.points })) })),
    },
    renewalDecisions: c.agent.decisions.map((d) => ({ vendor: d.vendor, decision: d.decision, confidence: d.confidence, why: d.confidenceWhy, headline: d.headline, evidence: d.evidence, wouldChange: d.wouldChange, nextStep: d.nextStep, targets: d.targets, alternatives: d.alternatives })),
    incrementality: {
      tests: c.agent.incrementality.tests.map((t) => ({ name: t.name, vendor: t.vendor, kind: t.kind, status: t.status, readout: t.readout, minDetectableLiftPct: t.mdePct })),
      mediaMixModel: c.agent.incrementality.mmm && { notes: c.agent.incrementality.mmm.notes, r2: c.agent.incrementality.mmm.r2, channels: c.agent.incrementality.mmm.channels },
    },
    trials: c.agent.bench.trials.map((t) => ({ challenger: t.challenger, incumbent: t.incumbent, status: t.status, origin: t.origin, budgetK: t.budgetK, weeks: t.weeks, readout: t.readout, decision: t.decision })),
    bench: c.agent.bench.bench.map((b) => ({ vendor: b.name, channel: b.category, status: b.status, terms: b.rateNote })),
    dataSources: { sources: c.agent.unified.sources, discrepancies: c.agent.unified.flags.map((f) => `${f.vendor}: ${f.text}`) },
    recommendations: recs.recommendations.map((r, i) => ({
      id: recId(i), type: r.type, severity: r.severity, vendor: r.vendor, title: r.title, rationale: r.rationale,
      impactK: r.impactK, handling: r.channel === "EMAIL" ? "email to vendor (needs human approval)" : "internal decision", state: r.state,
    })),
  };
}

// ------------------------------------------------------------- tool helpers
export function recCards(c: ChatContext, ids: string[]): ChatCard[] {
  return ids
    .map((id) => Number(id.replace(/\D/g, "")) - 1)
    .filter((i) => i >= 0 && i < c.recs.recommendations.length)
    .map((i) => ({ kind: "rec" as const, key: c.recs.recommendations[i].key }));
}

// Creates a DRAFT only. Sending is a separate, human-approved step in the UI.
export async function draftForRec(c: ChatContext, id: string, polish?: Polish, draftLang?: Lang): Promise<{ ok: boolean; message: string; card?: ChatCard }> {
  const i = Number(id.replace(/\D/g, "")) - 1;
  const rec: Rec | undefined = c.recs.recommendations[i];
  if (!rec) return { ok: false, message: `No recommendation ${id}.` };
  if (rec.channel !== "EMAIL") return { ok: false, message: `${id} is an internal decision, not an email to the vendor.` };
  if (rec.state === "SENT") return { ok: false, message: `An email for ${id} was already sent.` };
  if (rec.state !== "DRAFTED") {
    try { await createDraft(rec.key, polish, c.lang, draftLang); } catch (e: any) { return { ok: false, message: e.message }; }
  }
  const fresh = await buildRecommendations(c.lang);
  const email = fresh.outbox.find((e) => e.recKey === rec.key && e.status !== "REJECTED");
  if (!email) return { ok: false, message: "Draft could not be created." };
  return { ok: true, message: `Draft created for ${rec.vendor}: "${email.subject}". It has NOT been sent; the user must review and approve it.`, card: { kind: "email", id: email.id } };
}

// ----------------------------------------------------------- rules answerer
const STOP = new Set(["the", "and", "for", "of", "a", "to", "in", "on", "is", "are", "what", "how", "about", "tell", "me", "show", "my", "our", "with", "campaign", "campaigns", "حملة", "حملات", "في", "من", "على", "عن", "إلى", "ما", "هل", "كيف", "لي", "هو", "هي"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF ]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
const GENERIC_AR = new Set(["شبكة", "السعودية", "للإعلانات", "الخارجية", "للتأثير", "للاتصالات", "للوساطة", "ديجيتال"]);
const GENERIC_EN = ["digital", "network", "communications", "influence", "brokerage", "outdoor"];

function findVendor(q: string, c: ChatContext) {
  const ql = q.toLowerCase();
  return c.mkt.vendors.find((v) => ql.includes(v.name.toLowerCase()) || (NAMES_AR[v.name] && q.includes(NAMES_AR[v.name]))) ??
    c.mkt.vendors.find((v) => tokens(v.name).some((t) => t.length > 4 && ql.includes(t) && !GENERIC_EN.includes(t))) ??
    c.mkt.vendors.find((v) => tokens(NAMES_AR[v.name] ?? "").some((t) => !GENERIC_AR.has(t) && q.includes(t))) ?? null;
}
function findCampaign(q: string, c: ChatContext) {
  const qt = new Set(tokens(q));
  let best: { c: (typeof c.mkt.campaigns)[number]; score: number } | null = null;
  for (const x of c.mkt.campaigns) {
    const score = new Set([...tokens(`${x.name} ${x.channel}`), ...tokens(`${nm("ar", x.name)} ${nm("ar", x.channel)}`)]).size && [...new Set([...tokens(`${x.name} ${x.channel}`), ...tokens(`${nm("ar", x.name)} ${nm("ar", x.channel)}`)])].filter((t) => qt.has(t)).length;
    if (score >= 2 && (!best || score > best.score)) best = { c: x, score };
  }
  return best?.c ?? null;
}

const TYPE_URGENCY = (l: Lang, sev: string) => (sev === "crit" ? tx(l, "urgent", "عاجلة") : sev === "warn" ? tx(l, "important", "مهمة") : tx(l, "FYI", "للعلم"));
const recLine = (l: Lang, r: Rec, i: number) => `- **${recId(i)}** [${TYPE_URGENCY(l, r.severity)}] ${r.title}${r.impactK ? ` (${K(l, r.impactK)})` : ""}`;
const n = (l: Lang, x: number | null | undefined, suf = "") => (x === null || x === undefined ? tx(l, "n/a", "غير متاح") : `${x}${suf}`);

// Arabic and English intent patterns.
const RX = {
  draft: /\b(draft|write|compose|email|e-mail|mail)\b|مسودة|اكتب|صياغة|رسالة|بريد|إيميل|ايميل|راسل|خاطب/,
  recs: /recommend|خطوات|what should|next step|priorit|to.?do|action|what now|first\b|urgent|advice|suggest|توصي|ماذا (أفعل|أعمل|يجب)|ما العمل|أولوي|الأهم|اقتراح|نصيح|من أين أبدأ|أبدأ/,
  invoices: /invoice|we owe|owe (the |our )?(vendors|agencies|suppliers)|overdue|unbill|payable|overbill|overcharg|double.?bill|billing|billed|unpaid|oracle|\bpo\b|purchase order|payment(?!.?plan)|pay\b|فاتور|فواتير|متأخر|مستحق|أمر شراء|أوامر الشراء|اوراكل|أوراكل|سداد|دفع/,
  contracts: /contract|renew|expir|agreement|عقد|عقود|تجديد|ينتهي|انتهاء|تنتهي/,
  salesWords: /contracts?\s*(signed|closed|count)|sales|مبيعات|موقّع|موقع|صفقات/,
  best: /best|top|per sale|per contract|costing|most expensive|أنجح|الأنجح|أكفأ|strong|convert|winner|perform|efficien|value for money|worth|worst|weak|bad|under|poor|lowest|cheapest|expensive|أفضل|الأفضل|أقوى|يحوّل|يحول|أسوأ|الأسوأ|ضعيف|أضعف|الأداء|أداء/,
  totals: /spend|sales|revenue|lead|funnel|conversion|cac|total|overall|summary|how are we|how is|إنفاق|الإنفاق|مبيعات|المبيعات|إيراد|عملاء محتملين|مسار|تحويل|إجمالي|ملخص|كيف حال|كيف نحن|الوضع/,
  brief: /\bbrief\b|today|focus|status|how are we|update|target|on track|behind|forecast|موجز|اليوم|التركيز|الوضع|المستهدف|الأهداف|متأخر|التوقع/,
  plan: /budget plan|allocation|allocate|(move|shift|put|spend) (the |our |more |extra )?(budget|money)|where .{0,20}(budget|money) (go|should)|next month|june|reallocat|خطة الميزانية|الميزانية|توزيع|الشهر القادم|يونيو/,
  approvals: /approv|waiting|inbox|pending|sign.?off|decide|بانتظار|اعتماد|موافقة|قرارات معلقة/,
  kinan: /kinan|yardi|كنان|ياردي/,
  campaignRecs: /campaign recommendation|which campaigns? (should|to|do we|would you) (get |be )?(cut|paus|stop|kill)|change (in|to|on) (the |our |my )?campaigns|which campaigns (should|to|need)|what (should|do) (i|we) change|توصيات الحملات|ماذا (أغيّر|أغير|نغيّر|نغير)|أي الحملات/,
  meta: /\bmeta\b|facebook|instagram|(which|what) agency (runs|created|is running|manages|made|is behind|owns)|who (runs|created|is running|made)|agency behind|ميتا|فيسبوك|فيس بوك|انستغرام|إنستغرام|أي وكالة|من أنشأ|من يدير|الوكالة التي/,
  report: /daily report|scheduled report|morning report|reports? schedule|التقرير اليومي|تقرير يومي|التقارير المجدولة|جدول التقارير/,
  orch: /orchestrat|work orders?|vendors? owe|owe us|deliverables?|late from|(is|are|running) late|behind schedule|(hasn'?t|haven'?t|didn'?t|not) deliver|deliver(ed)? (on time|late)|missed (a )?deadline|ما المتأخر من|المتأخر من الموردين|تأخر الموردين|لم يسلّم|لم يسلم|لم يسلموا|chas(e|ing)|remind|vendor briefs?|briefs? (to|for) (the )?vendors|what are (the )?vendors doing|my time|how much time|تنسيق|أوامر العمل|التسليمات|تسليمات|تذكير|موجزات الموردين|وقتي|كم من الوقت|يدين به الموردون|يدينون/,
  renewal: /renew|decision|exit|\bkeep\b|renegotiat|performance plan|replace|re-?engage|keep or drop|drop |fire |تجديد|نجدد|نجدّد|يجدد|التجديد|نستغني|نستمر|نبقي|قرار|الخروج|إنهاء|إعادة التفاوض|خطة أداء|استبدال|الاستغناء/,
  incr: /incremental|holdout|geo test|actually (cause|drive|work|bring)|really (cause|drive|work)|cause[sd]? (sales|leads)|would .{0,20}anyway|\bmmm\b|media.?mix|caused|lift|would have happened anyway|الأثر الإضافي|أثر إضافي|اختبار|مزيج الإعلام|المجموعة المستبعدة/,
  trials: /trial|bench|alternative|\brfp\b|re-?bid|challenger|تجربة|تجارب|بديل|بدائل|طلب عروض|منافس/,
  score: /score|rank|fair|compare|benchmark|تقييم|ترتيب|مقارنة|معيار/,
  crm: /\bcrm\b|lying|\blie\b|cheat|honest|manipulat|padd(ing|ed)|verif|reconcil|fake|spam|duplicate|\breal\b|genuine|inflat|accurate|trust (the|their|vendor) (numbers|leads|reports)|match yardi|attribution|response time|first response|نظام إدارة|إدارة العملاء|سي ?ار ?ام|تحقق|مطابقة|مزيف|وهمي|تكرار|الإسناد|زمن الاستجابة|الاستجابة|استجابة/,
  ar: /in arabic|بالعربية|بالعربي|عربي/,
  en: /in english|بالإنجليزية|بالانجليزية|بالانجليزي/,
};

const RX_IDEA = /\bideas?\b|plan something|something (for|around) (the )?(summer|ramadan|eid|national day|cityscape|holidays?|season|launch)|brainstorm|ideate|campaign concepts?|initiatives?|new campaign|plan a campaign|(need|want|run|launch|do) (a |an )?(new )?campaign (for|around|on)|come up with|what campaign (would|should|could|to)|campaign (idea|plan)s? for|next campaign|(suggest|propose|design|create) (a |an |some )?(new )?campaigns?|أفكار|فكرة|مبادرات|مبادرة|عصف ذهني|حملة جديدة|اقترح (حملة|حملات)|صمم حملة|خطط لحملة/;
const RX_SIGNALS = /why (did|are|is|have|has|were)\b[^?]{0,60}(drop|down|fall|fell|declin|dip|slow)|what('s| is) (going on|happening|wrong) with|لماذا (انخفض|تراجع|انخفضت|تراجعت)|ما الذي يحدث (مع|في)|anomal|unusual (drop|fall|change|dip|decline|surge)|(sudden|sharp) (drop|fall|dip)|(drop|decline|fall|dip)s? in (leads|sales|contracts|qualified)|(leads|sales|contracts) (are )?(dropping|falling|declining|down)|what does the (crm|data) show|what did the (daily )?scan find|(crm|data) (signals?|alerts?|anomal)|anything unusual|daily scan|شذوذ|غير معتاد|غير طبيعي|(انخفاض|تراجع) (مفاجئ )?(في )?(العملاء|المبيعات|العقود)|ماذا يظهر النظام/;
const RX_EXIT = /terminat|end (the |our |their )?(contract|relationship)|cancel (the |our |their )?contract|\bfire\b|let .{0,12} go\b(?! to)|let go\b|stop working with|get rid of|part ways|cut ties|(drop|replace|remove|cut) (a|one|which) (vendor|agency)|إنهاء (عقد|العقد|التعاقد|التعامل)|ننهي|نوقفه|نوقفها|إيقاف التعامل|فسخ|نستغني|الاستغناء|نوقف التعامل|نتخلص/;
// "Which agency would you exit / replace?" — a selection word, a vendor word and an exit verb anywhere in the question.
const isExitQ = (q: string) => RX_EXIT.test(q) ||
  (/(vendor|agenc|supplier|partner|مورد|وكال)/.test(q) && /\b(exit|drop|replace|cut|remove|lose|dump|ditch)\b|استبدال|استبدالها|نستبدل|نستغني/.test(q) && /which|what|who|any|should|weakest|worst|recommend|suggest|advise|أي|من |هل|ينبغي|يجب/.test(q));
/** Read a campaign brief from free text: project, month or season, budget, goal. */
export function briefFromText(text: string, c: ChatContext): IdeaBrief {
  const q = text.toLowerCase();
  const project = resolve(text, c.q).find((e) => e.kind === "project")?.name;
  const year = q.match(/\b(2026|2027)\b/)?.[1];
  const MONTHS = ["january|jan", "february|feb", "march|mar", "april|apr", "may", "june|jun", "july|jul", "august|aug", "september|sept|sep", "october|oct", "november|nov", "december|dec"];
  const AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  let mi = MONTHS.findIndex((m) => new RegExp(`\\b(${m})\\b`).test(q));
  if (mi < 0) mi = AR.findIndex((m) => text.includes(m));
  let month: string | undefined;
  if (mi >= 0) { const m = String(mi + 1).padStart(2, "0"); month = `${year ?? (mi + 1 > 6 ? "2026" : "2027")}-${m}`; }
  else if (/ramadan|رمضان/.test(q)) month = `${year ?? "2027"}-02`;
  else if (/summer|الصيف|صيف/.test(q)) month = `${year ?? "2026"}-07`;
  else if (/cityscape|expo season|سيتي سكيب/.test(q)) month = `${year ?? "2026"}-11`;
  const bm = q.match(/(?:sar\s*)?(\d{2,5})\s*(k\b|ألف|الف)/) ?? q.match(/budget (?:of )?(?:sar\s*)?(\d{2,5})\b/);
  const mm = q.match(/(?:sar\s*)?(\d+(?:\.\d+)?)\s*(m\b|million|مليون)/);
  const budgetK = bm ? Number(bm[1]) : mm ? Math.round(Number(mm[1]) * 1000) : undefined;
  const goal = /launch|إطلاق|اطلاق/.test(q) ? "LAUNCH" : /awareness|brand|الوعي|العلامة/.test(q) ? "AWARENESS" : /leads|عملاء/.test(q) ? "LEADS" : /sales|close|مبيعات|إغلاق/.test(q) ? "SALES" : undefined;
  return { project, month, budgetK, goal, notes: text.slice(0, 300) };
}

export async function localAnswer(question: string, ctx?: ChatContext, polish?: Polish, uiLang?: Lang): Promise<ChatReply> {
  const lang: Lang = looksArabic(question) ? "ar" : /[A-Za-z]{3,}/.test(question) ? "en" : uiLang ?? "en";
  // 0. Changes to the daily report ("remove the invoices section", "move risks to the top", "undo").
  const edit = await (await import("./report-chat")).reportEditAnswer(question, lang, async () => (ctx && ctx.lang === lang ? ctx : buildChatContext(lang)), { allowUnclear: true });
  if (edit) return edit;
  const c = ctx && ctx.lang === lang ? ctx : await buildChatContext(lang);
  const q = question.toLowerCase();
  const { mkt, inv, recs, crm } = c;
  const L = lang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const N = (x: string) => nm(L, x);
  const cards: ChatCard[] = [];
  // Every built-in answer offers the closest questions it knows, so a misread question is one click from the right one.
  const done = (reply: string, missed = false): ChatReply => ({ reply, cards, engine: "rules", suggest: closest(question, L, 3), ...(missed ? { missed } : {}) });
  const active = recs.recommendations.map((r, i) => ({ r, i })).filter((x) => x.r.state === "OPEN" || x.r.state === "DRAFTED");
  const cardsOf = (types: string[], max: number) => cards.push(...active.filter((x) => types.includes(x.r.type)).slice(0, max).map((x) => ({ kind: "rec" as const, key: x.r.key })));

  const vendor = findVendor(question, c);
  const byCode = resolve(question, c.q).find((e) => e.kind === "campaign");
  const campaign = findCampaign(question, c) ?? (byCode && byCode.kind === "campaign" ? mkt.campaigns.find((x) => x.id === byCode.id) ?? null : null);
  const recRef = q.match(/\br\s?(\d{1,2})\b/);
  const draftLang: Lang | undefined = RX.ar.test(question) || RX.ar.test(q) ? "ar" : RX.en.test(q) ? "en" : undefined;

  // 1. Draft an email (explicit request).
  if (RX.draft.test(question.toLowerCase()) && (vendor || recRef || /worst|first|top|most urgent|الأسوأ|الأهم|الأول/.test(q))) {
    let targets = active.filter((x) => x.r.channel === "EMAIL");
    if (recRef) targets = targets.filter((x) => x.i === Number(recRef[1]) - 1);
    else if (vendor) targets = targets.filter((x) => x.r.vendorId === mkt.vendors.find((v) => v.name === vendor.name)!.id);
    else targets = targets.slice(0, 1);
    if (targets.length === 0) return done(T(`There is nothing to email ${vendor ? vendor.name : "about"} right now — no open recommendation needs a vendor email.`, `لا يوجد ما يستدعي مراسلة ${vendor ? N(vendor.name) : "أي مورد"} حالياً — لا توجد توصية مفتوحة تحتاج رسالة إلى المورد.`));
    if (targets.length === 1) {
      const d = await draftForRec(c, recId(targets[0].i), polish, draftLang);
      if (d.card) cards.push(d.card);
      return done(d.ok
        ? T(`I've drafted it (${recId(targets[0].i)}: ${targets[0].r.title}). Nothing has been sent — review the message below, edit it if you like, then approve to send.`, `أعددت المسودة (${recId(targets[0].i)}: ${targets[0].r.title}). لم يُرسل شيء — راجعوا الرسالة أدناه وعدّلوها إن شئتم، ثم اعتمدوها للإرسال.`)
        : d.message);
    }
    cards.push(...targets.map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(T(`There are ${targets.length} open items for ${vendor?.name ?? "that vendor"}. Which one should I draft an email for? Use "Draft email" on the card, or say e.g. "draft R${targets[0].i + 1}".`, `هناك ${an(targets.length, "بند واحد", "بندان", "بنود", "بنداً")} مفتوحة لـ${vendor ? N(vendor.name) : "هذا المورد"}. أيّها أُعدّ له رسالة؟ استخدموا زر «مسودة بريد» في البطاقة، أو قولوا مثلاً «اكتب R${targets[0].i + 1}».`));
  }

  // 1. Charts from a prompt ("pie chart of revenue by vendor"). Numbers computed from the data, never typed in.
  if (RX_CHART.test(q)) {
    const spec = chartFromText(question, c.q, L);
    if ("error" in spec) return done(spec.error);
    cards.push({ kind: "chart", chart: spec });
    return done(chartSummary(spec) + T("\n\nSwitch the chart type or download it (PNG or SVG) under the chart.", "\n\nغيّروا نوع الرسم أو نزّلوه (PNG أو SVG) أسفل الرسم."));
  }

  // 1a. Market initiatives ("ideas for a Ramadan campaign for Marina Tower, SAR 300K"); they also answer CRM signals.
  if (RX_IDEA.test(q)) return done(await ideasAnswer(briefFromText(question, c), L));
  // 1a'. CRM anomalies ("any unusual drop in leads?", "what does the CRM show?").
  if (RX_SIGNALS.test(q)) {
    const proj = resolve(question, c.q).find((e) => e.kind === "project")?.name ?? null;
    // "What's going on with X" is only a scan question when X is a project; a vendor or campaign gets its own card.
    if (proj || !/going on|happening|wrong with|ما الذي يحدث/.test(q)) return done(await scanAnswer(L, proj));
  }

  // 1b. Help, definitions, daily check, comparisons, periods and the campaign history.
  const early = extraEarly(question, c);
  if (early) return done(early);

  // 1c. "Which vendor should we terminate / drop / replace, and why?" — the renewal decisions, worst first.
  if (isExitQ(q)) {
    const RANK: Record<string, number> = { EXIT: 0, TEST_REPLACEMENT: 1, PERFORMANCE_PLAN: 2, RENEGOTIATE: 3, RE_ENGAGE: 4 };
    const CF: Record<string, string> = { High: T("high", "عالية"), Medium: T("medium", "متوسطة"), Low: T("low", "منخفضة") };
    const all = c.agent.decisions.filter((d) => !vendor || d.vendor === vendor.name).slice().sort((a, b) => RANK[a.decision] - RANK[b.decision]);
    const out = all.filter((d) => d.decision === "EXIT" || d.decision === "TEST_REPLACEMENT");
    const score = (id: string) => c.agent.scores.find((x) => x.vendorId === id)?.score;
    const names = new Set((out.length ? out : all.slice(0, 1)).map((d) => d.vendor));
    cards.push(...active.filter((x) => x.r.type === "RENEWAL" && names.has(x.r.vendor)).slice(0, 4).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    const block = (d: (typeof all)[number]) =>
      `**${N(d.vendor)}** (${d.category}) — **${d.headline}** · ${T("score", "التقييم")} ${score(d.vendorId) ?? "—"}/100 · ${T("confidence", "الثقة")} ${CF[d.confidence]}\n` +
      `${T("Why", "السبب")}:\n${d.evidence.slice(0, 5).map((e) => `- ${e}`).join("\n")}\n` +
      `${T("Contract ends", "ينتهي العقد")} ${dt(L, d.contractEnd)} (${T(`${d.monthsToExpiry} month${d.monthsToExpiry === 1 ? "" : "s"}`, an(d.monthsToExpiry, "شهر واحد", "شهران", "أشهر", "شهراً"))})` +
      (d.alternatives.length ? T(`; replacement on the bench: ${d.alternatives.map(N).join(", ")}`, `؛ البديل المتاح: ${d.alternatives.map(N).join("، ")}`) : "") + ".\n" +
      `${T("Next step", "الخطوة التالية")}: ${d.nextStep}\n${T("What would change this", "ما الذي قد يغيّر القرار")}: ${d.wouldChange}`;
    if (!out.length) {
      const d = all[0];
      return done(d ? (vendor ? T(`I wouldn't terminate ${N(vendor.name)} right now — the evidence supports a different decision:\n\n`, `لا أنصح بإنهاء عقد ${N(vendor.name)} الآن — الأدلة تدعم قراراً آخر:\n\n`) : T("I wouldn't terminate any vendor right now — none has reached an exit or replacement decision. The weakest:\n\n", "لا أنصح بإنهاء عقد أي مورد الآن — لم يصل أي مورد إلى قرار الخروج أو الاستبدال. الأضعف:\n\n")) + block(d) : T("No vendor decisions yet.", "لا توجد قرارات بعد."));
    }
    const head = out[0];
    return done(
      T(`**My recommendation: ${head.decision === "EXIT" ? "terminate" : "start replacing"} ${N(head.vendor)}.**${out.length > 1 ? ` ${out.slice(1).map((d) => N(d.vendor)).join(", ")} ${out.length > 2 ? "are" : "is"} next in line (${out.slice(1).map((d) => d.headline.toLowerCase()).join("; ")}).` : ""}\n\n`,
        `**توصيتي: ${head.decision === "EXIT" ? "إنهاء العقد مع" : "البدء باستبدال"} ${N(head.vendor)}.**${out.length > 1 ? ` ويليه ${out.slice(1).map((d) => N(d.vendor)).join("، ")}.` : ""}\n\n`) +
      out.map(block).join("\n\n") +
      T("\n\nThis is a recommendation, not an action: nothing is cancelled and no vendor is contacted until a named approver signs off. Check the contract's notice period with procurement before deciding.",
        "\n\nهذه توصية وليست إجراءً: لا يُلغى شيء ولا يُراسل أي مورد قبل اعتماد مسؤول مسمّى. راجعوا مدة الإشعار في العقد مع المشتريات قبل القرار."));
  }

  // 2a. Campaign recommendations (the brief's campaign section).
  if (RX.campaignRecs.test(q) && !vendor) {
    const crs = c.director.campaignRecs;
    cards.push(...crs.slice(0, 5).map((x) => ({ kind: "rec" as const, key: x.key })));
    return done(T(`**Campaign recommendations** — ${crs.length} open, ${crs.filter((x) => x.severity === "crit").length} urgent\n`, `**توصيات الحملات** — ${crs.length} مفتوحة، ${crs.filter((x) => x.severity === "crit").length} عاجلة\n`) +
      crs.slice(0, 8).map((x, i) => `${i + 1}. ${x.severity === "crit" ? T("[urgent] ", "[عاجل] ") : ""}**${x.title}** — ${firstSentence(x.why)}`).join("\n") +
      T("\n\nPause or move budget on Campaigns; vendor emails are drafted for your approval (use the cards).", "\n\nأوقفوا أو انقلوا الميزانية من صفحة الحملات؛ وتُعدّ رسائل الموردين لاعتمادكم (استخدموا البطاقات)."));
  }

  // 2. Recommendations / next steps.
  if (RX.recs.test(question.toLowerCase()) && !vendor) {
    const top = active.slice(0, 5);
    cards.push(...top.map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(T(
      `There are ${active.length} open recommendations. The most important:\n${top.map((x) => recLine(L, x.r, x.i)).join("\n")}\n\nI can draft the vendor email for any of them — say "draft R${(top[0]?.i ?? 0) + 1}" or use the button on a card. Emails are only sent after you approve them.`,
      `هناك ${an(active.length, "توصية واحدة", "توصيتان", "توصيات", "توصية")} مفتوحة. الأهم:\n${top.map((x) => recLine(L, x.r, x.i)).join("\n")}\n\nيمكنني إعداد رسالة المورد لأي منها — قولوا «اكتب R${(top[0]?.i ?? 0) + 1}» أو استخدموا الزر في البطاقة. لا تُرسل أي رسالة إلا بعد اعتمادكم لها.`));
  }

  const CONF: Record<string, string> = { High: T("high", "عالية"), Medium: T("medium", "متوسطة"), Low: T("low", "منخفضة") };
  const ag = c.agent;

  const dr = c.director;
  // 2a. Director: daily report, vendor orchestration, brief, targets, plan, approvals, Kinan feed.
  if (RX.meta.test(q) && c.meta) {
    const m = c.meta, s = m.summary;
    const KIND: Record<string, string> = { VENDOR: "", IN_HOUSE: T("in-house", "داخلي"), UNKNOWN_AGENCY: T("NOT one of your agencies", "ليست من وكالاتكم"), CONFLICT: T("unclear — conflicting evidence", "غير واضح — أدلة متعارضة"), UNRESOLVED: T("unknown", "غير معروف") };
    const CF: Record<string, string> = { HIGH: T("high confidence", "ثقة عالية"), MEDIUM: T("medium confidence", "ثقة متوسطة"), LOW: T("low confidence", "ثقة منخفضة") };
    const vid = vendor ? mkt.vendors.find((v) => v.name === vendor.name)?.id : undefined;
    // A question about one campaign ("who created the Andalus retargeting campaign?") gets just that campaign.
    const words = (x: string) => x.toLowerCase().split(/[^a-z0-9\u0600-\u06ff-]+/).filter((w) => w.length >= 4);
    const qw = new Set(words(q));
    const scored = m.campaigns.map((x) => ({ x, n: words(x.name).filter((w) => qw.has(w)).length })).sort((a, b) => b.n - a.n);
    const one = scored[0] && scored[0].n >= 2 && (!scored[1] || scored[1].n < scored[0].n) ? [scored[0].x] : null;
    const rows = one ?? m.campaigns.filter((x) => !vid || x.vendorId === vid || x.suggested.includes(vid));
    return done(
      T(`**Meta ads — who runs what** (${m.mode})\n${s.campaigns} campaigns, ${K(L, s.spendK)} spent; **${s.attributedPct}%** attributed to an agency. ${s.needsReview} need your confirmation.\n\n`,
        `**إعلانات ميتا — من يدير ماذا** (${m.mode})\n${s.campaigns} حملات، أُنفق ${K(L, s.spendK)}؛ **${s.attributedPct}%** منسوبة إلى وكالة. ${s.needsReview} بحاجة إلى تأكيدكم.\n\n`) +
      rows.slice(0, 10).map((x) => `- ${x.needsReview ? "⚠ " : ""}**${x.name}** — ${x.kind === "VENDOR" ? `${x.vendor}${x.code ? ` · ${x.code}` : ""} (${x.review === "CONFIRMED" ? T(`confirmed by ${x.reviewedBy}`, `أكّده ${x.reviewedBy}`) : CF[x.confidence]})` : KIND[x.kind]} · ${K(L, x.spendK)}\n  ${[...x.signals, ...x.flags.filter((f) => !["IN_HOUSE", "UNKNOWN_AGENCY"].includes(f.code)).map((f) => f.text)].join(T("; ", "؛ "))}`).join("\n") +
      T("\n\nHow I tell: the campaign code in the name, the utm_campaign on the ads, who created it (Meta activity log) and who owns the ad account. Confirm or correct on Campaigns → Meta ads.", "\n\nكيف أحدد: رمز الحملة في الاسم، وutm_campaign على الإعلانات، ومن أنشأها (سجل نشاط ميتا)، ومن يملك الحساب الإعلاني. أكّدوا أو صحّحوا من الحملات ← إعلانات ميتا."));
  }
  if (RX.report.test(q)) {
    const r = await reportsState(L);
    const s = r.schedule, last = r.reports[0];
    const days = s.days.map((i) => T(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i], ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][i])).join(T(", ", "، "));
    return done(
      T(`**Daily report** — ${s.enabled ? `on, ${s.time} (${s.timezone}), ${days}` : "paused"}; to ${s.recipients || "nobody yet"}${s.toKinan ? ", with a copy of the brief to Kinan's sales agent" : ""}.\n`,
        `**التقرير اليومي** — ${s.enabled ? `مفعّل، الساعة ${s.time} (${s.timezone})، ${days}` : "متوقف"}؛ إلى ${s.recipients || "لا أحد بعد"}${s.toKinan ? "، مع نسخة من الموجز إلى وكيل كنان" : ""}.\n`) +
      (r.next ? T(`Next: ${dt("en", r.next.date)} at ${r.next.time}.\n`, `التالي: ${dt("ar", r.next.date)} الساعة ${r.next.time}.\n`) : "") +
      (last ? T(`Last: ${last.title} — ${last.status.toLowerCase()}${last.delivery === "mock" ? " (simulated)" : ""}.\n`, `الأخير: ${last.title} — ${({ SENT: "أُرسل", GENERATED: "أُعدّ", FAILED: "فشل" } as Record<string, string>)[last.status] ?? last.status}${last.delivery === "mock" ? " (تجريبي)" : ""}.\n`) : T("No report yet.\n", "لا تقارير بعد.\n")) +
      T("\nChange the time, days or recipients, preview or send it now on the Reports page.", "\nغيّروا الوقت أو الأيام أو المستلمين، أو اعرضوه أو أرسلوه الآن من صفحة التقارير."));
  }
  if (RX.orch.test(q)) {
    const o = c.orch, vid = vendor ? mkt.vendors.find((v) => v.name === vendor.name)?.id : undefined;
    const orders = o.orders.filter((x) => !vid || x.vendorId === vid), dels = o.deliverables.filter((x) => !vendor || x.vendor === vendor.name);
    const ST: Record<string, string> = { PROPOSED: T("waiting for you", "بانتظاركم"), ISSUED: T("with vendor", "لدى المورد"), DONE: T("closed", "مغلق"), CANCELLED: T("cancelled", "ملغى") };
    const DS: Record<string, string> = { DUE: T("due", "مستحق"), LATE: T("late", "متأخر"), ON_TIME: T("received", "مستلم"), LATE_RECEIVED: T("received late", "استُلم متأخراً") };
    return done(
      T(`**Vendor orchestration${vendor ? ` — ${vendor.name}` : ""}**
`, `**تنسيق الموردين${vendor ? ` — ${N(vendor.name)}` : ""}**
`) +
      T(`${o.summary.waiting} message(s) waiting for your approval (${o.summary.routineWaiting} routine), ${o.summary.withVendors} with vendors (${o.summary.overdue} overdue), ${o.summary.lateDeliverables} late deliverable(s). About ${o.summary.minutes} minutes of your time.
`,
        `${an(o.summary.waiting, "رسالة واحدة", "رسالتان", "رسائل", "رسالة")} بانتظار اعتمادكم (${o.summary.routineWaiting} روتينية)، و${an(o.summary.withVendors, "أمر عمل واحد", "أمرا عمل", "أوامر عمل", "أمر عمل")} لدى الموردين (${o.summary.overdue} متأخرة)، و${an(o.summary.lateDeliverables, "تسليم متأخر واحد", "تسليمان متأخران", "تسليمات متأخرة", "تسليماً متأخراً")}. نحو ${an(o.summary.minutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")} من وقتكم.\n`) +
      (o.escalations.length ? `\n${o.escalations.map((x) => `- ⚠ ${x.title}`).join("\n")}\n` : "") +
      (orders.length ? `\n${T("**Work orders**", "**أوامر العمل**")}\n${orders.slice(0, 10).map((x) => `- ${N(x.vendor)}: ${x.title} — ${ST[x.status] ?? x.status}${x.overdue ? T(" (overdue)", " (متأخر)") : ""}`).join("\n")}\n` : "") +
      (dels.length ? `\n${T("**What vendors owe us**", "**ما يدين به الموردون**")}\n${dels.slice(0, 8).map((x) => `- ${N(x.vendor)}: ${x.title} — ${DS[x.state]}${T(", due", "، موعده")} ${dt(L, x.due)}${x.chases ? T(`, ${x.chases} reminder(s)`, `، ${an(x.chases, "تذكير واحد", "تذكيران", "تذكيرات", "تذكيراً")}`) : ""}`).join("\n")}\n` : "") +
      T("\nApprove or cancel on the Vendors page; nothing goes to a vendor without your approval.", "\nاعتمدوا أو ألغوا من صفحة الموردين؛ لا يصل شيء إلى أي مورد دون اعتمادكم."));
  }
  if (RX.plan.test(q)) {
    const p = dr.plan;
    return done(T(`**Budget plan — June 2026** (${p.status === "APPROVED" ? `approved by ${p.approvedBy}` : "proposed, needs your approval"})\n`, `**خطة الميزانية — يونيو 2026** (${p.status === "APPROVED" ? `اعتمدها ${p.approvedBy}` : "مقترحة، بانتظار اعتمادكم"})\n`) +
      p.lines.map((x) => `- ${N(x.vendor)}: ${K(L, x.currentK)} → **${K(L, x.proposedK)}** — ${x.rationale}`).join("\n") +
      T(`\n\nSame total (${K(L, p.totalK)}); expected incremental sales ${M(L, p.expectedM)} vs ${M(L, p.flatM)} if unchanged (+${M(L, p.upliftM)}).${p.unallocatedK ? ` ${K(L, p.unallocatedK)} held in reserve.` : ""} Approve it on the Director page.`, `\n\nالإجمالي نفسه (${K(L, p.totalK)})؛ المبيعات الإضافية المتوقعة ${M(L, p.expectedM)} مقابل ${M(L, p.flatM)} دون تغيير (+${M(L, p.upliftM)}).${p.unallocatedK ? ` ${K(L, p.unallocatedK)} محتفظ بها احتياطياً.` : ""} اعتمدوها من صفحة المدير.`));
  }
  if (RX.approvals.test(q) && !vendor) {
    return done(T(`**Waiting for your decision (${dr.inbox.length}, about ${dr.managerMinutes} min)**\n`, `**بانتظار قراركم (${dr.inbox.length}، نحو ${an(dr.managerMinutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")})**\n`) + (dr.inbox.map((x) => `- ${x.title}`).join("\n") || T("- nothing", "- لا شيء")) + T("\n\nOpen the Director page to approve; email drafts open here.", "\n\nافتحوا صفحة المدير للاعتماد؛ ومسودات الرسائل تُفتح هنا."));
  }
  if (RX.kinan.test(q)) {
    const out = await kinanOutbox(8, lang);
    return done(T(`**Shared with Kinan's sales agent** (connection: ${kinanMode()})\n`, `**التغذية إلى كنان** (الوكيل: ${kinanMode()})\n`) +
      (out.map((e) => `- ${e.type} → ${e.target === "YARDI" ? "Yardi" : T("AI agent", "الوكيل الذكي")}: ${e.status}${e.summary ? ` (${e.summary})` : ""}`).join("\n") || T("- nothing sent yet", "- لم يُرسل شيء بعد")) +
      T("\n\nLeads, follow-ups and sales stay with Kinan's sales agent (the AI that works in Yardi); I share the plan, campaign codes, campaign changes and the daily brief.", "\n\nالعملاء المحتملون والمتابعة والمبيعات من اختصاص وكيل كنان؛ وأشارك الخطة ورموز الحملات وتغييراتها والموجز اليومي."));
  }

  // 2b. Renewal decisions (all vendors, or the one asked about).
  if (RX.renewal.test(q)) {
    const ds = ag.decisions.filter((d) => !vendor || d.vendor === vendor.name);
    cardsOf(["RENEWAL"], 6);
    if (vendor && ds[0]) {
      const d = ds[0];
      return done(`**${N(d.vendor)}: ${d.headline}** (${T("confidence", "الثقة")} ${CONF[d.confidence]})\n${d.confidenceWhy}\n${d.evidence.slice(0, 6).map((e) => `- ${e}`).join("\n")}\n\n${T("Next step", "الخطوة التالية")}: ${d.nextStep}\n${T("What would change this", "ما الذي قد يغيّر القرار")}: ${d.wouldChange}`);
    }
    return done(T("Renewal recommendation per vendor (fair score, confidence):\n", "توصية التجديد لكل مورد (التقييم العادل، الثقة):\n") + ag.decisions.map((d) => {
      const sc = ag.scores.find((x) => x.vendorId === d.vendorId)!;
      return `- **${N(d.vendor)}** — ${d.headline} (${sc.score}/100، ${T("confidence", "الثقة")} ${CONF[d.confidence]})`.replace("،", L === "ar" ? "،" : ",");
    }).join("\n"));
  }

  // 2c. Incrementality.
  if (RX.incr.test(q)) {
    const mmm = ag.incrementality.mmm;
    cardsOf(["TEST_INCREMENTALITY"], 4);
    const tests = ag.incrementality.tests.filter((t) => t.readout).map((t) => `- ${t.name} (${N(t.vendor)}): ${ag.incrementality.perVendor.find((p) => p.vendorId === t.vendorId && p.evidence === "TEST")?.text ?? ""}`);
    const ch = mmm ? mmm.channels.map((x) => T(`- ${x.channel}: ~${x.incrementalRatio === null ? "—" : Math.round(x.incrementalRatio * 100) + "%"} of CRM-attributed qualified leads is incremental (90% range ${x.incrementalRatioLow === null ? "—" : Math.round(x.incrementalRatioLow * 100)}–${x.incrementalRatioHigh === null ? "—" : Math.round(x.incrementalRatioHigh * 100)}%)${x.reliable ? "" : " — low reliability"}`, `- ${N(x.channel)}: نحو ${x.incrementalRatio === null ? "—" : Math.round(x.incrementalRatio * 100) + "%"} من العملاء المؤهلين المنسوبين إضافية فعلاً (النطاق ${x.incrementalRatioLow === null ? "—" : Math.round(x.incrementalRatioLow * 100)}–${x.incrementalRatioHigh === null ? "—" : Math.round(x.incrementalRatioHigh * 100)}%)${x.reliable ? "" : " — موثوقية منخفضة"}`)) : [];
    return done(T("**Controlled tests**\n", "**الاختبارات المضبوطة**\n") + (tests.join("\n") || T("- none completed", "- لا يوجد اختبار مكتمل")) + T("\n\n**Media-mix model** (Jan–May 2026)\n", "\n\n**نموذج مزيج الإعلام** (يناير–مايو 2026)\n") + ch.join("\n") + (mmm ? `\n\n${mmm.notes.join(" ")}` : ""));
  }

  // 2d. Bench, trials and re-bids.
  if (RX.trials.test(q)) {
    cardsOf(["TRIAL"], 4);
    const st: Record<string, string> = { PROPOSED: T("proposed — needs approval", "مقترحة — بحاجة إلى اعتماد"), RUNNING: T("running", "جارية"), COMPLETED: T("completed", "مكتملة"), CANCELLED: T("cancelled", "ملغاة"), APPROVED: T("approved", "معتمدة") };
    return done(
      T("**Trials**\n", "**التجارب**\n") + ag.bench.trials.map((t) => `- ${N(t.challenger)} ${T("vs", "مقابل")} ${N(t.incumbent)}: ${st[t.status] ?? t.status}${T(", ", "، ")}${K(L, t.budgetK)}${t.readout ? T(` — challenger ${t.readout.qlRatio}× qualified leads per SAR (${t.readout.confidencePct}% confidence) → ${t.readout.outcome}`, ` — المنافس ${t.readout.qlRatio}× العملاء المؤهلين لكل ريال (ثقة ${t.readout.confidencePct}%) ← ${({ PROMOTE: "ترقية", EXTEND: "تمديد", KEEP_INCUMBENT: "الإبقاء على الحالي" } as Record<string, string>)[t.readout.outcome]}`) : ""}`).join("\n") +
      T("\n\n**Alternative vendors**\n", "\n\n**الموردون البدلاء**\n") + ag.bench.bench.map((b) => `- ${N(b.name)} (${N(b.category)}): ${N(b.rateNote ?? "")}`).join("\n")
    );
  }

  // 2e. Director's brief / targets (after the more specific intents).
  if (RX.brief.test(q) && !vendor && !campaign && !RX.invoices.test(q)) {
    // Campaign recommendations are part of the brief: show them as actionable cards.
    cards.push(...dr.campaignRecs.slice(0, 4).map((x) => ({ kind: "rec" as const, key: x.key })));
    const cr = dr.campaignRecs.slice(0, 5).map((x) => `- ${x.severity === "crit" ? T("[urgent] ", "[عاجل] ") : ""}**${x.title}**${x.impactK && !/SAR|ر\.س/.test(x.title) ? ` (${K(L, x.impactK)})` : ""} — ${firstSentence(x.why)}`).join("\n");
    return done(`**${dr.brief.headline}**\n${dr.brief.bullets.map((b) => `- ${b}`).join("\n")}\n\n${cr ? `${T("**Campaign recommendations**", "**توصيات الحملات**")}\n${cr}\n\n` : ""}${T("**This week I recommend**", "**أوصي هذا الأسبوع بما يلي**")}\n${dr.brief.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
  }

  // 3. A specific campaign.
  if (campaign) {
    return done(
      `**${N(campaign.name)}** (${[N(campaign.vendor), N(campaign.asset), campaign.status === "LIVE" ? T("live", "نشطة") : campaign.status === "PAUSED" ? T("paused", "متوقفة") : T("ended", "منتهية")].join(T(", ", "، "))})\n` +
      T(`- Spend SAR ${campaign.spendK}K of ${campaign.budgetK}K budget (pacing ${n(L, campaign.pacingPct, "%")})\n`, `- الإنفاق ${K(L, campaign.spendK)} من ميزانية ${K(L, campaign.budgetK)} (وتيرة الإنفاق ${n(L, campaign.pacingPct, "%")})\n`) +
      T(`- Funnel: ${campaign.leads} leads → ${campaign.qualified} qualified (${n(L, campaign.qualRatePct, "%")}) → ${campaign.viewings} viewings → ${campaign.reservations} reservations → ${campaign.contracts} contracts\n`, `- المسار: ${campaign.leads} عميل محتمل ← ${an(campaign.qualified, "مؤهل واحد", "مؤهلان", "مؤهلين", "مؤهلاً")} (${n(L, campaign.qualRatePct, "%")}) ← ${an(campaign.viewings, "معاينة واحدة", "معاينتان", "معاينات", "معاينة")} ← ${an(campaign.reservations, "حجز واحد", "حجزان", "حجوزات", "حجزاً")} ← ${an(campaign.contracts, "عقد واحد", "عقدان", "عقود", "عقداً")}\n`) +
      T(`- Sales SAR ${campaign.revenueM}M; cost-to-sales ${n(L, campaign.costToSalesPct, "%")}; CAC SAR ${n(L, campaign.cacK, "K")}; cost per lead SAR ${n(L, campaign.cplSar)}${campaign.cplTrendPct ? ` (${campaign.cplTrendPct > 0 ? "+" : ""}${campaign.cplTrendPct}% latest month)` : ""}\n`,
        `- المبيعات ${M(L, campaign.revenueM)}؛ نسبة التكلفة إلى المبيعات ${n(L, campaign.costToSalesPct, "%")}؛ تكلفة اكتساب العقد ${campaign.cacK === null ? "غير متاحة" : K(L, campaign.cacK)}؛ تكلفة العميل المحتمل ${n(L, campaign.cplSar)} ر.س${campaign.cplTrendPct ? ` (${campaign.cplTrendPct > 0 ? "+" : ""}${campaign.cplTrendPct}% في آخر شهر)` : ""}\n`) +
      T(`- Health: ${campaign.health}${campaign.attribution === "Weak" ? " — brand channel, so last-touch attribution understates its sales" : ""}`,
        `- الحالة: ${({ Strong: "قوية", OK: "مقبولة", Weak: "ضعيفة", Idle: "خاملة" } as any)[campaign.health] ?? campaign.health}${campaign.attribution === "Weak" ? " — قناة قائمة على العلامة التجارية، فيقلّل إسناد آخر نقرة من مبيعاتها" : ""}`) +
      campaignExtras(c, campaign.id)
    );
  }

  // 4. A specific vendor.
  if (vendor) {
    const v = vendor;
    const row = inv.vendors.find((x) => x.id === v.id);
    const cv = crm.vendors.find((x) => x.id === v.id);
    const mine = active.filter((x) => x.r.vendorId === v.id);
    cards.push(...mine.slice(0, 4).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    const verdictAr: Record<string, string> = { Scale: "توسّع", Hold: "إبقاء", Fix: "تصحيح", Review: "مراجعة" };
    return done(
      T(`**${v.name}** — ${v.category}, scorecard ${v.score}/100 (${v.verdict})\n`, `**${N(v.name)}** — ${N(v.category)}، التقييم ${v.score}/100 (${verdictAr[v.verdict] ?? v.verdict})\n`) +
      T(`- SAR ${v.spendK}K spend across ${v.campaigns} campaign(s) → ${v.contracts} contracts, SAR ${v.revenueM}M sales (cost-to-sales ${n(L, v.costToSalesPct, "%")})\n`, `- إنفاق ${K(L, v.spendK)} عبر ${an(v.campaigns, "حملة واحدة", "حملتان", "حملات", "حملة")} ← ${v.contracts} عقداً، مبيعات ${M(L, v.revenueM)} (نسبة التكلفة إلى المبيعات ${n(L, v.costToSalesPct, "%")})\n`) +
      T(`- Qualified-lead rate ${n(L, v.qualRatePct, "%")}; response ${n(L, v.latestRespHrs, "h")} vs ${v.slaResponseHrs}h SLA${v.slaBreaches.length ? ` — breaches: ${v.slaBreaches.join("; ")}` : " — within SLA"}\n`,
        `- نسبة العملاء المؤهلين ${n(L, v.qualRatePct, "%")}؛ الاستجابة ${v.latestRespHrs === null ? "غير متاحة" : hrs(L, v.latestRespHrs)} مقابل ${hrs(L, v.slaResponseHrs)} في اتفاقية الخدمة${v.slaBreaches.length ? ` — إخلالات: ${v.slaBreaches.join("؛ ")}` : " — ضمن الاتفاقية"}\n`) +
      (row ? T(`- Payables: invoiced SAR ${row.invoicedK}K, outstanding ${row.outstandingK}K, overdue ${row.overdueK}K, delivered-not-invoiced ${row.unbilledK}K\n`, `- المستحقات: فواتير ${K(L, row.invoicedK)}، غير مسدّد ${K(L, row.outstandingK)}، متأخر ${K(L, row.overdueK)}، منفّذ غير مفوتر ${K(L, row.unbilledK)}\n`) : "") +
      (cv ? T(`- CRM-verified: ${cv.crmLeads} leads vs ${cv.reportedLeads} reported; ${cv.crmWon} won vs ${cv.reportedContracts} claimed; median first response ${n(L, cv.crmRespHrs, "h")}\n`, `- المتحقَّق منه في النظام: ${an(cv.crmLeads, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} مقابل ${cv.reportedLeads} مُبلَّغاً؛ ${cv.crmWon} صفقة مغلقة مقابل ${cv.reportedContracts} مُدّعاة؛ وسيط أول استجابة ${cv.crmRespHrs === null ? "غير متاح" : hrs(L, cv.crmRespHrs)}\n`) : "") +
      T(`- Contract ends ${dt(L, v.contractEnd, { month: "short", year: "numeric" })}\n`, `- ينتهي العقد في ${dt(L, v.contractEnd, { month: "short", year: "numeric" })}\n`) +
      (mine.length ? T(`\n${mine.length} open recommendation${mine.length > 1 ? "s" : ""} for this vendor:`, `\n${an(mine.length, "توصية واحدة", "توصيتان", "توصيات", "توصية")} مفتوحة لهذا المورد:`) : T("\nNo open recommendations for this vendor.", "\nلا توجد توصيات مفتوحة لهذا المورد."))
    );
  }

  // 4b. Projects, channels, past and bench vendors.
  const late = extraLate(question, c);
  if (late) return done(late);

  // 5. CRM verification.
  if (RX.crm.test(question.toLowerCase())) {
    cardsOf(["CRM_MISMATCH", "SLA_BREACH"], 4);
    const i = crm.integration;
    return done(
      T(`CRM verification (${i.mode}): ${i.leads} leads on record, ${i.attributionGapPct}% not attributable to any vendor campaign.\n`, `التحقق عبر نظام إدارة العملاء (${i.mode}): ${an(i.leads, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} مسجّلاً، منها ${i.attributionGapPct}% لا يمكن إسنادها إلى أي حملة مورد.\n`) +
      crm.vendors.map((v) => T(`- ${v.vendor}: ${v.reportedLeads} reported vs ${v.crmLeads} in CRM leads (${v.leadGapPct}% gap); ${v.reportedContracts} claimed vs ${v.crmWon} won; response ${n(L, v.reportedRespHrs, "h")} reported vs ${n(L, v.crmRespHrs, "h")} measured${v.flags.length ? ` — ${v.flags.length} flag(s)` : ""}`,
        `- ${N(v.vendor)}: ${v.reportedLeads} مُبلَّغاً مقابل ${v.crmLeads} في النظام (فجوة ${v.leadGapPct}%)؛ ${v.reportedContracts} مُدّعاة مقابل ${v.crmWon} مغلقة؛ الاستجابة ${v.reportedRespHrs === null ? "غير متاحة" : hrs(L, v.reportedRespHrs)} مُبلَّغة مقابل ${v.crmRespHrs === null ? "غير متاحة" : hrs(L, v.crmRespHrs)} مقاسة${v.flags.length ? ` — ${v.flags.length} تنبيه` : ""}`)).join("\n")
    );
  }

  // 6. Invoices / Oracle.
  if (RX.invoices.test(question.toLowerCase())) {
    const k = inv.kpis;
    const exc = inv.invoices.filter((r) => r.flags.some((f) => f.code !== "OVERDUE") && r.outstandingK > 0 && r.decision === "PENDING");
    cardsOf(["INVOICE_EXCEPTIONS", "UNBILLED", "OVERDUE_PAYMENT"], 4);
    return done(
      T(`Supplier invoices (Oracle ${inv.integration.mode}): SAR ${k.invoicedK}K invoiced, ${k.outstandingK}K outstanding, **${k.overdueK}K overdue**, ${k.flaggedK}K blocked by reconciliation exceptions, ${k.unbilledK}K delivered but not yet invoiced.\n`,
        `فواتير الموردين (أوراكل ${inv.integration.mode}): ${K(L, k.invoicedK)} مفوترة، ${K(L, k.outstandingK)} غير مسددة، **${K(L, k.overdueK)} متأخرة**، ${K(L, k.flaggedK)} موقوفة بسبب استثناءات المطابقة، و${K(L, k.unbilledK)} منفّذة لم تُفوتر بعد.\n`) +
      (exc.length ? T(`Exceptions to resolve:\n`, `استثناءات تحتاج معالجة:\n`) + exc.slice(0, 5).map((r) => `- ${L === "ar" ? ltr(r.invoiceNumber) : r.invoiceNumber} (${N(r.vendor)}${T(", ", "، ")}${K(L, r.amountK)}): ${r.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ")}`).join("\n") : T("No unresolved exceptions.", "لا توجد استثناءات غير معالجة."))
    );
  }

  // 7. Contracts.
  if (RX.contracts.test(question.toLowerCase()) && !RX.salesWords.test(q)) {
    const list = [...mkt.vendors].sort((a, b) => a.monthsToExpiry - b.monthsToExpiry);
    cardsOf(["CONTRACT_RENEWAL"], 3);
    const vAr: Record<string, string> = { Scale: "توسّع", Hold: "إبقاء", Fix: "تصحيح", Review: "مراجعة" };
    return done(T("Vendor contracts by end date:\n", "عقود الموردين حسب تاريخ الانتهاء:\n") + list.map((v) => T(`- ${v.name}: ${dt(L, v.contractEnd)} (${v.monthsToExpiry} month${v.monthsToExpiry === 1 ? "" : "s"}) — score ${v.score}, ${v.verdict}`, `- ${N(v.name)}: ${dt(L, v.contractEnd)} (${an(v.monthsToExpiry, "شهر واحد", "شهران", "أشهر", "شهراً")}) — التقييم ${v.score}، ${vAr[v.verdict] ?? v.verdict}`)).join("\n"));
  }

  // 8. Best / worst.
  if ((RX.score.test(q) || RX.best.test(question.toLowerCase())) && !/summary|overview|ملخص|نظرة عامة/.test(q)) {
    if (ag.scores.length) {
      cardsOf(["RENEWAL", "UNDERPERFORMING"], 3);
      return done(T("Fair scorecard — normalised by channel and budget, on verified data (50 = channel benchmark):\n", "التقييم العادل — معدّل حسب القناة والميزانية وعلى بيانات متحقَّق منها (50 = معيار القناة):\n") +
        ag.scores.map((x) => T(`- ${x.rank}. **${x.vendor}** (${x.category}): ${x.score}/100, range ${x.low}–${x.high}, ${CONF[x.confidence]} confidence${x.incrementalShare !== null ? `, incremental share ${Math.round(x.incrementalShare * 100)}% (${x.incrementalEvidence})` : ""}`, `- ${x.rank}. **${N(x.vendor)}** (${N(x.category)}): ${x.score}/100، النطاق ${x.low}–${x.high}، ثقة ${CONF[x.confidence]}${x.incrementalShare !== null ? `، نسبة الأثر الإضافي ${Math.round(x.incrementalShare * 100)}% (${x.incrementalEvidence === "TEST" ? "اختبار" : "نموذج مزيج"})` : ""}`)).join("\n"));
    }
    const live = mkt.campaigns.filter((x) => x.status === "LIVE" && x.costToSalesPct !== null && x.attribution === "Direct").sort((a, b) => a.costToSalesPct! - b.costToSalesPct!);
    cardsOf(["UNDERPERFORMING", "SCALE_UP", "REALLOCATE"], 3);
    const vAr: Record<string, string> = { Scale: "توسّع", Hold: "إبقاء", Fix: "تصحيح", Review: "مراجعة" };
    return done(
      T("Vendors by scorecard:\n", "الموردون حسب بطاقة التقييم:\n") + mkt.vendors.map((v) => T(`- ${v.name}: ${v.score}/100 (${v.verdict}), cost-to-sales ${n(L, v.costToSalesPct, "%")}`, `- ${N(v.name)}: ${v.score}/100 (${vAr[v.verdict] ?? v.verdict})، نسبة التكلفة إلى المبيعات ${n(L, v.costToSalesPct, "%")}`)).join("\n") + "\n\n" +
      T(`Most efficient live campaigns (cost-to-sales): ${live.slice(0, 3).map((x) => `${x.name} ${x.costToSalesPct}%`).join("; ")}.\nLeast efficient: ${live.slice(-3).reverse().map((x) => `${x.name} ${x.costToSalesPct}%`).join("; ")}. PR and outdoor are last-touch under-attributed.`,
        `أكفأ الحملات النشطة (التكلفة إلى المبيعات): ${live.slice(0, 3).map((x) => `${N(x.name)} ${x.costToSalesPct}%`).join("؛ ")}.\nالأقل كفاءة: ${live.slice(-3).reverse().map((x) => `${N(x.name)} ${x.costToSalesPct}%`).join("؛ ")}. العلاقات العامة والإعلانات الخارجية يقلّل إسناد آخر نقرة من أثرها.`)
    );
  }

  // 9. Totals / funnel.
  if (RX.totals.test(question.toLowerCase())) {
    const f = mkt.funnel;
    const m = mkt.monthly;
    const stageAr: Record<string, string> = { Leads: "عملاء محتملون", Qualified: "مؤهلون", Viewings: "معاينات", Reservations: "حجوزات", Contracts: "عقود" };
    return done(
      T(`Overall (Jan–May 2026): SAR ${mkt.kpis.spendK}K spend → ${f.map((x) => `${x.value} ${x.stage.toLowerCase()}`).join(" → ")}; SAR ${mkt.kpis.revenueM}M contracted sales. Blended cost-to-sales ${n(L, mkt.kpis.costToSalesPct, "%")}, CAC SAR ${n(L, mkt.kpis.cacK, "K")} per contract.\n`,
        `الإجمالي (يناير–مايو 2026): إنفاق ${K(L, mkt.kpis.spendK)} ← ${f.map((x) => `${x.value} ${stageAr[x.stage] ?? x.stage}`).join(" ← ")}؛ مبيعات متعاقد عليها ${M(L, mkt.kpis.revenueM)}. نسبة التكلفة إلى المبيعات المجمّعة ${n(L, mkt.kpis.costToSalesPct, "%")}، وتكلفة اكتساب العقد ${mkt.kpis.cacK === null ? "غير متاحة" : K(L, mkt.kpis.cacK)}.\n`) +
      T(`Latest month (${m[m.length - 1].month}): SAR ${m[m.length - 1].spendK}K spend, ${m[m.length - 1].contracts} contracts, SAR ${m[m.length - 1].revenueM}M sales.\n`, `آخر شهر (${m[m.length - 1].month}): إنفاق ${K(L, m[m.length - 1].spendK)}، ${m[m.length - 1].contracts} عقداً، مبيعات ${M(L, m[m.length - 1].revenueM)}.\n`) +
      T(`By asset: ${mkt.assets.map((a) => `${a.asset} SAR ${a.revenueM}M (${n(L, a.costToSalesPct, "%")})`).join("; ")}.`, `حسب المشروع: ${mkt.assets.map((a) => `${N(a.asset)} ${M(L, a.revenueM)} (${n(L, a.costToSalesPct, "%")})`).join("؛ ")}.`)
    );
  }

  // Fallback.
  const near = closest(question, L, 3);
  if (near.length) return done(T(
    `I couldn't match that question to my built-in answers exactly, so rather than guess, here are the closest questions I can answer — tap one, or rephrase with a vendor, campaign, project or period.${polish ? "" : " With Claude connected (or in the Claude app edition) I answer free-form questions like this directly."}`,
    `لم أتمكن من مطابقة السؤال مع إجاباتي المدمجة بدقة، فبدلاً من التخمين هذه أقرب الأسئلة التي أجيب عنها — اضغطوا أحدها أو أعيدوا الصياغة مع ذكر مورد أو حملة أو مشروع أو فترة.${polish ? "" : " عند ربط Claude (أو في نسخة تطبيق Claude) أجيب عن الأسئلة الحرة مثل هذا مباشرة."}`), true);
  cards.push(...active.slice(0, 3).map((x) => ({ kind: "rec" as const, key: x.r.key })));
  return done(T(
    `I'm your AI assistant director of marketing. Ask me for today's brief, what the vendors owe us, where we stand against target, the budget plan, what needs your approval, or what we've sent to Kinan — or about any vendor, campaign, test, trial or invoice. I can answer questions about the vendors, campaigns, results, sales conversion, CRM verification and supplier invoices, and I can draft vendor emails for you to approve. Try: "which vendor converts best?", "how is Ash Shati Broker Push doing?", "do vendor numbers match the CRM?", "draft an email to Hajar Outdoor".\n\nRight now the top open items are:`,
    `أنا مساعد مدير التسويق الذكي. اسألوني عن موجز اليوم، أو ما يدين به الموردون، أو موقفنا من المستهدف، أو خطة الميزانية، أو ما ينتظر اعتمادكم، أو ما أُرسل إلى كنان — أو عن أي مورد أو حملة أو اختبار أو تجربة أو فاتورة. يمكنني الإجابة عن أسئلة الموردين والحملات والنتائج وتحويل الإنفاق إلى مبيعات والتحقق عبر نظام إدارة العملاء وفواتير الموردين، وإعداد رسائل للموردين لتعتمدوها. جرّبوا: «أي مورد يحقق أفضل تحويل؟»، «كيف أداء حملة الوسطاء في الشاطئ؟»، «هل أرقام الموردين تطابق نظام إدارة العملاء؟»، «اكتب رسالة إلى هجر للإعلانات الخارجية».\n\nأهم البنود المفتوحة الآن:`), true);
}
