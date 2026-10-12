"use client";
/**
 * Reports: the scheduled daily e-mail with the status of every active project. Same page as the Kinan marketing
 * agent's Reports — Schedule (with the Delivery check) on the left, Run and History on the right, the open report
 * underneath. Reports go to internal addresses only and take no action.
 */
import { useCallback, useEffect, useState } from "react";
import { runtime } from "./runtime";
import RecipientsInput from "./RecipientsInput";

type Lang = "en" | "ar";
interface Meta { id: string; createdAt: string; date: string; kind: "DAILY" | "SNAPSHOT"; trigger: "SCHEDULED" | "MANUAL"; lang: Lang; title: string; status: "GENERATED" | "SENT" | "FAILED"; delivery: "mock" | "send" | null; recipients: string; error: string | null; projects: number }
interface State {
  schedule: { enabled: boolean; time: string; timezone: string; days: number[]; recipients: string; languages: string[]; updatedBy?: string; updatedAt: string };
  local: { date: string; hhmm: string }; next: { date: string; time: string; overdue: boolean } | null; timezones: string[];
  allowedDomains: string[]; allowedRecipients: string[]; outlook: "mock" | "live"; cronConfigured: boolean; active: number;
  delivery: { ready: boolean; items: { ok: boolean; label: string; fix?: string }[]; notes: string[] };
  reports: Meta[]; latestId: string | null; message?: string | null; openId?: string | null; error?: string;
}
interface Form { enabled: boolean; time: string; timezone: string; days: number[]; recipients: string; languages: string[] }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PILL: Record<string, string> = { SENT: "healthy", GENERATED: "hold", FAILED: "watch" };
const dm = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function Reports({ author }: { author: string }) {
  const [data, setData] = useState<State | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [view, setView] = useState<{ id: string; title: string; html: string; lang: Lang } | null>(null);

  const take = useCallback((s: State, keepForm = false) => {
    setData(s);
    if (!keepForm) setForm({ enabled: s.schedule.enabled, time: s.schedule.time, timezone: s.schedule.timezone, days: s.schedule.days, recipients: s.schedule.recipients, languages: s.schedule.languages });
  }, []);
  const open = useCallback(async (id: string) => {
    const r = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((x) => x.json());
    if (!r.error) { setView({ id, title: r.title, html: r.html, lang: r.lang === "ar" ? "ar" : "en" }); requestAnimationFrame(() => document.getElementById("rpt-view")?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  }, []);
  useEffect(() => {
    fetch(`/api/reports?lang=${lang}`, { cache: "no-store" }).then((r) => r.json()).then((s: State) => {
      if (s.error) { setMsg({ text: s.error, bad: true }); return; }
      take(s, !!form);
    }).catch(() => setMsg({ text: "Could not load the reports.", bad: true }));
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: string, extra: Record<string, unknown> = {}, as: Lang = lang) => {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, lang: as, by: author, ...extra }) });
      const s = (await r.json()) as State;
      if (!r.ok || s.error) { setMsg({ text: s.error ?? "Failed.", bad: true }); return; }
      take(s, action !== "SAVE_SCHEDULE");
      if (s.message) setMsg({ text: s.message, bad: /^Not sent|^لم يُرسل/.test(s.message) });
      if (s.openId) await open(s.openId);
    } catch { setMsg({ text: "Network error — try again.", bad: true }); }
    finally { setBusy(null); }
  };

  const head = (
    <div className="home-head"><div><h1>Reports</h1>
      <p>Every scheduled morning the agent writes one report on all {data ? `${data.active} ` : ""}active projects — progress against plan, the critical path, milestones, procurement, safety and what was logged on site — and e-mails it to you. Reports go to internal addresses only and take no action.</p>
    </div></div>
  );
  if (!data || !form) return <div className="home reports rpt">{head}<p className="muted">{msg?.text ?? "Loading…"}</p></div>;
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });
  const toggleDay = (i: number) => set({ days: form.days.includes(i) ? form.days.filter((x) => x !== i) : [...form.days, i].sort() });
  const toggleLang = (k: string) => set({ languages: form.languages.includes(k) ? form.languages.filter((x) => x !== k) : [...form.languages, k] });
  const allowed = [...data.allowedDomains.map((d) => `@${d}`), ...data.allowedRecipients].join(", ") || "—";

  return (
    <div className="home reports rpt">
      {head}
      {msg && <div className={msg.bad ? "rpt-err" : "rpt-alert"} role="status">{msg.text}</div>}

      <div className="rpt-row">
        <section className="rpt-panel">
          <div className="rpt-h">
            <div className="rpt-label">Schedule</div>
            <span className={"pill " + (data.schedule.enabled ? "healthy" : "hold")}>{data.schedule.enabled ? "On" : "Paused"}</span>
            <span className="grow" />
            {data.next && <span className="muted">Next report: <b>{day(data.next.date)} {data.next.time}</b>{data.next.overdue ? " · due now" : ""}</span>}
          </div>
          <label className="rpt-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Send the daily report automatically</label>
          <div className="rpt-fields">
            <div className="field" style={{ width: 110 }}><label>Time</label><input className="in" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} /></div>
            <div className="field" style={{ width: 190 }}><label>Timezone</label>
              <select className="in" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>{data.timezones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
            </div>
          </div>
          <div className="field"><label>Days</label>
            <div className="rpt-days">{DAYS.map((n, i) => <button key={n} type="button" className={"btn sm" + (form.days.includes(i) ? "" : " ghost")} aria-pressed={form.days.includes(i)} onClick={() => toggleDay(i)}>{n}</button>)}</div>
          </div>
          <div className="field"><label>Recipients (internal only)</label>
            <RecipientsInput value={form.recipients} onChange={(v) => set({ recipients: v })} allowedDomains={data.allowedDomains} allowedRecipients={data.allowedRecipients} />
            <div className="muted small">Allowed: {allowed}</div>
          </div>
          <div className="rpt-langs-pick">
            <span className="muted">Language:</span>
            {([["en", "English"], ["ar", "العربية"]] as const).map(([k, n]) => <label key={k} className="rpt-check"><input type="checkbox" checked={form.languages.includes(k)} onChange={() => toggleLang(k)} />{n}</label>)}
          </div>
          <div className="rpt-actions">
            <button className="btn" disabled={busy === "SAVE_SCHEDULE"} onClick={() => act("SAVE_SCHEDULE", { schedule: { ...form, days: form.days.join(","), languages: form.languages.join(",") } })}>{busy === "SAVE_SCHEDULE" ? "Saving…" : "Save schedule"}</button>
          </div>

          <div className="rpt-deliv">
            <div className="rpt-h">
              <div className="rpt-label">Delivery check</div>
              <span className={"pill " + (data.delivery.ready ? "healthy" : "hold")}>{data.delivery.ready ? "Ready — you'll receive it" : "Not ready yet"}</span>
              <span className="grow" />
              <button className="btn sm" disabled={!!busy || !data.schedule.recipients} title="Builds today's report and e-mails it to the saved recipients now. The scheduled send still runs." onClick={() => act("SEND_NOW")}>{busy === "SEND_NOW" ? "Sending…" : "Send test now"}</button>
            </div>
            {data.delivery.items.map((it) => (
              <div key={it.label} className="rpt-item"><span aria-hidden="true" className={it.ok ? "ok" : "no"}>{it.ok ? "✓" : "!"}</span><span className="grow">{it.label}{it.fix && <span className="muted"> — {it.fix}</span>}</span></div>
            ))}
            {data.delivery.notes.map((n) => <div key={n} className="muted small">{n}</div>)}
          </div>
          {data.schedule.updatedBy && <div className="muted small">Last changed by {data.schedule.updatedBy} · {dm(data.schedule.updatedAt)}</div>}
        </section>

        <section className="rpt-panel">
          <div className="rpt-label">Run</div>
          <div className="rpt-actions">
            <button className="btn ghost" disabled={!!busy} onClick={() => act("PREVIEW")}>{busy === "PREVIEW" ? "Preparing report…" : "Preview today's report"}</button>
            <button className="btn" disabled={!!busy} onClick={() => act("SNAPSHOT")}>{busy === "SNAPSHOT" ? "Building snapshot…" : "Run snapshot"}</button>
          </div>
          <div className="muted rpt-info">
            {data.outlook === "mock" ? "Outlook is simulated: sends are recorded, not delivered. Set OUTLOOK_MODE=live to e-mail the report." : "Reports are e-mailed from Outlook."}<br />
            Run snapshot saves the status right now in the history below — it is not e-mailed.<br />
            {data.cronConfigured ? "Scheduler endpoint is enabled: /api/reports/run is called every minute." : "To e-mail the report on schedule, set REPORTS_CRON_KEY and call /api/reports/run every minute (any scheduler)."}<br />
            Local time now: <b>{data.local.date} {data.local.hhmm}</b> ({data.schedule.timezone})
          </div>

          <div className="rpt-label" style={{ marginTop: 16 }}>History</div>
          {data.reports.length === 0 && <div className="muted">No reports yet.</div>}
          <div className="rpt-hist">
            {data.reports.map((r) => (
              <div className={"logrow" + (view?.id === r.id ? " on" : "")} key={r.id}>
                <div className="lt">{dm(r.createdAt)}</div>
                <span className={"pill " + (PILL[r.status] ?? "hold")}>{r.status === "GENERATED" ? (r.kind === "SNAPSHOT" ? "Snapshot" : "Preview") : r.status === "SENT" ? (r.delivery === "mock" ? "Simulated" : "Sent") : "Failed"}</span>
                <div className="grow">
                  {r.kind === "SNAPSHOT" ? <b>Live snapshot</b> : r.trigger === "SCHEDULED" ? "Scheduled" : "Manual"} · {r.lang === "ar" ? "العربية" : "English"} · {r.projects} project{r.projects > 1 ? "s" : ""}{r.delivery === "mock" ? " · simulated" : ""}
                  {(r.recipients || r.error) && <div className="muted small">{r.recipients}{r.error ? ` · ${r.error}` : ""}</div>}
                </div>
                <button className="btn ghost xs" onClick={() => open(r.id)}>View</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {view && (
        <section className="rpt-panel rpt-view" id="rpt-view" aria-label="Report">
          <div className="rpt-h">
            <div className="rpt-label">{view.title}</div>
            <div className="rpt-seg" role="group" aria-label="Language">
              {(["en", "ar"] as const).map((k) => <button key={k} type="button" className={"btn xs" + (view.lang === k ? "" : " ghost")} aria-pressed={view.lang === k} disabled={view.lang !== k && !!busy}
                onClick={() => { if (view.lang !== k) { setLang(k); act("PREVIEW", {}, k); } }}>{k === "en" ? "English" : "العربية"}</button>)}
            </div>
            <span className="grow" />
            {runtime.mode !== "standalone" && <button className="btn ghost xs" onClick={() => { const u = URL.createObjectURL(new Blob([view.html], { type: "text/html" })); const a = document.createElement("a"); a.href = u; a.download = `${view.title.replace(/[^\w؀-ۿ -]+/g, "").trim()}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }}>Download HTML</button>}
            <button className="btn ghost xs" onClick={() => setView(null)}>Close</button>
          </div>
          <iframe title={view.title} srcDoc={view.html} sandbox="" />
        </section>
      )}
    </div>
  );
}
