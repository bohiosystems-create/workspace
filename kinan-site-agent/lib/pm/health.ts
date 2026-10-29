// The schedule's health, by the DCMA 14-point assessment — the test planners and owners use to judge whether a P6
// programme can be trusted to forecast: logic, leads, lags, relationship types, hard constraints, high float, negative
// float, long durations, invalid dates, resources, missed tasks, the critical path test, the critical path length index
// and the baseline execution index. Each check gives its number, its threshold, pass or fail, and the activities behind
// it, so the planner can open them in P6.
import type { Activity } from "../types";
import { cpm, network } from "./cpm";

export interface Check { n: number; name: string; value: string; threshold: string; pass: boolean; why: string; ids: string[] }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function dcma(schedule: Activity[], dataDate: string, completionId = "M-990"): { checks: Check[]; passed: number; score: number } {
  const open = schedule.filter((a) => a.status !== "completed");
  const rels = schedule.flatMap((a) => (a.rels ?? a.predecessors.map((id) => ({ id, type: "FS" as const, lag: 0 }))).map((r) => ({ ...r, succ: a.id })));
  const openIds = new Set(open.map((a) => a.id));
  const openRels = rels.filter((r) => openIds.has(r.succ) || openIds.has(r.id));
  const hasPred = new Set(rels.map((r) => r.succ)), hasSucc = new Set(rels.map((r) => r.id));
  const first = schedule.reduce((m, a) => (a.start < m.start ? a : m), schedule[0]);
  const noLogic = open.filter((a) => a.id !== completionId && a !== first && (!hasPred.has(a.id) || !hasSucc.has(a.id)));
  const leads = openRels.filter((r) => r.lag < 0), lags = openRels.filter((r) => r.lag > 0), notFs = openRels.filter((r) => r.type !== "FS");
  const hard = open.filter((a) => a.constraint && ["SNLT", "FNLT", "MSO", "MFO"].includes(a.constraint.type) && a.id !== completionId);
  const r = cpm(network(schedule, dataDate));
  const tf = (a: Activity) => r.tf.get(a.id) ?? a.totalFloat;
  const highFloat = open.filter((a) => tf(a) > 44), negFloat = open.filter((a) => tf(a) < 0);
  const dur = (a: Activity) => a.remaining ?? Math.round((Date.parse(a.finish) - Date.parse(a.status === "in_progress" ? dataDate : a.start)) / 86_400_000) + 1;
  const longDur = open.filter((a) => !a.milestone && dur(a) > 44);
  const invalid = schedule.filter((a) => (a.status !== "not_started" && a.start > dataDate) || (a.status === "completed" && a.finish > dataDate) || (a.status === "not_started" && a.start < dataDate) || (a.status === "in_progress" && a.finish < dataDate));
  const noRes = open.filter((a) => !a.milestone && !a.contractor.trim());
  const due = schedule.filter((a) => a.baselineFinish <= dataDate && !a.milestone);
  const missed = due.filter((a) => a.status !== "completed" || a.finish > a.baselineFinish);
  // critical path test: delay the first open critical activity; the project's finish must move by as much
  const firstCrit = open.filter((a) => r.critical.has(a.id) && !a.milestone).sort((a, b) => (r.es.get(a.id) ?? 0) - (r.es.get(b.id) ?? 0))[0];
  let cpTest = false;
  if (firstCrit) { const net = network(schedule, dataDate); net.nodes.get(firstCrit.id)!.dur += 30; cpTest = cpm(net).finishDay - r.finishDay === 30; }
  // CPLI: (remaining critical path length + project float) / remaining critical path length
  const pc = schedule.find((a) => a.id === completionId);
  const cpLen = Math.max(1, r.finishDay), projFloat = pc ? Math.round((Date.parse(pc.baselineFinish) - Date.parse(r.finish)) / 86_400_000) : 0;
  const cpli = Math.round(((cpLen + projFloat) / cpLen) * 100) / 100;
  const bei = due.length ? Math.round((schedule.filter((a) => a.status === "completed" && a.baselineFinish <= dataDate && !a.milestone).length / due.length) * 100) / 100 : 1;
  const top = (xs: { id: string }[]) => xs.slice(0, 40).map((x) => ("succ" in x ? `${(x as { id: string; succ: string }).id}→${(x as { succ: string }).succ}` : x.id));
  const C = (n: number, name: string, v: number, thr: number, unit: "%" | "n" | "x", pass: boolean, why: string, ids: string[], atLeast = false): Check => ({ n, name, value: unit === "%" ? `${v} %` : unit === "x" ? v.toFixed(2) : String(v), threshold: unit === "%" ? `${atLeast ? "≥" : "≤"} ${thr} %` : unit === "x" ? `≥ ${thr.toFixed(2)}` : thr === 0 ? "0" : `≤ ${thr}`, pass, why, ids });
  const checks: Check[] = [
    C(1, "Logic", pct(noLogic.length, open.length), 5, "%", pct(noLogic.length, open.length) <= 5, "Open activities without a predecessor or a successor: their dates are not driven by the work around them.", top(noLogic)),
    C(2, "Leads", leads.length, 0, "n", !leads.length, "Negative lags: work timed to start before what it depends on finishes.", top(leads)),
    C(3, "Lags", pct(lags.length, openRels.length), 5, "%", pct(lags.length, openRels.length) <= 5, "Relationships carrying a lag: waiting time not shown as work — dates held by lags rather than logic.", top(lags)),
    C(4, "Relationship types", pct(openRels.length - notFs.length, openRels.length), 90, "%", pct(openRels.length - notFs.length, openRels.length) >= 90, "Finish-to-start should be the norm (≥ 90 %); many start-to-start links hide sequencing assumptions.", top(notFs), true),
    C(5, "Hard constraints", pct(hard.length, open.length), 5, "%", pct(hard.length, open.length) <= 5, "Must-start/finish and no-later-than dates override the logic.", top(hard)),
    C(6, "High float", pct(highFloat.length, open.length), 5, "%", pct(highFloat.length, open.length) <= 5, "More than 44 days of float: missing successors — or work that really finishes long before completion (another building); check which.", top(highFloat)),
    C(7, "Negative float", negFloat.length, 0, "n", !negFloat.length, "The logic can't meet a constrained date: the programme is behind its contract dates.", top(negFloat)),
    C(8, "High duration", pct(longDur.length, open.length), 5, "%", pct(longDur.length, open.length) <= 5, "Remaining durations over 44 days are too coarse to manage.", top(longDur)),
    C(9, "Invalid dates", invalid.length, 0, "n", !invalid.length, "Actual dates after the data date, or forecast dates before it.", top(invalid)),
    C(10, "Resources", pct(noRes.length, open.length), 5, "%", pct(noRes.length, open.length) <= 5, "Activities with nobody responsible (no contractor or resource).", top(noRes)),
    C(11, "Missed tasks", pct(missed.length, due.length), 5, "%", pct(missed.length, due.length) <= 5, "Activities due by now in the baseline that finished late or are not finished.", top(missed)),
    { n: 12, name: "Critical path test", value: cpTest ? "pass" : "fail", threshold: "a delay on the critical path moves completion", pass: cpTest, why: firstCrit ? `Delaying ${firstCrit.id} by 30 days ${cpTest ? "moves" : "does not move"} the project's finish by 30 days.` : "No open critical activity.", ids: firstCrit ? [firstCrit.id] : [] },
    C(13, "Critical path length index", cpli, 0.95, "x", cpli >= 0.95, `(Remaining critical path ${cpLen} d + project float ${projFloat} d) ÷ ${cpLen} d: below 0.95 the contract date is unlikely without recovery.`, []),
    C(14, "Baseline execution index", bei, 0.95, "x", bei >= 0.95, `Activities finished ÷ activities the baseline had finished by now (${due.length}).`, []),
  ];
  const passed = checks.filter((c) => c.pass).length;
  return { checks, passed, score: Math.round((passed / checks.length) * 100) };
}
