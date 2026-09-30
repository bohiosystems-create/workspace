"use client";
import { useEffect, useRef, useState } from "react";
import type { UiAction } from "@/lib/types";
import type { ChatItem, ClientDoc } from "./site";
import { speak, useSpeech } from "./useSpeech";

interface Props {
  items: ChatItem[];
  busy: boolean;
  mode: "claude" | "offline";
  docs: ClientDoc[];
  hereName?: string;
  onSend: (t: string) => void;
  onClear: () => void;
  onAction: (a: UiAction) => void;
}

const SUGGEST = [
  "What's the slab thickness and PT detail on Tower A level 12?",
  "Show me the latest drawings for Tower A level 12",
  "Any open RFIs or issues at Tower B?",
  "What's the status of the podium atrium?",
  "Leave a note on Laydown 2: pipe stacks re-stacked, verify tomorrow",
  "Which permits are active today?",
];

export default function AgentChat({ items, busy, mode, docs, hereName, onSend, onClear, onAction }: Props) {
  const [text, setText] = useState("");
  const [talk, setTalk] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const spoken = useRef(items.length);
  const speech = useSpeech((t, fin) => { setText(t); if (fin) { onSend(t); setText(""); } });

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items.length, busy]);
  useEffect(() => {
    if (talk && items.length > spoken.current) {
      const last = items[items.length - 1];
      if (last.role === "assistant") speak(last.content);
    }
    spoken.current = items.length;
  }, [items, talk]);

  const label = (a: UiAction) =>
    a.type === "open_doc" ? `Open ${docs.find((d) => d.id === a.docId)?.title ?? "document"}` : "Show on map";

  return (
    <div className="chat">
      <div className="chat-h">
        <span className={"dot " + mode} /> <span className="nm">{mode === "claude" ? "Site Agent" : "Site Agent · offline"}</span>
        {hereName && <span className="here">📍 {hereName}</span>}
        <span className="sp" />
        <button className={"mini" + (talk ? " on" : "")} onClick={() => setTalk((t) => !t)} aria-pressed={talk}>🔊 {talk ? "Voice on" : "Voice off"}</button>
        {items.length > 0 && <button className="mini" onClick={onClear}>Clear</button>}
      </div>
      <div className="msgs">
        {items.length === 0 && (
          <div className="welcome">
            <h3>Ask anything about the project</h3>
            <p>I can pull up drawings, specs, RFIs and inspections, answer from them, and leave notes on the right document or place. Tap 🎙 to talk.</p>
            <div className="sugg">{SUGGEST.map((s) => <button key={s} onClick={() => onSend(s)}>{s}</button>)}</div>
          </div>
        )}
        {items.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="bubble">{m.content}</div>
            {m.actions && m.actions.length > 0 && (
              <div className="acts">{m.actions.map((a, j) => <button key={j} onClick={() => onAction(a)}>{a.type === "open_doc" ? "📐" : "🗺"} {label(a)}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="bubble typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      <div className="composer chatbar">
        {speech.error && <div className="err">{speech.error}</div>}
        <div className="row">
          {speech.supported && <button className={"mic big" + (speech.listening ? " live" : "")} onClick={speech.toggle} aria-label="Talk to agent">🎙</button>}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.listening ? "Listening…" : "Ask or say “note: …”"}
            onKeyDown={(e) => { if (e.key === "Enter") { onSend(text); setText(""); } }} />
          <button onClick={() => { onSend(text); setText(""); }} disabled={!text.trim() || busy}>Send</button>
        </div>
      </div>
    </div>
  );
}
