// The work layer: who (or what) does each job, and what keeps it safe. People, contractor crews and robots are all
// workers here — matched to a job by what it needs (skills, a sensor, access to a hazardous area) — and the safety
// rules that apply to all of them: no hot work where there is gas, nobody into a space that hasn't been checked, no
// robot where it isn't certified to go, nothing started before the jobs it waits for are finished. The orchestrator
// (orchestrator.ts) turns these into proposals with their reasons; approved, they become events like everything else.
import type { Action, Crew, FmData, FmEvent, Priority, WorkOrder, ZoneDef } from "./types";
import type { Capability, Finding, Mission, Robot, Waypoint } from "../robots/types";
import { CAPABILITY_LABEL, CONTROL_LABEL, DOMAIN_OF, MISSION_LABEL } from "../robots/types";
import { nearLimit } from "../robots/sim";
import { GAS_HOLD, PRIORITY_SLA, bestTech, clearGasHold, isOpen } from "./engine";
import { ruleMatches, type Rule } from "./rules";

const MIN = 60_000;
/** A time as the plant reads it (Riyadh, UTC+3). */
const local = (iso?: string) => (iso ? new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(11, 16) : "");

// ------------------------------------------------------------------ places
export const zoneNamed = (d: FmData, facilityId: string, name?: string) => d.zones.find((z) => z.facilityId === facilityId && z.name === name);
/** Where a job is: its own zone, or its asset's. */
export const zoneOfWo = (d: FmData, w: WorkOrder) => zoneNamed(d, w.facilityId, w.zone ?? d.assets.find((a) => a.id === w.assetId)?.zone);
/** A robot may go where it is certified to: an Ex-rated robot anywhere; the others only outside hazardous areas. Drones
 *  don't fly inside buildings. */
export const robotMayEnter = (r: Robot, z?: ZoneDef) => !z || ((z.atex === null || r.exRated) && !(z.indoor && DOMAIN_OF[r.kind] === "air"));
/** Why a robot may not go somewhere, in words (null when it may). */
export const whyNot = (r: Robot, z: ZoneDef) => (z.indoor && DOMAIN_OF[r.kind] === "air" ? `${r.name} is a drone — it doesn't fly inside ${z.name}` : z.atex !== null && !r.exRated ? `${r.name} isn't certified for hazardous areas — ${z.name} is zone ${z.atex}` : null);
/** A live airside area (runway, taxiways) outside its closure: robots need air traffic control's clearance to go there. */
export function airsideOpen(z: ZoneDef | undefined, now: number) {
  if (!z?.closed) return false;
  const t = new Date(now + 3 * 3600_000), h = t.getUTCHours() + t.getUTCMinutes() / 60;
  return !(h >= z.closed[0] && h < z.closed[1]);
}
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
export const closureText = (z: ZoneDef) => (z.closed ? `${hhmm(z.closed[0])}–${hhmm(z.closed[1])}` : "");
const zoneLabel = (z?: ZoneDef) => (z ? `${z.name}${z.atex ? ` (hazardous area, zone ${z.atex})` : ""}` : "the area");

/** Flammable gas or H₂S in an area now: the worst robot finding today, or a gas detector there near or over its alarm. */
export function gasIn(d: FmData, z?: ZoneDef): { text: string; ratio: number } | null {
  if (!z) return null;
  let best: { text: string; ratio: number } | null = null;
  const take = (text: string, ratio: number) => { if (ratio >= 0.88 && (!best || ratio > best.ratio)) best = { text, ratio }; };
  for (const a of d.assets.filter((x) => x.class === "detector" && x.facilityId === z.facilityId && x.zone === z.name))
    for (const r of a.readings.filter((x) => x.key === "lel" || x.key === "h2s")) take(`${r.name} ${r.value} ${r.unit} at ${a.tag} (alarm ${r.high} ${r.unit})`, nearLimit(r));
  // a robot's gas reading counts until the source is repaired
  const repairedSince = (f: Finding) => d.assets.find((a) => a.id === f.assetId)?.readings.some((r) => r.was && r.was.until > f.at);
  for (const m of d.missions.filter((x) => x.facilityId === z.facilityId)) for (const f of m.findings.filter((x) => x.sensor === "gas" && x.zone === z.id && !repairedSince(x)))
    take(`${f.label}, found by ${d.robots.find((r) => r.id === f.robotId)?.name ?? "a robot"} at ${local(f.at)}`, f.limit ? f.value / f.limit : 1);
  return best;
}

/** The jobs a job is still waiting for. */
export const waitingFor = (d: FmData, w: WorkOrder) => (w.after ?? []).filter((id) => d.workOrders.find((x) => x.id === id)?.status !== "done");

// ------------------------------------------------------------------ who does it
/** The best crew for a contractor job: the trade, free now, and the contractor's record. */
export function pickCrew(d: FmData, w: WorkOrder, trades: string[], taken: Set<string>): { crew?: Crew; why: string[] } {
  const rank = { good: 0, watch: 1, poor: 2 } as const;
  const main = (c: Crew) => (c.trades.includes(trades[0] as Crew["trades"][number]) ? 0 : 1);
  const xs = d.crews.filter((c) => c.facilityId === w.facilityId && c.status !== "off" && !taken.has(c.id) && c.trades.some((t) => trades.includes(t)))
    .map((c) => ({ c, k: d.contractors.find((x) => x.id === c.contractorId)!, busy: d.workOrders.filter((x) => x.crew === c.id && isOpen(x) && x.status !== "on_hold").length }))
    // the main trade first (the compressor specialists for a compressor job), then the least busy, then the best record
    .sort((a, b) => main(a.c) - main(b.c) || a.busy - b.busy || rank[a.k.performance.rating] - rank[b.k.performance.rating]);
  const b = xs[0];
  if (!b) return { why: [`No contractor crew on site has the ${trades.join(" / ")} trade — call one off the framework contracts.`] };
  return { crew: b.c, why: [`${b.c.name} of ${b.k.name}: ${b.c.size} people, ${b.c.trades.join(" & ")}`, b.busy ? `${b.busy} other open job${b.busy > 1 ? "s" : ""}` : "free now",
    `${b.k.name}: ${b.k.performance.onTimePct}% on time, ${b.k.performance.reworkPct}% rework${b.k.performance.rating !== "good" ? ` — on ${b.k.performance.rating === "poor" ? "notice" : "watch"}${b.k.performance.note ? `: ${b.k.performance.note}` : ""}` : ""}`,
    ...(b.c.certs.length ? [`Certified: ${b.c.certs.join(", ")}`] : [])] };
}

