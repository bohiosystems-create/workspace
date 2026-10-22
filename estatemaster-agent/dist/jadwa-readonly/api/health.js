// Health check for uptime monitors and for support: which services this deployment has configured (never a secret),
// and the deployed commit. GET /api/health → 200 {ok:true,...}
module.exports = async function handler(req, res) {
  const on = (...k) => k.every((x) => !!process.env[x]);
  const body = {
    ok: true,
    time: new Date().toISOString(),
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    region: process.env.VERCEL_REGION || null,
    services: {
      claude: on('ANTHROPIC_API_KEY'),
      openai: on('OPENAI_API_KEY'),
      voice: on('ELEVENLABS_API_KEY'),
      microsoft365: on('MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'),
      sessionGate: on('DEMO_SESSION_SECRET'),
      serverEngine: on('LO_URL', 'LO_TOKEN'),
    },
  };
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
