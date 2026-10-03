# Kinan — AI Assistant Director of Marketing (standalone)

An AI assistant director of marketing for a company with **one marketing manager
and no marketing team**: it holds the plan to the sales targets, runs the
external marketing vendors (briefs, feedback, chasing, verification), decides
where the money goes, and tells the manager each morning which campaigns to
change. Leads, follow-up and sales stay with **Kinan's own AI agent** (CRM: Yardi);
the director reads CRM results and shares the plan and campaign changes with it.
The manager only approves. Separate
app with its own database — no dependency on `deal-screener`.

**Client demo:** capabilities in [`docs/capabilities.md`](docs/capabilities.md), step-by-step script in [`docs/demo-checklist.md`](docs/demo-checklist.md). Everything for Kinan is in **`kinan-demo.zip`** at the repo root (`npm run demo:package`; start with `docs/START-HERE.md`). `npm run demo:live` resets, builds and starts the live app for a demo; `npm run demo:build` rebuilds the one-file demo (`demo.html`).

## Director (`/`) and the Kinan feed

The home page is the director's desk (`lib/director.ts`, `app/page.tsx`); vendor and campaign monitoring moved to `/campaigns`.

- **Today's brief** — sales vs target year to date (CRM-verified), the asset furthest behind, June forecast per asset, vendor calls, risks, what to do this week and **campaign recommendations**. Also answerable in the assistant ("What's today's brief?") and emailed as the daily report.
- **Campaign recommendations** — the open items from today's **daily campaign check** first, then the recommendations that act on campaigns, ranked (urgent first; budget moves before governance, conversion, tracking and tests): pause or shift budget, campaigns not converting, scale up, Meta agency / tracking issues, media spend not matched by the ad platforms, incrementality tests. Each with the reason, what is at stake and one action (open the page, or draft the vendor email for approval).
- **Targets** — monthly contracted-sales targets per asset (`SalesTarget`, sample values Jan–Jun 2026), actual vs target by month.
- **Approval inbox** — everything waiting for a named person: the plan, Meta campaigns to check, vendor messages, vendor non-renewals, trials to approve or read out, invoice exceptions, email drafts.
- **Budget plan** — next month's budget per vendor, inside the range each vendor's renewal decision allows (exit, test a replacement, performance plan, renegotiate, re-engage; commission vendors ±10%). Money moves to the highest incremental sales per SAR with diminishing returns (sales ∝ spend^0.7); the plan shows expected incremental sales vs unchanged and what is held in reserve. Indicative, not a promise.
- **Your time** — every item in the inbox carries a time estimate; the brief says how many minutes of decisions the week needs.
- **Campaign quality from the CRM** — every campaign code ranked by qualified and win rate (percentiles): strongest (fund first) / middle / weakest (fix targeting or cut).
- **Leads are Kinan's.** Lead follow-up, sales and the CRM are handled by Kinan's own agent; the director only reads CRM results to judge campaigns and vendors.

## Vendor orchestration (`/orchestration`)

