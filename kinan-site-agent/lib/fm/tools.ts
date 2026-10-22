// The AI agent's facility-management tools: the same operations as the control room and the field app, so a question
// or an instruction by chat, WhatsApp or voice ("SWP-102 tripped again", "close WO-W24117, seal replaced", "approve the
// low-risk actions at the airport") does exactly what the screens do.
import type { Repo, ToolCtx } from "../core/tools";
import { act, actions, facilityState, myDay, overview, topIssues } from "./api";
import { fmToday, findAsset, isOpen, isOverdue, kpis, slaLeft, workload } from "./engine";
import type { FmData } from "./types";

const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const FAC = str("Facility: 'kcps' (Kinan Coastal Power Station), 'krsd' (Kinan Red Sea Desalination Plant), 'kgia' (Kinan Gulf International Airport T2), or its name. Defaults to the facility in focus.");

export const FM_TOOLS = [
  { name: "fm_overview", description: "Operations overview: every facility (or one) with availability, output vs target, open/overdue work, alarms, PM compliance, MTTR, people on shift, and the top issues.", input_schema: obj({ facility: FAC }) },
  { name: "fm_assets", description: "Search the asset register of a facility (pumps, turbines, transformers, RO trains, chillers, boarding bridges, escalators…) by tag, name, status (running/standby/degraded/down/maintenance), criticality (A/B/C) or system.", input_schema: obj({ facility: FAC, query: str("tag or words, e.g. 'P-101', 'intake pump', 'chiller'"), status: str(), criticality: str() }) },
  { name: "fm_asset", description: "Everything about one asset: live readings against their limits and 14-day trend, condition, planned maintenance, open and recent work orders, spares.", input_schema: obj({ asset: str("tag or name, e.g. 'SWP-102', 'boarding bridge gate 203'"), facility: FAC }, ["asset"]) },
  { name: "fm_work_orders", description: "List work orders: filter by facility, status (open/assigned/in_progress/on_hold/done), priority (P1–P4), asset, assignee name, or overdue only.", input_schema: obj({ facility: FAC, status: str(), priority: str(), asset: str(), assignee: str(), overdue: { type: "boolean" } }) },
  { name: "fm_raise_work_order", description: "Report a fault or request work on an asset: raises a work order with SLA by priority. Use when someone reports a problem ('pump 2 tripped', 'escalator handrail stopped'). Set asset_status to 'down' or 'degraded' when they say so. Attach photos with evidence_doc_ids.",
    input_schema: obj({ asset: str(), title: str("short title"), detail: str(), priority: str("P1 (output/safety, 4 h) · P2 (24 h) · P3 (72 h) · P4 (7 days)"), type: str("CM | Emergency | Inspection | PM"), asset_status: str("down | degraded"), assignee: str("technician name, optional"), facility: FAC, evidence_doc_ids: { type: "array", items: { type: "string" } } }, ["asset", "title"]) },
  { name: "fm_update_work_order", description: "Progress a work order: start it, put it on hold (with the reason), close it (done), reassign it, tick a checklist step (0-based index), add a note, attach photo evidence. Closing corrective work returns the asset to service.",
    input_schema: obj({ wo: str("e.g. WO-W24117"), status: str("in_progress | on_hold | done | assigned"), note: str(), hold_reason: str(), assignee: str(), checklist_step: { type: "number" }, evidence_doc_ids: { type: "array", items: { type: "string" } } }, ["wo"]) },
  { name: "fm_orchestrator", description: "The orchestration layer: list what it proposes for a facility (raise work from alarms, change over to standby, assign people, escalate SLA risks, order spares, issue permits) with the reasons and ids — or approve / reject one, or approve all low-risk ones. Approving executes it.",
    input_schema: obj({ facility: FAC, approve: str("action id, or 'low_risk' for all low-risk proposals"), reject: str("action id") }) },
  { name: "fm_team", description: "The team of a facility: who is on shift, where, doing what, and how many open jobs each has.", input_schema: obj({ facility: FAC }) },
  { name: "fm_my_jobs", description: "A technician's own day: their jobs in the order to do them, permits, alarms in their area. Defaults to the person using this agent.", input_schema: obj({ technician: str("name, optional") }) },
  { name: "fm_spares", description: "Spare parts of a facility: stock against minimum, on order, lead time; low_only for those below minimum.", input_schema: obj({ facility: FAC, low_only: { type: "boolean" } }) },
];

