# Option 2 · Read-only agent on EstateMaster — what it can do

The agent never writes to EstateMaster. Every figure it presents as EstateMaster's comes from an export an analyst
loaded; everything else is labelled as the agent's estimate. Nothing changes without a person approving it.

## 0. Layout
- Projects menu on the left edge (shows when the cursor reaches it); **+** creates a project from an EstateMaster export.
- Menus: the left menu has Reports and the Daily feed (across all models) and the list of financial models (+ to upload one); the top menu has the selected model's own pages: Financial modelling, Assumptions, Market data, Assumptions, Scenarios & stress, Reports. Integrations, market data, Outlook, voice, AI routing and the architecture notes sit under the ⚙ Settings gear.
- Assumptions: every input with its market position; test any change with Claude and OpenAI calculating independently, checking each other and resolving differences. Every result is an AI calc, bold and clickable for both workings.
- The chat (orange Ask button, bottom right; same drawer as the marketing agent): answers from EstateMaster's figures and the data library and reasons on them through the AI (what-ifs, stress tests, sensitivities, comparisons, totals). Every figure carries its origin: **EstateMaster** (read from the export), **Agent estimate** (the replica, never passed off as EstateMaster's) or **AI calc** (the AI's arithmetic). Each tagged figure is bold and clickable: a window shows how it was worked out. Unlabelled figures in an AI answer are flagged.
- EstateMaster's own results: the stored Options / Stages exported from EstateMaster are listed as scenarios it calculated, and the 1-way / 2-way sensitivity tables saved in the export are read and shown as EstateMaster's figures; a what-if that matches a saved cell is answered with EstateMaster's figure, not an estimate.
- Any chart on request in the chat (3D KINAN charts, hover tips, ↗ export): from the model's own series, or built by the AI with the source of every value stated.

## 1. Answer from EstateMaster's figures
- Headline figures (levered and unlevered IRR, profit on cost, net profit, equity multiple, peak debt, total cost, revenue) from the latest export, with the export id and time.
- Status, verdict against the hurdles, what changed since the last export, who decided it and on what evidence (change memory).
- Any assumption line of the register and any model line, by name or id; search across lines.

## 2. Estimate, never decide
- "What if" on any assumption (price, cost, rent, land, cap rate, rate, delay, leverage, model lines): an instant estimate from the replica, labelled as such, then a change request for a person to approve. Approved changes become analyst tasks; EstateMaster's own figure arrives with the next export.
- Stress library, generated scenarios (hundreds or thousands, never the same twice), sensitivity grids, tornado, headroom before the hurdle breaks, capital structure and fund waterfall: all estimates, with the worst cases handed to an analyst to run in EstateMaster.
- A new model from a previous project's structure (creation in EstateMaster needs approval).

## 3. Watch the inbox and the market
- Every export is checked for likely mistakes, especially in the inputs: outputs that do not reconcile, unit slips, peak debt above cost, negative leverage, sensitivity tables not refreshed, inputs at zero or out of range, inputs that differ from the approved register, unexplained jumps since the previous export. On the EstateMaster tab, in the chat ("check the export for mistakes"), in the monthly report and IC pack, and in the 07:00 morning report.
- The morning report also lists the assumption changes the emails of the last 24 hours propose, and says the export does not include them yet.
- Outlook folder scanned twice a day (07:00 and 15:00 Riyadh) on the server, plus on request: anything that reads like a change to an assumption becomes a proposal for approval, with the quote and sender.
- Email alerts to the internal team when a scan finds a potential change (internal addresses only).
- Market check against transactions, rental evidence and the plot's zoning; suggestions raised as change requests.

## 4. Reports
- Nine built-in reports (IC pack, monthly, lender, investor, scenario comparison, stress test, scenario and stress pack, track record and benchmarks, fund portfolio update) and any number of custom ones.
- **Report designer**: say who a report is for, what it should show and which slides to use; or ask for a new report in one sentence and it is designed, created and built on the spot (Claude Fable 5.1, then Opus 5.5, then GPT-5; rules engine with no AI).
- Block library of 50+ sections: returns, model, project controls, cash flow and funding, investors, risk, market and compliance, governance, track record. Figures only from EstateMaster's export and the data library.
- Output: KINAN document (HTML, print/PDF), **▶ Play** presentation with narration and the figure under discussion lit up, PowerPoint with native charts and the script in the speaker notes, Excel.
- Narration: a spoken script written for the ear (not the slide text), in English or Arabic, ElevenLabs voice chosen from the account; browser voice as fallback.
- Daily report, scheduled on the server (time, timezone, days, internal recipients, English / Arabic) with delivery check, preview, snapshot, PDF and history: EstateMaster's figures, checks on the export, assumptions changing in Outlook, assumptions vs market.
- Other schedules (daily, weekly, monthly, quarterly) delivered by email, WhatsApp link or SharePoint folder; delivery log.

## 5. Data library (dummy in the demo; connections in production)
- Previous projects: budget vs final cost by element, programme plan vs actual, sales velocity and pricing, planned vs realised returns, lessons.
- Funds: size, calls, distributions, NAV, net IRR, DPI/TVPI, holdings, LTV/DSCR, concentration.
- Macro series since 2019: SAIBOR, CPI, construction cost index, steel, cement, mortgage rate, price and rent indices, REIT yield, Brent.
- Scenario library with historical analogues (rate cycle 2022–23, materials spike, pandemic launch, cost overruns, slow absorption, exit at 2020 yields, deleveraging, combined downturn, upsides), run on this model.
- Covenant test history, past stress runs, the project's monthly actuals (spend vs budget, commitments, units sold, collections, drawdowns), cost benchmarks by asset type.
- The agent answers questions from it ("past projects in Hittin", "fund performance") and every report block can use it.

## 6. Governance
- Approvals by named people only; the agent cannot approve, write to EstateMaster or send to external addresses.
- Change memory for every change, proposal, approval, report run and design edit; self-test and diagnostics page.
- AI routing by task with no engine choice: Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1 and OpenAI gpt-5 / gpt-5-mini; no Haiku. Keys stay on the server.

## Not in this option
- Writing to EstateMaster, running it, or reading it without an analyst's export (Option 3 adds the control workbook; Option 1 adds the runner).

## Added
- **Sensitivity table** (Scenarios & stress): a text box by each axis; the agent pins down the exact assumption from plain words (and asks when unsure), then Claude and OpenAI calculate every cell from EstateMaster's figures and check each other (cells are AI calcs, clickable for both workings; the base cell is EstateMaster's; EstateMaster's own saved table is used when the export has it). Also from the chat: "sensitivity of the IRR to construction cost and sale price".
- **Daily feed**: the effect of every proposed change (email proposals, suggestions) is worked out live by Claude and OpenAI (cross-checked) and shown on the card with a follow-up box into the chat; the daily report lists the IRR if approved. EstateMaster's own figure comes once an analyst applies the change.
- **Upload a model** (+ in the Projects menu): the chat opens on it right away with EstateMaster's figures and questions to start from; the agent reads every input of the export (`export_assumptions`).
- **Market data** page: transactions, rentals, demographics, regulations and FARs by plot (mock data), each downloadable as Excel.
- **Email use cases in the Daily feed and the daily report**: a request for approval that would change an assumption is flagged like any proposed change, with the reason the email gives and the modelled impact on the levered IRR, profit on cost and net profit (Claude and OpenAI, cross-checked; EstateMaster's own figure comes once an analyst applies it). Covered: a discount on a batch of units (blended into the average sale price), a buyer incentive (e.g. paying part of the transfer tax), a rent-free period or lower rent (effective rent over the term), a variation order or revised quote, a revised term sheet or SAIBOR fixing, a valuer's exit yield, a landowner's revised price, a programme delay, a zoning cut to the GFA. The server's morning report carries the same table (assumption, proposed, from, why, impact if applied).
- **Across all models**: the Daily feed lists open decisions of every financial model (each card names its model; the effect is costed on that model's own export; approving opens that model). The daily report (app and the 07:00 email) opens with "To know today" across models, then a table of every model (latest IRR, profit on cost, net profit, change since the last export, checks); email changes are tagged with the model they concern and costed on its export. The server groups the exports folder by model (file name without option, version or date suffix).
- **Daily email without SharePoint work**: every export uploaded in the app is copied into the exports folder automatically (Files.ReadWrite.All), and the app shares its Daily feed with the server. With no export in the folder the email still goes, with "To know today".
