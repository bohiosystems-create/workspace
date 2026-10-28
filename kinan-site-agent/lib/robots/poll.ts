// Asking the machines that answer when asked. Open-RMF and vendor bridges don't send their state by themselves: every
// minute (the cron, app/api/fm/robots/poll) each of their robots is asked status() and results() through its adapter,
// and what changed is recorded as a robot report — the same report a pushing machine sends, so it moves the robot on
// the map, ends its jobs and turns its findings into work. Unchanged state is not recorded again. A connection that
// doesn't answer is logged (and shows in the exceptions queue); the robot then goes "silent" there after 15 minutes.
import type { Db } from "../types";
import type { RobotReport } from "../fm/types";
import { fmToday } from "../fm/engine";
import { act } from "../fm/api";
import { adapterFor, type RobotState } from "./adapter";
import type { Robot } from "./types";

type Env = Record<string, string | undefined>;
/** Is any pull connection configured? (the cron returns at once when not, without reading the store) */
export const pollable = (env: Env = process.env) => !!(env.ROBOT_RMF_URL || env.ROBOT_FLEETS);

/** The state as a report, or null when nothing worth recording changed. */
export function stateToReport(r: Robot, s: RobotState, missionOf: (vendorJob: string) => string | undefined, source: string): RobotReport | null {
  if (s.source !== "live") return null;
  const status = s.online ? s.status : "offline";
  const job = s.job ? missionOf(s.job.id) : undefined;
  const changed = status !== r.status || (s.battery !== undefined && Math.abs(s.battery - r.battery) >= 5) || (!!s.zone && s.zone !== r.zone) || (!!job && !!s.job?.status && s.job.status !== "running") || (!!job && job !== r.missionId);
  if (!changed) return null;
  return { robot: r.id, source, status, ...(s.battery !== undefined ? { battery: s.battery } : {}), ...(s.zone ? { zone: s.zone } : {}),
    ...(job ? { mission: { id: job, ...(s.job?.status ? { status: s.job.status } : {}), ...(typeof s.job?.progress === "number" ? { progress: s.job.progress } : {}) } } : {}) };
}

export async function pollFleets(db: Db, env: Env = process.env): Promise<{ robot: string; adapter: string; recorded: number; note?: string }[]> {
  const d = fmToday(db), out: { robot: string; adapter: string; recorded: number; note?: string }[] = [];
  for (const r of d.robots) {
    const ad = adapterFor(r, env);
    if (ad.mode !== "pull") continue;
    let recorded = 0;
    const notes: string[] = [];
    const record = (rep: RobotReport) => { try { act(db, { action: "robot_report", report: rep }, `${ad.name} (polled)`, "web", null); recorded++; } catch (e) { notes.push((e as Error).message); } };
    const st = await ad.status(r);
    if (st.source !== "live" && st.note) notes.push(`status: ${st.note}`);
    const rep = stateToReport(r, st, (j) => d.missions.find((m) => m.robotId === r.id && (m.id === j || m.externalId === j))?.id, `${ad.name} (polled)`);
    if (rep) record(rep);
    const res = await ad.results(r, r.lastReport ?? new Date(Date.now() - 3600_000).toISOString());
    for (const x of res.reports) record({ ...x, robot: r.id, source: x.source ?? ad.name });
    if (res.mode === "pull" && !res.reports.length && /\d{3}|fetch|abort|timeout|ECONN/i.test(res.note)) notes.push(`results: ${res.note}`);
    // a connection that doesn't answer is logged once per quarter hour per robot, so the exceptions queue shows it
    if (notes.length) {
      const log = (db.integrationLog ??= []), last = [...log].reverse().find((x) => x.subject === r.id && x.what.startsWith("Asking"));
      if (!last || last.ok || Date.now() - Date.parse(last.at) > 15 * 60_000)
        log.push({ id: `IL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), target: ad.name, what: `Asking ${r.name} for its state`, ok: false, note: notes.join("; ").slice(0, 240), facilityId: r.facilityId, subject: r.id });
    }
    out.push({ robot: r.name, adapter: ad.name, recorded, ...(notes.length ? { note: notes.join("; ") } : {}) });
  }
  return out;
}
