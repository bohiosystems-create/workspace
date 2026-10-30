// Inspection routes designed by the schedule itself. What the facility needs checked — planned maintenance falling due,
// the predictive engine's assets at risk, the inspection plan's surfaces not inspected for too long, findings to check
// again — becomes inspection tasks; each check goes to the robot that can make it there (its sensors, the area's
// hazards and its Ex rating, air or ground by the height of what is inspected, contact methods to a climbing crawler,
// sonar to an underwater vehicle); each robot's tasks are ordered into the shortest round from its dock (nearest
// neighbour, then 2-opt) and cut into sorties it can fly or drive with a quarter of its battery to spare; airside work
// waits for the nightly closure. Every waypoint has its place on the map and on the earth (the site frame), with the
// height or depth, heading and camera angle for drones and underwater vehicles — ready to export in each machine's own
// format (export.ts) and to send through its adapter. Deterministic: the same schedule gives the same routes.
import type { Asset, FmData, ZoneDef } from "../fm/types";
import type { Capability, Robot } from "./types";
import { DOMAIN_OF } from "./types";
import { LOCOMOTION, inspectionPlan, locomotionOf, type Locomotion } from "./inspection";
import { pdmReport } from "../fm/pdm";
import { airsideOpen, dronesGrounded, robotMayEnter } from "../fm/work";

// ------------------------------------------------------------------ the site on the earth
/** Where the map sits: its top-left corner, metres per map unit, ground elevation. Demo coordinates — a real site sets
 *  surveyed values (env SITE_FRAMES, JSON keyed by facility). */
