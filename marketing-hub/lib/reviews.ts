// Vendor reviews: quarterly business review (QBR) per vendor, and a replacement brief / RFP.
// Both are generated deterministically from the agent's data, in English or Arabic.
import { prisma } from "./prisma";
import type { Agent } from "./agent";
import { WEIGHTS } from "./scoring";
import { createCustomDraft } from "./recommendations";
import { type Lang, tx, K, M, nm, dt, an } from "./i18n";

const TODAY = new Date("2026-06-08");
const r1 = (x: number) => Math.round(x * 10) / 10;
export const QUARTERS = [{ id: "2026-Q1", months: ["2026-01", "2026-02", "2026-03"] }, { id: "2026-Q2", months: ["2026-04", "2026-05", "2026-06"] }];
const qLabel = (id: string, l: Lang) => tx(l, id === "2026-Q2" ? "Q2 2026 (to date)" : "Q1 2026", id === "2026-Q2" ? "الربع الثاني 2026 (حتى تاريخه)" : "الربع الأول 2026");

export type QbrRow = { metric: string; current: string; previous: string; benchmark: string; better: boolean | null };
export type Qbr = {
  vendor: string; quarter: string; quarterLabel: string; generated: string; summary: string[]; kpis: QbrRow[];
  deliverables: { count: number; onTimePct: number | null; avgRevisions: number | null; late: string[] };
  verification: string[]; incrementality: string; billing: { invoicedK: number; issues: string[] };
  decision: { headline: string; confidence: string; nextStep: string }; asks: string[];
};

