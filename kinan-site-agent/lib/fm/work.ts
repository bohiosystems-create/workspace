// The work layer: who (or what) does each job, and what keeps it safe. People, contractor crews and robots are all
// workers here — matched to a job by what it needs (skills, a sensor, access to a hazardous area) — and the safety
// rules that apply to all of them: no hot work where there is gas, nobody into a space that hasn't been checked, no
// robot where it isn't certified to go, nothing started before the jobs it waits for are finished. The orchestrator
// (orchestrator.ts) turns these into proposals with their reasons; approved, they become events like everything else.
import type { Action, Crew, FmData, FmEvent, Priority, WorkOrder, ZoneDef } from "./types";
import type { Capability, Finding, Mission, Robot, Waypoint } from "../robots/types";
import { CAPABILITY_LABEL, MISSION_LABEL } from "../robots/types";
import { nearLimit } from "../robots/sim";
import { GAS_HOLD, PRIORITY_SLA, bestTech, clearGasHold, isOpen } from "./engine";

const MIN = 60_000;

// ------------------------------------------------------------------ places
export const zoneNamed = (d: FmData, facilityId: string, name?: string) => d.zones.find((z) => z.facilityId === facilityId && z.name === name);
/** Where a job is: its own zone, or its asset's. */
export const zoneOfWo = (d: FmData, w: WorkOrder) => zoneNamed(d, w.facilityId, w.zone ?? d.assets.find((a) => a.id === w.assetId)?.zone);
/** A robot may go where it is certified to: an Ex-rated robot anywhere; the others only outside hazardous areas. */
export const robotMayEnter = (r: Robot, z?: ZoneDef) => !z || z.atex === null || r.exRated;
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
    take(`${f.label}, found by ${d.robots.find((r) => r.id === f.robotId)?.name ?? "a robot"} at ${f.at.slice(11, 16)} UTC`, f.limit ? f.value / f.limit : 1);
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
export function pickRobot(d: FmData, facilityId: string, checks: Capability[], zones: (ZoneDef | undefined)[], durationMin: number, now: number): { robot?: Robot; why: string[] } {
  const reasons: string[] = [];
  const xs = d.robots.filter((r) => r.facilityId === facilityId).filter((r) => {
    if (!checks.every((c) => r.capabilities.includes(c))) return false;
    if (zones.some((z) => !robotMayEnter(r, z))) { reasons.push(`${r.name} isn't certified for hazardous areas`); return false; }
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

  // 3. A robot found something nobody is working on: raise the work for people.
  for (const m of d.missions.filter((x) => fac(x.facilityId))) for (const f of m.findings.filter((x) => !x.acknowledged && !x.woId && (x.severity === "medium" || x.severity === "high" || x.severity === "critical"))) {
    const a = f.assetId ? asset(f.assetId) : undefined;
    if (!a) continue;
    const covered = d.workOrders.some((w) => w.assetId === a.id && isOpen(w) && w.type !== "PM" && w.type !== "TAR") || d.alarms.some((al) => al.assetId === a.id && !al.acknowledged && !al.woId && al.severity !== "low");
    if (covered) continue;
    const pr = sevPri[f.severity], robot = d.robots.find((r) => r.id === f.robotId);
    const z = zoneNamed(d, a.facilityId, a.zone), hazardous = !!z?.atex;
    const wo: WorkOrder = { id: "", facilityId: a.facilityId, assetId: a.id, type: f.severity === "critical" ? "Emergency" : "CM", priority: pr, status: "open", title: `${f.sensor === "ut_thickness" ? "Assess and repair" : "Investigate"}: ${f.label}`,
      detail: `Found by ${robot?.name ?? "a robot"} on "${m.title}" at ${f.at.slice(11, 16)} UTC (${f.sensor.replace("_", " ")}). ${f.image ? `Image: ${f.image}.` : ""}`, raised: new Date(now).toISOString(), due: new Date(now + PRIORITY_SLA[pr] * 3600_000).toISOString().slice(0, 10), slaHours: PRIORITY_SLA[pr],
      source: "robot", raisedBy: robot?.name ?? "Robot", checklist: [{ text: "Gas test and permit before work", done: false }, { text: "Confirm the reading on site", done: false }, { text: "Repair or make safe", done: false }, { text: "Record; the next robot round re-checks it", done: false }], spares: [], notes: [], evidence: f.image ? [f.image] : [],
      ...(hazardous ? { gasTest: { status: "required" as const } } : {}) };
    const { tech, why } = bestTech(d, wo, handed, exclude?.(`finding:${f.id}`));
    push({ id: `finding:${f.id}`, facilityId: a.facilityId, kind: "robot_finding", title: `Raise ${pr} work from ${robot?.name ?? "the robot"}'s finding at ${a.tag}${tech ? ` and give it to ${tech.name}` : ""}`,
      why: [`${f.label} — ${f.severity}`, `${m.title}, ${f.at.slice(11, 16)} UTC`, `${a.name}, criticality ${a.criticality}`, ...(tech ? why : []), ...(hazardous ? [`${zoneLabel(z)}: gas test before work`] : []), "The next round re-checks it after the repair"],
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
    case "robot_recall": return [{ ...base, id: id(), kind: "mission_update", missionId: String(a.payload.missionId), status: "aborted", note: "Recalled: low battery", summary: a.title }];
    default: return null;
  }
}

/** What finished robot checks mean for the jobs they were sent for: gas-free or not, recorded on the job. */
export function robotOutcomes(d: FmData) {
  for (const m of d.missions.filter((x) => x.woId && x.status === "done")) {
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
