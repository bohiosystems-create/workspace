// Facility management operations, shared by the API route, the AI agent's tools, WhatsApp and the standalone page.
// Reads build today's picture (engine.fmToday); writes append events to db.fmLog (the caller saves the database).
import type { Db } from "../types";
import { SECTOR_LABEL } from "./data";
import { fmToday, findAsset, findTech, isOpen, isOverdue, kpis, newWoId, PRIORITY_SLA, slaLeft, workload } from "./engine";
import { effects, propose, KIND_LABEL, type Learned } from "./orchestrator";
import type { Action, AssetStatus, AutopilotPolicy, FmData, FmEvent, Priority, Technician, WorkOrder, WoStatus, WoType } from "./types";
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
export const DEFAULT_POLICY: Pick<AutopilotPolicy, "kinds" | "maxRisk" | "maxSpend"> = { kinds: ["raise_wo", "assign", "reschedule", "escalate", "permit", "order_spare"], maxRisk: "low", maxSpend: 25_000 };

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
  return { date: d.date, facility: f, sector: SECTOR_LABEL[f.sector], kpis: kpis(d, facilityId), systems: by(d.systems), assets: by(d.assets), technicians: by(d.technicians).map((t) => ({ ...t, load: workload(d, t.id) })),
    workOrders: by(d.workOrders).map((w) => ({ ...w, slaLeft: Math.round(slaLeft(w) * 10) / 10, overdue: isOverdue(w) })), alarms: by(d.alarms), spares: by(d.spares), actions: actions(db, d, facilityId), autopilot: autopilotOn(db, facilityId), policy: policyOf(db, facilityId) ?? null, log, top: topIssues(d, facilityId) };
}
/** The control room as this person sees it: may they approve each proposal, and sign the autopilot policy? */
export function facilityStateFor(db: Db, facilityId: string, user: Person | null | undefined) {
  const st = facilityState(db, facilityId);
  return { ...st, actions: st.actions.map((a) => ({ ...a, can: canApprove(user, { domain: "fm", facilityId, risk: a.risk, cost: a.cost }), byPolicy: autopilotOn(db, facilityId) && withinPolicy(db, a) })),
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
  }
}

/** One technician's day: their jobs in the order to do them, what is happening around them, and their team. */
export function myDay(db: Db, techId: string) {
  const d = fmToday(db);
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
  action: "decide" | "autopilot" | "policy" | "tick" | "wo_create" | "wo_update" | "asset_status" | "alarm_ack" | "tech_status";
  facilityId?: string; actionId?: string; decision?: "approved" | "rejected"; reason?: RejectReason; on?: boolean;
  policy?: Partial<Pick<AutopilotPolicy, "kinds" | "maxRisk" | "maxSpend">>;
  asset?: string; title?: string; detail?: string; priority?: Priority; type?: WoType;
  woId?: string; status?: WoStatus; note?: string; assignee?: string; checklist?: number; evidence?: string[]; holdReason?: string;
  assetStatus?: AssetStatus; alarmId?: string; techId?: string; techStatus?: Technician["status"];
  /** the field app's id for this change (outbox retries are recorded once) */
  cid?: string;
}
/** Decide one proposal: approve (it runs) or reject (with the reason, which the orchestrator learns from). */
function decideOne(db: Db, d: FmData, a: Action, b: { decision?: "approved" | "rejected"; reason?: RejectReason; note?: string }, by: string, channel: Channel, who: { byId?: string; role?: string }, user: Person | null | undefined): FmEvent[] {
  const ok = b.decision === "approved" ? canApprove(user, { domain: "fm", facilityId: a.facilityId, risk: a.risk, cost: a.cost }) : canApprove(user, { domain: "fm", facilityId: a.facilityId, risk: "low" });
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
      const t = d.technicians.find((x) => x.id === b.techId);
      if (!t || !b.techStatus) throw new Error("Which technician and status?");
      add({ kind: "tech_status", techId: t.id, status: b.techStatus, summary: `${t.name} ${b.techStatus.replace("_", " ")}` });
      return { ok: true, message: `${t.name}: ${b.techStatus.replace("_", " ")}.`, events: evs };
    }
  }
}
