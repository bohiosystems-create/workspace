// Shared helpers for the Vercel functions (files under api/_lib are not routes): Microsoft Graph sign-in, reads and
// sends, request plumbing and the AI call used to read emails.
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   Entra ID app (application permissions: Mail.Read, Mail.Send, Files.Read.All)
//   OUTLOOK_MAILBOX, OUTLOOK_FOLDER                mailbox and folder the agent reads (and the mailbox it sends from)
//   ANTHROPIC_API_KEY / OPENAI_API_KEY             model used to read emails (Claude preferred); EXTRACT_MODEL overrides it
//   LOGIN_BASE, GRAPH_BASE, ANTHROPIC_URL, OPENAI_URL   optional overrides (tests, corporate gateways)
// Same variable names as the other Bohio demo apps (kinan-marketing): OUTLOOK_SENDER is the mailbox,
// OUTLOOK_MODE=live turns Outlook on, OUTLOOK_DELIVERY=draft leaves emails as drafts, REPORTS_ALLOWED_RECIPIENTS /
// REPORTS_ALLOWED_DOMAINS limit who can receive anything. The older names still work.
for (const [a, b] of [['OUTLOOK_MAILBOX', 'OUTLOOK_SENDER'], ['MAIL_ALLOWED_DOMAINS', 'REPORTS_ALLOWED_DOMAINS'], ['ALERT_TO', 'REPORTS_ALLOWED_RECIPIENTS'], ['REPORT_TO', 'REPORTS_ALLOWED_RECIPIENTS']])
  if (!process.env[a] && process.env[b]) process.env[a] = process.env[b];
const env = k => process.env[k] || '';
// Inside the Bohio sign-in (DEMO_SESSION_SECRET set) the gate protects every call; the old access code is not used.
const accessCode = () => (env('DEMO_SESSION_SECRET') ? '' : env('DEMO_PASSWORD'));

function send(res, status, obj) {
  res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {};
}
const graphConfigured = () => (!env('OUTLOOK_MODE') || env('OUTLOOK_MODE') === 'live') && !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('OUTLOOK_MAILBOX'));
const aiConfigured = () => !!(env('ANTHROPIC_API_KEY') || env('OPENAI_API_KEY'));

async function graphToken() {
  const r = await fetch(`${env('LOGIN_BASE') || 'https://login.microsoftonline.com'}/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  const j = await r.json(); if (!r.ok) throw new Error('Microsoft sign-in failed: ' + (j.error_description || j.error || r.status)); return j.access_token;
}
const gbase = () => (env('GRAPH_BASE') || 'https://graph.microsoft.com') + '/v1.0';
/* A SharePoint path written with the site's address ("/sites/{host}:/sites/{name}:/drive/root:/Folder") cannot be extended
   with ":/content" or "/items/…": Graph reads "root:" as a segment. The site is resolved to its id once, and the path
   becomes "/sites/{id}/drive/root:/Folder", which Graph accepts everywhere. */
const siteIds = new Map();
async function norm(token, path) {
  const m = String(path).match(/^\/sites\/([^:/]+):(\/sites\/[^:]+):(\/.*)?$/);
  if (!m) return path;
  const key = m[1] + m[2];
  if (!siteIds.has(key)) {
    const r = await fetch(gbase() + `/sites/${m[1]}:${m[2]}?$select=id`, { headers: { authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw new Error('Graph ' + r.status + ': the SharePoint site ' + m[1] + m[2] + ' was not found (check EXPORTS_FOLDER)');
    siteIds.set(key, j.id);
  }
  return `/sites/${siteIds.get(key)}${m[3] || ''}`;
}
async function graph(token, path) {
  path = await norm(token, path);
  const r = await fetch(gbase() + path, { headers: { authorization: 'Bearer ' + token, prefer: 'outlook.body-content-type="text"' } });
  const j = await r.json(); if (!r.ok) throw new Error('Graph ' + r.status + ': ' + ((j.error && j.error.message) || '')); return j;
}
async function graphBytes(token, path) {
  path = await norm(token, path);
  const r = await fetch(gbase() + path, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Graph ' + r.status + ' reading a file');
  return Buffer.from(await r.arrayBuffer());
}
async function folderId(token, mb) {
  const name = env('OUTLOOK_FOLDER') || 'Inbox';
  if (name.toLowerCase() === 'inbox') return 'inbox';
  const q = `?$filter=displayName eq '${name.replace(/'/g, "''")}'&$select=id,displayName`;
  for (const base of [`/users/${encodeURIComponent(mb)}/mailFolders`, `/users/${encodeURIComponent(mb)}/mailFolders/inbox/childFolders`]) {
    const j = await graph(token, base + q); if (j.value && j.value[0]) return j.value[0].id;
  }
  throw new Error(`Folder "${name}" not found in ${mb} (top level or under Inbox).`);
}
const MAX_MSG = 15, MAX_BODY = 6000;
async function readMessages(token, since) {
  const mb = env('OUTLOOK_MAILBOX'), fid = await folderId(token, mb);
  const j = await graph(token, `/users/${encodeURIComponent(mb)}/mailFolders/${fid}/messages?$select=id,subject,from,receivedDateTime,body&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=${MAX_MSG}`);
  return (j.value || []).map(m => ({ id: m.id, subject: m.subject || '(no subject)', from: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '', addr: (m.from && m.from.emailAddress && m.from.emailAddress.address) || '', date: m.receivedDateTime, body: String((m.body && m.body.content) || '').slice(0, MAX_BODY) }));
}