/** A robot that can make these checks in these areas now: capable, certified for the area, idle and charged enough. */
export function pickRobot(d: FmData, facilityId: string, checks: Capability[], zones: (ZoneDef | undefined)[], durationMin: number, now: number, skip?: (r: Robot) => string | null): { robot?: Robot; why: string[] } {
  const reasons: string[] = [];
  const xs = d.robots.filter((r) => r.facilityId === facilityId).filter((r) => {
    const no = skip?.(r); if (no) { reasons.push(no); return false; }
    if (!checks.every((c) => r.capabilities.includes(c))) return false;
    const barred = zones.find((z) => z && !robotMayEnter(r, z));
    if (barred) { reasons.push(whyNot(r, barred)!); return false; }
    if (r.estop || r.status === "fault" || r.status === "offline") { reasons.push(`${r.name} is ${r.estop ? "on emergency stop" : r.status}`); return false; }
    if (r.status === "on_mission" || r.status === "returning") return false;
    if (d.missions.some((m) => m.robotId === r.id && m.status === "planned" && Date.parse(m.plannedStart) - now < (durationMin + 15) * MIN && Date.parse(m.plannedStart) > now)) return false;
    if (r.battery < 25 + (90 * durationMin) / r.enduranceMin) { reasons.push(`${r.name} needs charging (${r.battery}%)`); return false; }
    return true;
  }).sort((a, b) => b.battery - a.battery);
  const r = xs[0];
  if (!r) return { why: reasons };
  return { robot: r, why: [`${r.name} (${r.model}): ${checks.map((c) => CAPABILITY_LABEL[c]).join(", ")}${r.exRated ? "; Ex-certified for hazardous areas" : ""}`, `Battery ${r.battery}%, enough for ${durationMin} min`, r.autonomy === "policy" ? "Runs the route on its own; a person watches the feed" : "Supervised: a person approves and watches the mission"] };
}

/** An unidentified drone over the plant in the last two hours: our own drones stay on the ground, so nobody confuses
 *  them with it and the airspace is clear for the authorities. */
export const dronesGrounded = (d: FmData, facilityId: string, now: number) =>
  d.securityAlerts.find((a) => a.facilityId === facilityId && a.kind === "drone" && a.status !== "cleared" && now - Date.parse(a.at) < 2 * 3600_000);
const inAir = (r: Robot) => DOMAIN_OF[r.kind] === "air";

/** The people who may pilot a robot a person controls: their role names what it needs ("ROV", "drone", "robot
 *  operator"), they are on shift, and not piloting another mission at that time. */
