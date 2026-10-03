# Kinan Site Agent — Vercel Setup Guide

A step-by-step guide that takes the zip to a live app on Vercel, with WhatsApp, the AI providers and (optionally) the purchasing system connected.

**Time:** about 20 minutes for the app, plus about 1 hour for WhatsApp.
**You need:** a Vercel account, a GitHub account (recommended), an Anthropic and/or OpenAI API key, and a Meta Business account for WhatsApp.

> The full reference (Docker option, SAP/Oracle detail, data import, security) is in **SETUP.md**. This guide covers the Vercel path end to end.

---

## Step 1 — Put the code on Vercel

**Option A: GitHub (recommended — every push redeploys)**
1. Unzip `kinan-site-agent-vercel.zip`. You get a folder `kinan-site-agent/`.
2. Create a new **private** GitHub repository and push the *contents* of that folder:
   ```bash
   cd kinan-site-agent
   git init && git add -A && git commit -m "Kinan Site Agent"
   git branch -M main
   git remote add origin https://github.com/<you>/kinan-site-agent.git
   git push -u origin main
   ```
3. Go to **vercel.com → Add New… → Project → Import** your repository.
4. Leave the defaults: Framework preset **Next.js**, Build command `next build`, Root directory `./`. (If you pushed the parent folder instead, set **Root Directory** to `kinan-site-agent`.)
5. Click **Deploy**. The first build takes about 1–2 minutes. It works with no keys at all; the AI runs in offline mode until keys are added.

**Option B: Vercel CLI (no GitHub)**
```bash
npm i -g vercel
cd kinan-site-agent
vercel          # log in, create the project, deploy a preview
vercel --prod   # deploy to production
```

---

## Step 2 — Connect storage (required to keep data)

Vercel functions have no permanent disk. The app keeps its database, uploads and WhatsApp sessions in **Vercel Blob**.

1. Open the project → **Storage** tab → **Create** → **Blob**.
2. Name it `kinan-site-agent`. Choose **Private** access if asked.
3. **Connect** it to the project, ticking Production, Preview and Development.
   Vercel adds `BLOB_READ_WRITE_TOKEN` automatically. You don't copy it anywhere.

> If you skip this step, the app still works, but notes and uploads disappear whenever Vercel recycles the function. It shows a yellow **"Demo storage"** banner until Blob is connected.

---

## Step 3 — Add environment variables

Project → **Settings → Environment Variables**. Add each one for **Production** (and Preview if you use previews).

### Minimum to get started
| Variable | Value | Where to get it |
|---|---|---|
| `APP_PASSWORD` | a long random password | you choose. This is the login for the web app. |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | https://platform.claude.com/settings/keys |
| `OPENAI_API_KEY` | `sk-…` | https://platform.openai.com/api-keys (also needed for WhatsApp voice notes) |

One AI key is enough. With both, you get routing and automatic fallback between them.

### WhatsApp (Step 5)
| Variable | Value |
|---|---|
| `WHATSAPP_TOKEN` | permanent System User token |
| `WHATSAPP_PHONE_NUMBER_ID` | from WhatsApp → API Setup |
| `WHATSAPP_APP_SECRET` | App settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | any random string you invent |
| `WHATSAPP_ALLOWED_NUMBERS` | `9665XXXXXXXX:Development Manager,9665YYYYYYYY:HSE Manager` |

### Optional
| Variable | Purpose |
|---|---|
| `LLM_MODE` | `auto` (default), `anthropic` or `openai` to prefer one provider |
| `LLM_ROUTE_FAST` / `LLM_ROUTE_MAIN` / `LLM_ROUTE_DEEP` | override the models per tier, e.g. `anthropic:claude-sonnet-5-5,openai:gpt-5` |
| `WHATSAPP_SHOW_MODEL` | `true` adds "provider · model · tier" under WhatsApp replies |
| `IMPORT_SECRET` | enables CSV import of the P6 programme / drawing register |
| `PROCUREMENT_PROVIDER` + `SAP_*` / `ORACLE_*` / `PROCUREMENT_REST_*` + `PROCUREMENT_WEBHOOK_SECRET` | purchasing system (Step 6) |
| `CRON_SECRET` | scheduled ERP sync (Step 6) |
| `APP_USER` | also require this username at login |
| `NEXT_PUBLIC_BRAND_LOGO` | URL of your official logo (e.g. `/kinan-logo.svg` after adding the file to `public/`); replaces the orange chevron in the header |

**After changing variables:** go to **Deployments → ⋯ (latest) → Redeploy**. Variables only apply to new deployments.

