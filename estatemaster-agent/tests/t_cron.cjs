// Server jobs: twice-daily email scan with alert, morning EstateMaster report from the exports folder, mail sender.
// Microsoft sign-in, Graph, SharePoint files and Claude are mocked at the fetch level.
const SP = (__dirname+'/fixtures/');
const API = __dirname+'/../api/';
const Module = require('module'); const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) { if (r === 'xlsx') return SP + 'package/xlsx.js'; return orig.call(this, r, ...a); };
const XLSX = require(SP + 'package/xlsx.js');
Object.assign(process.env, { MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', OUTLOOK_MAILBOX: 'al-narjis@kinan.com.sa', OUTLOOK_FOLDER: 'Inbox', ANTHROPIC_API_KEY: 'k', CRON_SECRET: 'sek', ALERT_TO: 'matteo@kinan.com.sa,someone@gmail.com', REPORT_TO: 'ic@kinan.com.sa', EXPORTS_FOLDER: '/sites/S1/drive/root:/Bohio/Exports', APP_URL: 'https://agent.example' });
const R = []; const ck = (n, ok, d) => R.push([ok ? 'PASS' : 'FAIL', n, String(d ?? '').slice(0, 260)]);
const xbuf = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Summary'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
const exNew = xbuf([['Summary'], ['Total Development Cost', null, 401000000], ['Net Development Profit', null, 85000000], ['Development Margin', null, 0.212], ['Project IRR (ungeared)', null, 0.161], ['Equity IRR (geared)', null, 0.224], ['Peak Debt Exposure', null, 210000000], ['Equity Multiple', null, 1.62]]);
const exOld = xbuf([['Summary'], ['Total Development Cost', null, 395000000], ['Net Development Profit', null, 91000000], ['Development Margin', null, 0.231], ['Equity IRR (geared)', null, 0.238], ['Peak Debt Exposure', null, 205000000], ['Equity Multiple', null, 1.66]]);
let calls = [], sent = [], msgFilter = '', msgFilters = [], badExport = false;
const exBad = xbuf([['Summary'], ['Option / Stage', 'Base Case'], ['Total Development Cost', null, 401000], ['Net Development Profit', null, 85000000], ['Development Margin', null, 0.30], ['Equity IRR (geared)', null, 0.224], ['Project IRR (ungeared)', null, 0.261], ['Peak Debt Exposure', null, 450000000], ['Contingency', null, 0], ['Loan 1 interest rate', null, 0.22]]);
global.fetch = async (url, o = {}) => {
  url = String(url); calls.push(url);
  const json = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => new ArrayBuffer(0) });
  if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'tok' });
  if (url.includes('/sendMail')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 202, json: async () => ({}) }; }
  if (url.includes('/mailFolders/inbox/messages')) { msgFilter = decodeURIComponent(url); msgFilters.push(msgFilter); return json({ value: [
    { id: 'm1', subject: 'Facility terms', from: { emailAddress: { name: 'Omar H.', address: 'omar@bank.com' } }, receivedDateTime: '2026-10-05T05:10:00Z', body: { content: 'Following credit committee, the Loan 1 interest rate moves to 8.0% p.a. from 7.5%.' } },
    { id: 'm2', subject: 'Lunch', from: { emailAddress: { name: 'Sara', address: 'sara@kinan.com.sa' } }, receivedDateTime: '2026-10-05T06:00:00Z', body: { content: 'See you at 1.' } }] }); }
  if (url.includes('api.anthropic.com')) return json({ content: [{ type: 'text', text: JSON.stringify({ findings: [{ message_id: 'm1', assumption: 'Loan 1 interest rate', new_value: '8.0% p.a.', previous_value: '7.5% p.a.', quote: 'the Loan 1 interest rate moves to 8.0% p.a. from 7.5%', confidence: 0.92 }] }) }] });
  if (url.includes('/Bohio/Exports:/children')) return json({ value: [
    { id: 'f1', name: 'DF_CS046_export_0310.xlsx', lastModifiedDateTime: '2026-10-03T09:00:00Z', file: {} },
    { id: 'f2', name: 'DF_CS046_export_0410.xlsx', lastModifiedDateTime: '2026-10-04T12:00:00Z', file: {} },
    { id: 'f0', name: 'notes.docx', lastModifiedDateTime: '2026-10-04T13:00:00Z', file: {} }] });
  if (url.includes('/items/f2/content')) { const bb = badExport ? exBad : exNew; return { ok: true, status: 200, arrayBuffer: async () => bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.length) }; }
  if (url.includes('/items/f1/content')) return { ok: true, status: 200, arrayBuffer: async () => exOld.buffer.slice(exOld.byteOffset, exOld.byteOffset + exOld.length) };
  return json({ error: { message: 'unexpected ' + url } }, 404);
};
const call = (h, { method = 'GET', url = '/', headers = {}, body } = {}) => new Promise(ok => {
  const req = { method, url, headers: { host: 'agent.example', ...headers }, body };
  const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { let j = b; try { j = JSON.parse(b); } catch {} ok({ status: this.statusCode, body: j }); } };
  h(req, res);
});
(async () => {
  const cron = require(API + 'cron.js'), mail = require(API + 'mail.js'), scan = require(API + 'scan.js');
  // scan windows: twice a day, each covering the time since the previous scan
  const w1 = cron.windowFor(new Date('2026-10-05T04:07:00Z')), w2 = cron.windowFor(new Date('2026-10-05T12:40:00Z')), w3 = cron.windowFor(new Date('2026-10-05T02:00:00Z'));
  ck('window: 07:00 scan covers since 15:00 yesterday', w1.since === '2026-10-04T12:00:00.000Z' && w1.slot === '2026-10-05T04:00:00.000Z', JSON.stringify(w1));
  ck('window: 15:00 scan covers since 07:00 today (late fire still fine)', w2.since === '2026-10-05T04:00:00.000Z' && w2.slot === '2026-10-05T12:00:00.000Z', JSON.stringify(w2));
  ck('window: off-schedule run maps to the last slot', w3.since === '2026-10-04T04:00:00.000Z' && w3.slot === '2026-10-04T12:00:00.000Z', JSON.stringify(w3));
  let r = await call(cron); ck('status: scan and report scheduled', r.body.scan.enabled && r.body.report.enabled && r.body.scan.times.join() === '07:00,15:00', JSON.stringify(r.body));
  r = await call(cron, { url: '/api/cron?run=scan' }); ck('jobs refuse calls without CRON_SECRET', r.status === 401, r.status);
  r = await call(cron, { url: '/api/cron?run=scan,report&now=2026-10-05T04:05:00Z', headers: { authorization: 'Bearer sek' } });
  const sc = r.body.results.find(x => x.job === 'scan'), rp = r.body.results.find(x => x.job === 'report');
  ck('scan reads only since the previous scan', msgFilters.some(f => /receivedDateTime ge 2026-10-04T12:00:00.000Z/.test(f)), msgFilters.map(f => f.slice(-80)).join(' | '));
  ck('scan senses the change and emails the alert to internal recipients only', sc.findings === 1 && sc.sent && sc.to.join() === 'matteo@kinan.com.sa' && sc.rejected.join() === 'someone@gmail.com', JSON.stringify({ ...sc, preview: undefined }));
  const alert = sent[0];
  ck('alert email: subject, KINAN frame, the quote, proposed value, link', /1 possible assumption change/.test(alert.message.subject) && /Loan 1 interest rate/.test(alert.message.body.content) && /8\.0% p\.a\./.test(alert.message.body.content) && /moves to 8\.0%/.test(alert.message.body.content) && /https:\/\/agent\.example/.test(alert.message.body.content) && /KINAN/.test(alert.message.body.content) && alert.message.toRecipients.length === 1, alert.message.subject);
  ck('report reads the two latest exports and emails EstateMaster figures', rp.sent && rp.latest === 'DF_CS046_export_0410.xlsx' && rp.previous === 'DF_CS046_export_0310.xlsx' && rp.figures.levered_irr === 22.4 && rp.to.join() === 'ic@kinan.com.sa', JSON.stringify({ ...rp, preview: undefined }).slice(0, 240));
  const rep = sent[1].message.body.content;
  ck('report email: headline figures, change vs previous, hurdle line, source files', /22\.40%/.test(rep) && /−1\.40 pts/.test(rep) && /above the 18% hurdle/.test(rep) && /DF_CS046_export_0410\.xlsx/.test(rep), (rep.match(/−1\.40 pts|above the 18% hurdle/g) || []).join(','));
  ck('report: checks section says nothing to look at on a clean export, Outlook section flags the interest-rate change of the last 24h', /Checks on the export/.test(rep) && /Nothing to look at/.test(rep) && /Assumption changes and approvals asked for in emails/.test(rep) && /Loan 1 interest rate/.test(rep) && /8\.0% p\.a\./.test(rep) && /does not include them yet/.test(rep) && rp.flags.length === 1 && rp.checks.length === 0, JSON.stringify({ checks: rp.checks, flags: rp.flags }));
  // a bad export: unit slip, margin that does not reconcile, peak debt above cost, zero contingency, 22% interest, negative leverage
  badExport = true; sent = []; r = await call(cron, { url: '/api/cron?run=report&dry=1&now=2026-10-06T04:05:00Z', headers: { authorization: 'Bearer sek' } }); badExport = false;
  const bad = r.body.results[0];
  ck('report flags likely mistakes in the export: units, reconciliation, peak debt, zero contingency, interest rate out of range, negative leverage, jump vs previous', ['units', 'reconcile', 'debt', 'input-zero', 'input-range', 'leverage', 'jump'].every(c => bad.checks.some(k => k.code === c)) && bad.checks[0].level === 'error' && /Likely error/.test(bad.preview) && /thousands or millions/.test(bad.preview), bad.checks.map(c => c.code + ':' + c.level).join(','));
  // Friday: no report, scan still runs
  sent = []; r = await call(cron, { url: '/api/cron?run=scan,report&now=2026-10-09T04:05:00Z', headers: { authorization: 'Bearer sek' } });
  ck('no report on a non-report day', /not a report day \(fri\)/.test(r.body.results.find(x => x.job === 'report').skipped), JSON.stringify(r.body.results.map(x => x.skipped || x.sent)));
  // dry run: preview, nothing sent
  sent = []; r = await call(cron, { url: '/api/cron?run=scan&dry=1&now=2026-10-05T12:05:00Z', headers: { authorization: 'Bearer sek' } });
  ck('dry run returns the preview and sends nothing', !sent.length && /<html>/.test(r.body.results[0].preview), sent.length);
  // nobody to alert
  process.env.ALERT_TO = ''; sent = []; r = await call(cron, { url: '/api/cron?run=scan&now=2026-10-05T12:05:00Z', headers: { authorization: 'Bearer sek' } });
  ck('no ALERT_TO: findings kept, no email', r.body.results[0].findings === 1 && !sent.length && /ALERT_TO/.test(r.body.results[0].note), r.body.results[0].note); process.env.ALERT_TO = 'matteo@kinan.com.sa';
  // mail sender used by the app for scheduled reports and alerts
  sent = []; r = await call(mail); ck('mail status', r.body.configured && r.body.domains.join() === 'kinan.com.sa', JSON.stringify(r.body));
  r = await call(mail, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { to: ['x@gmail.com'], subject: 's', html: '<p>h</p>' } }); ck('mail refuses external recipients', r.status === 400 && /internal/.test(r.body.error), r.body.error);
  r = await call(mail, { method: 'POST', headers: { origin: 'https://evil.example' }, body: { to: ['ic@kinan.com.sa'], subject: 's', html: '<p>h</p>' } }); ck('mail refuses other origins', r.status === 403, r.status);
  r = await call(mail, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { to: 'ic@kinan.com.sa; cfo@kinan.com.sa', subject: 'IC pack', html: '<p>h</p>', attachments: [{ name: 'IC.html', contentType: 'text/html', base64: Buffer.from('<h1>x</h1>').toString('base64') }] } });
  ck('mail sends with the attachment', r.status === 200 && sent[0].message.toRecipients.length === 2 && sent[0].message.attachments[0].name === 'IC.html', JSON.stringify(r.body));
  // scan.js still works after the refactor
  r = await call(scan, { method: 'POST', body: { register: [{ id: 'L0007', label: 'Loan 1 interest rate', unit: '% p.a.', current: 7.5, core: false }], since: '2026-10-04T00:00:00Z', project: 'DF_CS046' } });
  ck('scan.js (app scan) still reads messages', r.status === 200 && r.body.messages.length === 2, r.status + ' ' + (r.body.error || ''));
  for (const x of R) console.log(x.join('  '));
})();
