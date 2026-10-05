// Scheduled jobs that run on the server, with or without the app open (Vercel Cron, see vercel.json):
//   07:00 Riyadh  ?run=scan,report   email scan + the morning EstateMaster report
//   15:00 Riyadh  ?run=scan          email scan
// scan    reads the Outlook folder since the previous scheduled scan, asks the AI whether any email proposes a change
//         to an assumption, and emails ALERT_TO when it senses one. It changes nothing: in the app each finding
//         becomes a change request a person must approve.
// report  reads the two latest EstateMaster exports from the exports folder (Option 2 and 3: the analyst saves each
//         Office Links export there) and emails REPORT_TO a KINAN-style report of EstateMaster's own figures.
// Environment variables:
//   CRON_SECRET          Vercel sends it as "Authorization: Bearer <secret>"; requests without it are refused
//   ALERT_TO             who gets assumption-change alerts (comma list, internal addresses)
//   REPORT_TO            who gets the morning report (comma list, internal addresses); REPORT_DAYS default sun,mon,tue,wed,thu
//   EXPORTS_FOLDER       Graph path of the exports folder, e.g. /sites/{site-id}/drive/root:/Bohio/Exports
//                        or /users/analyst@kinan.com.sa/drive/root:/Bohio/Exports  (needs Files.Read.All)
//   APP_URL              link in the emails (default: this deployment)
//   PROJECT_NAME         default "Al Narjis Mixed-Use"
// plus the Graph and AI variables in api/_lib/graph.js.
const G = require('./_lib/graph');
const { env } = G;
const SLOTS = [4, 12]; // UTC hours of the two scans (07:00 and 15:00 Riyadh)
const OR = '#f15a22', CH = '#2e2e2f', SOFT = '#6f6f6f', TAUPE = '#51473d', LINE = '#e3e2df';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The scan window: everything since the previous scheduled slot, so two scans a day cover the day once. */
function windowFor(now = new Date()) {
  const h = now.getUTCHours(), d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cur = [...SLOTS].reverse().find(s => h >= s);
  const slot = cur == null ? new Date(d.getTime() - 864e5 + SLOTS[SLOTS.length - 1] * 36e5) : new Date(d.getTime() + cur * 36e5);
  const i = SLOTS.indexOf(slot.getUTCHours());
  const prev = i > 0 ? new Date(slot.getTime() - (SLOTS[i] - SLOTS[i - 1]) * 36e5) : new Date(slot.getTime() - (24 - SLOTS[SLOTS.length - 1] + SLOTS[0]) * 36e5);
  return { since: prev.toISOString(), slot: slot.toISOString() };
}
const riyadh = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* KINAN email frame: tables and inline styles only, so Outlook and Gmail show it as designed. */
function frame(kicker, title, sub, body, appUrl) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:${CH}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff">
<tr><td style="background:${CH};padding:18px 26px;color:#fff;font-size:11px;letter-spacing:.32em;text-transform:uppercase;font-weight:700">KINAN <span style="color:${OR}">›</span> <span style="font-weight:600;color:#cfcfcf;letter-spacing:.24em">AI agent on EstateMaster</span></td></tr>
<tr><td style="background:${OR};padding:30px 26px;color:#fff"><div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:700;opacity:.92">${esc(kicker)}</div><div style="font-size:24px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;margin:10px 0 6px">${esc(title)}</div><div style="font-size:13px;opacity:.92">${esc(sub)}</div></td></tr>
<tr><td style="padding:22px 26px;font-size:14px;line-height:1.55">${body}</td></tr>
${appUrl ? `<tr><td style="padding:0 26px 24px"><a href="${esc(appUrl)}" style="display:inline-block;background:${OR};color:#fff;text-decoration:none;font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;padding:12px 20px">Open the agent</a></td></tr>` : ''}
<tr><td style="background:${CH};padding:16px 26px;color:#bbb;font-size:11px">Nothing changes in EstateMaster until a person approves it in the app. Sent by the Bohio agent from ${esc(env('OUTLOOK_MAILBOX'))}.</td></tr>
</table></td></tr></table></body></html>`;
}
const th = t => `<th align="left" style="background:${CH};color:#fff;font-size:10px;letter-spacing:.2em;text-transform:uppercase;padding:8px">${t}</th>`;
const td = (t, x = '') => `<td style="padding:9px 8px;border-top:1px solid ${LINE};font-size:13px;vertical-align:top${x}">${t}</td>`;

async function scanJob(token, now, dry, appUrl) {
  const w = windowFor(now), msgs = await G.readMessages(token, w.since);
  if (!msgs.length) return { job: 'scan', window: w, messages: 0, findings: 0, sent: false };
  const system = `You read emails for a real estate development project and find any email that proposes or reports a change to an assumption of its financial model (sale prices, rents, construction costs and their elements, fees, contingency, timing and delays, areas, financing terms such as interest rate, margin, loan to cost, facility limits, equity terms, exit yields).
