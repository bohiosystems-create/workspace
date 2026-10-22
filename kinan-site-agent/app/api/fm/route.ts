import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { act, facilityState, myDay, overview, type ActInput } from "@/lib/fm/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facility management (lib/fm).
// GET                      -> every facility with its KPIs (home page cards)
// GET ?facility=<id>       -> one facility: assets, work orders, alarms, team, spares, the orchestrator's proposals
// GET ?tech=<id>           -> one technician's day (the field app)
// POST { action, …, by, channel } -> a change (decide, autopilot, tick, wo_create, wo_update, asset_status, alarm_ack, tech_status)
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams, db = (await getRepo()).db;
    const body = q.get("tech") ? myDay(db, q.get("tech")!) : q.get("facility") ? facilityState(db, q.get("facility")!) : overview(db);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as ActInput & { by?: string; channel?: "web" | "field" };
    const repo = await getRepo();
    const r = act(repo.db, b, String(b.by || "Control room").slice(0, 60), b.channel === "field" ? "field" : "web");
    if (r.events.length || b.action === "autopilot") await repo.save();
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
