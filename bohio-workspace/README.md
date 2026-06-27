# Bohio Workspace 3.0 — Demo

A fully functioning, interactive demo of the Bohio Workspace — an institutional
real-estate investment platform with an embedded AI analyst ("Karaya").

This is the standalone `Bohio_Workspace_3.0` build unpacked into a clean,
runnable project: the single self-extracting HTML has been turned into plain
files (one `index.html`, fonts, JS modules and the six Model-Studio dashboards),
and a tiny zero-dependency server wires the AI features to a real Claude model.

## What's in the demo

- **Workspace home** — a Karaya AI command bar that answers questions about
  *anything in the workspace*: any project, document, financial model, template,
  fund/LP, incoming deal, stakeholder, capital stack, budget or negotiation. It
  grounds every answer in the app's actual data, with follow-up memory.
- **AI Deal Screening** — screens an incoming deal against the firm's investment
  mandate (nine criteria), animates a fit gauge, and returns a committee-ready
  PROCEED / REVIEW / PASS verdict. Includes an **IC Memo generator**.
- **Funds & Stakeholders** — multi-fund command center with an animated
  stakeholder network, capital-deployment metrics and a live project pipeline.
- **Agent chats & negotiation room** — in-character AI counterparties.
- **Model Studio dashboards** — six asset-class dashboards loaded into the
  workspace (hotel, office, retail, single-tenant, waterfall, lifestyle).

Every AI feature is driven by `window.claude.complete(...)`. When a Claude API
key is configured (see below) those calls hit a real model; without one, each
feature falls back to a rich built-in response, so the demo is **fully
interactive either way**.

## Run it

Requires Node.js 18+ (no `npm install` needed — zero dependencies).

```bash
cd bohio-workspace

# Enable live AI: copy the example env file and paste your Anthropic key in.
cp .env.example .env
#   edit .env →  ANTHROPIC_API_KEY=sk-ant-...

npm start            # or: node server.mjs
```

Then open <http://localhost:5173>. Sign-in is a demo gate — click **Sign In**
(any/empty credentials) to enter the workspace.

### Supplying the API key

The server reads `ANTHROPIC_API_KEY` from, in order of precedence:

1. the real environment (`ANTHROPIC_API_KEY=sk-ant-... node server.mjs`), or
2. a `.env` file in this folder (loaded automatically; `.env` is gitignored).

`.env` keys never override variables already set in the environment. Optional
settings: `ANTHROPIC_MODEL` (default `claude-opus-4-8`) and `PORT` (default
`5173`). See `.env.example`.

Check `GET /api/health` to confirm whether live AI is on:

```json
{ "ok": true, "ai": true, "model": "claude-opus-4-8" }
```

### Without a server

You can also open `index.html` directly in a browser. The full UI works and all
AI features use their built-in fallback responses (the `/api/complete` call
simply fails and the app degrades gracefully). For **live** AI you must run the
server, because the Anthropic API key has to stay on the server side.

> The **Model Studio** dashboards are the exception — see below. They render via
> the server's `/vendor` cache, so use `npm start` (not file://) to see them.

## Model Studio dashboards & offline use

The six Model-Studio dashboards (`studio/*.html`) are interactive React apps
(charts, sensitivity tables, equity waterfall). They need React, ReactDOM and
Babel. The original standalone loaded those straight from a public CDN
(`unpkg.com`) at runtime, so the dashboards only rendered when the browser could
reach that CDN.

This build routes those library loads through the demo server instead:

```
studio dashboard ──/vendor/react@18…──▶ server.mjs ──▶ unpkg (once) ──▶ studio-vendor/ (cached)
```

On first load (with internet) the server fetches the exact library bytes,
validates them against the dashboards' Subresource-Integrity hashes, and caches
them under `studio-vendor/`. After that the dashboards render **fully offline**,
with no third-party CDN dependency. The rest of the app (workspace, screening,
funds, agents) has no external dependencies at all.

If the machine has never had internet, the dashboards stay blank but every other
part of the demo still works. Point `VENDOR_UPSTREAM` at a mirror if `unpkg.com`
is blocked on your network.

## How it's wired

```
browser ──window.claude.complete()──▶ assets/js/claude.js
            (string or {messages})        │  POST /api/complete
                                          ▼
                                      server.mjs ──▶ Anthropic Messages API
                                      (injects ANTHROPIC_API_KEY,
                                       returns plain text)
```

- `assets/js/claude.js` — the `window.claude` bridge. Accepts both call shapes
  the app uses (`complete("prompt")` and `complete({ messages: [...] })`) and
  returns a plain-text string.
- `server.mjs` — zero-dependency Node HTTP server: serves the static demo and
  proxies `POST /api/complete` to the Anthropic Messages API. The API key is
  never exposed to the browser.

## Project layout

```
bohio-workspace/
├── index.html            # the app (unpacked from the standalone bundle)
├── server.mjs            # static server + /api/complete AI proxy + /vendor cache
├── .env.example          # copy to .env and add your ANTHROPIC_API_KEY
├── package.json
├── assets/
│   ├── js/
│   │   ├── claude.js         # window.claude.complete bridge
│   │   ├── client-demos.js   # screening / funds / IC-memo demo logic
│   │   └── image-slot.js     # <image-slot> web component
│   └── fonts/                # Dallas Light (display) + Space Grotesk (body), woff2
├── studio/                # six Model-Studio dashboards (iframed)
└── studio-vendor/         # React/ReactDOM/Babel cache (generated, gitignored)
```
