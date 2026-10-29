"use client";
/**
 * The schedule agent, over Primavera P6: when the project will finish (P6's date, the logic's, and earned schedule's),
 * what changed since the last update, what the site reported that P6 doesn't show, how to recover the contract date
 * (each option tried on the logic), a what-if on any activity, the critical path, the programme's health (DCMA 14
 * points) and the changes waiting to go back to P6. Approvals go through the same queue as every other proposal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgrammeState } from "@/lib/pm/api";

const dm = (iso?: string) => (iso ? new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
const Delta = ({ d }: { d: number }) => <i className={d > 0 ? "up" : d < 0 ? "down" : ""}>{d > 0 ? `+${d}` : d} d</i>;

async function save(url: string, name: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Download failed (${r.status}).`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}

export default function ScheduleAgent({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<ProgrammeState | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/pm", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setS(j); setErr(""); }
    catch (e) { setErr((e as Error).message || "Could not load the programme."); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(label); setMsg("");
    try { setMsg(await f()); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  };
  const post = async (body: object) => { const r = await fetch("/api/pm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
  const approve = (key: string) => run(key, async () => {
    const r = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, decision: "approved" }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error); return j.message as string;
  });

  if (err) return <div className="sa"><div className="empty pad">{err}</div></div>;
  if (!s) return <div className="sa"><div className="empty pad">Reading the programme…</div></div>;
  const f = s.forecast, late = diff(f.contract, f.logic);
  const prop = (kind: string, test: (x: ProgrammeState["proposals"][number]) => boolean) => s.proposals.find((x) => x.kind === kind && test(x));
  const pending = s.outbox.filter((x) => x.status === "pending");

  return (
    <div className="sa">
      <header className="sa-head">
        <div className="grow">
          <div className="rpt-label">Schedule agent · over Primavera P6</div>
          <h2>{s.source.name}</h2>
          <p className="muted">Data date {dm(s.dataDate)} · {s.activities} activities · {s.critical.count} critical · {s.source.kind === "demo" ? "demo programme" : s.source.kind === "xer" ? "imported from an XER" : "read from the P6 API"}{s.p6.connected ? " · P6 API connected" : ""}</p>
        </div>
        <div className="sa-acts">
          <input ref={file} type="file" accept=".xer,.txt" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) run("import", async () => { const r = await fetch("/api/pm?import=xer", { method: "POST", body: await x.text() }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return `Imported ${j.imported} activities (data date ${j.dataDate}); completion ${j.completion ?? "?"}.${j.warnings?.length ? " " + j.warnings.join(" ") : ""}`; }); }} />
          <button className="mini" disabled={!!busy} onClick={() => file.current?.click()}>Import XER</button>
          {s.p6.connected && <button className="mini" disabled={!!busy} onClick={() => run("sync", async () => { const j = await post({ op: "sync" }); return `Read ${j.imported} activities from P6 (data date ${j.dataDate}).`; })}>Read from P6</button>}
          <button className="mini" disabled={!!busy} onClick={() => run("xer", async () => { await save("/api/pm?export=xer", `programme-${s.dataDate}.xer`); return "XER downloaded: in P6, File → Import → Primavera PM (XER), update the existing project (try it on a copy first)."; })}>Download XER</button>
        </div>
      </header>
      {msg && <div className="sa-msg" role="status">{msg}</div>}

      {/* ------------------------------------------------ when will it finish */}
      <section className="ops-panel">
        <div className="rpt-label">When it finishes</div>
        <div className="ag-kpis sa-kpis">
          <div><span>Contract</span><b>{dm(f.contract)}</b></div>
          <div><span>P6 says</span><b>{dm(f.p6)}</b>{f.p6 && <Delta d={diff(f.contract, f.p6)} />}</div>
          <div><span>The logic says (CPM)</span><b>{dm(f.logic)}</b><Delta d={late} /></div>
          <div><span>At the pace so far</span><b>{dm(f.atPace)}</b><Delta d={diff(f.contract, f.atPace)} /></div>
          <div><span>If the rest goes to plan</span><b>{dm(f.toPlan)}</b><Delta d={diff(f.contract, f.toPlan)} /></div>
          <div><span>SPI(t)</span><b>{f.spiT.toFixed(2)}</b><em className="muted">{f.behindDays > 0 ? `${f.behindDays} d behind` : f.behindDays < 0 ? `${-f.behindDays} d ahead` : "on plan"}</em></div>
        </div>
        <SCurve curve={f.curve} dataDate={f.dataDate} earned={f.earned} planned={f.planned} />
        <p className="muted small">P6&apos;s date is the programme as the planner left it; the logic&apos;s is the critical path recalculated on today&apos;s progress; the other two are earned schedule — how far along the baseline the work done has got, against the time spent. Earned {f.earned} % against {f.planned} % planned.</p>
      </section>

      <div className="sa-two">
        {/* ------------------------------------------------ what changed */}
        <section className="ops-panel">
          <div className="rpt-label">What changed since the last update</div>
          {s.compare ? <>
            <p className="muted small">{dm(s.compare.from)} ({s.compare.source}) → {dm(s.compare.to)}</p>
            <ul className="sa-find">{s.compare.findings.map((x, i) => <li key={i} className={`sev-${x.severity}`}><span className={`ops-pill ${x.severity}`}>{x.severity}</span><span className="grow">{x.text}</span></li>)}</ul>
            {!s.compare.findings.length && <p className="muted">Nothing worth a question.</p>}
          </> : <p className="muted">One update so far: import the next XER (or read P6 again) and the agent compares them — slips, durations cut, logic deleted, baselines moved.</p>}
        </section>

        {/* ------------------------------------------------ site vs P6 */}
        <section className="ops-panel">
          <div className="rpt-label">What the site says against P6</div>
          {s.fieldGaps.length ? <ul className="sa-find">{s.fieldGaps.map((g) => {
            const p = prop("p6_progress", (x) => x.activityId === g.id);
            return <li key={g.id}><span className="grow"><b>{g.id}</b> {g.name}<em>{g.text} · {g.site.by}{g.site.photos ? ` · ${g.site.photos} photo${g.site.photos > 1 ? "s" : ""}` : ""}</em></span>
              {p ? <button className="mini" disabled={!!busy} onClick={() => approve(p.key)}>Put in P6</button> : <span className="muted small">queued</span>}</li>;
          })}</ul> : <p className="muted">P6 agrees with what the site reported.</p>}
        </section>
      </div>

      {/* ------------------------------------------------ recovery */}
      <section className="ops-panel">
        <div className="rpt-label">Getting the contract date back</div>
        {s.recovery.negativeFloat > 0 ? <>
          <p><b>{s.recovery.negativeFloat} days</b> past the contract date. Every option below was tried on the programme&apos;s logic — its gain is what the network gives, after any near-critical path takes over.
            {s.recovery.plan.ids.length > 0 && <> Recommended: <b>{s.recovery.plan.ids.length} change{s.recovery.plan.ids.length > 1 ? "s" : ""}</b>, together <b>{s.recovery.plan.saves} days</b>, {s.recovery.plan.cost ? sar(s.recovery.plan.cost) : "no direct cost"}.</>}</p>
          <ul className="sa-rec">{s.recovery.options.map((o) => {
            const p = prop("recovery_option", (x) => x.id === `recovery:${o.id}`), inPlan = s.recovery.plan.ids.includes(o.id);
            return <li key={o.id} className={inPlan ? "plan" : ""}>
              <span className="sa-save"><b>{o.saves}</b>days</span>
              <span className="grow"><b>{o.title}</b>{inPlan && <i className="ag-tag">plan</i>}<em>{o.detail}</em><em>{o.kind} · {o.risk} risk · {o.cost ? sar(o.cost) : "no direct cost"}</em></span>
              {p ? <button className="mini" disabled={!!busy} onClick={() => approve(p.key)}>Approve</button> : null}
            </li>;
          })}</ul>
          <p className="muted small">Approving changes the programme here, reschedules it by the critical path, and queues the change for P6 (below). Each approval is checked against the approver&apos;s limits.</p>
        </> : <p>The programme meets its contract date ({dm(f.contract)}) on its logic — no recovery needed.</p>}
      </section>

      <div className="sa-two">
        <WhatIf post={post} />
        {/* ------------------------------------------------ critical path */}
        <section className="ops-panel">
          <div className="rpt-label">The driving path to completion</div>
          <ol className="sa-path">{s.critical.path.map((a) => <li key={a.id} className={a.float < 0 ? "neg" : ""}><b>{a.id}</b><span className="grow">{a.name}</span><em>{dm(a.finish)}</em><i>{a.float} d</i></li>)}</ol>
          {s.critical.loops.length > 0 && <p className="sa-msg">Logic loop: {s.critical.loops.join(", ")} can&apos;t be scheduled.</p>}
        </section>
      </div>

      {/* ------------------------------------------------ health */}
      <section className="ops-panel">
        <div className="rpt-label">Can the programme be trusted · DCMA 14-point check · {s.health.passed}/14</div>
        <div className="sa-dcma">{s.health.checks.map((c) => (
          <div key={c.n} className={c.pass ? "pass" : "fail"} title={c.ids.length ? c.ids.slice(0, 12).join(", ") : undefined}>
            <span>{c.n}. {c.name}</span><b>{c.value}</b><em>{c.pass ? "pass" : "fail"} · {c.threshold}</em><p>{c.why}</p>
          </div>))}</div>
      </section>

      {/* ------------------------------------------------ outbox */}
      <section className="ops-panel">
        <div className="sa-row"><div className="rpt-label grow">Back to P6 · {pending.length} waiting</div>
          {s.p6.connected && pending.length > 0 && <button className="mini" disabled={!!busy} onClick={() => run("push", async () => { const j = await post({ op: "push" }); return `Sent ${j.sent} to P6${j.failed ? `, ${j.failed} failed (see each)` : ""}.`; })}>Send to P6</button>}
          {s.outbox.length > 0 && <button className="mini" disabled={!!busy} onClick={() => run("csv", async () => { await save("/api/pm?export=csv", `p6-changes-${s.dataDate}.csv`); return "Changes downloaded as CSV."; })}>Download CSV</button>}
          {pending.length > 0 && <button className="mini" disabled={!!busy} onClick={() => run("mark", async () => { await post({ op: "mark", ids: pending.map((x) => x.id), status: "sent" }); return `${pending.length} marked as entered in P6.`; })}>Mark entered</button>}
        </div>
        {s.outbox.length ? <ul className="sa-find">{s.outbox.map((c) => <li key={c.id}><span className={`ops-pill ${c.status === "failed" ? "high" : c.status === "sent" ? "low" : "medium"}`}>{c.status}</span>
          <span className="grow"><b>{c.activityId}</b> {c.kind}: {Object.entries(c.fields).map(([k, v]) => `${k} ${v}`).join(", ")}<em>{c.reason}{c.by ? ` · approved by ${c.by}` : ""}{c.note ? ` · ${c.note}` : ""}</em></span></li>)}</ul>
          : <p className="muted">Nothing waiting. Approved recovery changes and site progress you put in P6 queue here.</p>}
        <p className="muted small">{s.p6.connected ? "Sent through the P6 EPPM REST API." : "No P6 API connected: download the XER (the whole programme) or the CSV (the changes) for the planner. Set P6 in the server's environment to send directly (SETUP.md)."}</p>
      </section>
    </div>
  );
}

