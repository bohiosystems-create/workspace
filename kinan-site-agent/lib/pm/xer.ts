// Primavera P6's own export format, XER: the way every P6 user can hand over a programme (File → Export → Primavera
// PM, XER). Tab-separated tables: %T names a table, %F its fields, %R a row, %E the end. Read here: the project (its
// data date), the WBS, the activities (dates, status, % complete, remaining duration, float, constraints, type), their
// relationships (FS/SS/FF/SF with lags) and the calendars (hours per day, to turn P6's hour counts into days).
// Written here: an XER of the programme as it stands — with the field progress and the approved changes — for the
// planner to import into P6 ("update existing project"), when the P6 API isn't connected. Written to the XER layout
// P6 exports; a planner should open the first import in a copy of the project.
import type { Activity } from "../types";

type Row = Record<string, string>;
export type XerTables = Record<string, Row[]>;

export function parseXerTables(text: string): XerTables {
  const out: XerTables = {};
  let table = "", fields: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split("\t");
    if (cells[0] === "%T") { table = cells[1]?.trim() ?? ""; out[table] = []; fields = []; }
    else if (cells[0] === "%F") fields = cells.slice(1).map((f) => f.trim());
    else if (cells[0] === "%R" && table) out[table].push(Object.fromEntries(fields.map((f, i) => [f, (cells[i + 1] ?? "").trim()])));
  }
  return out;
}

const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined);
const REL: Record<string, "FS" | "SS" | "FF" | "SF"> = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const CSTR: Record<string, NonNullable<Activity["constraint"]>["type"]> = { CS_MSOA: "SNET", CS_MSOB: "SNLT", CS_MEOA: "FNET", CS_MEOB: "FNLT", CS_MSO: "MSO", CS_MEO: "MFO", CS_MANDSTART: "MSO", CS_MANDFIN: "MFO" };

export interface XerProject { id: string; code: string; name: string; dataDate: string; activities: Activity[]; warnings: string[] }

/** The programme in an XER: one project (the first, or the one asked for), its activities with their logic. */
export function readXer(text: string, projectCode?: string): XerProject {
  const t = parseXerTables(text);
  const projects = t.PROJECT ?? [];
  if (!projects.length || !t.TASK?.length) throw new Error("Not a P6 XER export with a project and activities (tables PROJECT and TASK).");
  const p = (projectCode && projects.find((x) => x.proj_short_name === projectCode || x.proj_id === projectCode)) || projects[0];
  const warnings: string[] = [];
  const hpd = new Map((t.CALENDAR ?? []).map((c) => [c.clndr_id, Number(c.day_hr_cnt) || 8]));
  const wbs = new Map((t.PROJWBS ?? []).filter((w) => w.proj_id === p.proj_id).map((w) => [w.wbs_id, w.wbs_short_name || w.wbs_name]));
  const tasks = (t.TASK ?? []).filter((x) => x.proj_id === p.proj_id);
  const code = new Map(tasks.map((x) => [x.task_id, x.task_code]));
  const preds = new Map<string, NonNullable<Activity["rels"]>>();
  for (const r of (t.TASKPRED ?? []).filter((x) => code.has(x.task_id) && code.has(x.pred_task_id))) {
    const succ = tasks.find((x) => x.task_id === r.task_id)!, h = hpd.get(succ.clndr_id) ?? 8;
    (preds.get(r.task_id) ?? preds.set(r.task_id, []).get(r.task_id)!).push({ id: code.get(r.pred_task_id)!, type: REL[r.pred_type] ?? "FS", lag: Math.round((Number(r.lag_hr_cnt) || 0) / h) });
  }
  const external = (t.TASKPRED ?? []).filter((x) => code.has(x.task_id) && !code.has(x.pred_task_id)).length;
  if (external) warnings.push(`${external} relationship(s) to other projects were left out.`);
  const rsrc = new Map((t.RSRC ?? []).map((r) => [r.rsrc_id, r.rsrc_short_name || r.rsrc_name]));
  const res = new Map<string, string[]>();
  for (const tr of t.TASKRSRC ?? []) if (code.has(tr.task_id)) (res.get(tr.task_id) ?? res.set(tr.task_id, []).get(tr.task_id)!).push(rsrc.get(tr.rsrc_id) ?? tr.rsrc_id);
  const dataDate = date(p.last_recalc_date) ?? date(p.next_data_date) ?? new Date().toISOString().slice(0, 10);
  const activities: Activity[] = tasks.map((x) => {
    const h = hpd.get(x.clndr_id) ?? 8;
    const status: Activity["status"] = x.status_code === "TK_Complete" ? "completed" : x.status_code === "TK_Active" ? "in_progress" : "not_started";
    const start = date(x.act_start_date) ?? date(x.restart_date) ?? date(x.early_start_date) ?? date(x.target_start_date) ?? dataDate;
    const finish = date(x.act_end_date) ?? date(x.reend_date) ?? date(x.early_end_date) ?? date(x.target_end_date) ?? start;
    const pct = Number(x.phys_complete_pct || x.complete_pct || 0) || (status === "completed" ? 100 : 0);
    const tf = x.total_float_hr_cnt !== undefined && x.total_float_hr_cnt !== "" ? Math.round(Number(x.total_float_hr_cnt) / h) : 0;
    const rels = preds.get(x.task_id) ?? [];
    const c = CSTR[x.cstr_type];
    return { id: x.task_code, name: x.task_name, wbs: wbs.get(x.wbs_id) ?? "", locationId: "site", trade: x.task_type === "TT_Mile" || x.task_type === "TT_FinMile" ? "Milestone" : "General",
      contractor: res.get(x.task_id)?.join(", ") ?? "", baselineStart: date(x.target_start_date) ?? start, baselineFinish: date(x.target_end_date) ?? finish, start, finish,
      percent: Math.max(0, Math.min(100, Math.round(pct))), status, critical: tf <= 0 && status !== "completed", totalFloat: tf, predecessors: rels.map((r) => r.id), rels,
      ...(c && date(x.cstr_date) ? { constraint: { type: c, date: date(x.cstr_date)! } } : {}),
      ...(x.remain_drtn_hr_cnt ? { remaining: Math.round(Number(x.remain_drtn_hr_cnt) / h) } : {}),
      milestone: x.task_type === "TT_Mile" || x.task_type === "TT_FinMile", p6: { taskId: x.task_id } };
  });
  return { id: p.proj_id, code: p.proj_short_name ?? p.proj_id, name: p.proj_short_name ?? "", dataDate, activities, warnings };
}

