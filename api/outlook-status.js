/* Vercel serverless function: GET /api/outlook-status[?device_code=...]
   With device_code: polls the Microsoft token endpoint for the pending
   device-code sign-in; on success returns the account and the refresh token
   (stored by the browser — serverless has no disk — and sent back on every
   /api/outlook call as x-ms-rt). Without device_code: reports whether the
   connector is configured for live mail. */
import { msLogin, msForm, msAccount, msAccessToken } from '../lib/msgraph.mjs';

export default async function handler(req, res) {
  const clientId = process.env.MS_CLIENT_ID || '';
  const dc = String((req.query && req.query.device_code) || '');
  if (!dc) {
    const token = await msAccessToken(req);
    const account = token ? await msAccount(token) : '';
    return res.status(200).json({ ok: true, connected: Boolean(token), account });
  }
  try {
    const j = await msForm(msLogin('token'), { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: dc });
    if (j.access_token) {
      const account = await msAccount(j.access_token);
      return res.status(200).json({ ok: true, connected: true, account, refresh_token: j.refresh_token || '' });
    }
    if (j.error === 'authorization_pending' || j.error === 'slow_down') return res.status(200).json({ ok: true, pending: true });
    return res.status(200).json({ ok: true, pending: false, error: j.error_description || j.error });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
