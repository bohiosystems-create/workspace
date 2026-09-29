"use client";

import { useEffect, useState } from "react";
import Header from "../_components/Header";

const n0 = (x: number) => x.toLocaleString("en-GB");
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
type Filter = "all" | "exceptions" | "overdue" | "pending";

export default function InvoicesPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("exceptions");
  const [disputing, setDisputing] = useState<{ id: string; note: string } | null>(null);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d.dashboard)))
      .catch((e) => setError(e.message));
  }, []);

  async function act(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d.dashboard);
      setDisputing(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
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
    <div className="shell">
      <Header />
      <div className="section-title">Supplier Invoices</div>
      <p className="intro">
        Purchase orders and supplier invoices are pulled from Oracle Procurement / Payables and reconciled
        against what each marketing vendor reported delivering. Approve clean invoices for payment, dispute
        the rest, and chase deliveries that were never invoiced. Decisions are recorded here — nothing is
        written back to Oracle.
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> Loading invoices…</div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi v={`${data.currency} ${n0(k.invoicedK)}K`} l="Invoiced" d={`${data.integration.invoices} invoices`} />
            <Kpi v={`${data.currency} ${n0(k.outstandingK)}K`} l="Outstanding" d={`${data.currency} ${n0(k.approvedK)}K approved`} />
            <Kpi v={`${data.currency} ${n0(k.overdueK)}K`} l="Overdue" alert={k.overdueK > 0} />
            <Kpi v={`${data.currency} ${n0(k.flaggedK)}K`} l="Blocked by exceptions" d={`${k.exceptions} to resolve`} alert={k.flaggedK > 0} />
            <Kpi v={`${data.currency} ${n0(k.unbilledK)}K`} l="Delivered, not invoiced" alert={k.unbilledK > 0} />
          </div>

          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            <span className={`badge ${data.integration.mode === "live" ? "solid" : ""}`}>Oracle · {data.integration.mode}</span>
            <div className="muted" style={{ flex: 1, minWidth: 220 }}>
              {data.integration.invoices} invoices · {data.integration.purchaseOrders} purchase orders
              {data.integration.lastSync
                ? ` · last sync ${new Date(data.integration.lastSync).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : ""}
              {data.integration.mode === "mock" && " · sample data shaped like the Oracle REST payloads (set ORACLE_MODE=live to connect)"}
            </div>
            <button className="btn ghost" onClick={() => act({ action: "SYNC" }, "sync")} disabled={busy === "sync"}>
              {busy === "sync" ? <><span className="spin dark" /> &nbsp;Syncing…</> : "Sync from Oracle"}
            </button>
            <button className="btn" onClick={() => act({ action: "APPROVE_CLEAN" }, "clean")} disabled={busy === "clean" || cleanCount === 0}>
              Approve {cleanCount} clean
            </button>
          </div>

          {data.unbilled.length > 0 && (
            <>
              <div className="section-title" style={{ fontSize: 12, margin: "6px 0 12px" }}>Delivered but not invoiced</div>
              {data.unbilled.map((u: any) => (
                <div className="alert warn" key={u.campaign + u.period}>
                  <div className="ai">◷</div>
                  <div style={{ flex: 1 }}>
                    <div className="at">{u.vendor} — {u.campaign}</div>
                    <div className="ad">SAR {u.deliveredK}K of {u.period} delivery has no invoice in Oracle. Chase the vendor and accrue the cost.</div>
                  </div>
                  <span className="badge">Accrue</span>
                </div>
              ))}
            </>
          )}

          <div className="panel" style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>Invoices</div>
              {(["exceptions", "pending", "overdue", "all"] as Filter[]).map((f) => (
                <button key={f} className="chip" onClick={() => setFilter(f)} style={filter === f ? { borderColor: "var(--ink)", color: "var(--ink)" } : {}}>
                  {f === "exceptions" ? "Needs attention" : f}
                </button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Invoice</th><th>Vendor / campaign</th><th>PO</th><th className="num">Invoiced</th><th className="num">Delivered</th>
                    <th>Due</th><th>Payment</th><th>Decision</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.invoiceNumber}</b>
                        <div className="muted" style={{ fontSize: 9 }}>{fmtDate(r.invoiceDate)} · {r.period}</div>
                        {r.flags.map((f: any) => (
                          <div key={f.code} style={{ fontSize: 9, marginTop: 3, color: f.severity === "crit" ? "var(--alert)" : "var(--ink-soft)" }}>
                            {f.severity === "crit" ? "! " : "◷ "}{f.text}
                          </div>
                        ))}
                      </td>
                      <td>{r.vendor}<div className="muted" style={{ fontSize: 9 }}>{r.campaign ?? "Unmapped"}</div></td>
                      <td>{r.poNumber ?? <span style={{ color: "var(--alert)" }}>none</span>}</td>
                      <td className="num">{r.amountK}K</td>
                      <td className="num">{r.deliveredK === null ? "—" : `${r.deliveredK}K`}</td>
                      <td style={r.daysOverdue > 0 ? { color: "var(--alert)" } : {}}>{fmtDate(r.dueDate)}{r.daysOverdue > 0 ? ` (+${r.daysOverdue}d)` : ""}</td>
                      <td><span className={`pill ${r.payment === "Paid" ? "healthy" : r.daysOverdue > 0 ? "weak" : "hold"}`}>{r.payment}</span></td>
                      <td>
                        {r.decision === "PENDING"
                          ? <span className="muted">{r.outstandingK > 0 ? "Pending" : "—"}</span>
                          : <span className={`pill ${r.decision === "APPROVED" ? "scale" : "review"}`}>{r.decision}</span>}
                        {r.decisionNote && <div className="muted" style={{ fontSize: 9, maxWidth: 200 }}>{r.decisionNote}</div>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.outstandingK > 0 && r.decision === "PENDING" && (
                          <>
                            <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8, marginRight: 4 }} disabled={r.blocked || busy === r.id} title={r.blocked ? "Critical exception — resolve or dispute" : ""} onClick={() => act({ action: "APPROVE", invoiceId: r.id }, r.id)}>Approve</button>
                            <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setDisputing({ id: r.id, note: r.flags.filter((f: any) => f.code !== "OVERDUE").map((f: any) => f.text).join(" ") })}>Dispute</button>
                          </>
                        )}
                        {r.decision !== "PENDING" && r.outstandingK > 0 && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === r.id} onClick={() => act({ action: "REOPEN", invoiceId: r.id }, r.id)}>Reopen</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>Nothing here.</td></tr>}
                </tbody>
              </table>
            </div>
            {disputing && (
              <div style={{ marginTop: 14 }}>
                <div className="chart-label">Reason for dispute (sent to the vendor by AP)</div>
                <textarea style={{ minHeight: 70 }} value={disputing.note} onChange={(e) => setDisputing({ ...disputing, note: e.target.value })} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={!disputing.note.trim() || busy === disputing.id} onClick={() => act({ action: "DISPUTE", invoiceId: disputing.id, note: disputing.note }, disputing.id)}>Confirm dispute</button>
                  <button className="btn ghost" onClick={() => setDisputing(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="row twocol" style={{ marginTop: 18 }}>
            <div className="panel">
              <div className="chart-label">Accounts payable by vendor</div>
              <div style={{ overflowX: "auto" }}>
                <table className="dtable">
                  <thead><tr><th>Vendor</th><th className="num">Invoiced</th><th className="num">Delivered</th><th className="num">Gap</th><th className="num">Outstanding</th><th className="num">Overdue</th></tr></thead>
                  <tbody>
                    {data.vendors.map((v: any) => (
                      <tr key={v.id}>
                        <td><b>{v.name}</b><div className="muted" style={{ fontSize: 9 }}>Oracle #{v.supplierNumber}</div></td>
                        <td className="num">{n0(v.invoicedK)}K</td>
                        <td className="num">{n0(v.deliveredK)}K</td>
                        <td className="num" style={v.varianceK > 0 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.varianceK > 0 ? "+" : ""}{v.varianceK}K</td>
                        <td className="num">{n0(v.outstandingK)}K</td>
                        <td className="num" style={v.overdueK > 0 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.overdueK ? `${v.overdueK}K` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>Gap = invoiced + delivered-not-invoiced − vendor-reported delivery. Positive = billed above delivery.</div>
            </div>

            <div className="panel">
              <div className="chart-label">Purchase order utilisation</div>
              {data.purchaseOrders.map((p: any) => (
                <div className="hbar-row" key={p.poNumber} title={`${p.vendor} · ${p.campaign ?? ""}`}>
                  <div className="hbar-name" style={{ width: 150 }}>{p.poNumber}<div style={{ fontSize: 8, textTransform: "none", letterSpacing: 0 }}>{p.campaign ?? p.vendor}</div></div>
                  <div className="hbar-track"><div className="hbar-fill" style={{ width: `${Math.min(p.utilisationPct, 100)}%`, background: p.utilisationPct > 100 ? "var(--alert)" : "var(--ink)" }} /></div>
                  <div className="hbar-v" style={{ width: 84 }}>{p.utilisationPct}% <span className="muted" style={{ fontSize: 9 }}>· {n0(p.amountK)}K</span></div>
                </div>
              ))}
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
