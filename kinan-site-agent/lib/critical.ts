/**
 * Critical activities: the ones with no float, so a day lost on any of them moves the project's completion date.
 *
 * Kinan Heights: the programme comes from P6 with its own critical flags and total float, used as they are
 * (critical = flagged critical, or total float ≤ 0).
 * Generated projects: when their programme gives total float / critical flags (a P6 or MS Project export with logic),
 * those are used as they are. Otherwise the documents give dates only and the path is worked out from the dates:
 * within a building the phases follow one another (substructure → structure → façade → fit-out → handover); the
 * building that finishes last drives completion, and in it the chain of latest-finishing phases is critical. Every
 * other activity gets the float that separates it from that chain.
 */
import type { Activity, Db } from "./types";
import type { Phase, ProjectModelSpec, SpecActivity } from "./model3d/spec";

const DAY = 86_400_000;
const diff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10)) + n * DAY).toISOString().slice(0, 10);

// ------------------------------------------------------------------ Kinan Heights (P6 programme)
export const isCritical = (a: Pick<Activity, "critical" | "totalFloat">) => a.critical || a.totalFloat <= 0;
export const slipOf = (a: Activity) => diff(a.baselineFinish, a.finish);
/** % complete the dates call for at the data date (linear between forecast start and finish). */
export const expectedPct = (a: Activity, d0: string) =>
  a.finish <= d0 ? 100 : a.start > d0 ? 0 : Math.round((diff(a.start, d0) / Math.max(1, diff(a.start, a.finish))) * 100);

export type CritState = "late" | "risk" | "slipped" | "ok" | "done";
/**
 * late    = under way (or overdue to start) and forecast to finish past baseline: driving the delay now;
 * risk    = under way, on time on paper, but progress more than 10 points behind its own dates;
 * slipped = not started yet, already forecast late because the work before it slipped (the delay carried forward).
 */
export function critState(a: Activity, d0: string): CritState {
  if (a.status === "completed") return "done";
  const now = a.status === "in_progress" || a.start < d0;
  if (slipOf(a) > 0) return now ? "late" : "slipped";
  if (now && (a.status === "not_started" || a.percent < expectedPct(a, d0) - 10)) return "risk";
  return "ok";
}

export interface LiveCritical {
  dataDate: string;
  completion: { forecast: string; baseline: string; slip: number } | null;
  remaining: Activity[];   // critical, not complete, by start
  late: Activity[];        // by slip, largest first
  atRisk: Activity[];
  inProgress: Activity[];
  next: Activity[];        // critical starts in the next 14 days
  slipped: Activity[];     // later critical work already forecast late, largest slip first
  total: number;
}
export function liveCritical(db: Db, days = 14): LiveCritical {
  const S = db.data.schedule, d0 = db.data.meta.dataDate, to = addDays(d0, days);
  const crit = S.filter(isCritical);
  const remaining = crit.filter((a) => a.status !== "completed").sort((a, b) => a.start.localeCompare(b.start));
  const pc = S.find((a) => a.id === "M-990") ?? S.filter((a) => a.milestone).sort((a, b) => b.finish.localeCompare(a.finish))[0];
  return {
    dataDate: d0, total: crit.length,
    completion: pc ? { forecast: pc.finish, baseline: pc.baselineFinish, slip: slipOf(pc) } : null,
    remaining,
    late: remaining.filter((a) => critState(a, d0) === "late").sort((a, b) => slipOf(b) - slipOf(a)),
    atRisk: remaining.filter((a) => critState(a, d0) === "risk"),
    inProgress: remaining.filter((a) => a.status === "in_progress"),
    next: remaining.filter((a) => a.status === "not_started" && a.start >= d0 && a.start <= to),
    slipped: remaining.filter((a) => critState(a, d0) === "slipped" && a.start > to).sort((a, b) => slipOf(b) - slipOf(a)),
  };
}

