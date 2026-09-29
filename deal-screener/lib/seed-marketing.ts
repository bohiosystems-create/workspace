import { prisma } from "./prisma";
import { ensureSeeded } from "./seed";

// Seeds marketing vendors, campaigns and 5 months of funnel data (Jan–May 2026).
// Idempotent. The funnel per month is generated from per-campaign rates so the
// numbers are internally consistent (spend -> leads -> qualified -> viewings ->
// reservations -> contracts -> revenue).

export const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

type CampaignSpec = {
  vendor: string;
  asset: string;
  name: string;
  channel: string;
  status: "LIVE" | "PAUSED" | "ENDED";
  budgetK: number;
  start: string;
  end: string;
  spendK: number[]; // per month
  cplSar: number[]; // cost per lead per month (SAR)
  ctr: number; // clicks / impressions
  leadRate: number; // leads / clicks
  qr: number[]; // qualified / leads, per month
  vr: number; // viewings / qualified
  rr: number; // reservations / viewings
  cr: number; // contracts / reservations
  unitM: number; // avg contract value, SAR M
  resp: number[]; // avg first-response hours
};

const VENDORS = [
  { name: "Tasweeq Digital", category: "Performance media", model: "Media buy", retainerK: 18, slaResponseHrs: 4, slaQualifiedPct: 20, contractEnd: "2026-12-31", contact: "Layla Nasser" },
  { name: "PropertyHub KSA", category: "Property portal", model: "Media buy", retainerK: 0, slaResponseHrs: 6, slaQualifiedPct: 25, contractEnd: "2026-07-31", contact: "Omar Zahrani" },
  { name: "Mubasher Brokerage Network", category: "Broker network", model: "Commission", retainerK: 0, slaResponseHrs: 12, slaQualifiedPct: 55, contractEnd: "2027-03-31", contact: "Khalid Otaibi" },
  { name: "Nakhla Communications", category: "PR & brand", model: "Retainer", retainerK: 45, slaResponseHrs: 24, slaQualifiedPct: 0, contractEnd: "2026-08-31", contact: "Rania Habib" },
  { name: "Hajar Outdoor", category: "Outdoor", model: "Media buy", retainerK: 0, slaResponseHrs: 24, slaQualifiedPct: 0, contractEnd: "2026-06-30", contact: "Faisal Qahtani" },
  { name: "Sada Influence", category: "Influencer", model: "Retainer", retainerK: 12, slaResponseHrs: 8, slaQualifiedPct: 15, contractEnd: "2026-09-30", contact: "Noor Bakri" },
];

