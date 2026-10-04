# Bohio agent on EstateMaster · Option 3: analyst in the loop (demo)

The agent writes approved values into the KINAN control workbook that the EstateMaster model is linked to
(Links to Excel Files). An analyst then opens the model, presses **Refresh Values**, recalculates and exports
(about a minute). The agent reads EstateMaster's figures from that export. It never touches EstateMaster.

**Can:** everything in Option 2 · write approved values to the control workbook (production: SharePoint via
Microsoft Graph; demo: download) · batch approved changes into one refresh task · prepare stress scenarios as
control-workbook value sets · set up a new model from a KINAN template and a filled workbook.

**Can't:** press buttons in EstateMaster · run unattended (results wait for the analyst) · change inputs not linked
to the workbook (they become manual steps in the task) · promote to the live model by itself.

## Try it
1. Ask "what if construction cost rises 8%" → a change request, no figure.
2. Approve it → a refresh task on the **EstateMaster** tab. **Download control workbook** gives the workbook
   with the approved values.
3. Press **Mark done (simulated export)**, or **Upload export** with a real Office Links export.

## Deploy to Vercel
Run `vercel` in this folder (or import it from Git, framework *Other*, no build command).
Environment variables: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` for the AI routes, `DEMO_PASSWORD` (recommended),
`ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`) for ElevenLabs narration in ▶ Play and Read (the browser's own voice otherwise),
and for live Outlook the Microsoft Graph variables listed in the main README. No runner variables: this option has no runner.

All data is dummy data. Browser memory is kept per option.

`setup/`: control workbook template, Copilot setup instructions and the checker (`py setup/control_check.py <file>`); not deployed.

See `SETUP.md` for the step-by-step setup guide.
