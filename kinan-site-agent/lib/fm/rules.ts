// Rules the operator writes: "when a robot finds this (or an alert of this kind comes in), do that" — send a robot that
// can look closer, or tell people on Teams or by email. They sit beside the orchestrator's own reasoning (work.ts):
// each match becomes a proposal with the rule's name in its reasons, approved like any other (or run by the autopilot
// within its signed policy). Kept per installation in db.fmConfig.rules; the defaults below apply until someone edits.
import type { Action, FmData, SecurityAlert } from "./types";
import type { Capability, Domain, Finding, MissionKind } from "../robots/types";
import { CAPABILITY_LABEL, DOMAIN_OF, MISSION_LABEL } from "../robots/types";

export type Severity = Finding["severity"];
export const SEVERITY: Severity[] = ["info", "low", "medium", "high", "critical"];

export interface Rule {
  id: string; name: string; enabled: boolean;
  /** only at this facility (all when absent) */
  facilityId?: string;
  when:
    | { on: "finding"; sensors?: Capability[]; minSeverity?: Severity; /** found by a robot of this domain */ by?: Domain }
    | { on: "alert"; kinds?: SecurityAlert["kind"][] };
  then:
    | { do: "send_robot"; needs: Capability[]; mission: MissionKind; /** a robot of another domain than the finder (a ground robot after a drone) */ notBy?: Domain }
    | { do: "notify"; channel: "teams" | "email"; to?: string };
}

export const DEFAULT_RULES: Rule[] = [
  { id: "drone-hotspot", name: "A drone sees a hot spot → a ground robot checks it close up", enabled: true, when: { on: "finding", sensors: ["thermal", "visual"], minSeverity: "medium", by: "air" }, then: { do: "send_robot", needs: ["thermal", "acoustic"], mission: "thermal_survey", notBy: "air" } },
  { id: "gas-survey", name: "Gas read by any robot → an Ex robot surveys the area", enabled: true, when: { on: "finding", sensors: ["gas"], minSeverity: "high" }, then: { do: "send_robot", needs: ["gas"], mission: "gas_survey" } },
  { id: "gas-teams", name: "Gas read by any robot → tell the control room on Teams", enabled: true, when: { on: "finding", sensors: ["gas"], minSeverity: "high" }, then: { do: "notify", channel: "teams" } },
  { id: "security-teams", name: "A person, vehicle or drone where it shouldn't be → tell security on Teams", enabled: true, when: { on: "alert", kinds: ["person", "vehicle", "drone"] }, then: { do: "notify", channel: "teams" } },
  { id: "airside-teams", name: "Debris or birds on the airfield → tell airfield operations on Teams", enabled: true, when: { on: "alert", kinds: ["fod", "wildlife"] }, then: { do: "notify", channel: "teams" } },
  { id: "thin-wall-email", name: "A wall thinner than its limit → email the integrity engineer", enabled: true, when: { on: "finding", sensors: ["ut_thickness"], minSeverity: "high" }, then: { do: "notify", channel: "email" } },
];

/** A rule in one sentence, for the cockpit. */
export function ruleText(r: Rule) {
  const w = r.when.on === "finding"
    ? `a robot${r.when.by ? ` in the ${r.when.by === "air" ? "air" : r.when.by}` : ""} finds ${r.when.sensors?.length ? r.when.sensors.map((c) => CAPABILITY_LABEL[c]).join(" or ") : "anything"}${r.when.minSeverity ? ` at ${r.when.minSeverity} or worse` : ""}`
    : `an alert comes in${r.when.kinds?.length ? `: ${r.when.kinds.join(", ")}` : ""}`;
  const t = r.then.do === "send_robot" ? `send a${r.then.notBy === "air" ? " ground" : ""} robot with ${r.then.needs.map((c) => CAPABILITY_LABEL[c]).join(", ")} on a ${MISSION_LABEL[r.then.mission]}` : `tell people by ${r.then.channel === "teams" ? "Teams" : "email"}${r.then.to ? ` (${r.then.to})` : ""}`;
  return `When ${w}, ${t}.`;
}

