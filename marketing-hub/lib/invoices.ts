import { single } from "./single";
import { prisma } from "./prisma";
import { ensureMarketingSeeded } from "./seed-marketing";
import { fetchOracle, mapInvoice, mapPurchaseOrder, oracleMode } from "./oracle";
import { type Lang, tx, K, nm , an, ltr } from "./i18n";

const TODAY = new Date("2026-06-08");
const DAY = 86_400_000;
const round = (x: number, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp;

export type Flag = { code: string; severity: "crit" | "warn" | "info"; text: string };

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  vendor: string;
  vendorId: string;
  campaign: string | null;
  period: string | null;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  amountK: number;
  paidK: number;
  outstandingK: number;
  deliveredK: number | null; // vendor-reported spend for that campaign/period
  oracleStatus: string;
  payment: "Paid" | "Partly paid" | "Unpaid";
  daysOverdue: number;
  decision: "PENDING" | "APPROVED" | "DISPUTED";
  decisionNote: string | null;
  flags: Flag[];
  blocked: boolean; // has a critical flag -> cannot be approved for payment
};

export type InvoiceDashboard = {
  currency: string;
  asOf: string;
  integration: { mode: "mock" | "live"; lastSync: string | null; invoices: number; purchaseOrders: number };
  kpis: {
    invoicedK: number; paidK: number; outstandingK: number; overdueK: number;
    flaggedK: number; unbilledK: number; approvedK: number; exceptions: number;
  };
  vendors: {
    id: string; name: string; supplierNumber: string | null; invoices: number; invoicedK: number; deliveredK: number;
    varianceK: number; outstandingK: number; overdueK: number; flagged: number; unbilledK: number;
  }[];
  invoices: InvoiceRow[];
  unbilled: { vendor: string; campaign: string; period: string; deliveredK: number }[];
  purchaseOrders: { poNumber: string; vendor: string; campaign: string | null; amountK: number; invoicedK: number; remainingK: number; utilisationPct: number }[];
};

// ------------------------------------------------------------------- sync ---
export async function syncOracle() {
  await ensureMarketingSeeded();
  const [vendors, campaigns] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { vendor: true, months: true } }),
  ]);
  const raw = await fetchOracle({
    vendors: vendors.map((v) => ({ oracleSupplierNumber: v.oracleSupplierNumber, name: v.name })),
    campaigns: campaigns.map((c) => ({ name: c.name, vendor: c.vendor.name, budgetK: c.budgetK, months: c.months.map((m) => ({ month: m.month, spendK: m.spendK })) })),
    today: TODAY,
  });

  const vendorBySupplier = new Map(vendors.map((v) => [v.oracleSupplierNumber, v]));
  const findCampaign = (vendorId: string, text: string | null) =>
    text ? campaigns.find((c) => c.vendorId === vendorId && text.includes(c.name)) ?? null : null;

  // Purchase orders
  const existingPo = new Map((await prisma.purchaseOrder.findMany()).map((p) => [p.oraclePoId, p]));
  const poCampaign = new Map<string, string | null>();
  for (const r of raw.purchaseOrders.map(mapPurchaseOrder)) {
    const v = vendorBySupplier.get(r.supplierNumber);
    if (!v) continue;
    const campaignId = findCampaign(v.id, r.description)?.id ?? null;
    poCampaign.set(r.poNumber, campaignId);
    const data = { poNumber: r.poNumber, vendorId: v.id, campaignId, amountK: r.amountK, status: r.status, description: r.description, syncedAt: new Date() };
    const ex = existingPo.get(r.oraclePoId);
    if (ex) await prisma.purchaseOrder.update({ where: { id: ex.id }, data });
    else await prisma.purchaseOrder.create({ data: { oraclePoId: r.oraclePoId, ...data } });
  }

  // Invoices — Oracle-owned fields are refreshed; local decisions are preserved.
  const existingInv = new Map((await prisma.supplierInvoice.findMany()).map((i) => [i.oracleInvoiceId, i]));
  let n = 0;
  for (const r of raw.invoices.map((x) => mapInvoice(x))) {
    const v = vendorBySupplier.get(r.supplierNumber);
    if (!v) continue;
    const campaignId =
      (r.poNumber ? poCampaign.get(r.poNumber) : null) ?? findCampaign(v.id, r.description)?.id ?? null;
    const data = {
      invoiceNumber: r.invoiceNumber, vendorId: v.id, campaignId, poNumber: r.poNumber, period: r.period,
      invoiceDate: r.invoiceDate, dueDate: r.dueDate, amountK: r.amountK, paidK: r.paidK, currency: r.currency,
      oracleStatus: r.oracleStatus, description: r.description, syncedAt: new Date(),
    };
    const ex = existingInv.get(r.oracleInvoiceId);
    if (ex) await prisma.supplierInvoice.update({ where: { id: ex.id }, data });
    else await prisma.supplierInvoice.create({ data: { oracleInvoiceId: r.oracleInvoiceId, ...data } });
    n++;
  }
  await prisma.integrationSync.create({
    data: { mode: oracleMode(), invoices: n, purchaseOrders: raw.purchaseOrders.length },
  });
  return { invoices: n, purchaseOrders: raw.purchaseOrders.length };
}

