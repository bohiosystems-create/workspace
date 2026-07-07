/* Vercel serverless function: GET /vendor/*  (via the rewrite in vercel.json)
   The studio dashboards request React/ReactDOM/Babel from /vendor/...; this
   proxies the exact bytes from the upstream CDN so their Subresource-Integrity
   hashes still validate. Vercel's edge caches the response (immutable, 1y), so
   after the first request it's served from the CDN edge, not unpkg.
   (Local dev uses server.mjs's disk-caching /vendor instead.) */
export default async function handler(req, res) {
  const segs = req.query.path;
  const rel = Array.isArray(segs) ? segs.join('/') : String(segs || '');
  if (!rel || rel.includes('..')) return res.status(400).send('bad vendor path');

  const upstream = (process.env.VENDOR_UPSTREAM || 'https://unpkg.com') + '/' + rel;
  try {
    const up = await fetch(upstream);
    if (!up.ok) return res.status(502).send('vendor upstream ' + up.status);
    const buf = Buffer.from(await up.arrayBuffer());
    const ct = up.headers.get('content-type') ||
      (rel.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('vendor fetch failed for', rel, '-', err && err.message);
    return res.status(504).send('vendor fetch failed: ' + rel);
  }
}
