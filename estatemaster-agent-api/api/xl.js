// The Excel engine: Microsoft's own Excel (Excel for the web, through Microsoft Graph) recalculates a workbook on Bohio's behalf, with no
// one opening Excel. Same contract as the LibreOffice service (lo-service/server.py), so the page uses either the same way, Excel first:
//   GET  /api/xl → {ok, version} when Excel answers, {ok:false, why} when it is not set up
//   POST /api/xl {file?: base64 | hash, check?: bool, sets?: [[ref, value]], read?: [ref]}
//        → {hash, check?: {tot, match, bad}, values: [...], ms}  or  {error, need_file: true} when the workbook is not held there
// A workbook is copied into one SharePoint folder (XL_FOLDER) under its SHA-256 and opened in a session that saves nothing
// (persistChanges false): the cells are set, Excel recalculates in full, the cells are read, the session is closed. The copies are
// deleted after XL_KEEP_HOURS (default 24). With check, Excel's own results on the file as uploaded are compared with the values the
// file stores (what Excel computed when it was saved): the page uses this engine only when they agree.
// Environment: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (the Entra ID app, as for Outlook; it needs write access to the folder's
// site: Sites.Selected with write on that site, or Files.ReadWrite.All), XL_FOLDER ("/sites/{host}:/sites/{site}:/drive/root:/Bohio Calc",
// or "/drives/{id}/root:/Bohio Calc"). XL_REFRESH_TOKEN signs in as a service user instead, should Excel refuse the app on its own.
// LOGIN_BASE and GRAPH_BASE override the hosts (tests).
const crypto = require('crypto'), zlib = require('zlib');
const env = k => process.env[k] || '';
const MAX_BYTES = 60 * 1024 * 1024;
const gbase = () => (env('GRAPH_BASE') || 'https://graph.microsoft.com') + '/v1.0';
// the secret as pasted into the hosting settings: surrounding spaces, line breaks and quotation marks are not part of it
const secret = () => env('MS_CLIENT_SECRET').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
// what the secret looks like, never the secret: the commonest mistake is the secret's ID (a GUID) pasted instead of its value (about 40 characters with a ~)
const secretShape = () => { const raw = env('MS_CLIENT_SECRET'), s = secret(); return `the secret in the settings has ${raw.length} characters${raw.length !== s.length ? ` (${s.length} after trimming spaces and quotes)` : ''}, ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? 'and looks like a secret ID, not its value' : s.includes('~') ? 'contains a ~ as a secret value does' : 'has no ~, which a secret value has'}`; };
const configured = () => !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && (env('MS_CLIENT_SECRET') || env('XL_REFRESH_TOKEN')) && env('XL_FOLDER'));

