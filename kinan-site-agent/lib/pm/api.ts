// The schedule agent's view of the programme, in one place for the UI, the agent's tools and the API: where the
// programme came from, when it will finish (three ways), how sound it is (DCMA), what changed since the last update,
// what the site says against P6, how to recover, the critical path, and what is waiting to go back to P6. Also
// bringing a programme in — an XER, or P6 itself — keeping the previous one to compare against.
import type { Activity, Db } from "../types";
import { resolveLocation } from "../core/query";
import { completionOf, cpm, drivingPath, network } from "./cpm";
import { forecast } from "./forecast";
import { dcma } from "./health";
import { compareUpdates, demoPrevious, fieldCheck, takeSnapshot } from "./compare";
import { recoveryOptions } from "./recovery";
import { p6Config } from "./p6";
import { siteActions } from "../site/api";

export function programmeState(db: Db) {
  const s = db.data.schedule, date = db.data.meta.dataDate, done = completionOf(s);
  const net = network(s, date), r = cpm(net);
  const prev = [...(db.scheduleSnapshots ?? [])].reverse().find((x) => x.dataDate < date);
  const source = db.data.programmeSource ?? { kind: "demo" as const, name: "Kinan Heights master programme (demo)", at: `${date}T06:00:00.000Z` };
  const previous = prev ?? (source.kind === "demo" ? demoPrevious(s, date) : null);
  const by = new Map(s.map((a) => [a.id, a]));
  const path = drivingPath(net, r, done, 24).map((id) => { const a = by.get(id)!; return { id, name: a.name, start: a.start, finish: a.finish, float: r.tf.get(id) ?? 0, status: a.status }; });
  return {
    source, dataDate: date, activities: s.length, completionId: done,
    forecast: forecast(s, date, done),
    health: dcma(s, date, done),
    compare: previous ? { ...compareUpdates(previous, s, date, r.critical), source: previous.source } : null,
    fieldGaps: fieldCheck(db, s),
    recovery: recoveryOptions(s, date, done),
    critical: { count: r.critical.size, path, loops: r.loops.slice(0, 20) },
    outbox: [...(db.p6Outbox ?? [])].reverse().slice(0, 80),
    p6: { connected: !!p6Config() },
    // the proposals the orchestrator made from this (lib/site/orchestrator.ts §7–8), to approve from the tab
    proposals: siteActions(db).filter((a) => a.kind === "recovery_option" || a.kind === "p6_progress").map((a) => ({ key: `site|${a.id}`, id: a.id, kind: a.kind, activityId: a.targets.activityId, title: a.title, risk: a.risk, cost: a.cost })),
  };
}
export type ProgrammeState = ReturnType<typeof programmeState>;

/** Replace the programme with one from P6 (an XER or the API): the current one is kept as the previous update. */
export function importProgramme(db: Db, p: { activities: Activity[]; dataDate: string; kind: "xer" | "p6-api"; name: string; projectId?: string }) {
  takeSnapshot(db, db.data.programmeSource ? `${db.data.programmeSource.name ?? db.data.programmeSource.kind} (${db.data.meta.dataDate})` : `demo programme (${db.data.meta.dataDate})`);
  let unmapped = 0;
  for (const a of p.activities) {
    if (a.locationId !== "site") continue;
    // the location from the leading words of the name ("Tower A L13 slab…"), as the CSV import does
    const words = a.name.replace(/[—–-].*$/, "").split(/\s+/);
    let loc;
    for (let n = Math.min(4, words.length); n >= 1 && !loc; n--) loc = resolveLocation(db, words.slice(0, n).join(" "));
    if (loc) a.locationId = loc.id; else unmapped++;
  }
  db.data.schedule = p.activities;
  db.data.meta.dataDate = p.dataDate;
  db.data.meta.fixed = true; // a real programme: stop moving the demo data with the calendar
  db.data.siteReports = [];
  db.data.programmeSource = { kind: p.kind, name: p.name, at: new Date().toISOString(), ...(p.projectId ? { projectId: p.projectId } : {}) };
  takeSnapshot(db, p.name);
  const done = completionOf(p.activities);
  return { imported: p.activities.length, dataDate: p.dataDate, unmappedLocations: unmapped, completion: by(p.activities, done)?.finish, completionId: done };
}
const by = (xs: Activity[], id: string) => xs.find((a) => a.id === id);
