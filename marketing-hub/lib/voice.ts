// Narration for the report player (▶ Play) with ElevenLabs text-to-speech. Server-side only: the API key never
// reaches the browser. Without ELEVENLABS_API_KEY the player uses the browser's own voice.
//   ELEVENLABS_API_KEY      required to enable it
//   ELEVENLABS_VOICE_ID     English voice (default: a stock multilingual voice)
//   ELEVENLABS_VOICE_ID_AR  Arabic voice (default: the English one — the multilingual model speaks Arabic)
//   ELEVENLABS_MODEL        default eleven_multilingual_v2 (English and Arabic)
// Audio is cached in memory by text, so replaying a report does not spend credits again.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const MAX_CHARS = 1000;
const cache = new Map<string, ArrayBuffer>();

export const voiceEnabled = () => !!process.env.ELEVENLABS_API_KEY;
export const voiceStatus = () => ({ enabled: voiceEnabled(), provider: voiceEnabled() ? "elevenlabs" : "browser", model: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2" });

export async function synthesize(text: string, lang: "en" | "ar"): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not configured (set ELEVENLABS_API_KEY).");
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error("Nothing to say.");
  const voice = (lang === "ar" ? process.env.ELEVENLABS_VOICE_ID_AR : undefined) || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
  const ck = `${voice}|${model}|${lang}|${clean}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: clean, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const buf = await res.arrayBuffer();
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  cache.set(ck, buf);
  return buf;
}
