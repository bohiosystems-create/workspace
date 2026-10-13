import type { LlmConfig } from "./llm/types";
import { transcribe as whisper } from "./llm/openai";

/**
 * Voice notes → text. ElevenLabs Speech-to-Text (Scribe) when ELEVENLABS_API_KEY is set — it handles Arabic,
 * English and code-switching between them well — otherwise OpenAI Whisper (OPENAI_API_KEY).
 *   ELEVENLABS_STT_MODEL (default scribe_v1) · ELEVENLABS_STT_LANGUAGE (optional ISO code, e.g. "en" or "ar"; default auto)
 *   ELEVENLABS_BASE_URL (default https://api.elevenlabs.io) — for tests.
 */
export const sttProvider = () => (process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "openai");

export async function speechToText(cfg: LlmConfig, bytes: Uint8Array, mime: string, filename = "voice.ogg"): Promise<{ text: string; provider: string; language?: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    const fd = new FormData();
    fd.set("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
    if (process.env.ELEVENLABS_STT_LANGUAGE) fd.set("language_code", process.env.ELEVENLABS_STT_LANGUAGE);
    fd.set("tag_audio_events", "false");
    fd.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
    const base = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30_000);
    try {
      const r = await fetch(`${base}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: fd, signal: ctl.signal });
      const txt = await r.text();
      if (!r.ok) {
        // fall back to Whisper when it's configured, so a voice note is never lost
        if (cfg.openai?.apiKey) return { text: await whisper(cfg, bytes, mime, filename), provider: `openai (ElevenLabs ${r.status})` };
        throw new Error(`ElevenLabs speech-to-text ${r.status}: ${txt.slice(0, 200)}`);
      }
      const j = JSON.parse(txt) as { text?: string; language_code?: string };
      return { text: String(j.text ?? "").trim(), provider: "elevenlabs", language: j.language_code };
    } finally { clearTimeout(t); }
  }
  if (!cfg.openai?.apiKey) throw new Error("Voice notes need ELEVENLABS_API_KEY (or OPENAI_API_KEY).");
  return { text: await whisper(cfg, bytes, mime, filename), provider: "openai" };
}
