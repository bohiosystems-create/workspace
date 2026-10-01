// CRM integration layer (vendor-neutral).
//
// The CRM is the source of truth for what a vendor's leads actually did: were they real, how fast did
// someone respond, did they view / reserve / sign, and for how much. This module defines a canonical lead
// contract, an adapter interface, and the reconciliation of "vendor-reported" vs "CRM-verified" numbers.
//
// Ways data gets in (CRM_MODE):
//   mock        — built-in sample leads, consistent with the campaign data (default; used for the demo)
//   ingest      — nothing is pulled; the CRM / an iPaaS (Power Automate, Zapier, MuleSoft…) POSTs canonical
//                 leads to /api/crm/leads with the x-api-key header (CRM_INGEST_KEY)
//   salesforce | dynamics — pull adapters: NOT implemented yet. The field mapping and open questions are in
//                 docs/crm-integration.md; the only code needed is `fetchLeads` for that CRM.
// Whatever the source, leads are normalised to CanonicalLead (stage names mapped via STAGE_MAP).

import { prisma } from "./prisma";
import { ensureMarketingSeeded } from "./seed-marketing";
import { type Lang, tx, K, M, nm, hrs , an } from "./i18n";

const TODAY = new Date("2026-06-08");
const DAY = 86_400_000;
const HOUR = 3_600_000;

export type CrmStage = "NEW" | "CONTACTED" | "QUALIFIED" | "VIEWING" | "RESERVED" | "WON" | "LOST";
export type CanonicalLead = {
  id: string; // id in the CRM
  createdAt: string; // ISO
  source: string; // campaign code as captured in the CRM (utm_campaign / campaign)
  stage: CrmStage;
  firstResponseAt?: string | null;
  owner?: string | null;
  dealValueM?: number | null; // SAR M
  closedAt?: string | null;
  lostReason?: string | null;
};

// CRM-specific status text → canonical stage. Extend per CRM (see docs/crm-integration.md).
export const STAGE_MAP: Record<string, CrmStage> = {
  new: "NEW", open: "NEW", contacted: "CONTACTED", working: "CONTACTED", qualified: "QUALIFIED",
  "site visit": "VIEWING", viewing: "VIEWING", reserved: "RESERVED", reservation: "RESERVED", booked: "RESERVED",
  won: "WON", "closed won": "WON", "contract signed": "WON", lost: "LOST", "closed lost": "LOST", disqualified: "LOST",
};
export const toStage = (s: string): CrmStage => (STAGE_MAP[s.trim().toLowerCase()] ?? (s.toUpperCase() as CrmStage));
const STAGES: CrmStage[] = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING", "RESERVED", "WON", "LOST"];
export const isStage = (s: unknown): s is CrmStage => typeof s === "string" && (STAGES as string[]).includes(s);

export const crmMode = () => {
  const m = process.env.CRM_MODE;
  return m === "ingest" || m === "salesforce" || m === "dynamics" ? m : "mock";
};

export type CrmContext = {
  campaigns: { name: string; crmCode: string | null; vendor: string; months: { month: string; leads: number; qualified: number; viewings: number; reservations: number; contracts: number; revenueM: number; respHrs: number }[] }[];
};

export interface CrmAdapter {
  name: string;
  fetchLeads(ctx: CrmContext, since: Date): Promise<CanonicalLead[]>;
}

const notImplemented = (name: string): CrmAdapter => ({
  name,
  fetchLeads: async () => {
    throw new Error(`The ${name} adapter is not implemented yet. Use CRM_MODE=ingest (push leads to /api/crm/leads) or see docs/crm-integration.md.`);
  },
});

// ------------------------------------------------------------------ mock CRM
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// How the CRM differs from what each vendor reports (lead / win ratios, response-time understatement).
const DEVIATION: Record<string, { lead: number; won: number; resp: number; deal: number }> = {
  "Tasweeq Digital": { lead: 0.93, won: 0.9, resp: 1.4, deal: 0.95 },
  "PropertyHub KSA": { lead: 0.97, won: 0.95, resp: 1.05, deal: 0.97 },
  "Mubasher Brokerage Network": { lead: 1.0, won: 0.9, resp: 1.0, deal: 0.97 },
  "Nakhla Communications": { lead: 0.85, won: 0.8, resp: 1.1, deal: 0.95 },
  "Hajar Outdoor": { lead: 0.7, won: 0.67, resp: 1.3, deal: 0.9 },
  "Sada Influence": { lead: 0.9, won: 1.0, resp: 1.0, deal: 0.95 },
};
const OWNERS = ["Sales Desk A", "Sales Desk B", "Sales Desk C", "Broker Desk"];
const LOST = ["Price", "Location", "Financing", "Chose competitor", "No response", "Not a buyer"];

