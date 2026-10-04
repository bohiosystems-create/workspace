# Setup guide · Option 3: Analyst in the loop

**What it is:** after approval the agent writes the values into the KINAN control workbook that EstateMaster is linked to. An analyst presses **Refresh Values** in EstateMaster, recalculates and exports (about a minute). The agent reads the export. It never touches EstateMaster.

**Who does what:** IT or you (parts A and B, about 1 hour) · analyst with Copilot (part C, once per model) · analyst (daily, about a minute).

## A. Deploy the app
Same as Option 2, section 2 (and 3 for live Outlook), using `bohio-option3-analyst.zip`. The top bar should say **Option 3 · Analyst in the loop**. No runner variables are needed.

## B. Prepare the control workbook (once per model)
Files are in the zip's `setup/` folder.
1. Copy `KINAN_control_workbook_template.xlsx` and name it `<Project>_control.xlsx`.
2. Export the model's Input sheets from EstateMaster (Office Links → Excel).
3. Open the control workbook in Excel and use Copilot with the instructions in `copilot_setup_agent.md` (paste as the first message). It fills **Inputs** (the 33 core lines, fixed rows) and **Lines** (every other assumption, no limit) and logs matches on **Mapping**.
4. The analyst checks every line against EstateMaster, puts **Y** in column H for each line they agree with and **N/A** for lines the project does not use. Check the totals against the EstateMaster Summary.
5. Run the checker: `py setup/control_check.py <Project>_control.xlsx` (Python from python.org). Fix every error, read every warning. Goal: "READY TO CONNECT".

## C. Link EstateMaster to the workbook (once per model)
1. Open the model in EstateMaster → **Office Links → Links to Excel Files → Add New Link** and pick the control workbook.
2. Link each input you want the agent to be able to change to its cell in column E (Inputs and Lines sheets). EstateMaster names linked inputs `Import_N`.
3. Put **Y** in column J (Lines sheet) for every line you linked. Unlinked lines are never written; they appear in the task as "type it in".
4. **Test the link:** change one value in the workbook, press **Refresh Values**, confirm the EstateMaster input changed, then put it back. Do this before relying on it.
5. Keep the workbook on SharePoint (production) so the agent can write it through Microsoft Graph. In the demo it is a download.

## D. Connect it to the app
1. App → **Model data → Connect control workbook** → pick the file.
2. Read the result (errors block; warnings need a person). It raises a change request.
3. A second person approves it. The app now knows the model's lines.

## E. Daily use
1. A person approves a change request. The agent adds it to the control workbook and creates (or extends) one **refresh task** on the **EstateMaster** tab.
   Demo: press **Download control workbook** to get the file with the approved values.
2. Analyst: open the model → Links to Excel Files → **Refresh Values** → type any unlinked values listed in the task → recalculate → export (Office Links → Excel).
3. Press **Upload export** on the task. The tiles update to EstateMaster's figures.
4. Several approved changes can be batched into one refresh.

## Reports and ▶ Play
Reports → pick a report → **▶ Play** runs it as a full-screen presentation in KINAN's style (cover, dividers, headline
figures, gauges, cost and funding donuts, cash flow by year, stress bars against the hurdle, headroom, market check,
closing page), with captions and narration; ← → move, Space pauses, F is fullscreen, Esc closes. **🔊 Read** plays the report document itself,
section by section, with the same narration. Narration uses ElevenLabs when `ELEVENLABS_API_KEY` is set in Vercel (optional
`ELEVENLABS_VOICE_ID`), otherwise the browser's own voice.
**PowerPoint** downloads the same deck with native, editable charts and the narration in the speaker notes.
**HTML** and **Print / PDF** give the report document (logo band, orange cover, charts, closing page).
Every figure shown as EstateMaster's comes from an export; charts built on the agent's model say "agent's estimate".

## Scheduled reports and email alerts
**In the app.** Reports → **Schedule** on any report: daily (Sun–Thu), weekly, monthly or quarterly at a Riyadh time, delivered by
email (internal addresses only), WhatsApp link or SharePoint folder. The app runs a report when it falls due and, if it was
closed at that time, sends one catch-up run when it next opens. **Run now** and **Send a test now** send immediately. Every run
is in **Run history** and every email in the **Outbox** (open it to see exactly what was sent). The chat also works:
"schedule the lender report every Monday at 9am to cfo@kinan.com.sa", "email the IC pack to board@kinan.com.sa",
"stop the monthly report".

