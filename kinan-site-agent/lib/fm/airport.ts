// The airport's working world, beyond its equipment (data.ts): the plan of the terminal and the airfield, the robots and
// drones that inspect and patrol it, today's missions and today's security and airside alerts. As at the gas plant,
// robots of several makers are one fleet; what is particular here is the airfield: the runway and taxiways are live,
// so robots go there in the nightly runway closure or with air traffic control's clearance, drones never fly indoors,
// and an unidentified drone near the runway approach is air traffic control's and the police's to handle.
import type { Complaint, FmData, SecurityAlert, ZoneDef } from "./types";
import { makeComplaint } from "./complaints";
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
  R("a1", "Drone-A1", "Docked drone with airfield-lighting camera (demo)", "DJI Dock-type", "drone", ["visual", "thermal", "intrusion", "fod"], false, 40, ["inspection", "security"], { maxWindMs: 12, adapter: "dji", externalId: "DOCK-KGIA-01/AC-KGIA-01", platform: "DJI Dock (Cloud API)" }),
  R("a2", "FOD-1", "Airside inspection rover (demo)", "Airside robotics-type", "ugv", ["visual", "lidar", "fod"], false, 180, ["inspection", "security"], { autonomy: "supervised", adapter: "vda5050", externalId: "AirsideRobotics/FOD-001", platform: "VDA 5050 fleet interface" }),
  R("a3", "Patrol-A1", "Terminal security robot (demo)", "Knightscope-type", "ugv", ["visual", "thermal", "intrusion"], false, 600, ["security"], { dock: `${FID}:land`, zone: `${FID}:land`, adapter: "security", fleet: "airport-security", platform: "Security operations centre software (demo)", operator: "Airport security (contracted guard force, demo)" }),
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
  addBuilding(out, date);
  addDrifts(out);
  out.complaints.push(...airportComplaints(out, date));
}

// ------------------------------------------------------------------ the building itself (washrooms, fabric, cleaning)
// What tenants complain about is often not a machine: a leak under a basin, a dirty washroom, a light out. Those jobs
// go on the terminal building itself, looked after by the soft-services contractor.
function addBuilding(out: FmData, date: string) {
  out.systems.push({ id: `${FID}:BLD`, facilityId: FID, name: "Building & soft services", code: "BLD" });
  out.assets.push({ id: `${FID}:BLD-T2`, tag: "BLD-T2", name: "Terminal 2 building — washrooms, fabric, lighting, cleaning", facilityId: FID, systemId: `${FID}:BLD`, class: "building", trade: "civil", criticality: "B", status: "running", zone: "Departures",
    manufacturer: "—", model: "T2", installed: "2014-03-01", runHours: 0, condition: 84, pmEveryDays: 7, lastPm: date, nextPm: date, readings: [], spares: [] });
}

// ------------------------------------------------------------------ equipment heading for its limit (predict.ts)
// Five machines whose readings have been creeping for two weeks but are not yet in alarm — the cases where acting a
// few days early saves the failure. [tag, reading, where it is today as a share of the way to its limit]
const DRIFTS: [string, string, number][] = [["AHU-B03", "sat", 0.68], ["ES-D02", "brk", 0.67], ["CH-03", "appr", 0.72], ["UPS-T2", "batt", 0.6], ["BHS-SRT-2", "mtr", 0.55]];
function addDrifts(out: FmData) {
  for (const [tag, key, share] of DRIFTS) {
    const a = out.assets.find((x) => x.id === `${FID}:${tag}`), r = a?.readings.find((x) => x.key === key);
    if (!a || !r || a.status !== "running") continue;
    const limit = r.high ?? r.low!, start = r.trend[0], end = start + (limit - start) * share;
    r.trend = r.trend.map((_, k) => Math.round((start + ((end - start) * k) / 13 + Math.abs(limit - start) * 0.025 * Math.sin(k * 2.1)) * 10) / 10);
    r.value = r.trend[13];
    a.condition = Math.min(a.condition, 64);
  }
}

