// The orchestrator: reads the whole operating picture and proposes what to do next — raise work from alarms, change
// over to standby equipment, assign the right person, escalate work about to breach its SLA, order spares before a
// job stalls, and request permits before anyone starts. Every proposal carries its reasons. People approve or reject;
// with autopilot on, low-risk proposals run by themselves. Deterministic, so it works without an AI provider and the
// AI agent can explain and act on exactly what the control room sees.
import type { Action, FmData, FmEvent, Priority, WorkOrder } from "./types";
import { PRIORITY_SLA, bestTech, isOpen, newWoId, slaLeft } from "./engine";

const PERMIT: Record<string, NonNullable<WorkOrder["permit"]>["type"]> = { electrical: "electrical isolation", transformer: "electrical isolation", breaker: "electrical isolation", ups: "electrical isolation", hrsg: "confined space", gt: "hot work", pbb: "work at height", escalator: "electrical isolation", lift: "electrical isolation" };

export function propose(d: FmData, decided: Set<string>, facilityId?: string, now = Date.now()): Action[] {
  const out: Action[] = [];
  const fac = (id: string) => !facilityId || id === facilityId;
  const asset = (id: string) => d.assets.find((a) => a.id === id)!;
  const push = (a: Action) => { if (!decided.has(a.id) && !out.some((x) => x.id === a.id)) out.push(a); };
  const sevPri: Record<string, Priority> = { critical: "P1", high: "P2", medium: "P3", low: "P4" };
  const handed = new Map<string, number>(); // jobs given out by these proposals, so the work is spread across the team

  // 1. Alarms nobody has taken: raise the work, with the right person already on it.
  for (const al of d.alarms.filter((x) => fac(x.facilityId) && !x.acknowledged && !x.woId && x.severity !== "low")) {
    const a = asset(al.assetId);
    let pr = sevPri[al.severity];
    if (a.criticality === "A" && pr === "P3") pr = "P2";
    const wo: WorkOrder = { id: "", facilityId: a.facilityId, assetId: a.id, type: al.severity === "critical" ? "Emergency" : "CM", priority: pr, status: "open", title: `Investigate: ${al.message.split(":")[0]}`, detail: al.message,
      raised: new Date(now).toISOString(), due: new Date(now + PRIORITY_SLA[pr] * 3600_000).toISOString().slice(0, 10), slaHours: PRIORITY_SLA[pr], source: "orchestrator", raisedBy: "Orchestrator",
      checklist: [{ text: "Make safe and confirm the reading on site", done: false }, { text: "Find the cause", done: false }, { text: "Repair or change over to standby", done: false }, { text: "Return to service and record", done: false }], spares: [], notes: [], evidence: [] };
    const { tech, why } = bestTech(d, wo, handed);
    const permit = PERMIT[a.class] ?? (a.trade === "electrical" ? "electrical isolation" : undefined);
    push({ id: `raise:${al.id}`, facilityId: a.facilityId, kind: "raise_wo", title: `Raise ${pr} ${wo.type === "Emergency" ? "emergency" : "corrective"} work for ${a.tag}${tech ? ` and give it to ${tech.name}` : ""}`,
      why: [al.message, `${a.name} is criticality ${a.criticality}${a.criticality === "A" ? " — it affects output or safety" : ""}`, `SLA ${PRIORITY_SLA[pr]} h for ${pr}`, ...(tech ? why : []), ...(permit ? [`Needs a ${permit} permit before work starts`] : [])],
      risk: pr === "P1" ? "medium" : "low", auto: pr !== "P1", effect: "wo_create",
      payload: { wo: { ...wo, assignee: tech?.id, status: tech ? "assigned" : "open", permit: permit ? { type: permit, status: "required" } : undefined }, alarmId: al.id }, targets: { alarmId: al.id, assetId: a.id, techId: tech?.id } });
  }

  // 2. A critical machine down or degraded with a healthy standby next to it: change over.
  for (const a of d.assets.filter((x) => fac(x.facilityId) && x.criticality === "A" && (x.status === "down" || x.status === "degraded"))) {
    const sb = d.assets.find((x) => x.systemId === a.systemId && x.status === "standby" && x.class === a.class && x.id !== a.id);
    if (!sb) continue;
    push({ id: `changeover:${a.id}:${sb.id}`, facilityId: a.facilityId, kind: "isolate", title: `Change over from ${a.tag} to standby ${sb.tag}`,
      why: [`${a.tag} is ${a.status}`, `${sb.tag} is on standby, condition ${sb.condition}/100`, `Keeps ${d.systems.find((s) => s.id === a.systemId)?.name ?? "the system"} at full capacity while ${a.tag} is repaired`, "Operator confirms the change-over in the control system"],
      risk: "high", auto: false, effect: "asset_status", payload: { from: a.id, to: sb.id }, targets: { assetId: a.id } });
  }

  // 3. Open work without anyone on it.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && x.status === "open" && !x.assignee)) {
    const { tech, why } = bestTech(d, w, handed);
    if (!tech) continue;
    push({ id: `assign:${w.id}`, facilityId: w.facilityId, kind: w.type === "PM" && w.due < d.date ? "reschedule" : "assign",
      title: w.type === "PM" && w.due < d.date ? `Overdue planned work ${w.id} (${asset(w.assetId).tag}): give it to ${tech.name} today` : `Give ${w.id} (${asset(w.assetId).tag}) to ${tech.name}`,
      why: [w.title, ...(w.type === "PM" && w.due < d.date ? [`Was due ${w.due}`] : []), ...why], risk: "low", auto: w.priority !== "P1", effect: "wo_update", payload: { woId: w.id, patch: { assignee: tech.id, status: "assigned" } }, targets: { woId: w.id, techId: tech.id } });
  }

  // 4. Urgent work about to breach its SLA without having started.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && isOpen(x) && x.type !== "PM" && (x.priority === "P1" || x.priority === "P2") && x.status !== "in_progress")) {
    const left = slaLeft(w, now);
    if (left > w.slaHours * 0.5) continue;
    const sup = d.technicians.find((t) => t.facilityId === w.facilityId && /supervisor|manager/i.test(t.role));
    push({ id: `escalate:${w.id}`, facilityId: w.facilityId, kind: "escalate", title: `Escalate ${w.id} (${asset(w.assetId).tag}) to ${sup?.name ?? "the supervisor"}`,
      why: [left < 0 ? `SLA breached ${Math.abs(Math.round(left))} h ago` : `${Math.round(left)} h left of a ${w.slaHours} h SLA`, `Status: ${w.status.replace("_", " ")}${w.holdReason ? ` — ${w.holdReason}` : ""}`, w.priority === "P1" ? "P1: output or safety at stake" : "P2 on a critical system"],
      risk: "low", auto: true, effect: "wo_update", payload: { woId: w.id, patch: { note: `Escalated by the orchestrator to ${sup?.name ?? "the supervisor"}: ${left < 0 ? "SLA breached" : `${Math.round(left)} h of SLA left`}.` } }, targets: { woId: w.id, techId: sup?.id } });
  }

  // 5. Spares: work waiting for a part, and stock below its minimum.
  for (const s of d.spares.filter((x) => fac(x.facilityId))) {
    const need = d.workOrders.filter((w) => isOpen(w) && w.facilityId === s.facilityId && w.spares.some((p) => p.part === s.part)).reduce((n, w) => n + (w.spares.find((p) => p.part === s.part)?.qty ?? 0), 0);
    const short = s.stock + (s.onOrder ?? 0) - Math.max(s.min, need);
    if (short >= 0) continue;
    const qty = Math.max(1, s.min * 2 - s.stock - (s.onOrder ?? 0) + need);
    const cost = qty * s.unitCost;
    push({ id: `order:${s.id}:${s.stock + (s.onOrder ?? 0)}`, facilityId: s.facilityId, kind: "order_spare", title: `Order ${qty} × ${s.part} (SAR ${cost.toLocaleString("en-US")})`,
      why: [`In stock ${s.stock}, minimum ${s.min}${s.onOrder ? `, ${s.onOrder} already on order` : ""}`, ...(need ? [`${need} needed by open work`] : []), `Lead time ${s.leadDays} days`],
      risk: cost > 100000 ? "medium" : "low", auto: cost <= 25000, effect: "spare_order", payload: { spareId: s.id, qty }, targets: { spareId: s.id } });
  }

  // 6. Permits: assigned work on electrical / hot / confined / height jobs without a permit yet.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && (x.status === "assigned" || x.status === "in_progress") && x.permit?.status === "required")) {
    push({ id: `permit:${w.id}`, facilityId: w.facilityId, kind: "permit", title: `Request a ${w.permit!.type} permit for ${w.id} (${asset(w.assetId).tag})`,
      why: [`${w.title}`, `No work may start on ${asset(w.assetId).tag} without a ${w.permit!.type} permit`, "Issued to the assigned technician; it shows on the job in the field app"],
      risk: "low", auto: true, effect: "wo_update", payload: { woId: w.id, patch: { note: `Permit issued: ${w.permit!.type}.`, permitStatus: "issued" } }, targets: { woId: w.id } });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((x, y) => order[x.risk] - order[y.risk] || x.title.localeCompare(y.title));
}

