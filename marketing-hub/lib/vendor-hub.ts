// Vendor hub — the Vendors page's vendor directory: every vendor (current, bench alternatives, past) with its
// headline numbers, and per vendor the campaigns it ran, its supplier invoices (Oracle), the work orders and
// deliverables, and the email correspondence (Outlook). Read-only: approvals stay on their own controls.
import { prisma } from "./prisma";
import type { Agent } from "./agent";
import type { Orchestration } from "./orchestrator";
import { historyState } from "./history";
import { metaMode, metaState } from "./meta";
import { outlookMode, outlookSender, readVendorMail, type MailMessage } from "./outlook";
import { sampleMailFrom } from "./inbox";
import { TODAY } from "./clock";
import { type Lang, tx, nm, dt } from "./i18n";

const r1 = (x: number) => Math.round(x * 10) / 10;
const domainOf = (email?: string | null) => (email && email.includes("@") ? email.split("@")[1].toLowerCase() : null);

/** The directory: one row per vendor. */
export async function vendorList(lang: Lang, a: Agent, orch: Orchestration) {
  const [vendors, emails, h] = await Promise.all([prisma.vendor.findMany(), prisma.outboundEmail.findMany(), historyState(lang)]);
  const rows = vendors.map((v) => {
    const mv = a.mkt.vendors.find((x) => x.id === v.id);
    const dec = a.decisions.find((x) => x.vendorId === v.id);
    const inv = a.inv.invoices.filter((i) => i.vendorId === v.id);
    const mails = emails.filter((e) => e.vendorId === v.id);
    const lastMail = mails.map((e) => e.sentAt ?? e.createdAt).sort((p, q) => q.getTime() - p.getTime())[0] ?? null;
    const orders = orch.orders.filter((o) => o.vendorId === v.id);
    const past = h.rows.filter((r) => r.vendorKey === v.name);
    return {
      id: v.id, name: v.name, category: v.category, status: v.status === "BENCH" ? "BENCH" : v.status === "EXITED" ? "PAST" : "CURRENT",
      contact: v.contact, email: v.email, language: v.language, contractEnd: v.status === "BENCH" ? null : v.contractEnd.toISOString(),
      score: mv?.score ?? null, decision: dec?.decision ?? null, decisionHeadline: dec?.headline ?? null,
      liveCampaigns: mv?.liveCampaigns ?? 0, campaigns: mv?.campaigns ?? 0, pastCampaigns: past.length,
      spendK: mv?.spendK ?? 0, contracts: mv?.contracts ?? 0, salesM: mv?.revenueM ?? 0, costToSalesPct: mv?.costToSalesPct ?? null,
      invoices: inv.length, outstandingK: r1(inv.reduce((s, i) => s + i.outstandingK, 0)), overdueK: r1(inv.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.outstandingK, 0)),
      invoiceIssues: inv.filter((i) => i.decision === "PENDING" && i.flags.some((f) => f.code !== "OVERDUE")).length,
      waitingForYou: orders.filter((o) => o.status === "PROPOSED" && o.email?.status === "DRAFT").length,
      withVendor: orders.filter((o) => o.status === "ISSUED").length,
      late: orch.deliverables.filter((d) => d.vendor === v.name && d.state === "LATE").length,
      emails: mails.filter((e) => e.status === "SENT").length, drafts: mails.filter((e) => e.status === "DRAFT").length, lastEmail: lastMail?.toISOString() ?? null,
      note: v.status === "BENCH" ? nm(lang, v.rateNote ?? "") : null,
    };
  });
  // Past vendors known only from the campaign history (no contract, no invoices in Oracle).
  const known = new Set(vendors.map((v) => v.name));
  const pastOnly = [...new Set(h.rows.map((r) => r.vendorKey))].filter((n) => !known.has(n)).map((n) => {
    const ps = h.rows.filter((r) => r.vendorKey === n);
    const spend = ps.reduce((s, r) => s + r.spendK, 0), sales = ps.reduce((s, r) => s + r.salesM, 0);
    return {
      id: `past:${n}`, name: n, category: ps[0]?.channel ?? "", status: "PAST", contact: "", email: null, language: "en", contractEnd: null,
      score: null, decision: null, decisionHeadline: null, liveCampaigns: 0, campaigns: 0, pastCampaigns: ps.length, spendK: r1(spend), contracts: ps.reduce((s, r) => s + r.contracts, 0), salesM: r1(sales),
      costToSalesPct: sales ? r1((spend / (sales * 1000)) * 100) : null, invoices: 0, outstandingK: 0, overdueK: 0, invoiceIssues: 0, waitingForYou: 0, withVendor: 0, late: 0, emails: 0, drafts: 0,
      lastEmail: null, note: tx(lang, `Last campaign ended ${ps.map((r) => r.end).sort().pop()}`, `انتهت آخر حملة في ${ps.map((r) => r.end).sort().pop()}`),
    };
  });
  const order = { CURRENT: 0, BENCH: 1, PAST: 2 } as Record<string, number>;
  return [...rows, ...pastOnly].sort((p, q) => order[p.status] - order[q.status] || q.spendK - p.spendK || p.name.localeCompare(q.name));
}
export type VendorRow = Awaited<ReturnType<typeof vendorList>>[number];

