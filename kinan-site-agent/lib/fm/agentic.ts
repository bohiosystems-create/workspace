// The agentic layer of facility management: what the orchestrator proposes from predictions, priorities and tenants'
// complaints, and the events each proposal produces when approved (or run by the autopilot within its signed policy).
//   predictive    a predictive job before a reading crosses its limit — or the planned maintenance brought forward —
//                 and the spare ordered when it can't arrive in time (predict.ts)
//   reprioritise  a job's priority changed to what its score says, with the reasons (priority.ts)
//   complaint     tenants' complaints turned into work (or linked to the job already open), and tenants told when it
//                 is fixed (complaints.ts)
import type { Action, FmData, FmEvent, Priority, WorkOrder } from "./types";
import { PRIORITY_SLA, bestTech, isOpen } from "./engine";
import { predictions, predictionText } from "./predict";
import { priorityChanges } from "./priority";
import { CATEGORY_LABEL } from "./complaints";

const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

function job(d: FmData, assetId: string, x: { type: WorkOrder["type"]; priority: Priority; title: string; detail: string; due?: string; now: number; checklist?: string[] }): WorkOrder {
  const a = d.assets.find((y) => y.id === assetId)!;
  return { id: "", facilityId: a.facilityId, assetId, type: x.type, priority: x.priority, status: "open", title: x.title, detail: x.detail, raised: new Date(x.now).toISOString(),
    due: x.due ?? ymd(x.now + PRIORITY_SLA[x.priority] * 3600_000), slaHours: PRIORITY_SLA[x.priority], source: "orchestrator", raisedBy: "Orchestrator",
    checklist: (x.checklist ?? ["Check on site", "Find the cause", "Fix it", "Record and close"]).map((text) => ({ text, done: false })), spares: [], notes: [], evidence: [] };
}

