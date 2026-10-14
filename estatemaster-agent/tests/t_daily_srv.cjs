// Server: /api/schedule (save, delivery check, preview, test), the 15-minute tick, market section, Arabic.
const SP = (__dirname+'/fixtures/');
const API = __dirname+'/../api/';
const Module = require('module'); const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) { if (r === 'xlsx') return SP + 'package/xlsx.js'; return orig.call(this, r, ...a); };
const XLSX = require(SP + 'package/xlsx.js');
Object.assign(process.env, { MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', OUTLOOK_SENDER: 'investmentagent@jeddahsicon.com', ANTHROPIC_API_KEY: 'k', CRON_SECRET: 'sek', REPORTS_ALLOWED_RECIPIENTS: 'mb@jeddahsicon.com', EXPORTS_FOLDER: '/sites/h:/sites/Bohio:/drive/root:/Exports', HURDLE_IRR: '10' });
const R = []; const ck = (n, ok, d) => R.push([ok ? 'PASS' : 'FAIL', n, String(d ?? '').slice(0, 260)]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Build to Hold Industrial'], ['Type:', 'Industrial'], ['Site Area', 70000], ['Project Size (b)', 50000], ['', 'AUD Per Unit'], ['Equity IRR (geared)', 0.1232], ['Project IRR (ungeared)', 0.0963], ['Development Margin', 0.08], ['Net Development Profit', 40000000], ['Total Development Cost', 500000000], ['Gross Sales Revenue', 540000000], ['Peak Debt', 300000000]]), 'Summary');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Capitalisation Rate', 0.0575], ['Construction Cost', 95000000], ['Gross Rent', 120], ['Contingency', 0.05]]), 'Input');
const ex = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['Al Rabie Court'], ['Equity IRR (geared)', 0.241], ['Project IRR (ungeared)', 0.17], ['Development Margin', 0.212], ['Net Development Profit', 85000000], ['Total Development Cost', 401000000]]), 'Summary');
const ex2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }); let twoModels = false, impactCtx = [];
let sent = [], file = null, puts = 0, aiCalls = [];
let copied = [], emptyFolder = false;
global.fetch = async (url, o = {}) => {
  url = String(url);
  const json = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => new ArrayBuffer(0) });
  if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'tok' });
  if (/\/sites\/h:\/sites\/Bohio\?/.test(url)) return json({ id: 'h,s1,w1' });
  if (url.includes('/sendMail')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 202, json: async () => ({}) }; }
  if (/\/Exports\/[^/]*\.xlsx:\/content/.test(decodeURIComponent(url)) && o.method === 'PUT') { copied.push(decodeURIComponent(url).split('/Exports/')[1].replace(/:\/content.*$/, '')); return json({ id: 'x' }); }
  if (emptyFolder && url.includes('/Exports:/children')) return json({ value: [] });
  if (url.includes('_bohio-agent-schedule.json:/content')) {
    if ((o.method || 'GET') === 'PUT') { puts++; file = o.body; return json({ id: 'f' }); }
    if (!file) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const b = Buffer.from(file); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  }
  if (url.includes('/mailFolders/inbox/messages')) return json({ value: [{ id: 'm1', subject: 'Yield', from: { emailAddress: { name: 'Valuer', address: 'v@val.com' } }, receivedDateTime: '2026-10-06T05:10:00Z', body: { content: 'Our view of the exit yield is now 7.25%.' } }] });
  if (url.includes('api.anthropic.com')) { const b = JSON.parse(o.body); aiCalls.push(b.system.slice(0, 40));
    if (/estimate, step by step, the effect of each proposed change/.test(b.system)) impactCtx.push(b.messages[0].content);
    if (/estimate, step by step, the effect of each proposed change/.test(b.system)) return json({ content: [{ type: 'text', text: JSON.stringify({ impacts: [{ message_id: 'm1', levered_irr: 11.4, profit_on_cost: 19.8, net_profit: 38500000, working: 'A softer exit yield cuts the retail exit value by about 3%.' }] }) }] });
    if (/Translate/.test(b.system)) { const list = JSON.parse(b.messages[0].content); return json({ content: [{ type: 'text', text: JSON.stringify({ t: list.map(x => 'AR:' + x) }) }] }); }
    return json({ content: [{ type: 'text', text: JSON.stringify({ findings: [{ message_id: 'm1', model: /Financial models:.*Al Rabie Court/.test(b.system) ? 'Al Rabie Court' : null, assumption: 'Exit yield', new_value: '7.25%', previous_value: null, quote: 'exit yield is now 7.25%', confidence: 0.9 }] }) }] }); }
  if (url.includes('/Exports:/children')) return json({ value: [{ id: 'f1', name: 'DF_CS046.xlsx', lastModifiedDateTime: '2026-10-06T06:00:00Z', file: {} }].concat(twoModels ? [{ id: 'f2', name: 'Al Rabie Court.xlsx', lastModifiedDateTime: '2026-10-05T06:00:00Z', file: {} }] : []) });
  if (url.includes('/items/f2/content')) return { ok: true, status: 200, arrayBuffer: async () => ex2.buffer.slice(ex2.byteOffset, ex2.byteOffset + ex2.length) };
  if (url.includes('/items/f1/content')) return { ok: true, status: 200, arrayBuffer: async () => ex.buffer.slice(ex.byteOffset, ex.byteOffset + ex.length) };
  return json({ error: { message: 'unexpected ' + url } }, 404);
};
const call = (h, { method = 'GET', url = '/', headers = {}, body } = {}) => new Promise(ok => {
  const req = { method, url, headers: { host: 'agent.example', ...headers }, body };
  const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { let j = b; try { j = JSON.parse(b); } catch {} ok({ status: this.statusCode, body: j }); } };
  h(req, res);
});
(async () => {
  const sch = require(API + 'schedule.js'), cron = require(API + 'cron.js');
  let r = await call(sch);
  ck('GET: configured, defaults (07:00, Sun–Thu), delivery check, not stored yet', r.body.configured && r.body.schedule.time === '07:00' && r.body.schedule.days.join() === '0,1,2,3,4' && r.body.check.some(c => /Exports folder readable · 1 export/.test(c.label)) && r.body.stored === false && r.body.allowed.domains.join() === 'jeddahsicon.com', JSON.stringify({ s: r.body.schedule, c: r.body.check.map(c => c.label) }).slice(0, 260));
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'save', schedule: { enabled: true, time: '07:30', timezone: 'Asia/Riyadh', days: [0, 1, 2, 3, 4], recipients: 'someone@gmail.com', languages: ['en'] } } });
  ck('save refuses an external recipient', r.status === 400 && /not an allowed recipient/.test(r.body.error), r.body.error);
  r = await call(sch, { method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'save' } }); ck('other origins refused', r.status === 403, r.status);
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'save', by: 'Matteo', schedule: { enabled: true, time: '07:30', timezone: 'Asia/Riyadh', days: [0, 1, 2, 3, 4], recipients: 'mb@jeddahsicon.com', languages: ['en', 'ar'] } } });
  ck('save writes the schedule next to the exports; next run Wed 7 Oct 07:30; ready', r.status === 200 && puts === 1 && r.body.stored && r.body.next && /Wed 7 Oct, 07:30|07:30/.test(r.body.next.label) && r.body.ready, JSON.stringify({ n: r.body.next, ready: r.body.ready, checks: r.body.check.filter(c => !c.ok).map(c => c.label) }));
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'preview' } });
  const pv = r.body.html || '';
  ck('preview: EstateMaster figures, checks, Outlook (exit yield 7.25%), assumptions vs market (cap 5.75% below → aggressive, USD converted), nothing sent', /Daily EstateMaster report/.test(pv) && /12\.32%/.test(pv) && /Checks on the export/.test(pv) && /Exit yield/.test(pv) && /Assumptions vs market/.test(pv) && /5\.75%/.test(pv) && /below · aggressive/.test(pv) && /USD converted at 3\.75 SAR/.test(pv) && !sent.length, (r.body.market || []).map(x => x.text).join(' | ').slice(0, 260));
  ck('preview: the email change carries why it is asked for and the modelled impact (AI estimate, IRR → 11.40% below hurdle)', /In the email/.test(pv) && /Levered IRR/.test(pv) && /11\.40%/.test(pv) && /softer exit yield/.test(pv), (pv.match(/Impact[\s\S]{0,400}/) || [''])[0].replace(/<[^>]+>/g, ' ').slice(0, 300));
  // tick: 07:35 Riyadh on Wednesday → due → sends English and Arabic
  r = await call(cron, { url: '/api/cron?run=tick&now=2026-10-07T04:35:00Z', headers: { authorization: 'Bearer sek' } });
  const rp = r.body.results.find(x => x.job === 'report');
  ck('tick at 07:35 Riyadh (Wed): report due, sent in English and Arabic to the saved recipient', rp.sent && sent.length === 2 && sent.every(m => m.message.toRecipients[0].emailAddress.address === 'mb@jeddahsicon.com'), JSON.stringify({ ...rp, preview: undefined, market: undefined, checks: undefined }).slice(0, 260));
  const arm = sent.find(m => /كنان/.test(m.message.subject));
  ck('Arabic version: right-to-left, Arabic labels, check sentences translated by the AI', arm && /dir="rtl"/.test(arm.message.body.content) && /الافتراضات مقارنة بالسوق/.test(arm.message.body.content) && /تقرير إستيت ماستر اليومي/.test(arm.message.body.content) && aiCalls.some(s => /Translate/.test(s)), arm ? arm.message.subject : 'no arabic email');
  const st = JSON.parse(file); ck('the run is logged in the schedule file (history)', st.log[0].kind === 'scheduled' && st.log[0].status === 'sent' && st.log[0].date === '2026-10-07', JSON.stringify(st.log[0]));
  sent = []; r = await call(cron, { url: '/api/cron?run=tick&now=2026-10-07T04:40:00Z', headers: { authorization: 'Bearer sek' } });
  ck('second tick in the same window: not sent again', !sent.length && r.body.results.find(x => x.job === 'report').skipped === 'not due', JSON.stringify(r.body.results));
  r = await call(cron, { url: '/api/cron?run=tick&now=2026-10-09T04:35:00Z', headers: { authorization: 'Bearer sek' } });
  ck('Friday: not a report day, next run shown', !sent.length && r.body.results.find(x => x.job === 'report').next, JSON.stringify(r.body.results.find(x => x.job === 'report')));
  r = await call(cron, { url: '/api/cron?run=tick&now=2026-10-07T12:05:00Z', headers: { authorization: 'Bearer sek' } });
  ck('15:00 Riyadh tick runs the email scan', r.body.results.some(x => x.job === 'scan' && x.findings === 1), JSON.stringify(r.body.results.map(x => x.job + ':' + (x.findings ?? x.skipped))));
  sent = []; r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'test' } });
  ck('Send test now: sent and logged as a test', r.body.sent && sent.length === 2 && r.body.history[0].kind === 'test', JSON.stringify({ sent: r.body.sent, h: (r.body.history || [])[0] }));
  // the app copies an uploaded export into the folder
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'export', name: 'DF_CS046 v2.xlsx', data: Buffer.from('PK fake').toString('base64') } });
  ck('an export uploaded in the app is copied into the exports folder', r.status === 200 && r.body.stored && copied.includes('DF_CS046 v2.xlsx'), JSON.stringify({ s: r.status, copied, e: r.body.error }));
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'export', name: 'evil.exe', data: 'AA' } });
  ck('only Excel/CSV files are copied', r.status === 400, r.body.error);
  // the app shares its Daily feed; the report opens with "To know today"
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'feed', project: 'Al Narjis Mixed-Use', items: [{ id: 'CR-107', kind: 'email', title: 'Approval needed: 5% discount on 24 apartments', change: 'Sale price −0.7%', why: '24 units unsold against two competing launches', from: 'Faisal A. · Sales Director', impact: [{ k: 'levered_irr', label: 'Levered IRR', base: '12.32%', value: '11.10%', below: true }] }] } });
  ck('the Daily feed is stored for the server', r.status === 200 && r.body.items === 1 && /CR-107/.test(file), r.body.error || '');
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'preview' } });
  const ph = r.body.html || '';
  ck('the report opens with "To know today": the open decision from the Daily feed, why, its impact and below hurdle', ph.indexOf('To know today') > -1 && ph.indexOf('To know today') < ph.indexOf('Checks on the export') && /5% discount on 24 apartments/.test(ph) && /24 units unsold/.test(ph) && /11\.10%/.test(ph) && /decision needed/.test(ph) && /below hurdle/.test(ph), (ph.match(/To know today[\s\S]{0,500}/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 260));
  // no export in the folder: the report still goes, with what has to be known today
  emptyFolder = true; sent = [];
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'test' } });
  const nb = sent[0] ? sent[0].message.body.content : '';
  ck('no export in the folder: the email still goes, with To know today and the reason figures are missing', r.status === 200 && r.body.sent && /To know today/.test(nb) && /5% discount on 24 apartments/.test(nb) && /No EstateMaster figures today/.test(nb), JSON.stringify({ sent: r.body.sent, skipped: r.body.skipped, note: r.body.note }).slice(0, 240));
  emptyFolder = false;
  // two models in the folder: both in the email; the email's change is costed on the model it names
  twoModels = true; impactCtx = [];
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'preview' } });
  const mh = r.body.html || '';
  ck('two models in the folder: the email lists every model (IRR, profit on cost, net profit, checks)', /All financial models/.test(mh) && /Build to Hold Industrial/.test(mh) && /Al Rabie Court/.test(mh) && /24\.10%/.test(mh) && /12\.32%/.test(mh), (mh.match(/All financial models[\s\S]{0,600}/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240));
  ck('the email’s change is tagged and costed on the model it concerns (Al Rabie Court’s figures)', impactCtx.length === 1 && /24\.1/.test(impactCtx[0]) && /Al Rabie Court/.test(mh.split('Assumption changes and approvals')[1] || ''), impactCtx.map(c => c.slice(0, 80)).join(' | '));
  twoModels = false;
  // no write permission: clear message
  const g = require(API + '_lib/graph.js'); const put = g.graphPut; g.graphPut = async () => { throw new Error('Graph 403: Access denied'); };
  r = await call(sch, { method: 'POST', headers: { origin: 'https://agent.example' }, body: { action: 'save', schedule: { enabled: true, time: '08:00', timezone: 'Asia/Riyadh', days: [1], recipients: 'mb@jeddahsicon.com', languages: ['en'] } } }); g.graphPut = put;
  ck('without write permission the save explains Files.ReadWrite.All', r.status === 400 && /Files\.ReadWrite\.All/.test(r.body.error), r.body.error);
  for (const x of R) console.log(x.join('  '));
})();
