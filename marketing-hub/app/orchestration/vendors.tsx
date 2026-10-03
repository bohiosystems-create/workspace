"use client";

// Vendor directory and vendor view for the Orchestration page: campaigns, invoices (Oracle), work and emails (Outlook).
import { useEffect, useState } from "react";
import { useI18n } from "../_components/lang";
import { openDrafts } from "../_components/useAgent";

const STATUS: Record<string, [string, string]> = { CURRENT: ["Current", "healthy"], BENCH: ["Alternative", "hold"], PAST: ["Past", "hold"] };
const DECISION: Record<string, string> = { RE_ENGAGE: "Re-engage", RENEGOTIATE: "Renegotiate", PERFORMANCE_PLAN: "Performance plan", TEST_REPLACEMENT: "Test a replacement", EXIT: "Exit" };
const KIND: Record<string, string> = { MONTHLY_BRIEF: "Monthly brief", LEAD_FEEDBACK: "Lead feedback", DELIVERABLE_CHASE: "Reminder", NON_RENEWAL: "Non-renewal notice" };
const DSTATE: Record<string, [string, string]> = { DUE: ["Due", "hold"], LATE: ["Late", "weak"], ON_TIME: ["Received", "healthy"], LATE_RECEIVED: ["Received late", "watch"] };
const MARK: Record<string, [string, string]> = { ok: ["✓", "pass"], late: ["!", "fail"], due: ["·", ""], wait: ["…", ""] };
const HEALTH: Record<string, string> = { Strong: "healthy", OK: "hold", Weak: "weak", Idle: "hold" };