const J = (o: unknown) => { const s = JSON.stringify(o); return s.length > 14000 ? s.slice(0, 14000) + '…"(truncated)"' : s; };
function facilityOf(d: FmData, q: unknown, ctx: ToolCtx): string | undefined {
  const s = String(q ?? "").toLowerCase().trim();
  if (!s) return ctx.fm?.facilityId;
  return d.facilities.find((f) => f.id === s || f.name.toLowerCase().includes(s) || s.includes(f.sector) || (s.includes("power") && f.sector === "energy") || ((s.includes("desal") || s.includes("water")) && f.sector === "water") || (s.includes("airport") && f.sector === "airport"))?.id ?? ctx.fm?.facilityId;
}
const short = (d: FmData, w: FmData["workOrders"][number]) => ({ id: w.id, asset: d.assets.find((a) => a.id === w.assetId)?.tag, title: w.title, type: w.type, priority: w.priority, status: w.status, assignee: d.technicians.find((t) => t.id === w.assignee)?.name ?? null, due: w.due, slaHoursLeft: Math.round(slaLeft(w)), overdue: isOverdue(w), hold: w.holdReason, permit: w.permit });

export async function runFmTool(repo: Repo, name: string, input: Record<string, any>, ctx: ToolCtx): Promise<string> {
  // a tool that cannot do what was asked tells the agent why (no such asset, permit missing…) instead of failing the answer
  try { return await fmTool(repo, name, input, ctx); } catch (e) { return J({ error: (e as Error).message }); }
}
async function fmTool(repo: Repo, name: string, input: Record<string, any>, ctx: ToolCtx): Promise<string> {
  const db = repo.db, d = fmToday(db);
  const fid = facilityOf(d, input.facility, ctx);
  const by = ctx.author || "Agent";
  const channel = ctx.channel === "whatsapp" ? "whatsapp" : ctx.channel === "field" ? "field" : "web";
  switch (name) {
    case "fm_overview": {
      if (!fid) return J(overview(db));
      const f = d.facilities.find((x) => x.id === fid)!;
      return J({ facility: f.name, date: d.date, kpis: kpis(d, fid), efficiency: f.efficiency, topIssues: topIssues(d, fid), pendingActions: actions(db, d, fid).map((a) => ({ id: a.id, title: a.title, risk: a.risk })) });
    }
    case "fm_assets": {
      const q = String(input.query ?? "").toLowerCase();
      const xs = d.assets.filter((a) => (!fid || a.facilityId === fid) && (!input.status || a.status === input.status) && (!input.criticality || a.criticality === String(input.criticality).toUpperCase())
        && (!q || `${a.tag} ${a.name} ${a.class} ${d.systems.find((s) => s.id === a.systemId)?.name}`.toLowerCase().includes(q)));
      return J({ count: xs.length, assets: xs.slice(0, 40).map((a) => ({ tag: a.tag, name: a.name, status: a.status, criticality: a.criticality, condition: a.condition, zone: a.zone, nextPm: a.nextPm })) });
    }
    case "fm_asset": {
      const hit = findAsset(d, String(input.asset), fid);
      if (!hit.asset) return J({ error: hit.candidates.length ? "Several match — ask which one." : "No asset matches.", candidates: hit.candidates.map((a) => `${a.tag} ${a.name}`) });
      const a = hit.asset;
      return J({ ...a, system: d.systems.find((s) => s.id === a.systemId)?.name,
        readings: a.readings.map((r) => ({ name: r.name, value: r.value, unit: r.unit, low: r.low, high: r.high, outOfRange: (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low), trend14d: `${r.trend[0]} → ${r.trend[13]}` })),
        workOrders: d.workOrders.filter((w) => w.assetId === a.id).map((w) => short(d, w)), alarms: d.alarms.filter((x) => x.assetId === a.id), spares: d.spares.filter((s) => a.spares.includes(s.part) && s.facilityId === a.facilityId) });
    }
    case "fm_work_orders": {
      const asset = input.asset ? findAsset(d, String(input.asset), fid).asset : undefined;
      const who = input.assignee ? String(input.assignee).toLowerCase() : "";
      const xs = d.workOrders.filter((w) => (!fid || w.facilityId === fid) && (!input.status ? isOpen(w) : w.status === input.status) && (!input.priority || w.priority === String(input.priority).toUpperCase())
        && (!asset || w.assetId === asset.id) && (!who || (d.technicians.find((t) => t.id === w.assignee)?.name.toLowerCase().includes(who) ?? false)) && (!input.overdue || isOverdue(w)));
      return J({ count: xs.length, workOrders: xs.slice(0, 30).map((w) => short(d, w)) });
    }
    case "fm_raise_work_order": {
      const r = act(db, { action: "wo_create", facilityId: fid, asset: String(input.asset), title: input.title, detail: input.detail, priority: input.priority, type: input.type, assetStatus: input.asset_status, assignee: input.assignee, evidence: input.evidence_doc_ids }, by, channel);
      await repo.save();
      return J({ ok: true, message: r.message, note: "Tell the person the WO number and SLA; the orchestrator will propose who takes it if nobody was named." });
    }
    case "fm_update_work_order": {
      const r = act(db, { action: "wo_update", woId: input.wo, status: input.status, note: input.note, holdReason: input.hold_reason, assignee: input.assignee, checklist: input.checklist_step, evidence: input.evidence_doc_ids }, by, channel);
      await repo.save();
      return J({ ok: true, message: r.message });
    }
    case "fm_orchestrator": {
      if (input.approve || input.reject) {
        const ids = input.approve === "low_risk" ? actions(db, d, fid).filter((a) => a.risk === "low").map((a) => a.id) : [String(input.approve ?? input.reject)];
        const done: string[] = [];
        for (const id of ids) { try { done.push(act(db, { action: "decide", actionId: id, decision: input.reject ? "rejected" : "approved" }, by, channel).message); } catch (e) { done.push((e as Error).message); } }
        await repo.save();
        return J({ done, stillProposed: actions(db, fmToday(db), fid).map((a) => ({ id: a.id, title: a.title, risk: a.risk })) });
      }
      return J({ facility: fid, proposals: actions(db, d, fid).map((a) => ({ id: a.id, title: a.title, why: a.why, risk: a.risk, autopilotEligible: a.auto })) });
    }
    case "fm_team":
      return J(d.technicians.filter((t) => !fid || t.facilityId === fid).map((t) => ({ name: t.name, role: t.role, trades: t.trades, shift: t.shift, zone: t.zone, status: t.status, openJobs: workload(d, t.id) })));
    case "fm_my_jobs": {
      const t = input.technician ? d.technicians.find((x) => x.name.toLowerCase().includes(String(input.technician).toLowerCase())) : d.technicians.find((x) => x.id === ctx.fm?.techId);
      if (!t) return J({ error: "Which technician? (this agent is not linked to a person)" });
      const md = myDay(db, t.id);
      return J({ technician: t.name, brief: md.brief, jobs: md.jobs.map((w) => ({ ...short(d, w), asset: `${w.asset.tag} ${w.asset.name}`, zone: w.asset.zone, checklist: w.checklist })), alarmsNearby: md.alarms });
    }
    case "fm_spares":
      return J(d.spares.filter((s) => (!fid || s.facilityId === fid) && (!input.low_only || s.stock < s.min)));
  }
  return J({ error: `Unknown tool ${name}` });
}

