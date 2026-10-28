// The gas processing plant's working world, beyond its equipment (data.ts): the hazard zones on its plan, the
// contractors and their crews on site this week, the robot fleet and today's robot missions, and the turnaround of
// compressor train B — a week-long shutdown run by contractor crews, with permits, gas tests and robot pre-entry
// checks. Everything is laid out for the calendar date, like the rest of the demo; changes are events (engine.ts).
import type { SecurityAlert, Crew, FmContractor, FmData, Trade, WorkOrder, ZoneDef } from "./types";
import type { Mission, Robot, Waypoint } from "../robots/types";

const FID = "kgpp";
const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** A local (Riyadh, UTC+3) clock time on a date, as ISO. */
export const localAt = (date: string, h: number, m = 0) => new Date(Date.parse(`${date}T00:00:00Z`) + ((h - 3) * 60 + m) * 60_000).toISOString();

// ------------------------------------------------------------------ the plan of the plant: zones and their hazards
const Z = (id: string, name: string, hazards: ZoneDef["hazards"], atex: ZoneDef["atex"], x: number, y: number, w: number, h: number): ZoneDef => ({ id: `${FID}:${id}`, facilityId: FID, name, hazards, atex, x, y, w, h });
export const GAS_ZONES: ZoneDef[] = [
  Z("cr", "Control room", [], null, 2, 2, 15, 10),
  Z("dock", "Robot dock", [], null, 2, 14, 15, 20),
  Z("gate", "Main gate & security", [], null, 2, 37, 15, 12),
  Z("inl", "Inlet & separation", ["h2s", "hydrocarbon"], 1, 20, 2, 22, 18),
  Z("cmp", "Compression", ["hydrocarbon", "noise", "hot_surface"], 2, 45, 2, 30, 18),
  Z("flr", "Flare", ["height", "hot_surface"], null, 78, 2, 20, 18),
  Z("agr", "Gas treating (amine)", ["h2s", "hydrocarbon"], 1, 20, 23, 22, 17),
  Z("dhy", "Dehydration & NGL", ["hydrocarbon", "hot_surface"], 2, 45, 23, 30, 17),
  Z("tnk", "Tank farm", ["hydrocarbon", "confined_space"], 1, 78, 23, 20, 17),
  Z("utl", "Utilities & power", ["high_voltage"], null, 20, 43, 30, 15),
  Z("lay", "Laydown (contractors)", [], null, 53, 43, 22, 15),
  Z("jty", "Export line & jetty", ["marine", "hydrocarbon"], null, 78, 43, 20, 15),
];
export const zoneByName = (name: string) => GAS_ZONES.find((z) => z.name === name);

