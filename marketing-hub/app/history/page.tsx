"use client";

import { Fragment, useEffect, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";

const GROUPS: [string, string][] = [["byFamily", "Channel"], ["bySeason", "Season"], ["byYear", "Year"], ["byProject", "Project"], ["byVendor", "Vendor"]];

export default function HistoryPage() {
  const { lang, t, K, M } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("byFamily");
  const [filter, setFilter] = useState({ project: "", year: "", family: "" });
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/history?lang=${lang}`).then((r) => r.json()).then((x) => { if (live) (x.error ? setError(x.error) : setData(x)); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  const rows = data ? data.rows.filter((r: any) => (!filter.project || r.projectKey === filter.project) && (!filter.year || r.year === filter.year) && (!filter.family || r.family === filter.family)) : [];
  const uniq = (k: string, lab: string) => data ? [...new Map(data.rows.map((r: any) => [r[k], r[lab]])).entries()] as [string, string][] : [];
  const pct = (v: number | null, bad = 2.5, good = 1.2) => v === null ? <span className="muted">—</span> : <span className={v > bad ? "bad" : v <= good ? "ok" : ""}>{v}%</span>;

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Campaign history")}</div>
      <p className="intro">{t("Every campaign you ran from 2023 to 2025 — spend, leads, contracts and sales — with what each one taught us. The director uses this history as the benchmark for today's campaigns and for the daily recommendations.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
      {data && (
        <>
          <div className="kpis">
            <Kpi v={String(data.total.campaigns)} l={t("Past campaigns")} d={`${data.total.from} → ${data.total.to}`} />
            <Kpi v={K(data.total.spendK)} l={t("Spend")} />
            <Kpi v={M(data.total.salesM)} l={t("Sales")} d={`${data.total.contracts} ${t("contracts")}`} />
            <Kpi v={`${data.total.costToSalesPct}%`} l={t("Cost to sales")} />
            <Kpi v={`${data.total.qualPct}%`} l={t("Qualified rate")} />
          </div>

          <div className="row twocol">
            <div className="panel">
              <div className="chart-label">{t("What the history teaches")}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.7 }}>{data.lessons.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>
            </div>
            <div className="panel">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <div className="chart-label" style={{ margin: 0, flex: 1 }}>{t("Benchmarks")}</div>
                {GROUPS.map(([k, l]) => <button key={k} className={`btn ${group === k ? "" : "ghost"}`} style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => setGroup(k)}>{t(l)}</button>)}
              </div>
              <table className="dtable">
                <thead><tr><th>{t(GROUPS.find((g) => g[0] === group)![1])}</th><th className="num">{t("Campaigns")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Contracts")}</th><th className="num">{t("Cost to sales")}</th><th className="num">{t("Qualified rate")}</th></tr></thead>
                <tbody>{data[group].map((g: any) => (
                  <tr key={g.key}><td><b>{g.label}</b></td><td className="num">{g.campaigns}</td><td className="num">{K(g.spendK)}</td><td className="num">{g.contracts}</td><td className="num">{pct(g.costToSalesPct)}</td><td className="num">{g.qualPct}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
              <div className="chart-label" style={{ margin: 0, flex: 1 }}>{t("Past campaigns")} ({rows.length})</div>
              <select className="in" style={{ width: 170 }} value={filter.project} onChange={(e) => setFilter({ ...filter, project: e.target.value })}><option value="">{t("All projects")}</option>{uniq("projectKey", "project").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <select className="in" style={{ width: 110 }} value={filter.year} onChange={(e) => setFilter({ ...filter, year: e.target.value })}><option value="">{t("All years")}</option>{uniq("year", "year").map(([k]) => <option key={k} value={k}>{k}</option>)}</select>
              <select className="in" style={{ width: 170 }} value={filter.family} onChange={(e) => setFilter({ ...filter, family: e.target.value })}><option value="">{t("All channels")}</option>{data.byFamily.map((f: any) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
            </div>
            <table className="dtable">
              <thead><tr><th>{t("Campaign")}</th><th>{t("Vendor")}</th><th>{t("When")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Leads")}</th><th className="num">{t("Qualified rate")}</th><th className="num">{t("Contracts")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Cost to sales")}</th></tr></thead>
              <tbody>{rows.map((r: any) => (
                <Fragment key={r.code}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === r.code ? null : r.code)}>
                    <td><b>{r.name}</b><div className="muted" style={{ fontSize: 9 }}><span dir="ltr">{r.code}</span> · {r.channel} · {r.seasonLabel}</div></td>
                    <td>{r.vendor}</td>
                    <td style={{ whiteSpace: "nowrap" }} dir="ltr">{r.start === r.end ? r.start : `${r.start} → ${r.end}`}</td>
                    <td className="num">{K(r.spendK)}</td><td className="num">{r.leads}</td><td className="num">{r.qualPct}%</td><td className="num">{r.contracts}</td><td className="num">{M(r.salesM)}</td><td className="num">{pct(r.costToSalesPct)}</td>
                  </tr>
                  {open === r.code && (
                    <tr><td colSpan={9} style={{ background: "var(--paper)" }}>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>💡 {r.lesson}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.months.map((m: any) => `${m.month}: ${K(m.spendK)} → ${m.contracts} ${t("contracts")}`).join(" · ")}</div>
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Sample history (2023–2025). Click a campaign for its lesson and monthly figures.")}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ v, l, d }: { v: string; l: string; d?: string }) {
  return <div className="kpi"><div className="kv">{v}</div><div className="kl">{l}</div>{d && <div className="kd">{d}</div>}</div>;
}