**On the server (runs with the app closed).** Two Vercel cron jobs (already in `vercel.json`):
- 07:00 Riyadh: email scan + the morning EstateMaster report (Sun–Thu by default)
- 15:00 Riyadh: email scan

Each scan reads the project folder since the previous scan. When an email proposes or reports a change to any assumption
(prices, costs, fees, timing, financing terms, yields), the agent emails the alert list with the quote, the proposed value and
a link. It changes nothing: in the app each finding becomes a change request for approval. The app also shows it on the bell
and on WhatsApp, and does not send a second email when the server already did.

The morning report reads the two latest EstateMaster exports in the exports folder and emails EstateMaster's own figures,
the change since the previous export and the hurdle check.

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Any long random string. Vercel sends it to the jobs; calls without it are refused |
| `ALERT_TO` | Who gets assumption alerts (comma-separated, internal addresses) |
| `REPORT_TO` | Who gets the morning report |
| `REPORT_DAYS` | Optional, default `sun,mon,tue,wed,thu` |
| `EXPORTS_FOLDER` | Graph path of the folder where the analyst saves exports, e.g. `/sites/{site-id}/drive/root:/Bohio/Exports` |
| `MAIL_ALLOWED_DOMAINS` | Optional; default is the mailbox's own domain. Emails to any other domain are refused |
| `APP_URL` | Optional link in the emails (default: this deployment) |

Microsoft Entra app permissions (application, admin consent): **Mail.Read**, **Mail.Send**, **Files.Read.All**. Restrict the
app to the project mailbox with an Exchange application access policy.

Test without waiting: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron?run=scan,report&dry=1"`
returns what would be sent without sending it. Vercel's Hobby plan runs each cron once a day and may fire within the hour;
the two jobs together give the two daily scans, and each scan covers the time since the previous one, so a late run misses
nothing.

## F. Test it (10 minutes)
- [ ] Ask "what if construction cost rises 8%": a change request, no IRR.
- [ ] Approve it: a refresh task appears; the model is unchanged.
- [ ] Download the control workbook: the Inputs value is the approved one.
- [ ] Refresh in EstateMaster, export, upload: the tiles show the new IRR and **Compare exports** shows the move.
- [ ] A line with column J blank shows up in the task as a manual step.

## H. Tested against the DF_CS046 trial model (what to repeat on your PC)
Verified in the build with `trial/DF_CS046_control.xlsx` (30 financing lines, all 33 core lines N/A):
1. Model data → Connect control workbook → `DF_CS046_control.xlsx`: 0 errors, 30 model lines, a change request; approve it.
2. Ask: "set loan 1 interest rate to 8" → CR → approve → task on the EstateMaster tab.
   The task lists the line as "type it in" because column J is N (not linked yet). Link it in EstateMaster, put Y in J, reconnect, and it becomes a Refresh Values step instead.
3. Download control workbook → the file is `DF_CS046_control.xlsx` with L0007 = 8, the other 29 lines unchanged, core lines still N/A. Point EstateMaster's link at this file (same name, same cells).
4. In EstateMaster: Refresh Values → recalculate → Office Links → Excel (include the Summary sheet) → Upload export on the task.
   The reader finds, by row label: Equity/Levered/Geared IRR, Project/Unlevered IRR, Development margin or Profit on cost, Net development profit, Total development cost, Total revenue, Peak debt, Equity multiple.
5. The tiles, "status" in the chat and the reports now show that export; Reports → ▶ Play presents it.
If a label in your export is not found, the tile says "not in export": send me the export and I will add the label.

## G. Limits to tell KINAN
- The analyst still presses Refresh Values and Export: no unattended runs, results wait for them.
- Only linked inputs flow automatically; every other input is a manual step.
- Promotion to the live model and new-model creation are analyst steps (the task lists them).
- Linking the workbook cells to EstateMaster inputs was confirmed to start in the trial (Add New Link, Refresh Values); confirm cell-by-cell mapping on the real model in step C4.
- In production the workbook write goes through SharePoint / Microsoft Graph; the demo downloads the file instead. Demo memory is in the browser.
