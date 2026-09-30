"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typing for the (webkit-prefixed) Web Speech API. */
interface SR extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

export function useSpeech(onText: (t: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<SR | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setError("");
    const r = new Ctor();
    r.lang = localStorage.getItem("kinan.lang") || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let txt = "", fin = false;
      for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; fin = e.results[i].isFinal; }
      cb.current(txt, fin);
    };
    r.onerror = (e) => { setError(e.error === "not-allowed" ? "Microphone blocked — allow it in browser settings." : e.error); setListening(false); };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, []);
  const stop = useCallback(() => { rec.current?.stop(); setListening(false); }, []);
  return { listening, supported, error, start, stop, toggle: () => (listening ? stop() : start()) };
}

export function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[•*_`#]/g, ""));
    u.lang = localStorage.getItem("kinan.lang") || "en-US";
    window.speechSynthesis.speak(u);
  } catch {}
}
