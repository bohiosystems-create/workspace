"use client";
/**
 * The field app: one technician's phone. Their own AI agent greets them with the day, lists their jobs in the order to
 * do them, keeps them safe (permits before work), and records what they do — start, pause, tick the checklist, close
 * with a note and photos, report a fault — by tap, by typing or by voice. Every change reaches the control room at
 * once, and the control room's changes (a new job, an approval) appear here without a refresh.
 *   /field                 pick your facility and your name (remembered on this phone)
 *   /field?tech=<id>       straight to that person's day (the link the control room's Team tab opens)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { facilityState, myDay } from "@/lib/fm/api";
import { Logo, Mark } from "../_components/icons";
import { useVoiceInput } from "../_components/deck/useVoiceInput";

type Day = ReturnType<typeof myDay>;
type Job = Day["jobs"][number];
type FS = ReturnType<typeof facilityState>;
const KEY = "kinan.field.tech";
const STATUS: [string, string][] = [["available", "Available"], ["on_job", "On a job"], ["travelling", "Travelling"], ["break", "Break"]];

async function fm(body: Record<string, unknown>) {
  const r = await fetch("/api/fm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: "field", ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error ?? "Failed.");
  return j as { message: string };
}

export default function Field() {
  const [tech, setTech] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tech");
    let t = q;
    try { if (!t) t = localStorage.getItem(KEY); else localStorage.setItem(KEY, t); } catch { /* storage off */ }
    setTech(t); setReady(true);
    try { const th = localStorage.getItem("kinan.theme") || "light"; if (th !== "auto") document.documentElement.dataset.theme = th; } catch { /* */ }
  }, []);
  const choose = (id: string | null) => { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* */ } setTech(id); history.replaceState(null, "", id ? `/field?tech=${encodeURIComponent(id)}` : "/field"); };
  if (!ready) return null;
  return <div className="field">{tech ? <MyDay techId={tech} onSwitch={() => choose(null)} /> : <Pick onPick={choose} />}</div>;
}

function Header({ title, sub, onSwitch }: { title: string; sub?: string; onSwitch?: () => void }) {
  return (
    <header className="fd-top">
      <Logo height={26} />
      <span className="grow"><b>{title}</b>{sub && <em>{sub}</em>}</span>
      {onSwitch ? <button className="fd-switch" onClick={onSwitch}>Switch</button> : <Mark />}
    </header>
  );
}

function Pick({ onPick }: { onPick: (id: string) => void }) {
  const [fs, setFs] = useState<FS[]>([]);
  useEffect(() => { Promise.all(["kcps", "krsd", "kgia"].map((id) => fetch(`/api/fm?facility=${id}`).then((r) => r.json()))).then((xs) => setFs(xs.filter((x) => !x.error))).catch(() => undefined); }, []);
  return (
    <>
      <Header title="Field app" sub="Your personal AI agent on the job" />
      <main className="fd-main">
        <p className="fd-lead">Who are you? Pick your name once — this phone remembers it.</p>
        {fs.map((s) => (
          <section key={s.facility.id} className="fd-card">
            <div className="fd-label">{s.facility.name}</div>
            <ul className="fd-people">{s.technicians.filter((t) => t.shift !== "off").map((t) => <li key={t.id}><button onClick={() => onPick(t.id)}><b>{t.name}</b><em>{t.role} · {t.shift} shift</em></button></li>)}</ul>
          </section>
        ))}
        {!fs.length && <p className="muted">Loading…</p>}
      </main>
    </>
  );
}

