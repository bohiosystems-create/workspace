"use client";
/**
 * Operations: the facility-management orchestration layer. The home page shows a card per facility; the control room
 * shows one facility — what the orchestrator proposes (with its reasons, approve / reject, autopilot), work orders,
 * assets with live readings, alarms, the team (each with their own field app), spares and the activity log.
 * Everything reloads by itself when anything changes (WhatsApp, the field app, another user).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { facilityStateFor, overview } from "@/lib/fm/api";
import type { Action, Asset, AutopilotPolicy, Reading, WorkOrder } from "@/lib/fm/types";
import type { Outcomes } from "@/lib/outcomes";
import { Icon } from "../icons";
import { Decide } from "../Decide";
import { OutcomesPanel } from "../Outcomes";
import { FindingsList, PlantMap, RobotSheet, SecurityList, TurnaroundPanel, WorkforcePanel } from "./Workforce";

type Overview = ReturnType<typeof overview>;
type FS = ReturnType<typeof facilityStateFor>;
type WO = FS["workOrders"][number];
const SECTOR_ICON: Record<string, string> = { energy: "chart", water: "layers", airport: "map", oil_gas: "flame" };
const fmtN = (n: number, unit: string) => unit === "m³/day" || unit === "pax/day" ? n.toLocaleString("en-US") : String(n);
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const RANK = { P1: 0, P2: 1, P3: 2, P4: 3 } as const;
const STATUS_LABEL: Record<string, string> = { open: "Open", assigned: "Assigned", in_progress: "In progress", on_hold: "On hold", done: "Done", running: "Running", standby: "Standby", degraded: "Degraded", down: "Down", maintenance: "Maintenance", available: "Available", on_job: "On a job", travelling: "Travelling", break: "Break", off: "Off shift" };

/** Re-run `load` whenever the shared data changes (site.ts dispatches "kinan:changed"). */
function useLive(load: () => void) { useEffect(() => { window.addEventListener("kinan:changed", load); return () => window.removeEventListener("kinan:changed", load); }, [load]); }

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/fm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error ?? "Failed.");
  return j as { message: string };
}