/** Check a rule list the operator sent: a clear refusal for anything that wouldn't run. */
export function validRules(xs: unknown): Rule[] {
  if (!Array.isArray(xs) || xs.length > 60) throw new Error("Send a list of up to 60 rules.");
  const caps = Object.keys(CAPABILITY_LABEL), kinds = ["fence", "person", "vehicle", "drone", "camera", "fod", "wildlife"];
  return xs.map((x, i) => {
    const r = x as Rule;
    if (!r || typeof r.id !== "string" || !/^[a-z0-9-]{2,40}$/.test(r.id)) throw new Error(`Rule ${i + 1}: id of 2–40 lower-case letters, digits or dashes.`);
    if (typeof r.name !== "string" || !r.name.trim()) throw new Error(`Rule ${r.id}: a name.`);
    if (r.when?.on === "finding") { if (r.when.sensors?.some((c) => !caps.includes(c))) throw new Error(`Rule ${r.id}: unknown sensor.`); if (r.when.minSeverity && !SEVERITY.includes(r.when.minSeverity)) throw new Error(`Rule ${r.id}: severity is one of ${SEVERITY.join(", ")}.`); }
    else if (r.when?.on === "alert") { if (r.when.kinds?.some((k) => !kinds.includes(k))) throw new Error(`Rule ${r.id}: alert kind is one of ${kinds.join(", ")}.`); }
    else throw new Error(`Rule ${r.id}: "when" is a finding or an alert.`);
    if (r.then?.do === "send_robot") { if (!r.then.needs?.length || r.then.needs.some((c) => !caps.includes(c))) throw new Error(`Rule ${r.id}: the robot's sensors.`); if (!(r.then.mission in MISSION_LABEL)) throw new Error(`Rule ${r.id}: unknown mission.`); }
    else if (r.then?.do === "notify") { if (r.then.channel !== "teams" && r.then.channel !== "email") throw new Error(`Rule ${r.id}: notify by teams or email.`); }
    else throw new Error(`Rule ${r.id}: "then" sends a robot or notifies.`);
    return { id: r.id, name: r.name.trim().slice(0, 120), enabled: r.enabled !== false, ...(r.facilityId ? { facilityId: String(r.facilityId) } : {}), when: r.when, then: r.then };
  });
}

/** What the rules ask for now: the findings and alerts each enabled rule matches (the orchestrator makes proposals of them). */
export function ruleMatches(d: FmData, rules: Rule[], fac: (id: string) => boolean) {
  const out: { rule: Rule; finding?: Finding; alert?: SecurityAlert }[] = [];
  const atLeast = (s: Severity, min?: Severity) => !min || SEVERITY.indexOf(s) >= SEVERITY.indexOf(min);
  for (const rule of rules.filter((r) => r.enabled)) {
    if (rule.when.on === "finding") {
      const w = rule.when;
      for (const m of d.missions.filter((x) => fac(x.facilityId) && (!rule.facilityId || x.facilityId === rule.facilityId))) for (const f of m.findings) {
        const by = d.robots.find((r) => r.id === f.robotId);
        if ((w.sensors?.length && !w.sensors.includes(f.sensor)) || !atLeast(f.severity, w.minSeverity) || (w.by && (!by || DOMAIN_OF[by.kind] !== w.by))) continue;
        out.push({ rule, finding: f });
      }
    } else {
      const w = rule.when;
      for (const a of d.securityAlerts.filter((x) => fac(x.facilityId) && (!rule.facilityId || x.facilityId === rule.facilityId) && x.status !== "cleared" && (!w.kinds?.length || w.kinds.includes(x.kind)))) out.push({ rule, alert: a });
    }
  }
  return out;
}

export const ruleActionKind: Action["kind"] = "rule";