const mockAdapter: CrmAdapter = {
  name: "mock",
  async fetchLeads(ctx) {
    const out: CanonicalLead[] = [];
    ctx.campaigns.forEach((c, ci) => {
      const dev = DEVIATION[c.vendor] ?? { lead: 1, won: 1, resp: 1, deal: 1 };
      for (const m of c.months) {
        const rand = rng(ci * 100 + Number(m.month.slice(5)));
        const n = Math.round(m.leads * dev.lead);
        const w0 = Math.round(m.contracts * dev.won);
        const q = Math.min(n, Math.round(m.qualified * dev.lead));
        const v = Math.min(q, Math.round(m.viewings * dev.lead));
        const r = Math.min(v, Math.round(m.reservations * dev.lead));
        const w = Math.min(r, w0);
        const monthStart = new Date(`${m.month}-01T00:00:00Z`).getTime();
        const daysInMonth = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)), 0)).getUTCDate();
        const unitM = m.contracts > 0 ? m.revenueM / m.contracts : 1.4;
        // Vendors with poor lead quality get more "not a buyer" losses.
        const lowQuality = m.leads > 0 && m.qualified / m.leads < 0.15;
        for (let i = 0; i < n; i++) {
          const created = monthStart + Math.floor(rand() * daysInMonth * DAY * 0.97);
          const stageIdx = i < w ? "WON" : i < r ? "RESERVED" : i < v ? "VIEWING" : i < q ? "QUALIFIED" : null;
          let stage: CrmStage = (stageIdx ?? "CONTACTED") as CrmStage;
          let responded = true;
          if (!stageIdx) {
            const x = rand();
            if (x < 0.04) { stage = "NEW"; responded = false; }
            else if (x < 0.55) stage = "LOST";
          }
          const respH = Math.max(0.2, m.respHrs * dev.resp * (0.4 + rand() * 1.4));
          const firstResponseAt = responded ? new Date(created + respH * HOUR).toISOString() : null;
          let closedAt: string | null = null;
          let dealValueM: number | null = null;
          if (stage === "WON") {
            closedAt = new Date(Math.min(created + (14 + rand() * 31) * DAY, TODAY.getTime())).toISOString();
            dealValueM = Math.round(unitM * dev.deal * (0.9 + rand() * 0.2) * 100) / 100;
          } else if (stage === "RESERVED") dealValueM = Math.round(unitM * dev.deal * (0.9 + rand() * 0.2) * 100) / 100;
          else if (stage === "LOST") closedAt = new Date(Math.min(created + (3 + rand() * 20) * DAY, TODAY.getTime())).toISOString();
          out.push({
            id: `L-${c.crmCode}-${m.month}-${i}`,
            createdAt: new Date(created).toISOString(),
            source: (rand() < 0.01 ? (c.crmCode ?? "").toLowerCase().replace("search", "serach") : c.crmCode) ?? "",
            stage, firstResponseAt, owner: OWNERS[Math.floor(rand() * OWNERS.length)], dealValueM, closedAt,
            lostReason: stage === "LOST" ? (lowQuality && rand() < 0.55 ? "Not a buyer" : LOST[Math.floor(rand() * LOST.length)]) : null,
          });
        }
      }
    });
    // Leads that arrive with no / unknown campaign attribution (walk-ins, WhatsApp, untagged links).
    const r2 = rng(99);
    for (let i = 0; i < 60; i++) {
      const created = new Date("2026-01-05T00:00:00Z").getTime() + Math.floor(r2() * 150 * DAY);
      out.push({
        id: `L-UNATTRIBUTED-${i}`, createdAt: new Date(created).toISOString(), source: ["", "walk-in", "whatsapp", "organic"][i % 4],
        stage: r2() < 0.2 ? "WON" : "CONTACTED", firstResponseAt: new Date(created + 3 * HOUR).toISOString(), owner: OWNERS[i % 4],
        dealValueM: null, closedAt: null, lostReason: null,
      });
    }
    return out;
  },
};