export function pilotsFor(d: FmData, r: Robot, start: number, durationMin: number, except?: string) {
  // a robot switched to a person's control without a named pilot role takes any pilot or robot operator
  const re = r.pilotRole ? new RegExp(r.pilotRole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : /pilot|robot operator/i;
  const busy = (techId: string) => d.missions.some((m) => m.id !== except && m.pilotId === techId && (m.status === "planned" || m.status === "running") && Date.parse(m.plannedStart) < start + durationMin * MIN && Date.parse(m.plannedStart) + m.durationMin * MIN > start);
  return d.technicians.filter((t) => t.facilityId === r.facilityId && re.test(t.role) && t.shift !== "off" && t.status !== "off" && !busy(t.id));
}

const newMission = (d: FmData, r: Robot, kind: Mission["kind"], title: string, waypoints: Waypoint[], durationMin: number, now: number, woId?: string): Mission => ({
  id: `MS-${new Date(now).toISOString().slice(2, 10).replace(/-/g, "")}-${String(d.missions.length + 1).padStart(2, "0")}${Math.random().toString(36).slice(2, 4)}`, facilityId: r.facilityId, robotId: r.id, kind, title, waypoints,
  plannedStart: new Date(now + MIN).toISOString(), durationMin, status: "planned", by: "Orchestrator", source: "orchestrator", ...(woId ? { woId } : {}), findings: [] });

// ------------------------------------------------------------------ proposals
const sevPri: Record<Finding["severity"], Priority> = { critical: "P1", high: "P2", medium: "P3", low: "P4", info: "P4" };

/** The work layer's proposals: crews, robots, findings, safety. */
export function workProposals(d: FmData, fac: (id: string) => boolean, push: (a: Action) => void, handed: Map<string, number>, now: number, exclude?: (key: string) => Set<string> | undefined) {
  const asset = (id: string) => d.assets.find((a) => a.id === id)!;
  const gasTester = (fid: string) => d.technicians.find((t) => t.facilityId === fid && /gas tester|hse/i.test(t.role) && t.shift !== "off");

  // 1. Hot work where there is gas: stop it. Anyone with a safety duty may approve; the autopilot does it at once.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && isOpen(x) && x.status !== "on_hold" && x.permit?.type === "hot work" && x.permit.status !== "suspended" && x.permit.status !== "closed")) {
    const z = zoneOfWo(d, w), gas = gasIn(d, z);
    if (!gas) continue;
    push({ id: `stop:${w.id}`, facilityId: w.facilityId, kind: "safety_stop", title: `Stop the hot work on ${w.id} (${asset(w.assetId).tag}): gas in ${z!.name}`,
      why: [gas.text, `${w.title}${w.crew ? ` — ${d.crews.find((c) => c.id === w.crew)?.name}` : ""}`, "No hot work with flammable gas in the area: the permit is suspended until a gas test shows it gas-free", "Anyone with a safety duty may stop it — it costs nothing"],
      risk: "low", auto: true, effect: "wo_update", payload: { woId: w.id, patch: { status: "on_hold", holdReason: "Gas in the area — hot work suspended until a gas test shows it gas-free", permitStatus: "suspended", note: `Hot work stopped: ${gas.text}.` } }, targets: { woId: w.id, zoneId: z!.id } });
  }

  // 2. Jobs a robot can do (checks before people go in): send the robot first — keeps people out of unknown atmospheres.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && x.status === "open" && x.requires?.length && !x.robot && !waitingFor(d, x).length)) {
    const z = zoneOfWo(d, w), dur = 20;
    const { robot, why } = pickRobot(d, w.facilityId, w.requires!, [z], dur, now);
    if (!robot) { if (why.length) push({ id: `robot_none:${w.id}`, facilityId: w.facilityId, kind: "gas_test", title: `No robot can check ${w.id} now — ask ${gasTester(w.facilityId)?.name ?? "the gas tester"} to test with a portable detector`, why: [w.title, ...why, "A person tests in breathing apparatus, with a standby man"], risk: "low", auto: false, effect: "wo_update", payload: { woId: w.id, patch: { note: `Gas test by hand requested (${gasTester(w.facilityId)?.name ?? "gas tester"}): no robot available.` } }, targets: { woId: w.id } }); continue; }
    const m = newMission(d, robot, w.permit?.type === "confined space" ? "confined_precheck" : "gas_survey", `${w.title} — ${robot.name}`, [{ zone: z?.id ?? robot.dock, assetId: w.assetId, label: w.title, checks: w.requires! }], dur, now, w.id);
    push({ id: `robot:${w.id}`, facilityId: w.facilityId, kind: "robot_mission", title: `Send ${robot.name} to check ${asset(w.assetId).tag} before anyone enters (${w.requires!.map((c) => CAPABILITY_LABEL[c]).join(", ")})`,
      why: [w.detail || w.title, ...why, `${zoneLabel(z)}${z?.hazards.length ? `: ${z.hazards.join(", ").replace(/_/g, " ")}` : ""}`, "If the robot reads gas, the job stays closed and the crews are told; if clear, the gas test is recorded on the job"],
      risk: "low", auto: robot.autonomy === "policy", effect: "mission_create", payload: { mission: m, woId: w.id }, targets: { woId: w.id, robotId: robot.id, zoneId: z?.id } });
  }

  // 2b. Work held for gas, and the area is clear now (the leak fixed): re-test the area — by a robot if one can go — and
  //     every job held there can restart (one survey for all of them).
  const held = d.workOrders.filter((x) => fac(x.facilityId) && x.status === "on_hold" && GAS_HOLD.test(x.holdReason ?? "") && !d.missions.some((m) => m.woId === x.id && (m.status === "planned" || m.status === "running")));
  for (const z of [...new Set(held.map((w) => zoneOfWo(d, w)))]) {
    if (!z || gasIn(d, z)) continue;
    const ws = held.filter((w) => zoneOfWo(d, w) === z), w = ws[0];
    const { robot, why } = pickRobot(d, z.facilityId, ["gas"], [z], 15, now);
    const m = robot ? newMission(d, robot, "gas_survey", `Re-test ${z.name} for gas — ${robot.name}`, [{ zone: z.id, assetId: w.assetId, label: `${z.name}: ${ws.map((x) => x.id).join(", ")}`, checks: ["gas"] }], 15, now, w.id) : undefined;
    const tester = gasTester(z.facilityId);
    push({ id: `retest:${z.id}:${ws.map((x) => x.id).join(",")}`, facilityId: z.facilityId, kind: robot ? "robot_mission" : "gas_test", title: robot ? `Send ${robot.name} to re-test ${z.name} so ${ws.map((x) => x.id).join(" and ")} can restart` : `Re-test ${z.name} for gas so ${ws.map((x) => x.id).join(" and ")} can restart — ${tester?.name ?? "the gas tester"}`,
      why: [...ws.map((x) => `${x.id} on hold: ${x.holdReason}`), `No gas reading in ${z.name} now`, ...(robot ? why : []), "Clear: the jobs go back to their crews and the permits are re-issued; gas: they stay on hold"],
      risk: "low", auto: !robot || robot.autonomy === "policy", effect: robot ? "mission_create" : "wo_update", payload: robot ? { mission: m, woId: w.id } : { woId: w.id, patch: { note: `Gas re-test of ${z.name} requested from ${tester?.name ?? "the gas tester"}.` } }, targets: { woId: w.id, robotId: robot?.id, zoneId: z.id } });
  }

  // 3. A robot found something nobody is working on: raise the work for people (one job per asset, whoever found it).
  const raised = new Set<string>();
  for (const m of d.missions.filter((x) => fac(x.facilityId))) for (const f of m.findings.filter((x) => !x.acknowledged && !x.woId && (x.severity === "medium" || x.severity === "high" || x.severity === "critical"))) {
    const a = f.assetId ? asset(f.assetId) : undefined;
    if (!a || raised.has(a.id)) continue;
    raised.add(a.id);
    const covered = d.workOrders.some((w) => w.assetId === a.id && isOpen(w) && w.type !== "PM" && w.type !== "TAR") || d.alarms.some((al) => al.assetId === a.id && !al.acknowledged && !al.woId && al.severity !== "low");
    if (covered) continue;
    const pr = sevPri[f.severity], robot = d.robots.find((r) => r.id === f.robotId);
    const z = zoneNamed(d, a.facilityId, a.zone), hazardous = !!z?.atex;
    const wo: WorkOrder = { id: "", facilityId: a.facilityId, assetId: a.id, type: f.severity === "critical" ? "Emergency" : "CM", priority: pr, status: "open", title: `${f.sensor === "ut_thickness" ? "Assess and repair" : "Investigate"}: ${f.label}`,
      detail: `Found by ${robot?.name ?? "a robot"} on "${m.title}" at ${local(f.at)} (${f.sensor.replace("_", " ")}). ${f.image ? `Image: ${f.image}.` : ""}`, raised: new Date(now).toISOString(), due: new Date(now + PRIORITY_SLA[pr] * 3600_000).toISOString().slice(0, 10), slaHours: PRIORITY_SLA[pr],
      source: "robot", raisedBy: robot?.name ?? "Robot", checklist: [{ text: "Gas test and permit before work", done: false }, { text: "Confirm the reading on site", done: false }, { text: "Repair or make safe", done: false }, { text: "Record; the next robot round re-checks it", done: false }], spares: [], notes: [], evidence: f.image ? [f.image] : [],
      ...(hazardous ? { gasTest: { status: "required" as const } } : {}) };
    const { tech, why } = bestTech(d, wo, handed, exclude?.(`finding:${f.id}`));
    push({ id: `finding:${f.id}`, facilityId: a.facilityId, kind: "robot_finding", title: `Raise ${pr} work from ${robot?.name ?? "the robot"}'s finding at ${a.tag}${tech ? ` and give it to ${tech.name}` : ""}`,
      why: [`${f.label} — ${f.severity}`, `${m.title}, ${local(f.at)}`, `${a.name}, criticality ${a.criticality}`, ...(tech ? why : []), ...(hazardous ? [`${zoneLabel(z)}: gas test before work`] : []), "The next round re-checks it after the repair"],
      risk: pr === "P1" ? "medium" : "low", auto: pr !== "P1", effect: "wo_create", payload: { wo: { ...wo, ...(tech ? { assignee: tech.id, status: "assigned" } : {}) }, findingId: f.id }, targets: { assetId: a.id, techId: tech?.id, findingId: f.id, robotId: f.robotId } });
  }

  // 4. Contractor jobs ready to start (a turnaround, or work no one in-house has the trade for): give them to a crew.
  const taken = new Set<string>();
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && x.status === "open" && !x.crew && !x.assignee && !x.requires?.length && !waitingFor(d, x).length && x.type === "TAR")) {
    const trades = /scaffold/i.test(w.title) ? ["scaffolding"] : /ndt|ut\/mt|inspect/i.test(w.title) ? ["inspection"] : /valve|blind|isolat/i.test(w.title) ? ["mechanical"] : [asset(w.assetId).trade, "mechanical"];
    const { crew, why } = pickCrew(d, w, trades, taken);
    if (!crew) continue;
    taken.add(crew.id);
    const k = d.contractors.find((x) => x.id === crew.contractorId)!;
    const days = Math.max(1, Math.round((Date.parse(w.plannedEnd ?? w.due) - Date.parse(w.plannedStart ?? w.due)) / 86400_000) + 1), cost = days * k.dayRate;
    push({ id: `crew:${w.id}`, facilityId: w.facilityId, kind: "assign_crew", title: `Give ${w.id} to ${crew.name} (${k.name}): ${w.title}`,
      why: [`${w.package ? `Turnaround ${w.package}: ` : ""}${w.title}`, `Ready: ${(w.after ?? []).length ? `${(w.after ?? []).join(", ")} done` : "nothing to wait for"}`, ...why, `${days} crew-day${days > 1 ? "s" : ""} × SAR ${k.dayRate.toLocaleString("en-US")} (contract ${k.contractRef})`],
      risk: cost > 25_000 ? "medium" : "low", cost, party: k.name, auto: cost <= 25_000, effect: "wo_update", payload: { woId: w.id, crewId: crew.id, patch: { crew: crew.id, status: "assigned", note: `Given to ${crew.name} (${k.name}).` } }, targets: { woId: w.id, crewId: crew.id } });
  }

  // 5. Work that needs a gas test and has none: the gas tester first (or the robot's reading, when it went).
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && (x.status === "assigned" || x.status === "in_progress") && x.gasTest?.status === "required" && !x.robot && !waitingFor(d, x).length)) {
    const t = gasTester(w.facilityId);
    const z = zoneOfWo(d, w), gas = gasIn(d, z);
    if (gas && w.permit?.type === "hot work") continue; // gas already there: the work is stopped (1), not tested
    push({ id: `gastest:${w.id}`, facilityId: w.facilityId, kind: "gas_test", title: `Gas test before ${w.id} starts (${asset(w.assetId).tag})${t ? ` — ${t.name}` : ""}`,
      why: [w.title, `${zoneLabel(z)}: no work until the atmosphere is tested (LEL, H₂S, O₂)`, ...(gas ? [`Gas seen in the area already: ${gas.text}`] : []), ...(t ? [`${t.name} (${t.role}) is on shift`] : [])],
      risk: "low", auto: true, effect: "wo_update", payload: { woId: w.id, patch: { note: `Gas test requested from ${t?.name ?? "the gas tester"} before work starts.` } }, targets: { woId: w.id, techId: t?.id } });
  }

  // 6. A robot running out of battery on a mission: bring it home before it stops where nobody can reach it.
  for (const r of d.robots.filter((x) => fac(x.facilityId) && x.status === "on_mission" && x.battery < 20)) {
    push({ id: `recall:${r.missionId}`, facilityId: r.facilityId, kind: "robot_recall", title: `Recall ${r.name}: battery ${r.battery}%`, why: [`On "${d.missions.find((m) => m.id === r.missionId)?.title}"`, "Below 20%: it must reach the dock before it stops in a hazardous area", "The rest of the route is planned again after charging"],
      risk: "low", auto: true, effect: "mission_update", payload: { missionId: r.missionId }, targets: { robotId: r.id } });
  }

  // 7. Security alerts: a robot looks first — a patrol already passing that way, or a free robot that can — and security
  //    is told. An unidentified drone is not ours to chase: the authorities are told, our drones stay down.
  for (const al of d.securityAlerts.filter((x) => fac(x.facilityId) && x.status === "open")) {
    const z = d.zones.find((x) => x.id === al.zone), guard = d.technicians.find((t) => t.facilityId === al.facilityId && /security/i.test(t.role) && t.shift !== "off");
    const base = { facilityId: al.facilityId, kind: "security_response" as const, risk: "low" as const, effect: "security_update" as const, targets: { alertId: al.id, zoneId: al.zone } };
    const airport = d.facilities.find((f) => f.id === al.facilityId)?.sector === "airport";
    if (al.kind === "drone" && airport) {
      push({ ...base, id: `security:${al.id}`, title: `Unidentified drone near the ${z?.name.toLowerCase() ?? "airfield"}: tell air traffic control and the police, keep our drones on the ground`,
        why: [`${al.text} (${al.source}, ${local(al.at)})`, "Air traffic control decides whether to hold departures and arrivals; the police and the authorities handle the drone — the airport does not chase it", "Our drones stay docked for two hours so the tower doesn't mistake them for it; their flights wait", ...(guard ? [`${guard.name} (${guard.role}) makes the calls and logs them`] : [])],
        auto: false, payload: { alertId: al.id, status: "escalated", note: `Air traffic control and the police told${guard ? ` by ${guard.name}` : ""}; own drones grounded for two hours.` } });
      continue;
    }
    if (al.kind === "wildlife") {
      const ops = d.technicians.find((t) => t.facilityId === al.facilityId && /wildlife|airfield operations/i.test(t.role) && t.shift !== "off");
      push({ ...base, id: `security:${al.id}`, title: `Birds by the ${z?.name.toLowerCase() ?? "runway"}: send ${ops?.name ?? "wildlife control"} to disperse them and tell air traffic control`,
        why: [`${al.text} (${al.source}, ${local(al.at)})`, "A bird strike risk on take-off and landing: the tower warns crews until the area is clear", "No drone near the birds — a drone among birds is a second hazard", ...(ops ? [`${ops.name} (${ops.role}) is on shift`] : [])],
        auto: false, payload: { alertId: al.id, status: "checking", note: `${ops?.name ?? "Wildlife control"} sent to disperse the birds; air traffic control told.` }, targets: { ...base.targets, techId: ops?.id } });
      continue;
    }
    if (al.kind === "fod") {
      const ops = d.technicians.find((t) => t.facilityId === al.facilityId && /airfield operations/i.test(t.role) && t.shift !== "off");
      const open = airsideOpen(z, now);
      const { robot, why } = pickRobot(d, al.facilityId, ["fod"], [z], 30, now, (r) => (inAir(r) && open ? `${r.name} stays clear of a live taxiway — aircraft are moving` : dronesGrounded(d, al.facilityId, now) && inAir(r) ? `${r.name} stays down — unidentified drone reported` : null));
      const m = robot ? newMission(d, robot, "runway_inspection", `Find and report the debris — ${al.text}`, [{ zone: al.zone, label: al.text, checks: ["fod", "visual"] }], 30, now) : undefined;
      if (m) { m.alertId = al.id; if (open) m.note = "Ground control's clearance to enter the taxiway, given by the approver"; }
      push({ ...base, id: `security:${al.id}`, title: robot ? `${open ? "With ground control's clearance, s" : "S"}end ${robot.name} to find the debris: ${al.text}` : `Send ${ops?.name ?? "airfield operations"} to find and remove the debris${open ? " with ground control's clearance" : ""}`,
        why: [`${al.text} (${al.source}, ${local(al.at)})`, ...(open ? [`${z?.name} is live (closed to aircraft only ${closureText(z!)}): ground control gives a slot before anyone or anything goes on it`] : []), ...(robot ? why : []), "Debris on a runway or taxiway can be ingested by an engine: found, removed and reported to the tower", ...(ops ? [`${ops.name} removes what the robot finds`] : [])],
        risk: open ? "medium" : "low", auto: false, effect: robot ? "mission_create" : "security_update", payload: robot ? { alertId: al.id, mission: m, status: "checking" } : { alertId: al.id, status: "checking", note: `${ops?.name ?? "Airfield operations"} sent.` }, targets: { ...base.targets, robotId: robot?.id, techId: ops?.id } });
      continue;
    }
    if (al.kind === "drone") {
      push({ ...base, id: `security:${al.id}`, title: `Unidentified drone over ${z?.name ?? "the plant"}: report it to the authorities and keep our drones on the ground`,
        why: [`${al.text} (${al.source}, ${local(al.at)})`, "Countering a drone is for the state's forces, not the plant: report it with the time, place and heading", "Our drones stay docked for two hours so they are not mistaken for it; their missions wait", `People working in the open in ${z?.name ?? "the area"} go indoors until security clears it`, ...(guard ? [`${guard.name} (${guard.role}) makes the report`] : [])],
        auto: false, payload: { alertId: al.id, status: "escalated", note: `Reported to the authorities${guard ? ` by ${guard.name}` : ""}; own drones grounded for two hours.` } });
      continue;
    }
    const passing = d.missions.find((m) => m.facilityId === al.facilityId && m.kind === "security_patrol" && m.status === "running" && m.waypoints.slice(Math.max(0, (m.at ?? -1) + 1)).some((w) => w.zone === al.zone));
    if (passing) {
      const r = d.robots.find((x) => x.id === passing.robotId)!;
      push({ ...base, id: `security:${al.id}`, title: `${r.name} is passing ${z?.name ?? "there"} on its patrol — have it check ${al.source} on the way`, why: [`${al.text} (${local(al.at)})`, `"${passing.title}": ${Math.round((passing.progress ?? 0) * 100)}% done, ${z?.name} still ahead`, "No extra trip: the patrol looks with its cameras and intrusion detection", ...(guard ? [`${guard.name} watches the feed and goes if it sees anyone`] : [])],
        auto: true, payload: { alertId: al.id, status: "checking", missionId: passing.id, note: `${r.name} checks it on "${passing.title}".` }, targets: { ...base.targets, robotId: r.id, missionId: passing.id } });
      continue;
    }
    const grounded = dronesGrounded(d, al.facilityId, now);
    const { robot, why } = pickRobot(d, al.facilityId, ["intrusion"], [z], 20, now, (r) => (grounded && inAir(r) ? `${r.name} stays down — unidentified drone reported at ${local(grounded.at)}` : null));
    if (robot) {
      const m = newMission(d, robot, "alarm_check", `Check ${al.source} — ${z?.name ?? ""}`, [{ zone: al.zone, label: al.text, checks: robot.capabilities.filter((c) => c === "intrusion" || c === "visual" || c === "thermal") }], 20, now);
      m.alertId = al.id;
      push({ ...base, id: `security:${al.id}`, title: `Send ${robot.name} to check ${al.source} (${z?.name ?? "the plant"})`, why: [`${al.text} (${local(al.at)})`, ...why, "It looks before anyone walks up to it; if it sees a person or a vehicle, security goes", ...(guard ? [`${guard.name} (${guard.role}) is told and watches the feed`] : [])],
        auto: robot.autonomy === "policy", effect: "mission_create", payload: { alertId: al.id, mission: m, status: "checking" }, targets: { ...base.targets, robotId: robot.id } });
    } else {
      push({ ...base, id: `security:${al.id}`, title: `No robot can check ${al.source} now — send ${guard?.name ?? "a guard"} to look`, why: [`${al.text} (${local(al.at)})`, ...why], auto: false, payload: { alertId: al.id, status: "checking", note: `${guard?.name ?? "A guard"} sent to check.` }, targets: { ...base.targets, techId: guard?.id } });
    }
  }

  // 8. One trip instead of two: an inspection round that a security patrol passes anyway, within the hour, by a patrol
  //    robot that has the sensors and may go there — fold the round into the patrol and free the other robot.
  const patrols = d.missions.filter((m) => fac(m.facilityId) && m.kind === "security_patrol" && m.status === "planned" && !m.combined && Date.parse(m.plannedStart) > now);
  for (const m of d.missions.filter((x) => fac(x.facilityId) && x.kind === "inspection_round" && x.status === "planned" && Date.parse(x.plannedStart) > now)) {
    for (const p of patrols) {
      const pr = d.robots.find((r) => r.id === p.robotId)!, ir = d.robots.find((r) => r.id === m.robotId)!;
      if (pr.id === ir.id || Math.abs(Date.parse(p.plannedStart) - Date.parse(m.plannedStart)) > 60 * MIN) continue;
      const zs = new Set(p.waypoints.map((w) => w.zone));
      if (!m.waypoints.every((w) => zs.has(w.zone) && w.checks.every((c) => pr.capabilities.includes(c)) && robotMayEnter(pr, d.zones.find((z) => z.id === w.zone)))) continue;
      const route: Waypoint[] = p.waypoints.flatMap((w) => [w, ...m.waypoints.filter((x) => x.zone === w.zone)]);
      const combined: Mission = { ...p, id: `${p.id}C`, title: `${p.title} + ${m.title.split(" — ")[0].toLowerCase()}`, waypoints: route, durationMin: p.durationMin + Math.round(m.durationMin / 3), combined: [p.id, m.id], by: "Orchestrator", source: "orchestrator", findings: [] };
      push({ id: `combine:${m.id}:${p.id}`, facilityId: m.facilityId, kind: "combine_missions", title: `Fold ${ir.name}'s "${m.title.split(" — ")[0]}" into ${pr.name}'s ${p.title.split(" — ")[0].toLowerCase()}`,
        why: [`${pr.name} passes ${[...new Set(m.waypoints.map((w) => d.zones.find((z) => z.id === w.zone)?.name))].join(", ")} on its patrol at ${local(p.plannedStart)} anyway`, `It has the sensors the round needs: ${[...new Set(m.waypoints.flatMap((w) => w.checks))].map((c) => CAPABILITY_LABEL[c]).join(", ")}`, `One trip instead of two: ${ir.name} is free for ${m.durationMin} min and keeps its charge`, `${pr.vendor} and ${ir.vendor} robots — different makers, one plan`],
        risk: "low", auto: true, effect: "mission_create", payload: { mission: combined, abort: [p.id, m.id] }, targets: { robotId: pr.id, missionId: m.id } });
      patrols.splice(patrols.indexOf(p), 1);
      break;
    }
  }

  // 9. A robot a person pilots, with a mission and no pilot: it won't move until someone flies or drives it. Give it a
  //    qualified pilot who is on shift and free then.
  for (const m of d.missions.filter((x) => fac(x.facilityId) && x.status === "planned" && !x.pilotId)) {
    const r = d.robots.find((x) => x.id === m.robotId);
    if (!r || r.autonomy !== "remote") continue;
    const ps = pilotsFor(d, r, Date.parse(m.plannedStart), m.durationMin, m.id), p = ps[0];
    if (!p) continue; // nobody qualified and free: the robot sheet says the mission waits for a pilot
    push({ id: `pilot:${m.id}`, facilityId: m.facilityId, kind: "assign_pilot", title: p ? `Put ${p.name} on ${r.name} for "${m.title}" (${local(m.plannedStart)})` : `${r.name} has no pilot for "${m.title}" (${local(m.plannedStart)}) — find a ${r.pilotRole ?? "pilot"}`,
      why: [`${r.name} (${r.model}) is ${CONTROL_LABEL.remote}: the mission waits until someone is on the controls`, ...(p ? [`${p.name}, ${p.role}: on shift, free ${local(m.plannedStart)}–${local(new Date(Date.parse(m.plannedStart) + m.durationMin * MIN).toISOString())}`, ...(ps.length > 1 ? [`Also qualified: ${ps.slice(1).map((x) => x.name).join(", ")}`] : [])] : [`Nobody on shift is a ${r.pilotRole ?? "pilot"} and free then`]), "The pilot flies or drives it; the orchestrator plans the route, watches the readings and raises what it finds"],
      risk: "low", auto: !!p, effect: p ? "mission_pilot" : "mission_update", payload: p ? { missionId: m.id, pilotId: p.id } : { missionId: m.id }, targets: { robotId: r.id, techId: p?.id, missionId: m.id } });
  }

  // 10. People doing hot work or entering a confined space where gas can be: an AI-controlled robot stands beside them
  //     on gas watch. The people work; the robot watches and stops the job the moment it reads gas.
  for (const w of d.workOrders.filter((x) => fac(x.facilityId) && (x.status === "assigned" || x.status === "in_progress") && (x.crew || x.assignee) && (x.permit?.type === "hot work" || x.permit?.type === "confined space") && !waitingFor(d, x).length)) {
    const z = zoneOfWo(d, w);
    if (!z || !z.hazards.some((h) => h === "hydrocarbon" || h === "h2s")) continue;
    if ((w.support ?? []).some((s) => d.missions.some((m) => m.id === s.missionId && (m.status === "planned" || m.status === "running")))) continue;
    // as long as the robot can safely stay (on its battery); when it has to charge, the orchestrator proposes the next one
    const { robot, why } = pickRobot(d, w.facilityId, ["gas"], [z], 45, now, (r) => (r.autonomy === "remote" ? `${r.name} needs a pilot — a gas watch beside a crew is AI-controlled` : null));
    if (!robot) continue;
    const stay = Math.min(120, Math.floor(robot.enduranceMin * 0.6));
    const m = newMission(d, robot, "gas_watch", `Gas watch beside ${w.crew ? d.crews.find((c) => c.id === w.crew)?.name : d.technicians.find((t) => t.id === w.assignee)?.name} — ${w.id}`, [{ zone: z.id, assetId: w.assetId, label: `${w.id}: ${w.title}`, checks: ["gas"] }], stay, now, w.id);
    const people = w.crew ? `${d.crews.find((c) => c.id === w.crew)?.name} (${d.crews.find((c) => c.id === w.crew)?.size} people)` : d.technicians.find((t) => t.id === w.assignee)?.name;
    push({ id: `support:${w.id}`, facilityId: w.facilityId, kind: "robot_support", title: `Put ${robot.name} on gas watch beside ${people} on ${w.id} — AI-controlled, it stops the work if gas appears`,
      why: [`${w.title}: ${w.permit!.type} in ${zoneLabel(z)}`, `The people do the work; the robot stands by the job reading LEL and H₂S for ${stay} min — then the next robot takes over`, ...why.filter((x) => !/^Battery/.test(x)), "Gas read: the job goes on hold and its permit is suspended at once, the crew is told to leave", "One person watches the robot's feed — no one has to stand gas watch in the area"],
      risk: "low", auto: robot.autonomy === "policy", effect: "mission_create", payload: { mission: m, woId: w.id }, targets: { woId: w.id, robotId: robot.id, crewId: w.crew, techId: w.assignee } });
  }
}