/** Everything about one vendor. */
export async function vendorDetail(id: string, lang: Lang, a: Agent, orch: Orchestration) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const list = await vendorList(lang, a, orch);
  const row = list.find((r) => r.id === id);
  if (!row) throw new Error(T("Vendor not found.", "المورد غير موجود."));
  const h = await historyState(lang);
  const v = (await prisma.vendor.findMany()).find((x) => x.id === id) ?? null;
  const mv = a.mkt.vendors.find((x) => x.id === id);
  const dec = a.decisions.find((x) => x.vendorId === id);
  const sc = a.scores.find((x) => x.vendorId === id);

  // Campaigns: live 2026, past (history), Meta campaigns attributed to it, trials.
  const live = a.mkt.campaigns.filter((c) => c.vendorId === id).map((c) => ({
    id: c.id, code: a.unified.campaigns.find((u) => u.id === c.id)?.code ?? null, name: c.name, project: c.asset, channel: c.channel, status: c.status,
    budgetK: c.budgetK, spendK: c.spendK, leads: c.leads, qualified: c.qualified, contracts: c.contracts, salesM: c.revenueM, costToSalesPct: c.costToSalesPct, health: c.health,
  }));
  const past = h.rows.filter((r) => r.vendorKey === row.name).sort((p, q) => q.start.localeCompare(p.start)).map(({ months, ...r }) => r);
  const meta = metaMode() === "off" ? [] : ((await metaState(lang)).campaigns as any[]).filter((c) => c.vendorId === id).map((c) => ({ name: c.name, code: c.code, spendK: c.spendK, confidence: c.confidence, review: c.review }));
  const trials = a.bench.trials.filter((t: any) => t.challengerId === id || t.incumbentId === id).map((t: any) => ({ id: t.id, challenger: t.challenger, incumbent: t.incumbent, status: t.status, budgetK: t.budgetK, outcome: t.readout?.outcome ?? null }));

  // Invoices (Oracle).
  const invoices = a.inv.invoices.filter((i) => i.vendorId === id).sort((p, q) => q.invoiceDate.localeCompare(p.invoiceDate)).map((i) => ({
    id: i.id, number: i.invoiceNumber, campaign: i.campaign, period: i.period, po: i.poNumber, date: i.invoiceDate, due: i.dueDate, amountK: i.amountK, paidK: i.paidK, outstandingK: i.outstandingK,
    payment: i.payment, daysOverdue: i.daysOverdue, decision: i.decision, oracleStatus: i.oracleStatus, flags: i.flags.map((f) => ({ severity: f.severity, text: f.text })),
  }));
  const unbilled = a.inv.unbilled.filter((u: any) => u.vendorId === id || u.vendor === row.name);
  // 2023–2025 archive: one paid invoice per campaign and month of the past campaigns (before the Oracle connection).
  const archive = h.rows.filter((r) => r.vendorKey === row.name).flatMap((r) => (r.months as any[]).filter((m) => m.spendK > 0).map((m) => ({
    number: `ARC-${r.code}-${m.month.replace("-", "")}`, campaign: r.name, period: m.month, amountK: r1(m.spendK),
  }))).sort((p, q) => q.period.localeCompare(p.period));

  // Work orders and deliverables.
  const orders = orch.orders.filter((o) => o.vendorId === id);
  const allDel = v ? (await prisma.deliverable.findMany()).filter((d) => d.vendorId === id) : [];
  // Late first, then upcoming by due date, then the delivered history (newest first).
  const rank = (d: { dueDate: Date; deliveredAt: Date | null }) => (d.deliveredAt ? 2 : d.dueDate < TODAY ? 0 : 1);
  const deliverables = allDel.sort((p, q) => rank(p) - rank(q) || (rank(p) === 2 ? q.dueDate.getTime() - p.dueDate.getTime() : p.dueDate.getTime() - q.dueDate.getTime())).map((d) => {
    const open = orch.deliverables.find((x) => x.id === d.id);
    return { id: d.id, title: open?.title ?? d.title, kind: d.kind, due: d.dueDate.toISOString(), deliveredAt: d.deliveredAt?.toISOString() ?? null, state: d.deliveredAt ? (d.deliveredAt <= d.dueDate ? "ON_TIME" : "LATE_RECEIVED") : d.dueDate < TODAY ? "LATE" : "DUE", chases: open?.chases ?? 0 };
  });

  // Email (Outlook): what the app sent or drafted, plus the mailbox (live) or simulated replies (mock).
  const out = v ? (await prisma.outboundEmail.findMany()).filter((e) => e.vendorId === id) : [];
  const STATUS: Record<string, [string, string]> = { DRAFT: ["Draft — waiting for your approval", "مسودة — بانتظار اعتمادكم"], SENT: ["Sent", "أُرسلت"], FAILED: ["Failed", "فشلت"], REJECTED: ["Cancelled", "أُلغيت"] };
  const mails: (MailMessage & { status?: string; approvedBy?: string | null; source: "app" | "outlook" | "simulated"; body?: string })[] = out.map((e) => ({
    id: e.id, direction: "OUT", from: outlookSender(), to: e.toAddress, subject: e.subject, preview: e.body.slice(0, 240), body: e.body, date: (e.sentAt ?? e.createdAt).toISOString(),
    status: T(...(STATUS[e.status] ?? [e.status, e.status])) + (e.status === "SENT" && e.delivery === "mock" ? T(" (simulated)", " (تجريبي)") : ""), approvedBy: e.approvedBy, source: "app" as const,
  }));
  let mailNote: string | null = null;
  const domain = domainOf(v?.email);
  if (v && domain) {
    if (outlookMode() === "live") {
      try { mails.push(...(await readVendorMail(domain)).filter((m) => m.direction === "IN").map((m) => ({ ...m, source: "outlook" as const }))); }
      catch (e: any) { mailNote = String(e?.message ?? e); }
    } else {
      mails.push(...simulatedReplies(v, out, invoices, deliverables, live.length > 0).map((m) => ({ ...m, source: "simulated" as const })));
      mails.push(...sampleMailFrom(v.name, lang).map((m) => ({ ...m, source: "simulated" as const })));
      mailNote = T("Outlook is simulated: vendor replies below are sample messages consistent with the data. With OUTLOOK_MODE=live they are read from the mailbox (Mail.Read).", "Outlook تجريبي: ردود المورد أدناه رسائل نموذجية متسقة مع البيانات. مع OUTLOOK_MODE=live تُقرأ من صندوق البريد (Mail.Read).");
    }
  } else if (!v) mailNote = T("A past vendor: no contract or mailbox on record; its campaigns are in the history.", "مورد سابق: لا عقد ولا مراسلات مسجلة؛ وحملاته في التاريخ.");
  mails.sort((p, q) => q.date.localeCompare(p.date));

  return {
    vendor: row,
    profile: v ? {
      model: v.model, retainerK: v.retainerK, slaResponseHrs: v.slaResponseHrs, slaQualifiedPct: v.slaQualifiedPct, oracleSupplier: v.oracleSupplierNumber, rateNote: v.rateNote ? nm(lang, v.rateNote) : null,
      score: sc ? { score: sc.score, low: sc.low, high: sc.high, confidence: sc.confidence } : null,
      decision: dec ? { decision: dec.decision, headline: dec.headline, confidence: dec.confidence, nextStep: dec.nextStep } : null,
      slaBreaches: mv?.slaBreaches ?? [], latestRespHrs: mv?.latestRespHrs ?? null, qualRatePct: mv?.qualRatePct ?? null,
    } : null,
    campaigns: { live, past, meta, trials },
    invoices: { rows: invoices, unbilled, archive, archiveTotalK: r1(archive.reduce((t, x) => t + x.amountK, 0)), totals: { invoicedK: r1(invoices.reduce((s, i) => s + i.amountK, 0)), paidK: r1(invoices.reduce((s, i) => s + i.paidK, 0)), outstandingK: row.outstandingK, overdueK: row.overdueK } },
    work: { orders, deliverables },
    mail: { mode: outlookMode(), mailbox: outlookSender(), domain, note: mailNote, messages: mails },
  };
}
export type VendorDetail = Awaited<ReturnType<typeof vendorDetail>>;

