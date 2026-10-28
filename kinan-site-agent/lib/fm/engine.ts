// Facility management engine: the day's generated picture plus every recorded change (FmEvent), KPIs per facility,
// and the small set of operations people and the orchestrator perform. Pure functions over the data: the server
// (API, agent tools, WhatsApp) and the standalone page share them.
import type { Db } from "../types";
import { currentDataDate } from "../data/util";
import { generate } from "./data";
import { simNow, simulate } from "../robots/sim";
import { DOMAIN_OF } from "../robots/types";
import { robotOutcomes } from "./work";
import type { Asset, FmData, FmEvent, Kpis, Priority, RobotReport, Technician, WorkOrder } from "./types";

const HOUR = 3600_000;
export const isOpen = (w: WorkOrder) => w.status !== "done";
export const PRIORITY_SLA: Record<Priority, number> = { P1: 4, P2: 24, P3: 72, P4: 168 };

/** Today's operating picture with every change applied. */
export function fmToday(db: Db, date = db.data?.meta?.dataDate ?? currentDataDate(), now = Date.now()): FmData {
  const d = generate(date);
  for (const e of db.fmLog ?? []) applyEvent(d, e);
  const t = simNow(date, now);
  d.securityAlerts = d.securityAlerts.filter((a) => Date.parse(a.at) < t + 1000); // alerts appear when they happen (the clock counts whole seconds)
  holdAirMissions(d);
  simulate(d, t);                 // robots and their missions at this moment (lib/robots/sim.ts)
  for (const e of db.fmLog ?? []) if (e.kind === "robot_report") applyReport(d, e.robotId, e.report, e.at); // real fleets say where they are
  robotOutcomes(d);               // what finished robot checks mean for their jobs and alerts (work.ts)
  return d;
}

/** While an unidentified drone is reported (two hours, or until security clears it), our own air missions wait. */
function holdAirMissions(d: FmData) {
  for (const al of d.securityAlerts.filter((a) => a.kind === "drone" && a.status !== "cleared")) {
    const from = Date.parse(al.at), to = from + 2 * 3600_000;
    for (const m of d.missions.filter((x) => x.facilityId === al.facilityId && x.status === "planned" && !x.started)) {
      const r = d.robots.find((x) => x.id === m.robotId);
      const s = Date.parse(m.plannedStart);
      if (r && DOMAIN_OF[r.kind] === "air" && s >= from && s < to) { m.plannedStart = new Date(to).toISOString(); m.note = `Held until ${new Date(to).toISOString().slice(11, 16)} UTC: unidentified drone reported (${al.id})`; }
    }
  }
}

/** A real fleet's report, in the common shape: where the robot is, its state, and what it found (kept as the findings of
 *  one "reported" mission a day per robot, so they are raised as work like any robot's). */
export function applyReport(d: FmData, robotId: string, rep: RobotReport, at: string) {
  const r = d.robots.find((x) => x.id === robotId); if (!r) return;
  if (rep.status) r.status = rep.status;
  if (typeof rep.battery === "number") r.battery = Math.max(0, Math.min(100, Math.round(rep.battery)));
  const z = rep.zone ? d.zones.find((x) => x.facilityId === r.facilityId && (x.id === rep.zone || x.name.toLowerCase() === rep.zone!.toLowerCase())) : undefined;
  if (z) { r.zone = z.id; r.x = z.x + z.w / 2; r.y = z.y + z.h / 2; }
  r.lastReport = at;
  if (!rep.findings?.length) return;
  const mid = `RPT-${r.name}-${d.date}`;
  let m = d.missions.find((x) => x.id === mid);
  if (!m) { m = { id: mid, facilityId: r.facilityId, robotId: r.id, kind: "inspection_round", title: `Reported by ${rep.source || r.platform || r.vendor}`, waypoints: [], plannedStart: at, durationMin: 1, status: "done", started: at, ended: at, by: rep.source || r.vendor, source: "control", findings: [] }; d.missions.push(m); }
  for (const f of rep.findings) {
    const a = f.asset ? d.assets.find((x) => x.facilityId === r.facilityId && (x.tag.toLowerCase() === f.asset!.toLowerCase() || x.id === f.asset)) : undefined;
    const zone = a ? d.zones.find((x) => x.facilityId === r.facilityId && x.name === a.zone)?.id : z?.id ?? r.zone;
    const id = `${mid}:${m.findings.length}`;
    m.findings.push({ id, missionId: mid, robotId: r.id, facilityId: r.facilityId, zone: zone ?? r.zone, ...(a ? { assetId: a.id } : {}), at: f.at ?? at, sensor: f.sensor, label: f.label, value: f.value, unit: f.unit, ...(f.limit !== undefined ? { limit: f.limit } : {}), severity: f.severity, ...(f.image ? { image: f.image } : {}) });
    const ack = d.findingAcks[id]; if (ack) { m.findings[m.findings.length - 1].acknowledged = true; if (ack.woId) m.findings[m.findings.length - 1].woId = ack.woId; }
  }
}

