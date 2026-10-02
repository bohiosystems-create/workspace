"use client";

import { useEffect, useRef, useState } from "react";
import Header from "./_components/Header";
import { useI18n } from "./_components/lang";
import { useApprover, openDrafts } from "./_components/useAgent";
import { monthShort, firstSentence } from "@/lib/i18n";

const DECISION_LABEL: Record<string, string> = { RE_ENGAGE: "Re-engage", RENEGOTIATE: "Renegotiate", PERFORMANCE_PLAN: "Performance plan", TEST_REPLACEMENT: "Test replacement", EXIT: "Exit", PROMOTED: "Promoted" };

export default function DirectorPage() {
  const { lang, t, N, k, m, K, M, dm } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedApprover, saveApprover] = useApprover();
  const [approver, setApprover] = useState("");
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => setApprover(savedApprover), [savedApprover]);

  useEffect(() => {
    let live = true;
    fetch(`/api/director?lang=${lang}`).then((r) => r.json()).then((d) => { if (live) (d.error ? setError(d.error) : setData(d)); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  async function act(body: any, key: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const d = await (await fetch("/api/director", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, approver, lang: langRef.current }) })).json();
      if (d.error) throw new Error(d.error);
      setData(d);
      if (d.message) setMessage(d.message);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  const openChat = () => window.dispatchEvent(new Event("open-director"));
  const [showAllRecs, setShowAllRecs] = useState(false);
  // Draft the vendor email for a campaign recommendation, then open it in the assistant for review.
  async function draft(key: string) {
    setBusy(key); setError(null);
    try {
      const r = await (await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DRAFT", key, lang: langRef.current }) })).json();
      if (r.error) throw new Error(r.error);
      const d = await (await fetch(`/api/director?lang=${langRef.current}`)).json();
      if (!d.error) setData(d);
      openDrafts();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  const tg = data?.targets;
  const maxBar = tg ? Math.max(...tg.monthly.map((x: any) => Math.max(x.actualM, x.targetM)), 1) : 1;
  const sev: Record<string, string> = { crit: "crit", warn: "warn", info: "info" };

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("AI Assistant Director of Marketing")}</div>
      <p className="intro">{t("Your AI assistant director of marketing, built for a single marketing manager: it holds the plan to the sales targets, decides where the money goes, runs the vendors (briefs, feedback, chasing) and tells you which campaigns to change. Leads and sales stay with Kinan's agent; the director reads the CRM results and shares the plan and campaign changes with it. You only make the decisions below — nothing that spends money or contacts a vendor happens without your name on it.")}</p>
      {error && <div className="err">{error}</div>}
      {message && <div className="alert info" style={{ padding: "10px 14px", marginBottom: 12 }}>{message}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Preparing today's brief…")}</div>}

      {data && (
        <>
          <div className="panel" style={{ borderWidth: 2 }}>
            <div className="chart-label">{t("Today's brief")} · {data.asOf.slice(0, 10)}</div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{data.brief.headline}</div>
            <ul style={{ margin: "10px 0 0", paddingInlineStart: 18, fontSize: 12, lineHeight: 1.7 }}>{data.brief.bullets.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
            <div className="row twocol" style={{ marginTop: 14 }}>
              <div>
                <div className="chart-label">{t("Risks")}</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, lineHeight: 1.7 }}>{data.brief.risks.map((b: string, i: number) => <li key={i} className="bad">{b}</li>)}</ul>
              </div>
              <div>
                <div className="chart-label">{t("This week I recommend")}</div>
                <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, lineHeight: 1.7 }}>{data.brief.actions.map((b: string, i: number) => <li key={i}>{b}</li>)}</ol>
              </div>
            </div>
            <div id="campaign-recs" style={{ marginTop: 16, borderTop: "1px solid var(--ink-hairline)", paddingTop: 12 }}>
              <div className="chart-label">{t("Campaign recommendations")} ({data.campaignRecs.length})</div>
              {data.campaignRecs.length === 0 && <div className="muted">{t("No campaign changes recommended today.")}</div>}
              {data.campaignRecs.slice(0, showAllRecs ? 99 : 5).map((r: any) => (
                <div key={r.key} className={`alert ${r.severity === "crit" ? "crit" : r.severity === "warn" ? "warn" : "info"}`} style={{ padding: "8px 12px", marginBottom: 6, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}><b>{r.title}</b>{r.impactK && !/SAR|ر\.س/.test(r.title) ? <span className="muted"> · {K(r.impactK)}</span> : null}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{firstSentence(r.why)}</div>
                  </div>
                  {r.channel === "EMAIL"
                    ? <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8, flex: "none" }} disabled={busy === r.key} onClick={() => (r.state === "DRAFTED" ? openDrafts() : draft(r.key))}>{t(r.state === "DRAFTED" ? "Review draft" : "Draft email")}</button>
                    : r.href ? <a className="btn ghost" style={{ padding: "5px 10px", fontSize: 8, textDecoration: "none", flex: "none" }} href={r.href}>{t("Open")}</a> : null}
                </div>
              ))}
              {data.campaignRecs.length > 5 && <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} onClick={() => setShowAllRecs(!showAllRecs)}>{showAllRecs ? t("Show fewer") : `${t("Show all")} (${data.campaignRecs.length})`}</button>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn" onClick={openChat}>{t("Ask the director")}</button>
              <button className="btn ghost" disabled={busy === "brief"} onClick={() => act({ action: "SEND_BRIEF" }, "brief")}>{t("Send brief to Kinan's agent")}</button>
              <a className="btn ghost" style={{ textDecoration: "none" }} href="/reports">{t("Daily report")}</a>
            </div>
          </div>

          <div className="kpis" style={{ marginTop: 18 }}>
            <Kpi v={M(tg.ytdActualM)} l={t("Sales year to date (CRM)")} d={`${t("target")} ${M(tg.ytdTargetM)}`} />
            <Kpi v={`${tg.ytdPct}%`} l={t("Of target")} alert={tg.ytdPct < 90} />
            {tg.byAsset.map((x: any) => <Kpi key={x.asset} v={`${x.pct}%`} l={N(x.asset)} d={`${t("June forecast")} ${m(x.forecastNextM)} / ${m(x.targetNextM)}`} alert={(x.pct ?? 0) < 75} />)}
          </div>

          <div className="row twocol">
            <div className="panel">
              <div className="chart-label">{t("Contracted sales vs target, by month (SAR M)")}</div>
              <div className="trend">
                {tg.monthly.map((x: any) => (
                  <div className="tcol" key={x.month}>
                    <div className="tbars">
                      <div className="tbar" title={`${t("Target")} ${x.targetM}`} style={{ height: `${(x.targetM / maxBar) * 100}%`, background: "var(--ink-faint)" }} />
                      <div className="tbar" title={`${t("Actual")} ${x.actualM}`} style={{ height: `${(x.actualM / maxBar) * 100}%`, background: x.actualM < x.targetM * 0.9 ? "var(--alert)" : "var(--ink)" }} />
                    </div>
                    <div className="lv">{x.actualM}</div>
                    <div className="ly">{monthShort(lang, x.month)}</div>
                  </div>
                ))}
              </div>
              <div className="legend"><span><i style={{ background: "var(--ink-faint)" }} />{t("Target")}</span><span><i style={{ background: "var(--ink)" }} />{t("Actual (red = below 90%)")}</span></div>
            </div>

            <div className="panel">
              <div className="chart-label">{t("Waiting for your decision")} ({data.inbox.length}) · ~{data.managerMinutes} {t("min")}</div>
              {data.inbox.length === 0 && <div className="muted">{t("Nothing waiting. ")}</div>}
              {data.inbox.map((x: any, i: number) => (
                <div key={i} className={`alert ${sev[x.severity] ?? "info"}`} style={{ padding: "8px 12px", marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 12 }}>{x.title}</div>
                  <span className="muted" style={{ fontSize: 10, whiteSpace: "nowrap" }}>~{x.minutes} {t("min")}</span>
                  {x.href === "drafts"
                    ? <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} onClick={openDrafts}>{t("Review")}</button>
                    : <a className="btn ghost" style={{ padding: "5px 10px", fontSize: 8, textDecoration: "none" }} href={x.href.startsWith("#") ? undefined : x.href} onClick={(e) => { if (x.href.startsWith("#")) { e.preventDefault(); document.getElementById(x.href.slice(1))?.scrollIntoView({ behavior: "smooth" }); } }}>{t("Open")}</a>}
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ width: 220 }}><label>{t("Approving as")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); saveApprover(e.target.value); }} /></div>
            <div className="muted" style={{ flex: 1, minWidth: 220 }}>{t("Approvals below are recorded with this name and sent to Kinan with it.")}</div>
          </div>

          <div id="plan" className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div className="chart-label" style={{ margin: 0 }}>{t("Budget plan")} — {monthShort(lang, data.plan.month)} {data.plan.month.slice(0, 4)}</div>
              <span className={`pill ${data.plan.status === "APPROVED" ? "healthy" : "fix"}`}>{t(data.plan.status)}</span>
              {data.plan.approvedBy && <span className="muted">{t("approved by")} {data.plan.approvedBy}</span>}
              <div style={{ flex: 1 }} />
              {data.plan.status === "PROPOSED" && <button className="btn" disabled={!approver.trim() || busy === "plan"} title={!approver.trim() ? t("Enter your name") : ""} onClick={() => act({ action: "APPROVE_PLAN" }, "plan")}>{t("Approve plan and send to Kinan")}</button>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead><tr><th>{t("Vendor")}</th><th>{t("Decision")}</th><th className="num">{t("Last month")}</th><th className="num">{t("Proposed")}</th><th className="num">{t("Change")}</th><th className="num">{t("Expected incremental sales")}</th><th>{t("Why")}</th></tr></thead>
                <tbody>
                  {data.plan.lines.map((x: any) => {
                    const ch = x.proposedK - x.currentK;
                    return (
                      <tr key={x.vendorId}>
                        <td><b>{N(x.vendor)}</b></td>
                        <td><span className={`dec-badge ${x.decision}`} style={{ fontSize: 8, padding: "3px 7px" }}>{t(DECISION_LABEL[x.decision] ?? x.decision)}</span></td>
                        <td className="num">{k(x.currentK)}</td>
                        <td className="num"><b>{k(x.proposedK)}</b></td>
                        <td className={`num ${ch > 0 ? "ok" : ch < 0 ? "bad" : ""}`}>{ch > 0 ? "+" : ""}{Math.round(ch)}</td>
                        <td className="num">{m(x.expectedM)}</td>
                        <td style={{ fontSize: 10, color: "var(--ink-soft)", maxWidth: 300 }}>{x.rationale}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, marginTop: 10 }}>
              {t("Total")} <b>{K(data.plan.totalK)}</b> · {t("expected incremental sales")} <b>{M(data.plan.expectedM)}</b> {t("vs")} {M(data.plan.flatM)} {t("if unchanged")} (<b className="ok">+{m(data.plan.upliftM)}</b>)
              {data.plan.unallocatedK > 0 && <> · {t("held in reserve")} <b>{K(data.plan.unallocatedK)}</b> {t("(no vendor can use more profitably — fund trials or new vendors)")}</>}
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{data.plan.assumptions}</div>
          </div>

          <div className="row twocol" style={{ marginTop: 18 }}>
            <div className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div className="chart-label" style={{ margin: 0 }}>{t("Feed to Kinan (Yardi + AI agent)")}</div>
                <span className="tag" dir="ltr">agent · {data.kinan.mode}</span><span className="tag" dir="ltr">yardi · {data.kinan.yardi}</span>
                <div style={{ flex: 1 }} />
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === "retry"} onClick={() => act({ action: "RETRY" }, "retry")}>{t("Retry failed")}</button>
              </div>
              {data.kinan.outbox.length === 0 && <div className="muted">{t("Nothing sent yet.")}</div>}
              {data.kinan.outbox.map((e: any) => (
                <div className="logrow" key={e.id}>
                  <div className="lt">{dm(e.createdAt)}</div>
                  <span className={`pill ${e.status === "DELIVERED" ? "healthy" : e.status === "FAILED" ? "weak" : "hold"}`}>{t(e.status)}</span>
                  <div style={{ flex: 1 }}>
                    <b dir="ltr">{e.type}</b> <span className="muted">→ {e.target === "YARDI" ? "Yardi" : t("AI agent")}{e.mode === "mock" ? ` (${t("simulated")})` : ""}</span>
                    <div className="muted" style={{ fontSize: 10 }}>{e.summary}{e.approvedBy ? ` · ${t("approved by")} ${e.approvedBy}` : ""}{e.lastError ? ` · ${e.lastError}` : ""}</div>
                  </div>
                </div>
              ))}
              {data.kinan.mode === "mock" && <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Simulated: events are recorded but not sent. Set KINAN_MODE=webhook to deliver to Kinan's agent (see docs/kinan-integration.md).")}</div>}
            </div>

            <div className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div className="chart-label" style={{ margin: 0 }}>{t("Campaign quality from the CRM")}</div>
              </div>
              <table className="dtable">
                <thead><tr><th>{t("Campaign code")}</th><th className="num">{t("Qualified")}</th><th className="num">{t("Won")}</th><th className="num">{t("Score")}</th><th>{t("Verdict")}</th></tr></thead>
                <tbody>
                  {data.campaignQuality.map((s: any) => (
                    <tr key={s.code}>
                      <td><b dir="ltr">{s.code}</b><div className="muted" style={{ fontSize: 9 }}>{N(s.campaign)}</div></td>
                      <td className="num">{s.qualifiedRate}%</td>
                      <td className="num">{s.winRate}%</td>
                      <td className="num">{s.qualityScore}</td>
                      <td><span className={`pill ${s.verdict === "STRONGEST" ? "healthy" : s.verdict === "WEAKEST" ? "weak" : "hold"}`} style={{ display: "inline-block" }}>{t(s.verdict)}</span><div className="muted" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>{s.advice}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ v, l, d, alert }: { v: string; l: string; d?: string; alert?: boolean }) {
  return (
    <div className="kpi">
      <div className="kv" style={alert ? { color: "var(--alert)" } : {}}>{v}</div>
      <div className="kl">{l}</div>
      {d && <div className="kd">{d}</div>}
    </div>
  );
}