/** The operator's rules, as proposals: send the robot the rule names to look closer (one that may go there and is free;
 *  "a ground robot" after a drone), or tell people on Teams or by email. One proposal per rule and finding or alert. */
export function ruleProposals(d: FmData, rules: Rule[], fac: (id: string) => boolean, push: (a: Action) => void, now: number) {
  // one robot per rule and area (two readings in the same area are one survey), and a robot proposed once
  const served = new Set<string>(), taken = new Set<string>();
  for (const { rule, finding: f, alert: al } of ruleMatches(d, rules, fac)) {
    const facilityId = f?.facilityId ?? al!.facilityId, key = f?.id ?? al!.id;
    const z = d.zones.find((x) => x.id === (f?.zone ?? al?.zone));
    const what = f ? `${f.label} — ${f.severity}, found by ${d.robots.find((r) => r.id === f.robotId)?.name ?? "a robot"} at ${local(f.at)}` : `${al!.text} (${al!.source}, ${local(al!.at)})`;
    if (rule.then.do === "send_robot") {
      const t = rule.then;
      const area = `${rule.id}:${z?.id ?? key}`;
      if (served.has(area) || d.missions.some((m) => m.note?.startsWith(`rule:${rule.id}:`) && (m.note === `rule:${rule.id}:${key}` || (z && m.waypoints.some((w) => w.zone === z.id) && (m.status === "planned" || m.status === "running"))))) continue;
      const { robot, why } = pickRobot(d, facilityId, t.needs, [z], 30, now, (r) => (taken.has(r.id) ? `${r.name} is proposed for another check` : t.notBy && DOMAIN_OF[r.kind] === t.notBy ? `${r.name} is a ${t.notBy} robot — the rule wants another kind` : r.id === f?.robotId ? `${r.name} found it` : r.autonomy === "remote" ? `${r.name} needs a pilot` : null));
      if (!robot) continue;
      served.add(area); taken.add(robot.id);
      const m = newMission(d, robot, t.mission, `${MISSION_LABEL[t.mission][0].toUpperCase()}${MISSION_LABEL[t.mission].slice(1)} — ${f?.label ?? al!.text}`, [{ zone: z?.id ?? robot.dock, ...(f?.assetId ? { assetId: f.assetId } : {}), label: f?.label ?? al!.text, checks: t.needs }], 30, now);
      m.note = `rule:${rule.id}:${key}`;
      push({ id: `rule:${rule.id}:${key}`, facilityId, kind: "rule", title: `${rule.name.split("→").pop()!.trim().replace(/^./, (c) => c.toUpperCase())}: send ${robot.name}`, why: [`Rule: ${rule.name}`, what, ...why],
        risk: "low", auto: robot.autonomy === "policy", effect: "mission_create", payload: { mission: m }, targets: { robotId: robot.id, ...(f ? { findingId: f.id } : { alertId: al!.id }), zoneId: z?.id } });
    } else {
      const t = rule.then;
      push({ id: `rule:${rule.id}:${key}`, facilityId, kind: "rule", title: `Tell people by ${t.channel === "teams" ? "Teams" : "email"}: ${f?.label ?? al!.text}`, why: [`Rule: ${rule.name}`, what, `${d.facilities.find((x) => x.id === facilityId)?.name}${z ? `, ${z.name}` : ""}`],
        risk: "low", auto: true, effect: "notify", payload: { channel: t.channel, to: t.to, title: `${d.facilities.find((x) => x.id === facilityId)?.name}: ${f ? "robot finding" : `${al!.kind} alert`}`, text: `${what}${z ? ` — ${z.name}` : ""}.` }, targets: { ...(f ? { findingId: f.id } : { alertId: al!.id }), zoneId: z?.id } });
    }
  }
}

