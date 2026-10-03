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

## F. Test it (10 minutes)
- [ ] Ask "what if construction cost rises 8%": a change request, no IRR.
- [ ] Approve it: a refresh task appears; the model is unchanged.
- [ ] Download the control workbook: the Inputs value is the approved one.
- [ ] Refresh in EstateMaster, export, upload: the tiles show the new IRR and **Compare exports** shows the move.
- [ ] A line with column J blank shows up in the task as a manual step.

## G. Limits to tell KINAN
- The analyst still presses Refresh Values and Export: no unattended runs, results wait for them.
- Only linked inputs flow automatically; every other input is a manual step.
- Promotion to the live model and new-model creation are analyst steps (the task lists them).
- Linking the workbook cells to EstateMaster inputs was confirmed to start in the trial (Add New Link, Refresh Values); confirm cell-by-cell mapping on the real model in step C4.
- In production the workbook write goes through SharePoint / Microsoft Graph; the demo downloads the file instead. Demo memory is in the browser.
