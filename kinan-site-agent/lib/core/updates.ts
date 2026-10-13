import type { Activity, Db, ProgressUpdate, ProjectData } from "../types";
import { locationPath, score, terms } from "./query";

/**
 * Progress reported from site. Each update is stored on db.data.updates and applied on top of the programme,
 * so it survives the daily roll (the demo programme is rebuilt for each new day, then the updates are re-applied).
 */

const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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

/** Re-apply every stored update (oldest first). Used after the daily roll rebuilds the programme. */
export function applyUpdates(data: ProjectData) {
  if (!data.updates?.length) return;
  const byId = new Map(data.schedule.map((a) => [a.id, a]));
  for (const u of [...data.updates].sort((x, y) => x.at.localeCompare(y.at))) { const a = byId.get(u.activityId); if (a) applyOne(a, u); }
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
  applyOne(a, u);
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