export async function buildQbr(agent: Agent, vendorId: string, quarter: string, l: Lang): Promise<Qbr> {
  const T = (en: string, ar: string) => tx(l, en, ar);
  const v = agent.unified.vendors.find((x) => x.id === vendorId);
  if (!v) throw new Error(T("Vendor not found.", "المورد غير موجود."));
  const qi = Math.max(0, QUARTERS.findIndex((q) => q.id === quarter));
  const Q = QUARTERS[qi], P = qi > 0 ? QUARTERS[qi - 1] : null;
  const cs = agent.unified.campaigns.filter((c) => c.vendorId === vendorId);
  const campaigns = await prisma.campaign.findMany({ include: { months: true } });
  const agg = (months: string[] | undefined) => {
    if (!months) return null;
    const ms = cs.flatMap((c) => c.months).filter((m) => months.includes(m.month));
    const rep = campaigns.filter((c) => c.vendorId === vendorId).flatMap((c) => c.months).filter((m) => months.includes(m.month));
    const cost = ms.reduce((s, m) => s + m.costK, 0), q = ms.reduce((s, m) => s + m.qualified, 0), w = ms.reduce((s, m) => s + m.won, 0), sales = ms.reduce((s, m) => s + m.salesM, 0);
    return { cost: r1(cost), q, w, sales: r1(sales), cpql: q ? Math.round((cost * 1000) / q) : null, cpw: w ? r1(cost / w) : null, repLeads: rep.reduce((s, m) => s + m.leads, 0), repSpend: r1(rep.reduce((s, m) => s + m.spendK, 0)) };
  };
  const cur = agg(Q.months)!, prev = agg(P?.months);
  const score = agent.scores.find((s) => s.vendorId === vendorId)!;
  const bench = score.metrics.find((m) => m.key === "cpql")!.benchmark;
  const dec = agent.decisions.find((d) => d.vendorId === vendorId)!;
  const fmt = (x: number | null, f: (n: number) => string) => (x === null ? "—" : f(x));
  const kpis: QbrRow[] = [
    { metric: T("Cost (invoiced + accrued)", "التكلفة (مفوترة + مستحقة)"), current: K(l, cur.cost), previous: prev ? K(l, prev.cost) : "—", benchmark: "—", better: null },
    { metric: T("Leads reported by vendor", "العملاء المحتملون حسب المورد"), current: String(cur.repLeads), previous: prev ? String(prev.repLeads) : "—", benchmark: "—", better: null },
    { metric: T("CRM-qualified leads", "العملاء المؤهلون في النظام"), current: String(cur.q), previous: prev ? String(prev.q) : "—", benchmark: "—", better: prev ? cur.q >= prev.q : null },
    { metric: T("Cost per qualified lead", "تكلفة العميل المؤهل"), current: fmt(cur.cpql, (n) => `${n} ${T("SAR", "ر.س")}`), previous: prev ? fmt(prev.cpql, (n) => `${n} ${T("SAR", "ر.س")}`) : "—", benchmark: bench ? `${bench} ${T("SAR", "ر.س")}` : "—", better: cur.cpql !== null && bench ? cur.cpql <= bench : null },
    { metric: T("Deals won (CRM)", "الصفقات المغلقة (النظام)"), current: String(cur.w), previous: prev ? String(prev.w) : "—", benchmark: "—", better: prev ? cur.w >= prev.w : null },
    { metric: T("Cost per deal won", "تكلفة الصفقة المغلقة"), current: fmt(cur.cpw, (n) => K(l, n)), previous: prev ? fmt(prev.cpw, (n) => K(l, n)) : "—", benchmark: "—", better: prev && cur.cpw !== null && prev.cpw !== null ? cur.cpw <= prev.cpw : null },
    { metric: T("Sales won (CRM)", "المبيعات المغلقة (النظام)"), current: M(l, cur.sales), previous: prev ? M(l, prev.sales) : "—", benchmark: "—", better: prev ? cur.sales >= prev.sales : null },
  ];

  const qStart = new Date(`${Q.months[0]}-01`), qEnd = new Date(Date.UTC(Number(Q.months[2].slice(0, 4)), Number(Q.months[2].slice(5)), 1));
  const ds = (await prisma.deliverable.findMany()).filter((d) => d.vendorId === vendorId && d.dueDate >= qStart && d.dueDate < qEnd && d.deliveredAt);
  const late = ds.filter((d) => d.deliveredAt! > new Date(d.dueDate.getTime() + 86_400_000));
  const inv = agent.inv.invoices.filter((i) => i.vendorId === vendorId && i.period && Q.months.includes(i.period));
  const issues = inv.flatMap((i) => i.flags.filter((f) => f.code !== "OVERDUE").map((f) => `${i.invoiceNumber}: ${f.text}`));
  const crmV = agent.crm.vendors.find((x) => x.id === vendorId);
  const inc = agent.incrementality.perVendor.find((x) => x.vendorId === vendorId);

  const summary = [
    T(`Fair score ${score.score}/100 (range ${score.low}–${score.high}), rank ${score.rank} of ${agent.scores.length}; 50 = channel benchmark.`, `التقييم العادل ${score.score}/100 (النطاق ${score.low}–${score.high})، الترتيب ${score.rank} من ${agent.scores.length}؛ 50 = معيار القناة.`),
    T(`${K(l, cur.cost)} cost produced ${cur.q} CRM-qualified leads and ${cur.w} won deals worth ${M(l, cur.sales)}.`, `أنتجت تكلفة ${K(l, cur.cost)} ${an(cur.q, "عميلاً مؤهلاً واحداً", "عميلين مؤهلين", "عملاء مؤهلين", "عميلاً مؤهلاً")} في النظام و${an(cur.w, "صفقة واحدة مغلقة", "صفقتين مغلقتين", "صفقات مغلقة", "صفقة مغلقة")} بقيمة ${M(l, cur.sales)}.`),
    ...(prev && prev.cpql && cur.cpql ? [T(`Cost per qualified lead ${cur.cpql < prev.cpql ? "improved" : "worsened"} from SAR ${prev.cpql} to SAR ${cur.cpql} versus last quarter.`, `${cur.cpql < prev.cpql ? "تحسّنت" : "تراجعت"} تكلفة العميل المؤهل من ${prev.cpql} إلى ${cur.cpql} ر.س مقارنة بالربع السابق.`)] : []),
    T(`Recommendation: ${dec.headline} (${dec.confidence} confidence).`, `التوصية: ${dec.headline} (ثقة ${({ High: "عالية", Medium: "متوسطة", Low: "منخفضة" } as Record<string, string>)[dec.confidence]}).`),
  ];
  return {
    vendor: v.name, quarter: Q.id, quarterLabel: qLabel(Q.id, l), generated: dt(l, TODAY), summary, kpis,
    deliverables: {
      count: ds.length, onTimePct: ds.length ? Math.round(((ds.length - late.length) / ds.length) * 100) : null,
      avgRevisions: ds.length ? r1(ds.reduce((s, d) => s + d.revisions, 0) / ds.length) : null,
      late: late.map((d) => T(`${d.title}: due ${dt(l, d.dueDate)}, ${Math.round((d.deliveredAt!.getTime() - d.dueDate.getTime()) / 86_400_000)} days late, ${d.revisions} revisions`, `${d.title}: موعده ${dt(l, d.dueDate)}، تأخر ${Math.round((d.deliveredAt!.getTime() - d.dueDate.getTime()) / 86_400_000)} يوماً، ${d.revisions} مراجعات`)),
    },
    verification: [
      ...(crmV ? [T(`Leads: ${crmV.reportedLeads} reported vs ${crmV.crmLeads} in the CRM; contracts: ${crmV.reportedContracts} claimed vs ${crmV.crmWon} won; first response ${crmV.reportedRespHrs ?? "—"}h reported vs ${crmV.crmRespHrs ?? "—"}h measured.`, `العملاء: ${crmV.reportedLeads} مُبلَّغاً مقابل ${crmV.crmLeads} في النظام؛ العقود: ${crmV.reportedContracts} مُدّعاة مقابل ${crmV.crmWon} مغلقة؛ أول استجابة ${crmV.reportedRespHrs ?? "—"} ساعة مُبلَّغة مقابل ${crmV.crmRespHrs ?? "—"} ساعة مقاسة.`)] : []),
      ...(crmV?.flags.map((f) => f.text) ?? []), ...(v.flags.map((f) => f.text)),
    ],
    incrementality: inc?.text ?? "",
    billing: { invoicedK: r1(inv.reduce((s, i) => s + i.amountK, 0)), issues },
    decision: { headline: dec.headline, confidence: dec.confidence, nextStep: dec.nextStep },
    asks: dec.targets.length ? dec.targets : [T("Maintain current performance; agree a growth plan for next quarter.", "الحفاظ على الأداء الحالي والاتفاق على خطة نمو للربع القادم.")],
  };
}

