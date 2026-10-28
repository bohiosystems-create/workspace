"use client";
/**
 * The work layer in the control room: the plant's map with its hazard zones, gas, robots, crews and people; the
 * workforce (in-house people, contractor crews, robots) with what each is doing; a robot's sheet (its mission, what it
 * found, send it / cancel / emergency stop); the turnaround, job by job; the robots' findings; and security alerts.
 * Robots of many makers — on land, in the air, at sea — are one fleet here; the fleets table says how each is connected.
 */
import { useMemo, useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";
import { CAPABILITY_LABEL, DOMAIN_LABEL, DOMAIN_OF, MISSION_LABEL, ROLE_LABEL, type Capability, type Mission, type MissionKind } from "@/lib/robots/types";

type FS = ReturnType<typeof facilityStateFor>;
type Robot = FS["robots"][number];
type Doit = (k: string, b: Record<string, unknown>) => Promise<void>;

const ROBOT_STATUS: Record<string, string> = { docked: "Docked", charging: "Charging", on_mission: "On a mission", returning: "Returning", fault: "Fault", estop: "Emergency stop", offline: "Offline" };
const KIND_ICON: Record<string, string> = { quadruped: "🐕", drone: "🛸", crawler: "🧲", layout: "📐", rover: "🚙", ugv: "🚜", fixed_wing: "✈️", rov: "🐟", usv: "🚤", in_pipe: "🔩" };
const icon = (r: Robot) => (r.roles.includes("security") && r.kind === "ugv" ? "🛡️" : r.capabilities.includes("manipulate") ? "🦾" : KIND_ICON[r.kind] ?? "🤖");
const CONN: Record<string, string> = { sim: "simulated in this demo", rmf: "Open-RMF", vendor: "vendor API", platform: "vendor data platform (findings in)" };
const HAZARD: Record<string, string> = { h2s: "H₂S", hydrocarbon: "hydrocarbons", high_voltage: "high voltage", confined_space: "confined space", height: "height", hot_surface: "hot surfaces", noise: "noise", marine: "marine" };
const ALERT_ICON: Record<string, string> = { fence: "🚧", person: "🚶", vehicle: "🚗", drone: "🛸", camera: "📹" };
/** Text that fits a zone's width on the map (≈0.56 em per character). */
const fit = (t: string, width: number, size: number) => { const n = Math.floor(width / (size * 0.56)); return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t; };
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "");
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
const centre = (s: FS, zoneId?: string) => { const z = s.zones.find((x) => x.id === zoneId || x.name === zoneId); return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null; };

