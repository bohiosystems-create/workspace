/* Vercel serverless function: POST /api/login
   Real sign-in for the demo. Set DEMO_USERNAME and DEMO_PASSWORD in the
   project's environment variables to require credentials; the issued token is
   then required by /api/complete, so nobody can spend the Anthropic key
   without signing in. With DEMO_PASSWORD unset the demo stays an open gate. */
import { createHmac } from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const DEMO_USERNAME = process.env.DEMO_USERNAME || '';
  const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
  if (!DEMO_PASSWORD) return res.status(200).json({ ok: true, open: true });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const u = String(body.username || '').trim().toLowerCase();
  const pw = String(body.password || '');
  if (u === DEMO_USERNAME.toLowerCase() && pw === DEMO_PASSWORD) {
    const token = createHmac('sha256', DEMO_PASSWORD).update('bohio-demo:' + DEMO_USERNAME.toLowerCase()).digest('hex');
    return res.status(200).json({ ok: true, token, name: DEMO_USERNAME });
  }
  return res.status(401).json({ error: 'invalid credentials' });
}