export function qbrText(q: Qbr, l: Lang) {
  const T = (en: string, ar: string) => tx(l, en, ar);
  return [
    `${T("Quarterly business review", "مراجعة الأعمال الربعية")} — ${nm(l, q.vendor)} — ${q.quarterLabel}`, "",
    ...q.summary.map((s) => `• ${s}`), "",
    T("Results", "النتائج"), ...q.kpis.map((k) => `• ${k.metric}: ${k.current} (${T("previous", "السابق")} ${k.previous}${k.benchmark !== "—" ? `${T(", ", "، ")}${T("benchmark", "المعيار")} ${k.benchmark}` : ""})`), "",
    T("Delivery", "التنفيذ"), `• ${T("Deliverables", "التسليمات")}: ${q.deliverables.count}; ${T("on time", "في الموعد")} ${q.deliverables.onTimePct ?? "—"}%; ${T("avg revisions", "متوسط المراجعات")} ${q.deliverables.avgRevisions ?? "—"}`,
    ...q.deliverables.late.map((x) => `• ${x}`), "",
    T("Asks for next quarter", "المطلوب للربع القادم"), ...q.asks.map((a) => `• ${a}`),
  ].join("\n");
}

// ----------------------------------------------------------------------- RFP
export type Rfp = { incumbent: string; category: string; title: string; sections: { title: string; lines: string[] }[]; text: string; benchVendors: { id: string; name: string; language: string }[] };

