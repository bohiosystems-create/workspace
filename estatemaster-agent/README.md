# Bohio agent on EstateMaster (demo)

## Three ways to run it (one source, separate builds)

| Option | How EstateMaster is updated | Build |
|---|---|---|
| **Option 2 · Read-only agent** | The agent reads EstateMaster exports and proposes; after approval an analyst types the values into EstateMaster and uploads the export | `dist/option2-readonly/` |
| **Option 3 · Analyst in the loop** | After approval the agent writes the control workbook; an analyst presses Refresh Values and Export (about a minute) | `dist/option3-analyst/` |
| Runner (full) | The Windows runner operates EstateMaster after approval | this folder, `?mode=full` |

`python tools/build_options.py` rebuilds both option folders and a zip for each. Each is its own Vercel project, locked to
its option, with no runner function. This folder's `index.html` opens Option 2 by default; `?mode=analyst` or
`?mode=full` switch it. In Options 2 and 3 every figure shown as EstateMaster's comes from an export, and the
model only changes when an export is read.

A single-page demo of an AI agent that sits on top of ARGUS EstateMaster for KINAN's
Al Narjis Mixed-Use project. All data is dummy data.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The whole demo (model, chat dock, market data, Outlook integration in Settings, scenarios and stress, reports). The dummy dataset and the Excel file are embedded. |
| `api/llm.js` | Vercel serverless function that proxies to Claude or OpenAI, so API keys stay on the server. |
| `api/scan.js` | Live Outlook (Microsoft Graph) reader with AI extraction of assumption changes. |
| `api/mail.js` | Sends the agent's emails (scheduled reports, alerts) from the project mailbox; internal recipients only. |
| `api/cron.js` | Server jobs (Vercel Cron): email scan with alerts at 07:00 and 15:00 Riyadh, morning EstateMaster report. |
| `api/voice.js` | ElevenLabs text-to-speech for ▶ Play and the report's Read mode, with character timestamps (the spoken figure lights up), the account's voice list, English and Arabic; audio cached, key never in the browser. |
| `api/runner.js` | Proxy from the agent to the EstateMaster runner; the runner token stays on the server. |
| `runner/` | The EstateMaster runner for the Windows VM (not deployed to Vercel). |
| `setup/` | Copilot setup agent instructions, the KINAN control workbook template and its generator (not deployed). |
| `docs/` | Features report, setup guide and user guide (PDF). |
| Reports | KINAN report document (logo band, orange cover, SVG charts, closing page), **▶ Play** presentation with captions and voice, PowerPoint with native charts, HTML and print. Same design as the KINAN marketing hub. |
| `tools/build_options.py`, `dist/` | Builds the separate Option 2 and Option 3 demos (not deployed from this folder). |
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
   | `CRON_SECRET`, `ALERT_TO`, `REPORT_TO`, `EXPORTS_FOLDER` | Twice-daily email scan (findings in the Daily feed; `ALERT_TO` optional) and the morning EstateMaster report (see the setup guides) |
   | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_VOICE_ID_AR` | ElevenLabs narration (English voice, Arabic voice) for ▶ Play and Read (key stays on the server; without it the browser's voice is used) |
   | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Optional: if the runner tunnel sits behind Cloudflare Access |

3. Redeploy so the variables take effect. Open the site: the engine button (top right) switches to
   Claude automatically when a server key is set. If you set `DEMO_PASSWORD`, open the engine button
   and enter the access code.

Test locally with `vercel dev` (it reads a local `.env`).

## Layout: tabs, chat dock, settings

- **Projects menu (left edge):** hidden until the cursor reaches the left edge of the screen; lists the projects with
  their latest export, IRR and open checks. **+** creates a project from an EstateMaster export: choose the file (Office
  Links → Excel, or the Summary and Input sheets pasted as values), the agent reads the title, asset type, currency,
  figures, assumptions and sensitivity tables, and opens the project. A project made from an export has no replica model:
  its figures are EstateMaster's, and every what-if goes to the cross-checked AI test below.
- **Tabs:** Reports, Daily feed, Financial modelling (Options 2 and 3), Assumptions, Scenarios & stress (sensitivity
  grids, the explorer, the scenario generator, the stress library, tornado, headroom) and Reports. The integration
  cards are gone from the pages: integrations and feeds are listed under ⚙ Settings → Integrations, and the market
  check moved to ⚙ Settings → Market data (it also runs in the daily report).
- **Assumptions:** every assumption of the project (EstateMaster's inputs from the export, or the approved register),
  with its position against the market. Type a new value next to any of them (or describe a change) and press **Run
  cross-checked test**: Claude Fable 5.1 and OpenAI gpt-5 each calculate the effect from EstateMaster's figures, compare;
  where they differ each reviews the other's working and corrects itself, and if they still differ Claude decides with a
  stated reason. The table shows EstateMaster's current figure (green), each model's figure and the result (red **AI
  calc**, bold, clickable: both workings and how the difference was resolved). Routed on the `calc` tier.
- **Reports → Daily report** (same layout as the marketing agent): schedule (on/off, time, timezone, days, internal
  recipients, English and/or Arabic, Save), delivery check (Send test now), Run (Preview today's report, Run snapshot,
  Download PDF) and History (sent / generated, ▶ and View). The daily report holds EstateMaster's figures, the checks
  on the export, the assumptions possibly changing in Outlook over the last 24 hours and the assumptions vs market. The
  schedule is saved on the server (`/api/schedule`, a JSON file next to the exports) and the 15-minute server tick sends
  it, with or without the app open.
- **Chat drawer**, the same design as the Kinan marketing agent: the orange **Ask** button (bottom right, with the number of change requests waiting) opens it on any tab; charcoal head with Close and full screen; it stays open while you move between tabs. It answers from EstateMaster's figures and the data library,
  and reasons on them through the AI when a question needs it (totals, ratios, comparisons, what-ifs, stress tests,
  sensitivities, "which project…"). **Every figure says where it comes from**, as a tag after the number: **EstateMaster**
  (read from the export, with the export id, sheet and row), **Agent estimate** (the Bohio replica of the model, never
  presented as EstateMaster's) or **AI calc** (arithmetic by the AI model, with the formula it used). Every tagged figure is
  bold and clickable: a small window shows how it was worked out (the shocks applied, the replica's base and result, the
  calibration to EstateMaster's base, the method; or the export, sheet and row it was read from; or the AI's own formula).
  Analytical questions go first to EstateMaster's saved sensitivity tables and stored options (`estatemaster_sensitivity`,
  `estatemaster_results`); a what-if that lands on a saved cell is answered with EstateMaster's own figure; otherwise the
  replica estimates it (`estimate_scenario`) and says so. An AI answer that quotes figures without a label gets a warning.
  "Propose it" turns an estimate into a change request for approval. Ask for any chart
  ("chart the cash flow by year", "plot the stress tests", "show the profit bridge", "graph SAIBOR", "… as a donut / bars /
  line / table"): the rules engine draws it from the model's own series; the AI agent uses `get_series` for anything the
  model has and `make_chart` for comparisons and derived figures, naming the source of every value. Charts are the same 3D
  KINAN charts as the decks, with hover tips (name and value) and an ↗ export (PNG; HTML for bar charts).
- **Settings (⚙, top right):** AI connections and routing, Integrations, Market data, Outlook (folder, scan now, alert recipients: the twice-daily scans
  keep running), Voice, Architecture. Chart hover tips also work on the report document.

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
| Report design ("for the board, as tables, max 6 slides") | Report designer | Claude Fable 5.1 → Claude Opus 5.5 → OpenAI gpt-5 |
| Questions on the data that need reasoning (totals, ratios, comparisons) | AI agent with tools; figures it works out are marked “AI calc” | Claude Opus 5.5 → OpenAI gpt-5 |
| What-ifs, stress tests and sensitivities asked as questions | AI agent: EstateMaster's saved sensitivities and options first, then the replica estimate; every figure tagged EstateMaster / Agent estimate / AI calc, click for the working | Claude Opus 5.5 → OpenAI gpt-5 |
| EstateMaster's own results, options, sensitivity tables | Read from the export; no AI | none |
| Charts in the chat | Model series (no AI) · comparisons and derived figures through the AI agent's make_chart, with sources | — / Claude Sonnet 5.5 → gpt-5 |
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

Option 2's capabilities in one page: `docs/OPTION2_capabilities.md`.

## EstateMaster is the trusted layer

**Exports carry their stored Option / Stage and EstateMaster's own sensitivity tables.** The export reader (`parseExport`)
reads the returns by row label on any sheet (`.xlsx`, `.xlsm`, `.xls`, `.csv`), the option name from the Intro sheet
("Option / Stage: Downside") or the file name ("… - Downside.xlsx", "… (Downside).xlsx"), and the 1-way and 2-way
sensitivity tables on the Sensitivity sheet (a row of shifts such as −20% … +20%, then one row per metric, or a grid with
shifts down the side). The base option (named like a base case, else the first exported) drives the KPIs, status and
reports; every other option is listed on the Scenarios tab as a scenario EstateMaster itself calculated, with Δ vs base.
The saved sensitivity tables are shown there as EstateMaster's own figures (coral below the hurdle), and the chat uses
them before estimating anything. The morning report on the server follows the base option too.

Every figure the app computes itself (live returns, stress tests, sensitivities, the explorer, the napkin) is labelled
as the agent's **estimate**. EstateMaster's own figures come only from the runner's export, are labelled
**EstateMaster**, and are tied to the exact working copy they were calculated for: change anything and the figure is
shown as out of date. "Check in EstateMaster" (Agent tab, chat, or the agent's `check_in_estatemaster` tool) runs the
working copy in EstateMaster on a scratch copy and changes nothing. Reports show an EstateMaster column and say which
figures are estimates. The AI never calculates: it calls tools, and the tools say where each number comes from.

## No limits on assumptions or stress scenarios

- **Assumptions:** the 33 core lines keep an instant estimate. Every other EstateMaster input is a model line on the
  control workbook's Lines sheet: any number, found by id, added at the bottom. Model data → Model lines lists and
  searches them (tested with 5,131). A change to a model line is a change request; EstateMaster calculates its effect.
  Lines not yet linked in EstateMaster are never written. The demo's 131 sample lines are never sent to a real runner.
- **Stress scenarios:** Stress tests → Scenario generator adds new scenarios on every press (correlated shocks by
  theme, plus model-line shocks), or describe one in words. The worst are checked in EstateMaster on a scratch copy
  that the runner restores. "Stress report" builds the Stress test report.

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
3. **New models and the live model.** Approving a new model makes the runner copy a KINAN master template
   (`templates.json`), write its values, register it and run it. Approving a promotion (Investment Director) makes the
   runner back up the live model's workbook, write the approved values and save the live model (`save_live` step).
4. **Fallback.** If the automation fails, or the runner is in manual mode, the job becomes a one-minute task
   for an analyst (open, Refresh, Export); pressing Collect on the change request reads their export.

Without `RUNNER_URL`/`RUNNER_TOKEN`, the demo simulates the runner, clearly labelled, with results from a simplified
stand-in model in the browser; Architecture → Demo runner switches the simulation to the analyst fallback. A runner
that is configured but unreachable is reported as such, never simulated.

## Checks on every export, and what the emails are proposing

`api/_lib/emcheck.js` holds `emChecks()`, copied into the app by `tools/sync_emcheck.py` (the build runs it), so the
07:00 morning report on the server, the EstateMaster tab, the chat ("check the export for mistakes", the AI tool
`check_estatemaster_export`) and the report block *Checks on the EstateMaster export* (in the monthly report and the IC
pack) all run the same checks on the latest export: outputs that do not reconcile (profit on cost vs net profit / total
cost, revenue − cost vs profit, sign), unit slips (thousands vs SAR), peak debt above cost, negative leverage, implausible
ranges, a sensitivity table whose base cell no longer matches the Summary (not refreshed after a change), inputs at zero
or out of range (interest rate, cap rate, contingency, VAT, percentages above 100), inputs that differ from the approved
register (an unapproved change or a typing slip), jumps since the previous export with no approved change behind them,
and a stale export. Each finding is a sentence with a level (likely error, check, note); nothing is changed.

The morning report also carries **Assumptions possibly changing (Outlook, last 24 hours)**: the same reader the scans
use, over the last day, so the report says what the emails propose and that the export does not include it yet. In the
app, "which assumptions are changing?" and the report block *Assumption changes sensed in Outlook* list the change
requests the scans raised, with sender, quote and approval status.

## Approvals, email scans and change memory

- **Nothing reaches EstateMaster without a person.** Changes the agent finds in Outlook, changes the AI
  proposes, new models and promotion to the live model all become change requests (CR-xxx) in the
  Daily feed tab, approvable there, in chat or on WhatsApp ("APPROVE CR-103"). Promotion needs an
  Investment Director. Changes a person makes directly are their own decision and are logged.
- **Outlook is scanned twice a day** (07:00 and 15:00 Riyadh, on the server even with the app closed) and on request; when a scan senses a possible assumption change the alert list is told by email, WhatsApp and the bell; each
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

Users can create new report types in one sentence (report designer, above) or from the builder: pick blocks from the
library (returns, model, project controls, cash flow and funding, investors, risk, market and
compliance, governance), order them, set audience, schedule and delivery, or describe the report and
let the AI design it. Eight new report types are included as starting points.

## Narration (▶ Play) and voice

▶ Play speaks a **script written for the ear**, not the slide text: what each figure means for the audience, with
transitions. Claude Fable 5.1 writes it from the deck's figures when an AI key is set (then Opus 5.5, then gpt-5);
otherwise a built-in writer phrases the same figures. Every number spoken is on the slide. The script is hidden (CC
shows it); while a sentence is spoken the figure it is about glows and the rest of the slide steps back, timed from
ElevenLabs' character timestamps (browser voice: word boundaries). **🎙 Voice** picks any voice from the ElevenLabs
account, with samples, and switches the narration to **Arabic**. PowerPoint notes carry the script.
Setup and voice choice: `docs/VOICE_elevenlabs.md`.

## Data library (dummy data)

Reports and the agent can draw on more than the model: 14 previous projects (budget vs final cost by element,
programme, sales velocity and pricing, planned vs realised returns, lessons), 5 funds (size, calls, distributions,
NAV, net IRR, DPI/TVPI, holdings, LTV/DSCR), monthly macro series since 2019 (SAIBOR, CPI, construction cost index,
steel, cement, mortgage rate, price and rent indices, REIT yield, Brent), a scenario library with historical analogues
run on the model, covenant test history, past stress runs, the project's monthly actuals and cost benchmarks by asset
type. 15 report blocks use it (track record, benchmarks, velocity, exposure, fund portfolio and performance,
distributions, macro context, cost inflation, scenario library, covenants, stress history, spend curve, collections),
three built-in reports are built on it (scenario and stress pack, track record and benchmarks, fund portfolio update),
and the agent answers from it ("past projects in Hittin", "fund performance", tool `query_data`). Generated,
deterministic, clearly labelled dummy data; in production each table maps to SQL Server, the fund administrator and
the market feed.

## Report designer (change a report by talking to it)

Reports tab → **Report designer** chat (or the main agent chat). Ask for a **new report in one sentence** ("create a
treasury stress report for the CFO: scenario library, covenants and the macro picture") and it is designed, created and
built on the spot; or say who an existing report is for, what it should show and
which slides to use, e.g. *"for the board, returns and capital structure, stress tests as a table, max 6 slides, no
change log"* or *"for the lender: facility and covenants as tables"*. It changes the open report: audience, purpose,
tone, parts and their order, slide type per part (table, list, bar, column or line chart, donut, waterfall, stacked
columns, gauges), slide limit, dividers, narrative. The reply lists every change, with **▶ Play** and **Undo**; say
"undo" in the main chat too. Changes are logged and kept after reload.

The designer only decides what to show and how. It never writes figures: they still come from EstateMaster.
Slide types the data cannot support (e.g. a waterfall for a list of flags) are refused and named in the reply.

Model: **Claude Fable 5.1** (Anthropic's most capable model) at high effort, with a schema-checked tool call and
server-side fallback on refusal; then Claude Opus 5.5; then OpenAI gpt-5. No AI connected: a rules engine handles
the common requests. The `/api/llm` proxy allows 12,000 output tokens and 300 s for this task only.

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
| `runner/models.example.json` | Copy to `models.json`: each model's .emdf and control workbook, plus optional scratch copy (stress checks) and live model (promotion) |
| `runner/templates.example.json` | Copy to `templates.json`: the KINAN master templates new models are copied from |

Tested here with a fake EstateMaster export (the full loop: connect → approve → runner writes the workbook →
"EstateMaster" → results by label → approval card and memory, in automatic and manual modes).
**Not yet run against EstateMaster**: the button names, output labels and licence for unattended use must be
confirmed in your trial and with Altus. See docs/Bohio_EstateMaster_Agent_Setup_Guide.pdf.

## Suggestions and diagnostics

- "Suggest changes" (Daily feed tab, chat or WhatsApp) reviews assumptions against market comps,
  SQL Server actuals, achieved sales, the cost library, zoning and risk policy; it also runs on
  every Outlook scan. Each suggestion is a change request.
- Router → Run diagnostics (or open the page with `#debug`) runs 21 self-tests and shows the AI and runner connections.
- docs/ has the features, traceability and debug report, the setup guide and the user guide.
