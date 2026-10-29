import type { ProjectData } from "../types";
import { SCHEDULE } from "./schedule";
import { REGISTER } from "./register";
import { REGULATIONS } from "./regulations";
import { INCIDENTS, PERMITS, PPE_MATRIX, RISKS, SAFETY_REQUIREMENTS, SAFETY_STATS } from "./safety";
import { DELIVERIES, PACKAGES, POS, REQUESTS, STOCK, SUPPLIERS } from "./procurement";
import { CONTACTS, NCRS } from "./people";
import { applyUpdate } from "../core/updates";
import { applyDecision } from "../site/api";
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
  d.siteReports = demoSiteReports(d, date);
  if (!k) return alignDelayed(d);
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
  return alignDelayed(d);
}

/** The demo's site reports of the last day — WhatsApp messages and photos from the foremen that P6 doesn't have yet:
 *  one behind what P6 claims, one blocked, one ahead, one started that P6 shows not started (lib/pm/compare.ts). */
function demoSiteReports(d: ProjectData, date: string): NonNullable<ProjectData["siteReports"]> {
  const prog = d.schedule.filter((a) => a.status === "in_progress" && !a.milestone && a.percent >= 30 && a.percent <= 85).sort((a, b) => a.totalFloat - b.totalFloat || a.id.localeCompare(b.id));
  const soon = d.schedule.filter((a) => a.status === "not_started" && !a.milestone && daysBetween(date, a.start) >= 1 && daysBetween(date, a.start) <= 6).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const at = (h: number) => `${addDays(date, -1)}T${String(h).padStart(2, "0")}:20:00.000Z`;
  const out: NonNullable<ProjectData["siteReports"]> = [];
  const R = (n: number, a: (typeof prog)[number] | undefined, state: "in_progress" | "pending" | "completed", percent: number | undefined, by: string, note: string, photos: number, h: number) =>
    a && out.push({ id: `sr-${date}-${n}`, activityId: a.id, at: at(h), date: addDays(date, -1), by, channel: "whatsapp", state, ...(percent !== undefined ? { percent } : {}), note, evidence: Array.from({ length: photos }, (_, i) => `photo-${a.id}-${i + 1}`), before: { status: a.status, percent: a.percent, start: a.start, finish: a.finish } });
  R(1, prog[0], "in_progress", prog[0] ? Math.max(5, prog[0].percent - 25) : 0, "Foreman, Al-Bunyan", "Half the crew moved to the podium today; this floor is behind.", 3, 9);
  R(2, prog[1], "pending", prog[1]?.percent, "Section engineer", "Stopped: waiting for the revised drawings (RFI still open).", 2, 11);
  R(3, prog[2], "in_progress", prog[2] ? Math.min(99, prog[2].percent + 20) : 0, "Site engineer", "Second crew added this week, ahead of the programme.", 4, 13);
  R(4, soon[0], "in_progress", 10, "Foreman, Al-Bunyan", "Started early — formwork in place.", 2, 15);
  return out;
}

/** A delayed delivery is booked for the date its package is now forecast on site — not its old slot (the look-ahead,
 *  the gate plan and the brief would otherwise expect it before the supplier can deliver). */
function alignDelayed(d: ProjectData): ProjectData {
  const pr = d.procurement;
  for (const x of pr.deliveries.filter((y) => y.status === "Delayed")) {
    const pk = pr.packages.find((p) => p.id === pr.pos.find((po) => po.po === x.po)?.packageId);
    if (pk && pk.forecastOnSite > x.date.slice(0, 10)) x.date = pk.forecastOnSite + x.date.slice(10);
  }
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
  // demo data saved before the programme carried its logic (lib/pm) is rebuilt the same day, not the next
  const stale = !data.schedule.some((a) => a.rels);
  if (data.meta.fixed || (data.meta.dataDate === date && !stale)) return null;
  const fresh = buildProjectData(date);
  const demoIds = new Set(fresh.procurement.requests.map((r) => r.id));
  if (data.procurement.source !== "demo") fresh.procurement = data.procurement;
  else fresh.procurement.requests.push(...data.procurement.requests.filter((r) => !demoIds.has(r.id)));
  // progress reported from site and approved construction proposals (lib/site) stay, and still move the programme —
  // replayed together in the order they happened (a night shift approved, then the work reported done, ends done)
  if (data.updates?.length) fresh.updates = data.updates;
  if (data.decisions?.length) fresh.decisions = data.decisions;
  const replay = [...(fresh.updates ?? []).map((u) => ({ at: u.at, run: () => applyUpdate(fresh, u) })), ...(fresh.decisions ?? []).map((x) => ({ at: x.at, run: () => applyDecision(fresh, x) }))];
  for (const e of replay.sort((a, b) => a.at.localeCompare(b.at))) e.run();
  return fresh;
}
