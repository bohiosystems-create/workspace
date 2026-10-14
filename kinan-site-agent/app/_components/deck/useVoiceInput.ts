"use client";
// Asking by voice, for the presentation player and the chat assistant.
// While you speak, the words appear live from ElevenLabs real-time Scribe (scribe_v2_realtime, streamed over a
// WebSocket with a single-use key from /api/transcribe/token). When you stop, the recording goes to /api/transcribe
// (ElevenLabs Scribe) for the final text, which replaces the live draft. If the real-time stream cannot start, the
// browser's own speech recognition shows the live words instead (Chrome, Edge, Safari); if the final transcription
// fails, the live draft is used.
import { useEffect, useRef, useState } from "react";

export type VoiceState = "off" | "recording" | "transcribing";

export function useVoiceInput(opts: { lang: "en" | "ar"; onFinal: (text: string) => void; onError?: (msg: string) => void; maxMs?: number }) {
  const [state, setState] = useState<VoiceState>("off");
  const [live, setLive] = useState(""); // the words so far, while speaking
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; timer: ReturnType<typeof setTimeout>; sr: any; rt: any; draft: string } | null>(null);
  const optsRef = useRef(opts); optsRef.current = opts;

  const stop = () => { const r = rec.current; if (r && r.mr.state !== "inactive") r.mr.stop(); };

  const start = async () => {
    if (state !== "off") return;
    setLive("");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { optsRef.current.onError?.("mic"); return; }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((x) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x));
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    // Live words, first choice: ElevenLabs real-time Scribe, streaming the microphone alongside the recording.
    const setDraft = (text: string) => { const t = text.replace(/\s+/g, " ").trim(); if (rec.current) rec.current.draft = t; setLive(t); };
    const startRealtime = async (): Promise<any> => {
      const tk = await fetch("/api/transcribe/token", { method: "POST" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!tk?.token) return null;
      const { Scribe, RealtimeEvents } = await import("@elevenlabs/client");
      const conn: any = Scribe.connect({ token: tk.token, modelId: "scribe_v2_realtime", microphone: { echoCancellation: true, noiseSuppression: true } } as any);
      let done = "";
      conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (d: any) => setDraft(`${done} ${d?.text ?? ""}`));
      conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (d: any) => { done = `${done} ${d?.text ?? ""}`.trim(); setDraft(done); });
      return conn;
    };
    const rt: any = null;
    startRealtime().then((c) => { if (!c) { startBrowser(); return; } if (rec.current) rec.current.rt = c; else { try { c.close(); } catch { /* */ } } }).catch(() => startBrowser());
    // Live words, fallback: the browser's own recognition (display only).
    const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    let sr: any = null;
    const startBrowser = () => { if (!SR || !rec.current) return;
      try {
        sr = new SR(); sr.lang = optsRef.current.lang === "ar" ? "ar-SA" : "en-GB"; sr.interimResults = true; sr.continuous = true;
        sr.onresult = (e: any) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          text = text.replace(/\s+/g, " ").trim();
          setDraft(text);
        };
        sr.onerror = () => undefined;
        sr.start();
        rec.current.sr = sr;
      } catch { sr = null; }
    };
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec.current; rec.current = null;
      if (r) clearTimeout(r.timer);
      try { r?.sr?.stop(); } catch { /* already stopped */ }
      try { r?.rt?.close(); } catch { /* already closed */ }
      stream.getTracks().forEach((x) => x.stop());
      const draft = r?.draft ?? "";
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (blob.size < 1000) { setState("off"); setLive(""); return; }
      setState("transcribing");
      let text = "";
      try {
        const fd = new FormData(); fd.append("audio", blob, mr.mimeType.includes("mp4") ? "question.mp4" : "question.webm"); fd.append("lang", optsRef.current.lang);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const j = await res.json().catch(() => null);
        if (res.ok) text = String(j?.text ?? "").trim();
      } catch { /* fall back to the live draft */ }
      if (!text) text = draft;
      setState("off"); setLive("");
      if (text) optsRef.current.onFinal(text); else optsRef.current.onError?.("unheard");
    };
    mr.start();
    rec.current = { mr, stream, chunks, sr, rt, draft: "", timer: setTimeout(() => { if (mr.state !== "inactive") mr.stop(); }, opts.maxMs ?? 20000) };
    setState("recording");
  };

  useEffect(() => () => { const r = rec.current; if (r) { try { r.sr?.stop(); } catch { /* */ } try { r.rt?.close(); } catch { /* */ } r.stream.getTracks().forEach((x) => x.stop()); } }, []);
  return { state, live, start, stop, toggle: () => (state === "recording" ? stop() : start()) };
}
