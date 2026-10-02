"use client";

import { useEffect, useRef, useState } from "react";
import Header from "../_components/Header";
import { saveFile } from "../_components/saveFile";
import { useI18n } from "../_components/lang";
import { useApprover } from "../_components/useAgent";

const DAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
const STATUS: Record<string, string> = { SENT: "healthy", GENERATED: "hold", FAILED: "weak" };

export default function ReportsPage() {
  const { lang, t, d, dm } = useI18n();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<any>(null);
  const [savedApprover, saveApprover] = useApprover();
  const [approver, setApprover] = useState("");
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => setApprover(savedApprover), [savedApprover]);

  const load = (x: any) => {
    setData(x);
    setForm({ ...x.schedule, days: [...x.schedule.days], languages: [...x.schedule.languages] });
  };
  async function open(id: string | null) {
    if (!id) return;
    const r = await (await fetch(`/api/reports?id=${encodeURIComponent(id)}`)).json();
    if (!r.error) setView(r);
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/reports?lang=${lang}`).then((r) => r.json()).then((x) => {
      if (!live) return;
      if (x.error) setError(x.error); else { load(x); open(x.latestId); }
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
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  const toggle = (k: "days" | "languages", v: any) => setForm({ ...form, [k]: form[k].includes(v) ? form[k].filter((x: any) => x !== v) : [...form[k], v] });
  const download = () => {
    if (!view) return;
    saveFile(`marketing-report-${view.date}-${view.lang}.html`, view.html, "text/html").catch((e) => setError(e.message));
  };

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Daily reports")}</div>
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
                <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={form.toKinan} onChange={(e) => setForm({ ...form, toKinan: e.target.checked })} />{t("Also send the brief to Kinan's agent")}</label>
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
                <button className="btn ghost" disabled={busy === "preview"} onClick={() => act({ action: "PREVIEW" }, "preview")}>{t("Preview today's report")}</button>
                <button className="btn" disabled={busy === "send"} onClick={() => act({ action: "SEND_NOW" }, "send")}>{t("Send now")}</button>
                <button className="btn ghost" disabled={busy === "run"} onClick={() => act({ action: "RUN" }, "run")}>{t("Run the schedule check")}</button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
                {data.outlook === "mock" ? t("Outlook is simulated: sends are recorded, not delivered. Set OUTLOOK_MODE=live to email the report.") : t("Reports are emailed from Outlook.")}<br />
                {data.cronConfigured ? t("Scheduler endpoint is enabled: POST /api/reports/run every 15 minutes.") : t("To send on schedule, set REPORTS_CRON_KEY and call POST /api/reports/run every 15 minutes (any scheduler). Until then, use Send now.")}<br />
                {t("Local time now")}: <b dir="ltr">{data.local.date} {data.local.hhmm}</b> ({data.schedule.timezone})
              </div>

              <div className="chart-label" style={{ marginTop: 16 }}>{t("History")}</div>
              {data.reports.length === 0 && <div className="muted">{t("No reports yet.")}</div>}
              {data.reports.map((r: any) => (
                <div className="logrow" key={r.id} style={{ alignItems: "center" }}>
                  <div className="lt">{dm(r.createdAt)}</div>
                  <span className={`pill ${STATUS[r.status] ?? "hold"}`}>{t(r.status)}</span>
                  <div style={{ flex: 1 }}>
                    {t(r.trigger === "SCHEDULED" ? "Scheduled" : "Manual")} · {r.lang === "ar" ? "العربية" : "English"}{r.delivery === "mock" ? ` · ${t("simulated")}` : ""}{r.kinan ? ` · ${t("sent to Kinan")}` : ""}
                    {(r.recipients || r.error) && <div className="muted" style={{ fontSize: 10 }} dir="ltr">{r.recipients}{r.error ? ` · ${r.error}` : ""}</div>}
                  </div>
                  <button className="btn ghost" style={{ padding: "5px 9px", fontSize: 8 }} onClick={() => open(r.id)}>{t("View")}</button>
                </div>
              ))}
            </div>
          </div>

          {view && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div className="chart-label" style={{ margin: 0 }}>{view.title}</div>
                <div style={{ flex: 1 }} />
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={download}>{t("Download")}</button>
                <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setView(null)}>{t("Close")}</button>
              </div>
              <iframe title={view.title} sandbox="" srcDoc={view.html} style={{ width: "100%", height: 1100, border: "1px solid var(--ink-hairline)", background: "#fff" }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
