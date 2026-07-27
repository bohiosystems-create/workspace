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
import { createHmac } from 'node:crypto';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { resolveModel, routingTable } from './lib/models.mjs';

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
const API_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';

// ---- real sign-in (optional) ----------------------------------------------
// Set DEMO_USERNAME and DEMO_PASSWORD (env or .env) to protect the demo with a
// real credential check: the login form verifies against POST /api/login, and
// /api/complete requires the issued token — so nobody can spend your Anthropic
// credits without signing in. Leave DEMO_PASSWORD unset for the open demo gate.
const DEMO_USERNAME = process.env.DEMO_USERNAME || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
const AUTH_ON = Boolean(DEMO_PASSWORD);
function demoToken() {
  return createHmac('sha256', DEMO_PASSWORD).update('bohio-demo:' + DEMO_USERNAME.toLowerCase()).digest('hex');
}
function authOk(req) {
  if (!AUTH_ON) return true;
  return String(req.headers['x-demo-token'] || '') === demoToken();
}
async function handleLogin(req, res) {
  const JSONH = { 'Content-Type': 'application/json' };
  if (!AUTH_ON) return send(res, 200, JSON.stringify({ ok: true, open: true }), JSONH);
  let p;
  try { p = JSON.parse(await readBody(req)); } catch { return send(res, 400, JSON.stringify({ error: 'invalid JSON' }), JSONH); }
  const u = String(p.username || '').trim().toLowerCase();
  const pw = String(p.password || '');
  if (u === DEMO_USERNAME.toLowerCase() && pw === DEMO_PASSWORD) {
    return send(res, 200, JSON.stringify({ ok: true, token: demoToken(), name: DEMO_USERNAME }), JSONH);
  }
  return send(res, 401, JSON.stringify({ error: 'invalid credentials' }), JSONH);
}

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
  if (!authOk(req)) {
    return send(res, 401, JSON.stringify({ error: 'unauthorised — sign in required' }),
      { 'Content-Type': 'application/json' });
  }
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
  const model = resolveModel(payload.task, payload.model);
  const wantStream = payload.stream === true;

  // The tiered model ids may not all be enabled on every Anthropic key. If the
  // routed model is rejected (404 not_found / 400 invalid model), retry once
  // with a safe fallback so one bad tier can't break every AI feature.
  const FALLBACK_MODEL = process.env.ANTHROPIC_FALLBACK_MODEL || 'claude-3-5-sonnet-latest';
  async function callAnthropic(useModel) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: useModel, max_tokens, messages, stream: wantStream }),
    });
  }

  try {
    let usedModel = model;
    let upstream = await callAnthropic(model);
    if (!upstream.ok && (upstream.status === 404 || upstream.status === 400) && model !== FALLBACK_MODEL) {
      const detail = (await upstream.text()).slice(0, 300);
      console.error('Anthropic ' + upstream.status + ' for model "' + model + '" — retrying with "' + FALLBACK_MODEL + '". ' + detail);
      usedModel = FALLBACK_MODEL;
      upstream = await callAnthropic(FALLBACK_MODEL);
    }
    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Anthropic error', upstream.status, errText.slice(0, 500));
      return send(res, 502, JSON.stringify({ error: 'upstream ' + upstream.status, model: usedModel, detail: errText.slice(0, 200) }),
        { 'Content-Type': 'application/json' });
    }
    if (payload.task) console.log('[complete] task=' + payload.task + ' → ' + usedModel + (wantStream ? ' (stream)' : ''));

    // ---- streaming: forward Anthropic SSE text deltas as a plain chunked stream
    if (wantStream) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith('data:')) {
            const d = line.slice(5).trim();
            if (d && d !== '[DONE]') {
              try {
                const j = JSON.parse(d);
                if (j.type === 'content_block_delta' && j.delta && j.delta.text) res.write(j.delta.text);
              } catch (e) {}
            }
          }
        }
      }
      return res.end();
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return send(res, 200, JSON.stringify({ text, model: usedModel }), { 'Content-Type': 'application/json' });
  } catch (err) {
    console.error('proxy failure', err);
    if (res.headersSent) return res.end();
    return send(res, 502, JSON.stringify({ error: 'proxy failure' }), { 'Content-Type': 'application/json' });
  }
}

