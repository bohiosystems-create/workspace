/* Vercel serverless function: GET /api/news?topic=realestate|geopolitical
   Saudi / GCC market-news connector. Reads syndication feeds and GDELT's
   public API — not an HTML scraper (see lib/news.mjs for why).
   Returns { ok, live, items[], sources[] }. When nothing is reachable it
   returns live:false and the app falls back to its curated market data. */
import { fetchNewsCached } from '../lib/news.mjs';

export default async function handler(req, res) {
  const topic = String((req.query && req.query.topic) || 'realestate');
  const limit = Math.min(30, Math.max(1, parseInt((req.query && req.query.limit) || '12', 10) || 12));
  try {
    const out = await fetchNewsCached({ topic, limit, key: process.env.NEWSAPI_KEY || null });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error('news fetch failed:', e.message);
    return res.status(200).json({ ok: true, live: false, items: [], sources: [], errors: [e.message] });
  }
}
