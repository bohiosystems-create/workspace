import { prisma } from "./prisma";
import { buildMarketingDashboard } from "./marketing";
import { ensureOracleSynced, buildInvoiceDashboard } from "./invoices";
import { buildCrmDashboard, ensureCrmSynced } from "./crm";
import { type Lang, isLang, tx, K, M, nm, dt , an, ltr } from "./i18n";
import { deliverMail, defaultCc, outlookDelivery, outlookMode, outlookSender, outlookSenderName, outlookSenderNameAr } from "./outlook";

export type Rec = {
  key: string;
  type: "SLA_BREACH" | "CRM_MISMATCH" | "CONTRACT_RENEWAL" | "UNDERPERFORMING" | "INVOICE_EXCEPTIONS" | "UNBILLED" | "OVERDUE_PAYMENT" | "REALLOCATE" | "SCALE_UP";
  severity: "crit" | "warn" | "info";
  vendorId: string;
  vendor: string;
  title: string;
  rationale: string;
  evidence: string[]; // facts the email is allowed to cite
  impactK: number | null; // SAR K at stake, when quantifiable
  channel: "EMAIL" | "INTERNAL";
  href?: string; // where an INTERNAL decision is taken
  state: "OPEN" | "DRAFTED" | "SENT" | "DISMISSED";
  emailId: string | null;
};

export type EmailRow = {
  id: string; recKey: string; vendorId: string; vendor: string; to: string; cc: string; subject: string; body: string;
  drafter: string; revision: number; status: string; approvedBy: string | null; approvedAt: string | null;
  sentAt: string | null; delivery: string | null; error: string | null; createdAt: string;
};

