// Facility management — an AI orchestration layer for running large infrastructure (power stations, desalination
// plants, airports). The day's operating picture is generated for the calendar (data.ts, like the construction
// demo), every change made by people or by the orchestrator is an event (FmEvent) kept in the database and
// re-applied on top (engine.ts), and the orchestrator (orchestrator.ts) proposes the next actions with its reasons.

export type Sector = "energy" | "water" | "airport" | "oil_gas";
export type Criticality = "A" | "B" | "C";
export type AssetStatus = "running" | "standby" | "degraded" | "down" | "maintenance";
/** PdM: predictive maintenance — raised before a reading crosses its limit (predict.ts) */
export type WoType = "PM" | "PdM" | "CM" | "Inspection" | "Emergency" | "TAR";
export type WoStatus = "open" | "assigned" | "in_progress" | "on_hold" | "done";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type Trade = "mechanical" | "electrical" | "instrumentation" | "hvac" | "civil" | "controls" | "lifts" | "chemical" | "process" | "inspection" | "scaffolding" | "rotating";
/** What makes a place dangerous: decides who (and which robot) may go there, and what a job there needs. */
export type Hazard = "h2s" | "hydrocarbon" | "high_voltage" | "confined_space" | "height" | "hot_surface" | "noise" | "marine" | "airside";
/** An area of a facility, with its hazards and hazardous-area class (ATEX/IECEx zone 1 or 2; null = safe area). The
 *  plan coordinates (0–100 × 0–60) place it on the facility map, with the robots and crews in it. */
export interface ZoneDef { id: string; facilityId: string; name: string; hazards: Hazard[]; atex: 1 | 2 | null; x: number; y: number; w: number; h: number
  /** airside areas with aircraft movements: the local hours when they are closed to aircraft (e.g. the nightly runway
   *  closure, [2, 3.5]) — robots go there then, or with air traffic control's clearance */
  closed?: [number, number];
  /** inside a building: no drones */
  indoor?: boolean }

export interface Reading { key: string; name: string; value: number; unit: string; low?: number; high?: number; trend: number[]
  /** the value before a repair brought it back, until when — so a check made before the repair keeps what it saw */
  was?: { value: number; until: string } }

export interface Asset {
  id: string; tag: string; name: string; facilityId: string; systemId: string; class: string; trade: Trade;
  criticality: Criticality; status: AssetStatus; zone: string;
  manufacturer: string; model: string; installed: string; runHours: number;
  /** 0–100: condition from readings, age and history */
  condition: number;
  /** planned maintenance: interval in days, last done, next due */
  pmEveryDays: number; lastPm: string; nextPm: string;
  readings: Reading[];
  spares: string[];
}

export interface SystemDef { id: string; facilityId: string; name: string; code: string }

export interface Technician {
  id: string; name: string; facilityId: string; role: string; trades: Trade[];
  shift: "day" | "night" | "off"; zone: string; phone: string; years: number;
  /** what they are doing right now */
  status: "available" | "on_job" | "travelling" | "break" | "off";
}