Return JSON only: {"findings":[{"message_id":string,"assumption":string,"new_value":string,"previous_value":string|null,"quote":string,"confidence":number}]}.
"quote" is the exact text that supports it. Include an item only if the email states or proposes a change; ignore everything else. Confidence 0-1. Project: ${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'}.`;
  const user = msgs.map(m => `message_id: ${m.id}\nfrom: ${m.from}\ndate: ${m.date}\nsubject: ${m.subject}\n---\n${m.body}`).join('\n\n=====\n\n');
  const j = G.jsonOf(await G.ai(system, user));
  const byId = Object.fromEntries(msgs.map(m => [m.id, m]));
  const findings = (j.findings || []).filter(f => byId[f.message_id] && f.assumption).map(f => ({ ...f, msg: byId[f.message_id], confidence: Math.max(0, Math.min(1, +f.confidence || 0.5)) }));
  const out = { job: 'scan', window: w, messages: msgs.length, findings: findings.length, items: findings.map(f => ({ from: f.msg.from, subject: f.msg.subject, assumption: f.assumption, new_value: f.new_value, quote: f.quote, confidence: f.confidence })), sent: false };
  if (!findings.length) return out;
  const to = G.checkRecipients(env('ALERT_TO').split(','));
  if (to.bad.length) out.rejected = to.bad;
  if (!to.ok.length) { out.note = 'ALERT_TO is not set (or has no internal address): no alert sent'; return out; }
  const rows = findings.map(f => `<tr>${td(`<b>${esc(f.assumption)}</b>`)}${td(`${f.previous_value ? esc(f.previous_value) + ' → ' : ''}<b style="color:${OR}">${esc(f.new_value)}</b>`)}${td(`${esc(f.msg.from)}<br><span style="color:${SOFT};font-size:12px">${esc(f.msg.subject)} · ${esc(riyadh(f.msg.date))}</span>`)}${td(`<span style="color:${SOFT}">“${esc(f.quote)}”</span>`)}${td(`${Math.round(f.confidence * 100)}%`, ';text-align:right')}</tr>`).join('');
  const body = `<p style="margin:0 0 14px">The ${riyadh(w.slot).split(',').pop().trim()} scan read <b>${msgs.length}</b> new message${msgs.length > 1 ? 's' : ''} in the project folder and sensed <b>${findings.length}</b> possible assumption change${findings.length > 1 ? 's' : ''}:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th('Assumption')}${th('Proposed')}${th('From')}${th('Quote')}${th('Conf.')}</tr>${rows}</table>
<p style="margin:16px 0 0;color:${SOFT};font-size:12px">Open the agent to review them: each one becomes a change request for approval, checked against the model's current value. Nothing has been changed.</p>`;
  const html = frame('Assumption alert', `${findings.length} possible change${findings.length > 1 ? 's' : ''} in Outlook`, `${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'} · scan of ${riyadh(w.slot)}`, body, appUrl);
  out.subject = `KINAN · ${findings.length} possible assumption change${findings.length > 1 ? 's' : ''} · ${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'}`;
  if (dry) { out.preview = html; return out; }
  await G.sendMail(token, { to: to.ok, subject: out.subject, html }); out.sent = true; out.to = to.ok; return out;
}

