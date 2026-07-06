/* ============================================================================
   Microsoft Graph helpers for the Outlook connector (shared by the Vercel
   functions). Serverless is stateless, so on Vercel the refresh token issued
   by the device-code sign-in travels with the browser (x-ms-rt header) or via
   the MS_REFRESH_TOKEN env var; MS_GRAPH_TOKEN (a raw access token) also
   works. The local server (server.mjs) additionally persists tokens to disk.
   ========================================================================== */
export const MS_SCOPE = 'User.Read Mail.Read offline_access';

export function msLogin(path) {
  const tenant = process.env.MS_TENANT || 'common';
  return 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/' + path;
}

export async function msForm(url, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return r.json();
}

// Resolve a usable Graph access token: refresh token from the request header
// or env → refresh grant; else a raw MS_GRAPH_TOKEN. '' when unconfigured.
export async function msAccessToken(req) {
  const clientId = process.env.MS_CLIENT_ID || '';
  const rt = String((req.headers && req.headers['x-ms-rt']) || '') || process.env.MS_REFRESH_TOKEN || '';
  if (rt && clientId) {
    try {
      const j = await msForm(msLogin('token'), { grant_type: 'refresh_token', client_id: clientId, refresh_token: rt, scope: MS_SCOPE });
      if (j.access_token) return j.access_token;
    } catch { }
  }
  return process.env.MS_GRAPH_TOKEN || '';
}

export async function msAccount(token) {
  try {
    const me = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { authorization: 'Bearer ' + token } });
    if (me.ok) { const j = await me.json(); return j.mail || j.userPrincipalName || ''; }
  } catch { }
  return '';
}

export async function msMessages(token, q) {
  const gu = 'https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=from,subject,receivedDateTime,bodyPreview'
    + (q ? '&$search=' + encodeURIComponent('"' + q + '"') : '');
  const g = await fetch(gu, { headers: { authorization: 'Bearer ' + token } });
  if (!g.ok) throw new Error('Graph ' + g.status);
  const j = await g.json();
  return (j.value || []).map(m => ({
    from: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '—',
    subject: m.subject || '',
    when: String(m.receivedDateTime || '').slice(0, 10),
    snippet: String(m.bodyPreview || '').slice(0, 200),
  }));
}