**Vendor directory** (`lib/vendor-hub.ts`, `app/orchestration/vendors.tsx`): every vendor — current, bench alternatives and past vendors from the history — with score, renewal decision, campaigns, 2026 spend, cost to sales, invoices outstanding, work in progress and emails. Open a vendor for four tabs: **Overview** (profile, SLA, decision, work orders with their checks, deliverables with *Mark received*, trials), **Campaigns** (live 2026, its Meta campaigns, past campaigns with lessons), **Invoices** (from Oracle, with payment status and reconciliation checks; decisions stay on the Invoices page) and **Emails** (Outlook: what the app drafted and sent, plus the vendor's messages read from the marketing mailbox with Graph `Mail.Read` in live mode — `readVendorMail` in `lib/outlook.ts`, untested on a real tenant; in mock mode, simulated replies consistent with the data). `GET /api/orchestration?vendor=<id>`.

The work a marketing team would do with the vendors, done by the director (`lib/orchestrator.ts`). Each item is a **work order** — an email draft in the vendor's language that is only sent after the manager approves it:

| Work order | When | Closed when |
|---|---|---|
| **Monthly brief** — budget, campaign codes, cost-per-qualified-lead and response targets, deliverables with due dates | the month's budget plan is approved | deliverables received **and** spend within ±10% of the briefed budget (ad platforms / vendor report) |
| **Lead feedback** — per campaign code: CRM leads, qualified %, wins, top loss reason; where to shift targeting | monthly, per vendor | sent (routine) |
| **Reminder** — for a late deliverable; 2 reminders 3 days apart, then an **escalation** asking the manager to call | weekly | the deliverable is received (routine) |
| **Non-renewal notice** — with handover list (final report, files, account access, final invoice) | the agent recommends exit | handover pack received |

- **Approvals for one person:** routine work orders (feedback, reminders — no money, no contract change) and the month's briefs (the money was decided when the plan was approved) can be approved in one batch; each still requires the approver's name, an "I have read" confirmation and the exact revision reviewed. Notices are approved one by one. Wording can be edited from the assistant's drafts.
- **What vendors owe us:** every expected deliverable with due date, status and reminders sent. Received items feed the scorecard's deadline-adherence metric. Until vendor replies are read from Outlook (Graph `Mail.Read`, not built yet), the manager marks items received in one click.
- **Operating rhythm:** daily campaign check (recommendations into the brief), weekly chasing, monthly plan → briefs → feedback → reports, quarterly reviews / renewals / re-bids. `POST /api/orchestration {"action":"RUN"}` runs a cycle (point a scheduler at it).
- The sample data runs on a fixed clock (`lib/clock.ts`, 8 June 2026); switch it to the real date when live feeds are connected.

## Meta ads — which agency runs each campaign (`/campaigns#meta`)

`lib/meta.ts` reads Meta ad accounts and campaigns (`META_MODE=mock` default · `live` · `off`). Meta does not say which agency runs a campaign, so the agent attributes each one from evidence:
- **Campaign code in the name**, **`utm_campaign` on the ads** (also what lets the CRM credit leads), the **creator** (ad-account activity log, `create_campaign_group`) mapped to an agency's Business Manager or user, and the **ad-account owner**.
- Result per campaign: agency + campaign code + confidence (HIGH / MEDIUM / LOW), or **in-house** (the client's own people), **not one of your agencies** (a business with partner access but no contract), **conflict** (evidence points at two vendors).
- A missing code is inferred from the agency's other campaigns in the same account, and flagged.
- Only attributed spend (HIGH/MEDIUM, or confirmed) is written to the ad-platform figures that check each vendor's reported media spend.
- The manager confirms or corrects on Campaigns → Meta ads (bottom of the page; the inbox item links there). "Remember this creator" teaches the agent an unknown creator, but never re-labels a known agency.
- Recommendations: unknown agency (urgent), conflict (decide), no tracking codes (vendor email).
- The Director inbox shows campaigns to check, and the assistant answers "which agency runs each Meta campaign?".
- **Live mode** (`META_ACCESS_TOKEN` system-user token with `ads_read` + `business_management`, `META_AD_ACCOUNT_IDS`, `META_API_VERSION`) is written against the Marketing API (account + `agencies`, `campaigns`, `activities`, `ads{creative{url_tags}}`, weekly `insights`) and **has not been run against a real account**. In live mode, agencies' businesses or users are learned from confirmations (no sample identities).

**Campaign history** (`lib/history.ts`): not in the menu. The 2023–2025 history stays in the assistant's context (rules and the AI's `get_history` tool) and feeds the benchmarks, the daily check and the ideation; ask the assistant about any season, year, channel, project, vendor or past campaign. `/history` still renders if opened directly.

## Daily scheduled reports (`/reports`)

The director writes the manager's daily report (`lib/reports.ts`) and emails it through Outlook:

- **Content** (same data as the Director page, no AI needed): headline and brief; sales vs target per project with the month's forecast; **what changed since the last report** (sales, decisions waiting, uncontacted leads, late deliverables, overdue work orders, invoice exceptions, overdue payments, failed Kinan deliveries, critical risks — compared with the stored snapshot of the previous report); decisions waiting with minutes; vendors (escalations, late deliverables, exits / replacements); leads and Kinan (uncontacted leads, last 24h of the Kinan feed, best and weakest sources); risks; supplier invoices; data freshness. HTML email (RTL for Arabic) plus a text version; every report is kept in the history and can be viewed or downloaded as **PDF** (A4, generated in the browser, Arabic included — `app/_components/reportPdf.ts`) or HTML. In the Claude app edition downloads go through the artifact's `downloads` capability.
- **Daily scan + market initiatives** (`dailyScan` in `lib/signals.ts`, `dailyIdeas` in `lib/ideation.ts`): before the report is built, every source is scanned (stored per day in `SignalScan`; a live snapshot rescans). The section opens with what was scanned and found, then three to five initiatives a day via the ideation pipeline, each answering a finding where there is one. The `ideate` route (Gemini + OpenAI) generates them and the `judge` route (Claude) ranks them. The focus project is the one with a fall or risk in the scan (else a rotation from the furthest behind target). Generated once per day and language and also listed on the Initiatives page.
- **▶ Play** (`app/reports/deck-player.tsx`): each report embeds a structured deck (`lib/deck.ts`, `<script type="application/json" id="kinan-deck">`, ignored by mail clients) built from the same data — cover, brief with KPIs, gauges, columns, donut, horizontal bars with benchmark, Meta trend line, the scan, one slide per finding and per initiative, lists, closing. Rendered full screen in Kinan's style with SVG/CSS animations (count-up, grow, draw); older reports fall back to slides cut from the HTML (`app/reports/player.tsx`).
- **Voice** (`lib/voice.ts`, `/api/voice`): ElevenLabs text-to-speech for the narration (`ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID` / `_AR`, model `eleven_multilingual_v2`). Server-side only (the key never reaches the browser), same-origin requests only, audio cached per text; the next slide is prefetched. Without a key — or in the offline demo — the browser's speech synthesis is used.
- **Charts** (`lib/report-charts.ts`): sales vs target per project, sales by month, revenue share by vendor, and cost to sales by channel. They are built from HTML tables (no SVG or images), so Outlook desktop, Gmail, Apple Mail, the in-app view and the PDF/HTML downloads all show them the same. The numbers come from the chart engine (`lib/chart-query.ts`). The plain-text part lists the same figures.
- **Change the report from the chat** (`lib/report-layout.ts`, `lib/report-chat.ts`): ask the assistant, in English or Arabic, e.g. "remove the invoices section from the report", "move risks to the top", "put vendors after decisions", "only show Andalus Quarter in the report", "keep the report to the top 3 items" / "make it shorter", "add a pie chart of spend by channel to the report", "remove the revenue by vendor chart", "add a note to the report: …", "what's in the daily report?", "undo the last report change", "reset the report". The layout (`ReportLayout`) applies from the next report to the e-mail, the in-app view and ▶ Play; every change is logged (`ReportLayoutChange`) with undo, and shown on the Reports page. Added charts store the chart query and are recomputed from the data in every report. The same rules run with or without an AI key; with one, the AI also has a `change_daily_report` tool for phrasings the rules don't catch. The brief always stays first; nothing here sends or approves anything.
- **Kinan style** (`lib/brand.ts`, `brand/`): the logo, the orange chevron and the faceted page texture come from Kinan's own collateral (vectors extracted from the Malls corporate profile PDF; `scripts/brand-logo.mjs` embeds them as data). Pages are white on the soft texture with the charcoal logo top-left and the chevron top-right; headings are orange uppercase; stat blocks, chevron bars, orange / charcoal full-bleed covers and section dividers, and the charcoal closing with the white logo and `www.kinan.com.sa` follow the collateral. The deck player (`app/reports/deck-player.tsx`) uses the same system, with a chevron wipe between slides.
- **Read version = presentation quality** (`lib/report-svg.ts`): every chart in the report is sent twice — the table version for e-mail clients (Outlook and Gmail can't show SVG) and the same chart designs as ▶ Play (gauges with ticks and outlook bars, columns with targets and a change call-out, donut with direct labels, cost-to-sales bars against the historical average, smooth line) in Kinan's light style, animated as they scroll into view. The app adds `k-screen` to the document when it shows, downloads or prints a report (`screenHtml`), which switches to the rich charts.
- **App charts at presentation quality** (`app/_components/KCharts.tsx`): every chart on the pages — sales vs target by month (Director), spend and sales by month, the lead funnel and cost to sales by project (Campaigns), PO utilisation (Vendors), score and incrementality ranges (Decisions, Experiments), the finding sparklines (Director, Initiatives) — is drawn by one kit with the same designs as ▶ Play: columns with targets and a change call-out, bars against a benchmark with status chips, gauges, smooth sparklines, range bars; direct labels, hover tooltips, entrance motion, still under reduced motion. The assistant's charts (`ChartView.tsx`) share the palette, fonts and motion.
- **3D charts** (`lib/chart3d.ts`): one geometry module gives every chart a third dimension — extruded columns and bars (front, side and top faces, on a ground plane), tilted 3D pies and donuts with rim walls, and a coin edge under the gauges — in the app, the assistant's charts, the report's read version and ▶ Play. The extrusion is modest and every value keeps its direct label, so the depth adds form without hiding numbers. E-mailed reports keep the flat table charts.
- **App theme** (`app/globals.css`, "Kinan theme layer"): the whole UI follows the same system — charcoal header band with the white logo and chevron, white nav with an orange active rule, orange uppercase page titles with the chevron, taupe caps labels, stat-block KPIs, orange primary / charcoal secondary buttons, charcoal table headers, the faceted texture behind every page, and an orange assistant button.
- **On-screen motion** (`kinanDoc` in `lib/reports.ts`): the title is a Kinan news card (grey paper, orange chevron, logo, `@kinanksa | www.kinan.com.sa`); on screen the card settles, sections rise as they scroll into view (scroll-driven where the browser supports it), bars grow and columns rise. It is CSS only and degrades to the finished page — mail clients that drop styles, reduced-motion settings and the PDF (animations are switched off before capture) all show the complete report.
- **Working indicator** (`app/_components/Working.tsx`): building a report, a snapshot or a PDF shows a spinner, a running timer, the steps the director goes through and how long it took last time; the chat shows a timer while it thinks.
- **Schedule** (set on the page, change recorded with a name): time, timezone (default 07:30 Asia/Riyadh), days (default Sunday–Thursday), language(s), recipients.
- **Trigger:** a scheduler calls `POST /api/reports/run` every 15 minutes with `x-api-key: $REPORTS_CRON_KEY` (or `Authorization: Bearer …`, so Vercel Cron works). It sends once per local day, at or after the set time, on scheduled days — a missed slot is sent at the next check that day; repeated calls do nothing. Without `REPORTS_CRON_KEY` the endpoint is disabled; "Run snapshot" and "Preview today's report" still work in the app.
- **Internal only:** recipients must be on `REPORTS_ALLOWED_DOMAINS` (default: the domain of `OUTLOOK_SENDER`). Reports are always sent, never left as Outlook drafts, and take no action — approvals stay in the app.

**Kinan's sales agent — read-only** (`lib/kinan.ts`, `docs/kinan-integration.md`): the AI that handles leads, follow-up and sales in Yardi. The director does not talk to it: it sends it nothing and exposes no API to it. It only reads the CRM results (leads by campaign code, stages, lost reasons, response times) through the CRM layer (`CRM_MODE`, `lib/crm.ts`); Yardi read access is pending Kinan's interface licence and credentials.

- **Monitor** — spend → leads → qualified → viewings → reservations → contracts → sales; cost-to-sales, CAC, CPL, budget pacing; 0–100 vendor scorecard (efficiency 40, quality 25, SLA responsiveness 20, delivery 15).
- **Alerts** — SLA breaches, contract expiry, cost-to-sales > 3%, CPL inflation, lead-quality decay, pacing, vendor concentration.
- **Orchestrate** — recommended Pause / Shift-budget actions, one-click apply, plus manual Pause/Resume; every action is written to an audit trail.
- **AI** — vendor briefing and drafted notes to vendors (optional; routed to Claude, OpenAI or Gemini). All numbers are computed in code.

## AI providers and task routing — Claude, OpenAI and Gemini (`lib/llm.ts`)

All three are built in behind one interface. Everything works without any of them (built-in rules); with a key, the assistant answers free-form questions, market initiatives come from AI models, drafts are polished, and the daily check gets an AI second opinion.

Every AI job names a **task**, and the router sends it to the best provider for that task among those with a key, falling back down the list when one fails (outage, rate limit, auth, empty answer):

| Task | What it is | Default order | Model tier |
|---|---|---|---|
| `chat` | questions on the data, with 20 read-only lookups (including charts) | Claude → OpenAI → Gemini | deep |
| `analysis` | daily second opinion, vendor briefings | Claude → OpenAI → Gemini | deep |
| `draft` | vendor email wording (formal Arabic / English, facts unchanged) | Claude → OpenAI → Gemini | fast |
| `ideate` | market initiatives — run on **two** providers for variety | Gemini → OpenAI → Claude | deep |
| `judge` | rank and filter ideas against the data and the history | Claude → OpenAI → Gemini | deep |
| `summarize` | long inputs, bulk and low-cost work | Gemini → OpenAI → Claude | fast |

- Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). Per-task order: `LLM_ROUTE_<TASK>=gemini,anthropic` (unlisted providers stay as fallbacks); `LLM_PROVIDER` moves one provider to the front of every task; `LLM_FALLBACK=off` uses only the first.
- Models: `ANTHROPIC_MODEL` (default `claude-opus-5-5`; effort `ANTHROPIC_EFFORT=medium`, low for fast tasks; prompt caching on instructions and data), `OPENAI_MODEL` (default `gpt-5`; low reasoning effort for fast tasks; `OPENAI_BASE_URL` for Azure / gateways), `GEMINI_MODEL` (default `gemini-3.8-flash`) and `GEMINI_FAST_MODEL` (default `gemini-3.5-flash-lite`) — Google renames models often, so check the current list.
- `GET /api/ai` reports which providers have keys and where each task goes (no screen for it); every AI answer shows the provider and model that wrote it.
- Models only read data and create drafts. There is no tool to send, approve or spend.
- Tested against mock servers for all three providers (tool calls, Gemini thought signatures, failover, per-task routing, ideation ensemble and judge), **not yet with real keys**.

## Celebrations calendar and live news (feed the initiatives)

- **Celebrations calendar** (`lib/calendar.ts`): Ramadan, Eid al-Fitr, Day of Arafah and Eid al-Adha and the Hijri New Year are computed from the official **Umm al-Qura** calendar (so every year is right without editing; the final day follows the moon sighting), plus Founding Day, Flag Day, National Day, Riyadh Season, Cityscape Global (16–19 Nov 2026), Jeddah events, the school summer and back to school. Each moment carries its marketing angle from the 2023–2025 history and the date to start preparing. **Your own calendar** (Outlook or Google, published as an ICS link) is merged in — paste the link in Settings or set `CALENDAR_ICS_URL`.
- **Live news** (`lib/news.ts`): Google News (English and Arabic, no key) for Kinan's focus cities (Jeddah and Riyadh by default; change in Settings or `NEWS_CITIES`) and Saudi property finance, read every few hours, sorted into property market, financing, regulation, infrastructure, events and developers, and mapped to the project it touches. `NEWS_MODE=off` turns it off. Where the internet can't be reached (the offline demo, the Claude app edition) it shows a snapshot of **real news gathered on 3 Oct 2026**, each with its publisher and link.
- Both are sources of the **daily scan**: each upcoming celebration and each relevant news item becomes a finding with **Initiatives for this** — with playbooks per celebration (Ramadan payment-plan offer, Eid open house, National Day weekend, Riyadh-Season investor lounge, Cityscape stand…) and per kind of news (a new-access location campaign, a mortgage-ready offer, a foreign-buyer programme, an event audience, "buy before prices move"). The news and calendar part of the scan refreshes every 3 hours; the rest once a day. The Initiatives page shows the next six months as a strip. Ask the assistant "what's in the news in Jeddah?" or "upcoming celebrations" (AI tools `get_news`, `get_calendar`).

## Settings and integrations (gear icon, top right)

Every integration with its live status, what it brings and how to connect it: Meta (Facebook & Instagram), Google Ads, Snapchat, TikTok, X, LinkedIn, Outlook email, the celebrations calendar and your own calendar (ICS), live news, Yardi via Kinan's sales agent (read-only), Oracle, market data, the AI providers and the ElevenLabs voice (`lib/integrations.ts`, `/api/integrations`). Keys and tokens stay server-side environment variables and are never typed into or shown on the page; the panel saves only the news cities, news on/off and calendar links, and can test the news and calendar connections.

## Every dashboard, editable from the chat

Each page's figure tiles, charts and sections can be hidden or shown from the assistant — on one page or all at once: "remove the YTD sales from all dashboards", "hide the budget plan on the director page", "show the alerts again on the campaigns page", "what's hidden on the dashboards?", "undo the last dashboard change", "reset all dashboards" (`lib/view-blocks.ts`, `lib/view-chat.ts`, AI tools `get_dashboards` / `change_dashboard`, `/api/views`). The open page changes at once. Works the same in the Claude app edition (the edit rules run before Claude, and the edit tools are kept first when the view limits the tool count).

## Daily report — includes the whole Daily check, and downloads as PowerPoint

The report's campaign section is now the full **Daily campaign check**: the counts (open, urgent, new today, decided, resolved), every recommendation with its status (new / open since / accepted or dismissed by whom), the reason, the action and the lessons from similar past campaigns, the data and tracking fixes, what was resolved since yesterday and the AI second opinion — in the e-mail, the read version and ▶ Play. **Download PowerPoint** (on the open report and in ▶ Play) exports the presentation as a .pptx in Kinan's style with native, editable charts and the narration in the speaker notes (`app/_components/deckPptx.ts`, pptxgenjs, in the browser).

## Market initiatives (`/ideas`, menu "Initiatives")

Describe a brief (project, month, budget, goal, audience, anything else — or leave it empty), or press **Initiatives for this** next to a CRM signal, and the director proposes market initiatives grounded in the data (`lib/ideation.ts`). Types: campaign, offer & pricing, partnership, event & experience, broker programme, content & PR, budget & channel shift, positioning, referral & community.
- **Daily scan** (`lib/signals.ts`, run before every report; `dailyScan(force)` caches one scan per day in `SignalScan`). Sources and rules:
  - **CRM** (`lib/crm-signals.ts`) — per portfolio, project and campaign: sudden drop / surge (last 3 weeks vs the 8 before, z with the baseline's over-dispersion: drop ≥25% and z ≤ −2; surge ≥30% and z ≥ 2.5), steady 12-week decline (fitted trend ≥25% down, t ≤ −2.5), qualified-rate drop (≥20% relative, two-proportion z ≤ −2), contracts by closing month (≤70% of the 3 months before, Poisson p < 0.1), market lost reasons (+6 points, z ≥ 2.5); drivers = the campaigns that moved (paused / ended noted).
  - **Email** (`lib/inbox.ts`) — last 30 days of the shared mailbox (Graph, Mail.Read; sample inbox in mock), classified by rules into ISSUE / OPPORTUNITY / MARKET / EVENT and tagged with project and vendor.
  - **Invoices & POs** — remaining PO ≥ SAR 50K on a paused campaign, or utilisation ≥15 points behind the share of the flight elapsed (commission vendors excluded).
  - **Social & ads** — per campaign over 12 weeks of platform rows: CTR down ≥20% (creative fatigue, platforms named) or cost per platform lead up ≥25%.
  - **Competitors** — active Meta ads ≥10 and ×1.5 in three months (or new), with the offer, mapped to the project it threatens.
  - **Market** — district transactions ≤ −4% y/y (softening) or ≥ +8% with prices ≥ +5% (rising); mortgage rate moved ≥0.3 pt in a year.
  - **Calendar** — National Day, Cityscape and summer within ~5 months.
  - **Linking** — a vendor email (issue or proposal) or unused PO budget behind a CRM fall is attached to it and marked `linkedTo` (answered with it); a broker's market email is attached to the competitor push; competitor, ad and market findings are added as context to a CRM fall in the same project.
- **Kinan style** (`lib/brand.ts`): as on kinan.com.sa — white "كنان / kinan" logo on a charcoal header, orange accent and chevron, Montserrat in light letter-spaced capitals, white pages, a charcoal footer with "LIVE THE PLACE". The daily report and snapshot (`kinanDoc` in `lib/reports.ts`), the report charts (charcoal and orange palette), the slide player and the app header use it.
- **Branding:** put the Kinan logo in `brand/kinan-logo.svg` (or `.png` / `.webp`, light artwork on transparent); `npm run brand` (run automatically before `build` and `demo:build`) embeds it in `lib/brand-logo.ts`. It shows on a dark band in the header, the daily report, the slide player and the demo kit; without the file, the KINAN wordmark is used.
- **Director home:** `directorState` adds today's scan (sources, top findings with sparklines and the initiative answering each, read from the day's prepared initiatives without generating). Reports and snapshots are dated with the sample clock (`now()` in `lib/clock.ts`; `DEMO_CLOCK=off` for the real clock).
- **Answering:** up to three findings for the project (falls and risks first, then opportunities; portfolio findings such as a bank proposal or Cityscape too) are passed to the AI as `signalsToAnswer` with all findings and their evidence; every one must be answered by an initiative with `trigger` = its id, and `coverSignals` adds the built-in answer if the models missed one. Findings are answered when the initiative runs within 6 months of the scan. The demo data includes a lapsed Marina Tower portal slot (CRM dip + PropertyHub email), ad fatigue on the Andalus off-plan funnel (CTR decays on Meta and Snap), and sample inbox messages.
- **Context:** the project's gap to target, the season of the month (Ramadan, summer, Cityscape in November, after summer), channel benchmarks and lessons from the 2023–2025 history, today's daily-check flags for the project, and the vendors available (current, pre-vetted alternatives when exiting a vendor, past vendors for events and radio).
- **Initiatives:** type, the CRM signal answered (if any), title, big idea, audience, offer, headline, channel mix with each channel's role and vendor. With AI, the `ideate` task runs on two different providers and the `judge` task scores them (1–10, why, one improvement) and keeps the best distinct three or four; without AI, built-in answers to each signal type (recover a channel's lead flow, refill the funnel, closing offer, quality reset, bank partnership, proof vs competitors, neighbourhood tours, scale what works) plus season- and goal-aware concepts (broker sprint, open-house expo, payment plan, bank & employer partnership, owners' referral, summer list → September pre-sale, launch with proof).
- **Computed, never invented:** forecasts (contracts and sales ranges, cost to sales) come from the history, adjusted for the project and season; a channel costing over 2× its benchmark for the project today is capped at 20%; guardrails (stop rule, budget in two halves), a campaign code and holdout for measurement, and the past campaigns it builds on.
- **Decisions:** shortlist, approve or discard with a name. Approving drafts a campaign brief email to the lead vendor in its language — sent only after the manager approves it in the assistant.
- The assistant answers "ideas for a Ramadan campaign for Marina Tower, SAR 300K" (built-in or AI, `ideate_campaigns` tool) and "what does the data show today?" (`get_signals`).

## More data to ask about (sample)

So the assistant can answer a wide range of questions, the demo carries four more data sets. All are sample data in the shape the real sources will provide, and the answers say so:
- **Lead profiles** (`lib/audience.ts`): city, nationality, buyer type (end user, investor, first-time), budget band, unit type, age band, reason lost and first-response time for every CRM lead, with qualified and win rates per segment. Derived deterministically from each lead's CRM id (counts, stages and sales are the CRM's own); live, from Yardi's lead record.
- **Creatives** (`lib/creatives.ts`): the ads inside each live campaign (format, message, language, spend, impressions, clicks, leads, qualified, cost per qualified lead, frequency and fatigue), adding up to each campaign's totals; live, from the ad platforms.
- **Market and competitors** (`lib/market.ts`): price per sqm and monthly transactions for Jeddah North, Corniche and South and Riyadh North (2025-01 to 2026-05), off-plan share, mortgage rates, five fictional competitor developers with offers and Meta ad activity, and the marketing calendar; live, from REGA / Ministry of Justice, SAMA, portals and the Meta Ad Library.
- Built-in answers and AI tools (`get_audience`, `get_creatives`, `get_market`, `get_competitors`, `get_calendar`) cover all four.

