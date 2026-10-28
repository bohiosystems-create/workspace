// Construction proposals: the same idea as the operations orchestrator (lib/fm), for the building site. It reads the
// programme, procurement, permits and quality records, and proposes what to do — with the reasons, the risk, what
// it costs and who carries it out. People approve or reject (with a reason the orchestrator learns from); an approved
// proposal changes the project data through patches, kept in data.decisions and re-applied after the daily roll.
import type { MaterialRequest, Permit } from "../types";
import type { RejectReason } from "../proposals";

export type SiteKind = "expedite" | "resequence" | "recover" | "stock_mr" | "approve_mr" | "permit_close" | "permit_chase" | "ncr_escalate";

/** A change to the project data. `sticky` patches hold across days; the others only on the day decided (the demo's
 *  rolling records — permits, NCR due dates, the demo requests — are rebuilt each day). */
export type SitePatch =
  | { t: "activity"; id: string; start?: string; finish?: string }
  | { t: "permit"; id: string; status?: Permit["status"]; validTo?: string }
  | { t: "mr_status"; id: string; status: MaterialRequest["status"] }
  | { t: "mr_add"; mr: MaterialRequest }
  | { t: "package_note"; id: string; text: string }
  | { t: "ncr_due"; id: string; due: string };

export interface SiteAction {
  id: string; domain: "site"; kind: SiteKind;
  title: string; why: string[];
  risk: "low" | "medium" | "high";
  /** money it commits (SAR, estimate), for approval limits */
  cost?: number; costNote?: string;
  /** who carries it out once approved */
  owner?: string;
  /** the company it concerns (paid, chased or escalated to): its own people can't decide it */
  party?: string;
  locationId?: string;
  patches: SitePatch[];
  /** the instruction left on the site plan when approved */
  instruction?: string;
  targets: { activityId?: string; packageId?: string; permitId?: string; mrId?: string; ncrId?: string };
}

export interface SiteDecision {
  id: string; at: string; date: string; by: string; byId?: string; role?: string; channel: "web" | "whatsapp" | "field" | "voice";
  actionId: string; kind: SiteKind; title: string; risk: SiteAction["risk"]; cost?: number;
  decision: "approved" | "rejected"; reason?: RejectReason; note?: string;
  patches: SitePatch[];
}
