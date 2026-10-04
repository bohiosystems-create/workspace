# Kinan Site Agent — Setup Guide

This guide takes you from zero to a working site agent that a development manager can use **on site, from a phone**, through:

- the **web app**: site map, drawings, documents, notes and project data (no chat screen), and
- **WhatsApp**: the AI agent. Text, voice notes, photos, PDFs and shared location.

The AI agent is reached **only through WhatsApp**. The web app is for browsing the map and documents and leaving notes.

The agent answers from the project's documents, programme, procurement, safety and regulations data. It uses **both Anthropic (Claude) and OpenAI**, with built-in routing and automatic fallback between them.

> **Time needed:** about 30 min for a local demo, plus 1–2 h for production with WhatsApp. A purchasing-system connection depends on your IT team (typically ½–2 days).

---

## Contents
1. [How it fits together](#1-how-it-fits-together)
2. [Prerequisites](#2-prerequisites)
3. [Quick start (local demo)](#3-quick-start-local-demo)
4. [AI providers & routing](#4-ai-providers--routing)
5. [Deploy to production (HTTPS)](#5-deploy-to-production-https) — **A: Vercel** · B: your own server (Docker)
6. [Connect WhatsApp](#6-connect-whatsapp)
7. [Connect the purchasing system](#7-connect-the-purchasing-system)
8. [Load your real project data](#8-load-your-real-project-data)
9. [Security & compliance checklist](#9-security--compliance-checklist)
10. [Using it on site](#10-using-it-on-site)
11. [Troubleshooting](#11-troubleshooting)
12. [Environment reference](#12-environment-reference)

---

## 1. How it fits together

```
 Phone (browser)            Phone (WhatsApp)
      │ HTTPS                     │  Meta WhatsApp Cloud API
      ▼                           ▼
 ┌───────────────────────── Kinan Site Agent (Next.js server) ─────────────────────────┐
 │  Web UI: Site map · Agent · Project · Docs        /api/whatsapp  (webhook)           │
 │                                                                                      │
 │  Agent core ── 26 tools ──► documents · drawing register · programme · regulations   │
 │      │                      safety/permits · procurement · NCRs · contacts · notes   │
 │      ▼                                                                               │
 │  LLM router: fast / main / deep  ──►  OpenAI  ⇄  Anthropic   (fallback both ways)    │
 │      └─ no keys or both down ──► offline keyword assistant                           │
 │                                                                                      │
 │  Storage: data/ folder (server) or Vercel Blob   Procurement sync: SAP · Oracle · REST│
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

- **One app** runs everything — on **Vercel** (serverless; data in a private **Vercel Blob** store) or on **your own server/Docker** (data in a `data/` folder). No database to manage either way.
- **`kinan-site-agent.html`** is a separate *single-file* version of the same app (no server). It has no AI and its data stays in that browser. Use it for demos and offline review; use the server for the team and WhatsApp.

---

## 2. Prerequisites

| You need | For | Notes |
|---|---|---|
| **Node.js 20+** (22 recommended) | running locally | `node -v` |
| **Anthropic API key** and/or **OpenAI API key** | the AI agent | one is enough; both gives routing + fallback |
| A **Vercel account** *or* a **Linux server / VM** with a domain | production & WhatsApp | Meta requires a public **HTTPS** webhook — Vercel gives you one automatically |
| **Docker + Docker Compose** | only for the own-server option | or run Node directly |
| A **Meta Business account** and a **phone number** not already used on WhatsApp | WhatsApp | details in §6 |
| Credentials for your **purchasing system** | live PO/delivery data | SAP S/4HANA, Oracle Fusion or any REST source (§7) |

> **Hosting note:** both options are fully supported. On Vercel, WhatsApp messages are processed with `after()` (the function stays alive after acknowledging Meta), saves are conflict-safe across function instances, and large files go straight to Blob storage.

---

## 3. Quick start (local demo)

```bash
git clone <your repo> && cd workspace/kinan-site-agent
npm install
cp .env.example .env.local
# edit .env.local → add ANTHROPIC_API_KEY and/or OPENAI_API_KEY (optional for a first look)
npm run dev
```

Open **http://localhost:3000**. To open it on your phone, use the same Wi-Fi and go to `http://<your-computer-ip>:3000`.

The app starts with the **Kinan Heights demo dataset**:

| Data | Volume |
|---|---|
| Programme (P6-style, baseline vs forecast, critical path) | ~635 activities |
| Drawing register (all levels × 6 disciplines, revision history) | ~830 sheets |
| Documents (drawings, design basis reports, specifications, RFIs, ITRs, method statements, minutes…) | 58 |
| Regulations / compliance register (SBC, Civil Defense, MHRSD, MOMRAH, GACA, SEC, NWC, NCEC, PDPL…) | 32 |
| Safety rules, PPE matrix, risk assessments, permits, incidents, KPIs | 38 / 9 / 18 / 18 / 30 |
| Procurement: suppliers, packages, POs, deliveries, material requests, stock | 24 / 28 / 59 / 104 / 12 / 14 |
| NCRs, contacts | 14 / 32 |

> ⚠️ The demo data is **fictional** (companies, suppliers, people). The regulations register paraphrases requirements *as applied to the project*. Always verify against the official texts.

To reset the demo, stop the server and delete the `data/` folder.

**Single-file version:** `npm run build:html` produces `kinan-site-agent.html`. Open it in any browser (map, documents, notes and project data; no AI).

---

## 4. AI providers & routing

### 4.1 Get the keys
- **Anthropic:** https://platform.claude.com/settings/keys → *Create key* → `ANTHROPIC_API_KEY`
- **OpenAI:** https://platform.openai.com/api-keys → *Create new secret key* → `OPENAI_API_KEY`

Set a monthly spend limit in both consoles.

### 4.2 How routing works
Every message is classified, then sent to the **first available model** in that tier's list. If that call fails (error, overload, timeout), the **next candidate is tried automatically**, normally on the other provider.

| Tier | When | Default order |
|---|---|---|
| **fast** | short lookups & commands — "where is TC1", "open the L12 plan", "PO 4500123?", "note: …" | OpenAI `gpt-5-mini` → Claude `claude-haiku-4-5-20251001` |
| **main** | normal questions needing a few tool calls; anything with a photo | Claude `claude-sonnet-5-5` → OpenAI `gpt-5` |
| **deep** | analysis — compare, why, impact, risk, delay/claim, recovery plan, reports, long multi-part questions | Claude `claude-opus-5-5` → OpenAI `gpt-5` |

Other rules:
- **PDFs** prefer Claude (native PDF reading).
- **Voice notes** (WhatsApp) are transcribed by OpenAI (`whisper-1`), so they need an OpenAI key.
- **No keys, or every provider down:** the **offline keyword assistant** still answers searches, deliveries, look-ahead, late activities, permits, POs, contacts and notes. The reply is marked ⚠️.
- Every reply in the web app shows **which model answered**, the tier, the response time, and any fallback. On WhatsApp you can show the same with `WHATSAPP_SHOW_MODEL=true`.

### 4.3 Customise
```ini
LLM_MODE=auto            # or anthropic / openai  → that provider first on every tier
LLM_FALLBACK=true        # false = never switch provider
LLM_ROUTE_FAST=openai:gpt-5-mini,anthropic:claude-haiku-4-5-20251001
LLM_ROUTE_MAIN=anthropic:claude-sonnet-5-5,openai:gpt-5
LLM_ROUTE_DEEP=anthropic:claude-opus-5-5,openai:gpt-5
OPENAI_REASONING_EFFORT=low
```
Model names change over time. If a provider retires a model, update these lines. Nothing else needs to change. You can review the current routing anytime at `/api/llm` (log in with `APP_PASSWORD`).

### 4.4 Check it works
```bash
curl -u :$APP_PASSWORD http://localhost:3000/api/llm      # which providers are connected + routes, storage, WhatsApp
```
To test the agent itself, message the WhatsApp number (section 5). Set `WHATSAPP_SHOW_MODEL=true` to see which provider, model and tier answered under each reply.

---

## 5. Deploy to production (HTTPS)

### Option A — Vercel (fastest)

**A1. Get the code onto Vercel** (either way works)
- **GitHub (recommended):** unzip `kinan-site-agent-vercel.zip`, push the folder to a GitHub repo, then on **vercel.com → Add New… → Project → Import** that repo. Framework preset **Next.js** is detected; leave build settings as default. (If the app sits in a sub-folder of the repo, set **Root Directory** to that folder.)
- **CLI:** `npm i -g vercel`, then in the unzipped folder run `vercel` (creates the project + preview) and `vercel --prod`.

**A2. Add storage — required to keep data.** Project → **Storage** → **Create** → **Blob** → name it (e.g. `kinan-site-agent`), choose **Private** access if asked → **Connect** to the project for all environments. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.
> Without Blob the app still runs, but it stores data in the function's temporary disk — notes and uploads disappear when Vercel recycles the instance. The app shows a yellow **"Demo storage"** banner until Blob is connected.

**A3. Environment variables.** Project → **Settings → Environment Variables**, add (Production + Preview):
`APP_PASSWORD`, `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`, and when you get to them the `WHATSAPP_*`, `PROCUREMENT_*`, `IMPORT_SECRET` values from `.env.example`. Then **Deployments → ⋯ → Redeploy** (env changes apply on the next deployment).

**A4. Check it.** Open `https://<project>.vercel.app` → log in with `APP_PASSWORD` → then open `/api/llm`: it should list your providers and `"storage": "blob"`.

**A5. Settings worth changing**
- **Functions → Function Region:** pick the region closest to KSA that your plan offers (lower latency for the site team).
- **Deployment Protection:** keep it for *preview* deployments, but the **production** domain must be reachable by Meta and your ERP webhooks (they are authenticated by signature/secret; the UI by `APP_PASSWORD`). If production is protected, webhooks get 401.
- **Custom domain** (optional): Settings → Domains, e.g. `siteagent.kinan.example`.
- **Time limits:** answers are capped at ~50 s per question (`maxDuration` 60 s) so they work on every plan. On Pro you can raise `maxDuration` in `app/api/whatsapp/route.ts` and set `AGENT_DEADLINE_MS`.
- **Scheduled ERP sync** (optional): add a `vercel.json` with `{"crons":[{"path":"/api/integrations/procurement?action=sync","schedule":"0 5 * * *"}]}` and set `CRON_SECRET`. (Hobby plans allow daily crons only; the agent also re-syncs automatically when data is older than `PROCUREMENT_SYNC_MINUTES`.)

**Vercel limits handled by the app:** request/response bodies are limited to ~4.5 MB on Vercel — the app uploads bigger files straight from the phone to Blob (up to 200 MB) and opens them through 15-minute signed links. Backups: Blob data lives under the `kinan/` folder of the store (download from the Storage tab, or copy with the Blob CLI/SDK).

WhatsApp callback URL on Vercel: `https://<project>.vercel.app/api/whatsapp` (or your custom domain).

### Option B — your own server (Docker)

### 5.1 Server & DNS
1. Create a VM (Ubuntu 22.04/24.04), open ports **80** and **443**.
2. Point a DNS record at it, e.g. `siteagent.kinan.example` → server IP.
3. Install Docker: https://docs.docker.com/engine/install/ubuntu/

### 5.2 Configure and start
```bash
git clone <your repo> && cd workspace/kinan-site-agent
cp .env.example .env
nano .env        # at minimum: APP_PASSWORD, one AI key, and add DOMAIN=siteagent.kinan.example
docker compose up -d --build
docker compose logs -f app
```
- **Caddy** (included) obtains and renews the Let's Encrypt certificate automatically.
- App data lives in the Docker volume `sitedata`, mounted at `/data`.
- Open `https://siteagent.kinan.example` and log in with `APP_PASSWORD`. Any username works unless `APP_USER` is set.

### 5.3 Install on the phone
Open the URL in Safari (iOS) or Chrome (Android) → **Share / ⋮ → Add to Home Screen**. It opens full-screen like an app. Allow **location** (GPS dot on the map) and **microphone** (voice questions) when asked.

### 5.4 Backups
Everything is in `/data` (`db.json`, `uploads/`, `whatsapp-sessions.json`). Back it up nightly:
```bash
docker run --rm -v kinan-site-agent_sitedata:/data -v $PWD:/backup alpine \
  tar czf /backup/siteagent-$(date +%F).tgz -C /data .
```

### 5.5 Without Docker
```bash
npm ci && npm run build
sudo apt-get install -y fonts-dejavu-core      # text in WhatsApp map/drawing images
PORT=3000 KINAN_DATA_DIR=/var/lib/siteagent npm start
```
Put any reverse proxy with HTTPS in front (Nginx, Caddy, IIS, Azure App Gateway). Allow request bodies of at least **50 MB** for uploads.

### 5.6 Updates
`git pull && docker compose up -d --build`. Data is preserved, and older databases are migrated automatically on start.

---

## 6. Connect WhatsApp

The agent uses Meta's official **WhatsApp Business Cloud API**. Meta's console changes its menu names from time to time; the steps below follow the current layout.

### 6.1 Create the Meta app
1. Go to **https://business.facebook.com** and create (or choose) the **Kinan business portfolio**.
2. Go to **https://developers.facebook.com → My Apps → Create app**. Choose the use case for **WhatsApp** (or type **Business**) and link it to the Kinan business portfolio.
3. In the app dashboard, **add the WhatsApp product**. This creates a **WhatsApp Business Account** and a **test phone number**.
4. Open **WhatsApp → API Setup** and note the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
5. Open **App settings → Basic**, click **Show** next to the app secret → `WHATSAPP_APP_SECRET`.

### 6.2 Create a permanent access token
The token on the API Setup page expires after ~24 h. For production:
1. **business.facebook.com → Settings → Users → System users → Add**. Give it a name like `siteagent` and the **Admin** role.
2. **Assign assets**: your **app** (full control) and the **WhatsApp account** (full control).
3. **Generate new token**: pick your app, set expiry **Never**, and select the permissions **`whatsapp_business_messaging`** and **`whatsapp_business_management`**.
4. Copy the token → `WHATSAPP_TOKEN`.

### 6.3 Configure the webhook
1. Choose any random string for the verify token → `WHATSAPP_VERIFY_TOKEN`. Example: `openssl rand -hex 16`.
2. Set the four `WHATSAPP_*` values, plus `WHATSAPP_ALLOWED_NUMBERS` (see 6.4), in `.env`, then run `docker compose up -d`.
3. In the Meta app, open **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://siteagent.kinan.example/api/whatsapp`
   - **Verify token:** the same string → **Verify and save**. You should see a success tick.
4. Under **Webhook fields**, **subscribe to `messages`**.

### 6.4 Allow who can use it
Only listed numbers get answers. Everyone else receives a polite refusal. Use international format with no `+` or spaces:
```ini
WHATSAPP_ALLOWED_NUMBERS=9665XXXXXXXX:Development Manager,9665YYYYYYYY:HSE Manager,9665ZZZZZZZZ:Project Director
```
The name after `:` is recorded as the author of notes and uploads made from that phone.

### 6.5 Test with the test number
1. **API Setup → To**: add your own mobile as a test recipient (up to 5) and confirm the code.
2. From your phone, send **`help`** to the test number. You should get the command list within a few seconds.
3. Try: `What's late on Tower A?` · a **voice note** · a **photo** · **share location** · `Show me the Tower A L12 slab drawing`.

### 6.6 Go live with a real number
1. **WhatsApp Manager → Phone numbers → Add phone number**. Use a number that is **not** active on the WhatsApp app (a new SIM or landline). Verify it by SMS or voice, and set a **display name** (Meta reviews it).
2. Complete **Business verification** in Business Settings for higher messaging limits.
3. In the app, set **App mode → Live**. This needs a privacy-policy URL.
4. Replace `WHATSAPP_PHONE_NUMBER_ID` with the real number's ID and restart.

**Good to know**
- The agent only **replies** to people who message it. Free-form replies are allowed within Meta's **24-hour customer-service window**. Proactive pushes (e.g. a 07:00 daily brief) need pre-approved message templates. Ask if you want this added.
- Meta charges per message/conversation by category and country. Check current WhatsApp Business pricing.
- Maximum media sizes are enforced by WhatsApp (images ~5 MB, documents ~100 MB). Files above ~4.5 MB are stored, but the AI reads their extracted text rather than the file itself.

### 6.7 What the WhatsApp bot does
| You send | It does |
|---|---|
| Text question | Routes to the right model, uses the project tools, replies in WhatsApp formatting |
| 🎙 Voice note | Transcribes (OpenAI), echoes what it heard, answers |
| 📍 Shared location | Converts GPS → site plan, replies with a "you are here" map image, remembers your place for 3 h |
| 📷 Photo / 📄 PDF (no caption) | Files it to your current place; Claude/OpenAI indexes it (title, type, summary, searchable text) |
| Photo with caption "upload to Tower A L12" | Files it there |
| Photo with a **question** caption ("is this crack structural?") | Answers using the image, then offers to file it (reply **save** or a place name) |
| "Show me the L12 slab drawing" | Sends the drawing as an image (or the PDF) |
| "Where is TC1?" | Sends a cropped map image with the place highlighted |
| `note: …` / `issue: …` / `instruction: …` | Logs it against your place or the last document |
| "Order 20 t rebar Ø16 for Tower A L14 by 10 Oct" | Raises a material request (pushed to the purchasing system if connected) |
| `help` · `where am I` · `here Tower A L12` · `reset` | Commands |

---

## 7. Connect the purchasing system

The agent always reads procurement data from its local copy, which keeps answers fast and keeps working when the ERP is slow. That copy is refreshed in three ways:

| Method | Use when | Set |
|---|---|---|
| **Pull — SAP S/4HANA** | SAP is the PO system | `PROCUREMENT_PROVIDER=sap` + `SAP_*` |
| **Pull — Oracle Fusion** | Oracle Cloud Procurement | `PROCUREMENT_PROVIDER=oracle` + `ORACLE_*` |
| **Pull — generic REST** | Odoo, Dynamics, Procore, an integration platform, or a custom API | `PROCUREMENT_PROVIDER=rest` + `PROCUREMENT_REST_*` |
| **Push — webhook** | any system or integration tool (SAP CPI, Power Automate, n8n, Make, Boomi…) | `PROCUREMENT_WEBHOOK_SECRET` |

When a pull source is configured, the agent re-syncs automatically if the data is older than `PROCUREMENT_SYNC_MINUTES` (default 15) whenever someone asks about POs, deliveries, packages or stock. It waits at most 8 s, then answers from the cached copy. You can also trigger a sync from cron:
```bash
curl -X POST -H "Authorization: Bearer $PROCUREMENT_WEBHOOK_SECRET" https://siteagent.kinan.example/api/integrations/procurement?action=sync
```
On the first successful pull, the demo POs are replaced by your real ones.

### 7.1 SAP S/4HANA (Cloud or on-premise)
Uses the standard OData v2 APIs:
- **Read POs:** `API_PURCHASEORDER_PROCESS_SRV` (S/4HANA Cloud: communication arrangement for *Purchase Order Integration*, typically `SAP_COM_0053`).
- **Create purchase requisitions** (optional): `API_PURCHASEREQ_PROCESS_SRV` (typically `SAP_COM_0102`).

Ask your SAP Basis team for a technical **communication user** with read access to POs (plus PR create if wanted), restricted to the project's purchasing group or plant.
```ini
PROCUREMENT_PROVIDER=sap
SAP_BASE_URL=https://my123456-api.s4hana.cloud.sap      # or your on-prem gateway host
SAP_USERNAME=SITEAGENT_COMM
SAP_PASSWORD=********                                    # or SAP_BEARER_TOKEN=…
SAP_CLIENT=100                                           # on-prem only, if required
SAP_PO_FILTER=PurchasingGroup eq 'KH1'                   # limit to the project
SAP_PR_ENABLED=true                                      # allow "order …" from site to create PRs
SAP_PR_DEFAULTS={"Plant":"KH01","MaterialGroup":"CONSTR","PurchasingGroup":"KH1"}
```
`SAP_PR_DEFAULTS` supplies the fields your SAP configuration makes mandatory, such as plant, material group, purchasing group, account assignment category and WBS. Agree these with procurement. The agent creates **requisitions only**; approval and conversion to POs stay in SAP.

### 7.2 Oracle Fusion Cloud Procurement
Uses the REST resource `/fscmRestApi/resources/<version>/purchaseOrders` with lines. You need a user with a procurement role allowed to view purchase orders through REST.
```ini
PROCUREMENT_PROVIDER=oracle
ORACLE_BASE_URL=https://xxxx.fa.ocs.oraclecloud.com
ORACLE_USERNAME=siteagent.integration
ORACLE_PASSWORD=********
ORACLE_PO_QUERY=ProcurementBU='Kinan Heights'
# ORACLE_PO_PATH=/fscmRestApi/resources/11.13.18.05/purchaseOrders   # change if your release differs
```
Oracle is read-only here. Send material requests through the webhook or REST method.

### 7.3 Generic REST (any system)
Point it at a URL that returns purchase orders as JSON. If the field names differ from ours, map them. Odoo example:
```ini
PROCUREMENT_PROVIDER=rest
PROCUREMENT_REST_URL=https://erp.kinan.example/api/purchase_orders?project=KH
PROCUREMENT_REST_TOKEN=********
PROCUREMENT_REST_MAP={"list":"data.orders","po":"number","supplier":"vendor.name","date":"order_date","status":"state","lines":"order_lines","line.item":"name","line.qty":"product_qty","line.unit":"uom","line.unitPrice":"price_unit","line.delivered":"qty_received"}
PROCUREMENT_REST_DELIVERIES_URL=https://erp.kinan.example/api/deliveries?project=KH   # optional
PROCUREMENT_REST_MR_URL=https://erp.kinan.example/api/material_requests             # optional: site MRs are POSTed here
```

### 7.4 Push (webhook) — works with everything
Your integration tool calls the agent whenever something changes:
```bash
curl -X POST https://siteagent.kinan.example/api/integrations/procurement \
  -H "Authorization: Bearer $PROCUREMENT_WEBHOOK_SECRET" -H "content-type: application/json" \
  --data @samples/procurement-webhook.json
```
| `type` | `data` (object or array) | key |
|---|---|---|
| `purchase_order` | `{po, supplier, date, currency, status, packageId?, lines:[{line,item,qty,unit,unitPrice,delivered}]}` | `po` |
| `delivery` | `{id, po, date, slot, gate, locationId, items, status, vehicle, grn?, remarks?}` | `id` |
| `material_request_status` | `{id or externalRef, status, externalRef?}` | MR id |
| `stock` | `{item, qty, unit, locationId, min}` | item + location |

To collect **material requests raised on site**, have the integration poll:
`GET /api/integrations/procurement?since=2026-10-01` (same Bearer secret) → `{requests:[…]}`.

Use the site-plan location ids for `locationId` (e.g. `laydown-2`, `rebar-yard`, `tower-a-l14`). They are listed in `lib/siteplan.ts`.

---

## 8. Load your real project data

### 8.1 Programme (Primavera P6 / MS Project)
1. Export the activities layout to **CSV**. Columns are matched by name, case-insensitive:
   `Activity ID, Activity Name, WBS, Location (optional), Responsible, Start, Finish, BL Project Start, BL Project Finish, % Complete, Total Float, Predecessors, Critical`.
   Dates such as `01-Oct-26`, `01-Oct-26 A`, `2026-10-01` and `01/10/2026` (day-first) are understood.
2. Upload it:
```bash
curl -X POST "https://siteagent.kinan.example/api/import?type=schedule&dataDate=2026-10-01" \
  -H "Authorization: Bearer $IMPORT_SECRET" -H "content-type: text/csv" --data-binary @programme.csv
```
This **replaces** the programme. If there is no `Location` column, the place is inferred from the start of the activity name ("Tower A L13 …"). The response tells you how many activities couldn't be mapped. Re-import weekly after each schedule update. See `samples/schedule-p6-export.csv`.

### 8.2 Drawing register
Export from document control (Aconex, ACC, Procore, SharePoint…) and upload. This **upserts** by sheet number and keeps revision history:
```bash
curl -X POST "https://siteagent.kinan.example/api/import?type=register" \
  -H "Authorization: Bearer $IMPORT_SECRET" -H "content-type: text/csv" --data-binary @register.csv
```
Columns: `Sheet, Title, Discipline, Location, Revision, Status, Issued, Reason`. See `samples/drawing-register.csv`.

### 8.3 Documents & drawings
- **Web app:** Site map → tap a place → **Upload here**, or **📌 Pin a document to the plan** and tap the exact spot.
- **WhatsApp:** send the PDF or photo with a caption like `upload to Tower A L12`.
- With an AI key, each upload is read automatically (title, type, revision, summary, searchable text).

### 8.4 Your site plan & GPS
- The map geometry and the place list are in `lib/siteplan.ts` (1 plan unit = 0.5 m). Replace the demo buildings with your setting-out coordinates.
- **GPS calibration:** set `GEO.originLat` / `GEO.originLon` to the latitude/longitude of the plan's top-left corner. Survey or GIS can provide it. If the site isn't north-up, add a rotation in `gpsToPlan`.
- For a whole new dataset, edit the generators in `lib/data/` and `lib/seed.ts`, then delete `data/db.json` to re-seed.

---

## 9. Security & compliance checklist

- [ ] **HTTPS only**; `APP_PASSWORD` set, long and random. For company SSO, put the app behind your identity proxy (Azure App Proxy, Cloudflare Access, Okta). The machine endpoints `/api/whatsapp`, `/api/integrations/*` and `/api/import` authenticate themselves.
- [ ] **WhatsApp:** `WHATSAPP_APP_SECRET` set, so every webhook call is signature-checked; `WHATSAPP_ALLOWED_NUMBERS` limited to named staff; never set `WHATSAPP_SKIP_SIGNATURE` or `WHATSAPP_ALLOW_ALL` in production.
- [ ] **Secrets:** `.env` readable only by the service account; rotate API keys and the WhatsApp token on staff changes; set spend limits at Anthropic and OpenAI.
- [ ] **ERP user** is technical, least-privilege, and limited to the project's purchasing group or business unit.
- [ ] **PDPL / data residency:** questions, documents, photos and voice notes are sent to Anthropic and OpenAI for processing, outside KSA. Complete a data-protection impact assessment (it is listed as *Action Required* in the compliance register). Review both providers' data-retention terms, and avoid sending personal data you don't need.
- [ ] **Backups** of `/data` nightly, kept off the server (Vercel: the Blob store's `kinan/` folder).
- [ ] **Vercel:** Blob store created as **Private**; production Deployment Protection off only because `APP_PASSWORD` is set.
- [ ] Keep dependencies patched: `npm audit` (currently 0 known vulnerabilities on Next.js 15.5.27).
- [ ] The **standalone HTML** stores keys in the browser. Only use it on your own device, and never share a copy that has keys in it.

---

## 10. Using it on site

**Web app tabs**
- **Site map:** pinch/zoom the detailed plan, toggle layers (utilities, grid, cranes…), tap places to see documents, notes, activities and permits, and pin uploads to exact spots. The blue dot is your GPS position. Tap **3D** for the massing model: each building stands at the level the schedule says is cast, the level being cast pulses orange, **↻** rotates the view. Pinning a document uses the 2D sheet.
- **Project:** Programme (KPIs, milestones, in-progress/late/critical, 2-week look-ahead), Procurement (deliveries, packages at risk, POs, MRs, stock), Safety (permits, rules, incidents, PPE), Regulations, Drawings register, Team (tap to call).
- **Docs:** all documents and open notes.

**Good questions to try**
- "What's late on Tower A and how does it affect topping out?" *(deep)*
- "Look-ahead for the next 2 weeks at the podium"
- "Which deliveries arrive tomorrow and where do they go?"
- "PPE and permits for hot work at the atrium — any active permits there?"
- "What does SBC 801 require for refuge floors, and are we compliant?"
- "Which procurement packages put the programme at risk?"
- "Who's the lifting supervisor? Call him." *(gives the number)*
- "Issue: edge protection gap Tower B L31 east face" *(logs it)*

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Agent says "offline answer" | No key set or both providers failing. Check `GET /api/llm` and `docker compose logs app`. The reply lists which provider failed and why. |
| `HTTP 404 … model` from a provider | The model name has been retired or is wrong. Update `LLM_ROUTE_*`. |
| Webhook verify fails in Meta | URL must be public **HTTPS**; `WHATSAPP_VERIFY_TOKEN` must match exactly; check `https://<domain>/api/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ok` returns `ok`. |
| WhatsApp messages get no reply | Is the `messages` field subscribed? Is the sender in `WHATSAPP_ALLOWED_NUMBERS` (no `+`)? Is the token still valid (use a System User token)? Is the app secret correct (a wrong one gives 401 in the logs)? |
| Replies stop after a day | You used the temporary 24 h token. Create the permanent token (§6.2). |
| Voice notes: "need OPENAI_API_KEY" | Transcription uses OpenAI. Add a key. |
| Map/drawing images on WhatsApp have no text | Install fonts (`fonts-dejavu-core`). The Docker image already includes them. |
| SAP: 401 / 403 | Check user, password and `sap-client`. A `CSRF token validation failed` error on PR creation means a proxy is stripping cookies. Allow `set-cookie` through. |
| SAP PR rejected "field … is required" | Add the field to `SAP_PR_DEFAULTS`. The MR is kept as *Draft* in the agent. |
| Oracle returns 0 POs | Check `ORACLE_PO_QUERY` and the user's procurement business-unit access. Test the URL in a browser. |
| Uploads fail on large files | Own server: raise the proxy body limit (Caddyfile has 50 MB). Vercel: connect a Blob store — without it Vercel caps uploads at 4.5 MB. |
| Yellow "Demo storage" banner on Vercel | No Blob store connected (§5 A2). Connect it and redeploy. |
| Vercel: webhooks get 401 / HTML login page | Deployment Protection is on for production — turn it off for production (keep `APP_PASSWORD`). |
| Vercel: answer cut short "ran out of time" | Ask narrower questions, or on Pro raise `maxDuration` + `AGENT_DEADLINE_MS`. |
| Vercel: Blob errors mentioning access | Recreate the Blob store with **Private** access. |
| GPS dot not showing | Allow location permission; the site must be served over HTTPS; check the `GEO` origin. |

---

## 12. Environment reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_PASSWORD` / `APP_USER` | — | Browser login for the web app and API |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | AI providers (one or both) |
| `LLM_MODE` | `auto` | `auto` / `anthropic` / `openai` (preferred provider) |
| `LLM_FALLBACK` | `true` | Switch provider on failure |
| `LLM_ROUTE_FAST` / `_MAIN` / `_DEEP` | see §4.2 | Ordered `provider:model` lists per tier |
| `OPENAI_REASONING_EFFORT` | `low` | For GPT-5 / o-series models |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Voice-note transcription |
| `LLM_TIMEOUT_MS` | `60000` | Per-call timeout before fallback |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` | official APIs | Gateways or proxies |
| `WHATSAPP_TOKEN` | — | System User permanent token |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Sending number id |
| `WHATSAPP_APP_SECRET` | — | Webhook signature check (required in production) |
| `WHATSAPP_VERIFY_TOKEN` | — | Webhook verification handshake |
| `WHATSAPP_ALLOWED_NUMBERS` | — | `9665…:Name,…` allow-list |
| `WHATSAPP_GRAPH_VERSION` | `v23.0` | Graph API version |
| `WHATSAPP_SHOW_MODEL` | `false` | Show model/tier under WhatsApp replies |
| `PROCUREMENT_PROVIDER` | `demo` | `demo` / `sap` / `oracle` / `rest` |
| `PROCUREMENT_SYNC_MINUTES` | `15` | Auto re-sync age |
| `PROCUREMENT_WEBHOOK_SECRET` | — | Bearer secret: push, sync and MR polling |
| `SAP_*` | — | §7.1 |
| `ORACLE_*` | — | §7.2 |
| `PROCUREMENT_REST_*` | — | §7.3 |
| `IMPORT_SECRET` | — | Bearer secret for CSV imports |
| `KINAN_DATA_DIR` | `./data` (`/data` in Docker) | Database, uploads, WhatsApp sessions (own server) |
| `BLOB_READ_WRITE_TOKEN` | set by Vercel | Use Vercel Blob (private) for all data |
| `BLOB_PREFIX` | `kinan/` | Folder inside the Blob store |
| `CRON_SECRET` | — | Vercel Cron auth for scheduled ERP sync |
| `AGENT_DEADLINE_MS` | 50000 on Vercel, 110000 elsewhere | Time budget per answer |
| `DOMAIN` | — | Used by docker-compose/Caddy for HTTPS |

*For testing only — never in production:* `WHATSAPP_SKIP_SIGNATURE`, `WHATSAPP_ALLOW_ALL`, `WHATSAPP_TEST_SYNC`, `WHATSAPP_GRAPH_BASE`.
