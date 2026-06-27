/* ============================================================================
   window.claude — AI bridge for the Bohio Workspace demo.

   The app calls window.claude.complete(...) in two shapes:
     1) complete("a prompt string")
     2) complete({ messages: [{ role: 'user', content: '...' }] })
   …and expects a plain-text string back.

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

  async function complete(arg, opts) {
    const messages = toMessages(arg);
    const max_tokens = (opts && opts.max_tokens) || (arg && arg.max_tokens) || 1500;

    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, max_tokens: max_tokens })
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) {}
      throw new Error('claude.complete failed (' + res.status + ') ' + detail);
    }
    const data = await res.json();
    return data.text || '';
  }

  window.claude = window.claude || {};
  window.claude.complete = complete;
})();