export async function buildRfp(agent: Agent, vendorId: string, l: Lang): Promise<Rfp> {
  const T = (en: string, ar: string) => tx(l, en, ar);
  const N = (s: string) => nm(l, s);
  const v = agent.unified.vendors.find((x) => x.id === vendorId);
  if (!v) throw new Error(T("Vendor not found.", "المورد غير موجود."));
  const score = agent.scores.find((s) => s.vendorId === vendorId)!;
  const mv = agent.mkt.vendors.find((x) => x.id === vendorId)!;
  const cs = agent.mkt.campaigns.filter((c) => c.vendorId === vendorId);
  const assets = [...new Set(cs.map((c) => c.asset))];
  const channels = [...new Set(cs.map((c) => c.channel))];
  const monthly = v.verified.costK / 5;
  const cpql = score.metrics.find((m) => m.key === "cpql")!;
  const target = Math.round(Math.min(cpql.benchmark ?? Infinity, (cpql.actual ?? Infinity) * 0.85));
  const trialK = Math.max(30, Math.round((monthly * 1.4 * 0.15) / 5) * 5);
  const d = (days: number) => dt(l, new Date(TODAY.getTime() + days * 86_400_000));
  const sections = [
    { title: T("1. Background", "1. الخلفية"), lines: [T(`We are a real-estate developer selling ${assets.join(", ")}. We are reviewing our ${v.category.toLowerCase()} partner and invite proposals.`, `نحن مطوّر عقاري نسوّق ${assets.map(N).join("، ")}. نراجع حالياً شريكنا في ${N(v.category)} وندعوكم لتقديم عروضكم.`)] },
    { title: T("2. Scope", "2. نطاق العمل"), lines: [
      T(`Channels: ${channels.join(", ")}.`, `القنوات: ${channels.map(N).join("، ")}.`),
      T(`Indicative budget: ${K("en", Math.round(monthly * 0.8))}–${K("en", Math.round(monthly * 1.2))} per month.`, `الميزانية الاسترشادية: ${K(l, Math.round(monthly * 0.8))}–${K(l, Math.round(monthly * 1.2))} شهرياً.`),
    ] },
    { title: T("3. Objectives and KPIs", "3. الأهداف ومؤشرات الأداء"), lines: [
      T(`Current baseline: SAR ${cpql.actual ?? "—"} per CRM-qualified lead. Target: ≤ SAR ${target}.`, `الأساس الحالي: ${cpql.actual ?? "—"} ر.س لكل عميل مؤهل في النظام. الهدف: ≤ ${target} ر.س.`),
      T("Success is measured in our CRM (qualified leads, viewings, signed contracts) — not in platform or agency reports.", "يُقاس النجاح في نظام إدارة العملاء لدينا (العملاء المؤهلون، المعاينات، العقود الموقعة) — لا في تقارير المنصات أو الوكالة."),
      T("We will run incrementality tests (holdout or geo) on the work.", "سنُجري اختبارات للأثر الإضافي (مجموعة مستبعدة أو اختبار جغرافي) على العمل."),
    ] },
    { title: T("4. Requirements", "4. المتطلبات"), lines: [
      T(`Lead response: first human response within ${mv.slaResponseHrs} hours, measured in the CRM.`, `الاستجابة: أول استجابة بشرية خلال ${mv.slaResponseHrs} ساعة، مقاسةً في النظام.`),
      T("Every lead tagged with our campaign code; read access to ad accounts.", "وسم كل عميل محتمل برمز الحملة لدينا؛ وصلاحية قراءة الحسابات الإعلانية."),
      T("Monthly report in our canonical CSV template; media billed at cost with fees disclosed.", "تقرير شهري بقالب CSV الموحّد لدينا؛ وفوترة الإعلام بالتكلفة مع الإفصاح عن الرسوم."),
      T("Deliverables on time ≥ 85%; ≤ 1.5 revision rounds on average.", "التسليم في الموعد ≥ 85%؛ و1.5 جولة مراجعة كحد أقصى في المتوسط."),
    ] },
    { title: T("5. Commercial model", "5. النموذج التجاري"), lines: [T("Please propose a performance-linked fee: a fixed base plus a variable part on CRM-qualified leads or signed contracts.", "نرجو اقتراح أتعاب مرتبطة بالأداء: أساس ثابت وجزء متغيّر على العملاء المؤهلين في النظام أو العقود الموقعة.")] },
    { title: T("6. Paid trial", "6. التجربة المدفوعة"), lines: [T(`Shortlisted bidders run a 6-week paid trial (about SAR ${trialK}K) against the incumbent on the same brief.`, `يُجري المتأهلون تجربة مدفوعة لمدة 6 أسابيع (نحو ${K(l, trialK)}) مقابل المورد الحالي على الموجز نفسه.`)] },
    { title: T("7. Evaluation", "7. التقييم"), lines: [T(
      `Cost per qualified lead ${WEIGHTS.cpql}%, revenue and pipeline per SAR ${WEIGHTS.value}%, spend vs plan ${WEIGHTS.plan}%, deadline adherence ${WEIGHTS.deadlines}%, revisions ${WEIGHTS.revisions}% — the same scorecard used for incumbents.`,
      `تكلفة العميل المؤهل ${WEIGHTS.cpql}%، الإيرادات وخط المبيعات لكل ريال ${WEIGHTS.value}%، الإنفاق مقابل الخطة ${WEIGHTS.plan}%، الالتزام بالمواعيد ${WEIGHTS.deadlines}%، المراجعات ${WEIGHTS.revisions}% — بطاقة التقييم نفسها المطبقة على الموردين الحاليين.`)] },
    { title: T("8. Timeline", "8. الجدول الزمني"), lines: [
      T(`Questions by ${d(10)}; proposals by ${d(21)}; trial start ${d(35)}.`, `الأسئلة حتى ${d(10)}؛ العروض حتى ${d(21)}؛ بدء التجربة ${d(35)}.`),
    ] },
  ];
  const title = T(`Request for proposal — ${v.category} partner`, `طلب تقديم عروض — شريك ${N(v.category)}`);
  const vendors = await prisma.vendor.findMany();
  return {
    incumbent: v.name, category: v.category, title, sections,
    text: [title, "", ...sections.flatMap((s) => [s.title, ...s.lines.map((x) => `• ${x}`), ""])].join("\n"),
    benchVendors: vendors.filter((b) => b.status === "BENCH" && b.category === v.category).map((b) => ({ id: b.id, name: b.name, language: b.language })),
  };
}

