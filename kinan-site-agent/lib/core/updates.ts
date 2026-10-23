import type { Activity, Db, ProgressUpdate, ProjectData } from "../types";
import { locationPath, score, terms } from "./query";

/**
 * Progress reported from site. Each update is stored on db.data.updates and applied on top of the programme,
 * so it survives the daily roll (the demo programme is rebuilt for each new day, then the updates are re-applied).
 */

import { addDays, daysBetween } from "../data/util";

/** Apply one update to its activity. */
function applyOne(a: Activity, u: ProgressUpdate) {
  if (u.state === "completed") {
    a.status = "completed"; a.percent = 100;
    if (a.finish > u.date) a.finish = u.date;           // finished early: actual finish is the report day
    if (a.start > u.date) a.start = u.date;
  } else if (u.state === "in_progress") {
    const pct = Math.max(1, Math.min(99, Math.round(u.percent ?? a.percent ?? 1)));
    a.status = "in_progress"; a.percent = Math.max(pct, 1);
    if (a.start > u.date) a.start = u.date;              // started early
    if (a.finish <= u.date) a.finish = addDays(u.date, 1); // still open after its planned finish: forecast moves out
  } else if (a.status === "completed" && a.finish >= u.date) {
    // "pending" on something the programme assumed done: it isn't — reopen it at the reported percent
    a.status = "in_progress"; a.percent = Math.max(1, Math.min(99, Math.round(u.percent ?? 90))); a.finish = addDays(u.date, 1);
  } else if (u.percent !== undefined && a.status !== "completed") {
    a.percent = Math.max(1, Math.min(99, Math.round(u.percent))); a.status = "in_progress";
  }
}

/**
 * A delay flows down the programme: when an activity now finishes later, the work that follows it (not started yet)
 * moves by the same amount, less any gap it already had after that activity — so overlaps and lags in the programme
 * are kept, and practical completion moves when the delay reaches it. Earlier finishes do not pull work forward (that
 * is a planning decision). Float goes down by the delay; an activity with no float left is critical. Returns the ids
 * that moved.
 */
export function pushSuccessors(schedule: Activity[], moved: { id: string; oldFinish: string }[]): string[] {
  const by = new Map(schedule.map((a) => [a.id, a]));
  const next = new Map<string, Activity[]>();
  for (const a of schedule) for (const p of a.predecessors) { if (!next.has(p)) next.set(p, []); next.get(p)!.push(a); }
  const queue = [...moved], out = new Set<string>();
  for (let guard = 0; queue.length && guard < 20_000; guard++) {
    const { id, oldFinish } = queue.shift()!;
    const p = by.get(id);
    if (!p) continue;
    const delay = daysBetween(oldFinish, p.finish);
    if (delay <= 0) continue;
    for (const s of next.get(id) ?? []) {
      if (s.status !== "not_started") continue;
      const push = delay - Math.max(0, daysBetween(oldFinish, s.start));
      if (push <= 0) continue;
      const was = s.finish;
      s.start = addDays(s.start, push); s.finish = addDays(s.finish, push);
      s.totalFloat -= push; if (s.totalFloat <= 0) s.critical = true;
      out.add(s.id);
      queue.push({ id: s.id, oldFinish: was });
    }
  }
  return [...out];
}
/** Apply a change to one activity, then let a later finish flow to the work after it. */
export function moveActivity(schedule: Activity[], a: Activity, change: () => void): string[] {
  const oldFinish = a.finish;
  change();
  const delay = daysBetween(oldFinish, a.finish);
  if (delay > 0) { a.totalFloat -= delay; if (a.totalFloat <= 0) a.critical = true; }
  return pushSuccessors(schedule, [{ id: a.id, oldFinish }]);
}
/** The forecast of practical completion (the completion milestone, else the last finish). */
export const completionDate = (data: ProjectData) => data.schedule.find((a) => a.id === "M-990")?.finish ?? data.schedule.reduce((m, a) => (a.finish > m ? a.finish : m), "");

