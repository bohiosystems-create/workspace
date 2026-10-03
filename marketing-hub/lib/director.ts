// AI Assistant Director of Marketing — the layer that turns the agent's analysis into a director's job:
//   1. hold the team to sales targets (per project), and say where the plan is off track
//   2. a daily brief: what changed, what is at risk, what needs a decision
//   3. next month's budget plan across vendors (incremental sales per SAR, diminishing returns, guardrails)
//   4. one approval inbox for everything waiting on a person
//   5. campaign recommendations in the brief (pause / shift budget, not converting, scale, tracking, tests)
//   6. vendor orchestration (lib/orchestrator.ts): briefs, feedback, chasers and notices — the team's work, done for
//      a single marketing manager, who only approves
// Leads, sales follow-up and the CRM are Kinan's agent's job: the director only reads CRM results to judge campaigns.
// Nothing that spends money or contacts a customer or vendor happens without a named approver.
import { prisma } from "./prisma";
import { single } from "./single";
import { buildAgent, type Agent } from "./agent";
import { buildRecommendations } from "./recommendations";
import { queueKinanEvent } from "./kinan";
import { buildOrchestration, MINUTES } from "./orchestrator";
import { metaState, metaMode } from "./meta";
import { dailyState } from "./daily";
import { dailyScan } from "./signals";
import { type Lang, tx, K, M, nm, an } from "./i18n";
import { TODAY, PLAN_MONTH } from "./clock";

const r1 = (x: number) => Math.round(x * 10) / 10;

// Sample targets (SAR M / contracts per month). Replace with the commercial plan.
const TARGETS: Record<string, { salesM: number; contracts: number }> = {
  "Ash Shati Residences": { salesM: 15, contracts: 10 },
  "Marina Tower": { salesM: 12, contracts: 5 },
  "Andalus Quarter": { salesM: 6, contracts: 5 },
};
export const ensureTargets = single(async function ensureTargetsImpl() {
  if ((await prisma.salesTarget.count()) > 0) return;
  for (const [asset, t] of Object.entries(TARGETS))
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"])
      await prisma.salesTarget.create({ data: { asset, month, salesM: t.salesM, contracts: t.contracts } });
});

// ------------------------------------------------------------------ targets
function performance(a: Agent) {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  const assetOf = new Map(a.mkt.campaigns.map((c) => [c.id, c.asset]));
  const assets = [...new Set(a.mkt.campaigns.map((c) => c.asset))];
  const actual = (asset: string | null, month: string) =>
    a.unified.campaigns.filter((c) => !asset || assetOf.get(c.id) === asset).flatMap((c) => c.months).filter((m) => m.month === month).reduce((s, m) => s + m.salesM, 0);
  return { months, assets, actual };
}

// ---------------------------------------------------------------- budget plan
export type PlanLine = { vendorId: string; vendor: string; decision: string; currentK: number; proposedK: number; minK: number; maxK: number; expectedM: number; currentExpectedM: number; rationale: string };

const BOUNDS: Record<string, [number, number]> = {
  EXIT: [0.5, 0.5], TEST_REPLACEMENT: [0.5, 0.8], PERFORMANCE_PLAN: [0.6, 1.0], RENEGOTIATE: [0.8, 1.2], RE_ENGAGE: [0.9, 1.5],
};
const ELASTICITY = 0.7; // sales ∝ spend^0.7 — diminishing returns

