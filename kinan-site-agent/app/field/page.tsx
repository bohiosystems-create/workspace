"use client";
/**
 * The field app: one technician's phone. Their own AI agent greets them with the day, lists their jobs in the order to
 * do them, keeps them safe (permits before work), and records what they do — start, pause, tick the checklist, close
 * with a note and photos, report a fault — by tap, by typing or by voice. Every change reaches the control room at
 * once, and the control room's changes (a new job, an approval) appear here without a refresh.
 * Offline first: with no signal the day opens from the phone's last copy, and every change waits in the outbox
 * (outbox.ts) until signal returns. A service worker keeps the app itself on the phone.
 *   /field                 sign in with your phone number (or, in a demo, pick a person) — your own day
 *   /field?tech=<id>       a supervisor or manager looking at one person's day (the control room's Team tab)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { facilityState, myDay } from "@/lib/fm/api";
import { Logo, Mark } from "../_components/icons";
import { useVoiceInput } from "../_components/deck/useVoiceInput";
import { SignInPanel, signOut, useMe, type Me } from "../_components/auth";
import { HAS_OPERATIONS } from "@/lib/edition";
import { enqueue, flush, isOffline, loadDay, newCid, pending, saveDay, type OutItem } from "./outbox";

type Day = ReturnType<typeof myDay>;
type Job = Day["jobs"][number];
type FS = ReturnType<typeof facilityState>;
const STATUS: [string, string][] = [["available", "Available"], ["on_job", "On a job"], ["travelling", "Travelling"], ["break", "Break"]];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Field() {
  // the field app belongs to facility operations: in an edition without them it says so
  if (!HAS_OPERATIONS) return <div className="field"><Header title="Field app" /><main className="fd-main"><p className="fd-lead">{"The technicians' field app is part of facility operations, which this edition doesn't include."}</p><button className="fd-btn" onClick={() => location.assign("/")}>Open the Onsite Agent</button></main></div>;
  return <FieldApp />;
}
function FieldApp() {
  const { me, auth } = useMe();
  const [asTech, setAsTech] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setAsTech(new URLSearchParams(window.location.search).get("tech"));
    setReady(true);
    try { const th = localStorage.getItem("kinan.theme") || "light"; if (th !== "auto") document.documentElement.dataset.theme = th; } catch { /* */ }
    // keep the app itself on the phone for when there is no signal
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("/field-sw.js").catch(() => undefined);
  }, []);
  const view = (id: string | null) => { setAsTech(id); history.replaceState(null, "", id ? `/field?tech=${encodeURIComponent(id)}` : "/field"); };
  if (!ready || me === undefined) return <div className="field"><Header title="Field app" /><main className="fd-main"><p className="muted">Loading…</p></main></div>;
  // signed out: no signal and a day on the phone still opens (the outbox sends once signed in and online)
  if (!me) return <div className="field"><SignInScreen auth={auth} hint={asTech} /></div>;
  const lead = me.role !== "field";
  const tech = asTech && (lead || asTech === me.techId) ? asTech : me.techId ?? null;
  return (
    <div className="field">
      {tech ? <MyDay techId={tech} me={me} viewing={tech !== me.techId} onSwitch={lead ? () => view(null) : undefined} /> : <Pick me={me} onPick={view} />}
    </div>
  );
}

function Header({ title, sub, onSwitch, onOut }: { title: string; sub?: string; onSwitch?: () => void; onOut?: () => void }) {
  return (
    <header className="fd-top">
      <Logo height={26} />
      <span className="grow"><b>{title}</b>{sub && <em>{sub}</em>}</span>
      {onSwitch && <button className="fd-switch" onClick={onSwitch}>Team</button>}
      {onOut ? <button className="fd-switch" onClick={onOut}>Sign out</button> : !onSwitch && <span className="fd-mark" aria-hidden="true"><Mark /></span>}
    </header>
  );
}

