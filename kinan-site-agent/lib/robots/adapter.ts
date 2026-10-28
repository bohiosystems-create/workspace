// How missions reach the robots. The orchestrator records every mission as an event (the plant's own record); an
// adapter then hands it to whatever runs the robots:
//   - "sim"    the built-in simulator (lib/robots/sim.ts) — nothing to send; the default, and the demo
//   - "rmf"    an Open-RMF fleet (its API server's task endpoints): ROBOT_RMF_URL, ROBOT_RMF_TOKEN
//   - "vendor" a vendor's own fleet API — added per vendor, behind the same interface
// An adapter that is not set up, or fails, never loses the mission: it stays recorded and shows "not sent" with why.
//
// Open-RMF: a mission becomes a "patrol" task over named places of the RMF navigation graph. The places are named
// after the plant's zone ids by default ("kgpp:cmp" → "kgpp_cmp"), or mapped in ROBOT_RMF_PLACES (JSON
// {"kgpp:cmp": "compressor_bay"}). Written against the RMF API server's task API (dispatch_task / cancel_task); it has
// not been run against a live RMF deployment yet — test it there before relying on it.
import type { Mission, Robot } from "./types";

export interface DispatchResult { sent: boolean; externalId?: string; note: string }
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

/** The adapter for a robot. */
export function adapterFor(r: Robot, env: Env = process.env): FleetAdapter {
  if (r.adapter === "rmf" && env.ROBOT_RMF_URL) return rmfAdapter(env);
  return simAdapter;
}
