// The critical path method, so the agent can try a change before proposing it. The network is the programme's logic
// as P6 has it (finish-to-start, start-to-start, finish-to-finish, start-to-finish, with lags; constraints): a forward
// pass from the data date gives the early dates, a backward pass from the project's finish the late dates, and their
// difference the total float — zero or less is the critical path. Durations are in calendar days, counting the start and finish day as P6 does (a simplification of
// P6's working calendars: the same for every scenario, so the difference between two runs — what a change does to
// completion — is what the agent uses, not the absolute date). Completed work is fixed; work under way keeps its actual
// start and its remaining duration.
import type { Activity } from "../types";

export type RelType = "FS" | "SS" | "FF" | "SF";
export interface Rel { pred: string; succ: string; type: RelType; lag: number }
export interface Node { id: string; dur: number; status: Activity["status"]; start: string; finish: string; constraint?: Activity["constraint"]; milestone?: boolean }
export interface Net { nodes: Map<string, Node>; rels: Rel[]; dataDate: string }
export interface CpmResult {
  es: Map<string, number>; ef: Map<string, number>; ls: Map<string, number>; lf: Map<string, number>; tf: Map<string, number>;
  /** the project's finish, in days from the data date, and as a date */
  finishDay: number; finish: string;
  critical: Set<string>;
  /** activities caught in a loop of logic (they can't be scheduled) */
  loops: string[];
}

const DAY = 86_400_000;
export const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY);
export const plus = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * DAY).toISOString().slice(0, 10);

/** The programme as a network: each activity's duration (remaining, for work under way) and its relationships. */
export function network(schedule: Activity[], dataDate: string): Net {
  // durations count the start and the finish day, as P6 does (an activity on the 10th–12th takes 3 days); milestones 0
  const nodes = new Map<string, Node>();
  for (const a of schedule) {
    const span = days(a.start, a.finish) + 1;
    const dur = a.milestone ? 0 : a.status === "in_progress" ? Math.max(1, a.remaining ?? days(dataDate, a.finish) + 1) : Math.max(1, a.status === "completed" ? span : a.remaining ?? span);
    nodes.set(a.id, { id: a.id, dur, status: a.status, start: a.start, finish: a.finish, constraint: a.constraint, milestone: a.milestone });
  }
  const rels: Rel[] = [];
  for (const a of schedule) {
    const list = a.rels ?? a.predecessors.map((id) => ({ id, type: "FS" as const, lag: 0 }));
    for (const r of list) if (nodes.has(r.id) && r.id !== a.id) rels.push({ pred: r.id, succ: a.id, type: r.type, lag: r.lag });
  }
  return { nodes, rels, dataDate };
}

export function cpm(net: Net): CpmResult {
  const { nodes, rels, dataDate } = net;
  const preds = new Map<string, Rel[]>(), succs = new Map<string, Rel[]>();
  for (const r of rels) { (preds.get(r.succ) ?? preds.set(r.succ, []).get(r.succ)!).push(r); (succs.get(r.pred) ?? succs.set(r.pred, []).get(r.pred)!).push(r); }
  // topological order (Kahn); what is left over is in a loop
  const indeg = new Map([...nodes.keys()].map((id) => [id, preds.get(id)?.length ?? 0]));
  const order: string[] = [], queue = [...nodes.keys()].filter((id) => !indeg.get(id));
  while (queue.length) { const id = queue.shift()!; order.push(id); for (const r of succs.get(id) ?? []) { const n = indeg.get(r.succ)! - 1; indeg.set(r.succ, n); if (!n) queue.push(r.succ); } }
  const loops = [...nodes.keys()].filter((id) => !order.includes(id));
  const es = new Map<string, number>(), ef = new Map<string, number>();
  const day = (d: string) => days(dataDate, d);
  for (const id of order) {
    const n = nodes.get(id)!;
    if (n.status === "completed") { es.set(id, day(n.start)); ef.set(id, n.milestone ? day(n.finish) : day(n.finish) + 1); continue; }
    let s = n.status === "in_progress" ? day(n.start) : 0; // not before the data date; under way: its actual start
    let fmin = -Infinity;
    if (n.status !== "in_progress") for (const r of preds.get(id) ?? []) {
      const pes = es.get(r.pred) ?? 0, pef = ef.get(r.pred) ?? 0;
      if (r.type === "FS") s = Math.max(s, pef + r.lag);
      else if (r.type === "SS") s = Math.max(s, pes + r.lag);
      else if (r.type === "FF") fmin = Math.max(fmin, pef + r.lag);
      else s = Math.max(s, pes + r.lag - n.dur);
    } else for (const r of preds.get(id) ?? []) if (r.type === "FF") fmin = Math.max(fmin, (ef.get(r.pred) ?? 0) + r.lag);
    const c = n.constraint;
    if (c && (c.type === "SNET" || c.type === "MSO") && n.status !== "in_progress") s = Math.max(s, day(c.date));
    let f = (n.status === "in_progress" ? Math.max(0, 0) + n.dur : s + n.dur);
    if (n.status === "in_progress") f = n.dur; // remaining from the data date
    if (c && c.type === "FNET") f = Math.max(f, day(c.date) + (n.milestone ? 0 : 1));
    f = Math.max(f, fmin);
    es.set(id, n.status === "in_progress" ? day(n.start) : s); ef.set(id, f);
  }
  const finishDay = Math.max(0, ...[...ef.values()]);
  const ls = new Map<string, number>(), lf = new Map<string, number>(), tf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const n = nodes.get(id)!;
    let l = finishDay;
    for (const r of succs.get(id) ?? []) {
      const sls = ls.get(r.succ) ?? finishDay, slf = lf.get(r.succ) ?? finishDay;
      if (r.type === "FS") l = Math.min(l, sls - r.lag);
      else if (r.type === "SS") l = Math.min(l, sls - r.lag + n.dur);
      else if (r.type === "FF") l = Math.min(l, slf - r.lag);
      else l = Math.min(l, slf - r.lag + n.dur);
    }
    const c = n.constraint;
    if (c && (c.type === "FNLT" || c.type === "MFO")) l = Math.min(l, day(c.date) + (n.milestone ? 0 : 1));
    lf.set(id, l); ls.set(id, l - n.dur);
    tf.set(id, n.status === "completed" ? 0 : l - (ef.get(id) ?? 0));
  }
  const critical = new Set([...tf.entries()].filter(([id, f]) => f <= 0 && nodes.get(id)!.status !== "completed").map(([id]) => id));
  // the last finish as a date: a task ends the day before its exclusive early finish, a milestone on it
  const last = [...ef.entries()].reduce((m, [id, f]) => Math.max(m, nodes.get(id)!.milestone ? f : f - 1), 0);
  return { es, ef, ls, lf, tf, finishDay, finish: plus(dataDate, last), critical, loops };
}

