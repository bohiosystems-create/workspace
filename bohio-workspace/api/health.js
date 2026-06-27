/* Vercel serverless function: GET /api/health
   Quick check that live AI is configured. Visit /api/health after deploy —
   "ai": true means ANTHROPIC_API_KEY is set on the deployment; "routing" shows
   which model each task is sent to. */
import { routingTable } from '../lib/models.mjs';

export default function handler(req, res) {
  const ai = Boolean(process.env.ANTHROPIC_API_KEY);
  res.status(200).json({ ok: true, ai, runtime: 'vercel', routing: routingTable() });
}