---

## Step 4 — Check it works

1. Open `https://<project>.vercel.app` on your phone and log in with `APP_PASSWORD`. The username can be anything unless `APP_USER` is set.
2. Open `https://<project>.vercel.app/api/llm` and check:
   - `"providers"` shows `anthropic: true` and/or `openai: true`
   - `"storage": "blob"`
3. The app shows the site map, project data and documents. There is no chat screen: the AI agent is used through WhatsApp (Step 5).
4. Add it to your home screen: Safari → Share → *Add to Home Screen* (iOS), or Chrome → ⋮ → *Add to Home screen* (Android). Allow **location** and **microphone** when asked.

---

## Step 5 — Connect WhatsApp (Meta WhatsApp Cloud API)

The app talks to Meta's official API directly. No Twilio or other middleman is needed, and no extra per-message fees apply.

### 5.1 Create the Meta app
1. **business.facebook.com** → create or select the Kinan business portfolio.
2. **developers.facebook.com → My Apps → Create app**. Pick the WhatsApp use case (or type *Business*) and link the Kinan portfolio.
3. In the app, **add the WhatsApp product**. Meta creates a WhatsApp Business Account and a **test number**.
4. **WhatsApp → API Setup**: copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
5. **App settings → Basic**: click **Show** next to the app secret → `WHATSAPP_APP_SECRET`.

### 5.2 Permanent access token
The token on the API Setup page expires after about 24 h, so don't use it in production.
1. **business.facebook.com → Settings → Users → System users → Add**. Name it `siteagent`, role **Admin**.
2. **Assign assets**: your **app** and your **WhatsApp account** (full control).
3. **Generate new token**: choose the app, expiry **Never**, and the permissions `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy the token → `WHATSAPP_TOKEN`.

### 5.3 Set the variables and redeploy
Add the five `WHATSAPP_*` variables from Step 3, then **Redeploy**.
`WHATSAPP_ALLOWED_NUMBERS` uses international format without `+` or spaces. The name after `:` is the author shown on that person's notes and uploads. Anyone not listed gets a polite refusal.

### 5.4 Register the webhook
1. Meta app → **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://<project>.vercel.app/api/whatsapp`
   - **Verify token:** exactly the same string as `WHATSAPP_VERIFY_TOKEN`
   - **Verify and save**. You should see a green tick.
2. **Webhook fields → messages → Subscribe**.

> If verification fails: open `https://<project>.vercel.app/api/whatsapp?hub.mode=subscribe&hub.verify_token=<your token>&hub.challenge=ok`. It should print `ok`. If you see a Vercel login page, turn off Deployment Protection for production (Step 7).

### 5.5 Test
1. **API Setup → To**: add your mobile as a test recipient and confirm the code.
2. Send **`help`** to the test number. You should get the command list.
3. Try these:
   - *What's late on Tower A?*
   - a **voice note**
   - share your **location** (you get a "you are here" map)
   - a **photo** with caption *upload to Tower A L12*
   - *Show me the Tower A L12 slab drawing* (you get an image)

### 5.6 Go live with a real number
1. **WhatsApp Manager → Phone numbers → Add phone number**. Use a number **not** active on the WhatsApp app (a new SIM or landline), verify it by SMS or voice, and set a display name (Meta reviews it).
2. Complete **Business verification** (Business Settings → Security Centre) for higher limits.
3. App dashboard → set **App mode: Live**. This needs a privacy-policy URL.
4. Update `WHATSAPP_PHONE_NUMBER_ID` to the real number's ID → **Redeploy**.

**Good to know:** the bot replies to people who message it, and free-form replies are allowed for 24 h after their last message. Proactive messages, such as a daily brief, need Meta-approved templates. Meta charges per conversation; check current WhatsApp Business pricing.

> **Why not Twilio?** Twilio resells this same Meta API with a per-message markup. It's only worth it if your company already standardises on Twilio. A Twilio adapter can be added if required.

---

## Step 6 — Purchasing system (optional)

Pick one way to feed live POs and deliveries. Until then, the demo procurement data is used.

