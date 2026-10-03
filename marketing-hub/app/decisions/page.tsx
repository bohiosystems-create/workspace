"use client";

import { useEffect, useState } from "react";
import { KRange } from "../_components/KCharts";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useAgent, openDrafts } from "../_components/useAgent";
import Trials from "../_components/Trials";

const METRIC_LABEL: Record<string, string> = { cpql: "Cost / qualified lead", value: "Revenue + pipeline / SAR", plan: "Spend vs plan", deadlines: "On time", revisions: "Revisions" };
const DECISION_LABEL: Record<string, string> = { RE_ENGAGE: "Re-engage", RENEGOTIATE: "Renegotiate", PERFORMANCE_PLAN: "Performance plan", TEST_REPLACEMENT: "Test replacement", EXIT: "Exit" };

export default function DecisionsPage() {
  const { t, N, k, d, lang } = useI18n();
  const { data, error, setError, busy, act, doc } = useAgent();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [qbrVendor, setQbrVendor] = useState("");
  const [quarter, setQuarter] = useState("2026-Q2");
  const [qbr, setQbr] = useState<any>(null);
  const [rfpVendor, setRfpVendor] = useState("");
  const [rfp, setRfp] = useState<any>(null);
  const [printing, setPrinting] = useState<"qbr" | "rfp" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (!qbrVendor && data.decisions[0]) setQbrVendor(data.decisions[0].vendorId);
    const repl = data.decisions.find((x: any) => x.decision === "EXIT" || x.decision === "TEST_REPLACEMENT");
    if (!rfpVendor && repl) setRfpVendor(repl.vendorId);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data && typeof location !== "undefined" && location.hash === "#trials") setTimeout(() => document.getElementById("trials")?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!qbrVendor) return;
    let live = true;
    doc("qbr", qbrVendor, quarter).then((r) => live && setQbr(r.qbr)).catch((e) => setError(e.message));
    return () => { live = false; };
  }, [qbrVendor, quarter, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rfpVendor) return;
    let live = true;
    doc("rfp", rfpVendor).then((r) => live && setRfp(r.rfp)).catch((e) => setError(e.message));
    return () => { live = false; };
  }, [rfpVendor, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!printing) return;
    const id = setTimeout(() => { window.print(); setPrinting(null); }, 50);
    return () => clearTimeout(id);
  }, [printing]);

  async function draftRenewal(x: any) {
    setError(null);
    try {
      const r = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DRAFT", key: `RENEWAL:${x.vendorId}:${x.decision}`, lang }) });
      const j = await r.json();
      if (j.error && !/already exists/i.test(j.error) && !/موجودة/.test(j.error)) throw new Error(j.error);
      openDrafts();
    } catch (e: any) { setError(e.message); }
  }

  const CONF: Record<string, string> = { High: t("High"), Medium: t("Medium"), Low: t("Low") };

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Vendor decisions")}</div>
      <p className="intro">{t("Every vendor on one fair scale — verified data, normalised by channel and budget, adjusted for what the vendor actually caused — and a renewal recommendation with its evidence and confidence. Quarterly reviews and replacement RFPs are generated from the same data.")}</p>

      {error && <div className="err">{error}</div>}
      {note && <div className="panel" style={{ marginBottom: 12, fontSize: 12 }}>{note}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Scoring vendors…")}</div>}

      {data && (
        <>
          <div className="panel">
            <div className="chart-label">{t("Fair scorecard — 50 = channel benchmark")}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>#</th><th>{t("Vendor")}</th><th>{t("Score")}</th><th>{t("Range")}</th><th>{t("Confidence")}</th><th>{t("Trend")}</th><th>{t("Incremental")}</th>
                    {Object.keys(METRIC_LABEL).map((m) => <th key={m} className="num">{t(METRIC_LABEL[m])}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.scores.map((s: any) => (
                    <tr key={s.vendorId}>
                      <td>{s.rank}</td>
                      <td><b>{N(s.vendor)}</b><div className="muted" style={{ fontSize: 9 }}>{N(s.category)} · {k(s.costK)}</div></td>
                      <td className="num"><b style={{ fontSize: 14, color: s.score < 40 ? "var(--alert)" : undefined }}>{s.score}</b></td>
                      <td style={{ minWidth: 140 }}>
                        <div title={`${s.low}–${s.high}`}><KRange lo={s.low} hi={s.high} point={s.score} par={50} tone={s.score < 40 ? "bad" : undefined} /></div>
                        <div className="muted" style={{ fontSize: 9 }}>{s.low}–{s.high}</div>
                      </td>
                      <td><span className={`pill ${s.confidence === "High" ? "healthy" : s.confidence === "Low" ? "weak" : "hold"}`}>{CONF[s.confidence]}</span></td>
                      <td>{t(s.trend)}</td>
                      <td>{s.incrementalShare === null ? "—" : `${Math.round(s.incrementalShare * 100)}%`}<div className="muted" style={{ fontSize: 9 }}>{t(s.incrementalEvidence === "TEST" ? "test" : s.incrementalEvidence === "MMM" ? "media-mix model" : "no evidence")}</div></td>
                      {s.metrics.map((m: any) => (
                        <td key={m.key} className="num" title={`${t("benchmark")} ${m.benchmark}`}>
                          <b className={m.points >= 50 ? "ok" : "bad"}>{Math.round(m.points)}</b>
                          <div className="muted" style={{ fontSize: 9 }}>{m.actual ?? "—"}{m.unit === "%" ? "%" : ""} / {m.benchmark}{m.unit === "%" ? "%" : ""}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 10, lineHeight: 1.6 }}>{data.method}</div>
          </div>

          <div className="section-title" style={{ fontSize: 12, margin: "24px 0 12px" }}>{t("Renewal recommendations")}</div>
          {data.decisions.map((x: any) => (
            <div className="dec" key={x.vendorId}>
              <div className="dec-head">
                <span className={`dec-badge ${x.decision}`}>{t(DECISION_LABEL[x.decision])}</span>
                <b style={{ fontSize: 13 }}>{N(x.vendor)}</b>
                <span className="muted">{x.headline}</span>
                <div style={{ flex: 1 }} />
                <span className={`pill ${x.confidence === "High" ? "healthy" : x.confidence === "Low" ? "weak" : "hold"}`}>{t("Confidence")}: {CONF[x.confidence]}</span>
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{x.confidenceWhy} · {t("Contract ends")} {d(x.contractEnd)}</div>
              <div style={{ fontSize: 12, marginTop: 10 }}><b>{t("Next step")}:</b> {x.nextStep}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: "var(--ink-soft)" }}><b>{t("What would change this")}:</b> {x.wouldChange}</div>
              <button className="chip" style={{ marginTop: 10 }} onClick={() => setOpen({ ...open, [x.vendorId]: !open[x.vendorId] })}>{open[x.vendorId] ? t("Hide evidence") : `${t("Evidence")} (${x.evidence.length})`}</button>
              {open[x.vendorId] && (
                <>
                  <ul>{x.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                  {x.targets.length > 0 && <><div className="chart-label" style={{ marginTop: 10 }}>{t("Targets")}</div><ul>{x.targets.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></>}
                </>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                {["RENEGOTIATE", "PERFORMANCE_PLAN", "RE_ENGAGE"].includes(x.decision) && <button className="btn" style={{ padding: "8px 12px", fontSize: 9 }} onClick={() => draftRenewal(x)}>{t("Draft email to vendor")}</button>}
                {["TEST_REPLACEMENT", "EXIT"].includes(x.decision) && <a className="btn" style={{ padding: "8px 12px", fontSize: 9, textDecoration: "none" }} href="#trials" onClick={(e) => { e.preventDefault(); document.getElementById("trials")?.scrollIntoView({ behavior: "smooth" }); }}>{t("Replacement trial ↓")}</a>}
                <button className="btn ghost" style={{ padding: "8px 12px", fontSize: 9 }} onClick={() => { setQbrVendor(x.vendorId); document.getElementById("qbr")?.scrollIntoView({ behavior: "smooth" }); }}>{t("Quarterly review")}</button>
                <button className="btn ghost" style={{ padding: "8px 12px", fontSize: 9 }} onClick={() => { setRfpVendor(x.vendorId); document.getElementById("rfp")?.scrollIntoView({ behavior: "smooth" }); }}>{t("Replacement RFP")}</button>
              </div>
            </div>
          ))}

          <Trials data={data} busy={busy} act={act} />

          <div id="qbr" className="section-title" style={{ fontSize: 12, margin: "24px 0 12px" }}>{t("Quarterly business review")}</div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <select style={{ width: "auto" }} value={qbrVendor} onChange={(e) => setQbrVendor(e.target.value)}>
              {data.decisions.map((x: any) => <option key={x.vendorId} value={x.vendorId}>{N(x.vendor)}</option>)}
            </select>
            <select style={{ width: "auto" }} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              {data.quarters.map((q: string) => <option key={q} value={q}>{q === "2026-Q2" ? t("Q2 2026 (to date)") : t("Q1 2026")}</option>)}
            </select>
            <button className="btn ghost" onClick={() => setPrinting("qbr")}>{t("Print / PDF")}</button>
            <button className="btn" disabled={busy === "qbr"} onClick={async () => { const r = await act({ action: "QBR_DRAFT", vendorId: qbrVendor, quarter }, "qbr"); if (r) { setNote(r.drafted ? null : t("A draft for this review already exists.")); openDrafts(); } }}>{t("Draft cover email to vendor")}</button>
          </div>
          {qbr && (
            <div className={`doc${printing === "qbr" ? " print-area" : ""}`}>
              <h3>{t("Quarterly business review")} — {N(qbr.vendor)}</h3>
              <div className="muted">{qbr.quarterLabel} · {t("generated")} {qbr.generated}</div>
              <h4>{t("Summary")}</h4><ul>{qbr.summary.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
              <h4>{t("Results")}</h4>
              <table className="rd-table">
                <thead><tr><th>{t("Metric")}</th><th className="num">{t("This quarter")}</th><th className="num">{t("Previous")}</th><th className="num">{t("Benchmark")}</th></tr></thead>
                <tbody>{qbr.kpis.map((r: any) => <tr key={r.metric}><td>{r.metric}</td><td className={`num ${r.better === true ? "ok" : r.better === false ? "bad" : ""}`}>{r.current}</td><td className="num">{r.previous}</td><td className="num">{r.benchmark}</td></tr>)}</tbody>
              </table>
              <h4>{t("Delivery")}</h4>
              <ul>
                <li>{t("Deliverables")}: {qbr.deliverables.count} · {t("on time")} {qbr.deliverables.onTimePct ?? "—"}% · {t("avg revisions")} {qbr.deliverables.avgRevisions ?? "—"}</li>
                {qbr.deliverables.late.map((x: string, i: number) => <li key={i}>{x}</li>)}
              </ul>
              <h4>{t("Verification against CRM and ad platforms")}</h4><ul>{qbr.verification.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
              <h4>{t("Incrementality")}</h4><ul><li>{qbr.incrementality}</li></ul>
              <h4>{t("Billing")}</h4>
              <ul><li>{t("Invoiced this quarter")}: {k(qbr.billing.invoicedK)}</li>{qbr.billing.issues.map((s: string, i: number) => <li key={i} className="bad">{s}</li>)}{qbr.billing.issues.length === 0 && <li>{t("No billing anomalies.")}</li>}</ul>
              <h4>{t("Recommendation and asks")}</h4>
              <ul><li><b>{qbr.decision.headline}</b> ({t("Confidence")}: {CONF[qbr.decision.confidence]}) — {qbr.decision.nextStep}</li>{qbr.asks.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}

          <div id="rfp" className="section-title" style={{ fontSize: 12, margin: "24px 0 12px" }}>{t("Replacement brief / RFP")}</div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <select style={{ width: "auto" }} value={rfpVendor} onChange={(e) => setRfpVendor(e.target.value)}>
              {data.decisions.map((x: any) => <option key={x.vendorId} value={x.vendorId}>{N(x.vendor)} — {t(DECISION_LABEL[x.decision])}</option>)}
            </select>
            <button className="btn ghost" onClick={() => { try { navigator.clipboard.writeText(rfp?.text ?? ""); setNote(t("RFP copied.")); } catch {} }}>{t("Copy text")}</button>
            <button className="btn ghost" onClick={() => setPrinting("rfp")}>{t("Print / PDF")}</button>
            <button className="btn" disabled={busy === "rfp" || !rfp?.benchVendors.length} title={rfp && !rfp.benchVendors.length ? t("No alternative vendors in this channel yet") : ""}
              onClick={async () => { const r = await act({ action: "SEND_RFP", vendorId: rfpVendor }, "rfp"); if (r) { setNote(`${r.drafted} ${t("draft emails created — review and approve them in the assistant.")}`); openDrafts(); } }}>
              {t("Send to alternative vendors (drafts)")}{rfp ? ` (${rfp.benchVendors.length})` : ""}
            </button>
          </div>
          {rfp && (
            <div className={`doc${printing === "rfp" ? " print-area" : ""}`}>
              <h3>{rfp.title}</h3>
              <div className="muted">{t("Incumbent")}: {N(rfp.incumbent)} · {t("Alternative vendors invited")}: {rfp.benchVendors.map((b: any) => N(b.name)).join(", ") || "—"}</div>
              {rfp.sections.map((s: any) => (<div key={s.title}><h4>{s.title}</h4><ul>{s.lines.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></div>))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
