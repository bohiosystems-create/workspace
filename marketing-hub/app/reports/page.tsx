"use client";

import { useEffect, useRef, useState } from "react";
import Header from "../_components/Header";
import { saveFile } from "../_components/saveFile";
import { useI18n } from "../_components/lang";
import { MissedQuestions } from "./misses";
import { ReportPlayer } from "./player";
import { useApprover } from "../_components/useAgent";
import { WorkingPanel, WorkingInline, rememberDuration } from "../_components/Working";
import { ReportLayoutCard } from "../_components/ReportLayoutCard";
import { screenHtml } from "../../lib/report-svg";

const DAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
const STATUS: Record<string, string> = { SENT: "healthy", GENERATED: "hold", FAILED: "weak" };

export default function ReportsPage() {
  const { lang, t, d, dm } = useI18n();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusyRaw] = useState<string | null>(null);
  const [since, setSince] = useState<number | null>(null);
  // Every long job is timed: the panel shows a running clock, and the duration is kept for next time's estimate.
  const since0 = useRef<number | null>(null), busyRef = useRef<string | null>(null);
  const setBusy = (k: string | null) => {
    if (k) { since0.current = Date.now(); setSince(since0.current); }
    else if (busyRef.current && since0.current) rememberDuration(busyRef.current, Date.now() - since0.current);
    busyRef.current = k; setBusyRaw(k);
  };
  const [opening, setOpening] = useState<number | null>(null);
  const [view, setView] = useState<any>(null);
  const [playing, setPlaying] = useState<any>(null); // report shown as a presentation
  const [savedApprover, saveApprover] = useApprover();
  const [approver, setApprover] = useState("");
  const langRef = useRef(lang);
  const autoPreviewed = useRef(false);
  const [layout, setLayout] = useState<any>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => { if (!layoutOpen) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setLayoutOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [layoutOpen]);
  const loadLayout = () => fetch(`/api/reports/layout?lang=${langRef.current}`).then((r) => r.json()).then((x) => { if (!x.error) setLayout(x); }).catch(() => {});
  useEffect(() => { loadLayout(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  async function layoutAction(action: "UNDO" | "RESET") {
    const x = await (await fetch("/api/reports/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, lang: langRef.current }) })).json();
    if (x.error) setError(x.error); else { setLayout(x); setMessage(x.message ?? null); }
  }
  langRef.current = lang;
  useEffect(() => setApprover(savedApprover), [savedApprover]);

  const load = (x: any) => {
    setData(x);
    setForm({ ...x.schedule, days: [...x.schedule.days], languages: [...x.schedule.languages] });
  };
  async function open(id: string | null, play = false) {
    if (!id) return;
    setOpening(Date.now());
    try {
      const r = await (await fetch(`/api/reports?id=${encodeURIComponent(id)}`)).json();
      if (!r.error) { setView(r); if (play) setPlaying(r); }
    } finally { setOpening(null); }
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/reports?lang=${lang}`).then((r) => r.json()).then((x) => {
      if (!live) return;
      if (x.error) { setError(x.error); return; }
      load(x);
      // From the chat's report card ("Preview the report"): build today's report with the new layout right away.
      const qs = new URLSearchParams(location.search).get("preview") ?? new URLSearchParams((window as any).__demoQuery ?? "").get("preview");
      if (qs && !autoPreviewed.current) { autoPreviewed.current = true; (window as any).__demoQuery = ""; act({ action: "PREVIEW" }, "preview"); }
      else open(x.latestId);
    }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  async function act(body: any, key: string) {
    setBusy(key); setError(null); setMessage(null);
    try {
      const x = await (await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, approver, lang: langRef.current }) })).json();
      if (x.error) throw new Error(x.error);
      load(x);
      setMessage(x.message);
      if (x.openId) await open(x.openId);
      loadLayout();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  const toggle = (k: "days" | "languages", v: any) => setForm({ ...form, [k]: form[k].includes(v) ? form[k].filter((x: any) => x !== v) : [...form[k], v] });
  // Download the open report — or, if none is open, today's report (prepared first) — as PDF or HTML.
  async function download(format: "pdf" | "html") {
    setBusy(format); setError(null);
    try {
      let r = view;
      if (!r) {
        const x = await (await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PREVIEW", approver, lang: langRef.current }) })).json();
        if (x.error) throw new Error(x.error);
        load(x);
        r = x.openId ? await (await fetch(`/api/reports?id=${encodeURIComponent(x.openId)}`)).json() : null;
        if (!r || r.error) throw new Error(t("The report could not be prepared."));
        setView(r);
      }
      const name = `marketing-report-${r.date}-${r.lang}`;
      if (format === "html") await saveFile(`${name}.html`, screenHtml(r.html), "text/html");
      else await saveFile(`${name}.pdf`, await (await import("../_components/reportPdf")).reportPdf(screenHtml(r.html)), "application/pdf");
      setMessage(t("Report saved."));
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="shell">
      <Header />
      <div className="rp-title">
        <div className="section-title">{t("Daily reports")}</div>
        {layout && (
          <div className="rp-layout">
            <button className={`rp-icon ${layoutOpen ? "on" : ""}`} aria-label={t("Report layout")} title={t("Report layout")} aria-expanded={layoutOpen} onClick={() => setLayoutOpen(!layoutOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 9v12" /></svg>
              {layout.view.custom && <span className="rp-dot" />}
            </button>
            {layoutOpen && (
              <>
                <div className="rp-scrim" onClick={() => setLayoutOpen(false)} />
                <div className="rp-pop" role="dialog" aria-label={t("Report layout")}>
                  <div className="rp-pop-head"><div className="chart-label" style={{ margin: 0 }}>{t("Report layout")}</div><button className="rp-x" aria-label={t("Close")} onClick={() => setLayoutOpen(false)}>×</button></div>

              <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>{t("Change it from the assistant: “remove the invoices section”, “move risks to the top”, “only Andalus Quarter”, “top 3 items”, “add a chart of spend by channel”, “add a note: …”, “undo”.")}</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 320px", maxWidth: 520 }}><ReportLayoutCard view={layout.view} onUndo={layout.history.some((h: any) => !h.undone && h.source !== "undo") ? () => layoutAction("UNDO") : undefined} onReset={() => layoutAction("RESET")} /></div>
                <div style={{ flex: "1 1 280px" }}>
                  <div className="muted" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>{t("Changes")}</div>
                  {layout.history.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t("No changes yet — this is the standard report.")}</div>}
                  {layout.history.map((h: any) => (
                    <div className="logrow" key={h.id} style={{ fontSize: 12, opacity: h.undone ? 0.5 : 1 }}>
                      <div className="lt">{dm(h.at)}</div>
                      <div style={{ flex: 1, textDecoration: h.undone ? "line-through" : "none" }}>{h.summary}</div>
                      <span className="muted" style={{ fontSize: 10 }}>{h.undone ? t("undone") : t(h.source === "chat" ? "from the chat" : h.source)}</span>
                    </div>
                  ))}
                </div>
              </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <p className="intro">{t("Every scheduled morning the director writes your report — sales against target, what changed since yesterday, campaign recommendations, decisions waiting (with minutes), vendors, risks and invoices — and emails it to you. Reports go to internal addresses only and take no action.")}</p>
      {error && <div className="err">{error}</div>}
      {message && <div className="alert info" style={{ padding: "10px 14px", marginBottom: 12 }}>{message}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
      {data && form && (
        <>
          <div className="row twocol">
            <div className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <div className="chart-label" style={{ margin: 0 }}>{t("Schedule")}</div>
                <span className={`pill ${data.schedule.enabled ? "healthy" : "hold"}`}>{data.schedule.enabled ? t("On") : t("Paused")}</span>
                <div style={{ flex: 1 }} />
                {data.next && <span className="muted" style={{ fontSize: 11 }}>{t("Next report")}: <b>{d(data.next.date, { weekday: "short", day: "numeric", month: "short" })} {data.next.time}</b>{data.next.overdue ? ` · ${t("due now")}` : ""}</span>}
              </div>
              <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 10 }}>
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />{t("Send the daily report automatically")}
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="field" style={{ width: 110 }}><label>{t("Time")}</label><input className="in" type="time" dir="ltr" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
                <div className="field" style={{ width: 190 }}><label>{t("Timezone")}</label>
                  <select className="in" dir="ltr" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{data.timezones.map((z: string) => <option key={z} value={z}>{z}</option>)}</select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}><label>{t("Days")}</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DAYS[lang].map((n, i) => (
                    <button key={i} type="button" className={`btn ${form.days.includes(i) ? "" : "ghost"}`} style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => toggle("days", i)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}><label>{t("Recipients (internal only)")}</label>
                <input className="in" dir="ltr" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="name@company.com, …" />
                <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{t("Allowed domains")}: <span dir="ltr">{data.allowedDomains.join(", ") || "—"}</span></div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 11 }}>{t("Language")}:</span>
                {[["en", "English"], ["ar", "العربية"]].map(([k, n]) => (
                  <label key={k} className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={form.languages.includes(k)} onChange={() => toggle("languages", k)} />{n}</label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
                <div className="field" style={{ width: 200 }}><label>{t("Changed by")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); saveApprover(e.target.value); }} /></div>
                <button className="btn" disabled={!approver.trim() || busy === "save"} title={!approver.trim() ? t("Enter your name") : ""} onClick={() => act({ action: "SAVE_SCHEDULE", schedule: { ...form, days: form.days.join(","), languages: form.languages.join(",") } }, "save")}>{t("Save schedule")}</button>
              </div>
              {data.schedule.updatedBy && <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Last changed by")} {data.schedule.updatedBy} · {dm(data.schedule.updatedAt)}</div>}
            </div>

            <div className="panel">
              <div className="chart-label">{t("Run")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn ghost" disabled={!!busy} onClick={() => act({ action: "PREVIEW" }, "preview")}>{busy === "preview" && since ? <WorkingInline since={since} label={t("Preparing report…")} /> : t("Preview today's report")}</button>
                <button className="btn" disabled={!!busy} onClick={() => act({ action: "SNAPSHOT" }, "snapshot")}>{busy === "snapshot" && since ? <WorkingInline since={since} label={t("Building snapshot…")} dark={false} /> : t("Run snapshot")}</button>
                <button className="btn ghost" disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" && since ? <WorkingInline since={since} label={t("Preparing PDF…")} /> : t("Download PDF")}</button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
                {data.outlook === "mock" ? t("Outlook is simulated: sends are recorded, not delivered. Set OUTLOOK_MODE=live to email the report.") : t("Reports are emailed from Outlook.")}<br />
                {t("Run snapshot builds a live marketing snapshot — headline figures, charts, today's campaign check and what's waiting for you — saved below and not e-mailed.")}<br />
                {data.cronConfigured ? t("Scheduler endpoint is enabled: POST /api/reports/run every 15 minutes.") : t("To e-mail the daily report on schedule, set REPORTS_CRON_KEY and call POST /api/reports/run every 15 minutes (any scheduler).")}<br />
                {t("Local time now")}: <b dir="ltr">{data.local.date} {data.local.hhmm}</b> ({data.schedule.timezone})
              </div>

              <div className="chart-label" style={{ marginTop: 16 }}>{t("History")}</div>
              {data.reports.length === 0 && <div className="muted">{t("No reports yet.")}</div>}
              {data.reports.map((r: any) => (
                <div className="logrow" key={r.id} style={{ alignItems: "center" }}>
                  <div className="lt">{dm(r.createdAt)}</div>
                  <span className={`pill ${STATUS[r.status] ?? "hold"}`}>{t(r.status)}</span>
                  <div style={{ flex: 1 }}>
                    {r.kind === "SNAPSHOT" ? <b>{t("Live snapshot")}</b> : t(r.trigger === "SCHEDULED" ? "Scheduled" : "Manual")} · {r.lang === "ar" ? "العربية" : "English"}{r.delivery === "mock" ? ` · ${t("simulated")}` : ""}
                    {(r.recipients || r.error) && <div className="muted" style={{ fontSize: 10 }} dir="ltr">{r.recipients}{r.error ? ` · ${r.error}` : ""}</div>}
                  </div>
                  <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 10 }} title={t("Play as a presentation")} aria-label={t("Play as a presentation")} onClick={() => open(r.id, true)}>▶</button>
                  <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => open(r.id)}>{t("View")}</button>
                </div>
              ))}
            </div>
          </div>

          {busy && since && busy !== "save" && (
            <WorkingPanel job={busy} since={since} typicalMs={busy === "pdf" && view ? 6000 : 25000}
              title={busy === "snapshot" ? t("The director is building a live snapshot…") : busy === "pdf" && view ? t("Preparing the PDF…") : t("The director is writing today's report…")}
              steps={busy === "pdf" && view ? [t("Laying out the pages"), t("Drawing the charts"), t("Saving the PDF")]
                : [t("Scanning every source: CRM, email, invoices, ads, competitors, market, calendar"), t("Checking sales against target"), t("Reviewing campaigns and vendors"), t("Preparing market initiatives"), t("Drawing the charts"), t("Writing the report and the presentation")]} />
          )}
          {opening && !busy && <div className="panel" style={{ marginTop: 18 }}><WorkingInline since={opening} label={t("Opening the report…")} /></div>}
          {view && !busy && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div className="chart-label" style={{ margin: 0 }}>{view.title}</div>
                <div style={{ flex: 1 }} />
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" ? t("Preparing PDF…") : t("Download PDF")}</button>
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!!busy} onClick={() => download("html")}>{t("Download HTML")}</button>
                <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setPlaying(view)} title={t("Play as a presentation")}>▶ {t("Play")}</button>
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setView(null)}>{t("Close")}</button>
              </div>
              <iframe title={view.title} sandbox="" srcDoc={screenHtml(view.html)} style={{ width: "100%", height: 1100, border: "1px solid var(--ink-hairline)", background: "#fff" }} />
            </div>
          )}
          <MissedQuestions />
        </>
      )}
      {playing && <ReportPlayer html={playing.html} title={playing.title} lang={playing.lang ?? lang} onClose={() => setPlaying(null)} />}
    </div>
  );
}