// ------------------------------------------------------------------ contractors and crews
export const GAS_CONTRACTORS: FmContractor[] = [
  { id: `${FID}:c1`, facilityId: FID, name: "Arabian Scaffolding Co.", trades: ["scaffolding"], scope: "Scaffolding and access for the turnaround and routine work", contractRef: "CT-2026-041", until: "2027-06-30", dayRate: 9_500, performance: { onTimePct: 96, reworkPct: 1, ltiFreeDays: 412, rating: "good" } },
  { id: `${FID}:c2`, facilityId: FID, name: "Gulf Mechanical Services", trades: ["rotating", "mechanical"], scope: "Compressor overhauls, piping and coded welding", contractRef: "CT-2026-017", until: "2027-03-31", dayRate: 24_000, performance: { onTimePct: 82, reworkPct: 6, ltiFreeDays: 188, rating: "watch", note: "Two jobs finished late on the last turnaround; weld rework on one nozzle" } },
  { id: `${FID}:c3`, facilityId: FID, name: "Desert NDT Inspection", trades: ["inspection"], scope: "Non-destructive testing (UT, MT, radiography) and integrity reports", contractRef: "CT-2026-022", until: "2027-12-31", dayRate: 14_000, performance: { onTimePct: 98, reworkPct: 0, ltiFreeDays: 905, rating: "good" } },
  { id: `${FID}:c4`, facilityId: FID, name: "Petro Valve Services", trades: ["mechanical"], scope: "Valve overhaul, isolation and blinding", contractRef: "CT-2026-030", until: "2027-09-30", dayRate: 12_000, performance: { onTimePct: 93, reworkPct: 2, ltiFreeDays: 640, rating: "good" } },
  { id: `${FID}:c5`, facilityId: FID, name: "Coastal E&I Contracting", trades: ["electrical", "instrumentation"], scope: "Electrical and instrument maintenance, loop checks", contractRef: "CT-2026-052", until: "2027-02-28", dayRate: 11_000, performance: { onTimePct: 74, reworkPct: 9, ltiFreeDays: 233, rating: "poor", note: "Loop checks redone on 3 of 11 instruments last month" } },
];
/** A crew lead's (fictional) mobile number: fixed, so they can sign in to the field app and WhatsApp. */
export const crewPhone = (i: number) => `+9665549${String(i + 1).padStart(2, "0")}${String(500 + i * 41).slice(-3)}0`;
const CREWS: [contractor: number, name: string, lead: string, size: number, trades: Trade[], zone: string, status: Crew["status"], certs: string[]][] = [
  [0, "Scaffold crew A", "Imran Shah", 8, ["scaffolding"], "Compression", "on_job", ["CISRS scaffolders", "Work at height"]],
  [1, "Compressor crew", "Viktor Petrenko", 10, ["rotating", "mechanical"], "Laydown (contractors)", "available", ["OEM-trained compressor fitters", "H₂S awareness", "Confined-space entry"]],
  [1, "Pipe & welding crew", "Mario Santos", 6, ["mechanical"], "Laydown (contractors)", "available", ["Coded welders (ASME IX)", "Hot-work trained", "H₂S awareness"]],
  [2, "NDT team", "Chen Wei", 3, ["inspection"], "Laydown (contractors)", "available", ["ASNT Level II UT/MT", "Rope access"]],
  [3, "Valve crew", "Omar Faruk", 4, ["mechanical"], "Compression", "on_job", ["Valve technicians", "Isolation & blinding"]],
  [4, "E&I crew", "Dinesh Kumar", 4, ["electrical", "instrumentation"], "Utilities & power", "available", ["Ex-inspection (CompEx)", "HV switching"]],
];
export const GAS_CREWS: Crew[] = CREWS.map(([c, name, lead, size, trades, zone, status, certs], i) => ({ id: `${FID}:crew${i + 1}`, contractorId: GAS_CONTRACTORS[c].id, facilityId: FID, name, lead, leadPhone: crewPhone(i), size, trades, zone, shift: "day", status, certs }));

// ------------------------------------------------------------------ the robot fleet
// Many makers, one fleet — as at the operators this is built for: quadrupeds, a heavy "operator" robot that turns
// valves, a security patrol robot, drones (a docked quadcopter and a long-range fixed-wing), a climbing crawler whose
// data lives in its maker's platform, and an underwater drone for the export line. Each keeps its own software; the
// orchestrator directs them all the same way. Makers are named "-type": demo stand-ins, not the vendors' products.
const R = (id: string, name: string, model: string, vendor: string, kind: Robot["kind"], caps: Robot["capabilities"], exRated: boolean, enduranceMin: number, roles: Robot["roles"], extra: Partial<Robot> = {}): Robot =>
  ({ id: `${FID}:${id}`, facilityId: FID, name, model, vendor, kind, capabilities: caps, exRated, enduranceMin, roles, dock: `${FID}:dock`, autonomy: "policy", adapter: "sim", operator: "Plant inspection team", status: "docked", battery: 100, zone: `${FID}:dock`, x: 9, y: 18, ...extra });
