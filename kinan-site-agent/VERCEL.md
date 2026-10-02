# Deploy Kinan Site Agent on Vercel — 10-minute checklist

1. **Code → Vercel.** Push this folder to a GitHub repo → vercel.com → *Add New… → Project → Import*.
   (Or: `npm i -g vercel && vercel && vercel --prod` from this folder.) Preset: **Next.js**, defaults.
2. **Storage.** Project → *Storage* → *Create* → **Blob** (Private) → *Connect* to the project.
   This adds `BLOB_READ_WRITE_TOKEN`. Without it data is temporary (yellow banner in the app).
3. **Environment variables** (Settings → Environment Variables), then **Redeploy**:
   - `APP_PASSWORD` — login for the web app
   - `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` — the AI (routing + fallback built in)
   - WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ALLOWED_NUMBERS`
   - Purchasing (optional): `PROCUREMENT_PROVIDER` + `SAP_*` / `ORACLE_*` / `PROCUREMENT_REST_*`, `PROCUREMENT_WEBHOOK_SECRET`
   - Imports (optional): `IMPORT_SECRET`
4. **Open** `https://<project>.vercel.app`, log in, tap **⚙ AI** → providers connected, *Storage: Vercel Blob (private)*.
5. **WhatsApp webhook** (Meta app → WhatsApp → Configuration): `https://<project>.vercel.app/api/whatsapp`
   + your `WHATSAPP_VERIFY_TOKEN` → subscribe to **messages**. Send `help` from an allowed number.
6. Keep **Deployment Protection off for Production** (webhooks must reach it; the UI is protected by `APP_PASSWORD`).

Full guide (WhatsApp step-by-step, SAP/Oracle, data import, security): **SETUP.md**.
