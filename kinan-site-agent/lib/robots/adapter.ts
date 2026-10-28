// How missions reach the robots. The orchestrator records every mission as an event (the plant's own record); an
// adapter then hands it to whatever runs the robots:
//   - "sim"    the built-in simulator (lib/robots/sim.ts) — nothing to send; the default, and the demo
//   - "rmf"    an Open-RMF fleet (its API server's task endpoints): ROBOT_RMF_URL, ROBOT_RMF_TOKEN
//   - "vendor" a vendor's own fleet API, through a small bridge that speaks the common mission shape below
//             (ROBOT_FLEETS, per fleet); status and findings come back to app/api/fm/robots
//   - "platform" the vendor's data platform only: findings come in (app/api/fm/robots), missions are planned there
// An adapter that is not set up, or fails, never loses the mission: it stays recorded and shows "not sent" with why.
//
// Open-RMF: a mission becomes a "patrol" task over named places of the RMF navigation graph. The places are named
// after the plant's zone ids by default ("kgpp:cmp" → "kgpp_cmp"), or mapped in ROBOT_RMF_PLACES (JSON
// {"kgpp:cmp": "compressor_bay"}). Written against the RMF API server's task API (dispatch_task / cancel_task); it has
// not been run against a live RMF deployment yet — test it there before relying on it.
import type { Mission, Robot } from "./types";
import { vdaInstant, vdaOrder } from "./protocols/vda5050";
import { djiCancel, djiFlight, type Wayline } from "./protocols/dji";
import { orbitConfig, orbitDispatch, type OrbitConfig } from "./protocols/orbit";

export interface DispatchResult { sent: boolean; externalId?: string; note: string; /** messages queued for the fleet bridge (MQTT) */ commands?: { topic: string; payload: unknown }[]; protocol?: string }
export interface FleetAdapter {
  name: string;
  dispatch(m: Mission, r: Robot): Promise<DispatchResult>;
  cancel(m: Mission, r: Robot): Promise<DispatchResult>;
  /** an emergency stop from the app, when the fleet supports one (the robot's own stop button always works) */
  estop(r: Robot, on: boolean): Promise<DispatchResult>;
}

export const simAdapter: FleetAdapter = {
  name: "simulator",
  dispatch: async (m) => ({ sent: true, externalId: `sim:${m.id}`, note: "Simulated fleet" }),
  cancel: async () => ({ sent: true, note: "Simulated fleet" }),
  estop: async () => ({ sent: true, note: "Simulated fleet" }),
};