## Test it in the Claude app (claude.ai artifact)

`npm run demo:build:claude` builds `demo-claude-app.html`, the offline demo as a claude.ai artifact page that declares the artifact runtime's `sample` capability. Opened in the Claude app (web, desktop or mobile), the assistant, the daily second opinion and campaign ideation run on **Claude through the viewer's own Claude account** — no API key — with the same read-only data tools as the live app, executed in the page on the sample data (`scripts/demo-llm-claude.ts`). The viewer is asked once to allow it; if they decline, or outside the Claude app, it falls back to the built-in answers. Downloads go through the artifact's `downloads` capability.

## Daily campaign check (a section of Reports, `/reports#daily-check`; the old `/daily` page redirects there)

Every morning the director checks each live campaign against its own trend and against similar past campaigns (`lib/daily.ts`) and says what to change:
- **Cost to sales far above the channel's history** (e.g. Andalus off-plan 8.5% vs 1.9% for past digital), **cost per qualified lead rising**, **qualified rate dropping**, **lead volume dropping**, **pacing over / under** (not for commission vendors), **winners to scale**, **summer ahead** (past summers cost 3.6% of sales: trim, then scale again in September), **ending soon: extend or let end**, and **CRM feed stale** (no new leads for days, so the other checks are measured to the last normal day).
- Each item has the evidence, the action and the **similar past campaigns with their lesson**.
- Items are stored per day: new today, open since, resolved since yesterday. **Accept / dismiss** (named person, optional note) carries over for up to 14 days while the same finding repeats. Accepting records the decision; the change itself is made on Campaigns or with the agency.
- Open items lead the Director's campaign recommendations, the morning brief, the daily report and the inbox ("Daily campaign check: N open").
- **AI second opinion** (optional): Claude or OpenAI reads the day's check with the history and says what to do first.

