"use client";
/**
 * Ask the Onsite Agent — the same chat drawer as the other Kinan agents (orange button bottom-right, charcoal head,
 * replies with an orange rule). Every answer comes from the AI API through /api/chat: the agent reads the documents,
 * programme, procurement, safety, regulations and drawings with its tools, and names its sources. There is no
 * keyword fallback here; when the AI service can't answer, the chat says so and the question can be sent again.
 */
import { useEffect, useRef, useState } from "react";
import type { RouteInfo, UiAction } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; route?: RouteInfo; error?: boolean };
interface Props {
  author: string;
  focus?: { docId?: string; locationId?: string };
  /** where the user is in the app: on "map" the button is in the map's control column instead */
  place: string;
  onAction: (a: UiAction) => void;
}

const SUGGESTIONS = [
  "What is late on the critical path?",
  "Which deliveries are delayed this week?",
  "What permits are live today?",
  "Latest revision of the Tower A L12 slab drawing?",
  "Which packages are at risk and why?",
  "What's open on Hotel C?",
  "Heat stress rules for today's pour?",
  "Summarise progress against the baseline",
];

// Light markdown: **bold**, "- " / "• " bullets, line breaks.
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  return <>{text.split("\n").map((l, i) => /^\s*[-•*]\s+/.test(l) ? <div key={i} className="kb">{bold(l.replace(/^\s*[-•*]\s+/, ""))}</div> : l.trim() === "" ? <div key={i} className="ksp" /> : <div key={i}>{bold(l.replace(/^#+\s*/, ""))}</div>)}</>;
}
const who = (r?: RouteInfo) => r ? `${r.provider === "anthropic" ? "Claude" : r.provider === "openai" ? "OpenAI" : r.provider} · ${r.model}` : "";

export default function Chat({ author, focus, place, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem("kinan.chat"); if (s) setMsgs(JSON.parse(s)); } catch { /* storage blocked */ } }, []);
  useEffect(() => { try { sessionStorage.setItem("kinan.chat", JSON.stringify(msgs.slice(-40))); } catch { /* storage blocked */ } }, [msgs]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 60); }, [open]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const show = () => setOpen(true); // the map's own "Ask AI" button
    window.addEventListener("keydown", esc); window.addEventListener("open-chat", show);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("open-chat", show); };
  }, []);
  useEffect(() => { if (!busy) return; setSecs(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [busy]);

  async function ask(text: string, base = msgs) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...base, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        // failed turns are not sent back to the model as context
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), author, focus }),
      });
      const d = (await r.json().catch(() => ({}))) as { reply?: string; actions?: UiAction[]; route?: RouteInfo; error?: string };
      if (!r.ok || d.error || !d.reply) throw new Error(d.error || "The AI service did not answer. Try again in a moment.");
      setMsgs([...next, { role: "assistant", content: d.reply, route: d.route }]);
      for (const a of d.actions ?? []) onAction(a);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: (e as Error).message || "Network error — try again.", error: true }]);
    } finally { setBusy(false); }
  }
  const retry = (i: number) => { const q = msgs[i - 1]; if (q?.role === "user") ask(q.content, msgs.slice(0, i - 1)); };

  // on the site map the button sits in the map's control column (SiteMap), elsewhere it floats bottom-right
  if (!open) return place === "map" ? null : (
    <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask the Onsite Agent">Ask the agent</button>
  );
  return (
    <div className={"chat-drawer" + (full ? " full" : "")} role="dialog" aria-label="Onsite Agent chat">
      <div className="chat-head">
        <span className="dot" aria-hidden="true" />
        <span className="chat-title">Onsite Agent · AI</span>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} disabled={busy} title="Start a new conversation">New</button>}
        <button className="chat-size" onClick={() => setFull((f) => !f)} aria-label={full ? "Smaller" : "Full screen"} title={full ? "Smaller" : "Full screen"}>{full ? "⤡" : "⤢"}</button>
        <button onClick={() => setOpen(false)} aria-label="Close the chat">✕</button>
      </div>
      <div className="chat-log" ref={log} aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-intro">
            <p>Ask about Kinan Heights: the programme and critical path, deliveries and packages, permits and safety, drawings and revisions, regulations, or any document on the site.</p>
            <p className="chat-note">Answered by AI from the project data, with the source named.{focus?.locationId || focus?.docId ? " It knows what you have open." : ""}</p>
            <div className="chat-sugg">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"kmsg " + (m.role === "user" ? "user" : "bot") + (m.error ? " err" : "")}>
            {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
            {m.route && <div className="kmeta">{who(m.route)}</div>}
            {m.error && <button className="kretry" onClick={() => retry(i)} disabled={busy}>Ask again</button>}
          </div>
        ))}
        {busy && <div className="kmsg bot busy"><span className="kdots"><i /><i /><i /></span> Checking the project data{secs >= 4 ? ` · ${secs}s` : "…"}</div>}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <textarea ref={field} rows={1} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the Onsite Agent…" disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }} aria-label="Your question" />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
