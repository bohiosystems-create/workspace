"use client";

import { useEffect, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useAgent, useApprover } from "../_components/useAgent";
import { powerHoldout, powerGeo } from "@/lib/stats";

export default function ExperimentsPage() {
  const { t, N, k, m, lang } = useI18n();
  const { data, error, busy, act } = useAgent();
  const [approver, setApprover] = useState("");
  const [savedApprover, saveApprover] = useApprover();
  const [form, setForm] = useState({ vendorId: "", campaign: "", kind: "HOLDOUT", weeks: 6, holdoutPct: 20, weekly: 30 });

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
      <div className="section-title">{t("Incrementality")}</div>
      <p className="intro">{t("What did each vendor actually cause, versus what would have happened anyway? Controlled tests (audience holdouts and geo tests) are the gold standard; the media-mix model covers vendors that have not been tested. Results feed the fair scorecard and the renewal decisions.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}

      {data && (
        <>
          <div className="section-title" style={{ fontSize: 12, margin: "6px 0 12px" }}>{t("Tests")}</div>
          {data.incrementality.tests.map((x: any) => (
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
                  <span className="muted" style={{ fontSize: 10 }}>{t("Starting a test withholds spend from part of the audience or some regions, so it needs a named approver.")}</span>
                </div>
              )}
            </div>
          ))}

          <div className="panel" style={{ marginTop: 14 }}>
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
          </div>

          {data.incrementality.mmm && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="chart-label">{t("Media-mix model — incremental sales by channel")} ({data.incrementality.mmm.periodLabel})</div>
              <ul style={{ fontSize: 11, color: "var(--ink-soft)", margin: "0 0 12px", paddingInlineStart: 18 }}>{data.incrementality.mmm.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
              <div style={{ overflowX: "auto" }}>
                <table className="dtable">
                  <thead><tr><th>{t("Channel")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Incremental sales")}</th><th className="num">{t("90% range")}</th><th className="num">{t("Sales per SAR")}</th><th className="num">{t("CRM-attributed")}</th><th>{t("Incremental ÷ attributed")}</th><th>{t("Reliability")}</th></tr></thead>
                  <tbody>
                    {data.incrementality.mmm.channels.map((c: any) => (
                      <tr key={c.channel}>
                        <td><b>{N(c.channel)}</b>{c.caveat && <div className="muted" style={{ fontSize: 9, maxWidth: 240 }}>{c.caveat}</div>}</td>
                        <td className="num">{k(c.spendK)}</td>
                        <td className="num">{m(c.contributionM)}</td>
                        <td className="num">{c.lowM}–{c.highM}</td>
                        <td className="num">{c.salesPerSar}</td>
                        <td className="num">{c.attributedM === null ? "—" : m(c.attributedM)}</td>
                        <td style={{ minWidth: 150 }}>
                          {c.incrementalRatio === null ? "—" : (
                            <>
                              <div className="range"><div className="par" style={{ insetInlineStart: "33.3%", left: undefined }} /><div className="band" style={{ insetInlineStart: `${Math.min(100, (c.incrementalRatioLow / 3) * 100)}%`, width: `${Math.max(1, Math.min(100, ((c.incrementalRatioHigh - c.incrementalRatioLow) / 3) * 100))}%` }} /><div className="pt" style={{ insetInlineStart: `${Math.min(99, (c.incrementalRatio / 3) * 100)}%` }} /></div>
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
              <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Below 100% = the CRM over-credits the channel (some of those sales would have happened anyway); above 100% = it is under-credited (typically brand channels). The red line marks 100%.")}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
