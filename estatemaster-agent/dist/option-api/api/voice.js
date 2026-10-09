// Narration for ▶ Play and the report's read-aloud mode with ElevenLabs text-to-speech. The API key stays on the
// server; without ELEVENLABS_API_KEY the page uses the browser's own voice.
//   ELEVENLABS_API_KEY    required to enable it
//   ELEVENLABS_VOICE_ID   default voice for English narration (the page can pick another from the account's voices)
//   ELEVENLABS_VOICE_ID_AR  default voice for Arabic narration (falls back to ELEVENLABS_VOICE_ID)
//   ELEVENLABS_MODEL      default eleven_multilingual_v2 (English and Arabic); eleven_v3 for the most expressive delivery
//   ELEVENLABS_STABILITY 0–1 (0.4), ELEVENLABS_SIMILARITY 0–1 (0.8), ELEVENLABS_STYLE 0–1 (0.35), ELEVENLABS_SPEED 0.7–1.2
//                        (optional): the same settings as the other Bohio demo apps. ELEVENLABS_SETTINGS (JSON) still overrides.
//   DEMO_PASSWORD         optional; if set, callers must send it as the x-demo-pass header (same as /api/llm)
// POST {token:true}: a single-use key for real-time Scribe (live words while a question is spoken). GET ?check=1: the account.
// POST {transcribe:true, audio_base64, mime, lang}: a question spoken into ▶ Play, as words ({text}; ELEVENLABS_STT_MODEL, default scribe_v1).
// POST {text, timestamps, previous_text, next_text, voice, lang, pauses}: pauses are the character positions where a
// point starts (a short breath there). The text is spoken with SAR as a word and figures of 100+ in words; the
// alignment comes back per character of the text sent. with timestamps the reply is JSON
// {audio_base64, alignment} (character start times, used to light up the figure being spoken about); otherwise MP3.
// GET ?list=1 lists the account's voices (name, labels, sample) for the voice menu. Audio is cached in memory by text.
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const MAX_CHARS = 1500;
const cache = new Map();
let voicesCache = null, voicesAt = 0;