let TOKEN = null;
async function token() {
  if (TOKEN && TOKEN.exp > Date.now() + 60000) return TOKEN.v;
  const p = env('XL_REFRESH_TOKEN')
    ? { client_id: env('MS_CLIENT_ID'), grant_type: 'refresh_token', refresh_token: env('XL_REFRESH_TOKEN'), scope: 'https://graph.microsoft.com/Files.ReadWrite.All offline_access' }
    : { client_id: env('MS_CLIENT_ID'), client_secret: secret(), grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' };
  if (env('XL_REFRESH_TOKEN') && env('MS_CLIENT_SECRET')) p.client_secret = secret();
  const r = await fetch(`${env('LOGIN_BASE') || 'https://login.microsoftonline.com'}/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { const why = String(j.error_description || j.error || r.status).split(/\r?\n/)[0]; throw new Error('Microsoft sign-in failed: ' + why + (/AADSTS7000215|invalid_client/.test(why + (j.error || '')) && !env('XL_REFRESH_TOKEN') ? ' (' + secretShape() + ')' : '')); }
  TOKEN = { v: j.access_token, exp: Date.now() + (+j.expires_in || 3000) * 1000 };
  return TOKEN.v;
}
async function call(method, path, body, headers) {
  const t = await token();
  const h = { authorization: 'Bearer ' + t, ...(headers || {}) };
  let b = body;
  if (body !== undefined && !Buffer.isBuffer(body)) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(/^https?:/.test(path) ? path : gbase() + path, { method, headers: h, body: b });
  const txt = await r.text();
  let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = {}; }
  return { ok: r.ok, status: r.status, j };
}
const fail = (r, what) => { throw new Error(`Excel (${what}) answered ${r.status}${r.j && r.j.error && r.j.error.message ? ': ' + r.j.error.message : ''}`); };

// the folder written as a site address is resolved to the site's id once ("root:" cannot be extended on the address form)
let FOLDER = null;
async function folder() {
  if (FOLDER) return FOLDER;
  const f = env('XL_FOLDER').replace(/\/+$/, '');
  const m = f.match(/^\/sites\/([^:/]+):(\/sites\/[^:]+):(\/.*)$/);
  if (!m) return (FOLDER = f);
  const r = await call('GET', `/sites/${m[1]}:${m[2]}?$select=id`);
  if (!r.ok || !r.j.id) fail(r, 'finding the SharePoint site');
  return (FOLDER = `/sites/${r.j.id}${m[3]}`);
}
const itemPath = async h => `${await folder()}/${h}.xlsx:`;

async function upload(h, data) {
  const p = await itemPath(h);
  if (data.length <= 4 * 1024 * 1024) {
    const r = await call('PUT', `${p}/content`, data, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!r.ok) fail(r, 'saving the workbook');
    return;
  }
  const s = await call('POST', `${p}/createUploadSession`, { item: { '@microsoft.graph.conflictBehavior': 'replace' } });
  if (!s.ok || !s.j.uploadUrl) fail(s, 'starting the upload');
  const CH = 10 * 320 * 1024;   // a multiple of 320 KiB, as Graph asks
  for (let i = 0; i < data.length; i += CH) {
    const part = data.subarray(i, Math.min(i + CH, data.length));
    const r = await fetch(s.j.uploadUrl, { method: 'PUT', headers: { 'content-range': `bytes ${i}-${i + part.length - 1}/${data.length}`, 'content-length': String(part.length) }, body: part });
    if (!r.ok && r.status !== 202) throw new Error('Excel (uploading the workbook) answered ' + r.status);
  }
}
async function exists(h) { const r = await call('GET', `${await itemPath(h)}?$select=id`); return r.ok; }
// copies older than XL_KEEP_HOURS are deleted, so nothing stays in the folder longer than a day
async function sweep() {
  try {
    const keep = (+env('XL_KEEP_HOURS') || 24) * 3600 * 1000, f = await folder();
    const r = await call('GET', `${f}:/children?$select=name,lastModifiedDateTime&$top=200`);
    for (const it of (r.ok && r.j.value) || [])
      if (/^[0-9a-f]{64}\.xlsx$/.test(it.name) && Date.now() - Date.parse(it.lastModifiedDateTime) > keep) await call('DELETE', `${f}/${it.name}:`);
  } catch (e) { /* a sweep that fails is tried again on the next upload */ }
}

// "'Cash Flow'!$B$7" → {sheet: 'Cash Flow', addr: 'B7', row: 7, col: 2}
function parseRef(ref) {
  const m = String(ref).match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})\$?(\d+)$/i);
  if (!m) throw new Error('not a cell reference: ' + ref);
  const sheet = (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]), col = m[3].toUpperCase();
  return { sheet, addr: col + m[4], row: +m[4], col: col.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) };
}
const ws = s => `/workbook/worksheets('${encodeURIComponent(s.replace(/'/g, "''"))}')`;
const XL_ERR = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|GETTING_DATA|SPILL!|CALC!|FIELD!|BLOCKED!|CONNECT!|BUSY!|UNKNOWN!)$/;
const norm = v => (typeof v === 'string' && XL_ERR.test(v) ? { err: v } : v === '' ? null : v);

// every sheet asked about is read once, as its used range (its values after the recalculation)
async function readSheets(p, sid, sheets) {
  const out = {};
  for (const s of sheets) {
    const r = await call('GET', `${p}${ws(s)}/usedRange(valuesOnly=false)?$select=address,values`, undefined, { 'workbook-session-id': sid });
    if (!r.ok) fail(r, `reading sheet ${s}`);
    const a = String(r.j.address || '').split('!').pop().split(':')[0].match(/^\$?([A-Z]+)\$?(\d+)$/);
    out[s] = { r0: a ? +a[2] : 1, c0: a ? a[1].split('').reduce((x, c) => x * 26 + c.charCodeAt(0) - 64, 0) : 1, v: r.j.values || [] };
  }
  return out;
}
const at = (S, q) => { const g = S[q.sheet]; if (!g) return null; const row = g.v[q.row - g.r0]; return row && q.col - g.c0 >= 0 && q.col - g.c0 < row.length ? norm(row[q.col - g.c0]) : null; };

