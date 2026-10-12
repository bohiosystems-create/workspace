# Put the mock API demo on bohiotech.com

The app is ready in the `bohio-demos` repo, folder `kinan-estatemaster-api/`. It goes live as its own Vercel
project at **https://kinan-estatemaster-api.bohiotech.com**, behind the same Bohio sign-in as the other demos,
and then appears in the portal at **bohiotech.com/demo**. About 15 minutes.

## 1. Create the Vercel project
1. vercel.com → team **BOHIO** → **Add New → Project**.
2. Import the GitHub repo **bohio-demos**.
3. **Project Name:** `kinan-estatemaster-api`
4. **Root Directory:** click *Edit* and choose `kinan-estatemaster-api`.
5. **Framework Preset:** *Other*. Leave Build Command and Output Directory empty.
6. Do not deploy yet: open *Environment Variables* first (step 2), or deploy and redeploy after step 2.

## 2. Environment variables
Fastest: open the existing **kinan-estatemaster** project → Settings → Environment Variables and copy the same
values. Set them for **Production** (and Preview if you want previews to work).

Required:

| Variable | Value |
|---|---|
| `DEMO_APP_ID` | `kinan-estatemaster-api` (this one is different from Option 2) |
| `DEMO_SESSION_SECRET` | the shared value used by bohiotech.com and the other demos (link the shared variable) |
| `ANTHROPIC_API_KEY` | same as Option 2 (needs credit on the Claude Console) |
| `OPENAI_API_KEY` | same as Option 2 |
| `CRON_SECRET` | any long random string (Vercel sends it to the scheduled jobs) |

Same as Option 2, if you want voice, Outlook and the emailed daily report:

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_VOICE_ID_AR` | play-mode voice (English and Arabic) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `OUTLOOK_MAILBOX`, `OUTLOOK_FOLDER` | Outlook scan and sending mail |
| `EXPORTS_FOLDER` | SharePoint folder with the EstateMaster exports |
| `REPORT_TO`, `MAIL_ALLOWED_DOMAINS`, `ALERT_TO` | daily report and alert recipients (internal domains only) |
| `APP_URL` | `https://kinan-estatemaster-api.bohiotech.com/` |

Leave `DEMO_PASSWORD` unset: the Bohio sign-in protects the app.

## 3. Deploy
Click **Deploy** (or Deployments → ⋯ → Redeploy after adding the variables).
The project needs the **Pro** plan: `vercel.json` sets up to 800 s per function and a cron every 15 minutes.

## 4. Domain
1. Project → Settings → **Domains** → add `kinan-estatemaster-api.bohiotech.com`.
2. Vercel shows a **CNAME** record (name `kinan-estatemaster-api`, value like `cname.vercel-dns.com`).
3. Hostinger → Domains → bohiotech.com → **DNS / Nameservers** → add that CNAME record exactly as shown.
4. Wait until Vercel shows the domain as *Valid Configuration* (usually a few minutes).

## 5. Show it in the portal
In the `bohiotech-site` repo, file `bohiotech-site/api/_config.js`, add this entry to `demos`, then commit and push
(Vercel redeploys bohiotech.com in about a minute):

```js
  {
    id: 'kinan-estatemaster-api',
    title: 'AI agent on EstateMaster (bespoke integration, simulated API)',
    client: 'Kinan',
    url: 'https://kinan-estatemaster-api.bohiotech.com/',
    meta: 'Live app',
  },
```

If a client login should see it, add `'kinan-estatemaster-api'` to that client's `demos` list in the same file.
The admin login sees every demo.

## 6. Check
1. Sign in at **bohiotech.com/demo** → the new card is listed → open it. It must open inside the portal without
   asking to sign in again.
2. Open `https://kinan-estatemaster-api.bohiotech.com/?debug` → Diagnostics shows the AI proxy reachable and
   server keys found.
3. Ask the chat "what happens if sale price drops 10%?": the answer comes from Claude and OpenAI (badge "AI ·"),
   not "Rules engine · no AI".
4. Settings → Integration shows "Bespoke integration option (simulated API)".

## If something is wrong
- **Sent back to the sign-in page:** `DEMO_APP_ID` is not exactly `kinan-estatemaster-api`, or
  `DEMO_SESSION_SECRET` differs from the one on bohiotech.com.
- **"Rules engine · no AI" on every answer:** the AI keys are missing on this project, or the Claude account has
  no credit (the chat says "Claude is out of API credit").
- **Domain stays invalid:** the CNAME in Hostinger has a typo or an older A record for the same name still exists.
- **Updating it later:** nothing to do. Every push to `bohio-demos` main redeploys this project automatically, like
  the other demos.
