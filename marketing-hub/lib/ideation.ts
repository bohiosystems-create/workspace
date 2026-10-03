// Market initiatives — campaigns, offers, partnerships, events, broker programmes, content, budget shifts, positioning
// and referral ideas, grounded in the data: what the CRM shows right now (anomalies in leads, qualified leads, sales
// and lost reasons — lib/crm-signals.ts), the project's gap to target, the season, the 2023–2025 campaign history
// (benchmarks and lessons), today's daily check and the vendors available (current, alternatives, past).
// When the CRM shows an unusual fall (or surge), at least one initiative answers it and says which signal it answers.
//
// Two engines, one output shape:
//   rules  (always available, used offline): season- and goal-aware concepts with channel mixes chosen from history.
//   AI     (any key): the "ideate" task runs on up to two different providers for variety (lib/llm.ts routing), each
//          proposing concepts as JSON; the "judge" task ranks and filters them against the data. If AI fails, rules.
// Forecasts, vendors, guardrails and evidence are always computed here from the history — never taken from a model.
// Approving an idea drafts a campaign brief email to the lead vendor; it is only sent after a person approves it.
import { prisma } from "./prisma";
import { buildAgent, type Agent } from "./agent";
import { buildDirector } from "./director";
import { historyState, FAMILY_LABEL, SEASON_LABEL, familyOf } from "./history";
import { dailyState } from "./daily";
import { createCustomDraft } from "./recommendations";
import { PLAN_MONTH } from "./clock";
import { type Lang, tx, nm, K, M, dt } from "./i18n";

const monthShort = (l: Lang, ym: string) => dt(l, `${ym}-01`, { month: "long", year: "numeric" });
import { serial } from "./single";
import { signalsForModel, type Signal } from "./crm-signals";
import { dailyScan, scanView } from "./signals";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const FAMILIES = ["DIGITAL", "PORTAL", "BROKER", "EVENT", "INFLUENCER", "PR", "OUTDOOR", "RADIO"] as const;
export type Family = (typeof FAMILIES)[number];
export const GOALS = ["SALES", "LAUNCH", "LEADS", "AWARENESS"] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABEL: Record<Goal, Bi> = { SALES: bi("Close sales", "إغلاق مبيعات"), LAUNCH: bi("Launch a phase", "إطلاق مرحلة"), LEADS: bi("Build qualified leads", "بناء عملاء مؤهلين"), AWARENESS: bi("Awareness", "الوعي بالعلامة") };
const PROJECT_CODE: Record<string, string> = { "Ash Shati Residences": "ASH", "Marina Tower": "MAR", "Andalus Quarter": "AND" };
const CATEGORY_FAMILY: Record<string, Family> = { "Broker network": "BROKER", "Property portal": "PORTAL", "Performance media": "DIGITAL", "PR & brand": "PR", Influencer: "INFLUENCER", Outdoor: "OUTDOOR" };
const PAST_VENDOR: Partial<Record<Family, string>> = { EVENT: "Wajha Events", RADIO: "Sawt FM" };