export const ensureOracleSynced = single(async function ensureOracleSyncedImpl() {
  await ensureMarketingSeeded();
  if ((await prisma.integrationSync.count()) === 0) await syncOracle();
});

// -------------------------------------------------------------- dashboard ---
export async function buildInvoiceDashboard(lang: Lang = "en"): Promise<InvoiceDashboard> {
  const [vendors, campaigns, invoices, pos, syncs] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { months: true } }),
    prisma.supplierInvoice.findMany(),
    prisma.purchaseOrder.findMany(),
    prisma.integrationSync.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
  ]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  const cById = new Map(campaigns.map((c) => [c.id, c]));
  const delivered = (campaignId: string | null, period: string | null) => {
    if (!campaignId || !period) return null;
    const m = cById.get(campaignId)?.months.find((x) => x.month === period);
    return m ? m.spendK : 0;
  };

  const sorted = [...invoices].sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());

  // Cross-invoice checks: duplicates and PO overrun (chronological).
  const dupOf = new Map<string, string>();
  const seen = new Map<string, string>();
  const overPo = new Set<string>();
  const poRunning = new Map<string, number>();
  const poAmount = new Map(pos.map((p) => [p.poNumber, p.amountK]));
  for (const i of sorted) {
    const key = `${i.vendorId}|${i.campaignId}|${i.period}|${round(i.amountK, 2)}`;
    if (seen.has(key)) dupOf.set(i.id, seen.get(key)!);
    else seen.set(key, i.invoiceNumber);
    if (i.poNumber && poAmount.has(i.poNumber)) {
      const run = (poRunning.get(i.poNumber) ?? 0) + i.amountK;
      poRunning.set(i.poNumber, run);
      if (run > poAmount.get(i.poNumber)! + 0.001) overPo.add(i.id);
    }
  }

  const rows: InvoiceRow[] = sorted.map((i) => {
    const flags: Flag[] = [];
    const del = delivered(i.campaignId, i.period);
    const outstandingK = round(Math.max(i.amountK - i.paidK, 0), 1);
    const daysOverdue = outstandingK > 0 ? Math.max(0, Math.floor((TODAY.getTime() - i.dueDate.getTime()) / DAY)) : 0;

    if (dupOf.has(i.id))
      flags.push({ code: "DUPLICATE", severity: "crit", text: tx(lang, `Same vendor, campaign, period and amount as ${dupOf.get(i.id)}.`, `المورد والحملة والفترة والمبلغ نفسها في الفاتورة ${ltr(dupOf.get(i.id)!)}.`) });
    if (!i.campaignId)
      flags.push({ code: "UNMAPPED", severity: "warn", text: tx(lang, "Not mapped to a campaign — cannot be reconciled to delivery.", "غير مربوطة بحملة — لا يمكن مطابقتها مع التنفيذ.") });
    else if (!dupOf.has(i.id)) {
      if (!del) flags.push({ code: "NO_DELIVERY", severity: "crit", text: tx(lang, `Billed ${round(i.amountK)}K but the vendor reported no delivery for ${i.period}.`, `مفوترة بمبلغ ${K(lang, round(i.amountK))} بينما لم يُبلّغ المورد عن أي تنفيذ للفترة ${ltr(i.period ?? "")}.`) });
      else {
        const v = (i.amountK - del) / del;
        if (v > 0.1) flags.push({ code: "OVERBILLED", severity: "crit", text: tx(lang, `Invoice ${round(i.amountK)}K vs ${round(del)}K delivered (+${round(v * 100)}%).`, `الفاتورة ${K(lang, round(i.amountK))} مقابل ${K(lang, round(del))} منفّذ (+${round(v * 100)}%).`) });
        else if (v > 0.03) flags.push({ code: "VARIANCE", severity: "warn", text: tx(lang, `Invoice ${round(i.amountK)}K vs ${round(del)}K delivered (+${round(v * 100)}%).`, `الفاتورة ${K(lang, round(i.amountK))} مقابل ${K(lang, round(del))} منفّذ (+${round(v * 100)}%).`) });
      }
    }
    if (!i.poNumber) flags.push({ code: "NO_PO", severity: "warn", text: tx(lang, "No purchase order on the invoice.", "لا يوجد أمر شراء على الفاتورة.") });
    if (overPo.has(i.id)) flags.push({ code: "OVER_PO", severity: "crit", text: tx(lang, `Takes ${i.poNumber} over its approved value.`, `تتجاوز القيمة المعتمدة لأمر الشراء ${ltr(i.poNumber!)}.`) });
    if (i.oracleStatus !== "Validated") flags.push({ code: "ORACLE_STATUS", severity: "warn", text: tx(lang, `Oracle status: ${i.oracleStatus}.`, `حالة أوراكل: ${i.oracleStatus === "Needs revalidation" ? "تحتاج إعادة تحقق" : i.oracleStatus === "Unvalidated" ? "غير محققة" : i.oracleStatus}.`) });
    if (daysOverdue > 0 && i.decision !== "DISPUTED")
      flags.push({ code: "OVERDUE", severity: daysOverdue > 30 ? "crit" : "warn", text: tx(lang, `${daysOverdue} days past due — late-payment risk with the vendor.`, `متأخرة ${an(daysOverdue, "يوم واحد", "يومان", "أيام", "يوماً")} عن الاستحقاق — خطر تأخر السداد للمورد.`) });

    // Billing anomaly: amount well above this campaign's earlier invoices (median of ≥ 2 prior).
    const prior = sorted.filter((o) => o.campaignId && o.campaignId === i.campaignId && o.invoiceDate < i.invoiceDate && !dupOf.has(o.id)).map((o) => o.amountK).sort((a, b) => a - b);
    if (prior.length >= 2) {
      const med = prior[Math.floor(prior.length / 2)];
      if (i.amountK > med * 1.3)
        flags.push({ code: "SPIKE", severity: "warn", text: tx(lang, `Amount is ${Math.round((i.amountK / med - 1) * 100)}% above this campaign's usual invoice (median ${round(med)}K) — confirm the scope change.`, `المبلغ أعلى بنسبة ${Math.round((i.amountK / med - 1) * 100)}% من الفاتورة المعتادة لهذه الحملة (الوسيط ${K(lang, round(med))}) — يُرجى تأكيد تغيّر النطاق.`) });
    }
    if (i.paidK > 0)
      for (const f of flags) if (f.code === "OVERBILLED" || f.code === "VARIANCE" || f.code === "DUPLICATE") f.text += tx(lang, " Already paid — request a credit note.", " سبق سدادها — يُطلب إشعار دائن.");

    // Overdue is a payment-side flag: it must not stop you paying a clean invoice.
    const blocked = flags.some((f) => f.severity === "crit" && f.code !== "OVERDUE");
    return {
      id: i.id, invoiceNumber: i.invoiceNumber, vendor: vName.get(i.vendorId)!, vendorId: i.vendorId,
      campaign: i.campaignId ? cById.get(i.campaignId)?.name ?? null : null, period: i.period, poNumber: i.poNumber,
      invoiceDate: i.invoiceDate.toISOString(), dueDate: i.dueDate.toISOString(),
      amountK: round(i.amountK), paidK: round(i.paidK), outstandingK, deliveredK: del === null ? null : round(del),
      oracleStatus: i.oracleStatus,
      payment: outstandingK === 0 ? "Paid" : i.paidK > 0 ? "Partly paid" : "Unpaid",
      daysOverdue, decision: i.decision as InvoiceRow["decision"], decisionNote: i.decisionNote, flags, blocked,
    };
  });

  // Delivery with no invoice yet (invoice expected by the 5th of the following month).
  const invoicedKeys = new Set(invoices.map((i) => `${i.campaignId}|${i.period}`));
  const unbilled: InvoiceDashboard["unbilled"] = [];
  for (const c of campaigns) {
    for (const m of c.months) {
      if (m.spendK <= 0 || invoicedKeys.has(`${c.id}|${m.month}`)) continue;
      const [y, mo] = m.month.split("-").map(Number);
      if (new Date(Date.UTC(y, mo, 5)) > TODAY) continue;
      unbilled.push({ vendor: vName.get(c.vendorId)!, campaign: c.name, period: m.month, deliveredK: round(m.spendK) });
    }
  }

  const sum = (xs: number[]) => round(xs.reduce((s, x) => s + x, 0));
  const live = rows.filter((r) => r.decision !== "DISPUTED");
  const vendorRows = vendors.filter((v) => (v.status ?? "ACTIVE") !== "BENCH").map((v) => {
    const rs = rows.filter((r) => r.vendorId === v.id);
    const cs = campaigns.filter((c) => c.vendorId === v.id);
    const deliveredK = sum(cs.flatMap((c) => c.months.map((m) => m.spendK)));
    return {
      id: v.id, name: v.name, supplierNumber: v.oracleSupplierNumber, invoices: rs.length,
      invoicedK: sum(rs.map((r) => r.amountK)), deliveredK, varianceK: 0,
      outstandingK: sum(rs.map((r) => r.outstandingK)),
      overdueK: sum(rs.filter((r) => r.daysOverdue > 0).map((r) => r.outstandingK)),
      flagged: rs.filter((r) => r.flags.some((f) => f.code !== "OVERDUE")).length,
      unbilledK: sum(unbilled.filter((u) => u.vendor === v.name).map((u) => u.deliveredK)),
    };
  }).map((v) => ({ ...v, varianceK: round(v.invoicedK + v.unbilledK - v.deliveredK) }))
    .sort((a, b) => b.invoicedK - a.invoicedK);

  const poRows = pos.map((p) => {
    const invoicedK = sum(rows.filter((r) => r.poNumber === p.poNumber).map((r) => r.amountK));
    return {
      poNumber: p.poNumber, vendor: vName.get(p.vendorId)!, campaign: p.campaignId ? cById.get(p.campaignId)?.name ?? null : null,
      amountK: round(p.amountK), invoicedK, remainingK: round(p.amountK - invoicedK),
      utilisationPct: p.amountK > 0 ? Math.round((invoicedK / p.amountK) * 100) : 0,
    };
  }).sort((a, b) => b.utilisationPct - a.utilisationPct);

  const last = syncs[0];
  return {
    currency: "SAR",
    asOf: TODAY.toISOString(),
    integration: {
      mode: oracleMode(), lastSync: last ? last.createdAt.toISOString() : null,
      invoices: invoices.length, purchaseOrders: pos.length,
    },
    kpis: {
      invoicedK: sum(rows.map((r) => r.amountK)),
      paidK: sum(rows.map((r) => r.paidK)),
      outstandingK: sum(live.map((r) => r.outstandingK)),
      overdueK: sum(live.filter((r) => r.daysOverdue > 0).map((r) => r.outstandingK)),
      flaggedK: sum(rows.filter((r) => r.blocked).map((r) => r.amountK)),
      unbilledK: sum(unbilled.map((u) => u.deliveredK)),
      approvedK: sum(rows.filter((r) => r.decision === "APPROVED").map((r) => r.outstandingK)),
      exceptions: rows.filter((r) => r.flags.some((f) => f.code !== "OVERDUE") && r.decision === "PENDING" && r.outstandingK > 0).length,
    },
    vendors: vendorRows,
    invoices: rows,
    unbilled,
    purchaseOrders: poRows,
  };
}