export const GAS_ROBOTS: Robot[] = [
  R("r1", "Ex-1", "ANYmal X-type (demo)", "ANYbotics-type", "quadruped", ["visual", "thermal", "gas", "acoustic", "lidar"], true, 90, ["inspection", "emergency"], { fleet: "quadrupeds", platform: "Vendor fleet manager (demo)" }),
  R("r5", "Ex-2", "ANYmal X-type (demo)", "ANYbotics-type", "quadruped", ["visual", "thermal", "gas", "acoustic", "lidar"], true, 90, ["inspection", "emergency"], { fleet: "quadrupeds", platform: "Vendor fleet manager (demo)" }),
  R("r2", "Spot-2", "Spot-type (demo)", "Boston Dynamics-type", "quadruped", ["visual", "thermal", "acoustic", "lidar"], false, 75, ["inspection"], { autonomy: "supervised", adapter: "rmf", fleet: "rmf" }),
  R("r6", "Op-1", "Heavy-duty operator robot (demo)", "Taurob-type", "ugv", ["visual", "thermal", "gas", "acoustic", "lidar", "manipulate"], true, 240, ["inspection", "emergency"], { autonomy: "remote", pilotRole: "robot operator", fleet: "operator", platform: "Vendor mission planner (demo)" }),
  R("r7", "Patrol-1", "Security patrol robot (demo)", "Micropolis-type", "ugv", ["visual", "thermal", "intrusion", "lidar", "acoustic"], false, 480, ["security", "inspection"], { dock: `${FID}:gate`, zone: `${FID}:gate`, adapter: "vendor", fleet: "security", platform: "Security operations centre software (demo)", operator: "Security integrator, through a local partner (demo)" }),
  R("r3", "Drone-1", "Dock-based drone (demo)", "Percepto-type", "drone", ["visual", "thermal", "gas", "intrusion"], false, 35, ["inspection", "security", "emissions"], { maxWindMs: 12, fleet: "drones-dock", platform: "Drone-in-a-box software (demo)" }),
  R("r8", "VTOL-1", "Long-range fixed-wing VTOL drone (demo)", "Terra Drone-type", "fixed_wing", ["visual", "thermal", "gas"], false, 120, ["inspection", "emissions", "security"], { maxWindMs: 15, autonomy: "remote", pilotRole: "drone", adapter: "vendor", fleet: "drone-service", platform: "Drone service provider's platform (demo)", operator: "Drone inspection service, through a local partner (demo)" }),
  R("r4", "Crawler-1", "Magnetic climbing crawler (demo)", "Gecko-type", "crawler", ["ut_thickness", "visual"], true, 120, ["inspection"], { autonomy: "supervised", adapter: "platform", fleet: "crawlers", platform: "Cantilever-type asset-integrity platform (demo)", operator: "Crawler inspection service (demo)" }),
  R("r9", "ROV-1", "Shallow-water inspection drone (demo)", "Tethys-type", "rov", ["visual", "sonar"], false, 180, ["inspection"], { dock: `${FID}:jty`, zone: `${FID}:jty`, autonomy: "remote", pilotRole: "ROV", adapter: "platform", fleet: "subsea", platform: "Vendor survey platform (demo)", operator: "Marine services contractor (demo)" }),
];

const asset = (tag: string) => `${FID}:${tag}`;
const W = (zone: string, tag: string | undefined, label: string, checks: Waypoint["checks"]): Waypoint => ({ zone: `${FID}:${zone}`, ...(tag ? { assetId: asset(tag) } : {}), label, checks });
const ROUND: Waypoint[] = [
  W("inl", "V-101", "Inlet separator V-101", ["visual", "gas"]), W("inl", "SC-100", "Slug catcher SC-100", ["thermal", "gas"]),
  W("cmp", "K-201A", "Compressor K-201A", ["acoustic", "thermal", "gas"]), W("cmp", "GD-COMP-2", "K-201A seal-gas panel", ["gas"]),
  W("agr", "P-303A", "Amine pump P-303A", ["thermal", "acoustic"]), W("agr", "C-301", "Amine contactor C-301", ["gas"]),
];

const PATROL: Waypoint[] = [W("gate", undefined, "Main gate", ["intrusion", "visual"]), W("lay", undefined, "Laydown and the north fence", ["intrusion", "visual"]), W("utl", undefined, "Utilities and the east fence", ["intrusion", "thermal"]), W("jty", undefined, "Jetty approach", ["intrusion", "visual"])];
const UTIL: Waypoint[] = [W("utl", "GTG-1", "Generator GTG-1", ["thermal", "acoustic"]), W("utl", "K-961", "Instrument-air compressor K-961", ["acoustic", "thermal"]), W("utl", "P-951A", "Fire-water pump P-951A", ["acoustic"])];

