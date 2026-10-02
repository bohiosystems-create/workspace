// AI Director of Marketing — the layer that turns the agent's analysis into a director's job:
//   1. hold the team to sales targets (per project), and say where the plan is off track
//   2. a daily brief: what changed, what is at risk, what needs a decision
//   3. next month's budget plan across vendors (incremental sales per SAR, diminishing returns, guardrails)
//   4. one approval inbox for everything waiting on a person
//   5. delegations to Kinan's AI agent (lead follow-ups, re-engagement, source quality)
//   6. vendor orchestration (lib/orchestrator.ts): briefs, feedback, chasers and notices — the team's work, done for
//      a single marketing manager, who only approves
// Nothing that spends money or contacts a customer or vendor happens without a named approver.
import { prisma } from "./prisma";
import { single, serial } from "./single";
import { buildAgent, type Agent } from "./agent";
import { buildRecommendations } from "./recommendations";
import { queueKinanEvent } from "./kinan";
import { buildOrchestration, MINUTES } from "./orchestrator";
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

// -------------------------------------------------------------- delegations
type TaskProposal = { key: string; assignee: string; title: string; detail: string; payload?: unknown };
function taskProposals(a: Agent, l: Lang, leads: Awaited<ReturnType<typeof prisma.crmLead.findMany>>) {
  const T = (en: string, ar: string) => tx(l, en, ar);
  const campaignName = new Map(a.mkt.campaigns.map((c) => [c.id, c.name]));
  const proposals: TaskProposal[] = [];

  // 1. Leads nobody contacted for 48h+ → Kinan's AI agent follows up (customer-facing: needs approval).
  const untouched = leads.filter((x) => x.stage === "NEW" && !x.firstResponseAt && TODAY.getTime() - x.createdAt.getTime() > 2 * 86_400_000 && x.campaignId);
  if (untouched.length) {
    const byCampaign = new Map<string, number>();
    for (const x of untouched) byCampaign.set(x.campaignId!, (byCampaign.get(x.campaignId!) ?? 0) + 1);
    const top = [...byCampaign.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([id, n]) => `${nm(l, campaignName.get(id) ?? "")} (${n})`);
    proposals.push({
      key: `FOLLOWUP:${untouched.length}:${untouched[0].crmId}`, assignee: "KINAN_AGENT",
      title: T(`Follow up ${untouched.length} leads that nobody contacted`, `متابعة ${an(untouched.length, "عميل محتمل واحد", "عميلين محتملين", "عملاء محتملين", "عميلاً محتملاً")} لم يتواصل معهم أحد`),
      detail: T(`Leads older than 48 hours with no first response, mostly from ${top.join(", ")}. Kinan's agent contacts them in the lead's language and logs the outcome in Yardi.`, `عملاء محتملون مضى عليهم أكثر من 48 ساعة دون أي استجابة، أغلبهم من ${top.join("، ")}. يتواصل معهم وكيل كنان بلغة العميل ويسجّل النتيجة في Yardi.`),
      payload: { reason: "no_first_response_48h", leads: untouched.slice(0, 500).map((x) => ({ leadId: x.crmId, createdAt: x.createdAt.toISOString(), campaignCode: x.source })) },
    });
  }
  // 2. Recently lost on price / financing → re-engage with the payment-plan offer (needs approval).
  const lost = leads.filter((x) => x.stage === "LOST" && ["Price", "Financing"].includes(x.lostReason ?? "") && TODAY.getTime() - x.createdAt.getTime() < 120 * 86_400_000);
  if (lost.length) proposals.push({
    key: `REENGAGE:${lost.length}:${lost[0].crmId}`, assignee: "KINAN_AGENT",
    title: T(`Re-engage ${lost.length} leads lost on price or financing`, `إعادة التواصل مع ${an(lost.length, "عميل واحد", "عميلين", "عملاء", "عميلاً")} خسرناهم بسبب السعر أو التمويل`),
    detail: T("Lost in the last 4 months for price or financing. Kinan's agent offers the current payment plan / financing partners and books a viewing if interested.", "خُسروا خلال الأشهر الأربعة الماضية بسبب السعر أو التمويل. يعرض عليهم وكيل كنان خطة السداد الحالية / شركاء التمويل ويحجز معاينة عند الاهتمام."),
    payload: { reason: "lost_price_or_financing", leads: lost.slice(0, 500).map((x) => ({ leadId: x.crmId, lostReason: x.lostReason, campaignCode: x.source })) },
  });
  // (Vendor-facing follow-ups — e.g. the non-renewal notice for an exit — are work orders: lib/orchestrator.ts.)
  return proposals;
}
async function proposeTasks(a: Agent) {
  const leads = await prisma.crmLead.findMany();
  const en = taskProposals(a, "en", leads), ar = taskProposals(a, "ar", leads);
  const existing = await prisma.directorTask.findMany();
  const created: Promise<unknown>[] = [];
  en.forEach((p, i) => {
    if (existing.some((e) => e.key === p.key)) return;
    existing.push({ key: p.key } as any);
    created.push(prisma.directorTask.create({ data: { key: p.key, assignee: p.assignee, title: p.title, detail: p.detail, titleAr: ar[i]?.title ?? null, detailAr: ar[i]?.detail ?? null, payload: p.payload ? JSON.stringify(p.payload) : null } }));
  });
  await Promise.all(created);
}
const proposeTasksOnce = serial(proposeTasks);

