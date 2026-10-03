"use client";

import { useEffect, useState } from "react";
import { KColumns, KHBars } from "../_components/KCharts";
import Header from "../_components/Header";
import MetaReview from "../_components/MetaReview";
import { useI18n } from "../_components/lang";
import { monthShort } from "@/lib/i18n";

const n0 = (x: number) => x.toLocaleString("en-GB");
const dash = (x: number | null | undefined, suffix = "") => (x === null || x === undefined ? "—" : `${x}${suffix}`);

export default function MarketingPage() {
  const { lang, t, N, k: kk, m: mm, K: KK, M: MM, d: dd, dm } = useI18n();
  const [crm, setCrm] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [narrLoading, setNarrLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ vendor: string; text: string } | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string>("all");

  useEffect(() => {
    let live = true; // ignore responses that arrive after the language changed
    setNarrative("");
    setNote(null);
    fetch(`/api/marketing?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => { if (live) (d.error ? setError(d.error) : setData(d.dashboard)); })
      .catch((e) => live && setError(e.message));
    fetch(`/api/crm?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => { if (live && !d.error) setCrm(d.dashboard); })
      .catch(() => null);
    return () => { live = false; };
  }, [lang]);

  async function syncCrm() {
    setBusy("crm");
    setError(null);
    try {
      const d = await (await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SYNC", lang }) })).json();
      if (d.error) throw new Error(d.error);
      setCrm(d.dashboard);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function post(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, lang }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function act(body: any, key: string) {
    const d = await post(body, key);
    if (d?.dashboard) setData(d.dashboard);
  }

  async function getNarrative() {
    setNarrLoading(true);
    setError(null);
    try {
      const d = await (await fetch(`/api/marketing?narrative=1&lang=${lang}`)).json();
      if (d.error) throw new Error(d.error);
      setNarrative(d.narrative);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setNarrLoading(false);
    }
  }

  async function draftNote(v: any) {
    const d = await post({ action: "VENDOR_NOTE", vendorId: v.id }, `note-${v.id}`);
    if (d?.note) setNote({ vendor: v.name, text: d.note });
  }

  const k = data?.kpis;
  const sevOrder: Record<string, number> = { crit: 0, warn: 1, info: 2 };
  const maxSales = data ? Math.max(...data.monthly.map((m: any) => m.revenueM), 1) : 1;
  const maxSpend = data ? Math.max(...data.monthly.map((m: any) => m.spendK), 1) : 1;
  const funnelMax = data ? Math.max(...data.funnel.map((f: any) => f.value), 1) : 1;
  const campaigns = data
    ? data.campaigns.filter((c: any) => vendorFilter === "all" || c.vendorId === vendorFilter)
    : [];

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Marketing & Sales")}</div>
      <p className="intro">
        {t("Every external marketing vendor, the campaigns they run per asset, and how that spend translates into leads, viewings, reservations and contracted sales — computed from the campaign register and verified against the CRM. Rule-based alerts flag SLA and contract issues; recommendations can be applied in one click and are written to an audit trail.")}
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading vendors…")}</div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi v={KK(n0(k.spendK))} l={t("Marketing Spend")} d={`${k.liveCampaigns} ${t("live campaigns")}`} />
            <Kpi v={n0(k.leads)} l={t("Leads")} />
            <Kpi v={n0(k.contracts)} l={t("Contracts")} d={`${MM(k.revenueM)} ${t("sales")}`} />
            <Kpi v={dash(k.costToSalesPct, "%")} l={t("Cost-to-Sales")} d={`${t("CAC")} ${k.cacK === null ? "—" : KK(k.cacK)}`} />
            <Kpi v={String(k.alertCount)} l={t("Alerts")} alert={k.alertCount > 0} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
            <div className="section-title" style={{ fontSize: 12 }}>{t("Orchestration")}</div>
            <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} onClick={getNarrative} disabled={narrLoading}>
              {narrLoading ? <><span className="spin dark" /> &nbsp;{t("Asking Claude…")}</> : t("AI vendor briefing")}
            </button>
          </div>
          {narrative && <div className="panel" style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>{narrative}</div>}

          {data.recommendations.length === 0 && <div className="muted" style={{ marginBottom: 14 }}>{t("No recommended actions — spend is converting within thresholds.")}</div>}
          {data.recommendations.map((r: any, i: number) => {
            const key = `rec-${i}`;
            return (
              <div className="rec" key={key}>
                <span className={`badge ${r.type === "PAUSE" ? "alert" : "solid"}`}>{r.type === "PAUSE" ? t("Pause") : t("Shift budget")}</span>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="rt">
                    {r.type === "PAUSE"
                      ? `${t("Pause")} ${N(r.campaign)} (${N(r.vendor)})`
                      : `${t("Move")} ${KK(r.amountK)} ${t("from")} ${N(r.campaign)} (${N(r.vendor)}) ${t("to")} ${N(r.toCampaign)} (${N(r.toVendor)})`}
                  </div>
                  <div className="rd">{r.rationale} {r.impact}</div>
                </div>
                <button
                  className="btn"
                  disabled={busy === key}
                  onClick={() =>
                    act(
                      r.type === "PAUSE"
                        ? { action: "PAUSE", campaignId: r.campaignId }
                        : { action: "SHIFT_BUDGET", campaignId: r.campaignId, toCampaignId: r.toCampaignId, amountK: r.amountK },
                      key
                    )
                  }
                >
                  {busy === key ? t("Applying…") : t("Apply")}
                </button>
              </div>
            );
          })}

          <div className="section-title" style={{ fontSize: 12, margin: "22px 0 14px" }}>{t("Alerts")}</div>
          {[...data.alerts].sort((a: any, b: any) => sevOrder[a.severity] - sevOrder[b.severity]).map((a: any, i: number) => (
            <div key={i} className={`alert ${a.severity}`}>
              <div className="ai">{a.severity === "crit" ? "!" : a.severity === "warn" ? "◷" : "≡"}</div>
              <div style={{ flex: 1 }}>
                <div className="at">{a.title}</div>
                <div className="ad">{a.detail}</div>
              </div>
              <span className={`badge ${a.severity === "crit" ? "alert" : ""}`}>{t(a.tag)}</span>
            </div>
          ))}
          {data.alerts.length === 0 && <div className="muted">{t("No alerts.")}</div>}

          <div className="row twocol" style={{ marginTop: 22 }}>
            <div className="panel">
              <div className="chart-label">{t("Spend vs contracted sales, by month")}</div>
              <KColumns title={t("Contracted sales")} sub="SAR M" labels={data.monthly.map((m: any) => monthShort(lang, m.month))} values={data.monthly.map((m: any) => m.revenueM)} unit="SAR M" decimals={1} height={170} />
              <div style={{ height: 14 }} />
              <KColumns title={t("Marketing spend")} sub="SAR K" labels={data.monthly.map((m: any) => monthShort(lang, m.month))} values={data.monthly.map((m: any) => m.spendK)} unit="SAR K" decimals={0} height={170} />
            </div>

            <div className="panel">
              <div className="chart-label">{t("Lead-to-contract funnel")}</div>
              <div style={{ marginTop: 8 }}>
                <KHBars rows={data.funnel.map((f: any, i: number) => ({ label: t(f.stage), value: f.value, sub: i > 0 ? `${Math.round((f.value / data.funnel[i - 1].value) * 100)}% ${t("of previous")}` : undefined }))} decimals={0} labelWidth="38%" />
              </div>
              <div className="chart-label" style={{ marginTop: 18 }}>{t("By asset — cost-to-sales")}</div>
              <KHBars rows={data.assets.map((a: any) => ({ label: N(a.asset), value: a.costToSalesPct ?? 0, sub: mm(a.revenueM) }))} unit="%" decimals={2} max={4}
                bench={{ value: 3, label: t("3% ceiling") }} hot={(r) => (r.value > 3 ? `> 3%` : null)} best={(r, i) => (i === 0 ? `✓ ${t("best")}` : null)} labelWidth="38%" />
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("Vendor scorecard")}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("Vendor")}</th><th>{t("Category")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Contracts")}</th>
                    <th className="num">{t("Sales (M)")}</th><th className="num">{t("Cost / Sales")}</th><th className="num">{t("Qual. rate")}</th>
                    <th className="num">{t("Resp. (h)")}</th><th>{t("Score")}</th><th>{t("Verdict")}</th><th>{t("Contract")}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v: any) => (
                    <tr key={v.id}>
                      <td>
                        <b>{N(v.name)}</b>
                        {v.slaBreaches.map((b: string) => <div key={b} style={{ color: "var(--alert)", fontSize: 9, marginTop: 3 }}>{b}</div>)}
                      </td>
                      <td>{N(v.category)}</td>
                      <td className="num">{kk(n0(v.spendK))} <span className="muted">({v.spendSharePct}%)</span></td>
                      <td className="num">{v.contracts}</td>
                      <td className="num">{v.revenueM}</td>
                      <td className="num" style={v.costToSalesPct === null || v.costToSalesPct > 3 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{dash(v.costToSalesPct, "%")}</td>
                      <td className="num">{dash(v.qualRatePct, "%")}</td>
                      <td className="num">{dash(v.latestRespHrs)} <span className="muted">/ {v.slaResponseHrs}</span></td>
                      <td>
                        <div className="score" title={`${t("Efficiency")} ${v.scoreParts.efficiency}/40 · ${t("Quality")} ${v.scoreParts.quality}/25 · ${t("Responsiveness")} ${v.scoreParts.responsiveness}/20 · ${t("Delivery")} ${v.scoreParts.delivery}/15`}>
                          <div className="score-track"><div className="score-fill" style={{ width: `${v.score}%`, background: v.score < 45 ? "var(--alert)" : "var(--ink)" }} /></div>
                          <b>{v.score}</b>
                        </div>
                      </td>
                      <td><span className={`pill ${v.verdict.toLowerCase()}`}>{t(v.verdict)}</span></td>
                      <td>{dd(v.contractEnd, { month: "short", year: "numeric" })}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => draftNote(v)} disabled={busy === `note-${v.id}`}>
                          {busy === `note-${v.id}` ? t("Drafting…") : t("Draft note")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 10 }}>
              {t("Score = efficiency 40 (cost-to-sales) + quality 25 (qualified rate) + responsiveness 20 (vs contract SLA) + delivery 15 (budget pacing). PR and outdoor are last-touch under-attributed.")}
            </div>
            {note && (
              <>
                <div className="chart-label" style={{ marginTop: 18 }}>{t("Draft note")} — {N(note.vendor)}</div>
                <div className="note" dir="auto">{note.text}</div>
              </>
            )}
          </div>

          {crm && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div className="chart-label" style={{ margin: 0 }}>{t("CRM verification — vendor-reported vs CRM")}</div>
                <span className="badge">{t("CRM")} · {crm.integration.mode}</span>
                <div style={{ flex: 1 }} />
                <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} onClick={syncCrm} disabled={busy === "crm"}>
                  {busy === "crm" ? t("Syncing…") : t("Sync CRM")}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 10, marginBottom: 10 }}>
                {n0(crm.integration.leads)} {t("leads on record")}
                {crm.integration.lastSync ? ` · ${t("last sync")} ${dm(crm.integration.lastSync)}` : ""}
                {` · ${crm.integration.attributionGapPct}% ${t("not attributable to a vendor campaign")}`}
                {crm.integration.mode === "mock" && ` · ${t("sample CRM data (set CRM_MODE — see docs/crm-integration.md)")}`}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>{t("Vendor")}</th><th className="num">{t("Leads reported")}</th><th className="num">{t("Leads in CRM")}</th><th className="num">{t("Gap")}</th>
                      <th className="num">{t("Contracts claimed")}</th><th className="num">{t("Won in CRM")}</th>
                      <th className="num">{t("Response reported (h)")}</th><th className="num">{t("Response in CRM (h)")}</th><th className="num">{t("Never contacted")}</th><th className="num">{t("Verified cost / sales")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crm.vendors.map((v: any) => (
                      <tr key={v.id}>
                        <td>
                          <b>{N(v.vendor)}</b>
                          {v.flags.map((f: any) => <div key={f.code} style={{ color: f.severity === "crit" ? "var(--alert)" : "var(--ink-soft)", fontSize: 9, marginTop: 3 }}>{f.severity === "crit" ? "! " : "◷ "}{f.text}</div>)}
                        </td>
                        <td className="num">{n0(v.reportedLeads)}</td>
                        <td className="num">{n0(v.crmLeads)}</td>
                        <td className="num" style={v.leadGapPct > 15 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.leadGapPct}%</td>
                        <td className="num">{v.reportedContracts}</td>
                        <td className="num">{v.crmWon}</td>
                        <td className="num">{dash(v.reportedRespHrs)}</td>
                        <td className="num" style={v.reportedRespHrs !== null && v.crmRespHrs !== null && v.crmRespHrs > v.reportedRespHrs * 1.2 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{dash(v.crmRespHrs)}</td>
                        <td className="num">{v.untouched}</td>
                        <td className="num">{dash(v.verifiedCostToSalesPct, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>{t("Campaigns")}</div>
              <select style={{ width: "auto" }} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
                <option value="all">{t("All vendors")}</option>
                {data.vendors.map((v: any) => <option key={v.id} value={v.id}>{N(v.name)}</option>)}
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("Campaign")}</th><th>{t("Vendor")}</th><th>{t("Status")}</th><th className="num">{t("Spend / Budget")}</th><th className="num">{t("Pacing")}</th>
                    <th className="num">{t("Leads")}</th><th className="num">{t("CPL (SAR)")}</th><th className="num">{t("Qual.")}</th><th className="num">{t("View.")}</th>
                    <th className="num">{t("Contracts")}</th><th className="num">{t("Sales (M)")}</th><th className="num">{t("CAC (K)")}</th><th className="num">{t("Cost / Sales")}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any) => (
                    <tr key={c.id}>
                      <td><b>{N(c.name)}</b><div className="muted" style={{ fontSize: 9 }}>{N(c.asset)} · {N(c.channel)}{c.attribution === "Weak" ? ` · ${t("weak attribution")}` : ""}</div></td>
                      <td>{N(c.vendor)}</td>
                      <td><span className={`pill ${c.status.toLowerCase()}`}>{t(c.status)}</span></td>
                      <td className="num">{c.spendK} / {kk(c.budgetK)}</td>
                      <td className="num" style={c.pacingPct !== null && (c.pacingPct > 115 || c.pacingPct < 75) ? { color: "var(--alert)" } : {}}>{dash(c.pacingPct, "%")}</td>
                      <td className="num">{n0(c.leads)}</td>
                      <td className="num">{dash(c.cplSar)}{c.cplTrendPct !== null && c.cplTrendPct > 20 ? <span style={{ color: "var(--alert)" }}> ↑</span> : ""}</td>
                      <td className="num">{c.qualified}</td>
                      <td className="num">{c.viewings}</td>
                      <td className="num">{c.contracts}</td>
                      <td className="num">{c.revenueM}</td>
                      <td className="num">{dash(c.cacK)}</td>
                      <td className="num"><span className={`pill ${c.health.toLowerCase()}`}>{dash(c.costToSalesPct, "%")}</span></td>
                      <td>
                        {c.status === "LIVE" && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === c.id} onClick={() => act({ action: "PAUSE", campaignId: c.id }, c.id)}>{t("Pause")}</button>
                        )}
                        {c.status === "PAUSED" && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === c.id} onClick={() => act({ action: "RESUME", campaignId: c.id }, c.id)}>{t("Resume")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("Orchestration audit trail")}</div>
            {data.actions.length === 0 && <div className="muted">{t("No actions taken yet.")}</div>}
            {data.actions.map((a: any) => (
              <div className="logrow" key={a.id}>
                <div className="lt">{dm(a.createdAt)}</div>
                <span className="tag">{t(a.type)}</span>
                <div><b>{a.campaign}</b> — {a.detail}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <MetaReview />
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
