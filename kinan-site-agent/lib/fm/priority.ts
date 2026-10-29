// Setting the team's priorities by itself. Every open job gets a score from what matters on site — its priority, how
// critical the equipment is, whether it is down, how much SLA time is left, safety, how many tenants are complaining
// about it, and whether its equipment is predicted to fail soon — with the reasons in words. From the scores: the
// priority each job should have (the orchestrator proposes the change when it differs, so a job four tenants are
// complaining about doesn't wait behind routine work), and the plan for each person on shift — what they are on now and
// what comes next, in order, including the unassigned jobs that suit their skills and area.
import type { FmData, Priority, Technician, WorkOrder } from "./types";
import { isOpen, slaLeft, workload } from "./engine";
import { waitingFor } from "./work";
import { predictions } from "./predict";

export interface Scored { woId: string; score: number; priority: Priority; suggested: Priority; reasons: string[]; blocked?: string }

const BASE: Record<Priority, number> = { P1: 40, P2: 28, P3: 16, P4: 8 };
export const fromScore = (s: number): Priority => (s >= 66 ? "P1" : s >= 40 ? "P2" : s >= 24 ? "P3" : "P4");
const LEVEL: Record<Priority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

/** Every open job of the facility, highest score first, with its reasons. */
export function scoreJobs(d: FmData, facilityId: string, now = Date.now()): Scored[] {
  const preds = predictions(d, facilityId, now);
  const out: Scored[] = [];
  for (const w of d.workOrders.filter((x) => x.facilityId === facilityId && isOpen(x) && x.type !== "TAR")) {
    const a = d.assets.find((x) => x.id === w.assetId);
    const reasons: string[] = [];
    let s = BASE[w.priority];
    if (a?.criticality === "A") { s += 12; reasons.push("critical equipment (A)"); } else if (a?.criticality === "B") s += 6;
    if (a?.status === "down") { s += 12; reasons.push(`${a.tag} is down`); } else if (a?.status === "degraded") { s += 5; reasons.push(`${a.tag} degraded`); }
    if (w.type === "Emergency") { s += 12; reasons.push("emergency"); }
    const left = slaLeft(w, now);
    if (w.type !== "PM" && w.type !== "PdM") {
      if (left < 0) { s += 22; reasons.push("past its SLA"); } else if (left < 2) { s += 16; reasons.push(`${Math.max(0, Math.round(left * 60))} min of SLA left`); } else if (left < 8) { s += 8; reasons.push(`${Math.round(left)} h of SLA left`); }
    } else if (left < 24) { s += 6; reasons.push(left < 0 ? "maintenance overdue" : "maintenance due today"); } else if (w.type === "PM") s -= 10; // routine, not due yet: after the repairs
    if (w.permit || w.gasTest || a?.class === "lift" || /trapped|fire|gas|smoke/i.test(w.title)) { s += 4; if (w.gasTest || /gas|fire|smoke/i.test(w.title)) reasons.push("safety"); }
    // tenants complaining about this job, or about its equipment
    // (complaints about the equipment count on its repair, not on its routine maintenance)
    const cs = d.complaints.filter((c) => c.status !== "resolved" && (c.woId === w.id || (w.type !== "PM" && c.assetId && c.assetId === w.assetId)));
    if (cs.length) { s += Math.min(24, cs.length * 6 + (cs.some((c) => c.severity === "high") ? 6 : 0)); reasons.push(`${cs.length} tenant complaint${cs.length > 1 ? "s" : ""}`); }
    const p = preds.find((x) => x.assetId === w.assetId);
    if (p && p.days <= 7) { s += 10; reasons.push(`predicted to cross its limit in ~${Math.round(p.days)} days`); }
    const wait = waitingFor(d, w);
    const blocked = w.status === "on_hold" ? w.holdReason ?? "on hold" : wait.length ? `waits for ${wait.join(", ")}` : w.permit?.status === "required" ? `needs a ${w.permit.type} permit` : undefined;
    out.push({ woId: w.id, score: Math.round(s), priority: w.priority, suggested: fromScore(s), reasons, ...(blocked ? { blocked } : {}) });
  }
  return out.sort((x, y) => Number(!!x.blocked) - Number(!!y.blocked) || y.score - x.score);
}

/** Jobs whose priority should change: up by a level or more, or down by two (a P2 nobody needs today). */
export function priorityChanges(d: FmData, facilityId: string, now = Date.now()) {
  return scoreJobs(d, facilityId, now).filter((x) => !x.blocked && (LEVEL[x.suggested] < LEVEL[x.priority] || LEVEL[x.suggested] - LEVEL[x.priority] >= 2));
}

export interface PlanRow { tech: Pick<Technician, "id" | "name" | "role" | "zone" | "shift" | "status">; now?: Scored & { title: string }; next: (Scored & { title: string; suggestedFor?: boolean })[]; load: number }

/** The plan for each person on shift: the job they are on, then their own jobs by score, then unassigned jobs that suit
 *  their skills (handed out best score first, to whoever fits best and has the least on). */
export function teamPlan(d: FmData, facilityId: string, now = Date.now()): { rows: PlanRow[]; unplanned: (Scored & { title: string })[] } {
  const scored = scoreJobs(d, facilityId, now), wo = (id: string) => d.workOrders.find((w) => w.id === id)!;
  const crew = d.technicians.filter((t) => t.facilityId === facilityId && t.shift !== "off" && t.status !== "off" && !/manager|duty manager|security|operations officer|hse|pilot/i.test(t.role));
  const rows = new Map<string, PlanRow>(crew.map((t) => [t.id, { tech: { id: t.id, name: t.name, role: t.role, zone: t.zone, shift: t.shift, status: t.status }, next: [], load: workload(d, t.id) }]));
  const unplanned: (Scored & { title: string })[] = [];
  for (const s of scored.filter((x) => !x.blocked)) {
    const w = wo(s.woId), item = { ...s, title: w.title };
    if (w.assignee && rows.has(w.assignee)) {
      const r = rows.get(w.assignee)!;
      if (w.status === "in_progress" && !r.now) r.now = item; else r.next.push(item);
      continue;
    }
    if (w.assignee || w.crew || w.robot) continue; // someone else's: a crew, a robot, or a person off shift
    const a = d.assets.find((x) => x.id === w.assetId);
    const fit = crew.filter((t) => a && t.trades.includes(a.trade)).map((t) => ({ t, k: (rows.get(t.id)!.next.length + (rows.get(t.id)!.now ? 1 : 0)) * 2 - (t.zone === a!.zone ? 2 : 0) })).sort((x, y) => x.k - y.k)[0];
    if (fit) rows.get(fit.t.id)!.next.push({ ...item, suggestedFor: true }); else unplanned.push(item);
  }
  return { rows: [...rows.values()].sort((x, y) => (y.now ? 1 : 0) + y.next.length - ((x.now ? 1 : 0) + x.next.length)), unplanned };
}

export const isPriority = (x: unknown): x is Priority => x === "P1" || x === "P2" || x === "P3" || x === "P4";
export type { WorkOrder };