// ======================================================================== the plant map
export function PlantMap({ s, onRobot }: { s: FS; onRobot: (id: string) => void }) {
  const crewsBy = (zone: string) => s.crews.filter((c) => c.zone === zone && c.status !== "off");
  const techsBy = (zone: string) => s.technicians.filter((t) => t.zone === zone && t.shift !== "off" && t.status !== "off");
  const running = s.missions.filter((m) => m.status === "running");
  return (
    <figure className="pm">
      <svg viewBox="0 0 100 60" className="pm-svg" role="img" aria-label={`${s.facility.name}: zones, robots and crews`}>
        {s.zones.map((z) => (
          <g key={z.id} className={`pm-zone ${z.atex ? `atex${z.atex}` : "safe"}${z.gas ? " gas" : ""}`}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1" />
            <text x={z.x + 1} y={z.y + 2.4} className="pm-zname">{fit(z.name, z.w - 2, 1.5)}<title>{z.name}</title></text>
            <text x={z.x + 1} y={z.y + 4.1} className="pm-zsub">{fit(`${z.atex ? `Zone ${z.atex}` : "Safe area"}${z.hazards.length ? ` · ${z.hazards.map((h) => HAZARD[h]).join(", ")}` : ""}`, z.w - 2, 1)}<title>{z.atex ? `Hazardous area, zone ${z.atex}` : "Safe area"}: {z.hazards.map((h) => HAZARD[h]).join(", ") || "no special hazards"}</title></text>
            {z.gas && <text x={z.x + 1} y={z.y + z.h - 1.2} className="pm-gas">{fit(`⚠ gas: ${z.gas.split(" at ")[0]}`, z.w - 2, 1.2)}<title>{z.gas}</title></text>}
            {/* people and crews in the zone */}
            {techsBy(z.name).map((t, i) => <circle key={t.id} cx={z.x + z.w - 2 - i * 1.8} cy={z.y + z.h - 2} r="0.7" className="pm-tech"><title>{t.name} · {t.role}</title></circle>)}
            {crewsBy(z.name).map((c, i) => (
              <g key={c.id} className={`pm-crew ${c.rating}`} transform={`translate(${z.x + 1 + i * 9}, ${z.y + z.h - 7})`}>
                <rect width="8" height="3.2" rx="0.6" /><text x="0.6" y="2.2">{c.name.split(" ")[0]} · {c.size}</text><title>{c.name} ({c.contractor}): {c.size} people — {c.jobs.map((j) => j.id).join(", ") || "no open job"}</title>
              </g>
            ))}
          </g>
        ))}
        {running.map((m) => {
          const pts = m.waypoints.map((w) => centre(s, w.zone)).filter(Boolean) as { x: number; y: number }[];
          return <polyline key={m.id} className="pm-route" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />;
        })}
        {s.securityAlerts.filter((a) => a.status !== "cleared").map((a, i) => {
          const c = centre(s, a.zone);
          return c && <g key={a.id} className={`pm-alert ${a.status}`} transform={`translate(${c.x + 4 + i * 0.5}, ${c.y - 3})`}><circle r="1.6" /><text y="0.6" textAnchor="middle">!</text><title>{a.source}: {a.text} — {a.status}</title></g>;
        })}
        {s.robots.map((r) => {
          // robots out in the plant sit where they are; the rest stand in their dock, two to a row, name underneath
          const home = s.robots.filter((x) => x.status !== "on_mission" && x.dock === r.dock), j = home.indexOf(r), dock = s.zones.find((z) => z.id === r.dock);
          const at = r.status === "on_mission" || !dock ? { x: r.x, y: r.y } : { x: dock.x + dock.w * (j % 2 ? 0.72 : 0.28), y: dock.y + 7 + Math.floor(j / 2) * 5 };
          return (
            <g key={r.id} className={`pm-robot ${r.status}`} transform={`translate(${at.x}, ${at.y})`} onClick={() => onRobot(r.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRobot(r.id)}>
              {DOMAIN_OF[r.kind] === "air" ? <polygon points="0,-1.4 1.3,1 -1.3,1" /> : DOMAIN_OF[r.kind] === "sea" || DOMAIN_OF[r.kind] === "subsea" ? <polygon points="0,-1.3 1.3,0 0,1.3 -1.3,0" /> : <circle r="1.1" />}
              <text y={2.8} textAnchor="middle">{r.name}</text><title>{r.name} · {r.vendor} · {DOMAIN_LABEL[DOMAIN_OF[r.kind]]} · {ROBOT_STATUS[r.status]} · {r.battery}%</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="pm-legend">
        <span><i className="sw atex1" />Hazardous area zone 1</span><span><i className="sw atex2" />Zone 2</span><span><i className="sw safe" />Safe area</span>
        <span><i className="sw robot" />Robot (● land ▲ air ◆ sea)</span><span><i className="sw crew" />Contractor crew</span><span><i className="sw tech" />In-house person</span><span><i className="sw gas" />Gas reading</span><span><i className="sw alert" />Security alert</span>
      </figcaption>
    </figure>
  );
}

// ======================================================================== the workforce
export function WorkforcePanel({ s, onRobot }: { s: FS; onRobot: (id: string) => void }) {
  return (
    <section className="ops-panel wf">
      <p className="muted small">Everyone and everything that can take a job: the facility&apos;s own people, contractor crews on site, and robots. The orchestrator picks among them by what the job needs — a skill, a sensor, access to a hazardous area — and who is free.</p>
      <div className="rpt-label">Fleets · {s.fleets.length} makers, one plan</div>
      <div className="ops-tablewrap"><table className="ops-table wf-fleets">
        <thead><tr><th>Maker</th><th>Robots</th><th>Where</th><th>Used for</th><th>Runs on</th><th>Operated by</th><th>Connected</th></tr></thead>
        <tbody>{s.fleets.map((f) => (
          <tr key={f.vendor}><td><b>{f.vendor}</b></td><td>{f.robots.join(", ")}</td><td>{f.domains.map((x) => DOMAIN_LABEL[x]).join(", ")}</td><td>{f.roles.map((x) => ROLE_LABEL[x]).join(", ")}</td>
            <td>{f.platform ?? "—"}</td><td>{f.operator ?? "—"}</td><td><span className={`ops-pill ${f.live ? "low" : "medium"}`}>{f.live ? `${f.connection} · live` : f.connection === "simulated" ? "simulated (demo)" : `${f.connection} · simulated here`}</span>{f.lastReport ? <em> last report {time(f.lastReport)}</em> : null}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="wf-cols">
        <div>
          <div className="rpt-label">Robots · {s.robots.length}</div>
          <ul className="wf-list">
            {s.robots.map((r) => {
              const m = s.missions.find((x) => x.id === r.missionId);
              return (
                <li key={r.id}><button onClick={() => onRobot(r.id)}>
                  <span className={`wf-dot robot ${r.status}`} aria-hidden="true">{icon(r)}</span>
                  <span className="grow"><b>{r.name}</b> <em>{r.vendor} · {DOMAIN_LABEL[DOMAIN_OF[r.kind]]} · {r.roles.map((x) => ROLE_LABEL[x]).join(", ")}{r.exRated ? " · Ex-certified" : ""}</em>
                    <em>{ROBOT_STATUS[r.status]}{m ? `: ${m.title} (${Math.round((m.progress ?? 0) * 100)}%)` : ""} · {s.zones.find((z) => z.id === r.zone)?.name ?? ""}</em></span>
                  <span className={`batt ${r.battery < 25 ? "bad" : r.battery < 50 ? "warn" : ""}`} title={`Battery ${r.battery}%`}><i style={{ width: `${r.battery}%` }} /><b>{r.battery}%</b></span>
                </button></li>
              );
            })}
          </ul>
        </div>
        <div>
          <div className="rpt-label">Contractor crews · {s.crews.length}</div>
          <ul className="wf-list">
            {s.crews.map((c) => (
              <li key={c.id}><span className="wf-row">
                <span className={`wf-dot crew ${c.rating}`} aria-hidden="true">{c.size}</span>
                <span className="grow"><b>{c.name}</b> <em>{c.contractor} · lead {c.lead}</em>
                  <em>{c.status.replace("_", " ")} · {c.zone}{c.jobs.length ? ` · ${c.jobs.map((j) => j.id).join(", ")}` : ""}</em></span>
                <span className={`ops-pill ${c.rating === "good" ? "low" : c.rating === "watch" ? "medium" : "high"}`} title="The contractor's record">{c.rating === "good" ? "good record" : c.rating === "watch" ? "on watch" : "on notice"}</span>
              </span></li>
            ))}
          </ul>
          <div className="rpt-label">Contractors</div>
          <ul className="wf-list">
            {s.contractors.map((k) => (
              <li key={k.id}><span className="wf-row"><span className="grow"><b>{k.name}</b> <em>{k.scope} · {k.contractRef} to {k.until} · {sar(k.dayRate)}/crew-day</em>
                <em>{k.performance.onTimePct}% on time · {k.performance.reworkPct}% rework · {k.performance.ltiFreeDays} days without a lost-time injury{k.performance.note ? ` — ${k.performance.note}` : ""}</em></span></span></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="rpt-label">In-house people · {s.technicians.filter((t) => t.shift !== "off").length} on shift</div>
          <ul className="wf-list">
            {s.technicians.map((t) => (
              <li key={t.id} className={t.shift === "off" ? "dim" : ""}><span className="wf-row">
                <span className={`tdot ${t.status}`} aria-hidden="true" />
                <span className="grow"><b>{t.name}</b> <em>{t.role}</em><em>{t.status.replace("_", " ")} · {t.zone} · {t.load} open job{t.load === 1 ? "" : "s"}</em></span>
              </span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ======================================================================== robot sheet
export function RobotSheet({ s, robotId, onClose, doit, busy }: { s: FS; robotId: string; onClose: () => void; doit: Doit; busy: string | null }) {
  const r = s.robots.find((x) => x.id === robotId) as Robot | undefined;
  const allowed = useMemo(() => (r ? s.zones.filter((z) => z.atex === null || r.exRated) : []), [r, s.zones]);
  const [zone, setZone] = useState(allowed[0]?.id ?? "");
  const [asset, setAsset] = useState("");
  const [kind, setKind] = useState<MissionKind>(r?.kind === "crawler" ? "thickness_survey" : r?.kind === "drone" ? "flare_inspection" : r?.kind === "rov" ? "subsea_inspection" : r?.kind === "fixed_wing" ? "pipeline_patrol" : r?.roles.includes("security") ? "security_patrol" : "inspection_round");
  if (!r) return null;
  const ms = s.missions.filter((m) => m.robotId === r.id);
  const live = ms.find((m) => m.status === "running" || (m.status === "planned" && Date.parse(m.plannedStart) - Date.now() < 30 * 60_000 && Date.parse(m.plannedStart) > Date.now() - 60_000));
  const assets = s.assets.filter((a) => s.zones.find((z) => z.id === zone)?.name === a.zone);
  const blocked = s.zones.filter((z) => !(z.atex === null || r.exRated));
  return (
    <div className="modal" role="dialog" aria-label={r.name} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ops-drawer">
        <div className="sheet-h"><b>{icon(r)} {r.name} · {r.model}</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="muted small">{ROBOT_STATUS[r.status]} · battery {r.battery}% · {s.zones.find((z) => z.id === r.zone)?.name} · {r.autonomy === "policy" ? "runs approved missions on its own" : "supervised: every mission approved"}</p>
        <p className="small"><b>{r.vendor}</b> · {DOMAIN_LABEL[DOMAIN_OF[r.kind]]} · used for {r.roles.map((x) => ROLE_LABEL[x]).join(", ")}{r.operator ? ` · operated by ${r.operator}` : ""}{r.platform ? ` · runs on ${r.platform}` : ""} · connected through {CONN[r.adapter]}{r.adapter !== "sim" && !s.fleets.find((f) => f.vendor === r.vendor)?.live ? " (not set up here: simulated)" : ""}{r.lastReport ? ` · last report ${time(r.lastReport)}` : ""}.</p>
        <p className="small">Can: {r.capabilities.map((c) => CAPABILITY_LABEL[c]).join(", ")}. {r.exRated ? "Certified for hazardous areas (zones 1 and 2)." : `Not certified for hazardous areas: it may not enter ${blocked.map((z) => z.name).join(", ") || "them"}.`} {r.enduranceMin} min per charge{r.maxWindMs ? `, flies below ${r.maxWindMs} m/s wind` : ""}.</p>
        {r.estop && <div className="dc-no"><span>{r.note ?? "Emergency stop"} — a supervisor releases it after a look on site.</span></div>}
        <div className="od-acts">
          {!r.estop ? <button className="mini danger" disabled={!!busy} onClick={() => doit("estop", { action: "estop", robotId: r.id, on: true, note: "Stopped from the control room" })}>Emergency stop</button>
            : <button className="mini" disabled={!!busy} onClick={() => doit("estop", { action: "estop", robotId: r.id, on: false })}>Release the stop</button>}
          {live && <button className="mini" disabled={!!busy} onClick={() => doit("abort", { action: "mission_abort", missionId: live.id })}>Cancel {live.id}</button>}
        </div>
        <div className="rpt-label">Send it</div>
        <form className="od-grid" onSubmit={(e) => { e.preventDefault(); doit("mission", { action: "mission", robotId: r.id, zone, asset: asset || undefined, missionKind: kind }); }}>
          <label>Where<select value={zone} onChange={(e) => { setZone(e.target.value); setAsset(""); }}>{allowed.map((z) => <option key={z.id} value={z.id}>{z.name}{z.atex ? ` (zone ${z.atex})` : ""}</option>)}</select></label>
          <label>At<select value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">The whole area</option>{assets.map((a) => <option key={a.id} value={a.tag}>{a.tag} {a.name}</option>)}</select></label>
          <label>Mission<select value={kind} onChange={(e) => setKind(e.target.value as MissionKind)}>{(Object.keys(MISSION_LABEL) as MissionKind[]).filter((k) => fits(r, k)).map((k) => <option key={k} value={k}>{MISSION_LABEL[k]}</option>)}</select></label>
          <div className="od-acts"><button className="studio-add" disabled={!!busy || !!r.estop || !zone}>Send {r.name}</button></div>
        </form>
        <div className="rpt-label">Today&apos;s missions</div>
        <ul className="ops-list">
          {ms.length === 0 && <li className="muted">None.</li>}
          {ms.map((m) => <MissionRow key={m.id} s={s} m={m} />)}
        </ul>
      </div>
    </div>
  );
}

/** The missions a robot can fly, drive or swim: what its sensors and its domain allow. */
function fits(r: Robot, k: MissionKind) {
  const d = DOMAIN_OF[r.kind], c = (x: Capability) => r.capabilities.includes(x);
  switch (k) {
    case "layout_marking": case "delivery": return false;
    case "subsea_inspection": return d === "subsea" || d === "sea";
    case "security_patrol": case "alarm_check": return c("intrusion");
    case "valve_operation": return c("manipulate");
    case "thickness_survey": return c("ut_thickness");
    case "gas_survey": case "confined_precheck": case "emissions_survey": return c("gas") && d !== "subsea";
    case "flare_inspection": case "pipeline_patrol": return d === "air";
    default: return d !== "subsea" && (c("visual") || c("thermal"));
  }
}

function MissionRow({ s, m }: { s: FS; m: Mission }) {
  return (
    <li className={m.status === "done" || m.status === "aborted" ? "dim" : ""}>
      <span className={`ops-pill ${m.status === "running" ? "auto" : m.status === "aborted" || m.status === "paused" ? "high" : "low"}`}>{m.status}</span>
      <span className="grow"><b>{time(m.plannedStart)}</b> {m.title}<em>{m.id} · {MISSION_LABEL[m.kind]} · {m.durationMin} min{m.status === "running" ? ` · ${Math.round((m.progress ?? 0) * 100)}%` : ""}{m.woId ? ` · for ${m.woId}` : ""}{m.note ? ` · ${m.note}` : ""}</em>
        {m.findings.length > 0 && <em className="mf">{m.findings.map((f) => `${f.severity}: ${f.label}`).join(" · ")}</em>}
        {m.status === "done" && !m.findings.length && <em className="mf ok">Nothing out of range on the route{s.assets.length ? "" : ""}</em>}</span>
    </li>
  );
}

// ======================================================================== findings
export function FindingsList({ s }: { s: FS }) {
  if (!s.findings.length) return <p className="muted small">The robots have found nothing out of range today.</p>;
  return (
    <ul className="ops-list">
      {s.findings.map((f) => (
        <li key={f.id} className={f.woId || f.acknowledged ? "dim" : ""}>
          <span className={`ops-pill ${f.severity === "critical" || f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low"}`}>{f.severity}</span>
          <span className="grow"><b>{f.label}</b><em>{s.robots.find((r) => r.id === f.robotId)?.name} ({s.robots.find((r) => r.id === f.robotId)?.vendor}) · {CAPABILITY_LABEL[f.sensor as Capability]} · {time(f.at)}{f.image ? ` · ${f.image}` : ""}{f.woId ? ` · work raised: ${f.woId}` : ""}</em></span>
        </li>
      ))}
    </ul>
  );
}

// ======================================================================== security
export function SecurityList({ s, doit, busy }: { s: FS; doit: Doit; busy: string | null }) {
  if (!s.securityAlerts.length) return <p className="muted small">No security alerts today.</p>;
  return (
    <>
      {s.dronesGrounded && <div className="dc-no"><span>🛸 Unidentified drone reported: our drones stay on the ground for two hours; their missions wait.</span></div>}
      <ul className="ops-list">
        {s.securityAlerts.map((a) => (
          <li key={a.id} className={a.status === "cleared" ? "dim" : ""}>
            <span className={`ops-pill ${a.status === "open" || a.status === "escalated" ? "high" : a.status === "checking" ? "medium" : "low"}`}>{a.status}</span>
            <span className="grow"><b>{ALERT_ICON[a.kind]} {a.text}</b><em>{a.source} · {s.zones.find((z) => z.id === a.zone)?.name} · {time(a.at)}{a.note ? ` · ${a.note}` : ""}</em></span>
            {a.status !== "cleared" && <span className="od-acts">
              <button className="mini" disabled={!!busy} onClick={() => doit(a.id, { action: "security", alertId: a.id, alertStatus: "cleared", note: "Cleared from the control room" })}>Clear</button>
              {a.status !== "escalated" && <button className="mini danger" disabled={!!busy} onClick={() => doit(a.id, { action: "security", alertId: a.id, alertStatus: "escalated", note: "Security responding" })}>Escalate</button>}
            </span>}
          </li>
        ))}
      </ul>
    </>
  );
}

// ======================================================================== the turnaround
export function TurnaroundPanel({ s, onWo }: { s: FS; onWo: (id: string) => void }) {
  return (
    <>{s.turnarounds.map((t) => (
      <section key={t.package} className="ops-panel tar">
        <div className="tar-head">
          <div><b>Turnaround {t.package}</b><em>{t.asset} · {t.start} → {t.end} · {t.daysLeft} day{t.daysLeft === 1 ? "" : "s"} left</em></div>
          <div className="tar-bar" title={`${t.progress}% of jobs done`}><i style={{ width: `${t.progress}%` }} /><b>{t.progress}%</b></div>
          <div className="tar-kpi"><b>{t.people}</b><em>contractor people on it</em></div>
          <div className="tar-kpi"><b>{sar(t.committed)}</b><em>crew-days committed</em></div>
        </div>
        <ul className="ops-list tar-jobs">
          {t.jobs.map((j) => (
            <li key={j.id}><button onClick={() => onWo(j.id)}>
              <span className={`tar-st ${j.status}`}>{j.status.replace("_", " ")}</span>
              <span className="grow"><b>{j.id}</b> {j.title}
                <em>{j.plannedStart?.slice(5)} → {j.plannedEnd?.slice(5)} · {j.crew ?? j.robot ?? "not given out"}{j.waitingFor.length ? ` · waits for ${j.waitingFor.join(", ")}` : ""}{j.hold ? ` · held: ${j.hold}` : ""}</em></span>
              <span className="tar-badges">
                {j.permit && <span className={`ops-pill ${j.permit.status === "issued" || j.permit.status === "closed" ? "low" : j.permit.status === "suspended" ? "high" : "medium"}`}>{j.permit.type}: {j.permit.status}</span>}
                {j.gasTest && <span className={`ops-pill ${j.gasTest.status === "done" ? "low" : j.gasTest.status === "failed" ? "high" : "medium"}`}>gas test: {j.gasTest.status}</span>}
              </span>
            </button></li>
          ))}
        </ul>
      </section>
    ))}</>
  );
}
