import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { HAS_OPERATIONS } from "@/lib/edition";
import { bearerOk } from "@/lib/integrations/http";
import { publishAfter } from "@/lib/integrations/outbound";
import { pollable, pollFleets } from "@/lib/robots/poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Every minute (Vercel Cron, vercel.json; any scheduler will): ask the robots whose connection answers when asked
// (Open-RMF, vendor bridges) for status() and results(), and record what changed (lib/robots/poll.ts). Machines that
// push (MQTT through the fleet bridge, webhooks, alarms) need no polling. Auth: Bearer $CRON_SECRET (Vercel Cron sends
// it), or the fleet tokens. Returns at once, without reading the store, when no pull connection is set.
async function handle(req: Request) {
  if (!HAS_OPERATIONS) return NextResponse.json({ error: "Facility operations are not part of this edition." }, { status: 404 });
  if (![process.env.CRON_SECRET, process.env.FLEET_BRIDGE_TOKEN, process.env.ROBOT_INGEST_TOKEN].some((t) => bearerOk(req, t))) return NextResponse.json({ error: "Wrong or missing token." }, { status: 401 });
  if (!pollable()) return NextResponse.json({ polled: [], note: "No connection to ask: set ROBOT_RMF_URL or ROBOT_FLEETS." });
  const repo = await getRepo();
  const polled = await pollFleets(repo.db);
  if (polled.some((p) => p.recorded || p.note)) { await repo.save(); await publishAfter(repo); }
  return NextResponse.json({ polled });
}
export const GET = handle;
export const POST = handle;