// ---- Outlook connector: REAL sign-in via the Microsoft device-code flow ----
// One-time setup: register a (free) app in Entra ID and set MS_CLIENT_ID —
// see README. Then "Connect" in Settings shows a code, you sign in at
// microsoft.com/devicelogin, and the demo pulls YOUR real mailbox. Tokens are
// kept server-side (.outlook-tokens.json, gitignored) and refreshed
// automatically; on stateless hosts the refresh token also travels via the
// x-ms-rt header from the signed-in browser. MS_GRAPH_TOKEN / MS_REFRESH_TOKEN
// env vars still work as manual alternatives. No token → demo inbox.
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_TENANT = process.env.MS_TENANT || 'common';
const MS_SCOPE = 'User.Read Mail.Read offline_access';
const MS_TOK_FILE = join(ROOT, '.outlook-tokens.json');
let _msTok = null;
try { _msTok = JSON.parse(readFileSync(MS_TOK_FILE, 'utf8')); } catch { }
function _msLogin(path) { return 'https://login.microsoftonline.com/' + MS_TENANT + '/oauth2/v2.0/' + path; }
async function _msForm(url, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  return r.json();
}
async function _msStoreToken(j) {
  let account = (_msTok && _msTok.account) || '';
  try {
    const me = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { authorization: 'Bearer ' + j.access_token } });
    if (me.ok) { const mj = await me.json(); account = mj.mail || mj.userPrincipalName || account; }
  } catch { }
  _msTok = { access_token: j.access_token, refresh_token: j.refresh_token || (_msTok && _msTok.refresh_token) || '', expires_at: Date.now() + ((j.expires_in || 3600) - 120) * 1000, account };
  try { writeFileSync(MS_TOK_FILE, JSON.stringify(_msTok)); } catch { }
  return _msTok;
}
async function _msAccessToken(req) {
  if (_msTok && _msTok.access_token && Date.now() < _msTok.expires_at) return _msTok.access_token;
  const rt = (_msTok && _msTok.refresh_token) || String((req && req.headers['x-ms-rt']) || '') || process.env.MS_REFRESH_TOKEN || '';
  if (rt && MS_CLIENT_ID) {
    try {
      const j = await _msForm(_msLogin('token'), { grant_type: 'refresh_token', client_id: MS_CLIENT_ID, refresh_token: rt, scope: MS_SCOPE });
      if (j.access_token) { await _msStoreToken(j); return j.access_token; }
    } catch { }
  }
  return process.env.MS_GRAPH_TOKEN || '';
}
function msConnected() { return Boolean((_msTok && _msTok.refresh_token) || process.env.MS_REFRESH_TOKEN || process.env.MS_GRAPH_TOKEN); }
async function handleOutlookConnect(req, res) {
  const JSONH = { 'Content-Type': 'application/json' };
  if (!MS_CLIENT_ID) return send(res, 200, JSON.stringify({ ok: true, setup: false, reason: 'MS_CLIENT_ID not set' }), JSONH);
  try {
    const j = await _msForm(_msLogin('devicecode'), { client_id: MS_CLIENT_ID, scope: MS_SCOPE });
    if (j.device_code) {
      return send(res, 200, JSON.stringify({ ok: true, setup: true, device_code: j.device_code, user_code: j.user_code, verification_uri: j.verification_uri || 'https://microsoft.com/devicelogin', interval: j.interval || 5, expires_in: j.expires_in || 900 }), JSONH);
    }
    return send(res, 502, JSON.stringify({ error: j.error_description || j.error || 'device code failed' }), JSONH);
  } catch (e) { return send(res, 502, JSON.stringify({ error: 'cannot reach login.microsoftonline.com: ' + e.message }), JSONH); }
}
async function handleOutlookStatus(req, res, url) {
  const JSONH = { 'Content-Type': 'application/json' };
  const dc = url.searchParams.get('device_code') || '';
  if (!dc) { // plain status probe
    return send(res, 200, JSON.stringify({ ok: true, connected: msConnected(), account: (_msTok && _msTok.account) || '' }), JSONH);
  }
  try {
    const j = await _msForm(_msLogin('token'), { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: MS_CLIENT_ID, device_code: dc });
    if (j.access_token) {
      const t = await _msStoreToken(j);
      // hand the refresh token to the browser too, so stateless hosts
      // (Vercel) can keep pulling mail on later invocations
      return send(res, 200, JSON.stringify({ ok: true, connected: true, account: t.account, refresh_token: t.refresh_token }), JSONH);
    }
    if (j.error === 'authorization_pending' || j.error === 'slow_down') return send(res, 200, JSON.stringify({ ok: true, pending: true }), JSONH);
    return send(res, 200, JSON.stringify({ ok: true, pending: false, error: j.error_description || j.error }), JSONH);
  } catch (e) { return send(res, 502, JSON.stringify({ error: e.message }), JSONH); }
}
function handleOutlookDisconnect(req, res) {
  _msTok = null;
  try { unlinkSync(MS_TOK_FILE); } catch { }
  return send(res, 200, JSON.stringify({ ok: true, connected: false }), { 'Content-Type': 'application/json' });
}
async function handleOutlook(req, res, url) {
  const JSONH = { 'Content-Type': 'application/json' };
  const token = await _msAccessToken(req);
  const q = url.searchParams.get('q') || '';
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
        return send(res, 200, JSON.stringify({ ok: true, live: true, account: (_msTok && _msTok.account) || '', messages }), JSONH);
      }
      console.error('Graph error', g.status, (await g.text()).slice(0, 200));
    } catch (e) { console.error('Graph fetch failed:', e.message); }
  }
  return send(res, 200, JSON.stringify({ ok: true, live: false, messages: [] }), JSONH);
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