export function applyEvent(d: FmData, e: FmEvent) {
  switch (e.kind) {
    case "security_alert": if (!d.securityAlerts.some((a) => a.id === e.alert.id)) d.securityAlerts.push(structuredClone(e.alert)); break;
    case "security_update": { const a = d.securityAlerts.find((x) => x.id === e.alertId); if (a) { a.status = e.status; if (e.missionId) a.missionId = e.missionId; if (e.note) a.note = e.note; a.by = e.by; } break; }
    case "robot_report": break; // applied after the simulator (fmToday)
    case "wo_create": if (!d.workOrders.some((w) => w.id === e.wo.id)) d.workOrders.push(structuredClone(e.wo)); break;
    case "wo_update": {
      const w = d.workOrders.find((x) => x.id === e.woId); if (!w) break;
      const { note, evidence, checklist, permitStatus, ...p } = e.patch;
      if (permitStatus && w.permit) w.permit.status = permitStatus;
      if (p.status && p.status !== w.status) {
        if (p.status === "in_progress" && !w.started) w.started = e.at;
        if (p.status === "done") { w.done = e.at; w.checklist.forEach((c) => (c.done = true)); w.holdReason = undefined;
          const a = d.assets.find((x) => x.id === w.assetId);
          if (a && w.type !== "PM" && (a.status === "down" || a.status === "degraded")) { a.status = /standby/i.test(a.name) ? "standby" : "running"; a.condition = Math.max(a.condition, 80); }
          // a repair brings the readings back to normal (the leak fixed, the bearing changed): back to where they were two weeks ago
          if (a && (w.type === "CM" || w.type === "Emergency")) for (const r of a.readings) { const out = (r.high !== undefined && r.value > r.high * 0.85) || (r.low !== undefined && r.value < r.low * 1.05); if (out) { r.was = { value: r.value, until: e.at }; r.value = r.trend[0]; } }
          if (a && w.type === "PM") { a.lastPm = e.at.slice(0, 10); a.nextPm = addDays(a.lastPm, a.pmEveryDays); }
          for (const al of d.alarms) if (al.woId === w.id) al.acknowledged = true;
        }
        if (p.status !== "on_hold") w.holdReason = undefined;
      }
      Object.assign(w, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
      if (p.assignee && w.status === "open") w.status = "assigned";
      if (checklist) for (const i of checklist) if (w.checklist[i]) w.checklist[i].done = !w.checklist[i].done;
      if (note) w.notes.push({ at: e.at, by: e.by, text: note, via: e.channel });
      if (evidence?.length) w.evidence = [...new Set([...w.evidence, ...evidence])];
      break;
    }
    case "asset_status": { const a = d.assets.find((x) => x.id === e.assetId); if (a) a.status = e.status; break; }
    case "alarm_ack": { const a = d.alarms.find((x) => x.id === e.alarmId); if (a) { a.acknowledged = true; if (e.woId) a.woId = e.woId; } break; }
    case "spare_order": { const s = d.spares.find((x) => x.id === e.spareId); if (s) s.onOrder = (s.onOrder ?? 0) + e.qty; break; }
    case "tech_status": { const t = d.technicians.find((x) => x.id === e.techId); if (t) { t.status = e.status; if (e.zone) t.zone = e.zone; } break; }
    case "mission_create": if (!d.missions.some((m) => m.id === e.mission.id)) d.missions.push(structuredClone(e.mission)); break;
    case "mission_update": {
      const m = d.missions.find((x) => x.id === e.missionId); if (!m) break;
      m.status = e.status; if (e.status !== "running") m.ended = e.at; if (e.note) m.note = e.note;
      break;
    }
    case "robot_estop": {
      const r = d.robots.find((x) => x.id === e.robotId); if (!r) break;
      r.estop = e.on; r.note = e.on ? e.note ?? "Emergency stop" : undefined;
      const t = Date.parse(e.at);
      for (const m of d.missions.filter((x) => x.robotId === r.id)) {
        // stopping freezes the mission under way; releasing does not restart it — it is sent again by a person
        if (e.on && (m.status === "planned" || m.status === "running") && Date.parse(m.plannedStart) <= t && t < Date.parse(m.plannedStart) + m.durationMin * 60_000) { m.status = "paused"; m.ended = e.at; m.note = "Stopped by an emergency stop"; }
        if (!e.on && m.status === "paused") { m.status = "aborted"; m.note = "Stopped by an emergency stop — send it again"; }
      }
      break;
    }
    case "finding_ack": d.findingAcks[e.findingId] = { ...(d.findingAcks[e.findingId] ?? {}), ...(e.woId ? { woId: e.woId } : {}) }; break;
    case "crew_status": { const c = d.crews.find((x) => x.id === e.crewId); if (c) { c.status = e.status; if (e.zone) c.zone = e.zone; } break; }
    case "gas_test": {
      const w = d.workOrders.find((x) => x.id === e.woId); if (!w) break;
      w.gasTest = { status: e.result, at: e.at, by: e.by, reading: e.reading };
      if (e.result === "failed") { if (w.status !== "done") { w.status = "on_hold"; w.holdReason = `Not gas-free: ${e.reading}`; } }
      else clearGasHold(w);
      break;
    }
    case "action": case "policy": break; // the decision itself (its effects are their own events), the autopilot mandate
  }
}
/** The hold reasons the gas rules set (and lift): not "waiting for a gas detector part". */
export const GAS_HOLD = /^(gas in the area|not gas-free)/i;
/** A job held for gas, now tested clear: back to its crew; the permit goes back to "required" (re-issued by a person). */
export function clearGasHold(w: WorkOrder) {
  if (w.status === "on_hold" && GAS_HOLD.test(w.holdReason ?? "")) { w.status = w.assignee || w.crew ? "assigned" : "open"; w.holdReason = undefined; }
  if (w.permit?.status === "suspended") w.permit.status = "required";
}
const addDays = (iso: string, n: number) => { const x = new Date(iso.slice(0, 10) + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Hours left before a work order breaches its SLA (negative: breached). Planned work runs to its due date. */
export function slaLeft(w: WorkOrder, now = Date.now()) {
  const end = w.type === "PM" || w.type === "TAR" ? Date.parse(w.due + "T23:59:00Z") : Date.parse(w.raised) + w.slaHours * HOUR;
  return (end - now) / HOUR;
}
export const isOverdue = (w: WorkOrder, now = Date.now()) => isOpen(w) && slaLeft(w, now) < 0;

export function workload(d: FmData, techId: string) { return d.workOrders.filter((w) => isOpen(w) && w.assignee === techId && w.status !== "on_hold").length; }

export function kpis(d: FmData, facilityId: string, now = Date.now()): Kpis {
  const f = d.facilities.find((x) => x.id === facilityId)!;
  const assets = d.assets.filter((a) => a.facilityId === facilityId);
  const wos = d.workOrders.filter((w) => w.facilityId === facilityId);
  const open = wos.filter(isOpen), done = wos.filter((w) => w.status === "done" && w.started && w.done);
  const crit = assets.filter((a) => a.criticality === "A" && a.status !== "standby");
  const avail = crit.length ? crit.filter((a) => a.status === "running" || a.status === "degraded").length / crit.length : 1;
  // planned maintenance on time: the share of assets whose PM is not overdue (no past-due open PM, next PM not passed)
  const pmLateAssets = new Set([...assets.filter((a) => a.nextPm < d.date).map((a) => a.id), ...wos.filter((w) => w.type === "PM" && isOpen(w) && w.due < d.date).map((w) => w.assetId)]);
  const cm = done.filter((w) => w.type === "CM" || w.type === "Emergency");
  const mttr = done.length ? done.reduce((s, w) => s + (Date.parse(w.done!) - Date.parse(w.started!)) / HOUR, 0) / done.length : 0;
  const failures = Math.max(1, cm.length + open.filter((w) => w.type === "CM" || w.type === "Emergency").length);
  const techs = d.technicians.filter((t) => t.facilityId === facilityId && t.shift !== "off");
  const alarms = d.alarms.filter((a) => a.facilityId === facilityId && !(a.woId && wos.find((w) => w.id === a.woId)?.status === "done"));
  return {
    availability: Math.round(avail * 1000) / 10,
    criticalDown: assets.filter((a) => a.criticality === "A" && a.status === "down").length,
    openWos: open.length, overdueWos: open.filter((w) => isOverdue(w, now)).length,
    slaAtRisk: open.filter((w) => w.type !== "PM" && slaLeft(w, now) >= 0 && slaLeft(w, now) < w.slaHours * 0.3).length,
    pmCompliance: assets.length ? Math.round(((assets.length - pmLateAssets.size) / assets.length) * 100) : 100,
    mtbfHours: Math.round((assets.length * 7 * 24) / failures), mttrHours: Math.round(mttr * 10) / 10,
    activeAlarms: alarms.filter((a) => !a.acknowledged).length, criticalAlarms: alarms.filter((a) => !a.acknowledged && (a.severity === "critical" || a.severity === "high")).length,
    techsOnShift: techs.filter((t) => t.status !== "off").length, techsBusy: techs.filter((t) => workload(d, t.id) > 0 || t.status === "on_job").length,
    sparesLow: d.spares.filter((s) => s.facilityId === facilityId && s.stock < s.min).length,
    output: { value: f.output.today, target: f.output.target, unit: f.output.unit, name: f.output.name },
  };
}

/** Find an asset from what someone typed or said: a tag ("P-101A", "swp 102"), a name ("intake pump 2"). */
export function findAsset(d: FmData, q: string, facilityId?: string): { asset?: Asset; candidates: Asset[] } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "");
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, " ").split(/\s+/).filter((w) => (w.length > 1 || /\d/.test(w)) && !["the", "on", "at", "is", "a", "an", "of", "unit"].includes(w));
  const xs = d.assets.filter((a) => !facilityId || a.facilityId === facilityId);
  const nq = norm(q);
  const exact = xs.find((a) => norm(a.tag) === nq || nq.includes(norm(a.tag)) && norm(a.tag).length >= 4);
  if (exact) return { asset: exact, candidates: [exact] };
  const ws = words(q);
  const scored = xs.map((a) => {
    const hay = `${a.tag} ${a.name} ${a.zone} ${a.class}`.toLowerCase();
    const toks = new Set(hay.replace(/[^a-z0-9؀-ۿ ]+/g, " ").split(/\s+/));
    // a number must match a whole number in the tag or name: "2" is pump 2, not pump 12
    const nums = ws.filter((w) => /^\d+$/.test(w)), tagNums = (a.tag.match(/\d+/g) ?? []).map((n) => String(Number(n)));
    const numOk = nums.every((n) => toks.has(n) || tagNums.includes(String(Number(n))));
    return { a, s: !numOk ? 0 : ws.filter((w) => !/^\d+$/.test(w) && hay.includes(w)).length + nums.length * 2 };
  })
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  if (!scored.length) return { candidates: [] };
  const top = scored.filter((x) => x.s === scored[0].s).map((x) => x.a);
  return top.length === 1 ? { asset: top[0], candidates: top } : { candidates: top.slice(0, 6) };
}
export function findTech(d: FmData, q: string, facilityId?: string): Technician | undefined {
  const s = q.toLowerCase().trim();
  return d.technicians.find((t) => (!facilityId || t.facilityId === facilityId) && (t.id === q || t.name.toLowerCase() === s || t.name.toLowerCase().split(" ")[0] === s.split(" ")[0] && s.length > 2));
}