/** The events an approved work-layer proposal produces, or null if it isn't one. */
export function workEffects(d: FmData, a: Action, base: { at: string; by: string; channel: FmEvent["channel"] }, id: () => string, woId: (fid: string) => string): FmEvent[] | null {
  switch (a.kind) {
    case "safety_stop": case "gas_test": return [{ ...base, id: id(), kind: "wo_update", woId: String(a.payload.woId), patch: a.payload.patch as never, summary: a.title }];
    case "assign_crew": return [{ ...base, id: id(), kind: "wo_update", woId: String(a.payload.woId), patch: a.payload.patch as never, summary: a.title }, { ...base, id: id(), kind: "crew_status", crewId: String(a.payload.crewId), status: "on_job", summary: `${a.payload.crewId} on ${a.payload.woId}` }];
    case "robot_mission": {
      const m = { ...(a.payload.mission as Mission), plannedStart: new Date(Date.parse(base.at) + MIN).toISOString() };
      const evs: FmEvent[] = [{ ...base, id: id(), kind: "mission_create", mission: m, summary: `${m.id}: ${MISSION_LABEL[m.kind]} by ${d.robots.find((r) => r.id === m.robotId)?.name}` }];
      const w = d.workOrders.find((x) => x.id === a.payload.woId);
      // a check that is the job itself puts the robot on it; a re-test of a job held for gas only links the mission
      if (w) evs.push({ ...base, id: id(), kind: "wo_update", woId: w.id, patch: w.status === "on_hold" ? { missionId: m.id, note: `Gas re-test sent: ${m.id}.` } : { robot: m.robotId, missionId: m.id, status: "in_progress", note: `Robot check sent: ${m.id}.` }, summary: `${w.id} → ${m.id}` });
      return evs;
    }
    case "robot_finding": {
      const wo = { ...(a.payload.wo as WorkOrder), id: woId(a.facilityId), raised: base.at };
      return [{ ...base, id: id(), kind: "wo_create", wo, summary: `raised ${wo.id} ${wo.priority} — ${wo.title}` }, { ...base, id: id(), kind: "finding_ack", findingId: String(a.payload.findingId), woId: wo.id, summary: `finding → ${wo.id}` }];
    }
    case "rule": {
      if (a.effect === "notify") return [{ ...base, id: id(), kind: "notify", facilityId: a.facilityId, via: a.payload.channel as "teams" | "email", ...(a.payload.to ? { to: String(a.payload.to) } : {}), title: String(a.payload.title), text: String(a.payload.text), summary: a.title }];
      const m = { ...(a.payload.mission as Mission), plannedStart: new Date(Date.parse(base.at) + MIN).toISOString() };
      return [{ ...base, id: id(), kind: "mission_create", mission: m, summary: `${m.id}: ${MISSION_LABEL[m.kind]} by ${d.robots.find((r) => r.id === m.robotId)?.name} (${a.title})` }];
    }
    case "assign_pilot": return a.payload.pilotId ? [{ ...base, id: id(), kind: "mission_pilot", missionId: String(a.payload.missionId), pilotId: String(a.payload.pilotId), summary: a.title }] : [];
    case "robot_support": {
      const m = { ...(a.payload.mission as Mission), plannedStart: new Date(Date.parse(base.at) + MIN).toISOString() };
      const w = d.workOrders.find((x) => x.id === a.payload.woId);
      return [{ ...base, id: id(), kind: "mission_create", mission: m, summary: `${m.id}: ${MISSION_LABEL[m.kind]} by ${d.robots.find((r) => r.id === m.robotId)?.name}` },
        ...(w ? [{ ...base, id: id(), kind: "wo_update" as const, woId: w.id, patch: { support: [...(w.support ?? []), { robotId: m.robotId, role: "gas watch", missionId: m.id }], note: `${d.robots.find((r) => r.id === m.robotId)?.name} on gas watch beside the people on the job (${m.id}).` }, summary: `${w.id}: robot gas watch` }] : [])];
    }
    case "robot_recall": return [{ ...base, id: id(), kind: "mission_update", missionId: String(a.payload.missionId), status: "aborted", note: "Recalled: low battery", summary: a.title }];
    case "security_response": {
      const m = a.payload.mission as Mission | undefined;
      const mm = m ? { ...m, plannedStart: new Date(Date.parse(base.at) + MIN).toISOString() } : undefined;
      return [...(mm ? [{ ...base, id: id(), kind: "mission_create" as const, mission: mm, summary: `${mm.id}: ${MISSION_LABEL[mm.kind]} by ${d.robots.find((r) => r.id === mm.robotId)?.name}` }] : []),
        { ...base, id: id(), kind: "security_update", alertId: String(a.payload.alertId), status: a.payload.status as never, ...(mm || a.payload.missionId ? { missionId: mm?.id ?? String(a.payload.missionId) } : {}), ...(a.payload.note ? { note: String(a.payload.note) } : {}), summary: a.title }];
    }
    case "combine_missions": {
      const m = a.payload.mission as Mission;
      return [...(a.payload.abort as string[]).map((x) => ({ ...base, id: id(), kind: "mission_update" as const, missionId: x, status: "aborted" as const, note: `Combined into ${m.id}`, summary: `${x} → ${m.id}` })),
        { ...base, id: id(), kind: "mission_create", mission: m, summary: `${m.id}: ${m.title}` }];
    }
    default: return null;
  }
}

