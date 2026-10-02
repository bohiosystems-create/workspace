"use client";

import { useEffect, useRef, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useApprover } from "../_components/useAgent";

const STRIPE: Record<string, string> = { crit: "var(--alert)", warn: "var(--ink)", info: "var(--ink-faint)" };

export default function DailyPage() {
  const { lang, t, d } = useI18n();
  const [data, setData] = useState<any>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saved, save] = useApprover();
  const [approver, setApprover] = useState("");
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => setApprover(saved), [saved]);

  useEffect(() => {
    let live = true;
    fetch(`/api/daily?lang=${lang}${date ? `&date=${date}` : ""}`).then((r) => r.json()).then((x) => { if (live) (x.error ? setError(x.error) : setData(x)); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang, date]);

  async function act(body: any, key: string) {
    setBusy(key); setError(null);
    try {
      const x = await (await fetch("/api/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, approver, date, lang: langRef.current }) })).json();
      if (x.error) throw new Error(x.error);
      setData(x);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  const groups: [string, any[]][] = data ? [...data.recommendations.reduce((m: Map<string, any[]>, r: any) => m.set(r.campaign, [...(m.get(r.campaign) ?? []), r]), new Map()).entries()] : [];
  const isToday = data && data.date === data.days[data.days.length - 1];

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Daily campaign check")}</div>
      <p className="intro">{t("Every morning the director checks each live campaign against its own trend and against similar past campaigns, and says what to change: cut, scale, refresh, renew or let end. Items stay open until the numbers change or you decide; your decision carries over to the next days.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
      {data && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {data.days.map((x: string) => (
              <button key={x} className={`btn ${x === data.date ? "" : "ghost"}`} style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => setDate(x === data.days[data.days.length - 1] ? null : x)}>{d(x, { weekday: "short", day: "numeric", month: "short" })}</button>
            ))}
          </div>
          <div className="kpis">
            <Kpi v={String(data.summary.total)} l={t("Recommendations")} />
            <Kpi v={String(data.summary.urgent)} l={t("Urgent")} alert={data.summary.urgent > 0} />
            <Kpi v={String(data.summary.new)} l={t("New today")} />
            <Kpi v={String(data.summary.resolved)} l={t("Resolved since yesterday")} />
            <Kpi v={String(data.summary.total - data.summary.open)} l={t("Decided")} />
          </div>

          <div className="row twocol" style={{ marginTop: 4 }}>
            <div className="panel">
              <div className="field" style={{ width: 220 }}><label>{t("Deciding as")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); save(e.target.value); }} /></div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{t("Accepting records your decision; the change itself is made on Campaigns or with the agency. Nothing is changed automatically.")}</div>
            </div>
            <div className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div className="chart-label" style={{ margin: 0, flex: 1 }}>{t("AI second opinion")}</div>
                {data.ai.enabled && isToday && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === "ai"} onClick={() => act({ action: "AI_NOTE" }, "ai")}>{busy === "ai" ? t("Thinking…") : data.aiNote ? t("Refresh") : t("Ask the AI")}</button>}
              </div>
              {data.aiNote
                ? <><div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{data.aiNote.text}</div><div className="muted" style={{ fontSize: 9, marginTop: 6 }} dir="ltr">{({ anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" } as Record<string, string>)[data.aiNote.provider] ?? data.aiNote.provider} · {data.aiNote.model}</div></>
                : <div className="muted" style={{ fontSize: 11.5 }}>{data.ai.enabled ? t("Ask the AI to read today's check together with the campaign history and say what to do first.") : t("Add a Claude, OpenAI or Gemini API key to get an AI second opinion. The checks on this page are rules-based and work without one.")}</div>}
            </div>
          </div>

          {groups.length === 0 && <div className="panel" style={{ marginTop: 18 }}><div className="muted">{t("No changes recommended for this day.")}</div></div>}
          {groups.map(([campaign, recs]) => (
            <div key={campaign} className="panel" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>{campaign === "CRM feed" ? t("CRM feed") : campaign}</b>
                {recs[0].vendor && <span className="muted" style={{ fontSize: 11 }}>{recs[0].vendor} · {recs[0].asset}</span>}
                {recs[0].code !== "ALL" && <span className="tag" dir="ltr">{recs[0].code}</span>}
              </div>
              {recs.map((r: any) => (
                <div key={r.id} style={{ borderInlineStart: `3px solid ${STRIPE[r.severity]}`, paddingInlineStart: 12, margin: "10px 0" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 12.5 }}>{r.title}</b>
                    {r.isNew ? <span className="pill watch">{t("New")}</span> : <span className="muted" style={{ fontSize: 10 }}>{t("open since")} {d(r.since, { day: "numeric", month: "short" })}</span>}
                    {r.status !== "OPEN" && <span className={`pill ${r.status === "ACCEPTED" ? "healthy" : "hold"}`}>{t(r.status)}{r.decidedBy ? ` · ${r.decidedBy}` : ""}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{r.why}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>→ {r.action}</div>
                  {r.note && <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>“{r.note}”</div>}
                  {r.similarPast.length > 0 && (
                    <details style={{ marginTop: 5 }}>
                      <summary className="muted" style={{ cursor: "pointer", fontSize: 10.5 }}>▸ {t("Similar past campaigns")} ({r.similarPast.length})</summary>
                      <ul style={{ margin: "4px 0 0", paddingInlineStart: 16, fontSize: 11, lineHeight: 1.5 }}>{r.similarPast.map((p: any) => <li key={p.code}><b>{p.name}</b> — {p.costToSalesPct}% {t("cost to sales")}. {p.lesson}</li>)}</ul>
                    </details>
                  )}
                  {isToday && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {r.status === "OPEN" ? <>
                        <button className="btn" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === r.id} title={!approver.trim() ? t("Enter your name") : ""} onClick={() => act({ action: "DECIDE", id: r.id, decision: "ACCEPT", note: notes[r.id] }, r.id)}>{t("Accept")}</button>
                        <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === r.id} onClick={() => act({ action: "DECIDE", id: r.id, decision: "DISMISS", note: notes[r.id] }, r.id)}>{t("Dismiss")}</button>
                        <input className="in" style={{ width: 220, padding: "4px 8px", fontSize: 11 }} placeholder={t("Note (optional)")} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                        {r.href && r.href !== "/daily" && <a className="btn ghost" style={{ padding: "5px 10px", fontSize: 8, textDecoration: "none" }} href={r.href}>{t("Open")}</a>}
                      </> : <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === r.id} onClick={() => act({ action: "DECIDE", id: r.id, decision: "REOPEN" }, r.id)}>{t("Reopen")}</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {data.resolved.length > 0 && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="chart-label">{t("Resolved since yesterday")}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12 }}>{data.resolved.map((r: any) => <li key={r.id} className="ok">{r.title}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ v, l, alert }: { v: string; l: string; alert?: boolean }) {
  return <div className="kpi"><div className="kv" style={alert ? { color: "var(--alert)" } : {}}>{v}</div><div className="kl">{l}</div></div>;
}
