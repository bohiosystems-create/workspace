// Narration for the report player (▶ Play) with ElevenLabs text-to-speech. Server-side only: the API key never
// reaches the browser. Without ELEVENLABS_API_KEY the player uses the browser's own voice.
//   ELEVENLABS_API_KEY      required to enable it
//   ELEVENLABS_VOICE_ID     English voice (default: a stock multilingual voice) — or ELEVENLABS_VOICE
//   ELEVENLABS_VOICE_ID_AR  Arabic voice — or ELEVENLABS_VOICE_AR; (default: the English one — the multilingual model speaks Arabic)
//   ELEVENLABS_MODEL        default eleven_multilingual_v2 (English and Arabic)
//   ELEVENLABS_STABILITY    0–1, default 0.4  (lower = more expressive, higher = flatter and more consistent)
//   ELEVENLABS_SIMILARITY   0–1, default 0.8  (how closely the voice follows its original recording)
//   ELEVENLABS_STYLE        0–1, default 0.35 (style exaggeration; 0 is the most neutral)
//   ELEVENLABS_SPEED        0.7–1.2, optional (eleven_multilingual_v2 and the v2.5 models; a bit under 1 reads calmer)
// Audio comes back with the start time of every character (ElevenLabs "with-timestamps"), so the player can show
// which figure is being spoken. Cached in memory by text, so replaying a report does not spend credits again.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const API = () => (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
const MAX_CHARS = 1000;

export type Speech = { audio: string /* base64 mp3 */; chars: string[]; starts: number[] /* seconds, one per char */ };
const cache = new Map<string, Speech>();

export const voiceEnabled = () => !!process.env.ELEVENLABS_API_KEY;
export const voiceStatus = () => ({ enabled: voiceEnabled(), provider: voiceEnabled() ? "elevenlabs" : "browser", model: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2" });

const num = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return v && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** One start time per character of `text`, even when ElevenLabs reports the characters a little differently (a
 *  dropped or added space, a normalised symbol): the two sequences are walked together, so a position in the text
 *  always maps to the second it is spoken. An empty alignment stays empty (the player then paces by word count). */
export function alignStarts(text: string, chars: string[], starts: number[]): number[] {
  if (!chars.length || chars.length !== starts.length) return [];
  if (chars.length === text.length && chars.every((c, i) => c === text[i])) return starts;
  const out: number[] = [];
  let j = 0, last = 0;
  for (let i = 0; i < text.length; i++) {
    // Find this character ahead in the alignment (a short look-ahead keeps a one-off difference from derailing the rest).
    if (/\s/.test(text[i])) { if (j < chars.length && /\s/.test(chars[j])) { last = starts[j]; j++; } out.push(last); continue; } // a space never spoken: same time as the last letter
    let k = -1;
    for (let d = 0; d < 6 && j + d < chars.length; d++) if (chars[j + d] === text[i]) { k = j + d; break; }
    if (k >= 0) { last = starts[k]; j = k + 1; } else if (j < chars.length) { last = starts[j]; j++; }
    out.push(last);
  }
  return out;
}

// ------------------------------------------------------------------ what the voice is actually given
// Two things voices get wrong in English: "SAR" (spelled out letter by letter) and long figures ("135.6" read with an
// awkward or missing "hundred"). The text sent to ElevenLabs says the currency as a word and spells figures of 100 and
// more in words ("one hundred and thirty-five point six"); a character map takes the timings back to the text the
// player shows, so captions and highlights stay on the right word.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? (r ? ONES[r] : "") : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
  return h ? `${ONES[h]} hundred${rest ? ` and ${rest}` : ""}` : rest || "zero";
}
/** 135 → "one hundred and thirty-five"; 6400 → "six thousand four hundred"; British "and". */
export function intWords(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [v, w] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) if (n >= v) { parts.push(`${under1000(Math.floor(n / v))} ${w}`); n %= v; }
  if (n) parts.push(parts.length && n < 100 ? `and ${under1000(n)}` : under1000(n));
  return parts.join(" ");
}
const numWords = (raw: string) => {
  const [i, d] = raw.replace(/,/g, "").split(".");
  return `${intWords(Number(i))}${d && /[1-9]/.test(d) ? ` point ${d.replace(/0+$/, "").split("").map((c) => ONES[Number(c)]).join(" ")}` : ""}`;
};
/** The text for the voice, and for every character of the input the index of the character in the output that
 *  stands for it (so timings can be mapped back). English only; Arabic is passed through. */