/** What finished robot checks mean for the jobs they were sent for (gas-free or not, recorded on the job) and for the
 *  security alerts they checked (cleared when nobody was seen). */
export function robotOutcomes(d: FmData) {
  for (const al of d.securityAlerts.filter((x) => x.status === "checking" && x.missionId)) {
    const m = d.missions.find((x) => x.id === al.missionId);
    if (!m || m.status !== "done") continue;
    const seen = m.findings.filter((f) => f.sensor === "intrusion" && f.zone === al.zone);
    const r = d.robots.find((x) => x.id === m.robotId)?.name ?? "the robot";
    if (seen.length) { al.status = "escalated"; al.note = `${r} saw: ${seen.map((f) => f.label).join("; ")} — security responding.`; }
    else { al.status = "cleared"; al.note = `${r} checked at ${local(m.ended)}: nobody there, fence intact.`; al.by = r; }
  }
  // a robot on gas watch beside people: gas read → the job stops at once (while it watches, not only at the end)
  for (const m of d.missions.filter((x) => x.kind === "gas_watch" && x.woId && (x.status === "running" || x.status === "done"))) {
    const w = d.workOrders.find((x) => x.id === m.woId), gas = m.findings.filter((f) => f.sensor === "gas" && f.severity !== "low" && f.severity !== "info");
    if (!w || !gas.length || w.status === "done" || w.status === "on_hold") continue;
    const robot = d.robots.find((r) => r.id === m.robotId)?.name ?? "the robot";
    w.status = "on_hold"; w.holdReason = `Gas in the area — ${robot} on gas watch read ${gas[0].label}`;
    if (w.permit && w.permit.status !== "closed") w.permit.status = "suspended";
    w.notes.push({ at: gas[0].at, by: robot, text: `Work stopped: ${gas[0].label}. Crew told to leave the area.`, via: "orchestrator" as never });
  }
  for (const m of d.missions.filter((x) => x.woId && x.status === "done" && x.kind !== "gas_watch")) {
    const w = d.workOrders.find((x) => x.id === m.woId);
    if (!w || w.status === "done") continue;
    const gas = m.findings.filter((f) => f.sensor === "gas" && f.severity !== "low" && f.severity !== "info");
    const robot = d.robots.find((r) => r.id === m.robotId)?.name ?? "robot";
    if (gas.length) {
      w.gasTest = { status: "failed", at: m.ended, by: robot, reading: gas.map((f) => f.label).join("; ") };
      w.status = "on_hold"; w.holdReason = `Not gas-free: ${gas[0].label}`;
    } else {
      const clear = { status: "done" as const, at: m.ended, by: robot, reading: "LEL < 10 %, H₂S < 1 ppm, O₂ 20.9 % (robot check)" };
      w.gasTest = clear; clearGasHold(w);
      // a survey of the area clears every job held for gas there before it ran
      if (m.kind === "gas_survey") for (const x of d.workOrders.filter((y) => y !== w && y.status === "on_hold" && GAS_HOLD.test(y.holdReason ?? "") && zoneOfWo(d, y)?.id === m.waypoints[0]?.zone)) { x.gasTest = clear; clearGasHold(x); }
      // the job was the check itself: done, with the robot's pictures as evidence
      if (w.requires?.length) { w.status = "done"; w.done = m.ended; w.evidence = [...new Set([...w.evidence, ...m.waypoints.map((x) => `photo — ${x.label}`)])]; w.checklist.forEach((c) => (c.done = true)); }
    }
  }
}

