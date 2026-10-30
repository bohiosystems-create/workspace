"use client";
/**
 * The agentic side of facility management, in the control room: the team's plan with its priorities set by the
 * scores (and why), the equipment heading for its limit (predictive maintenance), and tenants' complaints — logged,
 * classified, tied to the equipment and the work, analysed for clusters and trends.
 */
import { useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";
import { CATEGORY_LABEL } from "@/lib/fm/complaintLabels";
import type { Complaint } from "@/lib/fm/types";

type FS = ReturnType<typeof facilityStateFor>;
type Doit = (k: string, b: Record<string, unknown>) => Promise<void>;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
const dm = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" });

// ======================================================================== the team's plan
export function TeamPlanPanel({ s, onWo }: { s: FS; onWo: (id: string) => void }) {
  const wo = (id: string) => s.workOrders.find((w) => w.id === id);
  const tag = (id?: string) => s.assets.find((a) => a.id === id)?.tag ?? "";
  const top = s.jobScores.filter((x) => !x.blocked).slice(0, 8), blocked = s.jobScores.filter((x) => x.blocked);
  const Job = ({ x, mark }: { x: FS["jobScores"][number] & { title?: string; suggestedFor?: boolean }; mark?: string }) => (
    <li><button onClick={() => onWo(x.woId)}>
      <span className="ag-score" title="Score">{x.score}</span>
      <span className="grow"><b>{x.woId} · {tag(wo(x.woId)?.assetId)}</b> {wo(x.woId)?.title}{mark ? <i className="ag-tag">{mark}</i> : null}<em>{x.reasons.join(" · ") || "routine"}</em></span>
      <span className={`ops-pill pr ${x.priority}`}>{x.priority}</span>{(x.suggested < x.priority || Number(x.suggested[1]) - Number(x.priority[1]) >= 2) && <span className="ag-arrow" title="The score says: the orchestrator proposes the change">→ {x.suggested}</span>}
    </button></li>
  );
  return (
    <section className="ops-panel">
      <p className="muted small">The team&apos;s priorities, set by themselves: every open job is scored from its priority, how critical the equipment is, whether it is down, the SLA time left, safety, tenants&apos; complaints and predicted failure. Where the score disagrees with a job&apos;s priority the orchestrator proposes the change; each person&apos;s plan follows the scores.</p>
      <div className="rpt-label">First, across the facility</div>
      <ul className="ops-list ag-jobs">{top.map((x) => <Job key={x.woId} x={x} />)}</ul>
      <div className="rpt-label">Each person on shift: now, then next</div>
      <div className="ag-plan">
        {s.teamPlan.rows.map((r) => (
          <div key={r.tech.id} className="ag-person">
            <div className="ag-who"><b>{r.tech.name}</b><em>{r.tech.role} · {r.tech.zone}</em></div>
            {r.now ? <div className="ag-now"><span>Now</span><button onClick={() => onWo(r.now!.woId)}>{r.now.woId} · {r.now.title}</button></div> : <div className="ag-now idle"><span>Now</span>free</div>}
            <ol>{r.next.slice(0, 4).map((x) => <li key={x.woId}><button onClick={() => onWo(x.woId)}><i className="ag-mini">{x.score}</i>{x.woId} · {x.title}{x.suggestedFor && <i className="ag-tag">suggested</i>}</button></li>)}</ol>
            {r.next.length > 4 && <em className="muted small">+ {r.next.length - 4} more</em>}
          </div>
        ))}
      </div>
      {s.teamPlan.unplanned.length > 0 && <><div className="rpt-label">Nobody on shift has the skills</div><ul className="ops-list ag-jobs">{s.teamPlan.unplanned.map((x) => <Job key={x.woId} x={x} mark="call out / contractor" />)}</ul></>}
      {blocked.length > 0 && <><div className="rpt-label">Waiting, not ready to start</div><ul className="ops-list ag-jobs dim">{blocked.slice(0, 6).map((x) => <li key={x.woId}><button onClick={() => onWo(x.woId)}><span className="ag-score">{x.score}</span><span className="grow"><b>{x.woId}</b> {wo(x.woId)?.title}<em>{x.blocked}</em></span></button></li>)}</ul></>}
    </section>
  );
}

// ======================================================================== tenants' complaints
const CHANNEL: Record<Complaint["channel"], string> = { app: "app", whatsapp: "WhatsApp", qr: "QR code", helpdesk: "helpdesk", email: "e-mail", api: "tenant portal" };
export function ComplaintsPanel({ s, doit, busy, onWo }: { s: FS; doit: Doit; busy: string | null; onWo: (id: string) => void }) {
  const ins = s.complaintInsights;
  const tag = (id?: string) => s.assets.find((a) => a.id === id)?.tag;
  const [text, setText] = useState(""), [from, setFrom] = useState(""), [where, setWhere] = useState(""), [ch, setCh] = useState<Complaint["channel"]>("helpdesk");
  const open = s.complaints.filter((c) => c.status !== "resolved"), done = s.complaints.filter((c) => c.status === "resolved").slice(0, 8);
  const max = Math.max(1, ...ins.perDay.map((x) => x.n));
  const catMax = Math.max(1, ...ins.byCategory.map((x) => Math.max(x.week, x.before)));
  return (
    <section className="ops-panel">
      <p className="muted small">What tenants and occupants report — from the app, WhatsApp, QR codes on site, the helpdesk and the tenant portal. Each one is read for what it is about and how serious it is, placed in its area, tied to the equipment behind it and to the job already open. The orchestrator turns clusters into work, raises the job&apos;s priority, and tells the tenants when it is fixed.</p>
      <div className="ag-kpis">
        <div><b>{ins.open}</b><span>open</span></div><div><b>{ins.today}</b><span>today</span></div>
        <div><b>{ins.week}</b><span>this week <i className={ins.week > ins.weekBefore ? "up" : "down"}>{ins.weekBefore ? `${ins.week >= ins.weekBefore ? "+" : ""}${Math.round(((ins.week - ins.weekBefore) / ins.weekBefore) * 100)}%` : ""}</i></span></div>
        <div><b>{ins.resolveHours ?? "—"}</b><span>h to resolve, average</span></div><div><b>{ins.unlinked}</b><span>without a job</span></div>
      </div>
      {ins.clusters.length > 0 && <>
        <div className="rpt-label">Clusters — several about the same thing, and what the equipment says</div>
        <ul className="ops-list">
          {ins.clusters.map((c) => (
            <li key={c.key}><span className="ops-pill high">{c.ids.length}</span>
              <span className="grow"><b>{CATEGORY_LABEL[c.category]} · {c.zone}{c.assetId ? ` · ${tag(c.assetId)}` : ""}</b><em>{hm(c.first)}–{hm(c.last)}{c.signal ? ` · the equipment agrees: ${c.signal}` : ""}</em></span>
              {c.woId ? <span><button className="mini" onClick={() => onWo(c.woId!)}>{c.woId}</button></span> : <span className="ops-pill medium">no job yet</span>}</li>
          ))}
        </ul>
      </>}
      <div className="ag-charts">
        <div><div className="rpt-label">Two weeks, per day</div>
          <div className="ag-bars" role="img" aria-label="Complaints per day over two weeks">{ins.perDay.map((x) => <span key={x.day} title={`${x.day}: ${x.n}`} style={{ height: `${(x.n / max) * 100}%` }} />)}</div>
          <div className="ag-axis"><span>{dm(ins.perDay[0].day + "T12:00:00Z")}</span><span>today</span></div></div>
        <div><div className="rpt-label">What about — this week against the week before</div>
          <ul className="ag-cats">{ins.byCategory.slice(0, 7).map((x) => <li key={x.category}><span>{x.label}</span><i style={{ width: `${(x.week / catMax) * 100}%` }} /><i className="before" style={{ width: `${(x.before / catMax) * 100}%` }} /><b>{x.week}</b></li>)}</ul></div>
      </div>
      {ins.repeat.length > 0 && <p className="small"><b>Tenants who keep complaining:</b> {ins.repeat.map((r) => `${r.from} (${r.n} this week)`).join(" · ")}</p>}
      <div className="rpt-label">Open complaints</div>
      <ul className="ops-list">
        {open.length === 0 && <li className="muted">None open.</li>}
        {open.map((c) => (
          <li key={c.id}><span className={`ops-pill ${c.severity}`}>{c.severity}</span>
            <span className="grow"><b>{CATEGORY_LABEL[c.category]}{c.zone ? ` · ${c.zone}` : ""}{c.assetId ? ` · ${tag(c.assetId)}` : ""}</b> “{c.text}”<em>{c.from} · {CHANNEL[c.channel]} · {hm(c.at)}{c.status === "in_progress" ? " · being worked on" : ""}</em></span>
            {c.woId ? <span><button className="mini" onClick={() => onWo(c.woId!)}>{c.woId}</button></span> : <span className="ops-pill medium">no job yet</span>}</li>
        ))}
      </ul>
      <div className="rpt-label">Log a complaint</div>
      <form className="od-grid" onSubmit={async (e) => { e.preventDefault(); if (text.trim().length < 4) return; await doit("complaint", { action: "complaint", facilityId: s.facility.id, complaint: { text, from: from || "Helpdesk", where, channel: ch } }); setText(""); setWhere(""); }}>
        <label className="wide">What<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="In their words: “It's very hot at gate 206”, “Water on the floor in the washroom by gate 201”" /></label>
        <label>Who<input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Tenant or passenger" /></label>
        <label>Where<input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Gate, lounge, shop, area" /></label>
        <label>How<select value={ch} onChange={(e) => setCh(e.target.value as Complaint["channel"])}>{(Object.keys(CHANNEL) as Complaint["channel"][]).map((k) => <option key={k} value={k}>{CHANNEL[k]}</option>)}</select></label>
        <div className="od-acts"><button className="studio-add" disabled={!!busy || text.trim().length < 4}>Log it</button></div>
      </form>
      {done.length > 0 && <><div className="rpt-label">Recently resolved</div>
        <ul className="ops-list dim">{done.map((c) => <li key={c.id}><span className="ops-pill low">done</span><span className="grow"><b>{CATEGORY_LABEL[c.category]}{c.zone ? ` · ${c.zone}` : ""}</b> “{c.text}”<em>{c.from} · {dm(c.at)}{c.reply ? ` · told: ${c.reply}` : ""}</em></span></li>)}</ul></>}
    </section>
  );
}