// ---------------------------------------------------------------- decisions ---
// Decisions are recorded here only; nothing is written back to Oracle.
export type InvoiceAction =
  | { type: "APPROVE" | "REOPEN"; invoiceId: string }
  | { type: "DISPUTE"; invoiceId: string; note: string }
  | { type: "APPROVE_CLEAN" };

export async function applyInvoiceAction(input: InvoiceAction, lang: Lang = "en") {
  const dash = await buildInvoiceDashboard(lang);
  const log = (type: string, ref: string, detail: string) =>
    prisma.marketingAction.create({ data: { type, campaign: ref, detail } });

  if (input.type === "APPROVE_CLEAN") {
    const clean = dash.invoices.filter((r) => r.decision === "PENDING" && r.outstandingK > 0 && r.flags.every((f) => f.code === "OVERDUE"));
    for (const r of clean) {
      await prisma.supplierInvoice.update({ where: { id: r.id }, data: { decision: "APPROVED", decidedAt: new Date() } });
    }
    await log("APPROVE_INVOICE", tx(lang, "Clean invoices", "الفواتير السليمة"), tx(lang, `Approved ${clean.length} invoices with no reconciliation exceptions (SAR ${round(clean.reduce((s, r) => s + r.outstandingK, 0))}K).`, `تم اعتماد ${an(clean.length, "فاتورة واحدة", "فاتورتان", "فواتير", "فاتورة")} بلا استثناءات مطابقة (${K(lang, round(clean.reduce((s, r) => s + r.outstandingK, 0)))}).`));
    return;
  }

  const inv = dash.invoices.find((r) => r.id === input.invoiceId);
  if (!inv) throw new Error(tx(lang, "Invoice not found.", "الفاتورة غير موجودة."));
  const ref = `${nm(lang, inv.vendor)} · ${inv.invoiceNumber}`;

  if (input.type === "APPROVE") {
    if (inv.outstandingK === 0) throw new Error(tx(lang, "Invoice is already paid.", "الفاتورة مدفوعة بالفعل."));
    if (inv.blocked) throw new Error(tx(lang, "Invoice has critical reconciliation exceptions — dispute it or resolve them first.", "للفاتورة استثناءات مطابقة حرجة — اعترضوا عليها أو عالجوها أولاً."));
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { decision: "APPROVED", decisionNote: null, decidedAt: new Date() } });
    await log("APPROVE_INVOICE", ref, tx(lang, `Approved for payment: SAR ${inv.outstandingK}K due ${inv.dueDate.slice(0, 10)}.`, `اعتُمدت للدفع: ${K(lang, inv.outstandingK)} تستحق في ${inv.dueDate.slice(0, 10)}.`));
  } else if (input.type === "DISPUTE") {
    const note = input.note?.trim() || inv.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ");
    if (!note) throw new Error(tx(lang, "A reason is required to dispute an invoice.", "يلزم ذكر سبب للاعتراض على الفاتورة."));
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { decision: "DISPUTED", decisionNote: note, decidedAt: new Date() } });
    await log("DISPUTE_INVOICE", ref, tx(lang, `Disputed: ${note}`, `اعتراض: ${note}`));
  } else {
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { decision: "PENDING", decisionNote: null, decidedAt: null } });
    await log("REOPEN_INVOICE", ref, tx(lang, "Decision reset to pending.", "أُعيد القرار إلى قيد الانتظار."));
  }
}