export const adapterFor = (mode: string): CrmAdapter | null =>
  mode === "mock" ? mockAdapter : mode === "salesforce" ? notImplemented("Salesforce") : mode === "dynamics" ? notImplemented("Microsoft Dynamics 365") : null;

// ---------------------------------------------------------------------- sync
export async function upsertLeads(leads: CanonicalLead[]) {
  const campaigns = await prisma.campaign.findMany();
  const byCode = new Map(campaigns.filter((c) => c.crmCode).map((c) => [c.crmCode!.toLowerCase(), c.id]));
  const existing = new Map((await prisma.crmLead.findMany()).map((l) => [l.crmId, l]));
  const fresh: any[] = [];
  let matched = 0;
  for (const l of leads) {
    const campaignId = byCode.get(String(l.source ?? "").trim().toLowerCase()) ?? null;
    const row = {
      crmId: String(l.id), createdAt: new Date(l.createdAt), source: String(l.source ?? ""), campaignId, stage: l.stage,
      firstResponseAt: l.firstResponseAt ? new Date(l.firstResponseAt) : null, owner: l.owner ?? null,
      dealValueM: l.dealValueM ?? null, closedAt: l.closedAt ? new Date(l.closedAt) : null, lostReason: l.lostReason ?? null,
    };
    if (campaignId) matched++;
    const ex = existing.get(row.crmId);
    if (!ex) fresh.push(row);
    else if (ex.stage !== row.stage || ex.campaignId !== row.campaignId || ex.dealValueM !== row.dealValueM || (ex.firstResponseAt?.getTime() ?? 0) !== (row.firstResponseAt?.getTime() ?? 0))
      await prisma.crmLead.update({ where: { id: ex.id }, data: { ...row, syncedAt: new Date() } });
  }
  for (let i = 0; i < fresh.length; i += 500) await prisma.crmLead.createMany({ data: fresh.slice(i, i + 500) });
  return { received: leads.length, matched, unmatched: leads.length - matched };
}

export async function syncCrm() {
  await ensureMarketingSeeded();
  const mode = crmMode();
  const adapter = adapterFor(mode);
  if (!adapter) throw new Error("CRM_MODE=ingest: leads are pushed to /api/crm/leads, there is nothing to pull.");
  const campaigns = await prisma.campaign.findMany({ include: { vendor: true, months: true } });
  const leads = await adapter.fetchLeads(
    { campaigns: campaigns.map((c) => ({ name: c.name, crmCode: c.crmCode, vendor: c.vendor.name, months: c.months })) },
    new Date("2026-01-01")
  );
  const res = await upsertLeads(leads);
  await prisma.crmSync.create({ data: { mode, leads: res.received, matched: res.matched, unmatched: res.unmatched } });
  return res;
}

export async function ensureCrmSynced() {
  await ensureMarketingSeeded();
  if (crmMode() === "mock" && (await prisma.crmSync.count()) === 0) await syncCrm();
}

// ------------------------------------------------------------ reconciliation
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const gap = (reported: number, crm: number) => (reported > 0 ? r1(((reported - crm) / reported) * 100) : 0);

export type CrmFlag = { code: string; severity: "crit" | "warn" | "info"; text: string };
export type CrmCampaignRow = {
  id: string; name: string; vendorId: string; vendor: string; code: string | null;
  reportedLeads: number; crmLeads: number; leadGapPct: number;
  reportedContracts: number; crmWon: number; wonGapPct: number;
  reportedSalesM: number; crmSalesM: number; salesGapPct: number;
  reportedRespHrs: number | null; crmRespHrs: number | null; untouched: number;
  stages: Record<string, number>; topLost: { reason: string; count: number }[];
  spendK: number; verifiedCostToSalesPct: number | null;
};
export type CrmDashboard = {
  integration: { mode: string; lastSync: string | null; leads: number; matched: number; unmatched: number; attributionGapPct: number };
  vendors: (Omit<CrmCampaignRow, "id" | "name" | "code" | "stages" | "topLost" | "vendorId"> & { id: string; flags: CrmFlag[] })[];
  campaigns: CrmCampaignRow[];
  stages: { stage: string; value: number }[];
  flags: (CrmFlag & { vendorId: string; vendor: string })[];
};

