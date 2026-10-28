// The airport's working world, beyond its equipment (data.ts): the plan of the terminal and the airfield, the robots and
// drones that inspect and patrol it, today's missions and today's security and airside alerts. As at the gas plant,
// robots of several makers are one fleet; what is particular here is the airfield: the runway and taxiways are live,
// so robots go there in the nightly runway closure or with air traffic control's clearance, drones never fly indoors,
// and an unidentified drone near the runway approach is air traffic control's and the police's to handle.
import type { FmData, SecurityAlert, ZoneDef } from "./types";
import type { Mission, Robot, Waypoint } from "../robots/types";
import { localAt } from "./gasplant";

const FID = "kgia";
const Z = (id: string, name: string, hazards: ZoneDef["hazards"], atex: ZoneDef["atex"], x: number, y: number, w: number, h: number, extra: Partial<ZoneDef> = {}): ZoneDef =>
  ({ id: `${FID}:${id}`, facilityId: FID, name, hazards, atex, x, y, w, h, ...extra });

// ------------------------------------------------------------------ the plan: terminal, airfield, perimeter
export const AIRPORT_ZONES: ZoneDef[] = [
  Z("aoc", "Airport operations centre", [], null, 2, 2, 15, 10, { indoor: true }),
  Z("dock", "Robot dock", [], null, 2, 14, 15, 14),
  Z("land", "Landside & car parks", [], null, 2, 31, 15, 12),
  Z("dep", "Departures", [], null, 20, 2, 24, 12, { indoor: true }),
  Z("arr", "Arrivals", [], null, 20, 16, 24, 12, { indoor: true }),
  Z("bhs", "Baggage hall", ["noise"], null, 47, 2, 20, 12, { indoor: true }),
  Z("pier", "Pier B", [], null, 47, 16, 20, 12, { indoor: true }),
  Z("cp", "Central plant", ["noise", "high_voltage"], null, 70, 2, 14, 12, { indoor: true }),
  Z("sub", "Main substation", ["high_voltage"], null, 86, 2, 12, 12, { indoor: true }),
  Z("fuel", "Fuel farm", ["hydrocarbon"], 1, 70, 16, 28, 12),
  Z("rwy", "Airfield", ["airside", "noise"], null, 20, 31, 62, 14, { closed: [2, 3.5] }),
  Z("apron", "Apron (stands)", ["airside", "noise"], null, 20, 47, 40, 11),
  Z("per", "Perimeter fence & approach", [], null, 62, 47, 36, 11),
];

// ------------------------------------------------------------------ the fleet
// A docked drone for the airfield lights and the perimeter, a rover that sweeps the runway for debris in the nightly
// closure, and a security robot for the terminal and landside. Makers are named "-type": demo stand-ins.
const R = (id: string, name: string, model: string, vendor: string, kind: Robot["kind"], caps: Robot["capabilities"], exRated: boolean, enduranceMin: number, roles: Robot["roles"], extra: Partial<Robot> = {}): Robot =>
  ({ id: `${FID}:${id}`, facilityId: FID, name, model, vendor, kind, capabilities: caps, exRated, enduranceMin, roles, dock: `${FID}:dock`, autonomy: "policy", adapter: "sim", operator: "Airport operations", status: "docked", battery: 100, zone: `${FID}:dock`, x: 9, y: 20, ...extra });
export const AIRPORT_ROBOTS: Robot[] = [
  R("a1", "Drone-A1", "Docked drone with airfield-lighting camera (demo)", "DJI Dock-type", "drone", ["visual", "thermal", "intrusion", "fod"], false, 40, ["inspection", "security"], { maxWindMs: 12, adapter: "vendor", fleet: "airport-drones", platform: "Drone-in-a-box software (demo)" }),
  R("a2", "FOD-1", "Airside inspection rover (demo)", "Airside robotics-type", "ugv", ["visual", "lidar", "fod"], false, 180, ["inspection", "security"], { autonomy: "supervised", adapter: "rmf", fleet: "rmf" }),
  R("a3", "Patrol-A1", "Terminal security robot (demo)", "Knightscope-type", "ugv", ["visual", "thermal", "intrusion"], false, 600, ["security"], { dock: `${FID}:land`, zone: `${FID}:land`, adapter: "vendor", fleet: "airport-security", platform: "Security operations centre software (demo)", operator: "Airport security (contracted guard force, demo)" }),
];

