// The second formula engine: LibreOffice on Bohio's own server (lo-service/), for a workbook the browser engine cannot reproduce exactly.
// The page never sees the service's address or key. Environment: LO_URL (https://…, the service), LO_TOKEN (its bearer key).
//   GET  /api/lo → {ok, version} when the service answers, {ok:false} when it is not set up
//   POST /api/lo → forwarded to LO_URL/recalc (the workbook, the cells to set and to read); see lo-service/server.py
module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
  const url = (process.env.LO_URL || '').replace(/\/$/, ''), token = process.env.LO_TOKEN || '';
  if (!url || !token) return send(200, { ok: false, why: 'not set up' });
  try {
    if (req.method === 'GET') {
      const r = await fetch(url + '/health', { signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({}));
      return send(200, { ok: !!(r.ok && j.ok), version: j.version || '' });
    }
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch(url + '/recalc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body, signal: AbortSignal.timeout(110000) });
    const j = await r.json().catch(() => ({ error: 'the server engine gave no answer' }));
    return send(r.status, j);
  } catch (e) {
    return send(502, { error: 'the server engine could not be reached' });
  }
};