export function VendorDirectory({ vendors, onOpen }: { vendors: any[]; onOpen: (id: string) => void }) {
  const { t, N, d, K } = useI18n();
  const [filter, setFilter] = useState<"CURRENT" | "BENCH" | "PAST" | "ALL">("CURRENT");
  const [q, setQ] = useState("");
  const rows = vendors.filter((v) => (filter === "ALL" || v.status === filter) && (!q.trim() || `${v.name} ${N(v.name)} ${v.category}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s: string) => vendors.filter((v) => s === "ALL" || v.status === s).length;
  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="chart-label" style={{ margin: 0 }}>{t("Vendors")}</div>
        <div style={{ flex: 1 }} />
        {(["CURRENT", "BENCH", "PAST", "ALL"] as const).map((s) => (
          <button key={s} className={`btn ${filter === s ? "" : "ghost"}`} style={{ padding: "5px 10px", fontSize: 8 }} onClick={() => setFilter(s)}>
            {t(s === "CURRENT" ? "Current" : s === "BENCH" ? "Alternatives" : s === "PAST" ? "Past" : "All")} ({count(s)})
          </button>
        ))}
        <input className="in" id="vendor-search" style={{ width: 180, padding: "5px 8px", fontSize: 11 }} placeholder={t("Search vendors")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="dtable" style={{ minWidth: 860 }}>
          <thead><tr>
            <th>{t("Vendor")}</th><th>{t("Score · decision")}</th><th className="num">{t("Campaigns")}</th><th className="num">{t("Spend 2026")}</th><th className="num">{t("Cost to sales")}</th>
            <th className="num">{t("Outstanding")}</th><th>{t("Work")}</th><th>{t("Emails")}</th><th />
          </tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="vrow" style={{ cursor: "pointer" }} onClick={() => onOpen(v.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(v.id); }}>
                <td><b>{N(v.name)}</b><div className="muted" style={{ fontSize: 10 }}>{N(v.category)}{v.status !== "CURRENT" ? <> · <span className={`pill ${STATUS[v.status][1]}`} style={{ display: "inline-block", fontSize: 7 }}>{t(STATUS[v.status][0])}</span></> : null}</div></td>
                <td>{v.score !== null ? <b>{v.score}</b> : <span className="muted">—</span>}{v.decision ? <div className="muted" style={{ fontSize: 10 }}>{t(DECISION[v.decision] ?? v.decision)}</div> : v.note ? <div className="muted" style={{ fontSize: 10 }}>{v.note}</div> : null}</td>
                <td className="num">{v.liveCampaigns}<div className="muted" style={{ fontSize: 10 }}>{v.pastCampaigns} {t("past")}</div></td>
                <td className="num">{v.spendK ? K(v.spendK) : "—"}</td>
                <td className="num">{v.costToSalesPct !== null ? `${v.costToSalesPct}%` : "—"}</td>
                <td className="num">{v.outstandingK ? K(v.outstandingK) : "—"}{v.invoiceIssues ? <div className="bad" style={{ fontSize: 10 }}>{v.invoiceIssues} {t("to resolve")}</div> : null}</td>
                <td style={{ fontSize: 11 }}>
                  {v.waitingForYou ? <div><b>{v.waitingForYou}</b> {t("waiting for you")}</div> : null}
                  {v.withVendor ? <div>{v.withVendor} {t("with vendor")}</div> : null}
                  {v.late ? <div className="bad">{v.late} {t("late")}</div> : null}
                  {!v.waitingForYou && !v.withVendor && !v.late ? <span className="muted">—</span> : null}
                </td>
                <td style={{ fontSize: 11 }}>{v.emails || v.drafts ? <>{v.emails} {t("sent")}{v.drafts ? ` · ${v.drafts} ${t("drafts")}` : ""}</> : <span className="muted">—</span>}{v.lastEmail ? <div className="muted" style={{ fontSize: 10 }}>{d(v.lastEmail, { day: "numeric", month: "short" })}</div> : null}</td>
                <td style={{ textAlign: "end" }}><span className="btn ghost" style={{ padding: "4px 9px", fontSize: 8 }}>{t("Open")} →</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">{t("No vendors match.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function VendorView({ id, reload, onBack, act, busy, approver }: { id: string; reload: number; onBack: () => void; act: (b: any, k: string) => Promise<void>; busy: string | null; approver: string }) {
  const { lang, t, N, d, K, M } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "campaigns" | "invoices" | "emails">("overview");
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/orchestration?vendor=${encodeURIComponent(id)}&lang=${lang}`).then((r) => r.json()).then((x) => { if (live) (x.error ? setError(x.error) : setData(x)); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [id, lang, reload]);

  if (error) return <div className="panel"><button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} onClick={onBack}>← {t("All vendors")}</button><div className="err" style={{ marginTop: 10 }}>{error}</div></div>;
  if (!data) return <div className="panel"><span className="spin dark" /> {t("Loading…")}</div>;
  const v = data.vendor, p = data.profile, c = data.campaigns, inv = data.invoices, w = data.work, mail = data.mail;
  const noName = !approver.trim();
  const tabs: [typeof tab, string][] = [["overview", t("Overview")], ["campaigns", `${t("Campaigns")} (${c.live.length + c.past.length})`], ["invoices", `${t("Invoices")} (${inv.rows.length})`], ["emails", `${t("Emails")} (${mail.messages.length})`]];

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} onClick={onBack}>← {t("All vendors")}</button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{N(v.name)}</div>
        <span className={`pill ${STATUS[v.status][1]}`}>{t(STATUS[v.status][0])}</span>
        <span className="muted" style={{ fontSize: 11 }}>{N(v.category)}{p ? ` · ${t(p.model)}` : ""}</span>
      </div>
      {(v.contact || v.email) && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{v.contact}{v.email ? <> · <span dir="ltr">{v.email}</span></> : null}{v.language ? ` · ${v.language === "ar" ? "العربية" : "English"}` : ""}{v.contractEnd ? ` · ${t("contract ends")} ${d(v.contractEnd, { day: "numeric", month: "short", year: "numeric" })}` : ""}{p?.oracleSupplier ? <> · Oracle <span dir="ltr">{p.oracleSupplier}</span></> : null}</div>}

      <div className="kpis" style={{ marginTop: 12 }}>
        <div className="kpi"><div className="kv">{p?.score ? p.score.score : "—"}</div><div className="kl">{t("Score")}</div>{p?.score && <div className="kd">{p.score.low}–{p.score.high}</div>}</div>
        <div className="kpi"><div className="kv">{v.spendK ? K(v.spendK) : "—"}</div><div className="kl">{v.status === "PAST" ? t("Spend (history)") : t("Spend 2026")}</div></div>
        <div className="kpi"><div className="kv">{v.contracts}</div><div className="kl">{t("Contracts")}</div></div>
        <div className="kpi"><div className="kv">{v.salesM ? M(v.salesM) : "—"}</div><div className="kl">{t("Sales")}</div></div>
        <div className="kpi"><div className="kv">{v.costToSalesPct !== null ? `${v.costToSalesPct}%` : "—"}</div><div className="kl">{t("Cost to sales")}</div></div>
        <div className="kpi"><div className="kv" style={inv.totals.overdueK ? { color: "var(--alert)" } : {}}>{inv.totals.outstandingK ? K(inv.totals.outstandingK) : "—"}</div><div className="kl">{t("Outstanding")}</div></div>
      </div>
      {p?.decision && <div className="alert info" style={{ padding: "10px 14px", marginTop: 10 }}><b>{p.decision.headline}</b>{p.decision.nextStep ? ` — ${p.decision.nextStep}` : ""}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0 12px", borderBottom: "1px solid var(--ink-hairline)", paddingBottom: 10 }} role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? "" : "ghost"}`} style={{ padding: "6px 12px", fontSize: 8 }} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "overview" && (
        <div className="row twocol" style={{ gap: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div className="chart-label">{t("Work orders")} ({w.orders.length})</div>
            {w.orders.length === 0 && <div className="muted">{t("No work orders.")}</div>}
            {w.orders.map((o: any) => (
              <div className="dec" key={o.id} style={o.overdue ? { borderInlineStart: "3px solid var(--alert)" } : {}}>
                <div className="dec-head"><span className="tag">{t(KIND[o.kind] ?? o.kind)}</span><span>{o.title}</span><div style={{ flex: 1 }} /><span className={`pill ${o.status === "DONE" ? "healthy" : o.overdue ? "weak" : "hold"}`}>{t(o.status === "PROPOSED" ? "Waiting for you" : o.status === "ISSUED" ? "With vendor" : o.status)}</span></div>
                {o.status === "ISSUED" && <div style={{ marginTop: 6 }}>{o.checks.map((x: any, i: number) => <div className="hurdle" key={i} style={{ padding: "4px 0" }}><div className={`check ${MARK[x.state][1]}`}>{MARK[x.state][0]}</div><div className="name">{x.label}</div></div>)}</div>}
                {o.status === "PROPOSED" && o.email?.status === "DRAFT" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}><input type="checkbox" checked={!!read[o.id]} onChange={(e) => setRead({ ...read, [o.id]: e.target.checked })} />{t("I have read this message")}</label>
                    <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={noName || !read[o.id] || busy === o.id} onClick={() => act({ action: "APPROVE", confirmRead: true, items: [{ id: o.id, revision: o.email.revision }] }, o.id)}>{t("Approve & send")}</button>
                    <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => { setTab("emails"); setOpen(o.email.id); }}>{t("Read email")}</button>
                  </div>
                )}
              </div>
            ))}
            {c.trials.length > 0 && <>
              <div className="chart-label" style={{ marginTop: 16 }}>{t("Trials")}</div>
              {c.trials.map((x: any) => <div className="logrow" key={x.id}><span className="pill hold">{t(x.status)}</span><div style={{ flex: 1 }}>{N(x.challenger)} {t("vs")} {N(x.incumbent)} · {K(x.budgetK)}{x.outcome ? ` · ${t(x.outcome)}` : ""}</div></div>)}
            </>}
            {p && (p.slaBreaches.length > 0 || p.latestRespHrs !== null) && <>
              <div className="chart-label" style={{ marginTop: 16 }}>{t("Service level")}</div>
              <div style={{ fontSize: 12 }}>{t("Response")} {p.latestRespHrs ?? "—"}h {t("vs")} {p.slaResponseHrs}h · {t("qualified")} {p.qualRatePct ?? "—"}% {t("vs")} {p.slaQualifiedPct}%</div>
              {p.slaBreaches.map((b: string, i: number) => <div key={i} className="bad" style={{ fontSize: 11 }}>• {b}</div>)}
            </>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="chart-label">{t("What this vendor owes us")} ({w.deliverables.length})</div>
            {w.deliverables.length === 0 ? <div className="muted">{t("Nothing on record.")}</div> : (
              <div style={{ overflowX: "auto" }}><table className="dtable">
                <thead><tr><th>{t("Item")}</th><th>{t("Due")}</th><th>{t("Status")}</th><th /></tr></thead>
                <tbody>{w.deliverables.map((x: any) => (
                  <tr key={x.id}><td>{x.title}{x.chases ? <div className="muted" style={{ fontSize: 9 }}>{x.chases} {t("Reminders")}</div> : null}</td><td style={{ whiteSpace: "nowrap" }}>{d(x.due)}</td>
                    <td><span className={`pill ${DSTATE[x.state][1]}`} style={{ display: "inline-block" }}>{t(DSTATE[x.state][0])}</span></td>
                    <td>{!x.deliveredAt && <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} disabled={busy === x.id} onClick={() => act({ action: "RECEIVE", id: x.id }, x.id)}>{t("Mark received")}</button>}</td></tr>
                ))}</tbody>
              </table></div>
            )}
            {p?.rateNote && <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>{t("Commercial terms")}: {p.rateNote}</div>}
          </div>
        </div>
      )}

      {tab === "campaigns" && (
        <div>
          <div className="chart-label">{t("Live campaigns (2026)")} ({c.live.length})</div>
          {c.live.length === 0 ? <div className="muted">{t("No live campaigns.")}</div> : (
            <div style={{ overflowX: "auto" }}><table className="dtable" style={{ minWidth: 760 }}>
              <thead><tr><th>{t("Campaign")}</th><th>{t("Project")}</th><th>{t("Status")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Leads")}</th><th className="num">{t("Qualified")}</th><th className="num">{t("Contracts")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Cost to sales")}</th></tr></thead>
              <tbody>{c.live.map((x: any) => (
                <tr key={x.id}><td><b>{N(x.name)}</b>{x.code && <div className="muted" style={{ fontSize: 10 }} dir="ltr">{x.code}</div>}</td><td>{N(x.project)}</td><td><span className={`pill ${HEALTH[x.health] ?? "hold"}`}>{t(x.status === "LIVE" ? "live" : x.status === "PAUSED" ? "paused" : "ended")}</span></td>
                  <td className="num">{K(x.spendK)}<div className="muted" style={{ fontSize: 9 }}>/ {K(x.budgetK)}</div></td><td className="num">{x.leads}</td><td className="num">{x.qualified}</td><td className="num">{x.contracts}</td><td className="num">{M(x.salesM)}</td><td className="num">{x.costToSalesPct !== null ? `${x.costToSalesPct}%` : "—"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          {c.meta.length > 0 && <>
            <div className="chart-label" style={{ marginTop: 16 }}>{t("Its Meta campaigns")} ({c.meta.length})</div>
            {c.meta.map((x: any, i: number) => <div className="logrow" key={i}><div style={{ flex: 1 }}>{x.name}{x.code ? <span className="muted" dir="ltr"> · {x.code}</span> : null}</div><span className="muted" style={{ fontSize: 11 }}>{K(x.spendK)} · {t(x.review === "CONFIRMED" ? "confirmed" : x.confidence === "HIGH" ? "high confidence" : x.confidence === "MEDIUM" ? "medium confidence" : "low confidence")}</span></div>)}
          </>}
          <div className="chart-label" style={{ marginTop: 16 }}>{t("Past campaigns (2023–2025)")} ({c.past.length})</div>
          {c.past.length === 0 ? <div className="muted">{t("None in the history.")}</div> : (
            <div style={{ overflowX: "auto" }}><table className="dtable" style={{ minWidth: 700 }}>
              <thead><tr><th>{t("Campaign")}</th><th>{t("When")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Contracts")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Cost to sales")}</th></tr></thead>
              <tbody>{c.past.map((x: any) => (
                <tr key={x.code} title={x.lesson}><td><b>{x.name}</b><div className="muted" style={{ fontSize: 10 }}>{x.lesson}</div></td><td style={{ whiteSpace: "nowrap" }} dir="ltr">{x.start} → {x.end}</td><td className="num">{K(x.spendK)}</td><td className="num">{x.contracts}</td><td className="num">{M(x.salesM)}</td><td className="num">{x.costToSalesPct ?? "—"}%</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div>
          <div className="kpis" style={{ marginBottom: 12 }}>
            <div className="kpi"><div className="kv">{K(inv.totals.invoicedK)}</div><div className="kl">{t("Invoiced")}</div></div>
            <div className="kpi"><div className="kv">{K(inv.totals.paidK)}</div><div className="kl">{t("Paid")}</div></div>
            <div className="kpi"><div className="kv">{K(inv.totals.outstandingK)}</div><div className="kl">{t("Outstanding")}</div></div>
            <div className="kpi"><div className="kv" style={inv.totals.overdueK ? { color: "var(--alert)" } : {}}>{K(inv.totals.overdueK)}</div><div className="kl">{t("Overdue")}</div></div>
          </div>
          {inv.rows.length === 0 ? <div className="muted">{t(inv.archive?.length ? "No 2026 invoices from this vendor in Oracle." : "No invoices from this vendor in Oracle.")}</div> : (
            <div style={{ overflowX: "auto" }}><table className="dtable" style={{ minWidth: 820 }}>
              <thead><tr><th>{t("Invoice")}</th><th>{t("For")}</th><th>{t("Date")}</th><th>{t("Due")}</th><th className="num">{t("Amount")}</th><th className="num">{t("Outstanding")}</th><th>{t("Status")}</th><th>{t("Checks")}</th></tr></thead>
              <tbody>{inv.rows.map((x: any) => (
                <tr key={x.id}><td dir="ltr"><b>{x.number}</b>{x.po && <div className="muted" style={{ fontSize: 10 }}>PO {x.po}</div>}</td><td>{x.campaign ? N(x.campaign) : "—"}{x.period && <div className="muted" style={{ fontSize: 10 }}>{x.period}</div>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{d(x.date)}</td><td style={{ whiteSpace: "nowrap" }}>{d(x.due)}{x.daysOverdue ? <div className="bad" style={{ fontSize: 10 }}>{x.daysOverdue} {t("days overdue")}</div> : null}</td>
                  <td className="num">{K(x.amountK)}</td><td className="num">{x.outstandingK ? K(x.outstandingK) : "—"}</td>
                  <td><span className={`pill ${x.decision === "APPROVED" ? "healthy" : x.decision === "DISPUTED" ? "weak" : "hold"}`}>{t(x.payment)}</span>{x.decision !== "PENDING" && <div className="muted" style={{ fontSize: 9 }}>{t(x.decision)}</div>}</td>
                  <td style={{ fontSize: 10.5 }}>{x.flags.length ? x.flags.map((f: any, i: number) => <div key={i} className={f.severity === "crit" ? "bad" : ""}>• {f.text}</div>) : <span className="ok">✓</span>}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          {inv.archive?.length > 0 && (
            <details style={{ marginTop: 12 }} open={inv.rows.length === 0}>
              <summary style={{ cursor: "pointer", fontSize: 12 }}><b>{t("2023–2025 archive")}</b> — {inv.archive.length} {t("invoices, all paid")} · {K(inv.archiveTotalK)}</summary>
              <div style={{ overflowX: "auto", marginTop: 8 }}><table className="dtable" style={{ minWidth: 520 }}>
                <thead><tr><th>{t("Invoice")}</th><th>{t("For")}</th><th className="num">{t("Amount")}</th><th>{t("Status")}</th></tr></thead>
                <tbody>{inv.archive.map((x: any) => <tr key={x.number}><td dir="ltr" style={{ fontSize: 11 }}>{x.number}</td><td>{N(x.campaign)}<div className="muted" style={{ fontSize: 10 }}>{x.period}</div></td><td className="num">{K(x.amountK)}</td><td><span className="pill healthy">{t("Paid")}</span></td></tr>)}</tbody>
              </table></div>
            </details>
          )}
          {inv.unbilled.length > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>{t("Delivered but not invoiced yet")}: {inv.unbilled.map((u: any) => `${N(u.campaign)} ${u.period} (${K(u.deliveredK)})`).join(lang === "ar" ? "؛ " : "; ")}</div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>{t("Approve or dispute invoices on the Invoices page; nothing is written back to Oracle.")} <a href="/invoices">{t("Invoices")} →</a></div>
        </div>
      )}

      {tab === "emails" && (
        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
            {t("Mailbox")}: <span dir="ltr">{mail.mailbox}</span>{mail.domain ? <> ↔ <span dir="ltr">@{mail.domain}</span></> : null} · Outlook {mail.mode === "live" ? t("live") : t("simulated")}
            {mail.note && <div style={{ marginTop: 4 }}>{mail.note}</div>}
          </div>
          {mail.messages.length === 0 && <div className="muted">{t("No emails.")}</div>}
          {mail.messages.map((m: any) => (
            <div key={m.id} className="logrow" style={{ alignItems: "flex-start", cursor: "pointer" }} onClick={() => setOpen(open === m.id ? null : m.id)}>
              <span className={`pill ${m.direction === "OUT" ? "hold" : "healthy"}`} style={{ alignSelf: "flex-start", minWidth: 64, textAlign: "center" }}>{m.direction === "OUT" ? t("To vendor") : t("From vendor")}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}><b dir="auto">{m.subject}</b><span className="muted" style={{ fontSize: 10 }}>{d(m.date, { day: "numeric", month: "short", year: "numeric" })}</span>{m.status && <span className="tag">{m.status}</span>}{m.source === "simulated" && <span className="tag">{t("simulated")}</span>}</div>
                <div className="muted" style={{ fontSize: 11 }} dir="ltr">{m.direction === "OUT" ? `→ ${m.to}` : `← ${m.from}`}{m.approvedBy ? ` · ${t("approved by")} ${m.approvedBy}` : ""}</div>
                <div dir="auto" style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap", ...(open === m.id ? {} : { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }) }}>{open === m.id ? m.body ?? m.preview : m.preview}</div>
                {open === m.id && m.webLink && <a href={m.webLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>{t("Open in Outlook")} →</a>}
                {open === m.id && m.status && m.source === "app" && /Draft|مسودة/.test(m.status) && <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8, marginTop: 6 }} onClick={(e) => { e.stopPropagation(); openDrafts(); }}>{t("Review in the assistant")}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