// ======================================================================== home page cards
export function FacilityCards({ onOpen }: { onOpen: (id: string) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const load = useCallback(() => { fetch("/api/fm", { cache: "no-store" }).then((r) => r.json()).then((j) => !j.error && setO(j)).catch(() => undefined); }, []);
  useEffect(load, [load]);
  useLive(load);
  if (!o) return null;
  return (
    <section className="ops-home">
      <div className="home-head"><div><h1>Operations</h1><p>Facility management with an AI orchestration layer: it watches every asset, raises the work, picks the right person, orders the parts and asks before anything risky. Each technician has a personal agent on their phone.</p></div></div>
      <ul className="home-grid">
        {o.facilities.map(({ facility: f, sector, kpis: k, pending, autopilot }) => (
          <li key={f.id}>
            <button className={`pcard ops ${f.sector}`} onClick={() => onOpen(f.id)}>
              <span className="pband"><Icon name={SECTOR_ICON[f.sector]} /><i>{sector}{autopilot ? " · autopilot" : ""}</i></span>
              <b>{f.name}</b>
              <em>{f.capacity}</em>
              <span className="ops-mini">
                <span><b className={k.availability < 95 ? "warn" : ""}>{k.availability}%</b> available</span>
                <span><b>{Math.round((k.output.value / k.output.target) * 100)}%</b> of target</span>
                <span><b className={k.criticalAlarms ? "bad" : ""}>{k.activeAlarms}</b> alarms</span>
                <span><b>{k.openWos}</b> open jobs</span>
              </span>
              {pending > 0 && <span className="ops-pending">{pending} action{pending > 1 ? "s" : ""} proposed by the orchestrator</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ======================================================================== control room
type Tab = "orchestrator" | "map" | "workforce" | "turnaround" | "work" | "assets" | "alarms" | "team" | "spares" | "activity" | "outcomes";
export function ControlRoom({ facilityId, author, onBack, onSignIn }: { facilityId: string; author: string; onBack: () => void; onSignIn: () => void }) {
  const [s, setS] = useState<FS | null>(null);
  const [tab, setTab] = useState<Tab>("orchestrator");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [woOpen, setWoOpen] = useState<string | null>(null);
  const [assetOpen, setAssetOpen] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [oc, setOc] = useState<Outcomes | null>(null);
  const [robotOpen, setRobotOpen] = useState<string | null>(null);
  const load = useCallback(() => { fetch(`/api/fm?facility=${facilityId}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.error) setMsg({ text: j.error, bad: true }); else setS(j); }).catch(() => setMsg({ text: "Could not load the facility.", bad: true })); }, [facilityId]);
  useEffect(load, [load]);
  useLive(load);
  useEffect(() => { window.addEventListener("kinan:auth", load); return () => window.removeEventListener("kinan:auth", load); }, [load]);
  // robots move and missions progress with the clock: keep the map, the workforce and the turnaround current
  useEffect(() => { if (tab !== "map" && tab !== "workforce" && tab !== "turnaround" && !robotOpen) return; const id = setInterval(load, 20_000); return () => clearInterval(id); }, [tab, robotOpen, load]);
  useEffect(() => { if (tab === "outcomes") fetch(`/api/today?outcomes=${facilityId}`, { cache: "no-store" }).then((r) => r.json()).then((j) => !j.error && setOc(j)).catch(() => undefined); }, [tab, facilityId, s]);
  // Autopilot: while the control room is open, what the signed policy allows runs by itself every 15 s.
  useEffect(() => {
    if (!s?.autopilot) return;
    const run = () => post({ action: "tick", facilityId, by: "Orchestrator" }).then((r) => { if (r.message) { setMsg({ text: r.message }); load(); } }).catch(() => undefined);
    run(); const id = setInterval(run, 15000); return () => clearInterval(id);
  }, [s?.autopilot, facilityId, load]);
  const doit = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setMsg(null);
    try { const r = await post({ ...body, facilityId, by: author }); setMsg({ text: r.message }); load(); }
    catch (e) { setMsg({ text: (e as Error).message, bad: true }); }
    finally { setBusy(null); }
  };
  if (!s) return <div className="home"><button className="crumb" onClick={onBack}><Icon name="back" />Operations</button><p className="muted">{msg?.text ?? "Loading…"}</p></div>;
  const k = s.kpis, f = s.facility;
  const tag = (id?: string) => s.assets.find((a) => a.id === id)?.tag ?? "";
  const who = (id?: string) => s.technicians.find((t) => t.id === id)?.name ?? "—";
  /** who does a job: the crew, the robot or the person */
  const doer = (w: { assignee?: string; crew?: string; robot?: string }) => (w.crew ? `${s.crews.find((c) => c.id === w.crew)?.name ?? "crew"} (${s.crews.find((c) => c.id === w.crew)?.contractor ?? ""})` : w.robot ? `robot ${s.robots.find((r) => r.id === w.robot)?.name ?? ""}` : who(w.assignee));
  const open = s.workOrders.filter((w) => w.status !== "done");
  const live = s.findings.filter((x) => !x.woId && !x.acknowledged && (x.severity === "high" || x.severity === "critical")).length + s.securityAlerts.filter((a) => a.status === "open").length;
  const tabs: [Tab, string, number?][] = [["orchestrator", "Orchestrator", s.actions.length], ...(s.zones.length ? [["map", "Plant map", live] as [Tab, string, number]] : []),
    ...(s.robots.length || s.crews.length ? [["workforce", "Workforce"] as [Tab, string]] : []), ...(s.turnarounds.length ? [["turnaround", "Turnaround"] as [Tab, string]] : []), ["work", "Work orders", open.length], ["assets", "Assets"], ["alarms", "Alarms", k.activeAlarms], ["team", "Team"], ["spares", "Spares", k.sparesLow], ["outcomes", "Outcomes"], ["activity", "Activity"]];
  const mine = s.actions.filter((a) => a.can.ok && a.risk === "low");
  const wo = woOpen ? s.workOrders.find((w) => w.id === woOpen) : undefined;
  const asset = assetOpen ? s.assets.find((a) => a.id === assetOpen) : undefined;
  return (
    <div className="home ops">
      <button className="crumb" onClick={onBack}><Icon name="back" />Operations</button>
      <div className="home-head"><div><h1>{f.name}</h1><p>{s.sector} · {f.capacity} · {f.operator} · {s.date}</p></div></div>
      {msg && <div className={msg.bad ? "studio-err" : "studio-ok"} role="status">{msg.text}</div>}

      <div className="ops-kpis">
        <Kpi label="Critical assets available" value={`${k.availability}%`} sub={k.criticalDown ? `${k.criticalDown} critical asset down` : "none down"} tone={k.criticalDown ? "bad" : k.availability < 97 ? "warn" : "good"} />
        <Kpi label={f.output.name} value={fmtN(f.output.today, f.output.unit)} sub={`${Math.round((f.output.today / f.output.target) * 100)}% of ${fmtN(f.output.target, f.output.unit)} ${f.output.unit}`} tone={f.output.today < f.output.target * 0.95 ? "warn" : "good"} spark={f.output.trend} />
        <Kpi label={f.efficiency.name} value={`${f.efficiency.value} ${f.efficiency.unit}`} sub={`target ${f.efficiency.target}`} tone={(f.efficiency.lowerIsBetter ? f.efficiency.value > f.efficiency.target : f.efficiency.value < f.efficiency.target) ? "warn" : "good"} />
        <Kpi label="Open work" value={String(k.openWos)} sub={`${k.overdueWos} past SLA · ${k.slaAtRisk} at risk`} tone={k.overdueWos ? "bad" : k.slaAtRisk ? "warn" : "good"} />
        <Kpi label="Alarms" value={String(k.activeAlarms)} sub={`${k.criticalAlarms} critical or high`} tone={k.criticalAlarms ? "bad" : k.activeAlarms ? "warn" : "good"} />
        <Kpi label="Planned maintenance" value={`${k.pmCompliance}%`} sub="done on time" tone={k.pmCompliance < 90 ? "warn" : "good"} />
        <Kpi label="MTTR · MTBF" value={`${k.mttrHours} h`} sub={`MTBF ${k.mtbfHours.toLocaleString("en-US")} h`} />
        <Kpi label="Team on shift" value={`${k.techsBusy}/${k.techsOnShift}`} sub="busy / on shift" />
      </div>

      <nav className="ops-tabs" role="tablist">{tabs.map(([id, label, n]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}{n ? <i>{n}</i> : null}</button>)}</nav>

      {tab === "orchestrator" && (
        <section className="ops-panel">
          <AutopilotBar s={s} busy={!!busy} onSetUp={() => setPolicyOpen(true)} onPause={(on) => doit("autopilot", { action: "autopilot", on })} />
          <div className="ops-row">
            <div className="rpt-label">The orchestrator proposes</div>
            <span className="grow" />
            {mine.length > 1 && <button className="mini" disabled={!!busy} onClick={async () => { let n = 0; for (const a of mine) { try { await post({ action: "decide", actionId: a.id, decision: "approved", by: author }); n++; } catch { /* changed meanwhile */ } } setMsg({ text: `Approved ${n} low-risk action${n === 1 ? "" : "s"}.` }); load(); }}>Approve all low-risk ({mine.length})</button>}
          </div>
          {s.top.length > 0 && <div className="ops-top"><b>Now:</b> {s.top.slice(0, 4).join(" · ")}</div>}
          {s.actions.length === 0 && <p className="muted">Nothing to propose: every alarm has work, every job has someone on it, stock covers the work.</p>}
          <ul className="ops-actions">
            {s.actions.map((a) => (
              <li key={a.id} className={`risk-${a.risk}`}>
                <div className="oa-head"><span className={`ops-pill ${a.risk}`}>{a.risk} risk</span><span className="oa-kind">{s.kindLabels[a.kind]}</span>{a.cost ? <span className="td-cost">SAR {a.cost.toLocaleString("en-US")}</span> : null}{a.byPolicy ? <span className="oa-auto">the autopilot will do this</span> : a.auto && <span className="oa-auto dim">autopilot can run this</span>}</div>
                <b>{a.title}</b>
                <ul className="oa-why">{a.why.map((y, i) => <li key={i}>{y}</li>)}</ul>
                <Decide can={a.can} busy={busy === a.id} onSignIn={onSignIn} onApprove={() => doit(a.id, { action: "decide", actionId: a.id, decision: "approved" })} onReject={(reason) => doit(a.id, { action: "decide", actionId: a.id, decision: "rejected", reason })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "outcomes" && (oc ? <OutcomesPanel o={oc} /> : <p className="muted">Loading…</p>)}

      {tab === "map" && (
        <section className="ops-panel">
          <PlantMap s={s} onRobot={setRobotOpen} />
          <div className="rpt-label">Security today</div>
          <SecurityList s={s} doit={doit} busy={busy} />
          <div className="rpt-label">What the robots found today</div>
          <FindingsList s={s} />
        </section>
      )}
      {tab === "workforce" && <WorkforcePanel s={s} onRobot={setRobotOpen} />}
      {tab === "turnaround" && <TurnaroundPanel s={s} onWo={setWoOpen} />}

      {tab === "work" && <WorkList s={s} tag={tag} who={(id) => who(id)} doer={doer} onOpen={setWoOpen} />}

      {tab === "assets" && <AssetList s={s} onOpen={setAssetOpen} />}

      {tab === "alarms" && (
        <section className="ops-panel">
          <ul className="ops-list">
            {s.alarms.length === 0 && <li className="muted">No alarms.</li>}
            {[...s.alarms].sort((x, y) => Number(x.acknowledged) - Number(y.acknowledged) || y.at.localeCompare(x.at)).map((al) => (
              <li key={al.id} className={al.acknowledged ? "dim" : ""}>
                <span className={`ops-pill ${al.severity === "critical" || al.severity === "high" ? "high" : al.severity === "medium" ? "medium" : "low"}`}>{al.severity}</span>
                <span className="grow"><b>{tag(al.assetId)}</b> {al.message}<em>{ago(al.at)}{al.woId ? ` · ${al.woId}` : ""}{al.acknowledged ? " · acknowledged" : ""}</em></span>
                {!al.acknowledged && <button className="mini" onClick={() => doit(al.id, { action: "alarm_ack", alarmId: al.id })}>Acknowledge</button>}
                <button className="mini" onClick={() => setAssetOpen(al.assetId)}>Asset</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "team" && (
        <section className="ops-panel">
          <p className="muted small">Each person has a personal AI agent on their phone: their jobs in order, permits, checklists, photos and voice. Open it from here, or send them the link.</p>
          <ul className="ops-team">
            {s.technicians.map((t) => (
              <li key={t.id} className={t.shift === "off" ? "dim" : ""}>
                <span className={`tdot ${t.status}`} aria-hidden="true" />
                <span className="grow"><b>{t.name}</b><em>{t.role} · {t.trades.join(", ")} · {t.years} y</em><em>{STATUS_LABEL[t.status]} · {t.zone} · {t.shift} shift · {t.load} open job{t.load === 1 ? "" : "s"}</em></span>
                <a className="mini" href={`/field?tech=${encodeURIComponent(t.id)}`} target="_blank" rel="noreferrer">Field app</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "spares" && (
        <section className="ops-panel ops-tablewrap">
          <table className="ops-table"><thead><tr><th>Part</th><th>Stock</th><th>Min</th><th>On order</th><th>Lead</th><th>Unit cost</th><th>Store</th></tr></thead>
            <tbody>{s.spares.map((p) => <tr key={p.id} className={p.stock < p.min ? "low" : ""}><td>{p.part}</td><td>{p.stock}</td><td>{p.min}</td><td>{p.onOrder ?? 0}</td><td>{p.leadDays} d</td><td>SAR {p.unitCost.toLocaleString("en-US")}</td><td>{p.location}</td></tr>)}</tbody></table>
        </section>
      )}

      {tab === "activity" && (
        <section className="ops-panel">
          <ul className="ops-list">
            {s.log.length === 0 && <li className="muted">Nothing changed today yet. Approvals, WhatsApp reports and field updates appear here.</li>}
            {s.log.map((e) => <li key={e.id}><span className={`ops-pill ${e.channel === "orchestrator" ? "auto" : "low"}`}>{e.channel}</span><span className="grow"><b>{e.by}</b> {e.summary}<em>{ago(e.at)}</em></span></li>)}
          </ul>
        </section>
      )}

      {policyOpen && <PolicySheet s={s} busy={!!busy} onClose={() => setPolicyOpen(false)} onSign={async (policy) => { await doit("policy", { action: "policy", on: true, policy }); setPolicyOpen(false); }} onWithdraw={async () => { await doit("policy", { action: "policy", on: false }); setPolicyOpen(false); }} />}
      {wo && <WoDrawer s={s} wo={wo} tag={tag} onClose={() => setWoOpen(null)} doit={doit} busy={busy} />}
      {robotOpen && <RobotSheet s={s} robotId={robotOpen} onClose={() => setRobotOpen(null)} doit={doit} busy={busy} />}
      {asset && <AssetDrawer s={s} asset={asset} onClose={() => setAssetOpen(null)} onWo={(id) => { setAssetOpen(null); setWoOpen(id); }} doit={doit} busy={busy} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone, spark }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; spark?: number[] }) {
  return <div className={`ops-kpi ${tone ?? ""}`}><span className="kl">{label}</span><b>{value}</b>{sub && <em>{sub}</em>}{spark && <Spark xs={spark} />}</div>;
}
export function Spark({ xs, low, high }: { xs: number[]; low?: number; high?: number }) {
  const lo = Math.min(...xs, low ?? Infinity), hi = Math.max(...xs, high ?? -Infinity), span = hi - lo || 1;
  const y = (v: number) => 22 - ((v - lo) / span) * 20;
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      {high !== undefined && <line x1="0" x2="100" y1={y(high)} y2={y(high)} className="lim" />}
      {low !== undefined && <line x1="0" x2="100" y1={y(low)} y2={y(low)} className="lim" />}
      <polyline fill="none" points={xs.map((v, i) => `${(i / (xs.length - 1)) * 100},${y(v)}`).join(" ")} />
    </svg>
  );
}

function WorkList({ s, tag, who, doer, onOpen }: { s: FS; tag: (id?: string) => string; who: (id?: string) => string; doer: (w: WO) => string; onOpen: (id: string) => void }) {
  const [f, setF] = useState<"open" | "overdue" | "hold" | "done" | "all">("open");
  const [q, setQ] = useState("");
  const xs = useMemo(() => s.workOrders.filter((w) => (f === "all" || (f === "open" ? w.status !== "done" : f === "overdue" ? w.overdue : f === "hold" ? w.status === "on_hold" : w.status === "done"))
    && (!q || `${w.id} ${w.title} ${tag(w.assetId)} ${who(w.assignee)}`.toLowerCase().includes(q.toLowerCase())))
    .sort((x, y) => Number(x.status === "done") - Number(y.status === "done") || RANK[x.priority] - RANK[y.priority] || x.slaLeft - y.slaLeft), [s, f, q, tag, who]);
  return (
    <section className="ops-panel">
      <div className="ops-row">
        {(["open", "overdue", "hold", "done", "all"] as const).map((k) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{k === "hold" ? "On hold" : k[0].toUpperCase() + k.slice(1)}</button>)}
        <input className="ops-search" type="search" placeholder="Search WO, asset, person…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="ops-list wo">
        {xs.length === 0 && <li className="muted">No work orders here.</li>}
        {xs.map((w) => (
          <li key={w.id}><button onClick={() => onOpen(w.id)}>
            <span className={`ops-pill pr ${w.priority}`}>{w.priority}</span>
            <span className="grow"><b>{w.id} · {tag(w.assetId)}</b> {w.title}<em>{w.type} · {STATUS_LABEL[w.status]}{w.holdReason ? ` (${w.holdReason})` : ""} · {doer(w)}{w.permit ? ` · permit ${w.permit.status}` : ""}{w.gasTest ? ` · gas test ${w.gasTest.status}` : ""}{w.waitingFor.length ? ` · waits for ${w.waitingFor.join(", ")}` : ""}</em></span>
            {w.status !== "done" && <span className={`ops-sla ${w.overdue ? "bad" : w.type !== "PM" && w.type !== "TAR" && w.slaLeft < w.slaHours * 0.3 ? "warn" : ""}`}>{w.overdue ? "past SLA" : w.type === "PM" || w.type === "TAR" ? `due ${w.due.slice(5)}` : `${Math.max(0, Math.round(w.slaLeft))} h left`}</span>}
          </button></li>
        ))}
      </ul>
    </section>
  );
}

function AssetList({ s, onOpen }: { s: FS; onOpen: (id: string) => void }) {
  const [sys, setSys] = useState("all");
  const [q, setQ] = useState("");
  const xs = s.assets.filter((a) => (sys === "all" || a.systemId === sys) && (!q || `${a.tag} ${a.name} ${a.class}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="ops-panel">
      <div className="ops-row">
        <select className="ops-search" value={sys} onChange={(e) => setSys(e.target.value)}><option value="all">All systems</option>{s.systems.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input className="ops-search" type="search" placeholder="Search tag or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="ops-list">
        {xs.map((a) => (
          <li key={a.id}><button onClick={() => onOpen(a.id)}>
            <span className={`adot ${a.status}`} aria-hidden="true" />
            <span className="grow"><b>{a.tag}</b> {a.name}<em>{STATUS_LABEL[a.status]} · criticality {a.criticality} · {a.zone} · next PM {a.nextPm}</em></span>
            <span className="cond" title={`Condition ${a.condition}/100`}><i style={{ width: `${a.condition}%` }} className={a.condition < 50 ? "bad" : a.condition < 70 ? "warn" : ""} /></span>
          </button></li>
        ))}
      </ul>
    </section>
  );
}

function Readings({ rs }: { rs: Reading[] }) {
  return (
    <ul className="ops-readings">
      {rs.map((r) => {
        const out = (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low);
        return <li key={r.key} className={out ? "out" : ""}><span className="grow"><b>{r.value} {r.unit}</b> {r.name}<em>{r.low !== undefined ? `low ${r.low}` : ""}{r.low !== undefined && r.high !== undefined ? " · " : ""}{r.high !== undefined ? `high ${r.high}` : ""}</em></span><Spark xs={r.trend} low={r.low} high={r.high} /></li>;
      })}
    </ul>
  );
}

function WoDrawer({ s, wo, tag, onClose, doit, busy }: { s: FS; wo: WO; tag: (id?: string) => string; onClose: () => void; doit: (k: string, b: Record<string, unknown>) => Promise<void>; busy: string | null }) {
  const [note, setNote] = useState("");
  const a = s.assets.find((x) => x.id === wo.assetId) as Asset | undefined;
  const upd = (b: Record<string, unknown>) => doit("wo", { action: "wo_update", woId: wo.id, ...b });
  return (
    <div className="modal" role="dialog" aria-label={wo.id} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ops-drawer">
        <div className="sheet-h"><b>{wo.id} · {tag(wo.assetId)}</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="od-title"><span className={`ops-pill pr ${wo.priority}`}>{wo.priority}</span> {wo.title}</p>
        <p className="muted small">{wo.type} · {STATUS_LABEL[wo.status]}{wo.holdReason ? ` — ${wo.holdReason}` : ""} · raised {ago(wo.raised)} by {wo.raisedBy} ({wo.source}) · {wo.type === "PM" ? `due ${wo.due}` : wo.status === "done" ? "closed" : wo.overdue ? "past SLA" : `${Math.round(wo.slaLeft)} h of ${wo.slaHours} h SLA left`}</p>
        {wo.detail && wo.detail !== wo.title && <p>{wo.detail}</p>}
        {wo.permit && <div className={`od-permit ${wo.permit.status}`}>Permit: {wo.permit.type} — {wo.permit.status === "required" ? "required, not issued yet: work may not start" : wo.permit.status === "suspended" ? "suspended: work stopped until a clear gas test" : wo.permit.status}</div>}
        {(wo.crew || wo.robot) && <p className="small"><b>{wo.crew ? "Crew" : "Robot"}:</b> {wo.crew ? `${s.crews.find((c) => c.id === wo.crew)?.name} — ${s.crews.find((c) => c.id === wo.crew)?.contractor}, lead ${s.crews.find((c) => c.id === wo.crew)?.lead}` : s.robots.find((r) => r.id === wo.robot)?.name}{wo.missionId ? ` · mission ${wo.missionId}` : ""}{wo.package ? ` · turnaround ${wo.package}, ${wo.plannedStart} → ${wo.plannedEnd}` : ""}</p>}
        {wo.waitingFor.length > 0 && <div className="od-permit required">Waits for {wo.waitingFor.join(", ")} — it can&apos;t start before they are done.</div>}
        {wo.gasTest && (
          <div className={`od-permit ${wo.gasTest.status === "done" ? "issued" : "required"}`}>
            Gas test: {wo.gasTest.status === "required" ? "required before work starts" : `${wo.gasTest.status === "done" ? "clear" : "not clear"} — ${wo.gasTest.reading ?? ""} (${wo.gasTest.by ?? ""})`}
            {wo.status !== "done" && wo.gasTest.status !== "done" && <span className="od-acts"><button className="mini" disabled={!!busy} onClick={() => doit("gas", { action: "gas_test", woId: wo.id, result: "done" })}>Record a clear test</button><button className="mini" disabled={!!busy} onClick={() => doit("gas", { action: "gas_test", woId: wo.id, result: "failed", reading: note || "Gas detected" })}>Record gas found</button></span>}
          </div>
        )}
        <div className="od-grid">
          <label>Assigned to<select value={wo.assignee ?? ""} onChange={(e) => upd({ assignee: e.target.value })}><option value="">— nobody —</option>{s.technicians.filter((t) => t.shift !== "off").map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role} · {t.load} jobs</option>)}</select></label>
          <div className="od-acts">
            {wo.status !== "in_progress" && wo.status !== "done" && <button className="mini" disabled={!!busy} onClick={() => upd({ status: "in_progress" })}>Start</button>}
            {wo.status !== "on_hold" && wo.status !== "done" && <button className="mini" disabled={!!busy} onClick={() => upd({ status: "on_hold", holdReason: note || "Waiting" })}>Hold</button>}
            {wo.status !== "done" && <button className="studio-add" disabled={!!busy} onClick={() => upd({ status: "done", note: note || undefined })}>Close as done</button>}
          </div>
        </div>
        <div className="rpt-label">Checklist</div>
        <ul className="od-check">{wo.checklist.map((c, i) => <li key={i}><label><input type="checkbox" checked={c.done} disabled={wo.status === "done"} onChange={() => upd({ checklist: i })} />{c.text}</label></li>)}</ul>
        {a && <><div className="rpt-label">{a.tag} readings</div><Readings rs={a.readings} /></>}
        {wo.spares.length > 0 && <p className="small">Parts: {wo.spares.map((p) => `${p.qty} × ${p.part}`).join(", ")}</p>}
        {wo.evidence.length > 0 && <div className="od-ev">{wo.evidence.map((id) => <a key={id} href={`/api/file?id=${id}`} target="_blank" rel="noreferrer"><img src={`/api/file?id=${id}`} alt="Evidence" /></a>)}</div>}
        <div className="rpt-label">Notes</div>
        <ul className="od-notes">{wo.notes.map((n, i) => <li key={i}><b>{n.by}</b>{n.via ? ` · ${n.via}` : ""} · {ago(n.at)}<br />{n.text}</li>)}{wo.notes.length === 0 && <li className="muted">No notes yet.</li>}</ul>
        <form className="od-note" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { upd({ note: note.trim() }); setNote(""); } }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (also used as the hold reason)" /><button className="mini" disabled={!note.trim()}>Add</button></form>
      </div>
    </div>
  );
}

function AssetDrawer({ s, asset: a, onClose, onWo, doit, busy }: { s: FS; asset: Asset; onClose: () => void; onWo: (id: string) => void; doit: (k: string, b: Record<string, unknown>) => Promise<void>; busy: string | null }) {
  const [title, setTitle] = useState("");
  const [pr, setPr] = useState<WorkOrder["priority"]>(a.criticality === "A" ? "P2" : "P3");
  const wos = s.workOrders.filter((w) => w.assetId === a.id);
  return (
    <div className="modal" role="dialog" aria-label={a.tag} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ops-drawer">
        <div className="sheet-h"><b>{a.tag} · {a.name}</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="muted small"><span className={`adot ${a.status}`} /> {STATUS_LABEL[a.status]} · criticality {a.criticality} · condition {a.condition}/100 · {s.systems.find((x) => x.id === a.systemId)?.name} · {a.zone}</p>
        <p className="small">{a.manufacturer} {a.model} · installed {a.installed} · {a.runHours.toLocaleString("en-US")} run hours · PM every {a.pmEveryDays} days, last {a.lastPm}, next {a.nextPm}</p>
        <div className="rpt-label">Readings (14 days)</div>
        <Readings rs={a.readings} />
        <div className="rpt-label">Work orders</div>
        <ul className="ops-list">{wos.map((w) => <li key={w.id}><button onClick={() => onWo(w.id)}><span className={`ops-pill pr ${w.priority}`}>{w.priority}</span><span className="grow"><b>{w.id}</b> {w.title}<em>{STATUS_LABEL[w.status]}</em></span></button></li>)}{wos.length === 0 && <li className="muted">None.</li>}</ul>
        <div className="rpt-label">Raise work</div>
        <form className="od-note" onSubmit={(e) => { e.preventDefault(); if (title.trim()) doit("raise", { action: "wo_create", asset: a.tag, title: title.trim(), priority: pr }).then(() => setTitle("")); }}>
          <select value={pr} onChange={(e) => setPr(e.target.value as WorkOrder["priority"])}>{(["P1", "P2", "P3", "P4"] as const).map((p) => <option key={p}>{p}</option>)}</select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing" /><button className="mini" disabled={!title.trim() || !!busy}>Raise</button>
        </form>
      </div>
    </div>
  );
}

/** The autopilot's state: what it may do, who signed it, and pause / resume / set up. */
function AutopilotBar({ s, busy, onSetUp, onPause }: { s: FS; busy: boolean; onSetUp: () => void; onPause: (on: boolean) => void }) {
  const p = s.policy;
  if (!p) return (
    <div className="ap-bar off">
      <span className="grow"><b>Autopilot off</b><em>Nothing runs by itself until a manager signs what it may do: which kinds of action, up to what risk and spend.</em></span>
      <button className="mini" onClick={onSetUp}>{s.canPolicy.ok ? "Set up autopilot" : "See the policy"}</button>
    </div>
  );
  return (
    <div className={`ap-bar ${s.autopilot ? "on" : "paused"}`}>
      <span className="grow"><b>Autopilot {s.autopilot ? "on" : "paused"}</b>
        <em>{p.kinds.map((k) => s.kindLabels[k]).join(", ")} · up to {p.maxRisk} risk and SAR {p.maxSpend.toLocaleString("en-US")} each · signed by {p.signedBy} ({p.role}) {ago(p.at)}</em></span>
      {s.autopilot ? (s.canPause.ok && <button className="mini" disabled={busy} onClick={() => onPause(false)}>Pause</button>) : (s.canPolicy.ok && <button className="mini" disabled={busy} onClick={() => onPause(true)}>Resume</button>)}
      <button className="mini" onClick={onSetUp}>Policy</button>
    </div>
  );
}

/** Sign (or withdraw) the autopilot policy for this facility — managers and directors only. */
function PolicySheet({ s, busy, onClose, onSign, onWithdraw }: { s: FS; busy: boolean; onClose: () => void; onSign: (p: Pick<AutopilotPolicy, "kinds" | "maxRisk" | "maxSpend">) => void; onWithdraw: () => void }) {
  const base = s.policy ?? s.defaultPolicy;
  const [kinds, setKinds] = useState<Action["kind"][]>(base.kinds);
  const [maxRisk, setMaxRisk] = useState<"low" | "medium">(base.maxRisk);
  const [maxSpend, setMaxSpend] = useState(base.maxSpend);
  const all = Object.keys(s.kindLabels) as Action["kind"][];
  const can = s.canPolicy;
  return (
    <div className="modal" role="dialog" aria-label="Autopilot policy" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ops-drawer">
        <div className="sheet-h"><b>Autopilot policy · {s.facility.name}</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="small">What the orchestrator may do by itself while the control room is open. Anything outside this waits for a person. Every action it takes is logged with this policy and who signed it.</p>
        {s.policy && <p className="small muted">Current policy signed by {s.policy.signedBy} ({s.policy.role}), {new Date(s.policy.at).toLocaleString()}.</p>}
        <div className="rpt-label">It may</div>
        <ul className="od-check">{all.map((k) => <li key={k}><label><input type="checkbox" disabled={!can.ok} checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />{s.kindLabels[k]}</label></li>)}</ul>
        <div className="od-grid">
          <label>Up to risk<select disabled={!can.ok} value={maxRisk} onChange={(e) => setMaxRisk(e.target.value as "low" | "medium")}><option value="low">Low</option><option value="medium">Medium</option></select></label>
          <label>Up to (SAR per action)<input type="number" min={0} max={250000} step={1000} disabled={!can.ok} value={maxSpend} onChange={(e) => setMaxSpend(Number(e.target.value))} /></label>
        </div>
        {!can.ok && <div className="dc-no"><span>{can.why}</span></div>}
        <div className="oa-acts">
          <button className="studio-add" disabled={!can.ok || busy || !kinds.length} onClick={() => onSign({ kinds, maxRisk, maxSpend })}>{s.policy ? "Sign the new policy" : "Sign and switch on"}</button>
          {s.policy && can.ok && <button className="mini" disabled={busy} onClick={onWithdraw}>Withdraw the policy</button>}
        </div>
      </div>
    </div>
  );
}