## Campaign history (`/history`)

43 past campaigns (2023–2025, sample data in `lib/history.ts`): launches, Ramadan, summer, always-on, events and three Cityscape stands, brand, radio and billboards, across the three current projects, Palm Villas (sold out in 2024) and the corporate brand, including three past vendors (Wajha Events, Sawt FM, Najm Media). Totals: SAR 14.8M spend, SAR 1,014.4M sales, 1.5% cost to sales.
- Benchmarks by channel, season, year, project and vendor; a lesson per campaign; overall lessons (brokers and events convert best; Ramadan with a payment-plan offer works; summer is the weakest season; radio and billboards are the most expensive per sale; a low qualified rate in month one predicts weak sales).
- The daily check, the assistant and the AI tools all use it as the benchmark.

## Oracle integration — supplier invoices (on the Vendors page, `/orchestration#invoices`)

The Invoices page was folded into **Vendors** (`app/_components/InvoicesPanel.tsx`): each vendor's Invoices tab shows only its invoices, POs and deliveries with approve / dispute / reopen, and the all-vendor view sits under the vendor list. `/invoices` redirects there.

Pulls purchase orders and supplier invoices from **Oracle Fusion Cloud Procurement / Payables**
(read-only REST GETs, `lib/oracle.ts`) and reconciles them against what each vendor reported delivering:

- **Checks:** invoice vs delivered spend (>3% warn, >10% critical), billed with no delivery, duplicate invoices, no PO, PO overrun, Oracle validation status, overdue payments, delivered-but-not-invoiced (accrual list).
- **Workflow:** approve clean invoices for payment (single or in bulk), dispute the rest with a reason. Invoices with critical exceptions cannot be approved. Decisions and syncs are stored locally with an audit trail — **nothing is written back to Oracle**.
- **Modes:** `ORACLE_MODE=mock` (default) uses built-in sample data shaped like the Oracle payloads; `ORACLE_MODE=live` needs `ORACLE_BASE_URL`, `ORACLE_USER`, `ORACLE_PASSWORD` (see `.env.example`).
- **Mapping:** vendors are matched by Oracle *Supplier Number* (`Vendor.oracleSupplierNumber`); invoices are matched to campaigns via the PO / description containing the campaign name.
- Live mode has **not been tested against a real Oracle instance**; field names follow the Fusion REST docs and are isolated in `mapInvoice` / `mapPurchaseOrder` in `lib/oracle.ts` for tenant-specific adjustment.

## Vendor agent — score, prove, decide, review, re-bid

The **vendor scoring board** is part of the Vendors page (`/orchestration#scoring`): the fair scorecard ranked as a board (score against the channel benchmark of 50, with its uncertainty range), renewal recommendations with their evidence, the replacement trials, the quarterly business review and the replacement RFP. The old Decisions and Bench pages were removed (`/decisions` and `/bench` redirect there). **Experiments** stays at `/experiments`. The data-source layer runs in the background and is not shown in the menu (the `/data` page still exists for set-up and troubleshooting: source status, reported vs independent figures, vendor-report CSV upload). All bilingual; the assistant answers questions about every part.

