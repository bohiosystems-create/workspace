export type LocType =
  | "site" | "zone" | "building" | "level" | "room" | "yard" | "utility"
  | "gate" | "temp" | "crane" | "road" | "pin";

export interface Location {
  id: string;
  name: string;
  type: LocType;
  parentId?: string;
  /** Position on the site plan in plan units (pin / centre point). */
  x?: number;
  y?: number;
  /** Extra search words (e.g. "TC1", "crane 1"). */
  aliases?: string[];
}

export const CATEGORIES = [
  "Drawing", "Specification", "RFI", "Inspection", "Method Statement", "Permit",
  "HSE", "Submittal", "Minutes", "Snag List", "Variation", "Photo", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Doc {
  id: string;
  title: string;
  category: Category;
  discipline?: string; // ARC / STR / MEP / CIV / HSE / QA ...
  revision?: string;
  locationId: string;
  pin?: { x: number; y: number }; // exact spot on the site plan
  filename: string;
  mime: string;
  size: number;
  summary: string;
  /** Searchable plain-text content (extracted or authored). */
  text: string;
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
  /** Where the bytes live in storage, if not uploads/<id> (e.g. direct-to-Blob uploads). */
  fileKey?: string;
  /** Seeded documents render a generated drawing instead of a stored file. */
  generated?: { kind: string; label: string };
}

export interface Note {
  id: string;
  docId?: string;
  locationId?: string;
  text: string;
  kind: "note" | "issue" | "instruction";
  status: "open" | "closed";
  author: string;
  createdAt: string;
  /** Normalised 0..1 point on the document (drawing markup). */
  at?: { x: number; y: number };
  via?: "agent" | "manual";
}

export interface Db {
  project: { name: string; client: string; code: string };
  locations: Location[];
  docs: Doc[];
  notes: Note[];
  data: ProjectData;
}

// ---------------------------------------------------------------- project data
export interface Activity {
  id: string;
  name: string;
  wbs: string;
  locationId: string;
  trade: string;
  contractor: string;
  baselineStart: string;
  baselineFinish: string;
  start: string;           // actual or forecast
  finish: string;          // actual or forecast
  percent: number;         // 0..100 at data date
  status: "completed" | "in_progress" | "not_started";
  critical: boolean;
  totalFloat: number;      // days
  predecessors: string[];
  milestone?: boolean;
}

export interface DrawingSheet {
  sheet: string;           // KH-TA-ARC-201-L12
  title: string;
  discipline: "ARC" | "STR" | "HVAC" | "PLB" | "ELE" | "FIRE" | "CIV" | "LAN" | "FAC";
  locationId: string;
  revision: string;
  status: "IFC" | "IFA" | "Under Review" | "For Information" | "As-Built";
  issued: string;
  docId?: string;          // rendered file in the document library, if any
  history: { revision: string; issued: string; reason: string }[];
}

export interface Regulation {
  id: string;
  code: string;            // e.g. "SBC 801"
  title: string;
  authority: string;
  topic: string;
  requirement: string;     // what it means for this project
  applies: string[];       // location ids or activity keywords
  status: "Compliant" | "In Progress" | "Action Required" | "Not Yet Applicable";
  evidence?: string;
  owner: string;
  nextReview: string;
}

export interface SafetyRequirement {
  id: string;
  topic: string;
  requirement: string;
  appliesTo: string[];     // activity keywords / location types
  permit?: string;         // permit type required
  ppe: string[];
  source: string;
  critical: boolean;
}
export interface RiskAssessment {
  id: string; activity: string; hazards: string[]; controls: string[];
  initialRisk: "High" | "Medium" | "Low"; residualRisk: "High" | "Medium" | "Low"; owner: string; reviewed: string;
}
export interface Permit {
  id: string; type: string; locationId: string; description: string; issuer: string; holder: string;
  validFrom: string; validTo: string; status: "Active" | "Closed" | "Suspended" | "Requested"; conditions: string[];
}
export interface Incident {
  id: string; date: string; type: "Near Miss" | "First Aid" | "Medical Treatment" | "Property Damage" | "Environmental" | "Unsafe Condition";
  locationId: string; description: string; rootCause: string; actions: string; status: "Open" | "Closed";
}

export interface Supplier { id: string; name: string; category: string; contact: string; phone: string; rating: number; prequalified: boolean }
export interface ProcurementPackage {
  id: string; name: string; trade: string; supplierId?: string; budget: number; committed: number;
  status: "Planning" | "RFQ" | "Evaluation" | "Awarded" | "Manufacturing" | "Delivering" | "Complete";
  leadTimeWeeks: number; requiredOnSite: string; forecastOnSite: string; activityId?: string; notes: string;
}
export interface PurchaseOrder {
  po: string; packageId: string; supplierId: string; date: string; currency: string;
  status: "Open" | "Partially Delivered" | "Delivered" | "Closed" | "Cancelled";
  lines: { line: number; item: string; qty: number; unit: string; unitPrice: number; delivered: number }[];
  source: string;          // demo | sap | oracle | rest | webhook
  externalId?: string;
}
export interface Delivery {
  id: string; po: string; date: string; slot: string; gate: string; locationId: string; items: string;
  status: "Scheduled" | "In Transit" | "Received" | "Delayed" | "Rejected"; vehicle: string; grn?: string; remarks?: string;
}
export interface MaterialRequest {
  id: string; item: string; qty: number; unit: string; neededBy: string; locationId: string; requestedBy: string;
  created: string; status: "Draft" | "Submitted" | "Approved" | "Ordered" | "Rejected"; notes?: string; externalRef?: string;
}
export interface StockItem { item: string; qty: number; unit: string; locationId: string; min: number; updated: string }

export interface Ncr { id: string; title: string; locationId: string; raised: string; by: string; contractor: string; severity: "Major" | "Minor"; status: "Open" | "Closed"; disposition: string; due: string }
export interface Contact { name: string; role: string; company: string; phone: string; email: string; area?: string }

export interface ProjectData {
  meta: { dataDate: string; disclaimer: string; currency: string; contractValue: number; startDate: string; completionDate: string };
  schedule: Activity[];
  register: DrawingSheet[];
  regulations: Regulation[];
  safety: { requirements: SafetyRequirement[]; risks: RiskAssessment[]; permits: Permit[]; incidents: Incident[]; stats: Record<string, number | string>; ppeMatrix: Record<string, string[]> };
  procurement: { suppliers: Supplier[]; packages: ProcurementPackage[]; pos: PurchaseOrder[]; deliveries: Delivery[]; requests: MaterialRequest[]; stock: StockItem[]; lastSync?: string; source: string };
  quality: { ncrs: Ncr[] };
  contacts: Contact[];
}

export type UiAction =
  | { type: "open_doc"; docId: string }
  | { type: "focus_location"; locationId: string };

/** Which model answered, and why — shown under each agent reply. */
export interface RouteInfo {
  provider: "anthropic" | "openai" | "offline";
  model: string;
  tier: "fast" | "main" | "deep" | "offline";
  reason: string;
  fallbackFrom?: { provider: string; model: string; error: string }[];
  ms?: number;
}
