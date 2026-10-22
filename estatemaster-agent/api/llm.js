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
const MAX_TOKENS = 6000;   // a reading cut off at its cap is a failed reading: room for a full JSON answer
// Cost and abuse guard (best effort, per server instance): requests per caller per 10 minutes.
const RATE = { max: +(process.env.LLM_RATE_MAX || 1500), windowMs: 10 * 60 * 1000 }, HITS = new Map();   // a CIO session with two reviewers and a third model per answer makes several hundred calls
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
  const now = Date.now(), h = (HITS.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  h.push(now); HITS.set(ip, h); if (HITS.size > 5000) HITS.clear();
  return h.length > RATE.max;
}
// Models the app may call: current Claude and OpenAI families only, never Haiku.
const MODEL_OK = (provider, m) => typeof m === 'string' && !/haiku/i.test(m) && (provider === 'anthropic' ? /^claude-/i.test(m) : /^(gpt-|o\d)/i.test(m));
// Answer before the platform's 800 s limit, so the page gets a clear error instead of a dropped connection.
const UPSTREAM_TIMEOUT_MS = 780 * 1000;
// Report design (task: 'report') returns a full report spec through a tool call: allow more room.
const REPORT_MAX_TOKENS = 12000;
// Beta headers the page may ask for; anything else is dropped.
const BETAS = ['server-side-fallback-2026-07-01'];
// Upstream statuses worth one more try: rate limit, overload, gateway errors.
const RETRY_STATUS = [429, 500, 502, 503, 504, 529], RETRY_MS = [1000, 3000];

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

// Prompt caching (Claude): the tool list, the system prompt and, in the agent's tool loop, the conversation so far are marked
// cacheable, so the next call that starts with the same text reuses it instead of reading it again: quicker and about 90%
// cheaper on that text. The model receives exactly the same request, so answers are unchanged.
function cacheable(p, task) {
  const cc = { type: 'ephemeral' };
  if (Array.isArray(p.tools) && p.tools.length) { const t = p.tools.slice(); t[t.length - 1] = { ...t[t.length - 1], cache_control: cc }; p.tools = t; }
  if (typeof p.system === 'string' && p.system) p.system = [{ type: 'text', text: p.system, cache_control: cc }];
  else if (Array.isArray(p.system) && p.system.length) { const s = p.system.slice(); s[s.length - 1] = { ...s[s.length - 1], cache_control: cc }; p.system = s; }
  if (task === 'agent' && Array.isArray(p.messages) && p.messages.length > 1) {
    const m = p.messages.slice(), last = { ...m[m.length - 1] };
    const c = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : Array.isArray(last.content) ? last.content.slice() : null;
    if (c && c.length && c[c.length - 1] && ['text', 'tool_result', 'image', 'document'].includes(c[c.length - 1].type)) { c[c.length - 1] = { ...c[c.length - 1], cache_control: cc }; last.content = c; m[m.length - 1] = last; p.messages = m; }
  }
  return p;
}