/** Who works with what right now: every open job and live mission, by team shape — people only, robots only (the AI
 *  driving them), AI-orchestrated people and robots beside them, or a person piloting a robot. */
export function teams(d: FmData, facilityId: string) {
  const live = (id?: string) => d.missions.find((m) => m.id === id && (m.status === "planned" || m.status === "running"));
  const crewOf = (w: WorkOrder) => (w.crew ? d.crews.find((c) => c.id === w.crew) : undefined);
  const person = (id?: string) => d.technicians.find((t) => t.id === id);
  const robotRow = (robotId: string, role: string, m?: Mission) => { const r = d.robots.find((x) => x.id === robotId)!; const pilot = person(m?.pilotId);
    return { robot: r.name, vendor: r.vendor, role, control: r.autonomy, pilot: pilot?.name ?? null, missionId: m?.id ?? null, status: m?.status ?? null }; };
  const jobs = d.workOrders.filter((w) => w.facilityId === facilityId && isOpen(w) && (w.crew || w.assignee || w.robot || w.support?.length)).map((w) => {
    const c = crewOf(w), t = person(w.assignee);
    const people = [...(c ? [`${c.name} (${c.size})`] : []), ...(t ? [t.name] : [])];
    const robots = [...(w.robot ? [robotRow(w.robot, "does the job", d.missions.find((m) => m.id === w.missionId))] : []), ...(w.support ?? []).filter((s) => live(s.missionId) || d.missions.find((m) => m.id === s.missionId)?.status === "done").map((s) => robotRow(s.robotId, s.role, d.missions.find((m) => m.id === s.missionId)))];
    const mode = robots.length && people.length ? (robots.some((r) => r.control === "remote") ? "people with a piloted robot" : "AI-orchestrated people and robots") : robots.length ? (robots.some((r) => r.control === "remote") ? "a person piloting a robot" : "robots only (AI-controlled)") : "people only";
    return { id: w.id, title: w.title, status: w.status, people, robots, mode };
  });
  // missions not tied to a job: robots on their own (AI) or with their pilot
  const missions = d.missions.filter((m) => m.facilityId === facilityId && (m.status === "planned" || m.status === "running") && !m.woId).map((m) => {
    const r = d.robots.find((x) => x.id === m.robotId)!, p = person(m.pilotId);
    return { id: m.id, title: m.title, start: m.plannedStart, status: m.status, robot: r.name, control: r.autonomy, pilot: p?.name ?? null, mode: r.autonomy === "remote" ? (p ? "a person piloting a robot" : "waiting for a pilot") : "robot only (AI-controlled)" };
  });
  return { jobs, missions };
}

