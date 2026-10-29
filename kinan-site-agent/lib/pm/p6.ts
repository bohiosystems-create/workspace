// The way back into Primavera P6. What the agent learns on site (progress reported with photos) and what the planning
// manager approves (a recovery option: a shorter duration, an overlap, a shorter lag) is queued here as a change to
// P6 — the outbox — and sent one of three ways:
//   - the P6 EPPM REST API (env P6 = {"url","user","password","projectObjectId"}): progress and remaining durations are
//     written to the activity (PUT /activity); relationship changes are written to /relationship. Built to Oracle's
//     published P6 EPPM REST reference; not yet run against a live P6 — test it on a copy of the project first.
//   - an XER of the programme as it now stands (lib/pm/xer.ts), for File → Import, "update existing project";
//   - a CSV of the changes, one row each, for the planner to key in or load through P6's spreadsheet import.
// Nothing reaches P6 without a person: progress is queued when someone puts it in P6 from the agent, recovery changes
// when a manager approves them.
import type { Activity, Db } from "../types";

export interface P6Change {
  id: string; at: string; by?: string;
  activityId: string; p6TaskId?: string;
  kind: "progress" | "duration" | "relationship";
  /** the P6 fields, as P6 names them (PercentComplete, ActualStartDate, SuspendDate, RemainingDuration in days, PredecessorActivityId, Type, Lag in days) */
  fields: Record<string, string | number>;
  reason: string;
  status: "pending" | "sent" | "failed";
  note?: string;
  /** the approved proposal or site report it came from */
  from?: string;
}