export interface WorkOrder {
  id: string; facilityId: string; assetId: string; type: WoType; priority: Priority; status: WoStatus;
  title: string; detail: string; raised: string; due: string; slaHours: number;
  assignee?: string; team?: string; source: "schedule" | "sensor" | "whatsapp" | "field" | "control" | "orchestrator" | "robot" | "turnaround";
  /** a contractor crew on the job (Crew.id) instead of, or alongside, an in-house technician */
  crew?: string;
  /** a robot doing it (an inspection a robot can make), and its mission */
  robot?: string; missionId?: string;
  /** robots working alongside the people on the job (a gas watch beside a crew, a camera overwatch, a carrier) */
  support?: { robotId: string; role: string; missionId?: string }[];
  /** what the job needs to be done by a robot: its sensors/tools */
  requires?: import("../robots/types").Capability[];
  /** a turnaround (shutdown) package: the package id, the jobs it waits for, and its planned window */
  package?: string; after?: string[]; plannedStart?: string; plannedEnd?: string;
  /** a gas test before work (hazardous areas, hot work, confined space): required, done (with the reading) or failed */
  gasTest?: { status: "required" | "done" | "failed"; at?: string; by?: string; reading?: string };
  /** where the work is, when it isn't the asset's own zone */
  zone?: string;
  raisedBy: string; started?: string; done?: string; holdReason?: string;
  checklist: { text: string; done: boolean }[];
  permit?: { type: "electrical isolation" | "hot work" | "confined space" | "work at height" | "general"; status: "required" | "issued" | "closed" | "suspended" };
  spares: { part: string; qty: number }[];
  notes: { at: string; by: string; text: string; via?: string }[];
  evidence: string[];
  /** raised by the predictive engine (lib/fm/pdm.ts): the failure mode it diagnosed, its probability and remaining life
   *  when raised — and, once done, what the technician found (the engine learns its precision per failure mode) */
  pdm?: { modeId: string; mode: string; p30: number; rulDays?: number; predictedAt: string; outcome?: "confirmed" | "not_found" };
}

export interface Alarm { id: string; facilityId: string; assetId: string; at: string; severity: "critical" | "high" | "medium" | "low"; message: string; reading?: string; acknowledged: boolean; woId?: string }

export interface Spare { id: string; facilityId: string; part: string; stock: number; min: number; leadDays: number; unitCost: number; location: string; onOrder?: number }

export interface Facility {
  id: string; name: string; sector: Sector; location: string; operator: string; capacity: string; description: string;
  /** what the facility produces, for the output KPI */
  output: { name: string; unit: string; target: number; today: number; trend: number[] };
  /** a second efficiency figure: heat rate, kWh/m³, on-time departures */
  efficiency: { name: string; unit: string; value: number; target: number; lowerIsBetter: boolean };
}

/** A contractor company working at a facility, with its contract and crews (lib/work for the construction side). */
export interface FmContractor { id: string; facilityId: string; name: string; trades: Trade[]; scope: string; contractRef: string; until: string; /** SAR per crew-day */ dayRate: number; /** last 90 days */ performance: { onTimePct: number; reworkPct: number; ltiFreeDays: number; rating: "good" | "watch" | "poor"; note?: string } }
/** A contractor's crew: assigned to jobs like a technician, paid by the day. */
export interface Crew { id: string; contractorId: string; facilityId: string; name: string; lead: string; leadPhone: string; size: number; trades: Trade[]; zone: string; shift: "day" | "night"; status: "available" | "on_job" | "mobilising" | "off"; certs: string[] }

export interface FmData {
  date: string;
  /** the plant historian's readings (daily means), pushed to /api/v1/readings — the predictive engine's history */
  history?: import("./pdm").HistoryStore;
  facilities: Facility[];
  systems: SystemDef[];
  assets: Asset[];
  technicians: Technician[];
  workOrders: WorkOrder[];
  alarms: Alarm[];
  spares: Spare[];
  zones: ZoneDef[];
  contractors: FmContractor[];
  crews: Crew[];
  robots: import("../robots/types").Robot[];
  missions: import("../robots/types").Mission[];
  /** robot findings people have seen, and the work raised from them */
  findingAcks: Record<string, { woId?: string }>;
  /** security alerts: fence sensors, cameras, patrols, a drone seen over the plant */
  securityAlerts: SecurityAlert[];
  /** what tenants and occupants report: too hot, a leak, a lift stuck (complaints.ts) */
  complaints: Complaint[];
}

/** What a complaint is about: read from its words (complaints.ts), or set by a person. */
export type ComplaintCategory = "temperature" | "leak" | "lift_escalator" | "lighting" | "cleaning" | "odour" | "noise" | "power" | "baggage" | "access" | "other";
/** A tenant's or occupant's complaint: logged from the app, WhatsApp, a QR code on site, the helpdesk or a tenant
 *  portal (API); classified, tied to the area and the asset behind it, and linked to the work that fixes it. */
