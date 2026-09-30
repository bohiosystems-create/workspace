# Bohio agent on EstateMaster (demo)

A single-page demo of an AI agent that sits on top of ARGUS EstateMaster for KINAN's
Al Narjis Mixed-Use project. All data is dummy data.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The whole demo (model, agent, market data, Outlook inbox, WhatsApp mock-up, IC report). The dummy dataset and the Excel file are embedded. |
| `api/llm.js` | Vercel serverless function that proxies to Claude or OpenAI, so API keys stay on the server. |
| `api/scan.js` | Live Outlook (Microsoft Graph) reader with AI extraction of assumption changes. |
| `api/runner.js` | Proxy from the agent to the EstateMaster runner; the runner token stays on the server. |
| `runner/` | The EstateMaster runner for the Windows VM (not deployed to Vercel). |
| `setup/` | Copilot setup agent instructions, the KINAN control workbook template and its generator (not deployed). |
| `docs/` | Features report, setup guide and user guide (PDF). |
| `vercel.json` | Vercel settings (function timeout, security headers). |
| `market-data.xlsx` | The dummy dataset as a workbook (also downloadable from inside the demo). |
| `data/` | Generator scripts for the dummy data (not deployed). |

## Deploy to Vercel

1. Unzip, then either:
   - **CLI:** `npm i -g vercel`, then run `vercel` inside the folder and follow the prompts; `vercel --prod` to publish; or
   - **Git:** push the folder to a GitHub repo and import it at vercel.com/new (framework preset: *Other*, no build command).
2. In the Vercel project, go to **Settings → Environment Variables** and add:

   | Variable | Needed for |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude engine |
   | `OPENAI_API_KEY` | OpenAI engine |
   | `DEMO_PASSWORD` | Optional but recommended: an access code people must enter before the demo can call the AI (stops strangers spending your credits) |
   | `ANTHROPIC_URL`, `OPENAI_URL` | Optional: a corporate gateway instead of the public endpoints |
   | `RUNNER_URL`, `RUNNER_TOKEN` | The EstateMaster runner (tunnel URL and shared token). Without them approved changes run on the demo's stand-in model |
   | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Optional: if the runner tunnel sits behind Cloudflare Access |

3. Redeploy so the variables take effect. Open the site: the engine button (top right) switches to
   Claude automatically when a server key is set. If you set `DEMO_PASSWORD`, open the engine button
   and enter the access code.

Test locally with `vercel dev` (it reads a local `.env`).

## Task routing (no engine choice)

Every request is routed automatically; the badge on each answer shows the route.

| Request | Route | AI model (primary → failover) |
|---|---|---|
| Assumption changes, stress tests, sensitivities, headroom, explorer, capital structure | EstateMaster calculation | none |
| Zoning checks, Outlook, "why did X change" | Data query | none |
| Market benchmarking | Data query + commentary | OpenAI gpt-5-mini → Claude Sonnet 5.5 |
| IC report narrative, memos | EstateMaster numbers + narrative | Claude Opus 5.5 → OpenAI gpt-5 |
| Open questions, advice, multi-step requests | AI agent with tools | Claude Sonnet 5.5 → OpenAI gpt-5 |
| Questions about attached Excel files | AI agent with tools | OpenAI gpt-5 → Claude Sonnet 5.5 |
| Approvals | Fixed rules, never AI | none |

AI never does the financial maths: the agent calls tools, and the tools return calculated numbers.
Connect Claude, OpenAI or both (server keys on Vercel, or paste keys under the Router button). With both,
a failure on one provider fails over to the other. With neither, the rules engine still answers.
Models per route can be overridden under Router → Routing rules and models, one line per route
(`fast`, `smart`, `deep`, `excel`), e.g. `fast=openai:gpt-5-mini, anthropic:claude-sonnet-5-5`.
Check the OpenAI model names match ones your account can use.

The proxy caps output at 2,000 tokens per call and never returns the key to the browser.

## Reporting from EstateMaster

The Reports tab is built on an **EstateMaster extract**: the runner reads every assumption line (the
Model data tab shows all of them, each editable), all KPIs, the quarterly cash flow, cost and revenue
reports, the funding schedule and the fund waterfall, and joins them with SQL Server actuals.
From each extract it builds: Investment Committee pack, monthly project report (budget vs actuals,
sales progress, next-quarter cash flow, flags), lender report (facility, covenant tests, drawdowns,
debt under stress), fund investor report (calls, distributions, LP and KINAN returns under stress) and
a scenario comparison. Each exports to PDF, Excel and HTML, can be scheduled after the nightly extract,
and can carry an AI-drafted narrative. "Full extract (Excel)" downloads the raw extract.
All data in the demo, including actuals and covenant thresholds, is dummy data.

## Architecture: Copilot for setup, Bohio agent for day to day

EstateMaster has no API, so inputs and results go through Excel:

```
Bohio agent ──approved values──▶ control workbook ──Excel link──▶ EstateMaster (calculates)
     ▲                                                                  │
     └──────────── reads by label ◀── Office Links Excel export ◀───────┘
```

