"use client";
import { useEffect, useRef, useState } from "react";
import type { RouteInfo, UiAction } from "@/lib/types";
import type { ChatItem, ClientDoc } from "./site";
import { speak, useSpeech } from "./useSpeech";
import { Icon } from "./icons";

interface Props {
  items: ChatItem[];
  busy: boolean;
  providers: ("anthropic" | "openai")[];
  docs: ClientDoc[];
  hereName?: string;
  onSend: (t: string) => void;
  onClear: () => void;
  onAction: (a: UiAction) => void;
}

const SUGGEST = [
  "What's the slab thickness and PT detail on Tower A level 12?",
  "What's late on Tower A and why does it matter for topping out?",
  "Look-ahead for the next 2 weeks",
  "Which deliveries are arriving this week, and any delayed?",
  "PPE and permits needed for hot work at the podium atrium",
  "What does SBC 801 require for refuge floors, and are we compliant?",
  "Which procurement packages are at risk?",
  "Show me the Tower A L12 slab drawing",
  "Leave a note on Laydown 2: pipe stacks re-stacked, verify tomorrow",
];
const PNAME: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", offline: "Offline" };
function RouteBadge({ r }: { r?: RouteInfo }) {
  if (!r) return null;
  return (
    <div className={"route " + r.provider} title={r.reason}>
      {r.provider === "offline" ? "⚙ offline keyword assistant" : `${r.provider === "anthropic" ? "✳" : "◎"} ${PNAME[r.provider]} · ${r.model} · ${r.tier}`}
      {r.ms ? ` · ${(r.ms / 1000).toFixed(1)} s` : ""}
      {r.fallbackFrom?.length ? <em> · fell back from {r.fallbackFrom.map((f) => PNAME[f.provider] ?? f.provider).join(", ")}</em> : null}
    </div>
  );
}

export default function AgentChat({ items, busy, providers, docs, hereName, onSend, onClear, onAction }: Props) {
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
        <span className={"dot " + (providers.length ? "ai" : "offline")} /> <span className="nm">{providers.length ? providers.map((p) => PNAME[p]).join(" + ") : "Offline assistant"}</span>
        {hereName && <span className="here">📍 {hereName}</span>}
        <span className="sp" />
        <button className={"mini" + (talk ? " on" : "")} onClick={() => setTalk((t) => !t)} aria-pressed={talk}><Icon name="speaker" />{talk ? "Voice on" : "Voice off"}</button>
        {items.length > 0 && <button className="mini" onClick={onClear}>Clear</button>}
      </div>
      <div className="msgs">
        {items.length === 0 && (
          <div className="welcome">
            <h3>Ask anything about the project</h3>
            <p>Ask about drawings, specs, the programme, procurement, safety rules and regulations. I answer from the project data and file notes in the right place. Tap the microphone to talk.</p>
            <div className="sugg">{SUGGEST.map((s) => <button key={s} onClick={() => onSend(s)}>{s}</button>)}</div>
          </div>
        )}
        {items.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="bubble">{m.content}</div>
            {m.role === "assistant" && <RouteBadge r={m.route} />}
            {m.actions && m.actions.length > 0 && (
              <div className="acts">{m.actions.map((a, j) => <button key={j} onClick={() => onAction(a)}><Icon name={a.type === "open_doc" ? "drawing" : "map"} />{label(a)}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="bubble typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      <div className="composer chatbar">
        {speech.error && <div className="err">{speech.error}</div>}
        <div className="row">
          {speech.supported && <button className={"mic big" + (speech.listening ? " live" : "")} onClick={speech.toggle} aria-label="Talk to agent"><Icon name="mic" /></button>}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.listening ? "Listening…" : "Ask or say “note: …”"}
            onKeyDown={(e) => { if (e.key === "Enter") { onSend(text); setText(""); } }} />
          <button onClick={() => { onSend(text); setText(""); }} disabled={!text.trim() || busy}>Send</button>
        </div>
      </div>
    </div>
  );
}
