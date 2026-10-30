"use client";
/**
 * The predictive maintenance engine on screen (lib/fm/pdm.ts): every asset's health and probability of failure within
 * 30 days, its remaining life with the band around it, the failure mode diagnosed from its signals, the money at risk
 * and the day to act by — the engine's own track record (backtest on past failures, technicians' verdicts) — and, per
 * asset, the reading's 90 days with the onset, the model and its projection to the limit.
 */
import { useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";

type FS = ReturnType<typeof facilityStateFor>;
type AH = FS["pdm"]["assets"][number];
type SR = AH["series"][number];
const pct = (x: number) => `${Math.round(x * 100)} %`;
const sar = (n: number) => (n >= 1e6 ? `SAR ${(n / 1e6).toFixed(1)}M` : `SAR ${Math.round(n / 1000)}k`);
const dm = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const days = (x: number) => (x >= 999 ? "60+" : x < 1 ? "<1" : String(Math.round(x)));
const STATUS: Record<SR["status"], string> = { stable: "steady", anomaly: "abnormal", degrading: "degrading", alarm: "past its limit", reset: "just repaired" };

export function PdmPanel({ s, onAsset, onWo }: { s: FS; onAsset: (id: string) => void; onWo: (id: string) => void }) {
  const r = s.pdm, bt = r.backtest;
  const [open, setOpen] = useState<string | null>(null);
  const alarm = r.assets.filter((a) => a.series.some((x) => x.status === "alarm"));
  const watch = r.assets.filter((a) => !alarm.includes(a) && (a.p30 >= 0.15 || a.series.some((x) => x.status === "degrading" || x.status === "anomaly")));
  const quiet = r.assets.length - alarm.length - watch.length;
  return (
    <section className="ops-panel pdm">
      <p className="muted small">The predictive engine reads every condition reading of every running asset over 90 days{r.sources.historian ? ` (${r.sources.historian} from the plant historian, ${r.sources.demo} from the demo history)` : " (demo history — connect the plant historian to /api/v1/readings)"}: when a degradation began, whether it is steady or accelerating, when it reaches the limit and how sure that is, what is failing, what a failure would cost — and how good its own forecasts have been.</p>
      <div className="ag-kpis">
        <div><b>{r.assets.length}</b><span>assets watched · {r.sources.historian + r.sources.demo} readings</span></div>
        <div><b>{r.atRisk}</b><span>≥ 50 % chance of failure in 30 days</span></div>
        <div><b>{sar(r.expectedLoss)}</b><span>expected cost of failures, 30 days</span></div>
        <div><b>{bt.detectionRate !== null ? pct(bt.detectionRate) : "—"}</b><span>past failures seen coming</span></div>
        <div><b>{bt.medianLeadDays ?? "—"} d</b><span>warning ahead (median)</span></div>
        <div><b>{bt.maeDays ?? "—"} d</b><span>remaining-life error (mean)</span></div>
        <div><b>{bt.coverage !== null ? pct(bt.coverage) : "—"}</b><span>inside the P10–P90 band</span></div>
        <div><b>{bt.falseAlarmRate !== null ? pct(bt.falseAlarmRate) : "—"}</b><span>false alarms</span></div>
      </div>

      {alarm.length > 0 && <><div className="rpt-label">Past a limit now — failing, not predicted</div>
        <ul className="pdm-rows">{alarm.map((a) => <Row key={a.assetId} a={a} open={open === a.assetId} onToggle={() => setOpen(open === a.assetId ? null : a.assetId)} onAsset={onAsset} onWo={onWo} />)}</ul></>}
      <div className="rpt-label">Predicted — worst risk first</div>
      {watch.length === 0 ? <p className="studio-ok">No asset shows a degradation heading for its limit.</p>
        : <ul className="pdm-rows">{watch.map((a) => <Row key={a.assetId} a={a} open={open === a.assetId} onToggle={() => setOpen(open === a.assetId ? null : a.assetId)} onAsset={onAsset} onWo={onWo} />)}</ul>}
      <p className="muted small">{quiet} more assets steady: no degradation detected, only their age-based risk.</p>

      <div className="pdm-two">
        <div>
          <div className="rpt-label">Its track record — backtest on {bt.failures} past failures</div>
          <p className="small">Replayed as of 21, 14 and 7 days before each failure in the history. Half the failures calibrate its bias and spread (in log days: shift {bt.calibration.shift}, band {bt.calibration.lo} to +{bt.calibration.hi}); the figures are on the other half ({bt.checks} checks), which the calibration never saw. False alarms: {bt.quietChecks} quiet stretches with no failure in the next 30 days.</p>
          {bt.examples.length > 0 && <ul className="pdm-ex">{bt.examples.map((e, i) => <li key={i}><b>{e.asset}</b> {e.reading.toLowerCase()}: 14 days before, it said <b>{days(e.predicted)}</b> ({days(e.p10)}–{days(e.p90)})</li>)}</ul>}
          {r.sources.historian === 0 && <p className="muted small">On the demo history this tests the method, not the plant: with the historian connected the same backtest runs on the plant&apos;s own failures.</p>}
        </div>
        <div>
          <div className="rpt-label">What the technicians found on its jobs</div>
          {r.feedback.length === 0 ? <p className="muted small">No verdicts yet. When a predictive job is closed, the technician says whether the fault was there.</p>
            : <table className="pdm-fb"><thead><tr><th>Failure mode</th><th>Found</th><th>Not found</th><th>Precision</th></tr></thead><tbody>
              {r.feedback.map((f) => <tr key={f.modeId}><td>{f.name}</td><td>{f.confirmed}</td><td>{f.notFound}</td><td>{f.precision !== null ? pct(f.precision) : "—"}</td></tr>)}</tbody></table>}
          <p className="muted small">From three verdicts on a failure mode, its precision weighs its diagnosis: a mode it keeps getting wrong counts for less.</p>
        </div>
      </div>

      <details className="pdm-how"><summary>How the engine works</summary>
        <ol>
          <li><b>Onset</b> — a one-sided CUSUM against each reading&apos;s own baseline (median and MAD of the earlier weeks) finds when a drift towards the limit began.</li>
          <li><b>Model</b> — a straight line and an accelerating curve (the P–F curve) are fitted since the onset; the lower AICc wins.</li>
          <li><b>Remaining life</b> — from the fitted rate and its uncertainty, combined with the P–F interval for the equipment type (the typical days from first sign to failure), then recalibrated on the backtest: P10 / P50 / P90 days and the probability of reaching the limit within 7 and 30 days. A drift many times slower than any failure develops is noted, not predicted.</li>
          <li><b>Anomalies</b> — an EWMA control chart flags a step or a spike long before a limit would.</li>
          <li><b>Diagnosis</b> — the asset&apos;s signals read together against {"a "}failure-mode library (bearing wear, impeller wear, fouling, seal degradation, battery ageing…), weighted by the technicians&apos; verdicts.</li>
          <li><b>Age</b> — a Weibull model per equipment type gives the risk even without warning signs.</li>
          <li><b>Money</b> — probability × (hours down × the cost of an hour for its criticality + the repair): the expected cost ranks the work; &quot;act by&quot; leaves time for the spare to arrive.</li>
        </ol>
        <p className="muted small">Costs, Weibull and P–F parameters are demo assumptions to be set per plant. Condition readings only: levels, loads and counters move with operation, not wear.</p>
      </details>
    </section>
  );
}

function Row({ a, open, onToggle, onAsset, onWo }: { a: AH; open: boolean; onToggle: () => void; onAsset: (id: string) => void; onWo: (id: string) => void }) {
  const key = a.series.filter((x) => x.status === "alarm" || x.status === "degrading").sort((x, y) => y.p30 - x.p30)[0] ?? a.series.find((x) => x.status === "anomaly");
  const tone = a.p30 >= 0.7 ? "high" : a.p30 >= 0.4 ? "medium" : "low";
  return (
    <li className={`risk-${tone}`}>
      <div className="pdm-r" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }} aria-expanded={open}>
        <span className="pdm-hi" title="Health index (100 = no sign of degradation)"><b>{a.health}</b>health</span>
        <span className="grow">
          <b>{a.tag}</b> {a.name}
          <em>{a.diagnosis ? `${a.diagnosis.name} (${pct(a.diagnosis.score)}${a.diagnosis.precision !== undefined ? `, precision ${pct(a.diagnosis.precision)}` : ""}) — ${a.diagnosis.evidence.join("; ")}` : key ? `${key.name} ${STATUS[key.status]}` : "no sign"}</em>
        </span>
        <span className="pdm-p"><i style={{ width: `${Math.round(a.p30 * 100)}%` }} /><b>{pct(a.p30)}</b><em>30 days</em></span>
        <span className="pdm-rul">{a.rul ? <><Band rul={a.rul} /><em>{a.rul.reading}: {days(a.rul.p50)} d ({days(a.rul.p10)}–{days(a.rul.p90)})</em></> : <em>{key?.status === "alarm" ? "past its limit" : "—"}</em>}</span>
        <span className="pdm-m"><b>{sar(a.expectedLoss)}</b><em>{a.actBy ? `act by ${dm(a.actBy)}` : a.series.some((x) => x.status === "alarm") ? "act now" : ""}</em></span>
      </div>
      {open && <div className="pdm-detail">
        {a.series.filter((x) => x.values.length && (x.status !== "stable" || x === key)).map((x) => <Chart key={x.key} x={x} />)}
        <p className="small">
          {a.diagnosis && <><b>Do:</b> {a.diagnosis.action}. {a.alternatives.length > 0 && <>Also possible: {a.alternatives.map((m) => `${m.name} (${pct(m.score)})`).join(", ")}. </>}</>}
          Probability of failure in 30 days {pct(a.p30)} — from the readings {pct(a.pCondition)}, from age {pct(a.pAge)}. A failure would cost about {sar(a.failureCost)}.{a.spareShort ? ` ${a.spareShort.part}: none in stock, ${a.spareShort.leadDays} days to arrive.` : ""}
        </p>
        <div className="od-acts"><button className="mini" onClick={() => onAsset(a.assetId)}>Open {a.tag}</button>{a.openWo && <button className="mini" onClick={() => onWo(a.openWo!)}>{a.openWo} open</button>}</div>
      </div>}
    </li>
  );
}

