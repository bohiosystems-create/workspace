import type { Activity, Db } from "../types";
import { descendantIds } from "./query";

/** Progress views derived from the schedule, for the 3D site model and the Project charts. */

const diff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);

export interface StructureState {
  id: string;
  floors: number;
  /** Levels whose structure is complete (0..floors). */
  built: number;
  /** A level is being cast now. */
  active: boolean;
  percent: number;
}

/**
 * How high each building has risen, from the structure activities: per-level ones (`TA-STR-L12`, located at
 * `tower-a-l12`) or a single structure activity on the building itself (`PD-STR`, `VD4-STR`).
 */
export function structureProgress(schedule: Activity[], buildings: { id: string; floors: number }[]): Record<string, StructureState> {
  const out: Record<string, StructureState> = {};
  for (const b of buildings) {
    const perLevel = schedule.filter((a) => /-STR-L\d+$/i.test(a.id) && a.locationId.startsWith(b.id + "-l"));
    let built = 0, active = false, percent = 0;
    if (perLevel.length) {
      for (const a of perLevel) {
        const n = Number(a.locationId.slice(b.id.length + 2));
        if (a.status === "completed") built = Math.max(built, n);
        else if (a.status === "in_progress") active = true;
      }
      percent = Math.round((built / b.floors) * 100);
    } else {
      const a = schedule.find((x) => /-STR$/i.test(x.id) && x.locationId === b.id);
      if (a) { percent = a.percent; built = Math.floor((b.floors * a.percent) / 100); active = a.status === "in_progress"; }
    }
    out[b.id] = { id: b.id, floors: b.floors, built, active, percent };
  }
  return out;
}

export interface LocationProgress { id: string; earned: number; planned: number; late: number; critical: number; activities: number }

/** Earned vs planned % (duration-weighted, as in scheduleSummary) for each location subtree. */
export function progressByLocation(db: Db, ids: string[]): LocationProgress[] {
  const d0 = db.data.meta.dataDate;
  const dur = (a: Activity) => Math.max(1, diff(a.start, a.finish));
  const bdur = (a: Activity) => Math.max(1, diff(a.baselineStart, a.baselineFinish));
  const plannedPct = (a: Activity) => (a.baselineFinish <= d0 ? 100 : a.baselineStart > d0 ? 0 : (diff(a.baselineStart, d0) / bdur(a)) * 100);
  return ids.map((id) => {
    const set = descendantIds(db, id);
    const S = db.data.schedule.filter((a) => set.has(a.locationId));
    const td = S.reduce((s, a) => s + dur(a), 0) || 1, tb = S.reduce((s, a) => s + bdur(a), 0) || 1;
    return {
      id,
      earned: Math.round((S.reduce((s, a) => s + dur(a) * a.percent, 0) / td) * 10) / 10,
      planned: Math.round((S.reduce((s, a) => s + bdur(a) * plannedPct(a), 0) / tb) * 10) / 10,
      late: S.filter((a) => a.status !== "completed" && diff(a.baselineFinish, a.finish) > 3).length,
      critical: S.filter((a) => a.critical && a.status !== "completed").length,
      activities: S.length,
    };
  });
}

/** Cumulative planned vs earned % over the project (the S-curve): month ends, plus the data date itself so the
 *  "today" point equals the headline progress figure. Points after the data date carry the forecast only. */
export function sCurve(db: Db) {
  const S = db.data.schedule, d0 = db.data.meta.dataDate.slice(0, 10);
  const dur = (a: Activity) => Math.max(1, diff(a.start, a.finish));
  const bdur = (a: Activity) => Math.max(1, diff(a.baselineStart, a.baselineFinish));
  const td = S.reduce((s, a) => s + dur(a), 0) || 1, tb = S.reduce((s, a) => s + bdur(a), 0) || 1;
  const pct = (a: Activity, at: string, base: boolean) => {
    const s = base ? a.baselineStart : a.start, f = base ? a.baselineFinish : a.finish, d = base ? bdur(a) : dur(a);
    return f <= at ? 100 : s > at ? 0 : (diff(s, at) / d) * 100;
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const at = (date: string) => ({ planned: r1(S.reduce((s, a) => s + bdur(a) * pct(a, date, true), 0) / tb), forecast: r1(S.reduce((s, a) => s + dur(a) * pct(a, date, false), 0) / td) });
  const points: { date: string; planned: number; actual: number | null; forecast: number; today?: boolean }[] = [];
  const start = db.data.meta.startDate.slice(0, 7), end = db.data.meta.completionDate.slice(0, 7);
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const v = at(date);
    points.push({ date, planned: v.planned, actual: date <= d0 ? v.forecast : null, forecast: v.forecast });
    m++; if (m > 12) { m = 1; y++; }
  }
  const earnedNow = r1(S.reduce((s, a) => s + dur(a) * a.percent, 0) / td);
  points.push({ date: d0, planned: at(d0).planned, actual: earnedNow, forecast: earnedNow, today: true });
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
