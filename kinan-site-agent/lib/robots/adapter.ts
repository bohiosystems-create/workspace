// How the core talks to each kind of machine. Every connection — whoever made the robot — is an adapter with the same
// five functions, so the orchestrator, the cockpit and the API never need to know which maker is behind a robot:
//
//   status()        position, battery, online/offline, current job
//   capabilities()  what this robot can do through this connection (thermal photo, gauge read, patrol, fly…) and
//                   what the connection limits (only mapped routes, only recorded missions…)
//   dispatch(job)   send a job, translated into the vendor's format
//   cancel(job)     stop or abort it
//   results()       photos, readings and alerts, converted into our format (the common robot report)
//
// plus estop(), the emergency stop, where the vendor allows one remotely (the stop on the robot always works).
//
// Machines either answer when asked (pull: Open-RMF, a vendor's REST bridge) or tell us when something happens (push:
// MQTT machines through the fleet bridge, webhooks, alarms). A push adapter's status() is what the machine last
// reported, and its parse() converts what it sends; results() says where they arrive. The poller (poll.ts) calls
// status() and results() on the pull adapters every minute. Connections:
//   sim       the built-in simulator (lib/robots/sim.ts) — the default, and the demo
//   rmf       an Open-RMF fleet: ROBOT_RMF_URL, ROBOT_RMF_TOKEN, ROBOT_RMF_PLACES
//   vendor    a maker's own fleet API, through a small bridge that speaks the common shape below (ROBOT_FLEETS)
//   platform  the maker's data platform only: findings come in, missions are planned there
//   vda5050   VDA 5050 mobile robots over MQTT (fleet bridge): VDA5050_NODES
//   dji       DJI Docks over the DJI Cloud API (fleet bridge): DJI_WAYLINES
//   orbit     Spot through Orbit: ORBIT
//   security  security patrol robots: alarms and the video address in; missions through their bridge when they have one
// A connection that is not set up, or fails, never loses a job: it stays recorded and shows "not sent" with why.
//
// Open-RMF and the Orbit paths are written to their published APIs and have not been run against a live system yet.
import type { Capability, Mission, MissionKind, Robot, RobotStatus } from "./types";
import { DOMAIN_OF, MISSION_LABEL, missionFits } from "./types";
import type { RobotReport } from "../fm/types";
import { vdaInstant, vdaOrder, vdaStateToReport } from "./protocols/vda5050";
import { djiCancel, djiFlight, djiOsdToReport, djiProgress, type Wayline } from "./protocols/dji";
import { djiKmz, md5, vdaOrderWithPositions } from "./export";
import { routeOf } from "./routes";
import { vdaIds, vdaTopic } from "./protocols/vda5050";

/** The wayline of a designed route, where the dock fetches it: the app's own address, guarded by the route's key. */
function routeWayline(m: Mission, r: Robot, env: Env): Record<string, Wayline> {
  const kmz = djiKmz(routeOf(r, m.route!.sortie), m.route!.sortie, m.route!.frame).data as Uint8Array;
  const base = (env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/+$/, "");
  const file = { url: `${base}/api/fm/robots/route/${m.id}/${m.route!.key}.kmz`, fingerprint: md5(kmz) };
  const w = m.waypoints[0];
  return w ? { [w.assetId ?? w.zone]: file, [w.zone]: file } : {};
}
/** A VDA 5050 order for a designed route: each node with its position on the robot's map. */
function vdaRouteOrder(m: Mission, r: Robot) {
  const id = vdaIds(r), o = JSON.parse(vdaOrderWithPositions(routeOf(r, m.route!.sortie), m.route!.sortie, m.route!.frame, m.id).data as string);
  return { topic: vdaTopic(id, "order"), payload: { ...o, manufacturer: id.manufacturer, serialNumber: id.serialNumber, timestamp: new Date().toISOString() } };
}
import { orbitConfig, orbitDispatch, orbitWebhookToReport, type OrbitConfig } from "./protocols/orbit";
import { securityAlarmToReport } from "./protocols/security";