function MyDay({ techId, onSwitch }: { techId: string; onSwitch: () => void }) {
  const [d, setD] = useState<Day | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"jobs" | "agent" | "report">("jobs");
  const [assets, setAssets] = useState<{ tag: string; name: string }[]>([]);
  const load = useCallback(() => { fetch(`/api/fm?tech=${encodeURIComponent(techId)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else { setD(j); setErr(""); } }).catch(() => setErr("No connection — showing the last jobs.")); }, [techId]);
  useEffect(load, [load]);
  // live: the control room, WhatsApp and the orchestrator change things — reload when the data changes
  useEffect(() => {
    let last = "", stop = false;
    const tick = async () => { if (stop) return; if (document.visibilityState === "visible") { try { const j = await fetch("/api/state/stamp", { cache: "no-store" }).then((r) => r.json()); if (last && j.v !== last) load(); last = j.v; } catch { /* offline */ } } setTimeout(tick, 4000); };
    tick(); return () => { stop = true; };
  }, [load]);
  useEffect(() => { if (d) fetch(`/api/fm?facility=${d.facility.id}`).then((r) => r.json()).then((s: FS) => setAssets((s.assets ?? []).map((a) => ({ tag: a.tag, name: a.name })))).catch(() => undefined); }, [d?.facility.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const doit = async (body: Record<string, unknown>) => {
    setMsg(null);
    try { const r = await fm({ ...body, by: d?.technician.name ?? "Field technician", facilityId: d?.facility.id }); setMsg({ text: r.message }); load(); navigator.vibrate?.(12); return true; }
    catch (e) { setMsg({ text: (e as Error).message, bad: true }); return false; }
  };
  if (err && !d) return <><Header title="Field app" onSwitch={onSwitch} /><main className="fd-main"><p className="fd-err">{err}</p></main></>;
  if (!d) return <><Header title="Field app" /><main className="fd-main"><p className="muted">Loading your day…</p></main></>;
  const t = d.technician, job = open ? d.jobs.find((j) => j.id === open) : undefined;
  const todo = d.jobs.filter((j) => j.status !== "done");
  return (
    <>
      <Header title={t.name} sub={`${t.role} · ${d.facility.name}`} onSwitch={onSwitch} />
      <main className="fd-main">
        {msg && <div className={msg.bad ? "fd-err" : "fd-ok"} role="status">{msg.text}</div>}
        <section className="fd-card fd-brief">
          <div className="fd-label">Your agent</div>
          <p>{d.brief}</p>
          <div className="fd-row"><Speak text={d.brief} />
            <select value={t.status} onChange={(e) => doit({ action: "tech_status", techId: t.id, techStatus: e.target.value })} aria-label="My status">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
        </section>
        {d.alarms.length > 0 && <section className="fd-card fd-alarm"><div className="fd-label">Alarms in {t.zone}</div>{d.alarms.map((a) => <p key={a.id}>⚠ {a.message}</p>)}</section>}

        {view === "jobs" && (
          <section className="fd-jobs">
            <div className="fd-label">My jobs · {todo.length} to do</div>
            {d.jobs.length === 0 && <p className="muted">No jobs assigned. Ask your agent what needs doing, or report a fault.</p>}
            {d.jobs.map((j, i) => (
              <button key={j.id} className={`fd-job ${j.status}${j.overdue ? " late" : ""}`} onClick={() => setOpen(j.id)}>
                <span className="fd-n">{j.status === "done" ? "✓" : i + 1}</span>
                <span className="grow"><b>{j.asset.tag} · {j.title.replace(/ — .*$/, "")}</b><em>{j.id} · {j.priority} · {j.asset.zone} · {j.status === "done" ? "done" : j.status === "in_progress" ? "in progress" : j.status === "on_hold" ? `on hold: ${j.holdReason ?? ""}` : j.overdue ? "past SLA" : j.type === "PM" ? `due ${j.due.slice(5)}` : `${Math.max(0, Math.round(j.slaLeft))} h left`}</em>
                  {j.permit && j.permit.status === "required" && <em className="fd-permit">Permit needed: {j.permit.type}</em>}</span>
              </button>
            ))}
          </section>
        )}
        {view === "agent" && <Agent day={d} />}
        {view === "report" && <Report day={d} assets={assets} onDone={() => setView("jobs")} doit={doit} />}
      </main>
      <nav className="fd-nav">
        <button className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>My jobs</button>
        <button className={view === "agent" ? "on" : ""} onClick={() => setView("agent")}>Ask my agent</button>
        <button className={view === "report" ? "on" : ""} onClick={() => setView("report")}>Report a fault</button>
      </nav>
      {job && <JobSheet job={job} day={d} onClose={() => setOpen(null)} doit={doit} />}
    </>
  );
}

function Speak({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  const play = async () => {
    if (on) { window.speechSynthesis?.cancel(); setOn(false); return; }
    setOn(true);
    try {
      const r = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: /[؀-ۿ]/.test(text) ? "ar" : "en" }) });
      if (r.ok) { const j = await r.json(); const a = new Audio(`data:audio/mpeg;base64,${j.audio}`); a.onended = () => setOn(false); await a.play(); return; }
    } catch { /* fall back to the phone's voice */ }
    const u = new SpeechSynthesisUtterance(text); u.onend = () => setOn(false); window.speechSynthesis?.speak(u);
  };
  return <button className="fd-btn fd-ghost" onClick={play}>{on ? "■ Stop" : "▶ Listen"}</button>;
}

function JobSheet({ job: j, day, onClose, doit }: { job: Job; day: Day; onClose: () => void; doit: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upd = async (b: Record<string, unknown>) => { setBusy(true); const ok = await doit({ action: "wo_update", woId: j.id, ...b }); setBusy(false); return ok; };
  const photo = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("locationId", "site"); fd.append("title", `${j.id} ${j.asset.tag} — photo`); fd.append("tags", `fm,${j.id},${j.asset.tag}`); fd.append("author", day.technician.name);
      const r = await fetch("/api/upload", { method: "POST", body: fd }).then((x) => x.json());
      if (r.doc?.id) await upd({ evidence: [r.doc.id], note: note.trim() || `Photo: ${r.doc.summary || r.doc.title}` });
    } finally { setBusy(false); }
  };
  const permitBlock = j.permit && j.permit.status === "required";
  return (
    <div className="fd-sheet" role="dialog" aria-label={j.id} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fd-sheet-in">
        <div className="fd-sheet-h"><b>{j.id}</b><button onClick={onClose} aria-label="Close">×</button></div>
        <h2>{j.asset.tag} · {j.asset.name}</h2>
        <p className="muted">{j.title} · {j.priority} · {j.asset.zone}</p>
        {j.detail && j.detail !== j.title && <p>{j.detail}</p>}
        {j.permit && <div className={`fd-permitbar ${j.permit.status}`}>{permitBlock ? `Do not start: a ${j.permit.type} permit is required and not issued yet.` : `${j.permit.type} permit ${j.permit.status}.`}</div>}
        <div className="fd-label">Checklist</div>
        <ul className="fd-check">{j.checklist.map((c, i) => <li key={i}><label><input type="checkbox" checked={c.done} disabled={busy || j.status === "done"} onChange={() => upd({ checklist: i })} />{c.text}</label></li>)}</ul>
        <div className="fd-label">Readings</div>
        <ul className="fd-read">{j.asset.readings.map((r) => { const out = (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low); return <li key={r.key} className={out ? "out" : ""}>{r.name}<b>{r.value} {r.unit}</b></li>; })}</ul>
        {j.notes.length > 0 && <><div className="fd-label">Notes</div><ul className="fd-notes">{j.notes.slice(-4).map((n, i) => <li key={i}><b>{n.by}</b> {n.text}</li>)}</ul></>}
        {j.evidence.length > 0 && <div className="fd-ev">{j.evidence.map((id) => <img key={id} src={`/api/file?id=${id}`} alt="" />)}</div>}
        {j.status !== "done" && (
          <>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find / do? (the agent files it on the job)" rows={2} />
            <div className="fd-acts">
              {j.status !== "in_progress" && <button className="fd-btn" disabled={busy || !!permitBlock} onClick={() => upd({ status: "in_progress", note: note.trim() || undefined }).then((ok) => ok && setNote(""))}>Start</button>}
              <button className="fd-btn fd-ghost" disabled={busy} onClick={() => file.current?.click()}>📷 Photo</button>
              {j.status !== "on_hold" && <button className="fd-btn fd-ghost" disabled={busy} onClick={() => upd({ status: "on_hold", holdReason: note.trim() || "Waiting", note: note.trim() || undefined }).then((ok) => ok && setNote(""))}>Hold</button>}
              <button className="fd-btn done" disabled={busy} onClick={() => upd({ status: "done", note: note.trim() || "Completed." }).then((ok) => { if (ok) { setNote(""); onClose(); } })}>Done</button>
            </div>
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>
    </div>
  );
}

function Report({ day, assets, onDone, doit }: { day: Day; assets: { tag: string; name: string }[]; onDone: () => void; doit: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [asset, setAsset] = useState("");
  const [what, setWhat] = useState("");
  const [stopped, setStopped] = useState(false);
  const [pr, setPr] = useState("P2");
  return (
    <section className="fd-card">
      <div className="fd-label">Report a fault</div>
      <label className="fd-f">Asset<input list="fd-assets" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="Tag or name, e.g. SWP-102" /></label>
      <datalist id="fd-assets">{assets.map((a) => <option key={a.tag} value={a.tag}>{a.name}</option>)}</datalist>
      <label className="fd-f">What is wrong<textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} placeholder="e.g. loud bearing noise, seal leaking" /></label>
      <label className="fd-c"><input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)} />It has stopped</label>
      <label className="fd-f">Urgency<select value={pr} onChange={(e) => setPr(e.target.value)}><option value="P1">P1 — output or safety (4 h)</option><option value="P2">P2 — critical system (24 h)</option><option value="P3">P3 — normal (72 h)</option><option value="P4">P4 — minor (7 days)</option></select></label>
      <button className="fd-btn" disabled={!asset.trim() || !what.trim()} onClick={() => doit({ action: "wo_create", asset, title: what.split(/[.\n]/)[0].slice(0, 80), detail: what, priority: pr, assetStatus: stopped ? "down" : "degraded", note: `Reported from the field by ${day.technician.name}.` }).then((ok) => { if (ok) { setAsset(""); setWhat(""); onDone(); } })}>Raise it</button>
      <p className="muted small">The orchestrator picks who takes it, checks spares and permits, and the control room sees it at once. You can also just tell your agent.</p>
    </section>
  );
}

function Agent({ day }: { day: Day }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string; err?: boolean }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next); setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => !m.err).map(({ role, content }) => ({ role, content })), author: day.technician.name, channel: "field", fm: { facilityId: day.facility.id, techId: day.technician.id } }) });
      const j = await r.json();
      setMsgs([...next, j.reply ? { role: "assistant", content: j.reply } : { role: "assistant", content: j.error ?? "No answer.", err: true }]);
    } catch { setMsgs([...next, { role: "assistant", content: "No connection — try again.", err: true }]); }
    finally { setBusy(false); }
  };
  const voice = useVoiceInput({ lang: "en", onFinal: (text) => ask(text), onError: () => undefined });
  const SUG = ["What should I do first?", "Is it safe to start my next job?", `${day.jobs[0]?.asset.tag ?? "The pump"} is making noise again`, "I finished my current job, seal replaced"];
  return (
    <section className="fd-card fd-agent">
      <div className="fd-label">Ask my agent</div>
      {msgs.length === 0 && <div className="fd-sugg">{SUG.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
      <ul className="fd-msgs">{msgs.map((m, i) => <li key={i} className={`${m.role}${m.err ? " err" : ""}`}>{m.content}</li>)}{busy && <li className="assistant busy">…</li>}</ul>
      <form className="fd-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <button type="button" className={`fd-mic${voice.state === "recording" ? " on" : ""}`} onClick={() => (voice.state === "recording" ? voice.stop() : voice.start())} aria-label="Speak">{voice.state === "recording" ? "■" : "🎙"}</button>
        <input value={voice.state === "recording" && voice.live ? voice.live : q} onChange={(e) => setQ(e.target.value)} placeholder={voice.state === "recording" ? "Listening…" : "Type or speak"} />
        <button className="fd-btn" disabled={busy || !q.trim()}>Send</button>
      </form>
    </section>
  );
}
