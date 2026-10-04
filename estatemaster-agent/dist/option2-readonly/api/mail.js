// Sends the agent's emails (scheduled reports, assumption-change alerts) from the Outlook mailbox through Microsoft
// Graph. Internal recipients only (MAIL_ALLOWED_DOMAINS, default: the mailbox's own domain). The app never sends a
// message a person has not set up: alerts and scheduled reports are configured in the app.
//   Needs the Graph variables (see api/_lib/graph.js) with Mail.Send (application) granted.
//   DEMO_PASSWORD   optional; if set, callers must send it as the x-demo-pass header
const { env, send, readBody, graphConfigured, graphToken, checkRecipients, sendMail, allowedDomains } = require('./_lib/graph');
const MAX_HTML = 900000, MAX_ATTACH = 3_000_000;

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return send(res, 200, { configured: graphConfigured(), from: graphConfigured() ? env('OUTLOOK_MAILBOX') : null, domains: allowedDomains(), passwordRequired: !!env('DEMO_PASSWORD') });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!graphConfigured()) return send(res, 501, { error: 'Email is not configured: set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and OUTLOOK_MAILBOX.' });
  if (env('DEMO_PASSWORD') && req.headers['x-demo-pass'] !== env('DEMO_PASSWORD')) return send(res, 401, { error: 'Access code missing or wrong.' });
  const origin = req.headers.origin, host = req.headers.host;
  if (origin && host) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'Forbidden' }); } catch { return send(res, 403, { error: 'Forbidden' }); } }
  let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const rc = checkRecipients(Array.isArray(b.to) ? b.to : String(b.to || '').split(/[;,]/));
  if (rc.bad.length) return send(res, 400, { error: `Only internal addresses (${rc.domains.join(', ') || 'none configured'}) can receive the agent's emails: ${rc.bad.join(', ')}` });
  if (!rc.ok.length) return send(res, 400, { error: 'No recipient.' });
  const subject = String(b.subject || '').slice(0, 250), html = String(b.html || '');
  if (!subject || !html) return send(res, 400, { error: 'Subject and body are required.' });
  if (html.length > MAX_HTML) return send(res, 413, { error: 'Email body too large.' });
  const att = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 3).map(a => ({ name: String(a.name || 'attachment').slice(0, 120), contentType: String(a.contentType || 'application/octet-stream'), base64: String(a.base64 || '') }));
  if (att.reduce((t, a) => t + a.base64.length, 0) > MAX_ATTACH) return send(res, 413, { error: 'Attachments too large.' });
  try {
    const token = await graphToken(); const r = await sendMail(token, { to: rc.ok, subject, html, attachments: att });
    return send(res, 200, { sent: true, from: r.from, to: r.to, at: new Date().toISOString() });
  } catch (e) { return send(res, 502, { error: e.message }); }
};
