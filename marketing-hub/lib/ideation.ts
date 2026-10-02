// Campaign ideation — new campaign ideas grounded in the data: the project's gap to target, the season, the 2024–2025
// campaign history (benchmarks and lessons), today's daily check and the vendors available (current, bench, past).
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

export type IdeaBrief = { project?: string; goal?: Goal; month?: string; budgetK?: number; audience?: string; notes?: string; engine?: "auto" | "rules" };
export type Channel = { family: Family; label: Bi; sharePct: number; role: Bi; spendK: number; vendor: string; vendorStatus: "current" | "bench" | "past"; vendorNote: Bi; ctsPct: number; qualified: number; contracts: number; salesM: number };
export type Idea = {
  title: Bi; bigIdea: Bi; audience: Bi; offer: Bi; headline: Bi; channels: Channel[];
  forecast: { spendK: number; qualified: number; contracts: [number, number, number]; salesM: [number, number, number]; costToSalesPct: number; targetNextM: number | null; adjustments: Bi[] };
  guardrails: Bi[]; measurement: Bi; risks: Bi[]; cautions: Bi[]; evidence: { code: string; name: string; costToSalesPct: number | null; lesson: string }[];
  campaignCode: string; leadVendor: string | null; source: string; model?: string; score?: number | null; judge?: { by: string; model: string; why: Bi; improve: Bi } | null;
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
  const [d, h, daily] = await Promise.all([buildDirector("en", a), historyState("en"), dailyState("en")]);
  const byAsset = d.targets.byAsset;
  const project = brief.project && byAsset.some((x) => x.asset === brief.project) ? brief.project : byAsset[0]?.asset ?? "Ash Shati Residences";
  const target = byAsset.find((x) => x.asset === project) ?? null;
  const month = brief.month && /^\d{4}-\d{2}$/.test(brief.month) ? brief.month : defaultMonth();
  const season = seasonOf(month);
  const live = a.mkt.campaigns.filter((c) => c.asset === project);
  const monthlySpend = live.reduce((s, c) => s + c.spendK, 0) / 5;
  const budgetK = Math.round(clamp(brief.budgetK && brief.budgetK > 0 ? brief.budgetK : Math.round(monthlySpend / 10) * 10 || 150, 20, 5000));
  const goal: Goal = brief.goal && GOALS.includes(brief.goal) ? brief.goal : target && (target.pct ?? 100) < 70 ? "SALES" : "LEADS";

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
    lessons: h.lessons, history: h,
  };
}
export type IdeationContext = Awaited<ReturnType<typeof ideationContext>>;

// ------------------------------------------------------------------ finalize
type Draft = { title: Bi; bigIdea: Bi; audience: Bi; offer: Bi; headline: Bi; channels: { family: string; sharePct: number; role: Bi }[]; risks?: Bi[]; evidence?: string[]; source: string; model?: string };

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
  };
}

