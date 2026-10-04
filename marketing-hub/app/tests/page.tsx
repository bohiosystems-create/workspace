"use client";

import { useEffect, useState } from "react";
import { KRange } from "../_components/KCharts";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useAgent, useApprover, openDrafts } from "../_components/useAgent";
import { powerHoldout, powerGeo } from "@/lib/stats";
import Blk from "../_components/Blk";

export default function TestsPage() {
  const { t, N, k, m, lang, d } = useI18n();
  const { data, error, busy, act } = useAgent();
  const [approver, setApprover] = useState("");
  const [savedApprover, saveApprover] = useApprover();
  const [form, setForm] = useState({ vendorId: "", campaign: "", kind: "HOLDOUT", weeks: 6, holdoutPct: 20, weekly: 30 });
  const [note, setNote] = useState<string | null>(null);
  // The end-to-end demo: a timeline of what the agent did, step by step.
  const [demo, setDemo] = useState<{ running: boolean; id: string | null; steps: { title: string; detail: string }[] } | null>(null);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function runDemo() {
    const who = approver.trim() || "Demo";
    setDemo({ running: true, id: null, steps: [] });
    const push = (title: string, detail: string) => setDemo((d) => d ? { ...d, steps: [...d.steps, { title, detail }] } : d);
    const r1 = await act({ action: "DEMO_TEST", step: "create" }, "demo"); if (!r1) { setDemo((d) => d && { ...d, running: false }); return; }
    const id = r1.id as string; setDemo((d) => d && { ...d, id }); push(t("1. Design from the data"), r1.message);
    await wait(1000); const r2 = await act({ action: "DEMO_TEST", step: "email", id }, "demo"); if (r2) push(t("2. Set-up brief to the vendor"), r2.message);
    await wait(1000); const r3 = await act({ action: "DEMO_TEST", step: "approve", id, approver: who }, "demo"); if (r3) push(t("3. Approval"), r3.message);
    let r: any = null;
    do { await wait(700); r = await act({ action: "DEMO_TEST", step: "week", id }, "demo"); if (r) push(`${t("4. Weekly results")} · ${r.weeksDone}/${r.weeks}`, r.message); } while (r && !r.completed);
    setDemo((d) => d && { ...d, running: false });
  }
  const demoTest = demo?.id ? data?.incrementality.tests.find((x: any) => x.id === demo.id) : null;
  async function designFromCandidate(c: any, email: boolean) {
    const r = await act({ action: "CREATE_TEST", vendorId: c.vendorId, campaign: c.campaign, kind: c.kind, weeks: c.design.weeks, holdoutPct: c.design.holdoutPct }, `cand-${c.vendorId}`);
    if (!r?.id) return;
    if (email) { const e = await act({ action: "DRAFT_TEST_EMAIL", id: r.id }, `cand-${c.vendorId}`); if (e) { setNote(t("Set-up brief drafted — review and approve it in the assistant's drafts.")); openDrafts(); } }
    document.getElementById("tests-list")?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => setApprover(savedApprover), [savedApprover]);
  useEffect(() => {
    if (!data || form.vendorId) return;
    const v = data.vendorOptions.find((x: any) => !data.incrementality.tests.some((tt: any) => tt.vendorId === x.id)) ?? data.vendorOptions[0];
    if (v) pick(v.id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(vendorId: string) {
    const v = data.vendorOptions.find((x: any) => x.id === vendorId);
    const camps = data.campaigns.filter((c: any) => c.vendorId === vendorId);
    const c = camps[0];
    const digital = camps.some((x: any) => x.digital);
    const s = data.scores.find((x: any) => x.vendorId === vendorId);
    setForm({ vendorId, campaign: c?.name ?? v?.campaigns[0] ?? "", kind: digital ? "HOLDOUT" : "GEO", weeks: 6, holdoutPct: 20, weekly: Math.max(1, Math.round((digital ? s?.qualified ?? 30 : (c?.verified.leads ?? 40) / 2) / 21.6)) });
  }
  const mde = form.kind === "HOLDOUT" ? powerHoldout(form.weekly, form.holdoutPct, form.weeks) : powerGeo(form.weekly, 0.1, form.weeks);

  const fmtPct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Tests")}</div>
      <p className="intro">{t("What did each vendor actually cause, versus what would have happened anyway? Controlled tests (audience holdouts and geo tests) are the gold standard; the media-mix model covers vendors that have not been tested. Results feed the fair scorecard and the renewal decisions.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}

      {data && (
        <>
          {note && <div className="alert info" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>{note}</div>}
          <Blk page="tests" id="recommended"><div className="panel" style={{ marginBottom: 14 }}>
            <div className="chart-label">{t("Recommended tests")} ({data.testPlan.candidates.length})</div>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6, lineHeight: 1.6 }}>{t("Which vendors to test now, from the data: material spend with no proof of effect, the renewal at stake first. Each comes with a ready design; the assistant can plan it and draft the set-up brief to the vendor (“design a holdout test for Tasweeq”, “email Tasweeq to set up the test”).")}</div>
            {data.testPlan.candidates.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t("Every vendor with material spend has test evidence or a test in progress.")}</div>}
            {data.testPlan.candidates.map((c: any) => (
              <div key={c.vendorId} className="tp-cand">
                <div className="b">
                  <span className="tag" style={{ marginInlineEnd: 6 }}>{t(c.kind === "HOLDOUT" ? "Audience holdout" : "Geo test")}</span><b>{N(c.vendor)}</b> <span className="muted">· {N(c.campaign)}{c.code ? <span dir="ltr"> · {c.code}</span> : null}</span>
                  <div style={{ marginTop: 4 }}><b>{t("Why")}:</b> {c.why}</div>
                  <div className="muted" style={{ marginTop: 2 }}><b>{t("At stake")}:</b> {c.stake}</div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>{c.designText}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
                  <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!!busy} onClick={() => designFromCandidate(c, true)}>{busy === `cand-${c.vendorId}` ? t("Thinking…") : t("Design and email the vendor")}</button>
                  <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!!busy} onClick={() => designFromCandidate(c, false)}>{t("Design this test")}</button>
                </div>
              </div>
            ))}
          </div></Blk>

          <Blk page="tests" id="demo"><div className="panel" style={{ marginBottom: 14, borderTop: "3px solid var(--ink)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0, flex: 1 }}>{t("Demo an end-to-end test")}</div>
              <button className="btn" style={{ padding: "7px 12px", fontSize: 9 }} disabled={!!busy || !!demo?.running} onClick={runDemo}>{demo?.running ? t("Running the demo…") : `▶ ${t("Demo an end-to-end test")}`}</button>
              {data.incrementality.tests.some((x: any) => x.demo && !x.archived) && <button className="btn ghost" style={{ padding: "7px 12px", fontSize: 9 }} disabled={!!busy} onClick={async () => { await act({ action: "DEMO_TEST", step: "reset" }, "demo"); setDemo(null); }}>{t("Archive demo tests")}</button>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.6 }}>{t("The demo plans a test from the data, drafts the vendor's set-up brief, approves it, feeds six weeks of simulated results and closes with the readout — in about a minute. Clearly labelled “demo”.")}</div>
            {demo && (
              <div className="tp-steps">
                {demo.steps.map((s, i) => <div key={i} className="tp-step done"><div className="n">✓</div><div><div className="t">{s.title}</div><div className="d">{s.detail}</div></div></div>)}
                {demo.running && <div className="tp-step now"><div className="n">…</div><div><div className="t">{t("Running the demo…")}</div></div></div>}
                {!demo.running && demoTest?.readout && (
                  <div className="tp-step done"><div className="n">✓</div><div><div className="t">{t("5. Readout")}</div>
                    <div className="d">{t("Lift vs counterfactual")}: <b>{demoTest.readout.liftPct}%</b> (90%: {demoTest.readout.liftLowPct}% → {demoTest.readout.liftHighPct}%) · {t("Share caused by the vendor")}: <b>{fmtPct(demoTest.readout.incrementalShare)}</b> · {t("Cost per incremental result")}: <b>{demoTest.readout.costPerIncremental === null ? "—" : `${demoTest.readout.costPerIncremental.toLocaleString("en-GB")} ${lang === "ar" ? "ر.س" : "SAR"}`}</b> · <span className={demoTest.readout.significant ? "ok" : "bad"}>{demoTest.readout.significant ? t("Effect proven") : t("Not proven")}</span>. {t("Results feed the fair scorecard and the renewal decisions.")}</div></div></div>
                )}
              </div>
            )}
          </div></Blk>

          <Blk page="tests" id="tests"><div id="tests-list" className="section-title" style={{ fontSize: 12, margin: "6px 0 12px" }}>{t("Running and completed tests")}</div>
          {data.incrementality.tests.filter((x: any) => !x.archived).map((x: any) => (
            <div className="dec" key={x.id}>
              <div className="dec-head">
                <span className="tag">{t(x.kind === "HOLDOUT" ? "Audience holdout" : "Geo test")}</span>
                <b>{x.name}</b>
                <span className="muted">{N(x.vendor)} · {N(x.campaign)}</span>
                <div style={{ flex: 1 }} />
                <span className={`pill ${x.status === "COMPLETED" ? "healthy" : x.status === "RUNNING" ? "live" : "hold"}`}>{t(x.status)}</span>
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
                {x.kind === "HOLDOUT" ? `${t("Holdout")} ${x.design.holdoutPct}% · ` : x.design.test?.length ? `${t("Test regions")}: ${x.design.test.join(", ")} · ${t("Control")}: ${x.design.control.join(", ")} · ` : ""}
                {x.design.weeks} {t("weeks")} · {t("metric")}: {x.design.metric}{x.mdePct !== null ? ` · ${t("detects lifts of")} ≥ ${x.mdePct}%` : ""}{x.approvedBy ? ` · ${t("approved by")} ${x.approvedBy}` : ""}
              </div>
              {(x.design.startDate || x.design.test?.length) && (
                <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {x.design.startDate ? `${t(x.status === "PLANNED" ? "starts" : "started")} ${d(x.design.startDate)} · ${t("ends")} ${d(x.design.endDate)}` : ""}
                  {x.design.code ? <span dir="ltr"> · {x.design.code}</span> : null}
                </div>
              )}
              {x.status === "RUNNING" && (
                <div style={{ marginTop: 8 }}>
                  <div className="tp-progress"><i style={{ width: `${Math.min(100, Math.round((x.weeksDone / x.design.weeks) * 100))}%` }} /></div>
                  <div className="muted" style={{ fontSize: 10.5 }}>{t("week")} {x.weeksDone} {t("of")} {x.design.weeks} · {t("Weekly numbers arrive from the vendor's export and the CRM; the test closes itself when its weeks are done.")}</div>
                </div>
              )}
              {x.readout && (
                <div className="grid3" style={{ marginTop: 12 }}>
                  <div className="ex"><div className="l">{t("Lift vs counterfactual")}</div><div className="v">{x.readout.liftPct}%</div><div className="muted" style={{ fontSize: 9 }}>90%: {x.readout.liftLowPct}% → {x.readout.liftHighPct}%</div></div>
                  <div className="ex"><div className="l">{t("Share caused by the vendor")}</div><div className="v">{fmtPct(x.readout.incrementalShare)}</div><div className="muted" style={{ fontSize: 9 }}>90%: {fmtPct(x.readout.incrementalShareLow)} → {fmtPct(x.readout.incrementalShareHigh)}</div></div>
                  <div className="ex"><div className="l">{t("Observed vs would-have-happened")}</div><div className="v">{x.readout.observed} / {x.readout.counterfactual}</div><div className="muted" style={{ fontSize: 9 }}>{x.readout.incremental} {t("incremental")}</div></div>
                  <div className="ex"><div className="l">{t("Cost per incremental result")}</div><div className="v">{x.readout.costPerIncremental === null ? "—" : `${x.readout.costPerIncremental.toLocaleString("en-GB")} ${lang === "ar" ? "ر.س" : "SAR"}`}</div></div>
                  <div className="ex"><div className="l">{t("Verdict")}</div><div className={`v ${x.readout.significant ? "ok" : "bad"}`} style={{ fontSize: 13 }}>{x.readout.significant ? t("Effect proven") : t("Not proven")}</div><div className="muted" style={{ fontSize: 9 }}>p = {x.readout.pValue}</div></div>
                </div>
              )}
              {x.status === "PLANNED" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input className="in" style={{ width: 200 }} placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); saveApprover(e.target.value); }} />
                  <button className="btn" disabled={!approver.trim() || busy === x.id} onClick={() => act({ action: "APPROVE_TEST", id: x.id, approver }, x.id)}>{t("Approve and start test")}</button>
                  <button className="btn ghost" disabled={busy === `mail-${x.id}`} onClick={async () => { const r = await act({ action: "DRAFT_TEST_EMAIL", id: x.id }, `mail-${x.id}`); if (r) { setNote(t("Set-up brief drafted — review and approve it in the assistant's drafts.")); openDrafts(); } }}>{t("Email vendor to set up")}</button>
                  <span className="muted" style={{ fontSize: 10 }}>{t("Starting a test withholds spend from part of the audience or some regions, so it needs a named approver.")}</span>
                </div>
              )}
            </div>
          ))}</Blk>

          <Blk page="tests" id="design"><div className="panel" style={{ marginTop: 14 }}>
            <div className="chart-label">{t("Design a new test")}</div>
            <div className="grid3">
              <div className="field"><label>{t("Vendor")}</label><select value={form.vendorId} onChange={(e) => pick(e.target.value)}>{data.vendorOptions.map((v: any) => <option key={v.id} value={v.id}>{N(v.name)}</option>)}</select></div>
              <div className="field"><label>{t("Campaign")}</label><select value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })}>{(data.vendorOptions.find((v: any) => v.id === form.vendorId)?.campaigns ?? []).map((c: string) => <option key={c} value={c}>{N(c)}</option>)}</select></div>
              <div className="field"><label>{t("Type")}</label><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="HOLDOUT">{t("Audience holdout")}</option><option value="GEO">{t("Geo test")}</option></select></div>
              <div className="field"><label>{t("Weeks")}</label><input className="in" type="number" min={2} max={16} value={form.weeks} onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })} /></div>
              {form.kind === "HOLDOUT" && <div className="field"><label>{t("Holdout %")}</label><input className="in" type="number" min={5} max={50} value={form.holdoutPct} onChange={(e) => setForm({ ...form, holdoutPct: Number(e.target.value) })} /></div>}
              <div className="field"><label>{form.kind === "HOLDOUT" ? t("Qualified leads per week") : t("Leads per week in test regions")}</label><input className="in" type="number" min={1} value={form.weekly} onChange={(e) => setForm({ ...form, weekly: Number(e.target.value) })} /></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12 }}>
              {t("This design can detect a lift of")} <b className={mde !== null && mde <= 25 ? "ok" : "bad"}>{mde ?? "—"}%</b> {t("or more (90% confidence, 80% power).")} {mde !== null && mde > 25 && <span className="bad">{t("Too coarse — run longer, hold out more, or test a bigger campaign.")}</span>}
            </div>
            <button className="btn" style={{ marginTop: 12 }} disabled={!form.vendorId || !form.campaign || busy === "create"} onClick={() => act({ action: "CREATE_TEST", vendorId: form.vendorId, campaign: form.campaign, kind: form.kind, weeks: form.weeks, holdoutPct: form.holdoutPct, weeklyConversions: form.weekly, weeklyVolume: form.weekly }, "create")}>{t("Create planned test")}</button>
          </div></Blk>

          {data.incrementality.mmm && (
            <Blk page="tests" id="mmm"><div className="panel" style={{ marginTop: 18 }}>
              <div className="chart-label">{t("Media-mix model — incremental qualified leads by channel")} ({data.incrementality.mmm.periodLabel})</div>
              <ul style={{ fontSize: 11, color: "var(--ink-soft)", margin: "0 0 12px", paddingInlineStart: 18 }}>{data.incrementality.mmm.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
              <div style={{ overflowX: "auto" }}>
                <table className="dtable">
                  <thead><tr><th>{t("Channel")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Incremental qualified leads")}</th><th className="num">{t("90% range")}</th><th className="num">{t("Leads per SAR K")}</th><th className="num">{t("CRM-attributed")}</th><th>{t("Incremental ÷ attributed")}</th><th>{t("Reliability")}</th></tr></thead>
                  <tbody>
                    {data.incrementality.mmm.channels.map((c: any) => (
                      <tr key={c.channel}>
                        <td><b>{N(c.channel)}</b>{c.caveat && <div className="muted" style={{ fontSize: 9, maxWidth: 240 }}>{c.caveat}</div>}</td>
                        <td className="num">{k(c.spendK)}</td>
                        <td className="num">{c.contribution}</td>
                        <td className="num">{c.low}–{c.high}</td>
                        <td className="num">{c.leadsPerK}</td>
                        <td className="num">{c.attributed === null ? "—" : c.attributed}</td>
                        <td style={{ minWidth: 150 }}>
                          {c.incrementalRatio === null ? "—" : (
                            <>
                              <KRange lo={c.incrementalRatioLow} hi={c.incrementalRatioHigh} point={c.incrementalRatio} par={1} max={3} tone={c.reliable ? undefined : "bad"} />
                              <div className="muted" style={{ fontSize: 9 }}>{Math.round(c.incrementalRatio * 100)}% ({Math.round(c.incrementalRatioLow * 100)}–{Math.round(c.incrementalRatioHigh * 100)}%)</div>
                            </>
                          )}
                        </td>
                        <td><span className={`pill ${c.reliable ? "healthy" : "weak"}`}>{c.reliable ? t("OK") : t("Low")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Below 100% = the CRM over-credits the channel (some of those leads would have come anyway); above 100% = it is under-credited (typically brand channels). The red line marks 100%.")}</div>
            </div></Blk>
          )}
        </>
      )}
    </div>
  );
}
