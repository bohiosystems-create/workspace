import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { act, facilityStateFor, myDay, overview, type ActInput } from "@/lib/fm/api";
import { currentUser } from "@/lib/auth/session";
import { HAS_OPERATIONS } from "@/lib/edition";
import { fmToday } from "@/lib/fm/engine";
import { adapterFor } from "@/lib/robots/adapter";
import type { Db } from "@/lib/types";
import type { FmEvent } from "@/lib/fm/types";

/** Hands new missions, cancellations and emergency stops to each robot's fleet adapter; says when one didn't go. */
async function toFleet(db: Db, events: FmEvent[]): Promise<string> {
  const notes: string[] = [];
  const d = fmToday(db);
  for (const e of events) {
    const m = e.kind === "mission_create" ? e.mission : e.kind === "mission_update" ? d.missions.find((x) => x.id === e.missionId) : undefined;
    const r = d.robots.find((x) => x.id === (m?.robotId ?? (e.kind === "robot_estop" ? e.robotId : "")));
    if (!r) continue;
    const ad = adapterFor(r);
    const res = e.kind === "mission_create" ? await ad.dispatch(e.mission, r) : e.kind === "mission_update" && m && e.status === "aborted" ? await ad.cancel(m, r) : e.kind === "robot_estop" ? await ad.estop(r, e.on) : null;
    if (res && !res.sent) notes.push(` Not sent to ${ad.name}: ${res.note}.`);
  }
  return notes.join("");
}

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
    // missions, cancellations and stops go on to the fleet that runs the robots (the simulator, or a real one)
    const fleet = await toFleet(repo.db, r.events);
    return NextResponse.json({ ok: true, message: r.message + fleet });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
