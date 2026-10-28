"use client";
/**
 * The operator cockpit's queue and rules: what the automation couldn't finish (exceptions — first thing to look at),
 * the rules that turn findings and alerts into robot missions and messages, and what went to the customer's systems.
 */
import { useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";
import { CAPABILITY_LABEL, MISSION_LABEL, type Capability, type MissionKind } from "@/lib/robots/types";
import type { Rule } from "@/lib/fm/rules";
import type { integrationsConfigured } from "@/lib/integrations/status";

type FS = ReturnType<typeof facilityStateFor> & { connected?: ReturnType<typeof integrationsConfigured> };
type Doit = (k: string, b: Record<string, unknown>) => Promise<void>;
const time = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? "today" : new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }));

export function ExceptionsPanel({ s, onRobot }: { s: FS; onRobot: (id: string) => void }) {
  return (
    <section className="ops-panel">
      <p className="muted small">What the automation couldn&apos;t finish: a mission that never reached its robot, a robot stopped or silent, a mission that should have started, an alert nobody answered, a message a customer system didn&apos;t take. Everything else runs by itself or waits in the orchestrator&apos;s queue.</p>
      {s.exceptions.length === 0 && <p className="studio-ok">Nothing needs you: every mission reached its robot, every robot is reporting, every alert is answered.</p>}
      <ul className="ops-list">
        {s.exceptions.map((x) => (
          <li key={x.id}>
            <span className={`ops-pill ${x.severity}`}>{x.severity}</span>
            <span className="grow"><b>{x.title}</b><em>{x.detail} · {time(x.at)}</em></span>
            {x.robotId && <button className="mini" onClick={() => onRobot(x.robotId!)}>Open the robot</button>}
          </li>
        ))}
      </ul>
      {s.connected && <Connected c={s.connected} />}
      {s.integrations.length > 0 && <>
        <div className="rpt-label">Sent to the customer&apos;s systems</div>
        <ul className="ops-list">
          {s.integrations.map((x) => (
            <li key={x.id} className={x.ok ? "dim" : ""}><span className={`ops-pill ${x.ok ? "low" : "high"}`}>{x.ok ? "sent" : "failed"}</span>
              <span className="grow"><b>{x.target}: {x.what}</b><em>{x.note}{x.ref ? ` · ${x.ref}` : ""} · {time(x.at)}</em></span></li>
          ))}
        </ul>
      </>}
    </section>
  );
}

/** What the core is connected to on the customer's side: their maintenance system, Teams, email, subscribers, the API. */
function Connected({ c }: { c: ReturnType<typeof integrationsConfigured> }) {
  const items: [string, boolean, string][] = [
    ["Maintenance system", c.cmms.length > 0, c.cmms.length ? c.cmms.map((x) => x.name).join(", ") : "not set (CMMS) — work orders stay here"],
    ["Teams", c.teams, c.teams ? "alerts posted to the channel" : "not set (TEAMS_WEBHOOK_URL)"],
    ["Email", c.email, c.email ? "alerts by Outlook" : "not set (ALERT_EMAIL_TO)"],
    ["Webhooks", c.webhooks.length > 0, c.webhooks.length ? c.webhooks.map((h) => h.host).join(", ") : "none subscribed (WEBHOOKS)"],
    ["REST API", c.api, c.api ? "/api/v1 open to their systems" : "off (ORCH_API_TOKEN)"],
  ];
  return (
    <>
      <div className="rpt-label">Connected to the customer&apos;s systems</div>
      <ul className="ops-list">
        {items.map(([k, on, v]) => <li key={k} className={on ? "" : "dim"}><span className={`ops-pill ${on ? "low" : "medium"}`}>{on ? "on" : "off"}</span><span className="grow"><b>{k}</b><em>{v}</em></span></li>)}
      </ul>
    </>
  );
}

const SENSORS: Capability[] = ["visual", "thermal", "gas", "acoustic", "ut_thickness", "intrusion", "fod", "sonar"];
const KINDS = ["person", "vehicle", "drone", "fence", "fod", "wildlife", "camera"];

