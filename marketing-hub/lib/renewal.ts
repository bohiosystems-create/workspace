// Renewal decision per vendor: RE_ENGAGE | RENEGOTIATE | PERFORMANCE_PLAN | TEST_REPLACEMENT | EXIT,
// each with the evidence behind it, a confidence level, what would change it, and concrete targets.
//
// Scores are centred on 50 = channel benchmark (lib/scoring.ts), so the bands are relative to par:
//   EXIT              score < 35, effect not proven or lost a head-to-head trial, and an alternative exists
//   TEST_REPLACEMENT  score < 40, or lost a trial, or effect not proven while below 55 — with an alternative
//   PERFORMANCE_PLAN  score < 50, critical SLA / data-integrity issue, or declining while below 55
//   RENEGOTIATE       at or above par but low confidence, priced above benchmark, billing / data issues, or contract ≤ 6 months
//   RE_ENGAGE         clearly above par (≥ 60) with at least medium confidence and no open issues
import type { VendorScore } from "./scoring";
import type { VendorIncrementality } from "./incrementality";
import type { TrialReadout } from "./bench";
import { type Lang, tx, K, nm, dt } from "./i18n";

export type Decision = "RE_ENGAGE" | "RENEGOTIATE" | "PERFORMANCE_PLAN" | "TEST_REPLACEMENT" | "EXIT";
export type RenewalDecision = {
  vendorId: string; vendor: string; category: string; decision: Decision; confidence: "High" | "Medium" | "Low";
  confidenceWhy: string; headline: string; evidence: string[]; wouldChange: string; targets: string[];
  contractEnd: string; monthsToExpiry: number; alternatives: string[]; nextStep: string;
};