// Lead-source quality for Kinan's agent and Yardi: which campaign codes deserve fastest handling.
export function sourceQuality(a: Agent, l: Lang) {
  const rows = a.unified.campaigns.filter((c) => c.code && c.verified.leads > 0).map((c) => ({
    code: c.code!, campaign: c.name, vendor: c.vendor,
    qualifiedRate: c.verified.qualified / c.verified.leads, winRate: c.verified.won / c.verified.leads, medianResponseHrs: c.verified.respHrs,
  }));
  // Rank sources on lead quality (qualified rate × win rate); score = percentile, guidance by thirds.
  const ranked = [...rows].sort((p, q) => Math.sqrt(q.qualifiedRate * q.winRate) - Math.sqrt(p.qualifiedRate * p.winRate));
  const n = ranked.length;
  return ranked.map((r, i) => {
    const score = n > 1 ? Math.round((100 * (n - 1 - i)) / (n - 1)) : 50;
    const guidance = i < Math.ceil(n / 3) ? "PRIORITISE" : i >= n - Math.floor(n / 3) ? "DEPRIORITISE" : "NORMAL";
    return {
      ...r, qualifiedRate: Math.round(r.qualifiedRate * 1000) / 10, winRate: Math.round(r.winRate * 1000) / 10, qualityScore: score, guidance,
      guidanceText: guidance === "PRIORITISE" ? tx(l, "Answer within the hour; senior sales agent.", "الرد خلال ساعة؛ وكيل مبيعات أول.") : guidance === "DEPRIORITISE" ? tx(l, "Qualify by message first before a call.", "التأهيل برسالة أولاً قبل الاتصال.") : tx(l, "Standard handling.", "معالجة اعتيادية."),
    };
  });
}

