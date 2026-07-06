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
  const wantStream = body.stream === true;
  const FALLBACK_MODEL = process.env.ANTHROPIC_FALLBACK_MODEL || 'claude-3-5-sonnet-latest';
  const callAnthropic = (useModel) => fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: useModel, max_tokens, messages, stream: wantStream }),
  });

  try {
    let usedModel = model;
    let upstream = await callAnthropic(model);
    // one bad tier for this key shouldn't break every AI feature — retry safely
    if (!upstream.ok && (upstream.status === 404 || upstream.status === 400) && model !== FALLBACK_MODEL) {
      console.error('Anthropic ' + upstream.status + ' for "' + model + '" — retrying with "' + FALLBACK_MODEL + '"');
      usedModel = FALLBACK_MODEL;
      upstream = await callAnthropic(FALLBACK_MODEL);
    }
    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Anthropic error', upstream.status, errText.slice(0, 500));
      return res.status(502).json({ error: 'upstream ' + upstream.status, model: usedModel, detail: errText.slice(0, 200) });
    }

    // ---- streaming: forward Anthropic SSE text deltas as a plain chunked stream
    if (wantStream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.status(200);
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith('data:')) {
            const d = line.slice(5).trim();
            if (d && d !== '[DONE]') {
              try {
                const j = JSON.parse(d);
                if (j.type === 'content_block_delta' && j.delta && j.delta.text) res.write(j.delta.text);
              } catch (e) {}
            }
          }
        }
      }
      return res.end();
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return res.status(200).json({ text, model: usedModel });
  } catch (err) {
    console.error('proxy failure', err);
    if (res.headersSent) return res.end();
    return res.status(502).json({ error: 'proxy failure' });
  }
}
