// Client error reports: the page sends a short note when something breaks in a visitor's browser, and it lands in the
// Vercel function logs (search "client-error"). No personal data: message, stack excerpt, page, build, browser.
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 8192) throw new Error('too large'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
const cut = (v, n) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ⏎ ').slice(0, n);
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  let b;
  try { b = await readBody(req); } catch { return send(res, 400, { error: 'Invalid report' }); }
  const entry = {
    kind: 'client-error',
    app: cut(b.app, 40), mode: cut(b.mode, 20), build: cut(b.build, 20),
    msg: cut(b.msg, 300), where: cut(b.where, 200), stack: cut(b.stack, 900),
    page: cut(b.page, 120), ua: cut(req.headers['user-agent'], 160), at: new Date().toISOString(),
  };
  if (!entry.msg) return send(res, 400, { error: 'Empty report' });
  console.error(JSON.stringify(entry));
  return send(res, 200, { ok: true });
};
