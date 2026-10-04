// Narration for ▶ Play and the report's read-aloud mode with ElevenLabs text-to-speech. The API key stays on the
// server; without ELEVENLABS_API_KEY the page uses the browser's own voice.
//   ELEVENLABS_API_KEY    required to enable it
//   ELEVENLABS_VOICE_ID   voice (default: a stock multilingual voice)
//   ELEVENLABS_MODEL      default eleven_multilingual_v2
//   DEMO_PASSWORD         optional; if set, callers must send it as the x-demo-pass header (same as /api/llm)
// Audio is cached in memory by text, so replaying a report does not spend credits again.
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const MAX_CHARS = 1000;
const cache = new Map();

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

module.exports = async function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
  if (req.method === 'GET') return send(res, 200, { enabled: !!key, provider: key ? 'elevenlabs' : 'browser', model, passwordRequired: !!process.env.DEMO_PASSWORD });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!key) return send(res, 501, { error: 'Voice is not configured (set ELEVENLABS_API_KEY).' });
  if (process.env.DEMO_PASSWORD && req.headers['x-demo-pass'] !== process.env.DEMO_PASSWORD) return send(res, 401, { error: 'Access code missing or wrong.' });
  // Only the app itself may spend voice credits.
  const origin = req.headers.origin, host = req.headers.host;
  if (origin && host) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'Forbidden' }); } catch { return send(res, 403, { error: 'Forbidden' }); } }
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const text = String((body && body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) return send(res, 400, { error: 'Nothing to say.' });
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const ck = `${voice}|${model}|${text}`;
  let buf = cache.get(ck);
  if (!buf) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
      });
      if (!r.ok) return send(res, 502, { error: `ElevenLabs request failed (${r.status}): ${(await r.text()).slice(0, 200)}` });
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) { return send(res, 502, { error: 'ElevenLabs unreachable: ' + (e && e.message) }); }
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(ck, buf);
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('cache-control', 'private, max-age=86400');
  res.end(buf);
};
