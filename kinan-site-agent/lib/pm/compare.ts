// What changed between two P6 updates — the review a planning manager does every week, done every time: how far
// completion moved and what moved it, durations cut on the critical path (recovery on paper), relationships deleted,
// baseline dates changed, activities added or deleted, constraints added, progress claimed. Then what P6 says against
// what the site reported (photos and messages): progress P6 shows that nobody on site has reported, and reports P6
// doesn't reflect. Each finding with its activities, so it can be put to the planner.
import type { Activity, Db } from "../types";
import { days, plus } from "./cpm";

export interface SnapAct { id: string; name: string; s: string; f: string; bs: string; bf: string; pct: number; st: Activity["status"]; rels: string; cst?: string }
export interface Snapshot { at: string; dataDate: string; source: string; completion: string; acts: SnapAct[] }

const relKey = (a: Activity) => (a.rels ?? a.predecessors.map((id) => ({ id, type: "FS" as const, lag: 0 }))).map((r) => `${r.id}:${r.type}:${r.lag}`).sort().join(";");
export const snapOf = (a: Activity): SnapAct => ({ id: a.id, name: a.name, s: a.start, f: a.finish, bs: a.baselineStart, bf: a.baselineFinish, pct: a.percent, st: a.status, rels: relKey(a), ...(a.constraint ? { cst: `${a.constraint.type} ${a.constraint.date}` } : {}) });
const completionOf = (acts: { id: string; f: string }[]) => acts.find((a) => a.id === "M-990")?.f ?? acts.reduce((m, a) => (a.f > m ? a.f : m), "");

/** Keep the programme as it stands (after an import or a sync from P6); the last six are kept. */
export function takeSnapshot(db: Db, source: string): Snapshot {
  const acts = db.data.schedule.map(snapOf);
  const snap: Snapshot = { at: new Date().toISOString(), dataDate: db.data.meta.dataDate, source, completion: completionOf(acts), acts };
  db.scheduleSnapshots = [...(db.scheduleSnapshots ?? []).filter((x) => x.dataDate !== snap.dataDate), snap].slice(-6);
  return snap;
}

/** The demo's previous weekly update (no real one yet): last week's programme as the planner had it — completion nine
 *  days earlier, the critical slabs a few days earlier, the lifts' duration longer (cut this week), one relationship
 *  that has since been deleted, one baseline date since changed, one activity added this week. */
export function demoPrevious(schedule: Activity[], dataDate: string): Snapshot {
  const prev = schedule.map(snapOf).map((x) => ({ ...x }));
  const by = new Map(prev.map((x) => [x.id, x]));
  const shift = (id: string, d: number, field: "f" | "s" | "both" = "both") => { const x = by.get(id); if (!x) return; if (field !== "s") x.f = plus(x.f, d); if (field !== "f") x.s = plus(x.s, d); };
  for (const id of ["TA-STR-L16", "TA-STR-L17", "TA-STR-L18", "TA-STR-L19", "TA-STR-L20"]) shift(id, -4);
  shift("TA-LIFT", 12, "f"); // the lift installation was 12 days longer last week
  for (const id of ["TA-TC", "TA-M20", "M-900", "M-990"]) shift(id, -9);
  const tb = prev.find((x) => x.st === "not_started" && x.id.startsWith("TB-") && x.rels);
  if (tb) tb.rels = `${tb.rels};TB-M10:FS:0`.replace(/^;/, ""); // a relationship deleted since
  const hc = prev.find((x) => x.id.startsWith("HC-") && x.st === "not_started");
  if (hc) hc.bf = plus(hc.bf, -14); // its baseline finish was 14 days earlier
  for (const x of prev) if (x.st === "in_progress") x.pct = Math.max(0, x.pct - 6);
  const added = prev.filter((x) => x.st === "not_started" && !x.id.startsWith("M-") && !x.id.endsWith("-HO") && x.rels).slice(-1)[0];
  const acts = prev.filter((x) => x !== added);
  return { at: plus(dataDate, -7) + "T06:00:00.000Z", dataDate: plus(dataDate, -7), source: "previous update (demo)", completion: completionOf(acts), acts };
}

