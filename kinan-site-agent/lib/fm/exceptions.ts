// The exceptions queue: what the automation could not finish and a person must look at — a mission that never reached
// its robot, commands the fleet bridge isn't collecting, a robot stopped, faulted or silent, a mission that should have
// started and hasn't (waiting for a pilot, say), a mission that failed, a security alert nobody has answered, a message
// to a customer system that didn't go. The operator cockpit shows them first; everything else runs by itself or waits
// in the approvals queue.
import type { Db } from "../types";
import type { FmData } from "./types";
import { simNow } from "../robots/sim";

export interface Exception { id: string; severity: "high" | "medium" | "low"; title: string; detail: string; at: string; robotId?: string; missionId?: string; alertId?: string }
const MIN = 60_000;
const hm = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(11, 16);

export function exceptions(db: Db, d: FmData, facilityId: string, now = simNow(d.date)): Exception[] {
  const out: Exception[] = [];
  const log = db.fmLog ?? [];
  const robots = d.robots.filter((r) => r.facilityId === facilityId), rid = new Set(robots.map((r) => r.id));
  const name = (id?: string) => d.robots.find((r) => r.id === id)?.name ?? "a robot";
  const live = (id?: string) => { const m = d.missions.find((x) => x.id === id); return !m || m.status === "planned" || m.status === "running"; };

  // 1. dispatches that failed, for missions still meant to happen
  const results = log.filter((e) => e.kind === "dispatch_result" && rid.has(e.robotId)) as Extract<(typeof log)[number], { kind: "dispatch_result" }>[];
  for (const e of results.filter((x) => !x.sent && live(x.missionId))) out.push({ id: `dispatch:${e.id}`, severity: "high", title: `${name(e.robotId)}: mission not sent`, detail: `${e.missionId ?? ""} — ${e.note} (${e.adapter})`, at: e.at, robotId: e.robotId, missionId: e.missionId });
  // 2. commands waiting for the fleet bridge for more than two minutes: it isn't collecting
  const acked = new Set(results.flatMap((e) => (e.commandId ? [e.commandId] : [])));
  for (const e of log.filter((x) => x.kind === "fleet_command" && rid.has(x.robotId) && !acked.has(x.commandId) && Date.now() - Date.parse(x.at) > 2 * MIN) as Extract<(typeof log)[number], { kind: "fleet_command" }>[])
    out.push({ id: `bridge:${e.commandId}`, severity: "high", title: `${name(e.robotId)}: waiting for the fleet bridge`, detail: `${e.protocol} command queued at ${hm(e.at)} and not collected — is the bridge running and connected?`, at: e.at, robotId: e.robotId, missionId: e.missionId });
  // 3. robots stopped, faulted, offline; connected robots that went quiet
  for (const r of robots) {
    if (r.estop) out.push({ id: `estop:${r.id}`, severity: "high", title: `${r.name} on emergency stop`, detail: r.note ?? "A supervisor releases it after a look on site", at: d.date, robotId: r.id });
    else if (r.status === "fault" || r.status === "offline") out.push({ id: `down:${r.id}`, severity: "high", title: `${r.name} ${r.status}`, detail: `${r.vendor} — check it on site or in its maker's software`, at: r.lastReport ?? d.date, robotId: r.id });
    else if (r.lastReport && Date.now() - Date.parse(r.lastReport) > 15 * MIN) out.push({ id: `quiet:${r.id}`, severity: "medium", title: `${r.name} silent since ${hm(r.lastReport)}`, detail: "A connected robot that stopped reporting: its connection, its bridge or the robot itself", at: r.lastReport, robotId: r.id });
  }
  // 4. missions late to start, and missions that failed
  for (const m of d.missions.filter((x) => x.facilityId === facilityId)) {
    if (m.status === "planned" && now - Date.parse(m.plannedStart) > 10 * MIN) out.push({ id: `late:${m.id}`, severity: "medium", title: `${name(m.robotId)}: "${m.title}" hasn't started`, detail: `Due at ${hm(m.plannedStart)}${m.note ? ` — ${m.note}` : ""}`, at: m.plannedStart, robotId: m.robotId, missionId: m.id });
    if (m.status === "failed") out.push({ id: `failed:${m.id}`, severity: "high", title: `${name(m.robotId)}: "${m.title}" failed`, detail: m.note ?? "Reported failed by the machine", at: m.ended ?? m.plannedStart, robotId: m.robotId, missionId: m.id });
  }
  // 5. security alerts nobody has answered in ten minutes
  for (const a of d.securityAlerts.filter((x) => x.facilityId === facilityId && x.status === "open" && now - Date.parse(x.at) > 10 * MIN))
    out.push({ id: `alert:${a.id}`, severity: a.kind === "drone" || a.kind === "person" ? "high" : "medium", title: `Unanswered: ${a.text}`, detail: `${a.source} at ${hm(a.at)}`, at: a.at, alertId: a.id });
  // 6. messages to customer systems that didn't go (work orders, Teams, email, webhooks) in the last day
  for (const x of (db.integrationLog ?? []).filter((y) => !y.ok && (!y.facilityId || y.facilityId === facilityId) && Date.now() - Date.parse(y.at) < 24 * 60 * MIN).slice(-20))
    out.push({ id: `sync:${x.id}`, severity: "medium", title: `${x.target}: ${x.what} not delivered`, detail: x.note, at: x.at });
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
}