/** Today's robot missions: three rounds of the hazardous areas, a utilities round, the flare and a tank survey. */
export function gasMissions(date: string): Mission[] {
  const M = (n: number, robot: string, kind: Mission["kind"], title: string, h: number, m: number, durationMin: number, waypoints: Waypoint[]): Mission =>
    ({ id: `MS-${date.replace(/-/g, "").slice(2)}-${String(n).padStart(2, "0")}`, facilityId: FID, robotId: `${FID}:${robot}`, kind, title, waypoints, plannedStart: localAt(date, h, m), durationMin, status: "planned", by: "Inspection plan", source: "schedule", findings: [] });
  return [
    M(1, "r1", "inspection_round", "Morning round — inlet, compression, amine", 6, 0, 70, ROUND),
    M(2, "r2", "inspection_round", "Utilities round — generator, air, fire water", 8, 0, 45, UTIL),
    M(3, "r3", "flare_inspection", "Flare F-901 — pilots and tip", 10, 30, 25, [W("flr", "F-901", "Flare F-901 tip and pilots", ["visual", "thermal"])]),
    M(4, "r4", "thickness_survey", "Tank T-701A — roof and lower shell thickness", 13, 0, 110, [W("tnk", "T-701A", "Tank T-701A roof plates", ["ut_thickness", "visual"]), W("tnk", "T-701A", "Tank T-701A lower shell", ["ut_thickness"])]),
    M(5, "r1", "inspection_round", "Afternoon round — inlet, compression, amine", 14, 0, 70, ROUND),
    M(6, "r1", "inspection_round", "Night round — inlet, compression, amine", 22, 0, 70, ROUND),
    // security patrols round the clock — the fence line, the gate, the laydown, utilities and the jetty
    ...[[0, 30], [6, 30], [12, 30], [18, 30]].map(([h, m], i) => M(7 + i, "r7", "security_patrol", `${["Night", "Dawn", "Midday", "Evening"][i]} perimeter patrol — gate, laydown, utilities, jetty`, h, m, 60, PATROL)),
    M(11, "r2", "inspection_round", "Evening utilities round — generator, air, fire water", 19, 0, 45, UTIL),
    M(12, "r8", "pipeline_patrol", "Export line — right of way, leaks and encroachment", 7, 0, 75, [W("jty", "PL-01", "Export line right of way", ["visual", "thermal", "gas"])]),
    M(13, "r8", "emissions_survey", "Methane survey — flare, compression, tank farm", 15, 30, 50, [W("flr", "F-901", "Flare F-901", ["gas", "thermal"]), W("cmp", "GD-COMP-2", "Compression, from the air", ["gas"]), W("tnk", "T-701A", "Tank farm vents", ["gas"])]),
    M(14, "r9", "subsea_inspection", "Export line, subsea section — free spans and burial", 9, 0, 90, [W("jty", "PL-01", "Export line, subsea section KP 0–4", ["sonar", "visual"])]),
    M(15, "r6", "valve_operation", "Valve operations for the box-up — K-201B suction and discharge valves", 16, 30, 60, [W("cmp", "K-201B", "K-201B suction and discharge valves", ["manipulate", "visual"])]),
  ];
}

// ------------------------------------------------------------------ the turnaround of compressor train B
/** The turnaround's jobs: started two days ago, six days in all. Done, under way, waiting for the jobs before them, or
 *  not yet given to anyone — with the permits, gas tests and robot checks each one needs. */
