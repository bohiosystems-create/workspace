/* Vercel serverless function: GET /api/outlook?q=...
   Real email-context connector. With MS_GRAPH_TOKEN set (a Microsoft Graph
   access token with Mail.Read), pulls real messages from the signed-in
   mailbox so the fund-management chatbot grounds its answers in actual email
   threads. Without a token returns { live:false } and the app uses its
   built-in demo inbox. */
export default async function handler(req, res) {
  const token = process.env.MS_GRAPH_TOKEN || '';
  const q = String((req.query && req.query.q) || '');
  if (token) {
    try {
      const gu = 'https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=from,subject,receivedDateTime,bodyPreview'
        + (q ? '&$search=' + encodeURIComponent('"' + q + '"') : '');
      const g = await fetch(gu, { headers: { authorization: 'Bearer ' + token } });
      if (g.ok) {
        const j = await g.json();
        const messages = (j.value || []).map(m => ({
          from: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '—',
          subject: m.subject || '',
          when: String(m.receivedDateTime || '').slice(0, 10),
          snippet: String(m.bodyPreview || '').slice(0, 200),
        }));
        return res.status(200).json({ ok: true, live: true, messages });
      }
      console.error('Graph error', g.status);
    } catch (e) { console.error('Graph fetch failed:', e.message); }
  }
  return res.status(200).json({ ok: true, live: false, messages: [] });
}
