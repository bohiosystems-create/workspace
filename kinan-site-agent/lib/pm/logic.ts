// The demo programme's logic, as a planner's P6 programme would carry it: each activity tied to its predecessors so the
// logic reproduces its dates (finish-to-start where it follows, with the lag the dates show; start-to-start where it
// overlaps), open ends tied to their building's completion milestone (or to practical completion), and practical
// completion constrained to its contract date — so negative float comes from the logic, as in P6. Then total float and
// the critical flags are taken from the critical path method, so the programme agrees with itself. A real programme
// (an XER import, the P6 API) brings its own logic and is never changed by this.
import type { Activity } from "../types";
import { cpm, days, network } from "./cpm";

const HOME: [RegExp, string][] = [[/^TA-/, "TA-M20"], [/^TB-/, "TB-M20"], [/^HC-/, "HC-M20"]];

export function logicise(schedule: Activity[], dataDate: string, completion = "M-990"): Activity[] {
  const by = new Map(schedule.map((a) => [a.id, a]));
  const succs = new Set(schedule.flatMap((a) => a.predecessors));
  // the programme's own predecessors (before the open ends are tied in): they drive; added ties only feed
  const own = new Map(schedule.map((a) => [a.id, new Set(a.predecessors)]));
  // open ends: work nothing follows goes to its building's completion milestone, or to practical completion
  for (const a of schedule) {
    if (a.id === completion || succs.has(a.id) || a.status === "completed") continue;
    const vd = /^VD(\d+)-/.exec(a.id);
    const target = vd ? `VD${vd[1]}-HO` : HOME.find(([re]) => re.test(a.id))?.[1] ?? "M-900";
    // the next work in the same place, as a planner would tie it; else the building's completion milestone
    const next = schedule.filter((b) => b.id !== a.id && b.locationId === a.locationId && a.locationId !== "site" && b.start > a.finish && b.status === "not_started").sort((x, y) => x.start.localeCompare(y.start))[0];
    const m = next ?? (by.get(target) && by.get(target)!.start >= a.finish && target !== a.id ? by.get(target)! : by.get(completion)!);
    if (m && m.id !== a.id && !m.predecessors.includes(a.id)) m.predecessors.push(a.id);
  }
  // each activity's relationships, so its dates follow from them
  for (const a of schedule) {
    const ps = a.predecessors.map((id) => by.get(id)).filter((p): p is Activity => !!p);
    if (!ps.length) { if (a.status === "not_started") a.constraint = { type: "SNET", date: a.start }; continue; }
    // the driving predecessor carries the gap the dates show (a lag after it, or a start-to-start overlap); the
    // others are plain finish-to-start (or start-to-start where they overlap), so they keep their float
    const fsGap = (p: Activity) => days(p.finish, a.start) - (p.milestone ? 0 : 1);
    const mine = ps.filter((p) => own.get(a.id)!.has(p.id)), pool = mine.length ? mine : ps;
    const after = pool.filter((p) => fsGap(p) >= 0), overlap = pool.filter((p) => fsGap(p) < 0);
    // the latest-finishing of its own predecessors drives (for a milestone: the work it certifies)
    const driver = after.length ? after.reduce((x, y) => (y.finish > x.finish ? y : x)) : overlap.reduce((x, y) => (y.start > x.start ? y : x));
    a.rels = ps.map((p) => {
      if (p === driver) return fsGap(p) >= 0 ? { id: p.id, type: "FS" as const, lag: fsGap(p) } : { id: p.id, type: "SS" as const, lag: Math.max(0, days(p.start, a.start)) };
      return fsGap(p) >= 0 ? { id: p.id, type: "FS" as const, lag: 0 } : { id: p.id, type: "SS" as const, lag: 0 };
    });
  }
  const pc = by.get(completion);
  if (pc) pc.constraint = { type: "FNLT", date: pc.baselineFinish };
  // float and the critical path from the logic
  const r = cpm(network(schedule, dataDate));
  for (const a of schedule) {
    if (a.status === "completed") { a.totalFloat = 0; a.critical = false; continue; }
    const tf = r.tf.get(a.id);
    if (tf === undefined) continue;
    a.totalFloat = tf; a.critical = tf <= 0;
  }
  return schedule;
}