/** Remaining life on a 0–60 day axis: the P10–P90 band and the P50 mark. */
function Band({ rul }: { rul: { p10: number; p50: number; p90: number } }) {
  const x = (d: number) => `${Math.min(100, (Math.min(d, 60) / 60) * 100)}%`;
  return <span className="pdm-band" aria-label={`P10 ${days(rul.p10)}, P50 ${days(rul.p50)}, P90 ${days(rul.p90)} days`}><i style={{ left: x(rul.p10), width: `calc(${x(rul.p90)} - ${x(rul.p10)})` }} /><b style={{ left: x(rul.p50) }} /></span>;
}

/** A reading's 90 days, its limit, the onset of the degradation and the model's projection to the limit (with its band). */
function Chart({ x }: { x: SR }) {
  const W = 640, H = 150, L = 36, R = 10, T = 10, B = 20;
  const past = x.values.length, future = x.projection ? Math.max(0, ...x.projection.map((p) => p.day)) : 0;
  const d0 = -(past - 1), d1 = Math.max(4, future);
  const ys = [...x.values, x.limit, x.baseline.median, ...(x.projection ?? []).flatMap((p) => [p.lo, p.hi])];
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (d: number) => L + ((d - d0) / (d1 - d0)) * (W - L - R), Y = (v: number) => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / span) * (H - T - B);
  const proj = (x.projection ?? []).filter((p) => p.day >= 0);
  return (
    <figure className="pdm-chart">
      <figcaption><b>{x.name}</b> {x.value} {x.unit} · limit {x.limit} {x.unit} · {STATUS[x.status]}{x.model ? ` · ${x.model} since ${x.onsetDaysAgo} days ago (fit ${pct(x.fit ?? 0)})` : ""}{x.status === "anomaly" ? ` · ${x.z > 0 ? "+" : ""}${x.z}σ` : ""}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${x.name}: 90 days and the projection`}>
        <line className="lim" x1={L} x2={W - R} y1={Y(x.limit)} y2={Y(x.limit)} /><text x={L - 4} y={Y(x.limit) + 3} textAnchor="end">{x.limit}</text>
        <line className="base" x1={L} x2={X(0)} y1={Y(x.baseline.median)} y2={Y(x.baseline.median)} />
        <line className="now" x1={X(0)} x2={X(0)} y1={T} y2={H - B} /><text x={X(0)} y={H - 6} textAnchor="middle">today</text>
        <text x={L} y={H - 6}>90 days ago</text>
        {x.onsetDaysAgo !== undefined && <><line className="onset" x1={X(-x.onsetDaysAgo)} x2={X(-x.onsetDaysAgo)} y1={T} y2={H - B} /><text x={X(-x.onsetDaysAgo) + 3} y={T + 9}>onset</text></>}
        {proj.length > 1 && <polygon className="fan" points={[...proj.map((p) => `${X(p.day)},${Y(p.hi)}`), ...[...proj].reverse().map((p) => `${X(p.day)},${Y(p.lo)}`)].join(" ")} />}
        {x.projection && <polyline className="model" points={x.projection.map((p) => `${X(p.day)},${Y(p.v)}`).join(" ")} />}
        <polyline className="val" points={x.values.map((v, i) => `${X(d0 + i)},${Y(v)}`).join(" ")} />
      </svg>
    </figure>
  );
}
