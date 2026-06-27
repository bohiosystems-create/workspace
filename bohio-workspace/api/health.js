/* Vercel serverless function: GET /api/health
   Quick check that live AI is configured. Visit /api/health after deploy —
   "ai": true means ANTHROPIC_API_KEY is set on the deployment. */
export default function handler(req, res) {
  const ai = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  res.status(200).json({ ok: true, ai, model, runtime: 'vercel' });
}