/* Recipients: internal addresses only. MAIL_ALLOWED_DOMAINS (comma list) or, by default, the mailbox's own domain. */
function allowedDomains() {
  const d = env('MAIL_ALLOWED_DOMAINS') || (env('OUTLOOK_MAILBOX').split('@')[1] || '');
  return d.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}
function checkRecipients(list) {
  const doms = allowedDomains(), ok = [], bad = [];
  const people = env('REPORTS_ALLOWED_RECIPIENTS').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  for (const a of list.map(x => String(x).trim()).filter(Boolean)) {
    const dom = (a.split('@')[1] || '').toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) && (doms.includes(dom) || people.includes(a.toLowerCase()))) ok.push(a); else bad.push(a);
  }
  return { ok, bad, domains: doms };
}
/* Send an HTML email from the agent's mailbox (Graph sendMail; needs Mail.Send). */
async function sendMail(token, { to, subject, html, attachments = [] }) {
  const mb = env('OUTLOOK_MAILBOX'), draft = env('OUTLOOK_DELIVERY') === 'draft';
  const name = env('OUTLOOK_SENDER_NAME'), cc = env('OUTLOOK_CC').split(',').map(x => x.trim()).filter(Boolean);
  const message = { subject, body: { contentType: 'HTML', content: html }, toRecipients: to.map(a => ({ emailAddress: { address: a } })),
    ...(cc.length ? { ccRecipients: cc.map(a => ({ emailAddress: { address: a } })) } : {}),
    ...(name ? { from: { emailAddress: { address: mb, name } } } : {}),
    attachments: attachments.map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType || 'application/octet-stream', contentBytes: a.base64 })) };
  // OUTLOOK_DELIVERY=draft: the email waits in the mailbox's Drafts for a person to send (needs Mail.ReadWrite)
  const r = await fetch(`${gbase()}/users/${encodeURIComponent(mb)}/${draft ? 'messages' : 'sendMail'}`, {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(draft ? message : { message, saveToSentItems: true })
  });
  if (r.status !== 202 && !r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && j.error.message) || ''; } catch {} throw new Error(`Graph ${draft ? 'draft' : 'sendMail'} ${r.status}: ${m}`); }
  return { from: mb, to, draft };
}

async function ai(system, user, maxTokens = 2000) {
  if (env('ANTHROPIC_API_KEY')) {
    const r = await fetch(env('ANTHROPIC_URL') || 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('EXTRACT_MODEL') || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error('Claude: ' + ((j.error && j.error.message) || r.status));
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  const r = await fetch(env('OPENAI_URL') || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('OPENAI_API_KEY') },
    body: JSON.stringify({ model: env('EXTRACT_MODEL') || 'gpt-5', max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const j = await r.json(); if (!r.ok) throw new Error('OpenAI: ' + ((j.error && j.error.message) || r.status));
  return ((j.choices || [])[0] || {}).message?.content || '';
}
async function graphPut(token, path, body, type = 'application/json') {
  path = await norm(token, path);
  const r = await fetch(gbase() + path, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': type }, body });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Graph ' + r.status + ': ' + ((j.error && j.error.message) || 'write refused')); return j;
}
const jsonOf = t => { const m = String(t || '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; };

module.exports = { accessCode, env, send, readBody, graphConfigured, aiConfigured, graphToken, graph, graphBytes, graphPut, folderId, readMessages, allowedDomains, checkRecipients, sendMail, ai, jsonOf };