/* EstateMaster's figures from an Office Links export, by row label (the same labels the app reads). */
const LAB = [['levered_irr', /(equity|levered|geared)\s*irr|irr\s*\((equity|levered|geared)/i], ['unlevered_irr', /(unlevered|ungeared|project)\s*irr|irr\s*\((unlevered|ungeared|project)/i], ['profit_on_cost', /(profit|margin)\s*on\s*(cost|development)|development\s*margin/i], ['net_profit', /(net|development)\s*profit/i], ['total_cost', /total\s*(development\s*)?costs?\b/i], ['gross_revenue', /(gross|total)\s*(revenue|realisation|realization|sales)/i], ['equity_multiple', /equity\s*multiple/i], ['peak_debt', /peak\s*(debt|funding|loan)/i]];
function readExport(buf) {
  const XLSX = require('xlsx'); const wb = XLSX.read(buf, { type: 'buffer' }), out = {};
  for (const name of wb.SheetNames) for (const row of XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true })) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) { const c = row[i]; if (typeof c !== 'string' || c.length > 80) continue;
      for (const [k, re] of LAB) { if (k in out || !re.test(c)) continue; if (k === 'levered_irr' && /unlevered|ungeared/i.test(c)) continue;
        const v = row.slice(i + 1).find(x => typeof x === 'number'); if (v == null) continue;
        out[k] = /irr|profit_on_cost/.test(k) && Math.abs(v) < 1 ? +(v * 100).toFixed(4) : v; break; } }
  }
  return out;
}
const ROWS = [['levered_irr', 'Levered IRR', '%'], ['unlevered_irr', 'Unlevered IRR', '%'], ['profit_on_cost', 'Profit on cost', '%'], ['net_profit', 'Net profit', 'M'], ['total_cost', 'Total development cost', 'M'], ['gross_revenue', 'Gross revenue', 'M'], ['equity_multiple', 'Equity multiple', 'x'], ['peak_debt', 'Peak debt', 'M']];
const fmt = (v, u) => !Number.isFinite(v) ? '—' : u === '%' ? v.toFixed(2) + '%' : u === 'x' ? v.toFixed(2) + 'x' : 'SAR ' + Math.round(v / 1e6).toLocaleString('en-GB') + 'M';
const dlt = (a, b, u) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-9 ? '–' : u === '%' ? `${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)} pts` : u === 'x' ? `${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)}x` : `${b > a ? '+' : '−'}${Math.round(Math.abs(b - a) / 1e6)}M`;

async function reportJob(token, now, dry, appUrl) {
  const days = (env('REPORT_DAYS') || 'sun,mon,tue,wed,thu').toLowerCase().split(',').map(s => s.trim().slice(0, 3));
  const today = now.toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short' }).toLowerCase().slice(0, 3);
  if (!days.includes(today)) return { job: 'report', skipped: `not a report day (${today})` };
  const folder = env('EXPORTS_FOLDER'); if (!folder) return { job: 'report', skipped: 'EXPORTS_FOLDER is not set' };
  const j = await G.graph(token, `${folder}:/children?$select=name,lastModifiedDateTime,id,file&$orderby=lastModifiedDateTime desc&$top=50`);
  // One file per stored Option / Stage may be in the folder ("… - Downside.xlsx", "… (Downside).xlsx"): the morning report follows the base, i.e. files with no option in the name or one named like a base case.
  const optOf = n => { const f = String(n).replace(/\.[^.]+$/, ''); const m = f.match(/\(([^)]{1,60})\)\s*$/) || f.match(/\s[-–]\s([^-–]{1,60})$/); return m ? m[1].trim() : ''; };
  const isBase = o => !o || /^(base|live|current|approved|main|master|as is)/i.test(o);
  const all = (j.value || []).filter(f => f.file && /\.(xlsx|xlsm|xls|csv)$/i.test(f.name)).sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));
  const files = all.filter(f => isBase(optOf(f.name))).slice(0, 2);
  if (!files.length) return { job: 'report', skipped: all.length ? `only option exports in the folder (${all.slice(0, 5).map(f => optOf(f.name)).join(', ')}); no base export` : 'no export in the folder yet' };
  const base = folder.replace(/\/root:.*$/, '');
  const read = async f => ({ name: f.name, at: f.lastModifiedDateTime, out: readExport(await G.graphBytes(token, `${base}/items/${f.id}/content`)) });
  const [b, a] = await Promise.all(files.map(read));
  const options = all.filter(f => !isBase(optOf(f.name))).slice(0, 10).map(f => ({ option: optOf(f.name), file: f.name, at: f.lastModifiedDateTime }));
  if (!Object.keys(b.out).length) return { job: 'report', skipped: `no EstateMaster returns found in ${b.name}` };
  const hurdle = +(env('HURDLE_IRR') || 18);
  const ok = Number.isFinite(b.out.levered_irr) ? b.out.levered_irr >= hurdle : null;
  const stats = ROWS.slice(0, 4).map(([k, l, u]) => `<td width="25%" style="padding:10px 8px 10px 0;border-top:2px solid ${OR};vertical-align:top"><div style="font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${TAUPE};font-weight:700">${l}</div><div style="font-size:24px;font-weight:700;margin-top:6px;color:${k === 'levered_irr' && ok === false ? '#d03b3b' : k === 'levered_irr' && ok ? '#1f8a4c' : CH}">${fmt(b.out[k], u)}</div>${a ? `<div style="font-size:11px;color:${SOFT}">${dlt(a.out[k], b.out[k], u)} vs previous</div>` : ''}</td>`).join('');
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px"><tr>${th('Output')}${a ? th('Previous') : ''}${th('Latest')}${a ? th('Change') : ''}</tr>${ROWS.map(([k, l, u]) => `<tr>${td(l)}${a ? td(fmt(a.out[k], u), ';text-align:right') : ''}${td(`<b>${fmt(b.out[k], u)}</b>`, ';text-align:right')}${a ? td(dlt(a.out[k], b.out[k], u), ';text-align:right') : ''}</tr>`).join('')}</table>`;
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table>
<p style="margin:16px 0 0">${ok == null ? 'The latest export has no levered IRR.' : ok ? `Levered IRR is above the ${hurdle}% hurdle.` : `<b style="color:#d03b3b">Levered IRR is below the ${hurdle}% hurdle.</b>`}</p>${table}
<p style="margin:16px 0 0;color:${SOFT};font-size:12px">Every figure is EstateMaster's own, read from ${esc(b.name)} (${esc(riyadh(b.at))})${a ? ` and compared with ${esc(a.name)} (${esc(riyadh(a.at))})` : ''}. Open the agent for the full report and ▶ Play.</p>`;
  const html = frame('Morning EstateMaster report', env('PROJECT_NAME') || 'Al Narjis Mixed-Use', riyadh(now.toISOString()), body, appUrl);
  const to = G.checkRecipients(env('REPORT_TO').split(','));
  const out = { job: 'report', latest: b.name, previous: a ? a.name : null, figures: b.out, subject: `KINAN · EstateMaster report · ${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'} · ${now.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' })}`, sent: false };
  if (to.bad.length) out.rejected = to.bad;
  if (dry) { out.preview = html; return out; }
  if (!to.ok.length) { out.note = 'REPORT_TO is not set (or has no internal address): report not sent'; return out; }
  await G.sendMail(token, { to: to.ok, subject: out.subject, html }); out.sent = true; out.to = to.ok; return out;
}