/** Mock mode: vendor-side messages consistent with the data (invoices sent, deliverables, replies to our emails). */
function simulatedReplies(v: { id: string; name: string; email: string | null; contact: string; language: string; status: string }, out: { id: string; subject: string; status: string; sentAt: Date | null }[], invoices: { number: string; campaign: string | null; period: string | null; amountK: number; po: string | null; date: string }[], dels: { id: string; title: string; deliveredAt: string | null }[], hasCampaigns: boolean): MailMessage[] {
  const ar = v.language === "ar", from = v.email ?? "", sig = `\n${v.contact}\n${v.name}`;
  const L = (en: string, a: string) => (ar ? a : en);
  const msgs: MailMessage[] = [];
  for (const i of invoices.slice(0, 8)) msgs.push({ id: `sim-inv-${i.number}`, direction: "IN", from, to: outlookSender(), date: i.date,
    subject: L(`Invoice ${i.number}${i.period ? ` — ${i.period}` : ""}`, `فاتورة ${i.number}${i.period ? ` — ${i.period}` : ""}`),
    preview: L(`Please find attached invoice ${i.number} for SAR ${i.amountK}K${i.campaign ? ` (${i.campaign})` : ""}${i.po ? `, PO ${i.po}` : ""}. It has also been submitted to your Oracle supplier portal.${sig}`, `مرفق الفاتورة ${i.number} بمبلغ ${i.amountK} ألف ر.س${i.campaign ? ` (${nm("ar", i.campaign)})` : ""}${i.po ? `، أمر الشراء ${i.po}` : ""}. وقد رُفعت أيضاً على بوابة الموردين في أوراكل.${sig}`) });
  for (const d of dels.filter((x) => x.deliveredAt).slice(0, 6)) msgs.push({ id: `sim-del-${d.id}`, direction: "IN", from, to: outlookSender(), date: d.deliveredAt!,
    subject: L(`Delivered: ${d.title}`, `تم التسليم: ${d.title}`), preview: L(`Hello, "${d.title}" is ready — files and links attached. Let us know if you need changes.${sig}`, `مرحباً، «${d.title}» جاهز — الملفات والروابط مرفقة. أخبرونا إن احتجتم إلى تعديلات.${sig}`) });
  if (hasCampaigns && v.status === "ACTIVE") msgs.push({ id: `sim-report-${v.id}`, direction: "IN", from, to: outlookSender(), date: "2026-06-04T09:10:00.000Z",
    subject: L("May 2026 performance report", "تقرير أداء مايو 2026"), preview: L(`Attached is our May report in your template (spend, leads, qualified, viewings, contracts per campaign code).${sig}`, `مرفق تقرير مايو بالقالب المعتمد لديكم (الإنفاق والعملاء والمؤهلون والمعاينات والعقود لكل رمز حملة).${sig}`) });
  // Earlier correspondence from before the director took over the monthly cycle (sample).
  if (v.status === "ACTIVE" && hasCampaigns) {
    const team = outlookSender();
    msgs.push(
      { id: `sim-out-brief-${v.id}`, direction: "OUT", from: team, to: from, date: "2026-04-27T08:30:00.000Z", subject: L("Monthly brief — May 2026", "الموجز الشهري — مايو 2026"),
        preview: L("Budget, campaign codes and targets for May are attached. Please keep the campaign code in every campaign name and utm_campaign.", "مرفق الميزانية ورموز الحملات والمستهدفات لشهر مايو. نرجو إبقاء رمز الحملة في كل اسم حملة وفي utm_campaign.") },
      { id: `sim-in-brief-${v.id}`, direction: "IN", from, to: team, date: "2026-04-28T11:05:00.000Z", subject: L("Re: Monthly brief — May 2026", "رد: الموجز الشهري — مايو 2026"),
        preview: L(`Confirmed — media plan and creative calendar for May attached.${sig}`, `تم التأكيد — مرفق الخطة الإعلامية وتقويم المحتوى لشهر مايو.${sig}`) },
      { id: `sim-out-fb-${v.id}`, direction: "OUT", from: team, to: from, date: "2026-05-10T07:45:00.000Z", subject: L("Lead feedback — April 2026", "ملاحظات العملاء — أبريل 2026"),
        preview: L("From the CRM: qualified rate and wins per campaign code for April, the main loss reasons, and where to shift targeting.", "من النظام: نسبة المؤهلين والصفقات لكل رمز حملة في أبريل، وأهم أسباب الخسارة، وأين نوجّه الاستهداف.") },
    );
  }
  for (const e of out.filter((x) => x.status === "SENT" && x.sentAt)) msgs.push({ id: `sim-re-${e.id}`, direction: "IN", from, to: outlookSender(), date: new Date(e.sentAt!.getTime() + 26 * 3600000).toISOString(),
    subject: `${L("Re:", "رد:")} ${e.subject}`, preview: L(`Thank you, well received. We are reviewing it with the team and will come back with a written response within three working days.${sig}`, `شكراً لكم، تم الاستلام. نراجعه مع الفريق وسنعود إليكم برد مكتوب خلال ثلاثة أيام عمل.${sig}`) });
  return msgs;
}
