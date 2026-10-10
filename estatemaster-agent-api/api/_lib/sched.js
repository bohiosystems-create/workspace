// The daily report's schedule (time, timezone, days, recipients, languages) and the log of what was sent.
// Stored as one JSON file next to the exports (EXPORTS_FOLDER/_bohio-agent-schedule.json), so the 15-minute server tick
// and the app read the same thing. Writing it needs Files.ReadWrite.All (application) on the Entra app; without it the
// schedule falls back to the Vercel variables REPORT_TIME, REPORT_DAYS, REPORT_TO, REPORT_LANGS.
const G = require('./graph');
const { env } = G;
const DAYN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const daysOf = v => [...new Set(String(v || '').toLowerCase().split(/[,\s]+/).map(x => /^\d$/.test(x) ? +x : DAYN.indexOf(x.slice(0, 3))).filter(n => n >= 0 && n <= 6))].sort();
const defaults = () => ({ enabled: env('REPORT_ENABLED') !== '0', time: /^\d{2}:\d{2}$/.test(env('REPORT_TIME')) ? env('REPORT_TIME') : '07:00', timezone: env('REPORT_TZ') || 'Asia/Riyadh', days: daysOf(env('REPORT_DAYS') || 'sun,mon,tue,wed,thu'), recipients: env('REPORT_TO'), languages: (env('REPORT_LANGS') || 'en').split(',').map(x => x.trim()).filter(x => x === 'en' || x === 'ar'), updatedBy: '', updatedAt: '' });
const filePath = () => env('SCHEDULE_FILE') || (env('EXPORTS_FOLDER') ? `${env('EXPORTS_FOLDER')}/_bohio-agent-schedule.json` : '');
async function load(token) {
  const path = filePath(); let saved = null, err = '';
  if (path && token) { try { saved = JSON.parse((await G.graphBytes(token, `${path}:/content`)).toString('utf8')); } catch (e) { if (!/404/.test(e.message)) err = e.message; } }
  const schedule = { ...defaults(), ...((saved && saved.schedule) || {}) };
  if (!schedule.languages || !schedule.languages.length) schedule.languages = ['en'];
  return { schedule, log: (saved && saved.log) || [], feed: (saved && saved.feed) || null, stress: (saved && saved.stress) || null, daily: (saved && saved.daily) || null, stored: !!saved, path, err };
}
async function save(token, st) {
  const path = filePath(); if (!path) throw new Error('EXPORTS_FOLDER is not set, so there is nowhere to keep the schedule. Set it in Vercel.');
  try { await G.graphPut(token, `${path}:/content`, JSON.stringify({ schedule: st.schedule, log: (st.log || []).slice(0, 40), feed: st.feed || null, stress: st.stress || null, daily: st.daily || null }, null, 1)); }
  catch (e) { throw new Error(/40[13]/.test(e.message) ? 'The server cannot write the schedule file: add Files.ReadWrite.All (application) to the Entra app and grant admin consent. Until then the Vercel variables REPORT_TIME, REPORT_DAYS and REPORT_TO apply.' : e.message); }
}
function parts(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return { dow: DAYN.indexOf(p.weekday.toLowerCase().slice(0, 3)), h: +p.hour, m: +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}
/* Due when today is a report day, the local time is within 15 minutes after the set time (the tick runs every 15) and nothing was sent today. */
function due(s, now, log = []) {
  if (!s.enabled) return false; const p = parts(now, s.timezone); if (!s.days.includes(p.dow)) return false;
  const [h, m] = s.time.split(':').map(Number), d = p.h * 60 + p.m - (h * 60 + m); if (d < 0 || d >= 15) return false;
  return !log.some(r => r.kind === 'scheduled' && r.date === p.date && r.status === 'sent');
}
function nextRun(s, now = new Date()) {
  if (!s.enabled || !s.days.length) return null;
  for (let i = 0; i < 8 * 96; i++) { const t = new Date(Math.floor(now.getTime() / 9e5) * 9e5 + i * 9e5); const p = parts(t, s.timezone); const [h, m] = s.time.split(':').map(Number); if (s.days.includes(p.dow) && p.h * 60 + p.m >= h * 60 + m && p.h * 60 + p.m < h * 60 + m + 15 && t > now) { const at = new Date(t.getTime() - ((p.h * 60 + p.m) - (h * 60 + m)) * 6e4); return { at: at.toISOString(), label: at.toLocaleString('en-GB', { timeZone: s.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }; } }
  return null;
}
async function record(token, st, entry, now = new Date()) {
  st.log = [{ at: now.toISOString(), date: parts(now, st.schedule.timezone).date, ...entry }, ...(st.log || [])].slice(0, 40);
  try { await save(token, st); } catch { /* without write permission the log is not kept */ }
}
module.exports = { load, save, due, nextRun, record, daysOf, parts, filePath, defaults };