export function proposePlan(a: Agent, l: Lang) {
  const T = (en: string, ar: string) => tx(l, en, ar);
  const lines: PlanLine[] = [];
  for (const d of a.decisions) {
    const v = a.unified.vendors.find((x) => x.id === d.vendorId)!;
    const currentK = r1(a.unified.campaigns.filter((c) => c.vendorId === d.vendorId).flatMap((c) => c.months).filter((m) => m.month === "2026-05").reduce((s, m) => s + m.costK, 0));
    const share = a.scores.find((s) => s.vendorId === d.vendorId)?.incrementalShare ?? 1;
    const salesPerK = v.verified.costK > 0 ? (v.verified.salesM * share) / v.verified.costK : 0; // incremental SAR M per SAR K
    const commission = a.mkt.vendors.find((x) => x.id === d.vendorId)?.model === "Commission";
    const [lo, hi] = commission ? [0.9, 1.1] : BOUNDS[d.decision] ?? [0.8, 1.2];
    lines.push({
      vendorId: d.vendorId, vendor: d.vendor, decision: d.decision, currentK, proposedK: 0, minK: Math.round(currentK * lo), maxK: Math.round(currentK * hi),
      expectedM: 0, currentExpectedM: r1(currentK * salesPerK), rationale: commission ? T("Commission-based: spend follows sales, kept within ±10%.", "قائم على العمولة: الإنفاق يتبع المبيعات، ضمن ±10%.") : "",
    });
  }
  // Promoted trial challengers (now active, no campaigns yet): fund up to half the incumbent's budget.
  for (const t of a.bench.trials.filter((x) => x.decision === "PROMOTE" && x.readout)) {
    const inc = lines.find((x) => x.vendorId === t.incumbentId);
    if (!inc || lines.some((x) => x.vendorId === t.challengerId)) continue;
    const incV = a.unified.vendors.find((x) => x.id === t.incumbentId)!;
    const incShare = a.scores.find((s) => s.vendorId === t.incumbentId)?.incrementalShare ?? 1;
    const ratio = t.readout!.qlRatio ?? 1;
    lines.push({
      vendorId: t.challengerId, vendor: t.challenger, decision: "PROMOTED", currentK: 0, proposedK: 0, minK: 0, maxK: Math.round(inc.currentK * 0.5),
      expectedM: 0, currentExpectedM: 0, rationale: T(`Won its trial (${ratio}× qualified leads per SAR); funded from the incumbent's budget.`, `فاز في تجربته (${ratio}× العملاء المؤهلين لكل ريال)؛ يُموَّل من ميزانية المورد الحالي.`),
    });
    (lines[lines.length - 1] as any)._perK = incV.verified.costK > 0 ? ((incV.verified.salesM * incShare) / incV.verified.costK) * ratio : 0;
  }
  const perK = (x: PlanLine) => (x as any)._perK ?? (x.currentK > 0 ? x.currentExpectedM / x.currentK : 0);
  const sales = (x: PlanLine, k: number) => (x.currentK > 0 ? x.currentExpectedM * Math.pow(k / x.currentK, ELASTICITY) : perK(x) * k * 0.85);
  const marginal = (x: PlanLine, k: number) => sales(x, k + 5) - sales(x, k);

  const totalK = Math.round(lines.reduce((s, x) => s + x.currentK, 0));
  lines.forEach((x) => (x.proposedK = x.minK));
  let left = totalK - lines.reduce((s, x) => s + x.proposedK, 0);
  while (left >= 5) {
    const open = lines.filter((x) => x.proposedK + 5 <= x.maxK);
    if (!open.length) break;
    const best = open.reduce((b, x) => (marginal(x, x.proposedK) > marginal(b, b.proposedK) ? x : b));
    best.proposedK += 5; left -= 5;
  }
  for (const x of lines) {
    x.expectedM = r1(sales(x, x.proposedK));
    if (!x.rationale) {
      const delta = x.currentK ? Math.round(((x.proposedK - x.currentK) / x.currentK) * 100) : 0;
      x.rationale = delta > 2
        ? T(`Highest incremental sales per SAR among vendors with room to grow (${x.decision.toLowerCase().replace("_", " ")}).`, `أعلى مبيعات إضافية لكل ريال بين الموردين القابلين للنمو.`)
        : delta < -2
          ? T(`Reduced in line with the renewal decision (${x.decision.toLowerCase().replace(/_/g, " ")}).`, `خُفّض بما يتوافق مع قرار التجديد.`)
          : T("Held: further spend adds less than it costs elsewhere.", "ثُبّت: الإنفاق الإضافي يعطي عائداً أقل من بدائله.");
    }
  }
  const unallocatedK = Math.max(0, left);
  const expected = r1(lines.reduce((s, x) => s + x.expectedM, 0)), flat = r1(lines.reduce((s, x) => s + x.currentExpectedM, 0));
  return {
    month: PLAN_MONTH, totalK, unallocatedK, lines: lines.map(({ ...x }) => { delete (x as any)._perK; return x; }),
    expectedM: expected, flatM: flat, upliftM: r1(expected - flat),
    assumptions: T(
      "Same total as last month. Incremental sales per SAR from CRM-verified sales × measured incremental share; diminishing returns (sales ∝ spend^0.7); each vendor kept inside the range its renewal decision allows. Indicative — a forecast, not a promise.",
      "الإجمالي نفسه للشهر الماضي. المبيعات الإضافية لكل ريال من مبيعات النظام المتحقَّق منها × نسبة الأثر الإضافي المقاسة؛ مع تناقص العائد (المبيعات ∝ الإنفاق^0.7)؛ وكل مورد ضمن النطاق الذي يسمح به قرار تجديده. تقديري — توقّع وليس التزاماً."),
  };
}