const W = (zone: string, tag: string | undefined, label: string, checks: Waypoint["checks"]): Waypoint => ({ zone: `${FID}:${zone}`, ...(tag ? { assetId: `${FID}:${tag}` } : {}), label, checks });
const TERMINAL: Waypoint[] = [W("land", undefined, "Kerbside and car parks", ["intrusion", "visual"]), W("dep", undefined, "Departures hall", ["intrusion", "visual"]), W("arr", undefined, "Arrivals hall", ["intrusion"]), W("bhs", undefined, "Baggage hall doors", ["intrusion", "thermal"])];
const PERIMETER: Waypoint[] = [W("per", undefined, "Perimeter fence and the runway 33 approach", ["intrusion", "visual"]), W("land", undefined, "Landside fence", ["intrusion"])];

/** Today's missions: the runway and its lights in the nightly closure, perimeter flights, terminal patrols. */
export function airportMissions(date: string): Mission[] {
  const M = (n: number, robot: string, kind: Mission["kind"], title: string, h: number, m: number, durationMin: number, waypoints: Waypoint[]): Mission =>
    ({ id: `MA-${date.replace(/-/g, "").slice(2)}-${String(n).padStart(2, "0")}`, facilityId: FID, robotId: `${FID}:${robot}`, kind, title, waypoints, plannedStart: localAt(date, h, m), durationMin, status: "planned", by: "Airfield & security plan", source: "schedule", findings: [] });
  return [
    M(1, "a2", "runway_inspection", "Runway debris sweep — nightly closure 02:00–03:30", 2, 0, 75, [W("rwy", undefined, "Runway 15/33 and taxiways A, B", ["fod", "visual"])]),
    M(2, "a1", "runway_inspection", "Runway lights and surface survey — nightly closure", 2, 10, 25, [W("rwy", "CCR-RWY", "Runway edge and centreline lights", ["visual", "thermal", "fod"])]),
    M(3, "a1", "security_patrol", "Perimeter flight — fence line and the runway 33 approach", 6, 0, 25, PERIMETER),
    M(4, "a1", "security_patrol", "Perimeter flight — fence line and the runway 33 approach", 14, 0, 25, PERIMETER),
    M(5, "a1", "security_patrol", "Perimeter flight — fence line and the runway 33 approach", 22, 0, 25, PERIMETER),
    ...[[0, 0], [8, 0], [12, 0], [16, 0], [20, 0]].map(([h, m], i) => M(6 + i, "a3", "security_patrol", `Terminal and landside patrol — ${["night", "morning", "midday", "afternoon", "evening"][i]}`, h, m, 90, TERMINAL)),
  ];
}

// ------------------------------------------------------------------ today's alerts
export function airportAlerts(date: string): SecurityAlert[] {
  const A = (n: number, h: number, m: number, kind: SecurityAlert["kind"], zone: string, source: string, text: string, x: Partial<SecurityAlert> = {}): SecurityAlert =>
    ({ id: `SA-${date.replace(/-/g, "").slice(2)}-A${n}`, facilityId: FID, at: localAt(date, h, m), kind, zone: `${FID}:${zone}`, source, text, status: "open", ...x });
  return [
    A(1, 3, 40, "fence", "per", "Fence sensor P-14", "Perimeter fence sensor P-14 tripped on the north fence", { status: "cleared", note: "Drone-A1 flew the fence at 03:48: a stray camel at the fence; fence intact.", by: "Drone-A1" }),
    A(2, 11, 20, "drone", "per", "Control tower", "Unidentified drone reported by the tower, about 2 km north of the runway 33 approach"),
    A(3, 12, 45, "fod", "rwy", "Pilot report", "Metal strip reported on taxiway B2 by a departing crew"),
    A(4, 13, 30, "wildlife", "rwy", "Airfield operations", "Flock of birds on the grass by the runway 33 threshold"),
    A(5, 14, 10, "person", "pier", "Door alarm D-12", "Airside door D-12 forced open on Pier B"),
  ];
}

export function addAirportWork(out: FmData, date: string) {
  out.zones.push(...structuredClone(AIRPORT_ZONES));
  out.robots.push(...structuredClone(AIRPORT_ROBOTS));
  out.missions.push(...airportMissions(date));
  out.securityAlerts.push(...airportAlerts(date));
}