import { fetchNewsCached } from './lib/news.mjs';

async function handleNews(req, res, url) {
  const topic = url.searchParams.get('topic') || 'realestate';
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get('limit') || '12', 10) || 12));
  try {
    const out = await fetchNewsCached({ topic, limit, key: process.env.NEWSAPI_KEY || null });
    return send(res, 200, JSON.stringify({ ok: true, ...out }), { 'Content-Type': 'application/json' });
  } catch (e) {
    return send(res, 200, JSON.stringify({ ok: true, live: false, items: [], sources: [], errors: [String(e.message)] }), { 'Content-Type': 'application/json' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/complete') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      return handleComplete(req, res);
    }
    if (url.pathname === '/api/login') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      return handleLogin(req, res);
    }
    if (url.pathname === '/api/outlook') {
      return handleOutlook(req, res, url);
    }
    if (url.pathname === '/api/outlook-connect') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      return handleOutlookConnect(req, res);
    }
    if (url.pathname === '/api/outlook-status') {
      return handleOutlookStatus(req, res, url);
    }
    if (url.pathname === '/api/outlook-disconnect') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      return handleOutlookDisconnect(req, res);
    }
    if (url.pathname === '/api/news') {
      return handleNews(req, res, url);
    }
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, ai: Boolean(API_KEY), auth: AUTH_ON, outlook: msConnected(), outlookSetup: Boolean(MS_CLIENT_ID), routing: routingTable() }),
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
  const t = routingTable().tiers;
  console.log('Bohio Workspace demo  →  http://localhost:' + PORT);
  console.log('Live AI: ' + (API_KEY
    ? 'ON — per-task routing (opus=' + t.opus + ', sonnet=' + t.sonnet + ', haiku=' + t.haiku + ')'
    : 'OFF — set ANTHROPIC_API_KEY for real responses; canned fallbacks active'));
});