export function queueChange(db: Db, c: Omit<P6Change, "id" | "at" | "status">): P6Change {
  const out = (db.p6Outbox ??= []);
  // a newer change of the same kind to the same activity (and predecessor) replaces a pending one
  const same = (x: P6Change) => x.status === "pending" && x.activityId === c.activityId && x.kind === c.kind && x.fields.PredecessorActivityId === c.fields.PredecessorActivityId;
  const keep = out.filter((x) => !same(x));
  const p6TaskId = c.p6TaskId ?? db.data.schedule.find((a) => a.id === c.activityId)?.p6?.objectId;
  const ch: P6Change = { id: `p6_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), status: "pending", ...c, ...(p6TaskId ? { p6TaskId } : {}) };
  db.p6Outbox = [...keep, ch].slice(-300);
  return ch;
}

/** The site's progress as a P6 change (the fields P6's progress update takes). */
export function progressChange(a: Activity, site: { state: string; percent?: number; date: string }, dataDate: string): Pick<P6Change, "activityId" | "kind" | "fields"> {
  // blocked: suspended in P6 from the day it stopped (its progress stays as it is)
  if (site.state === "pending") return { activityId: a.id, kind: "progress", fields: { SuspendDate: site.date } };
  const pct = site.state === "completed" ? 100 : site.percent ?? a.percent;
  const fields: P6Change["fields"] = { PercentComplete: pct };
  if (a.status === "not_started" && pct > 0) fields.ActualStartDate = site.date;
  if (pct >= 100) { fields.ActualFinishDate = site.date; fields.Status = "Completed"; }
  else if (pct > 0) {
    fields.Status = "In Progress";
    // remaining duration at the rate so far, from the data date
    const doneDays = Math.max(1, Math.round((Date.parse(dataDate) - Date.parse(fields.ActualStartDate ? site.date : a.start)) / 86_400_000) + 1);
    fields.RemainingDuration = Math.max(1, Math.round((doneDays * (100 - pct)) / Math.max(1, pct)));
  }
  return { activityId: a.id, kind: "progress", fields };
}

// ------------------------------------------------------------------ CSV
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function outboxCsv(changes: P6Change[]): string {
  const head = ["Activity ID", "Change", "Percent Complete", "Actual Start", "Actual Finish", "Remaining Duration (d)", "Suspend Date", "Predecessor", "Relationship Type", "Lag (d)", "Reason", "Queued", "By", "Status"];
  const rows = changes.map((c) => [c.activityId, c.kind, c.fields.PercentComplete, c.fields.ActualStartDate, c.fields.ActualFinishDate, c.fields.RemainingDuration, c.fields.SuspendDate, c.fields.PredecessorActivityId, c.fields.Type, c.fields.Lag, c.reason, c.at.slice(0, 16).replace("T", " "), c.by, c.status]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

// ------------------------------------------------------------------ P6 EPPM REST
export interface P6Config { url: string; user: string; password: string; projectObjectId: string; database?: string }
export function p6Config(): P6Config | null {
  try {
    const c = JSON.parse(process.env.P6 ?? "null") as Partial<P6Config> | null;
    return c?.url && c.user && c.password && c.projectObjectId ? { url: c.url.replace(/\/+$/, ""), user: c.user, password: c.password, projectObjectId: String(c.projectObjectId), database: c.database } : null;
  } catch { return null; }
}

const REL_TYPE = { FS: "Finish to Start", SS: "Start to Start", FF: "Finish to Finish", SF: "Start to Finish" } as const;
const REL_BACK: Record<string, "FS" | "SS" | "FF" | "SF"> = { "Finish to Start": "FS", "Start to Start": "SS", "Finish to Finish": "FF", "Start to Finish": "SF" };
const CSTR_BACK: Record<string, NonNullable<Activity["constraint"]>["type"]> = { "Start On or After": "SNET", "Start On or Before": "SNLT", "Finish On or After": "FNET", "Finish On or Before": "FNLT", "Mandatory Start": "MSO", "Mandatory Finish": "MFO" };
const HOURS = 8; // P6's REST durations are in hours; days of 8 h (the project calendar's, when the API gives it)

async function call(c: P6Config, path: string, init: RequestInit = {}): Promise<unknown> {
  const auth = "Basic " + btoa(`${c.user}:${c.password}`);
  const res = await fetch(`${c.url}/p6ws/restapi${path}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json", ...(c.database ? { DatabaseName: c.database } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`P6 ${init.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

const ACT_FIELDS = ["ObjectId", "Id", "Name", "Status", "PercentComplete", "StartDate", "FinishDate", "ActualStartDate", "ActualFinishDate", "BaselineStartDate", "BaselineFinishDate", "PlannedStartDate", "PlannedFinishDate", "RemainingDuration", "TotalFloat", "Type", "PrimaryConstraintType", "PrimaryConstraintDate", "WBSCode"];

/** The programme from P6: activities with their progress and dates, and their relationships. */
export async function readP6(c: P6Config): Promise<{ dataDate: string; activities: Activity[] }> {
  const q = (o: string, fields: string[]) => `/${o}?Fields=${fields.join(",")}&Filter=${encodeURIComponent(`ProjectObjectId = ${c.projectObjectId}`)}`;
  const proj = (await call(c, `/project?Fields=ObjectId,DataDate&Filter=${encodeURIComponent(`ObjectId = ${c.projectObjectId}`)}`)) as { DataDate?: string }[];
  const acts = (await call(c, q("activity", ACT_FIELDS))) as Record<string, string | number>[];
  const rels = (await call(c, q("relationship", ["PredecessorActivityObjectId", "SuccessorActivityObjectId", "Type", "Lag"]))) as Record<string, string | number>[];
  const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
  const dataDate = d(proj?.[0]?.DataDate) ?? new Date().toISOString().slice(0, 10);
  const idOf = new Map(acts.map((a) => [String(a.ObjectId), String(a.Id)]));
  const preds = new Map<string, NonNullable<Activity["rels"]>>();
  for (const r of rels) {
    const s = idOf.get(String(r.SuccessorActivityObjectId)), p = idOf.get(String(r.PredecessorActivityObjectId));
    if (s && p) (preds.get(s) ?? preds.set(s, []).get(s)!).push({ id: p, type: REL_BACK[String(r.Type)] ?? "FS", lag: Math.round(Number(r.Lag || 0) / HOURS) });
  }
  const activities = acts.map((a): Activity => {
    const status: Activity["status"] = a.Status === "Completed" ? "completed" : a.Status === "In Progress" ? "in_progress" : "not_started";
    const start = d(a.ActualStartDate) ?? d(a.StartDate) ?? dataDate, finish = d(a.ActualFinishDate) ?? d(a.FinishDate) ?? start;
    const ms = /Milestone/i.test(String(a.Type)), tf = Math.round(Number(a.TotalFloat || 0) / HOURS), r = preds.get(String(a.Id)) ?? [];
    const ct = CSTR_BACK[String(a.PrimaryConstraintType)], cd = d(a.PrimaryConstraintDate);
    return { id: String(a.Id), name: String(a.Name), wbs: String(a.WBSCode ?? ""), locationId: "site", trade: ms ? "Milestone" : "General", contractor: "",
      baselineStart: d(a.BaselineStartDate) ?? d(a.PlannedStartDate) ?? start, baselineFinish: d(a.BaselineFinishDate) ?? d(a.PlannedFinishDate) ?? finish, start, finish,
      percent: Math.round(Number(a.PercentComplete || 0) * (Number(a.PercentComplete) <= 1 ? 100 : 1)), status, critical: tf <= 0 && status !== "completed", totalFloat: tf,
      predecessors: r.map((x) => x.id), rels: r, milestone: ms, ...(ct && cd ? { constraint: { type: ct, date: cd } } : {}),
      ...(a.RemainingDuration !== undefined ? { remaining: Math.round(Number(a.RemainingDuration) / HOURS) } : {}), p6: { objectId: String(a.ObjectId) } };
  });
  return { dataDate, activities };
}

/** Send the pending changes. Progress and durations update the activity; a relationship change updates (or creates) the
 *  relationship. Each change is marked sent or failed with P6's answer. */
export async function sendOutbox(db: Db, c: P6Config): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  const objId = async (code: string, known?: string) => {
    if (known) return known;
    const r = (await call(c, `/activity?Fields=ObjectId&Filter=${encodeURIComponent(`ProjectObjectId = ${c.projectObjectId} and Id = '${code.replace(/'/g, "''")}'`)}`)) as { ObjectId: string | number }[];
    if (!r?.[0]) throw new Error(`No activity ${code} in the P6 project.`);
    return String(r[0].ObjectId);
  };
  for (const ch of (db.p6Outbox ?? []).filter((x) => x.status === "pending")) {
    try {
      const oid = await objId(ch.activityId, ch.p6TaskId);
      if (ch.kind === "relationship") {
        const pid = await objId(String(ch.fields.PredecessorActivityId));
        const existing = (await call(c, `/relationship?Fields=ObjectId&Filter=${encodeURIComponent(`SuccessorActivityObjectId = ${oid} and PredecessorActivityObjectId = ${pid}`)}`)) as { ObjectId: string | number }[];
        const body = { SuccessorActivityObjectId: oid, PredecessorActivityObjectId: pid, Type: REL_TYPE[ch.fields.Type as keyof typeof REL_TYPE] ?? String(ch.fields.Type), Lag: Number(ch.fields.Lag ?? 0) * HOURS };
        if (existing?.[0]) await call(c, "/relationship", { method: "PUT", body: JSON.stringify([{ ObjectId: existing[0].ObjectId, ...body }]) });
        else await call(c, "/relationship", { method: "POST", body: JSON.stringify([body]) });
      } else {
        const body: Record<string, string | number> = { ObjectId: oid };
        for (const [k, v] of Object.entries(ch.fields)) body[k] = k === "RemainingDuration" ? Number(v) * HOURS : k === "PercentComplete" ? Number(v) / 100 : /Date$/.test(k) ? `${v}T08:00:00` : v;
        await call(c, "/activity", { method: "PUT", body: JSON.stringify([body]) });
      }
      ch.status = "sent"; ch.note = `Sent ${new Date().toISOString().slice(0, 16).replace("T", " ")}`; sent++;
    } catch (e) { ch.status = "failed"; ch.note = (e as Error).message.slice(0, 200); failed++; }
  }
  return { sent, failed };
}
