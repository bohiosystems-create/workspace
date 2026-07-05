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
- **Contract Management** — every lease & landlord agreement in one place;
  Karaya reads the contract terms (rent, escalation, term, breaks) and **builds
  a portfolio cashflow model straight from the leases** — a projected
  contracted-income table + chart with an AI insight.
- Every Karaya chatbot across the app (home, project rail, model editor, model
  studio, fullscreen sheet, file Q&A, screening, funds, negotiation) is
  connected to the Claude API and **streams its answer as it writes**.
- **Documents repository** — a central place that stores the firm's documents
  in an organised way (fund papers, leases & landlord agreements, service
  contracts, amendments) and lets you route any of them for approval; approvers
  sign off live. Documents can also be approved from within a project.
- **Fake sign-in with a customisable name** — sign in as anyone; your name
  personalises the topbar, home welcome, Karaya's greeting and the AI prompts.
  Editable any time in Settings and remembered across reloads.
- **Financial model workspace** — upload an **Excel** model (recreated in Bohio
  format) or a **PowerPoint / PDF / Word** brief (Karaya builds a model from it).
  The sheet actually recomputes — edit a cell (formula bar or by chatting, e.g.
  "set B8 to -3.00") and Total Opex, NOI, DSCR and cross-tab cells update; click
  any cell for its precedents & dependents; submit the model for approval.
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

## Per-task model routing

Karaya routes each kind of work to the most appropriate Claude model, so you're
not paying Opus prices for a one-line summary or sending a committee memo to a
small model:

| Task (examples) | Model | Why |
|---|---|---|
| Deal screening, IC memo, negotiation, deal structuring | **Opus** | Rigorous reasoning, accuracy matters most |
| Home chat, agent replies, file Q&A, opportunity summary | **Sonnet** | Fast, capable, conversational |
| Model-build insight line, suggestions | **Haiku** | Cheap one-liners |

How it works: each call names its task (`window.claude.complete(prompt, { task:
'screening' })`); the **server** owns the task→model map (`lib/models.mjs`), so
the model id is never exposed to the browser and the mapping stays configurable.
Resolution precedence: an explicit per-call `model` → the task's tier →
`ANTHROPIC_MODEL` (default for untagged calls) → Opus.

Tune it without touching code, via env vars:

```bash
# bump a tier's concrete model id
ANTHROPIC_MODEL_SONNET=claude-sonnet-4-6
# re-route specific tasks (JSON: task → tier or model id)
ANTHROPIC_TASK_MODELS='{"home_chat":"opus","file_qa":"haiku"}'
```

`GET /api/health` returns the live routing table so you can confirm what's wired.

## Deploy to Vercel

This folder is Vercel-ready. The static files (`index.html`, `assets/`,
`studio/`) are served as-is, and the two server-side routes run as serverless
functions in `api/` (no `server.mjs` needed in the cloud):

- `api/complete.js` → `POST /api/complete` (the AI proxy; key stays server-side)
- `api/vendor/[...path].js` → `/vendor/*` (proxies React/ReactDOM/Babel for the
  studio dashboards; `vercel.json` rewrites `/vendor/*` onto it)
- `api/health.js` → `GET /api/health`

**Steps**

1. Push this repo to GitHub (already done if you're reading this on the branch).
2. In Vercel: **Add New → Project → Import** your repo.
3. **Set the Root Directory to `bohio-workspace`.** (The repo root holds other
   projects; this step is required.)
4. Framework preset: **Other**. No build command. Output is automatic.
5. **Environment Variables →** add `ANTHROPIC_API_KEY` = your key (and
   optionally `ANTHROPIC_MODEL`). Apply to Production + Preview.
6. **Deploy.** When it's live, open `/api/health` — `"ai": true` confirms the
   key is wired. Then open the site and try the homepage Karaya chat.

Local `node server.mjs` still works unchanged — the `api/` functions are only
used by Vercel.

> ⚠️ **Protect your key on a public URL.** The AI route uses your Anthropic key
> with no authentication, so anyone with the link can spend your credits. Set a
> monthly spend limit on the key in the Anthropic console, and/or add a simple
> password gate before sharing the URL widely.

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