export function speechForm(text: string, lang: "en" | "ar", pauses: number[] = []): { out: string; map: number[] } {
  const base = lang === "en" ? englishForm(text) : { out: text, map: Array.from(text, (_, i) => i) };
  return withPauses(base, text.length, pauses);
}
/** A short silence before each item the presenter moves on to (the player sends the cue positions), so bullet points
 *  are heard as separate points rather than one run-on sentence. */
const BREAK = '<break time="0.6s" />';
function withPauses(f: { out: string; map: number[] }, n: number, pauses: number[]): { out: string; map: number[] } {
  const cuts = Array.from(new Set(pauses.filter((p) => p > 0 && p < n).map((p) => f.map[p]))).sort((x, y) => x - y);
  if (!cuts.length) return f;
  let out = "", last = 0;
  for (const c of cuts) { out += f.out.slice(last, c) + ` ${BREAK} `; last = c; }
  out += f.out.slice(last);
  const ins = BREAK.length + 2;
  const map = f.map.map((o) => o + ins * cuts.filter((c) => c <= o).length);
  return { out, map };
}
function englishForm(text: string): { out: string; map: number[] } {
  const rx = /\bS A R\b|\bSAR\b|\/sqm\b|(?<![\d.,])\d{1,2}\.0+(?![\d])|(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d.,])\d{3,}(?:\.\d+)?(?![\d,])/g;
  let out = "", last = 0;
  const map: number[] = new Array(text.length);
  for (const m of text.matchAll(rx)) {
    const at = m.index ?? 0, tok = m[0];
    for (let i = last; i < at; i++) { map[i] = out.length; out += text[i]; }
    let say: string;
    if (tok === "SAR" || tok === "S A R") say = "Sar";
    else if (tok === "/sqm") say = " per square metre";
    else {
      const n = Number(tok.replace(/,/g, ""));
      // A year stays a year ("2026" → "twenty twenty-six" is what voices already do well).
      say = /^(19|20)\d\d$/.test(tok) ? tok : n >= 100 ? numWords(tok) : tok.replace(/\.0+$/, ""); // "33.0" is said "33"
    }
    for (let i = at; i < at + tok.length; i++) map[i] = out.length;
    out += say; last = at + tok.length;
  }
  for (let i = last; i < text.length; i++) { map[i] = out.length; out += text[i]; }
  return { out, map };
}

/** The spoken text without its <break> tags, and for each original character its index in that text. */
function tagless(spoken: string): { text: string; idx: number[] } {
  let text = ""; const idx: number[] = new Array(spoken.length);
  const rx = /<break[^>]*\/>/g; let last = 0;
  for (const m of spoken.matchAll(rx)) {
    const at = m.index ?? 0;
    for (let i = last; i < at; i++) { idx[i] = text.length; text += spoken[i]; }
    for (let i = at; i < at + m[0].length; i++) idx[i] = text.length;
    last = at + m[0].length;
  }
  for (let i = last; i < spoken.length; i++) { idx[i] = text.length; text += spoken[i]; }
  return { text, idx };
}

