// The daily report, as the Reports tab shows it: the schedule (save), the delivery check, the history, and three actions:
// preview (built now, not sent), test (sent now to the recipients), snapshot (built now and logged, not sent).
//   GET                 → { schedule, next, stored, allowed, check, ready, history }
//   POST {action:'save', schedule:{enabled,time,timezone,days,recipients,languages}, by}
//   POST {action:'preview'|'test'|'snapshot'}
//   POST {action:'export', name, data (base64)}  an export uploaded in the app, copied into EXPORTS_FOLDER for the server's report
//   POST {action:'stress'}                       run the standard stress tests on every model now (as before the daily report)
//   POST {action:'feed', items:[…]}               the Daily feed's open items (with the AI's impact), for the report's "To know today"
// The schedule itself lives in a JSON file next to the exports (see api/_lib/sched.js); the 15-minute tick in api/cron.js sends it.
const G = require('./_lib/graph');
const SCHED = require('./_lib/sched');
const { env } = G;
const cron = require('./cron');

function sameOrigin(req) { const o = req.headers.origin, h = req.headers.host; if (!o || !h) return true; try { return new URL(o).host === h; } catch { return false; } }
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

async function state(token) {
  const st = await SCHED.load(token), s = st.schedule;
  const rec = G.checkRecipients(String(s.recipients || '').split(/[,;\s]+/).filter(Boolean));
  const people = env('REPORTS_ALLOWED_RECIPIENTS').split(',').map(x => x.trim()).filter(Boolean);
  let folderOk = false, folderNote = 'EXPORTS_FOLDER is not set';
  if (token && env('EXPORTS_FOLDER')) { try { const j = await G.graph(token, `${env('EXPORTS_FOLDER')}:/children?$select=name,file&$top=50`); const all = j.value || [], n = all.filter(f => f.file && /\.(xlsx|xlsm|xls|csv)$/i.test(f.name)).length; folderOk = true; folderNote = n ? `${n} export${n === 1 ? '' : 's'} in the folder` : all.length ? `no Excel export in the folder (it holds: ${all.slice(0, 6).map(f => f.name + (f.file ? '' : '/')).join(', ')}${all.length > 6 ? '…' : ''}; exports must be .xlsx, .xlsm, .xls or .csv files directly in the folder, not in a subfolder)` : 'the folder is empty: save the EstateMaster export (Office Links → Excel) into it'; } catch (e) { folderNote = e.message; } }
  const last = st.log.find(r => r.status === 'sent');
  const check = [
    { k: 'recipients', ok: rec.ok.length > 0 && !rec.bad.length, label: rec.ok.length ? `Recipients: ${rec.ok.join(', ')}` : 'Recipients: none set', detail: rec.bad.length ? `not allowed: ${rec.bad.join(', ')}` : '' },
    { k: 'enabled', ok: !!s.enabled, label: s.enabled ? 'Daily sending is on' : 'Daily sending is off' },
    { k: 'outlook', ok: G.graphConfigured(), label: G.graphConfigured() ? 'Outlook is live' : 'Outlook is not live (OUTLOOK_MODE / Microsoft 365 variables)' },
    { k: 'creds', ok: !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET')), label: 'Microsoft 365 app credentials set' },
    { k: 'from', ok: !!env('OUTLOOK_MAILBOX'), label: env('OUTLOOK_MAILBOX') ? `Sent from ${env('OUTLOOK_MAILBOX')}` : 'No sending mailbox (OUTLOOK_SENDER)' },
    { k: 'exports', ok: folderOk, label: folderOk ? `Exports folder readable · ${folderNote}` : `Exports folder: ${folderNote}` },
    { k: 'cron', ok: !!env('CRON_SECRET'), label: env('CRON_SECRET') ? 'Scheduler endpoint enabled (every 15 minutes)' : 'Scheduler off: set CRON_SECRET' },
    { k: 'stored', ok: st.stored, soft: true, label: st.stored ? 'Schedule saved on the server' : 'Schedule not saved yet: the Vercel variables apply (REPORT_TIME, REPORT_DAYS, REPORT_TO)', detail: st.err },
    { k: 'ai', ok: G.aiConfigured(), soft: true, label: G.aiConfigured() ? 'AI connected (Outlook findings, Arabic)' : 'No AI key: Outlook findings and Arabic are skipped' },
  ];
  if (last) check.push({ k: 'last', ok: true, soft: true, label: `Last delivered ${last.at.slice(0, 16).replace('T', ' ')} UTC to ${(last.to || []).join(', ')}` });
  return { schedule: s, next: SCHED.nextRun(s), stored: st.stored, stress: st.stress || null, allowed: { domains: G.allowedDomains(), people }, check, ready: check.filter(c => !c.soft).every(c => c.ok), history: st.log, now: new Date().toISOString() };
}

module.exports = async function handler(req, res) {
  if (!sameOrigin(req)) return G.send(res, 403, { error: 'Forbidden' });
  const code = G.accessCode && G.accessCode(); if (code && req.headers['x-demo-pass'] !== code) return G.send(res, 401, { error: 'Access code missing or wrong.' });
  if (!G.graphConfigured()) return G.send(res, 200, { configured: false, error: 'Microsoft 365 is not connected: the schedule runs in the browser only.' });
  let token; try { token = await G.graphToken(); } catch (e) { return G.send(res, 502, { error: e.message }); }
  if (req.method === 'GET') return G.send(res, 200, { configured: true, ...(await state(token)) });
  if (req.method !== 'POST') return G.send(res, 405, { error: 'Method not allowed' });
  let b; try { b = await G.readBody(req); } catch { return G.send(res, 400, { error: 'Invalid JSON' }); }
  const appUrl = env('APP_URL') || (req.headers.host ? `https://${req.headers.host}` : ''), now = new Date();
  try {
    if (b.action === 'save') {
      const s = b.schedule || {}, time = String(s.time || '');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Time must be HH:MM (24-hour).');
      try { new Intl.DateTimeFormat('en', { timeZone: s.timezone }); } catch { throw new Error('Unknown timezone.'); }
      const days = SCHED.daysOf((s.days || []).join(',')); if (!days.length) throw new Error('Pick at least one day.');
      const languages = [...new Set(s.languages || [])].filter(x => x === 'en' || x === 'ar'); if (!languages.length) throw new Error('Pick at least one language.');
      const list = [...new Set(String(s.recipients || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
      const badAddr = list.find(x => !EMAIL.test(x)); if (badAddr) throw new Error(`Not a valid address: ${badAddr}`);
      const rec = G.checkRecipients(list); if (rec.bad.length) throw new Error(`${rec.bad.join(', ')} is not an allowed recipient (${[...rec.domains.map(d => '@' + d), ...env('REPORTS_ALLOWED_RECIPIENTS').split(',').filter(Boolean)].join(', ')}). Reports go to internal addresses only.`);
      const st = await SCHED.load(token);
      st.schedule = { enabled: !!s.enabled, time, timezone: s.timezone, days, recipients: list.join(', '), languages, updatedBy: String(b.by || '').slice(0, 60), updatedAt: now.toISOString() };
      await SCHED.save(token, st);
      return G.send(res, 200, { saved: true, ...(await state(token)) });
    }
    if (b.action === 'export') {
      const name = String(b.name || '').replace(/[\\/:*?"<>|#%]+/g, '_').trim().slice(0, 120), data = String(b.data || '');
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(name)) throw new Error('Only Excel or CSV exports are copied to the exports folder.');
      if (!data || data.length > 5.5e6) throw new Error('The export is empty or larger than 4 MB.');
      if (!env('EXPORTS_FOLDER')) throw new Error('EXPORTS_FOLDER is not set in Vercel.');
      try { await G.graphPut(token, `${env('EXPORTS_FOLDER')}/${encodeURIComponent(name)}:/content`, Buffer.from(data, 'base64'), 'application/octet-stream'); }
      catch (e) { throw new Error(/40[13]/.test(e.message) ? 'The server cannot write to the exports folder: add Files.ReadWrite.All (application) to the Entra app and grant admin consent.' : e.message); }
      return G.send(res, 200, { stored: true, name, ...(await state(token)) });
    }
    if (b.action === 'feed') {
      const st = await SCHED.load(token);
      st.feed = { at: now.toISOString(), project: String(b.project || '').slice(0, 80), items: (Array.isArray(b.items) ? b.items : []).slice(0, 25).map(i => ({ id: String(i.id || '').slice(0, 20), kind: String(i.kind || '').slice(0, 20), title: String(i.title || '').slice(0, 200), change: String(i.change || '').slice(0, 300), why: String(i.why || '').slice(0, 300), from: String(i.from || '').slice(0, 80), at: String(i.at || '').slice(0, 30), impact: Array.isArray(i.impact) ? i.impact.slice(0, 3).map(m => ({ k: String(m.k || '').slice(0, 20), label: String(m.label || '').slice(0, 40), base: String(m.base || '').slice(0, 30), value: String(m.value || '').slice(0, 30), below: !!m.below })) : [], by: String(i.by || '').slice(0, 80), urgent: !!i.urgent })) };
      await SCHED.save(token, st);
      return G.send(res, 200, { stored: true, items: st.feed.items.length });
    }
    if (b.action === 'stress') {
      // the standard stress tests on every model in the exports folder, as the server runs them before the daily report
      const d = await cron.dailyData(token, now, { stressOnly: true });
      if (d.skipped || d.noExport) throw new Error(d.skipped || d.noExport);
      const st = await SCHED.load(token); st.stress = { at: now.toISOString(), models: d.stress || [] }; await SCHED.save(token, st);
      return G.send(res, 200, { stress: st.stress });
    }
    if (b.action === 'preview' || b.action === 'snapshot' || b.action === 'test') {
      const st = await SCHED.load(token), s = st.schedule;
      const r = await cron.reportJob(token, now, b.action !== 'test', appUrl, { to: s.recipients, langs: b.action === 'test' ? s.languages : [b.lang === 'ar' ? 'ar' : (s.languages[0] || 'en')], force: true });
      if (r.skipped) return G.send(res, 200, { skipped: r.skipped });
      if (b.action !== 'preview') await SCHED.record(token, st, { kind: b.action === 'test' ? 'test' : 'manual', status: r.sent ? 'sent' : 'generated', note: r.note || '', to: r.to || [], langs: r.langs || [], latest: r.latest || '' }, now);
      return G.send(res, 200, { html: r.preview || '', previews: r.previews, sent: !!r.sent, to: r.to || [], note: r.note || '', rejected: r.rejected || [], latest: r.latest, checks: r.checks, market: r.market, flags: r.flags, stress: r.stress, history: (await SCHED.load(token)).log });
    }
    return G.send(res, 400, { error: 'Unknown action' });
  } catch (e) { return G.send(res, 400, { error: e.message }); }
};
