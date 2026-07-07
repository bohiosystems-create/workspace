/* Vercel serverless function: GET /api/outlook?q=...
   Real email-context connector. Resolves a Graph access token from the
   browser-held refresh token (x-ms-rt, issued by the device-code sign-in),
   MS_REFRESH_TOKEN, or a raw MS_GRAPH_TOKEN — and pulls real messages from
   the signed-in mailbox. Without any token returns { live:false } and the
   app uses its built-in demo inbox. */
import { msAccessToken, msMessages } from '../lib/msgraph.mjs';

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '');
  const token = await msAccessToken(req);
  if (token) {
    try {
      const messages = await msMessages(token, q);
      return res.status(200).json({ ok: true, live: true, messages });
    } catch (e) { console.error('Graph fetch failed:', e.message); }
  }
  return res.status(200).json({ ok: true, live: false, messages: [] });
}