// --------------------------------------------------------------- rules ideas
function rulesDrafts(c: IdeationContext): Draft[] {
  const P = c.project, PA = nm("ar", P), mon = monthShort("en", c.month), monAr = monthShort("ar", c.month);
  const role = (en: string, ar: string) => bi(en, ar);
  const T: Record<string, Draft> = {
    BROKER_SPRINT: {
      title: bi(`${P}: broker & site-visit sprint`, `${PA}: دفعة الوسطاء وزيارات الموقع`),
      bigIdea: bi(`Put brokers — the best-converting channel in the history (1.1% cost to sales) — at the centre for ${mon}: a time-boxed commission booster for reservations, weekend site visits every broker can book, and retargeting that sends online visitors to a visit slot.`, `جعل الوسطاء — أعلى القنوات تحويلاً في التاريخ (1.1% من المبيعات) — محور شهر ${monAr}: حافز عمولة محدد المدة على الحجوزات، وزيارات موقع في عطلات نهاية الأسبوع يحجزها أي وسيط، وإعادة استهداف توجّه زوار الإنترنت إلى موعد زيارة.`),
      audience: bi("Ready-to-buy families and investors already talking to brokers; past site visitors who did not reserve.", "أسر ومستثمرون جاهزون للشراء يتعاملون مع الوسطاء؛ وزوار سابقون للموقع لم يحجزوا."),
      offer: bi("Reservation incentive valid for the campaign window only (e.g. registration fee covered).", "حافز حجز صالح خلال فترة الحملة فقط (مثل تحمّل رسوم التسجيل)."),
      headline: bi(`Visit ${P} this weekend — reserve before the month ends`, `زوروا ${PA} هذا الأسبوع — احجزوا قبل نهاية الشهر`),
      channels: [{ family: "BROKER", sharePct: 45, role: role("commission booster, visit bookings", "حافز العمولة وحجز الزيارات") }, { family: "EVENT", sharePct: 25, role: role("weekend open-house on site", "يوم مفتوح في الموقع نهاية الأسبوع") }, { family: "DIGITAL", sharePct: 20, role: role("retargeting to book a visit", "إعادة استهداف لحجز زيارة") }, { family: "PORTAL", sharePct: 10, role: role("featured listing with visit slots", "إعلان مميز بمواعيد الزيارة") }],
      risks: [bi("Commission boosters can pull forward sales that would have closed anyway — compare with the holdout.", "قد تسرّع حوافز العمولة مبيعات كانت ستُغلق أصلاً — قارنوا بالمجموعة المستبعدة.")], source: "rules",
    },
    PAYMENT_PLAN: {
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
      title: bi(`${P}: open-house mini-expo`, `${PA}: معرض مفتوح مصغّر`),
      bigIdea: bi(`Events converted best of all channels in the history (0.9% cost to sales). Run a two-weekend mini-expo on site with the show unit, finance partners and creators who invite their followers to book a tour; portals push the dates.`, `كانت الفعاليات الأعلى تحويلاً بين القنوات في التاريخ (0.9% من المبيعات). معرض مصغّر لعطلتي نهاية أسبوع في الموقع مع الوحدة النموذجية وشركاء التمويل وصنّاع محتوى يدعون متابعيهم لحجز جولة؛ وتروّج البوابات للمواعيد.`),
      audience: bi("Families who want to see the product before deciding; followers of local lifestyle creators.", "أسر تريد رؤية المنتج قبل القرار؛ ومتابعو صنّاع محتوى أسلوب الحياة المحليين."),
      offer: bi("Event-only price lock for reservations made at the expo.", "تثبيت سعر خاص بالفعالية للحجوزات أثناء المعرض."),
      headline: bi(`${P} open house — two weekends only`, `يوم مفتوح في ${PA} — عطلتا نهاية أسبوع فقط`),
      channels: [{ family: "EVENT", sharePct: 50, role: role("the on-site expo", "المعرض في الموقع") }, { family: "INFLUENCER", sharePct: 15, role: role("creators invite followers to book a tour", "صنّاع محتوى يدعون المتابعين لحجز جولة") }, { family: "PORTAL", sharePct: 20, role: role("event dates on listings", "مواعيد الفعالية في الإعلانات") }, { family: "BROKER", sharePct: 15, role: role("brokers bring clients", "الوسطاء يحضرون عملاءهم") }],
      evidence: ["MAR-EXPO-25", "ASH-LAUNCH-EVENT-24"],
      risks: [bi("Events need 4–6 weeks of preparation and a show unit ready on site.", "تحتاج الفعاليات إلى 4–6 أسابيع تحضير ووحدة نموذجية جاهزة في الموقع.")], source: "rules",
    },
    SUMMER_HOLD: {
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
      title: bi(`${P}: launch story with proof`, `${PA}: قصة إطلاق مدعومة بالأدلة`),
      bigIdea: bi(`Launches cost 2.4% of sales in the history, and Andalus's 2025 teaser ran at 8% because volume came without qualification. Launch with a story (PR and creators) but route every response to brokers and a site visit within 48 hours, and judge it on qualified leads, not volume.`, `كلّفت عمليات الإطلاق 2.4% من المبيعات في التاريخ، وبلغت حملة تشويق الأندلس 2025 نسبة 8% لأن الحجم جاء دون تأهيل. إطلاق بقصة (علاقات عامة وصنّاع محتوى) مع توجيه كل استجابة إلى الوسطاء وزيارة للموقع خلال 48 ساعة، والحكم على العملاء المؤهلين لا الحجم.`),
      audience: bi("Upgraders and investors following the city's new districts.", "الراغبون في الترقية والمستثمرون المتابعون للأحياء الجديدة في المدينة."),
      offer: bi("Launch-phase price for the first reservations.", "سعر مرحلة الإطلاق لأول الحجوزات."),
      headline: bi(`${P}: the new address — see it first`, `${PA}: العنوان الجديد — كونوا أول من يراه`),
      channels: [{ family: "PR", sharePct: 25, role: role("launch story and media", "قصة الإطلاق والإعلام") }, { family: "INFLUENCER", sharePct: 15, role: role("creator tours", "جولات صنّاع المحتوى") }, { family: "BROKER", sharePct: 35, role: role("qualify and book visits", "التأهيل وحجز الزيارات") }, { family: "DIGITAL", sharePct: 25, role: role("qualified-lead forms only", "نماذج للعملاء المؤهلين فقط") }],
      evidence: ["AND-TEASER-25", "MAR-TEASER-24"],
      risks: [bi("High volume with a low qualified rate predicted weak sales before (Andalus teaser 2025).", "تنبأ الحجم الكبير مع نسبة مؤهلين منخفضة بمبيعات ضعيفة سابقاً (تشويق الأندلس 2025).")], source: "rules",
    },
  };
  const order = c.season.key === "SUMMER" ? ["SUMMER_HOLD", "BROKER_SPRINT", "PAYMENT_PLAN"]
    : c.season.key === "RAMADAN" ? ["PAYMENT_PLAN", "BROKER_SPRINT", "OPEN_HOUSE"]
    : c.season.key === "EVENT" ? ["OPEN_HOUSE", "BROKER_SPRINT", "PAYMENT_PLAN"]
    : c.goal === "LAUNCH" || c.goal === "AWARENESS" ? ["LAUNCH_PR", "OPEN_HOUSE", "BROKER_SPRINT"]
    : ["BROKER_SPRINT", "OPEN_HOUSE", "PAYMENT_PLAN"];
  return order.map((k) => T[k]);
}