| System | Variables |
|---|---|
| **SAP S/4HANA** | `PROCUREMENT_PROVIDER=sap`, `SAP_BASE_URL`, `SAP_USERNAME`, `SAP_PASSWORD` (or `SAP_BEARER_TOKEN`), optional `SAP_CLIENT`, `SAP_PO_FILTER`. To create purchase requisitions from site: `SAP_PR_ENABLED=true` + `SAP_PR_DEFAULTS` |
| **Oracle Fusion** | `PROCUREMENT_PROVIDER=oracle`, `ORACLE_BASE_URL`, `ORACLE_USERNAME`, `ORACLE_PASSWORD`, optional `ORACLE_PO_QUERY` |
| **Any REST API** | `PROCUREMENT_PROVIDER=rest`, `PROCUREMENT_REST_URL`, `PROCUREMENT_REST_TOKEN`, `PROCUREMENT_REST_MAP` (field mapping) |
| **Push from any tool** (Power Automate, n8n, SAP CPI…) | `PROCUREMENT_WEBHOOK_SECRET`, then POST to `/api/integrations/procurement` (see `samples/procurement-webhook.json`) |

The agent re-syncs automatically when data is older than 15 minutes (`PROCUREMENT_SYNC_MINUTES`).
**Scheduled sync** (optional): set `CRON_SECRET` and add `vercel.json`:
```json
{ "crons": [{ "path": "/api/integrations/procurement?action=sync", "schedule": "0 5 * * *" }] }
```
Hobby plans allow daily crons only.

Details for each system are in **SETUP.md §7**.

---

## Step 7 — Recommended Vercel settings

| Setting | Where | Recommendation |
|---|---|---|
| **Deployment Protection** | Settings → Deployment Protection | Keep it for previews. Turn it **off for Production**, because WhatsApp and ERP webhooks must reach it (they authenticate with signatures and secrets; the UI uses `APP_PASSWORD`). |
| **Function Region** | Settings → Functions | The region closest to Saudi Arabia that your plan offers |
| **Custom domain** | Settings → Domains | e.g. `siteagent.kinan.example`. Then update the WhatsApp callback URL. |
| **Spend limits** | Anthropic and OpenAI consoles | Set monthly limits |
| **Time limits** | code | Answers are capped at about 50 s (`maxDuration` 60 s), which works on every plan. On Pro you can raise `maxDuration` in `app/api/whatsapp/route.ts`, and set `AGENT_DEADLINE_MS`. |

---

## Step 8 — Load your real project data (optional)

- **Programme (Primavera P6 / MS Project CSV):**
  ```bash
  curl -X POST "https://<project>.vercel.app/api/import?type=schedule" \
    -H "Authorization: Bearer $IMPORT_SECRET" -H "content-type: text/csv" --data-binary @programme.csv
  ```
- **Drawing register CSV:** same command with `?type=register`. Column examples are in `samples/`.
- **Documents and photos:** upload in the app (Site map → tap a place → *Upload here*) or send them on WhatsApp. Files over 4 MB upload straight to Blob storage (up to 200 MB).
- **Site plan and GPS:** edit `lib/siteplan.ts` (see SETUP.md §8.4), commit, and push.

---

## Go-live checklist

- [ ] Blob store connected, and `/api/llm` shows `"storage": "blob"`
- [ ] `APP_PASSWORD` set (long and random)
- [ ] At least one AI key; spend limits set
- [ ] WhatsApp: permanent token, app secret set, only named staff in `WHATSAPP_ALLOWED_NUMBERS`
- [ ] Production Deployment Protection off (webhooks work); previews protected
- [ ] Test-only variables **not** set: `WHATSAPP_SKIP_SIGNATURE`, `WHATSAPP_ALLOW_ALL`, `WHATSAPP_TEST_SYNC`, `WHATSAPP_GRAPH_BASE`
- [ ] Data-protection assessment done: questions, documents and voice notes are processed by Anthropic and OpenAI outside KSA
- [ ] Demo data replaced with real project data

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails on Vercel | Check that the Root Directory points at the folder containing `package.json`. Node 20+ is used automatically. |
| Yellow "Demo storage" banner | Connect the Blob store (Step 2), then redeploy |
| Agent answers "offline" | No AI key, or both providers failing. Check `/api/llm`, and Vercel → Logs for the error. |
| `HTTP 404 … model` in logs | A model name was retired. Set `LLM_ROUTE_*` to current model names. |
| WhatsApp webhook won't verify | Verify token mismatch, or Deployment Protection is on for production |
| No replies on WhatsApp | `messages` field not subscribed; sender not in `WHATSAPP_ALLOWED_NUMBERS`; expired temporary token; wrong app secret (401 in logs) |
| Voice notes not understood | Add `OPENAI_API_KEY` (transcription) |
| "Ran out of time" replies | Ask narrower questions, or raise limits on a Pro plan (Step 7) |
| Blob errors mentioning access | Recreate the Blob store with **Private** access and reconnect it |
