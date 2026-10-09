# Bohio agent on EstateMaster · EstateMaster API option (demo)

Same app as Option 2, but EstateMaster is reached through an API (simulated in this demo). The agent reads
every input and output through the API, with no exports to upload. After a person approves a change request, it
writes the values through the API (PATCH inputs), EstateMaster recalculates (POST calculate) and the agent reads
EstateMaster's figures back (GET outputs). Nothing is written before approval. Every call is logged with its
request and response on the Financial modelling tab.

**Can:** everything in Option 2 · read through the API at any time · write approved changes and read the
recalculated figures back in seconds · run stress scenarios on a sandbox copy through the API.

**Can't:** write before a person approves · calculate the official figures (EstateMaster does) · use endpoints
the real EstateMaster API does not offer (the API here is simulated).

## Try it
1. Ask "what if sale price drops 10%" → a change request, no figure.
2. Approve it in the Daily feed → the agent writes it through the API and EstateMaster's new figures appear.
3. Open Financial modelling → EstateMaster API for the call log (click a call for its request and response).

## Deploy to Vercel
Run `vercel` in this folder (or import it from Git, framework *Other*, no build command).
Environment variables: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` for the AI routes, `DEMO_PASSWORD` (recommended),
`ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`) for ElevenLabs narration in ▶ Play and Read (the browser's own voice otherwise),
`CRON_SECRET`, `ALERT_TO`, `REPORT_TO`, `EXPORTS_FOLDER` for the twice-daily email scan with alerts and the morning EstateMaster report (see SETUP.md),
and for live Outlook the Microsoft Graph variables listed in the main README. No runner variables: this option has no runner.

All data is dummy data. Browser memory is kept per option.

See `SETUP.md` for the step-by-step setup guide.