export function gasTurnaround(date: string): WorkOrder[] {
  const d = (n: number) => addDays(date, n);
  const crew = (i: number) => `${FID}:crew${i}`;
  const T = (n: number, title: string, status: WorkOrder["status"], from: number, to: number, x: Partial<WorkOrder>): WorkOrder => ({
    id: `WO-TAR${String(n).padStart(2, "0")}`, facilityId: FID, assetId: asset("K-201B"), type: "TAR", priority: "P2", status, title, detail: title,
    raised: localAt(d(-9), 9), due: d(to), slaHours: 168, source: "turnaround", raisedBy: "Turnaround plan", package: "TAR-K201B", plannedStart: d(from), plannedEnd: d(to), zone: "Compression",
    checklist: ["Toolbox talk; permit and gas test on the job", "Do the work", "Record, photograph and hand back"].map((text) => ({ text, done: status === "done" })),
    spares: [], notes: [], evidence: [], ...x,
  });
  return [
    T(1, "Isolate, depressurise and blind K-201B", "done", -2, -2, { crew: crew(5), after: [], started: localAt(d(-2), 7), done: localAt(d(-2), 15), permit: { type: "general", status: "closed" } }),
    T(2, "Erect scaffolding around K-201B", "done", -2, -1, { crew: crew(1), after: ["WO-TAR01"], started: localAt(d(-2), 15, 30), done: localAt(d(-1), 12), permit: { type: "work at height", status: "closed" } }),
    T(3, "Gas-free check and pre-entry inspection of the casing", "open", -1, 0, { after: ["WO-TAR01"], requires: ["gas", "visual"], permit: { type: "confined space", status: "required" }, gasTest: { status: "required" },
      detail: "Before anyone enters the casing: confirm it is gas-free (LEL, H₂S, O₂) and look inside. A robot can make the first check so nobody enters an unknown atmosphere." }),
    T(4, "Open the compressor casing and pull the rotor bundle", "assigned", 0, 1, { crew: crew(2), after: ["WO-TAR02", "WO-TAR03"], permit: { type: "confined space", status: "required" }, gasTest: { status: "required" } }),
    T(5, "Overhaul suction and discharge valves", "in_progress", -1, 1, { crew: crew(5), after: ["WO-TAR01"], started: localAt(d(-1), 7) }),
    T(6, "Weld repair on the suction nozzle (hot work)", "assigned", 0, 0, { crew: crew(3), after: ["WO-TAR01", "WO-TAR02"], permit: { type: "hot work", status: "issued" }, gasTest: { status: "required" },
      detail: "Grind out and re-weld the indication found at the suction nozzle. Hot work in the compression area: continuous gas monitoring, fire watch." }),
    T(7, "Replace the dry gas seal cartridges", "open", 0, 1, { after: ["WO-TAR01"], spares: [{ part: "Dry gas seal cartridge", qty: 2 }], detail: "Both seal cartridges out and new ones in; the OEM-trained compressor fitters." }),
    T(8, "NDT of impellers and the nozzle weld (UT/MT)", "open", 1, 2, { after: ["WO-TAR04", "WO-TAR06"] }),
    T(9, "Box-up, leak test and recommission", "open", 3, 4, { after: ["WO-TAR04", "WO-TAR05", "WO-TAR07", "WO-TAR08"], permit: { type: "general", status: "required" } }),
    T(10, "Strike scaffolding", "open", 4, 4, { after: ["WO-TAR09"] }),
  ];
}

/** Adds the plant's working world to the generated day. */
// ------------------------------------------------------------------ security
/** Today's security alerts: a fence sensor at night (checked and cleared by the patrol), a small drone seen over the
 *  flare in the morning, a fence sensor at the laydown after lunch. Each shows from the moment it happened. */
export function gasAlerts(date: string): SecurityAlert[] {
  const A = (n: number, h: number, m: number, kind: SecurityAlert["kind"], zone: string, source: string, text: string, x: Partial<SecurityAlert> = {}): SecurityAlert =>
    ({ id: `SA-${date.replace(/-/g, "").slice(2)}-${n}`, facilityId: FID, at: localAt(date, h, m), kind, zone: `${FID}:${zone}`, source, text, status: "open", ...x });
  return [
    A(1, 1, 12, "fence", "jty", "Fence sensor F-31", "Fence sensor F-31 tripped on the jetty approach", { status: "cleared", note: "Patrol-1 checked at 01:20: a stray dog under the fence; fence intact.", by: "Patrol-1" }),
    A(2, 10, 52, "drone", "flr", "Drone-1 camera", "Small unidentified drone over the flare area, heading north-east, about 120 m up"),
    A(3, 13, 5, "fence", "lay", "Fence sensor F-09", "Fence sensor F-09 tripped by the contractors' laydown"),
  ];
}

export function addGasWork(out: FmData, date: string) {
  out.securityAlerts.push(...gasAlerts(date));
  out.zones.push(...structuredClone(GAS_ZONES));
  out.contractors.push(...structuredClone(GAS_CONTRACTORS));
  out.crews.push(...structuredClone(GAS_CREWS));
  out.robots.push(...structuredClone(GAS_ROBOTS));
  // the piloted robots' missions have their pilot, except the afternoon valve job (the orchestrator proposes one)
  const ms = gasMissions(date), pilot = (re: RegExp) => out.technicians.find((t) => t.facilityId === FID && re.test(t.role))?.id;
  for (const m of ms) if (m.robotId === `${FID}:r8` || m.robotId === `${FID}:r9`) m.pilotId = pilot(/remote pilot/i);
  out.missions.push(...ms);
  out.workOrders.push(...gasTurnaround(date));
}