1. **Unified data** (`lib/unified.ts`, `docs/data-sources.md`) — vendor reports, ad accounts, CRM and Oracle invoices in one model, with a source of truth per metric. A hidden page (`/data`, not in the menu) shows every source, its coverage, and vendor-reported vs independent figures (spend vs ad platforms, leads vs CRM, contracts vs CRM wins, response time vs CRM). Vendor reports are imported from one canonical CSV template with validation.
2. **Fair scorecard** (`lib/scoring.ts`) — cost per CRM-qualified lead (30%), CRM revenue + stage-weighted pipeline per SAR (30%), spend vs plan (15%, neutral for commission vendors), deadline adherence (15%), revisions (10%). Each metric is indexed against a **channel benchmark adjusted for budget size** (50 = par), multiplied by the measured incremental share where available, and shown with a **score range and confidence**. Benchmarks are assumptions to calibrate (`BENCHMARKS`).
3. **Incrementality** (`lib/incrementality.ts`, `lib/stats.ts`) — audience-holdout and geo-test readouts (lift, 90% interval, share of results the vendor caused, cost per incremental result, significance), a test designer with power calculation (minimum detectable lift), approval before a test starts, and a **media-mix model** (adstock + saturation per channel, ridge regression with trend / Ramadan / summer, block-bootstrap intervals, reliability and data-sufficiency checks). The model fits **weekly CRM-qualified leads** rather than contracted sales (a handful of contracts a week is too lumpy) and is compared with the CRM-attributed qualified leads per channel. Tests take precedence over the model.
4. **Renewal recommendations** (`lib/renewal.ts`) — per vendor: **re-engage, renegotiate, performance plan, test a replacement, or exit**, with evidence, a confidence level (and why), what would change the decision, and targets. Renegotiate / plan / re-engage come with a vendor email (only vendor-safe facts) for human approval.
5. **Vendor reviews** (`lib/reviews.ts`) — quarterly business review per vendor (results vs last quarter and benchmark, delivery, CRM / ad-platform verification, incrementality, billing anomalies, decision and asks), printable and sendable as a draft; billing anomaly detection (invoice spikes vs the campaign's history, on top of the reconciliation checks); a replacement **RFP** generated from the incumbent's data, sendable to bench vendors as drafts in each vendor's language.
6. **Re-bid automatically** (`lib/bench.ts`) — a list of pre-vetted alternatives (shown in the vendor directory under Alternatives); when a vendor is flagged *test replacement* or *exit*, the agent **proposes a paid trial** against the incumbent (budget, brief, CRM code, success criteria). Nothing is spent until a named person approves. Results are read from the CRM by trial code, compared on cost per qualified lead with a confidence level, and the decision (promote / extend / keep) is recorded.

Everything that spends money, withholds spend (tests) or contacts a vendor requires a named approver and is written to the audit trail. All data is sample data until the real sources are connected.


### Campaigns page — every campaign as a dashboard, changed from the chat

`/campaigns` lists every campaign that has run: the live 2026 campaigns (verified: Oracle cost, CRM leads and sales) and the 2023–2025 history (`lib/campaign-boards.ts`). Each campaign has a header (status, vendor, project, channel, season, dates), its figures, and a dashboard with charts: sales and spend by month, leads and qualified by month, the lead-to-contract funnel, cost to sales against the channel's 2023–2025 benchmark, and budget used against flight elapsed. Past campaigns show their lesson; live ones can be paused or resumed. Below the list stay the orchestration recommendations, alerts, CRM verification, the audit trail and the Meta ads review.

What the page lists and what each dashboard shows is a layout (`lib/campaign-layout.ts`, stored in `ViewLayout` with every change in `ViewLayoutChange`, so any change can be undone). Change it from the assistant, in English or Arabic (`lib/campaign-chat.ts`, and the AI tools `get_campaign_dashboards` / `change_campaign_dashboards`):

- figures: "add cost per qualified lead to the campaign dashboards", "remove budget from the campaign cards"
- charts: "remove the funnel from the campaign dashboards", "add the pacing chart to each campaign"; any chart in plain words, drawn for each campaign: "add a chart of qualified leads by month to each campaign dashboard", "add a chart of leads by city to each campaign"
- which campaigns and the order: "show only live campaigns", "show 2024 campaigns on the campaigns page", "only Andalus Quarter campaigns on the dashboards", "sort campaigns by cost to sales"
- "what's on the campaign dashboards?", "undo the last campaign dashboard change", "reset the campaign dashboards"

The page has the same controls for scope, year and order, plus Undo and Reset. After pulling this change run `npx prisma db push` (two new tables).

## Arabic (العربية) and RTL

A language switch in the header flips the whole app between English and Arabic (right-to-left layout, Arabic font, Gregorian dates, Western digits; the choice is remembered).

- **Everything is localised:** UI labels (`lib/i18n-ui.ts`), proper nouns such as vendors, assets and campaigns (`NAMES_AR` in `lib/i18n.ts`), and all generated text — alerts, reconciliation flags, recommendations, audit-trail entries, errors (each template has an English and an Arabic version in the code, with Arabic number agreement such as 3 عقود / 11 عقداً).
- **The assistant understands Arabic** and answers in the language the question was asked in.
- **Vendor emails** are drafted in each vendor's preferred language (`Vendor.language`; ask for "in Arabic" / "بالعربية" to override). Arabic emails use a formal business register and a gender-neutral form of address ("السادة / <vendor> المحترمون"). The AI may only polish wording and must keep the language; set `OUTLOOK_SENDER_NAME_AR` for the signature.
- Arabic strings were written to be natural business Arabic but have **not been reviewed by a native speaker** — have one proof the dictionary and the email templates before sending to vendors. Names of new vendors/campaigns not listed in `NAMES_AR` display as written.

## CRM integration (prepared)

Vendors report their own leads, response times and wins; the CRM is the independent record. The hub has a vendor-neutral CRM layer (`lib/crm.ts`) and shows **vendor-reported vs CRM-verified** numbers on the main page: lead gap, contracts claimed vs won, first-response time measured vs reported (SLA check), never-contacted leads, unattributed leads and a verified cost-to-sales. Mismatches become recommendations (and draftable vendor emails) and are answerable in the assistant.

- `CRM_MODE=mock` (default): sample leads consistent with the campaign data.
- `CRM_MODE=ingest`: any CRM / iPaaS pushes leads to `POST /api/crm/leads` (`x-api-key: $CRM_INGEST_KEY`) in a canonical format; CRM stage names are mapped in `STAGE_MAP`.
- Salesforce / Dynamics 365 pull adapters are **not implemented**; the interface, field mapping and the open questions to settle first (which CRM, campaign-code capture, where first-response time lives, stage names) are in `docs/crm-integration.md`.

## Assistant (chat) — recommendations & vendor emails

A chat assistant ("Ask" button, bottom-right of every page) answers questions about vendors, campaigns (live and past), periods, results, sales conversion and supplier invoices, and hosts the recommendations: it shows them as cards and drafts vendor emails inside the conversation. (There is no separate Recommendations page.)

- **With an AI key** (Claude, OpenAI or Gemini — task `chat`) the model answers anything from the data (`lib/chat-ai.ts`; `CHAT_WITH_AI=off` to disable). It gets a compact snapshot and 20 read-only tools (`lib/query.ts`, plus `ideate_campaigns`): look up any live or past campaign, vendor (current, bench or past), project or channel; totals for any month, quarter or year grouped by vendor, project, channel or campaign; the history and its benchmarks; today's daily check; side-by-side comparisons; invoices; Meta attribution; plus `show_recommendations` and `draft_email`. There is no tool to send or approve.
- **Without a key** (and in the static demo) the built-in answers (`lib/chat.ts`, `lib/chat-extra.ts`) cover: today's brief, daily check and what changed since yesterday, campaign recommendations, approvals, any campaign (by name or code, with benchmark, today's items and similar past campaigns), vendors (current, bench, past), projects, channels, comparisons of 2–4 campaigns / vendors / projects / channels or years, any month / quarter / year, the history (seasons, years, lessons, best / worst, benchmarks), metric definitions, renewals, tests, trials, CRM verification, Meta, invoices, contracts, the plan, reports, orchestration and Kinan — in English and Arabic.
- `npm run chat:eval` asks 145 English and Arabic questions plus 148 off-script phrasings and checks each answer (currently 145/145 and 148/148). Questions the assistant missed in use are listed on Reports → *Questions the assistant missed* (`GET /api/chat/miss`); add each one as a test case when you teach it.

