import { NextResponse } from "next/server";
import { upsertAdRows, PLATFORMS, type AdWeekRow } from "@/lib/adaccounts";
import { prisma } from "@/lib/prisma";
import { ensureMarketingSeeded } from "@/lib/seed-marketing";

export const runtime = "nodejs";

// Push endpoint for ad-platform data (any connector / iPaaS / scheduled export).
//   POST /api/ingest/ad-spend   header: x-api-key: <INGEST_API_KEY>
//   body: { "rows": [ { week: "2026-06-01", platform: "META", campaignCode, spendSar, impressions, clicks, platformLeads } ] }
export async function POST(req: Request) {
  const key = process.env.INGEST_API_KEY;
  if (!key) return NextResponse.json({ error: "Ingest is disabled (INGEST_API_KEY is not set)." }, { status: 503 });
  if (req.headers.get("x-api-key") !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    await ensureMarketingSeeded();
    const body = await req.json();
    const input: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (!input.length || input.length > 10000) return NextResponse.json({ error: "Send between 1 and 10000 rows." }, { status: 400 });
    const rows: AdWeekRow[] = [];
    const rejected: { index: number; reason: string }[] = [];
    input.forEach((r, i) => {
      const platform = String(r?.platform ?? "").toUpperCase();
      const n = (x: any) => Number(x);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r?.week)) || !(PLATFORMS as readonly string[]).includes(platform) || !r?.campaignCode || !(n(r.spendSar) >= 0))
        rejected.push({ index: i, reason: "week (YYYY-MM-DD), platform (META|GOOGLE|SNAP|TIKTOK), campaignCode and spendSar are required" });
      else rows.push({ week: r.week, platform: platform as AdWeekRow["platform"], campaignCode: String(r.campaignCode), spendK: n(r.spendSar) / 1000, impressionsK: (n(r.impressions) || 0) / 1000, clicks: n(r.clicks) || 0, platformLeads: n(r.platformLeads) || 0 });
    });
    const accepted = rows.length ? await upsertAdRows(rows) : 0;
    await prisma.sourceSync.create({ data: { source: "ADS", mode: "push", rows: accepted, rejected: rejected.length } });
    return NextResponse.json({ accepted, rejected });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ingest failed." }, { status: 400 });
  }
}
