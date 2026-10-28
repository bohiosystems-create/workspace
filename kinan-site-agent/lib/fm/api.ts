// Facility management operations, shared by the API route, the AI agent's tools, WhatsApp and the standalone page.
// Reads build today's picture (engine.fmToday); writes append events to db.fmLog (the caller saves the database).
import type { Db } from "../types";
import { SECTOR_LABEL } from "./data";
import { fmToday, findAsset, findTech, isOpen, isOverdue, kpis, newWoId, PRIORITY_SLA, slaLeft, workload } from "./engine";
import { effects, propose, KIND_LABEL, type Learned } from "./orchestrator";
import type { Action, AssetStatus, AutopilotPolicy, Crew, FmData, FmEvent, Priority, Technician, WorkOrder, WoStatus, WoType } from "./types";
import type { Capability, Mission } from "../robots/types";
import { CAPABILITY_LABEL, MISSION_LABEL } from "../robots/types";
import { gasIn, robotMayEnter, turnaround, waitingFor } from "./work";
import { findings } from "../robots/sim";
import { closedIds, excludedPeople, learnedDoubts, isReason, type DecisionLike, type RejectReason } from "../proposals";
import { canApprove, canSetPolicy, type Person } from "../auth/people";

type Channel = FmEvent["channel"];
type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const evId = () => `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
/** Append a change. A change sent again from the field app's outbox (same cid) is recorded once. */
export function record(db: Db, ev: DOmit<FmEvent, "id" | "at"> & { at?: string }): FmEvent {
  if (ev.cid) { const dup = (db.fmLog ?? []).find((x) => x.cid === ev.cid && x.kind === ev.kind); if (dup) return dup; }
  const e = { id: evId(), at: new Date().toISOString(), ...ev } as FmEvent;
  (db.fmLog ??= []).push(e);
  if (db.fmLog.length > 3000) db.fmLog = db.fmLog.slice(-3000);
  return e;
}
/** Every decision on a proposal, in the shape the learning rules read (lib/proposals.ts). */
export const fmDecisions = (db: Db): DecisionLike[] => (db.fmLog ?? []).flatMap((e) => (e.kind === "action" ? [{ actionId: e.actionId, kind: e.actionKind, scope: e.facilityId, decision: e.decision, reason: e.reason, at: e.at, targetTech: e.targetTech }] : []));
const learnedFrom = (db: Db): Learned => { const log = fmDecisions(db); return { closed: closedIds(log), exclude: excludedPeople(log), doubts: learnedDoubts(log) }; };
export const policyOf = (db: Db, facilityId: string): AutopilotPolicy | undefined => db.fmConfig?.policy?.[facilityId];
/** Autopilot runs only with a signed policy. */
export const autopilotOn = (db: Db, facilityId: string) => !!db.fmConfig?.autopilot?.[facilityId] && !!policyOf(db, facilityId);
/** May the autopilot carry out this proposal under the facility's signed policy? */
export function withinPolicy(db: Db, a: Action): boolean {
  const p = policyOf(db, a.facilityId);
  return !!p && a.auto && p.kinds.includes(a.kind) && (a.risk === "low" || (a.risk === "medium" && p.maxRisk === "medium")) && (a.cost ?? 0) <= p.maxSpend;
}
export const DEFAULT_POLICY: Pick<AutopilotPolicy, "kinds" | "maxRisk" | "maxSpend"> = { kinds: ["raise_wo", "assign", "reschedule", "escalate", "permit", "order_spare", "safety_stop", "gas_test", "robot_recall", "robot_mission", "robot_finding"], maxRisk: "low", maxSpend: 25_000 };

export function actions(db: Db, d: FmData, facilityId?: string): Action[] { return propose(d, learnedFrom(db), facilityId); }

/** Summary of every facility (the home page cards, the brief, "how are the plants?"). */
export function overview(db: Db) {
  const d = fmToday(db);
  return { date: d.date, facilities: d.facilities.map((f) => ({ facility: f, sector: SECTOR_LABEL[f.sector], kpis: kpis(d, f.id), pending: actions(db, d, f.id).length, autopilot: autopilotOn(db, f.id),
    top: topIssues(d, f.id).slice(0, 3) })) };
}

/** The things the control room should know first. */
export function topIssues(d: FmData, facilityId: string): string[] {
  const out: string[] = [];
  const tag = (id: string) => d.assets.find((a) => a.id === id)?.tag ?? id;
  for (const a of d.assets.filter((x) => x.facilityId === facilityId && x.criticality === "A" && x.status === "down")) out.push(`${a.tag} ${a.name} is down`);
  for (const al of d.alarms.filter((x) => x.facilityId === facilityId && !x.acknowledged && (x.severity === "critical" || x.severity === "high"))) out.push(`${al.severity} alarm: ${al.message}`);
  for (const w of d.workOrders.filter((x) => x.facilityId === facilityId && isOverdue(x) && x.type !== "PM")) out.push(`${w.id} ${w.priority} on ${tag(w.assetId)} is past its SLA`);
  for (const w of d.workOrders.filter((x) => x.facilityId === facilityId && x.status === "on_hold")) out.push(`${w.id} on ${tag(w.assetId)} on hold: ${w.holdReason ?? ""}`);
  for (const a of d.assets.filter((x) => x.facilityId === facilityId && x.status === "degraded")) out.push(`${a.tag} degraded (condition ${a.condition}/100)`);
  return out;
}

/** Everything about one facility for the control room. */
export function facilityState(db: Db, facilityId: string) {
  const d = fmToday(db);
  const f = d.facilities.find((x) => x.id === facilityId);
  if (!f) throw new Error("No such facility.");
  const by = <T extends { facilityId: string }>(xs: T[]) => xs.filter((x) => x.facilityId === facilityId);
  const log = (db.fmLog ?? []).filter((e) => eventFacility(d, e) === facilityId).slice(-40).reverse();
  // the work layer: hazard zones (and gas in them now), contractor crews, robots and their missions, turnarounds
  const crewJobs = (id: string) => d.workOrders.filter((w) => w.crew === id && isOpen(w)).map((w) => ({ id: w.id, title: w.title, status: w.status }));
  const work = {
    zones: by(d.zones).map((z) => ({ ...z, gas: gasIn(d, z)?.text ?? null })),
    contractors: by(d.contractors).map((k) => ({ ...k, crews: d.crews.filter((c) => c.contractorId === k.id).map((c) => ({ id: c.id, name: c.name, size: c.size, status: c.status })) })),
    crews: by(d.crews).map((c) => ({ ...c, contractor: d.contractors.find((k) => k.id === c.contractorId)?.name ?? "", rating: d.contractors.find((k) => k.id === c.contractorId)?.performance.rating ?? "good", jobs: crewJobs(c.id) })),
    robots: by(d.robots), missions: by(d.missions).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)), findings: findings(d, facilityId),
    turnarounds: [...new Set(by(d.workOrders).filter((w) => w.package).map((w) => w.package!))].map((pk) => turnaround(d, pk)!).filter(Boolean),
  };
  return { date: d.date, facility: f, sector: SECTOR_LABEL[f.sector], kpis: kpis(d, facilityId), ...work, systems: by(d.systems), assets: by(d.assets), technicians: by(d.technicians).map((t) => ({ ...t, load: workload(d, t.id) })),
    workOrders: by(d.workOrders).map((w) => ({ ...w, slaLeft: Math.round(slaLeft(w) * 10) / 10, overdue: isOverdue(w), waitingFor: waitingFor(d, w) })), alarms: by(d.alarms), spares: by(d.spares), actions: actions(db, d, facilityId), autopilot: autopilotOn(db, facilityId), policy: policyOf(db, facilityId) ?? null, log, top: topIssues(d, facilityId) };
}
/** The control room as this person sees it: may they approve each proposal, and sign the autopilot policy? */
export function facilityStateFor(db: Db, facilityId: string, user: Person | null | undefined) {
  const st = facilityState(db, facilityId);
  return { ...st, actions: st.actions.map((a) => ({ ...a, can: canApprove(user, { domain: "fm", facilityId, risk: a.risk, cost: a.cost, kind: a.kind, party: a.party }), byPolicy: autopilotOn(db, facilityId) && withinPolicy(db, a) })),
    canPolicy: canSetPolicy(user, facilityId), canPause: canApprove(user, { domain: "fm", facilityId, risk: "low" }), kindLabels: KIND_LABEL, defaultPolicy: DEFAULT_POLICY };
}
function eventFacility(d: FmData, e: FmEvent): string | undefined {
  switch (e.kind) {
    case "wo_create": return e.wo.facilityId;
    case "wo_update": return d.workOrders.find((w) => w.id === e.woId)?.facilityId;
    case "asset_status": return d.assets.find((a) => a.id === e.assetId)?.facilityId;
    case "alarm_ack": return d.alarms.find((a) => a.id === e.alarmId)?.facilityId;
    case "spare_order": return d.spares.find((s) => s.id === e.spareId)?.facilityId;
    case "tech_status": return d.technicians.find((t) => t.id === e.techId)?.facilityId;
    case "action": return e.facilityId ?? d.facilities.find((f) => e.summary.includes(f.name) || e.actionId.includes(f.id))?.id;
    case "policy": return e.facilityId;
    case "mission_create": return e.mission.facilityId;
    case "mission_update": return d.missions.find((m) => m.id === e.missionId)?.facilityId;
    case "robot_estop": return d.robots.find((r) => r.id === e.robotId)?.facilityId;
    case "finding_ack": return d.missions.find((m) => e.findingId.startsWith(m.id))?.facilityId;
    case "crew_status": return d.crews.find((c) => c.id === e.crewId)?.facilityId;
    case "gas_test": return d.workOrders.find((w) => w.id === e.woId)?.facilityId;
  }
}

/** One technician's day: their jobs in the order to do them, what is happening around them, and their team. */
export function myDay(db: Db, techId: string) {
  const d = fmToday(db);
  // a contractor crew's lead sees the crew's jobs, as a technician sees theirs
  const crew = d.crews.find((c) => c.id === techId);
  if (crew) {
    const k = d.contractors.find((x) => x.id === crew.contractorId);
    d.technicians.push({ id: crew.id, name: crew.lead, facilityId: crew.facilityId, role: `Crew lead — ${crew.name} (${k?.name ?? "contractor"})`, trades: crew.trades, shift: crew.shift, zone: crew.zone, phone: crew.leadPhone, years: 0,
      status: crew.status === "on_job" ? "on_job" : crew.status === "off" ? "off" : "available" });
    for (const w of d.workOrders) if (w.crew === crew.id) w.assignee = crew.id;
  }
  const t = d.technicians.find((x) => x.id === techId);
  if (!t) throw new Error("No such technician.");
  const f = d.facilities.find((x) => x.id === t.facilityId)!;
  const rank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const st: Record<WoStatus, number> = { in_progress: 0, assigned: 1, open: 2, on_hold: 3, done: 4 };
  const mine = d.workOrders.filter((w) => w.assignee === t.id && (isOpen(w) || (w.done ?? "").startsWith(d.date)))
    .sort((x, y) => st[x.status] - st[y.status] || rank[x.priority] - rank[y.priority] || slaLeft(x) - slaLeft(y))
    .map((w) => ({ ...w, slaLeft: Math.round(slaLeft(w) * 10) / 10, overdue: isOverdue(w), asset: d.assets.find((a) => a.id === w.assetId)! }));
  const zoneAlarms = d.alarms.filter((a) => a.facilityId === t.facilityId && !a.acknowledged && d.assets.find((x) => x.id === a.assetId)?.zone === t.zone);
  const open = mine.filter((w) => w.status !== "done");
  const first = open[0];
  const brief = [
    `Good ${new Date().getUTCHours() + 3 < 12 ? "morning" : new Date().getUTCHours() + 3 < 17 ? "afternoon" : "evening"}, ${t.name.split(" ")[0]}. You have ${open.length} job${open.length === 1 ? "" : "s"} today${mine.length - open.length ? `, ${mine.length - open.length} already done` : ""}.`,
    first ? `Start with ${first.id} on ${first.asset.tag} (${first.priority}${first.overdue ? ", past its SLA" : first.slaLeft < 24 && first.type !== "PM" ? `, ${Math.max(0, Math.round(first.slaLeft))} h of SLA left` : ""}).` : "Nothing assigned yet — check with your supervisor or pick up open work.",
    ...(first?.permit && first.permit.status !== "closed" ? [`It needs a ${first.permit.type} permit${first.permit.status === "issued" ? " — issued" : " — not issued yet, do not start"}.`] : []),
    ...(zoneAlarms.length ? [`${zoneAlarms.length} alarm${zoneAlarms.length > 1 ? "s" : ""} in ${t.zone}: ${zoneAlarms[0].message}.`] : []),
  ].join(" ");
  return { date: d.date, technician: { ...t, load: workload(d, t.id) }, facility: f, sector: SECTOR_LABEL[f.sector], jobs: mine, alarms: zoneAlarms, brief,
    team: d.technicians.filter((x) => x.facilityId === t.facilityId && x.id !== t.id).map((x) => ({ id: x.id, name: x.name, role: x.role, status: x.status, zone: x.zone, shift: x.shift })) };
}

// ------------------------------------------------------------------ writes
export interface ActInput {
  action: "decide" | "autopilot" | "policy" | "tick" | "wo_create" | "wo_update" | "asset_status" | "alarm_ack" | "tech_status"
    | "gas_test" | "mission" | "mission_abort" | "estop" | "crew_status";
  facilityId?: string; actionId?: string; decision?: "approved" | "rejected"; reason?: RejectReason; on?: boolean;
  policy?: Partial<Pick<AutopilotPolicy, "kinds" | "maxRisk" | "maxSpend">>;
  asset?: string; title?: string; detail?: string; priority?: Priority; type?: WoType;
  woId?: string; status?: WoStatus; note?: string; assignee?: string; checklist?: number; evidence?: string[]; holdReason?: string;
  assetStatus?: AssetStatus; alarmId?: string; techId?: string; techStatus?: Technician["status"];
  /** the field app's id for this change (outbox retries are recorded once) */
  cid?: string;
  /** a gas test's result and reading ("LEL 2 %, H₂S 0 ppm, O₂ 20.9 %") */
  result?: "done" | "failed"; reading?: string;
  /** robots: which robot, a mission (kind, where, what to check), which mission */
  robotId?: string; missionKind?: Mission["kind"]; zone?: string; checks?: Capability[]; missionId?: string;
  /** a contractor crew and its status */
  crewId?: string; crewStatus?: Crew["status"];
}
/** Decide one proposal: approve (it runs) or reject (with the reason, which the orchestrator learns from). */
function decideOne(db: Db, d: FmData, a: Action, b: { decision?: "approved" | "rejected"; reason?: RejectReason; note?: string }, by: string, channel: Channel, who: { byId?: string; role?: string }, user: Person | null | undefined): FmEvent[] {
  const ok = b.decision === "approved" ? canApprove(user, { domain: "fm", facilityId: a.facilityId, risk: a.risk, cost: a.cost, kind: a.kind, party: a.party }) : canApprove(user, { domain: "fm", facilityId: a.facilityId, risk: "low", kind: a.kind, party: a.party });
  if (!ok.ok) throw new Error(`${b.decision === "approved" ? "Can't approve" : "Can't reject"} “${a.title}”: ${ok.why}`);
  const evs: FmEvent[] = [];
  if (b.decision === "approved") for (const e of effects(d, a, by, channel)) evs.push(record(db, { ...e, ...who }));
  const reason = b.decision === "rejected" && isReason(b.reason) ? b.reason : undefined;
  evs.push(record(db, { by, channel, ...who, kind: "action", actionId: a.id, decision: b.decision === "approved" ? "approved" : "rejected", actionKind: a.kind, facilityId: a.facilityId, risk: a.risk, ...(a.cost ? { cost: a.cost } : {}), ...(a.targets.techId ? { targetTech: a.targets.techId } : {}), ...(reason ? { reason } : {}), ...(b.note ? { note: b.note.slice(0, 200) } : {}),
    summary: `${b.decision === "approved" ? "approved" : "rejected"}: ${a.title}${reason ? ` (${reason.replace("_", " ")})` : ""}` }));
  return evs;
}

export function act(db: Db, b: ActInput, by: string, channel: Channel, user?: Person | null): { ok: true; message: string; events: FmEvent[] } {
  const d = fmToday(db);
  const evs: FmEvent[] = [];
  const who = user ? { byId: user.id, role: user.role } : {};
  const add = (e: DOmit<FmEvent, "id" | "at" | "by" | "channel">) => evs.push(record(db, { by, channel, ...who, ...(b.cid ? { cid: `${b.cid}:${evs.length}` } : {}), ...e } as DOmit<FmEvent, "id" | "at">));
  switch (b.action) {
    case "decide": {
      const a = actions(db, d).find((x) => x.id === b.actionId);
      if (!a) throw new Error("That proposal is no longer open — the situation changed.");
      evs.push(...decideOne(db, d, a, b, by, channel, who, user));
      return { ok: true, message: b.decision === "approved" ? `Done: ${a.title}.` : `Rejected: ${a.title}. The orchestrator will take that into account.`, events: evs };
    }
    case "policy": {
      // sign (or withdraw) what the autopilot may do here, and switch it on with it
      if (!b.facilityId) throw new Error("Which facility?");
      const ok = canSetPolicy(user, b.facilityId);
      if (!ok.ok) throw new Error(ok.why);
      if (b.on === false) {
        db.fmConfig = { ...(db.fmConfig ?? { autopilot: {} }), autopilot: { ...(db.fmConfig?.autopilot ?? {}), [b.facilityId]: false }, policy: Object.fromEntries(Object.entries(db.fmConfig?.policy ?? {}).filter(([k]) => k !== b.facilityId)) };
        add({ kind: "policy", facilityId: b.facilityId, policy: null, summary: "withdrew the autopilot policy" });
        return { ok: true, message: "Autopilot policy withdrawn: every proposal waits for approval.", events: evs };
      }
      const kinds = (b.policy?.kinds ?? DEFAULT_POLICY.kinds).filter((k) => ["raise_wo", "assign", "reschedule", "escalate", "order_spare", "permit", "isolate"].includes(k));
      const pol: AutopilotPolicy = { kinds, maxRisk: b.policy?.maxRisk === "medium" ? "medium" : "low", maxSpend: Math.max(0, Math.min(250_000, Number(b.policy?.maxSpend ?? DEFAULT_POLICY.maxSpend) || 0)), signedBy: user!.name, signedById: user!.id, role: user!.role, at: new Date().toISOString() };
      db.fmConfig = { ...(db.fmConfig ?? { autopilot: {} }), autopilot: { ...(db.fmConfig?.autopilot ?? {}), [b.facilityId]: true }, policy: { ...(db.fmConfig?.policy ?? {}), [b.facilityId]: pol } };
      add({ kind: "policy", facilityId: b.facilityId, policy: pol, summary: `signed the autopilot policy: ${kinds.length} kinds, ${pol.maxRisk} risk, up to SAR ${pol.maxSpend.toLocaleString("en-US")}` });
      return { ok: true, message: `Autopilot on under ${user!.name}'s policy.`, events: evs };
    }
    case "autopilot": {
      // pause / resume under the policy already signed
      if (!b.facilityId) throw new Error("Which facility?");
      if (b.on && !policyOf(db, b.facilityId)) throw new Error("Sign an autopilot policy first: what it may do, up to what risk and spend.");
      const ok = b.on ? canSetPolicy(user, b.facilityId) : canApprove(user, { domain: "fm", facilityId: b.facilityId, risk: "low" });
      if (!ok.ok) throw new Error(ok.why);
      db.fmConfig = { ...(db.fmConfig ?? { autopilot: {} }), autopilot: { ...(db.fmConfig?.autopilot ?? {}), [b.facilityId]: !!b.on } };
      return { ok: true, message: b.on ? "Autopilot resumed under the signed policy." : "Autopilot paused: every proposal waits for approval.", events: [] };
    }
    case "tick": {
      // Autopilot: carry out what the signed policy allows (called while a control room is open).
      if (!b.facilityId || !autopilotOn(db, b.facilityId)) return { ok: true, message: "", events: [] };
      const pol = policyOf(db, b.facilityId)!;
      let n = 0;
      for (const a of actions(db, d, b.facilityId).filter((x) => withinPolicy(db, x)).slice(0, 6)) {
        for (const e of effects(fmToday(db), a, "Orchestrator", "orchestrator")) evs.push(record(db, e));
        evs.push(record(db, { by: "Orchestrator", channel: "orchestrator", kind: "action", actionId: a.id, decision: "auto", actionKind: a.kind, facilityId: a.facilityId, risk: a.risk, ...(a.cost ? { cost: a.cost } : {}), ...(a.targets.techId ? { targetTech: a.targets.techId } : {}), summary: `autopilot (policy signed by ${pol.signedBy}): ${a.title}` }));
        n++;
      }
      return { ok: true, message: n ? `Autopilot ran ${n} action${n > 1 ? "s" : ""}.` : "", events: evs };
    }
    case "wo_create": {
      const hit = findAsset(d, b.asset ?? "", b.facilityId);
      if (!hit.asset) throw new Error(hit.candidates.length ? `Which one: ${hit.candidates.map((a) => `${a.tag} (${a.name})`).join(", ")}?` : `No asset matches “${b.asset}”.`);
      const a = hit.asset, pr = b.priority ?? (a.criticality === "A" ? "P2" : "P3"), type = b.type ?? "CM";
      const wo: WorkOrder = { id: newWoId(d, a.facilityId), facilityId: a.facilityId, assetId: a.id, type, priority: pr, status: b.assignee ? "assigned" : "open", title: b.title || `Fault reported — ${a.name}`, detail: b.detail || b.title || "",
        raised: new Date().toISOString(), due: new Date(Date.now() + PRIORITY_SLA[pr] * 3600_000).toISOString().slice(0, 10), slaHours: PRIORITY_SLA[pr], source: channel === "orchestrator" ? "orchestrator" : channel === "web" ? "control" : channel === "voice" ? "field" : channel,
        raisedBy: by, assignee: b.assignee ? findTech(d, b.assignee, a.facilityId)?.id ?? b.assignee : undefined, checklist: [{ text: "Make safe and confirm on site", done: false }, { text: "Find the cause", done: false }, { text: "Repair", done: false }, { text: "Return to service and record", done: false }],
        spares: [], notes: b.note ? [{ at: new Date().toISOString(), by, text: b.note, via: channel }] : [], evidence: b.evidence ?? [] };
      if (b.assetStatus && b.assetStatus !== a.status) add({ kind: "asset_status", assetId: a.id, status: b.assetStatus, summary: `${a.tag} ${b.assetStatus}` });
      add({ kind: "wo_create", wo, summary: `raised ${wo.id} ${wo.priority} on ${a.tag} — ${wo.title}` });
      return { ok: true, message: `${wo.id} raised (${wo.priority}, SLA ${wo.slaHours} h) on ${a.tag} ${a.name}.`, events: evs };
    }
    case "wo_update": {
      const w = d.workOrders.find((x) => x.id.toLowerCase() === String(b.woId ?? "").toLowerCase());
      if (!w) throw new Error(`No work order ${b.woId}.`);
      const a = d.assets.find((x) => x.id === w.assetId)!;
      // the field team moves their own jobs (or unassigned ones); anyone may add a note or a photo
      if (user?.role === "field" && w.assignee && w.assignee !== user.techId && (b.status || b.assignee)) throw new Error(`${w.id} is ${d.technicians.find((t) => t.id === w.assignee)?.name ?? "someone else"}'s job — ask your supervisor to reassign it.`);
      if (b.status === "in_progress" && w.permit && w.permit.status === "required") throw new Error(`${w.id} needs a ${w.permit.type} permit before work starts — it has not been issued yet.`);
      if (b.status === "in_progress" && w.permit?.status === "suspended") throw new Error(`${w.id}'s ${w.permit.type} permit is suspended (${w.holdReason ?? "gas in the area"}) — it restarts after a clear gas test.`);
      if (b.status === "in_progress" && (w.gasTest?.status === "required" || w.gasTest?.status === "failed")) throw new Error(`${w.id} needs a clear gas test before work starts${w.gasTest.status === "failed" ? ` — the last one failed: ${w.gasTest.reading}` : ""}.`);
      if (b.status === "in_progress" && waitingFor(d, w).length) throw new Error(`${w.id} waits for ${waitingFor(d, w).join(", ")} — they are not finished.`);
      // a contractor's people work on their own crew's jobs only
      if (user && user.orgType !== "client" && user.role !== "admin" && w.crew !== user.crewId) throw new Error(`${w.id} isn't ${user.crewId ? "your crew's" : `${user.org}'s`} job — the client's control room reassigns it.`);
      const tech = b.assignee ? findTech(d, b.assignee, w.facilityId) : undefined;
      const patch = { ...(b.status ? { status: b.status } : {}), ...(tech ? { assignee: tech.id } : {}), ...(b.note ? { note: b.note } : {}), ...(b.evidence?.length ? { evidence: b.evidence } : {}), ...(b.checklist !== undefined ? { checklist: [b.checklist] } : {}), ...(b.status === "on_hold" ? { holdReason: b.holdReason || b.note || "On hold" } : {}) };
      const words = b.status === "done" ? "closed" : b.status === "in_progress" ? "started" : b.status === "on_hold" ? "put on hold" : b.status ? b.status.replace("_", " ") : tech ? `given to ${tech.name}` : b.note ? "noted" : "updated";
      add({ kind: "wo_update", woId: w.id, patch, summary: `${w.id} on ${a.tag} ${words}${b.note ? `: ${b.note.slice(0, 80)}` : ""}` });
      return { ok: true, message: `${w.id} ${words}.${b.status === "done" && (a.status === "down" || a.status === "degraded") && w.type !== "PM" ? ` ${a.tag} is back in service.` : ""}`, events: evs };
    }
    case "asset_status": {
      const hit = findAsset(d, b.asset ?? "", b.facilityId);
      if (!hit.asset || !b.assetStatus) throw new Error("Which asset and which status?");
      add({ kind: "asset_status", assetId: hit.asset.id, status: b.assetStatus, summary: `${hit.asset.tag} set to ${b.assetStatus}${b.note ? `: ${b.note}` : ""}` });
      return { ok: true, message: `${hit.asset.tag} is now ${b.assetStatus}.`, events: evs };
    }
    case "alarm_ack": {
      const al = d.alarms.find((x) => x.id === b.alarmId);
      if (!al) throw new Error("No such alarm.");
      add({ kind: "alarm_ack", alarmId: al.id, summary: `acknowledged ${al.id}: ${al.message}` });
      return { ok: true, message: `Alarm ${al.id} acknowledged.`, events: evs };
    }
    case "tech_status": {
      // a crew lead's status from the field app is the crew's
      const crew = d.crews.find((c) => c.id === b.techId);
      if (crew && b.techStatus) return act(db, { action: "crew_status", crewId: crew.id, crewStatus: b.techStatus === "on_job" ? "on_job" : b.techStatus === "off" ? "off" : "available", cid: b.cid }, by, channel, user);
      const t = d.technicians.find((x) => x.id === b.techId);
      if (!t || !b.techStatus) throw new Error("Which technician and status?");
      add({ kind: "tech_status", techId: t.id, status: b.techStatus, summary: `${t.name} ${b.techStatus.replace("_", " ")}` });
      return { ok: true, message: `${t.name}: ${b.techStatus.replace("_", " ")}.`, events: evs };
    }
    case "gas_test": {
      const w = d.workOrders.find((x) => x.id === b.woId);
      if (!w) throw new Error("Which job was tested?");
      if (b.result !== "done" && b.result !== "failed") throw new Error("Was it clear (done) or not (failed)?");
      if (!user || (!/hse|safety|gas tester/i.test(user.title) && (user.orgType !== "client" || user.role === "field" || user.role === "guest"))) throw new Error("A gas test is recorded by an authorised gas tester or a supervisor.");
      const reading = (b.reading ?? "").trim() || (b.result === "done" ? "LEL 0 %, H₂S 0 ppm, O₂ 20.9 %" : "");
      if (b.result === "failed" && !reading) throw new Error("What did the detector read?");
      add({ kind: "gas_test", woId: w.id, result: b.result, reading, summary: `gas test on ${w.id}: ${b.result === "done" ? "clear" : "not clear"} — ${reading}` });
      return { ok: true, message: b.result === "done" ? `${w.id}: gas test clear (${reading}).${w.status === "on_hold" ? " The job goes back to its crew; the permit is to be re-issued." : ""}` : `${w.id}: not gas-free (${reading}) — the job stays on hold.`, events: evs };
    }
    case "mission": {
      const r = d.robots.find((x) => x.id === b.robotId || x.name.toLowerCase() === String(b.robotId ?? "").toLowerCase());
      if (!r) throw new Error("Which robot?");
      if (!user || user.orgType !== "client" || user.role === "guest") throw new Error("Robots are sent by the facility's own staff.");
      if (r.estop || r.status === "fault" || r.status === "offline") throw new Error(`${r.name} is ${r.estop ? "on emergency stop — release it on site first" : r.status}.`);
      if (r.status === "on_mission" || d.missions.some((m) => m.robotId === r.id && (m.status === "running" || (m.status === "planned" && Math.abs(Date.parse(m.plannedStart) - Date.now()) < 30 * 60_000)))) throw new Error(`${r.name} is busy — on a mission or about to start one.`);
      const hit = b.asset ? findAsset(d, b.asset, r.facilityId) : undefined;
      const asset = hit?.asset;
      const zone = d.zones.find((z) => z.facilityId === r.facilityId && (z.id === b.zone || z.name.toLowerCase() === String(b.zone ?? "").toLowerCase() || z.name === asset?.zone));
      if (!zone) throw new Error(`Where should ${r.name} go? Name an asset or one of: ${d.zones.filter((z) => z.facilityId === r.facilityId).map((z) => z.name).join(", ")}.`);
      if (!robotMayEnter(r, zone)) throw new Error(`${r.name} isn't certified for hazardous areas — ${zone.name} is zone ${zone.atex}. Send an Ex-rated robot.`);
      const kind: Mission["kind"] = b.missionKind ?? "inspection_round";
      const checks = (b.checks?.length ? b.checks : r.capabilities.filter((c) => c !== "lidar" && c !== "carry")) as Capability[];
      const missing = checks.filter((c) => !r.capabilities.includes(c));
      if (missing.length) throw new Error(`${r.name} has no ${missing.map((c) => CAPABILITY_LABEL[c]).join(", ")}.`);
      const dur = kind === "inspection_round" ? 45 : kind === "thickness_survey" ? 60 : 20;
      if (r.battery < 25 + (90 * dur) / r.enduranceMin) throw new Error(`${r.name} has ${r.battery}% — not enough for a ${dur}-minute ${MISSION_LABEL[kind]}. It is charging.`);
      const m: Mission = { id: `MS-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, facilityId: r.facilityId, robotId: r.id, kind, title: `${MISSION_LABEL[kind][0].toUpperCase()}${MISSION_LABEL[kind].slice(1)} — ${asset ? `${asset.tag} ${asset.name}` : zone.name}`,
        waypoints: [{ zone: zone.id, ...(asset ? { assetId: asset.id } : {}), label: asset ? `${asset.tag} ${asset.name}` : zone.name, checks }], plannedStart: new Date(Date.now() + 60_000).toISOString(), durationMin: dur, status: "planned", by, source: channel === "whatsapp" ? "whatsapp" : channel === "field" ? "field" : "control", findings: [], ...(b.woId ? { woId: b.woId } : {}) };
      add({ kind: "mission_create", mission: m, summary: `${m.id}: ${r.name} — ${m.title}` });
      return { ok: true, message: `${r.name} is on its way: ${m.title} (${dur} min, ${checks.map((c) => CAPABILITY_LABEL[c]).join(", ")}). Mission ${m.id}.`, events: evs };
    }
    case "mission_abort": {
      const m = d.missions.find((x) => x.id === b.missionId);
      if (!m) throw new Error("Which mission?");
      if (m.status !== "planned" && m.status !== "running") throw new Error(`${m.id} is ${m.status} already.`);
      if (!user || user.orgType !== "client") throw new Error("Missions are cancelled by the facility's own staff (anyone can hit the robot's emergency stop).");
      add({ kind: "mission_update", missionId: m.id, status: "aborted", note: b.note ?? `Cancelled by ${by}`, summary: `${m.id} cancelled` });
      return { ok: true, message: `${m.id} cancelled — ${d.robots.find((r) => r.id === m.robotId)?.name} returns to its dock.`, events: evs };
    }
    case "estop": {
      const r = d.robots.find((x) => x.id === b.robotId || x.name.toLowerCase() === String(b.robotId ?? "").toLowerCase());
      if (!r) throw new Error("Which robot?");
      // anyone signed in may stop a robot; releasing it is a supervisor's call, after a look on site
      if (b.on === false && (!user || user.orgType !== "client" || !["supervisor", "manager", "director", "admin"].includes(user.role))) throw new Error("Releasing an emergency stop is a supervisor's call, after checking the robot on site.");
      if (!user) throw new Error("Sign in to stop a robot (or use the stop button on the robot).");
      add({ kind: "robot_estop", robotId: r.id, on: b.on !== false, note: b.note, summary: `${r.name} ${b.on !== false ? "emergency stop" : "released"}${b.note ? `: ${b.note}` : ""}` });
      return { ok: true, message: b.on !== false ? `${r.name} stopped. Its mission is frozen; send it again once released.` : `${r.name} released — it is free for new missions.`, events: evs };
    }
    case "crew_status": {
      const c = d.crews.find((x) => x.id === b.crewId);
      if (!c || !b.crewStatus) throw new Error("Which crew and status?");
      if (user && user.orgType !== "client" && user.crewId !== c.id) throw new Error(`${c.name} isn't your crew.`);
      add({ kind: "crew_status", crewId: c.id, status: b.crewStatus, ...(b.zone ? { zone: b.zone } : {}), summary: `${c.name} ${b.crewStatus.replace("_", " ")}` });
      return { ok: true, message: `${c.name}: ${b.crewStatus.replace("_", " ")}.`, events: evs };
    }
  }
}
