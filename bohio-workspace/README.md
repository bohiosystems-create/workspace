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
- **Contract Management** — every lease & landlord agreement in one place.
  Karaya reads the contract terms (rent, escalation, term, breaks) **and the
  project's existing master financial model**, then **builds an updated cashflow
  model** as a real Bohio Excel-like workbook: a *Lease Schedule* tab read from
  the contracts, a *Contracted Income* projection, and an *Updated Cashflow* tab
  that folds the new contracted income into the master model's NOI and debt
  service (click any cell for its formula, precedents and dependents). It
  exports to a multi-tab `.xls` in one click. Available both as a workspace
  section **and inside every project** (the "Contracts" section).
- **Build a model from a document** — with no upload, click *Build from a
  Document* in My Models to watch Karaya read a sample offering memorandum and
  structure it into a full Bohio-format underwriting model.
- **Export any model to Excel** — every Bohio-format model exports to a neat,
  multi-tab `.xls` workbook (native SpreadsheetML, no libraries) with styled
  headers/sections/totals and numbers typed as numbers, straight from the editor
  or Model Studio.
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
  Every change is **auto-saved** (surviving reloads via localStorage), and each
  rework **snapshots the previous version** — open **History** in the sheet
  toolbar to roll back to any earlier state.
- **Bohio Workflows** — a home-page gallery of five one-click AI workflows that
  run live (ingest valuations & deal docs → model; lease/sales agreements →
  cashflow; model vs. actuals; partner/co-investor reporting pack; asset
  appreciation → NAV & IRR), each with an animated pipeline, a concrete artifact
  and a streamed Karaya narration.
- **Multiple LLM providers** — Karaya isn't tied to one model. **Settings › AI
  Model Providers** lets you add API keys for OpenAI, Google Gemini, Mistral,
  xAI or a private Azure OpenAI endpoint alongside Anthropic; keys stay
  server-side and any task can be routed to the provider you prefer.
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
ANTHROPIC_MODEL_SONNET=claude-sonnet-5
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

**Real Outlook connector — sign in with your own mailbox.** One-time setup
(~2 minutes, free):

1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → App
   registrations → **New registration**. Name it "Bohio Demo"; under supported
   account types pick **"Accounts in any organizational directory and personal
   Microsoft accounts"**; no redirect URI.
2. Copy the **Application (client) ID** and set it as `MS_CLIENT_ID` (in
   `.env` locally, and in Vercel's env vars).
3. In the app: Authentication → **Allow public client flows → Yes**; API
   permissions → Add → Microsoft Graph → Delegated → **Mail.Read**.

Then open **Settings › Connectors › Microsoft Outlook → Connect**: you get a
code, sign in at `microsoft.com/devicelogin`, and the connector is live — the
fund-management chatbot pulls and grounds in **your real email threads**,
tagging answers "✉ Outlook · live mailbox". Tokens stay server-side locally
(`.outlook-tokens.json`, gitignored); on Vercel the refresh token is held by
your signed-in browser and sent with each request. `MS_REFRESH_TOKEN` or a raw
`MS_GRAPH_TOKEN` env var work as manual alternatives. Without any of this the
built-in demo inbox answers, so the flow demos either way.

> ⚠️ **Protect your key on a public URL.** Set `DEMO_USERNAME` and
> `DEMO_PASSWORD` (env vars, both locally in `.env` and on Vercel) to require a
> real sign-in: the login form verifies credentials against `POST /api/login`,
> and `POST /api/complete` refuses AI calls without the issued token — so only
> people who sign in can spend your Anthropic credits. Without `DEMO_PASSWORD`
> the demo keeps its open sign-in gate. Also consider a monthly spend limit on
> the key in the Anthropic console.

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

## Live market news (optional)

`GET /api/news?topic=realestate|geopolitical` returns Saudi / GCC headlines for
the daily brief, the risk radar and the assistant's context.

It reads **syndication feeds and GDELT's public API** — sources published for
machine consumption — rather than scraping article HTML, which would break on
every redesign and sit outside most outlets' terms.

| Source | Key needed | Notes |
|---|---|---|
| GDELT DOC 2.0 | no | Free, strong geopolitical coverage |
| Google News RSS | no | Topic queries per sector |
| Arab News / Saudi Gazette / Zawya RSS | no | Regional outlets |
| NewsAPI | `NEWSAPI_KEY` | Optional; best metadata, used first when set |

Results are cached for 5 minutes server-side and 10 minutes in the page. If no
source is reachable the route returns `{ live:false, items:[] }` and the app
falls back to its curated `MARKET_DATA` set — the UI says which it is showing.

Note: outbound network is required. It works on Vercel; a sandbox or CI box with
an egress policy will return `live:false`.
