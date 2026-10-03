// Vercel serverless proxy for the Bohio demo's AI engine.
// Keeps provider API keys on the server (env vars) instead of in the browser.
//   ANTHROPIC_API_KEY   enables Claude
//   OPENAI_API_KEY      enables OpenAI
//   DEMO_PASSWORD       optional; if set, callers must send it as the x-demo-pass header
//   ANTHROPIC_URL / OPENAI_URL   optional overrides (e.g. a corporate gateway)
const UPSTREAM = {
  anthropic: () => process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages',
  openai: () => process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions',
};
const MAX_TOKENS = 2000;

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
  const has = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY };

  // GET: tell the page which providers have a server-side key (never the key itself).
  if (req.method === 'GET') return send(res, 200, { providers: has, passwordRequired: !!process.env.DEMO_PASSWORD });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  if (process.env.DEMO_PASSWORD && req.headers['x-demo-pass'] !== process.env.DEMO_PASSWORD)
    return send(res, 401, { error: 'Access code missing or wrong. Enter it in the AI engine settings.' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const { provider, payload } = body || {};
  if (!UPSTREAM[provider]) return send(res, 400, { error: 'Unknown provider' });
  if (!has[provider]) return send(res, 400, { error: `No server key for ${provider}. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} in Vercel.` });
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) return send(res, 400, { error: 'Missing payload' });

  // Cap output size so a public demo can't be used for long generations.
  const p = { ...payload };
  if (provider === 'anthropic') p.max_tokens = Math.min(+p.max_tokens || MAX_TOKENS, MAX_TOKENS);
  else { p.max_completion_tokens = Math.min(+p.max_completion_tokens || MAX_TOKENS, MAX_TOKENS); delete p.max_tokens; }
  delete p.stream;

  const headers = { 'content-type': 'application/json' };
  if (provider === 'anthropic') { headers['x-api-key'] = process.env.ANTHROPIC_API_KEY; headers['anthropic-version'] = '2023-06-01'; }
  else headers.authorization = `Bearer ${process.env.OPENAI_API_KEY}`;

  try {
    const r = await fetch(UPSTREAM[provider](), { method: 'POST', headers, body: JSON.stringify(p) });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(text);
  } catch (e) {
    send(res, 502, { error: 'Upstream request failed: ' + e.message });
  }
};
