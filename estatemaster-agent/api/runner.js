// Vercel proxy from the Bohio agent to the EstateMaster runner (Windows VM, reached through a tunnel).
// The page only calls this after a person has approved a change; the runner token never reaches the browser.
//   RUNNER_URL      e.g. https://runner.example.com (Cloudflare Tunnel hostname of the runner)
//   RUNNER_TOKEN    same value as RUNNER_TOKEN on the runner
//   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET   optional, if the tunnel sits behind Cloudflare Access
//   DEMO_PASSWORD   optional; same access code as /api/llm
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

async function call(method, path, body) {
  const headers = { authorization: `Bearer ${process.env.RUNNER_TOKEN}`, 'content-type': 'application/json' };
  if (process.env.CF_ACCESS_CLIENT_ID) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET || '';
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(process.env.RUNNER_URL.replace(/\/$/, '') + path,
      { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { error: text.slice(0, 300) }; }
    return { status: r.status, body: j };
  } finally { clearTimeout(t); }
}

const safeId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);

const DEMO_CODE = () => (process.env.DEMO_SESSION_SECRET ? '' : process.env.DEMO_PASSWORD);
module.exports = async function handler(req, res) {
  const configured = !!(process.env.RUNNER_URL && process.env.RUNNER_TOKEN);
  if (req.method === 'GET') {
    if (!configured) return send(res, 200, { configured: false });
    try { const h = await call('GET', '/health'); return send(res, 200, { configured: true, reachable: h.status === 200, health: h.status === 200 ? h.body : null, status: h.status }); }
    catch (e) { return send(res, 200, { configured: true, reachable: false, error: String(e.message || e) }); }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (DEMO_CODE() && req.headers['x-demo-pass'] !== DEMO_CODE())
    return send(res, 401, { error: 'Access code missing or wrong.' });
  if (!configured) return send(res, 400, { error: 'Runner not configured: set RUNNER_URL and RUNNER_TOKEN in Vercel.' });

  let b;
  try { b = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  try {
    let r;
    switch (b.action) {
      case 'submit':   // kind: run (approved change) | scratch (stress check, restored) | promote (approved, live model)
        if (!safeId(b.model) || typeof b.inputs !== 'object') return send(res, 400, { error: 'model and inputs required' });
        if (b.kind && !['run', 'scratch', 'promote'].includes(b.kind)) return send(res, 400, { error: 'bad kind' });
        r = await call('POST', '/jobs', { model: b.model, inputs: b.inputs, lines: b.lines && typeof b.lines === 'object' ? b.lines : {},
          kind: b.kind || 'run', cr_id: b.cr_id || null, requested_by: b.requested_by || null, label: b.label ? String(b.label).slice(0, 200) : null });
        break;
      case 'create':   // new model from a KINAN master template (approved change request)
        if (!safeId(b.model) || !safeId(b.template) || typeof b.inputs !== 'object') return send(res, 400, { error: 'model, template and inputs required' });
        r = await call('POST', '/models/create', { model: b.model, name: String(b.name || b.model).slice(0, 200), template: b.template, inputs: b.inputs,
          lines: b.lines && typeof b.lines === 'object' ? b.lines : {}, cr_id: b.cr_id || null, requested_by: b.requested_by || null });
        break;
      case 'job':
        if (!safeId(b.job_id)) return send(res, 400, { error: 'job_id required' });
        r = await call('GET', `/jobs/${b.job_id}`);
        break;
      case 'collect':
        if (!safeId(b.job_id)) return send(res, 400, { error: 'job_id required' });
        r = await call('POST', `/jobs/${b.job_id}/collect`);
        break;
      case 'check':
        if (!safeId(b.model)) return send(res, 400, { error: 'model required' });
        r = await call('POST', `/models/${b.model}/check`);
        break;
      case 'models':
        r = await call('GET', '/models');
        break;
      default:
        return send(res, 400, { error: 'Unknown action' });
    }
    return send(res, r.status, r.body);
  } catch (e) {
    return send(res, 502, { error: `Runner unreachable: ${String(e.message || e)}` });
  }
};
