// Robots as workers. A robot is assigned work like a person or a contractor crew — but by what it can sense or do
// (its capabilities), where it may go (an Ex-rated robot may enter a hazardous area; others may not), and how long it
// can run. Work is sent to it as a mission: a route of waypoints with the checks to make at each. What it finds comes
// back as findings, which the orchestrator turns into work for people (a gas reading, a hot bearing, a thin wall).
//
// The fleet is reached through an adapter (lib/robots/adapter.ts): the built-in simulator, or a real fleet manager.

/** What a robot can sense or do. */
export type Capability = "visual" | "thermal" | "gas" | "acoustic" | "lidar" | "ut_thickness" | "layout" | "carry";
export const CAPABILITY_LABEL: Record<Capability, string> = {
  visual: "camera", thermal: "thermal camera", gas: "gas detection", acoustic: "acoustic (leaks, bearings)", lidar: "lidar scan",
  ut_thickness: "ultrasonic wall thickness", layout: "layout marking", carry: "carries loads",
};

export type RobotKind = "quadruped" | "drone" | "crawler" | "layout" | "rover";
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
  /** how far it may act alone: "supervised" — a person approves every mission; "policy" — missions within the facility's
   *  signed autopilot policy run by themselves */
  autonomy: "supervised" | "policy";
  /** how it is reached: the simulator, Open-RMF, or the vendor's own API */
  adapter: "sim" | "rmf" | "vendor";
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

export type MissionKind = "inspection_round" | "gas_survey" | "thermal_survey" | "confined_precheck" | "flare_inspection" | "thickness_survey" | "layout_marking" | "delivery";
export const MISSION_LABEL: Record<MissionKind, string> = {
  inspection_round: "inspection round", gas_survey: "gas survey", thermal_survey: "thermal survey", confined_precheck: "confined-space pre-entry check",
  flare_inspection: "flare inspection", thickness_survey: "wall-thickness survey", layout_marking: "layout marking", delivery: "delivery",
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
  /** the work order it serves, when it was sent for one */
  woId?: string;
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