/** Where a robot is and what it is doing, as its connection knows it. */
export interface RobotState {
  online: boolean; status: RobotStatus; battery?: number; zone?: string;
  /** map coordinates when the vendor gives them (RMF: its own map frame) */
  position?: { x: number; y: number; map?: string };
  /** the job it is on, by our id when the vendor keeps it, else the vendor's */
  job?: { id: string; status?: "running" | "done" | "failed" | "aborted"; progress?: number };
  /** live: asked just now; reported: what the machine last sent (at); simulated: the demo */
  source: "live" | "reported" | "simulated"; at?: string; note?: string;
}
/** What a robot can do through its connection. */
export interface RobotCapabilities {
  /** in words: "thermal photos", "gauge reads", "patrols", "flies" */
  can: string[];
  sensors: Capability[];
  /** the job kinds it can be sent on */
  jobs: MissionKind[];
  /** only these places, when the connection limits where it can be sent (wayline routes, map nodes, recorded missions) */
  places?: string[];
  /** what the connection can't do, in words */
  limits: string[];
}
/** What a robot found, in our format. */
export interface RobotResults { mode: "pull" | "push" | "simulated"; reports: RobotReport[]; note: string }
export interface DispatchResult { sent: boolean; externalId?: string; note: string; /** messages queued for the fleet bridge (MQTT) */ commands?: { topic: string; payload: unknown }[]; protocol?: string }

export interface FleetAdapter {
  name: string;
  /** pull: status() and results() ask the vendor; push: the vendor sends, parse() converts */
  mode: "pull" | "push" | "simulated";
  status(r: Robot): Promise<RobotState>;
  capabilities(r: Robot): RobotCapabilities;
  dispatch(job: Mission, r: Robot): Promise<DispatchResult>;
  cancel(job: Mission, r: Robot): Promise<DispatchResult>;
  results(r: Robot, since?: string): Promise<RobotResults>;
  /** an emergency stop from the app, when the fleet supports one (the robot's own stop button always works) */
  estop(r: Robot, on: boolean): Promise<DispatchResult>;
  /** push adapters: a message in the machine's own shape → our report (null when it isn't one) */
  parse?(raw: Record<string, unknown>): RobotReport | null;
}

