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
const { env, send, readBody, graphToken, readMessages } = require('./_lib/graph');
const G_access = () => require('./_lib/graph.js').accessCode();
const configured = () => !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('OUTLOOK_MAILBOX') && (env('ANTHROPIC_API_KEY') || env('OPENAI_API_KEY')));

// The register has no size limit. The AI sees the core lines plus the model lines whose wording appears in the emails,
// so a model with thousands of lines costs no more to scan than a small one.
const STOP = new Set(['the', 'and', 'for', 'per', 'sqm', 'sar', 'with', 'of', 'to', 'in', 'on', 'at', 'by', 'from', 'cost', 'costs', 'rate', 'fee', 'fees', 'total']);
const words = t => String(t || '').toLowerCase().split(/[^a-z0-9&]+/).filter(w => w.length > 2 && !STOP.has(w));
function shortlist(register, msgs, max = 300) {
  const core = register.filter(l => l.core !== false).slice(0, 120);
  const extra = register.filter(l => l.core === false);
  if (!extra.length) return core;
  const text = new Set(words(msgs.map(m => m.subject + ' ' + m.body).join(' ')));
  const scored = [];
  for (const l of extra) {
    const w = [...new Set(words(l.label + ' ' + (l.section || '')))];
    if (!w.length) continue;
    const hit = w.filter(x => text.has(x)).length;
    if (hit && hit / w.length >= 0.5) scored.push([hit / w.length + hit / 100, l]);
  }
  return core.concat(scored.sort((a, b) => b[0] - a[0]).slice(0, max).map(x => x[1]));
}

async function extract(messages, register, project) {
  const system = `You read project emails for a real estate development and find proposed changes to the financial model's assumptions, including requests for approval that would change one if granted: a discount or incentive on a number of units (convert it to the blended change of the sale price line, e.g. 5% off 24 of 180 units is about 0.7% off the average price), rent-free periods or lower rents (effective rent over the term), variation orders and revised quotes (cost lines), fee or commission changes, programme delays, revised financing terms, a valuer's yield, a landowner's revised price.
Return JSON only: {"results":[{"message_id":string,"reason":string,"changes":[{"line":string,"value":number,"quote":string,"confidence":number}]}]}.
Rules: "line" must be one of the register ids below. "value" is the new absolute value in that line's unit. "quote" is the exact sentence fragment from the email that supports it. "reason" is the reason the email gives for the change, in one sentence (why it is asked for or has happened).
Only include changes the email clearly states, proposes or asks approval for; ignore anything else (return an empty list for that message). Confidence 0-1.
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
  const out = {}; for (const r of (JSON.parse(m[0]).results || [])) { out[r.message_id] = r.changes || []; out[r.message_id].reason = String(r.reason || '').slice(0, 300); } return out;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return send(res, 200, { configured: configured(), mailbox: configured() ? env('OUTLOOK_MAILBOX') : null, folder: env('OUTLOOK_FOLDER') || 'Inbox', passwordRequired: !!G_access() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (G_access() && req.headers['x-demo-pass'] !== G_access()) return send(res, 401, { error: 'Access code missing or wrong.' });
  if (!configured()) return send(res, 400, { error: 'Outlook scan not configured: set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, OUTLOOK_MAILBOX and an AI key.' });
  let body; try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  const register = Array.isArray(body.register) ? body.register.slice(0, 50000) : [];
  if (!register.length) return send(res, 400, { error: 'Missing register' });
  const since = body.since && !isNaN(Date.parse(body.since)) ? new Date(body.since).toISOString() : new Date(Date.now() - 7 * 864e5).toISOString();
  try {
    const token = await graphToken(), mb = env('OUTLOOK_MAILBOX'), msgs = await readMessages(token, since);
    const short = shortlist(register, msgs);
    const found = msgs.length ? await extract(msgs, short, body.project) : {};
    const ids = new Set(short.map(l => l.id));
    const messages = msgs.map(m => ({ ...m, why: (found[m.id] && found[m.id].reason) || '', changes: (found[m.id] || []).filter(c => ids.has(c.line) && Number.isFinite(+c.value)).map(c => ({ line: c.line, value: +c.value, quote: String(c.quote || '').slice(0, 300), conf: Math.max(0, Math.min(1, +c.confidence || 0.5)) })) }));
    return send(res, 200, { mailbox: mb, folder: env('OUTLOOK_FOLDER') || 'Inbox', since, scannedAt: new Date().toISOString(), messages });
  } catch (e) { return send(res, 502, { error: e.message }); }
};
