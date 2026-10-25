// The Excel engine (/api/xl) against a stand-in for Microsoft's sign-in and Graph: the workbook goes to the folder once under its hash,
// a session that saves nothing is opened, Excel recalculates in full, the cells are set and read, the session is closed; the check
// compares Excel's results with what the file stores, read the same way as the LibreOffice service (lo-service/server.py) reads them.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ok = []; const t = (c, m) => ok.push((c ? 'PASS' : 'FAIL') + ' | ' + m);
const FX = path.join(__dirname, 'fixtures', 'models');
(async () => {
  const log = [], files = {}, sessions = {};
  let excelDiffers = null;   // a cell whose recalculated value the stand-in reports differently, to test the check
  const srv = http.createServer(async (req, res) => {
    const ch = []; for await (const c of req) ch.push(c); const body = Buffer.concat(ch);
    const u = decodeURIComponent(req.url), J = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    log.push(req.method + ' ' + u + (req.headers['workbook-session-id'] ? ' [s]' : ''));
    if (u.startsWith('/nowhere')) return J(400, { error: 'invalid_client', error_description: 'the client secret is wrong' });
    if (u.includes('/oauth2/v2.0/token')) { const sec = new URLSearchParams(body.toString()).get('client_secret'); if (sec !== 'sec') return J(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID.\r\nTrace ID: x' }); }
    if (u.includes('/oauth2/v2.0/token')) return J(200, { access_token: 'tok', expires_in: 3600 });
    if (req.headers.authorization !== 'Bearer tok') return J(401, { error: { message: 'no token' } });
    if (/^\/v1\.0\/sites\/contoso\.sharepoint\.com:\/sites\/calc\?/.test(u)) return J(200, { id: 'SITE1' });
    let m = u.match(/^\/v1\.0\/sites\/SITE1\/drive\/root:\/Bohio Calc\/([0-9a-f]{64})\.xlsx:(.*)$/);
    if (!m) { if (/^\/v1\.0\/sites\/SITE1\/drive\/root:\/Bohio Calc(\?|:\/children)/.test(u)) return J(200, { id: 'F', value: [] }); return J(404, { error: { message: 'no route ' + u } }); }
    const h = m[1], rest = m[2];
    if (rest === '/content' && req.method === 'PUT') { files[h] = body; return J(201, { id: h }); }
    if (!files[h]) return J(404, { error: { message: 'itemNotFound' } });
    if (rest.startsWith('?$select=id')) return J(200, { id: h });
    if (rest === '/workbook/createSession') { const id = 'S' + Object.keys(sessions).length; sessions[id] = { h, persist: JSON.parse(body).persistChanges, sets: {}, calc: 0, closed: false }; return J(201, { id }); }
    const S = sessions[req.headers['workbook-session-id']]; if (!S) return J(400, { error: { message: 'no session' } });
    if (rest === '/workbook/closeSession') { S.closed = true; return J(204, {}); }
    if (rest === '/workbook/application/calculate') { S.calc++; S.calcType = JSON.parse(body).calculationType; return J(200, {}); }
    m = rest.match(/^\/workbook\/worksheets\('(.+)'\)\/range\(address='([A-Z]+\d+)'\)$/);
    if (m && req.method === 'PATCH') { const v = JSON.parse(body); S.sets[m[1].replace(/''/g, "'") + '!' + m[2]] = v.values ? v.values[0][0] : v.formulas[0][0]; return J(200, {}); }
    m = rest.match(/^\/workbook\/worksheets\('(.+)'\)\/usedRange\(valuesOnly=false\)/);
    if (m) {   // the stand-in Excel: the file's stored values, a set cell as set, and one cell moved by the "recalculation" when asked
      const sh = m[1].replace(/''/g, "'"), st = X.storedValues(files[h]), q = /[^A-Za-z0-9_]/.test(sh) ? `'${sh.replace(/'/g, "''")}'` : sh, vals = [];
      for (let r = 1; r <= 60; r++) { const row = []; for (let c = 1; c <= 30; c++) { const a = String.fromCharCode(64 + c) + r, k = q + '!' + a; let v = st[k] !== undefined ? st[k] : ''; if (v && typeof v === 'object') v = v.err; if (S.sets[sh + '!' + a] !== undefined) v = S.sets[sh + '!' + a]; if (excelDiffers === k) v = 12345.678; if (k === `${q}!C4` && S.sets[sh + '!C12'] !== undefined) v = 99999; row.push(v); } vals.push(row); }
      return J(200, { address: q + '!A1:AD60', values: vals });
    }
    return J(404, { error: { message: 'no route ' + rest } });
  }).listen(0);
  const port = srv.address().port;
  const X = require('../api/xl.js')._test, handler = require('../api/xl.js');
  const run = (method, body) => new Promise(res => { const out = { statusCode: 0, h: {} }; handler({ method, body: body === undefined ? undefined : body }, { set statusCode(v) { out.statusCode = v; }, get statusCode() { return out.statusCode; }, setHeader: (k, v) => (out.h[k] = v), end: s => res({ code: out.statusCode, j: JSON.parse(s) }) }); });

  // not set up: says so, nothing is called
  for (const k of ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'XL_FOLDER', 'XL_REFRESH_TOKEN']) delete process.env[k];
  let r = await run('GET');
  t(r.j.ok === false && /not set up/.test(r.j.why) && !log.length, 'not set up: the page is told, nothing is called');

  Object.assign(process.env, { MS_TENANT_ID: 'ten', MS_CLIENT_ID: 'cid', MS_CLIENT_SECRET: 'sec', XL_FOLDER: '/sites/contoso.sharepoint.com:/sites/calc:/drive/root:/Bohio Calc', LOGIN_BASE: `http://127.0.0.1:${port}`, GRAPH_BASE: `http://127.0.0.1:${port}` });
  X.reset();
  r = await run('GET');
  t(r.j.ok === true && /Excel/.test(r.j.version) && log.filter(l => /sites\/contoso/.test(l)).length === 1, 'set up: Excel answers, the SharePoint site is resolved once to its id: ' + JSON.stringify(r.j));

  // the stored values: the same reading as the LibreOffice service, on every fixture model
  const py = fs.readFileSync(path.join(__dirname, '..', 'lo-service', 'server.py'), 'utf8'), fn = py.slice(py.indexOf('def stored_values'), py.indexOf('def same'));
  const models = fs.readdirSync(FX).filter(f => /\.xlsx$/.test(f)).slice(0, 40);
  const pyOut = JSON.parse(execFileSync('python3', ['-I', '-c', 'import re,json,sys\n' + fn + '\nout={}\nfor f in sys.argv[1:]:\n  try:out[f]=stored_values(open(f,"rb").read())\n  except Exception as e:out[f]={"__err":str(e)}\nprint(json.dumps(out))', ...models.map(f => path.join(FX, f))], { maxBuffer: 1 << 28 }).toString());
  const diffs = [];
  const pyFail = models.filter(f => pyOut[path.join(FX, f)].__err);
  for (const f of models.filter(f => !pyOut[path.join(FX, f)].__err)) { let js; try { js = X.storedValues(fs.readFileSync(path.join(FX, f))); } catch (e) { js = { __err: e.message }; } const p0 = pyOut[path.join(FX, f)];
    const ks = new Set([...Object.keys(js), ...Object.keys(p0)]); for (const k of ks) if (!X.same(js[k], p0[k]) && !(js[k] && p0[k] && js[k].err && p0[k].err)) { diffs.push(`${f} ${k}: ${JSON.stringify(js[k])} vs ${JSON.stringify(p0[k])}`); break; } }
  t(!diffs.length && models.length - pyFail.length >= 10, `the stored values of ${models.length - pyFail.length} fixture workbooks read as the LibreOffice service reads them${pyFail.length ? ` (${pyFail.join(', ')}: the service's own reader fails there; this one reads them)` : ''}: ${diffs.slice(0, 3).join(' | ')}`);
  t(pyFail.every(f => { try { const v = X.storedValues(fs.readFileSync(path.join(FX, f))); return Object.values(v).every(z => !(typeof z === 'number' && !Number.isFinite(z))); } catch (e) { return false; } }), 'a workbook the service cannot read is read here, a cached value that is not a number kept as text');

  // the check: uploaded once, a session that saves nothing, a full recalculation, every stored formula compared, the session closed
  const buf = fs.readFileSync(path.join(FX, 'office_k.xlsx')), h = crypto.createHash('sha256').update(buf).digest('hex'), nst = Object.keys(X.storedValues(buf)).length;
  log.length = 0; r = await run('POST', { file: buf.toString('base64'), check: true, read: ['Pro Forma!C8'] });
  const S0 = Object.values(sessions)[0];
  t(r.code === 200 && r.j.hash === h && r.j.check && r.j.check.tot === nst && r.j.check.match === nst && files[h] && S0.persist === false && S0.calcType === 'Full' && S0.closed, 'a workbook is checked: uploaded under its hash, opened without saving, recalculated in full, every stored figure compared, the session closed: ' + JSON.stringify(r.j.check));
  t(typeof r.j.values[0] === 'number' && Math.abs(r.j.values[0] - X.storedValues(buf)["'Pro Forma'!C8"]) < 1e-9, 'a cell is read after the recalculation: ' + r.j.values[0]);
  log.length = 0; r = await run('POST', { file: buf.toString('base64'), check: true });
  t(!log.some(l => /^PUT .*\/content/.test(l)), 'the same workbook again is not uploaded again');

  // a figure Excel computes differently from what the file stores: the check reports it, so the page will not use the engine there
  excelDiffers = "'Pro Forma'!C8"; r = await run('POST', { file: buf.toString('base64'), check: true }); excelDiffers = null;
  t(r.j.check.match === nst - 1 && r.j.check.bad.includes("'Pro Forma'!C8"), 'a figure Excel computes differently is reported by the check: ' + JSON.stringify(r.j.check.bad));

  // later calls carry the hash; a set cell is written to its sheet (a quoted name), Excel recalculates, the result is read
  log.length = 0; r = await run('POST', { hash: h, sets: [["'Pro Forma'!$C$12", 13800]], read: ["'Pro Forma'!C12", "'Pro Forma'!C4"] });
  const S2 = Object.values(sessions).slice(-1)[0];
  t(r.code === 200 && r.j.values[0] === 13800 && r.j.values[1] === 99999 && S2.sets['Pro Forma!C12'] === 13800 && S2.calc === 1 && S2.closed && S2.persist === false, 'a what-if by hash: the cell set on its sheet, Excel recalculates, the results read, nothing saved: ' + JSON.stringify(r.j.values));
  // a formula is written as a formula
  r = await run('POST', { hash: h, sets: [["'Pro Forma'!C12", '=12000*1.1']], read: [] });
  t(Object.values(sessions).slice(-1)[0].sets['Pro Forma!C12'] === '=12000*1.1', 'a value written as a formula stays a formula');

  // a workbook the folder does not hold: the page is asked for the file (as the LibreOffice service does)
  r = await run('POST', { hash: 'a'.repeat(64), read: ['A!A1'] });
  t(r.code === 404 && r.j.need_file === true, 'an unknown workbook asks for the file');
  // a refused sign-in is said in words
  process.env.LOGIN_BASE = `http://127.0.0.1:${port}/nowhere`; X.reset();
  r = await run('POST', { hash: h, read: [] });
  t(r.code === 502 && /sign-in failed|answered/.test(r.j.error), 'a refused sign-in is reported, not hidden: ' + r.j.error);
  // the system check's GET says why in words, whatever fails (a refused sign-in, a folder that does not answer)
  process.env.LOGIN_BASE = `http://127.0.0.1:${port}/nowhere`; X.reset(); r = await run('GET');
  t(r.code === 200 && r.j.ok === false && /sign-in failed/.test(r.j.why), 'GET: a refused sign-in is said as the reason, not a bare failure: ' + r.j.why);
  process.env.LOGIN_BASE = `http://127.0.0.1:${port}`; process.env.XL_FOLDER = '/sites/contoso.sharepoint.com:/sites/calc:/drive/root:/Missing Folder'; X.reset(); r = await run('GET');
  t(r.code === 200 && r.j.ok === false && /Missing Folder.*does not answer \(404/.test(r.j.why), 'GET: a folder that does not answer is named with its status: ' + r.j.why);
  process.env.XL_FOLDER = '/sites/contoso.sharepoint.com:/sites/calc:/drive/root:/Bohio Calc'; X.reset();
  // a secret pasted with quotes and a line break still works; a wrong one is described by its shape, never shown
  process.env.MS_CLIENT_SECRET = ' "sec"\n'; X.reset(); r = await run('GET');
  t(r.j.ok === true, 'a secret pasted with quotation marks and a line break is cleaned and accepted: ' + JSON.stringify(r.j));
  process.env.MS_CLIENT_SECRET = '1a2b3c4d-1111-2222-3333-444455556666'; X.reset(); r = await run('GET');
  t(r.j.ok === false && /AADSTS7000215/.test(r.j.why) && /looks like a secret ID/.test(r.j.why) && !r.j.why.includes('1a2b3c4d'), 'a secret ID pasted instead of the value is named as such, without showing it: ' + r.j.why);
  process.env.MS_CLIENT_SECRET = 'abcDE8Q~wrongwrongwrongwrongwrongwrong1234'; X.reset(); r = await run('GET');
  t(r.j.ok === false && /42 characters/.test(r.j.why) && /contains a ~/.test(r.j.why) && !r.j.why.includes('wrongwrong'), 'a wrong value is described by its length and shape only: ' + r.j.why);
  process.env.MS_CLIENT_SECRET = 'sec'; X.reset();
  // the reference reader
  const q = X.parseRef("'Cash ''Flow'''!$AB$12");
  t(q.sheet === "Cash 'Flow'" && q.addr === 'AB12' && q.col === 28 && q.row === 12, 'a quoted sheet name with an apostrophe and a column past Z are read');

  srv.close(); console.log(ok.join('\n')); process.exit(ok.some(z => z.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log('FAIL | ' + e.stack); process.exit(1); });