function SignInScreen({ auth, hint }: { auth: Parameters<typeof SignInPanel>[0]["auth"]; hint: string | null }) {
  return (
    <>
      <Header title="Field app" sub="Your personal AI agent on the job" />
      <main className="fd-main">
        <p className="fd-lead">Sign in with your phone number: your jobs, your permits, your agent.</p>
        <section className="fd-card"><SignInPanel auth={auth} onDone={() => undefined} only={(p) => p.domain !== "site" && (!hint || !p.techId || p.facilityId === hint.split(":")[0])} /></section>
      </main>
    </>
  );
}

/** Supervisors and managers: whose day to look at (their own facility; everyone for a director). */
function Pick({ me, onPick }: { me: Me; onPick: (id: string) => void }) {
  const [fs, setFs] = useState<FS[]>([]);
  useEffect(() => { Promise.all(["kcps", "krsd", "kgia"].filter((id) => !me.facilityId || id === me.facilityId).map((id) => fetch(`/api/fm?facility=${id}`).then((r) => r.json()))).then((xs) => setFs(xs.filter((x) => !x.error))).catch(() => undefined); }, [me.facilityId]);
  return (
    <>
      <Header title={me.name} sub={`${me.title} · ${me.roleLabel}`} onOut={() => signOut()} />
      <main className="fd-main">
        <p className="fd-lead">Whose day do you want to see?</p>
        {fs.map((s) => (
          <section key={s.facility.id} className="fd-card">
            <div className="fd-label">{s.facility.name}</div>
            <ul className="fd-people">{s.technicians.filter((t) => t.shift !== "off").map((t) => <li key={t.id}><button onClick={() => onPick(t.id)}><b>{t.name}</b><em>{t.role} · {t.shift} shift · {t.load} open job{t.load === 1 ? "" : "s"}</em></button></li>)}</ul>
          </section>
        ))}
        {!fs.length && <p className="muted">Loading…</p>}
      </main>
    </>
  );
}

/** What a change looks like on the phone before the server has it. */
function applyLocal(d: Day, b: Record<string, unknown>): Day {
  if (b.action === "tech_status") return { ...d, technician: { ...d.technician, status: b.techStatus as Day["technician"]["status"] } };
  if (b.action !== "wo_update") return d;
  return { ...d, jobs: d.jobs.map((j) => {
    if (j.id !== b.woId) return j;
    const n = { ...j, checklist: j.checklist.map((c) => ({ ...c })), notes: [...j.notes] };
    if (b.status) n.status = b.status as Job["status"];
    if (b.status === "on_hold") n.holdReason = String(b.holdReason ?? "Waiting");
    if (typeof b.checklist === "number" && n.checklist[b.checklist]) n.checklist[b.checklist].done = !n.checklist[b.checklist].done;
    if (b.status === "done") n.checklist.forEach((c) => (c.done = true));
    if (b.note) n.notes.push({ at: new Date().toISOString(), by: String(b.by ?? "Me"), text: String(b.note), via: "field (waiting to send)" });
    return n;
  }) };
}

