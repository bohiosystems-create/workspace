"use client";

import { useEffect, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useAgent, useApprover } from "../_components/useAgent";

const OUTCOME: Record<string, string> = { PROMOTE: "Promote the challenger", EXTEND: "Inconclusive — extend", KEEP_INCUMBENT: "Keep the incumbent" };

export default function BenchPage() {
  const { t, N, K, d } = useI18n();
  const { data, error, busy, act } = useAgent();
  const [savedApprover, saveApprover] = useApprover();
  const [approver, setApprover] = useState("");
  useEffect(() => setApprover(savedApprover), [savedApprover]);
  const setA = (v: string) => { setApprover(v); saveApprover(v); };

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Bench & trials")}</div>
      <p className="intro">{t("A bench of pre-vetted alternative vendors, and small paid trials against incumbents on the same brief. When a vendor is flagged for replacement or exit, the agent proposes a trial automatically; nothing is spent until a named person approves it. Trial results are read from the CRM.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}

      {data && (
        <>
          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="field" style={{ width: 220 }}><label>{t("Approving as")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => setA(e.target.value)} /></div>
            <div className="muted" style={{ flex: 1, minWidth: 220 }}>{t("Approvals and decisions are recorded in the audit trail with this name.")}</div>
          </div>

          <div className="section-title" style={{ fontSize: 12, margin: "6px 0 12px" }}>{t("Trials")}</div>
          {data.bench.trials.length === 0 && <div className="muted">{t("No trials yet.")}</div>}
          {data.bench.trials.map((x: any) => (
            <div className="dec" key={x.id}>
              <div className="dec-head">
                <b style={{ fontSize: 13 }}>{N(x.challenger)}</b><span className="muted">{t("vs")}</span><b style={{ fontSize: 13 }}>{N(x.incumbent)}</b>
                <span className="tag">{N(x.category)}</span>
                {x.origin === "AGENT" && <span className="tag">{t("proposed by the agent")}</span>}
                <div style={{ flex: 1 }} />
                <span className={`pill ${x.status === "COMPLETED" ? "healthy" : x.status === "PROPOSED" ? "fix" : x.status === "CANCELLED" ? "hold" : "live"}`}>{t(x.status)}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }} dir="auto">{x.brief}</div>
              <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{K(x.budgetK)} · {x.weeks} {t("weeks")} · CRM <span dir="ltr">{x.crmCode}</span>{x.startDate ? ` · ${t("started")} ${d(x.startDate)}` : ""}{x.approvedBy ? ` · ${t("approved by")} ${x.approvedBy}` : ""}</div>

              {x.status === "PROPOSED" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn" disabled={!approver.trim() || busy === x.id} title={!approver.trim() ? t("Enter your name") : ""} onClick={() => act({ action: "APPROVE_TRIAL", id: x.id, approver }, x.id)}>{t("Approve trial")} ({K(x.budgetK)})</button>
                  <button className="btn ghost" disabled={busy === x.id} onClick={() => act({ action: "CANCEL_TRIAL", id: x.id, approver }, x.id)}>{t("Cancel")}</button>
                </div>
              )}
              {x.status === "RUNNING" && !x.results && <div className="muted" style={{ marginTop: 10 }}>{t("Running — results appear as leads with the trial's CRM code arrive.")}</div>}

              {x.results && (
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className="dtable">
                    <thead><tr><th></th><th className="num">{t("Spend")}</th><th className="num">{t("Leads")}</th><th className="num">{t("Qualified (CRM)")}</th><th className="num">{t("Contracts")}</th><th className="num">{t("Cost / qualified lead")}</th></tr></thead>
                    <tbody>
                      {(["challenger", "incumbent"] as const).map((side) => (
                        <tr key={side}>
                          <td><b>{N(side === "challenger" ? x.challenger : x.incumbent)}</b></td>
                          <td className="num">{K(x.results[side].spendK)}</td>
                          <td className="num">{x.results[side].leads}</td>
                          <td className="num">{x.results[side].qualified}</td>
                          <td className="num">{x.results[side].contracts}</td>
                          <td className="num">{x.results[side].qualified ? Math.round((x.results[side].spendK * 1000) / x.results[side].qualified) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {x.readout && (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  {t("Challenger delivered")} <b>{x.readout.qlRatio}×</b> {t("the qualified leads per SAR")} (90%: {x.readout.qlLow}–{x.readout.qlHigh}; {t("confidence it is better")} {x.readout.confidencePct}%).
                  {" "}<b className={x.readout.outcome === "PROMOTE" ? "ok" : ""}>{t(OUTCOME[x.readout.outcome])}</b>
                  <span className="muted"> · {x.readout.source === "crm" ? t("from CRM") : t("recorded results")}</span>
                </div>
              )}
              {x.status === "COMPLETED" && (x.decision ? (
                <div className="muted" style={{ marginTop: 8 }}>{t("Decision")}: <b>{t(OUTCOME[x.decision])}</b>{x.decidedBy ? ` — ${x.decidedBy}` : ""}</div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {(["PROMOTE", "EXTEND", "KEEP_INCUMBENT"] as const).map((dc) => (
                    <button key={dc} className={dc === x.readout?.outcome ? "btn" : "btn ghost"} disabled={!approver.trim() || busy === x.id} onClick={() => act({ action: "DECIDE_TRIAL", id: x.id, decision: dc, approver }, x.id)}>{t(OUTCOME[dc])}</button>
                  ))}
                </div>
              ))}
            </div>
          ))}

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("Bench of alternative vendors")}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead><tr><th>{t("Vendor")}</th><th>{t("Channel")}</th><th>{t("Commercial terms")}</th><th>{t("Contact")}</th><th>{t("Status")}</th><th className="num">{t("Trials")}</th></tr></thead>
                <tbody>
                  {data.bench.bench.map((b: any) => (
                    <tr key={b.id}>
                      <td><b>{N(b.name)}</b></td>
                      <td>{N(b.category)}<div className="muted" style={{ fontSize: 9 }}>{N(b.model)}</div></td>
                      <td style={{ maxWidth: 320 }}>{N(b.rateNote)}</td>
                      <td>{N(b.contact)}<div className="muted" style={{ fontSize: 9 }} dir="ltr">{b.email}</div></td>
                      <td><span className={`pill ${b.status === "ACTIVE" ? "healthy" : "hold"}`}>{t(b.status === "ACTIVE" ? "Onboarded" : "On bench")}</span></td>
                      <td className="num">{b.trials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Channels without a bench vendor get a replacement RFP instead (Decisions page).")}</div>
          </div>
        </>
      )}
    </div>
  );
}
