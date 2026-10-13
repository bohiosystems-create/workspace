"use client";
// ▶ Play — a brief as a narrated presentation: the marketing agent's DeckPlayer (animated Kinan slides, ElevenLabs
// voice in English or Arabic through /api/voice, captions, questions by voice). The deck rides inside the stored brief
// HTML (lib/reports/engine.ts); the e-mail drops it.
import { useMemo } from "react";
import { deckFromHtml } from "@/lib/deck/deck";
import { DeckPlayer } from "./DeckPlayer";
import { setDeckLang } from "./lang";

export default function ReportPlayer({ html, onClose }: { html: string; onClose: () => void }) {
  const deck = useMemo(() => deckFromHtml(html), [html]);
  if (!deck) return (
    <div role="dialog" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(46,46,47,.8)", display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", padding: 24, maxWidth: 420, borderRadius: 14, textAlign: "center" }}>This brief was made before ▶ Play existed. Run a new preview to play it.</div>
    </div>
  );
  setDeckLang(deck.lang);
  return <DeckPlayer deck={deck} onClose={onClose} />;
}