/** The events an approved action produces (plus the decision itself, recorded by the caller). */
export function effects(d: FmData, a: Action, by: string, channel: FmEvent["channel"], now = new Date()): FmEvent[] {
  const at = now.toISOString(), id = () => `ev_${Math.random().toString(36).slice(2, 10)}`;
  const base = { at, by, channel } as const;
  switch (a.kind) {
    case "raise_wo": {
      const wo = { ...(a.payload.wo as WorkOrder), id: newWoId(d, a.facilityId), raised: at };
      return [{ ...base, id: id(), kind: "wo_create", wo, summary: `raised ${wo.id} ${wo.priority} — ${wo.title}` }, { ...base, id: id(), kind: "alarm_ack", alarmId: String(a.payload.alarmId), woId: wo.id, summary: `alarm ${a.payload.alarmId} → ${wo.id}` }];
    }
    case "isolate": {
      const from = String(a.payload.from), to = String(a.payload.to);
      const fa = d.assets.find((x) => x.id === from), ta = d.assets.find((x) => x.id === to);
      return [{ ...base, id: id(), kind: "asset_status", assetId: to, status: "running", summary: `${ta?.tag} started (change-over)` }, { ...base, id: id(), kind: "asset_status", assetId: from, status: "maintenance", summary: `${fa?.tag} isolated for repair` }];
    }
    case "assign": case "reschedule": case "escalate":
      return [{ ...base, id: id(), kind: "wo_update", woId: String(a.payload.woId), patch: a.payload.patch as never, summary: a.title }];
    case "permit": return [{ ...base, id: id(), kind: "wo_update", woId: String(a.payload.woId), patch: a.payload.patch as never, summary: a.title }];
    case "order_spare": return [{ ...base, id: id(), kind: "spare_order", spareId: String(a.payload.spareId), qty: Number(a.payload.qty), summary: a.title }];
  }
}