export interface Complaint {
  id: string; facilityId: string; at: string;
  channel: "app" | "whatsapp" | "qr" | "helpdesk" | "email" | "api";
  /** who: a tenant (a lounge, a café, an airline) or an occupant (a passenger, a visitor) */
  from: string; contact?: string;
  /** where, in their words, and the area it was placed in */
  where?: string; zone?: string;
  text: string; category: ComplaintCategory; severity: "low" | "medium" | "high";
  assetId?: string; woId?: string;
  status: "open" | "in_progress" | "resolved";
  resolvedAt?: string;
  /** what the tenant was told when it was fixed */
  reply?: string;
}

/** Something security must look at. A robot checks it first where it can (a patrol robot, a drone); people respond. */
export interface SecurityAlert {
  id: string; facilityId: string; at: string;
  kind: "fence" | "person" | "vehicle" | "drone" | "camera" | "fod" | "wildlife";
  zone: string; source: string; text: string;
  status: "open" | "checking" | "cleared" | "escalated";
  missionId?: string; note?: string; by?: string;
}

/** A report from a real fleet (a vendor's API or data platform), in one shape whoever made the robot. */
export interface RobotReport {
  robot: string; status?: import("../robots/types").RobotStatus; battery?: number; zone?: string;
  findings?: { asset?: string; zone?: string; sensor: import("../robots/types").Capability; label: string; value: number; unit: string; limit?: number; severity: "info" | "low" | "medium" | "high" | "critical"; at?: string; image?: string }[];
  /** what the robot's camera (or the AI reading its images) saw that security must answer */
  alerts?: { kind: SecurityAlert["kind"]; text: string; zone?: string }[];
  /** its live video address (security robots) */
  video?: string;
  /** how its mission is going, from the machine itself (a DJI flight task's progress, a VDA 5050 order's end) */
  mission?: { id: string; status?: "running" | "done" | "failed" | "aborted"; progress?: number };
  source: string;
}

/** One change, by a person or by the orchestrator. Re-applied in order on top of the generated day. */
export type FmEvent = {
  id: string; at: string; by: string; channel: "web" | "field" | "whatsapp" | "orchestrator" | "voice"; summary: string;
  /** the signed-in person behind it (directory id) and their role, when known — unverified otherwise */
  byId?: string; role?: string;
  /** the client's own id for a change sent from the field app's outbox: a retry is recorded once */
  cid?: string;
} & (
  | { kind: "wo_create"; wo: WorkOrder }
  | { kind: "wo_update"; woId: string; patch: Partial<Pick<WorkOrder, "status" | "assignee" | "priority" | "due" | "holdReason" | "crew" | "robot" | "missionId" | "support">> & { note?: string; evidence?: string[]; checklist?: number[]; permitStatus?: "issued" | "closed" | "suspended"; pdmOutcome?: "confirmed" | "not_found" } }
  | { kind: "asset_status"; assetId: string; status: AssetStatus; note?: string }
  | { kind: "alarm_ack"; alarmId: string; woId?: string }
  | { kind: "spare_order"; spareId: string; qty: number }
  | { kind: "action"; actionId: string; decision: "approved" | "rejected" | "auto"; actionKind?: Action["kind"]; facilityId?: string; reason?: import("../proposals").RejectReason; note?: string; targetTech?: string; cost?: number; risk?: Action["risk"] }
  | { kind: "policy"; facilityId: string; policy: AutopilotPolicy | null }
  | { kind: "tech_status"; techId: string; status: Technician["status"]; zone?: string }
  | { kind: "mission_create"; mission: import("../robots/types").Mission }
  | { kind: "mission_update"; missionId: string; status: "aborted" | "paused" | "running"; note?: string }
  | { kind: "robot_estop"; robotId: string; on: boolean; note?: string }
  | { kind: "finding_ack"; findingId: string; woId?: string }
  | { kind: "crew_status"; crewId: string; status: Crew["status"]; zone?: string }
  | { kind: "gas_test"; woId: string; result: "done" | "failed"; reading: string }
  | { kind: "security_alert"; alert: SecurityAlert }
  | { kind: "security_update"; alertId: string; status: SecurityAlert["status"]; missionId?: string; note?: string }
  | { kind: "robot_report"; robotId: string; report: RobotReport }
  | { kind: "mission_pilot"; missionId: string; pilotId: string | null }
  /** a command for a machine, waiting for the fleet bridge to carry it (MQTT: VDA 5050, DJI Cloud API) */
  | { kind: "fleet_command"; commandId: string; robotId: string; missionId?: string; protocol: string; messages: { topic: string; payload: unknown }[] }
  /** a message for people outside the app (Teams, email), sent by the northbound integrations */
  | { kind: "notify"; facilityId: string; via: "teams" | "email"; to?: string; title: string; text: string }
  /** what became of a dispatch: sent, refused or failed, by the adapter or the fleet bridge */
  | { kind: "dispatch_result"; commandId?: string; robotId: string; missionId?: string; sent: boolean; note: string; adapter: string }
  | { kind: "robot_control"; robotId: string; control: import("../robots/types").Robot["autonomy"] }
  | { kind: "complaint_create"; complaint: Complaint }
  | { kind: "complaint_update"; ids: string[]; patch: Partial<Pick<Complaint, "status" | "woId" | "assetId" | "category" | "severity" | "reply" | "zone">> }
);

