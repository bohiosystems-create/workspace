import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { act, facilityStateFor, myDay, overview, type ActInput } from "@/lib/fm/api";
import { currentUser } from "@/lib/auth/session";
import { HAS_OPERATIONS } from "@/lib/edition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facility management (lib/fm).
// GET                      -> every facility with its KPIs (home page cards)
// GET ?facility=<id>       -> one facility: assets, work orders, alarms, team, spares, the orchestrator's proposals
// GET ?tech=<id>           -> one technician's day (the field app)
// POST { action, …, by, channel } -> a change (decide, policy, autopilot, tick, wo_create, wo_update, asset_status, alarm_ack, tech_status)
//   decide / policy / autopilot need a signed-in person with the authority (lib/auth/people.ts)
export async function GET(req: Request) {
  if (!HAS_OPERATIONS) return NextResponse.json({ error: "Facility operations are not part of this edition." }, { status: 404 });
  try {
    const q = new URL(req.url).searchParams, db = (await getRepo()).db;
    const body = q.get("tech") ? myDay(db, q.get("tech")!) : q.get("facility") ? facilityStateFor(db, q.get("facility")!, await currentUser(req)) : overview(db);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function POST(req: Request) {
  if (!HAS_OPERATIONS) return NextResponse.json({ error: "Facility operations are not part of this edition." }, { status: 404 });
  try {
    const b = (await req.json()) as ActInput & { by?: string; channel?: "web" | "field" };
    const repo = await getRepo();
    // the signed-in person is who did it (their name, role and approval limits); otherwise the name typed in the app
    const me = await currentUser(req);
    const r = act(repo.db, b, me?.name ?? String(b.by || "Control room").slice(0, 60), b.channel === "field" ? "field" : "web", me);
    if (r.events.length || b.action === "autopilot" || b.action === "policy") await repo.save();
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