type Env = Record<string, string | undefined>;
export function rmfAdapter(env: Env = process.env, fetcher: typeof fetch = fetch): FleetAdapter {
  const base = String(env.ROBOT_RMF_URL ?? "").replace(/\/+$/, "");
  const places: Record<string, string> = (() => { try { return JSON.parse(env.ROBOT_RMF_PLACES ?? "{}"); } catch { return {}; } })();
  const place = (zone: string) => places[zone] ?? zone.replace(/[^a-zA-Z0-9]+/g, "_");
  const post = async (path: string, body: unknown) => {
    if (!base) throw new Error("ROBOT_RMF_URL is not set");
    const res = await fetcher(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(env.ROBOT_RMF_TOKEN ? { authorization: `Bearer ${env.ROBOT_RMF_TOKEN}` } : {}) }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`RMF ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  };
  return {
    name: "Open-RMF",
    async dispatch(m) {
      try {
        const r = await post("/tasks/dispatch_task", { type: "dispatch_task_request", request: { unix_millis_earliest_start_time: Date.parse(m.plannedStart), category: "patrol", description: { places: m.waypoints.map((w) => place(w.zone)), rounds: 1 }, labels: [m.id] } });
        const id = r?.state?.booking?.id ?? r?.task_id;
        return { sent: !!r?.success || !!id, externalId: id, note: id ? `RMF task ${id}` : `RMF answered without a task id` };
      } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    async cancel(m) {
      if (!m.externalId) return { sent: false, note: "Not sent to RMF" };
      try { await post("/tasks/cancel_task", { type: "cancel_task_request", task_id: m.externalId }); return { sent: true, note: "Cancelled in RMF" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    // RMF's task API has no remote emergency stop: say so plainly — the stop button on the robot is the safety stop
    estop: async () => ({ sent: false, note: "Open-RMF has no remote emergency stop over its task API — use the robot's own stop button" }),
  };
}

// ------------------------------------------------------------------ vendor fleets
// ROBOT_FLEETS (JSON): { "<fleet>": { "url": "https://bridge.example/fleet", "token": "…", "estop": false } }. Missions
// go out in one common shape — the same for every maker — to the vendor's bridge (theirs, or a small service that
// translates to their API): POST {url}/missions, POST {url}/missions/{id}/cancel, POST {url}/robots/{id}/estop.
// What the robot does and finds comes back to POST /api/fm/robots in the common report shape (SETUP §8f). The vendor
// APIs themselves differ and are not reproduced here: each needs its bridge, tested against the real fleet.
export interface FleetConfig { url: string; token?: string; estop?: boolean }
export function fleetConfig(fleet?: string, env: Env = process.env): FleetConfig | null {
  if (!fleet) return null;
  try { const all = JSON.parse(env.ROBOT_FLEETS ?? "{}") as Record<string, FleetConfig>; const c = all[fleet]; return c && typeof c.url === "string" && /^https?:\/\//.test(c.url) ? c : null; } catch { return null; }
}
/** A mission in the common shape every vendor bridge receives. */
export const commonMission = (m: Mission, r: Robot) => ({ id: m.id, robot: r.externalId ?? r.name, kind: m.kind, title: m.title, start: m.plannedStart, durationMin: m.durationMin,
  route: m.waypoints.map((w) => ({ place: w.zone, asset: w.assetId?.split(":")[1], label: w.label, checks: w.checks })), alert: m.alertId, workOrder: m.woId });

export function vendorAdapter(c: FleetConfig, fetcher: typeof fetch = fetch): FleetAdapter {
  const base = c.url.replace(/\/+$/, "");
  const post = async (path: string, body: unknown) => {
    const res = await fetcher(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Fleet ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  };
  return {
    name: "vendor fleet",
    async dispatch(m, r) { try { const x = await post("/missions", commonMission(m, r)); const id = x?.id ?? x?.missionId; return { sent: true, externalId: id, note: id ? `Fleet mission ${id}` : "Sent to the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; } },
    async cancel(m) { if (!m.externalId) return { sent: false, note: "Not sent to the fleet" }; try { await post(`/missions/${encodeURIComponent(m.externalId)}/cancel`, {}); return { sent: true, note: "Cancelled in the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; } },
    async estop(r, on) {
      if (!c.estop) return { sent: false, note: "This fleet takes no remote emergency stop — use the robot's own stop or the vendor's console" };
      try { await post(`/robots/${encodeURIComponent(r.externalId ?? r.name)}/estop`, { on }); return { sent: true, note: on ? "Stopped in the fleet" : "Released in the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
  };
}
/** A robot run from its vendor's data platform: missions are planned there; we only say so. */
const platformAdapter: FleetAdapter = {
  name: "vendor platform",
  dispatch: async () => ({ sent: false, note: "Planned in the vendor's own platform — its findings come in here" }),
  cancel: async () => ({ sent: false, note: "Cancel it in the vendor's platform" }),
  estop: async () => ({ sent: false, note: "Use the robot's own stop or the vendor's console" }),
};

// ------------------------------------------------------------------ machines over MQTT, through the fleet bridge
// VDA 5050 robots and DJI docks speak MQTT. The core (serverless) can't hold an MQTT connection, so it queues their
// messages as commands; the fleet bridge (bridge/fleet-bridge.mjs, on the robots' network) collects them from
// /api/fm/robots/outbox, publishes them on the broker, and posts back the machines' state and its acknowledgements.
export const bridgeOn = (env: Env = process.env) => String(env.FLEET_BRIDGE_TOKEN ?? "").length >= 16;
const json = <T,>(s: string | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export function vdaAdapter(env: Env = process.env): FleetAdapter {
  const nodes = json<Record<string, string>>(env.VDA5050_NODES, {});
  return {
    name: "VDA 5050 (fleet bridge)",
    dispatch: async (m, r) => { const o = vdaOrder(m, r, nodes); return { sent: true, note: "Order queued for the fleet bridge", commands: [o], protocol: "vda5050" }; },
    cancel: async (_m, r) => ({ sent: true, note: "cancelOrder queued for the fleet bridge", commands: [vdaInstant(r, "cancelOrder")], protocol: "vda5050" }),
    // VDA 5050 has no remote emergency stop: the app pauses the robot; the stop on the robot is the safety stop
    estop: async (r, on) => ({ sent: true, note: on ? "Pause queued (VDA 5050 has no remote emergency stop — use the robot's own stop)" : "Resume queued", commands: [vdaInstant(r, on ? "startPause" : "stopPause")], protocol: "vda5050" }),
  };
}
export function djiAdapter(env: Env = process.env): FleetAdapter {
  const waylines = json<Record<string, Wayline>>(env.DJI_WAYLINES, {});
  return {
    name: "DJI Cloud API (fleet bridge)",
    dispatch: async (m, r) => { const f = djiFlight(m, r, waylines); return "error" in f ? { sent: false, note: f.error } : { sent: true, note: "Flight task queued for the fleet bridge", commands: f.messages, protocol: "dji" }; },
    cancel: async (m, r) => ({ sent: true, note: m.status === "running" ? "Return home queued for the fleet bridge" : "Flight task undo queued", commands: [djiCancel(m, r, m.status === "running")], protocol: "dji" }),
    estop: async () => ({ sent: false, note: "Use the dock's or the remote controller's emergency stop — the app brings the drone home with Cancel" }),
  };
}
export function orbitAdapter(c: OrbitConfig, fetcher: typeof fetch = fetch): FleetAdapter {
  return {
    name: "Spot Orbit",
    async dispatch(m, r) {
      const req = orbitDispatch(m, r, c);
      if ("error" in req) return { sent: false, note: req.error };
      try { const res = await fetcher(req.url, req.init); const t = await res.text(); if (!res.ok) return { sent: false, note: `Orbit ${res.status}: ${t.slice(0, 160)}` }; return { sent: true, note: "Running in Orbit" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    cancel: async () => ({ sent: false, note: "Stop the run in Orbit (its cancel call differs between releases)" }),
    estop: async () => ({ sent: false, note: "Use Spot's own stop or Orbit's emergency stop" }),
  };
}

/** The adapter for a robot. Without a configured connection a robot runs on the simulator (the demo). */
export function adapterFor(r: Robot, env: Env = process.env): FleetAdapter {
  if (r.adapter === "rmf" && env.ROBOT_RMF_URL) return rmfAdapter(env);
  if (r.adapter === "vda5050" && bridgeOn(env)) return vdaAdapter(env);
  if (r.adapter === "dji" && bridgeOn(env)) return djiAdapter(env);
  const oc = r.adapter === "orbit" ? orbitConfig(env) : null;
  if (oc) return orbitAdapter(oc);
  const c = fleetConfig(r.fleet, env);
  if ((r.adapter === "vendor" || r.adapter === "security") && c) return vendorAdapter(c);
  if (r.adapter === "platform" && c) return platformAdapter;
  return simAdapter;
}