// ------------------------------------------------------------------- AI ideas
const IDEATE_SYSTEM = `You are a senior real-estate marketing strategist in Saudi Arabia, ideating campaigns for a developer's AI Director of Marketing. The marketing manager works alone and runs external vendors.

Propose 3 DISTINCT campaign ideas for the brief in DATA. Ground every idea in the data: the project's gap to target, the season, the channel benchmarks and lessons from the 2024–2025 campaign history, today's flags, and the vendors available. Be specific and creative about the concept, offer and message; be realistic for the Saudi market (family decision-making, Ramadan, summer travel, Cityscape, payment plans, off-plan regulation).

Rules:
- Channels only from: DIGITAL, PORTAL, BROKER, EVENT, INFLUENCER, PR, OUTDOOR, RADIO; sharePct are whole numbers summing to 100. Avoid channels the history shows as expensive unless the idea needs them, and explain why.
- Do NOT give forecasts, budgets in SAR, lead counts or sales numbers — the system computes them from the history.
- Leads, follow-up and sales are handled by Kinan's own AI agent: do not propose lead-handling tasks.
- Cite past campaign codes from DATA in "evidence" when an idea builds on them.
- Every text field in English AND Arabic (Modern Standard Arabic, Western digits). Keep names as in the data.

Reply with JSON only, no prose, exactly:
{"ideas":[{"title":{"en":"","ar":""},"bigIdea":{"en":"","ar":""},"audience":{"en":"","ar":""},"offer":{"en":"","ar":""},"headline":{"en":"","ar":""},"channels":[{"family":"BROKER","sharePct":40,"role":{"en":"","ar":""}}],"risks":[{"en":"","ar":""}],"evidence":["CODE"]}]}`;

