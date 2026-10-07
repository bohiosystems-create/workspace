"use client";
/**
 * Daily report: the scheduled e-mail with the status of every active project — the same page as the other Kinan
 * agents' Reports (schedule, run, history, delivery check). Reports go to internal addresses only.
 */
import { useCallback, useEffect, useState } from "react";

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
const STATUS: Record<string, string> = { SENT: "ok", GENERATED: "hold", FAILED: "bad" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Reports({ author }: { author: string }) {
  const [data, setData] = useState<State | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [view, setView] = useState<{ id: string; title: string; html: string } | null>(null);

  const take = useCallback((s: State, keepForm = false) => {
    setData(s);
    if (!keepForm) setForm({ enabled: s.schedule.enabled, time: s.schedule.time, timezone: s.schedule.timezone, days: s.schedule.days, recipients: s.schedule.recipients, languages: s.schedule.languages });
  }, []);
  const open = useCallback(async (id: string) => {
    const r = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((x) => x.json());
    if (!r.error) setView({ id, title: r.title, html: r.html });
  }, []);
  useEffect(() => {
    fetch(`/api/reports?lang=${lang}`, { cache: "no-store" }).then((r) => r.json()).then((s: State) => {
      if (s.error) { setMsg({ text: s.error, bad: true }); return; }
      take(s, !!form);
    }).catch(() => setMsg({ text: "Could not load the reports.", bad: true }));
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, lang, by: author, ...extra }) });
      const s = (await r.json()) as State;
      if (!r.ok || s.error) { setMsg({ text: s.error ?? "Failed.", bad: true }); return; }
      take(s, action !== "SAVE_SCHEDULE");
      if (s.message) setMsg({ text: s.message, bad: /^Not sent|^لم يُرسل/.test(s.message) });
      if (s.openId) await open(s.openId);
    } catch { setMsg({ text: "Network error — try again.", bad: true }); }
    finally { setBusy(null); }
  };

  if (!data || !form) return <div className="home reports"><div className="home-head"><div><h1>Daily report</h1><p>{msg?.text ?? "Loading…"}</p></div></div></div>;
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });
  const dirty = JSON.stringify(form) !== JSON.stringify({ enabled: data.schedule.enabled, time: data.schedule.time, timezone: data.schedule.timezone, days: data.schedule.days, recipients: data.schedule.recipients, languages: data.schedule.languages });
  const allowed = [...data.allowedDomains.map((d) => `@${d}`), ...data.allowedRecipients].join(", ");

  return (
    <div className="home reports">
      <div className="home-head">
        <div><h1>Daily report</h1><p>One e-mail each morning with the status of all {data.active} active project{data.active > 1 ? "s" : ""}: progress, the critical path, milestones, procurement, safety and what was logged on site.</p></div>
      </div>
      {msg && <div className={"rep-msg" + (msg.bad ? " bad" : "")} role="status">{msg.text}</div>}

      <div className="rep-grid">
        <section className="studio-card rep-card">
          <div className="rep-h"><span className="studio-l">Daily report · schedule</span><span className={"rep-badge " + (data.schedule.enabled ? "ok" : "off")}>{data.schedule.enabled ? "On" : "Paused"}</span></div>
          <label className="rep-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Send the daily report automatically</label>
          <div className="rep-row">
            <label className="rep-f">Time<input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} /></label>
            <label className="rep-f">Timezone<select value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>{data.timezones.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <div className="rep-f">Days
            <div className="rep-days">{DAYS.map((d, i) => <button key={d} type="button" className={form.days.includes(i) ? "on" : ""} aria-pressed={form.days.includes(i)} onClick={() => set({ days: form.days.includes(i) ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })}>{d}</button>)}</div>
          </div>
          <label className="rep-f">Recipients <em>internal only{allowed ? ` — ${allowed}` : ""}</em>
            <textarea rows={2} value={form.recipients} onChange={(e) => set({ recipients: e.target.value })} placeholder="name@company.com, …" />
          </label>
          <div className="rep-f">Languages <em>one e-mail per language</em>
            <div className="rep-langs">{([["en", "English"], ["ar", "العربية"]] as const).map(([k, l]) => <label key={k} className="rep-check"><input type="checkbox" checked={form.languages.includes(k)} onChange={(e) => set({ languages: e.target.checked ? [...form.languages, k] : form.languages.filter((x) => x !== k) })} /> {l}</label>)}</div>
          </div>
          <div className="rep-act">
            <button className="primary" disabled={!!busy || !dirty} onClick={() => act("SAVE_SCHEDULE", { schedule: { ...form, days: form.days.join(","), languages: form.languages.join(",") } })}>{busy === "SAVE_SCHEDULE" ? "Saving…" : "Save schedule"}</button>
          </div>
          <p className="rep-note">{data.next ? (data.next.overdue ? `Today's slot has passed — the next scheduler check sends it (local time ${data.local.hhmm}).` : `Next report ${data.next.date === data.local.date ? "today" : data.next.date} at ${data.next.time} (${data.schedule.timezone}).`) : "Paused — no report will be sent."}{data.schedule.updatedBy ? ` Last changed by ${data.schedule.updatedBy}, ${when(data.schedule.updatedAt)}.` : ""}</p>
        </section>

        <section className="studio-card rep-card">
          <div className="rep-h"><span className="studio-l">Run</span>
            <div className="seg3 rep-lang" role="group" aria-label="Report language">{(["en", "ar"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "EN" : "ع"}</button>)}</div>
          </div>
          <button className="rep-btn" disabled={!!busy} onClick={() => act("PREVIEW")}><b>{busy === "PREVIEW" ? "Preparing…" : "Preview today's report"}</b><em>Exactly what the recipients get — not e-mailed</em></button>
          <button className="rep-btn" disabled={!!busy} onClick={() => act("SNAPSHOT")}><b>{busy === "SNAPSHOT" ? "Taking snapshot…" : "Run snapshot"}</b><em>The status right now, saved in the history — not e-mailed</em></button>
          <button className="rep-btn" disabled={!!busy} onClick={() => act("RUN")}><b>{busy === "RUN" ? "Checking…" : "Run the schedule now"}</b><em>Sends today's report if it is due and hasn't gone yet</em></button>
        </section>

        <section className="studio-card rep-card">
          <div className="rep-h"><span className="studio-l">Delivery check</span><span className={"rep-badge " + (data.delivery.ready ? "ok" : "bad")}>{data.delivery.ready ? "Ready" : "Not ready"}</span></div>
          <ul className="rep-checks">{data.delivery.items.map((i) => <li key={i.label} className={i.ok ? "ok" : "bad"}><span aria-hidden="true">{i.ok ? "✓" : "✕"}</span><div><b>{i.label}</b>{i.fix && <em>{i.fix}</em>}</div></li>)}</ul>
          {data.delivery.notes.map((n) => <p key={n} className="rep-note">{n}</p>)}
          <button className="studio-add" disabled={!!busy} onClick={() => act("SEND_NOW")}>{busy === "SEND_NOW" ? "Sending…" : "Send test now"}</button>
          <p className="rep-note">Sends today's report to the recipients above, in each scheduled language{data.outlook === "mock" ? " — simulated while Outlook isn't live" : ""}.</p>
        </section>

        <section className="studio-card rep-card rep-hist">
          <div className="rep-h"><span className="studio-l">History</span><span className="rep-count">{data.reports.length}</span></div>
          {data.reports.length ? (
            <ul className="rep-list">{data.reports.map((r) => (
              <li key={r.id} className={view?.id === r.id ? "on" : ""}>
                <button onClick={() => open(r.id)}>
                  <span className="t"><b>{r.title}</b><em>{when(r.createdAt)} · {r.kind === "SNAPSHOT" ? "snapshot" : r.trigger === "SCHEDULED" ? "scheduled" : "manual"} · {r.lang.toUpperCase()} · {r.projects} project{r.projects > 1 ? "s" : ""}{r.recipients ? ` · ${r.delivery === "mock" ? "simulated to" : "to"} ${r.recipients}` : ""}</em>{r.error && <em className="err">{r.error}</em>}</span>
                  <span className={"rep-st " + (STATUS[r.status] ?? "")}>{r.status === "GENERATED" ? (r.kind === "SNAPSHOT" ? "Snapshot" : "Preview") : r.status === "SENT" ? (r.delivery === "mock" ? "Simulated" : "Sent") : "Failed"}</span>
                </button>
              </li>
            ))}</ul>
          ) : <p className="rep-note">No reports yet — preview today's report to see one.</p>}
        </section>
      </div>

      {view && (
        <section className="rep-view" aria-label="Report">
          <div className="rep-vh"><b>{view.title}</b>
            <button className="mini" onClick={() => { const u = URL.createObjectURL(new Blob([view.html], { type: "text/html" })); const a = document.createElement("a"); a.href = u; a.download = `${view.title.replace(/[^\w؀-ۿ -]+/g, "").trim()}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }}>Download</button>
            <button className="x" onClick={() => setView(null)} aria-label="Close report">✕</button>
          </div>
          <iframe title={view.title} srcDoc={view.html} sandbox="" />
        </section>
      )}
    </div>
  );
}
