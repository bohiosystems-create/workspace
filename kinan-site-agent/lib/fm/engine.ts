// Facility management engine: the day's generated picture plus every recorded change (FmEvent), KPIs per facility,
// and the small set of operations people and the orchestrator perform. Pure functions over the data: the server
// (API, agent tools, WhatsApp) and the standalone page share them.
import type { Db } from "../types";
import { currentDataDate } from "../data/util";
import { generate } from "./data";
import type { Asset, FmData, FmEvent, Kpis, Priority, Technician, WorkOrder } from "./types";

const HOUR = 3600_000;
export const isOpen = (w: WorkOrder) => w.status !== "done";
export const PRIORITY_SLA: Record<Priority, number> = { P1: 4, P2: 24, P3: 72, P4: 168 };

/** Today's operating picture with every change applied. */
export function fmToday(db: Db, date = db.data?.meta?.dataDate ?? currentDataDate()): FmData {
  const d = generate(date);
  for (const e of db.fmLog ?? []) applyEvent(d, e);
  return d;
}

export function applyEvent(d: FmData, e: FmEvent) {
  switch (e.kind) {
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
    case "action": break; // the decision itself; its effects are their own events
  }
}
const addDays = (iso: string, n: number) => { const x = new Date(iso.slice(0, 10) + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Hours left before a work order breaches its SLA (negative: breached). Planned work runs to its due date. */
export function slaLeft(w: WorkOrder, now = Date.now()) {
  const end = w.type === "PM" ? Date.parse(w.due + "T23:59:00Z") : Date.parse(w.raised) + w.slaHours * HOUR;
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
  const pms = wos.filter((w) => w.type === "PM" && w.due <= d.date);
  const pmLate = pms.filter((w) => isOpen(w) && w.due < d.date).length;
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
    pmCompliance: pms.length ? Math.round(((pms.length - pmLate) / pms.length) * 100) : 100,
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
export function bestTech(d: FmData, w: WorkOrder, extra?: Map<string, number>): { tech?: Technician; why: string[] } {
  const a = d.assets.find((x) => x.id === w.assetId);
  if (!a) return { why: [] };
  const pool = d.technicians.filter((t) => t.facilityId === w.facilityId && t.shift !== "off" && t.status !== "off");
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