### Charts — any chart, from a prompt or the API (`lib/chart-query.ts`, `/api/chart`)
- The AI writes a chart **query**; the app computes every number. The query sets:
  - a dataset (`campaigns`, `leads`, `creatives`, `invoices`, `vendors`, `market`, `mortgage`, `competitors`, `deliverables`, `work_orders`, `recommendations`, `daily_check`, `targets`, `budget_plan`, `meta`);
  - `x`, plus an optional `series` split;
  - `measures`: formulas such as `sum(spend)*1000/sum(qualified)`, or named measures like `cost_to_sales`, `cpql` or `roas`;
  - `filters`;
  - `period` or `from`/`to`;
  - `transform`: share, cumulative, index, change, change_pct or rank;
  - `sort`, `limit`, `type` (12 chart types) and `title`.
- Formulas are parsed, never `eval`'d.
- `GET /api/chart` returns the catalogue. `POST /api/chart` takes `{ prompt }` (the AI plans the charts; with no key, the built-in reading is used), `{ query }` or `{ queries }`, and returns `{ charts, queries, engine }`.
- Example:
  ```bash
  curl -X POST localhost:3000/api/chart -H 'content-type: application/json' \
    -d '{"query":{"dataset":"campaigns","type":"stacked","x":"year","series":"channel","measures":["sum(spend)"]}}'
  ```
