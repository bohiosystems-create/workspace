"use client";
/**
 * Operations: the facility-management orchestration layer. The home page shows a card per facility; the control room
 * shows one facility — what the orchestrator proposes (with its reasons, approve / reject, autopilot), work orders,
 * assets with live readings, alarms, the team (each with their own field app), spares and the activity log.
 * Everything reloads by itself when anything changes (WhatsApp, the field app, another user).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { facilityState, overview } from "@/lib/fm/api";
import type { Asset, Reading, WorkOrder } from "@/lib/fm/types";
import { Icon } from "../icons";

type Overview = ReturnType<typeof overview>;
type FS = ReturnType<typeof facilityState>;
type WO = FS["workOrders"][number];
const SECTOR_ICON: Record<string, string> = { energy: "chart", water: "layers", airport: "map" };
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
type Tab = "orchestrator" | "work" | "assets" | "alarms" | "team" | "spares" | "activity";
export function ControlRoom({ facilityId, author, onBack }: { facilityId: string; author: string; onBack: () => void }) {
  const [s, setS] = useState<FS | null>(null);
  const [tab, setTab] = useState<Tab>("orchestrator");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [woOpen, setWoOpen] = useState<string | null>(null);
  const [assetOpen, setAssetOpen] = useState<string | null>(null);
  const load = useCallback(() => { fetch(`/api/fm?facility=${facilityId}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.error) setMsg({ text: j.error, bad: true }); else setS(j); }).catch(() => setMsg({ text: "Could not load the facility.", bad: true })); }, [facilityId]);
  useEffect(load, [load]);
  useLive(load);
  // Autopilot: while the control room is open, the low-risk proposals run by themselves every 15 s.
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
  const open = s.workOrders.filter((w) => w.status !== "done");
  const tabs: [Tab, string, number?][] = [["orchestrator", "Orchestrator", s.actions.length], ["work", "Work orders", open.length], ["assets", "Assets"], ["alarms", "Alarms", k.activeAlarms], ["team", "Team"], ["spares", "Spares", k.sparesLow], ["activity", "Activity"]];
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
          <div className="ops-row">
            <div className="rpt-label">The orchestrator proposes</div>
            <span className="grow" />
            <label className="ops-switch"><input type="checkbox" checked={s.autopilot} onChange={(e) => doit("autopilot", { action: "autopilot", on: e.target.checked })} /><span>Autopilot</span><em>{s.autopilot ? "low-risk actions run by themselves" : "everything waits for approval"}</em></label>
            {s.actions.some((a) => a.risk === "low") && <button className="mini" disabled={!!busy} onClick={async () => { for (const a of s.actions.filter((x) => x.risk === "low")) { try { await post({ action: "decide", actionId: a.id, decision: "approved", by: author }); } catch { /* changed meanwhile */ } } setMsg({ text: "Approved all low-risk actions." }); load(); }}>Approve all low-risk</button>}
          </div>
          {s.top.length > 0 && <div className="ops-top"><b>Now:</b> {s.top.slice(0, 4).join(" · ")}</div>}
          {s.actions.length === 0 && <p className="muted">Nothing to propose: every alarm has work, every job has someone on it, stock covers the work.</p>}
          <ul className="ops-actions">
            {s.actions.map((a) => (
              <li key={a.id} className={`risk-${a.risk}`}>
                <div className="oa-head"><span className={`ops-pill ${a.risk}`}>{a.risk} risk</span><span className="oa-kind">{a.kind.replace("_", " ")}</span>{a.auto && <span className="oa-auto">autopilot can run this</span>}</div>
                <b>{a.title}</b>
                <ul className="oa-why">{a.why.map((y, i) => <li key={i}>{y}</li>)}</ul>
                <div className="oa-acts"><button className="studio-add" disabled={!!busy} onClick={() => doit(a.id, { action: "decide", actionId: a.id, decision: "approved" })}>{busy === a.id ? "…" : "Approve"}</button><button className="mini" disabled={!!busy} onClick={() => doit(a.id + "r", { action: "decide", actionId: a.id, decision: "rejected" })}>Reject</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "work" && <WorkList s={s} tag={tag} who={who} onOpen={setWoOpen} />}

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

      {wo && <WoDrawer s={s} wo={wo} tag={tag} onClose={() => setWoOpen(null)} doit={doit} busy={busy} />}
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

function WorkList({ s, tag, who, onOpen }: { s: FS; tag: (id?: string) => string; who: (id?: string) => string; onOpen: (id: string) => void }) {
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
            <span className="grow"><b>{w.id} · {tag(w.assetId)}</b> {w.title}<em>{w.type} · {STATUS_LABEL[w.status]}{w.holdReason ? ` (${w.holdReason})` : ""} · {who(w.assignee)}{w.permit ? ` · permit ${w.permit.status}` : ""}</em></span>
            {w.status !== "done" && <span className={`ops-sla ${w.overdue ? "bad" : w.type !== "PM" && w.slaLeft < w.slaHours * 0.3 ? "warn" : ""}`}>{w.overdue ? "past SLA" : w.type === "PM" ? `due ${w.due.slice(5)}` : `${Math.max(0, Math.round(w.slaLeft))} h left`}</span>}
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
        {wo.permit && <div className={`od-permit ${wo.permit.status}`}>Permit: {wo.permit.type} — {wo.permit.status === "required" ? "required, not issued yet: work may not start" : wo.permit.status}</div>}
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
