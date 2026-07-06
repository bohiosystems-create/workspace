/* ============================================================================
   window.claude — AI bridge for the Bohio Workspace demo.

   The app calls window.claude.complete(...) in two shapes:
     1) complete("a prompt string")
     2) complete({ messages: [{ role: 'user', content: '...' }] })
   …and expects a plain-text string back.

   Per-task model routing: a call can name the kind of work it is so the server
   picks the most appropriate model — Opus for heavy reasoning (deal screening,
   IC memos, negotiation), Sonnet for conversational tasks (chat, agent replies,
   summaries), Haiku for quick one-liners. Pass it either way:
     complete(prompt, { task: 'screening' })
     complete({ messages, task: 'home_chat' })
     complete(prompt, { model: 'opus' })   // force a tier explicitly
   The server owns the task→model map (so it's configurable and the model id
   never ships to the browser); an unknown/absent task falls back to the default.

   When the demo is served by the bundled Node server (server.mjs) with an
   ANTHROPIC_API_KEY set, this routes to a real Claude model via /api/complete.
   If the server or key is absent (e.g. the file is opened directly, or no key
   is configured), the request fails and every AI feature falls back to its
   built-in canned response — so the demo stays fully interactive either way.
   ========================================================================== */
(function () {
  'use strict';

  function toMessages(arg) {
    if (typeof arg === 'string') return [{ role: 'user', content: arg }];
    if (arg && Array.isArray(arg.messages)) return arg.messages;
    if (arg && typeof arg.content === 'string') return [{ role: 'user', content: arg.content }];
    return [{ role: 'user', content: String(arg == null ? '' : arg) }];
  }

  // When the demo is protected (DEMO_PASSWORD set server-side), /api/login
  // issues a token at sign-in; every AI call carries it so only signed-in
  // users can spend the Anthropic key.
  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    try { const t = localStorage.getItem('bohio_demo_token'); if (t) h['x-demo-token'] = t; } catch (e) {}
    return h;
  }

  async function complete(arg, opts) {
    opts = opts || {};
    const messages = toMessages(arg);
    const o = (arg && typeof arg === 'object') ? arg : {};
    const max_tokens = opts.max_tokens || o.max_tokens || 1500;
    const task = opts.task || o.task || null;     // e.g. 'screening', 'home_chat'
    const model = opts.model || o.model || null;  // e.g. 'opus' | 'sonnet' | 'haiku' (explicit override)

    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: messages, max_tokens: max_tokens, task: task, model: model })
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) {}
      throw new Error('claude.complete failed (' + res.status + ') ' + detail);
    }
    const data = await res.json();
    return data.text || '';
  }

  // Streaming variant — starts delivering text as soon as the model produces it.
  // Calls onToken(deltaText) for each chunk and resolves with the full string.
  // Degrades gracefully: if the server returns JSON (no streaming) it emits the
  // whole text once; throws on error so callers can fall back to complete().
  async function stream(arg, opts, onToken) {
    opts = opts || {};
    const messages = toMessages(arg);
    const o = (arg && typeof arg === 'object') ? arg : {};
    const body = {
      messages: messages,
      max_tokens: opts.max_tokens || o.max_tokens || 1500,
      task: opts.task || o.task || null,
      model: opts.model || o.model || null,
      stream: true,
    };
    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) {}
      throw new Error('claude.stream failed (' + res.status + ') ' + detail);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) { // server didn't stream — take the full text
      const data = await res.json();
      const text = data.text || '';
      if (onToken && text) onToken(text);
      return text;
    }
    if (!res.body || !res.body.getReader) {
      const text = await res.text();
      if (onToken && text) onToken(text);
      return text;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      if (chunk) { full += chunk; if (onToken) onToken(chunk); }
    }
    return full;
  }

  window.claude = window.claude || {};
  window.claude.complete = complete;
  window.claude.stream = stream;
})();