// ------------------------------------------------------------------ tenants' complaints
// Today: people say Pier B is hot (four, from the lounge, a café, ground staff and a passenger) — and the Pier B air
// handler's supply-air temperature has been rising for two weeks; escalator D2 has stopped (its brake is running hot);
// the PRM lift keeps reopening; the bridge at gate 203 is still down; a leak in a washroom. Before today: two weeks of
// complaints, resolved, so the trends have something to show.
function airportComplaints(out: FmData, date: string): Complaint[] {
  const ymd = date.replace(/-/g, "").slice(2);
  const C = (n: string, at: string, channel: Complaint["channel"], from: string, where: string, text: string, x: Partial<Complaint> = {}): Complaint =>
    ({ ...makeComplaint(out, { id: `CMP-${ymd}-${n}`, facilityId: FID, at, channel, from, where, text }), ...x });
  const today = [
    C("01", localAt(date, 6, 50), "whatsapp", "Saudia ground staff, gate 203", "Gate 203", "The bridge at 203 is still not working, we are bussing passengers again."),
    C("02", localAt(date, 7, 5), "helpdesk", "PRM assistance team", "Pier B", "PRM lift 7 doors keep reopening, a passenger in a wheelchair waited 10 minutes."),
    C("03", localAt(date, 7, 40), "qr", "Passenger (QR code at gate 206)", "Gate 206", "The waiting area at gate 206 is really hot, no cool air at all."),
    C("04", localAt(date, 8, 15), "app", "Al Fursan lounge, Pier B", "Lounge, Pier B", "Lounge temperature is 27 °C since this morning, guests are complaining about the heat.", { contact: "lounge.duty@example.com" }),
    C("05", localAt(date, 8, 30), "app", "Duty Free, departures", "Departures", "Escalator D2 stopped twice this morning, customers can't come up to the shop.", { contact: "dutyfree.ops@example.com" }),
    C("06", localAt(date, 8, 50), "whatsapp", "Bateel café, gate 205", "Gate 205", "It's too warm at our counter, the pastries are sweating."),
    C("07", localAt(date, 9, 20), "helpdesk", "Passenger (information desk)", "Gate 207", "Gate 207 is hot and stuffy."),
    C("08", localAt(date, 9, 35), "app", "Cleaning contractor supervisor", "Washroom near gate 201", "Water leaking under the basins in the gents' washroom near gate 201, floor is wet.", { contact: "cleaning.sup@example.com" }),
  ];
  // two weeks before: resolved, of every kind, a few a day
  const PAST: [string, Complaint["channel"], string, string][] = [
    ["Arrivals", "qr", "Passenger (QR code, arrivals)", "Bad smell near the reclaim toilets."], ["Departures", "app", "Starbucks, departures", "Lights flickering above our seating area."],
    ["Baggage hall", "helpdesk", "Passenger (information desk)", "Bags from the Riyadh flight took 50 minutes, the belt kept stopping."], ["Pier B", "qr", "Passenger (QR code at gate 204)", "Bins at gate 204 are overflowing."],
    ["Departures", "app", "Duty Free, departures", "Air conditioning very weak near the shop entrance, it's warm."], ["Arrivals", "whatsapp", "Flynas ground staff", "Carousel A3 is making a loud squealing noise."],
    ["Pier B", "app", "Al Fursan lounge, Pier B", "Washroom tap in the lounge is dripping all night."], ["Departures", "helpdesk", "Passenger (information desk)", "Escalator D1 was stopped for twenty minutes."],
    ["Pier B", "qr", "Passenger (QR code at gate 208)", "Gate 208 area is a bit warm."], ["Arrivals", "app", "Car rental desk, arrivals", "Power socket at our desk is dead."],
  ];
  const past: Complaint[] = [];
  for (let k = 1; k <= 13; k++) {
    const n = 1 + ((k * 7) % 3); // one to three a day
    for (let j = 0; j < n; j++) {
      const [where, ch, from, text] = PAST[(k * 3 + j) % PAST.length];
      const d0 = new Date(Date.parse(`${date}T00:00:00Z`) - k * 86_400_000).toISOString().slice(0, 10);
      const at = localAt(d0, 8 + ((k + j * 5) % 11), (k * 13 + j * 7) % 60);
      past.push({ ...makeComplaint(out, { id: `CMP-${ymd}-P${String(k).padStart(2, "0")}${j}`, facilityId: FID, at, channel: ch, from, where, text }), woId: undefined, status: "resolved", resolvedAt: new Date(Date.parse(at) + (2 + ((k + j) % 9)) * 3600_000).toISOString(), reply: "Fixed — thank you for telling us." });
    }
  }
  return [...today, ...past];
}
