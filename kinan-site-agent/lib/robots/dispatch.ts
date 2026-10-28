// Getting work to the machines, and knowing whether it got there. After a change, every new mission, cancellation and
// emergency stop goes to its robot's adapter (adapter.ts). Direct APIs (Open-RMF, Orbit, a vendor's REST) answer at once;
// MQTT machines (VDA 5050, DJI) get their messages queued as commands for the fleet bridge, which collects them from the
// outbox and acknowledges each one. Every outcome is recorded (dispatch_result), so a mission that never reached its
// robot shows in the exceptions queue instead of silently not happening.
import type { Db } from "../types";
import type { FmEvent } from "../fm/types";
import { fmToday } from "../fm/engine";
import { record } from "../fm/api";
import { adapterFor } from "./adapter";

const cid = () => `CMD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Hand new missions, cancellations and stops to each robot's adapter; returns what didn't go, for the person who asked. */
export async function toFleet(db: Db, events: FmEvent[]): Promise<string> {
  const notes: string[] = [];
  const d = fmToday(db);
  for (const e of events) {
    const m = e.kind === "mission_create" ? e.mission : e.kind === "mission_update" ? d.missions.find((x) => x.id === e.missionId) : undefined;
    const r = d.robots.find((x) => x.id === (m?.robotId ?? (e.kind === "robot_estop" ? e.robotId : "")));
    if (!r) continue;
    const ad = adapterFor(r);
    if (ad.name === "simulator") continue; // the demo: nothing to send, nothing to record
    const res = e.kind === "mission_create" ? await ad.dispatch(e.mission, r) : e.kind === "mission_update" && m && e.status === "aborted" ? await ad.cancel(m, r) : e.kind === "robot_estop" ? await ad.estop(r, e.on) : null;
    if (!res) continue;
    const base = { by: "Fleet", channel: "orchestrator" as const, robotId: r.id, ...(m ? { missionId: m.id } : {}) };
    if (res.commands?.length) {
      const commandId = cid();
      record(db, { ...base, kind: "fleet_command", commandId, protocol: res.protocol ?? ad.name, messages: res.commands, summary: `${r.name}: ${res.note}` });
    } else record(db, { ...base, kind: "dispatch_result", sent: res.sent, note: res.note, adapter: ad.name, summary: `${r.name}: ${res.sent ? "sent" : "not sent"} — ${res.note}` });
    if (!res.sent) notes.push(` Not sent to ${ad.name}: ${res.note}.`);
  }
  return notes.join("");
}

/** Commands waiting for the fleet bridge (not yet acknowledged), oldest first. */
export function outbox(db: Db, protocol?: string) {
  const log = db.fmLog ?? [];
  const done = new Set(log.flatMap((e) => (e.kind === "dispatch_result" && e.commandId ? [e.commandId] : [])));
  return log.flatMap((e) => (e.kind === "fleet_command" && !done.has(e.commandId) && (!protocol || e.protocol === protocol) ? [{ commandId: e.commandId, robotId: e.robotId, missionId: e.missionId, protocol: e.protocol, at: e.at, messages: e.messages }] : [])).slice(0, 200);
}

/** The fleet bridge's acknowledgements: published (and accepted by the machine) or failed, with why. */
export function ack(db: Db, acks: { commandId: string; ok: boolean; note?: string }[]) {
  const log = db.fmLog ?? [], out: string[] = [];
  for (const a of acks.slice(0, 200)) {
    const c = log.find((e) => e.kind === "fleet_command" && e.commandId === a.commandId) as Extract<FmEvent, { kind: "fleet_command" }> | undefined;
    if (!c) { out.push(`${a.commandId}: unknown`); continue; }
    if (log.some((e) => e.kind === "dispatch_result" && e.commandId === a.commandId)) { out.push(`${a.commandId}: already acknowledged`); continue; }
    record(db, { kind: "dispatch_result", by: "Fleet bridge", channel: "orchestrator", commandId: a.commandId, robotId: c.robotId, ...(c.missionId ? { missionId: c.missionId } : {}), sent: !!a.ok, note: String(a.note ?? (a.ok ? "Published" : "Failed")).slice(0, 200), adapter: `fleet bridge (${c.protocol})`, summary: `${c.commandId}: ${a.ok ? "delivered" : "failed"}` });
    out.push(`${a.commandId}: ${a.ok ? "delivered" : "failed"}`);
  }
  return out;
}
