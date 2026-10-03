"use client";

import { useEffect, useState } from "react";
import { KHBars } from "./KCharts";
import { useI18n } from "./lang";

const n0 = (x: number) => x.toLocaleString("en-GB");
type Filter = "exceptions" | "pending" | "overdue" | "all";
const FILTER_LABEL: Record<Filter, string> = { exceptions: "Needs attention", pending: "Pending", overdue: "Overdue", all: "All" };

/** Supplier invoices from Oracle with approve / dispute / reopen. With `vendor`, only that vendor's invoices, POs and
 *  deliveries (the vendor's Invoices tab); without it, every vendor (the Vendors page), where clicking a vendor opens it. */
export default function InvoicesPanel({ vendor, onOpenVendor }: { vendor?: string; onOpenVendor?: (vendorId: string) => void }) {
  const { lang, t, N, K: KK, k: kk, d, dm } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("exceptions");
  const [disputing, setDisputing] = useState<{ id: string; note: string } | null>(null);

  useEffect(() => {
    let live = true; // ignore responses that arrive after the language changed
    fetch(`/api/invoices?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => { if (live) (d.error ? setError(d.error) : setData(scope(d.dashboard))); })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  async function act(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, lang }),
      });
      const r = await res.json();
      if (r.error) throw new Error(r.error);
      setData(scope(r.dashboard));
      setDisputing(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  // One vendor: keep only its rows and recompute the headline figures from them.
  function scope(dash: any) {
    if (!vendor || !dash) return dash;
    const invoices = dash.invoices.filter((r: any) => r.vendor === vendor);
    const sum = (f: (r: any) => number) => Math.round(invoices.reduce((s: number, r: any) => s + f(r), 0) * 10) / 10;
    const unbilled = dash.unbilled.filter((u: any) => u.vendor === vendor);
    return {
      ...dash, invoices, unbilled,
      vendors: dash.vendors.filter((v: any) => v.name === vendor), purchaseOrders: dash.purchaseOrders.filter((p: any) => p.vendor === vendor),
      kpis: { invoicedK: sum((r) => r.amountK), outstandingK: sum((r) => r.outstandingK), approvedK: sum((r) => (r.decision === "APPROVED" ? r.outstandingK : 0)), overdueK: sum((r) => (r.daysOverdue > 0 ? r.outstandingK : 0)),
        flaggedK: sum((r) => (r.flags.some((f: any) => f.code !== "OVERDUE") ? r.outstandingK : 0)), exceptions: invoices.filter((r: any) => r.flags.some((f: any) => f.code !== "OVERDUE")).length, unbilledK: Math.round(unbilled.reduce((s: number, u: any) => s + u.deliveredK, 0)) },
      integration: { ...dash.integration, invoices: invoices.length, purchaseOrders: dash.purchaseOrders.filter((p: any) => p.vendor === vendor).length },
    };
  }
  const k = data?.kpis;
  const cleanCount = data
    ? data.invoices.filter((r: any) => r.decision === "PENDING" && r.outstandingK > 0 && r.flags.every((f: any) => f.code === "OVERDUE")).length
    : 0;
  const rows = data
    ? data.invoices
        .filter((r: any) => {
          const exc = r.flags.some((f: any) => f.code !== "OVERDUE");
          if (filter === "exceptions") return exc || r.daysOverdue > 0 || r.decision === "DISPUTED";
          if (filter === "overdue") return r.daysOverdue > 0;
          if (filter === "pending") return r.decision === "PENDING" && r.outstandingK > 0;
          return true;
        })
        .reverse()
    : [];

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading invoices…")}</div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi v={KK(n0(k.invoicedK))} l={t("Invoiced")} d={`${data.integration.invoices} ${t("invoices")}`} />
            <Kpi v={KK(n0(k.outstandingK))} l={t("Outstanding")} d={`${KK(n0(k.approvedK))} ${t("approved")}`} />
            <Kpi v={KK(n0(k.overdueK))} l={t("Overdue")} alert={k.overdueK > 0} />
            <Kpi v={KK(n0(k.flaggedK))} l={t("Blocked by exceptions")} d={`${k.exceptions} ${t("to resolve")}`} alert={k.flaggedK > 0} />
            <Kpi v={KK(n0(k.unbilledK))} l={t("Delivered, not invoiced")} alert={k.unbilledK > 0} />
          </div>

          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            <span className={`badge ${data.integration.mode === "live" ? "solid" : ""}`}>Oracle · {data.integration.mode}</span>
            <div className="muted" style={{ flex: 1, minWidth: 220 }}>
              {data.integration.invoices} {t("invoices")} · {data.integration.purchaseOrders} {t("purchase orders")}
              {data.integration.lastSync ? ` · ${t("last sync")} ${dm(data.integration.lastSync)}` : ""}
              {data.integration.mode === "mock" && ` · ${t("sample data shaped like the Oracle REST payloads (set ORACLE_MODE=live to connect)")}`}
            </div>
            <button className="btn ghost" onClick={() => act({ action: "SYNC" }, "sync")} disabled={busy === "sync"}>
              {busy === "sync" ? <><span className="spin dark" /> &nbsp;{t("Syncing…")}</> : t("Sync from Oracle")}
            </button>
            <button className="btn" onClick={() => act({ action: "APPROVE_CLEAN" }, "clean")} disabled={busy === "clean" || cleanCount === 0}>
              {t("Approve clean")} ({cleanCount})
            </button>
          </div>

          {data.unbilled.length > 0 && (
            <>
              <div className="section-title" style={{ fontSize: 12, margin: "6px 0 12px" }}>{t("Delivered but not invoiced")}</div>
              {data.unbilled.map((u: any) => (
                <div className="alert warn" key={u.campaign + u.period}>
                  <div className="ai">◷</div>
                  <div style={{ flex: 1 }}>
                    <div className="at">{N(u.vendor)} — {N(u.campaign)}</div>
                    <div className="ad">{KK(u.deliveredK)} · {u.period} — {t("no invoice in Oracle. Chase the vendor and accrue the cost.")}</div>
                  </div>
                  <span className="badge">{t("Accrue")}</span>
                </div>
              ))}
            </>
          )}

          <div className="panel" style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>{vendor ? `${t("Invoices")} — ${N(vendor)}` : t("Invoices")}</div>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <button key={f} className="chip" onClick={() => setFilter(f)} style={filter === f ? { borderColor: "var(--ink)", color: "var(--ink)" } : {}}>
                  {t(FILTER_LABEL[f])}
                </button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("Invoice")}</th><th>{vendor ? t("Campaign") : t("Vendor / campaign")}</th><th>{t("PO")}</th><th className="num">{t("Invoiced")}</th><th className="num">{t("Delivered")}</th>
                    <th>{t("Due")}</th><th>{t("Payment")}</th><th>{t("Decision")}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <b dir="ltr" style={{ display: "inline-block" }}>{r.invoiceNumber}</b>
                        <div className="muted" style={{ fontSize: 9 }}>{d(r.invoiceDate, { day: "2-digit", month: "short" })} · {r.period}</div>
                        {r.flags.map((f: any) => (
                          <div key={f.code} style={{ fontSize: 9, marginTop: 3, color: f.severity === "crit" ? "var(--alert)" : "var(--ink-soft)" }}>
                            {f.severity === "crit" ? "! " : "◷ "}{f.text}
                          </div>
                        ))}
                      </td>
                      <td>{vendor ? null : <>{N(r.vendor)}<br /></>}<span className={vendor ? "" : "muted"} style={vendor ? {} : { fontSize: 9 }}>{r.campaign ? N(r.campaign) : t("Unmapped")}</span></td>
                      <td dir="ltr" style={{ textAlign: "start" }}>{r.poNumber ?? <span dir="auto" style={{ color: "var(--alert)" }}>{t("none")}</span>}</td>
                      <td className="num">{kk(r.amountK)}</td>
                      <td className="num">{r.deliveredK === null ? "—" : kk(r.deliveredK)}</td>
                      <td style={r.daysOverdue > 0 ? { color: "var(--alert)" } : {}}>{d(r.dueDate, { day: "2-digit", month: "short" })}{r.daysOverdue > 0 ? ` (+${r.daysOverdue}${lang === "ar" ? " ي" : "d"})` : ""}</td>
                      <td><span className={`pill ${r.payment === "Paid" ? "healthy" : r.daysOverdue > 0 ? "weak" : "hold"}`}>{t(r.payment)}</span></td>
                      <td>
                        {r.decision === "PENDING"
                          ? <span className="muted">{r.outstandingK > 0 ? t("Pending") : "—"}</span>
                          : <span className={`pill ${r.decision === "APPROVED" ? "scale" : "review"}`}>{t(r.decision)}</span>}
                        {r.decisionNote && <div className="muted" style={{ fontSize: 9, maxWidth: 200 }}>{r.decisionNote}</div>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.outstandingK > 0 && r.decision === "PENDING" && (
                          <>
                            <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8, marginInlineEnd: 4 }} disabled={r.blocked || busy === r.id} title={r.blocked ? t("Critical exception — resolve or dispute") : ""} onClick={() => act({ action: "APPROVE", invoiceId: r.id }, r.id)}>{t("Approve")}</button>
                            <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setDisputing({ id: r.id, note: r.flags.filter((f: any) => f.code !== "OVERDUE").map((f: any) => f.text).join(" ") })}>{t("Dispute")}</button>
                          </>
                        )}
                        {r.decision !== "PENDING" && r.outstandingK > 0 && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === r.id} onClick={() => act({ action: "REOPEN", invoiceId: r.id }, r.id)}>{t("Reopen")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>{t("Nothing here.")}</td></tr>}
                </tbody>
              </table>
            </div>
            {disputing && (
              <div style={{ marginTop: 14 }}>
                <div className="chart-label">{t("Reason for dispute (sent to the vendor by AP)")}</div>
                <textarea dir="auto" style={{ minHeight: 70 }} value={disputing.note} onChange={(e) => setDisputing({ ...disputing, note: e.target.value })} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={!disputing.note.trim() || busy === disputing.id} onClick={() => act({ action: "DISPUTE", invoiceId: disputing.id, note: disputing.note }, disputing.id)}>{t("Confirm dispute")}</button>
                  <button className="btn ghost" onClick={() => setDisputing(null)}>{t("Cancel")}</button>
                </div>
              </div>
            )}
          </div>

          <div className="row twocol" style={{ marginTop: 18 }}>
            <div className="panel">
              <div className="chart-label">{vendor ? t("Accounts payable") : t("Accounts payable by vendor")}</div>
              <div style={{ overflowX: "auto" }}>
                <table className="dtable">
                  <thead><tr><th>{t("Vendor")}</th><th className="num">{t("Invoiced")}</th><th className="num">{t("Delivered")}</th><th className="num">{t("Gap")}</th><th className="num">{t("Outstanding")}</th><th className="num">{t("Overdue")}</th></tr></thead>
                  <tbody>
                    {data.vendors.map((v: any) => (
                      <tr key={v.id}>
                        <td>{onOpenVendor ? <button className="linkish" onClick={() => onOpenVendor(v.id)}><b>{N(v.name)}</b> →</button> : <b>{N(v.name)}</b>}<div className="muted" style={{ fontSize: 9 }}>Oracle #<span dir="ltr">{v.supplierNumber}</span></div></td>
                        <td className="num">{kk(n0(v.invoicedK))}</td>
                        <td className="num">{kk(n0(v.deliveredK))}</td>
                        <td className="num" style={v.varianceK > 0 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.varianceK > 0 ? "+" : ""}{kk(v.varianceK)}</td>
                        <td className="num">{kk(n0(v.outstandingK))}</td>
                        <td className="num" style={v.overdueK > 0 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.overdueK ? kk(v.overdueK) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Gap = invoiced + delivered-not-invoiced − vendor-reported delivery. Positive = billed above delivery.")}</div>
            </div>

            <div className="panel">
              <div className="chart-label">{t("Purchase order utilisation")}</div>
              <KHBars rows={data.purchaseOrders.map((p: any) => ({ label: p.poNumber, value: p.utilisationPct, sub: p.campaign ? N(p.campaign) : N(p.vendor), note: kk(n0(p.amountK)) }))} unit="%" decimals={0} max={125}
                bench={{ value: 100, label: t("PO amount") }} hot={(r) => (r.value > 100 ? t("over") : null)} labelWidth="34%" />
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
