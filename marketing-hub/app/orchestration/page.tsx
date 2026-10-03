"use client";

import { useEffect, useRef, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useApprover } from "../_components/useAgent";
import VendorView, { VendorDirectory } from "./vendors";
import InvoicesPanel from "../_components/InvoicesPanel";

const KIND: Record<string, string> = { MONTHLY_BRIEF: "Monthly brief", LEAD_FEEDBACK: "Lead feedback", DELIVERABLE_CHASE: "Reminder", NON_RENEWAL: "Non-renewal notice" };

export default function OrchestrationPage() {
  const { lang, t, N } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedApprover, saveApprover] = useApprover();
  const [approver, setApprover] = useState("");
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorTab, setVendorTab] = useState<"invoices" | undefined>(undefined);
  const openVendor = (id: string, tab?: "invoices") => { setVendorId(id); setVendorTab(tab); setTimeout(() => document.getElementById("vendors")?.scrollIntoView({ behavior: "smooth" }), 50); };
  const [reload, setReload] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => setApprover(savedApprover), [savedApprover]);

  useEffect(() => {
    let live = true;
    fetch(`/api/orchestration?lang=${lang}`).then((r) => r.json()).then((x) => { if (live) (x.error ? setError(x.error) : setData(x)); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);
  // Old Invoices links land here (/orchestration#invoices).
  useEffect(() => {
    if (data && typeof location !== "undefined" && location.hash === "#invoices") setTimeout(() => document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const x = await (await fetch("/api/orchestration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, approver, lang: langRef.current }) })).json();
      if (x.error) {
        // Partial batches: refresh so what did go out is shown, then report what did not.
        const fresh = await (await fetch(`/api/orchestration?lang=${langRef.current}`)).json();
        if (!fresh.error) setData(fresh);
        throw new Error(x.error);
      }
      setData(x);
      setRead({});
      setReload((n) => n + 1); // refresh an open vendor view
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  const waiting = data ? data.orders.filter((o: any) => o.status === "PROPOSED") : [];
  const routine = waiting.filter((o: any) => o.routine && o.email?.status === "DRAFT");
  const briefs = waiting.filter((o: any) => o.kind === "MONTHLY_BRIEF" && o.email?.status === "DRAFT");
  const closed = data ? data.orders.filter((o: any) => o.status === "DONE" || o.status === "CANCELLED") : [];
  const noName = !approver.trim();

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Vendors")}</div>
      <p className="intro">{t("All your vendors in one place: open a vendor to see the campaigns it ran, its invoices (approve or dispute them there), what it owes you and every email exchanged through Outlook. The director briefs each vendor from the approved plan, sends lead feedback from the CRM, chases what is late and checks results against the data; you approve every message before it goes out — routine ones in one go.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
      {data && (
        <>
          <div className="grid3" style={{ marginBottom: 18 }}>
            {[
              [t("You (marketing manager)"), t("Approve the plan, vendor messages and anything that contacts a customer."), `~${data.summary.minutes} ${t("min of your time")}`],
              [t("AI Director"), t("Plans, briefs vendors, verifies delivery and spend, chases, reports."), `${data.summary.withVendors} ${t("with vendors")}`],
              [t("Vendors"), t("Run the campaigns; receive briefs, feedback and reminders by email."), `${data.summary.activeVendors} ${t("active")}`],
              [t("Kinan's sales agent"), t("Owns leads, follow-up and sales in Yardi. The director reads the results and shares the plan."), t("See Director")],
            ].map(([h, b, f], i) => (
              <div key={i} className="panel" style={{ padding: "14px 16px" }}>
                <div className="chart-label" style={{ marginBottom: 6 }}>{h}</div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>{b}</div>
                <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{f}</div>
              </div>
            ))}
          </div>

          <div className="kpis">
            <Kpi v={String(data.summary.waiting)} l={t("Waiting for you")} d={`${data.summary.routineWaiting} ${t("routine")}`} />
            <Kpi v={String(data.summary.withVendors)} l={t("With vendors")} d={`${data.summary.overdue} ${t("overdue")}`} alert={data.summary.overdue > 0} />
            <Kpi v={String(data.summary.lateDeliverables)} l={t("Late deliverables")} alert={data.summary.lateDeliverables > 0} />
            <Kpi v={String(data.summary.done)} l={t("Closed")} />
            <Kpi v={`~${data.summary.minutes}`} l={t("Minutes of your time")} />
          </div>

          <div className="panel" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ width: 220 }}><label>{t("Approving as")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); saveApprover(e.target.value); }} /></div>
            <div className="muted" style={{ flex: 1, minWidth: 220 }}>
              {data.outlook.mode === "mock" ? t("Outlook is simulated: approved messages are recorded, not delivered. Set OUTLOOK_MODE=live to send.") : t("Approved messages are sent from Outlook to the vendor's account manager.")}
            </div>
          </div>

          {data.escalations.length > 0 && (
            <div style={{ marginTop: 18 }}>
              {data.escalations.map((x: any) => <div key={x.deliverableId} className="alert crit" style={{ padding: "10px 14px", marginBottom: 6 }}><b>{t("Needs you")}:</b> {x.title}</div>)}
            </div>
          )}

          {!data.planApproved && (
            <div className="alert warn" style={{ padding: "10px 14px", marginTop: 18 }}>
              {t("Vendor briefs for June are drafted once the budget plan is approved on the Director page.")} <a href="/">{t("Director")}</a>
            </div>
          )}

          <div id="vendors" style={{ marginTop: 18 }}>
            {vendorId
              ? <VendorView id={vendorId} reload={reload} onBack={() => { setVendorId(null); setVendorTab(undefined); }} act={act} busy={busy} approver={approver} initialTab={vendorTab} />
              : <VendorDirectory vendors={data.vendors} onOpen={(id: string) => openVendor(id)} />}
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div className="chart-label" style={{ margin: 0 }}>{t("Waiting for your approval")} ({waiting.length})</div>
              <div style={{ flex: 1 }} />
              {briefs.length > 1 && <>
                <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                  <input type="checkbox" checked={!!read.__briefs} onChange={(e) => setRead({ ...read, __briefs: e.target.checked })} />
                  {t("I have read the briefs")} ({briefs.length})
                </label>
                <button className="btn" disabled={noName || !read.__briefs || busy === "briefs"} title={noName ? t("Enter your name") : ""}
                  onClick={() => act({ action: "APPROVE", confirmRead: true, items: briefs.map((o: any) => ({ id: o.id, revision: o.email.revision })) }, "briefs")}>
                  {t("Approve and send all briefs")} ({briefs.length})
                </button>
              </>}
              {routine.length > 0 && <>
                <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                  <input type="checkbox" checked={!!read.__routine} onChange={(e) => setRead({ ...read, __routine: e.target.checked })} />
                  {t("I have read the routine messages")} ({routine.length})
                </label>
                <button className="btn" disabled={noName || !read.__routine || busy === "routine"} title={noName ? t("Enter your name") : ""}
                  onClick={() => act({ action: "APPROVE", confirmRead: true, items: routine.map((o: any) => ({ id: o.id, revision: o.email.revision })) }, "routine")}>
                  {t("Approve and send all routine")} ({routine.length})
                </button>
              </>}
            </div>
            {waiting.length === 0 && <div className="muted">{t("Nothing waiting.")}</div>}
            {waiting.length > 0 && <details id="queue" open={showQueue} onToggle={(e) => setShowQueue((e.target as HTMLDetailsElement).open)}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 11, marginBottom: 6 }}>▸ {showQueue ? t("Hide the messages") : t("Show the messages")} ({waiting.length})</summary>
            {waiting.map((o: any) => (
              <div className="dec" key={o.id}>
                <div className="dec-head">
                  <span className="tag">{t(KIND[o.kind] ?? o.kind)}</span>
                  {o.routine && <span className="tag">{t("routine")}</span>}
                  <b>{N(o.vendor)}</b><span>— {o.title}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 6, color: "var(--ink-soft)" }}>{o.detail}</div>
                {o.error && <div className="bad" style={{ fontSize: 11, marginTop: 6 }}>{o.error}</div>}
                {o.email && (
                  <details style={{ marginTop: 8 }} open={o.kind === "NON_RENEWAL"}>
                    <summary className="muted" style={{ cursor: "pointer", fontSize: 11 }}>▸ {t("Email")} → <span dir="ltr">{o.email.to}</span> · {o.email.language === "ar" ? "العربية" : "English"} · {t("revision")} {o.email.revision}</summary>
                    <div className="memo" dir={o.email.language === "ar" ? "rtl" : "ltr"} style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12, padding: "14px 18px" }}><b>{o.email.subject}</b>{"\n\n"}{o.email.body}</div>
                  </details>
                )}
                {o.email?.status === "DRAFT" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                      <input type="checkbox" checked={!!read[o.id]} onChange={(e) => setRead({ ...read, [o.id]: e.target.checked })} />{t("I have read this message")}
                    </label>
                    <button className="btn" style={{ padding: "8px 12px", fontSize: 9 }} disabled={noName || !read[o.id] || busy === o.id} onClick={() => act({ action: "APPROVE", confirmRead: true, items: [{ id: o.id, revision: o.email.revision }] }, o.id)}>{t("Approve & send")}</button>
                    <button className="btn ghost" style={{ padding: "8px 12px", fontSize: 9 }} disabled={noName || busy === o.id} onClick={() => act({ action: "CANCEL", id: o.id }, o.id)}>{t("Cancel")}</button>
                    <span className="muted" style={{ fontSize: 10 }}>{t("To edit the wording, open it from the assistant's drafts.")}</span>
                  </div>
                )}
              </div>
            ))}
            </details>}
          </div>

          {!vendorId && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div className="chart-label" style={{ margin: 0 }}>{t("Operating rhythm — what runs without you")}</div>
                <div style={{ flex: 1 }} />
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === "run"} onClick={() => act({ action: "RUN" }, "run")}>{t("Run now")}</button>
              </div>
              {data.cadence.map((c: any, i: number) => (
                <div className="logrow" key={i}>
                  <div className="lt" style={{ width: 120 }}>{c.when}</div>
                  <div style={{ flex: 1 }}>{c.what}<div className="muted" style={{ fontSize: 10 }}>{t("next")}: {c.next}</div></div>
                </div>
              ))}
              {closed.length > 0 && <>
                <div className="chart-label" style={{ marginTop: 16 }}>{t("Closed")} ({closed.length})</div>
                {closed.slice(0, 12).map((o: any) => (
                  <div className="logrow" key={o.id}>
                    <span className={`pill ${o.status === "DONE" ? "healthy" : "hold"}`} style={{ alignSelf: "flex-start" }}>{t(o.status)}</span>
                    <div style={{ flex: 1 }}><b>{N(o.vendor)}</b> — {o.title}</div>
                  </div>
                ))}
              </>}
            </div>
          )}
          <div id="invoices" style={{ marginTop: 26 }}>
            <div className="section-title" style={{ fontSize: 12, margin: "0 0 6px" }}>{t("Supplier invoices (Oracle)")}</div>
            <p className="muted" style={{ fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.6 }}>{t("Purchase orders and invoices from Oracle, reconciled against what each vendor delivered. Approve clean invoices, dispute the rest; click a vendor to see only its invoices. Decisions are recorded here — nothing is written back to Oracle.")}</p>
            <InvoicesPanel onOpenVendor={(id) => openVendor(id, "invoices")} />
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