export async function buildCrmDashboard(lang: Lang = "en"): Promise<CrmDashboard> {
  await ensureCrmSynced();
  const [vendors, campaigns, leads, syncs] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { months: true } }),
    prisma.crmLead.findMany(),
    prisma.crmSync.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
  ]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));

  const rows: CrmCampaignRow[] = campaigns.map((c) => {
    const ls = leads.filter((l) => l.campaignId === c.id);
    const ms = [...c.months].sort((a, b) => a.month.localeCompare(b.month));
    const sum = (k: "leads" | "contracts" | "revenueM" | "spendK") => ms.reduce((s, m) => s + m[k], 0);
    const won = ls.filter((l) => l.stage === "WON");
    const crmSalesM = r1(won.reduce((s, l) => s + (l.dealValueM ?? 0), 0));
    const resp = ls.filter((l) => l.firstResponseAt).map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / HOUR);
    const withResp = ms.filter((m) => m.respHrs > 0);
    const stages: Record<string, number> = {};
    for (const l of ls) stages[l.stage] = (stages[l.stage] ?? 0) + 1;
    const lost = new Map<string, number>();
    for (const l of ls) if (l.stage === "LOST" && l.lostReason) lost.set(l.lostReason, (lost.get(l.lostReason) ?? 0) + 1);
    const spendK = sum("spendK");
    return {
      id: c.id, name: c.name, vendorId: c.vendorId, vendor: vName.get(c.vendorId)!, code: c.crmCode,
      reportedLeads: sum("leads"), crmLeads: ls.length, leadGapPct: gap(sum("leads"), ls.length),
      reportedContracts: sum("contracts"), crmWon: won.length, wonGapPct: gap(sum("contracts"), won.length),
      reportedSalesM: r1(sum("revenueM")), crmSalesM, salesGapPct: gap(sum("revenueM"), crmSalesM),
      reportedRespHrs: withResp.length ? r1(withResp.reduce((s, m) => s + m.respHrs, 0) / withResp.length) : null,
      crmRespHrs: median(resp) === null ? null : r1(median(resp)!),
      untouched: ls.filter((l) => l.stage === "NEW" && !l.firstResponseAt && TODAY.getTime() - l.createdAt.getTime() > 2 * DAY).length,
      stages, topLost: [...lost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => ({ reason, count })),
      spendK: Math.round(spendK), verifiedCostToSalesPct: crmSalesM > 0 ? Math.round((spendK / (crmSalesM * 1000)) * 10000) / 100 : null,
    };
  });

  const flagsFor = (v: { id: string; name: string }, cs: CrmCampaignRow[], slaHrs: number): CrmFlag[] => {
    const flags: CrmFlag[] = [];
    const rl = cs.reduce((s, c) => s + c.reportedLeads, 0), cl = cs.reduce((s, c) => s + c.crmLeads, 0);
    const rw = cs.reduce((s, c) => s + c.reportedContracts, 0), cw = cs.reduce((s, c) => s + c.crmWon, 0);
    const lg = gap(rl, cl), wg = gap(rw, cw);
    if (lg > 15) flags.push({ code: "LEAD_GAP", severity: lg > 25 ? "crit" : "warn", text: tx(lang, `Vendor reports ${rl} leads but the CRM only has ${cl} (${lg}% fewer) — duplicates, spam or leads never delivered.`, `يُبلّغ المورد عن ${an(rl, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} بينما يظهر في نظام إدارة العملاء ${cl} فقط (أقل بنسبة ${lg}%) — تكرارات أو بلاغات مزيفة أو عملاء لم يُسلَّموا.`) });
    if (wg > 20 && rw >= 3) flags.push({ code: "WON_GAP", severity: wg > 35 ? "crit" : "warn", text: tx(lang, `Vendor claims ${rw} signed contracts; the CRM shows ${cw} won (${wg}% fewer).`, `يدّعي المورد ${rw} عقوداً موقّعة بينما يُظهر النظام ${cw} صفقة مغلقة (أقل بنسبة ${wg}%).`) });
    const resps = cs.filter((c) => c.crmRespHrs !== null && c.reportedRespHrs !== null);
    if (resps.length) {
      const crm = r1(resps.reduce((s, c) => s + c.crmRespHrs! * c.crmLeads, 0) / Math.max(1, resps.reduce((s, c) => s + c.crmLeads, 0)));
      const rep = r1(resps.reduce((s, c) => s + c.reportedRespHrs!, 0) / resps.length);
      if (crm > slaHrs && crm > rep * 1.2) flags.push({ code: "RESPONSE_UNDERSTATED", severity: crm > slaHrs * 1.5 ? "crit" : "warn", text: tx(lang, `CRM-measured first response is ${crm}h (median) vs ${rep}h reported by the vendor and a ${slaHrs}h SLA.`, `زمن أول استجابة المقاس في النظام ${hrs(lang, crm)} (وسيط) مقابل ${hrs(lang, rep)} يُبلّغ بها المورد و${hrs(lang, slaHrs)} في اتفاقية الخدمة.`) });
    }
    const unt = cs.reduce((s, c) => s + c.untouched, 0);
    if (cl > 0 && unt / cl > 0.03) flags.push({ code: "UNTOUCHED", severity: "warn", text: tx(lang, `${unt} leads (${r1((unt / cl) * 100)}%) were never contacted after 48 hours.`, `${an(unt, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} (${r1((unt / cl) * 100)}%) لم يُتواصل معهم بعد مرور 48 ساعة.`) });
    void v;
    return flags;
  };

  const vendorRows = vendors.map((v) => {
    const cs = rows.filter((r) => r.vendorId === v.id);
    const sum = (k: "reportedLeads" | "crmLeads" | "reportedContracts" | "crmWon" | "reportedSalesM" | "crmSalesM" | "untouched" | "spendK") => cs.reduce((s, c) => s + c[k], 0);
    const resps = cs.filter((c) => c.crmRespHrs !== null);
    const rr = cs.filter((c) => c.reportedRespHrs !== null);
    const crmSalesM = r1(sum("crmSalesM"));
    return {
      id: v.id, vendor: v.name,
      reportedLeads: sum("reportedLeads"), crmLeads: sum("crmLeads"), leadGapPct: gap(sum("reportedLeads"), sum("crmLeads")),
      reportedContracts: sum("reportedContracts"), crmWon: sum("crmWon"), wonGapPct: gap(sum("reportedContracts"), sum("crmWon")),
      reportedSalesM: r1(sum("reportedSalesM")), crmSalesM, salesGapPct: gap(sum("reportedSalesM"), crmSalesM),
      reportedRespHrs: rr.length ? r1(rr.reduce((s, c) => s + c.reportedRespHrs!, 0) / rr.length) : null,
      crmRespHrs: resps.length ? r1(resps.reduce((s, c) => s + c.crmRespHrs! * c.crmLeads, 0) / Math.max(1, resps.reduce((s, c) => s + c.crmLeads, 0))) : null,
      untouched: sum("untouched"), spendK: sum("spendK"),
      verifiedCostToSalesPct: crmSalesM > 0 ? Math.round((sum("spendK") / (crmSalesM * 1000)) * 10000) / 100 : null,
      flags: flagsFor(v, cs, v.slaResponseHrs),
    };
  }).sort((a, b) => b.spendK - a.spendK);

  const matched = leads.filter((l) => l.campaignId).length;
  const order = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING", "RESERVED", "WON", "LOST"];
  const last = syncs[0];
  return {
    integration: {
      mode: crmMode(), lastSync: last ? last.createdAt.toISOString() : null, leads: leads.length, matched, unmatched: leads.length - matched,
      attributionGapPct: leads.length ? r1(((leads.length - matched) / leads.length) * 100) : 0,
    },
    vendors: vendorRows,
    campaigns: rows.sort((a, b) => b.spendK - a.spendK),
    stages: order.map((s) => ({ stage: s, value: leads.filter((l) => l.stage === s).length })),
    flags: vendorRows.flatMap((v) => v.flags.map((f) => ({ ...f, vendorId: v.id, vendor: v.vendor }))),
  };
}

void K; void M; void nm;
