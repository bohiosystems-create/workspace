# Bohio agent on the Excel model · Option 2: read-only agent (demo)

The agent reads ARGUS the workbook's exports and never writes to the Excel model. Every change it suggests
becomes a change request; once a person approves it, an analyst enters the values in the workbook and
uploads the new export (Office Links → Excel). Every figure shown as the workbook's comes from an export.

**Can:** read every input and output from exports · answer questions and compare exports · check assumptions
against market data, zoning, Outlook and actuals · propose changes for approval · design stress scenarios for an
analyst to run · draft reports from the latest version · keep a memory of every change, task and export.

**Can't:** write to the Excel model · calculate the effect of a change (the Excel model does, after the analyst enters it)
· run scenarios in the workbook · create or promote models by itself · show figures newer than the last export.

## Try it
1. Ask "what if sale price drops 10%" → a change request, no figure.
2. Approve it → a task on the **the Excel model** tab with the exact values to enter.
3. Press **Mark done (simulated export)**, or **Upload export** with a real Office Links export.
   The returns tiles now show that export.

## Deploy to Vercel
Run `vercel` in this folder (or import it from Git, framework *Other*, no build command).
Environment variables: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` for the AI routes, `DEMO_PASSWORD` (recommended),
`ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`) for ElevenLabs narration in ▶ Play and Read (the browser's own voice otherwise),
`CRON_SECRET`, `ALERT_TO`, `REPORT_TO`, `EXPORTS_FOLDER` for the twice-daily email scan with alerts and the morning the Excel model report (see SETUP.md),
and for live Outlook the Microsoft Graph variables listed in the main README. No runner variables: this option has no runner.

All data is dummy data. Browser memory is kept per option.

See `SETUP.md` for the step-by-step setup guide.