// ------------------------------------------------------------------ writing
const tsv = (xs: (string | number | undefined)[]) => xs.map((x) => String(x ?? "").replace(/[\t\r\n]/g, " ")).join("\t");
const dt = (d: string) => `${d} 08:00`;

/** An XER of the programme (one project, one 8-hour calendar): activities with their progress, dates and logic. */
export function writeXer(schedule: Activity[], o: { projectCode: string; dataDate: string; name?: string }): string {
  const H = 8, pid = "1", cid = "1";
  const wbsIds = new Map<string, string>();
  for (const a of schedule) if (!wbsIds.has(a.wbs || "-")) wbsIds.set(a.wbs || "-", String(100 + wbsIds.size));
  const tid = new Map(schedule.map((a, i) => [a.id, a.p6?.taskId ?? String(1000 + i)]));
  const span = (a: Activity) => (a.milestone ? 0 : Math.max(1, Math.round((Date.parse(a.finish) - Date.parse(a.start)) / 86_400_000) + 1));
  const rem = (a: Activity) => (a.status === "completed" || a.milestone ? 0 : a.status === "in_progress" ? Math.max(1, Math.round((Date.parse(a.finish) - Date.parse(o.dataDate)) / 86_400_000) + 1) : span(a));
  const L: string[] = [tsv(["ERMHDR", "19.12", new Date().toISOString().slice(0, 10), "Project", "admin", "Bohio Onsite Agent", "dbxDatabaseNoName", "Project Management", "USD"])];
  L.push("%T\tCALENDAR", "%F\t" + tsv(["clndr_id", "clndr_name", "day_hr_cnt", "week_hr_cnt", "clndr_type"]), "%R\t" + tsv([cid, "7-day, 8 h", H, H * 7, "CA_Base"]));
  L.push("%T\tPROJECT", "%F\t" + tsv(["proj_id", "proj_short_name", "last_recalc_date", "clndr_id", "plan_start_date"]), "%R\t" + tsv([pid, o.projectCode, dt(o.dataDate), cid, dt(schedule.reduce((m, a) => (a.start < m ? a.start : m), o.dataDate))]));
  L.push("%T\tPROJWBS", "%F\t" + tsv(["wbs_id", "proj_id", "wbs_short_name", "wbs_name", "parent_wbs_id"]), ...[...wbsIds].map(([w, id]) => "%R\t" + tsv([id, pid, w, w, ""])));
  const CS: Record<string, string> = { SNET: "CS_MSOA", SNLT: "CS_MSOB", FNET: "CS_MEOA", FNLT: "CS_MEOB", MSO: "CS_MSO", MFO: "CS_MEO" };
  L.push("%T\tTASK", "%F\t" + tsv(["task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type", "status_code", "phys_complete_pct", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "total_float_hr_cnt", "act_start_date", "act_end_date", "early_start_date", "early_end_date", "target_start_date", "target_end_date", "cstr_type", "cstr_date"]));
  for (const a of schedule) L.push("%R\t" + tsv([tid.get(a.id), pid, wbsIds.get(a.wbs || "-"), cid, a.id, a.name, a.milestone ? "TT_FinMile" : "TT_Task", a.status === "completed" ? "TK_Complete" : a.status === "in_progress" ? "TK_Active" : "TK_NotStart", a.percent,
    span(a) * H, rem(a) * H, a.totalFloat * H, a.status !== "not_started" ? dt(a.start) : "", a.status === "completed" ? dt(a.finish) : "", dt(a.start), dt(a.finish), dt(a.baselineStart), dt(a.baselineFinish), a.constraint ? CS[a.constraint.type] : "", a.constraint ? dt(a.constraint.date) : ""]));
  const PT = { FS: "PR_FS", SS: "PR_SS", FF: "PR_FF", SF: "PR_SF" } as const;
  L.push("%T\tTASKPRED", "%F\t" + tsv(["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"]));
  let n = 1;
  for (const a of schedule) for (const r of a.rels ?? a.predecessors.map((id) => ({ id, type: "FS" as const, lag: 0 }))) if (tid.has(r.id)) L.push("%R\t" + tsv([n++, tid.get(a.id), tid.get(r.id), pid, pid, PT[r.type], r.lag * H]));
  L.push("%E");
  return L.join("\n") + "\n";
}