const JUDGE_SYSTEM = `You are the AI Director of Marketing judging campaign ideas before they reach the marketing manager. For each candidate in DATA you get the concept and a forecast computed from the campaign history (trust the forecast; do not invent numbers).

Score each idea 1–10 on: fit with the data and the lessons of the history, expected efficiency (cost to sales vs the project's history and the target gap), distinctiveness from the other ideas, and feasibility with the vendors available in the season. Penalise ideas that repeat a past mistake or lean on channels flagged as expensive for this project. Keep the best 3 that are clearly different from each other; drop near-duplicates.

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
  };
};
const forModel = (c: IdeationContext) => ({
  brief: { project: c.project, month: c.month, season: c.season.label.en, seasonNote: c.season.note.en, goal: c.goal, budgetK: c.budgetK, audience: c.audience || null, notes: c.notes || null },
  target: c.target, projectCostToSalesPct: c.projectCtsPct, historyCostToSalesPct: c.historyCtsPct,
  channels: c.families.map((f) => ({ family: f.family, benchmarkCostToSalesPct: f.benchCts, cpqlSAR: f.cpql, qualifiedPct: f.qualPct, pastCampaigns: f.campaigns, seasonFactor: f.seasonFactor, liveCostToSalesForProject: f.liveCts, vendor: f.vendor ? `${f.vendor.name} (${f.vendor.note.en})` : "none" })),
  todaysFlagsForProject: c.flags, pastCampaignsForProject: c.pastForProject, pastCampaignsSameSeason: c.seasonPast, lessons: c.lessons,
});

async function aiIdeas(c: IdeationContext, lang: Lang): Promise<{ ideas: Idea[]; providers: string[]; judge: string | null; errors: string[] }> {
  const { ensembleFor, runLlm } = await import("./llm");
  const providers = ensembleFor("ideate", 2);
  const data = `DATA:\n${JSON.stringify(forModel(c))}`;
  const ask = tx(lang, "Ideate the campaigns for this brief.", "اقترح أفكار الحملات لهذا الموجز.");
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
    const res = await runLlm({ task: "judge", system: JUDGE_SYSTEM, data: `DATA:\n${JSON.stringify({ context: forModel(c), candidates: ideas.map((x, i) => ({ id: ids[i], from: x.source, title: x.title.en, bigIdea: x.bigIdea.en, offer: x.offer.en, channels: x.channels.map((ch) => `${ch.family} ${ch.sharePct}% (${ch.vendor})`), forecast: { costToSalesPct: x.forecast.costToSalesPct, contracts: x.forecast.contracts, salesM: x.forecast.salesM }, cautions: x.cautions.map((y) => y.en) })) })}`, messages: [{ role: "user", content: "Rank the candidates." }], maxTokens: 6000 });
    const ranking = (parseJson(res.text).ranking ?? []) as any[];
    const kept = ranking.filter((r) => r?.keep !== false && ids.includes(r?.id)).sort((p, q) => (Number(q.score) || 0) - (Number(p.score) || 0)).slice(0, 3)
      .map((r) => ({ ...ideas[ids.indexOf(r.id)], score: Number(r.score) || null, judge: { by: res.provider, model: res.model, why: isBi(r.why) ? r.why : bi("", ""), improve: isBi(r.improve) ? r.improve : bi("", "") } }));
    if (kept.length) return { ideas: kept, providers, judge: res.provider, errors };
  } catch (e: any) { errors.push(`judge: ${e?.message ?? e}`); }
  return { ideas: ideas.slice(0, 3), providers, judge: null, errors };
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
  const runKey = `${new Date().toISOString()}|${c.project}|${c.month}`;
  const savedBrief = { project: c.project, month: c.month, budgetK: c.budgetK, goal: c.goal, audience: c.audience, notes: c.notes, season: c.season.key };
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
  };
};
export type IdeaView = ReturnType<ReturnType<typeof view>>;

export async function ideasState(lang: Lang = "en") {
  const { llmStatus } = await import("./llm");
  const a = await buildAgent(lang);
  // Newest run first; inside a run, best score first (rules ideas keep their order).
  const rows = (await prisma.campaignIdea.findMany()).sort((p, q) => q.runKey.localeCompare(p.runKey) || (q.score ?? 0) - (p.score ?? 0) || p.createdAt.getTime() - q.createdAt.getTime());
  const s = llmStatus();
  return {
    ideas: rows.map(view(lang)),
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
  await prisma.marketingAction.create({ data: { type: "IDEA_" + status, campaign: i.title.en, detail: tx(lang, `Campaign idea "${i.title.en}" — ${status.toLowerCase()} by ${approver.trim()}${note ? ` (${note})` : ""}.`, `فكرة الحملة «${i.title.ar}» — ${({ SHORTLISTED: "أدرجها في القائمة المختصرة", APPROVED: "اعتمدها", DISCARDED: "استبعدها", NEW: "أعاد فتحها" } as Record<string, string>)[status]} ${approver.trim()}${note ? ` (${note})` : ""}.`) } });
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
  return T(`**Campaign ideas — ${b?.projectLabel}, ${b?.monthLabel}** (${b?.seasonLabel}; ${b?.goalLabel}; budget SAR ${b?.budgetK}K)\n`, `**أفكار الحملات — ${b?.projectLabel}، ${b?.monthLabel}** (${b?.seasonLabel}؛ ${b?.goalLabel}؛ الميزانية ${K("ar", b?.budgetK)})\n`) +
    rows.map((x, i) => T(`${i + 1}. **${x.title}** — ${x.bigIdea}\n   Mix: ${x.channels.map((ch) => `${ch.label} ${ch.sharePct}%`).join(", ")}. Forecast: ${x.forecast.contracts[0]}–${x.forecast.contracts[2]} contracts, SAR ${x.forecast.salesM[0]}–${x.forecast.salesM[2]}M (~${x.forecast.costToSalesPct}% cost to sales).`,
      `${i + 1}. **${x.title}** — ${x.bigIdea}\n   المزيج: ${x.channels.map((ch) => `${ch.label} ${ch.sharePct}%`).join("، ")}. التوقع: ${x.forecast.contracts[0]}–${x.forecast.contracts[2]} عقود، ${M("ar", `${x.forecast.salesM[0]}–${x.forecast.salesM[2]}`)} (نحو ${x.forecast.costToSalesPct}% من المبيعات).`)).join("\n") +
    (g.note ? `\n\n${g.note}` : "") +
    T(`\n\nForecasts come from the 2024–2025 history${g.engine === "rules" ? "; ideas from the built-in rules" : ` (ideas by ${g.engine})`}. Shortlist or approve them on the **Ideas** page — approving drafts a brief to the lead vendor for your approval.`, `\n\nالتوقعات من تاريخ 2024–2025${g.engine === "rules" ? "؛ والأفكار من القواعد المدمجة" : ` (الأفكار من ${g.engine})`}. أدرجوها في القائمة المختصرة أو اعتمدوها من صفحة **الأفكار** — يُعِدّ الاعتماد موجزاً للمورد الرئيسي لتعتمدوه.`);
}
