# Deploy on Vercel — Bohio site + Kinan demos (marketing agent and EstateMaster agent)

Same package as before, with two more demos and the EstateMaster agent's server functions.

## What's in it
- `/` the Bohio site; `/demos` the demo portal (sign-in, demo list).
- `/demos/kinan/` (or `/kinan`): Kinan marketing agent — static, no keys.
- `/demos/kinan-estatemaster/` (or `/estatemaster`): Kinan AI agent on EstateMaster, Option 2 (read-only).
- `/demos/kinan-estatemaster-analyst/` (or `/estatemaster-analyst`): Option 3 (analyst in the loop).
- `api/` + `package.json`: the EstateMaster agent's server functions (AI proxy, ElevenLabs voice, Outlook scan,
  mail, scheduled jobs). They run as Vercel functions in this same project; `vercel.json` carries their time limits
  and the two daily crons. Without the keys below the demos still work, with the rules engine and the browser voice.

## Deploy
1. Unzip. `vercel.com` → Add New → Project → import the Git repo or drag the `bohio-website` folder in.
   Framework preset **Other**, build command empty, output directory `.` (Vercel installs `package.json` for the functions).
   CLI alternative: `cd bohio-website && npx vercel --prod`.
2. Settings → Domains → `bohiotech.com` (already attached if you redeploy the existing project: just push or drag the new folder).
3. Settings → Environment Variables (Production), then redeploy:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (routing, report designer, narration script) |
| `OPENAI_API_KEY` | OpenAI failover |
| `DEMO_PASSWORD` | optional access code the demo asks for before spending AI/voice credits |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` | narration (see `docs/VOICE_elevenlabs.md` in the agent repo) |
| `CRON_SECRET` | any long random string; Vercel sends it with the scheduled jobs |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `OUTLOOK_MAILBOX`, `OUTLOOK_FOLDER` | live Outlook scan (optional; simulated otherwise) |
| `ALERT_TO`, `REPORT_TO`, `MAIL_ALLOWED_DOMAINS`, `APP_URL` | alert and report emails (internal domains only); `APP_URL` = `https://bohiotech.com/demos/kinan-estatemaster/` |

4. Check: open `https://bohiotech.com/demos/kinan-estatemaster/?debug` → Diagnostics shows "/api/llm reachable; server keys found" when the keys are set.

## Notes
- `/demos/...` pages carry `noindex`; the portal sign-in only hides the list, it is not access control (set `DEMO_PASSWORD` for the AI and voice calls).
- The crons run at 07:00 and 15:00 Riyadh (04:00 and 12:00 UTC) on the Vercel project; Hobby plans allow daily crons only, Pro allows both.
- To update a demo later: replace `demos/kinan-estatemaster/index.html` (and `api/`) from the agent's `dist/option2-readonly` build and redeploy.