export interface Finding { kind: "completion" | "slip" | "duration_cut" | "logic_removed" | "logic_added" | "baseline_changed" | "added" | "deleted" | "constraint" | "progress"; severity: "high" | "medium" | "low"; text: string; ids: string[] }

export function compareUpdates(prev: Snapshot, cur: Activity[], dataDate: string, critical: Set<string>): { from: string; to: string; completionMove: number; findings: Finding[] } {
  const p = new Map(prev.acts.map((x) => [x.id, x])), c = new Map(cur.map((a) => [a.id, a]));
  const out: Finding[] = [];
  const curDone = completionOf(cur.map(snapOf));
  const move = days(prev.completion, curDone);
  if (move) out.push({ kind: "completion", severity: move > 0 ? "high" : "low", text: `Practical completion moved ${move > 0 ? "+" : ""}${move} days: ${prev.completion} → ${curDone}.`, ids: ["M-990"] });
  const slips = cur.filter((a) => a.status !== "completed" && p.has(a.id)).map((a) => ({ a, d: days(p.get(a.id)!.f, a.finish) })).filter((x) => x.d >= 3).sort((x, y) => y.d - x.d);
  const critSlips = slips.filter((x) => critical.has(x.a.id));
  if (critSlips.length) out.push({ kind: "slip", severity: "high", text: `${critSlips.length} critical activit${critSlips.length > 1 ? "ies" : "y"} slipped this update — most: ${critSlips.slice(0, 3).map((x) => `${x.a.id} +${x.d} d`).join(", ")}.`, ids: critSlips.map((x) => x.a.id) });
  if (slips.length > critSlips.length) out.push({ kind: "slip", severity: "medium", text: `${slips.length - critSlips.length} other activities slipped 3 days or more.`, ids: slips.filter((x) => !critical.has(x.a.id)).map((x) => x.a.id) });
  // remaining duration cut without the progress to show for it: recovery on paper
  const cuts = cur.filter((a) => a.status !== "completed" && !a.milestone && p.has(a.id)).map((a) => {
    const x = p.get(a.id)!, before = days(a.status === "in_progress" ? prev.dataDate : x.s, x.f), now = days(a.status === "in_progress" ? dataDate : a.start, a.finish);
    return { a, cut: before - now - (a.status === "in_progress" ? days(prev.dataDate, dataDate) : 0), progress: a.percent - x.pct };
  }).filter((x) => x.cut >= 5 && x.progress < 15);
  for (const x of cuts.filter((y) => critical.has(y.a.id))) out.push({ kind: "duration_cut", severity: "high", text: `${x.a.id} ${x.a.name}: ${x.cut} days taken off its duration on the critical path, with ${Math.max(0, x.progress)} points of progress — is the recovery real (more crews, a new method) or only on paper?`, ids: [x.a.id] });
  if (cuts.some((y) => !critical.has(y.a.id))) out.push({ kind: "duration_cut", severity: "medium", text: `${cuts.filter((y) => !critical.has(y.a.id)).length} other durations cut by 5 days or more without matching progress.`, ids: cuts.filter((y) => !critical.has(y.a.id)).map((y) => y.a.id) });
  // logic
  for (const a of cur) {
    const x = p.get(a.id); if (!x) continue;
    const before = new Set(x.rels.split(";").filter(Boolean).map((r) => r.split(":")[0])), now = new Set(relKey(a).split(";").filter(Boolean).map((r) => r.split(":")[0]));
    const gone = [...before].filter((id) => !now.has(id));
    if (gone.length) out.push({ kind: "logic_removed", severity: critical.has(a.id) || a.totalFloat < 10 ? "high" : "medium", text: `${a.id}: relationship${gone.length > 1 ? "s" : ""} from ${gone.join(", ")} deleted — check the work really no longer waits for ${gone.length > 1 ? "them" : "it"}.`, ids: [a.id, ...gone] });
    if (x.bf !== a.baselineFinish || x.bs !== a.baselineStart) out.push({ kind: "baseline_changed", severity: "high", text: `${a.id}: its baseline changed (${x.bf} → ${a.baselineFinish}). Baselines move only with an approved change.`, ids: [a.id] });
    const cst = a.constraint ? `${a.constraint.type} ${a.constraint.date}` : undefined;
    if (cst && cst !== x.cst) out.push({ kind: "constraint", severity: "medium", text: `${a.id}: constraint ${cst} added — it overrides the logic.`, ids: [a.id] });
  }
  const added = cur.filter((a) => !p.has(a.id)), deleted = prev.acts.filter((x) => !c.has(x.id));
  if (added.length) out.push({ kind: "added", severity: "low", text: `${added.length} activit${added.length > 1 ? "ies" : "y"} added: ${added.slice(0, 4).map((a) => a.id).join(", ")}.`, ids: added.map((a) => a.id) });
  if (deleted.length) out.push({ kind: "deleted", severity: "medium", text: `${deleted.length} activit${deleted.length > 1 ? "ies" : "y"} deleted: ${deleted.slice(0, 4).map((x) => x.id).join(", ")}.`, ids: deleted.map((x) => x.id) });
  const rank = { high: 0, medium: 1, low: 2 };
  return { from: prev.dataDate, to: dataDate, completionMove: move, findings: out.sort((a, b) => rank[a.severity] - rank[b.severity]) };
}