// Campaign quality from the CRM: which campaign codes bring leads that qualify and buy (input to budget decisions).
export function campaignQuality(a: Agent, l: Lang) {
  const rows = a.unified.campaigns.filter((c) => c.code && c.verified.leads > 0).map((c) => ({
    code: c.code!, campaign: c.name, vendor: c.vendor,
    qualifiedRate: c.verified.qualified / c.verified.leads, winRate: c.verified.won / c.verified.leads,
  }));
  // Rank on lead quality (qualified rate × win rate); score = percentile, verdict by thirds.
  const ranked = [...rows].sort((p, q) => Math.sqrt(q.qualifiedRate * q.winRate) - Math.sqrt(p.qualifiedRate * p.winRate));
  const n = ranked.length;
  return ranked.map((r, i) => {
    const score = n > 1 ? Math.round((100 * (n - 1 - i)) / (n - 1)) : 50;
    const verdict = i < Math.ceil(n / 3) ? "STRONGEST" : i >= n - Math.floor(n / 3) ? "WEAKEST" : "MIDDLE";
    return {
      ...r, qualifiedRate: Math.round(r.qualifiedRate * 1000) / 10, winRate: Math.round(r.winRate * 1000) / 10, qualityScore: score, verdict,
      advice: verdict === "STRONGEST" ? tx(l, "Fund first in the plan.", "يُموَّل أولاً في الخطة.") : verdict === "WEAKEST" ? tx(l, "Fix targeting or cut budget.", "تصحيح الاستهداف أو خفض الميزانية.") : tx(l, "Hold.", "إبقاء."),
    };
  });
}

// Campaign recommendations in the brief = the daily campaign check (lib/daily.ts: per-campaign performance,
// pacing, season, renewals — compared with the campaign history) + these structural ones from the engine.
export const CAMPAIGN_REC_TYPES = ["META_UNKNOWN_AGENCY", "META_CONFLICT", "META_NO_UTM", "DATA_MISMATCH", "TEST_INCREMENTALITY"];

