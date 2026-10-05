// Narration for ▶ Play and the report's read-aloud mode with ElevenLabs text-to-speech. The API key stays on the
// server; without ELEVENLABS_API_KEY the page uses the browser's own voice.
//   ELEVENLABS_API_KEY    required to enable it
//   ELEVENLABS_VOICE_ID   default voice for English narration (the page can pick another from the account's voices)
//   ELEVENLABS_VOICE_ID_AR  default voice for Arabic narration (falls back to ELEVENLABS_VOICE_ID)
//   ELEVENLABS_MODEL      default eleven_multilingual_v2 (English and Arabic); eleven_v3 for the most expressive delivery
//   ELEVENLABS_STABILITY 0–1 (0.4), ELEVENLABS_SIMILARITY 0–1 (0.8), ELEVENLABS_STYLE 0–1 (0.35), ELEVENLABS_SPEED 0.7–1.2
//                        (optional): the same settings as the other Bohio demo apps. ELEVENLABS_SETTINGS (JSON) still overrides.
//   DEMO_PASSWORD         optional; if set, callers must send it as the x-demo-pass header (same as /api/llm)
// POST {text, timestamps, previous_text, next_text, voice, lang}: with timestamps the reply is JSON
// {audio_base64, alignment} (character start times, used to light up the figure being spoken about); otherwise MP3.
// GET ?list=1 lists the account's voices (name, labels, sample) for the voice menu. Audio is cached in memory by text.
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const MAX_CHARS = 1500;
const cache = new Map();
let voicesCache = null, voicesAt = 0;

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
// Settings that read naturally: lower stability lets the voice move with the sentence; v3 only takes 0 / 0.5 / 1.
function settingsFor(model) {
  const num = (v, d, lo, hi) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const E = process.env;
  const base = /eleven_v3/.test(model)
    ? { stability: [0, 0.5, 1].reduce((a, b) => Math.abs(b - num(E.ELEVENLABS_STABILITY, 0.5, 0, 1)) < Math.abs(a - num(E.ELEVENLABS_STABILITY, 0.5, 0, 1)) ? b : a), similarity_boost: num(E.ELEVENLABS_SIMILARITY, 0.8, 0, 1), use_speaker_boost: true }
    : { stability: num(E.ELEVENLABS_STABILITY, 0.4, 0, 1), similarity_boost: num(E.ELEVENLABS_SIMILARITY, 0.8, 0, 1), style: num(E.ELEVENLABS_STYLE, 0.35, 0, 1), use_speaker_boost: true };
  if (E.ELEVENLABS_SPEED) base.speed = num(E.ELEVENLABS_SPEED, 1, 0.7, 1.2);
  try { return { ...base, ...JSON.parse(process.env.ELEVENLABS_SETTINGS || '{}') }; } catch { return base; }
}
function authorised(req) {
  if (DEMO_CODE() && req.headers['x-demo-pass'] !== DEMO_CODE()) return 'Access code missing or wrong.';
  const origin = req.headers.origin, host = req.headers.host;
  if (origin && host) { try { if (new URL(origin).host !== host) return 'Forbidden'; } catch { return 'Forbidden'; } }
  return null;
}

const DEMO_CODE = () => (process.env.DEMO_SESSION_SECRET ? '' : process.env.DEMO_PASSWORD);
module.exports = async function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const defaultVoiceAr = process.env.ELEVENLABS_VOICE_ID_AR || defaultVoice;
  const url = new URL(req.url || '/', 'http://x');
  if (req.method === 'GET' && url.searchParams.get('list')) {
    if (!key) return send(res, 200, { voices: [], voice: '', model });
    const bad = authorised(req); if (bad) return send(res, 401, { error: bad });
    if (voicesCache && Date.now() - voicesAt < 10 * 60 * 1000) return send(res, 200, { voices: voicesCache, voice: defaultVoice, voiceAr: defaultVoiceAr, model });
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
      if (!r.ok) return send(res, 502, { error: `ElevenLabs voices failed (${r.status})` });
      const j = await r.json();
      voicesCache = (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {}, preview: v.preview_url || '', category: v.category || '' }));
      voicesAt = Date.now();
      return send(res, 200, { voices: voicesCache, voice: defaultVoice, voiceAr: defaultVoiceAr, model });
    } catch (e) { return send(res, 502, { error: 'ElevenLabs unreachable: ' + (e && e.message) }); }
  }
  if (req.method === 'GET') return send(res, 200, { enabled: !!key, provider: key ? 'elevenlabs' : 'browser', model, voice: key ? defaultVoice : '', voiceAr: key ? defaultVoiceAr : '', riyal: process.env.ELEVENLABS_RIYAL || 'ree-yaals', passwordRequired: !!DEMO_CODE() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!key) return send(res, 501, { error: 'Voice is not configured (set ELEVENLABS_API_KEY).' });
  const bad = authorised(req); if (bad) return send(res, bad === 'Forbidden' ? 403 : 401, { error: bad });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const text = String((body && body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) return send(res, 400, { error: 'Nothing to say.' });
  const withTs = !!(body && body.timestamps);
  const voice = body && /^[A-Za-z0-9]{10,40}$/.test(String(body.voice || '')) ? String(body.voice) : (body && body.lang === 'ar' ? defaultVoiceAr : defaultVoice);
  const ck = `${voice}|${model}|${withTs ? 1 : 0}|${text}`;
  let out = cache.get(ck);
  if (!out) {
    const payload = { text, model_id: model, voice_settings: settingsFor(model) };
    // previous/next text keep the prosody continuous from one slide to the next
    if (body.previous_text) payload.previous_text = String(body.previous_text).slice(0, 400);
    if (body.next_text) payload.next_text = String(body.next_text).slice(0, 400);
    // flash / turbo models accept a language hint; the multilingual models detect the language from the text
    if (/flash|turbo/.test(model) && (body.lang === 'ar' || body.lang === 'en')) payload.language_code = body.lang;
    const ep = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}${withTs ? '/with-timestamps' : ''}?output_format=mp3_44100_128`;
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: withTs ? 'application/json' : 'audio/mpeg' }, body: JSON.stringify(payload) });
      if (!r.ok) return send(res, 502, { error: `ElevenLabs request failed (${r.status}): ${(await r.text()).slice(0, 200)}` });
      if (withTs) {
        const j = await r.json();
        const al = j.alignment || j.normalized_alignment || {};
        out = { json: JSON.stringify({ audio_base64: j.audio_base64, mime: 'audio/mpeg', alignment: { characters: al.characters || [], character_start_times_seconds: al.character_start_times_seconds || [] } }) };
      } else out = { buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) { return send(res, 502, { error: 'ElevenLabs unreachable: ' + (e && e.message) }); }
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(ck, out);
  }
  res.statusCode = 200;
  res.setHeader('cache-control', 'private, max-age=86400');
  if (out.json) { res.setHeader('content-type', 'application/json'); return res.end(out.json); }
  res.setHeader('content-type', 'audio/mpeg');
  res.end(out.buf);
};
