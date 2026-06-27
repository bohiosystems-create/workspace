/* Vercel serverless function: POST /api/complete
   Mirrors server.mjs's /api/complete — proxies the demo's AI calls to the
   Anthropic Messages API, keeping ANTHROPIC_API_KEY server-side. Returns
   { text } so the window.claude.complete bridge (assets/js/claude.js) works
   unchanged. */
import { resolveModel } from '../lib/models.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });

  const apiUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'no messages' });
  const max_tokens = Math.min(Number(body.max_tokens) || 1500, 4096);
  const model = resolveModel(body.task, body.model); // route to the right model for this task

  try {
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, messages }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Anthropic error', upstream.status, errText.slice(0, 500));
      return res.status(502).json({ error: 'upstream ' + upstream.status });
    }
    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return res.status(200).json({ text, model });
  } catch (err) {
    console.error('proxy failure', err);
    return res.status(502).json({ error: 'proxy failure' });
  }
}