// the values the file stores with each formula (what Excel computed when it was saved), read from the .xlsx without recalculating
function unzip(buf) {
  const files = {};
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not an .xlsx file');
  let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    files[name] = () => { const ln = buf.readUInt16LE(off + 26), lx = buf.readUInt16LE(off + 28), d = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + size); return (method === 8 ? zlib.inflateRawSync(d) : d).toString('utf8'); };
    p += 46 + nl + xl + cl;
  }
  return files;
}
const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function storedValues(buf) {
  const Z = unzip(buf), out = {};
  const wb = Z['xl/workbook.xml'](), rels = Z['xl/_rels/workbook.xml.rels'](), rid = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = (m[0].match(/\bId="([^"]+)"/) || [])[1], t = (m[0].match(/\bTarget="([^"]+)"/) || [])[1]; if (id) rid[id] = t; }
  const shared = Z['xl/sharedStrings.xml'] ? [...Z['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))) : [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlText((m[0].match(/\bname="([^"]*)"/) || [])[1] || ''), id = (m[0].match(/\br:id="([^"]+)"/) || [])[1], t = rid[id] || '';
    const path = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^xl\//, '');
    if (!Z[path]) continue;
    const q = /[^A-Za-z0-9_]/.test(name) ? `'${name.replace(/'/g, "''")}'` : name;
    for (const c of Z[path]().matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const body = c[3]; if (!/<f/.test(body) || /t="dataTable"/.test(body)) continue;
      const v = body.match(/<v>([\s\S]*?)<\/v>/); if (!v) continue;
      const ty = (c[2].match(/\bt="([^"]+)"/) || [])[1] || 'n', raw = v[1], k = `${q}!${c[1]}`;
      out[k] = ty === 'n' ? (Number.isFinite(+raw) && raw.trim() !== '' ? +raw : xmlText(raw)) : ty === 'b' ? raw === '1' : ty === 'e' ? { err: raw } : ty === 's' ? (shared[+raw] !== undefined ? shared[+raw] : raw) : xmlText(raw);
    }
  }
  return out;
}
function same(a, b) {
  if ((a && typeof a === 'object') || (b && typeof b === 'object')) return !!(a && typeof a === 'object' && b && typeof b === 'object');
  if (typeof a === 'boolean' || typeof b === 'boolean') return typeof a !== 'string' && typeof b !== 'string' && !!a === !!b;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) || Math.abs(a - b) < 1e-9;
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

async function recalc(req) {
  const t0 = Date.now();
  let data = null, h = req.hash || '';
  if (req.file) {
    data = Buffer.from(req.file, 'base64');
    if (data.length > MAX_BYTES) throw new Error('the workbook is larger than this service accepts');
    h = crypto.createHash('sha256').update(data).digest('hex');
    if (!(await exists(h))) { await upload(h, data); sweep(); }
  } else if (!/^[0-9a-f]{64}$/.test(h) || !(await exists(h))) return { error: 'unknown workbook', need_file: true };
  const p = await itemPath(h);
  const s = await call('POST', `${p}/workbook/createSession`, { persistChanges: false });
  if (!s.ok || !s.j.id) fail(s, 'opening the workbook');
  const sid = s.j.id, H = { 'workbook-session-id': sid };
  const calc = async () => { const r = await call('POST', `${p}/workbook/application/calculate`, { calculationType: 'Full' }, H); if (!r.ok) fail(r, 'recalculating'); };
  const out = { hash: h, engine: 'excel' };
  try {
    if (req.check && data) {
      await calc();
      const st = storedValues(data), refs = Object.keys(st).map(k => [k, parseRef(k)]);
      const S = await readSheets(p, sid, [...new Set(refs.map(([, q]) => q.sheet))]);
      const bad = refs.filter(([k, q]) => !same(at(S, q), st[k])).map(([k]) => k);
      out.check = { tot: refs.length, match: refs.length - bad.length, bad: bad.slice(0, 200) };
    }
    for (const [ref, v] of req.sets || []) {
      const q = parseRef(ref);
      const body = typeof v === 'string' && v.startsWith('=') ? { formulas: [[v]] } : { values: [[v == null ? '' : v]] };
      const r = await call('PATCH', `${p}${ws(q.sheet)}/range(address='${q.addr}')`, body, H);
      if (!r.ok) fail(r, `setting ${ref}`);
    }
    const read = (req.read || []).map(parseRef);
    if ((req.sets || []).length || !out.check) await calc();
    const S = read.length ? await readSheets(p, sid, [...new Set(read.map(q => q.sheet))]) : {};
    out.values = read.map(q => at(S, q));
  } finally {
    await call('POST', `${p}/workbook/closeSession`, {}, H).catch(() => {});
  }
  out.ms = Date.now() - t0;
  return out;
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
  if (!configured()) return send(200, { ok: false, why: 'not set up' });
  try {
    if (req.method === 'GET') {
      // the folder answers: the app can reach it. Whatever fails is said in words (no secret is ever in these messages), so the system check can show it
      try {
        const r = await call('GET', `${(await folder())}?$select=id`);
        return send(200, r.ok ? { ok: true, version: 'Microsoft Excel (Microsoft 365)' } : { ok: false, why: `the folder ${env('XL_FOLDER')} does not answer (${r.status}${r.j && r.j.error && r.j.error.message ? ': ' + r.j.error.message : ''})` });
      } catch (e) { return send(200, { ok: false, why: String((e && e.message) || e).slice(0, 300) }); }
    }
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
    let body = req.body;
    if (body === undefined) { const ch = []; for await (const c of req) ch.push(c); body = Buffer.concat(ch).toString('utf8'); }
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const out = await recalc(body || {});
    return send(out.need_file ? 404 : 200, out);
  } catch (e) {
    return send(502, { error: String((e && e.message) || e).slice(0, 300) });
  }
};
module.exports._test = { parseRef, storedValues, same, recalc, reset: () => { TOKEN = null; FOLDER = null; } };