export function agenticProposals(d: FmData, fac: (id: string) => boolean, push: (a: Action) => void, handed: Map<string, number>, now: number) {
  const facs = d.facilities.filter((f) => fac(f.id)).map((f) => f.id);
  for (const fid of facs) {
    // open complaints not yet on any job, by the equipment they are about
    const open = d.complaints.filter((c) => c.facilityId === fid && c.status !== "resolved");
    const groups = new Map<string, typeof open>();
    for (const c of open.filter((y) => !y.woId && y.assetId)) groups.set(c.assetId!, [...(groups.get(c.assetId!) ?? []), c]);
    const quotes = (cs: typeof open) => cs.slice(0, 3).map((c) => `“${c.text.slice(0, 90)}” — ${c.from}`);
    // 1. predictive maintenance: act before the crossing
    for (const p of predictions(d, fid, now).filter((x) => x.risk !== "low" && !x.openWo)) {
      const a = d.assets.find((x) => x.id === p.assetId)!;
      const due = ymd(Math.max(now, Date.parse(p.crosses) - DAY));
      const pm = d.workOrders.find((w) => w.assetId === a.id && isOpen(w) && w.type === "PM");
      const why = [predictionText(p), ...(p.mode ? [`Diagnosis: ${p.mode.name} (${Math.round(p.mode.score * 100)} %) — ${p.mode.evidence.join("; ")}`] : []),
        `Predictive engine: ${p.model} degradation since ${p.onsetDaysAgo} days ago (fit ${Math.round(p.fit * 100)} %), health ${p.health}/100`, `${a.criticality === "A" ? "Critical" : "Important"} equipment: ${a.name}`];
      const pdmTag = { modeId: p.mode?.id ?? `generic:${p.reading.key}`, mode: p.mode?.name ?? `${p.reading.name} ${p.side === "high" ? "rising" : "falling"}`, p30: p.p30, rulDays: p.days, predictedAt: new Date(now).toISOString() };
      // tenants already feel it: one job now, the complaints on it — not a job in a few days and another for the complaints
      const cs = groups.get(a.id);
      if (cs?.length) {
        groups.delete(a.id);
        const pr: Priority = cs.some((c) => c.severity === "high") ? "P1" : "P2";
        const wo = job(d, a.id, { type: "CM", priority: pr, title: `${CATEGORY_LABEL[cs[0].category]}: tenants complain and the trend agrees — ${a.tag}`, detail: `${predictionText(p)}.\n${cs.map((c) => `${c.from}: ${c.text}`).join("\n")}`, now,
          checklist: [`Confirm the ${p.reading.name.toLowerCase()} on site`, "Find the cause (filters, coils, belts, valves, settings)", "Correct it and check the area with the tenants", "Record the reading after the work"] });
        const { tech, why: tw } = bestTech(d, wo, handed);
        if (tech) { wo.assignee = tech.id; wo.status = "assigned"; }
        push({ id: `pdm-now:${a.id}:${cs.map((c) => c.id).join(",")}`, facilityId: fid, kind: "predictive", title: `Fix ${a.tag} now: ${cs.length} tenant complaint${cs.length > 1 ? "s" : ""}, and ${p.reading.name.toLowerCase()} crosses its limit in ~${Math.round(p.days)} days${tech ? ` — ${tech.name}` : ""}`,
          why: [...quotes(cs), ...why, ...(pm ? [`Its planned maintenance (${pm.id}) is not until ${pm.due} — too late for the tenants`] : []), ...tw], risk: "low", auto: true, effect: "wo_create",
          payload: { wo, complaints: cs.map((c) => c.id) }, targets: { assetId: a.id, ...(tech ? { techId: tech.id } : {}) } });
        continue;
      }
      if (pm && pm.due > due) {
        push({ id: `pdm-forward:${pm.id}`, facilityId: fid, kind: "predictive", title: `Bring ${pm.id} (planned maintenance on ${a.tag}) forward to ${due}`, why: [...why, `It is planned for ${pm.due}, after the predicted crossing`],
          risk: "low", auto: true, effect: "wo_update", payload: { woId: pm.id, patch: { due, note: `Brought forward by the orchestrator: ${predictionText(p)}.` } }, targets: { woId: pm.id, assetId: a.id } });
      } else if (!pm || pm.due > ymd(now + 2 * DAY)) {
        const pr: Priority = p.days <= 7 ? "P2" : "P3";
        const wo = job(d, a.id, { type: "PdM", priority: pr, title: `Predictive: ${p.mode ? `${p.mode.name.toLowerCase().replace(/ — cause not in the library$/, "")} on ${a.tag}` : `${p.reading.name.toLowerCase()} trending to its limit on ${a.tag}`}`, detail: `${predictionText(p)}.${p.mode ? ` Diagnosis: ${p.mode.name} — ${p.mode.evidence.join("; ")}.` : ""} Find the cause and correct it before the alarm. When done, say whether the fault was there (confirmed / not found): the engine learns from it.`, due, now,
          checklist: p.mode?.checklist ?? [`Confirm the ${p.reading.name.toLowerCase()} reading on site`, "Find the cause (filters, coils, belts, bearings, settings)", "Correct it", "Record the reading after the work"] });
        wo.pdm = pdmTag;
        const { tech, why: tw } = bestTech(d, wo, handed);
        if (tech) { wo.assignee = tech.id; wo.status = "assigned"; }
        push({ id: `pdm:${a.id}:${p.reading.key}`, facilityId: fid, kind: "predictive", title: `Predictive job on ${a.tag}: ${p.mode && !p.mode.id.startsWith("generic:") ? `${p.mode.name.toLowerCase()} — ` : ""}${p.reading.name.toLowerCase()} crosses its limit in ~${Math.round(p.days)} days (${Math.round(p.p30 * 100)} %)${tech ? ` — ${tech.name}` : ""}`,
          why: [...why, ...(pm ? [`Its planned maintenance (${pm.id}) is not until ${pm.due}`] : []), ...tw], risk: "low", auto: true, effect: "wo_create", payload: { wo }, targets: { assetId: a.id, ...(tech ? { techId: tech.id } : {}) } });
      }
      if (p.spareShort) {
        const s = d.spares.find((x) => x.id === p.spareShort!.id)!, qty = Math.max(1, s.min - s.stock);
        push({ id: `pdm-order:${s.id}`, facilityId: fid, kind: "order_spare", title: `Order ${qty} × ${s.part} for ${a.tag} before the predicted failure`, why: [predictionText(p), `${s.stock} in stock, ${s.leadDays} days to arrive — longer than the ${Math.round(p.days)} days left`],
          risk: qty * s.unitCost > 50_000 ? "medium" : "low", cost: qty * s.unitCost, auto: qty * s.unitCost <= 50_000, effect: "spare_order", payload: { spareId: s.id, qty }, targets: { spareId: s.id, assetId: a.id } });
      }
    }
    // 2. priorities: what the scores say
    for (const x of priorityChanges(d, fid, now)) {
      const w = d.workOrders.find((y) => y.id === x.woId)!, a = d.assets.find((y) => y.id === w.assetId);
      const up = x.suggested < x.priority; // "P1" < "P2"
      push({ id: `prio:${w.id}:${x.suggested}`, facilityId: fid, kind: "reprioritise", title: `${up ? "Raise" : "Lower"} ${w.id} (${a?.tag ?? ""}) from ${w.priority} to ${x.suggested}`,
        why: [`${w.title}`, `Score ${x.score}: ${x.reasons.join(", ") || "routine work"}`, up ? "It moves up the team's plan; the SLA follows the new priority" : "Nothing urgent depends on it today: it makes room for what does"],
        risk: "low", auto: true, effect: "wo_update", payload: { woId: w.id, patch: { priority: x.suggested, note: `Priority ${w.priority} → ${x.suggested} (score ${x.score}: ${x.reasons.join(", ") || "routine"}).` } }, targets: { woId: w.id, assetId: w.assetId } });
    }
    // 3. complaints: into work, linked, and the loop closed
    for (const [assetId, cs] of groups) {
      const a = d.assets.find((y) => y.id === assetId)!, onIt = d.workOrders.find((w) => w.assetId === assetId && isOpen(w) && w.type !== "PM");
      const what = `${cs.length} complaint${cs.length > 1 ? "s" : ""} — ${CATEGORY_LABEL[cs[0].category].toLowerCase()}${cs[0].zone ? `, ${cs[0].zone}` : ""}`;
      // an alarm on it is already becoming work (the orchestrator's "raise work from an alarm"): the complaints join that job once it exists
      if (!onIt && d.alarms.some((al) => al.assetId === assetId && !al.acknowledged && !al.woId)) continue;
      if (onIt) {
        push({ id: `cmp-link:${onIt.id}:${cs.map((c) => c.id).join(",")}`, facilityId: fid, kind: "complaint", title: `Link ${what} to ${onIt.id} (${a.tag}), already open`, why: [...quotes(cs), `${onIt.id}: ${onIt.title} (${onIt.priority}, ${onIt.status.replace("_", " ")})`, "The tenants are told when it is fixed"],
          risk: "low", auto: true, effect: "complaint_update", payload: { ids: cs.map((c) => c.id), patch: { woId: onIt.id, status: "in_progress" } }, targets: { woId: onIt.id, assetId } });
        continue;
      }
      // one complaint is enough when it is serious; otherwise two, or one that has waited an hour
      const serious = cs.some((c) => c.severity === "high"), waited = cs.some((c) => now - Date.parse(c.at) > 3600_000);
      if (!serious && cs.length < 2 && !waited) continue;
      const pr: Priority = serious ? (a.class === "lift" || a.class === "escalator" ? "P1" : "P2") : cs.length >= 3 ? "P2" : "P3";
      const p = predictions(d, fid, now).find((y) => y.assetId === assetId);
      const wo = job(d, assetId, { type: "CM", priority: pr, title: `Tenant complaints: ${CATEGORY_LABEL[cs[0].category].toLowerCase()} — ${a.tag}${cs[0].zone ? `, ${cs[0].zone}` : ""}`, detail: `${cs.map((c) => `${c.from}: ${c.text}`).join("\n")}${p ? `\nThe equipment agrees: ${predictionText(p)}.` : ""}`, now });
      const { tech, why: tw } = bestTech(d, wo, handed);
      if (tech) { wo.assignee = tech.id; wo.status = "assigned"; }
      push({ id: `cmp-wo:${assetId}:${cs.map((c) => c.id).join(",")}`, facilityId: fid, kind: "complaint", title: `Raise ${pr} work on ${a.tag} from ${what}${tech ? ` — ${tech.name}` : ""}`,
        why: [...quotes(cs), ...(p ? [`The equipment agrees: ${predictionText(p)}`] : []), ...tw], risk: "low", auto: true, effect: "wo_create", payload: { wo, complaints: cs.map((c) => c.id) }, targets: { assetId, ...(tech ? { techId: tech.id } : {}) } });
    }
    // fixed: tell the tenants
    const doneWos = new Set(d.workOrders.filter((w) => w.facilityId === fid && w.status === "done").map((w) => w.id));
    const byWo = new Map<string, typeof open>();
    for (const c of open.filter((y) => y.woId && doneWos.has(y.woId))) byWo.set(c.woId!, [...(byWo.get(c.woId!) ?? []), c]);
    for (const [woId, cs] of byWo) {
      const w = d.workOrders.find((y) => y.id === woId)!, a = d.assets.find((y) => y.id === w.assetId);
      const reply = `Fixed: ${w.title.replace(/^Tenant complaints: /, "")}. Thank you for telling us — ${d.facilities.find((f) => f.id === fid)?.operator ?? "Facility management"}.`;
      push({ id: `cmp-close:${woId}`, facilityId: fid, kind: "complaint", title: `Tell ${cs.length} tenant${cs.length > 1 ? "s" : ""} that ${a?.tag ?? woId} is fixed and close their complaints`, why: [`${woId} is done`, ...cs.slice(0, 4).map((c) => `${c.from} (${c.channel})`), `Reply: “${reply}”`],
        risk: "low", auto: true, effect: "complaint_update", payload: { ids: cs.map((c) => c.id), patch: { status: "resolved", reply }, contacts: cs.flatMap((c) => (c.contact && /@/.test(c.contact) ? [c.contact] : [])) }, targets: { woId } });
    }
  }
}