export function RulesPanel({ s, doit, busy }: { s: FS; doit: Doit; busy: string | null }) {
  const plain = (r: (typeof s.rules)[number]): Rule => { const { text: _t, ...rest } = r; void _t; return rest as Rule; };
  const all = s.rules.map(plain);
  const save = (rules: Rule[]) => doit("rules", { action: "rules", facilityId: s.facility.id, rules });
  const [on, setOn] = useState<"finding" | "alert">("finding");
  const [sensor, setSensor] = useState<Capability>("thermal");
  const [sev, setSev] = useState("medium");
  const [byAir, setByAir] = useState(true);
  const [kind, setKind] = useState("person");
  const [then, setThen] = useState<"send_robot" | "notify">("send_robot");
  const [needs, setNeeds] = useState<Capability>("thermal");
  const [mission, setMission] = useState<MissionKind>("thermal_survey");
  const [channel, setChannel] = useState<"teams" | "email">("teams");
  const add = () => {
    const when: Rule["when"] = on === "finding" ? { on, sensors: [sensor], minSeverity: sev as Rule extends { when: { minSeverity?: infer S } } ? S : never, ...(byAir ? { by: "air" as const } : {}) } : { on, kinds: [kind as never] };
    const thenR: Rule["then"] = then === "send_robot" ? { do: then, needs: [needs], mission, ...(on === "finding" && byAir ? { notBy: "air" as const } : {}) } : { do: then, channel };
    const name = on === "finding" ? `${byAir ? "A drone" : "A robot"} finds ${CAPABILITY_LABEL[sensor]} at ${sev}+ → ${then === "send_robot" ? `send a ${byAir ? "ground " : ""}robot (${MISSION_LABEL[mission]})` : `tell people by ${channel}`}` : `Alert: ${kind} → ${then === "send_robot" ? `send a robot (${MISSION_LABEL[mission]})` : `tell people by ${channel}`}`;
    save([...all, { id: `r-${Date.now().toString(36)}`, name, enabled: true, facilityId: s.facility.id, when, then: thenR }]);
  };
  return (
    <section className="ops-panel">
      <p className="muted small">Rules turn what robots find and what alerts come in into work: send a robot that can look closer, or tell people on Teams or by email. Each match becomes a proposal with the rule in its reasons; the autopilot runs it only within its signed policy. Managers and directors edit the rules.</p>
      <ul className="ops-list">
        {s.rules.map((r) => (
          <li key={r.id} className={r.enabled ? "" : "dim"}>
            <span className={`ops-pill ${r.enabled ? "low" : "medium"}`}>{r.enabled ? "on" : "off"}</span>
            <span className="grow"><b>{r.name}</b><em>{r.text}</em></span>
            <button className="mini" disabled={!!busy} onClick={() => save(all.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}>{r.enabled ? "Turn off" : "Turn on"}</button>
          </li>
        ))}
      </ul>
      <div className="rpt-label">Add a rule</div>
      <form className="od-grid" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label>When<select id="rule-on" value={on} onChange={(e) => setOn(e.target.value as "finding" | "alert")}><option value="finding">a robot finds</option><option value="alert">an alert comes in</option></select></label>
        {on === "finding" ? <>
          <label>Finds<select id="rule-sensor" value={sensor} onChange={(e) => setSensor(e.target.value as Capability)}>{SENSORS.map((c) => <option key={c} value={c}>{CAPABILITY_LABEL[c]}</option>)}</select></label>
          <label>At least<select id="rule-sev" value={sev} onChange={(e) => setSev(e.target.value)}>{["low", "medium", "high", "critical"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Found by<select id="rule-by" value={byAir ? "air" : "any"} onChange={(e) => setByAir(e.target.value === "air")}><option value="air">a drone</option><option value="any">any robot</option></select></label>
        </> : <label>Alert<select id="rule-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((x) => <option key={x}>{x}</option>)}</select></label>}
        <label>Then<select id="rule-then" value={then} onChange={(e) => setThen(e.target.value as "send_robot" | "notify")}><option value="send_robot">send a robot</option><option value="notify">tell people</option></select></label>
        {then === "send_robot" ? <>
          <label>With<select id="rule-needs" value={needs} onChange={(e) => setNeeds(e.target.value as Capability)}>{SENSORS.map((c) => <option key={c} value={c}>{CAPABILITY_LABEL[c]}</option>)}</select></label>
          <label>On a<select id="rule-mission" value={mission} onChange={(e) => setMission(e.target.value as MissionKind)}>{(["thermal_survey", "gas_survey", "inspection_round", "alarm_check", "runway_inspection", "thickness_survey"] as MissionKind[]).map((k) => <option key={k} value={k}>{MISSION_LABEL[k]}</option>)}</select></label>
        </> : <label>By<select id="rule-channel" value={channel} onChange={(e) => setChannel(e.target.value as "teams" | "email")}><option value="teams">Teams</option><option value="email">email</option></select></label>}
        <div className="od-acts"><button className="studio-add" disabled={!!busy}>Add the rule</button></div>
      </form>
    </section>
  );
}
