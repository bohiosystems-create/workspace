// DJI Cloud API — how a DJI Dock and its drone talk to a cloud platform, over MQTT. The core turns a mission into a
// flight task (prepare, then execute; undo or return home to cancel) and reads the dock's and drone's telemetry and the
// task's progress back into the common report. Topics: thing/product/{sn}/{osd|events|services|services_reply}; every
// message is {tid, bid, timestamp, method, data}. The fleet bridge (bridge/fleet-bridge.mjs) carries them.
//
// Flight routes: DJI docks fly wayline files (KMZ) planned in DJI's tools; the core does not draw them. Each route is
// mapped in DJI_WAYLINES (JSON) from a mission's first place to the wayline file's URL and MD5 fingerprint, e.g.
// {"kgia:per": {"url": "https://…/perimeter.kmz", "fingerprint": "…"}}. A mission to an unmapped place is not sent and
// says so. Written to DJI's Cloud API documentation; not yet run against a dock.
import type { Mission, Robot, RobotStatus } from "../types";
import type { RobotReport } from "../../fm/types";

export interface Wayline { url: string; fingerprint: string }
const msg = (method: string, data: unknown) => ({ tid: crypto.randomUUID(), bid: crypto.randomUUID(), timestamp: Date.now(), method, data });
/** The dock's serial: Robot.externalId "dock-sn" or "dock-sn/drone-sn". */
export const djiDock = (r: Robot) => (r.externalId ?? r.name).split("/")[0];
export const djiTopic = (sn: string, leaf: "osd" | "events" | "services" | "services_reply" | "state") => `thing/product/${sn}/${leaf}`;

/** The two messages that start a flight: prepare (the wayline, when) and execute. Null when the route has no wayline. */
export function djiFlight(m: Mission, r: Robot, waylines: Record<string, Wayline>): { messages: { topic: string; payload: unknown }[] } | { error: string } {
  const w = m.waypoints[0], file = (w?.assetId && waylines[w.assetId]) || (w && waylines[w.zone]);
  if (!file) return { error: `No DJI wayline for ${w?.zone ?? "this route"} — plan it in DJI's tools and add it to DJI_WAYLINES` };
  const sn = djiDock(r), flight_id = m.id;
  return { messages: [
    { topic: djiTopic(sn, "services"), payload: msg("flighttask_prepare", { flight_id, execute_time: Date.parse(m.plannedStart), task_type: 0, wayline_type: 0, file, rth_altitude: 80, out_of_control_action: 0, exit_wayline_when_rc_lost: 0 }) },
    { topic: djiTopic(sn, "services"), payload: msg("flighttask_execute", { flight_id }) },
  ] };
}

/** Cancel: undo a task not yet flying; bring the drone home if it is. */
export const djiCancel = (m: Mission, r: Robot, flying: boolean) => ({ topic: djiTopic(djiDock(r), "services"), payload: flying ? msg("return_home", {}) : msg("flighttask_undo", { flight_ids: [m.id] }) });

/** Telemetry (osd) of the dock or the drone, read into the common report. */
export function djiOsdToReport(data: Record<string, unknown>, robot: string): RobotReport {
  const d = data as { mode_code?: number; battery?: { capacity_percent?: number }; drone_charge_state?: { capacity_percent?: number; state?: number }; drone_in_dock?: number };
  const battery = d.battery?.capacity_percent ?? d.drone_charge_state?.capacity_percent;
  // aircraft mode_code: 0 standby … 3-5/9-10 flying a task or returning; dock: drone_in_dock 1 = home
  const flying = typeof d.mode_code === "number" && d.drone_in_dock === undefined && d.mode_code >= 3 && d.mode_code <= 10;
  const status: RobotStatus = flying ? (d.mode_code === 9 ? "returning" : "on_mission") : d.drone_charge_state?.state === 1 ? "charging" : "docked";
  return { robot, source: "DJI Cloud API", status, ...(typeof battery === "number" ? { battery } : {}) };
}

/** A flight task's progress event: which mission, how far, and whether it ended well. */
export function djiProgress(data: Record<string, unknown>): { missionId?: string; percent?: number; status?: "running" | "done" | "failed" | "aborted" } {
  const d = data as { output?: { status?: string; progress?: { percent?: number } }; ext?: { flight_id?: string } };
  const st = d.output?.status;
  return { missionId: d.ext?.flight_id, percent: d.output?.progress?.percent, status: st === "ok" ? "done" : st === "failed" || st === "timeout" ? "failed" : st === "canceled" ? "aborted" : st ? "running" : undefined };
}