- `npm run chart:eval` runs 53 checks, all part of `npm run chat:eval`:
  - the numbers match the rest of the app;
  - transforms add up;
  - bad queries return guiding errors;
  - 28 demo use cases each return a real chart.
- **Sample-data depth:** none of the live 2026 scenario's numbers change. The extra history fills in around it:
  - **2023–2025 lead profiles:** 63,260 leads, reconstructed so each campaign-month keeps its history totals.
  - **Invoice archive:** 187 paid invoices, one per campaign-month, also shown on each vendor's Invoices tab.
  - **Market and mortgage data:** extended back to 2023.
  - **Competitor ads:** from 2025, based on each competitor's launch date.
  - **Live 2026 seasons:** Ramadan for February–March.
  - **History months:** now add up exactly to each campaign's totals.

### Recommendations and emails

The agent turns vendor performance (`lib/marketing.ts`) and Oracle reconciliation (`lib/invoices.ts`) into a prioritised list (`lib/recommendations.ts`):
SLA breaches, contracts ending soon, campaigns not converting, invoice exceptions, delivered-but-not-invoiced, late payments, budget moves, and who to scale.
Items that need the vendor get a drafted email (built-in templates that may only cite the evidence; the AI can optionally tighten the wording — `lib/email-ai.ts`, off with `DRAFT_WITH_AI=off`).

**Nothing is sent without a human.** The only path to delivery is *Approve & send*, which requires:
a named approver, the exact revision they reviewed (edits bump the revision and re-lock approval), and the "I have read this message" confirmation.
The recipient is fixed to the vendor's account manager; only cc is editable. One email per recommendation; every send is audited.

- **Outlook (Microsoft Graph, `lib/outlook.ts`):** `OUTLOOK_MODE=mock` (default) records the send but delivers nothing and says so in the UI. `OUTLOOK_MODE=live` uses an Entra app registration (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`) and `OUTLOOK_SENDER`; `OUTLOOK_DELIVERY=send` uses `sendMail`, `OUTLOOK_DELIVERY=draft` only creates the message in the sender's Outlook Drafts for a person to send.
- Reading vendor correspondence (Orchestration → vendor → Emails) needs `Mail.Read` on the same mailbox. Restrict the app registration's `Mail.Send` and `Mail.Read` to that one mailbox with an Exchange ApplicationAccessPolicy.
- Vendor addresses in the sample data are `.example` placeholders. Live Graph calls have not been tested against a real tenant.

## Run

Needs Node.js 18.17+.

```bash
cd marketing-hub
npm install
npm run setup        # creates .env from .env.example (all mock, no AI key) and a fresh sample database
npm run dev          # http://localhost:3001
```

For a client demo use `npm run demo:live` instead: it resets the sample data, makes a production build and starts it on port 3001 (pages open instantly). Stop the app before resetting.

Data is seeded on first load (`lib/seed-marketing.ts`, illustrative, Jan–May 2026). Replace it with vendor reporting feeds / CRM sales data to go live. Attribution is last-touch.

Layout: `lib/director.ts` + `app/page.tsx` (director) · `lib/orchestrator.ts` + `app/orchestration/page.tsx` (vendor orchestration) · `lib/reports.ts` + `app/reports/page.tsx` + `app/api/reports/run` (daily reports) · `lib/marketing.ts` + `app/campaigns/page.tsx` (vendors & campaigns) · `lib/kinan.ts` (Kinan feed) · `lib/daily.ts` + `app/daily/page.tsx` (daily campaign check) · `lib/history.ts` + `app/history/page.tsx` (campaign history) · `lib/llm.ts` (Claude / OpenAI / Gemini, task routing) · `lib/ideation.ts` + `app/ideas/page.tsx` (campaign ideas) · `lib/chat.ts`, `lib/chat-extra.ts`, `lib/chat-ai.ts`, `lib/query.ts` (assistant).

## Static demo

`npm run demo:reset && npm run demo:build` builds a single-file `demo.html` (all pages + assistant, in-memory data, offline; built-in answers only, no AI provider).

## Kinan demo package

`npm run demo:package` rebuilds the demo file and writes `../kinan-demo.zip`: `START-HERE.md`, `1-OPEN-ME-demo.html`, `2-demo-kit-capabilities-and-checklist.html` (`docs/demo-kit.html`), the docs, and the app source (`app-source/`, tracked files only — no `.env`, database or `node_modules`). Commit first: the source is taken from the files git tracks.