export interface SiteFrame { lat: number; lon: number; mPerUnit: number; elevM: number; demo: boolean }
const DEMO_FRAMES: Record<string, SiteFrame> = {
  kgpp: { lat: 25.6215, lon: 49.1820, mPerUnit: 12, elevM: 96, demo: true },
  kgia: { lat: 25.2140, lon: 49.4105, mPerUnit: 40, elevM: 152, demo: true },
  kcps: { lat: 21.7420, lon: 39.0610, mPerUnit: 10, elevM: 5, demo: true },
  krsd: { lat: 21.9530, lon: 39.0240, mPerUnit: 10, elevM: 4, demo: true },
};
export function siteFrame(facilityId: string): SiteFrame {
  try {
    const env = typeof process !== "undefined" ? process.env.SITE_FRAMES : undefined;
    const f = env ? (JSON.parse(env) as Record<string, Partial<SiteFrame>>)[facilityId] : undefined;
    if (f?.lat !== undefined && f.lon !== undefined && f.mPerUnit) return { lat: f.lat, lon: f.lon, mPerUnit: f.mPerUnit, elevM: f.elevM ?? 0, demo: false };
  } catch { /* a malformed SITE_FRAMES falls back to the demo frame */ }
  return DEMO_FRAMES[facilityId] ?? { lat: 25, lon: 49, mPerUnit: 10, elevM: 0, demo: true };
}
/** A map point (units, y down) on the earth. */
export function toGeo(f: SiteFrame, x: number, y: number) {
  const lat = f.lat - (y * f.mPerUnit) / 111_320, lon = f.lon + (x * f.mPerUnit) / (111_320 * Math.cos((f.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Where an asset stands on the map: inside its zone, always at the same spot. */
export function assetPoint(z: ZoneDef, assetId: string) {
  const h = hash(assetId);
  return { x: z.x + z.w * (0.18 + 0.64 * ((h % 1000) / 1000)), y: z.y + z.h * (0.2 + 0.6 * (((h >>> 10) % 1000) / 1000)) };
}
/** Height of what is inspected (m): a drone looks at the top of a stack, a column, a tank roof. */
const HEIGHT_M: Record<string, number> = { flare: 90, amine: 35, teg: 25, hrsg: 30, tank: 18, gt: 12, st: 10, separator: 7, gascomp: 6, transformer: 6, expander: 4, pipeline: 0 };

// ------------------------------------------------------------------ what needs checking
export interface InspTask {
  assetId: string; tag: string; name: string; cls: string; zone: string; x: number; y: number; heightM: number;
  checks: Capability[]; priority: 1 | 2 | 3; reasons: string[]; source: ("predictive" | "pm" | "plan" | "recheck")[];
}
/** What a robot can check on a class of equipment during a round (its planned maintenance's robot part). */
const ROUND_CHECKS: Record<string, Capability[]> = {
  pump: ["acoustic", "thermal"], hpump: ["acoustic", "thermal"], gascomp: ["acoustic", "thermal", "gas"], compressor: ["acoustic", "thermal"], expander: ["acoustic", "thermal"],
  separator: ["gas", "visual"], amine: ["gas", "visual"], teg: ["gas", "thermal"], tank: ["ut_thickness", "visual"], flare: ["visual", "thermal"], pipeline: ["visual", "thermal", "gas"],
  transformer: ["thermal", "visual"], breaker: ["thermal"], gt: ["thermal", "acoustic"], st: ["acoustic", "thermal"], chiller: ["thermal", "acoustic"], ahu: ["thermal"], firepump: ["acoustic"], ups: ["thermal"], ccr: ["visual"], genset: ["thermal", "acoustic"],
};
/** Which sensor reads a reading the predictive engine is worried about. */
function checkFor(key: string): Capability[] {
  if (/vib|sgas/.test(key)) return ["acoustic", "thermal"];
  if (/brg|exh|oil|wdg|dt|stack|sat|chws|temp|mtr|brk|pca|appr|kwtr/.test(key)) return ["thermal"];
  if (/h2s|lel/.test(key)) return ["gas"];
  if (key === "wall") return ["ut_thickness"];
  if (key === "span") return ["sonar"];
  if (key === "pilot") return ["visual", "thermal"];
  return ["visual"];
}

export function inspectionTasks(d: FmData, facilityId: string, horizonDays = 2): InspTask[] {
  const by = new Map<string, InspTask>();
  const add = (a: Asset, checks: Capability[], pr: 1 | 2 | 3, reason: string, src: InspTask["source"][number]) => {
    const z = d.zones.find((x) => x.facilityId === facilityId && x.name === a.zone);
    if (!z || !checks.length) return;
    const t = by.get(a.id) ?? (() => { const p = assetPoint(z, a.id); const n: InspTask = { assetId: a.id, tag: a.tag, name: a.name, cls: a.class, zone: z.id, x: p.x, y: p.y, heightM: HEIGHT_M[a.class] ?? 3, checks: [], priority: pr, reasons: [], source: [] }; by.set(a.id, n); return n; })();
    for (const c of checks) if (!t.checks.includes(c)) t.checks.push(c);
    t.priority = Math.max(t.priority, pr) as 1 | 2 | 3;
    if (!t.reasons.includes(reason)) t.reasons.push(reason);
    if (!t.source.includes(src)) t.source.push(src);
  };
  const assets = d.assets.filter((a) => a.facilityId === facilityId && a.status !== "maintenance");
  const asset = new Map(assets.map((a) => [a.id, a]));
  // 1. the predictive engine: degrading, abnormal or past a limit — look at it now
  for (const h of pdmReport(d, facilityId).assets) {
    const a = asset.get(h.assetId); if (!a) continue;
    for (const s of h.series.filter((x) => x.status === "degrading" || x.status === "anomaly" || x.status === "alarm"))
      add(a, checkFor(s.key), s.status === "alarm" || s.p30 >= 0.7 ? 3 : 2, s.status === "degrading" ? `predictive: ${s.name.toLowerCase()} ${s.side === "high" ? "rising" : "falling"}, ${Math.round(s.p30 * 100)} % to its limit within 30 days` : s.status === "alarm" ? `${s.name.toLowerCase()} past its limit` : `${s.name.toLowerCase()} abnormal`, "predictive");
  }
  // 2. planned maintenance falling due: its checks a robot can make on the way
  const until = new Date(Date.parse(d.date) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  for (const w of d.workOrders.filter((x) => x.facilityId === facilityId && x.type === "PM" && x.status !== "done" && x.due <= until)) {
    const a = asset.get(w.assetId); if (a) add(a, ROUND_CHECKS[a.class] ?? ["visual"], 1, `planned maintenance ${w.id} due ${w.due}`, "pm");
  }
  // 3. the inspection plan: surfaces a robot can reach and hasn't inspected this week (contact methods: this month)
  for (const r of inspectionPlan(d, facilityId)) {
    const a = asset.get(r.target.assetId); if (!a || !r.robots.length) continue;
    const age = r.last ? (Date.parse(d.date) - Date.parse(r.last)) / 86_400_000 : Infinity;
    const contact = r.robots.some((x) => x.method === "ut" || x.method === "mfl" || x.method === "ect");
    if (age < (contact ? 30 : 7)) continue;
    const caps = r.robots.map((x) => (x.method === "ut" ? "ut_thickness" : x.method === "mfl" ? "mfl" : x.method === "ect" ? "eddy_current" : x.method)).filter((c) => ["visual", "thermal", "ut_thickness", "sonar", "mfl", "eddy_current"].includes(c)) as Capability[];
    if (["external_steel", "aerial", "subsea"].includes(r.target.surface)) add(a, [...new Set(caps)].slice(0, 2), 1, `inspection plan: ${r.target.part} ${r.last ? `last inspected ${Math.round(age)} days ago` : "not inspected by a robot yet"}`, "plan");
  }
  // 4. what robots found and nobody has looked at: check it again
  for (const f of d.missions.flatMap((m) => m.findings).filter((x) => x.facilityId === facilityId && !x.acknowledged && !x.woId && (x.severity === "high" || x.severity === "medium"))) {
    const a = f.assetId ? asset.get(f.assetId) : undefined; if (a) add(a, [f.sensor], f.severity === "high" ? 3 : 2, `re-check: ${f.label}`, "recheck");
  }
  return [...by.values()].sort((x, y) => y.priority - x.priority || x.tag.localeCompare(y.tag));
}

// ------------------------------------------------------------------ routes
export interface RoutePoint {
  seq: number; kind: "dock" | "inspect" | "transit";
  x: number; y: number; lat: number; lon: number;
  /** air: height above the take-off point (m); subsea: depth (m, positive down) */
  altM?: number; depthM?: number;
  /** where the nose and the camera point (degrees: 0 north, clockwise; pitch negative down) */
  headingDeg?: number; gimbalPitchDeg?: number;
  assetId?: string; tag?: string; zone?: string; label: string; checks: Capability[]; dwellS: number; reasons?: string[];
}
export interface Sortie { n: number; start: string; durationMin: number; distanceM: number; batteryPct: number; airside: boolean; points: RoutePoint[] }
export type ExportFormat = "dji_kmz" | "qgc_plan" | "vda5050" | "rmf_task" | "bohio_json";
export interface RobotRoute {
  robotId: string; name: string; model: string; kind: Robot["kind"]; locomotion: Locomotion; adapter: Robot["adapter"];
  sorties: Sortie[]; tasks: number; checks: number;
  /** the files its machine loads, best first */
  formats: ExportFormat[];
  /** whether the app can send it straight to the machine (its connection takes missions) */
  sendable: boolean; sendNote: string;
}
export interface RoutePlan { facilityId: string; date: string; frame: SiteFrame; routes: RobotRoute[]; uncovered: { tag: string; checks: Capability[]; why: string }[]; tasks: InspTask[] }

const SPEED: Partial<Record<Locomotion, number>> = { legged: 1.0, wheeled: 1.3, multirotor: 7, fixed_wing: 16, rov: 0.7, auv: 1.2, magnetic_crawler: 0.8, vacuum_crawler: 0.8 };
const DWELL_S: Record<Capability, number> = { visual: 30, thermal: 40, gas: 60, acoustic: 90, lidar: 60, ut_thickness: 480, sonar: 300, mfl: 600, eddy_current: 300, intrusion: 20, manipulate: 120, fod: 30, layout: 60, carry: 30 };
/** Robots for single, special-purpose deployments (a pig run, an in-pipe crawler, a tank-floor survey, a caged drone
 *  inside a vessel): planned one by one from the Inspection tab, not in daily routes. */
const SPECIAL = new Set<Locomotion>(["pig", "wheeled_in_pipe", "tracked_in_pipe", "legged_in_pipe", "inchworm", "snake", "screw", "tank_submersible", "caged_drone"]);
const CONTACT = new Set<Capability>(["ut_thickness", "mfl", "eddy_current"]);

const air = (r: Robot) => DOMAIN_OF[r.kind] === "air";
const formatsFor = (r: Robot): ExportFormat[] => r.adapter === "dji" ? ["dji_kmz", "qgc_plan", "bohio_json"] : air(r) ? ["qgc_plan", "dji_kmz", "bohio_json"]
  : DOMAIN_OF[r.kind] === "subsea" ? ["qgc_plan", "bohio_json"] : r.adapter === "vda5050" ? ["vda5050", "rmf_task", "bohio_json"] : r.adapter === "rmf" ? ["rmf_task", "vda5050", "bohio_json"] : ["vda5050", "rmf_task", "bohio_json"];

/** The day's inspection routes: every task's checks given to robots, each robot's round ordered and cut into sorties. */
export function planRoutes(d: FmData, facilityId: string, now = Date.now(), horizonDays = 2): RoutePlan {
  const frame = siteFrame(facilityId), M = frame.mPerUnit;
  const tasks = inspectionTasks(d, facilityId, horizonDays);
  const zones = new Map(d.zones.filter((z) => z.facilityId === facilityId).map((z) => [z.id, z]));
  const robots = d.robots.filter((r) => r.facilityId === facilityId && !r.estop && r.status !== "fault" && r.status !== "offline" && !SPECIAL.has(locomotionOf(r)));
  const grounded = !!dronesGrounded(d, facilityId, now);
  const load = new Map<string, number>();
  const work = new Map<string, { t: InspTask; checks: Capability[] }[]>();
  const uncovered: RoutePlan["uncovered"] = [];
  for (const t of tasks) {
    const z = zones.get(t.zone)!;
    const byRobot = new Map<string, Capability[]>();
    const missing: Capability[] = [];
    const whyNot: string[] = [];
    const ok = (r: Robot, c: Capability) => {
      if (!r.capabilities.includes(c)) return false;
      const lo = locomotionOf(r), info = LOCOMOTION[lo];
      if (CONTACT.has(c)) return info.reaches.includes("external_steel") && lo !== "multirotor";
      if (c === "sonar") return DOMAIN_OF[r.kind] === "subsea" || DOMAIN_OF[r.kind] === "sea";
      if (DOMAIN_OF[r.kind] === "subsea" || DOMAIN_OF[r.kind] === "climbing") return false;
      if (air(r) && grounded) { whyNot.push(`${r.name} stays down — an unidentified drone was reported`); return false; }
      return robotMayEnter(r, z);
    };
    // one robot for as many of the task's checks as it can make (one visit, not two); air for what is high (stacks,
    // columns, roofs) or long (the pipeline), the ground for the rest; then the least loaded
    const wantAir = t.heightM >= 15 || t.cls === "pipeline";
    let left = [...t.checks];
    while (left.length) {
      const scored = robots.map((r) => ({ r, cs: left.filter((c) => ok(r, c)) })).filter((x) => x.cs.length);
      if (!scored.length) { missing.push(...left); break; }
      const pick = scored.sort((a, b) => b.cs.length - a.cs.length || Number(air(b.r) === wantAir) - Number(air(a.r) === wantAir) || (load.get(a.r.id) ?? 0) - (load.get(b.r.id) ?? 0) || a.r.name.localeCompare(b.r.name))[0];
      byRobot.set(pick.r.id, [...(byRobot.get(pick.r.id) ?? []), ...pick.cs]);
      load.set(pick.r.id, (load.get(pick.r.id) ?? 0) + pick.cs.reduce((s2, c) => s2 + DWELL_S[c], 0));
      left = left.filter((c) => !pick.cs.includes(c));
    }
    for (const [rid, checks] of byRobot) work.set(rid, [...(work.get(rid) ?? []), { t, checks }]);
    if (missing.length) uncovered.push({ tag: t.tag, checks: missing, why: [...new Set(whyNot)][0] ?? `no robot here has ${missing.join(", ")} and may go to ${z.name}${z.atex ? ` (zone ${z.atex}: Ex-certified only)` : ""}` });
  }
  const routes: RobotRoute[] = [];
  for (const r of robots) {
    const items = work.get(r.id); if (!items?.length) continue;
    const lo = locomotionOf(r), speed = SPEED[lo] ?? 1, dockZ = zones.get(r.dock);
    const dock = dockZ ? { x: dockZ.x + dockZ.w / 2, y: dockZ.y + dockZ.h / 2 } : { x: r.x, y: r.y };
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) * M * (air(r) || DOMAIN_OF[r.kind] === "subsea" ? 1 : 1.25);
    const live = (it: (typeof items)[number]) => { const z = zones.get(it.t.zone); return !!z?.closed; };
    const groups = [items.filter((x) => !live(x)), items.filter(live)].filter((g) => g.length);
    const sorties: Sortie[] = [];
    let clock = firstFree(d, r, now);
    for (const g of groups) {
      const airside = live(g[0]);
      if (airside) { const z = zones.get(g[0].t.zone)!; clock = Math.max(clock, nextClosure(z, clock)); }
      const order = shortest(dock, g.map((x) => x.t), dist);
      // cut into sorties: out, the checks, back — within three quarters of its endurance
      const budget = r.enduranceMin * 60 * 0.75;
      let cur: (typeof g)[number][] = [];
      const flush = () => {
        if (!cur.length) return;
        const pts = geometry(r, dock, cur, frame, d);
        let s = 0, t = 0;
        for (let i = 1; i < pts.length; i++) { const dd = dist(pts[i - 1], pts[i]); s += dd; t += dd / speed + pts[i].dwellS; }
        const start = new Date(clock).toISOString();
        sorties.push({ n: sorties.length + 1, start, durationMin: Math.ceil(t / 60), distanceM: Math.round(s), batteryPct: Math.min(100, Math.round((t / 60 / r.enduranceMin) * 100)), airside, points: pts });
        clock += (t + (air(r) ? 25 * 60 : 15 * 60)) * 1000; // turnaround: swap or charge between sorties
        cur = [];
      };
      for (const id of order) {
        const it = g.find((x) => x.t.assetId === id)!;
        const trial = [...cur, it];
        const pts = geometry(r, dock, trial, frame, d);
        let t = 0; for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]) / speed + pts[i].dwellS;
        if (t > budget && cur.length) flush();
        cur.push(it);
      }
      flush();
    }
    const ad = r.adapter;
    const sendable = ad !== "platform" && ad !== "security";
    routes.push({ robotId: r.id, name: r.name, model: r.model, kind: r.kind, locomotion: lo, adapter: ad, sorties, tasks: items.length, checks: items.reduce((n, x) => n + x.checks.length, 0), formats: formatsFor(r), sendable,
      sendNote: !sendable ? `Planned in the maker's own software (${r.platform ?? "its platform"}): download the plan and load it there` : ad === "sim" ? "Simulated here: the route runs in the demo" : ad === "dji" ? "Sent to the dock as a flight task; the dock downloads this wayline (KMZ) from the app" : ad === "vda5050" ? "Sent as a VDA 5050 order with each node's position" : ad === "orbit" ? "Orbit runs recorded missions: the route picks and orders them" : `Sent through its connection (${ad})` });
  }
  return { facilityId, date: d.date, frame, routes, uncovered, tasks };
}

/** The earliest moment a robot is free: after the missions it already has today. */
function firstFree(d: FmData, r: Robot, now: number) {
  let t = Math.ceil((now + 10 * 60_000) / (5 * 60_000)) * 5 * 60_000;
  for (const m of d.missions.filter((x) => x.robotId === r.id && (x.status === "planned" || x.status === "running")).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))) {
    const s = Date.parse(m.plannedStart), e = s + m.durationMin * 60_000;
    if (t < e && t + 30 * 60_000 > s) t = e + 10 * 60_000;
  }
  return t;
}
/** The next nightly closure of an airside area (local time, UTC+3), from a moment. */
function nextClosure(z: ZoneDef, from: number) {
  if (!z.closed || !airsideOpen(z, from)) return from;
  const day = Date.parse(new Date(from + 3 * 3600_000).toISOString().slice(0, 10) + "T00:00:00Z") - 3 * 3600_000;
  const open = day + z.closed[0] * 3600_000;
  return open > from ? open : open + 86_400_000;
}
/** The shortest round from the dock through the tasks: nearest neighbour, then 2-opt. Returns the asset ids in order. */
function shortest(dock: { x: number; y: number }, ts: InspTask[], dist: (a: { x: number; y: number }, b: { x: number; y: number }) => number): string[] {
  const left = [...ts], route: InspTask[] = [];
  let at: { x: number; y: number } = dock;
  while (left.length) { left.sort((a, b) => dist(at, a) - dist(at, b) || a.tag.localeCompare(b.tag)); const n = left.shift()!; route.push(n); at = n; }
  const len = (xs: InspTask[]) => xs.reduce((s, p, i) => s + dist(i ? xs[i - 1] : dock, p), 0) + (xs.length ? dist(xs[xs.length - 1], dock) : 0);
  let best = route, improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
      const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
      if (len(cand) + 1e-6 < len(best)) { best = cand; improved = true; }
    }
  }
  return best.map((t) => t.assetId);
}