/** What a change does to the project's finish: the same network run twice (so the calendar simplification cancels out). */
export function impact(schedule: Activity[], dataDate: string, change: (net: Net) => void): { days: number; base: CpmResult; after: CpmResult } {
  const base = cpm(network(schedule, dataDate));
  const net = network(schedule, dataDate);
  change(net);
  const after = cpm(net);
  return { days: after.finishDay - base.finishDay, base, after };
}

/** The driving path into an activity: walk back along the predecessors with no float between them. */
export function drivingPath(net: Net, r: CpmResult, to: string, max = 12): string[] {
  const out = [to];
  let cur = to;
  for (let i = 0; i < max; i++) {
    const n = net.nodes.get(cur)!;
    const driver = net.rels.filter((x) => x.succ === cur).find((x) => {
      const pes = r.es.get(x.pred) ?? 0, pef = r.ef.get(x.pred) ?? 0, s = r.es.get(cur) ?? 0, f = r.ef.get(cur) ?? 0;
      return x.type === "FS" ? pef + x.lag === s : x.type === "SS" ? pes + x.lag === s : x.type === "FF" ? pef + x.lag === f : pes + x.lag - n.dur === s;
    });
    if (!driver || net.nodes.get(driver.pred)!.status === "completed") break;
    out.unshift(driver.pred); cur = driver.pred;
  }
  return out;
}

/** Reschedule (F9 in P6): the early dates, total float and critical flag of the work not finished, from the logic.
 *  Work under way keeps its actual start. Returns the ids whose dates changed. */
export function reschedule(schedule: Activity[], dataDate: string): string[] {
  const r = cpm(network(schedule, dataDate)), out: string[] = [];
  for (const a of schedule) {
    if (a.status === "completed" || !r.es.has(a.id)) continue;
    const es = r.es.get(a.id)!, ef = r.ef.get(a.id)!;
    const start = a.status === "in_progress" ? a.start : plus(dataDate, es), finish = a.milestone ? plus(dataDate, ef) : plus(dataDate, ef - 1);
    if (start !== a.start || finish !== a.finish) out.push(a.id);
    a.start = a.milestone && a.status !== "in_progress" ? finish : start; a.finish = finish < a.start ? a.start : finish;
    a.totalFloat = r.tf.get(a.id) ?? a.totalFloat; a.critical = a.totalFloat <= 0;
  }
  return out;
}

/** The programme's completion activity: the demo's M-990, else the latest-finishing milestone, else the last activity. */
export function completionOf(schedule: Activity[]): string {
  if (schedule.some((a) => a.id === "M-990")) return "M-990";
  const last = (xs: Activity[]) => xs.reduce<Activity | undefined>((m, a) => (!m || a.finish > m.finish ? a : m), undefined);
  return (last(schedule.filter((a) => a.milestone)) ?? last(schedule))?.id ?? "";
}
