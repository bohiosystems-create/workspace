"use client";

import { useEffect, useState } from "react";
import { KColumns, KHBars, KSpark } from "../_components/KCharts";
import { ChartView } from "../_components/ChartView";
import Header from "../_components/Header";
import MetaReview from "../_components/MetaReview";
import { useI18n } from "../_components/lang";
import { monthShort } from "@/lib/i18n";
import Blk from "../_components/Blk";

const n0 = (x: number) => x.toLocaleString("en-GB");
const dash = (x: number | null | undefined, suffix = "") => (x === null || x === undefined ? "—" : `${x}${suffix}`);

export default function MarketingPage() {
  const { lang, t, N, k: kk, m: mm, K: KK, M: MM, d: dd, dm } = useI18n();
  const [crm, setCrm] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [boards, setBoards] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true; // ignore responses that arrive after the language changed
    fetch(`/api/campaigns/boards?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => { if (live) (d.error ? setError(d.error) : setBoards(d)); })
      .catch((e) => live && setError(e.message));
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


  async function layout(body: any) {
    setBusy("layout");
    try {
      const d = await (await fetch("/api/campaigns/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang }) })).json();
      if (d.error) throw new Error(d.error);
      setBoards(d.boards); setOpen({});
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  // A change made in the chat shows here right away.
  useEffect(() => {
    const f = () => fetch(`/api/campaigns/boards?lang=${lang}`).then((r) => r.json()).then((d) => { if (!d.error) { setBoards(d); setOpen({}); } }).catch(() => {});
    window.addEventListener("campaigns-changed", f); return () => window.removeEventListener("campaigns-changed", f);
  }, [lang]);
  // Pause / resume from a campaign's dashboard, then refresh the list.
  async function campaignAct(body: any, key: string) {
    await act(body, key);
    const d = await (await fetch(`/api/campaigns/boards?lang=${lang}`)).json();
    if (!d.error) setBoards(d);
  }

  const sevOrder: Record<string, number> = { crit: 0, warn: 1, info: 2 };
  const L = boards?.layout;
  const isOpen = (c: any) => open[c.key] ?? (L?.open === "all" || (L?.open === "live" && c.status !== "past"));
  const list: any[] = boards?.campaigns ?? [];
  const shown = more ? list : list.slice(0, 16);
  const tot = boards?.totals;

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Campaigns")}</div>
      <p className="intro">
        {t("Every campaign that has run — the live 2026 campaigns (verified against Oracle cost and the CRM) and the 2023–2025 history — each with its own dashboard. Ask the assistant to change what is listed and what each dashboard shows.")}
      </p>

      {error && <div className="err">{error}</div>}
      {!boards && !error && <div className="muted"><span className="spin dark" /> {t("Loading campaigns…")}</div>}

      {boards && (
        <>
          <div className="cb-bar">
            <div className="cb-chips">
              {(["all", "live", "past"] as const).map((sc) => (
                <button key={sc} className={`chip ${L.scope === sc && !L.year ? "on" : ""}`} disabled={busy === "layout"} onClick={() => layout({ action: "OPS", ops: [{ op: "scope", scope: sc }] })}>
                  {sc === "all" ? t("All campaigns") : sc === "live" ? t("Live") : t("Past (2023–2025)")}
                </button>
              ))}
              <span className="cb-sep" />
              {boards.options.years.map((y: string) => (
                <button key={y} className={`chip ${L.year === y ? "on" : ""}`} disabled={busy === "layout"} onClick={() => layout({ action: "OPS", ops: [{ op: "year", year: L.year === y ? null : y }] })}>{y}</button>
              ))}
              {boards.filterLabels.map((f: string) => <span key={f} className="chip on">{f}</span>)}
              {boards.filterLabels.length > 0 && <button className="chip" onClick={() => layout({ action: "OPS", ops: [{ op: "clear_filters" }] })}>✕ {t("Clear filters")}</button>}
            </div>
            <div className="cb-chips">
              <span className="muted" style={{ fontSize: 11 }}>{t("Order")}</span>
              <select style={{ width: "auto" }} value={`${L.sort}:${L.dir}`} disabled={busy === "layout"} onChange={(e) => { const [by, dir] = e.target.value.split(":"); layout({ action: "OPS", ops: [{ op: "sort", by, dir }] }); }}>
                {[["recent", "desc", "Most recent"], ["sales", "desc", "Sales, highest first"], ["contracts", "desc", "Contracts, most first"], ["qualified", "desc", "Qualified leads, most first"], ["spend", "desc", "Spend, highest first"], ["costToSales", "asc", "Cost to sales, best first"], ["cpql", "asc", "Cost per qualified lead, best first"], ["name", "asc", "Name"]]
                  .concat([[L.sort, L.dir, boards.view.sortLabel]].filter(([a, b]) => !["recent:desc", "sales:desc", "contracts:desc", "qualified:desc", "spend:desc", "costToSales:asc", "cpql:asc", "name:asc"].includes(`${a}:${b}`)))
                  .map(([by, dir, label]) => <option key={`${by}:${dir}`} value={`${by}:${dir}`}>{t(label)}</option>)}
              </select>
              <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => setOpen(Object.fromEntries(list.map((c) => [c.key, true])))}>{t("Expand all")}</button>
              <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => setOpen(Object.fromEntries(list.map((c) => [c.key, false])))}>{t("Collapse all")}</button>
              <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} disabled={busy === "layout"} onClick={() => layout({ action: "UNDO" })}>↶ {t("Undo")}</button>
              {boards.view.custom_ && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} disabled={busy === "layout"} onClick={() => layout({ action: "RESET" })}>{t("Reset to standard")}</button>}
            </div>
            <div className="cb-hint">
              <span className="rl-chev" aria-hidden="true">❯</span>
              {t("Customise with the assistant — e.g. “add cost per qualified lead to the campaign dashboards”, “add a chart of leads by city to each campaign”, “sort campaigns by cost to sales”, “only Andalus Quarter campaigns on the dashboards”.")}
            </div>
          </div>

          <div className="kpis">
            <Blk page="campaigns" id="kpi-campaigns"><Kpi v={String(tot.campaigns)} l={t("Campaigns")} d={`${tot.live} ${t("live campaigns")} · ${boards.view.scopeLabel}`} /></Blk>
            <Blk page="campaigns" id="kpi-spend"><Kpi v={tot.spendK >= 1000 ? MM(Math.round(tot.spendK / 100) / 10) : KK(n0(Math.round(tot.spendK)))} l={t("Spend")} /></Blk>
            <Blk page="campaigns" id="kpi-qualified"><Kpi v={n0(tot.qualified)} l={t("Qualified leads")} d={`${n0(tot.leads)} ${t("leads")}`} /></Blk>
            <Blk page="campaigns" id="kpi-contracts"><Kpi v={n0(tot.contracts)} l={t("Contracts")} d={`${MM(tot.salesM)} ${t("sales")}`} /></Blk>
            <Blk page="campaigns" id="kpi-cts"><Kpi v={dash(tot.costToSales, "%")} l={t("Cost-to-Sales")} /></Blk>
          </div>

          {list.length === 0 && <div className="muted" style={{ margin: "10px 0 20px" }}>{t("No campaign matches this view — ask the assistant to show all campaigns, or clear the filters.")}</div>}
          <div className="cb-list">
            {shown.map((c: any, i: number) => (
              <CampaignBoard key={c.key} c={c} i={i} kpis={boards.view.kpis} charts={boards.view.charts} open={isOpen(c)} onToggle={() => setOpen({ ...open, [c.key]: !isOpen(c) })}
                busy={busy} onAct={(body: any, key: string) => campaignAct(body, key)} />
            ))}
          </div>
          {list.length > shown.length && <button className="btn ghost" style={{ margin: "4px 0 20px" }} onClick={() => setMore(true)}>{t("Show all")} ({list.length})</button>}
        </>
      )}

      {data && (
        <>
          <Blk page="campaigns" id="orchestration"><div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 14px" }}>
            <div className="section-title" style={{ fontSize: 12 }}>{t("Orchestration")}</div>
          </div>

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
          })}</Blk>

          <Blk page="campaigns" id="alerts"><div className="section-title" style={{ fontSize: 12, margin: "22px 0 14px" }}>{t("Alerts")}</div>
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
          {data.alerts.length === 0 && <div className="muted">{t("No alerts.")}</div>}</Blk>

          {crm && (
            <Blk page="campaigns" id="crm"><div className="panel" style={{ marginTop: 18 }}>
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
            </div></Blk>
          )}

          <Blk page="campaigns" id="audit"><div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("Orchestration audit trail")}</div>
            {data.actions.length === 0 && <div className="muted">{t("No actions taken yet.")}</div>}
            {data.actions.map((a: any) => (
              <div className="logrow" key={a.id}>
                <div className="lt">{dm(a.createdAt)}</div>
                <span className="tag">{t(a.type)}</span>
                <div><b>{a.campaign}</b> — {a.detail}</div>
              </div>
            ))}
          </div></Blk>
        </>
      )}
      <Blk page="campaigns" id="meta"><MetaReview /></Blk>
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

// One campaign: header (status, name, vendor · project · channel, dates), the figures chosen from the chat, and its
// dashboard — the built-in charts chosen from the chat plus any chart added in plain words.
function CampaignBoard({ c, i, kpis, charts, open, onToggle, busy, onAct }: {
  c: any; i: number; kpis: { id: string; name: string }[]; charts: { id: string; name: string }[]; open: boolean; onToggle: () => void; busy: string | null; onAct: (body: any, key: string) => void;
}) {
  const { lang, t, K: KK, M: MM } = useI18n();
  const k = c.k, n0 = (x: number) => x.toLocaleString("en-GB");
  const sar = (x: number | null) => (x === null ? "—" : lang === "ar" ? `${n0(x)} ر.س` : `SAR ${n0(x)}`);
  const span = c.start.slice(0, 4) === c.end.slice(0, 4) ? `${monthShort(lang, c.start)} → ${monthShort(lang, c.end)} ${c.end.slice(0, 4)}` : `${monthShort(lang, c.start)} ${c.start.slice(0, 4)} → ${monthShort(lang, c.end)} ${c.end.slice(0, 4)}`;
  const over = k.costToSales !== null && k.benchmark !== null && k.costToSales > k.benchmark * 1.25, under = k.costToSales !== null && k.benchmark !== null && k.costToSales <= k.benchmark;
  const tile: Record<string, [string, string?, ("good" | "bad")?]> = {
    spend: [KK(n0(k.spendK)), k.budgetK ? `${t("of")} ${KK(n0(k.budgetK))}` : undefined],
    budget: [KK(n0(k.budgetK)), k.usedPct !== null ? `${k.usedPct}% ${t("used")}` : undefined],
    leads: [n0(k.leads), k.cpl !== null ? `${sar(k.cpl)} ${t("per lead")}` : undefined],
    qualified: [n0(k.qualified), k.qualRate !== null ? `${k.qualRate}% ${t("of leads")}` : undefined],
    qualRate: [dash(k.qualRate, "%")], viewings: [k.viewings === null ? "—" : n0(k.viewings)], reservations: [k.reservations === null ? "—" : n0(k.reservations)],
    contracts: [n0(k.contracts), k.cacK !== null ? `${KK(k.cacK)} ${t("each")}` : undefined],
    sales: [MM(k.salesM)],
    costToSales: [dash(k.costToSales, "%"), k.benchmark !== null ? `${t("benchmark")} ${k.benchmark}%` : undefined, over ? "bad" : under ? "good" : undefined],
    cpl: [sar(k.cpl)], cpql: [sar(k.cpql)], cac: [k.cacK === null ? "—" : KK(k.cacK)],
    pacing: [dash(k.pacing, "%"), k.pacing !== null ? t("100% = on plan") : t("ended"), k.pacing !== null && (k.pacing > 115 || k.pacing < 75) ? "bad" : undefined],
    benchmark: [dash(k.benchmark, "%"), k.benchmarkLabel],
  };
  const labels = c.months.map((m: any) => monthShort(lang, m.month));
  const elapsed = k.pacing ? Math.round((k.usedPct / k.pacing) * 1000) / 10 : null;
  const chart = (id: string, name: string) => {
    switch (id) {
      case "sales": return <KColumns title={name} sub="SAR M" labels={labels} values={c.months.map((m: any) => m.salesM)} unit="SAR M" decimals={1} height={150} />;
      case "spend": return <KColumns title={name} sub="SAR K" labels={labels} values={c.months.map((m: any) => m.spendK)} unit="SAR K" decimals={0} height={150} />;
      case "leads": return <ChartView spec={{ type: "grouped", title: name, metric: "leads", unit: "", groupBy: "month", labels, values: c.months.map((m: any) => m.leads), total: null, period: "", lang,
        series: [{ name: t("Leads"), values: c.months.map((m: any) => m.leads) }, { name: t("Qualified leads"), values: c.months.map((m: any) => m.qualified) }] } as any} />;
      case "funnel": return <><div className="kc-head"><span className="kc-title">{name}</span></div>
        <KHBars rows={c.funnel.map((f: any, j: number) => ({ label: f.stage, value: f.value, sub: j > 0 && c.funnel[j - 1].value ? `${Math.round((f.value / c.funnel[j - 1].value) * 100)}% ${t("of previous")}` : undefined }))} decimals={0} labelWidth="34%" /></>;
      case "benchmark": return <><div className="kc-head"><span className="kc-title">{name}</span><span className="kc-sub">{t("lower is better")}</span></div>
        {k.costToSales === null ? <div className="muted" style={{ fontSize: 11 }}>{t("No contracted sales yet.")}</div> :
          <KHBars rows={[{ label: t("This campaign"), value: k.costToSales }, ...(k.benchmark !== null ? [{ label: `${k.benchmarkLabel} · 2023–2025`, value: k.benchmark }] : [])]} unit="%" decimals={1}
            hot={(r, j) => (j === 0 && over ? t("above benchmark") : null)} best={(r, j) => (j === 0 && under ? `✓ ${t("at or below benchmark")}` : null)} labelWidth="38%" />}</>;
      case "pacing": return <><div className="kc-head"><span className="kc-title">{name}</span><span className="kc-sub">{KK(n0(k.spendK))} / {KK(n0(k.budgetK))}</span></div>
        <KHBars rows={[{ label: t("Budget spent"), value: k.usedPct ?? 0 }, ...(elapsed !== null && c.status !== "past" ? [{ label: t("Flight elapsed"), value: elapsed }] : [])]} unit="%" decimals={0} max={Math.max(100, k.usedPct ?? 0, elapsed ?? 0)} labelWidth="34%" /></>;
      default: return null;
    }
  };
  const status = c.status === "past" ? t("Ended") : c.status === "live" ? t("LIVE") : c.status === "paused" ? t("PAUSED") : t("ENDED");
  return (
    <div className={`cb-card ${open ? "open" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
      <button className="cb-head" onClick={onToggle} aria-expanded={open}>
        <span className={`pill ${c.status === "past" ? "cb-past" : c.status}`}>{status}</span>
        <span className="cb-name">
          <b>{c.name}</b>
          <span className="cb-meta">{c.code} · {c.vendor} · {c.project} · {c.channel}{c.season ? ` · ${c.season}` : ""} · {span}</span>
        </span>
        <KSpark values={c.months.map((m: any) => m.qualified)} />
        <span className="cb-chev" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div className="cb-kpis">
        {kpis.map((x) => { const [v, sub, tone] = tile[x.id] ?? ["—"]; return (
          <div key={x.id} className={`cb-kpi ${tone ?? ""}`}><div className="l">{x.name}</div><div className="v">{v}</div>{sub && <div className="s">{sub}</div>}</div>
        ); })}
      </div>
      {open && (
        <div className="cb-dash">
          {charts.map((x) => <div key={x.id} className="cb-chart">{chart(x.id, x.name)}</div>)}
          {c.custom.map((cu: any) => (
            <div key={cu.id} className="cb-chart">
              {cu.chart ? <ChartView spec={cu.chart} /> : <div className="muted" style={{ fontSize: 11 }}><b>{cu.title}</b> — {cu.error}</div>}
            </div>
          ))}
          {charts.length === 0 && c.custom.length === 0 && <div className="muted" style={{ fontSize: 11 }}>{t("No charts on the dashboards — ask the assistant to add some.")}</div>}
          <div className="cb-foot">
            {c.lesson && <div className="cb-lesson"><b>{t("Lesson")}:</b> {c.lesson}</div>}
            {c.status === "live" && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} disabled={busy === c.id} onClick={() => onAct({ action: "PAUSE", campaignId: c.id }, c.id)}>{t("Pause")}</button>}
            {c.status === "paused" && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} disabled={busy === c.id} onClick={() => onAct({ action: "RESUME", campaignId: c.id }, c.id)}>{t("Resume")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
