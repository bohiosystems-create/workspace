import { single } from "./single";
// Ad-account connector (Meta, Google, Snap, TikTok) — what the platforms say was actually spent,
// independent of the vendor's report. Same pattern as the CRM layer:
//   ADS_MODE=mock    sample weekly data consistent with the campaigns (default)
//   ADS_MODE=ingest  rows are pushed to POST /api/ingest/ad-spend (x-api-key: INGEST_API_KEY)
//   ADS_MODE=meta | google — pull adapters NOT implemented yet (see docs/data-sources.md)
import { prisma } from "./prisma";
import { ensureMarketingSeeded } from "./seed-marketing";

export type AdWeekRow = { week: string; platform: "META" | "GOOGLE" | "SNAP" | "TIKTOK"; campaignCode: string; spendK: number; impressionsK: number; clicks: number; platformLeads: number };
export const PLATFORMS = ["META", "GOOGLE", "SNAP", "TIKTOK"] as const;

export const adsMode = () => {
  const m = process.env.ADS_MODE;
  return m === "ingest" || m === "meta" || m === "google" ? m : "mock";
};

// Which platforms a channel buys on, and the split.
const SPLIT: Record<string, [AdWeekRow["platform"], number][]> = {
  "Google / Meta": [["GOOGLE", 0.6], ["META", 0.4]],
  "Meta / Snap": [["META", 0.7], ["SNAP", 0.3]],
  "Instagram / TikTok": [["META", 0.5], ["TIKTOK", 0.5]],
};
export const isDigital = (channel: string) => channel in SPLIT;

// Sample deviation: platform spend ÷ vendor-reported spend (below 1 = vendor reports more than was bought).
const MEDIA_RATIO: Record<string, number> = { "AND-OFFPLAN-26": 0.88, "ASH-SEARCH-26": 0.97 };

function mondaysOf(month: string) {
  const out: string[] = [];
  const d = new Date(`${month}-01T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  for (; d.toISOString().slice(0, 7) === month; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export async function mockRows(): Promise<AdWeekRow[]> {
  const campaigns = await prisma.campaign.findMany({ include: { months: true } });
  const rows: AdWeekRow[] = [];
  for (const c of campaigns) {
    if (!c.crmCode || !isDigital(c.channel)) continue;
    const ratio = MEDIA_RATIO[c.crmCode] ?? 0.99;
    for (const m of c.months) {
      const weeks = mondaysOf(m.month);
      for (const w of weeks) {
        for (const [platform, share] of SPLIT[c.channel]) {
          const spendK = Math.round(((m.spendK * ratio * share) / weeks.length) * 10) / 10;
          rows.push({
            week: w, platform, campaignCode: c.crmCode, spendK,
            impressionsK: Math.round(spendK / 0.045), clicks: Math.round((spendK / 0.045) * 1000 * 0.012),
            platformLeads: Math.round(((m.leads * 1.12 * share) / weeks.length)),
          });
        }
      }
    }
  }
  return rows;
}

export async function upsertAdRows(rows: AdWeekRow[]) {
  const existing = new Map((await prisma.adPlatformWeek.findMany()).map((r) => [`${r.week}|${r.platform}|${r.campaignCode}`, r]));
  const fresh: AdWeekRow[] = [];
  for (const r of rows) {
    const ex = existing.get(`${r.week}|${r.platform}|${r.campaignCode}`);
    if (!ex) fresh.push(r);
    else if (ex.spendK !== r.spendK || ex.platformLeads !== r.platformLeads) await prisma.adPlatformWeek.update({ where: { id: ex.id }, data: r });
  }
  for (let i = 0; i < fresh.length; i += 500) await prisma.adPlatformWeek.createMany({ data: fresh.slice(i, i + 500) });
  return rows.length;
}

export async function syncAds() {
  await ensureMarketingSeeded();
  const mode = adsMode();
  if (mode === "ingest") throw new Error("ADS_MODE=ingest: ad-platform rows are pushed to /api/ingest/ad-spend; there is nothing to pull.");
  if (mode !== "mock") throw new Error(`The ${mode} ads adapter is not implemented yet — use ADS_MODE=ingest or see docs/data-sources.md.`);
  const n = await upsertAdRows(await mockRows());
  await prisma.sourceSync.create({ data: { source: "ADS", mode, rows: n } });
  return n;
}

export const ensureAdsSynced = single(async function ensureAdsSyncedImpl() {
  await ensureMarketingSeeded();
  if (adsMode() === "mock" && (await prisma.adPlatformWeek.count()) === 0) await syncAds();
});