function MyDay({ techId, me, viewing, onSwitch }: { techId: string; me: Me; viewing: boolean; onSwitch?: () => void }) {
  const [d, setD] = useState<Day | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"jobs" | "agent" | "report">("jobs");
  const [assets, setAssets] = useState<{ tag: string; name: string }[]>([]);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<OutItem[]>([]);
  const refreshQueue = useCallback(() => pending().then(setQueue), []);
  const load = useCallback(() => {
    fetch(`/api/fm?tech=${encodeURIComponent(techId)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); return; }
      // what is still in the outbox stays visible on top of the server's copy
      pending().then((q) => { setD(q.reduce((x, it) => applyLocal(x, it.body), j as Day)); setQueue(q); });
      saveDay(techId, j); setCachedAt(null); setErr("");
    }).catch(() => {
      const c = loadDay<Day>(techId);
      if (c) { pending().then((q) => { setD(q.reduce((x, it) => applyLocal(x, it.body), c.day)); setQueue(q); }); setCachedAt(c.at); }
      else setErr("No signal, and this phone has no copy of your day yet. It will load when there is signal.");
    });
  }, [techId]);
  useEffect(load, [load]);
  // send what is waiting, whenever signal comes back (and every 15 s while something waits)
  const send = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await flush();
    if (r.sent || r.refused.length) { setMsg(r.refused.length ? { text: `Not accepted: ${r.refused.map((x) => `${x.label} — ${x.error}`).join("; ")}`, bad: true } : { text: `Sent ${r.sent} change${r.sent > 1 ? "s" : ""} saved while offline.` }); load(); }
    refreshQueue();
  }, [load, refreshQueue]);
  useEffect(() => {
    const on = () => { setOnline(true); send(); }, off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const id = setInterval(() => { if (navigator.onLine) pending().then((q) => { if (q.length) send(); }); }, 15000);
    send();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(id); };
  }, [send]);
  // live: the control room, WhatsApp and the orchestrator change things — reload when the data changes
  useEffect(() => {
    let last = "", stop = false;
    const tick = async () => { if (stop) return; if (document.visibilityState === "visible") { try { const j = await fetch("/api/state/stamp", { cache: "no-store" }).then((r) => r.json()); if (last && j.v !== last) load(); last = j.v; } catch { /* offline */ } } setTimeout(tick, 4000); };
    tick(); return () => { stop = true; };
  }, [load]);
  useEffect(() => { if (d) fetch(`/api/fm?facility=${d.facility.id}`).then((r) => r.json()).then((s: FS) => setAssets((s.assets ?? []).map((a) => ({ tag: a.tag, name: a.name })))).catch(() => undefined); }, [d?.facility.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One change: sent now when there is signal, kept in the outbox when not. */
  const doit = async (body: Record<string, unknown>, label: string, photo?: OutItem["photo"]) => {
    setMsg(null);
    const it: OutItem = { cid: newCid(), at: new Date().toISOString(), label, body: { channel: "field", by: me.name, facilityId: d?.facility.id, ...body }, ...(photo ? { photo } : {}) };
    const keep = async () => { await enqueue(it); setD((x) => (x ? applyLocal(x, it.body) : x)); refreshQueue(); setMsg({ text: `No signal — “${label}” is saved on the phone and sends by itself when signal returns.` }); navigator.vibrate?.(12); return true; };
    if (!navigator.onLine || photo) {
      // photos always go through the outbox (big uploads on weak signal), then straight out if we can
      if (photo && navigator.onLine) { await enqueue(it); setD((x) => (x ? applyLocal(x, it.body) : x)); await send(); return true; }
      return keep();
    }
    try {
      const r = await fetch("/api/fm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...it.body, cid: it.cid }) });
      const j = await r.json().catch(() => ({}));
      if (r.status >= 500) return keep();
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed.");
      setMsg({ text: j.message }); load(); navigator.vibrate?.(12); return true;
    } catch (e) {
      if (isOffline(e)) return keep();
      setMsg({ text: (e as Error).message, bad: true }); return false;
    }
  };
  if (err && !d) return <><Header title="Field app" onSwitch={onSwitch} onOut={() => signOut()} /><main className="fd-main"><p className="fd-err">{err}</p></main></>;
  if (!d) return <><Header title="Field app" /><main className="fd-main"><p className="muted">Loading your day…</p></main></>;
  const t = d.technician, job = open ? d.jobs.find((j) => j.id === open) : undefined;
  const todo = d.jobs.filter((j) => j.status !== "done");
  const waiting = new Set(queue.map((q) => String(q.body.woId ?? "")));
  return (
    <>
      <Header title={t.name} sub={`${t.role} · ${d.facility.name}${viewing ? ` · viewed by ${me.name}` : ""}`} onSwitch={onSwitch} onOut={onSwitch ? undefined : () => signOut()} />
      <main className="fd-main">
        {(!online || cachedAt || queue.length > 0) && (
          <div className={`fd-net${online ? "" : " off"}`} role="status">
            <span className="grow">{!online ? "No signal — you can keep working." : cachedAt ? `Showing your day from ${hhmm(cachedAt)}.` : "Back online."}
              {queue.length > 0 && <em>{queue.length} change{queue.length > 1 ? "s" : ""} waiting to send: {queue.slice(0, 3).map((q) => q.label).join(", ")}{queue.length > 3 ? "…" : ""}</em>}</span>
            {online && queue.length > 0 && <button className="fd-btn fd-ghost" onClick={send}>Send now</button>}
          </div>
        )}
        {msg && <div className={msg.bad ? "fd-err" : "fd-ok"} role="status">{msg.text}</div>}
        <section className="fd-card fd-brief">
          <div className="fd-label">Your agent</div>
          <p>{d.brief}</p>
          <div className="fd-row"><Speak text={d.brief} />
            <select value={t.status} onChange={(e) => doit({ action: "tech_status", techId: t.id, techStatus: e.target.value }, `status: ${e.target.value.replace("_", " ")}`)} aria-label="My status">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
        </section>
        {d.alarms.length > 0 && <section className="fd-card fd-alarm"><div className="fd-label">Alarms in {t.zone}</div>{d.alarms.map((a) => <p key={a.id}>⚠ {a.message}</p>)}</section>}

        {view === "jobs" && (
          <section className="fd-jobs">
            <div className="fd-label">{viewing ? `${t.name.split(" ")[0]}'s jobs` : "My jobs"} · {todo.length} to do</div>
            {d.jobs.length === 0 && <p className="muted">No jobs assigned. Ask your agent what needs doing, or report a fault.</p>}
            {d.jobs.map((j, i) => (
              <button key={j.id} className={`fd-job ${j.status}${j.overdue ? " late" : ""}`} onClick={() => setOpen(j.id)}>
                <span className="fd-n">{j.status === "done" ? "✓" : i + 1}</span>
                <span className="grow"><b>{j.asset.tag} · {j.title.replace(/ — .*$/, "")}</b><em>{j.id} · {j.priority} · {j.asset.zone} · {j.status === "done" ? "done" : j.status === "in_progress" ? "in progress" : j.status === "on_hold" ? `on hold: ${j.holdReason ?? ""}` : j.overdue ? "past SLA" : j.type === "PM" ? `due ${j.due.slice(5)}` : `${Math.max(0, Math.round(j.slaLeft))} h left`}</em>
                  {j.permit && j.permit.status === "required" && <em className="fd-permit">Permit needed: {j.permit.type}</em>}
                  {waiting.has(j.id) && <em className="fd-wait">Saved on the phone · waiting to send</em>}</span>
              </button>
            ))}
          </section>
        )}
        {view === "agent" && <Agent day={d} online={online} />}
        {view === "report" && <Report day={d} assets={assets} onDone={() => setView("jobs")} doit={doit} />}
      </main>
      <nav className="fd-nav">
        <button className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>My jobs</button>
        <button className={view === "agent" ? "on" : ""} onClick={() => setView("agent")}>Ask my agent</button>
        <button className={view === "report" ? "on" : ""} onClick={() => setView("report")}>Report a fault</button>
      </nav>
      {job && <JobSheet job={job} day={d} me={me} onClose={() => setOpen(null)} doit={doit} />}
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

type DoIt = (b: Record<string, unknown>, label: string, photo?: OutItem["photo"]) => Promise<boolean>;
function JobSheet({ job: j, day, me, onClose, doit }: { job: Job; day: Day; me: Me; onClose: () => void; doit: DoIt }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upd = async (b: Record<string, unknown>, label: string) => { setBusy(true); const ok = await doit({ action: "wo_update", woId: j.id, ...b }, `${j.id} ${label}`); setBusy(false); return ok; };
  // the photo goes through the outbox: uploaded now if there is signal, later if not
  const photo = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { await doit({ action: "wo_update", woId: j.id, note: note.trim() || `Photo from the field (${me.name}).` }, `${j.id} photo`, { blob: f, name: f.name || "photo.jpg", title: `${j.id} ${j.asset.tag} — photo`, tags: `fm,${j.id},${j.asset.tag}`, author: day.technician.name }); setNote(""); }
    finally { setBusy(false); }
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
        <ul className="fd-check">{j.checklist.map((c, i) => <li key={i}><label><input type="checkbox" checked={c.done} disabled={busy || j.status === "done"} onChange={() => upd({ checklist: i }, `step ${i + 1}`)} />{c.text}</label></li>)}</ul>
        <div className="fd-label">Readings</div>
        <ul className="fd-read">{j.asset.readings.map((r) => { const out = (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low); return <li key={r.key} className={out ? "out" : ""}>{r.name}<b>{r.value} {r.unit}</b></li>; })}</ul>
        {j.notes.length > 0 && <><div className="fd-label">Notes</div><ul className="fd-notes">{j.notes.slice(-4).map((n, i) => <li key={i}><b>{n.by}</b> {n.text}</li>)}</ul></>}
        {j.evidence.length > 0 && <div className="fd-ev">{j.evidence.map((id) => <img key={id} src={`/api/file?id=${id}`} alt="" />)}</div>}
        {j.status !== "done" && (
          <>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find / do? (the agent files it on the job)" rows={2} />
            <div className="fd-acts">
              {j.status !== "in_progress" && <button className="fd-btn" disabled={busy || !!permitBlock} onClick={() => upd({ status: "in_progress", note: note.trim() || undefined }, "started").then((ok) => ok && setNote(""))}>Start</button>}
              <button className="fd-btn fd-ghost" disabled={busy} onClick={() => file.current?.click()}>📷 Photo</button>
              {j.status !== "on_hold" && <button className="fd-btn fd-ghost" disabled={busy} onClick={() => upd({ status: "on_hold", holdReason: note.trim() || "Waiting", note: note.trim() || undefined }, "on hold").then((ok) => ok && setNote(""))}>Hold</button>}
              <button className="fd-btn done" disabled={busy} onClick={() => upd({ status: "done", note: note.trim() || "Completed." }, "done").then((ok) => { if (ok) { setNote(""); onClose(); } })}>Done</button>
            </div>
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>
    </div>
  );
}

function Report({ day, assets, onDone, doit }: { day: Day; assets: { tag: string; name: string }[]; onDone: () => void; doit: DoIt }) {
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
      <button className="fd-btn" disabled={!asset.trim() || !what.trim()} onClick={() => doit({ action: "wo_create", asset, title: what.split(/[.\n]/)[0].slice(0, 80), detail: what, priority: pr, assetStatus: stopped ? "down" : "degraded", note: `Reported from the field by ${day.technician.name}.` }, `fault on ${asset}`).then((ok) => { if (ok) { setAsset(""); setWhat(""); onDone(); } })}>Raise it</button>
      <p className="muted small">The orchestrator picks who takes it, checks spares and permits, and the control room sees it at once. You can also just tell your agent.</p>
    </section>
  );
}

function Agent({ day, online }: { day: Day; online: boolean }) {
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
      {!online && <p className="fd-err">Your agent needs signal. Job updates, photos and fault reports still work — they wait on the phone and send themselves.</p>}
      {msgs.length === 0 && <div className="fd-sugg">{SUG.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
      <ul className="fd-msgs">{msgs.map((m, i) => <li key={i} className={`${m.role}${m.err ? " err" : ""}`}>{m.content}</li>)}{busy && <li className="assistant busy">…</li>}</ul>
      <form className="fd-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <button type="button" className={`fd-mic${voice.state === "recording" ? " on" : ""}`} onClick={() => (voice.state === "recording" ? voice.stop() : voice.start())} aria-label="Speak">{voice.state === "recording" ? "■" : "🎙"}</button>
        <input value={voice.state === "recording" && voice.live ? voice.live : q} onChange={(e) => setQ(e.target.value)} placeholder={voice.state === "recording" ? "Listening…" : "Type or speak"} />
        <button className="fd-btn" disabled={busy || !q.trim() || !online}>Send</button>
      </form>
    </section>
  );
}