/** The waypoints of a sortie: dock, each inspection (for drones a stand-off point with height, heading and camera pitch;
 *  for underwater vehicles a survey line with depth), dock. */
function geometry(r: Robot, dock: { x: number; y: number }, items: { t: InspTask; checks: Capability[] }[], f: SiteFrame, d: FmData): RoutePoint[] {
  const M = f.mPerUnit, pts: RoutePoint[] = [];
  const P = (p: Omit<RoutePoint, "seq" | "lat" | "lon">) => pts.push({ ...p, seq: pts.length, ...toGeo(f, p.x, p.y) });
  const isAir = air(r), sub = DOMAIN_OF[r.kind] === "subsea";
  P({ kind: "dock", x: dock.x, y: dock.y, zone: r.dock, label: `${r.name} dock`, checks: [], dwellS: 0, ...(isAir ? { altM: 0 } : {}) });
  for (const { t, checks } of items) {
    const dwell = checks.reduce((s, c) => s + DWELL_S[c], 0);
    if (isAir) {
      // a stand-off south of the asset, facing north to it: far enough from a flare's heat, high enough to see the top
      const stand = t.cls === "flare" ? 60 : t.cls === "pipeline" ? 0 : 20, alt = Math.max(30, t.heightM + (t.cls === "flare" ? 0 : 10));
      if (t.cls === "pipeline") {
        const z = d.zones.find((x) => x.id === t.zone)!;
        for (let k = 0; k < 3; k++) P({ kind: k === 1 ? "inspect" : "transit", x: z.x + z.w * (0.15 + 0.35 * k), y: t.y, altM: 40, headingDeg: 90, gimbalPitchDeg: -60, assetId: t.assetId, tag: t.tag, zone: t.zone, label: `${t.tag} right of way ${k + 1}/3`, checks: k === 1 ? checks : [], dwellS: k === 1 ? dwell : 0, reasons: k === 1 ? t.reasons : undefined });
        continue;
      }
      const pitch = -Math.round((Math.atan2(alt - t.heightM * 0.7, Math.max(stand, 8)) * 180) / Math.PI);
      P({ kind: "inspect", x: t.x, y: t.y + stand / M, altM: alt, headingDeg: 0, gimbalPitchDeg: Math.max(-90, Math.min(0, pitch)), assetId: t.assetId, tag: t.tag, zone: t.zone, label: `${t.tag} ${t.name}`, checks, dwellS: dwell, reasons: t.reasons });
    } else if (sub) {
      // the subsea section: a survey line seaward from the shore crossing, 2 m above the seabed
      for (let k = 0; k < 5; k++) P({ kind: k === 0 || k === 4 ? "transit" : "inspect", x: t.x + (k * 900) / M, y: t.y, depthM: 10 + k * 1.5, headingDeg: 90, gimbalPitchDeg: -30, assetId: t.assetId, tag: t.tag, zone: t.zone, label: `${t.tag} KP ${(k * 0.9).toFixed(1)}`, checks: k === 0 || k === 4 ? [] : checks, dwellS: k === 0 || k === 4 ? 0 : Math.round(dwell / 3), reasons: k === 1 ? t.reasons : undefined });
    } else {
      P({ kind: "inspect", x: t.x, y: t.y + 1.2, headingDeg: 0, assetId: t.assetId, tag: t.tag, zone: t.zone, label: `${t.tag} ${t.name}`, checks, dwellS: dwell, reasons: t.reasons });
    }
  }
  P({ kind: "dock", x: dock.x, y: dock.y, zone: r.dock, label: `back to ${r.name}'s dock`, checks: [], dwellS: 0, ...(isAir ? { altM: 0 } : {}) });
  return pts;
}

/** The route's robot, as the exporters want it (for a mission sent earlier). */
export const routeOf = (r: Robot, sortie: Sortie): RobotRoute => ({ robotId: r.id, name: r.name, model: r.model, kind: r.kind, locomotion: locomotionOf(r), adapter: r.adapter, sorties: [sortie], tasks: 0, checks: 0, formats: formatsFor(r), sendable: true, sendNote: "" });
