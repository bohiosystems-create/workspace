// One data model per vendor and campaign, built from every source, with an explicit source of truth
// per metric — so vendors stop grading their own homework.
//
//   cost            → Oracle invoices (+ accrued delivery not yet invoiced); vendor report only as fallback
//   leads / quality → CRM (stages QUALIFIED and beyond count as qualified)
//   wins / sales    → CRM (won deals and their value)
//   pipeline        → CRM open opportunities, stage-weighted
//   response time   → CRM (first human response)
//   media delivered → ad platforms (digital channels): checks the vendor's reported media spend
import { prisma } from "./prisma";
import { ensureOpsSeeded } from "./seed-ops";
import { ensureCrmSynced, crmMode } from "./crm";
import { ensureOracleSynced, buildInvoiceDashboard } from "./invoices";
import { oracleMode } from "./oracle";
import { ensureAdsSynced, adsMode, isDigital } from "./adaccounts";
import { outlookMode, outlookDelivery } from "./outlook";
import { type Lang, tx, K, nm } from "./i18n";

const HOUR = 3_600_000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
// Probability that an open opportunity at this stage becomes a sale (weights for "pipeline influenced").
export const STAGE_WEIGHT: Record<string, number> = { QUALIFIED: 0.1, VIEWING: 0.25, RESERVED: 0.6 };
const QUALIFIED_STAGES = new Set(["QUALIFIED", "VIEWING", "RESERVED", "WON"]);

export type Metrics = { costK: number; leads: number; qualified: number; won: number; salesM: number; pipelineM: number; respHrs: number | null };
export type UnifiedCampaign = {
  id: string; name: string; vendorId: string; vendor: string; channel: string; category: string; asset: string; code: string | null; digital: boolean;
  status: string; budgetK: number; pacingPct: number | null;
  reported: { spendK: number; leads: number; qualified: number; contracts: number; salesM: number; respHrs: number | null };
  platform: { spendK: number; leads: number } | null;
  billing: { invoicedK: number; accruedK: number };
  verified: Metrics & { costSource: "oracle" | "vendor"; leadSource: "crm" | "vendor" };
  months: { month: string; costK: number; qualified: number; won: number; salesM: number }[];
};
export type DataFlag = { code: string; severity: "crit" | "warn" | "info"; text: string };
export type UnifiedVendor = { id: string; name: string; category: string; campaigns: number; reported: UnifiedCampaign["reported"]; platformSpendK: number | null; digitalReportedSpendK: number; verified: Metrics; flags: DataFlag[] };
export type SourceStatus = { key: string; mode: string; connected: boolean; lastSync: string | null; records: number; coverage: string };

export async function ensureAllSources() {
  await ensureOpsSeeded();
  await ensureOracleSynced();
  await ensureCrmSynced();
  await ensureAdsSynced();
}