/** Draft (never send) the RFP to every bench vendor in the channel, each in its preferred language. */
export async function draftRfpEmails(agentFor: (l: Lang) => Promise<Agent>, vendorId: string, ui: Lang) {
  const base = await buildRfp(await agentFor(ui), vendorId, ui);
  if (!base.benchVendors.length) throw new Error(tx(ui, "No bench vendors in this channel yet — add some to the bench first.", "لا يوجد موردون بدلاء في هذه القناة بعد — أضيفوا بدلاء أولاً."));
  const cache: Partial<Record<Lang, Rfp>> = { [ui]: base };
  let n = 0;
  for (const b of base.benchVendors) {
    const l: Lang = b.language === "ar" ? "ar" : "en";
    const rfp = cache[l] ?? (cache[l] = await buildRfp(await agentFor(l), vendorId, l));
    const vendor = (await prisma.vendor.findMany()).find((x) => x.id === b.id)!;
    const body = [
      tx(l, `Dear ${vendor.contact.split(" ")[0]},`, `السادة / ${nm(l, vendor.name)} المحترمون،`), "",
      tx(l, "We would like to invite you to submit a proposal. The request for proposal follows below.", "يسعدنا دعوتكم لتقديم عرض. تجدون طلب تقديم العروض أدناه."), "",
      rfp.text, "",
      tx(l, "Kind regards,", "وتفضلوا بقبول فائق الاحترام،"), tx(l, "Marketing Team", "فريق التسويق"),
    ].join("\n");
    if (await createCustomDraft({ vendorId: b.id, recKey: `RFP:${vendorId}:${b.id}`, subject: rfp.title, body }, ui)) n++;
  }
  return n;
}

void r1;
