// When will it finish — three answers, side by side. P6's own date (the programme as the planner left it), the
// logic's date (the critical path method on today's progress), and earned schedule's: how far along the baseline the
// work done has got (ES), against the time spent (AT). SPI(t) = ES ÷ AT; at that pace the project takes the planned
// duration ÷ SPI(t); if the rest goes to plan, it finishes as late as it is behind now. Weighted by duration, so a
// month of structure counts more than a day of inspection. And the S-curve: planned against earned, month by month.
import type { Activity } from "../types";
import { cpm, days, network, plus } from "./cpm";

const span = (a: Activity) => (a.milestone ? 0 : Math.max(1, days(a.baselineStart, a.baselineFinish) + 1));
/** The baseline's planned % complete at a date, weighted by duration. */
function planned(schedule: Activity[], at: string, total: number) {
  let v = 0;
  for (const a of schedule) {
    const w = span(a);
    if (!w) continue;
    const done = Math.max(0, Math.min(w, days(a.baselineStart, at) + 1));
    v += done;
  }
  return v / total;
}

export interface Forecast {
  start: string; contract: string; dataDate: string;
  p6: string; logic: string; atPace: string; toPlan: string;
  spiT: number; behindDays: number; earned: number; planned: number;
  curve: { month: string; planned: number; earned?: number }[];
}

export function forecast(schedule: Activity[], dataDate: string, completionId = "M-990"): Forecast {
  const start = schedule.reduce((m, a) => (a.baselineStart < m ? a.baselineStart : m), schedule[0].baselineStart);
  const pc = schedule.find((a) => a.id === completionId);
  const contract = pc?.baselineFinish ?? schedule.reduce((m, a) => (a.baselineFinish > m ? a.baselineFinish : m), "");
  const total = schedule.reduce((s, a) => s + span(a), 0) || 1;
  const earned = schedule.reduce((s, a) => s + span(a) * (a.percent / 100), 0) / total;
  const pvNow = planned(schedule, dataDate, total);
  // earned schedule: the day the baseline planned to have earned what has been earned (search back from today)
  const AT = Math.max(1, days(start, dataDate));
  let es = AT;
  if (earned < pvNow) { let lo = 0, hi = AT; while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (planned(schedule, plus(start, mid), total) >= earned) hi = mid; else lo = mid; } es = hi; }
  else { let t = AT; const PD = days(start, contract); while (t < PD && planned(schedule, plus(start, t + 1), total) <= earned) t++; es = t; }
  const spiT = Math.round((es / AT) * 100) / 100;
  const PD = days(start, contract);
  const atPace = plus(start, Math.round(PD / Math.max(0.2, spiT)));
  const toPlan = plus(contract, AT - es);
  const curve: Forecast["curve"] = [];
  for (let m = start.slice(0, 7); m <= contract.slice(0, 7); m = plus(`${m}-01`, 32).slice(0, 7)) {
    const end = plus(plus(`${m}-01`, 32).slice(0, 7) + "-01", -1);
    curve.push({ month: m, planned: Math.round(planned(schedule, end, total) * 1000) / 10, ...(end <= plus(dataDate, 30) && m <= dataDate.slice(0, 7) ? { earned: m === dataDate.slice(0, 7) ? Math.round(earned * 1000) / 10 : undefined } : {}) });
  }
  return { start, contract, dataDate, p6: pc?.finish ?? "", logic: cpm(network(schedule, dataDate)).finish, atPace, toPlan, spiT, behindDays: AT - es, earned: Math.round(earned * 1000) / 10, planned: Math.round(pvNow * 1000) / 10, curve };
}
