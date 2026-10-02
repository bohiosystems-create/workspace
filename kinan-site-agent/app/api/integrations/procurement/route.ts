import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { applyPush, syncNow } from "@/lib/integrations/procurement";
import { bearerOk } from "@/lib/secret";

export const dynamic = "force-dynamic";

/**
 * POST ?action=sync                         → pull now from the configured purchasing system
 * POST {type, data}                         → push upsert (purchase_order | delivery | material_request_status | stock)
 * Auth: Authorization: Bearer $PROCUREMENT_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  if (!bearerOk(req, process.env.PROCUREMENT_WEBHOOK_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await getRepo();
  if (req.nextUrl.searchParams.get("action") === "sync") return NextResponse.json(await syncNow(r));
  let body: { type?: string; data?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.type || body.data === undefined) return NextResponse.json({ error: "expected {type, data}" }, { status: 400 });
  const res = applyPush(r.db, body.type, body.data);
  await r.save();
  return NextResponse.json({ ok: true, ...res });
}

/**
 * GET ?action=sync → pull now (for Vercel Cron, which sends "Authorization: Bearer $CRON_SECRET").
 * GET [?since=YYYY-MM-DD] → material requests, so a middleware can poll new site MRs.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("action") === "sync") {
    if (!bearerOk(req, process.env.CRON_SECRET) && !bearerOk(req, process.env.PROCUREMENT_WEBHOOK_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json(await syncNow(await getRepo()));
  }
  if (!bearerOk(req, process.env.PROCUREMENT_WEBHOOK_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = req.nextUrl.searchParams.get("since") ?? "";
  return NextResponse.json({ requests: (await getRepo()).db.data.procurement.requests.filter((m) => !since || m.created >= since) });
}