// ------------------------------------------------------------------ generated projects (dates only)
const ORDER: Phase[] = ["substructure", "structure", "facade", "fitout", "handover"];
export interface SpecCritItem { a: SpecActivity; critical: boolean; float: number }
export interface SpecCritical {
  /** "programme": float and critical flags read from the programme; "dates": worked out from the dates */
  source: "programme" | "dates";
  finish: string;
  baselineFinish?: string; slip: number;
  items: SpecCritItem[];   // same order as spec.schedule.activities
  buildings: { id: string; name: string; finish: string; float: number; critical: boolean }[];
  path: SpecCritItem[];    // the critical activities still to finish, by start
}
const done = (a: SpecActivity) => (a.progress ?? 0) >= 100;
export const specSlip = (a: SpecActivity) => (a.baselineFinish ? diff(a.baselineFinish, a.finish) : 0);
/** Same states as Kinan Heights: late (under way and forecast past baseline), risk (behind its own dates), slipped, ok. */
export function specState(a: SpecActivity, d0: string): CritState {
  if (done(a)) return "done";
  const now = a.start <= d0 || (a.progress ?? 0) > 0;
  if (specSlip(a) > 0) return now ? "late" : "slipped";
  if (now && a.progress !== undefined && a.progress < Math.min(100, Math.round((diff(a.start, d0) / Math.max(1, diff(a.start, a.finish))) * 100)) - 10) return "risk";
  return "ok";
}
export function specCritical(spec: ProjectModelSpec): SpecCritical {
  const acts = spec.schedule.activities;
  const withFloat = acts.filter((a) => a.float !== undefined || a.critical !== undefined).length;
  if (acts.length && withFloat >= acts.length * 0.3) {
    // the programme carries its own CPM results
    const finish = spec.schedule.finish || acts.reduce((m, a) => (a.finish > m ? a.finish : m), "");
    const baselineFinish = spec.schedule.baselineFinish || acts.reduce((m, a) => (a.baselineFinish && a.baselineFinish > m ? a.baselineFinish : m), "") || undefined;
    const items = acts.map((a) => ({ a, critical: !done(a) && (a.critical ?? (a.float ?? 1) <= 0), float: a.float ?? 0 }));
    const buildings = spec.buildings.map((b) => {
      const mine = items.filter((x) => x.a.building === b.id), open = mine.filter((x) => !done(x.a));
      const bFinish = mine.reduce((m, x) => (x.a.finish > m ? x.a.finish : m), "");
      const fl = open.filter((x) => x.a.float !== undefined).map((x) => x.float);
      return { id: b.id, name: b.name, finish: bFinish, float: fl.length ? Math.min(...fl) : 0, critical: open.some((x) => x.critical) };
    });
    return { source: "programme", finish, baselineFinish, slip: baselineFinish ? diff(baselineFinish, finish) : 0, items, buildings,
      path: items.filter((x) => x.critical).sort((p, q) => p.a.start.localeCompare(q.a.start)) };
  }
  // completion = the last activity's finish (a later contract date in the documents would leave everything with float)
  const finish = acts.reduce((m, a) => (a.finish > m ? a.finish : m), "") || spec.schedule.finish;
  const info = new Map<SpecActivity, { critical: boolean; float: number }>();
  const buildings = spec.buildings.map((b) => {
    const mine = acts.filter((a) => a.building === b.id);
    if (!mine.length) return { id: b.id, name: b.name, finish: "", float: 0, critical: false };
    const bFinish = mine.reduce((m, a) => (a.finish > m ? a.finish : m), "");
    const bFloat = Math.max(0, diff(bFinish, finish));
    // The driving chain: from the last-finishing activity back through the latest finish of each earlier phase.
    const byPhase = new Map<number, SpecActivity>();
    for (const a of mine) { const k = ORDER.indexOf(a.phase); const cur = byPhase.get(k); if (!cur || a.finish > cur.finish) byPhase.set(k, a); }
    const chain = new Set<SpecActivity>();
    let at = mine.reduce((m, a) => (a.finish > m.finish || (a.finish === m.finish && ORDER.indexOf(a.phase) > ORDER.indexOf(m.phase)) ? a : m));
    chain.add(at);
    for (let k = ORDER.indexOf(at.phase) - 1; k >= 0; k--) { const p = byPhase.get(k); if (p && p.finish <= at.finish) { chain.add(p); at = p; } }
    for (const a of mine) {
      if (chain.has(a)) { info.set(a, { critical: bFloat === 0, float: bFloat }); continue; }
      // off the chain: its slack to the chain activity of the same phase (or the next phase on the chain)
      const k = ORDER.indexOf(a.phase);
      const ref = [...chain].filter((c) => ORDER.indexOf(c.phase) >= k).sort((p, q) => ORDER.indexOf(p.phase) - ORDER.indexOf(q.phase))[0];
      const gap = ref ? Math.max(0, ORDER.indexOf(ref.phase) === k ? diff(a.finish, ref.finish) : diff(a.finish, ref.start)) : diff(a.finish, finish);
      info.set(a, { critical: false, float: bFloat + Math.max(1, gap) });
    }
    return { id: b.id, name: b.name, finish: bFinish, float: bFloat, critical: bFloat === 0 };
  });
  const items = acts.map((a) => ({ a, ...(info.get(a) ?? { critical: false, float: 0 }) }));
  return { source: "dates", finish, slip: 0, items, buildings, path: items.filter((x) => x.critical).sort((p, q) => p.a.start.localeCompare(q.a.start)) };
}

/** Planned % complete of a generated project at a date: duration-weighted, linear, on the baseline dates when the
 *  programme has them (else on its dates). */
export function specPlannedPct(spec: ProjectModelSpec, d: string) {
  let w = 0, e = 0;
  for (const a of spec.schedule.activities) {
    const s = a.baselineStart ?? a.start, f = a.baselineFinish ?? a.finish;
    const dur = Math.max(1, diff(s, f));
    w += dur; e += dur * (f <= d ? 1 : s > d ? 0 : diff(s, d) / dur);
  }
  return w ? Math.round((e / w) * 1000) / 10 : 0;
}
/** Earned % complete from the programme's % complete (duration-weighted), or null when it gives none. */
export function specEarnedPct(spec: ProjectModelSpec) {
  const xs = spec.schedule.activities.filter((a) => a.progress !== undefined);
  if (xs.length < spec.schedule.activities.length * 0.3) return null;
  let w = 0, e = 0;
  for (const a of xs) { const dur = Math.max(1, diff(a.baselineStart ?? a.start, a.baselineFinish ?? a.finish)); w += dur; e += dur * (a.progress ?? 0) / 100; }
  return w ? Math.round((e / w) * 1000) / 10 : 0;
}
