"use client";

import { useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useAgent } from "../_components/useAgent";

const SOURCE: Record<string, [string, string]> = {
  VENDOR_REPORTS: ["Vendor reports", "Monthly report per campaign, in one canonical template (CSV upload or API)."],
  ADS: ["Ad accounts", "Meta, Google, Snap, TikTok — what the platforms say was actually spent and delivered."],
  CRM: ["CRM", "Every lead, its stage, first response time and deal value — the record of truth for results."],
  ORACLE: ["Oracle (purchasing & payables)", "Purchase orders and supplier invoices — the record of truth for cost."],
  OUTLOOK: ["Outlook", "Vendor emails, sent only after human approval."],
  DELIVERABLES: ["Deliverables tracker", "Due dates, delivery dates and revision rounds per vendor."],
  MMM_HISTORY: ["Media-mix history", "Weekly spend per channel and total sales, for the media-mix model."],
};
const TRUTH: [string, string][] = [
  ["Cost", "Oracle invoices + accrued delivery not yet invoiced (vendor report only as fallback)"],
  ["Leads, qualified leads, wins, sales", "CRM"],
  ["Pipeline", "CRM open opportunities, stage-weighted (qualified 10%, viewing 25%, reserved 60%)"],
  ["Response time", "CRM (first human response)"],
  ["Media delivered", "Ad platforms (checks the vendor's reported media spend)"],
  ["Deadlines and revisions", "Deliverables tracker"],
];

export default function DataPage() {
  const { t, N, k, dm, lang } = useI18n();
  const { data, error, setError, busy, act } = useAgent();
  const [result, setResult] = useState<any>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    const csv = await f.text();
    const r = await act({ action: "IMPORT_REPORT", csv, fileName: f.name }, "upload");
    if (r) setResult(r.imported);
  }
  async function template() {
    try {
      const text = await (await fetch("/api/ingest/vendor-report")).text();
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = "vendor-report-template.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) { setError(e.message); }
  }
  const pct = (a: number | null, b: number | null) => (a === null || b === null || !a ? null : Math.round(((b - a) / a) * 100));
  const Gap = ({ v }: { v: number | null }) => v === null ? <span className="muted">—</span> : <span className={Math.abs(v) > 5 ? "bad" : "ok"}>{v > 0 ? "+" : ""}{v}%</span>;

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Data sources")}</div>
      <p className="intro">{t("Every vendor's reporting, the ad accounts, the CRM and the invoices in one model — each metric taken from an independent source of truth, so vendors are no longer grading their own homework.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}

      {data && (
        <>
          <div className="panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>{t("Sources")}</div>
              <div style={{ flex: 1 }} />
              <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} disabled={busy === "ads"} onClick={() => act({ action: "SYNC_ADS" }, "ads")}>{busy === "ads" ? t("Syncing…") : t("Sync ad accounts")}</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead><tr><th>{t("Source")}</th><th>{t("Mode")}</th><th>{t("Status")}</th><th>{t("Last sync")}</th><th className="num">{t("Records")}</th><th className="num">{t("Coverage")}</th></tr></thead>
                <tbody>
                  {data.sources.map((s: any) => (
                    <tr key={s.key}>
                      <td><b>{t(SOURCE[s.key]?.[0] ?? s.key)}</b><div className="muted" style={{ fontSize: 9, maxWidth: 360 }}>{t(SOURCE[s.key]?.[1] ?? "")}</div></td>
                      <td><span className="tag" dir="ltr">{s.mode}</span></td>
                      <td><span className={`pill ${s.connected ? "healthy" : "hold"}`}>{s.connected ? t("Connected") : t("Not connected")}</span></td>
                      <td>{s.lastSync ? dm(s.lastSync) : "—"}</td>
                      <td className="num">{s.records.toLocaleString("en-GB")}</td>
                      <td className="num">{s.coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("\"mock\" = sample data in the real format. Real connections are switched on per source in the environment settings (see docs/data-sources.md).")}</div>
          </div>

          <div className="row twocol" style={{ marginTop: 18 }}>
            <div className="panel">
              <div className="chart-label">{t("Source of truth per metric")}</div>
              <table className="rd-table"><tbody>{TRUTH.map(([a, b]) => <tr key={a}><td><b>{t(a)}</b></td><td>{t(b)}</td></tr>)}</tbody></table>
            </div>
            <div className="panel">
              <div className="chart-label">{t("Upload a vendor report")}</div>
              <p className="muted" style={{ marginTop: 0 }}>{t("Vendors fill in one canonical monthly template (one row per campaign and month). Uploads are validated — unknown campaign codes and funnels that do not narrow are rejected — and replace that month's reported figures.")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn ghost" onClick={template}>{t("Download template")}</button>
                <label className="btn" style={{ cursor: "pointer" }}>
                  {busy === "upload" ? t("Importing…") : t("Upload CSV")}
                  <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
              {result && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  <b>{result.accepted}</b> {t("rows imported")} ({result.created} {t("new")}{lang === "ar" ? "، " : ", "}{result.updated} {t("updated")}){lang === "ar" ? "؛ " : "; "}<b className={result.rejected.length ? "bad" : ""}>{result.rejected.length}</b> {t("rejected")}
                  {result.rejected.length > 0 && <ul style={{ fontSize: 11 }}>{result.rejected.map((r: any) => <li key={r.line}>{t("Line")} {r.line}: {r.reason}</li>)}</ul>}
                </div>
              )}
              <div className="muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.6 }} dir="ltr">
                POST /api/ingest/ad-spend · POST /api/ingest/vendor-report · POST /api/crm/leads — header x-api-key
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("What vendors report vs independent sources")}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("Vendor")}</th>
                    <th className="num">{t("Spend reported")}</th><th className="num">{t("Ad platforms")}</th><th className="num">{t("Gap")}</th><th className="num">{t("Cost (Oracle)")}</th>
                    <th className="num">{t("Leads reported")}</th><th className="num">{t("CRM")}</th><th className="num">{t("Gap")}</th>
                    <th className="num">{t("Contracts claimed")}</th><th className="num">{t("Won (CRM)")}</th>
                    <th className="num">{t("Response reported (h)")}</th><th className="num">{t("CRM (h)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v: any) => (
                    <tr key={v.id}>
                      <td><b>{N(v.name)}</b>{v.flags.map((f: any) => <div key={f.code} className={f.severity === "crit" ? "bad" : "muted"} style={{ fontSize: 9, marginTop: 3 }}>{f.text}</div>)}</td>
                      <td className="num">{k(v.digitalReportedSpendK || v.reported.spendK)}</td>
                      <td className="num">{v.platformSpendK === null ? "—" : k(v.platformSpendK)}</td>
                      <td className="num"><Gap v={v.platformSpendK === null ? null : pct(v.digitalReportedSpendK, v.platformSpendK)} /></td>
                      <td className="num">{k(v.verified.costK)}</td>
                      <td className="num">{v.reported.leads}</td>
                      <td className="num">{v.verified.leads}</td>
                      <td className="num"><Gap v={pct(v.reported.leads, v.verified.leads)} /></td>
                      <td className="num">{v.reported.contracts}</td>
                      <td className="num">{v.verified.won}</td>
                      <td className="num">{v.reported.respHrs ?? "—"}</td>
                      <td className="num" style={v.reported.respHrs && v.verified.respHrs && v.verified.respHrs > v.reported.respHrs * 1.2 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.verified.respHrs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Spend gap compares digital media only (ad platforms cover Google, Meta, Snap and TikTok campaigns).")} {lang === "ar" ? "" : ""}</div>
          </div>
        </>
      )}
    </div>
  );
}
