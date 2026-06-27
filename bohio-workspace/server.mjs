#!/usr/bin/env node
/* ============================================================================
   Bohio Workspace 3.0 — demo server (zero dependencies, Node 18+).

   • Serves the static demo (index.html, assets, studio dashboards).
   • Exposes POST /api/complete which proxies to the Anthropic Messages API,
     giving the demo's AI features (deal screening, IC memos, agent chats,
     negotiation room, …) real Claude responses.
   • Caches the studio dashboards' React/ReactDOM/Babel libraries under
     /vendor so they render on any internet-connected machine and then keep
     working fully offline (no third-party CDN dependency at runtime).

   Run:
     # put your key in a .env file (ANTHROPIC_API_KEY=sk-ant-...), then:
     node server.mjs
     # or pass it inline:  ANTHROPIC_API_KEY=sk-ant-... node server.mjs
     # then open http://localhost:5173

   Without a key the server still serves the UI; AI calls return 503 and the
   app uses its built-in fallback responses, so the demo stays fully usable.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ---- .env loading (zero-dependency) --------------------------------------
// Loads KEY=VALUE pairs from a local .env file without overriding anything
// already present in the real environment. Keeps the Anthropic API key out of
// the source tree and off the command line.
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    if (k.startsWith('#')) continue;
    v = v.replace(/^\s*['"]?/, '').replace(/['"]?\s*$/, ''); // strip optional quotes
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadDotEnv(join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 5173;

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const API_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';

// Where vendored CDN libraries (React/ReactDOM/Babel) get cached on first load.
const VENDOR_DIR = join(ROOT, 'studio-vendor');
const VENDOR_UPSTREAM = process.env.VENDOR_UPSTREAM || 'https://unpkg.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleComplete(req, res) {
  if (!API_KEY) {
    return send(res, 503, JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }),
      { 'Content-Type': 'application/json' });
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, JSON.stringify({ error: 'invalid JSON' }), { 'Content-Type': 'application/json' });
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) {
    return send(res, 400, JSON.stringify({ error: 'no messages' }), { 'Content-Type': 'application/json' });
  }
  const max_tokens = Math.min(Number(payload.max_tokens) || 1500, 4096);

  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens, messages }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Anthropic error', upstream.status, errText.slice(0, 500));
      return send(res, 502, JSON.stringify({ error: 'upstream ' + upstream.status }),
        { 'Content-Type': 'application/json' });
    }
    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return send(res, 200, JSON.stringify({ text }), { 'Content-Type': 'application/json' });
  } catch (err) {
    console.error('proxy failure', err);
    return send(res, 502, JSON.stringify({ error: 'proxy failure' }), { 'Content-Type': 'application/json' });
  }
}

// ---- /vendor: cache React/ReactDOM/Babel for the studio dashboards --------
// The dashboards request e.g. /vendor/react@18.3.1/umd/react.production.min.js.
// We serve it from disk if cached, otherwise fetch the exact bytes from the
// upstream CDN once, cache them, and serve. The bytes are unchanged, so the
// dashboards' Subresource Integrity (SRI) hashes still validate. After the
// first online load the dashboards work with no network at all.
async function handleVendor(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/vendor\//, '').split('?')[0]);
  if (!rel || rel.includes('..')) return send(res, 400, 'bad vendor path');
  const safe = rel.replace(/[^A-Za-z0-9._@/-]/g, '_');
  const cachePath = join(VENDOR_DIR, safe);
  const type = MIME[extname(rel).toLowerCase()] || 'application/javascript';
  // serve from cache
  try {
    const buf = await readFile(cachePath);
    return send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
  } catch {}
  // fetch from upstream and cache
  try {
    const up = await fetch(VENDOR_UPSTREAM + '/' + rel);
    if (!up.ok) return send(res, 502, 'vendor upstream ' + up.status);
    const buf = Buffer.from(await up.arrayBuffer());
    try { await mkdir(dirname(cachePath), { recursive: true }); await writeFile(cachePath, buf); } catch {}
    return send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
  } catch (err) {
    console.error('vendor fetch failed for', rel, '-', err.message);
    return send(res, 504, 'vendor fetch failed (no network?): ' + rel);
  }
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // prevent path traversal
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(ROOT + sep) && full !== join(ROOT, 'index.html')) {
    return send(res, 403, 'Forbidden');
  }
  try {
    const s = await stat(full);
    if (s.isDirectory()) return serveStatic(req, res, rel.replace(/\/?$/, '/index.html'));
    const buf = await readFile(full);
    const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
    return send(res, 200, buf, { 'Content-Type': type });
  } catch {
    return send(res, 404, 'Not found: ' + rel);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/complete') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      return handleComplete(req, res);
    }
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, ai: Boolean(API_KEY), model: MODEL }),
        { 'Content-Type': 'application/json' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (url.pathname.startsWith('/vendor/')) return handleVendor(req, res, url.pathname);
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log('Bohio Workspace demo  →  http://localhost:' + PORT);
  console.log('Live AI: ' + (API_KEY ? 'ON (model ' + MODEL + ')' : 'OFF — set ANTHROPIC_API_KEY for real responses; canned fallbacks active'));
});
