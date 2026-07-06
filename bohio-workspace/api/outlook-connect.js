/* Vercel serverless function: POST /api/outlook-connect
   Starts the Microsoft device-code sign-in for the Outlook connector.
   Requires MS_CLIENT_ID (a free Entra ID app registration — see README).
   Returns the code the user enters at microsoft.com/devicelogin. */
import { msLogin, msForm, MS_SCOPE } from '../lib/msgraph.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const clientId = process.env.MS_CLIENT_ID || '';
  if (!clientId) return res.status(200).json({ ok: true, setup: false, reason: 'MS_CLIENT_ID not set' });
  try {
    const j = await msForm(msLogin('devicecode'), { client_id: clientId, scope: MS_SCOPE });
    if (j.device_code) {
      return res.status(200).json({ ok: true, setup: true, device_code: j.device_code, user_code: j.user_code, verification_uri: j.verification_uri || 'https://microsoft.com/devicelogin', interval: j.interval || 5, expires_in: j.expires_in || 900 });
    }
    return res.status(502).json({ error: j.error_description || j.error || 'device code failed' });
  } catch (e) {
    return res.status(502).json({ error: 'cannot reach login.microsoftonline.com: ' + e.message });
  }
}
