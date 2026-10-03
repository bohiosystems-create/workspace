import { prisma } from "./prisma";
import { buildAgent, type Agent } from "./agent";
import { powerHoldout, powerGeo } from "./stats";
import { isDigital } from "./adaccounts";
import { metaRecommendations } from "./meta";
import { type Lang, isLang, tx, K, M, nm, dt , an, ltr } from "./i18n";
import { deliverMail, defaultCc, outlookDelivery, outlookMode, outlookSender, outlookSenderName, outlookSenderNameAr } from "./outlook";

export type Rec = {
  key: string;
  type: "RENEWAL" | "SLA_BREACH" | "CRM_MISMATCH" | "DATA_MISMATCH" | "UNDERPERFORMING" | "INVOICE_EXCEPTIONS" | "UNBILLED" | "OVERDUE_PAYMENT" | "TEST_INCREMENTALITY" | "TRIAL" | "REALLOCATE" | "SCALE_UP" | "META_UNKNOWN_AGENCY" | "META_CONFLICT" | "META_NO_UTM";
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
  meta?: { decision?: string };
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
export async function buildRecommendations(lang: Lang = "en", pre?: Agent) {
  const agent = pre ?? (await buildAgent(lang));
  const { mkt, inv, crm } = agent;
  const [vendors, states, emails] = await Promise.all([
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

  // 0. Renewal decision per vendor (re-engage / renegotiate / performance plan / test replacement / exit).
  const DEC_SEV: Record<string, Rec["severity"]> = { EXIT: "crit", TEST_REPLACEMENT: "crit", PERFORMANCE_PLAN: "warn", RENEGOTIATE: "warn", RE_ENGAGE: "info" };
  const CONF: Record<string, string> = { High: T("high", "عالية"), Medium: T("medium", "متوسطة"), Low: T("low", "منخفضة") };
  for (const d of agent.decisions) {
    if (d.decision === "RE_ENGAGE" && d.monthsToExpiry > 6) continue;
    const score = agent.scores.find((x) => x.vendorId === d.vendorId)!;
    const weakest = [...score.metrics].sort((a, b) => a.points - b.points).slice(0, 2);
    const mv = mkt.vendors.find((v) => v.id === d.vendorId);
    const MN: Record<string, [string, string]> = { cpql: ["Cost per CRM-qualified lead", "تكلفة العميل المؤهل في النظام"], value: ["Revenue and pipeline per SAR", "الإيرادات وخط المبيعات لكل ريال"], plan: ["Spend vs plan (deviation)", "الإنفاق مقابل الخطة (الانحراف)"], deadlines: ["Deliverables on time", "التسليمات في الموعد"], revisions: ["Revisions per deliverable", "المراجعات لكل تسليم"] };
    // Vendor-facing facts only: no bench names, rankings or internal confidence.
    const vendorFacing = [
      ...weakest.map((m) => {
        const u = (x: number | null) => `${x ?? "—"}${m.unit === "%" ? "%" : m.unit === "SAR" ? T(" SAR", " ر.س") : ""}`;
        return T(`${MN[m.key][0]}: ${u(m.actual)} (channel benchmark ${u(m.benchmark)})`, `${MN[m.key][1]}: ${u(m.actual)} (معيار القناة ${u(m.benchmark)})`);
      }),
      ...(mv?.slaBreaches ?? []).map((b) => T(`SLA: ${b}`, `اتفاقية الخدمة: ${b}`)),
      ...(crm.vendors.find((v) => v.id === d.vendorId)?.flags.map((f) => f.text) ?? []),
      ...d.targets.map((t) => T(`Target: ${t}`, `المستهدف: ${t}`)),
    ];
    recs.push({
      key: `RENEWAL:${d.vendorId}:${d.decision}`, type: "RENEWAL", severity: DEC_SEV[d.decision], vendorId: d.vendorId, vendor: d.vendor,
      title: `${N(d.vendor)}: ${d.headline}`,
      rationale: T(`${CONF[d.confidence]} confidence — ${d.confidenceWhy} `, `ثقة ${CONF[d.confidence]} — ${d.confidenceWhy} `) + d.evidence.slice(0, 3).join(" ") + " " + d.nextStep,
      evidence: vendorFacing, impactK: k1(score.costK),
      channel: ["RENEGOTIATE", "PERFORMANCE_PLAN", "RE_ENGAGE"].includes(d.decision) ? "EMAIL" : "INTERNAL",
      href: d.decision === "TEST_REPLACEMENT" ? "/decisions#trials" : "/decisions", meta: { decision: d.decision },
    });
  }

  // 0b. Prove incrementality where it is unknown and the money is material.
  const running = await prisma.experiment.findMany();
  for (const s0 of agent.scores) {
    if (s0.incrementalEvidence === "TEST" || s0.costK < 200) continue;
    if (running.some((e) => e.vendorId === s0.vendorId && e.status !== "COMPLETED")) continue;
    const vcs = agent.unified.campaigns.filter((c) => c.vendorId === s0.vendorId);
    const digital = vcs.some((c) => c.digital);
    const weeklyQ = Math.max(1, Math.round(s0.qualified / 21.6));
    const mde = digital ? powerHoldout(weeklyQ, 20, 6) : powerGeo(Math.max(1, Math.round(vcs.reduce((t, c) => t + c.verified.leads, 0) / 21.6 / 2)), 0.1, 6);
    const inc = agent.incrementality.perVendor.find((x) => x.vendorId === s0.vendorId);
    recs.push({
      key: `TEST_INCREMENTALITY:${s0.vendorId}`, type: "TEST_INCREMENTALITY", severity: s0.costK >= 400 ? "warn" : "info", vendorId: s0.vendorId, vendor: s0.vendor,
      title: T(`Prove ${s0.vendor}'s incremental effect`, `إثبات الأثر الإضافي لـ${N(s0.vendor)}`),
      rationale: T(
        `${K(lang, s0.costK)} spent with ${inc?.evidence === "MMM" ? "only media-mix evidence" : "no incrementality evidence"}. Suggested: ${digital ? "6-week audience holdout (20%)" : "6-week geo test"} — detects a lift of about ${mde ?? "—"}% or more.`,
        `أُنفق ${K(lang, s0.costK)} ${inc?.evidence === "MMM" ? "بأدلة من نموذج مزيج الإعلام فقط" : "دون أدلة على الأثر الإضافي"}. المقترح: ${digital ? "مجموعة مستبعدة من الجمهور (20%) لمدة 6 أسابيع" : "اختبار جغرافي لمدة 6 أسابيع"} — يرصد أثراً بنحو ${mde ?? "—"}% أو أكثر.`),
      evidence: [inc?.text ?? ""], impactK: k1(s0.costK), channel: "INTERNAL", href: "/experiments",
    });
  }

  // 0c. Trials: approvals to give and results to act on.
  for (const t of agent.bench.trials) {
    if (t.status === "PROPOSED") recs.push({
      key: `TRIAL:${t.id}:PROPOSED`, type: "TRIAL", severity: "warn", vendorId: t.incumbentId, vendor: t.incumbent,
      title: T(`Approve trial: ${t.challenger} vs ${t.incumbent}`, `اعتماد تجربة: ${N(t.challenger)} مقابل ${N(t.incumbent)}`),
      rationale: t.brief, evidence: [t.brief], impactK: t.budgetK, channel: "INTERNAL", href: "/decisions#trials",
    });
    if (t.status === "COMPLETED" && !t.decision && t.readout) recs.push({
      key: `TRIAL:${t.id}:RESULT`, type: "TRIAL", severity: t.readout.outcome === "PROMOTE" ? "crit" : "info", vendorId: t.incumbentId, vendor: t.incumbent,
      title: t.readout.outcome === "PROMOTE"
        ? T(`${t.challenger} beat ${t.incumbent} — decide on promotion`, `تفوّق ${N(t.challenger)} على ${N(t.incumbent)} — قرّروا الترقية`)
        : T(`Trial ${t.challenger} vs ${t.incumbent} — decide`, `تجربة ${N(t.challenger)} مقابل ${N(t.incumbent)} — اتخذوا القرار`),
      rationale: T(`Challenger delivered ${t.readout.qlRatio ?? "—"}× the CRM-qualified leads per SAR (90% range ${t.readout.qlLow ?? "—"}–${t.readout.qlHigh ?? "—"}); cost per qualified lead SAR ${t.readout.challengerCpql ?? "—"} vs ${t.readout.incumbentCpql ?? "—"}.`,
        `حقق المنافس ${t.readout.qlRatio ?? "—"}× العملاء المؤهلين لكل ريال (النطاق عند ثقة 90%: ${t.readout.qlLow ?? "—"}–${t.readout.qlHigh ?? "—"})؛ تكلفة العميل المؤهل ${t.readout.challengerCpql ?? "—"} مقابل ${t.readout.incumbentCpql ?? "—"} ر.س.`),
      evidence: [], impactK: t.budgetK, channel: "INTERNAL", href: "/decisions#trials",
    });
  }

  // 0d. Reported media spend that the ad platforms do not support.
  for (const v of agent.unified.vendors) for (const f of v.flags.filter((x) => x.code === "MEDIA_GAP")) {
    recs.push({
      key: `DATA_MISMATCH:${v.id}:${hash(f.text.replace(/\D/g, ""))}`, type: "DATA_MISMATCH", severity: f.severity, vendorId: v.id, vendor: v.name,
      title: T(`${v.name}: reported media spend not matched by the ad platforms`, `${N(v.name)}: الإنفاق الإعلامي المُبلَّغ لا تؤكده المنصات الإعلانية`),
      rationale: f.text,
      evidence: [f.text, ...agent.unified.campaigns.filter((c) => c.vendorId === v.id && c.platform).map((c) => T(`${c.name}: reported SAR ${c.reported.spendK}K, ad platforms SAR ${c.platform!.spendK}K`, `${N(c.name)}: المُبلَّغ ${K(lang, c.reported.spendK)}، المنصات الإعلانية ${K(lang, c.platform!.spendK)}`))],
      impactK: k1((v.digitalReportedSpendK ?? 0) - (v.platformSpendK ?? 0)), channel: "EMAIL",
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
      impactK: amt, channel: "INTERNAL", href: "/orchestration#invoices",
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
      impactK: r.type === "PAUSE" ? null : r.amountK, channel: "INTERNAL", href: "/campaigns",
    });
  }

  // 8. Best performer with headroom → consider scaling.
  const best = mkt.vendors.find((v) => v.verdict === "Scale");
  // Only suggest scaling when the fair-score renewal decision agrees.
  if (best && agent.decisions.find((d) => d.vendorId === best.id)?.decision === "RE_ENGAGE") {
    recs.push({
      key: `SCALE_UP:${best.id}:${best.score}`,
      type: "SCALE_UP", severity: "info", vendorId: best.id, vendor: best.name,
      title: T(`${best.name} is the strongest converter — consider more budget`, `${N(best.name)} هو الأقوى تحويلاً — يُنظر في زيادة الميزانية`),
      rationale: T(
        `Scorecard ${best.score}/100, ${best.costToSalesPct ?? "n/a"}% cost-to-sales, ${best.qualRatePct ?? "n/a"}% qualified rate, no SLA breaches. Confirm capacity before increasing spend.`,
        `التقييم ${best.score}/100، نسبة التكلفة إلى المبيعات ${best.costToSalesPct ?? "غير متاحة"}%، نسبة المؤهلين ${best.qualRatePct ?? "غير متاحة"}%، بلا إخلال باتفاقية الخدمة. تأكدوا من الطاقة الاستيعابية قبل زيادة الإنفاق.`),
      evidence: [T(`Scorecard ${best.score}/100`, `التقييم ${best.score}/100`)], impactK: null, channel: "INTERNAL", href: "/campaigns",
    });
  }

  // Meta: who runs which campaign — unknown agencies, conflicting evidence, campaigns without tracking codes.
  recs.push(...(await metaRecommendations(lang)));

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
  RENEWAL: (r, l) => {
    const due = dt(l, new Date(new Date("2026-06-08").getTime() + 10 * 86_400_000));
    const review = dt(l, new Date(new Date("2026-06-08").getTime() + 60 * 86_400_000));
    const d = r.meta?.decision;
    if (d === "PERFORMANCE_PLAN") return {
      subject: tx(l, `60-day performance plan — ${r.vendor}`, `خطة أداء لمدة 60 يوماً — ${nm(l, r.vendor)}`),
      intro: tx(l, "Our review of results on verified data (CRM, ad platforms and invoices) shows performance below where we need it:", "تُظهر مراجعتنا للنتائج على البيانات المتحقَّق منها (نظام إدارة العملاء، المنصات الإعلانية، الفواتير) أداءً أقل مما نحتاجه:"),
      ask: tx(l, `We are putting the account on a 60-day performance plan with the targets above, reviewed on ${review}. Please confirm the plan and the actions you will take within 5 business days.`, `سنضع الحساب على خطة أداء لمدة 60 يوماً بالأهداف المذكورة أعلاه، وتُراجع في ${review}. نرجو تأكيد الخطة والإجراءات التي ستتخذونها خلال 5 أيام عمل.`),
    };
    if (d === "RE_ENGAGE") return {
      subject: tx(l, `Renewal and growth plan — ${r.vendor}`, `التجديد وخطة النمو — ${nm(l, r.vendor)}`),
      intro: tx(l, "Your results on our verified data are strong:", "نتائجكم على بياناتنا المتحقَّق منها قوية:"),
      ask: tx(l, "We would like to renew and discuss a growth budget. Could you propose a plan, including the capacity you can add while holding cost per qualified lead?", "نرغب في التجديد ومناقشة ميزانية نمو. هل يمكنكم اقتراح خطة، تشمل الطاقة الإضافية الممكنة مع الحفاظ على تكلفة العميل المؤهل؟"),
    };
    return {
      subject: tx(l, `Partnership review and next term — ${r.vendor}`, `مراجعة الشراكة والمدة القادمة — ${nm(l, r.vendor)}`),
      intro: tx(l, "Ahead of the next term we have reviewed results on our verified data (CRM, ad platforms and invoices):", "قبل المدة القادمة راجعنا النتائج على بياناتنا المتحقَّق منها (نظام إدارة العملاء، المنصات الإعلانية، الفواتير):"),
      ask: tx(l, `We would like to continue on performance-linked terms: a fixed base plus a variable part tied to CRM-qualified leads or signed contracts, and the targets above. Could you send a proposal by ${due}? This is a basis for discussion and does not commit either side.`, `نرغب في الاستمرار بشروط مرتبطة بالأداء: أساس ثابت وجزء متغيّر مرتبط بالعملاء المؤهلين في النظام أو العقود الموقعة، مع الأهداف المذكورة أعلاه. هل يمكنكم إرسال عرض قبل ${due}؟ هذا أساس للنقاش ولا يُلزم أيّاً من الطرفين.`),
    };
  },
  DATA_MISMATCH: (r, l) => ({
    subject: tx(l, `Media spend reconciliation — ${r.vendor}`, `مطابقة الإنفاق الإعلامي — ${nm(l, r.vendor)}`),
    intro: tx(l, "Comparing your reported media spend with our ad-account data shows a difference:", "تُظهر مقارنة الإنفاق الإعلامي الذي أبلغتم عنه مع بيانات حساباتنا الإعلانية فرقاً:"),
    ask: tx(l, "Please send the platform invoices or account exports for the period and a breakdown of any fees, so we can reconcile within 10 business days.", "نرجو إرسال فواتير المنصات أو بيانات الحسابات للفترة المعنية مع تفصيل أي رسوم، لنتمكن من المطابقة خلال 10 أيام عمل."),
  }),
  TEST_INCREMENTALITY: () => ({ subject: "", intro: "", ask: "" }),
  META_UNKNOWN_AGENCY: () => ({ subject: "", intro: "", ask: "" }),
  META_CONFLICT: () => ({ subject: "", intro: "", ask: "" }),
  META_NO_UTM: (r, l) => ({
    subject: tx(l, `Tracking codes on a Meta campaign — ${r.vendor}`, `رموز التتبع في حملة ميتا — ${nm(l, r.vendor)}`),
    intro: tx(l, "One of the Meta campaigns you run for us has no campaign code on its ads, so the leads it brings cannot be credited to you in our CRM:", "إحدى حملات ميتا التي تديرونها لنا لا تحمل رمز الحملة على إعلاناتها، لذا لا يمكن نسب العملاء الذين تجلبهم إليكم في نظامنا:"),
    ask: tx(l, "Please add utm_campaign with our campaign code to every ad in this campaign, and start each campaign name with its code (e.g. \"CODE | …\"), within 3 business days. Leads that arrive without a code cannot count towards your results.", "نرجو إضافة utm_campaign برمز حملتنا إلى كل إعلان في هذه الحملة، وبدء اسم كل حملة برمزها (مثل «الرمز | …») خلال 3 أيام عمل. العملاء الذين يصلون دون رمز لا يُحتسبون ضمن نتائجكم."),
  }),
  TRIAL: () => ({ subject: "", intro: "", ask: "" }),
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

/** A draft not tied to a recommendation (QBR cover note, RFP to bench vendors). Returns false if one exists. */
export async function createCustomDraft(d: { vendorId: string; recKey: string; subject: string; body: string }, ui: Lang = "en") {
  const v = (await prisma.vendor.findMany()).find((x) => x.id === d.vendorId);
  if (!v?.email) throw new Error(tx(ui, `No email address on file for ${v?.name ?? "this vendor"}.`, `لا يوجد عنوان بريد مسجّل للمورد ${nm(ui, v?.name ?? "")}.`));
  const existing = (await prisma.outboundEmail.findMany()).find((e) => e.recKey === d.recKey && (e.status === "DRAFT" || e.status === "SENT" || e.status === "FAILED"));
  if (existing) return false;
  await prisma.outboundEmail.create({ data: { recKey: d.recKey, vendorId: v.id, toAddress: v.email, ccAddresses: defaultCc().join(", "), subject: d.subject, body: d.body, drafter: "template", status: "DRAFT", revision: 1 } });
  return true;
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
