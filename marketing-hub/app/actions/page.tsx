"use client";

import { useEffect, useState } from "react";
import Header from "../_components/Header";

type Filter = "active" | "sent" | "dismissed" | "all";
const TYPE_LABEL: Record<string, string> = {
  SLA_BREACH: "SLA", CONTRACT_RENEWAL: "Contract", UNDERPERFORMING: "Performance", INVOICE_EXCEPTIONS: "Invoices",
  UNBILLED: "Unbilled", OVERDUE_PAYMENT: "Payment", REALLOCATE: "Budget", SCALE_UP: "Scale",
};

export default function ActionsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; cc: string }>>({});
  const [approver, setApprover] = useState("");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { setApprover(localStorage.getItem("approver") ?? ""); } catch {}
    fetch("/api/recommendations").then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setData(d))).catch((e) => setError(e.message));
  }, []);

  async function act(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const emailOf = (id: string | null) => (id && data ? data.outbox.find((e: any) => e.id === id) : null);
  const cur = (e: any) => edits[e.id] ?? { subject: e.subject, body: e.body, cc: e.cc };
  const dirty = (e: any) => { const c = edits[e.id]; return !!c && (c.subject !== e.subject || c.body !== e.body || c.cc !== e.cc); };
  const setEdit = (e: any, patch: any) => setEdits({ ...edits, [e.id]: { ...cur(e), ...patch } });

  const recs = data ? data.recommendations.filter((r: any) => filter === "all" || (filter === "active" ? r.state === "OPEN" || r.state === "DRAFTED" : r.state.toLowerCase() === filter)) : [];
  const count = (s: string) => (data ? data.recommendations.filter((r: any) => r.state === s).length : 0);
  const mode = data?.integration;
  const sendLabel = !mode ? "Approve & send" : mode.mode === "mock" ? "Approve & simulate send" : mode.delivery === "draft" ? "Approve & save to Outlook drafts" : "Approve & send via Outlook";

  return (
    <div className="shell">
      <Header />
      <div className="section-title">Recommendations</div>
      <p className="intro">
        The agent reads vendor performance and Oracle invoice reconciliation and proposes what to do next. For
        anything that needs the vendor, it drafts the email — but nothing is ever sent without a named person
        reviewing the exact text and approving it here.
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> Analysing vendors…</div>}

      {data && (
        <>
          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            <span className={`badge ${mode.mode === "live" ? "solid" : ""}`}>Outlook · {mode.mode}</span>
            <div className="muted" style={{ flex: 1, minWidth: 240 }}>
              {mode.mode === "mock"
                ? "Sample mode: approved emails are recorded but NOT delivered. Set OUTLOOK_MODE=live to send through Microsoft Graph."
                : `Sending from ${mode.sender} via Microsoft Graph (${mode.delivery === "draft" ? "saved to Outlook Drafts for you to send" : "sent on approval"}).`}
            </div>
            <div className="field" style={{ width: 210 }}>
              <label>Approving as</label>
              <input className="in" placeholder="Your name" value={approver} onChange={(e) => { setApprover(e.target.value); try { localStorage.setItem("approver", e.target.value); } catch {} }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {(["active", "sent", "dismissed", "all"] as Filter[]).map((f) => (
              <button key={f} className="chip" onClick={() => setFilter(f)} style={filter === f ? { borderColor: "var(--ink)", color: "var(--ink)" } : {}}>
                {f}{f === "active" ? ` · ${count("OPEN") + count("DRAFTED")}` : f !== "all" ? ` · ${count(f.toUpperCase())}` : ""}
              </button>
            ))}
          </div>

          {recs.length === 0 && <div className="muted">Nothing here.</div>}
          {recs.map((r: any) => {
            const e = emailOf(r.emailId);
            const c = e ? cur(e) : null;
            return (
              <div key={r.key} style={{ marginBottom: 12 }}>
                <div className={`alert ${r.severity}`} style={{ marginBottom: 0, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div className="at">{r.title}</div>
                    <div className="ad">{r.rationale}</div>
                    <details style={{ marginTop: 6 }}>
                      <summary className="muted" style={{ cursor: "pointer", fontSize: 10 }}>Evidence ({r.evidence.length})</summary>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 10, color: "var(--ink-soft)", lineHeight: 1.6 }}>
                        {r.evidence.map((x: string, i: number) => <li key={i}>{x}</li>)}
                      </ul>
                    </details>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className="tag">{TYPE_LABEL[r.type]}</span>
                      {r.impactK !== null && <span className="tag">SAR {r.impactK}K</span>}
                      <span className={`pill ${r.state === "SENT" ? "healthy" : r.state === "DRAFTED" ? "fix" : "hold"}`}>{r.state}</span>
                    </div>
                    {r.state === "OPEN" && r.channel === "EMAIL" && (
                      <button className="btn" style={{ padding: "8px 14px", fontSize: 9 }} disabled={busy === r.key} onClick={() => act({ action: "DRAFT", key: r.key }, r.key)}>
                        {busy === r.key ? "Drafting…" : "Draft email"}
                      </button>
                    )}
                    {r.state === "OPEN" && r.channel === "INTERNAL" && (
                      <a className="btn" style={{ padding: "8px 14px", fontSize: 9, textDecoration: "none" }} href={r.href}>Decide →</a>
                    )}
                    {r.state === "OPEN" && (
                      <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 8 }} onClick={() => act({ action: "DISMISS", key: r.key }, r.key)}>Dismiss</button>
                    )}
                    {r.state === "DISMISSED" && (
                      <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 8 }} onClick={() => act({ action: "RESTORE", key: r.key }, r.key)}>Restore</button>
                    )}
                  </div>
                </div>

                {e && c && (
                  <div className="panel" style={{ borderTop: "none" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                      <div className="chart-label" style={{ margin: 0 }}>Email to {e.vendor}</div>
                      <span className="tag">drafted by {e.drafter}</span>
                      <span className="tag">revision {e.revision}</span>
                      {e.status === "FAILED" && <span className="pill weak">Failed — retry</span>}
                    </div>

                    {e.status === "SENT" ? (
                      <>
                        <div className="muted" style={{ marginBottom: 10 }}>
                          {e.delivery === "mock" ? "Simulated (not delivered)" : e.delivery === "draft" ? "Saved to Outlook drafts" : "Sent"} to {e.to}
                          {e.cc ? ` (cc ${e.cc})` : ""} · approved by <b>{e.approvedBy}</b> · {new Date(e.sentAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="note"><b>{e.subject}</b>{"\n\n"}{e.body}</div>
                      </>
                    ) : (
                      <>
                        {e.error && <div className="err" style={{ marginTop: 0, marginBottom: 12 }}>{e.error}</div>}
                        <div className="field" style={{ marginBottom: 10 }}>
                          <label>To (vendor account manager — fixed)</label>
                          <input className="in" value={e.to} readOnly />
                        </div>
                        <div className="field" style={{ marginBottom: 10 }}>
                          <label>Cc (comma-separated)</label>
                          <input className="in" value={c.cc} onChange={(ev) => setEdit(e, { cc: ev.target.value })} />
                        </div>
                        <div className="field" style={{ marginBottom: 10 }}>
                          <label>Subject</label>
                          <input className="in" value={c.subject} onChange={(ev) => setEdit(e, { subject: ev.target.value })} />
                        </div>
                        <div className="field">
                          <label>Message</label>
                          <textarea style={{ minHeight: 260 }} value={c.body} onChange={(ev) => setEdit(e, { body: ev.target.value })} />
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                          <label style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="checkbox" checked={!!reviewed[e.id + e.revision]} onChange={(ev) => setReviewed({ ...reviewed, [e.id + e.revision]: ev.target.checked })} />
                            I have read this exact message and approve it{approver ? ` as ${approver}` : ""}
                          </label>
                          <div style={{ flex: 1 }} />
                          <button className="btn ghost" disabled={!dirty(e) || busy === e.id} onClick={() => act({ action: "UPDATE", id: e.id, ...c }, e.id)}>Save changes</button>
                          <button className="btn ghost" disabled={busy === e.id} onClick={() => act({ action: "REJECT", id: e.id, approver }, e.id)}>Reject draft</button>
                          <button className="btn" disabled={dirty(e) || !approver.trim() || !reviewed[e.id + e.revision] || busy === e.id}
                            title={dirty(e) ? "Save your changes first" : !approver.trim() ? "Enter your name above" : ""}
                            onClick={async () => { if (await act({ action: "APPROVE_SEND", id: e.id, approver, revision: e.revision }, e.id)) setFilter("sent"); }}>
                            {busy === e.id ? "Sending…" : sendLabel}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="panel" style={{ marginTop: 22 }}>
            <div className="chart-label">Outbox history</div>
            {data.outbox.length === 0 && <div className="muted">No emails drafted yet.</div>}
            {data.outbox.map((e: any) => (
              <div className="logrow" key={e.id}>
                <div className="lt">{new Date(e.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                <span className="tag">{e.status}</span>
                <div><b>{e.vendor}</b> — {e.subject}{e.approvedBy ? <span className="muted"> · approved by {e.approvedBy}{e.delivery === "mock" ? " (simulated)" : ""}</span> : ""}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