/** Re-apply one stored update. Used after the daily roll rebuilds the programme (lib/data: in time order, with the approvals). */
export function applyUpdate(data: ProjectData, u: ProgressUpdate) {
  const a = data.schedule.find((x) => x.id === u.activityId);
  if (a) moveActivity(data.schedule, a, () => applyOne(a, u));
}

/** Find the activity a site message is about: an exact id, else the best match on name + place. */
export function findActivity(db: Db, q: string): { activity?: Activity; candidates: Activity[] } {
  const s = q.trim();
  const sched = db.data.schedule;
  const exact = sched.find((a) => a.id.toLowerCase() === s.toLowerCase());
  if (exact) return { activity: exact, candidates: [exact] };
  // "L14" ↔ "Level 14", drop punctuation and filler words
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\blevel\s*(\d+)/g, "l$1").replace(/\bl\s+(\d+)/g, "l$1")
    .replace(/\b(tower|block|building|bldg|hotel|villa|zone|core|lift|crane|tc|gate|podium)\s*-?\s*([a-z]|\d+)\b/g, "$1$2").replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ");
  const t = terms(norm(s)).filter((w) => !["the", "and", "of", "mark", "as", "completed", "complete", "done", "is", "on", "at", "for"].includes(w));
  if (!t.length) return { candidates: [] };
  const scored = sched.map((a) => ({ a, sc: score(t, norm(`${a.id} ${a.wbs} ${a.trade} ${locationPath(db, a.locationId)}`), norm(`${a.id} ${a.name}`)) }))
    .filter((x) => x.sc > 0).sort((x, y) => y.sc - x.sc || Number(x.a.status === "completed") - Number(y.a.status === "completed"));
  if (!scored.length) return { candidates: [] };
  const top = scored[0].sc;
  const best = scored.filter((x) => x.sc === top).map((x) => x.a);
  // clear winner: alone at the top, or well ahead of the next one
  if (best.length === 1 && (scored.length === 1 || top >= scored[1].sc + 2 || top >= t.length * 2)) return { activity: best[0], candidates: best };
  return { candidates: scored.slice(0, 5).map((x) => x.a) };
}

export function recordUpdate(db: Db, a: Activity, o: { state: ProgressUpdate["state"]; percent?: number; note?: string; evidence?: string[]; by: string; channel: ProgressUpdate["channel"]; id: string }): ProgressUpdate {
  const u: ProgressUpdate = {
    id: o.id, activityId: a.id, at: new Date().toISOString(), date: db.data.meta.dataDate, by: o.by, channel: o.channel, state: o.state,
    ...(o.percent !== undefined ? { percent: o.percent } : {}), ...(o.note ? { note: o.note } : {}),
    evidence: o.evidence ?? [], before: { status: a.status, percent: a.percent, start: a.start, finish: a.finish },
  };
  moveActivity(db.data.schedule, a, () => applyOne(a, u));
  (db.data.updates ??= []).unshift(u);
  db.data.updates = db.data.updates.slice(0, 2000);
  // evidence files live where the work is, and are tagged to the activity
  for (const id of u.evidence) {
    const d = db.docs.find((x) => x.id === id);
    if (!d) continue;
    d.locationId = a.locationId;
    d.tags = [...new Set([...(d.tags ?? []), "evidence", `activity:${a.id}`, o.state])];
    if (!/evidence/i.test(d.summary ?? "")) d.summary = `Evidence — ${a.id} ${a.name} (${o.state === "completed" ? "done" : o.state === "pending" ? "pending" : `${a.percent}%`}). ${d.summary ?? ""}`.slice(0, 300);
  }
  return u;
}

export function updatesFor(db: Db, activityId: string) {
  return (db.data.updates ?? []).filter((u) => u.activityId === activityId).map((u) => ({
    at: u.at.slice(0, 16).replace("T", " "), by: u.by, via: u.channel, state: u.state, percent: u.percent, note: u.note,
    evidence: u.evidence.map((id) => { const d = db.docs.find((x) => x.id === id); return d ? { docId: id, title: d.title } : { docId: id }; }),
  }));
}