/** The events of an approved agentic proposal, or null if it isn't one. */
export function agenticEffects(d: FmData, a: Action, base: { at: string; by: string; channel: FmEvent["channel"] }, id: () => string, woId: (fid: string) => string): FmEvent[] | null {
  if (a.kind === "reprioritise" || (a.kind === "predictive" && a.effect === "wo_update")) return [{ ...base, id: id(), kind: "wo_update", woId: String(a.payload.woId), patch: a.payload.patch as never, summary: a.title }];
  if (a.kind !== "complaint" && a.kind !== "predictive") return null;
  if (a.effect === "wo_create") {
    if (!a.payload.complaints) { const wo = { ...(a.payload.wo as WorkOrder), id: woId(a.facilityId), raised: base.at }; return [{ ...base, id: id(), kind: "wo_create", wo, summary: `raised ${wo.id} ${wo.priority} — ${wo.title}` }]; }
    const wo = { ...(a.payload.wo as WorkOrder), id: woId(a.facilityId), raised: base.at };
    return [{ ...base, id: id(), kind: "wo_create", wo, summary: `raised ${wo.id} ${wo.priority} — ${wo.title}` },
      { ...base, id: id(), kind: "complaint_update", ids: a.payload.complaints as string[], patch: { woId: wo.id, status: "in_progress" }, summary: `${(a.payload.complaints as string[]).length} complaint(s) → ${wo.id}` }];
  }
  const evs: FmEvent[] = [{ ...base, id: id(), kind: "complaint_update", ids: a.payload.ids as string[], patch: a.payload.patch as never, summary: a.title }];
  // closing the loop: the tenants who left an e-mail address are told (lib/integrations/notify.ts sends it)
  const contacts = (a.payload.contacts as string[] | undefined) ?? [];
  const patch = a.payload.patch as { reply?: string };
  if (contacts.length && patch.reply) evs.push({ ...base, id: id(), kind: "notify", facilityId: a.facilityId, via: "email", to: contacts.join(","), title: "Your report has been fixed", text: patch.reply, summary: `told ${contacts.length} tenant(s) by e-mail` });
  return evs;
}