export const KINDS = ["CAMPAIGN", "OFFER", "PARTNERSHIP", "EVENT", "BROKER_PROGRAM", "CONTENT_PR", "CHANNEL_SHIFT", "POSITIONING", "REFERRAL"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, Bi> = {
  CAMPAIGN: bi("Campaign", "حملة"), OFFER: bi("Offer & pricing", "عرض وتسعير"), PARTNERSHIP: bi("Partnership", "شراكة"), EVENT: bi("Event & experience", "فعالية وتجربة"),
  BROKER_PROGRAM: bi("Broker programme", "برنامج الوسطاء"), CONTENT_PR: bi("Content & PR", "محتوى وعلاقات عامة"), CHANNEL_SHIFT: bi("Budget & channel shift", "تحويل الميزانية والقنوات"),
  POSITIONING: bi("Positioning & messaging", "التموضع والرسائل"), REFERRAL: bi("Referral & community", "الإحالات والمجتمع"),
};
export type IdeaBrief = { project?: string; goal?: Goal; month?: string; budgetK?: number; audience?: string; notes?: string; engine?: "auto" | "rules"; runTag?: string; signalId?: string };
export type Channel = { family: Family; label: Bi; sharePct: number; role: Bi; spendK: number; vendor: string; vendorStatus: "current" | "bench" | "past"; vendorNote: Bi; ctsPct: number; qualified: number; contracts: number; salesM: number };
export type Idea = {
  title: Bi; bigIdea: Bi; audience: Bi; offer: Bi; headline: Bi; channels: Channel[];
  forecast: { spendK: number; qualified: number; contracts: [number, number, number]; salesM: [number, number, number]; costToSalesPct: number; targetNextM: number | null; adjustments: Bi[] };
  guardrails: Bi[]; measurement: Bi; risks: Bi[]; cautions: Bi[]; evidence: { code: string; name: string; costToSalesPct: number | null; lesson: string }[];
  campaignCode: string; leadVendor: string | null; source: string; model?: string; score?: number | null; judge?: { by: string; model: string; why: Bi; improve: Bi } | null;
  kind?: Kind; trigger?: { id: string; title: Bi; why: Bi } | null;
};

// -------------------------------------------------------------------- season
/** Season of a month, as the history labels it. Ramadan falls in Feb–Mar in 2026–2027; Cityscape (Riyadh) in November. */
export function seasonOf(month: string): { key: string; label: Bi; note: Bi } {
  const mm = month.slice(5);
  if (mm === "07" || mm === "08") return { key: "SUMMER", label: bi("Summer", "الصيف"), note: bi("Summer is the weakest season in the history (buyers travel; decisions slip to September).", "الصيف أضعف المواسم في التاريخ (يسافر المشترون وتتأجل القرارات إلى سبتمبر).") };
  if (mm === "02" || mm === "03") return { key: "RAMADAN", label: bi("Ramadan", "رمضان"), note: bi("Ramadan (Feb–Mar in 2026–2027): payment-plan offers worked best in the history; contracts follow 4–8 weeks later.", "رمضان (فبراير–مارس في 2026–2027): كانت عروض خطط السداد الأنجح في التاريخ؛ وتأتي العقود بعد 4–8 أسابيع.") };
  if (mm === "11") return { key: "EVENT", label: bi("Cityscape season", "موسم سيتي سكيب"), note: bi("November is Cityscape season in Riyadh: events and expos converted best in the history.", "نوفمبر موسم سيتي سكيب في الرياض: كانت الفعاليات والمعارض الأعلى تحويلاً في التاريخ.") };
  if (mm === "09") return { key: "ALWAYS_ON", label: bi("After summer", "بعد الصيف"), note: bi("September: buyers return; past campaigns recovered after the summer dip.", "سبتمبر: يعود المشترون؛ وتعافت الحملات السابقة بعد تراجع الصيف.") };
  return { key: "ALWAYS_ON", label: bi("Regular season", "موسم عادي"), note: bi("A regular month; always-on campaigns ran at about 1.2% cost to sales in the history.", "شهر عادي؛ عملت الحملات المستمرة بنحو 1.2% من المبيعات في التاريخ.") };
}
const nextMonth = (m: string, n = 1) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
/** Default month: the first month after the plan month that isn't summer (campaigns need lead time; summer is weak). */
export const defaultMonth = () => { let m = nextMonth(PLAN_MONTH); while (seasonOf(m).key === "SUMMER") m = nextMonth(m); return m; };

// ------------------------------------------------------------------- context
export async function ideationContext(brief: IdeaBrief, pre?: Agent) {
  const a = pre ?? (await buildAgent("en"));
  const [d, h, daily, sig] = await Promise.all([buildDirector("en", a), historyState("en"), dailyState("en"), dailyScan()]);
  const byAsset = d.targets.byAsset;
  const focus = brief.signalId ? sig.signals.find((x) => x.id === brief.signalId) ?? null : null;
  const wanted = brief.project || focus?.project || "";
  const project = wanted && byAsset.some((x) => x.asset === wanted) ? wanted : byAsset[0]?.asset ?? "Ash Shati Residences";
  // CRM signals for this project (and the whole portfolio): the initiatives must answer the falls.
  const signals = sig.signals.filter((x) => x.project === project || x.scope === "portfolio");
  // What needs an answer: falls and risks that matter, and concrete opportunities (a proposal, unused budget, a dated
  // moment, a market or financing shift). Evidence already attached to another signal is answered with it.
  const OPP = new Set(["SURGE", "EMAIL_OPPORTUNITY", "EMAIL_EVENT", "BUDGET_HEADROOM", "FINANCE_SHIFT", "MARKET_SHIFT", "CALENDAR_MOMENT"]);
  const answerable = (x: Signal) => !x.linkedTo && (x.direction === "down" ? x.severity !== "info" || x.kind === "MARKET_SHIFT" : OPP.has(x.kind));
  const rank = (x: Signal) => (x.project === project ? 0 : 10) + ({ crit: 0, warn: 1, info: 2 } as const)[x.severity] * 2 + (x.direction === "down" ? 0 : 1) + (x.kind === "CALENDAR_MOMENT" ? 3 : 0);
  // Signals are answered when the initiative would run soon enough to matter (within 6 months of the CRM data).
  const gapMonths = (y: string, x: string | null) => (x ? (Number(y.slice(0, 4)) - Number(x.slice(0, 4))) * 12 + Number(y.slice(5, 7)) - Number(x.slice(5, 7)) : 0);
  const soon = !!focus || gapMonths(brief.month && /^\d{4}-\d{2}$/.test(brief.month) ? brief.month : defaultMonth(), sig.date) <= 6;
  const toAnswer = !soon ? [] : [...(focus && signals.includes(focus) ? [focus] : []), ...signals.filter((x) => x !== focus && answerable(x)).sort((p, q) => rank(p) - rank(q))].slice(0, 3);
  const target = byAsset.find((x) => x.asset === project) ?? null;
  const month = brief.month && /^\d{4}-\d{2}$/.test(brief.month) ? brief.month : defaultMonth();
  const season = seasonOf(month);
  const live = a.mkt.campaigns.filter((c) => c.asset === project);
  const monthlySpend = live.reduce((s, c) => s + c.spendK, 0) / 5;
  const budgetK = Math.round(clamp(brief.budgetK && brief.budgetK > 0 ? brief.budgetK : Math.round(monthlySpend / 10) * 10 || 150, 20, 5000));
  const goal: Goal = brief.goal && GOALS.includes(brief.goal) ? brief.goal : toAnswer.some((x) => x.kind === "SALES_DROP") || (target && (target.pct ?? 100) < 70) ? "SALES" : "LEADS";

  // Project factor: how much more (or less) this project has cost per sale than the whole history (live + past).
  const projRows = h.rows.filter((r) => r.projectKey === project);
  const projSpend = projRows.reduce((s, r) => s + r.spendK, 0) + live.reduce((s, c) => s + c.spendK, 0);
  const projSales = projRows.reduce((s, r) => s + r.salesM, 0) + live.reduce((s, c) => s + c.revenueM, 0);
  const projCts = projSales ? (projSpend / (projSales * 1000)) * 100 : h.total.costToSalesPct ?? 1.5;
  const projectFactor = r1(clamp(Math.sqrt(projCts / (h.total.costToSalesPct || 1.5)), 0.8, 2.5));
  const avgDealM = projRows.reduce((s, r) => s + r.contracts, 0) ? projRows.reduce((s, r) => s + r.salesM, 0) / projRows.reduce((s, r) => s + r.contracts, 0) : h.total.salesM / (h.total.contracts || 1);

  const families = FAMILIES.map((f) => {
    const b = h.byFamily.find((x) => x.key === f);
    const inSeason = h.rows.filter((r) => r.family === f && r.season === season.key);
    const seasonCts = inSeason.length ? inSeason.reduce((s, r) => s + r.spendK, 0) / (inSeason.reduce((s, r) => s + r.salesM, 0) * 1000) * 100 : null;
    const seasonFactor = seasonCts && b?.costToSalesPct ? clamp(seasonCts / b.costToSalesPct, 0.6, 3) : season.key === "SUMMER" ? 2 : 1;
    const liveF = live.filter((c) => familyOf(c.channel) === f);
    const liveSpend = liveF.reduce((s, c) => s + c.spendK, 0), liveSales = liveF.reduce((s, c) => s + c.revenueM, 0);
    const liveCts = liveSales ? r1((liveSpend / (liveSales * 1000)) * 100) : null;
    // Vendor: a current vendor in this channel (unless we are exiting it), else a bench alternative, else a past vendor.
    const cur = a.mkt.vendors.find((v) => CATEGORY_FAMILY[v.category] === f);
    const dec = cur ? a.decisions.find((x) => x.vendorId === cur.id)?.decision : null;
    const benchV = a.bench.bench.find((x: any) => CATEGORY_FAMILY[x.category] === f);
    let vendor: { name: string; status: "current" | "bench" | "past"; note: Bi } | null = null;
    if (cur && dec !== "EXIT") vendor = { name: cur.name, status: "current", note: dec === "TEST_REPLACEMENT" ? bi("current vendor, under a replacement test", "مورد حالي قيد اختبار استبدال") : bi("current vendor", "مورد حالي") };
    else if (benchV) vendor = { name: benchV.name, status: "bench", note: bi(`bench alternative${cur ? ` (exiting ${cur.name})` : ""} — start as a paid trial`, `بديل جاهز${cur ? ` (الخروج من ${nm("ar", cur.name)})` : ""} — يبدأ بتجربة مدفوعة`) };
    else if (PAST_VENDOR[f]) vendor = { name: PAST_VENDOR[f]!, status: "past", note: bi("past vendor — re-engage (in the history)", "مورد سابق — إعادة التعاقد (في التاريخ)") };
    return { family: f, label: FAMILY_LABEL[f] ? bi(...FAMILY_LABEL[f]) : bi(f, f), benchCts: b?.costToSalesPct ?? null, cpql: b?.cpqlSAR ?? null, qualPct: b?.qualPct ?? null, campaigns: b?.campaigns ?? 0, seasonFactor: r1(seasonFactor), liveCts, vendor };
  });
  const flags = daily.recommendations.filter((r) => live.some((c) => c.name === r.campaign)).map((r) => r.title);
  return {
    project, projectCode: PROJECT_CODE[project] ?? project.slice(0, 3).toUpperCase(), month, season, budgetK, goal, audience: brief.audience?.trim() || "", notes: brief.notes?.trim() || "",
    target: target ? { pctOfTargetYtd: target.pct, actualYtdM: target.actualM, targetYtdM: target.targetM, nextMonthForecastM: target.forecastNextM, nextMonthTargetM: target.targetNextM } : null,
    projectFactor, projectCtsPct: r1(projCts), historyCtsPct: h.total.costToSalesPct, avgDealM: r1(avgDealM), families, flags,
    pastForProject: projRows.map((r) => ({ code: r.code, name: r.name, family: r.family, season: r.season, costToSalesPct: r.costToSalesPct, lesson: r.lesson })),
    seasonPast: h.rows.filter((r) => r.season === season.key).map((r) => ({ code: r.code, name: r.name, family: r.family, costToSalesPct: r.costToSalesPct, lesson: r.lesson })),
    lessons: h.lessons, history: h, signals, toAnswer, crmAsOf: sig.date,
  };
}
export type IdeationContext = Awaited<ReturnType<typeof ideationContext>>;

// ------------------------------------------------------------------ finalize
type Draft = { title: Bi; bigIdea: Bi; audience: Bi; offer: Bi; headline: Bi; channels: { family: string; sharePct: number; role: Bi }[]; risks?: Bi[]; evidence?: string[]; source: string; model?: string; kind?: Kind; trigger?: string | null };

/** Turn a concept (rules or AI) into a full idea: vendors, forecast from the history, guardrails, evidence. */
export function finalize(c: IdeationContext, dft: Draft): Idea | null {
  const fam = c.families;
  let chans = dft.channels.map((x) => ({ ...x, family: String(x.family).toUpperCase() as Family })).filter((x) => FAMILIES.includes(x.family) && x.sharePct > 0);
  // Merge duplicates, normalise to 100%, drop anything under 5%.
  chans = chans.reduce((acc: typeof chans, x) => { const e = acc.find((y) => y.family === x.family); if (e) e.sharePct += x.sharePct; else acc.push({ ...x }); return acc; }, []);
  const tot = chans.reduce((s, x) => s + x.sharePct, 0);
  if (!tot) return null;
  chans = chans.map((x) => ({ ...x, sharePct: (x.sharePct / tot) * 100 })).filter((x) => x.sharePct >= 5);
  const tot2 = chans.reduce((s, x) => s + x.sharePct, 0);
  const shares = chans.map((x) => Math.round((x.sharePct / tot2) * 100));
  shares[0] += 100 - shares.reduce((s, x) => s + x, 0);

  const cautions: Bi[] = [];
  // A channel costing over 2× its benchmark for this project today is capped at 20%; the rest moves to the
  // best-benchmarked other channel in the mix.
  const CAP = 20;
  chans.forEach((x, i) => {
    const f = fam.find((y) => y.family === x.family)!;
    if (!(f.liveCts && f.benchCts && f.liveCts > 2 * f.benchCts && shares[i] > CAP)) return;
    const others = chans.map((y, j) => ({ j, f: fam.find((z) => z.family === y.family)! })).filter((o) => o.j !== i && !(o.f.liveCts && o.f.benchCts && o.f.liveCts > 2 * o.f.benchCts)).sort((p, q) => (p.f.benchCts ?? 99) - (q.f.benchCts ?? 99));
    if (!others.length) return;
    const moved = shares[i] - CAP;
    shares[i] = CAP; shares[others[0].j] += moved;
    cautions.push(bi(`${f.label.en} costs ${f.liveCts}% of sales for ${c.project} today (benchmark ${f.benchCts}%), so it is capped at ${CAP}%; ${moved} points moved to ${others[0].f.label.en}.`, `${f.label.ar} تكلف ${f.liveCts}% من المبيعات لـ${nm("ar", c.project)} حالياً (المعيار ${f.benchCts}%)، لذا حُدّت عند ${CAP}%؛ ونُقلت ${moved} نقطة إلى ${others[0].f.label.ar}.`));
  });
  const channels: Channel[] = chans.map((x, i) => {
    const f = fam.find((y) => y.family === x.family)!;
    const share = shares[i];
    const spendK = r1((c.budgetK * share) / 100);
    const cts = (f.benchCts ?? c.historyCtsPct ?? 1.5) * f.seasonFactor * c.projectFactor;
    const salesM = spendK / (cts * 10);
    const qualified = f.cpql ? Math.round((spendK * 1000) / (f.cpql * Math.sqrt(f.seasonFactor * c.projectFactor))) : 0;
    if (!f.vendor) cautions.push(bi(`No vendor for ${f.label.en} yet — needs sourcing.`, `لا يوجد مورد لـ${f.label.ar} بعد — يحتاج إلى توريد.`));
    return { family: x.family, label: f.label, sharePct: share, role: x.role, spendK, vendor: f.vendor?.name ?? "—", vendorStatus: f.vendor?.status ?? "past", vendorNote: f.vendor?.note ?? bi("to be sourced", "يحتاج إلى توريد"), ctsPct: r1(cts), qualified, contracts: r1(salesM / c.avgDealM), salesM: r1(salesM) };
  });
  if (!channels.length) return null;
  const spendK = r1(channels.reduce((s, x) => s + x.spendK, 0));
  const salesMid = channels.reduce((s, x) => s + x.salesM, 0);
  const contractsMid = salesMid / c.avgDealM;
  const lead = [...channels].filter((x) => x.vendorStatus === "current").sort((p, q) => q.sharePct - p.sharePct)[0] ?? null;
  const ev = [...new Set([...(dft.evidence ?? []), ...c.pastForProject.filter((p) => channels.some((x) => x.family === p.family)).map((p) => p.code), ...c.seasonPast.filter((p) => channels.some((x) => x.family === p.family)).map((p) => p.code)])]
    .map((code) => c.history.rows.find((r) => r.code === code)).filter(Boolean).slice(0, 4).map((r) => ({ code: r!.code, name: r!.name, costToSalesPct: r!.costToSalesPct, lesson: r!.lesson }));
  const stop = new Set([...c.project.toUpperCase().split(" "), "THE", "AND", "WITH", "FOR"]);
  const slug = (dft.title.en.split(":").pop()!.replace(/[^A-Za-z ]/g, " ").toUpperCase().split(/\s+/).filter((w) => w.length > 2 && !stop.has(w))[0] ?? "IDEA").slice(0, 8);
  const code = `${c.projectCode}-${slug}-${c.month.slice(2, 4)}${c.month.slice(5)}`;
  const worst = [...channels].sort((p, q) => q.ctsPct - p.ctsPct)[0];
  const adjustments: Bi[] = [];
  const trig = dft.trigger ? c.signals.find((x) => x.id === dft.trigger) ?? null : null;
  if (c.projectFactor !== 1) adjustments.push(bi(`${c.project} has cost ${c.projectCtsPct}% of sales vs ${c.historyCtsPct}% overall — forecast adjusted ×${c.projectFactor}.`, `كلّف ${nm("ar", c.project)} ${c.projectCtsPct}% من المبيعات مقابل ${c.historyCtsPct}% إجمالاً — عُدّل التوقع ×${c.projectFactor}.`));
  const sf = channels.map((x) => fam.find((y) => y.family === x.family)!).filter((f) => f.seasonFactor !== 1);
  if (sf.length) adjustments.push(bi(`${c.season.label.en}: ${sf.map((f) => `${f.label.en} ×${f.seasonFactor}`).join(", ")} vs the channel's usual cost.`, `${c.season.label.ar}: ${sf.map((f) => `${f.label.ar} ×${f.seasonFactor}`).join("، ")} مقارنة بالتكلفة المعتادة للقناة.`));
  return {
    title: dft.title, bigIdea: dft.bigIdea, audience: dft.audience, offer: dft.offer, headline: dft.headline, channels,
    forecast: {
      spendK, qualified: channels.reduce((s, x) => s + x.qualified, 0),
      contracts: [Math.round(contractsMid * 0.7), Math.round(contractsMid), Math.round(contractsMid * 1.3)],
      salesM: [r1(salesMid * 0.7), r1(salesMid), r1(salesMid * 1.3)],
      costToSalesPct: salesMid ? r1((spendK / (salesMid * 1000)) * 100) : 0,
      targetNextM: c.target?.nextMonthTargetM ?? null, adjustments,
    },
    guardrails: [
      bi(`Stop rule: after 2 weeks, pause any channel whose cost per CRM-qualified lead is above 1.3× its benchmark${worst ? ` (e.g. ${worst.label.en}: SAR ${Math.round((fam.find((f) => f.family === worst.family)?.cpql ?? 0) * 1.3)})` : ""}.`, `قاعدة الإيقاف: بعد أسبوعين، أوقفوا أي قناة تزيد تكلفة العميل المؤهل فيها على 1.3× معيارها${worst ? ` (مثلاً ${worst.label.ar}: ${Math.round((fam.find((f) => f.family === worst.family)?.cpql ?? 0) * 1.3)} ر.س)` : ""}.`),
      bi("Release budget in two halves: the second half only if the first two weeks meet the qualified-rate benchmark.", "اصرفوا الميزانية على دفعتين: الثانية فقط إذا حققت أول أسبوعين معيار نسبة المؤهلين."),
      bi("Every spend, vendor brief and contact needs a named approver (as for all campaigns).", "كل إنفاق وموجز للمورد وتواصل يحتاج إلى معتمِد مسمّى (كما في جميع الحملات)."),
    ],
    measurement: bi(`Campaign code ${code} in every campaign name and utm_campaign, so the CRM credits leads to it.${spendK >= 100 ? " Hold out 10% of the audience (or one district) to measure what the campaign really adds." : ""}`, `رمز الحملة ${code} في كل اسم حملة وفي utm_campaign ليُسند النظام العملاء إليها.${spendK >= 100 ? " استبعدوا 10% من الجمهور (أو حياً واحداً) لقياس ما تضيفه الحملة فعلاً." : ""}`),
    risks: dft.risks?.length ? dft.risks : [], cautions, evidence: ev, campaignCode: code, leadVendor: lead?.vendor ?? null, source: dft.source, model: dft.model, score: null, judge: null,
    kind: dft.kind && KINDS.includes(dft.kind) ? dft.kind : "CAMPAIGN", trigger: trig ? { id: trig.id, title: trig.title, why: trig.why } : null,
  };
}

// --------------------------------------------------------------- rules ideas
function rulesDrafts(c: IdeationContext): Draft[] {
  const P = c.project, PA = nm("ar", P), mon = monthShort("en", c.month), monAr = monthShort("ar", c.month);
  const role = (en: string, ar: string) => bi(en, ar);
  const bench = (f: string) => c.families.find((x) => x.family === f)?.benchCts ?? "—";
  const T: Record<string, Draft> = {
    BROKER_SPRINT: {
      kind: "BROKER_PROGRAM",
      title: bi(`${P}: broker & site-visit sprint`, `${PA}: دفعة الوسطاء وزيارات الموقع`),
      bigIdea: bi(`Put brokers — the best-converting channel in the history (${bench("BROKER")}% cost to sales) — at the centre for ${mon}: a time-boxed commission booster for reservations, weekend site visits every broker can book, and retargeting that sends online visitors to a visit slot.`, `جعل الوسطاء — أعلى القنوات تحويلاً في التاريخ (${bench("BROKER")}% من المبيعات) — محور شهر ${monAr}: حافز عمولة محدد المدة على الحجوزات، وزيارات موقع في عطلات نهاية الأسبوع يحجزها أي وسيط، وإعادة استهداف توجّه زوار الإنترنت إلى موعد زيارة.`),
      audience: bi("Ready-to-buy families and investors already talking to brokers; past site visitors who did not reserve.", "أسر ومستثمرون جاهزون للشراء يتعاملون مع الوسطاء؛ وزوار سابقون للموقع لم يحجزوا."),
      offer: bi("Reservation incentive valid for the campaign window only (e.g. registration fee covered).", "حافز حجز صالح خلال فترة الحملة فقط (مثل تحمّل رسوم التسجيل)."),
      headline: bi(`Visit ${P} this weekend — reserve before the month ends`, `زوروا ${PA} هذا الأسبوع — احجزوا قبل نهاية الشهر`),
      channels: [{ family: "BROKER", sharePct: 45, role: role("commission booster, visit bookings", "حافز العمولة وحجز الزيارات") }, { family: "EVENT", sharePct: 25, role: role("weekend open-house on site", "يوم مفتوح في الموقع نهاية الأسبوع") }, { family: "DIGITAL", sharePct: 20, role: role("retargeting to book a visit", "إعادة استهداف لحجز زيارة") }, { family: "PORTAL", sharePct: 10, role: role("featured listing with visit slots", "إعلان مميز بمواعيد الزيارة") }],
      risks: [bi("Commission boosters can pull forward sales that would have closed anyway — compare with the holdout.", "قد تسرّع حوافز العمولة مبيعات كانت ستُغلق أصلاً — قارنوا بالمجموعة المستبعدة.")], source: "rules",
    },
    PAYMENT_PLAN: {
      kind: "OFFER",
      title: bi(`${P}: payment-plan offer`, `${PA}: عرض خطة السداد`),
      bigIdea: bi(`Lead with an easy payment plan — the message that gave the best Ramadan results in the history (Marina Tower 2025: 22% qualified rate, 1.2% cost to sales). Search and social carry the offer, portals and brokers catch the demand.`, `التركيز على خطة سداد ميسّرة — الرسالة التي حققت أفضل نتائج رمضان في التاريخ (برج المارينا 2025: 22% مؤهلون، 1.2% من المبيعات). يحمل البحث والتواصل العرض، وتلتقط البوابات والوسطاء الطلب.`),
      audience: bi("First-time buyers and young families comparing monthly instalments.", "مشترون لأول مرة وأسر شابة يقارنون الأقساط الشهرية."),
      offer: bi("Extended payment plan with a low first instalment, for the campaign window.", "خطة سداد ممتدة بدفعة أولى منخفضة خلال فترة الحملة."),
      headline: bi(`Own at ${P} with a payment plan that fits your month`, `تملّكوا في ${PA} بخطة سداد تناسب ميزانيتكم الشهرية`),
      channels: [{ family: "DIGITAL", sharePct: 45, role: role("search and social carrying the offer", "البحث والتواصل يحملان العرض") }, { family: "PORTAL", sharePct: 25, role: role("featured listings with the instalment", "إعلانات مميزة بالقسط الشهري") }, { family: "BROKER", sharePct: 30, role: role("brokers briefed on the plan", "الوسطاء مطّلعون على الخطة") }],
      evidence: ["MAR-RAMADAN-25", "ASH-RAMADAN-25"],
      risks: [bi("Payment plans need finance approval and affect cash flow — confirm terms before launch.", "تحتاج خطط السداد إلى موافقة مالية وتؤثر على التدفق النقدي — أكدوا الشروط قبل الإطلاق.")], source: "rules",
    },
    OPEN_HOUSE: {
      kind: "EVENT",
      title: bi(`${P}: open-house mini-expo`, `${PA}: معرض مفتوح مصغّر`),
      bigIdea: bi(`Events converted best of all channels in the history (${bench("EVENT")}% cost to sales). Run a two-weekend mini-expo on site with the show unit, finance partners and creators who invite their followers to book a tour; portals push the dates.`, `كانت الفعاليات الأعلى تحويلاً بين القنوات في التاريخ (${bench("EVENT")}% من المبيعات). معرض مصغّر لعطلتي نهاية أسبوع في الموقع مع الوحدة النموذجية وشركاء التمويل وصنّاع محتوى يدعون متابعيهم لحجز جولة؛ وتروّج البوابات للمواعيد.`),
      audience: bi("Families who want to see the product before deciding; followers of local lifestyle creators.", "أسر تريد رؤية المنتج قبل القرار؛ ومتابعو صنّاع محتوى أسلوب الحياة المحليين."),
      offer: bi("Event-only price lock for reservations made at the expo.", "تثبيت سعر خاص بالفعالية للحجوزات أثناء المعرض."),
      headline: bi(`${P} open house — two weekends only`, `يوم مفتوح في ${PA} — عطلتا نهاية أسبوع فقط`),
      channels: [{ family: "EVENT", sharePct: 50, role: role("the on-site expo", "المعرض في الموقع") }, { family: "INFLUENCER", sharePct: 15, role: role("creators invite followers to book a tour", "صنّاع محتوى يدعون المتابعين لحجز جولة") }, { family: "PORTAL", sharePct: 20, role: role("event dates on listings", "مواعيد الفعالية في الإعلانات") }, { family: "BROKER", sharePct: 15, role: role("brokers bring clients", "الوسطاء يحضرون عملاءهم") }],
      evidence: ["MAR-EXPO-25", "ASH-LAUNCH-EVENT-24"],
      risks: [bi("Events need 4–6 weeks of preparation and a show unit ready on site.", "تحتاج الفعاليات إلى 4–6 أسابيع تحضير ووحدة نموذجية جاهزة في الموقع.")], source: "rules",
    },
    SUMMER_HOLD: {
      kind: "CAMPAIGN",
      title: bi(`${P}: summer interest list → September pre-sale`, `${PA}: قائمة اهتمام صيفية ← بيع مسبق في سبتمبر`),
      bigIdea: bi(`Summer cost 3.6–4.8% of sales in the history. Spend lightly to build a priority list over the summer (portals and brokers keep demand warm), then convert it in September with a pre-sale window for the list only.`, `كلّف الصيف 3.6–4.8% من المبيعات في التاريخ. إنفاق خفيف لبناء قائمة أولوية خلال الصيف (البوابات والوسطاء يحافظون على الطلب)، ثم التحويل في سبتمبر بنافذة بيع مسبق للقائمة فقط.`),
      audience: bi("Buyers researching from abroad over the summer; returning families planning a September move.", "مشترون يبحثون من الخارج في الصيف؛ وأسر عائدة تخطط للانتقال في سبتمبر."),
      offer: bi("Priority access and price lock for the September pre-sale.", "أولوية الوصول وتثبيت السعر في البيع المسبق لشهر سبتمبر."),
      headline: bi(`Join the ${P} priority list — first choice in September`, `انضموا إلى قائمة أولوية ${PA} — الاختيار الأول في سبتمبر`),
      channels: [{ family: "PORTAL", sharePct: 35, role: role("register-interest listings", "إعلانات تسجيل الاهتمام") }, { family: "BROKER", sharePct: 40, role: role("brokers build the list", "الوسطاء يبنون القائمة") }, { family: "DIGITAL", sharePct: 25, role: role("low-cost lead forms", "نماذج عملاء منخفضة التكلفة") }],
      evidence: ["ASH-SUMMER-24", "ASH-SUMMER-25"],
      risks: [bi("The list must be followed up by Kinan's agent in September, or the summer spend is wasted.", "يجب أن يتابع وكيل كنان القائمة في سبتمبر وإلا ضاع إنفاق الصيف.")], source: "rules",
    },
    LAUNCH_PR: {
      kind: "CONTENT_PR",
      title: bi(`${P}: launch story with proof`, `${PA}: قصة إطلاق مدعومة بالأدلة`),
      bigIdea: bi(`Launches cost 2.4% of sales in the history, and Andalus's 2025 teaser ran at 8% because volume came without qualification. Launch with a story (PR and creators) but route every response to brokers and a site visit within 48 hours, and judge it on qualified leads, not volume.`, `كلّفت عمليات الإطلاق 2.4% من المبيعات في التاريخ، وبلغت حملة تشويق الأندلس 2025 نسبة 8% لأن الحجم جاء دون تأهيل. إطلاق بقصة (علاقات عامة وصنّاع محتوى) مع توجيه كل استجابة إلى الوسطاء وزيارة للموقع خلال 48 ساعة، والحكم على العملاء المؤهلين لا الحجم.`),
      audience: bi("Upgraders and investors following the city's new districts.", "الراغبون في الترقية والمستثمرون المتابعون للأحياء الجديدة في المدينة."),
      offer: bi("Launch-phase price for the first reservations.", "سعر مرحلة الإطلاق لأول الحجوزات."),
      headline: bi(`${P}: the new address — see it first`, `${PA}: العنوان الجديد — كونوا أول من يراه`),
      channels: [{ family: "PR", sharePct: 25, role: role("launch story and media", "قصة الإطلاق والإعلام") }, { family: "INFLUENCER", sharePct: 15, role: role("creator tours", "جولات صنّاع المحتوى") }, { family: "BROKER", sharePct: 35, role: role("qualify and book visits", "التأهيل وحجز الزيارات") }, { family: "DIGITAL", sharePct: 25, role: role("qualified-lead forms only", "نماذج للعملاء المؤهلين فقط") }],
      evidence: ["AND-TEASER-25", "MAR-TEASER-24"],
      risks: [bi("High volume with a low qualified rate predicted weak sales before (Andalus teaser 2025).", "تنبأ الحجم الكبير مع نسبة مؤهلين منخفضة بمبيعات ضعيفة سابقاً (تشويق الأندلس 2025).")], source: "rules",
    },
    BANK_PARTNER: {
      kind: "PARTNERSHIP",
      title: bi(`${P}: bank & employer home-finance partnership`, `${PA}: شراكة تمويل سكني مع البنوك وجهات العمل`),
      bigIdea: bi(`Partner with one or two banks and large local employers: pre-approved mortgage quotes for ${P}, a finance desk at the sales centre on weekends, and an employee offer shared through HR channels. It brings buyers who can already afford the unit, and answers financing doubts before they become lost deals.`, `شراكة مع بنك أو بنكين وجهات عمل كبرى محلية: عروض تمويل معتمدة مسبقاً لـ${PA}، ومكتب تمويل في مركز المبيعات في عطلات نهاية الأسبوع، وعرض للموظفين يُنشر عبر قنوات الموارد البشرية. يجلب مشترين قادرين على الشراء ويعالج مخاوف التمويل قبل أن تتحول إلى صفقات خاسرة.`),
      audience: bi("Salaried families eligible for a mortgage; employees of partner companies.", "أسر موظفة مؤهلة للتمويل العقاري؛ وموظفو الجهات الشريكة."),
      offer: bi("Partner-bank rate and fees covered on reservations made in the window.", "سعر تمويل من البنك الشريك وتحمّل الرسوم للحجوزات خلال الفترة."),
      headline: bi(`${P}: your home, pre-approved`, `${PA}: منزلكم بتمويل معتمد مسبقاً`),
      channels: [{ family: "PR", sharePct: 20, role: role("partnership announcement and employer channels", "إعلان الشراكة وقنوات جهات العمل") }, { family: "DIGITAL", sharePct: 35, role: role("finance-calculator ads and lead forms", "إعلانات حاسبة التمويل ونماذج العملاء") }, { family: "BROKER", sharePct: 25, role: role("brokers armed with the bank offer", "الوسطاء مزودون بعرض البنك") }, { family: "EVENT", sharePct: 20, role: role("weekend finance desk on site", "مكتب تمويل في الموقع نهاية الأسبوع") }],
      risks: [bi("Bank terms need sign-off from finance and legal; the partner bank sets eligibility.", "تحتاج شروط البنك إلى موافقة المالية والقانونية؛ ويحدد البنك الشريك الأهلية.")], source: "rules",
    },
    REFERRAL: {
      kind: "REFERRAL",
      title: bi(`${P}: owners' referral programme`, `${PA}: برنامج إحالة الملاك`),
      bigIdea: bi(`Existing owners and residents are the most credible sales voice. A referral reward for owners whose friends reserve, an owners' evening on site, and content from real residents. Low cost per sale because the reward is paid only on contracts.`, `الملاك والسكان الحاليون أكثر الأصوات مصداقية. مكافأة إحالة للملاك عند حجز أصدقائهم، وأمسية للملاك في الموقع، ومحتوى من سكان حقيقيين. تكلفة منخفضة للبيع لأن المكافأة تُدفع على العقود فقط.`),
      audience: bi("Friends and family of current owners; owners buying a second unit.", "أصدقاء الملاك الحاليين وعائلاتهم؛ وملاك يشترون وحدة ثانية."),
      offer: bi("Referral reward on signed contracts; a gift for the new buyer.", "مكافأة إحالة على العقود الموقعة؛ وهدية للمشتري الجديد."),
      headline: bi(`Your neighbours chose ${P} — ask them why`, `اختار جيرانكم ${PA} — اسألوهم لماذا`),
      channels: [{ family: "EVENT", sharePct: 35, role: role("owners' evening on site", "أمسية الملاك في الموقع") }, { family: "INFLUENCER", sharePct: 25, role: role("resident stories", "قصص السكان") }, { family: "DIGITAL", sharePct: 40, role: role("lookalike audiences from owners", "جماهير مشابهة للملاك") }],
      risks: [bi("Owner contact goes through the developer's customer team, not vendors (privacy).", "يتم التواصل مع الملاك عبر فريق خدمة العملاء لدى المطور لا عبر الموردين (الخصوصية).")], source: "rules",
    },
  };
  const order = c.season.key === "SUMMER" ? ["SUMMER_HOLD", "BROKER_SPRINT", "PAYMENT_PLAN"]
    : c.season.key === "RAMADAN" ? ["PAYMENT_PLAN", "BROKER_SPRINT", "OPEN_HOUSE"]
    : c.season.key === "EVENT" ? ["OPEN_HOUSE", "BROKER_SPRINT", "PAYMENT_PLAN"]
    : c.goal === "LAUNCH" || c.goal === "AWARENESS" ? ["LAUNCH_PR", "OPEN_HOUSE", "BROKER_SPRINT"]
    : ["BROKER_SPRINT", "OPEN_HOUSE", "PAYMENT_PLAN"];
  const sigDrafts = c.toAnswer.map((x) => signalDraft(c, x)).filter(Boolean) as Draft[];
  const extra = c.season.key === "SUMMER" ? ["REFERRAL", "BANK_PARTNER"] : ["BANK_PARTNER", "REFERRAL"];
  // Mix initiative types: the season's best concept, then a partnership / referral, then the next concepts.
  const mixed = [order[0], extra[0], order[1], extra[1], order[2]];
  const seasonal = mixed.map((k) => T[k]).filter((d) => !sigDrafts.some((x) => x.kind === d.kind));
  return [...sigDrafts, ...seasonal].slice(0, Math.min(5, Math.max(3, sigDrafts.length + 1)));
}

// What each channel does when it is the one to restore.
const RESTORE: Record<string, Bi> = {
  PORTAL: bi("re-secure the featured / top-of-search placement and refresh the listing", "استعادة الموقع المميز وأعلى نتائج البحث وتحديث الإعلان"),
  DIGITAL: bi("check ads, forms and tracking; refresh tired creatives", "فحص الإعلانات والنماذج والتتبع؛ وتجديد الإعلانات المستهلكة"),
  BROKER: bi("re-brief brokers and refresh their inventory list", "إعادة إحاطة الوسطاء وتحديث قائمة الوحدات لديهم"),
  INFLUENCER: bi("restart creators on a performance-based brief", "إعادة تشغيل صناع المحتوى بموجز قائم على الأداء"),
  PR: bi("a fresh news angle (construction milestone, handover dates)", "زاوية إخبارية جديدة (مرحلة إنشائية، مواعيد التسليم)"),
  OUTDOOR: bi("rotate the creative and add a QR / short link to measure it", "تغيير التصميم وإضافة رمز QR أو رابط قصير للقياس"),
  EVENT: bi("a dated weekend event to give people a reason to come now", "فعالية بتاريخ محدد تعطي سبباً للحضور الآن"),
  RADIO: bi("a short burst with a call to action", "دفعة قصيرة مع دعوة واضحة للإجراء"),
};
/** A rules initiative that answers one CRM signal. */
function signalDraft(c: IdeationContext, s: Signal): Draft | null {
  const P = c.project, PA = nm("ar", P);
  const role = (en: string, ar: string) => bi(en, ar);
  const fam = (f: string) => c.families.find((x) => x.family === f);
  const lab = (f: string) => fam(f)?.label ?? bi(f, f);
  const what = bi(s.title.en.replace(/^[^:]+:\s*/, ""), s.title.ar.replace(/^[^:]+:\s*/, ""));
  // Best-converting channels for this project today (by benchmark, avoiding the ones flagged expensive here).
  const best = c.families.filter((f) => f.benchCts && !(f.liveCts && f.liveCts > 2 * f.benchCts) && f.vendor).sort((p, q) => (p.benchCts ?? 9) - (q.benchCts ?? 9)).map((f) => f.family);
  const down = s.drivers.filter((d) => d.perWeek < 0);
  const lead = down[0];
  const keepOffer = bi("Keep the current offer — fix the flow first, then judge the offer.", "الإبقاء على العرض الحالي — إصلاح التدفق أولاً ثم الحكم على العرض.");
  const kinan = bi("Follow-up of the open leads stays with Kinan's agent; this initiative only changes marketing.", "تبقى متابعة العملاء المفتوحين لدى وكيل كنان؛ هذه المبادرة تغيّر التسويق فقط.");
  // Evidence from other sources attached to this signal (an email, a PO, a competitor…), quoted in the initiative.
  const rel = (s.related ?? []).slice(0, 3);
  const withEv = (x: Bi): Bi => rel.length ? bi(`${x.en} Evidence from other sources: ${rel.map((r) => `${r.title.en} (${r.source.toLowerCase()})`).join("; ")}.`, `${x.ar} أدلة من مصادر أخرى: ${rel.map((r) => r.title.ar).join("؛ ")}.`) : x;
  const m = s.meta ?? {};
  if (s.kind === "SUDDEN_DROP" || s.kind === "QUAL_RATE_DROP" || s.kind === "EMAIL_ISSUE") {
    const f = lead?.family && lead.family !== "OTHER" ? lead.family : s.family && s.family !== "OTHER" ? s.family : "DIGITAL";
    const others = best.filter((x) => x !== f).slice(0, 2);
    const quality = s.kind === "QUAL_RATE_DROP";
    return {
      kind: "CHANNEL_SHIFT", trigger: s.id, source: "rules",
      title: quality ? bi(`${P}: lead-quality reset`, `${PA}: إعادة ضبط جودة العملاء`) : bi(`${P}: recover the ${lab(f).en.toLowerCase()} lead flow`, `${PA}: استعادة تدفق العملاء من ${lab(f).ar}`),
      bigIdea: withEv(quality
        ? bi(`The CRM shows ${what.en}. Tighten targeting and add qualifying questions (budget, timing, unit type) to every form, and move budget for four weeks towards ${others.map((x) => lab(x).en).join(" and ")}, which bring qualified buyers for ${P}.`, `يُظهر النظام ${what.ar}. تضييق الاستهداف وإضافة أسئلة تأهيل (الميزانية، التوقيت، نوع الوحدة) إلى كل نموذج، ونقل جزء من الميزانية لأربعة أسابيع نحو ${others.map((x) => lab(x).ar).join(" و")} التي تجلب مشترين مؤهلين لـ${PA}.`)
        : bi(`The CRM shows ${what.en}${lead ? `, mostly from ${lead.campaign} (${lead.vendor})` : ""}. Find out what changed and ${RESTORE[f]?.en ?? "restore it"}; meanwhile bridge the gap for 3–4 weeks with ${others.map((x) => lab(x).en).join(" and ")} so the month's qualified leads don't slip.`, `يُظهر النظام ${what.ar}${lead ? `، معظمه من ${nm("ar", lead.campaign)} (${nm("ar", lead.vendor)})` : ""}. معرفة ما الذي تغيّر و${RESTORE[f]?.ar ?? "استعادته"}؛ وفي الأثناء سدّ الفجوة لـ3–4 أسابيع عبر ${others.map((x) => lab(x).ar).join(" و")} كي لا يتراجع عدد المؤهلين هذا الشهر.`)),
      audience: bi("The same buyers the channel was reaching before the drop.", "المشترون أنفسهم الذين كانت القناة تصل إليهم قبل التراجع."),
      offer: keepOffer,
      headline: bi(`Keep the current ${P} message`, `الإبقاء على رسالة ${PA} الحالية`),
      channels: quality
        ? [{ family: others[0] ?? "BROKER", sharePct: 45, role: role("more weight on the channel bringing qualified buyers", "وزن أكبر للقناة التي تجلب مشترين مؤهلين") }, { family: others[1] ?? "PORTAL", sharePct: 25, role: role("high-intent listings", "إعلانات عالية النية") }, { family: f, sharePct: 30, role: role("tighter targeting and qualifying forms", "استهداف أدق ونماذج تأهيل") }]
        : [{ family: f, sharePct: 45, role: bi(RESTORE[f]?.en ?? "restore", RESTORE[f]?.ar ?? "استعادة") }, ...others.map((x, i) => ({ family: x, sharePct: i === 0 ? 30 : 25, role: role("bridge the gap while the channel recovers", "سدّ الفجوة ريثما تتعافى القناة") }))],
      risks: [bi("If the drop is a tracking break, not real demand, fix tracking before shifting money.", "إن كان التراجع خللاً في التتبع لا في الطلب، أصلحوا التتبع قبل نقل الأموال."), kinan],
    };
  }
  if (s.kind === "DECLINE") {
    const paused = down.find((d) => d.note?.en === "paused");
    const hasInfl = paused?.family === "INFLUENCER";
    return {
      kind: "CAMPAIGN", trigger: s.id, source: "rules",
      title: bi(`${P}: refill the top of the funnel`, `${PA}: إعادة ملء أعلى مسار المبيعات`),
      bigIdea: withEv(bi(`The CRM shows ${what.en}${paused ? `; the biggest loss is ${paused.campaign}, which was paused` : ""}. A fresh 6-week push: new creative and audiences built from CRM-qualified buyers (lookalikes), ${hasInfl ? "creators back on a pay-for-performance brief, " : ""}and featured listings, so new demand replaces what stopped.`, `يُظهر النظام ${what.ar}${paused ? `؛ وأكبر خسارة من ${nm("ar", paused.campaign)} التي أُوقفت` : ""}. دفعة جديدة لستة أسابيع: إعلانات وجماهير جديدة مبنية على المشترين المؤهلين في النظام (جماهير مشابهة)${hasInfl ? "، وعودة صناع المحتوى بموجز مدفوع حسب الأداء" : ""}، وإعلانات مميزة في البوابات، ليحل طلب جديد محل ما توقف.`)),
      audience: bi("New audiences that look like the buyers who qualified in the CRM.", "جماهير جديدة تشبه المشترين المؤهلين في النظام."),
      offer: bi("A reason to act now: limited release of the best-value units.", "سبب للتحرك الآن: طرح محدود لأفضل الوحدات قيمة."),
      headline: bi(`${P}: new release, limited units`, `${PA}: طرح جديد بوحدات محدودة`),
      channels: [{ family: "DIGITAL", sharePct: hasInfl ? 40 : 50, role: role("lookalikes from CRM-qualified buyers, new creative", "جماهير مشابهة للمؤهلين وإعلانات جديدة") }, ...(hasInfl ? [{ family: "INFLUENCER", sharePct: 20, role: role("creators back, paid per qualified lead", "عودة صناع المحتوى بالدفع لكل عميل مؤهل") }] : []), { family: "PORTAL", sharePct: 25, role: role("featured listings with the release", "إعلانات مميزة بالطرح") }, { family: "BROKER", sharePct: 15, role: role("brokers get the release first", "الوسطاء يحصلون على الطرح أولاً") }],
      evidence: ["AND-TEASER-25"], risks: [bi("Volume without quality failed before (Andalus teaser 2025): judge the push on CRM-qualified leads.", "فشل الحجم دون جودة سابقاً (تشويق الأندلس 2025): احكموا على الدفعة بالعملاء المؤهلين في النظام."), kinan],
    };
  }
  if (s.kind === "SALES_DROP") return {
    kind: "OFFER", trigger: s.id, source: "rules",
    title: bi(`${P}: closing offer to turn interest into contracts`, `${PA}: عرض إغلاق لتحويل الاهتمام إلى عقود`),
    bigIdea: withEv(bi(`The CRM shows ${what.en}. A time-limited closing offer (payment plan or fees covered) for reservations made within 30 days, a broker booster on signed contracts, and a weekend viewing event — so buyers already in the pipeline have a reason to decide now.`, `يُظهر النظام ${what.ar}. عرض إغلاق محدد المدة (خطة سداد أو تحمّل الرسوم) للحجوزات خلال 30 يوماً، وحافز للوسطاء على العقود الموقعة، وفعالية معاينة نهاية الأسبوع — ليكون لدى المشترين في المسار سبب لاتخاذ القرار الآن.`)),
    audience: bi("Buyers who viewed or reserved but have not signed; broker clients close to a decision.", "مشترون عاينوا أو حجزوا ولم يوقعوا؛ وعملاء الوسطاء القريبون من القرار."),
    offer: bi("Payment plan with a low first instalment, or registration fees covered — 30 days only.", "خطة سداد بدفعة أولى منخفضة أو تحمّل رسوم التسجيل — لمدة 30 يوماً فقط."),
    headline: bi(`${P}: decide this month, pay over time`, `${PA}: قرروا هذا الشهر وادفعوا على مراحل`),
    channels: [{ family: "BROKER", sharePct: 45, role: role("booster on signed contracts", "حافز على العقود الموقعة") }, { family: "EVENT", sharePct: 25, role: role("weekend viewing event", "فعالية معاينة نهاية الأسبوع") }, { family: "DIGITAL", sharePct: 15, role: role("retargeting site visitors with the offer", "إعادة استهداف زوار الموقع بالعرض") }, { family: "PORTAL", sharePct: 15, role: role("offer badge on listings", "شارة العرض على الإعلانات") }],
    evidence: ["MAR-RAMADAN-25"], risks: [bi("Offers need finance approval and can pull sales forward — compare with the months after.", "تحتاج العروض إلى موافقة المالية وقد تسرّع المبيعات — قارنوا بالأشهر التالية."), kinan],
  };
  if (s.kind === "LOST_REASON") {
    const r = s.reason ?? "";
    const k: Kind = r === "Financing" ? "PARTNERSHIP" : r === "Price" ? "OFFER" : r === "Location" ? "EVENT" : "POSITIONING";
    const t: Record<Kind, [Bi, Bi, { family: string; sharePct: number; role: Bi }[]]> = {
      PARTNERSHIP: [bi(`${P}: bank partnership to answer financing doubts`, `${PA}: شراكة بنكية لمعالجة مخاوف التمويل`), bi("Pre-approved mortgage quotes and a finance desk on site.", "عروض تمويل معتمدة مسبقاً ومكتب تمويل في الموقع."), [{ family: "DIGITAL", sharePct: 40, role: role("finance-calculator ads", "إعلانات حاسبة التمويل") }, { family: "EVENT", sharePct: 30, role: role("finance desk weekends", "عطلات مكتب التمويل") }, { family: "BROKER", sharePct: 30, role: role("brokers with the bank offer", "الوسطاء بعرض البنك") }]],
      OFFER: [bi(`${P}: value offer for price-sensitive buyers`, `${PA}: عرض قيمة للمشترين الحساسين للسعر`), bi("A payment plan that lowers the monthly amount, shown in every ad.", "خطة سداد تخفض القسط الشهري وتظهر في كل إعلان."), [{ family: "DIGITAL", sharePct: 45, role: role("instalment-led ads", "إعلانات تبرز القسط") }, { family: "PORTAL", sharePct: 30, role: role("instalment on listings", "القسط في الإعلانات") }, { family: "BROKER", sharePct: 25, role: role("brokers brief the plan", "الوسطاء يشرحون الخطة") }]],
      EVENT: [bi(`${P}: neighbourhood tours`, `${PA}: جولات في الحي`), bi("Guided tours showing schools, commute and services around the project.", "جولات توضح المدارس والتنقل والخدمات حول المشروع."), [{ family: "EVENT", sharePct: 50, role: role("guided tours", "جولات مرشدة") }, { family: "INFLUENCER", sharePct: 20, role: role("area guides by creators", "أدلة الحي من صناع المحتوى") }, { family: "DIGITAL", sharePct: 30, role: role("tour bookings", "حجز الجولات") }]],
      POSITIONING: [bi(`${P}: proof against the competition`, `${PA}: إثبات التفوق على المنافسين`), bi("A clear side-by-side on what buyers get (specification, delivery record, payment terms) in all materials.", "مقارنة واضحة لما يحصل عليه المشتري (المواصفات، سجل التسليم، شروط الدفع) في كل المواد."), [{ family: "DIGITAL", sharePct: 40, role: role("comparison content", "محتوى المقارنة") }, { family: "PR", sharePct: 30, role: role("delivery-record story", "قصة سجل التسليم") }, { family: "BROKER", sharePct: 30, role: role("comparison sheet for brokers", "ورقة مقارنة للوسطاء") }]],
      CAMPAIGN: [bi("", ""), bi("", ""), []], BROKER_PROGRAM: [bi("", ""), bi("", ""), []], CONTENT_PR: [bi("", ""), bi("", ""), []], CHANNEL_SHIFT: [bi("", ""), bi("", ""), []], REFERRAL: [bi("", ""), bi("", ""), []],
    };
    const [title, offer, channels] = t[k];
    return { kind: k, trigger: s.id, source: "rules", title, offer, channels,
      bigIdea: bi(`The CRM shows ${what.en}. ${offer.en}`, `يُظهر النظام ${what.ar}. ${offer.ar}`),
      audience: bi("Buyers who hesitate for this reason.", "المشترون المترددون لهذا السبب."), headline: bi(`${P}: ${offer.en.split(".")[0].toLowerCase()}`, `${PA}: ${offer.ar.split(".")[0]}`), risks: [kinan] };
  }
  if (s.kind === "SURGE") {
    const up = s.drivers.filter((d) => d.perWeek > 0).reverse()[0];
    const f = up?.family && up.family !== "OTHER" ? up.family : s.family ?? "DIGITAL";
    return {
      kind: "CHANNEL_SHIFT", trigger: s.id, source: "rules",
      title: bi(`${P}: scale what is working (${lab(f).en})`, `${PA}: توسيع ما ينجح (${lab(f).ar})`),
      bigIdea: bi(`The CRM shows ${what.en}. Add budget to ${lab(f).en} in steps of 20% while cost per qualified lead stays within benchmark; stop adding when it rises.`, `يُظهر النظام ${what.ar}. زيادة ميزانية ${lab(f).ar} بخطوات 20% ما دامت تكلفة العميل المؤهل ضمن المعيار؛ والتوقف عند ارتفاعها.`),
      audience: bi("More of the audience that is responding now.", "المزيد من الجمهور المستجيب حالياً."), offer: keepOffer, headline: bi(`Keep the current ${P} message`, `الإبقاء على رسالة ${PA} الحالية`),
      channels: [{ family: f, sharePct: 70, role: role("scale in 20% steps", "التوسع بخطوات 20%") }, { family: best.find((x) => x !== f) ?? "BROKER", sharePct: 30, role: role("convert the extra demand", "تحويل الطلب الإضافي") }], risks: [kinan],
    };
  }
  const say = bi(s.title.en, s.title.ar);
  if (s.kind === "AD_FATIGUE" || s.kind === "AD_COST_RISE") return {
    kind: "CONTENT_PR", trigger: s.id, source: "rules",
    title: bi(`${P}: creative refresh for ${s.campaign ?? "the digital campaign"}`, `${PA}: تجديد الإعلانات لـ${nm("ar", s.campaign ?? "")}`),
    bigIdea: withEv(bi(`The ad platforms show ${say.en.replace(/^[^:]+:\s*/, "")}: the same creatives have run too long. Replace them with a new set built on the messages that qualify best in your creative data (payment plan, show-unit tour, floor plans), in Arabic first; retire anything shown more than 4 times per person; rotate every 3–4 weeks.`, `تُظهر المنصات الإعلانية ${say.ar.replace(/^[^:]+:\s*/, "")}: استمرت الإعلانات نفسها طويلاً. استبدالها بمجموعة جديدة مبنية على الرسائل الأعلى تأهيلاً في بيانات الإعلانات (خطة السداد، جولة الوحدة النموذجية، المخططات) وبالعربية أولاً؛ وإيقاف ما يُعرض أكثر من 4 مرات للشخص؛ والتدوير كل 3–4 أسابيع.`)),
    audience: bi("The same audiences, plus lookalikes of CRM-qualified buyers.", "الجماهير نفسها، مع جماهير مشابهة للمشترين المؤهلين."),
    offer: bi("Keep the offer; change the creative and the opening seconds.", "الإبقاء على العرض وتغيير الإعلان والثواني الأولى."),
    headline: bi(`${P}: see your home before you buy`, `${PA}: شاهدوا منزلكم قبل الشراء`),
    channels: [{ family: "DIGITAL", sharePct: 75, role: role("new creative set on Meta, Snap and TikTok", "مجموعة إعلانات جديدة على ميتا وسناب وتيك توك") }, { family: "INFLUENCER", sharePct: 25, role: role("creator-made show-unit tours as ad content", "جولات صناع المحتوى كمحتوى إعلاني") }],
    risks: [bi("Brief the agency with the creative data, not taste; judge new creatives on cost per CRM-qualified lead after 2 weeks.", "إحاطة الوكالة ببيانات الإعلانات لا بالذوق؛ والحكم على الإعلانات الجديدة بتكلفة العميل المؤهل بعد أسبوعين.")],
  };
  if (s.kind === "COMPETITOR_PUSH" || s.kind === "EMAIL_MARKET") {
    const offer = String(m.offer ?? ""), comp = String(m.competitor ?? "the competitor");
    const yieldy = /yield|rental/i.test(offer), lowPay = /down payment|payment plan|10\/90|1%/i.test(offer);
    return {
      kind: yieldy ? "POSITIONING" : "OFFER", trigger: s.id, source: "rules",
      title: yieldy ? bi(`${P}: investor proof against ${comp}${comp.endsWith("s") ? "'" : "'s"} yield promise`, `${PA}: إثبات للمستثمرين أمام وعد العائد من ${nm("ar", comp)}`) : bi(`${P}: answer ${comp}${comp.endsWith("s") ? "'" : "'s"} offer`, `${PA}: الرد على عرض ${nm("ar", comp)}`),
      bigIdea: withEv(yieldy
        ? bi(`${say.en}. Don't match a guarantee you can't price; answer with proof: actual rents and occupancy around ${P}, the resale record of past projects, and a rental-management option — in investor content, broker kits and portal listings.`, `${say.ar}. لا تجاروا ضماناً لا يمكن تسعيره؛ بل أجيبوا بالأدلة: الإيجارات والإشغال الفعلي حول ${PA}، وسجل إعادة البيع للمشاريع السابقة، وخيار لإدارة التأجير — في محتوى المستثمرين وحقائب الوسطاء وإعلانات البوابات.`)
        : bi(`${say.en}. Buyers compare first payments. Offer a structured plan with a low first instalment for ${P} (finance to approve), show the monthly amount in every ad and listing, and give brokers a side-by-side against ${comp}.`, `${say.ar}. يقارن المشترون الدفعة الأولى. تقديم خطة منظمة بدفعة أولى منخفضة لـ${PA} (بموافقة المالية)، وإظهار القسط الشهري في كل إعلان وقائمة، وتزويد الوسطاء بمقارنة مع ${nm("ar", comp)}.`)),
      audience: yieldy ? bi("Investors comparing yields in the area.", "مستثمرون يقارنون العوائد في المنطقة.") : bi("Buyers comparing offers in the same district.", "مشترون يقارنون العروض في الحي نفسه."),
      offer: yieldy ? bi("Rental-management option and published rent evidence.", "خيار إدارة التأجير وأدلة الإيجار المنشورة.") : bi("Low first instalment, rest over construction — for reservations this quarter.", "دفعة أولى منخفضة والباقي خلال الإنشاء — لحجوزات هذا الربع."),
      headline: yieldy ? bi(`${P}: real rents, real resale — see the numbers`, `${PA}: إيجارات حقيقية وإعادة بيع حقيقية — اطّلعوا على الأرقام`) : bi(`${P}: start with a small first payment`, `${PA}: ابدؤوا بدفعة أولى صغيرة`),
      channels: [{ family: "DIGITAL", sharePct: 40, role: role("comparison and instalment ads", "إعلانات المقارنة والقسط") }, { family: "BROKER", sharePct: 35, role: role("side-by-side kit for brokers", "حقيبة مقارنة للوسطاء") }, { family: "PORTAL", sharePct: 25, role: role("offer badge on listings", "شارة العرض على الإعلانات") }],
      risks: [bi("Never name or disparage the competitor in ads; compare facts in broker material only. Offers need finance approval.", "عدم ذكر المنافس أو الإساءة إليه في الإعلانات؛ والمقارنة بالحقائق في مواد الوسطاء فقط. تحتاج العروض إلى موافقة المالية.")],
    };
  }
  if (s.kind === "BUDGET_HEADROOM") {
    const k = Number(m.amountK ?? 0), to = best.filter((x) => x !== s.family).slice(0, 2);
    return {
      kind: "CHANNEL_SHIFT", trigger: s.id, source: "rules",
      title: bi(`${P}: put SAR ${k}K of committed budget to work`, `${PA}: تشغيل ${k} ألف ر.س من الميزانية الملتزم بها`),
      bigIdea: withEv(bi(`${say.en}. Ask the vendor to release it or move it (with finance) to ${to.map((x) => lab(x).en).join(" and ")}, the best-converting channels for ${P} today — no new budget needed.`, `${say.ar}. مطالبة المورد بالإفراج عنها أو نقلها (مع المالية) إلى ${to.map((x) => lab(x).ar).join(" و")}، أعلى القنوات تحويلاً لـ${PA} حالياً — دون ميزانية جديدة.`)),
      audience: bi("Buyers the best-converting channels already reach.", "المشترون الذين تصل إليهم القنوات الأعلى تحويلاً."), offer: keepOffer, headline: bi(`Keep the current ${P} message`, `الإبقاء على رسالة ${PA} الحالية`),
      channels: to.map((x, i) => ({ family: x, sharePct: i === 0 ? 60 : 40, role: role("receives the redeployed budget", "تستقبل الميزانية المعاد توجيهها") })),
      risks: [bi("PO changes need procurement; confirm the vendor's notice terms first.", "تحتاج تعديلات أوامر الشراء إلى المشتريات؛ تأكدوا أولاً من شروط الإشعار لدى المورد.")],
    };
  }
  if (s.kind === "EMAIL_OPPORTUNITY") {
    const bank = /bank|mortgage|financ|تمويل|بنك/i.test(`${s.title.en} ${s.why.en}`);
    const sender = String(m.sender ?? "");
    return {
      kind: bank ? "PARTNERSHIP" : "CAMPAIGN", trigger: s.id, source: "rules",
      title: bank ? bi(`${P}: finance partnership with ${sender.replace(/ \(.*\)$/, "")}`, `${PA}: شراكة تمويل مع ${sender.replace(/ \(.*\)$/, "")}`) : bi(`${P}: take up ${sender}'s proposal`, `${PA}: الاستفادة من مقترح ${nm("ar", sender)}`),
      bigIdea: withEv(bank
        ? bi(`An inbound offer: ${say.en}. Accept it for ${P}: pre-approval for buyers in 24 hours, a weekend finance desk on site, and a joint campaign to the bank's salaried customers — buyers arrive already able to pay.`, `عرض وارد: ${say.ar}. قبوله لـ${PA}: موافقة مسبقة للمشترين خلال 24 ساعة، ومكتب تمويل في الموقع نهاية الأسبوع، وحملة مشتركة لعملاء البنك من الموظفين — فيصل المشترون قادرين على الدفع.`)
        : bi(`An inbound proposal: ${say.en}. Pilot it for 6 weeks on a pay-for-results basis, judged on CRM-qualified leads.`, `مقترح وارد: ${say.ar}. تجربته لستة أسابيع بالدفع حسب النتائج، والحكم بالعملاء المؤهلين في النظام.`)),
      audience: bank ? bi("Salaried buyers eligible for a mortgage.", "مشترون موظفون مؤهلون للتمويل.") : bi("The audience named in the proposal.", "الجمهور المذكور في المقترح."),
      offer: bank ? bi("Partner-bank pre-approval and fees covered in the window.", "موافقة مسبقة من البنك الشريك وتحمّل الرسوم خلال الفترة.") : keepOffer,
      headline: bank ? bi(`${P}: your home, pre-approved`, `${PA}: منزلكم بتمويل معتمد مسبقاً`) : bi(`Keep the current ${P} message`, `الإبقاء على رسالة ${PA} الحالية`),
      channels: bank ? [{ family: "PR", sharePct: 20, role: role("joint announcement", "إعلان مشترك") }, { family: "DIGITAL", sharePct: 40, role: role("finance-calculator ads", "إعلانات حاسبة التمويل") }, { family: "EVENT", sharePct: 20, role: role("finance desk weekends", "عطلات مكتب التمويل") }, { family: "BROKER", sharePct: 20, role: role("brokers with the bank offer", "الوسطاء بعرض البنك") }]
        : [{ family: s.family && s.family !== "OTHER" ? s.family : "DIGITAL", sharePct: 70, role: role("the proposed pilot", "التجربة المقترحة") }, { family: "PORTAL", sharePct: 30, role: role("listings carry the message", "الإعلانات تحمل الرسالة") }],
      risks: [bi("Reply only after approval; partnership terms go through legal and finance.", "الرد بعد الاعتماد فقط؛ وتمر شروط الشراكة عبر القانونية والمالية.")],
    };
  }
  if (s.kind === "EMAIL_EVENT" || (s.kind === "CALENDAR_MOMENT" && s.direction === "up")) {
    const city = /cityscape/i.test(s.title.en), nd = /national day/i.test(s.title.en);
    return {
      kind: "EVENT", trigger: s.id, source: "rules",
      title: city ? bi(`${P} at Cityscape: stand, show-unit VR and booked meetings`, `${PA} في سيتي سكيب: جناح وجولة افتراضية واجتماعات محجوزة`) : nd ? bi(`${P}: National Day family weekend`, `${PA}: عطلة اليوم الوطني للعائلات`) : bi(`${P}: ${say.en}`, `${PA}: ${say.ar}`),
      bigIdea: withEv(city
        ? bi(`${say.en}. Book a stand at the early-bird price, bring a VR tour of the show unit, and pre-book meetings with Riyadh investors through brokers and ads in the four weeks before. Events converted best in the history.`, `${say.ar}. حجز جناح بسعر الحجز المبكر، وجولة افتراضية في الوحدة النموذجية، وحجز اجتماعات مسبقة مع مستثمري الرياض عبر الوسطاء والإعلانات قبل أربعة أسابيع. كانت الفعاليات الأعلى تحويلاً في التاريخ.`)
        : bi(`${say.en}. A family open weekend on site with a dated offer, promoted two weeks ahead; ad costs peak on the day itself, so spend before it.`, `${say.ar}. عطلة مفتوحة للعائلات في الموقع بعرض مؤقت، يُروَّج لها قبل أسبوعين؛ وتبلغ تكلفة الإعلانات ذروتها يوم المناسبة، فالإنفاق قبله.`)),
      audience: city ? bi("Riyadh investors and Jeddah families visiting Cityscape.", "مستثمرو الرياض وأسر جدة زوار سيتي سكيب.") : bi("Families out for the holiday.", "العائلات في عطلة المناسبة."),
      offer: bi("Event-only price lock for reservations made at the event.", "تثبيت سعر خاص بالفعالية للحجوزات خلالها."),
      headline: city ? bi(`Meet ${P} at Cityscape`, `قابلوا ${PA} في سيتي سكيب`) : bi(`${P}: celebrate at home`, `${PA}: احتفلوا في منزلكم`),
      channels: [{ family: "EVENT", sharePct: 55, role: role(city ? "stand and VR tour" : "the open weekend", city ? "الجناح والجولة الافتراضية" : "العطلة المفتوحة") }, { family: "BROKER", sharePct: 25, role: role("pre-booked meetings", "اجتماعات محجوزة مسبقاً") }, { family: "DIGITAL", sharePct: 20, role: role("invitations to book a slot", "دعوات لحجز موعد") }],
      evidence: ["MAR-EXPO-25"], risks: [bi("Events need 6–10 weeks of preparation; decide by the deadline in the signal.", "تحتاج الفعاليات إلى 6–10 أسابيع تحضير؛ قرروا قبل الموعد المذكور في الإشارة.")],
    };
  }
  if (s.kind === "MARKET_SHIFT" || s.kind === "FINANCE_SHIFT") {
    const rate = s.kind === "FINANCE_SHIFT", up = s.direction === "up";
    return {
      kind: rate ? "PARTNERSHIP" : up ? "OFFER" : "POSITIONING", trigger: s.id, source: "rules",
      title: rate ? bi(`${P}: lead with the monthly instalment at today's rates`, `${PA}: إبراز القسط الشهري بأسعار اليوم`) : up ? bi(`${P}: buy before prices move`, `${PA}: اشتروا قبل تحرك الأسعار`) : bi(`${P}: certainty in a softer market`, `${PA}: اليقين في سوق أهدأ`),
      bigIdea: withEv(rate
        ? bi(`${say.en}. Show the monthly instalment at today's rate in every ad and listing, with a bank calculator and pre-approval; brokers quote the monthly figure first.`, `${say.ar}. إظهار القسط الشهري بسعر اليوم في كل إعلان وقائمة، مع حاسبة بنكية وموافقة مسبقة؛ ويذكر الوسطاء الرقم الشهري أولاً.`)
        : up ? bi(`${say.en}. A price lock for reservations this month, with the district's price trend shown in ads and broker kits.`, `${say.ar}. تثبيت السعر لحجوزات هذا الشهر، مع إظهار اتجاه أسعار الحي في الإعلانات وحقائب الوسطاء.`)
          : bi(`${say.en}. With many off-plan alternatives, sell certainty: delivery record, escrow, handover dates and a price-protection promise.`, `${say.ar}. مع كثرة البدائل على الخارطة، بيعوا اليقين: سجل التسليم وحساب الضمان ومواعيد التسليم ووعد حماية السعر.`)),
      audience: bi("Buyers deciding in this market now.", "المشترون الذين يقررون في هذا السوق الآن."), offer: rate ? bi("Pre-approval and the monthly figure up front.", "موافقة مسبقة والرقم الشهري أولاً.") : up ? bi("Price lock for reservations this month.", "تثبيت السعر لحجوزات هذا الشهر.") : bi("Price protection until handover.", "حماية السعر حتى التسليم."),
      headline: rate ? bi(`${P} from a monthly amount you know`, `${PA} بقسط شهري تعرفونه`) : up ? bi(`${P}: today's price, locked`, `${PA}: سعر اليوم مثبّت`) : bi(`${P}: on time, protected`, `${PA}: في الموعد ومحمي`),
      channels: [{ family: "DIGITAL", sharePct: 45, role: role("message in ads", "الرسالة في الإعلانات") }, { family: "PORTAL", sharePct: 25, role: role("message on listings", "الرسالة في الإعلانات العقارية") }, { family: "BROKER", sharePct: 30, role: role("brokers lead with it", "الوسطاء يبدؤون بها") }],
      risks: [bi("Rates and prices are public data; quote the source and date.", "الأسعار بيانات عامة؛ اذكروا المصدر والتاريخ.")],
    };
  }
  return null;
}

// ------------------------------------------------------------------- AI ideas
const IDEATE_SYSTEM = `You are a senior real-estate marketing strategist in Saudi Arabia, ideating market initiatives for a developer's AI Assistant Director of Marketing. The marketing manager works alone and runs external vendors.

Propose 4 DISTINCT market initiatives for the brief in DATA — not only ad campaigns: offers and pricing, partnerships (banks, employers, schools), events and on-site experiences, broker programmes, content and PR, budget and channel shifts, positioning and product messaging, referral and community. Use at least two different kinds. Ground every initiative in the data: what today's scan of ALL sources found (signals: the CRM — leads, qualified leads, contracts, lost reasons; the email inbox — vendor notices, proposals, market news, event deadlines; Oracle invoices and POs — unused committed budget; social and ad platforms — click-through and cost trends, creative fatigue; competitors' Meta ads and offers; the market — district transactions, prices, mortgage rates; the calendar), with "related" evidence from other sources; the project's gap to target, the season, the channel benchmarks and lessons from the 2023–2025 campaign history, today's flags, and the vendors available.
- signalsToAnswer: EVERY signal listed there must be answered by at least one initiative that responds to its likely cause (use the drivers and the related evidence: which campaign, vendor, channel, email, PO or competitor explains it), with "trigger" set to the signal's id. Use concrete facts from the evidence (e.g. a vendor's proposal, unused PO budget, a competitor's offer). Initiatives not answering a signal have "trigger": null. Be specific and creative about the concept, offer and message; be realistic for the Saudi market (family decision-making, Ramadan, summer travel, Cityscape, payment plans, off-plan regulation).

Rules:
- "kind" one of: CAMPAIGN, OFFER, PARTNERSHIP, EVENT, BROKER_PROGRAM, CONTENT_PR, CHANNEL_SHIFT, POSITIONING, REFERRAL.
- Channels (how the initiative reaches people) only from: DIGITAL, PORTAL, BROKER, EVENT, INFLUENCER, PR, OUTDOOR, RADIO; sharePct are whole numbers summing to 100. Avoid channels the history shows as expensive unless the idea needs them, and explain why.
- Do NOT give forecasts, budgets in SAR, lead counts or sales numbers — the system computes them from the history.
- Leads, follow-up and sales are handled by Kinan's own AI agent: do not propose lead-handling tasks.
- Cite past campaign codes from DATA in "evidence" when an idea builds on them.
- Every text field in English AND Arabic (Modern Standard Arabic, Western digits). Keep names as in the data.

Reply with JSON only, no prose, exactly:
{"ideas":[{"kind":"CAMPAIGN","trigger":null,"title":{"en":"","ar":""},"bigIdea":{"en":"","ar":""},"audience":{"en":"","ar":""},"offer":{"en":"","ar":""},"headline":{"en":"","ar":""},"channels":[{"family":"BROKER","sharePct":40,"role":{"en":"","ar":""}}],"risks":[{"en":"","ar":""}],"evidence":["CODE"]}]}`;

const JUDGE_SYSTEM = `You are the AI Assistant Director of Marketing judging market initiatives before they reach the marketing manager. For each candidate in DATA you get the concept and a forecast computed from the campaign history (trust the forecast; do not invent numbers).

Score each idea 1–10 on: fit with the data and the lessons of the history, expected efficiency (cost to sales vs the project's history and the target gap), distinctiveness from the other ideas, and feasibility with the vendors available in the season. Penalise ideas that repeat a past mistake or lean on channels flagged as expensive for this project. Keep the best 3–4 that are clearly different from each other; drop near-duplicates. For every signal in signalsToAnswer, keep at least one candidate whose trigger is that signal (the best one), and judge whether it really addresses the cause.

Reply with JSON only:
{"ranking":[{"id":"A1","score":8.5,"keep":true,"why":{"en":"","ar":""},"improve":{"en":"","ar":""}}]}
"why": one sentence on why it should work (or not). "improve": one concrete change. English and Arabic (Modern Standard Arabic, Western digits).`;

function parseJson(text: string): any {
  const t = text.replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in the answer");
  return JSON.parse(t.slice(a, b + 1));
}
const isBi = (x: any): x is Bi => x && typeof x.en === "string" && typeof x.ar === "string" && x.en.trim() !== "";
const toDraft = (x: any, source: string, model: string): Draft | null => {
  if (!isBi(x?.title) || !isBi(x?.bigIdea) || !Array.isArray(x?.channels)) return null;
  const b = (y: any) => (isBi(y) ? { en: y.en.slice(0, 600), ar: (y.ar || y.en).slice(0, 600) } : bi("", ""));
  return {
    title: b(x.title), bigIdea: b(x.bigIdea), audience: b(x.audience), offer: b(x.offer), headline: b(x.headline),
    channels: x.channels.slice(0, 6).map((ch: any) => ({ family: String(ch?.family ?? ""), sharePct: Number(ch?.sharePct) || 0, role: b(ch?.role) })),
    risks: Array.isArray(x.risks) ? x.risks.filter(isBi).slice(0, 3).map(b) : [], evidence: Array.isArray(x.evidence) ? x.evidence.map(String).slice(0, 4) : [], source, model,
    kind: KINDS.includes(String(x.kind ?? "").toUpperCase() as Kind) ? (String(x.kind).toUpperCase() as Kind) : "CAMPAIGN", trigger: typeof x.trigger === "string" && x.trigger ? x.trigger : null,
  };
};
const forModel = (c: IdeationContext) => ({
  brief: { project: c.project, month: c.month, season: c.season.label.en, seasonNote: c.season.note.en, goal: c.goal, budgetK: c.budgetK, audience: c.audience || null, notes: c.notes || null },
  target: c.target, projectCostToSalesPct: c.projectCtsPct, historyCostToSalesPct: c.historyCtsPct,
  channels: c.families.map((f) => ({ family: f.family, benchmarkCostToSalesPct: f.benchCts, cpqlSAR: f.cpql, qualifiedPct: f.qualPct, pastCampaigns: f.campaigns, seasonFactor: f.seasonFactor, liveCostToSalesForProject: f.liveCts, vendor: f.vendor ? `${f.vendor.name} (${f.vendor.note.en})` : "none" })),
  todaysFlagsForProject: c.flags, pastCampaignsForProject: c.pastForProject, pastCampaignsSameSeason: c.seasonPast, lessons: c.lessons,
  signals: signalsForModel(c.signals), signalsToAnswer: c.toAnswer.map((x) => x.id), scannedOn: c.crmAsOf,
});
/** Make sure every signal to answer has an initiative: the best AI one that names it, else the rules one. */
function coverSignals(c: IdeationContext, kept: Idea[], pool: Idea[]): Idea[] {
  const out = [...kept];
  for (const s of c.toAnswer) {
    if (out.some((x) => x.trigger?.id === s.id)) continue;
    const cand = pool.find((x) => x.trigger?.id === s.id) ?? (() => { const d = signalDraft(c, s); return d ? finalize(c, d) : null; })();
    if (cand) out.splice(Math.min(out.length, c.toAnswer.indexOf(s)), 0, cand);
  }
  return out.slice(0, Math.max(3, Math.min(4, out.length)));
}

async function aiIdeas(c: IdeationContext, lang: Lang): Promise<{ ideas: Idea[]; providers: string[]; judge: string | null; errors: string[] }> {
  const { ensembleFor, runLlm } = await import("./llm");
  const providers = ensembleFor("ideate", 2);
  const data = `DATA:\n${JSON.stringify(forModel(c))}`;
  const ask = tx(lang, "Propose the market initiatives for this brief.", "اقترح مبادرات السوق لهذا الموجز.");
  const errors: string[] = [];
  const batches = await Promise.all(providers.map(async (p) => {
    try {
      const res = await runLlm({ task: "ideate", only: p, system: IDEATE_SYSTEM, data, messages: [{ role: "user", content: ask }], maxTokens: 12000 });
      return ((parseJson(res.text).ideas ?? []) as any[]).map((x) => toDraft(x, res.provider, res.model)).filter(Boolean) as Draft[];
    } catch (e: any) { errors.push(`${p}: ${e?.message ?? e}`); return []; }
  }));
  const drafts = batches.flat();
  const ideas = drafts.map((d) => finalize(c, d)).filter(Boolean) as Idea[];
  if (!ideas.length) return { ideas: [], providers, judge: null, errors };
  // Judge: rank against the data, keep the best distinct ones.
  try {
    const ids = ideas.map((_, i) => `A${i + 1}`);
    const res = await runLlm({ task: "judge", system: JUDGE_SYSTEM, data: `DATA:\n${JSON.stringify({ context: forModel(c), candidates: ideas.map((x, i) => ({ id: ids[i], from: x.source, kind: x.kind, trigger: x.trigger?.id ?? null, title: x.title.en, bigIdea: x.bigIdea.en, offer: x.offer.en, channels: x.channels.map((ch) => `${ch.family} ${ch.sharePct}% (${ch.vendor})`), forecast: { costToSalesPct: x.forecast.costToSalesPct, contracts: x.forecast.contracts, salesM: x.forecast.salesM }, cautions: x.cautions.map((y) => y.en) })) })}`, messages: [{ role: "user", content: "Rank the candidates." }], maxTokens: 6000 });
    const ranking = (parseJson(res.text).ranking ?? []) as any[];
    const kept = ranking.filter((r) => r?.keep !== false && ids.includes(r?.id)).sort((p, q) => (Number(q.score) || 0) - (Number(p.score) || 0)).slice(0, 4)
      .map((r) => ({ ...ideas[ids.indexOf(r.id)], score: Number(r.score) || null, judge: { by: res.provider, model: res.model, why: isBi(r.why) ? r.why : bi("", ""), improve: isBi(r.improve) ? r.improve : bi("", "") } }));
    if (kept.length) return { ideas: coverSignals(c, kept, ideas), providers, judge: res.provider, errors };
  } catch (e: any) { errors.push(`judge: ${e?.message ?? e}`); }
  return { ideas: coverSignals(c, ideas.slice(0, 3), ideas), providers, judge: null, errors };
}

// --------------------------------------------------------------- generate API
export const generateIdeas = serial(async function generateIdeasImpl(brief: IdeaBrief, lang: Lang = "en") {
  const c = await ideationContext(brief);
  let ideas: Idea[] = [], engine = "rules", note = "";
  const { llmStatus } = await import("./llm");
  if (brief.engine !== "rules" && llmStatus().enabled) {
    const r = await aiIdeas(c, lang);
    if (r.ideas.length) { ideas = r.ideas; engine = `${r.providers.join("+")}${r.judge ? ` → ${r.judge}` : ""}`; }
    else note = tx(lang, "The AI did not return usable ideas, so these come from the built-in rules.", "لم يُرجع الذكاء الاصطناعي أفكاراً صالحة، لذا هذه من القواعد المدمجة.");
  }
  if (!ideas.length) ideas = rulesDrafts(c).map((d) => finalize(c, d)).filter(Boolean) as Idea[];
  const runKey = `${new Date().toISOString()}|${brief.runTag ? `${brief.runTag}|` : ""}${c.project}|${c.month}`;
  const savedBrief = { project: c.project, month: c.month, budgetK: c.budgetK, goal: c.goal, audience: c.audience, notes: c.notes, season: c.season.key, signals: c.toAnswer.map((x) => x.id) };
  for (const idea of ideas) await prisma.campaignIdea.create({ data: { runKey, brief: JSON.stringify(savedBrief), payload: JSON.stringify(idea), source: idea.source, score: idea.score ?? null } });
  return { runKey, engine, note, count: ideas.length };
});

const view = (lang: Lang) => (r: { id: string; createdAt: Date; runKey: string; brief: string; payload: string; source: string; score: number | null; status: string; decidedBy: string | null; decidedAt: Date | null; note: string | null }) => {
  const i = JSON.parse(r.payload) as Idea, b = JSON.parse(r.brief);
  const L = (x: Bi) => (lang === "ar" ? x.ar || x.en : x.en);
  return {
    id: r.id, runKey: r.runKey, createdAt: r.createdAt.toISOString(), status: r.status, decidedBy: r.decidedBy, note: r.note, score: r.score,
    brief: { ...b, projectLabel: nm(lang, b.project), monthLabel: monthShort(lang, b.month), goalLabel: L(GOAL_LABEL[b.goal as Goal] ?? bi(b.goal, b.goal)), seasonLabel: L(seasonOf(b.month).label) },
    title: L(i.title), bigIdea: L(i.bigIdea), audience: L(i.audience), offer: L(i.offer), headline: L(i.headline),
    channels: i.channels.map((ch) => ({ ...ch, label: L(ch.label), role: L(ch.role), vendor: nm(lang, ch.vendor), vendorNote: L(ch.vendorNote) })),
    forecast: { ...i.forecast, adjustments: i.forecast.adjustments.map(L) }, guardrails: i.guardrails.map(L), measurement: L(i.measurement), risks: i.risks.map(L), cautions: i.cautions.map(L),
    evidence: i.evidence, campaignCode: i.campaignCode, leadVendor: i.leadVendor ? nm(lang, i.leadVendor) : null, source: i.source, model: i.model ?? null,
    judge: i.judge ? { by: i.judge.by, model: i.judge.model, why: L(i.judge.why), improve: L(i.judge.improve) } : null,
    kind: i.kind ?? "CAMPAIGN", kindLabel: L(KIND_LABEL[i.kind ?? "CAMPAIGN"] ?? KIND_LABEL.CAMPAIGN), trigger: i.trigger ? { id: i.trigger.id, title: L(i.trigger.title), why: L(i.trigger.why) } : null,
  };
};
export type IdeaView = ReturnType<ReturnType<typeof view>>;

export async function ideasState(lang: Lang = "en") {
  const { llmStatus } = await import("./llm");
  const a = await buildAgent(lang);
  // Newest run first; inside a run, best score first (rules ideas keep their order).
  const rows = (await prisma.campaignIdea.findMany()).sort((p, q) => q.runKey.localeCompare(p.runKey) || (q.score ?? 0) - (p.score ?? 0) || p.createdAt.getTime() - q.createdAt.getTime());
  const s = llmStatus();
  const scan = scanView(await dailyScan(), lang);
  return {
    ideas: rows.map(view(lang)), signals: scan.signals, sources: scan.sources, crmAsOf: scan.date, scannedAt: scan.scannedAt,
    defaults: { month: defaultMonth(), projects: [...new Set(a.mkt.campaigns.map((c) => c.asset))].map((p) => ({ value: p, label: nm(lang, p) })), goals: GOALS.map((g) => ({ value: g, label: tx(lang, GOAL_LABEL[g].en, GOAL_LABEL[g].ar) })) },
    ai: { enabled: s.enabled, ideate: s.routes.find((r) => r.task === "ideate")?.order.slice(0, 2) ?? [], judge: s.routes.find((r) => r.task === "judge")?.order[0] ?? null },
  };
}

/** Shortlist / approve / discard / reopen. Approving drafts a campaign brief email to the lead vendor (sent only after approval). */
export async function decideIdea(id: string, decision: "SHORTLIST" | "APPROVE" | "DISCARD" | "REOPEN", approver: string, note: string | null, lang: Lang) {
  if (!approver?.trim()) throw new Error(tx(lang, "Your name is required.", "اسمكم مطلوب."));
  const r = (await prisma.campaignIdea.findMany()).find((x) => x.id === id);
  if (!r) throw new Error(tx(lang, "Idea not found.", "الفكرة غير موجودة."));
  const status = decision === "SHORTLIST" ? "SHORTLISTED" : decision === "APPROVE" ? "APPROVED" : decision === "DISCARD" ? "DISCARDED" : "NEW";
  await prisma.campaignIdea.update({ where: { id }, data: { status, decidedBy: status === "NEW" ? null : approver.trim(), decidedAt: status === "NEW" ? null : new Date(), note: note?.trim() || null } });
  const i = JSON.parse(r.payload) as Idea, b = JSON.parse(r.brief);
  await prisma.marketingAction.create({ data: { type: "IDEA_" + status, campaign: i.title.en, detail: tx(lang, `Initiative "${i.title.en}" — ${status.toLowerCase()} by ${approver.trim()}${note ? ` (${note})` : ""}.`, `المبادرة «${i.title.ar}» — ${({ SHORTLISTED: "أدرجها في القائمة المختصرة", APPROVED: "اعتمدها", DISCARDED: "استبعدها", NEW: "أعاد فتحها" } as Record<string, string>)[status]} ${approver.trim()}${note ? ` (${note})` : ""}.`) } });
  let drafted: string | null = null;
  if (status === "APPROVED" && i.leadVendor) {
    const v = (await prisma.vendor.findMany()).find((x) => x.name === i.leadVendor);
    if (v) {
      const vl: Lang = v.language === "ar" ? "ar" : "en";
      const L = (x: Bi) => (vl === "ar" ? x.ar : x.en);
      const mine = i.channels.filter((ch) => ch.vendor === v.name);
      const subject = tx(vl, `Campaign brief: ${i.title.en} (${i.campaignCode})`, `موجز حملة: ${i.title.ar} (${i.campaignCode})`);
      const body = vl === "ar"
        ? `السادة / ${nm("ar", v.name)} المحترمون،\n\nنود العمل معكم على حملة جديدة لمشروع ${nm("ar", b.project)} في ${monthShort("ar", b.month)}.\n\nالفكرة: ${L(i.bigIdea)}\nالجمهور: ${L(i.audience)}\nالعرض: ${L(i.offer)}\nالرسالة الرئيسية: ${L(i.headline)}\n\nدوركم: ${mine.map((ch) => `${L(ch.role)} — ${K("ar", ch.spendK)} (${ch.sharePct}% من الميزانية)`).join("؛ ")}\nرمز الحملة: ${i.campaignCode} (في كل اسم حملة وفي utm_campaign)\nقاعدة المتابعة: نراجع تكلفة العميل المؤهل بعد أسبوعين، وتُصرف الدفعة الثانية فقط إذا حققت المعيار.\n\nنرجو إرسال المقترح الإبداعي والخطة الإعلامية والجدول الزمني خلال أسبوع. الميزانية نهائية بعد اعتمادنا للمقترح.\n\nوتفضلوا بقبول فائق الاحترام،\nفريق التسويق`
        : `Hi ${(v.contact ?? "").split(" ")[0] || "team"},\n\nWe'd like to work with you on a new campaign for ${b.project} in ${monthShort("en", b.month)}.\n\nThe idea: ${L(i.bigIdea)}\nAudience: ${L(i.audience)}\nOffer: ${L(i.offer)}\nKey message: ${L(i.headline)}\n\nYour part: ${mine.map((ch) => `${L(ch.role)} — SAR ${ch.spendK}K (${ch.sharePct}% of budget)`).join("; ")}\nCampaign code: ${i.campaignCode} (in every campaign name and utm_campaign)\nCheckpoint: we review cost per qualified lead after two weeks; the second half of the budget is released only if it meets the benchmark.\n\nPlease send the creative proposal, media plan and timeline within a week. The budget is final once we approve your proposal.\n\nBest regards,\nMarketing`;
      if (await createCustomDraft({ vendorId: v.id, recKey: `IDEA:${id}`, subject, body }, lang)) drafted = v.name;
    }
  }
  return { drafted: drafted ? nm(lang, drafted) : null };
}

/** Short text answer for the assistant (built-in rules): generate and summarise. */
export async function ideasAnswer(brief: IdeaBrief, lang: Lang) {
  const g = await generateIdeas(brief, lang);
  const rows = (await prisma.campaignIdea.findMany()).filter((r) => r.runKey === g.runKey).map(view(lang));
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const b = rows[0]?.brief;
  return T(`**Market initiatives — ${b?.projectLabel}, ${b?.monthLabel}** (${b?.seasonLabel}; ${b?.goalLabel}; budget SAR ${b?.budgetK}K)\n`, `**مبادرات السوق — ${b?.projectLabel}، ${b?.monthLabel}** (${b?.seasonLabel}؛ ${b?.goalLabel}؛ الميزانية ${K("ar", b?.budgetK)})\n`) +
    rows.map((x, i) => T(`${i + 1}. **${x.title}** _(${x.kindLabel})_ — ${x.bigIdea}${x.trigger ? `\n   Answers the signal: ${x.trigger.title}.` : ""}\n   Mix: ${x.channels.map((ch) => `${ch.label} ${ch.sharePct}%`).join(", ")}. Forecast: ${x.forecast.contracts[0]}–${x.forecast.contracts[2]} contracts, SAR ${x.forecast.salesM[0]}–${x.forecast.salesM[2]}M (~${x.forecast.costToSalesPct}% cost to sales).`,
      `${i + 1}. **${x.title}** _(${x.kindLabel})_ — ${x.bigIdea}${x.trigger ? `\n   يستجيب للإشارة: ${x.trigger.title}.` : ""}\n   المزيج: ${x.channels.map((ch) => `${ch.label} ${ch.sharePct}%`).join("، ")}. التوقع: ${x.forecast.contracts[0]}–${x.forecast.contracts[2]} عقود، ${M("ar", `${x.forecast.salesM[0]}–${x.forecast.salesM[2]}`)} (نحو ${x.forecast.costToSalesPct}% من المبيعات).`)).join("\n") +
    (g.note ? `\n\n${g.note}` : "") +
    T(`\n\nForecasts come from the 2023–2025 history${g.engine === "rules" ? "; ideas from the built-in rules" : ` (ideas by ${g.engine})`}. Shortlist or approve them on the **Initiatives** page — approving drafts a brief to the lead vendor for your approval.`, `\n\nالتوقعات من تاريخ 2023–2025${g.engine === "rules" ? "؛ والأفكار من القواعد المدمجة" : ` (الأفكار من ${g.engine})`}. أدرجوها في القائمة المختصرة أو اعتمدوها من صفحة **المبادرات** — يُعِدّ الاعتماد موجزاً للمورد الرئيسي لتعتمدوه.`);
}

// --------------------------------------------------------------- daily ideas for the report
// Every daily report (and live snapshot) carries fresh market initiatives. When the CRM shows an unusual fall (or
// surge), the day's focus is the project concerned (cycling between them if several) and at least one initiative
// answers the signal; otherwise the focus cycles from the project furthest behind target. Creative work goes to the "ideate" route
// (two different models for variety — Gemini and OpenAI by default — ranked by the "judge" route, Claude); without
// AI keys, the built-in rules. To keep them fresh, each day focuses on another project (cycling from the one furthest
// behind target) with a different creative angle. Generated once per day and language, then reused; the ideas also
// appear on the Ideas page to shortlist or approve.
const ANGLES: Bi[] = [
  bi("Partnerships: banks, employers or schools that bring qualified buyers", "الشراكات: بنوك أو جهات عمل أو مدارس تجلب مشترين مؤهلين"),
  bi("An on-site experience that gets families to the show units", "تجربة في الموقع تجلب الأسر إلى الوحدات النموذجية"),
  bi("The investor story: yield, rental demand and resale", "قصة المستثمر: العائد والطلب الإيجاري وإعادة البيع"),
  bi("First-time buyers: make the financing simple and visible", "المشترون لأول مرة: تبسيط التمويل وإبرازه"),
  bi("Referrals and the owners' community", "الإحالات ومجتمع الملاك"),
  bi("Creators and content that show daily life in the project", "صناع المحتوى ومحتوى يُظهر الحياة اليومية في المشروع"),
  bi("Data-led digital: retargeting and lookalikes from CRM-qualified leads", "رقمي قائم على البيانات: إعادة الاستهداف والجماهير المشابهة من العملاء المؤهلين"),
  bi("The season or calendar moment ahead", "الموسم أو المناسبة القادمة"),
];
/** Today's initiatives if the daily run already produced them (no generation): for the Director home. */
export async function dailyIdeasReady(date: string, lang: Lang = "en") {
  const rows = (await prisma.campaignIdea.findMany()).filter((r) => r.runKey.includes(`|DAILY:${date}|`));
  const runKey = rows.map((r) => r.runKey).sort().pop();
  return rows.filter((r) => r.runKey === runKey).sort((p, q) => (q.score ?? 0) - (p.score ?? 0) || p.createdAt.getTime() - q.createdAt.getTime()).slice(0, 5).map(view(lang));
}
export async function dailyIdeas(date: string, lang: Lang = "en") {
  const tag = `DAILY:${date}`;
  const pick = async () => (await prisma.campaignIdea.findMany()).filter((r) => r.runKey.includes(`|${tag}|`));
  let rows = await pick();
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const angle = ANGLES[day % ANGLES.length];
  let engine = rows[0]?.source ?? "";
  const sig = await dailyScan();
  const alerts = sig.signals.filter((x) => x.project && !x.linkedTo && x.direction === "down" && x.severity !== "info");
  if (!rows.length) {
    const d = await buildDirector("en");
    const order = [...d.targets.byAsset].sort((p, q) => (p.pct ?? 0) - (q.pct ?? 0)).map((x) => x.asset);
    const hot = [...new Set(alerts.map((x) => x.project!))];
    const project = hot.length ? hot[day % hot.length] : order[day % Math.max(1, order.length)];
    const r = await generateIdeas({ project, notes: `Creative angle for today: ${angle.en}`, runTag: tag }, lang);
    engine = r.engine; rows = await pick();
  }
  const runKey = rows.map((r) => r.runKey).sort().pop();
  const ideas = rows.filter((r) => r.runKey === runKey).sort((p, q) => (q.score ?? 0) - (p.score ?? 0) || p.createdAt.getTime() - q.createdAt.getTime()).slice(0, 5).map(view(lang));
  const b = ideas[0]?.brief;
  const sources = [...new Set(ideas.map((i) => i.source))];
  const judge = ideas.find((i) => i.judge)?.judge?.by ?? null;
  return { angle: lang === "ar" ? angle.ar : angle.en, project: b?.projectLabel ?? "", month: b?.monthLabel ?? "", goal: b?.goalLabel ?? "", budgetK: b?.budgetK ?? null, ideas, sources, judge, engine,
    ...(() => { const v = scanView(sig, lang); return { signals: v.signals, scanned: v.sources, crmAsOf: v.date, scannedAt: v.scannedAt }; })() };
}