// ------------------------------------------------------------------- build
export async function buildDirector(lang: Lang = "en", pre?: Agent) {
  await ensureTargets();
  const a = pre ?? (await buildAgent(lang));
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (s: string) => nm(lang, s);
  const [targets, plans, tasksBefore, recs, emails, experiments] = await Promise.all([
    prisma.salesTarget.findMany(), prisma.budgetPlan.findMany(), prisma.directorTask.findMany(),
    buildRecommendations(lang, a), prisma.outboundEmail.findMany(), prisma.experiment.findMany(),
  ]);
  await proposeTasksOnce(a);
  void tasksBefore;
  const tasks = (await prisma.directorTask.findMany()).filter((x) => x.assignee !== "TEAM");
  const orch = await buildOrchestration(lang, a);
  const taskTitle = (x: (typeof tasks)[number]) => (lang === "ar" ? x.titleAr ?? x.title : x.title);

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
    ...(woWaiting.some((o) => o.kind === "MONTHLY_BRIEF") ? [{ kind: "VENDOR", title: T(`${woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length} vendor briefs for June, drafted from the approved plan`, `موجزات يونيو للموردين (${woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length}) — أُعدّت من الخطة المعتمدة`), href: "/orchestration", severity: "warn", minutes: woWaiting.filter((o) => o.kind === "MONTHLY_BRIEF").length * MINUTES.MONTHLY_BRIEF }] : []),
    ...woWaiting.filter((o) => !o.routine && o.kind !== "MONTHLY_BRIEF").map((o) => ({ kind: "VENDOR", title: `${N(o.vendor)}: ${o.title}`, href: "/orchestration", severity: "warn", minutes: MINUTES[o.kind] ?? 3 })),
    ...(woWaiting.some((o) => o.routine) ? [{ kind: "VENDOR", title: T(`${woWaiting.filter((o) => o.routine).length} routine vendor messages (feedback, reminders) — approve in one go`, `رسائل روتينية للموردين (${woWaiting.filter((o) => o.routine).length}) (ملاحظات، تذكيرات) — اعتماد دفعة واحدة`), href: "/orchestration", severity: "info", minutes: woWaiting.filter((o) => o.routine).reduce((sum, o) => sum + (MINUTES[o.kind] ?? 1), 0) }] : []),
    ...tasks.filter((x) => x.status === "PROPOSED").map((x) => ({ kind: "TASK", title: taskTitle(x), href: "#tasks", severity: x.assignee === "KINAN_AGENT" ? "warn" : "info", minutes: 2 })),
    ...a.bench.trials.filter((x) => x.status === "PROPOSED").map((x) => ({ kind: "TRIAL", title: T(`Approve trial: ${x.challenger} vs ${x.incumbent} (${K("en", x.budgetK)})`, `اعتماد تجربة: ${N(x.challenger)} مقابل ${N(x.incumbent)} (${K(lang, x.budgetK)})`), href: "/bench", severity: "warn", minutes: 3 })),
    ...a.bench.trials.filter((x) => x.status === "COMPLETED" && !x.decision).map((x) => ({ kind: "TRIAL", title: T(`Decide trial result: ${x.challenger} vs ${x.incumbent}`, `البت في نتيجة تجربة: ${N(x.challenger)} مقابل ${N(x.incumbent)}`), href: "/bench", severity: "crit", minutes: 5 })),
    ...experiments.filter((x) => x.status === "PLANNED").map((x) => ({ kind: "TEST", title: T(`Approve test: ${x.campaign}`, `اعتماد اختبار: ${N(x.campaign)}`), href: "/experiments", severity: "info", minutes: 3 })),
    ...(emailDrafts ? [{ kind: "EMAIL", title: T(`${emailDrafts} vendor email draft(s) to approve`, `مسودات رسائل للموردين بانتظار الاعتماد (${emailDrafts})`), href: "drafts", severity: "warn", minutes: 2 * emailDrafts }] : []),
    ...(a.inv.kpis.exceptions ? [{ kind: "INVOICE", title: T(`${a.inv.kpis.exceptions} supplier invoice exception(s) to resolve`, `استثناءات فواتير موردين بحاجة إلى معالجة (${a.inv.kpis.exceptions})`), href: "/invoices", severity: "warn", minutes: 2 * a.inv.kpis.exceptions }] : []),
  ];
  const inbox = inboxRaw;
  const managerMinutes = inbox.reduce((sum, x) => sum + x.minutes, 0);

  // Brief
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
      T(`Vendors: ${orch.summary.withVendors} work orders with vendors (${orch.summary.overdue} overdue), ${orch.summary.lateDeliverables} late deliverable(s) being chased, ${orch.summary.waiting} message(s) drafted for your approval.`, `الموردون: ${an(orch.summary.withVendors, "أمر عمل واحد", "أمرا عمل", "أوامر عمل", "أمر عمل")} لدى الموردين (${orch.summary.overdue} متأخر)، و${an(orch.summary.lateDeliverables, "تسليم متأخر واحد", "تسليمان متأخران", "تسليمات متأخرة", "تسليماً متأخراً")} قيد المتابعة، و${an(orch.summary.waiting, "رسالة واحدة مُعدّة", "رسالتان مُعدّتان", "رسائل مُعدّة", "رسالة مُعدّة")} بانتظار اعتمادكم.`),
      T(`Your time: about ${managerMinutes} minutes for ${inbox.length} decisions — the rest is handled.`, `وقتكم: نحو ${an(managerMinutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")} لـ${an(inbox.length, "قرار واحد", "قرارين", "قرارات", "قراراً")} — والباقي يُنجز تلقائياً.`),
    ],
    risks: crit.slice(0, 4).map((r) => r.title),
    actions: [
      ...(plan.status === "PROPOSED" ? [T("Approve the June budget plan — I then draft each vendor's brief.", "اعتماد خطة ميزانية يونيو — ثم أُعدّ موجز كل مورد.")] : []),
      ...orch.escalations.map((x) => x.title + "."),
      ...(woWaiting.length ? [T(`Approve ${woWaiting.length} vendor message(s) on Orchestration (${woWaiting.filter((o) => o.routine).length} routine).`, `اعتماد ${woWaiting.length} رسالة للموردين في صفحة التنسيق (${woWaiting.filter((o) => o.routine).length} روتينية).`)] : []),
      ...tasks.filter((x) => x.status === "PROPOSED" && x.assignee === "KINAN_AGENT").map((x) => T(`Release to Kinan's agent: ${x.title.toLowerCase()}.`, `إحالة إلى وكيل كنان: ${taskTitle(x)}.`)),
      ...a.bench.trials.filter((x) => x.status === "COMPLETED" && !x.decision).map((x) => T(`Decide on ${x.challenger} (won its trial against ${x.incumbent}).`, `البت في ${N(x.challenger)} (فاز في تجربته أمام ${N(x.incumbent)}).`)),
    ].slice(0, 5),
  };

  return {
    asOf: TODAY.toISOString(), brief, targets: { monthly, byAsset, ytdActualM: ytdA, ytdTargetM: ytdT, ytdPct },
    plan, inbox, managerMinutes, orchestration: orch.summary,
    tasks: tasks.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).map((x) => ({
      id: x.id, assignee: x.assignee, title: taskTitle(x), detail: lang === "ar" ? x.detailAr ?? x.detail : x.detail, status: x.status, approvedBy: x.approvedBy, eventId: x.eventId,
      leads: x.payload ? (JSON.parse(x.payload).leads?.length ?? 0) : 0,
    })),
    sourceQuality: sourceQuality(a, lang),
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