const VERDICT_AR: Record<string, string> = { Scale: "توسّع", Hold: "إبقاء", Fix: "تصحيح", Review: "مراجعة" };
const sevRank = { crit: 0, warn: 1, info: 2 } as const;
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const k1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------ recommendations
export async function buildRecommendations(lang: Lang = "en") {
  await ensureOracleSynced();
  await ensureCrmSynced();
  const [mkt, inv, crm, vendors, states, emails] = await Promise.all([
    buildMarketingDashboard(lang),
    buildInvoiceDashboard(lang),
    buildCrmDashboard(lang),
    prisma.vendor.findMany(),
    prisma.recommendationState.findMany(),
    prisma.outboundEmail.findMany(),
  ]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  const recs: Omit<Rec, "state" | "emailId">[] = [];

  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (x: string) => nm(lang, x);

  // 1. Contractual SLA breaches → ask the vendor for a remediation plan.
  for (const v of mkt.vendors) {
    if (v.slaBreaches.length === 0) continue;
    const affected = mkt.campaigns.filter((c) => c.vendorId === v.id && c.status === "LIVE");
    recs.push({
      key: `SLA_BREACH:${v.id}:${hash(v.slaBreachCodes.join("|"))}`,
      type: "SLA_BREACH", severity: v.latestRespHrs !== null && v.latestRespHrs > v.slaResponseHrs * 1.5 ? "crit" : "warn",
      vendorId: v.id, vendor: v.name,
      title: T(`${v.name} is outside its contractual SLA`, `${N(v.name)} خارج اتفاقية مستوى الخدمة التعاقدية`),
      rationale: T(
        `${v.slaBreaches.join("; ")} (spend-weighted, latest month). Slow response and weak lead quality directly reduce viewings and reservations.`,
        `${v.slaBreaches.join("؛ ")} (مرجّح بالإنفاق، آخر شهر). بطء الاستجابة وضعف جودة العملاء المحتملين يقلّلان مباشرة عدد المعاينات والحجوزات.`),
      evidence: [
        ...v.slaBreaches.map((b) => T(`SLA: ${b}`, `اتفاقية الخدمة: ${b}`)),
        T(`Live campaigns affected: ${affected.map((c) => c.name).join("; ") || "none"}`, `الحملات النشطة المتأثرة: ${affected.map((c) => N(c.name)).join("؛ ") || "لا شيء"}`),
        T(`Scorecard: ${v.score}/100 (${v.verdict})`, `بطاقة التقييم: ${v.score}/100 (${VERDICT_AR[v.verdict] ?? v.verdict})`),
      ],
      impactK: k1(affected.reduce((s, c) => s + c.spendK, 0)),
      channel: "EMAIL",
    });
  }

  // 1b. Vendor-reported numbers that the CRM does not support.
  for (const v of crm.vendors) {
    if (v.flags.length === 0) continue;
    const crit = v.flags.some((f) => f.severity === "crit");
    recs.push({
      key: `CRM_MISMATCH:${v.id}:${hash(v.flags.map((f) => f.code).join("|"))}`,
      type: "CRM_MISMATCH", severity: crit ? "crit" : "warn", vendorId: v.id, vendor: v.vendor,
      title: T(`${v.vendor}: reported numbers do not match the CRM`, `${N(v.vendor)}: أرقام المورد لا تطابق نظام إدارة العملاء`),
      rationale: v.flags.map((f) => f.text).join(" "),
      evidence: [
        ...v.flags.map((f) => f.text),
        T(`CRM-verified cost-to-sales: ${v.verifiedCostToSalesPct ?? "n/a"}% (vendor-reported sales SAR ${v.reportedSalesM}M vs CRM SAR ${v.crmSalesM}M)`,
          `نسبة التكلفة إلى المبيعات المتحقَّق منها في النظام: ${v.verifiedCostToSalesPct ?? "غير متاحة"}% (مبيعات يُبلّغ بها المورد ${M(lang, v.reportedSalesM)} مقابل ${M(lang, v.crmSalesM)} في النظام)`),
      ],
      impactK: k1(v.spendK), channel: "EMAIL",
    });
  }

  // 2. Contracts expiring within 3 months → open the renewal conversation on our terms.
  for (const v of mkt.vendors) {
    if (v.monthsToExpiry > 3 || v.monthsToExpiry < 0) continue;
    const end = dt(lang, v.contractEnd, { day: "numeric", month: "long", year: "numeric" });
    recs.push({
      key: `CONTRACT_RENEWAL:${v.id}:${v.contractEnd.slice(0, 7)}`,
      type: "CONTRACT_RENEWAL", severity: v.verdict === "Review" ? "warn" : "info",
      vendorId: v.id, vendor: v.name,
      title: T(`${v.name} contract ends ${end}`, `ينتهي عقد ${N(v.name)} في ${end}`),
      rationale: T(
        `Scorecard ${v.score}/100 (${v.verdict}); cost-to-sales ${v.costToSalesPct ?? "n/a"}%, qualified rate ${v.qualRatePct ?? "n/a"}%. ${v.verdict === "Review" ? "Performance does not currently support a like-for-like renewal — negotiate performance-linked terms." : "Open renewal early to keep leverage."}`,
        `التقييم ${v.score}/100 (${VERDICT_AR[v.verdict] ?? v.verdict})؛ نسبة التكلفة إلى المبيعات ${v.costToSalesPct ?? "غير متاحة"}%، ونسبة المؤهلين ${v.qualRatePct ?? "غير متاحة"}%. ${v.verdict === "Review" ? "الأداء الحالي لا يبرّر التجديد بالشروط نفسها — فاوضوا على شروط مرتبطة بالأداء." : "افتحوا باب التجديد مبكراً للحفاظ على قوة التفاوض."}`),
      evidence: [
        T(`Contract end date: ${end}`, `تاريخ انتهاء العقد: ${end}`),
        T(`Spend to date: SAR ${v.spendK}K across ${v.campaigns} campaign(s); ${v.contracts} attributed contracts (SAR ${v.revenueM}M)`,
          `الإنفاق حتى تاريخه: ${K(lang, v.spendK)} عبر ${v.campaigns} حملة؛ ${an(v.contracts, "عقد واحد", "عقدان", "عقود", "عقداً")} منسوباً (${M(lang, v.revenueM)})`),
        T(`Cost-to-sales ${v.costToSalesPct ?? "n/a"}%; qualified-lead rate ${v.qualRatePct ?? "n/a"}%`,
          `نسبة التكلفة إلى المبيعات ${v.costToSalesPct ?? "غير متاحة"}%؛ نسبة العملاء المؤهلين ${v.qualRatePct ?? "غير متاحة"}%`),
      ],
      impactK: v.spendK, channel: "EMAIL",
    });
  }

  // 3. Campaigns converting badly → ask for an improvement plan.
  const weakByVendor = new Map<string, typeof mkt.campaigns>();
  for (const c of mkt.campaigns) {
    if (c.status !== "LIVE" || c.health !== "Weak" || c.attribution === "Weak") continue;
    weakByVendor.set(c.vendorId, [...(weakByVendor.get(c.vendorId) ?? []), c]);
  }
  for (const [vendorId, cs] of weakByVendor) {
    const vn = vName.get(vendorId)!;
    recs.push({
      key: `UNDERPERFORMING:${vendorId}:${hash(cs.map((c) => c.id).join("|"))}`,
      type: "UNDERPERFORMING", severity: "crit", vendorId, vendor: vn,
      title: T(`${cs.length} ${vn} campaign${cs.length > 1 ? "s" : ""} not converting into sales`, `حملات ${N(vn)} غير المحوِّلة إلى مبيعات (${cs.length})`),
      rationale: cs.map((c) => T(`${c.name}: ${c.costToSalesPct ?? "n/a"}% cost-to-sales, qualified rate ${c.qualRatePct ?? "n/a"}%`, `${N(c.name)}: نسبة التكلفة إلى المبيعات ${c.costToSalesPct ?? "غير متاحة"}%، نسبة المؤهلين ${c.qualRatePct ?? "غير متاحة"}%`)).join(T("; ", "؛ ")) + T(". Above the 3% ceiling.", ". أعلى من سقف 3%."),
      evidence: cs.flatMap((c) => [
        T(`${c.name}: SAR ${c.spendK}K spent → ${c.contracts} contracts (SAR ${c.revenueM}M); cost-to-sales ${c.costToSalesPct ?? "n/a"}%`,
          `${N(c.name)}: أُنفق ${K(lang, c.spendK)} ← ${c.contracts} عقوداً (${M(lang, c.revenueM)})؛ نسبة التكلفة إلى المبيعات ${c.costToSalesPct ?? "غير متاحة"}%`),
        T(`${c.name}: cost per lead SAR ${c.cplSar ?? "n/a"}${c.cplTrendPct ? ` (${c.cplTrendPct > 0 ? "+" : ""}${c.cplTrendPct}% latest month)` : ""}; qualified rate ${c.qualRatePct ?? "n/a"}%`,
          `${N(c.name)}: تكلفة العميل المحتمل ${c.cplSar ?? "غير متاحة"} ر.س${c.cplTrendPct ? ` (${c.cplTrendPct > 0 ? "+" : ""}${c.cplTrendPct}% في آخر شهر)` : ""}؛ نسبة المؤهلين ${c.qualRatePct ?? "غير متاحة"}%`),
      ]),
      impactK: k1(cs.reduce((s, c) => s + c.remainingK, 0)), channel: "EMAIL",
    });
  }

  // 4. Invoice exceptions → dispute / request credit note or clarification.
  const excByVendor = new Map<string, typeof inv.invoices>();
  for (const r of inv.invoices) {
    if (r.decision === "APPROVED") continue;
    if (!r.flags.some((f) => f.code !== "OVERDUE")) continue;
    if (r.outstandingK === 0 && !r.flags.some((f) => ["OVERBILLED", "VARIANCE", "DUPLICATE"].includes(f.code))) continue;
    excByVendor.set(r.vendorId, [...(excByVendor.get(r.vendorId) ?? []), r]);
  }
  for (const [vendorId, rs] of excByVendor) {
    const crit = rs.some((r) => r.blocked);
    const vn = vName.get(vendorId)!;
    const ftxt = (r: (typeof rs)[number]) => r.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ");
    recs.push({
      key: `INVOICE_EXCEPTIONS:${vendorId}:${hash(rs.map((r) => r.id).sort().join("|"))}`,
      type: "INVOICE_EXCEPTIONS", severity: crit ? "crit" : "warn", vendorId, vendor: vn,
      title: T(`${rs.length} ${vn} invoice${rs.length > 1 ? "s need" : " needs"} correction or clarification`, `فواتير ${N(vn)} التي تحتاج تصحيحاً أو توضيحاً (${rs.length})`),
      rationale: rs.map((r) => T(`${r.invoiceNumber} (SAR ${r.amountK}K): ${ftxt(r)}`, `${ltr(r.invoiceNumber)} (${K(lang, r.amountK)}): ${ftxt(r)}`)).join(" "),
      evidence: rs.map((r) => T(
        `Invoice ${r.invoiceNumber} dated ${r.invoiceDate.slice(0, 10)}, SAR ${r.amountK}K${r.poNumber ? `, PO ${r.poNumber}` : ", no PO"}: ${ftxt(r)}`,
        `الفاتورة ${ltr(r.invoiceNumber)} بتاريخ ${ltr(r.invoiceDate.slice(0, 10))}، ${K(lang, r.amountK)}${r.poNumber ? `، أمر الشراء ${ltr(r.poNumber)}` : "، بلا أمر شراء"}: ${ftxt(r)}`)),
      impactK: k1(rs.reduce((s, r) => s + r.amountK, 0)), channel: "EMAIL",
    });
  }

  // 5. Delivered but never invoiced → ask for the invoice (accrue meanwhile).
  const unbByVendor = new Map<string, typeof inv.unbilled>();
  for (const u of inv.unbilled) {
    const vid = vendors.find((v) => v.name === u.vendor)?.id;
    if (vid) unbByVendor.set(vid, [...(unbByVendor.get(vid) ?? []), u]);
  }
  for (const [vendorId, us] of unbByVendor) {
    const vn = vName.get(vendorId)!;
    recs.push({
      key: `UNBILLED:${vendorId}:${hash(us.map((u) => u.campaign + u.period).join("|"))}`,
      type: "UNBILLED", severity: "warn", vendorId, vendor: vn,
      title: T(`${vn} delivered but has not invoiced`, `${N(vn)} نفّذ ولم يُصدر فاتورة`),
      rationale: us.map((u) => `${N(u.campaign)} ${ltr(u.period)}: ${K(lang, u.deliveredK)}`).join(T("; ", "؛ ")) + T(". Accrue the cost and request the invoice.", ". تُحتسب التكلفة كمستحق وتُطلب الفاتورة."),
      evidence: us.map((u) => T(`${u.campaign}, ${u.period}: SAR ${u.deliveredK}K delivered, no invoice received`, `${N(u.campaign)}، ${ltr(u.period)}: ${K(lang, u.deliveredK)} منفّذة، ولم تُستلم فاتورة`)),
      impactK: k1(us.reduce((s, u) => s + u.deliveredK, 0)), channel: "EMAIL",
    });
  }

  // 6. We are paying late → internal decision (approve & schedule payment).
  for (const v of inv.vendors) {
    const late = inv.invoices.filter((r) => r.vendorId === v.id && r.daysOverdue > 0 && r.decision !== "DISPUTED" && !r.blocked);
    if (late.length === 0) continue;
    const amt = k1(late.reduce((s, r) => s + r.outstandingK, 0));
    recs.push({
      key: `OVERDUE_PAYMENT:${v.id}:${hash(late.map((r) => r.id).sort().join("|"))}`,
      type: "OVERDUE_PAYMENT", severity: late.some((r) => r.daysOverdue > 30) ? "crit" : "warn", vendorId: v.id, vendor: v.name,
      title: T(`SAR ${amt}K overdue to ${v.name}`, `${K(lang, amt)} متأخرة السداد إلى ${N(v.name)}`),
      rationale: T(
        `${late.length} clean invoice${late.length > 1 ? "s" : ""} past due (${Math.max(...late.map((r) => r.daysOverdue))} days at most). Late payment puts lead-response and delivery at risk.`,
        `${an(late.length, "فاتورة واحدة", "فاتورتان", "فواتير", "فاتورة")} سليمة تجاوزت الاستحقاق (حتى ${an(Math.max(...late.map((r) => r.daysOverdue)), "يوم واحد", "يومان", "أيام", "يوماً")}). التأخر في السداد يعرّض سرعة الاستجابة والتنفيذ للخطر.`),
      evidence: late.map((r) => T(`${r.invoiceNumber}: SAR ${r.outstandingK}K, ${r.daysOverdue} days overdue`, `${ltr(r.invoiceNumber)}: ${K(lang, r.outstandingK)}، متأخرة ${an(r.daysOverdue, "يوم واحد", "يومان", "أيام", "يوماً")}`)),
      impactK: amt, channel: "INTERNAL", href: "/invoices",
    });
  }

  // 7. Budget moves proposed by the marketing engine (decided internally).
  for (const r of mkt.recommendations) {
    const vendorId = mkt.campaigns.find((c) => c.id === r.campaignId)!.vendorId;
    recs.push({
      key: `REALLOCATE:${r.campaignId}:${r.type}:${"toCampaignId" in r ? r.toCampaignId : ""}`,
      type: "REALLOCATE", severity: r.type === "PAUSE" ? "crit" : "warn", vendorId, vendor: r.vendor,
      title: r.type === "PAUSE"
        ? T(`Pause ${r.campaign}`, `إيقاف ${N(r.campaign)}`)
        : T(`Move SAR ${r.amountK}K from ${r.campaign} to ${r.toCampaign}`, `نقل ${K(lang, r.amountK)} من ${N(r.campaign)} إلى ${N(r.toCampaign)}`),
      rationale: `${r.rationale} ${r.impact}`,
      evidence: [r.rationale, r.impact],
      impactK: r.type === "PAUSE" ? null : r.amountK, channel: "INTERNAL", href: "/",
    });
  }

  // 8. Best performer with headroom → consider scaling.
  const best = mkt.vendors.find((v) => v.verdict === "Scale");
  if (best) {
    recs.push({
      key: `SCALE_UP:${best.id}:${best.score}`,
      type: "SCALE_UP", severity: "info", vendorId: best.id, vendor: best.name,
      title: T(`${best.name} is the strongest converter — consider more budget`, `${N(best.name)} هو الأقوى تحويلاً — يُنظر في زيادة الميزانية`),
      rationale: T(
        `Scorecard ${best.score}/100, ${best.costToSalesPct ?? "n/a"}% cost-to-sales, ${best.qualRatePct ?? "n/a"}% qualified rate, no SLA breaches. Confirm capacity before increasing spend.`,
        `التقييم ${best.score}/100، نسبة التكلفة إلى المبيعات ${best.costToSalesPct ?? "غير متاحة"}%، نسبة المؤهلين ${best.qualRatePct ?? "غير متاحة"}%، بلا إخلال باتفاقية الخدمة. تأكدوا من الطاقة الاستيعابية قبل زيادة الإنفاق.`),
      evidence: [T(`Scorecard ${best.score}/100`, `التقييم ${best.score}/100`)], impactK: null, channel: "INTERNAL", href: "/",
    });
  }

  // Attach triage state.
  const dismissed = new Set(states.filter((s) => s.status === "DISMISSED").map((s) => s.key));
  const emailRows: EmailRow[] = emails
    .map((e) => ({
      id: e.id, recKey: e.recKey, vendorId: e.vendorId, vendor: vName.get(e.vendorId) ?? "", to: e.toAddress, cc: e.ccAddresses,
      subject: e.subject, body: e.body, drafter: e.drafter, revision: e.revision, status: e.status, approvedBy: e.approvedBy,
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null, sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      delivery: e.delivery, error: e.error, createdAt: e.createdAt.toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emailFor = (key: string) => emailRows.find((e) => e.recKey === key && e.status !== "REJECTED");

  const out: Rec[] = recs.map((r) => {
    const e = emailFor(r.key);
    const state: Rec["state"] = e ? (e.status === "SENT" ? "SENT" : "DRAFTED") : dismissed.has(r.key) ? "DISMISSED" : "OPEN";
    return { ...r, state, emailId: e?.id ?? null };
  });
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.impactK ?? 0) - (a.impactK ?? 0));

  return {
    recommendations: out,
    outbox: emailRows,
    integration: { mode: outlookMode(), delivery: outlookDelivery(), sender: outlookSender() },
  };
}

// ------------------------------------------------------------------ drafting
type Parts = { subject: string; intro: string; ask: string };
const OPENERS: Record<Rec["type"], (r: Rec, l: Lang) => Parts> = {
  SLA_BREACH: (r, l) => ({
    subject: tx(l, `Action required: service levels below contract — ${r.vendor}`, `إجراء مطلوب: مستويات الخدمة أقل من المتفق عليه — ${nm(l, r.vendor)}`),
    intro: tx(l, "Our latest monthly review shows performance below the service levels set out in our agreement:", "تُظهر مراجعتنا الشهرية الأخيرة أداءً أقل من مستويات الخدمة المنصوص عليها في اتفاقيتنا:"),
    ask: tx(l, "Please send us, within 5 business days, the root cause and a dated remediation plan, and confirm how response times and lead quality will be brought back within the contracted levels.",
      "نرجو إفادتنا خلال 5 أيام عمل بالسبب الجذري وبخطة تصحيحية مؤرخة، وتأكيد كيفية إعادة زمن الاستجابة وجودة العملاء المحتملين إلى المستويات المتعاقد عليها."),
  }),
  CRM_MISMATCH: (r, l) => ({
    subject: tx(l, `Lead reconciliation with our CRM — ${r.vendor}`, `مطابقة بيانات العملاء المحتملين مع نظام إدارة العملاء — ${nm(l, r.vendor)}`),
    intro: tx(l, "Reconciling your reports against our CRM records shows these differences:", "عند مطابقة تقاريركم مع سجلات نظام إدارة علاقات العملاء لدينا ظهرت الفروقات التالية:"),
    ask: tx(l, "Please send the raw lead lists (name / phone / created date) for the periods concerned, explain the differences (duplicates, filtering, late delivery) and your plan to close them. We will review the monthly scorecard in light of the outcome.",
      "نرجو إرسال قوائم العملاء المحتملين الخام (الاسم / الهاتف / تاريخ الإنشاء) للفترات المعنية، وتوضيح أسباب الفروقات (تكرار، تصفية، تأخر في التسليم)، وخطتكم لمعالجتها. وسنراجع التقييم الشهري في ضوء نتيجة المطابقة."),
  }),
  CONTRACT_RENEWAL: (r, l) => ({
    subject: tx(l, `Contract renewal discussion — ${r.vendor}`, `مناقشة تجديد العقد — ${nm(l, r.vendor)}`),
    intro: tx(l, "Ahead of your contract end date, we would like to review the partnership. Our current view of results:", "قبل تاريخ انتهاء عقدكم، نود مراجعة الشراكة. هذه قراءتنا الحالية للنتائج:"),
    ask: tx(l, "Could you propose a time this month for a review, and bring your recommendations for the next term — including how fees could be linked to qualified leads and contracted sales? This is an invitation to discuss and does not commit either side.",
      "هل يمكنكم اقتراح موعد خلال هذا الشهر للمراجعة، مع إحضار توصياتكم للمدة القادمة — بما في ذلك كيفية ربط الأتعاب بالعملاء المؤهلين والمبيعات المتعاقد عليها؟ هذه دعوة للنقاش ولا تُلزم أيّاً من الطرفين."),
  }),
  UNDERPERFORMING: (r, l) => ({
    subject: tx(l, `Campaign performance review — ${r.vendor}`, `مراجعة أداء الحملات — ${nm(l, r.vendor)}`),
    intro: tx(l, "The following campaigns are not converting into sales at an acceptable cost:", "الحملات التالية لا تتحول إلى مبيعات بتكلفة مقبولة:"),
    ask: tx(l, "Please share your diagnosis and a proposed optimisation plan (audience, creative, lead-qualification and follow-up) for each, with the results you expect over the next 30 days. We are reviewing budget allocation in parallel.",
      "نرجو مشاركتنا تشخيصكم وخطة تحسين مقترحة (الجمهور، المحتوى، تأهيل العملاء المحتملين والمتابعة) لكل حملة، مع النتائج المتوقعة خلال الثلاثين يوماً القادمة. ونراجع توزيع الميزانية بالتوازي."),
  }),
  INVOICE_EXCEPTIONS: (r, l) => ({
    subject: tx(l, `Invoice query — ${r.vendor} (${r.evidence.length} item${r.evidence.length > 1 ? "s" : ""})`, `استفسار عن فواتير — ${nm(l, r.vendor)} (${an(r.evidence.length, "بند واحد", "بندان", "بنود", "بنداً")})`),
    intro: tx(l, "Our accounts payable reconciliation of your invoices against reported delivery and our purchase orders found the items below:", "أظهرت مطابقة حسابات الدائنين لدينا لفواتيركم مع التنفيذ المُبلَّغ عنه وأوامر الشراء البنود التالية:"),
    ask: tx(l, "Please provide a corrected invoice or credit note, or supporting documentation for each item. Any of these invoices that are still unpaid cannot be approved for payment until this is resolved; your other invoices are unaffected.",
      "نرجو تزويدنا بفاتورة مصحّحة أو إشعار دائن، أو مستندات داعمة لكل بند. أي من هذه الفواتير لا يزال غير مسدّد لا يمكن اعتماده للدفع قبل معالجة ذلك؛ وفواتيركم الأخرى غير متأثرة."),
  }),
  UNBILLED: (r, l) => ({
    subject: tx(l, `Missing invoice(s) — ${r.vendor}`, `فواتير مفقودة — ${nm(l, r.vendor)}`),
    intro: tx(l, "Your campaign reports show delivery for the periods below, but we have not received a matching invoice:", "تُظهر تقارير حملاتكم تنفيذاً للفترات أدناه، ولم نستلم الفاتورة المقابلة:"),
    ask: tx(l, "Please submit the invoice(s), quoting the relevant purchase order number, so they can be processed within the agreed payment terms.",
      "نرجو إرسال الفاتورة (الفواتير) مع ذكر رقم أمر الشراء ذي الصلة ليتم إجراؤها ضمن شروط السداد المتفق عليها."),
  }),
  OVERDUE_PAYMENT: () => ({ subject: "", intro: "", ask: "" }),
  REALLOCATE: () => ({ subject: "", intro: "", ask: "" }),
  SCALE_UP: () => ({ subject: "", intro: "", ask: "" }),
};

export function templateEmail(r: Rec, contact: string, l: Lang = "en") {
  const o = OPENERS[r.type](r, l);
  const greeting = tx(l, `Dear ${contact.split(" ")[0]},`, `السادة / ${nm(l, r.vendor)} المحترمون،`);
  const body = [
    greeting, "", o.intro, "", ...r.evidence.map((e) => `  • ${e}`), "", o.ask, "",
    tx(l, "Thank you — happy to discuss by phone if easier.", "شاكرين لكم، ويسعدنا النقاش هاتفياً إن كان ذلك أيسر."), "",
    tx(l, "Kind regards,", "وتفضلوا بقبول فائق الاحترام،"), l === "ar" ? outlookSenderNameAr() : outlookSenderName(),
  ].join("\n");
  return { subject: o.subject, body };
}

export type Polish = (draft: { subject: string; body: string }, facts: string[]) => Promise<{ subject: string; body: string } | null>;

/** Creates a DRAFT (never sends). The email is written in `draftLang`, defaulting to the vendor's preferred language. */
export async function createDraft(key: string, polish?: Polish, ui: Lang = "en", draftLang?: Lang) {
  const vendors = await prisma.vendor.findMany();
  const cand = (await buildRecommendations(ui)).recommendations.find((r) => r.key === key);
  if (!cand) throw new Error(tx(ui, "Recommendation not found (the data may have changed — refresh).", "التوصية غير موجودة (ربما تغيّرت البيانات — حدّثوا الصفحة)."));
  const vendor = vendors.find((v) => v.id === cand.vendorId)!;
  const l: Lang = draftLang ?? (vendor.language === "ar" ? "ar" : "en");
  const rec = (await buildRecommendations(l)).recommendations.find((r) => r.key === key)!; // evidence in the email's language
  if (rec.channel !== "EMAIL") throw new Error(tx(ui, "This recommendation is an internal decision, not an email.", "هذه التوصية قرار داخلي وليست رسالة بريد."));
  if (rec.state === "SENT") throw new Error(tx(ui, "An email for this recommendation has already been sent.", "سبق إرسال رسالة لهذه التوصية."));
  if (rec.emailId) throw new Error(tx(ui, "A draft already exists for this recommendation.", "توجد مسودة لهذه التوصية بالفعل."));
  if (!vendor.email) throw new Error(tx(ui, `No email address on file for ${vendor.name}.`, `لا يوجد عنوان بريد مسجّل للمورد ${nm(ui, vendor.name)}.`));

  let draft = templateEmail(rec, vendor.contact, l);
  let drafter = "template";
  if (polish) {
    try {
      const p = await polish(draft, rec.evidence);
      if (p && p.subject.trim() && p.body.trim()) { draft = p; drafter = "claude"; }
    } catch { /* fall back to the template */ }
  }
  await prisma.outboundEmail.create({
    data: {
      recKey: key, vendorId: vendor.id, toAddress: vendor.email, ccAddresses: defaultCc().join(", "),
      subject: draft.subject, body: draft.body, drafter, status: "DRAFT", revision: 1,
    },
  });
}

// ------------------------------------------------------------ human approval
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const parseCc = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

async function getEmail(id: string, l: Lang) {
  const e = (await prisma.outboundEmail.findMany()).find((x) => x.id === id);
  if (!e) throw new Error(tx(l, "Email not found.", "الرسالة غير موجودة."));
  return e;
}

export async function updateDraft(a: { id: string; subject: string; body: string; cc: string }, l: Lang = "en") {
  const e = await getEmail(a.id, l);
  if (e.status === "SENT" || e.status === "REJECTED") throw new Error(tx(l, `A ${e.status.toLowerCase()} email cannot be edited.`, "لا يمكن تعديل رسالة مرسلة أو مرفوضة."));
  const cc = parseCc(a.cc);
  if (cc.some((c) => !EMAIL_RE.test(c))) throw new Error(tx(l, "One of the cc addresses is not valid.", "أحد عناوين النسخة (cc) غير صالح."));
  if (!a.subject.trim() || !a.body.trim()) throw new Error(tx(l, "Subject and body are required.", "الموضوع والنص مطلوبان."));
  await prisma.outboundEmail.update({
    where: { id: e.id },
    data: { subject: a.subject.trim(), body: a.body, ccAddresses: cc.join(", "), revision: e.revision + 1, status: "DRAFT", error: null },
  });
}

// The only path that sends. Requires a named approver and the exact revision they reviewed.
export async function approveAndSend(a: { id: string; approver: string; revision: number }, l: Lang = "en") {
  const e = await getEmail(a.id, l);
  const approver = a.approver?.trim();
  if (!approver) throw new Error(tx(l, "Approver name is required.", "اسم المعتمِد مطلوب."));
  if (e.status === "SENT") throw new Error(tx(l, "This email has already been sent.", "تم إرسال هذه الرسالة بالفعل."));
  if (e.status === "REJECTED") throw new Error(tx(l, "This draft was rejected.", "تم رفض هذه المسودة."));
  if (e.revision !== a.revision) throw new Error(tx(l, "The draft changed since you reviewed it — review the latest version and approve again.", "تغيّرت المسودة منذ مراجعتكم لها — راجعوا النسخة الأحدث واعتمدوها من جديد."));
  if (/\[\[|\]\]/.test(e.body + e.subject)) throw new Error(tx(l, "The draft still contains a placeholder.", "ما زالت المسودة تحتوي على عنصر نائب."));
  const already = (await prisma.outboundEmail.findMany()).find((x) => x.recKey === e.recKey && x.status === "SENT");
  if (already) throw new Error(tx(l, "An email for this recommendation has already been sent.", "سبق إرسال رسالة لهذه التوصية."));

  try {
    const res = await deliverMail({ to: e.toAddress, cc: parseCc(e.ccAddresses), subject: e.subject, body: e.body });
    const now = new Date();
    await prisma.outboundEmail.update({
      where: { id: e.id },
      data: { status: "SENT", approvedBy: approver, approvedAt: now, sentAt: now, delivery: res.delivery, providerRef: res.providerRef, error: null },
    });
    const vname = (await prisma.vendor.findMany()).find((v) => v.id === e.vendorId)?.name ?? "";
    await prisma.marketingAction.create({
      data: {
        type: "EMAIL_SENT", campaign: `${nm(l, vname)} · ${e.subject}`,
        detail: res.delivery === "mock"
          ? tx(l, `Simulated send to ${e.toAddress}; approved by ${approver}.`, `إرسال تجريبي إلى ${e.toAddress}؛ اعتمده ${approver}.`)
          : res.delivery === "draft"
            ? tx(l, `Saved to Outlook drafts for ${e.toAddress}; approved by ${approver}.`, `حُفظت في مسودات Outlook إلى ${e.toAddress}؛ اعتمدها ${approver}.`)
            : tx(l, `Sent to ${e.toAddress}; approved by ${approver}.`, `أُرسلت إلى ${e.toAddress}؛ اعتمدها ${approver}.`),
      },
    });
  } catch (err: any) {
    await prisma.outboundEmail.update({ where: { id: e.id }, data: { status: "FAILED", error: err?.message ?? "Send failed." } });
    throw new Error(tx(l, `Not sent: ${err?.message ?? "delivery failed"}. The draft is kept — you can retry.`, `لم تُرسل: ${err?.message ?? "فشل التسليم"}. المسودة محفوظة — يمكنكم المحاولة مجدداً.`));
  }
}

export async function rejectDraft(id: string, approver: string, l: Lang = "en") {
  const e = await getEmail(id, l);
  if (e.status === "SENT") throw new Error(tx(l, "This email has already been sent.", "تم إرسال هذه الرسالة بالفعل."));
  await prisma.outboundEmail.update({ where: { id }, data: { status: "REJECTED", approvedBy: approver?.trim() || null } });
}

export async function setDismissed(key: string, dismissed: boolean) {
  const ex = (await prisma.recommendationState.findMany()).find((s) => s.key === key);
  if (dismissed) {
    if (ex) await prisma.recommendationState.update({ where: { key }, data: { status: "DISMISSED" } });
    else await prisma.recommendationState.create({ data: { key, status: "DISMISSED" } });
  } else if (ex) {
    await prisma.recommendationState.delete({ where: { key } });
  }
}

// Shared request handler (used by the API route and the static demo).
export async function handleRecommendationRequest(b: any, polish?: Polish) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "DRAFT": return createDraft(String(b.key), polish, l, isLang(b.draftLang) ? b.draftLang : undefined);
    case "UPDATE": return updateDraft({ id: String(b.id), subject: String(b.subject ?? ""), body: String(b.body ?? ""), cc: String(b.cc ?? "") }, l);
    case "APPROVE_SEND": return approveAndSend({ id: String(b.id), approver: String(b.approver ?? ""), revision: Number(b.revision) }, l);
    case "REJECT": return rejectDraft(String(b.id), String(b.approver ?? ""), l);
    case "DISMISS": return setDismissed(String(b.key), true);
    case "RESTORE": return setDismissed(String(b.key), false);
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
}