/** A turnaround at a glance: progress, what is under way, waiting or not given out, the crews on it, the cost. */
export function turnaround(d: FmData, pkg: string) {
  const ws = d.workOrders.filter((w) => w.package === pkg);
  if (!ws.length) return null;
  const crews = [...new Set(ws.filter((w) => w.crew && isOpen(w)).map((w) => w.crew!))].map((id) => d.crews.find((c) => c.id === id)!).filter(Boolean);
  const start = ws.map((w) => w.plannedStart!).sort()[0], end = ws.map((w) => w.plannedEnd!).sort().slice(-1)[0];
  const cost = ws.filter((w) => w.crew).reduce((s, w) => { const k = d.contractors.find((x) => x.id === d.crews.find((c) => c.id === w.crew)?.contractorId); const days = Math.max(1, Math.round((Date.parse(w.plannedEnd!) - Date.parse(w.plannedStart!)) / 86400_000) + 1); return s + (k?.dayRate ?? 0) * days; }, 0);
  return {
    package: pkg, asset: d.assets.find((a) => a.id === ws[0].assetId)?.tag, start, end, daysLeft: Math.max(0, Math.round((Date.parse(end) - Date.parse(d.date)) / 86400_000)),
    progress: Math.round((ws.filter((w) => w.status === "done").length / ws.length) * 100),
    jobs: ws.map((w) => ({ id: w.id, title: w.title, status: w.status, crew: d.crews.find((c) => c.id === w.crew)?.name, robot: d.robots.find((r) => r.id === w.robot)?.name, waitingFor: waitingFor(d, w), plannedStart: w.plannedStart, plannedEnd: w.plannedEnd, permit: w.permit, gasTest: w.gasTest, hold: w.holdReason })),
    onSite: crews.map((c) => ({ crew: c.name, contractor: d.contractors.find((k) => k.id === c.contractorId)?.name, people: c.size })), people: crews.reduce((s, c) => s + c.size, 0), committed: cost,
  };
}