export interface FmConfig { autopilot: Record<string, boolean>; /** what the autopilot may do, signed by a manager, per facility */ policy?: Record<string, AutopilotPolicy>;
  /** the operator's rules ("drone finds X → send a ground robot"); the defaults in rules.ts until someone edits */
  rules?: import("./rules").Rule[] }

/** The autopilot's mandate for one facility: which kinds of proposal it may carry out by itself, up to what risk and
 *  spend — signed by a manager or director, and logged. Nothing runs by itself without one. */
export interface AutopilotPolicy { kinds: Action["kind"][]; maxRisk: "low" | "medium"; maxSpend: number; signedBy: string; signedById?: string; role: string; at: string }

/** What the orchestrator proposes, with why. Approved actions become events. */
export interface Action {
  id: string; facilityId: string;
  kind: "raise_wo" | "assign" | "reschedule" | "escalate" | "order_spare" | "permit" | "isolate"
    | "assign_crew" | "robot_mission" | "robot_finding" | "safety_stop" | "robot_recall" | "gas_test" | "security_response" | "combine_missions" | "assign_pilot" | "robot_support" | "rule"
    | "predictive" | "reprioritise" | "complaint";
  title: string; why: string[];
  risk: "low" | "medium" | "high";
  /** money it commits (SAR), for approval limits */
  cost?: number;
  /** the company it concerns (a contractor crew hired, paid or escalated to): its own people can't decide it */
  party?: string;
  /** low-risk actions run by themselves when autopilot is on */
  auto: boolean;
  effect: FmEvent["kind"];
  payload: Record<string, unknown>;
  targets: { woId?: string; assetId?: string; techId?: string; spareId?: string; alarmId?: string; crewId?: string; robotId?: string; findingId?: string; zoneId?: string; alertId?: string; missionId?: string };
}

export interface Kpis {
  availability: number; criticalDown: number; openWos: number; overdueWos: number; slaAtRisk: number;
  pmCompliance: number; mtbfHours: number; mttrHours: number; activeAlarms: number; criticalAlarms: number;
  techsOnShift: number; techsBusy: number; sparesLow: number; output: { value: number; target: number; unit: string; name: string };
}
