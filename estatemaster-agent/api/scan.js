// Vercel serverless function: reads a real Outlook folder through Microsoft Graph and asks the AI
// model to extract proposed assumption changes. It never changes anything: the page turns each
// finding into a change request that a person must approve.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   Entra ID app with Microsoft Graph Mail.Read (application)
//   OUTLOOK_MAILBOX                               mailbox to read, e.g. al-narjis@yourcompany.com
//   OUTLOOK_FOLDER                                folder display name (default "Inbox")
//   ANTHROPIC_API_KEY and/or OPENAI_API_KEY        model used for extraction (Claude preferred)
//   DEMO_PASSWORD                                  optional access code (same as /api/llm)
const MAX_MSG = 15, MAX_BODY = 6000;

function send(res, status, obj) {
  res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {};
}
const env = k => process.env[k] || '';
const configured = () => !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('OUTLOOK_MAILBOX') && (env('ANTHROPIC_API_KEY') || env('OPENAI_API_KEY')));

async function graphToken() {
  const r = await fetch(`${env('LOGIN_BASE')||'https://login.microsoftonline.com'}/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  const j = await r.json(); if (!r.ok) throw new Error('Microsoft sign-in failed: ' + (j.error_description || j.error || r.status)); return j.access_token;
}
async function graph(token, path) {
  const r = await fetch((env('GRAPH_BASE') || 'https://graph.microsoft.com') + '/v1.0' + path, { headers: { authorization: 'Bearer ' + token, prefer: 'outlook.body-content-type="text"' } });
  const j = await r.json(); if (!r.ok) throw new Error('Graph ' + r.status + ': ' + ((j.error && j.error.message) || '')); return j;
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
async function extract(messages, register, project) {
  const system = `You read project emails for a real estate development and find proposed changes to the financial model's assumptions.
Return JSON only: {"results":[{"message_id":string,"changes":[{"line":string,"value":number,"quote":string,"confidence":number}]}]}.
Rules: "line" must be one of the register ids below. "value" is the new absolute value in that line's unit. "quote" is the exact sentence fragment from the email that supports it.
Only include changes the email clearly states or proposes; ignore anything else (return an empty list for that message). Confidence 0-1.
Project: ${project || 'unknown'}. Register (id | label | unit | current value):
${register.map(l => `${l.id} | ${l.label} | ${l.unit} | ${l.current}`).join('\n')}`;
  const user = messages.map(m => `message_id: ${m.id}\nfrom: ${m.from}\ndate: ${m.date}\nsubject: ${m.subject}\n---\n${m.body}`).join('\n\n=====\n\n');
  let text;
  if (env('ANTHROPIC_API_KEY')) {
    const r = await fetch(env('ANTHROPIC_URL') || 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('EXTRACT_MODEL') || 'claude-sonnet-5-5', max_tokens: 2000, system, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error('Claude: ' + ((j.error && j.error.message) || r.status));
    text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } else {
    const r = await fetch(env('OPENAI_URL') || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('OPENAI_API_KEY') },
      body: JSON.stringify({ model: env('EXTRACT_MODEL') || 'gpt-5', max_completion_tokens: 2000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error('OpenAI: ' + ((j.error && j.error.message) || r.status));
    text = ((j.choices || [])[0] || {}).message?.content || '';
  }
  const m = text.match(/\{[\s\S]*\}/); if (!m) return {};
  const out = {}; for (const r of (JSON.parse(m[0]).results || [])) out[r.message_id] = r.changes || []; return out;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return send(res, 200, { configured: configured(), mailbox: configured() ? env('OUTLOOK_MAILBOX') : null, folder: env('OUTLOOK_FOLDER') || 'Inbox', passwordRequired: !!env('DEMO_PASSWORD') });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (env('DEMO_PASSWORD') && req.headers['x-demo-pass'] !== env('DEMO_PASSWORD')) return send(res, 401, { error: 'Access code missing or wrong.' });
  if (!configured()) return send(res, 400, { error: 'Outlook scan not configured: set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, OUTLOOK_MAILBOX and an AI key.' });
  let body; try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const register = Array.isArray(body.register) ? body.register.slice(0, 80) : [];
  if (!register.length) return send(res, 400, { error: 'Missing register' });
  const since = body.since && !isNaN(Date.parse(body.since)) ? new Date(body.since).toISOString() : new Date(Date.now() - 7 * 864e5).toISOString();
  try {
    const token = await graphToken(), mb = env('OUTLOOK_MAILBOX'), fid = await folderId(token, mb);
    const j = await graph(token, `/users/${encodeURIComponent(mb)}/mailFolders/${fid}/messages?$select=id,subject,from,receivedDateTime,body&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=${MAX_MSG}`);
    const msgs = (j.value || []).map(m => ({ id: m.id, subject: m.subject || '(no subject)', from: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '', addr: (m.from && m.from.emailAddress && m.from.emailAddress.address) || '', date: m.receivedDateTime, body: String((m.body && m.body.content) || '').slice(0, MAX_BODY) }));
    const found = msgs.length ? await extract(msgs, register, body.project) : {};
    const ids = new Set(register.map(l => l.id));
    const messages = msgs.map(m => ({ ...m, changes: (found[m.id] || []).filter(c => ids.has(c.line) && Number.isFinite(+c.value)).map(c => ({ line: c.line, value: +c.value, quote: String(c.quote || '').slice(0, 300), conf: Math.max(0, Math.min(1, +c.confidence || 0.5)) })) }));
    return send(res, 200, { mailbox: mb, folder: env('OUTLOOK_FOLDER') || 'Inbox', since, scannedAt: new Date().toISOString(), messages });
  } catch (e) { return send(res, 502, { error: e.message }); }
};