const DEMO_CODE = () => (process.env.DEMO_SESSION_SECRET ? '' : process.env.DEMO_PASSWORD);
const handler = async function handler(req, res) {
  const has = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY };

  // GET: tell the page which providers have a server-side key (never the key itself).
  if (req.method === 'GET') return send(res, 200, { providers: has, passwordRequired: !!DEMO_CODE() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  if (DEMO_CODE() && req.headers['x-demo-pass'] !== DEMO_CODE())
    return send(res, 401, { error: 'Access code missing or wrong. Enter it in the AI engine settings.' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const { provider, payload, task, betas } = body || {};
  if (!UPSTREAM[provider]) return send(res, 400, { error: 'Unknown provider' });
  if (!has[provider]) return send(res, 400, { error: `No server key for ${provider}. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} in Vercel.` });
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) return send(res, 400, { error: 'Missing payload' });
  if (!MODEL_OK(provider, payload.model)) return send(res, 400, { error: `Model not allowed: ${String(payload.model).slice(0, 60)}` });
  if (limited(req)) return send(res, 429, { error: 'Too many AI requests from this browser in the last 10 minutes (rate limit). Retry in a few minutes.' });

  // Cap output size so a public demo can't be used for long generations.
  const p = { ...payload };
  // Assumption tests (task: 'calc') return a full working from each model: allow more room (GPT-5 counts its reasoning too).
  // financial questions, what-ifs, tests and checks run with full reasoning (Claude adaptive thinking, OpenAI high effort): they need the room
  const cap = task === 'report' ? REPORT_MAX_TOKENS : ['calc', 'risk', 'agent', 'check'].includes(task) ? 32000 : task === 'answer' ? 4000 : MAX_TOKENS;
  if (provider === 'anthropic') p.max_tokens = Math.min(+p.max_tokens || cap, cap);
  // OpenAI reasoning models (gpt-5, o-series) count their hidden reasoning in this cap: too small a cap returns an empty answer
  else { const rc = /^(gpt-5|o\d)/i.test(String(p.model)) ? Math.max(cap, task === 'report' ? cap : 24000) : cap; p.max_completion_tokens = Math.min(+p.max_completion_tokens || rc, rc); delete p.max_tokens; }
  // the chat's answer (task 'agent' or 'answer') may come back as a stream, so its words show as they are written; anything else is one JSON reply
  const stream = provider === 'anthropic' && p.stream === true && ['agent', 'answer'].includes(task);
  if (stream) p.stream = true; else delete p.stream;
  // Opus answers the everyday financial questions, tests and checks in place of Fable: at high reasoning effort (its default is medium),
  // so the cheaper model does not think less on the questions that carry figures
  if (provider === 'anthropic' && /opus/i.test(String(p.model)) && ['agent', 'calc', 'check', 'risk'].includes(task) && !(p.output_config && p.output_config.effort)) p.output_config = { ...(p.output_config || {}), effort: 'high' };
  if (provider === 'anthropic') cacheable(p, task);

  const headers = { 'content-type': 'application/json' };
  if (provider === 'anthropic') { headers['x-api-key'] = process.env.ANTHROPIC_API_KEY; headers['anthropic-version'] = '2023-06-01';
    const b = (Array.isArray(betas) ? betas : []).filter((x) => BETAS.includes(x));
    if (b.length) headers['anthropic-beta'] = b.join(',');
    else delete p.fallbacks; // fallbacks needs its beta header
  }
  else headers.authorization = `Bearer ${process.env.OPENAI_API_KEY}`;

  try {
    // An overloaded or briefly failing provider is asked again here (twice, with back-off) before the page sees an error.
    let r;
    for (let k = 0; ; k++) {
      try { r = await fetch(UPSTREAM[provider](), { method: 'POST', headers, body: JSON.stringify(p), signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }); }
      catch (e) { if (k < 2 && e && e.name !== 'TimeoutError' && e.name !== 'AbortError') { await new Promise((ok) => setTimeout(ok, RETRY_MS[k])); continue; } throw e; }
      if (k < 2 && RETRY_STATUS.includes(r.status)) { const ra = +((r.headers && r.headers.get && r.headers.get('retry-after')) || 0); await new Promise((ok) => setTimeout(ok, Math.min(8000, ra > 0 ? ra * 1000 : RETRY_MS[k]))); continue; }
      break;
    }
    if (stream && r.ok && r.body && /event-stream/i.test(r.headers.get('content-type') || '')) {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-accel-buffering', 'no');
      try { for await (const chunk of r.body) res.write(chunk); }
      catch (e) { res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'proxy_error', message: e && e.name === 'TimeoutError' ? 'The AI provider did not answer in time' : 'The answer stream broke: ' + (e && e.message) } })}\n\n`); }
      return res.end();
    }
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(text);
  } catch (e) {
    send(res, e && e.name === 'TimeoutError' ? 504 : 502, { error: (e && e.name === 'TimeoutError' ? 'The AI provider did not answer in time' : 'Upstream request failed: ' + e.message) });
  }
};
module.exports = handler;
module.exports.cacheable = cacheable;
// Vercel: let the chat's answer stream to the page as it is written instead of being held until the end
module.exports.config = { supportsResponseStreaming: true };
