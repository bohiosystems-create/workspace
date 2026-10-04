# Setup guide · Option 2: Read-only agent

**What it is:** the agent reads EstateMaster exports and never writes to EstateMaster. Approved changes become tasks; an analyst types them into EstateMaster and uploads the new export.

**Who does what:** IT or you (steps 1–3, about 30 minutes) · analyst (step 4, about 1 minute per change).

## 1. What you need
- A Vercel account (free is fine for a demo).
- An Anthropic and/or OpenAI API key (optional: without one, the rules engine still works; AI commentary is off).
- Optional, for live Outlook: a Microsoft Entra ID app (see step 3).
- An analyst with EstateMaster and Excel.

## 2. Deploy
1. Unzip `bohio-option2-readonly.zip`.
2. In a terminal, inside the folder: `npm i -g vercel`, then `vercel`, then `vercel --prod`.
   (Or push the folder to GitHub and import it at vercel.com/new: framework *Other*, no build command.)
3. In Vercel → Settings → Environment Variables add:

| Variable | Why |
|---|---|
| `ANTHROPIC_API_KEY` | Claude |
| `OPENAI_API_KEY` | OpenAI |
| `DEMO_PASSWORD` | Recommended: an access code before anyone can spend your AI credits |
| `ELEVENLABS_API_KEY` | Optional: ElevenLabs voice for ▶ Play and Read (add `ELEVENLABS_VOICE_ID` to pick a voice) |

4. Redeploy. Open the site: the top bar should say **Option 2 · Read-only agent**.

## 3. Live Outlook (optional)
Without it the demo uses a dummy inbox.
1. Entra ID → App registrations → New. Add **Microsoft Graph → Mail.Read (application)** and grant admin consent.
2. Create a client secret.
3. Add to Vercel: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `OUTLOOK_MAILBOX` (e.g. al-narjis@kinan.com), `OUTLOOK_FOLDER` (folder name, default Inbox). An AI key is also required.
4. Redeploy. The Outlook tab shows "Live mailbox". Scans run at 06:00, 10:00, 14:00 and 18:00 Riyadh while the app is open.
5. Recommended: restrict the app to that one mailbox with an Exchange application access policy.

## 4. Daily use (the analyst's one minute)
1. **Get the first export.** In EstateMaster open the model → Office Links → Excel → export the Summary / returns sheet. On the **EstateMaster** tab press **Upload export**.
2. Someone asks the agent for a change (or Outlook raises one). It appears under **Approvals** with no return figure.
3. A person approves it. It becomes a task on the **EstateMaster** tab with the exact values to enter.
4. Analyst: open the model, enter the values, recalculate, export, press **Upload export** on the task.
5. The returns tiles now show EstateMaster's new figures. Use **Compare exports** to see what moved.

**What the reader looks for in the export** (by row label, any sheet): Equity/Levered IRR, Project/Unlevered IRR, Profit on cost or Development margin, Net profit, Total development cost, Gross revenue, Equity multiple, Peak debt. If a label is missing the tile shows "not in export". Percentages can be 0.187 or 18.7%.

## Reports and ▶ Play
Reports → pick a report → **▶ Play** runs it as a full-screen presentation in KINAN's style (cover, dividers, headline
figures, gauges, cost and funding donuts, cash flow by year, stress bars against the hurdle, headroom, market check,
closing page), with captions and narration; ← → move, Space pauses, F is fullscreen, Esc closes. **🔊 Read** plays the report document itself,
section by section, with the same narration. Narration uses ElevenLabs when `ELEVENLABS_API_KEY` is set in Vercel (optional
`ELEVENLABS_VOICE_ID`), otherwise the browser's own voice.
**PowerPoint** downloads the same deck with native, editable charts and the narration in the speaker notes.
**HTML** and **Print / PDF** give the report document (logo band, orange cover, charts, closing page).
Every figure shown as EstateMaster's comes from an export; charts built on the agent's model say "agent's estimate".

## 5. Test it (5 minutes)
- [ ] Tab bar shows Option 2; strip says "Read-only".
- [ ] Ask "what if sale price drops 10%": a change request, no IRR.
- [ ] Approve it: a task appears, tiles unchanged.
- [ ] Upload a real export: tiles show its figures; the export is listed with its file name.
- [ ] Ask "status": the answer quotes the export id.

## 6. Limits to tell KINAN
- The agent cannot calculate the effect of a change or run scenarios; EstateMaster does, after the analyst.
- Figures are as old as the last export.
- Demo memory is stored in the browser; production keeps it in SQL Server.
- The demo takes uploads; watching a SharePoint folder for exports is a production step, not built in the demo.
- "Mark done (simulated export)" is a demo shortcut and is labelled simulated.
