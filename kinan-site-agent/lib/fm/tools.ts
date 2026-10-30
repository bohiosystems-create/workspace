// The AI agent's facility-management tools: the same operations as the control room and the field app, so a question
// or an instruction by chat, WhatsApp or voice ("SWP-102 tripped again", "close WO-W24117, seal replaced", "approve the
// low-risk actions at the airport") does exactly what the screens do.
import { CATEGORY_LABEL, complaintInsights } from "./complaints";
import { scoreJobs, teamPlan } from "./priority";
import { connectionOf } from "../robots/adapter";
import type { Repo, ToolCtx } from "../core/tools";
import { act, actions, facilityState, myDay, overview, topIssues } from "./api";
import { fmToday, findAsset, isOpen, isOverdue, kpis, slaLeft, workload } from "./engine";
import type { FmData } from "./types";
import { canApprove } from "../auth/people";
import { fitJson } from "../core/fit";
import { dronesGrounded, teams, turnaround } from "./work";
import { simNow } from "../robots/sim";
import { CONTROL_LABEL, DOMAIN_OF, MISSION_LABEL } from "../robots/types";

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
  { name: "fm_update_work_order", description: "Progress a work order: start it, put it on hold (with the reason), close it (done), reassign it, tick a checklist step (0-based index), add a note, attach photo evidence. Closing corrective work returns the asset to service. On a predictive job (raised by the predictive engine), say whether the predicted fault was there: fault_found confirmed or not_found — the engine learns its precision from it.",
    input_schema: obj({ wo: str("e.g. WO-W24117"), status: oneOf(["in_progress", "on_hold", "done", "assigned"]), note: str(), hold_reason: str(), assignee: str(), checklist_step: { type: "integer", description: "0-based", minimum: 0, maximum: 50 }, evidence_doc_ids: { type: "array", items: { type: "string" } }, fault_found: oneOf(["confirmed", "not_found"], "predictive jobs: was the predicted fault there") }, ["wo"]) },
  { name: "fm_orchestrator", description: "The orchestration layer: list what it proposes for a facility (raise work from alarms, change over to standby, assign people, escalate SLA risks, order spares, issue permits) with the reasons and ids — or approve / reject one, or approve all low-risk ones. Approving executes it.",
    input_schema: obj({ facility: FAC, approve: str("action id, or 'low_risk' for all low-risk proposals"), reject: str("action id"), reason: oneOf(["not_now", "already_handled", "wrong_person", "too_costly", "disagree"], "for reject") }) },
  { name: "fm_team", description: "The team of a facility: who is on shift, where, doing what, and how many open jobs each has.", input_schema: obj({ facility: FAC }) },
  { name: "fm_my_jobs", description: "A technician's own day: their jobs in the order to do them, permits, alarms in their area. Defaults to the person using this agent.", input_schema: obj({ technician: str("name, optional") }) },
  { name: "fm_workforce", description: "Who and what can take work at a facility: the facility's own people, contractor crews on site (company, size, trades, record, current jobs) and robots (kind, sensors, hazardous-area rating, status, battery, mission). Use for 'who is free', 'which crews are on site', 'where are the robots', 'how is contractor X doing'.", input_schema: obj({ facility: FAC }) },
  { name: "fm_robots", description: "The robot fleet in detail: each robot's status, battery, where it is, today's missions (planned, running, done) with progress, and every finding (gas, heat, vibration, wall thickness) with its severity and any work raised from it.", input_schema: obj({ facility: FAC, robot: str("robot name, optional") }) },
  { name: "fm_robot_command", description: "Send a robot on a mission, cancel a mission, emergency-stop a robot or release the stop. Only robots certified for hazardous areas may enter them — the tool refuses otherwise and says which robot can go. Sending and cancelling need the facility's own staff; anyone signed in may stop a robot; releasing a stop is a supervisor's call.",
    input_schema: obj({ robot: str("robot name, e.g. 'Ex-2', 'Drone-1'"), command: oneOf(["send", "cancel", "estop", "release", "pilot", "control"]), pilot: str("the person piloting it, for a robot a person controls (send), or to put on a mission (pilot)"), control: oneOf(["policy", "supervised", "remote"], "for 'control': policy = the AI drives it by itself, supervised = the AI drives it and a person approves each mission, remote = a person pilots it"), zone: str("area name for 'send', e.g. 'Compression', 'Tank farm'"), asset: str("asset tag for 'send', optional"), mission: oneOf(["inspection_round", "gas_survey", "thermal_survey", "confined_precheck", "flare_inspection", "thickness_survey", "security_patrol", "alarm_check", "emissions_survey", "pipeline_patrol", "subsea_inspection", "valve_operation", "runway_inspection", "inline_inspection", "internal_inspection"], "for 'send'"), atc_clearance: str("air traffic control's clearance reference, needed to send a robot onto a live runway or taxiway"), mission_id: str("for 'cancel'; defaults to the robot's current mission"), facility: FAC }, ["robot", "command"]) },
  { name: "fm_turnaround", description: "A turnaround (planned shutdown) at a facility: progress, days left, each job with its crew or robot, what it waits for, its permit and gas test, people on site and the money committed in crew-days.", input_schema: obj({ facility: FAC }) },
  { name: "fm_gas_test", description: "Record a gas test on a job (by the gas tester or a supervisor): clear ('done') or gas found ('failed') with the reading. A clear test lets a job held for gas restart (its permit is re-issued); a failed one keeps it on hold.", input_schema: obj({ wo: str("e.g. WO-TAR06"), result: oneOf(["done", "failed"]), reading: str("what the detector read, e.g. 'LEL 0 %, H2S 0 ppm, O2 20.9 %'") }, ["wo", "result"]) },
  { name: "fm_complaints", description: "Tenants' and occupants' complaints at a facility (too hot, a leak, a lift stopping…): the open ones with what they are about, where, the equipment and the job they are linked to, plus the analysis — clusters (several about the same thing in one place, with what the equipment says there), categories this week against last, tenants who keep complaining, average time to resolve. With text, LOG a new complaint (when someone tells you about a problem in the building: who, where, what); it is classified, placed and tied to the equipment, and the orchestrator raises or links the work. With ids and status/category, update complaints (staff only).",
    input_schema: obj({ facility: FAC, text: str("to log one: the complaint in the tenant's words"), from: str("who: a tenant (lounge, café, airline) or 'Passenger'"), where: str("where, in their words: 'gate 206', 'lounge, Pier B'"), contact: str("e-mail or phone to tell them when it is fixed, optional"), channel: oneOf(["app", "whatsapp", "qr", "helpdesk", "email", "api"], "how it came in"), ids: { type: "array", items: { type: "string" }, description: "complaint ids, to update" }, status: oneOf(["open", "in_progress", "resolved"], "with ids"), category: oneOf(["temperature", "leak", "lift_escalator", "lighting", "cleaning", "odour", "noise", "power", "baggage", "access", "other"], "with ids: correct the category") }) },
  { name: "fm_routes", description: "Inspection routes the schedule designs by itself for the robot fleet: what is due (planned maintenance, the predictive engine's assets at risk, the inspection plan, findings to check again) given to the robots that can check it, each robot's round from its dock cut into sorties (start, minutes, distance, battery, airside in the closure), every waypoint with its coordinates, height or depth, heading and camera angle, the files each machine loads (DJI wayline KMZ, MAVLink .plan for PX4/ArduPilot drones and ArduSub underwater vehicles, VDA 5050 order, Open-RMF task), and the checks no robot can make. Or send them (send: a robot's name, or 'all') — each sortie becomes a mission sent to the machine in its own format. Use it for 'plan today's robot inspections', 'what will the drone fly', 'send the routes'.",
    input_schema: obj({ facility: FAC, robot: str("one robot's route in detail, optional"), send: str("a robot name, or 'all', to send the routes") }) },
  { name: "fm_inspection", description: "Inspection engineering for robots (from two reviews of inspection robotics in oil and gas): the facility's inspection plan — each surface that needs inspecting (tank roofs, shells and floors, pipelines inside and out, vessel internals, process piping, the flare), the damage expected there, the test method that finds it, the robots in the fleet that can do it with their caveats, when a robot last inspected it, and gaps. Or one asset only, or the reference: test methods (visual, UT, MFL, eddy current, radiography: what each finds, on which materials, what it misses) and robot types (climbing crawlers, pigs, in-pipe crawlers, drones, ROVs, in-service tank robots: what each reaches and its limits). Use it for 'which robot should inspect the tank floor', 'can the crawler climb that', 'how do we inspect the export line', 'why MFL and not UT'.",
    input_schema: obj({ facility: FAC, asset: str("asset tag, optional, e.g. 'T-701B', 'PL-01'"), reference: oneOf(["methods", "robots"], "the reference instead of the plan") }) },
  { name: "fm_predictive", description: "The predictive maintenance engine at a facility (or for one asset): each asset's health index and probability of failure within 30 days (from its readings and from its age), its remaining life (P10/P50/P90 days) and model (linear or accelerating since the onset), the failure mode diagnosed from its signals with the evidence and the action, anomalies, the cost of a failure and the expected loss, the day to act by, spares too short — and the engine's track record (backtest on past failures: seen coming, warning days, error, band coverage, false alarms) and the technicians' verdicts on its jobs. Use it for 'what is going to fail', 'how long has P-101 got', 'why do you think it's the bearing', 'how accurate are the predictions'.",
    input_schema: obj({ facility: FAC, asset: str("asset tag, optional — one asset in detail") }) },
  { name: "fm_team_plan", description: "The team's priorities at a facility, set automatically: every open job scored (priority, critical equipment, down or degraded, SLA left, safety, tenant complaints, predicted failure) with its reasons and the priority it should have; and the plan for each technician on shift — what they are on now and what comes next, including unassigned jobs suggested for them. Use it for 'what should the team do first', 'who is doing what', 'why is this job first'.",
    input_schema: obj({ facility: FAC }) },
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
  const log = () => repo.db.fmLog ?? [], before = log()[log().length - 1]?.id;
  try {
    const out = await fmTool(repo, name, input, ctx);
    // what the agent changed goes where the app's own changes go: missions and stops to the robots, the rest northbound
    const i = log().findIndex((e) => e.id === before), fresh = before ? (i >= 0 ? log().slice(i + 1) : []) : log().slice();
    if (fresh.length) {
      const { toFleet } = await import("../robots/dispatch"), { publishAfter } = await import("../integrations/outbound");
      const fleet = await toFleet(repo.db, fresh);
      if (log()[log().length - 1]?.id !== fresh[fresh.length - 1].id) await repo.save();
      await publishAfter(repo);
      if (fleet) return out.replace(/\}$/, `,"fleet":${JSON.stringify(fleet.trim())}}`);
    }
    return out;
  } catch (e) { return J({ error: (e as Error).message }); }
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
      const r = act(db, { action: "wo_update", woId: input.wo, status: input.status, note: input.note, holdReason: input.hold_reason, assignee: input.assignee, checklist: input.checklist_step, evidence: input.evidence_doc_ids, pdmOutcome: input.fault_found }, by, channel, ctx.user);
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
      return J({ robots: rs.map((r) => ({ name: r.name, model: r.model, maker: r.vendor, domain: DOMAIN_OF[r.kind], usedFor: r.roles, operatedBy: r.operator, runsOn: r.platform, connection: (({ adapter, mode, can, jobs, places, limits }) => ({ adapter, reports: mode === "pull" ? "asked every minute" : mode === "push" ? "sends as it happens" : "simulated", can, jobs: jobs.map((k) => MISSION_LABEL[k]), onlyTo: places, limits }))(connectionOf(r)), status: r.status, battery: r.battery, area: d.zones.find((z) => z.id === r.zone)?.name, estop: !!r.estop,
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
    case "fm_complaints": {
      if (input.text) {
        const r = act(db, { action: "complaint", facilityId: fid ?? undefined, complaint: { text: input.text, from: input.from, where: input.where, contact: input.contact, channel: input.channel ?? (ctx.channel === "whatsapp" ? "whatsapp" : "app") } }, by, channel, ctx.user);
        await repo.save();
        return J({ ok: true, message: r.message });
      }
      if (input.ids?.length) {
        const r = act(db, { action: "complaint_update", complaint: { ids: input.ids, status: input.status, category: input.category } }, by, channel, ctx.user);
        await repo.save();
        return J({ ok: true, message: r.message });
      }
      if (!fid) return J({ error: "Which facility?" });
      const tag = (id?: string) => d.assets.find((a) => a.id === id)?.tag;
      const ins = complaintInsights(d, fid);
      return J({ facility: fid, open: d.complaints.filter((c) => c.facilityId === fid && c.status !== "resolved").map((c) => ({ id: c.id, at: c.at.slice(0, 16).replace("T", " ") + " UTC", from: c.from, where: c.where ?? c.zone, what: c.text, category: CATEGORY_LABEL[c.category], severity: c.severity, equipment: tag(c.assetId), job: c.woId, status: c.status })),
        analysis: { ...ins, perDay: ins.perDay.map((x) => `${x.day.slice(5)}: ${x.n}`).join(", "), clusters: ins.clusters.map((c) => ({ about: CATEGORY_LABEL[c.category], where: c.zone, complaints: c.ids.length, equipment: tag(c.assetId), job: c.woId, equipmentSays: c.signal })) } });
    }
    case "fm_routes": {
      if (!fid) return J({ error: "Which facility?" });
      if (input.send) {
        const all = String(input.send).trim().toLowerCase() === "all";
        const r = act(db, { action: "routes_send", facilityId: fid, robotIds: all ? [] : [String(input.send)] }, by, channel, ctx.user);
        await repo.save();
        return J({ ok: true, message: r.message });
      }
      const { planRoutes } = await import("../robots/routes");
      const p = planRoutes(d, fid);
      const want = String(input.robot ?? "").trim().toLowerCase();
      const rs = p.routes.filter((x) => !want || x.name.toLowerCase() === want);
      if (want && !rs.length) return J({ error: `No route for ${input.robot}: ${p.routes.length ? `routes today for ${p.routes.map((x) => x.name).join(", ")}` : "nothing due needs a robot's check"}.` });
      return J({ facility: fid, assetsToCheck: p.tasks.length, frame: { ...p.frame, note: p.frame.demo ? "demo coordinates — set SITE_FRAMES before flying" : "surveyed" },
        routes: rs.map((x) => ({ robot: x.name, model: x.model, files: x.formats, sendable: x.sendable, how: x.sendNote, assets: x.tasks,
          sorties: x.sorties.map((so) => ({ n: so.n, start: so.start, minutes: so.durationMin, metres: so.distanceM, battery: `${so.batteryPct}%`, airside: so.airside,
            waypoints: so.points.filter((pt) => pt.kind !== "dock").slice(0, want ? 40 : 8).map((pt) => ({ seq: pt.seq, what: pt.label, checks: pt.checks, lat: pt.lat, lon: pt.lon, ...(pt.altM !== undefined ? { heightM: pt.altM, cameraPitch: pt.gimbalPitchDeg } : {}), ...(pt.depthM !== undefined ? { depthM: pt.depthM } : {}), why: pt.reasons?.slice(0, 2) })) })) })),
        noRobotCan: p.uncovered });
    }
    case "fm_inspection": {
      const K = await import("../robots/inspection");
      if (input.reference === "methods") return J({ methods: K.METHODS, sources: K.SOURCES });
      if (input.reference === "robots") return J({ robotTypes: Object.fromEntries(Object.entries(K.LOCOMOTION).map(([k, v]) => [k, { ...v, reaches: v.reaches.map((x) => K.SURFACE_LABEL[x]) }])), autonomy: K.AUTONOMY_LEVEL, sources: K.SOURCES });
      if (!fid) return J({ error: "Which facility?" });
      const want = String(input.asset ?? "").trim().toLowerCase();
      const rows = K.inspectionPlan(d, fid).filter((r) => !want || r.target.tag.toLowerCase() === want);
      if (want && !rows.length) return J({ error: `No inspection targets for ${input.asset} here — the plan covers tanks, pipelines, vessels and columns, and the flare.` });
      return J({ facility: fid, surfaces: rows.map((r) => ({ asset: `${r.target.tag} ${r.target.name}`, part: r.target.part, reach: K.SURFACE_LABEL[r.target.surface], damage: r.target.damage, methods: r.target.methods.map((m) => K.METHODS[m].name),
        robots: r.robots.map((x) => ({ robot: x.name, method: K.METHODS[x.method].name, autonomy: x.autonomy, cautions: x.cautions })), lastInspectedByRobot: r.last, gap: r.gap })),
        gaps: rows.filter((r) => r.gap).length, sources: K.SOURCES });
    }
    case "fm_predictive": {
      if (!fid) return J({ error: "Which facility?" });
      const { pdmReport, healthText } = await import("./pdm");
      const r = pdmReport(d, fid);
      const want = String(input.asset ?? "").trim().toLowerCase();
      const pick = want ? r.assets.filter((a) => a.tag.toLowerCase() === want) : r.assets.filter((a) => a.p30 >= 0.15 || a.series.some((x) => x.status !== "stable" && x.status !== "reset")).slice(0, 15);
      if (want && !pick.length) return J({ error: `${input.asset} isn't watched by the predictive engine here (only running equipment with condition readings).` });
      return J({ facility: fid, watched: r.assets.length, atRisk30d: r.atRisk, expectedCostOfFailures30d: `SAR ${r.expectedLoss.toLocaleString("en-US")}`, history: r.sources.historian ? `${r.sources.historian} readings from the plant historian, ${r.sources.demo} from the demo history` : "demo history (no historian connected)",
        assets: pick.map((a) => ({ summary: healthText(a), health: a.health, p30: a.p30, fromReadings: a.pCondition, fromAge: a.pAge, remainingLife: a.rul, diagnosis: a.diagnosis ? { mode: a.diagnosis.name, score: a.diagnosis.score, evidence: a.diagnosis.evidence, action: a.diagnosis.action, precisionSoFar: a.diagnosis.precision } : undefined,
          alternatives: a.alternatives.map((m) => `${m.name} (${Math.round(m.score * 100)} %)`), costOfFailure: a.failureCost, expectedLoss30d: a.expectedLoss, actBy: a.actBy, spareShort: a.spareShort, openJob: a.openWo,
          readings: a.series.filter((x) => x.status !== "stable").map((x) => ({ reading: x.name, value: `${x.value} ${x.unit}`, limit: x.limit, status: x.status, onsetDaysAgo: x.onsetDaysAgo, model: x.model, fit: x.fit, ratePerDay: x.rate, remainingLife: x.rul, p7: x.p7, p30: x.p30, anomalySigma: x.z })) })),
        trackRecord: { pastFailures: r.backtest.failures, seenComing: r.backtest.detectionRate, medianWarningDays: r.backtest.medianLeadDays, remainingLifeErrorDays: r.backtest.maeDays, insideP10P90: r.backtest.coverage, falseAlarms: r.backtest.falseAlarmRate, note: "held-out half of the past failures in the history" },
        technicianVerdicts: r.feedback,
        note: "Onset by CUSUM; linear or accelerating model (AICc); remaining life combines the fitted rate with the P–F interval and is recalibrated on the backtest; diagnosis from the failure-mode library; Weibull age risk; cost = hours down × hourly cost by criticality + repair (demo assumptions). The orchestrator raises a predictive job before the crossing, brings planned maintenance forward, or orders the spare." });
    }
    case "fm_team_plan": {
      if (!fid) return J({ error: "Which facility?" });
      const t = (id: string) => d.workOrders.find((w) => w.id === id);
      const tp = teamPlan(d, fid);
      return J({ facility: fid, jobs: scoreJobs(d, fid).slice(0, 25).map((x) => ({ job: x.woId, title: t(x.woId)?.title, score: x.score, priority: x.priority, shouldBe: x.suggested, why: x.reasons.join(", "), blocked: x.blocked })),
        plan: tp.rows.map((r) => ({ technician: `${r.tech.name} (${r.tech.role})`, now: r.now ? `${r.now.woId} ${r.now.title}` : null, next: r.next.map((x) => `${x.woId}${x.suggestedFor ? " (suggested, unassigned)" : ""} — ${x.title}`) })),
        nobodyFits: tp.unplanned.map((x) => `${x.woId} ${x.title}`) });
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
- Robot routes (fm_routes): the schedule designs each robot's inspection round by itself; say who goes where, when, for how long and why (the reasons on the waypoints), which files each machine loads, and what no robot can check (a technician does it). Send routes only when asked; a piloted robot's route waits for its pilot.
- Inspection (fm_inspection): pick the robot by the surface and the damage, not by what is free — a magnetic crawler climbs carbon steel only; drones see surfaces, they don't measure walls; MFL says where metal is lost, UT how much; a tank floor can be inspected in service by a tank robot instead of emptying the tank for weeks; inside vessels and piping only after isolation and a clear gas test. Name the method's blind spot when it matters, and cite the reviews when asked why.
- Facility management is agentic: fm_predictive is the predictive engine — say the remaining life as a range (P50, with P10–P90) and the probability, name the failure mode and its evidence, and when asked how sure it is, give its track record (backtest) and the technicians' verdicts; a reading already past its limit is failing, not predicted. When a predictive job is closed, ask whether the fault was there (fault_found) — the engine learns from it; fm_team_plan says what the team should do first and why (the scores set priorities by themselves); fm_complaints logs and analyses tenants' complaints — when someone reports a problem in the building, log it with fm_complaints (who, where, what) and say what happens next.
- The fleet has many makers (land, air, sea): treat them as one. Say which robot and which maker when it matters. Security alerts (fm_security): a robot checks first where it can, security responds; an unidentified drone is reported to the authorities, never chased, and our own drones stay down meanwhile. At an airport: live runways and taxiways only in the nightly closure or with air traffic control's clearance; drones never fly indoors; an unidentified drone near the airfield goes to air traffic control and the police; birds and debris on the airfield are airside safety, told to the tower.
- Gas: no hot work where there is flammable gas; no entry to a confined space before a clear gas test. If the orchestrator proposes stopping work for gas, say so first. A gas test is recorded with fm_gas_test.
- Contractors' people carry out and report their own crew's work; they approve no client decision. Say which contractor a crew belongs to and its record when it matters.
- Anyone may emergency-stop a robot (fm_robot_command estop) — do it at once when someone asks or reports danger near one.
- For "what should we do" questions, read fm_orchestrator and explain its proposals and reasons; approve or reject only when the user asks you to. Approval limits apply (the tool says whether this user may approve each one); if not, say who can. When they reject, ask why in one word if they didn't say (not now, already handled, wrong person, too costly, disagree) — the orchestrator learns from it.
- ${channel === "whatsapp" ? "This is WhatsApp: plain text, short lines, *bold* for tags and WO numbers." : "Answer in 1–3 short sentences first, then the details that matter."}
- The user is ${author}.`;
}