const CAMPAIGNS: CampaignSpec[] = [
  { vendor: "Tasweeq Digital", asset: "Ash Shati Residences", name: "Ash Shati — Search & Social Always-On", channel: "Google / Meta", status: "LIVE", budgetK: 700, start: "2026-01-01", end: "2026-08-31",
    spendK: [92, 96, 98, 104, 110], cplSar: [255, 260, 265, 262, 270], ctr: 0.014, leadRate: 0.12, qr: [0.24, 0.23, 0.22, 0.21, 0.22], vr: 0.46, rr: 0.2, cr: 0.72, unitM: 1.45, resp: [3.2, 3.5, 3.1, 3.8, 3.4] },
  { vendor: "Tasweeq Digital", asset: "Andalus Quarter", name: "Andalus — Off-plan Launch Funnel", channel: "Meta / Snap", status: "LIVE", budgetK: 520, start: "2026-02-01", end: "2026-09-30",
    spendK: [0, 70, 88, 96, 102], cplSar: [0, 290, 320, 355, 395], ctr: 0.011, leadRate: 0.14, qr: [0, 0.19, 0.16, 0.14, 0.12], vr: 0.38, rr: 0.16, cr: 0.6, unitM: 1.2, resp: [0, 5.8, 7.4, 9.1, 11.6] },
  { vendor: "PropertyHub KSA", asset: "Ash Shati Residences", name: "Ash Shati — Featured Listings", channel: "Portal", status: "LIVE", budgetK: 360, start: "2026-01-01", end: "2026-07-31",
    spendK: [48, 48, 50, 50, 52], cplSar: [320, 315, 320, 325, 320], ctr: 0.02, leadRate: 0.1, qr: [0.3, 0.29, 0.3, 0.28, 0.29], vr: 0.5, rr: 0.14, cr: 0.75, unitM: 1.4, resp: [4.2, 4.6, 4.4, 5.1, 4.8] },
  { vendor: "PropertyHub KSA", asset: "Marina Tower", name: "Marina Tower — Retail & Residential Spotlight", channel: "Portal", status: "LIVE", budgetK: 300, start: "2026-01-01", end: "2026-07-31",
    spendK: [40, 42, 42, 44, 44], cplSar: [380, 385, 380, 390, 385], ctr: 0.017, leadRate: 0.09, qr: [0.27, 0.25, 0.26, 0.24, 0.25], vr: 0.44, rr: 0.12, cr: 0.7, unitM: 2.6, resp: [5.0, 5.4, 6.8, 7.1, 7.9] },
  { vendor: "Mubasher Brokerage Network", asset: "Marina Tower", name: "Marina Tower — Broker Push", channel: "Broker network", status: "LIVE", budgetK: 900, start: "2026-01-01", end: "2026-12-31",
    spendK: [22, 41, 58, 63, 72], cplSar: [3400, 3200, 3200, 3100, 3200], ctr: 0.03, leadRate: 0.05, qr: [0.62, 0.64, 0.66, 0.65, 0.67], vr: 0.7, rr: 0.4, cr: 0.85, unitM: 2.9, resp: [9, 8.5, 9.4, 8.8, 9.1] },
  { vendor: "Mubasher Brokerage Network", asset: "Ash Shati Residences", name: "Ash Shati — Broker Push", channel: "Broker network", status: "LIVE", budgetK: 600, start: "2026-02-01", end: "2026-12-31",
    spendK: [0, 30, 40, 44, 50], cplSar: [0, 3000, 3000, 2950, 3000], ctr: 0.03, leadRate: 0.05, qr: [0, 0.6, 0.58, 0.61, 0.6], vr: 0.68, rr: 0.38, cr: 0.84, unitM: 1.5, resp: [0, 10, 11, 10.5, 11.5] },
  { vendor: "Nakhla Communications", asset: "Andalus Quarter", name: "Andalus — Launch PR & Media Relations", channel: "PR", status: "LIVE", budgetK: 380, start: "2026-01-01", end: "2026-08-31",
    spendK: [45, 45, 60, 45, 45], cplSar: [900, 920, 880, 950, 940], ctr: 0.004, leadRate: 0.06, qr: [0.18, 0.17, 0.2, 0.18, 0.17], vr: 0.4, rr: 0.2, cr: 0.6, unitM: 1.2, resp: [14, 15, 13, 16, 15] },
  { vendor: "Hajar Outdoor", asset: "Marina Tower", name: "Marina Tower — Corniche Billboards", channel: "OOH", status: "LIVE", budgetK: 420, start: "2026-02-01", end: "2026-06-30",
    spendK: [0, 85, 85, 85, 85], cplSar: [0, 1400, 1450, 1500, 1550], ctr: 0.0008, leadRate: 0.08, qr: [0, 0.14, 0.13, 0.12, 0.11], vr: 0.35, rr: 0.22, cr: 0.6, unitM: 2.4, resp: [0, 20, 22, 26, 30] },
  { vendor: "Sada Influence", asset: "Andalus Quarter", name: "Andalus — Creator Programme", channel: "Instagram / TikTok", status: "PAUSED", budgetK: 240, start: "2026-01-01", end: "2026-06-30",
    spendK: [40, 44, 46, 0, 0], cplSar: [420, 430, 450, 0, 0], ctr: 0.009, leadRate: 0.1, qr: [0.11, 0.1, 0.08, 0, 0], vr: 0.3, rr: 0.15, cr: 0.5, unitM: 1.1, resp: [6, 7, 8, 0, 0] },
  { vendor: "Sada Influence", asset: "Ash Shati Residences", name: "Ash Shati — Lifestyle Creators", channel: "Instagram / TikTok", status: "LIVE", budgetK: 200, start: "2026-03-01", end: "2026-08-31",
    spendK: [0, 0, 32, 34, 36], cplSar: [0, 0, 430, 420, 415], ctr: 0.01, leadRate: 0.11, qr: [0, 0, 0.21, 0.23, 0.24], vr: 0.42, rr: 0.14, cr: 0.7, unitM: 1.4, resp: [0, 0, 6.5, 6.8, 7.2] },
];

// Deterministic small wiggle so months are not perfectly smooth.
function wiggle(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return 0.94 + (x - Math.floor(x)) * 0.12; // 0.94 .. 1.06
}

export async function ensureMarketingSeeded() {
  await ensureSeeded();
  if ((await prisma.vendor.count()) > 0) return;

  const vendorIds: Record<string, string> = {};
  for (const v of VENDORS) {
    const row = await prisma.vendor.create({ data: { ...v, contractEnd: new Date(v.contractEnd) } });
    vendorIds[v.name] = row.id;
  }

  const assets = await prisma.asset.findMany();
  const assetId = (name: string) => {
    const a = assets.find((x) => x.name === name);
    if (!a) throw new Error(`Seed asset missing: ${name}`);
    return a.id;
  };

  let seed = 1;
  for (const c of CAMPAIGNS) {
    const months = MONTHS.map((month, i) => {
      const spendK = c.spendK[i];
      if (!spendK) return null;
      const w = () => wiggle(seed++);
      const leads = Math.round(((spendK * 1000) / c.cplSar[i]) * w());
      const clicks = Math.round(leads / c.leadRate);
      const impressionsK = clicks / c.ctr / 1000;
      const qualified = Math.round(leads * c.qr[i]);
      const viewings = Math.round(qualified * c.vr * w());
      const reservations = Math.round(viewings * c.rr * w());
      const contracts = Math.round(reservations * c.cr);
      const revenueM = Math.round(contracts * c.unitM * (0.97 + (w() - 0.94) * 0.5) * 10) / 10;
      return {
        month, spendK, impressionsK: Math.round(impressionsK), clicks, leads, qualified,
        viewings, reservations, contracts, revenueM, respHrs: c.resp[i],
      };
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    await prisma.campaign.create({
      data: {
        vendorId: vendorIds[c.vendor],
        assetId: assetId(c.asset),
        name: c.name,
        channel: c.channel,
        status: c.status,
        budgetK: c.budgetK,
        startDate: new Date(c.start),
        endDate: new Date(c.end),
        months: { create: months },
      },
    });
  }
}