1. **Setup, once per model (Copilot + analyst).** The Copilot setup agent (`setup/copilot_setup_agent.md`)
   fills the KINAN control workbook (`setup/KINAN_control_workbook_template.xlsx`) from the model's Office Links
   export. The analyst confirms each line, links column E to the model in EstateMaster (already done on the
   KINAN master template), and connects it in the app: Model data → Connect control workbook. The workbook is
   checked (same rules as `runner/control_check.py`) and connecting is a change request.
2. **Day to day (Bohio agent).** Every approved change is sent through `/api/runner` to the runner, which
   writes all assumptions to the control workbook, operates EstateMaster (open, Office Links Refresh,
   recalculate, Excel export, save a copy, close) and reads the results by row label. The approval card and the
   change memory show EstateMaster's IRR next to the agent's estimate.
3. **Fallback.** If the automation fails, or the runner is in manual mode, the job becomes a one-minute task
   for an analyst (open, Refresh, Export); pressing Collect on the change request reads their export.

Without a runner connected, the demo answers from a simplified stand-in model in the browser.

## Approvals, email scans and change memory

- **Nothing reaches EstateMaster without a person.** Changes the agent finds in Outlook, changes the AI
  proposes, new models and promotion to the live model all become change requests (CR-xxx) in the
  Approvals tab, approvable there, in chat or on WhatsApp ("APPROVE CR-103"). Promotion needs an
  Investment Director. Changes a person makes directly are their own decision and are logged.
- **Outlook is scanned four times a day** (06:00, 10:00, 14:00, 18:00 Riyadh) and on request; each
  assumption change found in an email becomes a proposal with the quote it came from.
- **Change memory:** every change, proposal, approval, rejection, scan and project switch is logged
  with who, when, channel and the IRR after. Exportable to Excel. In the demo it is kept in the
  browser; in production it lives in SQL Server.

## New models from previous projects

"New model from template" (Model data tab, or ask the agent) copies a previous project's EstateMaster
structure, sizes it from the chosen plot's zoning (plot area × FAR), fills prices and rents from
comparables or keeps the template's values, and drops components the zoning does not permit.
Creating the EstateMaster file is a change request; once approved the workspace switches to the new
project. Previous projects and plots are dummy data.

## Report builder

Users can create new report types from the agent settings or the Reports tab: pick blocks from the
library (returns, model, project controls, cash flow and funding, investors, risk, market and
compliance, governance), order them, set audience, schedule and delivery, or describe the report and
let the AI design it. Eight new report types are included as starting points.

## Live Outlook (Microsoft Graph)

`api/scan.js` reads one mailbox folder, read-only, and uses Claude or OpenAI to extract proposed
assumption changes. The page switches from the dummy inbox to the live mailbox automatically when
these Vercel variables are set: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (Entra ID app with
Microsoft Graph `Mail.Read` application permission and admin consent, restricted to the project
mailbox), `OUTLOOK_MAILBOX`, `OUTLOOK_FOLDER` (default Inbox) and an AI key. Every finding becomes a
change request for approval. See docs/Bohio_EstateMaster_Agent_Setup_Guide.pdf.

## EstateMaster runner

| File | What it does |
|---|---|
| `runner/em_runner.py` | FastAPI service: job queue (one EstateMaster run at a time), writes the control workbook, operates EstateMaster, reads the export; manual fallback and Collect |
| `runner/em_ui.py` | The button presses (Windows UI Automation via pywinauto), steps from `ui_steps.json` |
| `runner/em_ui_probe.py` | Trial step 1: records the real names of EstateMaster's buttons and dialogs |
| `runner/em_ui_trial.py` | Trial step 2: one timed round trip with no person at the keyboard |
| `runner/ui_steps.json` | Buttons to press. **Placeholders** until the probe has run |
| `runner/register_map.csv` | Assumption register → fixed cells of the control workbook (Inputs!E4:E36) |
| `runner/output_labels.csv` | Output row labels to read from the export. **Placeholders**: use the labels in your export |
| `runner/control_check.py` | Checks a control workbook (errors block, warnings need a person) |
| `runner/models.example.json` | Copy to `models.json` and list each connected model's .emdf and control workbook |

Tested here with a fake EstateMaster export (the full loop: connect → approve → runner writes the workbook →
"EstateMaster" → results by label → approval card and memory, in automatic and manual modes).
**Not yet run against EstateMaster**: the button names, output labels and licence for unattended use must be
confirmed in your trial and with Altus. See docs/Bohio_EstateMaster_Agent_Setup_Guide.pdf.

## Suggestions and diagnostics

- "Suggest changes" (Approvals tab, chat or WhatsApp) reviews assumptions against market comps,
  SQL Server actuals, achieved sales, the cost library, zoning and risk policy; it also runs on
  every Outlook scan. Each suggestion is a change request.
- Router → Run diagnostics (or open the page with `#debug`) runs 18 self-tests and shows the AI and runner connections.
- docs/ has the features, traceability and debug report, the setup guide and the user guide.
