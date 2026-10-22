// Facility management — an AI orchestration layer for running large infrastructure (power stations, desalination
// plants, airports). The day's operating picture is generated for the calendar (data.ts, like the construction
// demo), every change made by people or by the orchestrator is an event (FmEvent) kept in the database and
// re-applied on top (engine.ts), and the orchestrator (orchestrator.ts) proposes the next actions with its reasons.

export type Sector = "energy" | "water" | "airport";
export type Criticality = "A" | "B" | "C";
export type AssetStatus = "running" | "standby" | "degraded" | "down" | "maintenance";
export type WoType = "PM" | "CM" | "Inspection" | "Emergency";
export type WoStatus = "open" | "assigned" | "in_progress" | "on_hold" | "done";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type Trade = "mechanical" | "electrical" | "instrumentation" | "hvac" | "civil" | "controls" | "lifts" | "chemical";

export interface Reading { key: string; name: string; value: number; unit: string; low?: number; high?: number; trend: number[] }

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
  assignee?: string; team?: string; source: "schedule" | "sensor" | "whatsapp" | "field" | "control" | "orchestrator";
  raisedBy: string; started?: string; done?: string; holdReason?: string;
  checklist: { text: string; done: boolean }[];
  permit?: { type: "electrical isolation" | "hot work" | "confined space" | "work at height" | "general"; status: "required" | "issued" | "closed" };
  spares: { part: string; qty: number }[];
  notes: { at: string; by: string; text: string; via?: string }[];
  evidence: string[];
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

export interface FmData {
  date: string;
  facilities: Facility[];
  systems: SystemDef[];
  assets: Asset[];
  technicians: Technician[];
  workOrders: WorkOrder[];
  alarms: Alarm[];
  spares: Spare[];
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
  | { kind: "wo_update"; woId: string; patch: Partial<Pick<WorkOrder, "status" | "assignee" | "priority" | "due" | "holdReason">> & { note?: string; evidence?: string[]; checklist?: number[]; permitStatus?: "issued" | "closed" } }
  | { kind: "asset_status"; assetId: string; status: AssetStatus; note?: string }
  | { kind: "alarm_ack"; alarmId: string; woId?: string }
  | { kind: "spare_order"; spareId: string; qty: number }
  | { kind: "action"; actionId: string; decision: "approved" | "rejected" | "auto"; actionKind?: Action["kind"]; facilityId?: string; reason?: import("../proposals").RejectReason; note?: string; targetTech?: string; cost?: number; risk?: Action["risk"] }
  | { kind: "policy"; facilityId: string; policy: AutopilotPolicy | null }
  | { kind: "tech_status"; techId: string; status: Technician["status"]; zone?: string }
);

export interface FmConfig { autopilot: Record<string, boolean>; /** what the autopilot may do, signed by a manager, per facility */ policy?: Record<string, AutopilotPolicy> }

/** The autopilot's mandate for one facility: which kinds of proposal it may carry out by itself, up to what risk and
 *  spend — signed by a manager or director, and logged. Nothing runs by itself without one. */
export interface AutopilotPolicy { kinds: Action["kind"][]; maxRisk: "low" | "medium"; maxSpend: number; signedBy: string; signedById?: string; role: string; at: string }

/** What the orchestrator proposes, with why. Approved actions become events. */
export interface Action {
  id: string; facilityId: string;
  kind: "raise_wo" | "assign" | "reschedule" | "escalate" | "order_spare" | "permit" | "isolate";
  title: string; why: string[];
  risk: "low" | "medium" | "high";
  /** money it commits (SAR), for approval limits */
  cost?: number;
  /** low-risk actions run by themselves when autopilot is on */
  auto: boolean;
  effect: FmEvent["kind"];
  payload: Record<string, unknown>;
  targets: { woId?: string; assetId?: string; techId?: string; spareId?: string; alarmId?: string };
}

export interface Kpis {
  availability: number; criticalDown: number; openWos: number; overdueWos: number; slaAtRisk: number;
  pmCompliance: number; mtbfHours: number; mttrHours: number; activeAlarms: number; criticalAlarms: number;
  techsOnShift: number; techsBusy: number; sparesLow: number; output: { value: number; target: number; unit: string; name: string };
}