// ------------------------------------------------------------------- build
export async function buildDirector(lang: Lang = "en", pre?: Agent) {
  await ensureTargets();
  const a = pre ?? (await buildAgent(lang));
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (s: string) => nm(lang, s);
  const [targets, plans, recs, emails, experiments] = await Promise.all([
    prisma.salesTarget.findMany(), prisma.budgetPlan.findMany(),
    buildRecommendations(lang, a), prisma.outboundEmail.findMany(), prisma.experiment.findMany(),
  ]);
  const orch = await buildOrchestration(lang, a);
  const meta = metaMode() === "off" ? null : await metaState(lang);
  // Severity first; within it, direct budget moves before governance, conversion, tracking and tests.
  const sevRank: Record<string, number> = { crit: 0, warn: 1, info: 2 };
  const daily = await dailyState(lang);
  const fromDaily = daily.recommendations.filter((r) => r.status === "OPEN").map((r) => ({ key: r.key, type: `DAILY_${r.type}`, severity: r.severity as "crit" | "warn" | "info", vendor: r.vendor, title: r.title, why: `${r.why} → ${r.action}`, impactK: null as number | null, channel: "INTERNAL" as "EMAIL" | "INTERNAL", href: "/daily", state: "OPEN" as string, emailId: null as string | null, isNew: r.isNew, since: r.since as string | null }));
  const fromEngine = recs.recommendations
    .filter((r) => CAMPAIGN_REC_TYPES.includes(r.type) && (r.state === "OPEN" || r.state === "DRAFTED"))
    .map((r) => ({ key: r.key, type: r.type, severity: r.severity, vendor: r.vendor, title: r.title, why: r.rationale, impactK: r.impactK, channel: r.channel, href: r.href ?? null, state: r.state as string, emailId: r.emailId, isNew: false, since: null as string | null }));
  const campaignRecs = [...fromDaily, ...fromEngine].sort((x, y) => sevRank[x.severity] - sevRank[y.severity]);

  // Targets
  const perf = performance(a);
  const tgt = (asset: string | null, month: string) => targets.filter((t) => (!asset || t.asset === asset) && t.month === month).reduce((s, t) => s + t.salesM, 0);
  const byAsset = perf.assets.map((asset) => {
    const act = perf.months.reduce((s, m) => s + perf.actual(asset, m), 0), tg = perf.months.reduce((s, m) => s + tgt(asset, m), 0);
    const last3 = perf.months.slice(-3).reduce((s, m) => s + perf.actual(asset, m), 0) / 3;
    return { asset, actualM: r1(act), targetM: r1(tg), pct: tg ? Math.round((act / tg) * 100) : null, forecastNextM: r1(last3), targetNextM: r1(tgt(asset, PLAN_MONTH)) };
  }).sort((x, y) => (x.pct ?? 0) - (y.pct ?? 0));
  const monthly = perf.months.map((m) => ({ month: m, actualM: r1(perf.actual(null, m)), targetM: r1(tgt(null, m)) }));
  const ytdA = r1(monthly.reduce((s, m) => s + m.actualM, 0)), ytdT = r1(monthly.reduce((s, m) => s + m.targetM, 0));
  const costK = a.unified.vendors.reduce((s, v) => s + v.verified.costK, 0);

  // Plan (live proposal, or the approved one for the month)
  const approved = plans.find((p) => p.month === PLAN_MONTH && p.status === "APPROVED");
  const proposal = proposePlan(a, lang);
  const plan = approved
    ? { ...proposal, status: "APPROVED", approvedBy: approved.approvedBy, approvedAt: approved.approvedAt?.toISOString() ?? null, lines: JSON.parse(approved.linesJson) as PlanLine[] }
    : { ...proposal, status: "PROPOSED", approvedBy: null, approvedAt: null };

  // Approval inbox — everything waiting on a person
  const woWaiting = orch.orders.filter((o) => o.status === "PROPOSED" && o.email?.status === "DRAFT");
  const emailDrafts = emails.filter((e) => (e.status === "DRAFT" || e.status === "FAILED") && !e.recKey.startsWith("WO:")).length;
  const inboxRaw = [
    ...(plan.status === "PROPOSED" ? [{ kind: "PLAN", title: T(`Budget plan for June 2026 (${K(lang, plan.totalK)}) — vendor briefs follow from it`, `خطة الميزانية لشهر يونيو 2026 (${K(lang, plan.totalK)}) — تُبنى عليها موجزات الموردين`), href: "#plan", severity: "warn", minutes: 10 }] : []),
    ...orch.escalations.map((x) => ({ kind: "CALL", title: x.title, href: "/orchestration", severity: "crit", minutes: MINUTES.ESCALATION })),
    ...(daily.summary.open ? [{
      kind: "DAILY",
      title: T(`Daily campaign check: ${daily.summary.open} open (${daily.summary.urgent} urgent${daily.summary.new ? `, ${daily.summary.new} new today` : ""}) — accept or dismiss`, `الفحص اليومي للحملات: ${daily.summary.open} مفتوحة (${daily.summary.urgent} عاجلة${daily.summary.new ? `، ${daily.summary.new} جديدة اليوم` : ""}) — اقبلوا أو ارفضوا`),
      href: "/daily", severity: daily.summary.urgent ? "crit" : "warn", minutes: Math.max(2, Math.ceil(daily.summary.open / 2)),
    }] : []),
    ...(meta && meta.summary.needsReview ? [{
      kind: "META",
      title: T(`${meta.summary.needsReview} Meta campaign(s) to check — who runs them${meta.summary.unknownK ? ` (incl. ${K("en", meta.summary.unknownK)} by an agency that isn't one of yours)` : ""}`, `حملات ميتا للتحقق (${meta.summary.needsReview}) — من يديرها${meta.summary.unknownK ? ` (منها ${K(lang, meta.summary.unknownK)} لجهة ليست من وكالاتكم)` : ""}`),
      href: "/campaigns#meta", severity: meta.summary.unknownK ? "crit" : "warn", minutes: 2 * meta.summary.needsReview,
    }] : []),
    ...(woWaiting.some((o) => o.kind === "MONTHLY_BRIEF") ? [{ kind: "VENDOR", title: T(`${woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length} vendor briefs for June, drafted from the approved plan`, `موجزات يونيو للموردين (${woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length}) — أُعدّت من الخطة المعتمدة`), href: "/orchestration", severity: "warn", minutes: woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length * MINUTES.MONTHLY_BRIEF }] : []),
    ...woWaiting.filter((o) => !o.routine && o.kind !== "MONTHLY_BRIEF").map((o) => ({ kind: "VENDOR", title: `${N(o.vendor)}: ${o.title}`, href: "/orchestration", severity: "warn", minutes: MINUTES[o.kind] ?? 3 })),
    ...(woWaiting.some((o) => o.routine) ? [{ kind: "VENDOR", title: T(`${woWaiting.filter((o) => o.routine).length} routine vendor messages (feedback, reminders) — approve in one go`, `رسائل روتينية للموردين (${woWaiting.filter((o) => o.routine).length}) (ملاحظات، تذكيرات) — اعتماد دفعة واحدة`), href: "/orchestration", severity: "info", minutes: woWaiting.filter((o) => o.routine).reduce((sum, o) => sum + (MINUTES[o.kind] ?? 1), 0) }] : []),
    ...a.bench.trials.filter((x) => x.status === "PROPOSED").map((x) => ({ kind: "TRIAL", title: T(`Approve trial: ${x.challenger} vs ${x.incumbent} (${K("en", x.budgetK)})`, `اعتماد تجربة: ${N(x.challenger)} مقابل ${N(x.incumbent)} (${K(lang, x.budgetK)})`), href: "/decisions#trials", severity: "warn", minutes: 3 })),
    ...a.bench.trials.filter((x) => x.status === "COMPLETED" && !x.decision).map((x) => ({ kind: "TRIAL", title: T(`Decide trial result: ${x.challenger} vs ${x.incumbent}`, `البت في نتيجة تجربة: ${N(x.challenger)} مقابل ${N(x.incumbent)}`), href: "/decisions#trials", severity: "crit", minutes: 5 })),
    ...experiments.filter((x) => x.status === "PLANNED").map((x) => ({ kind: "TEST", title: T(`Approve test: ${x.campaign}`, `اعتماد اختبار: ${N(x.campaign)}`), href: "/experiments", severity: "info", minutes: 3 })),
    ...(emailDrafts ? [{ kind: "EMAIL", title: T(`${emailDrafts} vendor email draft(s) to approve`, `مسودات رسائل للموردين بانتظار الاعتماد (${emailDrafts})`), href: "drafts", severity: "warn", minutes: 2 * emailDrafts }] : []),
    ...(a.inv.kpis.exceptions ? [{ kind: "INVOICE", title: T(`${a.inv.kpis.exceptions} supplier invoice exception(s) to resolve`, `استثناءات فواتير موردين بحاجة إلى معالجة (${a.inv.kpis.exceptions})`), href: "/invoices", severity: "warn", minutes: 2 * a.inv.kpis.exceptions }] : []),
  ];
  const inbox = inboxRaw;
  const managerMinutes = inbox.reduce((sum, x) => sum + x.minutes, 0);

  // Brief
  const scan = await dailyScan();
  const scanTop = scan.signals.filter((s) => !s.linkedTo && s.direction === "down" && s.severity !== "info");
  const scanLine = T(`Data scan: ${scan.sources.length} sources checked (${scan.sources.filter((s) => s.found).map((s) => `${s.source === "CRM" ? "CRM" : s.source === "EMAIL" ? "email" : s.source === "INVOICES" ? "invoices" : s.source === "ADS" ? "ad platforms" : s.source === "COMPETITORS" ? "competitors" : s.source === "MARKET" ? "market" : "calendar"} ${s.found}`).join(", ")}) — ${scanTop.length} need an answer${scanTop[0] ? `; first: ${scanTop[0].title.en}` : ""}. Initiatives for each are in the daily report.`,
    `فحص البيانات: ${scan.sources.length} مصادر (${scan.sources.filter((s) => s.found).map((s) => `${({ CRM: "النظام", EMAIL: "البريد", INVOICES: "الفواتير", ADS: "المنصات", COMPETITORS: "المنافسون", MARKET: "السوق", CALENDAR: "التقويم" } as Record<string, string>)[s.source]} ${s.found}`).join("، ")}) — ${scanTop.length} تحتاج إلى استجابة${scanTop[0] ? `؛ أولاها: ${scanTop[0].title.ar}` : ""}. والمبادرات لكل منها في التقرير اليومي.`);
  const worst = byAsset[0];
  const crit = recs.recommendations.filter((r) => r.severity === "crit" && (r.state === "OPEN" || r.state === "DRAFTED"));
  const ytdPct = ytdT ? Math.round((ytdA / ytdT) * 100) : 0;
  const decisionsLine = a.decisions.filter((d) => d.decision !== "RENEGOTIATE" && d.decision !== "RE_ENGAGE").map((d) => `${N(d.vendor)}: ${d.headline.toLowerCase()}`);
  const brief = {
    headline: T(`Sales are at ${ytdPct}% of target year to date; ${worst ? `${worst.asset} is furthest behind (${worst.pct}%)` : ""}.`, `المبيعات عند ${ytdPct}% من المستهدف منذ بداية العام؛ ${worst ? `${N(worst.asset)} الأبعد عن المستهدف (${worst.pct}%)` : ""}.`),
    bullets: [
      T(`Year to date: ${M(lang, ytdA)} contracted (CRM-verified) against ${M(lang, ytdT)} target; marketing cost ${K(lang, r1(costK))} (${ytdA ? r1((costK / (ytdA * 1000)) * 100) : "—"}% of sales).`, `منذ بداية العام: ${M(lang, ytdA)} متعاقد عليها (متحقَّق منها في النظام) مقابل مستهدف ${M(lang, ytdT)}؛ التكلفة التسويقية ${K(lang, r1(costK))} (${ytdA ? r1((costK / (ytdA * 1000)) * 100) : "—"}% من المبيعات).`),
      ...byAsset.map((x) => T(`${x.asset}: ${x.pct}% of target; June forecast ${M(lang, x.forecastNextM)} vs ${M(lang, x.targetNextM)} target.`, `${N(x.asset)}: ${x.pct}% من المستهدف؛ توقّع يونيو ${M(lang, x.forecastNextM)} مقابل مستهدف ${M(lang, x.targetNextM)}.`)),
      T(`Vendor calls: ${decisionsLine.join("; ") || "no exits or replacements"}.`, `قرارات الموردين: ${decisionsLine.join("؛ ") || "لا خروج ولا استبدال"}.`),
      T(`June budget plan reallocates within the same ${K(lang, plan.totalK)} for about ${M(lang, plan.upliftM)} more incremental sales.`, `خطة ميزانية يونيو تعيد التوزيع ضمن الإجمالي نفسه ${K(lang, plan.totalK)} لنحو ${M(lang, plan.upliftM)} مبيعات إضافية.`),
      T(`Campaigns: ${campaignRecs.length} recommendations (${fromDaily.length} from today's campaign check), ${campaignRecs.filter((r) => r.severity === "crit").length} urgent${campaignRecs[0] ? ` — first: ${campaignRecs[0].title}` : ""}.`, `الحملات: ${an(campaignRecs.length, "توصية واحدة", "توصيتان", "توصيات", "توصية")} (${fromDaily.length} من فحص الحملات اليوم)، منها ${campaignRecs.filter((r) => r.severity === "crit").length} عاجلة${campaignRecs[0] ? ` — أولاها: ${campaignRecs[0].title}` : ""}.`),
      ...(scanLine ? [scanLine] : []),
      T(`Vendors: ${orch.summary.withVendors} work orders with vendors (${orch.summary.overdue} overdue), ${orch.summary.lateDeliverables} late deliverable(s) being chased, ${orch.summary.waiting} message(s) drafted for your approval.`, `الموردون: ${an(orch.summary.withVendors, "أمر عمل واحد", "أمرا عمل", "أوامر عمل", "أمر عمل")} لدى الموردين (${orch.summary.overdue} متأخر)، و${an(orch.summary.lateDeliverables, "تسليم متأخر واحد", "تسليمان متأخران", "تسليمات متأخرة", "تسليماً متأخراً")} قيد المتابعة، و${an(orch.summary.waiting, "رسالة واحدة مُعدّة", "رسالتان مُعدّتان", "رسائل مُعدّة", "رسالة مُعدّة")} بانتظار اعتمادكم.`),
      T(`Your time: about ${managerMinutes} minutes for ${inbox.length} decisions — the rest is handled.`, `وقتكم: نحو ${an(managerMinutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")} لـ${an(inbox.length, "قرار واحد", "قرارين", "قرارات", "قراراً")} — والباقي يُنجز تلقائياً.`),
    ],
    risks: crit.slice(0, 4).map((r) => r.title),
    actions: [
      ...(plan.status === "PROPOSED" ? [T("Approve the June budget plan — I then draft each vendor's brief.", "اعتماد خطة ميزانية يونيو — ثم أُعدّ موجز كل مورد.")] : []),
      ...campaignRecs.filter((r) => r.severity === "crit").slice(0, 2).map((r) => r.title + "."),
      ...orch.escalations.map((x) => x.title + "."),
      ...(woWaiting.length ? [T(`Approve ${woWaiting.length} vendor message(s) on Orchestration (${woWaiting.filter((o) => o.routine).length} routine).`, `اعتماد ${woWaiting.length} رسالة للموردين في صفحة التنسيق (${woWaiting.filter((o) => o.routine).length} روتينية).`)] : []),
      ...a.bench.trials.filter((x) => x.status === "COMPLETED" && !x.decision).map((x) => T(`Decide on ${x.challenger} (won its trial against ${x.incumbent}).`, `البت في ${N(x.challenger)} (فاز في تجربته أمام ${N(x.incumbent)}).`)),
    ].slice(0, 6),
  };

  return {
    asOf: TODAY.toISOString(), brief, targets: { monthly, byAsset, ytdActualM: ytdA, ytdTargetM: ytdT, ytdPct },
    plan, inbox, managerMinutes, orchestration: orch.summary,
    campaignRecs,
    campaignQuality: campaignQuality(a, lang),
  };
}
export type Director = Awaited<ReturnType<typeof buildDirector>>;

// ----------------------------------------------------------------- actions
export async function approvePlan(lang: Lang, approver: string) {
  if (!approver?.trim()) throw new Error(tx(lang, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const a = await buildAgent(lang);
  const p = proposePlan(a, lang);
  if ((await prisma.budgetPlan.findMany()).some((x) => x.month === p.month && x.status === "APPROVED")) throw new Error(tx(lang, "This month's plan is already approved.", "خطة هذا الشهر معتمدة بالفعل."));
  await prisma.budgetPlan.create({ data: { month: p.month, status: "APPROVED", totalK: p.totalK, linesJson: JSON.stringify(p.lines), approvedBy: approver.trim(), approvedAt: new Date() } });
  await prisma.marketingAction.create({ data: { type: "PLAN_APPROVED", campaign: p.month, detail: tx(lang, `Budget plan ${K("en", p.totalK)} approved by ${approver.trim()}.`, `اعتمد ${approver.trim()} خطة الميزانية ${K(lang, p.totalK)}.`) } });
  // Kinan's agent and Yardi get the plan and the vendor decisions as context.
  await queueKinanEvent("director.plan_approved", "AGENT", {
    month: p.month, totalK: p.totalK, approvedBy: approver.trim(),
    allocations: p.lines.map((x) => ({ vendor: x.vendor, decision: x.decision, budgetK: x.proposedK, changeK: r1(x.proposedK - x.currentK) })),
    campaigns: a.mkt.campaigns.map((c) => ({ campaignCode: a.unified.campaigns.find((u) => u.id === c.id)?.code, campaign: c.name, vendor: c.vendor, status: c.status })),
  }, approver.trim());
}

export async function sendBriefToKinan(lang: Lang) {
  const d = await buildDirector(lang);
  await queueKinanEvent("brief.daily", "AGENT", { date: d.asOf.slice(0, 10), headline: d.brief.headline, bullets: d.brief.bullets, risks: d.brief.risks, actions: d.brief.actions, campaignRecommendations: d.campaignRecs.slice(0, 8).map((r) => ({ title: r.title, severity: r.severity, impactK: r.impactK })) });
}

/** Compact context for Kinan's AI agent (GET /api/kinan/context). No personal data. */
export async function kinanContext(lang: Lang = "en") {
  const a = await buildAgent(lang);
  const d = await buildDirector(lang, a);
  return {
    generatedAt: new Date().toISOString(), asOf: d.asOf.slice(0, 10), language: lang,
    brief: { headline: d.brief.headline, actions: d.brief.actions },
    targets: d.targets.byAsset.map((x) => ({ project: x.asset, ytdActualM: x.actualM, ytdTargetM: x.targetM, pctOfTarget: x.pct, nextMonthForecastM: x.forecastNextM, nextMonthTargetM: x.targetNextM })),
    campaignQuality: d.campaignQuality.map(({ advice, ...s }) => s),
    campaigns: a.unified.campaigns.map((c) => ({ campaignCode: c.code, campaign: c.name, project: a.mkt.campaigns.find((m) => m.id === c.id)?.asset, vendor: c.vendor, channel: c.channel, status: c.status })),
    vendorDecisions: a.decisions.map((x) => ({ vendor: x.vendor, decision: x.decision, confidence: x.confidence })),
    budgetPlan: { month: d.plan.month, status: d.plan.status, allocations: d.plan.lines.map((x) => ({ vendor: x.vendor, budgetK: x.proposedK })) },
    campaignRecommendations: d.campaignRecs.map((r) => ({ title: r.title, severity: r.severity, why: r.why })),
  };
}