type Env = Record<string, string | undefined>;
const json = <T,>(s: string | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const MIN = 60_000;

// ------------------------------------------------------------------ the parts every adapter shares
const SENSOR_WORDS: Record<Capability, string[]> = {
  visual: ["photos", "gauge reads"], thermal: ["thermal photos"], gas: ["gas readings"], acoustic: ["leak and bearing listening"], lidar: ["3D scans"],
  ut_thickness: ["wall-thickness readings"], layout: ["layout marking"], carry: ["carries loads"], intrusion: ["intrusion detection"], sonar: ["subsea sonar"],
  manipulate: ["turns valves"], fod: ["debris detection"], mfl: ["metal-loss maps (MFL)"], eddy_current: ["surface-crack scans (eddy current)"],
};
const MOVE_WORDS = { land: "patrols", air: "flies", sea: "sails", subsea: "dives", in_pipe: "travels inside pipes", climbing: "climbs steel", in_tank: "works inside tanks in service" } as const;

/** What the robot itself can do: its sensors and tools, how it moves, the jobs those allow. */
export function declaredCapabilities(r: Robot): RobotCapabilities {
  const jobs = (Object.keys(MISSION_LABEL) as MissionKind[]).filter((k) => missionFits(r, k));
  return { can: [MOVE_WORDS[DOMAIN_OF[r.kind]], ...r.capabilities.flatMap((c) => SENSOR_WORDS[c])], sensors: r.capabilities, jobs, limits: [] };
}
const withLimits = (r: Robot, x: Partial<RobotCapabilities>): RobotCapabilities => {
  const base = declaredCapabilities(r);
  return { ...base, ...x, can: base.can, sensors: base.sensors, jobs: x.jobs ?? base.jobs, limits: [...base.limits, ...(x.limits ?? [])] };
};

/** What the machine last reported (push adapters), or the simulator's state. */
function lastKnown(r: Robot, source: RobotState["source"]): RobotState {
  const fresh = !!r.lastReport && Date.now() - Date.parse(r.lastReport) < 15 * MIN;
  const online = source === "simulated" ? r.status !== "offline" : fresh && r.status !== "offline";
  return { online, status: r.status, battery: r.battery, zone: r.zone, position: { x: r.x, y: r.y }, ...(r.missionId ? { job: { id: r.missionId } } : {}), source, ...(r.lastReport ? { at: r.lastReport } : {}),
    ...(source === "reported" && !r.lastReport ? { note: "Nothing reported yet" } : source === "reported" && !fresh ? { note: "No report for 15 minutes" } : {}) };
}
const pushed = (where: string): RobotResults => ({ mode: "push", reports: [], note: `Sent by the machine as it happens: ${where}` });

// ------------------------------------------------------------------ simulator
export const simAdapter: FleetAdapter = {
  name: "simulator", mode: "simulated",
  status: async (r) => lastKnown(r, "simulated"),
  capabilities: (r) => declaredCapabilities(r),
  dispatch: async (m) => ({ sent: true, externalId: `sim:${m.id}`, note: "Simulated fleet" }),
  cancel: async () => ({ sent: true, note: "Simulated fleet" }),
  results: async () => ({ mode: "simulated", reports: [], note: "The simulator's findings are worked out from the plant's readings as each job runs" }),
  estop: async () => ({ sent: true, note: "Simulated fleet" }),
};

// ------------------------------------------------------------------ Open-RMF (pull)
const RMF_STATUS: Record<string, RobotStatus> = { idle: "docked", charging: "charging", working: "on_mission", error: "fault", offline: "offline", shutdown: "offline", uninitialized: "offline" };
export function rmfAdapter(env: Env = process.env, fetcher: typeof fetch = fetch): FleetAdapter {
  const base = String(env.ROBOT_RMF_URL ?? "").replace(/\/+$/, "");
  const places = json<Record<string, string>>(env.ROBOT_RMF_PLACES, {});
  const place = (zone: string) => places[zone] ?? zone.replace(/[^a-zA-Z0-9]+/g, "_");
  const call = async (path: string, body?: unknown) => {
    if (!base) throw new Error("ROBOT_RMF_URL is not set");
    const res = await fetcher(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(env.ROBOT_RMF_TOKEN ? { authorization: `Bearer ${env.ROBOT_RMF_TOKEN}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`RMF ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  };
  return {
    name: "Open-RMF", mode: "pull",
    async status(r) {
      // GET /fleets/{fleet}/state → { robots: { name: { status, battery (0–1), location: { map, x, y }, task_id } } }
      try {
        const st = await call(`/fleets/${encodeURIComponent(r.fleet ?? r.vendor)}/state`);
        const x = st?.robots?.[r.externalId ?? r.name];
        if (!x) return { ...lastKnown(r, "reported"), online: false, note: `RMF doesn't list ${r.externalId ?? r.name}` };
        const status = RMF_STATUS[String(x.status)] ?? "docked";
        return { online: status !== "offline", status, ...(typeof x.battery === "number" ? { battery: Math.round(x.battery * 100) } : {}), ...(x.location ? { position: { x: x.location.x, y: x.location.y, map: x.location.map } } : {}),
          ...(x.task_id ? { job: { id: String(x.task_id), status: "running" as const } } : {}), source: "live", at: new Date().toISOString() };
      } catch (e) { return { ...lastKnown(r, "reported"), online: false, note: (e as Error).message }; }
    },
    capabilities: (r) => withLimits(r, { limits: ["Jobs run as RMF patrols over named places of its navigation graph", "No remote emergency stop over RMF's task API"] }),
    async dispatch(m) {
      try {
        const x = await call("/tasks/dispatch_task", { type: "dispatch_task_request", request: { unix_millis_earliest_start_time: Date.parse(m.plannedStart), category: "patrol", description: { places: m.waypoints.map((w) => place(w.zone)), rounds: 1 }, labels: [m.id] } });
        const id = x?.state?.booking?.id ?? x?.task_id;
        return { sent: !!x?.success || !!id, externalId: id, note: id ? `RMF task ${id}` : "RMF answered without a task id" };
      } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    async cancel(m) {
      if (!m.externalId) return { sent: false, note: "Not sent to RMF" };
      try { await call("/tasks/cancel_task", { type: "cancel_task_request", task_id: m.externalId }); return { sent: true, note: "Cancelled in RMF" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    // RMF moves robots; it doesn't carry their readings. Those come from the robot's own software (a vendor bridge or push).
    results: async () => ({ mode: "pull", reports: [], note: "Open-RMF reports where robots are and their tasks, not what they sense — readings come from the robot's own software" }),
    estop: async () => ({ sent: false, note: "Open-RMF has no remote emergency stop over its task API — use the robot's own stop button" }),
  };
}

// ------------------------------------------------------------------ a maker's own API, through a bridge (pull)
// ROBOT_FLEETS (JSON): { "<fleet>": { "url": "https://bridge.example/fleet", "token": "…", "estop": false } }. Every
// maker's bridge speaks the same small API — theirs, or a service that translates to it:
//   GET  {url}/robots/{id}                 → { online, status, battery, zone?, x?, y?, job?: { id, status?, progress? } }
//   GET  {url}/robots/{id}/results?since=  → { reports: [ the common robot report (SETUP §8f) ] }
//   POST {url}/missions                    ← the common job shape below      → { id }
//   POST {url}/missions/{id}/cancel
//   POST {url}/robots/{id}/estop           ← { on }      only when "estop" is true
// The makers' own APIs differ and are not reproduced here: each bridge is written and tested against the real fleet.
export interface FleetConfig { url: string; token?: string; estop?: boolean }
export function fleetConfig(fleet?: string, env: Env = process.env): FleetConfig | null {
  if (!fleet) return null;
  const c = json<Record<string, FleetConfig>>(env.ROBOT_FLEETS, {})[fleet];
  return c && typeof c.url === "string" && /^https?:\/\//.test(c.url) ? c : null;
}
/** A job in the common shape every vendor bridge receives. */
export const commonMission = (m: Mission, r: Robot) => ({ id: m.id, robot: r.externalId ?? r.name, kind: m.kind, title: m.title, start: m.plannedStart, durationMin: m.durationMin,
  route: m.waypoints.map((w) => ({ place: w.zone, asset: w.assetId?.split(":")[1], label: w.label, checks: w.checks })), alert: m.alertId, workOrder: m.woId });

const STATUSES: RobotStatus[] = ["docked", "charging", "on_mission", "returning", "fault", "estop", "offline"];
export function vendorAdapter(c: FleetConfig, fetcher: typeof fetch = fetch, name = "vendor fleet"): FleetAdapter {
  const base = c.url.replace(/\/+$/, "");
  const call = async (path: string, body?: unknown) => {
    const res = await fetcher(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Fleet ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  };
  const rid = (r: Robot) => encodeURIComponent(r.externalId ?? r.name);
  return {
    name, mode: "pull",
    async status(r) {
      try {
        const x = await call(`/robots/${rid(r)}`);
        const status: RobotStatus = STATUSES.includes(x?.status) ? x.status : x?.online === false ? "offline" : r.status;
        return { online: x?.online !== false && status !== "offline", status, ...(typeof x?.battery === "number" ? { battery: Math.max(0, Math.min(100, Math.round(x.battery))) } : {}), ...(typeof x?.zone === "string" ? { zone: x.zone } : {}),
          ...(typeof x?.x === "number" && typeof x?.y === "number" ? { position: { x: x.x, y: x.y } } : {}), ...(x?.job?.id ? { job: { id: String(x.job.id), ...(x.job.status ? { status: x.job.status } : {}), ...(typeof x.job.progress === "number" ? { progress: x.job.progress } : {}) } } : {}),
          source: "live", at: new Date().toISOString() };
      } catch (e) { return { ...lastKnown(r, "reported"), online: false, note: (e as Error).message }; }
    },
    capabilities: (r) => withLimits(r, c.estop ? {} : { limits: ["No remote emergency stop through this fleet"] }),
    async dispatch(m, r) { try { const x = await call("/missions", commonMission(m, r)); const id = x?.id ?? x?.missionId; return { sent: true, externalId: id, note: id ? `Fleet job ${id}` : "Sent to the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; } },
    async cancel(m) { if (!m.externalId) return { sent: false, note: "Not sent to the fleet" }; try { await call(`/missions/${encodeURIComponent(m.externalId)}/cancel`, {}); return { sent: true, note: "Cancelled in the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; } },
    async results(r, since) {
      try {
        const x = await call(`/robots/${rid(r)}/results${since ? `?since=${encodeURIComponent(since)}` : ""}`);
        const reports = (Array.isArray(x) ? x : Array.isArray(x?.reports) ? x.reports : []).slice(0, 50).map((y: RobotReport) => ({ ...y, robot: y.robot ?? r.externalId ?? r.name }));
        return { mode: "pull", reports, note: `${reports.length} report${reports.length === 1 ? "" : "s"} from the fleet` };
      } catch (e) { return { mode: "pull", reports: [], note: (e as Error).message }; }
    },
    async estop(r, on) {
      if (!c.estop) return { sent: false, note: "This fleet takes no remote emergency stop — use the robot's own stop or the vendor's console" };
      try { await call(`/robots/${rid(r)}/estop`, { on }); return { sent: true, note: on ? "Stopped in the fleet" : "Released in the fleet" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
  };
}

/** A robot run from its maker's data platform: jobs are planned there; its findings come in. */
export const platformAdapter: FleetAdapter = {
  name: "vendor platform", mode: "push",
  status: async (r) => lastKnown(r, "reported"),
  capabilities: (r) => withLimits(r, { jobs: [], limits: ["Jobs are planned in the maker's own platform, not sent from here"] }),
  dispatch: async () => ({ sent: false, note: "Planned in the vendor's own platform — its findings come in here" }),
  cancel: async () => ({ sent: false, note: "Cancel it in the vendor's platform" }),
  results: async () => pushed("the platform posts to POST /api/fm/robots"),
  estop: async () => ({ sent: false, note: "Use the robot's own stop or the vendor's console" }),
};

// ------------------------------------------------------------------ machines over MQTT, through the fleet bridge (push)
// VDA 5050 robots and DJI docks speak MQTT. The core (serverless) can't hold an MQTT connection, so it queues their
// messages as commands; the fleet bridge (bridge/fleet-bridge.mjs, on the robots' network) collects them, publishes
// them on the broker, and posts back the machines' state and its acknowledgements.
export const bridgeOn = (env: Env = process.env) => String(env.FLEET_BRIDGE_TOKEN ?? "").length >= 16;

export function vdaAdapter(env: Env = process.env): FleetAdapter {
  const nodes = json<Record<string, string>>(env.VDA5050_NODES, {}), back = Object.fromEntries(Object.entries(nodes).map(([k, v]) => [v, k]));
  return {
    name: "VDA 5050 (fleet bridge)", mode: "push",
    status: async (r) => lastKnown(r, "reported"),
    capabilities: (r) => withLimits(r, { ...(Object.keys(nodes).length ? { places: Object.keys(nodes) } : {}), limits: ["Goes only to places mapped to nodes of its own map (VDA5050_NODES)", "No remote emergency stop in VDA 5050 — the app can pause it"] }),
    dispatch: async (m, r) => ({ sent: true, note: m.route ? "Order with each node's position queued for the fleet bridge" : "Order queued for the fleet bridge", commands: [m.route ? vdaRouteOrder(m, r) : vdaOrder(m, r, nodes)], protocol: "vda5050" }),
    cancel: async (_m, r) => ({ sent: true, note: "cancelOrder queued for the fleet bridge", commands: [vdaInstant(r, "cancelOrder")], protocol: "vda5050" }),
    results: async () => pushed("the robot's state, through the fleet bridge"),
    estop: async (r, on) => ({ sent: true, note: on ? "Pause queued (VDA 5050 has no remote emergency stop — use the robot's own stop)" : "Resume queued", commands: [vdaInstant(r, on ? "startPause" : "stopPause")], protocol: "vda5050" }),
    // { robot, state: {…VDA 5050 state…} } from the bridge
    parse: (b) => (typeof b.robot === "string" && b.state && typeof b.state === "object" ? vdaStateToReport(b.state as Record<string, unknown>, b.robot, (n) => back[n] ?? n) : null),
  };
}
export function djiAdapter(env: Env = process.env): FleetAdapter {
  const waylines = json<Record<string, Wayline>>(env.DJI_WAYLINES, {});
  return {
    name: "DJI Cloud API (fleet bridge)", mode: "push",
    status: async (r) => lastKnown(r, "reported"),
    capabilities: (r) => withLimits(r, { places: Object.keys(waylines), limits: ["Flies only routes planned as waylines in DJI's tools (DJI_WAYLINES)", "Emergency stop from the dock or the remote controller"] }),
    // a route designed here flies its own wayline: the dock downloads the KMZ from the app (its MD5 as fingerprint)
    dispatch: async (m, r) => { const f = djiFlight(m, r, m.route ? { ...waylines, ...routeWayline(m, r, env) } : waylines); return "error" in f ? { sent: false, note: f.error } : { sent: true, note: m.route ? "Flight task with the designed wayline queued for the fleet bridge" : "Flight task queued for the fleet bridge", commands: f.messages, protocol: "dji" }; },
    cancel: async (m, r) => ({ sent: true, note: m.status === "running" ? "Return home queued for the fleet bridge" : "Flight task undo queued", commands: [djiCancel(m, r, m.status === "running")], protocol: "dji" }),
    results: async () => pushed("telemetry and flight progress through the fleet bridge; photos by the dock's media upload, posted with the report for the AI to read"),
    estop: async () => ({ sent: false, note: "Use the dock's or the remote controller's emergency stop — the app brings the drone home with Cancel" }),
    // { robot, method: "osd" | "flighttask_progress", data } from the bridge
    parse(b) {
      if (typeof b.robot !== "string" || !b.data || typeof b.data !== "object") return null;
      if (b.method !== "flighttask_progress") return djiOsdToReport(b.data as Record<string, unknown>, b.robot);
      const p = djiProgress(b.data as Record<string, unknown>);
      return { robot: b.robot, source: "DJI Cloud API", ...(p.missionId ? { mission: { id: p.missionId, ...(p.status ? { status: p.status } : {}), ...(typeof p.percent === "number" ? { progress: p.percent } : {}) } } : {}) };
    },
  };
}

// ------------------------------------------------------------------ Spot through Orbit (jobs out by REST, results by webhook)
export function orbitAdapter(c: OrbitConfig, fetcher: typeof fetch = fetch): FleetAdapter {
  return {
    name: "Spot Orbit", mode: "push",
    status: async (r) => lastKnown(r, "reported"),
    capabilities: (r) => withLimits(r, { places: Object.keys(c.missions ?? {}), limits: ["Runs only Autowalk missions recorded in Orbit (ORBIT.missions)", "Emergency stop from Spot's controller or Orbit"] }),
    async dispatch(m, r) {
      const req = orbitDispatch(m, r, c);
      if ("error" in req) return { sent: false, note: req.error };
      try { const res = await fetcher(req.url, { ...req.init, signal: AbortSignal.timeout(8000) }); const t = await res.text(); if (!res.ok) return { sent: false, note: `Orbit ${res.status}: ${t.slice(0, 160)}` }; return { sent: true, note: "Running in Orbit" }; } catch (e) { return { sent: false, note: (e as Error).message }; }
    },
    cancel: async () => ({ sent: false, note: "Stop the run in Orbit (its cancel call differs between releases)" }),
    results: async () => pushed("Orbit's webhooks at POST /api/fm/robots?protocol=orbit"),
    estop: async () => ({ sent: false, note: "Use Spot's own stop or Orbit's emergency stop" }),
    parse: (b) => orbitWebhookToReport(b),
  };
}

// ------------------------------------------------------------------ security patrol robots (alarms in; jobs through their bridge if any)
export function securityAdapter(c: FleetConfig | null, fetcher: typeof fetch = fetch): FleetAdapter {
  const via = c ? vendorAdapter(c, fetcher, "security robots") : null;
  return {
    name: via ? "security robots (alarms + fleet bridge)" : "security robots (alarms)", mode: via ? "pull" : "push",
    status: (r) => (via ? via.status(r) : Promise.resolve(lastKnown(r, "reported"))),
    capabilities: (r) => withLimits(r, via ? {} : { jobs: [], limits: ["Patrols are planned in the maker's security software — no fleet bridge set (ROBOT_FLEETS)"] }),
    dispatch: (m, r) => (via ? via.dispatch(m, r) : Promise.resolve({ sent: false, note: "No fleet bridge for these robots — plan the patrol in their security software" })),
    cancel: (m, r) => (via ? via.cancel(m, r) : Promise.resolve({ sent: false, note: "Cancel it in their security software" })),
    results: async (r, since) => { const p = via ? await via.results(r, since) : null; const push = pushed("alarms posted to POST /api/fm/robots?protocol=security, with the live video address"); return p ? { ...p, note: `${p.note}; ${push.note.toLowerCase()}` } : push; },
    estop: (r, on) => (via ? via.estop(r, on) : Promise.resolve({ sent: false, note: "Use the robot's own stop or its security console" })),
    parse: (b) => securityAlarmToReport(b),
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
  if (r.adapter === "vendor" && c) return vendorAdapter(c);
  if (r.adapter === "security" && (c || env.ROBOT_INGEST_TOKEN)) return securityAdapter(c);
  if (r.adapter === "platform" && (c || env.ROBOT_INGEST_TOKEN)) return platformAdapter;
  return simAdapter;
}

/** The converter for a machine's own message format (POST /api/fm/robots?protocol=…), whether or not it is set up. */
export function parserFor(protocol: string, env: Env = process.env): ((raw: Record<string, unknown>) => RobotReport | null) | null {
  const ad = protocol === "vda5050" ? vdaAdapter(env) : protocol === "dji" ? djiAdapter(env) : protocol === "orbit" ? orbitAdapter(orbitConfig(env) ?? { url: "" }) : protocol === "security" ? securityAdapter(null) : null;
  return ad?.parse ?? null;
}

/** A robot's connection, summarised for the cockpit and the API: the five functions as this robot answers them. */
export function connectionOf(r: Robot, env: Env = process.env) {
  const ad = adapterFor(r, env), cap = ad.capabilities(r);
  return { adapter: ad.name, mode: ad.mode, can: cap.can, jobs: cap.jobs, places: cap.places ?? null, limits: cap.limits };
}
