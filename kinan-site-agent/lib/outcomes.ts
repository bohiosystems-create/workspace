// How the decisions are working out — the numbers a buyer asks for. From the decision logs: how fast an alarm gets
// someone assigned, how often proposals are accepted (and why they are rejected), what the autopilot did, and the
// coordination time that saves; from the live data: maintenance done on time and SLA breaches. Earlier weeks are the
// demo's history (generated like the rest of the demo data, and labelled as such); this week is live from the app.
import type { Db } from "./types";
import { fmToday, isOverdue, kpis } from "./fm/engine";
import { fmDecisions } from "./fm/api";
import { siteDecisionsLike } from "./site/api";
import { KIND_LABEL } from "./fm/orchestrator";
import { SITE_KIND_LABEL } from "./site/orchestrator";
import { REJECT_REASONS, type DecisionLike } from "./proposals";
import { addDays, rng } from "./data/util";

/** Assumption: coordination time one acted-on proposal saves (finding the right person, checking stock and permits,
 *  the calls and messages). Shown with the figure; change it here. */
export const MINUTES_SAVED_PER_ACTION = 8;

export interface WeekRow { week: string; demo: boolean; alarmToAssignMin: number | null; acceptance: number | null; pmOnTime: number; slaBreaches: number; decided: number; auto: number }

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const monday = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return addDays(iso, -((d.getUTCDay() + 6) % 7)); };

/** Eight weeks before this one: the demo's history. The orchestrator was switched on four weeks ago. */
function demoWeeks(thisWeek: string, facilities: number): WeekRow[] {
  return Array.from({ length: 8 }, (_, i) => {
    const week = addDays(thisWeek, -7 * (8 - i)), on = i >= 4, r = rng(Number(week.replace(/\D/g, "")) % 100000);
    const k = on ? (i - 3) / 4 : 0; // how far into using it
    return { week, demo: true,
      alarmToAssignMin: Math.round(on ? 70 - 48 * k + r() * 8 : 92 + r() * 22),
      acceptance: on ? Math.round(64 + 22 * k + r() * 5) : null,
      pmOnTime: Math.round(on ? 81 + 11 * k + r() * 3 : 76 + r() * 6),
      slaBreaches: Math.round((on ? 7 - 4 * k : 9 + r() * 3) * facilities / 3 + r()),
      decided: on ? Math.round((22 + 14 * k + r() * 6) * facilities / 3) : 0,
      auto: on ? Math.round((6 + 16 * k + r() * 4) * facilities / 3) : 0 };
  });
}

export function outcomes(db: Db, facilityId?: string) {
  const d = fmToday(db);
  const date = d.date, thisWeek = monday(date);
  const facs = d.facilities.filter((f) => !facilityId || f.id === facilityId);
  const fmLog = fmDecisions(db).filter((x) => !facilityId || x.scope === facilityId);
  const siteLog: DecisionLike[] = facilityId ? [] : siteDecisionsLike(db.data);
  const all = [...fmLog, ...siteLog];
  const inWeek = (x: { at: string }) => x.at.slice(0, 10) >= thisWeek;

  // a fault → someone on it: faults reported by people today (WhatsApp, the field app, the control room) and alarms
  // that came in during the day, timed to the moment a person was assigned (by a person or the autopilot). Alarms
  // inherited from the night before are left out — their clock started before anyone could act.
  const assignedAt = new Map<string, string>();
  for (const e of db.fmLog ?? []) {
    if (e.kind === "wo_create" && e.wo.assignee && !assignedAt.has(e.wo.id)) assignedAt.set(e.wo.id, e.at);
    if (e.kind === "wo_update" && e.patch.assignee && !assignedAt.has(e.woId)) assignedAt.set(e.woId, e.at);
  }
  const response: number[] = [];
  for (const w of d.workOrders.filter((x) => facs.some((f) => f.id === x.facilityId) && x.raised.slice(0, 10) >= thisWeek)) {
    const at = assignedAt.get(w.id); if (!at) continue;
    const al = d.alarms.find((a) => a.woId === w.id);
    const from = al ? al.at : ["whatsapp", "field", "control"].includes(w.source) ? w.raised : null;
    if (!from) continue;
    const min = (Date.parse(at) - Date.parse(from)) / 60_000;
    if (min >= 0 && min <= 3 * 60) response.push(min);
  }
  const week = all.filter(inWeek), acted = week.filter((x) => x.decision !== "rejected");
  const live: WeekRow = {
    week: thisWeek, demo: false, alarmToAssignMin: median(response),
    acceptance: week.length ? Math.round((acted.length / week.length) * 100) : null,
    pmOnTime: Math.round(facs.reduce((n, f) => n + kpis(d, f.id).pmCompliance, 0) / Math.max(1, facs.length)),
    slaBreaches: d.workOrders.filter((w) => facs.some((f) => f.id === w.facilityId) && w.type !== "PM" && isOverdue(w)).length,
    decided: week.length, auto: week.filter((x) => x.decision === "auto").length,
  };
  const weeks = [...demoWeeks(thisWeek, facs.length), live];

  // decisions by kind and the reasons for rejecting (all time)
  const kinds = new Map<string, { domain: "site" | "fm"; kind: string; label: string; approved: number; rejected: number; auto: number }>();
  for (const x of all) {
    const domain = x.scope === "site" ? "site" : "fm";
    const k = `${domain}|${x.kind ?? "other"}`;
    if (!kinds.has(k)) kinds.set(k, { domain, kind: x.kind ?? "other", label: (domain === "site" ? SITE_KIND_LABEL : KIND_LABEL)[x.kind as never] ?? x.kind ?? "other", approved: 0, rejected: 0, auto: 0 });
    kinds.get(k)![x.decision]++;
  }
  const reasons = Object.entries(REJECT_REASONS).map(([reason, label]) => ({ reason, label, count: all.filter((x) => x.decision === "rejected" && x.reason === reason).length })).filter((r) => r.count);
  const actedAll = all.filter((x) => x.decision !== "rejected").length;
  // the headline compares the four weeks before the orchestrator with the four since (the demo's history)
  const before = weeks.slice(0, 4), after = weeks.slice(4, 8);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    date, thisWeek, weeks, live,
    headline: {
      alarmToAssign: { before: avg(before.map((w) => w.alarmToAssignMin!)), after: avg(after.map((w) => w.alarmToAssignMin!)) },
      pmOnTime: { before: avg(before.map((w) => w.pmOnTime)), now: live.pmOnTime },
      acceptance: { first: after[0]?.acceptance ?? null, now: live.acceptance ?? after[3]?.acceptance ?? null },
    },
    decisions: { total: all.length, approved: all.filter((x) => x.decision === "approved").length, rejected: all.filter((x) => x.decision === "rejected").length, auto: all.filter((x) => x.decision === "auto").length,
      byKind: [...kinds.values()].sort((a, b) => b.approved + b.rejected + b.auto - (a.approved + a.rejected + a.auto)), reasons },
    saved: { actions: actedAll, minutesEach: MINUTES_SAVED_PER_ACTION, hours: Math.round((actedAll * MINUTES_SAVED_PER_ACTION) / 6) / 10 },
    note: "Weeks before this one are the demo's history (the orchestrator was switched on four weeks ago). This week is live: the decisions made in the app, on WhatsApp and by the autopilot.",
  };
}
export type Outcomes = ReturnType<typeof outcomes>;