function WhatIf({ post }: { post: (b: object) => Promise<{ activityId: string; deltaDays: number; completionMoves: number; floatBefore: number; completion: string; milestones: { id: string; name: string; moves: number }[] }> }) {
  const [id, setId] = useState("TA-STR-L18");
  const [days, setDays] = useState("10");
  const [r, setR] = useState<Awaited<ReturnType<typeof post>> | null>(null);
  const [e, setE] = useState("");
  return (
    <section className="ops-panel">
      <div className="rpt-label">What if</div>
      <form className="sa-row" onSubmit={async (ev) => { ev.preventDefault(); setE(""); try { setR(await post({ op: "whatif", activityId: id, days: Number(days) })); } catch (x) { setR(null); setE((x as Error).message); } }}>
        <label className="sa-in">Activity<input value={id} onChange={(x) => setId(x.target.value)} maxLength={40} /></label>
        <label className="sa-in sm">Days<input value={days} onChange={(x) => setDays(x.target.value)} inputMode="numeric" maxLength={4} /></label>
        <button className="mini">Try it</button>
      </form>
      {e && <p className="sa-msg">{e}</p>}
      {r && <div className="sa-wi">
        <p><b>{r.activityId}</b> {r.deltaDays > 0 ? `${r.deltaDays} days late` : `${-r.deltaDays} days early`} (it has {r.floatBefore} days of float): completion {r.completionMoves ? <b>moves {r.completionMoves > 0 ? "+" : ""}{r.completionMoves} days, to {dm(r.completion)}</b> : <b>does not move</b>}.</p>
        {r.milestones.length > 0 && <ul>{r.milestones.slice(0, 8).map((m) => <li key={m.id}>{m.id} {m.name}: {m.moves > 0 ? "+" : ""}{m.moves} d</li>)}</ul>}
      </div>}
      <p className="muted small">The change is tried on the programme&apos;s logic, not saved. A negative number brings the activity forward.</p>
    </section>
  );
}

