// The AI agent's facility-management tools: the same operations as the control room and the field app, so a question
// or an instruction by chat, WhatsApp or voice ("SWP-102 tripped again", "close WO-W24117, seal replaced", "approve the
// low-risk actions at the airport") does exactly what the screens do.
import type { Repo, ToolCtx } from "../core/tools";
import { act, actions, facilityState, myDay, overview, topIssues } from "./api";
import { fmToday, findAsset, isOpen, isOverdue, kpis, slaLeft, workload } from "./engine";
import type { FmData } from "./types";
import { canApprove } from "../auth/people";
import { fitJson } from "../core/fit";
import { dronesGrounded, teams, turnaround } from "./work";
import { simNow } from "../robots/sim";
import { CONTROL_LABEL, DOMAIN_OF } from "../robots/types";

const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const oneOf = (values: string[], description?: string) => ({ type: "string", enum: values, ...(description ? { description } : {}) });
const FAC = str("Facility: 'kcps' (Kinan Coastal Power Station), 'krsd' (Kinan Red Sea Desalination Plant), 'kgia' (Kinan Gulf International Airport T2), 'kgpp' (Kinan Gas Processing Plant), or its name. Defaults to the facility in focus.");

export const FM_TOOLS = [
  { name: "fm_overview", description: "Operations overview: every facility (or one) with availability, output vs target, open/overdue work, alarms, PM compliance, MTTR, people on shift, and the top issues.", input_schema: obj({ facility: FAC }) },
  { name: "fm_assets", description: "Search the asset register of a facility (pumps, turbines, transformers, RO trains, chillers, boarding bridges, escalators…) by tag, name, status (running/standby/degraded/down/maintenance), criticality (A/B/C) or system.", input_schema: obj({ facility: FAC, query: str("tag or words, e.g. 'P-101', 'intake pump', 'chiller'"), status: oneOf(["running", "standby", "degraded", "down", "maintenance"]), criticality: oneOf(["A", "B", "C"]) }) },
  { name: "fm_asset", description: "Everything about one asset: live readings against their limits and 14-day trend, condition, planned maintenance, open and recent work orders, spares.", input_schema: obj({ asset: str("tag or name, e.g. 'SWP-102', 'boarding bridge gate 203'"), facility: FAC }, ["asset"]) },
  { name: "fm_work_orders", description: "List work orders: filter by facility, status (open/assigned/in_progress/on_hold/done), priority (P1–P4), asset, assignee name, or overdue only.", input_schema: obj({ facility: FAC, status: oneOf(["open", "assigned", "in_progress", "on_hold", "done"]), priority: oneOf(["P1", "P2", "P3", "P4"]), asset: str(), assignee: str(), overdue: { type: "boolean" } }) },
  { name: "fm_raise_work_order", description: "Report a fault or request work on an asset: raises a work order with SLA by priority. Use when someone reports a problem ('pump 2 tripped', 'escalator handrail stopped'). Set asset_status to 'down' or 'degraded' when they say so. Attach photos with evidence_doc_ids.",
    input_schema: obj({ asset: str(), title: str("short title"), detail: str(), priority: oneOf(["P1", "P2", "P3", "P4"], "P1 (output/safety, 4 h) · P2 (24 h) · P3 (72 h) · P4 (7 days)"), type: oneOf(["CM", "Emergency", "Inspection", "PM"]), asset_status: oneOf(["down", "degraded"]), assignee: str("technician name, optional"), facility: FAC, evidence_doc_ids: { type: "array", items: { type: "string" } } }, ["asset", "title"]) },
  { name: "fm_update_work_order", description: "Progress a work order: start it, put it on hold (with the reason), close it (done), reassign it, tick a checklist step (0-based index), add a note, attach photo evidence. Closing corrective work returns the asset to service.",
    input_schema: obj({ wo: str("e.g. WO-W24117"), status: oneOf(["in_progress", "on_hold", "done", "assigned"]), note: str(), hold_reason: str(), assignee: str(), checklist_step: { type: "integer", description: "0-based", minimum: 0, maximum: 50 }, evidence_doc_ids: { type: "array", items: { type: "string" } } }, ["wo"]) },
  { name: "fm_orchestrator", description: "The orchestration layer: list what it proposes for a facility (raise work from alarms, change over to standby, assign people, escalate SLA risks, order spares, issue permits) with the reasons and ids — or approve / reject one, or approve all low-risk ones. Approving executes it.",
    input_schema: obj({ facility: FAC, approve: str("action id, or 'low_risk' for all low-risk proposals"), reject: str("action id"), reason: oneOf(["not_now", "already_handled", "wrong_person", "too_costly", "disagree"], "for reject") }) },
  { name: "fm_team", description: "The team of a facility: who is on shift, where, doing what, and how many open jobs each has.", input_schema: obj({ facility: FAC }) },
  { name: "fm_my_jobs", description: "A technician's own day: their jobs in the order to do them, permits, alarms in their area. Defaults to the person using this agent.", input_schema: obj({ technician: str("name, optional") }) },
  { name: "fm_workforce", description: "Who and what can take work at a facility: the facility's own people, contractor crews on site (company, size, trades, record, current jobs) and robots (kind, sensors, hazardous-area rating, status, battery, mission). Use for 'who is free', 'which crews are on site', 'where are the robots', 'how is contractor X doing'.", input_schema: obj({ facility: FAC }) },
  { name: "fm_robots", description: "The robot fleet in detail: each robot's status, battery, where it is, today's missions (planned, running, done) with progress, and every finding (gas, heat, vibration, wall thickness) with its severity and any work raised from it.", input_schema: obj({ facility: FAC, robot: str("robot name, optional") }) },
  { name: "fm_robot_command", description: "Send a robot on a mission, cancel a mission, emergency-stop a robot or release the stop. Only robots certified for hazardous areas may enter them — the tool refuses otherwise and says which robot can go. Sending and cancelling need the facility's own staff; anyone signed in may stop a robot; releasing a stop is a supervisor's call.",
    input_schema: obj({ robot: str("robot name, e.g. 'Ex-2', 'Drone-1'"), command: oneOf(["send", "cancel", "estop", "release", "pilot", "control"]), pilot: str("the person piloting it, for a robot a person controls (send), or to put on a mission (pilot)"), control: oneOf(["policy", "supervised", "remote"], "for 'control': policy = the AI drives it by itself, supervised = the AI drives it and a person approves each mission, remote = a person pilots it"), zone: str("area name for 'send', e.g. 'Compression', 'Tank farm'"), asset: str("asset tag for 'send', optional"), mission: oneOf(["inspection_round", "gas_survey", "thermal_survey", "confined_precheck", "flare_inspection", "thickness_survey", "security_patrol", "alarm_check", "emissions_survey", "pipeline_patrol", "subsea_inspection", "valve_operation", "runway_inspection"], "for 'send'"), atc_clearance: str("air traffic control's clearance reference, needed to send a robot onto a live runway or taxiway"), mission_id: str("for 'cancel'; defaults to the robot's current mission"), facility: FAC }, ["robot", "command"]) },
  { name: "fm_turnaround", description: "A turnaround (planned shutdown) at a facility: progress, days left, each job with its crew or robot, what it waits for, its permit and gas test, people on site and the money committed in crew-days.", input_schema: obj({ facility: FAC }) },
  { name: "fm_gas_test", description: "Record a gas test on a job (by the gas tester or a supervisor): clear ('done') or gas found ('failed') with the reading. A clear test lets a job held for gas restart (its permit is re-issued); a failed one keeps it on hold.", input_schema: obj({ wo: str("e.g. WO-TAR06"), result: oneOf(["done", "failed"]), reading: str("what the detector read, e.g. 'LEL 0 %, H2S 0 ppm, O2 20.9 %'") }, ["wo", "result"]) },
  { name: "fm_security", description: "Security at a facility: today's alerts (fence sensors, cameras, a drone seen over the plant) with their status (open, checking, cleared, escalated) and what the patrol robots found; with alert and status, mark one checking, cleared or escalated. An unidentified drone is reported to the authorities — the plant does not chase it, and its own drones stay on the ground meanwhile.",
    input_schema: obj({ facility: FAC, alert: str("alert id, e.g. 'SA-261028-3', to update one"), status: oneOf(["checking", "cleared", "escalated"], "with alert"), note: str("what was seen, optional") }) },
  { name: "fm_spares", description: "Spare parts of a facility: stock against minimum, on order, lead time; low_only for those below minimum.", input_schema: obj({ facility: FAC, low_only: { type: "boolean" } }) },
];

