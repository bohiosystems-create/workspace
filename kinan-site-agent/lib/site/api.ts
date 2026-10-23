// Construction proposals: list them, decide them (with the approval limits of the person deciding), and re-apply
// approved changes after the daily roll. Shared by the API, the agent's tools, WhatsApp and the standalone page.
import type { Db, Note, ProjectData } from "../types";
import { canApprove, type Person } from "../auth/people";
import { closedIds, isReason, learnedDoubts, type DecisionLike, type RejectReason } from "../proposals";
import { proposeSite } from "./orchestrator";
import { completionDate, moveActivity } from "../core/updates";
import { guard, shot } from "../core/invariants";
import { daysBetween } from "../data/util";
import type { SiteAction, SiteDecision, SitePatch } from "./types";

export const siteDecisionsLike = (data: ProjectData): DecisionLike[] =>
  (data.decisions ?? []).map((x) => ({ actionId: x.actionId, kind: x.kind, scope: "site", decision: x.decision, reason: x.reason, at: x.at }));

export function siteActions(db: Db): SiteAction[] {
  const log = siteDecisionsLike(db.data);
  return proposeSite(db, { closed: closedIds(log), doubts: learnedDoubts(log) });
}

/** Apply one patch to the project data. */
function applyPatch(data: ProjectData, p: SitePatch) {
  switch (p.t) {
    // a later finish flows to the work that follows (lib/core/updates.ts)
    case "activity": { const a = data.schedule.find((x) => x.id === p.id); if (a) moveActivity(data.schedule, a, () => { if (p.start) a.start = p.start; if (p.finish) a.finish = p.finish; }); break; }
    case "permit": { const x = data.safety.permits.find((y) => y.id === p.id); if (x) { if (p.status) x.status = p.status; if (p.validTo) x.validTo = p.validTo; } break; }
    case "mr_status": { const r = data.procurement.requests.find((x) => x.id === p.id); if (r) r.status = p.status; break; }
    case "mr_add": if (!data.procurement.requests.some((x) => x.id === p.mr.id)) data.procurement.requests.push(structuredClone(p.mr)); break;
    case "package_note": { const k = data.procurement.packages.find((x) => x.id === p.id); if (k && !k.notes.includes(p.text)) k.notes = `${p.text} ${k.notes}`; break; }
    case "ncr_due": { const n = data.quality.ncrs.find((x) => x.id === p.id); if (n) n.due = p.due; break; }
  }
}
const sticky = (p: SitePatch) => p.t === "activity" || p.t === "mr_add" || p.t === "package_note";

/** After the daily roll rebuilds the demo data: an approved change comes back (a day-bound one on its day only). */
export function applyDecision(data: ProjectData, x: SiteDecision) {
  if (x.decision === "approved") for (const p of x.patches) if (sticky(p) || x.date === data.meta.dataDate) applyPatch(data, p);
}

export interface SiteDecideInput { actionId: string; decision: "approved" | "rejected"; reason?: RejectReason; note?: string }
export function decideSite(db: Db, b: SiteDecideInput, user: Person | null | undefined, channel: SiteDecision["channel"]): { message: string; decision: SiteDecision } {
  const a = siteActions(db).find((x) => x.id === b.actionId);
  if (!a) throw new Error("That proposal is no longer open — the situation changed.");
  const ok = b.decision === "approved" ? canApprove(user, { domain: "site", risk: a.risk, cost: a.cost }) : canApprove(user, { domain: "site", risk: "low" });
  if (!ok.ok) throw new Error(`${b.decision === "approved" ? "Can't approve" : "Can't reject"} “${a.title}”: ${ok.why}`);
  const at = new Date().toISOString();
  const reason = b.decision === "rejected" && isReason(b.reason) ? b.reason : undefined;
  const dec: SiteDecision = { id: `sd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, date: db.data.meta.dataDate, by: user!.name, byId: user!.id, role: user!.role, channel,
    actionId: a.id, kind: a.kind, title: a.title, risk: a.risk, ...(a.cost ? { cost: a.cost } : {}), decision: b.decision, ...(reason ? { reason } : {}), ...(b.note ? { note: b.note.slice(0, 200) } : {}),
    patches: b.decision === "approved" ? a.patches : [] };
  (db.data.decisions ??= []).push(dec);
  db.data.decisions = db.data.decisions.slice(-1500);
  const pcBefore = completionDate(db.data), rules = shot(db.data);
  if (b.decision === "approved") {
    for (const p of a.patches) applyPatch(db.data, p);
    guard(`approving ${a.id}`, db.data, rules);
    if (a.instruction) {
      const n: Note = { id: `n_${Math.random().toString(16).slice(2, 12)}`, createdAt: at, status: "open", kind: "instruction", author: user!.name, via: "agent",
        text: `${a.instruction}${a.owner ? ` — action: ${a.owner}` : ""} (approved by ${user!.name})`, ...(a.locationId ? { locationId: a.locationId } : {}) };
      db.notes.unshift(n);
    }
  }
  // what it did to practical completion, when it moved the programme
  const pcAfter = completionDate(db.data), moved = daysBetween(pcBefore, pcAfter);
  const pc = a.patches.some((p) => p.t === "activity") && b.decision === "approved" ? ` Practical completion ${moved ? `moves ${moved > 0 ? "+" : ""}${moved} days to ${pcAfter}` : `unchanged (${pcAfter})`}.` : "";
  return { message: b.decision === "approved" ? `Done: ${a.title}.${a.owner ? ` ${a.owner} has the instruction.` : ""}${pc}` : `Rejected: ${a.title}. The orchestrator will take that into account.`, decision: dec };
}
