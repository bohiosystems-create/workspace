// Robots as workers. A robot is assigned work like a person or a contractor crew — but by what it can sense or do
// (its capabilities), where it may go (an Ex-rated robot may enter a hazardous area; others may not), and how long it
// can run. Work is sent to it as a mission: a route of waypoints with the checks to make at each. What it finds comes
// back as findings, which the orchestrator turns into work for people (a gas reading, a hot bearing, a thin wall).
//
// The fleet is reached through an adapter (lib/robots/adapter.ts): the built-in simulator, or a real fleet manager.
// Operators run many vendors at once — quadrupeds, drones, crawlers, patrol robots, underwater drones — each with its
// own software. Here they are one fleet: every robot, whoever made it, is described the same way, takes missions the
// same way and reports what it finds the same way; only its connection differs.

/** What a robot can sense or do. */
export type Capability = "visual" | "thermal" | "gas" | "acoustic" | "lidar" | "ut_thickness" | "layout" | "carry" | "intrusion" | "sonar" | "manipulate" | "fod";
export const CAPABILITY_LABEL: Record<Capability, string> = {
  visual: "camera", thermal: "thermal camera", gas: "gas detection", acoustic: "acoustic (leaks, bearings)", lidar: "lidar scan",
  ut_thickness: "ultrasonic wall thickness", layout: "layout marking", carry: "carries loads", intrusion: "intrusion detection (people, vehicles, drones)",
  sonar: "sonar (subsea)", manipulate: "arm (turns valves, lifts)", fod: "debris detection (runways, taxiways)",
};

/** Who controls a robot, in words. */
export const CONTROL_LABEL: Record<"policy" | "supervised" | "remote", string> = { policy: "AI-controlled", supervised: "AI-controlled, a person approves each mission", remote: "piloted by a person" };

export type RobotKind = "quadruped" | "drone" | "crawler" | "layout" | "rover" | "ugv" | "fixed_wing" | "rov" | "usv" | "in_pipe";
/** Where a robot works: on land, in the air, at sea, under water, inside a pipe, or climbing steel. */
export type Domain = "land" | "air" | "sea" | "subsea" | "in_pipe" | "climbing";
export const DOMAIN_OF: Record<RobotKind, Domain> = { quadruped: "land", rover: "land", ugv: "land", layout: "land", drone: "air", fixed_wing: "air", usv: "sea", rov: "subsea", in_pipe: "in_pipe", crawler: "climbing" };
export const DOMAIN_LABEL: Record<Domain, string> = { land: "Land", air: "Air", sea: "Sea", subsea: "Subsea", in_pipe: "In-pipe", climbing: "Climbing" };
/** What a robot is used for: one fleet across inspection, security, emissions, logistics and emergencies. */
export type RobotRole = "inspection" | "security" | "emissions" | "logistics" | "emergency";
export const ROLE_LABEL: Record<RobotRole, string> = { inspection: "inspection", security: "security", emissions: "emissions", logistics: "logistics", emergency: "emergency response" };
export type RobotStatus = "docked" | "charging" | "on_mission" | "returning" | "fault" | "estop" | "offline";

export interface Robot {
  id: string; facilityId: string; name: string; model: string; vendor: string; kind: RobotKind;
  capabilities: Capability[];
  /** certified for hazardous areas (ATEX/IECEx zone 1 and 2) */
  exRated: boolean;
  /** run time on a full battery, minutes */
  enduranceMin: number;
  /** where it docks and charges (a zone id) */
  dock: string;
  /** who controls it: "policy" — the AI drives it and runs approved missions by itself (within the facility's signed
   *  autopilot policy); "supervised" — the AI drives it, a person approves every mission and watches; "remote" — a
   *  person pilots it (a licensed drone or ROV pilot, a robot operator): its missions wait until a pilot is on them */
  autonomy: "supervised" | "policy" | "remote";
  /** for a piloted robot: the pilot it needs, matched against people's roles (e.g. "drone pilot", "ROV pilot") */
  pilotRole?: string;
  /** how it is reached: the simulator; Open-RMF; the vendor's own API (missions out, status and findings back); or the
   *  vendor's data platform only (findings come in, missions are planned in the vendor's own system) */
  adapter: "sim" | "rmf" | "vendor" | "platform" | "vda5050" | "dji" | "orbit" | "security";
  /** the vendor connection it belongs to (ROBOT_FLEETS key), and the vendor's own system it is run from */
  fleet?: string; platform?: string;
  /** who operates it: the facility itself, or a service company (often through a local partner) */
  operator?: string;
  roles: RobotRole[];
  /** the robot's id in its vendor's system */
  externalId?: string;
  /** the last report from a real fleet (ISO), when it is not simulated */
  lastReport?: string;
  /** its live video, on its maker's video system (the core links to it, never carries it) */
  videoUrl?: string;
  /** drones only: no flying above this wind speed (m/s) */
  maxWindMs?: number;
  // ---- live state (lib/robots/sim.ts computes it from the missions and the clock)
  status: RobotStatus;
  battery: number;
  zone: string;
  /** position on the facility map (0–100 × 0–60) */
  x: number; y: number;
  missionId?: string;
  estop?: boolean;
  note?: string;
}

export type MissionKind = "inspection_round" | "gas_survey" | "thermal_survey" | "confined_precheck" | "flare_inspection" | "thickness_survey" | "layout_marking" | "delivery"
  | "security_patrol" | "alarm_check" | "emissions_survey" | "pipeline_patrol" | "subsea_inspection" | "valve_operation" | "runway_inspection" | "gas_watch";
export const MISSION_LABEL: Record<MissionKind, string> = {
  inspection_round: "inspection round", gas_survey: "gas survey", thermal_survey: "thermal survey", confined_precheck: "confined-space pre-entry check",
  flare_inspection: "flare inspection", thickness_survey: "wall-thickness survey", layout_marking: "layout marking", delivery: "delivery",
  security_patrol: "security patrol", alarm_check: "check a security alarm", emissions_survey: "emissions (methane) survey", pipeline_patrol: "pipeline patrol",
  subsea_inspection: "subsea inspection", valve_operation: "valve operation", runway_inspection: "runway and lighting inspection", gas_watch: "gas watch beside a crew",
};

export interface Waypoint { zone: string; assetId?: string; label: string; checks: Capability[] }

export interface Mission {
  id: string; facilityId: string; robotId: string; kind: MissionKind; title: string;
  waypoints: Waypoint[];
  /** planned start (ISO) and length (minutes) */
  plannedStart: string; durationMin: number;
  status: "planned" | "running" | "done" | "aborted" | "failed" | "paused";
  started?: string; ended?: string;
  by: string; source: "schedule" | "orchestrator" | "control" | "whatsapp" | "field";
  /** the work order it serves, when it was sent for one; the security alert it checks */
  woId?: string; alertId?: string;
  /** the person piloting it (a technician's id), for a robot a person controls */
  pilotId?: string;
  /** a security patrol that also makes inspection checks on its way (one trip instead of two) */
  combined?: string[];
  /** the fleet manager's id for it, once dispatched to a real fleet */
  externalId?: string;
  /** 0–1, and the waypoint reached */
  progress?: number; at?: number;
  /** what it found, as the route is covered */
  findings: Finding[];
  note?: string;
}

export interface Finding {
  id: string; missionId: string; robotId: string; facilityId: string; zone: string; assetId?: string;
  at: string; sensor: Capability; label: string; value: number; unit: string; limit?: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** the work raised from it, and whether a person has seen it */
  woId?: string; acknowledged?: boolean;
  /** the photo/thermal image name the robot took (demo: described, not stored) */
  image?: string;
}