type Inputs = {
  score: VendorScore;
  inc: VendorIncrementality | undefined;
  vendor: { id: string; name: string; category: string; contractEnd: string; monthsToExpiry: number; slaBreaches: string[]; slaResponseHrs: number; latestRespHrs: number | null; model: string };
  crmFlags: { severity: string; text: string }[];
  dataFlags: { severity: string; text: string }[];
  billing: { blocked: number; anomalies: string[] };
  bench: string[]; // bench vendor names in the same channel
  trial: { challenger: string; readout: TrialReadout } | null; // latest completed trial against this vendor
};

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export function decide(x: Inputs, l: Lang): RenewalDecision {
  const T = (en: string, ar: string) => tx(l, en, ar);
  const N = (s: string) => nm(l, s);
  const s = x.score;
  const notProven = !!x.inc && ((x.inc.evidence === "TEST" && x.inc.significant === false) || (x.inc.high !== null && x.inc.high < 0.5));
  const lostTrial = x.trial?.readout.outcome === "PROMOTE";
  const hasAlt = x.bench.length > 0 || lostTrial;
  const slaCrit = x.vendor.latestRespHrs !== null && x.vendor.latestRespHrs > x.vendor.slaResponseHrs * 1.5;
  const integrityCrit = [...x.crmFlags, ...x.dataFlags].some((f) => f.severity === "crit");
  const cpql = s.metrics.find((m) => m.key === "cpql")!, value = s.metrics.find((m) => m.key === "value")!;
  const priceIssue = (cpql.index ?? 1) < 0.9 || (value.index ?? 1) < 1;
  const expiring = x.vendor.monthsToExpiry <= 6;

  let decision: Decision;
  if (s.score < 35 && (notProven || lostTrial) && hasAlt) decision = "EXIT";
  else if ((s.score < 40 || lostTrial || (notProven && s.score < 55)) && hasAlt) decision = "TEST_REPLACEMENT";
  else if (s.score < 50 || slaCrit || integrityCrit || (s.trend === "declining" && s.score < 55)) decision = "PERFORMANCE_PLAN";
  else if (s.score < 60 || s.confidence === "Low" || priceIssue || x.billing.blocked > 0 || x.dataFlags.length > 0 || expiring) decision = "RENEGOTIATE";
  else decision = "RE_ENGAGE";

  // Confidence: how much independent evidence there is, and whether it points the same way.
  let points = s.confidence === "High" ? 2 : s.confidence === "Medium" ? 1 : 0;
  const why: string[] = [T(`score range ${s.low}–${s.high}`, `نطاق التقييم ${s.low}–${s.high}`)];
  if (x.inc?.evidence === "TEST") { points += 2; why.push(T("a controlled test", "اختبار مضبوط")); }
  else if (x.inc?.evidence === "MMM") { points += 1; why.push(T("media-mix model only", "نموذج مزيج الإعلام فقط")); }
  else why.push(T("no incrementality evidence", "لا أدلة على الأثر الإضافي"));
  if (x.trial) { points += 1; why.push(T("a head-to-head trial", "تجربة مباشرة مع منافس")); }
  if (s.qualified >= 50) points += 1;
  const agrees = (["EXIT", "TEST_REPLACEMENT"].includes(decision) && (notProven || lostTrial || s.score < 40)) || (decision === "RE_ENGAGE" && !notProven) || ["PERFORMANCE_PLAN", "RENEGOTIATE"].includes(decision);
  if (agrees) points += 1;
  const confidence: RenewalDecision["confidence"] = points >= 5 ? "High" : points >= 3 ? "Medium" : "Low";

  const weakest = [...s.metrics].sort((a, b) => a.points - b.points).slice(0, 2);
  const metricName: Record<string, [string, string]> = {
    cpql: ["cost per qualified lead", "تكلفة العميل المؤهل"], value: ["revenue + pipeline per SAR", "الإيرادات وخط المبيعات لكل ريال"], plan: ["spend vs plan", "الإنفاق مقابل الخطة"],
    deadlines: ["deadline adherence", "الالتزام بالمواعيد"], revisions: ["revisions per deliverable", "عدد المراجعات لكل تسليم"],
  };
  const fmt = (m: (typeof s.metrics)[number]) => `${T(metricName[m.key][0], metricName[m.key][1])}: ${m.actual ?? "—"}${m.unit === "%" ? "%" : ""} ${T("vs benchmark", "مقابل المعيار")} ${m.benchmark}${m.unit === "%" ? "%" : ""} (${Math.round(m.points)}/100)`;
  const evidence = [
    T(`Fair score ${s.score}/100 (range ${s.low}–${s.high}), rank ${s.rank}; 50 = channel benchmark.`, `التقييم العادل ${s.score}/100 (النطاق ${s.low}–${s.high})، الترتيب ${s.rank}؛ 50 = معيار القناة.`),
    ...weakest.map((m) => T(`Weakest: ${fmt(m)}`, `الأضعف: ${fmt(m)}`)),
    x.inc ? x.inc.text : T("No incrementality evidence yet.", "لا توجد أدلة على الأثر الإضافي بعد."),
    ...(x.trial ? [T(
      `Trial vs ${x.trial.challenger}: challenger delivered ${x.trial.readout.qlRatio ?? "—"}× the qualified leads per SAR (90% range ${x.trial.readout.qlLow ?? "—"}–${x.trial.readout.qlHigh ?? "—"}).`,
      `التجربة مقابل ${N(x.trial.challenger)}: حقق المنافس ${x.trial.readout.qlRatio ?? "—"}× العملاء المؤهلين لكل ريال (النطاق عند ثقة 90%: ${x.trial.readout.qlLow ?? "—"}–${x.trial.readout.qlHigh ?? "—"}).`)] : []),
    ...x.vendor.slaBreaches.map((b) => T(`SLA: ${b}`, `اتفاقية الخدمة: ${b}`)),
    ...x.crmFlags.map((f) => f.text), ...x.dataFlags.map((f) => f.text), ...x.billing.anomalies,
    s.trend !== "n/a" ? T(`Trend: cost per qualified lead is ${s.trend} over the last two months.`, `الاتجاه: تكلفة العميل المؤهل ${({ improving: "تتحسن", declining: "تتراجع", stable: "مستقرة" } as Record<string, string>)[s.trend]} خلال الشهرين الأخيرين.`) : "",
    T(`Contract ends ${dt(l, x.vendor.contractEnd)} (${x.vendor.monthsToExpiry} months).`, `ينتهي العقد في ${dt(l, x.vendor.contractEnd)} (بعد ${x.vendor.monthsToExpiry} شهر).`),
    x.bench.length ? T(`Bench alternatives: ${x.bench.join(", ")}.`, `بدائل جاهزة: ${x.bench.map(N).join("، ")}.`) : T("No bench alternative in this channel yet.", "لا يوجد بديل جاهز في هذه القناة بعد."),
  ].filter(Boolean);

  const cpqlTarget = Math.round((cpql.benchmark ?? 0) * 0.95);
  const targets = decision === "RE_ENGAGE" ? [] : [
    T(`Cost per CRM-qualified lead ≤ SAR ${cpqlTarget}`, `تكلفة العميل المؤهل في النظام ≤ ${cpqlTarget} ر.س`),
    ...(x.vendor.slaResponseHrs ? [T(`Median first response ≤ ${x.vendor.slaResponseHrs}h (measured in the CRM)`, `وسيط أول استجابة ≤ ${x.vendor.slaResponseHrs} ساعة (مقاساً في النظام)`)] : []),
    T("≥ 85% of deliverables on time; ≤ 1.5 revisions per deliverable", "تسليم 85% على الأقل في الموعد؛ و1.5 مراجعة كحد أقصى لكل تسليم"),
    T("Monthly report in the canonical template, reconciling to the CRM and ad platforms within 5%", "تقرير شهري بالقالب الموحّد يتطابق مع نظام إدارة العملاء والمنصات الإعلانية بفارق لا يتجاوز 5%"),
  ];

  const D: Record<Decision, { headline: [string, string]; change: [string, string]; next: [string, string] }> = {
    RE_ENGAGE: {
      headline: ["Re-engage and consider scaling", "إعادة التعاقد مع النظر في التوسّع"],
      change: ["A test showing low incremental effect, or cost per qualified lead drifting above benchmark.", "اختبار يُظهر أثراً إضافياً منخفضاً، أو ارتفاع تكلفة العميل المؤهل فوق المعيار."],
      next: ["Open renewal on current terms; agree a growth budget with capacity checks.", "فتح التجديد بالشروط الحالية والاتفاق على ميزانية نمو مع التحقق من الطاقة الاستيعابية."],
    },
    RENEGOTIATE: {
      headline: ["Renew, but renegotiate terms", "التجديد مع إعادة التفاوض على الشروط"],
      change: ["Confirmed incremental lift and a stable cost per lead would support renewing as-is; a weak test result would move this to a performance plan.", "أثر إضافي مؤكد وتكلفة مستقرة يدعمان التجديد كما هو؛ ونتيجة اختبار ضعيفة تنقله إلى خطة أداء."],
      next: ["Propose a performance-linked fee (part of the fee on CRM-qualified leads / signed contracts) and fix the open issues before signing.", "اقتراح أتعاب مرتبطة بالأداء (جزء منها على العملاء المؤهلين في النظام / العقود الموقعة) ومعالجة المسائل المفتوحة قبل التوقيع."],
    },
    PERFORMANCE_PLAN: {
      headline: ["Put on a 60-day performance plan", "وضع خطة أداء لمدة 60 يوماً"],
      change: ["Hitting the targets for two consecutive months moves this back to renegotiation; missing them moves it to a replacement test.", "تحقيق الأهداف لشهرين متتاليين يعيده إلى إعادة التفاوض؛ وعدم تحقيقها ينقله إلى اختبار بديل."],
      next: ["Send the plan with targets and a review date; run a bench RFP in parallel if no alternative exists.", "إرسال الخطة بالأهداف وموعد المراجعة؛ وطرح طلب عروض للبدائل بالتوازي إن لم يوجد بديل."],
    },
    TEST_REPLACEMENT: {
      headline: ["Test a replacement", "اختبار بديل"],
      change: ["The incumbent winning (or tying) a fair head-to-head trial, or a test proving its incremental effect.", "فوز المورد الحالي (أو تعادله) في تجربة عادلة، أو اختبار يُثبت أثره الإضافي."],
      next: ["Approve the proposed paid trial (or scale the winning challenger); keep the incumbent on a performance plan meanwhile.", "اعتماد التجربة المدفوعة المقترحة (أو توسيع المنافس الفائز)؛ مع إبقاء المورد الحالي على خطة أداء في الأثناء."],
    },
    EXIT: {
      headline: ["Exit at contract end", "الخروج عند انتهاء العقد"],
      change: ["A properly designed test showing a meaningful incremental effect at a cost within benchmark.", "اختبار مصمم جيداً يُظهر أثراً إضافياً ملموساً بتكلفة ضمن المعيار."],
      next: ["Do not renew. Run the replacement trial / RFP now so the transition is ready; involve legal for the notice.", "عدم التجديد. ابدأوا تجربة البديل / طلب العروض الآن ليكون الانتقال جاهزاً؛ مع إشراك الشؤون القانونية في الإشعار."],
    },
  };

  return {
    vendorId: x.vendor.id, vendor: x.vendor.name, category: x.vendor.category, decision, confidence,
    confidenceWhy: T(`Based on ${why.join(", ")}.`, `بناءً على ${why.join("، ")}.`),
    headline: T(D[decision].headline[0], D[decision].headline[1]),
    evidence, wouldChange: T(D[decision].change[0], D[decision].change[1]), targets,
    contractEnd: x.vendor.contractEnd, monthsToExpiry: x.vendor.monthsToExpiry, alternatives: x.bench, nextStep: T(D[decision].next[0], D[decision].next[1]),
  };
}

void K; void pct;
