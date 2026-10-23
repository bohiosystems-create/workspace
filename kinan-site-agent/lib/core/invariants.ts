// The programme's rules, checked after every change (a progress report, an approved proposal) and by the tests:
// - every activity is self-consistent (0–100 %, completed means 100 %, not started means 0 %, start before finish);
// - no work that has not started is moved closer to what it depends on than the programme had it (a link that had a
//   gap still has one; an overlap the programme planned does not get bigger);
// - practical completion never comes earlier because something else slipped (earlier finishes do not pull work in);
// - rebuilding the day from the base data (the daily roll) gives back the same programme: reported progress and
//   approved changes stay in place.
// A broken rule is a bug in our code, not in the user's data: it is logged, and the tests fail on it.
import type { Activity, ProjectData } from "../types";
import { daysBetween } from "../data/util";
import { completionDate } from "./updates";

export interface ProgrammeShot { gaps: Map<string, number>; completion: string }

/** What the rules compare against: every link's gap (successor start − predecessor finish) and the completion date. */
export function shot(data: ProjectData): ProgrammeShot {
  const by = new Map(data.schedule.map((a) => [a.id, a]));
  const gaps = new Map<string, number>();
  for (const s of data.schedule) for (const id of s.predecessors) { const p = by.get(id); if (p) gaps.set(`${id}>${s.id}`, daysBetween(p.finish, s.start)); }
  return { gaps, completion: completionDate(data) };
}

function own(a: Activity): string | null {
  if (!(a.percent >= 0 && a.percent <= 100)) return `${a.id} is at ${a.percent}%`;
  if (a.status === "completed" && a.percent !== 100) return `${a.id} is completed at ${a.percent}%`;
  if (a.status === "not_started" && a.percent !== 0) return `${a.id} is not started at ${a.percent}%`;
  if (a.status === "in_progress" && (a.percent < 1 || a.percent > 99)) return `${a.id} is in progress at ${a.percent}%`;
  if (a.start > a.finish) return `${a.id} starts ${a.start} after it finishes ${a.finish}`;
  return null;
}

/** The rules after a change; `before` is the shot taken just before it. Returns what is broken (empty: all good). */
export function checkProgramme(data: ProjectData, before?: ProgrammeShot): string[] {
  const out: string[] = [];
  for (const a of data.schedule) { const e = own(a); if (e) out.push(e); }
  if (before) {
    const by = new Map(data.schedule.map((a) => [a.id, a]));
    for (const [k, gap] of shot(data).gaps) {
      const was = before.gaps.get(k);
      const s = by.get(k.split(">")[1]);
      if (was === undefined || !s || s.status !== "not_started") continue;
      if (was >= 0 ? gap < 0 : gap < was) out.push(`${k.replace(">", " → ")}: gap ${was} → ${gap} days (moved closer than the programme allows)`);
    }
    const pc = completionDate(data);
    if (pc < before.completion) out.push(`practical completion came earlier: ${before.completion} → ${pc}`);
  }
  return out;
}

/** Rebuild today's programme the way the daily roll does, and list what came back different. */
export async function checkReplay(data: ProjectData): Promise<string[]> {
  const { rollToToday } = await import("../data");
  const copy = structuredClone(data);
  const date = copy.meta.dataDate;
  copy.meta.dataDate = "1970-01-01"; // force the roll back onto the same day
  const fresh = rollToToday(copy, date);
  if (!fresh) return [];
  const by = new Map(fresh.schedule.map((a) => [a.id, a]));
  const out: string[] = [];
  for (const a of data.schedule) {
    const b = by.get(a.id);
    if (!b) { out.push(`${a.id} is gone after the roll`); continue; }
    for (const f of ["status", "percent", "start", "finish"] as const) if (a[f] !== b[f]) out.push(`${a.id}.${f}: ${a[f]} → ${b[f]} after the roll`);
  }
  const ids = (d: ProjectData) => new Set(d.procurement.requests.map((r) => `${r.id}:${r.status}`));
  const ra = ids(data), rb = ids(fresh);
  for (const k of ra) if (!rb.has(k)) out.push(`material request ${k} changed after the roll`);
  return out;
}

/** After a change in the running app: log a broken rule (it is a bug to fix), never block the user. */
export function guard(where: string, data: ProjectData, before: ProgrammeShot) {
  const bad = checkProgramme(data, before);
  if (bad.length) console.error(`[programme rules] after ${where}: ${bad.slice(0, 5).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ""}`);
  return bad;
}