// ------------------------------------------------------------------ what the voice is actually given (as in the KINAN
// marketing agent): "SAR" said as a word, figures of 100 and more in words ("one hundred and thirty-five point six"),
// "/sqm" as "per square metre", and a short breath before each point the presenter moves on to. A character map takes
// the timings back to the text the page sent, so captions and highlights stay on the right word.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n) { const h = Math.floor(n / 100), r = n % 100; const rest = r < 20 ? (r ? ONES[r] : '') : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`; return h ? `${ONES[h]} hundred${rest ? ` and ${rest}` : ''}` : rest || 'zero'; }
function intWords(n) {
  if (n === 0) return 'zero';
  const parts = [];
  for (const [v, w] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) if (n >= v) { parts.push(`${under1000(Math.floor(n / v))} ${w}`); n %= v; }
  if (n) parts.push(parts.length && n < 100 ? `and ${under1000(n)}` : under1000(n));
  return parts.join(' ');
}
const numWords = (raw) => { const [i, d] = raw.replace(/,/g, '').split('.'); return `${intWords(Number(i))}${d && /[1-9]/.test(d) ? ` point ${d.replace(/0+$/, '').split('').map((c) => ONES[Number(c)]).join(' ')}` : ''}`; };
function englishForm(text) {
  const rx = /\bS A R\b|\bSAR\b|\/sqm\b|(?<![\d.,])\d{1,2}\.0+(?![\d])|(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d.,])\d{3,}(?:\.\d+)?(?![\d,])/g;
  let out = '', last = 0; const map = new Array(text.length);
  for (const m of text.matchAll(rx)) {
    const at = m.index || 0, tok = m[0];
    for (let i = last; i < at; i++) { map[i] = out.length; out += text[i]; }
    let say;
    if (tok === 'SAR' || tok === 'S A R') say = 'Sar';
    else if (tok === '/sqm') say = ' per square metre';
    else { const n = Number(tok.replace(/,/g, '')); say = /^(19|20)\d\d$/.test(tok) ? tok : n >= 100 ? numWords(tok) : tok.replace(/\.0+$/, ''); }
    for (let i = at; i < at + tok.length; i++) map[i] = out.length;
    out += say; last = at + tok.length;
  }
  for (let i = last; i < text.length; i++) { map[i] = out.length; out += text[i]; }
  return { out, map };
}
const BREAK = '<break time="0.6s" />';
function withPauses(f, n, pauses) {
  const cuts = Array.from(new Set(pauses.filter((p) => p > 0 && p < n).map((p) => f.map[p]))).sort((x, y) => x - y);
  if (!cuts.length) return f;
  let out = '', last = 0;
  for (const c of cuts) { out += f.out.slice(last, c) + ` ${BREAK} `; last = c; }
  out += f.out.slice(last);
  const ins = BREAK.length + 2;
  return { out, map: f.map.map((o) => o + ins * cuts.filter((c) => c <= o).length) };
}
function speechForm(text, lang, pauses) { const base = lang === 'ar' ? { out: text, map: Array.from(text, (_, i) => i) } : englishForm(text); return withPauses(base, text.length, pauses || []); }
function tagless(spoken) {
  let text = ''; const idx = new Array(spoken.length); const rx = /<break[^>]*\/>/g; let last = 0;
  for (const m of spoken.matchAll(rx)) { const at = m.index || 0; for (let i = last; i < at; i++) { idx[i] = text.length; text += spoken[i]; } for (let i = at; i < at + m[0].length; i++) idx[i] = text.length; last = at + m[0].length; }
  for (let i = last; i < spoken.length; i++) { idx[i] = text.length; text += spoken[i]; }
  return { text, idx };
}
/* one start time per character of `text`, even when ElevenLabs reports the characters a little differently */
function alignStarts(text, chars, starts) {
  if (!chars.length || chars.length !== starts.length) return [];
  if (chars.length === text.length && chars.every((c, i) => c === text[i])) return starts;
  const out = []; let j = 0, last = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) { if (j < chars.length && /\s/.test(chars[j])) { last = starts[j]; j++; } out.push(last); continue; }
    let k = -1;
    for (let d = 0; d < 6 && j + d < chars.length; d++) if (chars[j + d] === text[i]) { k = j + d; break; }
    if (k >= 0) { last = starts[k]; j = k + 1; } else if (j < chars.length) { last = starts[j]; j++; }
    out.push(last);
  }
  return out;
}

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
  // GET ?check=1: whether the key works and the characters used this month (why the voice may have stopped)
  if (req.method === 'GET' && url.searchParams.get('check')) {
    if (!key) return send(res, 200, { ok: false, error: 'ELEVENLABS_API_KEY is not set.' });
    const bad = authorised(req); if (bad) return send(res, 401, { error: bad });
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
      if (!r.ok) return send(res, 200, { ok: false, error: `ElevenLabs (${r.status}): ${(await r.text()).slice(0, 200)}` });
      const j = await r.json();
      const used = Number(j.character_count) || 0, limit = Number(j.character_limit) || 0;
      return send(res, 200, { ok: limit === 0 || used < limit, tier: j.tier, used, limit, resets: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
        ...(limit && used >= limit ? { error: `Monthly characters used up (${used.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')}).` } : {}) });
    } catch (e) { return send(res, 200, { ok: false, error: String(e && e.message || e) }); }
  }
  if (req.method === 'GET') return send(res, 200, { enabled: !!key, provider: key ? 'elevenlabs' : 'browser', model, voice: key ? defaultVoice : '', voiceAr: key ? defaultVoiceAr : '', passwordRequired: !!DEMO_CODE() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!key) return send(res, 501, { error: 'Voice is not configured (set ELEVENLABS_API_KEY).' });
  const bad = authorised(req); if (bad) return send(res, bad === 'Forbidden' ? 403 : 401, { error: bad });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  // A single-use key (15 minutes) for ElevenLabs real-time transcription: the page streams the microphone to Scribe and
  // shows the words live while a question is spoken, without ever seeing the API key.
  if (body && body.token) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': key } });
      if (!r.ok) return send(res, 502, { error: `ElevenLabs (${r.status}): ${(await r.text()).slice(0, 200)}` });
      const j = await r.json();
      return send(res, 200, { token: j.token });
    } catch (e) { return send(res, 502, { error: 'ElevenLabs unreachable: ' + (e && e.message) }); }
  }
  // A question spoken into ▶ Play: ElevenLabs speech-to-text (Scribe) → { text }
  if (body && body.transcribe) {
    const b64 = String(body.audio_base64 || '');
    if (b64.length < 1300) return send(res, 400, { error: 'No audio.' });
    if (b64.length > 5600000) return send(res, 413, { error: 'Recording too long.' });
    const mime = /^audio\/[\w.+-]+(;[\w=.-]+)?$/.test(String(body.mime || '')) ? body.mime : 'audio/webm';
    const form = new FormData();
    form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');
    form.append('language_code', body.lang === 'ar' ? 'ara' : 'eng');
    form.append('tag_audio_events', 'false');
    form.append('file', new Blob([Buffer.from(b64, 'base64')], { type: mime }), /mp4/.test(mime) ? 'question.mp4' : /ogg/.test(mime) ? 'question.ogg' : 'question.webm');
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
      if (!r.ok) return send(res, 502, { error: `ElevenLabs transcription failed (${r.status}): ${(await r.text()).slice(0, 200)}` });
      const j = await r.json();
      return send(res, 200, { text: String(j.text || '').replace(/\s+/g, ' ').trim() });
    } catch (e) { return send(res, 502, { error: 'ElevenLabs unreachable: ' + (e && e.message) }); }
  }
  const text = String((body && body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) return send(res, 400, { error: 'Nothing to say.' });
  const withTs = !!(body && body.timestamps);
  const lang = body && body.lang === 'ar' ? 'ar' : 'en';
  const pauses = Array.isArray(body && body.pauses) ? body.pauses.map(Number).filter((n) => Number.isFinite(n)).slice(0, 40) : [];
  const voice = body && /^[A-Za-z0-9]{10,40}$/.test(String(body.voice || '')) ? String(body.voice) : (lang === 'ar' ? defaultVoiceAr : defaultVoice);
  const form = speechForm(text, lang, pauses);
  let spoken = form.out.slice(0, MAX_CHARS + 600);
  const ck = `${voice}|${model}|${withTs ? 1 : 0}|${spoken}|${text}`;
  let out = cache.get(ck);
  if (!out) {
    const settings = settingsFor(model);
    const payloadFor = (t) => {
      const payload = { text: t, model_id: model, voice_settings: settings };
      // previous/next text keep the prosody continuous from one slide to the next
      if (body.previous_text) payload.previous_text = String(body.previous_text).slice(0, 400);
      if (body.next_text) payload.next_text = String(body.next_text).slice(0, 400);
      // flash / turbo models accept a language hint; the multilingual models detect the language from the text
      if (/flash|turbo/.test(model)) payload.language_code = lang;
      return JSON.stringify(payload);
    };
    const ep = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}${withTs ? '/with-timestamps' : ''}?output_format=mp3_44100_128`;
    const call = (t) => fetch(ep, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: withTs ? 'application/json' : 'audio/mpeg' }, body: payloadFor(t) });
    try {
      let r = await call(spoken);
      // a model that does not take <break> tags: the same text without the pauses (timings still map back)
      if (!r.ok && r.status === 400 && spoken.includes('<break')) {
        const tl = tagless(spoken), prev = form.out;
        spoken = tl.text; form.map = form.map.map((o) => tagless(prev).idx[o] ?? o); form.out = spoken;
        r = await call(spoken);
      }
      if (!r.ok) return send(res, 502, { error: `ElevenLabs request failed (${r.status}): ${(await r.text()).slice(0, 200)}` });
      if (withTs) {
        const j = await r.json();
        const al = j.alignment || j.normalized_alignment || {};
        const chars = Array.isArray(al.characters) ? al.characters : [], starts = Array.isArray(al.character_start_times_seconds) ? al.character_start_times_seconds : [];
        // ElevenLabs may or may not echo the <break> tags in its alignment: align against whichever form it used
        const echoed = chars.join('').includes('<break');
        const plain = echoed ? { text: spoken, idx: Array.from(spoken, (_, i) => i) } : tagless(spoken);
        const aligned = alignStarts(plain.text, chars, starts);
        const onSpoken = aligned.length ? Array.from(spoken, (_, i) => aligned[Math.min(aligned.length - 1, plain.idx[i])]) : [];
        // back to the text the page sent: each character takes the time of what stands for it in the spoken text
        const back = onSpoken.length ? Array.from(text, (_, i) => onSpoken[Math.min(onSpoken.length - 1, form.map[i] ?? 0)]) : [];
        out = { json: JSON.stringify({ audio_base64: j.audio_base64, mime: 'audio/mpeg', alignment: { characters: back.length ? Array.from(text) : [], character_start_times_seconds: back } }) };
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
