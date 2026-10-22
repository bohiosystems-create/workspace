// What both orchestrators share: why a proposal was turned down, and what the orchestrator learns from it.
// "Not now" puts it off for a day; "wrong person" asks for someone else; a kind of proposal that people keep
// rejecting in one place stops running on autopilot and drops to the bottom of the list, with the reason shown.

export const REJECT_REASONS = {
  not_now: "Not now",
  already_handled: "Already handled",
  wrong_person: "Wrong person",
  too_costly: "Too costly",
  disagree: "Disagree with the reasoning",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;
export const isReason = (x: unknown): x is RejectReason => typeof x === "string" && x in REJECT_REASONS;

/** One decision, in the shape both logs can give. */
export interface DecisionLike { actionId: string; kind?: string; scope?: string; decision: "approved" | "rejected" | "auto"; reason?: RejectReason; at: string; targetTech?: string }

/** Proposal ids that stay closed: approved/run ones for good, rejected ones for good unless "not now" (24 h) or
 *  "wrong person" (the same job comes back with someone else). */
export function closedIds(log: DecisionLike[], now = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const d of log) {
    if (d.decision !== "rejected") { out.add(d.actionId); continue; }
    if (d.reason === "not_now" && now - Date.parse(d.at) > 24 * 3600_000) continue;
    if (d.reason === "wrong_person") continue;
    out.add(d.actionId);
  }
  return out;
}
/** People turned down for a job ("wrong person"): job key → technician ids. */
export function excludedPeople(log: DecisionLike[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const d of log) if (d.decision === "rejected" && d.reason === "wrong_person" && d.targetTech) {
    const job = d.actionId.split(":").slice(0, 2).join(":");
    if (!out.has(job)) out.set(job, new Set());
    out.get(job)!.add(d.targetTech);
  }
  return out;
}
/** Kinds of proposal that people mostly reject in this scope (≥ 2 rejections, ≥ half of the last 6 decisions,
 *  "not now" not counted): they stop running by themselves and say so. */
export function learnedDoubts(log: DecisionLike[]): Map<string, { rejected: number; of: number; reasons: string[] }> {
  const by = new Map<string, DecisionLike[]>();
  for (const d of log) if (d.kind && !(d.decision === "rejected" && d.reason === "not_now")) {
    const k = `${d.scope ?? ""}|${d.kind}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(d);
  }
  const out = new Map<string, { rejected: number; of: number; reasons: string[] }>();
  for (const [k, xs] of by) {
    const last = xs.sort((a, b) => a.at.localeCompare(b.at)).slice(-6);
    const rej = last.filter((d) => d.decision === "rejected");
    if (rej.length >= 2 && rej.length * 2 >= last.length) out.set(k, { rejected: rej.length, of: last.length, reasons: [...new Set(rej.map((d) => (d.reason ? REJECT_REASONS[d.reason] : "no reason")))] });
  }
  return out;
}
export const doubtLine = (kindLabel: string, l: { rejected: number; of: number; reasons: string[] }, automatic = true) =>
  `Learned: ${l.rejected} of the last ${l.of} “${kindLabel}” proposals here were rejected (${l.reasons.join(", ").toLowerCase()})${automatic ? " — it no longer runs by itself" : " — shown last"}`;