export interface FieldGap { id: string; name: string; p6: { status: Activity["status"]; percent: number }; site: { state: string; percent?: number; date: string; by: string; photos: number }; text: string }

/** P6's progress against what the site reported: the latest report on each activity reported since the last update. */
export function fieldCheck(db: Db, p6: Activity[]): FieldGap[] {
  const latest = new Map<string, NonNullable<Db["data"]["updates"]>[number]>();
  for (const u of db.data.updates ?? []) { const x = latest.get(u.activityId); if (!x || u.at > x.at) latest.set(u.activityId, u); }
  const out: FieldGap[] = [];
  // the demo's site reports of the last day (not in P6 yet), unless a person has reported on the activity since
  for (const u of db.data.siteReports ?? []) if (!latest.has(u.activityId)) latest.set(u.activityId, u);
  for (const [id, u] of latest) {
    const a = p6.find((x) => x.id === id); if (!a) continue;
    const sitePct = u.state === "completed" ? 100 : u.percent;
    const site = { state: u.state, ...(sitePct !== undefined ? { percent: sitePct } : {}), date: u.date, by: u.by, photos: u.evidence?.length ?? 0 };
    let text = "";
    if (a.status === "completed" && u.state !== "completed") text = `P6 shows it complete; the site reported it ${u.state === "pending" ? "still open" : `at ${sitePct ?? "?"} %`} on ${u.date}.`;
    else if (u.state === "completed" && a.status !== "completed") text = `The site reported it finished on ${u.date}; P6 still shows ${a.percent} %.`;
    else if (sitePct !== undefined && Math.abs(sitePct - a.percent) >= 15) text = `P6 shows ${a.percent} %; the site reported ${sitePct} % on ${u.date}.`;
    else if (u.state === "pending" && a.status === "in_progress") text = `The site reported it blocked on ${u.date}${u.note ? ` (“${u.note}”)` : ""}; P6 has it progressing (${a.percent} %).`;
    else if (u.state === "in_progress" && a.status === "not_started") text = `The site reported it started on ${u.date} (${sitePct ?? "?"} %); P6 shows it not started until ${a.start}.`;
    if (text) out.push({ id, name: a.name, p6: { status: a.status, percent: a.percent }, site, text });
  }
  return out;
}