const status = () => ({ scan: { enabled: G.graphConfigured() && G.aiConfigured() && !!env('ALERT_TO'), times: ['07:00', '15:00'], tz: 'Asia/Riyadh', alertTo: env('ALERT_TO') ? env('ALERT_TO').split(',').length + ' recipient(s)' : null },
  report: { enabled: G.graphConfigured() && !!env('EXPORTS_FOLDER') && !!env('REPORT_TO'), time: '07:00', days: env('REPORT_DAYS') || 'sun,mon,tue,wed,thu' }, secret: !!env('CRON_SECRET') });

module.exports = async function handler(req, res) {
  const u = new URL(req.url, 'http://x'), run = (u.searchParams.get('run') || '').split(',').filter(Boolean);
  // No job requested: the app asks what is scheduled (no secrets in the answer).
  if (!run.length) return G.send(res, 200, status());
  if (!env('CRON_SECRET') || req.headers.authorization !== `Bearer ${env('CRON_SECRET')}`) return G.send(res, 401, { error: 'Scheduled jobs need CRON_SECRET (Vercel sends it automatically).' });
  if (!G.graphConfigured()) return G.send(res, 501, { error: 'Microsoft Graph is not configured.' });
  const dry = u.searchParams.get('dry') === '1', now = u.searchParams.get('now') ? new Date(u.searchParams.get('now')) : new Date();
  const appUrl = env('APP_URL') || (req.headers.host ? `https://${req.headers.host}` : '');
  const results = [];
  try {
    const token = await G.graphToken();
    for (const j of run) {
      try {
        if (j === 'scan') { if (!G.aiConfigured()) results.push({ job: 'scan', skipped: 'no AI key' }); else results.push(await scanJob(token, now, dry, appUrl)); }
        else if (j === 'report') results.push(await reportJob(token, now, dry, appUrl));
      } catch (e) { results.push({ job: j, error: e.message }); }
    }
  } catch (e) { return G.send(res, 502, { error: e.message }); }
  return G.send(res, 200, { at: now.toISOString(), dry, results });
};
module.exports.windowFor = windowFor;
module.exports.readExport = readExport;