export async function decideTask(id: string, decision: "APPROVE" | "REJECT" | "DONE", approver: string, lang: Lang) {
  if (!approver?.trim()) throw new Error(tx(lang, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const t = (await prisma.directorTask.findMany()).find((x) => x.id === id);
  if (!t) throw new Error(tx(lang, "Task not found.", "المهمة غير موجودة."));
  if (decision === "REJECT") { await prisma.directorTask.update({ where: { id }, data: { status: "REJECTED", approvedBy: approver.trim() } }); return; }
  if (decision === "DONE") { await prisma.directorTask.update({ where: { id }, data: { status: "DONE" } }); return; }
  if (t.status !== "PROPOSED") throw new Error(tx(lang, "Only proposed tasks can be approved.", "لا يمكن اعتماد إلا المهام المقترحة."));
  let eventId: string | null = null;
  if (t.assignee === "KINAN_AGENT") {
    const p = t.payload ? JSON.parse(t.payload) : {};
    eventId = await queueKinanEvent("lead.followup_requested", "AGENT", { taskId: t.id, title: t.title, instructions: t.detail, titleAr: t.titleAr, instructionsAr: t.detailAr, ...p }, approver.trim());
  }
  await prisma.directorTask.update({ where: { id }, data: { status: "APPROVED", approvedBy: approver.trim(), eventId } });
  await prisma.marketingAction.create({ data: { type: "TASK_APPROVED", campaign: lang === "ar" ? t.titleAr ?? t.title : t.title, detail: tx(lang, `Released by ${approver.trim()}${eventId ? " to Kinan's agent" : ""}.`, `أحالها ${approver.trim()}${eventId ? " إلى وكيل كنان" : ""}.`) } });
}

export async function sendBriefToKinan(lang: Lang) {
  const d = await buildDirector(lang);
  await queueKinanEvent("brief.daily", "AGENT", { date: d.asOf.slice(0, 10), headline: d.brief.headline, bullets: d.brief.bullets, risks: d.brief.risks, actions: d.brief.actions });
}

export async function pushSourceQuality(lang: Lang) {
  const a = await buildAgent(lang);
  await queueKinanEvent("lead_source.quality", "AGENT", { sources: sourceQuality(a, "en").map(({ guidanceText, ...s }) => s) });
  await queueKinanEvent("lead_source.quality", "YARDI", { sources: sourceQuality(a, "en").map((s) => ({ code: s.code, qualityScore: s.qualityScore, guidance: s.guidance })) });
}

/** Compact context for Kinan's AI agent (GET /api/kinan/context). No personal data. */
export async function kinanContext(lang: Lang = "en") {
  const a = await buildAgent(lang);
  const d = await buildDirector(lang, a);
  return {
    generatedAt: new Date().toISOString(), asOf: d.asOf.slice(0, 10), language: lang,
    brief: { headline: d.brief.headline, actions: d.brief.actions },
    targets: d.targets.byAsset.map((x) => ({ project: x.asset, ytdActualM: x.actualM, ytdTargetM: x.targetM, pctOfTarget: x.pct, nextMonthForecastM: x.forecastNextM, nextMonthTargetM: x.targetNextM })),
    leadSources: d.sourceQuality.map(({ guidanceText, ...s }) => ({ ...s, handling: guidanceText })),
    campaigns: a.unified.campaigns.map((c) => ({ campaignCode: c.code, campaign: c.name, project: a.mkt.campaigns.find((m) => m.id === c.id)?.asset, vendor: c.vendor, channel: c.channel, status: c.status })),
    vendorDecisions: a.decisions.map((x) => ({ vendor: x.vendor, decision: x.decision, confidence: x.confidence })),
    budgetPlan: { month: d.plan.month, status: d.plan.status, allocations: d.plan.lines.map((x) => ({ vendor: x.vendor, budgetK: x.proposedK })) },
    tasksForAgent: (await prisma.directorTask.findMany()).filter((t) => t.assignee === "KINAN_AGENT" && t.status === "APPROVED").map((t) => ({ taskId: t.id, title: lang === "ar" ? t.titleAr ?? t.title : t.title, instructions: lang === "ar" ? t.detailAr ?? t.detail : t.detail, ...(t.payload ? JSON.parse(t.payload) : {}) })),
  };
}
