"use client";
/**
 * System check — is everything the demo depends on working right now? One screen, live checks, with the fix next
 * to anything that is not. Plus "Prepare today's brief" (EN + AR, narrated) and "Reset demo data", and the
 * rehearsal script. Reached from the profile sheet.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";

type Status = "ok" | "warn" | "fail";
interface Check { id: string; label: string; status: Status; detail: string; fix?: string; ms?: number }
interface Readiness { at: string; deep: boolean; checks: Check[]; score: { ok: number; warn: number; fail: number; total: number }; standalone?: boolean; error?: string }

const SCRIPT: [string, string][] = [
  ["Open on the phone", "Projects → Kinan Heights. The site map: pins are documents and issues; tap Tower A, then 3D to show the model being built day by day (▶ on the timeline)."],
  ["WhatsApp", "From an allowed phone: 'hi' → pick Kinan Heights → 'what's late on the critical path?' Then a photo of a slab with the caption 'Tower A L15 slab at 60%' → it is filed as evidence and the schedule moves. Then a voice note."],
  ["Project schedule", "Show the critical path, the Site updates list (the WhatsApp update you just sent is there, with the photo), then Procurement → packages at risk."],
  ["Documents", "Open a drawing, leave a note by voice (microphone), and show the photo you sent with its AI reading. Upload one of the sample site documents (RFI-0163) and ask what the engineer answered."],
  ["Ask the agent", "'Which deliveries are delayed this week and what do they block?' — answered from the data with the source named."],
  ["Briefs → ▶ Play", "Play today's brief (prepare it below first). Switch to العربية and play again. Ask the presenter a question by voice mid-way."],
  ["New project", "Open a project you generated earlier from a document pack (generate it before the meeting, not live — the Kinan Marina Walk sample pack takes 1–3 minutes), play its 4D, show What it read."],
];

export default function Readiness({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const [r, setR] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(async (deep = false) => {
    setBusy(deep ? "deep" : "load"); setMsg(null);
    try { const j = (await fetch(`/api/ready${deep ? "?deep=1" : ""}`, { cache: "no-store" }).then((x) => x.json())) as Readiness; if (j.error) setMsg({ text: j.error, bad: true }); else setR(j); }
    catch { setMsg({ text: "Could not reach the server.", bad: true }); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: "prepare" | "reset") => {
    setBusy(action); setMsg(null); setConfirm(false);
    try {
      const j = await fetch("/api/ready", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, by: "System check" }) }).then((x) => x.json());
      if (j.error) { setMsg({ text: j.error, bad: true }); return; }
      if (action === "prepare") setMsg({ text: `Today's brief is built and narrated in English and Arabic — Briefs → ▶ Play opens instantly.` });
      else { setMsg({ text: `Demo data reset: ${j.reset.docs} seeded documents, ${j.reset.notes} notes, data date ${j.reset.dataDate}.` }); onReset(); }
      await load();
    } catch { setMsg({ text: "Network error — try again.", bad: true }); }
    finally { setBusy(null); }
  };
  const pct = r ? Math.round(((r.score.ok + r.score.warn * 0.5) / Math.max(1, r.score.total)) * 100) : null;
  const tone = r ? (r.score.fail ? "bad" : r.score.warn ? "warn" : "good") : "";
  return (
    <div className="home ready">
      <button className="crumb" onClick={onBack}><Icon name="back" />Back</button>
      <div className="home-head"><div><h1>System check</h1><p>Everything the demo depends on, checked live. Red needs fixing before the meeting; amber is a choice; green is ready.</p></div></div>
      {msg && <div className={msg.bad ? "studio-err" : "studio-ok"} role="status">{msg.text}</div>}
      {r?.standalone && <div className="rpt-alert">This is the standalone file: there is no server to check. Open the deployed app for the full check.</div>}
      <div className="ready-top">
        <div className={"ready-score " + tone}><b>{pct ?? "…"}</b><span>{r ? `${r.score.ok} ready · ${r.score.warn} to decide · ${r.score.fail} to fix` : "checking…"}</span>{r && <em>{r.deep ? "deep check" : "quick check"} · {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</em>}</div>
        <div className="ready-acts">
          <button className="studio-add" disabled={!!busy || !!r?.standalone} onClick={() => load(true)}>{busy === "deep" ? "Calling the AI and ElevenLabs…" : "Deep check: real AI call + speech"}</button>
          <button className="studio-add" disabled={!!busy || !!r?.standalone} onClick={() => act("prepare")}>{busy === "prepare" ? "Building and narrating (up to 2 min)…" : "Prepare today's brief (EN + AR)"}</button>
          {!confirm ? <button className="studio-back" disabled={!!busy || !!r?.standalone} onClick={() => setConfirm(true)}>Reset demo data…</button>
            : <span className="ready-confirm">Uploads, notes, pins and site updates will go; briefs stay. <button className="studio-go" disabled={!!busy} onClick={() => act("reset")}>{busy === "reset" ? "Resetting…" : "Yes, reset"}</button><button className="mini" onClick={() => setConfirm(false)}>Keep</button></span>}
          <button className="mini" disabled={!!busy} onClick={() => load(false)}>Re-check</button>
        </div>
      </div>
      <ul className="ready-list">
        {(r?.checks ?? []).map((c) => (
          <li key={c.id} className={c.status}>
            <span className="st" aria-hidden="true">{c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✕"}</span>
            <span className="t"><b>{c.label}</b><em>{c.detail}</em>{c.fix && <i>{c.fix}</i>}</span>
          </li>
        ))}
        {!r && !msg && <li className="empty">Checking…</li>}
      </ul>
      <div className="lbl">Rehearsal script <span className="dd">seven stops, about twelve minutes</span></div>
      <ol className="ready-script">{SCRIPT.map(([h, t]) => <li key={h}><b>{h}</b><span>{t}</span></li>)}</ol>
      <p className="muted small">The demo data follows the calendar: rehearse the day before, not the week before. Generate any document-pack project before the meeting and keep it — it is saved on this device and synced to the server.</p>
    </div>
  );
}
