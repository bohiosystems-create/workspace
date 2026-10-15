"use client";
/**
 * Briefs: the scheduled daily e-mail with the status of every active project. The same page as the Kinan marketing
 * agent's Reports — Schedule (with the Delivery check) on the left, Run and History on the right, the open brief
 * underneath with its language switch and PDF / HTML / PowerPoint downloads, the brief's layout (changed from the
 * chat) behind the icon next to the title, and a working panel with a running clock for every long job.
 * Briefs go to internal addresses only and take no action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { runtime } from "./runtime";
import RecipientsInput from "./RecipientsInput";
import { ReportLayoutCard } from "./ReportLayoutCard";
import { WorkingInline, WorkingPanel, rememberDuration } from "./Working";
import type { LayoutState } from "@/lib/reports/layout";
import dynamic from "next/dynamic";
// the player (and its charts) load only when a brief is played
const ReportPlayer = dynamic(() => import("./deck/ReportPlayer"), { ssr: false });

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
interface View { id: string; title: string; html: string; lang: Lang; date: string; other?: { id: string; lang: Lang } | null }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PILL: Record<string, string> = { SENT: "healthy", GENERATED: "hold", FAILED: "watch" };
const dm = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const JOB_TITLE: Record<string, string> = { PREVIEW: "The agent is writing today's brief…", SNAPSHOT: "The agent is building a live snapshot…", SEND_NOW: "Writing today's brief and sending it…", OPEN_IN_LANG: "Writing the brief in the other language…", pdf: "Preparing the PDF…", pptx: "Preparing the PowerPoint…" };
const STEPS_BRIEF = ["Reading the programme, procurement, safety and site updates", "Checking the critical path and milestones", "Reading contractor emails", "Writing the brief in the language chosen", "Building the slides", "Narrating the presentation (ElevenLabs)"];
const STEPS_FILE = ["Laying out the pages", "Drawing the charts", "Saving the file"];

export default function Reports({ author }: { author: string }) {
  const [data, setData] = useState<State | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusyRaw] = useState<string | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [playing, setPlaying] = useState<string | null>(null); // brief HTML shown as a presentation
  const [playPrompt, setPlayPrompt] = useState(false);
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  // Every long job is timed: the panel shows a running clock, and the duration is kept for next time's estimate.
  const since0 = useRef<number | null>(null), busyRef = useRef<string | null>(null);
  const setBusy = (k: string | null) => {
    if (k) { since0.current = Date.now(); setSince(since0.current); }
    else if (busyRef.current && since0.current) rememberDuration(busyRef.current, Date.now() - since0.current);
    busyRef.current = k; setBusyRaw(k);
  };
  // the brief is e-mail HTML laid out at 640 px: narrower than that (phones) the frame is scaled to fit, not cropped
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const fit = () => el.style.setProperty("--rs", String(Math.min(1, el.clientWidth / 680)));
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [view?.id]);
  useEffect(() => { if (!layoutOpen) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setLayoutOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [layoutOpen]);

  const loadLayout = useCallback((l: Lang) => fetch(`/api/reports/layout?lang=${l}`, { cache: "no-store" }).then((r) => r.json()).then((x: LayoutState & { error?: string }) => { if (!x.error) setLayout(x); }).catch(() => undefined), []);
  const layoutAction = async (action: "UNDO" | "RESET") => {
    const x = await fetch("/api/reports/layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, lang, by: author }) }).then((r) => r.json());
    if (x.error) setMsg({ text: x.error, bad: true }); else { setLayout(x); if (x.message) setMsg({ text: x.message }); }
  };
  const take = useCallback((s: State, keepForm = false) => {
    setData(s);
    if (!keepForm) setForm({ enabled: s.schedule.enabled, time: s.schedule.time, timezone: s.schedule.timezone, days: s.schedule.days, recipients: s.schedule.recipients, languages: s.schedule.languages });
  }, []);
  const open = useCallback(async (id: string, play = false) => {
    setOpening(Date.now());
    try {
      const r = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((x) => x.json());
      if (r.error) return;
      if (play) setPlaying(r.html);
      setView({ id, title: r.title, html: r.html, lang: r.lang === "ar" ? "ar" : "en", date: r.date, other: r.other ?? null });
      requestAnimationFrame(() => document.getElementById("rpt-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally { setOpening(null); }
  }, []);
  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}, as: Lang = lang) => {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, lang: as, by: author, ...extra }) });
      const s = (await r.json()) as State;
      if (!r.ok || s.error) { setMsg({ text: s.error ?? "Failed.", bad: true }); return; }
      take(s, action !== "SAVE_SCHEDULE");
      if (s.message) setMsg({ text: s.message, bad: /^Not sent|^لم يُرسل/.test(s.message) });
      if (s.openId) await open(s.openId);
      loadLayout(as);
    } catch { setMsg({ text: "Network error — try again.", bad: true }); }
    finally { setBusy(null); }
  }, [author, lang, open, take, loadLayout]);
  // From the e-mail: /?brief=<id>&play=1 opens that brief, ready to play. From the chat's layout card: /?brief=preview builds today's.
  const booted = useRef(false);
  useEffect(() => {
    fetch(`/api/reports?lang=${lang}`, { cache: "no-store" }).then((r) => r.json()).then((s: State) => {
      if (s.error) { setMsg({ text: s.error, bad: true }); return; }
      take(s, !!form);
      if (booted.current) return;
      booted.current = true;
      const q = new URLSearchParams(window.location.search), id = q.get("brief");
      if (id) history.replaceState(null, "", window.location.pathname);
      if (id === "preview") act("PREVIEW");
      else if (id) open(id).then(() => { if (q.get("play")) setPlayPrompt(true); });
      else if (s.latestId) open(s.latestId); // the latest brief opens by itself, as on the marketing agent's Reports
    }).catch(() => setMsg({ text: "Could not load the briefs.", bad: true }));
    loadLayout(lang);
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Download the open brief — or, if none is open, today's (prepared first) — as PDF, HTML or PowerPoint.
  const download = async (format: "pdf" | "html" | "pptx") => {
    setBusy(format); setMsg(null);
    try {
      let r = view;
      if (!r) {
        const x = (await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PREVIEW", lang, by: author }) }).then((y) => y.json())) as State;
        if (x.error) throw new Error(x.error);
        take(x, true);
        const got = x.openId ? await fetch(`/api/reports?id=${encodeURIComponent(x.openId)}`).then((y) => y.json()) : null;
        if (!got || got.error) throw new Error("The brief could not be prepared.");
        r = { id: got.id, title: got.title, html: got.html, lang: got.lang, date: got.date, other: got.other ?? null }; setView(r);
      }
      const name = `site-brief-${r.date}-${r.lang}`;
      const { saveFile } = await import("./deck/saveFile");
      if (format === "pptx") {
        const { deckFromHtml } = await import("@/lib/deck/deck");
        const deck = deckFromHtml(r.html);
        if (!deck) throw new Error("This brief has no presentation — run a new one.");
        await saveFile(`${name}.pptx`, await (await import("./deck/deckPptx")).deckToPptx(deck), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      } else if (format === "html") await saveFile(`${name}.html`, r.html, "text/html");
      else await saveFile(`${name}.pdf`, await (await import("./reportPdf")).reportPdf(r.html), "application/pdf");
      setMsg({ text: "Brief saved." });
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }); } finally { setBusy(null); }
  };
  const switchLang = (k: Lang) => {
    if (!view || view.lang === k) return;
    setLang(k);
    if (view.other?.id) open(view.other.id); else act("OPEN_IN_LANG", { id: view.id, to: k }, k);
  };

  const head = (
    <div className="home-head rp-title"><div><h1>Briefs</h1>
      <p>Every scheduled morning the agent writes one brief on all {data ? `${data.active} ` : ""}active projects — progress against plan, the critical path, milestones, procurement, safety and what was logged on site — and e-mails it to you. Briefs go to internal addresses only and take no action.</p>
    </div>
      {layout && (
        <div className="rp-layout">
          <button className={`rp-icon ${layoutOpen ? "on" : ""}`} aria-label="Brief layout" title="Brief layout" aria-expanded={layoutOpen} onClick={() => setLayoutOpen(!layoutOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 9v12" /></svg>
            {layout.view.custom && <span className="rp-dot" />}
          </button>
          {layoutOpen && (
            <>
              <div className="rp-scrim" onClick={() => setLayoutOpen(false)} />
              <div className="rp-pop" role="dialog" aria-label="Brief layout">
                <div className="rp-pop-head"><div className="rpt-label">Brief layout</div><button className="rp-x" aria-label="Close" onClick={() => setLayoutOpen(false)}>×</button></div>
                <div className="muted small" style={{ marginBottom: 10 }}>Change it from the agent: “remove the procurement section”, “move safety to the top”, “only Kinan Heights”, “top 3 items”, “add a note: …”, “undo”. It applies from the next brief.</div>
                <div className="rp-grid">
                  <div><ReportLayoutCard view={layout.view} onPreview={() => { setLayoutOpen(false); act("PREVIEW"); }} onUndo={layout.history.some((h) => !h.undone && h.source !== "undo") ? () => layoutAction("UNDO") : undefined} onReset={() => layoutAction("RESET")} /></div>
                  <div>
                    <div className="rpt-label" style={{ marginBottom: 6 }}>Changes</div>
                    {layout.history.length === 0 && <div className="muted small">No changes yet — this is the standard brief.</div>}
                    {layout.history.map((h) => (
                      <div className="logrow" key={h.id} style={{ opacity: h.undone ? 0.5 : 1 }}>
                        <div className="lt">{dm(h.at)}</div>
                        <div className="grow" style={{ textDecoration: h.undone ? "line-through" : "none" }}>{h.summary}</div>
                        <span className="muted small">{h.undone ? "undone" : h.source === "chat" ? `from the chat${h.by ? ` · ${h.by}` : ""}` : h.source}</span>
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
  );
  if (!data || !form) return <div className="home reports rpt">{head}<p className="muted">{msg?.text ?? "Loading…"}</p></div>;
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });
  const toggleDay = (i: number) => set({ days: form.days.includes(i) ? form.days.filter((x) => x !== i) : [...form.days, i].sort() });
  const toggleLang = (k: string) => set({ languages: form.languages.includes(k) ? form.languages.filter((x) => x !== k) : [...form.languages, k] });
  const allowed = [...data.allowedDomains.map((d) => `@${d}`), ...data.allowedRecipients].join(", ") || "—";
  const working = busy && since && busy !== "SAVE_SCHEDULE" && busy !== "html";

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
            {data.next && <span className="muted">Next brief: <b>{day(data.next.date)} {data.next.time}</b>{data.next.overdue ? " · due now" : ""}</span>}
          </div>
          <label className="rpt-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Send the daily brief automatically</label>
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
              <button className="btn sm" disabled={!!busy || !data.schedule.recipients} title="Builds today's brief and e-mails it to the saved recipients now. The scheduled send still runs." onClick={() => act("SEND_NOW")}>{busy === "SEND_NOW" && since ? <WorkingInline since={since} label="Sending…" /> : "Send test now"}</button>
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
            <button className="btn ghost" disabled={!!busy} onClick={() => act("PREVIEW")}>{busy === "PREVIEW" && since ? <WorkingInline since={since} label="Preparing brief…" /> : "Preview today's brief"}</button>
            <button className="btn" disabled={!!busy} onClick={() => act("SNAPSHOT")}>{busy === "SNAPSHOT" && since ? <WorkingInline since={since} label="Building snapshot…" /> : "Run snapshot"}</button>
            <button className="btn ghost" disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" && since ? <WorkingInline since={since} label="Preparing PDF…" /> : "Download PDF"}</button>
          </div>
          <div className="muted rpt-info">
            {data.outlook === "mock" ? "Outlook is simulated: sends are recorded, not delivered. Set OUTLOOK_MODE=live to e-mail the brief." : "Briefs are e-mailed from Outlook."}<br />
            Run snapshot saves the status right now in the history below — it is not e-mailed.<br />
            {data.cronConfigured ? "The automatic schedule is on: the brief is prepared and sent at the time above." : "To e-mail the brief on schedule, set REPORTS_CRON_KEY and call /api/reports/run every minute (any scheduler)."}<br />
            Local time now: <b>{data.local.date} {data.local.hhmm}</b> ({data.schedule.timezone})
          </div>

          <div className="rpt-label" style={{ marginTop: 16 }}>History</div>
          {data.reports.length === 0 && <div className="muted">No briefs yet.</div>}
          <div className="rpt-hist">
            {data.reports.map((r) => (
              <div className={"logrow" + (view?.id === r.id ? " on" : "")} key={r.id}>
                <div className="lt">{dm(r.createdAt)}</div>
                <span className={"pill " + (PILL[r.status] ?? "hold")}>{r.status === "GENERATED" ? (r.kind === "SNAPSHOT" ? "Snapshot" : "Preview") : r.status === "SENT" ? (r.delivery === "mock" ? "Simulated" : "Sent") : "Failed"}</span>
                {r.date < data.local.date && <span className="pill old" title={`Built for ${r.date}; the site has moved on since. Run a new preview for today's figures.`}>Older data</span>}
                <div className="grow">
                  {r.kind === "SNAPSHOT" ? <b>Live snapshot</b> : r.trigger === "SCHEDULED" ? "Scheduled" : "Manual"} · {r.lang === "ar" ? "العربية" : "English"} · {r.projects} project{r.projects > 1 ? "s" : ""}{r.delivery === "mock" ? " · simulated" : ""}
                  {(r.recipients || r.error) && <div className="muted small">{r.recipients}{r.error ? ` · ${r.error}` : ""}</div>}
                </div>
                <button className="btn ghost xs" title="Play as a presentation" aria-label="Play as a presentation" onClick={() => open(r.id, true)}>▶</button>
                <button className="btn ghost xs" onClick={() => open(r.id)}>View</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {working && (
        <WorkingPanel job={busy!} since={since!} typicalMs={busy === "pdf" || busy === "pptx" ? 6000 : 30000} title={JOB_TITLE[busy!] ?? "Working…"} steps={busy === "pdf" || busy === "pptx" ? STEPS_FILE : STEPS_BRIEF} />
      )}
      {opening && !busy && <div className="rpt-panel rpt-view"><WorkingInline since={opening} label="Opening the brief…" /></div>}
      {view && !working && (
        <section className="rpt-panel rpt-view" id="rpt-view" aria-label="Brief">
          <div className="rpt-h">
            <div className="rpt-label">{view.title}</div>
            <div className="rpt-seg" role="group" aria-label="Language">
              {(["en", "ar"] as const).map((k) => <button key={k} type="button" className={"btn xs" + (view.lang === k ? "" : " ghost")} aria-pressed={view.lang === k} disabled={view.lang !== k && (!!busy || !!opening)}
                onClick={() => switchLang(k)}>{k === "en" ? "English" : "العربية"}</button>)}
            </div>
            <span className="grow" />
            <button className="btn ghost xs" disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" ? "Preparing PDF…" : "Download PDF"}</button>
            {runtime.mode !== "standalone" && <button className="btn ghost xs" disabled={!!busy} onClick={() => download("html")}>Download HTML</button>}
            <button className="btn ghost xs" disabled={!!busy} onClick={() => download("pptx")}>{busy === "pptx" ? "Preparing…" : "Download PowerPoint"}</button>
            <button className="btn xs" onClick={() => setPlaying(view.html)} title="Play as a presentation" aria-label="Play as a presentation">▶ Play</button>
            <button className="btn ghost xs" onClick={() => setView(null)}>Close</button>
          </div>
          <div className="rpt-frame" ref={frame}><iframe title={view.title} srcDoc={view.html} sandbox="" /></div>
        </section>
      )}
      {playPrompt && view && (
        <div role="dialog" aria-label="Play" className="rpt-playprompt" onClick={() => setPlayPrompt(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="rpt-label">{view.title}</div>
            <button className="btn rpt-playbig" onClick={() => { setPlayPrompt(false); setPlaying(view.html); }} title="Play as a presentation" aria-label="Play as a presentation">▶</button>
            <div><button className="btn ghost xs" onClick={() => setPlayPrompt(false)}>Read it instead</button></div>
          </div>
        </div>
      )}
      {playing && <ReportPlayer html={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