function SCurve({ curve, dataDate, earned, planned }: { curve: ProgrammeState["forecast"]["curve"]; dataDate: string; earned: number; planned: number }) {
  const W = 1000, H = 230, L = 40, B = 24, n = curve.length;
  if (n < 2) return null;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - 8), y = (v: number) => H - B - (v / 100) * (H - B - 8);
  const now = curve.findIndex((c) => c.month === dataDate.slice(0, 7));
  const years = curve.map((c, i) => ({ i, y: c.month.slice(0, 4) })).filter((c, i, a) => i === 0 || a[i - 1].y !== c.y);
  return (
    <div className="sa-curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`S-curve: ${planned} % planned and ${earned} % earned at the data date`}>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 6} y={y(v) + 3} textAnchor="end">{v}%</text></g>)}
        {years.map((c) => <text key={c.y} x={x(c.i)} y={H - 6} textAnchor="start">{c.y}</text>)}
        <polyline className="pl" points={curve.map((c, i) => `${x(i)},${y(c.planned)}`).join(" ")} />
        {now >= 0 && <>
          <line x1={x(now)} x2={x(now)} y1={8} y2={H - B} className="now" />
          <circle cx={x(now)} cy={y(earned)} r="4.5" className="ev" />
          <text x={x(now) + 10} y={y(earned) + 18} className="sa-ev">earned {earned}%</text>
          <text x={x(now) - 10} y={y(planned) - 10} textAnchor="end" className="sa-pv">planned {planned}%</text>
        </>}
      </svg>
    </div>
  );
}