const J = (o: unknown) => fitJson(o);
function facilityOf(d: FmData, q: unknown, ctx: ToolCtx): string | undefined {
  const s = String(q ?? "").toLowerCase().trim();
  if (!s) return ctx.fm?.facilityId;
  return d.facilities.find((f) => f.id === s || f.name.toLowerCase().includes(s) || s.includes(f.sector) || (s.includes("power") && f.sector === "energy") || ((s.includes("desal") || s.includes("water")) && f.sector === "water") || (s.includes("airport") && f.sector === "airport") || ((s.includes("gas") || s.includes("oil")) && f.sector === "oil_gas"))?.id ?? ctx.fm?.facilityId;
}
const short = (d: FmData, w: FmData["workOrders"][number]) => ({ id: w.id, asset: d.assets.find((a) => a.id === w.assetId)?.tag, title: w.title, type: w.type, priority: w.priority, status: w.status, assignee: d.technicians.find((t) => t.id === w.assignee)?.name ?? null, due: w.due, slaHoursLeft: Math.round(slaLeft(w)), overdue: isOverdue(w), hold: w.holdReason, permit: w.permit });

/** Called by runTool, after the input has been checked against the tool's schema (lib/core/validate.ts). */
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
      const r = act(db, { action: "wo_update", woId: input.wo, status: input.status, note: input.note, holdReason: input.hold_reason, assignee: input.assignee, checklist: input.checklist_step, evidence: input.evidence_doc_ids }, by, channel, ctx.user);
      await repo.save();
      return J({ ok: true, message: r.message });
    }
    case "fm_orchestrator": {
      if (input.approve || input.reject) {
        const ids = input.approve === "low_risk" ? actions(db, d, fid).filter((a) => a.risk === "low").map((a) => a.id) : [String(input.approve ?? input.reject)];
        const done: string[] = [];
        for (const id of ids) { try { done.push(act(db, { action: "decide", actionId: id, decision: input.reject ? "rejected" : "approved", reason: input.reason }, by, channel, ctx.user).message); } catch (e) { done.push((e as Error).message); } }
        await repo.save();
        return J({ done, stillProposed: actions(db, fmToday(db), fid).map((a) => ({ id: a.id, title: a.title, risk: a.risk })) });
      }
      return J({ facility: fid, user: ctx.user ? `${ctx.user.name} (${ctx.user.role})` : "not signed in — can't approve", proposals: actions(db, d, fid).map((a) => ({ id: a.id, title: a.title, why: a.why, risk: a.risk, cost: a.cost, autopilotEligible: a.auto, userMayApprove: canApprove(ctx.user, { domain: "fm", facilityId: a.facilityId, risk: a.risk, cost: a.cost, kind: a.kind, party: a.party }) })) });
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
    case "fm_workforce": {
      const at = <T extends { facilityId: string }>(xs: T[]) => xs.filter((x) => !fid || x.facilityId === fid);
      return J({ facility: fid,
        teams: fid ? teams(d, fid) : undefined,
        robots: at(d.robots).map((r) => ({ name: r.name, kind: r.kind, maker: r.vendor, domain: DOMAIN_OF[r.kind], usedFor: r.roles, controlledBy: CONTROL_LABEL[r.autonomy], ...(r.pilotRole ? { needsPilot: r.pilotRole } : {}), sensors: r.capabilities, hazardousAreas: r.exRated ? "certified" : "not allowed", status: r.status, battery: r.battery, area: d.zones.find((z) => z.id === r.zone)?.name, mission: d.missions.find((m) => m.id === r.missionId)?.title })),
        crews: at(d.crews).map((c) => { const k = d.contractors.find((x) => x.id === c.contractorId)!; return { name: c.name, contractor: k.name, record: k.performance.rating, onTimePct: k.performance.onTimePct, people: c.size, trades: c.trades, status: c.status, area: c.zone, lead: c.lead, jobs: d.workOrders.filter((w) => w.crew === c.id && isOpen(w)).map((w) => `${w.id} ${w.title} (${w.status})`) }; }),
        people: at(d.technicians).filter((t) => t.shift !== "off").map((t) => ({ name: t.name, role: t.role, status: t.status, area: t.zone, openJobs: workload(d, t.id) })),
        contractors: at(d.contractors).map((k) => ({ name: k.name, scope: k.scope, contract: k.contractRef, until: k.until, dayRate: k.dayRate, ...k.performance })) });
    }
    case "fm_robots": {
      const rs = d.robots.filter((r) => (!fid || r.facilityId === fid) && (!input.robot || r.name.toLowerCase() === String(input.robot).toLowerCase()));
      if (!rs.length) return J({ error: input.robot ? `No robot called ${input.robot}.` : "No robots at this facility." });
      return J({ robots: rs.map((r) => ({ name: r.name, model: r.model, maker: r.vendor, domain: DOMAIN_OF[r.kind], usedFor: r.roles, operatedBy: r.operator, runsOn: r.platform, connection: r.adapter, status: r.status, battery: r.battery, area: d.zones.find((z) => z.id === r.zone)?.name, estop: !!r.estop,
        missions: d.missions.filter((m) => m.robotId === r.id).map((m) => ({ id: m.id, title: m.title, start: m.plannedStart.slice(11, 16) + " UTC", status: m.status, progress: m.progress, forJob: m.woId, findings: m.findings.map((f) => ({ severity: f.severity, what: f.label, workRaised: f.woId ?? null })) })) })) });
    }
    case "fm_robot_command": {
      const r = d.robots.find((x) => x.name.toLowerCase() === String(input.robot).toLowerCase() && (!fid || x.facilityId === fid)) ?? d.robots.find((x) => x.name.toLowerCase() === String(input.robot).toLowerCase());
      if (!r) return J({ error: `No robot called ${input.robot}. Robots: ${d.robots.filter((x) => !fid || x.facilityId === fid).map((x) => x.name).join(", ")}.` });
      const c = input.command;
      const r2 = c === "send" ? act(db, { action: "mission", robotId: r.id, zone: input.zone, asset: input.asset, missionKind: input.mission, atcClearance: input.atc_clearance, pilotId: input.pilot }, by, channel, ctx.user)
        : c === "pilot" ? act(db, { action: "pilot", missionId: input.mission_id ?? d.missions.find((m) => m.robotId === r.id && (m.status === "planned" || m.status === "running"))?.id, pilotId: input.pilot }, by, channel, ctx.user)
        : c === "control" ? act(db, { action: "control", robotId: r.id, control: input.control }, by, channel, ctx.user)
        : c === "cancel" ? act(db, { action: "mission_abort", missionId: input.mission_id ?? r.missionId ?? d.missions.find((m) => m.robotId === r.id && m.status === "planned")?.id }, by, channel, ctx.user)
        : act(db, { action: "estop", robotId: r.id, on: c === "estop", note: c === "estop" ? `Stopped by ${by} (${channel})` : undefined }, by, channel, ctx.user);
      await repo.save();
      return J({ ok: true, message: r2.message });
    }
    case "fm_security": {
      if (input.alert) {
        const r = act(db, { action: "security", alertId: String(input.alert).toUpperCase(), alertStatus: input.status, note: input.note }, by, channel, ctx.user);
        await repo.save();
        return J({ ok: true, message: r.message });
      }
      const xs = d.securityAlerts.filter((a) => !fid || a.facilityId === fid);
      return J({ facility: fid, dronesGrounded: !!dronesGrounded(d, fid ?? xs[0]?.facilityId ?? "", simNow(d.date)),
        alerts: xs.map((a) => ({ id: a.id, at: a.at.slice(11, 16) + " UTC", kind: a.kind, where: d.zones.find((z) => z.id === a.zone)?.name, source: a.source, what: a.text, status: a.status, checkedBy: d.missions.find((m) => m.id === a.missionId)?.title, note: a.note })),
        patrols: d.missions.filter((m) => (!fid || m.facilityId === fid) && (m.kind === "security_patrol" || m.kind === "alarm_check")).map((m) => ({ id: m.id, robot: d.robots.find((r) => r.id === m.robotId)?.name, title: m.title, start: m.plannedStart.slice(11, 16) + " UTC", status: m.status, combinedWith: m.combined })) });
    }
    case "fm_turnaround": {
      const pk = [...new Set(d.workOrders.filter((w) => w.package && (!fid || w.facilityId === fid)).map((w) => w.package!))];
      if (!pk.length) return J({ error: "No turnaround at this facility." });
      return J({ turnarounds: pk.map((x) => turnaround(d, x)) });
    }
    case "fm_gas_test": {
      const r = act(db, { action: "gas_test", woId: input.wo, result: input.result, reading: input.reading }, by, channel, ctx.user);
      await repo.save();
      return J({ ok: true, message: r.message });
    }
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
- Work is done by the facility's own people, contractor crews and robots (fm_workforce). Robots go first where a check can keep people out of danger: gas tests, pre-entry checks, rounds in hazardous areas. Only Ex-certified robots enter hazardous areas. When a robot finds something, say what, where and when, and the work raised from it.
- Teams come in every shape: people only; robots only, driven by the AI; people working with an AI-controlled robot beside them (a gas watch that stops the job if it reads gas); and people piloting robots (a drone or ROV pilot, a robot operator) — a piloted robot's mission waits until its pilot is on it. fm_workforce lists the teams; fm_robot_command sends with a pilot, puts a pilot on a mission, or switches who controls a robot (a supervisor's call).
- The fleet has many makers (land, air, sea): treat them as one. Say which robot and which maker when it matters. Security alerts (fm_security): a robot checks first where it can, security responds; an unidentified drone is reported to the authorities, never chased, and our own drones stay down meanwhile. At an airport: live runways and taxiways only in the nightly closure or with air traffic control's clearance; drones never fly indoors; an unidentified drone near the airfield goes to air traffic control and the police; birds and debris on the airfield are airside safety, told to the tower.
- Gas: no hot work where there is flammable gas; no entry to a confined space before a clear gas test. If the orchestrator proposes stopping work for gas, say so first. A gas test is recorded with fm_gas_test.
- Contractors' people carry out and report their own crew's work; they approve no client decision. Say which contractor a crew belongs to and its record when it matters.
- Anyone may emergency-stop a robot (fm_robot_command estop) — do it at once when someone asks or reports danger near one.
- For "what should we do" questions, read fm_orchestrator and explain its proposals and reasons; approve or reject only when the user asks you to. Approval limits apply (the tool says whether this user may approve each one); if not, say who can. When they reject, ask why in one word if they didn't say (not now, already handled, wrong person, too costly, disagree) — the orchestrator learns from it.
- ${channel === "whatsapp" ? "This is WhatsApp: plain text, short lines, *bold* for tags and WO numbers." : "Answer in 1–3 short sentences first, then the details that matter."}
- The user is ${author}.`;
}