export async function buildUnified(lang: Lang = "en") {
  await ensureAllSources();
  const [vendors, campaigns, leads, ads, inv, syncs, crmSyncs, deliverables, weeks] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { months: true } }),
    prisma.crmLead.findMany(),
    prisma.adPlatformWeek.findMany(),
    buildInvoiceDashboard(lang),
    prisma.sourceSync.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.crmSync.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.deliverable.count(),
    prisma.salesWeek.count(),
  ]);
  const vById = new Map(vendors.map((v) => [v.id, v]));
  const TODAY = new Date("2026-06-08");

  const rows: UnifiedCampaign[] = campaigns.map((c) => {
    const v = vById.get(c.vendorId)!;
    const ms = [...c.months].sort((a, b) => a.month.localeCompare(b.month));
    const sum = (k: "spendK" | "leads" | "qualified" | "contracts" | "revenueM") => ms.reduce((s, m) => s + m[k], 0);
    const withResp = ms.filter((m) => m.respHrs > 0);
    const ls = leads.filter((l) => l.campaignId === c.id);
    const won = ls.filter((l) => l.stage === "WON");
    const unit = won.length ? won.reduce((s, l) => s + (l.dealValueM ?? 0), 0) / won.length : (sum("contracts") ? sum("revenueM") / sum("contracts") : 1.4);
    const pipelineM = ls.reduce((s, l) => s + (STAGE_WEIGHT[l.stage] ? STAGE_WEIGHT[l.stage] * (l.dealValueM ?? unit) : 0), 0);
    const resp = ls.filter((l) => l.firstResponseAt).map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / HOUR).sort((a, b) => a - b);
    const ad = ads.filter((a) => a.campaignCode === c.crmCode);
    const invs = inv.invoices.filter((i) => i.campaign === c.name && i.decision !== "DISPUTED" && !i.flags.some((f) => f.code === "DUPLICATE"));
    const invoicedK = invs.reduce((s, i) => s + i.amountK, 0);
    const accruedK = inv.unbilled.filter((u) => u.campaign === c.name).reduce((s, u) => s + u.deliveredK, 0);
    const hasBilling = invs.length > 0;
    const elapsed = Math.min(1, Math.max(0, (TODAY.getTime() - c.startDate.getTime()) / (c.endDate.getTime() - c.startDate.getTime())));
    const months = ms.map((m) => {
      const inM = (d: Date) => d.toISOString().slice(0, 7) === m.month;
      const billed = invs.filter((i) => i.period === m.month).reduce((s, i) => s + i.amountK, 0) + inv.unbilled.filter((u) => u.campaign === c.name && u.period === m.month).reduce((s, u) => s + u.deliveredK, 0);
      return {
        month: m.month, costK: r1(hasBilling ? billed || m.spendK : m.spendK),
        qualified: ls.filter((l) => inM(l.createdAt) && QUALIFIED_STAGES.has(l.stage)).length,
        won: ls.filter((l) => l.stage === "WON" && inM(l.createdAt)).length,
        salesM: r2(ls.filter((l) => l.stage === "WON" && inM(l.createdAt)).reduce((s, l) => s + (l.dealValueM ?? 0), 0)),
      };
    });
    return {
      id: c.id, name: c.name, vendorId: c.vendorId, vendor: v.name, channel: c.channel, category: v.category, asset: "", code: c.crmCode,
      digital: isDigital(c.channel), status: c.status, budgetK: c.budgetK,
      pacingPct: elapsed > 0.05 && c.budgetK > 0 ? Math.round(((sum("spendK") / c.budgetK) / elapsed) * 100) : null,
      reported: { spendK: r1(sum("spendK")), leads: sum("leads"), qualified: sum("qualified"), contracts: sum("contracts"), salesM: r1(sum("revenueM")), respHrs: withResp.length ? r1(withResp.reduce((s, m) => s + m.respHrs, 0) / withResp.length) : null },
      platform: ad.length ? { spendK: r1(ad.reduce((s, a) => s + a.spendK, 0)), leads: ad.reduce((s, a) => s + a.platformLeads, 0) } : null,
      billing: { invoicedK: r1(invoicedK), accruedK: r1(accruedK) },
      verified: {
        costK: r1(hasBilling ? invoicedK + accruedK : sum("spendK")), costSource: hasBilling ? "oracle" : "vendor",
        leads: ls.length ? ls.length : sum("leads"), qualified: ls.length ? ls.filter((l) => QUALIFIED_STAGES.has(l.stage)).length : sum("qualified"),
        won: ls.length ? won.length : sum("contracts"), salesM: r1(ls.length ? won.reduce((s, l) => s + (l.dealValueM ?? 0), 0) : sum("revenueM")),
        pipelineM: r1(pipelineM), respHrs: resp.length ? r1(resp[Math.floor(resp.length / 2)]) : null, leadSource: ls.length ? "crm" : "vendor",
      },
      months,
    };
  });

  const vendorRows: UnifiedVendor[] = vendors
    .filter((v) => (v.status ?? "ACTIVE") !== "BENCH" && rows.some((r) => r.vendorId === v.id))
    .map((v) => {
      const cs = rows.filter((r) => r.vendorId === v.id);
      const s = (f: (c: UnifiedCampaign) => number) => cs.reduce((t, c) => t + f(c), 0);
      const digital = cs.filter((c) => c.digital && c.platform);
      const platformSpendK = digital.length ? r1(s((c) => c.platform?.spendK ?? 0)) : null;
      const digitalReportedSpendK = r1(digital.reduce((t, c) => t + c.reported.spendK, 0));
      const respList = cs.filter((c) => c.verified.respHrs !== null);
      const flags: DataFlag[] = [];
      if (platformSpendK !== null && digitalReportedSpendK > 0) {
        const ratio = platformSpendK / digitalReportedSpendK;
        if (ratio < 0.95) {
          const gap = r1((1 - ratio) * 100);
          flags.push({
            code: "MEDIA_GAP", severity: ratio < 0.9 ? "crit" : "warn",
            text: tx(lang,
              `Vendor reports SAR ${digitalReportedSpendK}K of media spend; the ad platforms show SAR ${platformSpendK}K (${gap}% less) — undisclosed fees or under-delivery.`,
              `يُبلّغ المورد عن إنفاق إعلامي بقيمة ${K(lang, digitalReportedSpendK)}، بينما تُظهر المنصات الإعلانية ${K(lang, platformSpendK)} (أقل بنسبة ${gap}%) — رسوم غير مُفصح عنها أو نقص في التنفيذ.`),
          });
        }
      }
      return {
        id: v.id, name: v.name, category: v.category, campaigns: cs.length,
        reported: {
          spendK: r1(s((c) => c.reported.spendK)), leads: s((c) => c.reported.leads), qualified: s((c) => c.reported.qualified),
          contracts: s((c) => c.reported.contracts), salesM: r1(s((c) => c.reported.salesM)),
          respHrs: cs.some((c) => c.reported.respHrs !== null) ? r1(cs.filter((c) => c.reported.respHrs !== null).reduce((t, c) => t + c.reported.respHrs!, 0) / cs.filter((c) => c.reported.respHrs !== null).length) : null,
        },
        platformSpendK, digitalReportedSpendK,
        verified: {
          costK: r1(s((c) => c.verified.costK)), leads: s((c) => c.verified.leads), qualified: s((c) => c.verified.qualified), won: s((c) => c.verified.won),
          salesM: r1(s((c) => c.verified.salesM)), pipelineM: r1(s((c) => c.verified.pipelineM)),
          respHrs: respList.length ? r1(respList.reduce((t, c) => t + c.verified.respHrs! * c.verified.leads, 0) / Math.max(1, respList.reduce((t, c) => t + c.verified.leads, 0))) : null,
        },
        flags,
      };
    });

  const last = (src: string) => syncs.find((x) => x.source === src);
  const digitalCampaigns = rows.filter((r) => r.digital);
  const sources: SourceStatus[] = [
    { key: "VENDOR_REPORTS", mode: last("VENDOR_REPORT") ? "upload" : "seed", connected: true, lastSync: last("VENDOR_REPORT")?.createdAt.toISOString() ?? null, records: campaigns.reduce((s, c) => s + c.months.length, 0), coverage: `${campaigns.filter((c) => c.months.length).length}/${campaigns.length}` },
    { key: "ADS", mode: adsMode(), connected: ads.length > 0, lastSync: last("ADS")?.createdAt.toISOString() ?? null, records: ads.length, coverage: `${digitalCampaigns.filter((r) => r.platform).length}/${digitalCampaigns.length}` },
    { key: "CRM", mode: crmMode(), connected: leads.length > 0, lastSync: crmSyncs[0]?.createdAt.toISOString() ?? null, records: leads.length, coverage: leads.length ? `${Math.round((leads.filter((l) => l.campaignId).length / leads.length) * 100)}%` : "0%" },
    { key: "ORACLE", mode: oracleMode(), connected: inv.integration.invoices > 0, lastSync: inv.integration.lastSync, records: inv.integration.invoices + inv.integration.purchaseOrders, coverage: `${new Set(inv.invoices.map((i) => i.vendorId)).size}/${vendorRows.length}` },
    { key: "OUTLOOK", mode: `${outlookMode()} · ${outlookDelivery()}`, connected: outlookMode() === "live", lastSync: null, records: 0, coverage: "—" },
    { key: "DELIVERABLES", mode: "manual", connected: deliverables > 0, lastSync: null, records: deliverables, coverage: `${vendorRows.length}/${vendorRows.length}` },
    { key: "MMM_HISTORY", mode: "seed", connected: weeks > 0, lastSync: null, records: weeks, coverage: `${weeks} ${tx(lang, "weeks", "أسبوعاً")}` },
  ];

  return { campaigns: rows, vendors: vendorRows, sources, flags: vendorRows.flatMap((v) => v.flags.map((f) => ({ ...f, vendorId: v.id, vendor: v.name }))) };
}
export type Unified = Awaited<ReturnType<typeof buildUnified>>;

void nm;
