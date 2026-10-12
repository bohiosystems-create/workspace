import type { ProjectData } from "../types";
import { SCHEDULE } from "./schedule";
import { REGISTER } from "./register";
import { REGULATIONS } from "./regulations";
import { INCIDENTS, PERMITS, PPE_MATRIX, RISKS, SAFETY_REQUIREMENTS, SAFETY_STATS } from "./safety";
import { DELIVERIES, PACKAGES, POS, REQUESTS, STOCK, SUPPLIERS } from "./procurement";
import { CONTACTS, NCRS } from "./people";
import { DATA_DATE, addDays, currentDataDate, daysBetween } from "./util";

/** The demo project data on a date (default: today — the data follows the calendar). */
export function buildProjectData(date = currentDataDate()): ProjectData {
  return rebase(baseData(), date);
}

/**
 * Moves the demo data from its base date to `date`. The programme keeps its dates and is re-read on the new date (so
 * work completes, starts and slips as planned); the rolling records — deliveries, POs, material requests, permits,
 * incidents, NCRs, stock counts, the procurement sync — move with the calendar.
 */
export function rebase(d: ProjectData, date: string): ProjectData {
  const k = daysBetween(DATA_DATE, date);
  d.meta.dataDate = date;
  for (const a of d.schedule) {
    if (a.finish <= date) { a.percent = 100; a.status = "completed"; }
    else if (a.start > date) { a.percent = 0; a.status = "not_started"; }
    else { const tot = Math.max(1, daysBetween(a.start, a.finish)); a.percent = Math.min(99, Math.max(1, Math.round((daysBetween(a.start, date) / tot) * 100))); a.status = "in_progress"; }
  }
  if (!k) return d;
  const sh = (x: string) => (x ? addDays(x.slice(0, 10), k) + x.slice(10) : x);
  const pr = d.procurement;
  for (const x of pr.deliveries) x.date = sh(x.date);
  for (const x of pr.pos) x.date = sh(x.date);
  for (const x of pr.requests) { x.neededBy = sh(x.neededBy); x.created = sh(x.created); }
  for (const x of pr.stock) x.updated = date;
  pr.lastSync = date + "T06:00:00Z";
  for (const x of d.safety.permits) { x.validFrom = sh(x.validFrom); x.validTo = sh(x.validTo); }
  for (const x of d.safety.incidents) x.date = sh(x.date);
  const st = d.safety.stats as Record<string, number | string>;
  st.ltiFreeDays = Number(st.ltiFreeDays) + k;
  st.manhoursToDate = Number(st.manhoursToDate) + k * 16_500;
  for (const key of ["lastDrill", "nextDrill"]) if (typeof st[key] === "string") st[key] = sh(String(st[key]));
  for (const x of d.quality.ncrs) { x.raised = sh(x.raised); if (x.due) x.due = sh(x.due); }
  return d;
}

function baseData(): ProjectData {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return clone({
    meta: {
      dataDate: DATA_DATE,
      disclaimer: "Demo dataset for Kinan Heights. Company, supplier and person names are fictional. Regulatory entries paraphrase requirements as applied to this project — verify against the current official texts before use.",
      currency: "SAR", contractValue: 2_680_000_000, startDate: "2025-03-01", completionDate: "2028-06-30",
    },
    schedule: SCHEDULE,
    register: REGISTER,
    regulations: REGULATIONS,
    safety: { requirements: SAFETY_REQUIREMENTS, risks: RISKS, permits: PERMITS, incidents: INCIDENTS, stats: SAFETY_STATS, ppeMatrix: PPE_MATRIX },
    procurement: { suppliers: SUPPLIERS, packages: PACKAGES, pos: POS, deliveries: DELIVERIES, requests: REQUESTS, stock: STOCK, source: "demo", lastSync: DATA_DATE + "T06:00:00Z" },
    quality: { ncrs: NCRS },
    contacts: CONTACTS,
  });
}

/**
 * Brings stored demo data to today's date (once a day). Real data — an imported programme, or procurement synced from
 * the purchasing system — is kept as it is. Material requests raised by the team are kept. Returns true if it changed.
 */
export function rollToToday(data: ProjectData, date = currentDataDate()): ProjectData | null {
  if (data.meta.fixed || data.meta.dataDate === date) return null;
  const fresh = buildProjectData(date);
  const demoIds = new Set(fresh.procurement.requests.map((r) => r.id));
  if (data.procurement.source !== "demo") fresh.procurement = data.procurement;
  else fresh.procurement.requests.push(...data.procurement.requests.filter((r) => !demoIds.has(r.id)));
  return fresh;
}