/** The best person for a job: right trade, on shift, nearby, least busy; seniority for urgent work. With the reasons. */
export function bestTech(d: FmData, w: WorkOrder, extra?: Map<string, number>, exclude?: Set<string>): { tech?: Technician; why: string[] } {
  const a = d.assets.find((x) => x.id === w.assetId);
  if (!a) return { why: [] };
  const pool = d.technicians.filter((t) => t.facilityId === w.facilityId && t.shift !== "off" && t.status !== "off" && !exclude?.has(t.id));
  const scored = pool.map((t) => {
    const trade = t.trades.includes(a.trade) ? 10 : t.role.toLowerCase().includes("supervisor") ? 2 : 0;
    const shift = t.shift === "day" ? 3 : 1;
    const near = t.zone === a.zone ? 3 : 0;
    const load = workload(d, t.id) + (extra?.get(t.id) ?? 0);
    const senior = (w.priority === "P1" || w.priority === "P2") && t.years >= 8 ? 2 : 0;
    const busy = t.status === "on_job" ? -2 : 0;
    // a specialist for this kind of equipment ("PBB technician", "BHS technician", "Lift & escalator technician") first;
    // supervisors and managers coordinate — they take hands-on work only when nobody else can
    const SPEC: Record<string, RegExp> = { pbb: /pbb|bridge/i, bhs: /bhs|baggage/i, eds: /bhs|baggage|screen/i, escalator: /lift|escalator/i, lift: /lift|escalator/i, chiller: /hvac/i, ahu: /hvac|bms/i, ccr: /airfield/i };
    const spec = SPEC[a.class]?.test(t.role) ? 4 : 0;
    const boss = /supervisor|manager/i.test(t.role) ? -4 : 0;
    return { t, s: trade + shift + near + senior + busy + spec + boss - load * 2, trade, near, load, senior };
  }).filter((x) => x.trade > 0).sort((x, y) => y.s - x.s);
  const b = scored[0];
  if (b && extra) extra.set(b.t.id, (extra.get(b.t.id) ?? 0) + 1);
  if (!b) return { why: [`Nobody on shift has the ${a.trade} skills — call out the on-call engineer.`] };
  const why = [`${b.t.name} is ${b.t.role.toLowerCase()} with ${a.trade} skills (${b.t.years} years)`, b.near ? `already in ${a.zone}` : `based in ${b.t.zone}`, b.load ? `${b.load} other open job${b.load > 1 ? "s" : ""}` : "no other open job", ...(b.senior ? ["senior enough for a " + w.priority + " job"] : [])];
  return { tech: b.t, why };
}

export function newWoId(d: FmData, facilityId: string) {
  const pre = facilityId === "kcps" ? "E" : facilityId === "krsd" ? "W" : "A";
  const n = Math.max(24100, ...d.workOrders.filter((w) => w.facilityId === facilityId).map((w) => Number(w.id.replace(/\D/g, "")) || 0)) + 1;
  return `WO-${pre}${n}`;
}