export async function synthesize(text: string, lang: "en" | "ar", pauses: number[] = []): Promise<Speech> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not configured (set ELEVENLABS_API_KEY).");
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error("Nothing to say.");
  const form = speechForm(clean, lang, pauses);
  let spoken = form.out.slice(0, MAX_CHARS + 600);
  // ELEVENLABS_VOICE / ELEVENLABS_VOICE_AR are accepted too (the names used in this project's Vercel settings)
  const voice = (lang === "ar" ? process.env.ELEVENLABS_VOICE_ID_AR || process.env.ELEVENLABS_VOICE_AR : undefined) || process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE || DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
  const settings: Record<string, number | boolean> = {
    stability: num(process.env.ELEVENLABS_STABILITY, 0.4, 0, 1),
    similarity_boost: num(process.env.ELEVENLABS_SIMILARITY, 0.8, 0, 1),
    style: num(process.env.ELEVENLABS_STYLE, 0.35, 0, 1),
    use_speaker_boost: true,
  };
  if (process.env.ELEVENLABS_SPEED) settings.speed = num(process.env.ELEVENLABS_SPEED, 1, 0.7, 1.2);
  const ck = `${voice}|${model}|${lang}|${JSON.stringify(settings)}|${spoken}|${clean}`;
  const hit = cache.get(ck);
  if (hit) return hit;

  const headers = { "xi-api-key": key, "Content-Type": "application/json" };
  const base = `${API()}/v1/text-to-speech/${encodeURIComponent(voice)}`;
  const bodyOf = (t: string) => JSON.stringify({ text: t, model_id: model, voice_settings: settings });
  let out: Speech;
  // Timed version first (audio + when each character is spoken); plain audio if that is not available.
  let body = bodyOf(spoken);
  let timed = await fetch(`${base}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers, body });
  // A model that does not take <break> tags: the same text without the pauses (timings still map, see tagless).
  if (!timed.ok && timed.status === 400 && spoken.includes("<break")) {
    const firstError = (await timed.text()).slice(0, 200);
    console.error("ElevenLabs refused the pauses; retrying without them:", firstError);
    spoken = tagless(spoken).text; body = bodyOf(spoken);
    form.map = form.map.map((o) => tagless(form.out).idx[o] ?? o); form.out = spoken;
    timed = await fetch(`${base}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers, body });
  }
  if (!timed.ok && (timed.status === 401 || timed.status === 402 || timed.status === 429)) {
    throw new Error(`ElevenLabs (${timed.status}): ${(await timed.text()).slice(0, 240)}`); // no point trying the plain route
  }
  if (timed.ok) {
    const j = await timed.json();
    const al = j.alignment ?? {};
    const chars: string[] = Array.isArray(al.characters) ? al.characters : [], starts: number[] = Array.isArray(al.character_start_times_seconds) ? al.character_start_times_seconds : [];
    // ElevenLabs may or may not echo the <break> tags in its alignment: align against whichever form it used.
    const echoed = chars.join("").includes("<break");
    const plain = echoed ? { text: spoken, idx: Array.from(spoken, (_, i) => i) } : tagless(spoken);
    const aligned = alignStarts(plain.text, chars, starts);
    const onSpoken = aligned.length ? Array.from(spoken, (_, i) => aligned[Math.min(aligned.length - 1, plain.idx[i])]) : [];
    // Back to the text the player shows: each character takes the time of what stands for it in the spoken text.
    out = { audio: String(j.audio_base64 ?? ""), chars, starts: onSpoken.length ? Array.from(clean, (_, i) => onSpoken[Math.min(onSpoken.length - 1, form.map[i] ?? 0)]) : [] };
    if (!out.audio) throw new Error("ElevenLabs returned no audio.");
  } else {
    const res = await fetch(`${base}?output_format=mp3_44100_128`, { method: "POST", headers: { ...headers, Accept: "audio/mpeg" }, body });
    if (!res.ok) throw new Error(`ElevenLabs request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    out = { audio: Buffer.from(await res.arrayBuffer()).toString("base64"), chars: [], starts: [] };
  }
  if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  cache.set(ck, out);
  return out;
}

// ------------------------------------------------------------------ speech to text (questions asked by voice)
/** The words in a short recording, through ElevenLabs Scribe (the same key as the voice). Arabic and English. */
export async function transcribe(audio: Blob, lang: "en" | "ar", filename = "question.webm"): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not configured (set ELEVENLABS_API_KEY).");
  const form = new FormData();
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
  form.append("language_code", lang === "ar" ? "ara" : "eng");
  form.append("tag_audio_events", "false");
  form.append("file", audio, filename);
  const res = await fetch(`${API()}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return String(j.text ?? "").replace(/\s+/g, " ").trim();
}

/** The ElevenLabs account as the app sees it: whether the key works and how many characters are left this month. */
export async function voiceAccount(): Promise<{ ok: boolean; tier?: string; used?: number; limit?: number; resets?: string | null; error?: string; /** a restricted key without "User: read": it may still speak */ restricted?: boolean }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, error: "ELEVENLABS_API_KEY is not set." };
  try {
    const r = await fetch(`${API()}/v1/user/subscription`, { headers: { "xi-api-key": key } });
    if (!r.ok) {
      const body = await r.text();
      // A restricted API key without the "User: read" permission cannot read the plan; that says nothing about speech.
      if ((r.status === 401 || r.status === 403) && /missing_permissions|user_read/i.test(body)) return { ok: false, restricted: true, error: "restricted key without User: read" };
      return { ok: false, error: `ElevenLabs (${r.status}): ${body.slice(0, 200)}` };
    }
    const j = await r.json();
    const used = Number(j.character_count) || 0, limit = Number(j.character_limit) || 0;
    return { ok: limit === 0 || used < limit, tier: j.tier, used, limit, resets: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
      ...(limit && used >= limit ? { error: `Monthly characters used up (${used.toLocaleString("en-GB")} of ${limit.toLocaleString("en-GB")}).` } : {}) };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
