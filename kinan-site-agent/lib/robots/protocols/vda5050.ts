// VDA 5050 (version 2) — the open interface between a fleet controller and mobile robots (AGVs/AMRs), over MQTT.
// The core turns a mission into an order (nodes and edges, with the checks as actions at each node) and reads the
// robot's state back (battery, position, the node it reached, errors, the emergency stop) into the common report.
// Topics: {interface}/{major}/{manufacturer}/{serialNumber}/{order|instantActions|state|connection}. The fleet bridge
// (bridge/fleet-bridge.mjs) carries the messages; this file only builds and reads them, so it runs anywhere.
//
// Node ids: the places of the robot's own map. Our places (zones, assets) are mapped to them in VDA5050_NODES (JSON,
// e.g. {"kgia:rwy": "RWY-33-THR", "kgia:CCR-RWY": "AGL-VAULT"}); unmapped ones go by their id. Inspection actions are
// manufacturer-specific in VDA 5050: they are sent as actionType "inspect" with the checks as parameters, which the
// robot's own integration maps to what it does. Written to the VDA 5050 2.0 specification; not yet run against a robot.
// ISO 21423 was named alongside VDA 5050; it is not implemented separately here — check its message set first.
import type { Mission, Robot, RobotStatus } from "../types";
import type { RobotReport } from "../../fm/types";

export const VDA_VERSION = "2.0.0";
export interface VdaIds { interfaceName: string; manufacturer: string; serialNumber: string }
export const vdaTopic = (id: VdaIds, leaf: "order" | "instantActions" | "state" | "connection" | "visualization") => `${id.interfaceName}/v2/${id.manufacturer}/${id.serialNumber}/${leaf}`;

/** A robot's VDA 5050 identity: its manufacturer and serial (from Robot.externalId "manufacturer/serial", or its name). */
export function vdaIds(r: Robot, interfaceName = "uagv"): VdaIds {
  const [m, s] = (r.externalId ?? "").split("/");
  return { interfaceName, manufacturer: s ? m : r.vendor.replace(/[^A-Za-z0-9_-]+/g, ""), serialNumber: s ?? r.name };
}

let header = 0;
const head = (id: VdaIds) => ({ headerId: ++header, timestamp: new Date().toISOString(), version: VDA_VERSION, manufacturer: id.manufacturer, serialNumber: id.serialNumber });

/** The order for a mission: one node per waypoint (even sequence ids), edges between them (odd), the checks as actions. */
export function vdaOrder(m: Mission, r: Robot, nodeMap: Record<string, string> = {}) {
  const id = vdaIds(r);
  const nodeId = (w: Mission["waypoints"][number]) => (w.assetId && nodeMap[w.assetId]) || nodeMap[w.zone] || (w.assetId ?? w.zone);
  const nodes = m.waypoints.map((w, i) => ({
    nodeId: nodeId(w), sequenceId: i * 2, released: true, nodeDescription: w.label,
    actions: w.checks.length ? [{ actionType: "inspect", actionId: `${m.id}-${i}`, blockingType: "HARD", actionDescription: w.label, actionParameters: [{ key: "checks", value: w.checks }, ...(w.assetId ? [{ key: "asset", value: w.assetId.split(":")[1] ?? w.assetId }] : [])] }] : [],
  }));
  const edges = nodes.slice(1).map((n, i) => ({ edgeId: `${nodes[i].nodeId}->${n.nodeId}`, sequenceId: i * 2 + 1, released: true, startNodeId: nodes[i].nodeId, endNodeId: n.nodeId, actions: [] }));
  return { topic: vdaTopic(id, "order"), payload: { ...head(id), orderId: m.id, orderUpdateId: 0, nodes, edges } };
}

/** Instant actions: cancel the order, pause or resume. */
export function vdaInstant(r: Robot, actionType: "cancelOrder" | "startPause" | "stopPause") {
  const id = vdaIds(r);
  return { topic: vdaTopic(id, "instantActions"), payload: { ...head(id), actions: [{ actionType, actionId: `${actionType}-${Date.now().toString(36)}`, blockingType: "HARD" }] } };
}

/** A state message, read into the common report: status, battery, the place reached, errors as notes. */
export function vdaStateToReport(state: Record<string, unknown>, robot: string, placeOf: (nodeId: string) => string | undefined): RobotReport {
  const s = state as { orderId?: string; lastNodeId?: string; driving?: boolean; paused?: boolean; batteryState?: { batteryCharge?: number; charging?: boolean }; errors?: { errorType?: string; errorLevel?: string; errorDescription?: string }[]; safetyState?: { eStop?: string }; actionStates?: { actionStatus?: string }[]; nodeStates?: unknown[] };
  const fatal = (s.errors ?? []).some((e) => e.errorLevel === "FATAL");
  const estop = !!s.safetyState?.eStop && s.safetyState.eStop !== "NONE";
  const busy = !!s.orderId && ((s.nodeStates?.length ?? 0) > 0 || s.driving || (s.actionStates ?? []).some((a) => a.actionStatus === "RUNNING" || a.actionStatus === "INITIALIZING"));
  const status: RobotStatus = estop ? "estop" : fatal ? "fault" : s.batteryState?.charging ? "charging" : busy ? "on_mission" : "docked";
  // the order is ours (orderId = mission id): running while it has nodes or actions left, done when it hasn't, failed on a fatal error
  const failed = (s.actionStates ?? []).some((a) => a.actionStatus === "FAILED");
  const mission = s.orderId ? { id: s.orderId, status: (fatal || failed ? "failed" : busy ? "running" : "done") as "failed" | "running" | "done" } : undefined;
  return { robot, source: "VDA 5050", status, ...(typeof s.batteryState?.batteryCharge === "number" ? { battery: s.batteryState.batteryCharge } : {}), ...(s.lastNodeId && placeOf(s.lastNodeId) ? { zone: placeOf(s.lastNodeId) } : {}), ...(mission ? { mission } : {}) };
}