/** The agent's instructions when it works for a facility (control room) or for one technician (personal field agent). */
export function fmSystemPrompt(db: Repo["db"], fm: { facilityId?: string; techId?: string }, channel: string, author: string) {
  const d = fmToday(db);
  const f = d.facilities.find((x) => x.id === fm.facilityId);
  const t = d.technicians.find((x) => x.id === fm.techId);
  const st = f ? facilityState(db, f.id) : null;
  return `You are the Kinan operations agent${f ? ` for ${f.name} (${f.capacity})` : ""}: an AI orchestration layer for running large infrastructure — maintenance, faults, people, spares and permits.
${t ? `You are the PERSONAL field agent of ${t.name}, ${t.role} (${t.trades.join(", ")}), ${t.shift} shift, based in ${t.zone}. Speak to them directly, as their assistant on the job: short, practical, safety first. Their jobs come from fm_my_jobs.` : `You support the control room and managers.`}
Today is ${d.date}. ${st ? `Right now: availability ${st.kpis.availability}% of critical assets, ${st.kpis.openWos} open work orders (${st.kpis.overdueWos} overdue), ${st.kpis.activeAlarms} unacknowledged alarms, ${st.actions.length} orchestrator proposals waiting.` : ""}

Rules:
- Use the fm_* tools for every fact; never invent readings, tags, people or work orders. Name tags and WO numbers.
- When someone reports a problem, raise it with fm_raise_work_order (priority from impact: P1 output/safety, P2 critical system degraded, P3 normal, P4 minor) and say the WO number and SLA. If they say it stopped or tripped, set asset_status down; if it runs badly, degraded.
- When someone says they started, paused (waiting for parts, permit) or finished a job, update it with fm_update_work_order. Finished corrective work returns the asset to service. Attach photo evidence ids when given.
- Never let anyone start electrical, hot, confined-space or height work without the permit: check the job's permit and say so plainly.
- For "what should we do" questions, read fm_orchestrator and explain its proposals and reasons; approve only when the user asks you to.
- ${channel === "whatsapp" ? "This is WhatsApp: plain text, short lines, *bold* for tags and WO numbers." : "Answer in 1–3 short sentences first, then the details that matter."}
- The user is ${author}.`;
}
