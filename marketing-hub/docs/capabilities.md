# AI Assistant Director of Marketing — capabilities

An AI assistant director of marketing for a real-estate developer with **one marketing manager and no marketing team**. It holds the plan to the sales targets, runs the external marketing vendors, measures what they really deliver, decides where the money goes, and tells the manager every morning which campaigns to change. Leads, follow-up and sales stay with **Kinan's own AI agent** (CRM: Yardi); the director reads the CRM results and shares the plan and campaign changes with it. The manager makes the decisions; the director does the rest.

**Ground rule:** nothing that spends money or contacts a vendor or a customer happens without a named person approving it. Every approval is recorded in an audit trail.

---

## 1. Director — plan and decide (home page)

- **Daily brief:** where sales stand against target (CRM-verified), which project is furthest behind, the next month's forecast per project, vendor decisions, risks, what to do this week, and **campaign recommendations**.
- **Campaign recommendations:** today's daily campaign check first, then ranked changes to make to campaigns — pause or shift budget, campaigns not converting, scale up, Meta agency or tracking issues, media spend the ad platforms don't confirm, incrementality tests — each with the reason, what's at stake and one action (open the page, or draft the vendor email for approval). Also in the emailed daily report and the chat.
- **Sales targets:** monthly contracted-sales targets per project, with actual vs target by month.
- **Budget plan:** next month's budget per vendor, moved towards the vendors that bring the most *extra* sales per riyal. Each vendor stays inside the range its renewal decision allows. Shows expected extra sales and the reserve held back.
- **One approval inbox:** everything waiting for the manager in one list, each item with a time estimate and a weekly total ("about 53 minutes for 8 decisions").
- **Campaign quality from the CRM:** every campaign code ranked by qualified and win rate: strongest (fund first), middle, weakest (fix targeting or cut).
- **Leads stay with Kinan:** lead follow-up, sales and the CRM are handled by Kinan's own agent. The director reads CRM results only to judge campaigns and vendors.

## 1a. Daily campaign check — what to change in each campaign, every morning

- Every live campaign is checked against **its own trend** and against **similar past campaigns** (same channel, season or project), and the director says what to change: cut, scale, refresh, renew or let end.
- Checks: cost to sales far above the channel's history; cost per qualified lead rising; qualified rate dropping; lead volume dropping; spending ahead of or behind plan; winners worth scaling; the summer slowdown ahead (trim, then scale again in September); campaigns ending soon (extend or let end); and a stale CRM feed.
- Each item shows the evidence, the action, and the similar past campaigns with what they taught us.
- **Day over day:** new today, open since when, resolved since yesterday. The manager accepts or dismisses each item (with a name and an optional note); the decision carries over while the same issue repeats.
- Feeds the daily brief, the emailed report, the approval inbox and the chat.
- **Optional AI second opinion** (Claude, OpenAI or Gemini): reads the day's check with the history and says what to do first.

## 1c. Campaign ideas

- Ask for ideas with a brief (project, month, budget, goal, audience, notes — or nothing) on the Ideas page or in the chat ("ideas for a Ramadan campaign for Marina Tower, SAR 300K").
- Ideas are grounded in the data: the project's gap to target, the season (Ramadan, summer, Cityscape, after summer), what worked and failed in the 2023–2025 campaigns, today's checks, and which vendors are available (current, bench alternatives, past vendors).
- Each idea has a big idea, audience, offer, headline, channel mix with roles and vendors, a forecast range (contracts, sales, cost to sales) computed from the history, guardrails (stop rule, budget in two halves), a campaign code and holdout for measurement, and the past campaigns it builds on. A channel that is underperforming for the project today is capped automatically.
- With AI, two different models propose ideas and a third step ranks them against the data (score, why, one improvement); without AI, built-in concepts for each season and goal.
- Shortlist, approve or discard with a name. Approving drafts a campaign brief to the lead vendor in its language; it is sent only after the manager approves it.

## 1b. Campaign history — 2023–2025

- 43 past campaigns (sample data, 2023–2025): launches, Ramadan, summer, always-on, events and Cityscape, brand, radio and billboards, across the three current projects, Palm Villas (sold out in 2024) and the corporate brand, including three vendors no longer used. SAR 14.8M spend, SAR 1,014.4M sales, 1.5% cost to sales.
- Benchmarks by channel, season, year, project and vendor; a lesson per campaign and overall lessons (brokers and events convert best; Ramadan with a payment-plan offer works; summer is weakest; radio and billboards cost the most per sale; a low qualified rate in month one predicts weak sales).
- Used as the yardstick by the daily check and the assistant.

## 2. Vendor orchestration — the team's work, done for one manager

- **Vendor directory:** every vendor (current, bench alternatives, past) in one list. Open one to see the campaigns it ran (live and past), its Oracle invoices, its work orders and deliverables, and all email correspondence through Outlook (sent and received).
- **Monthly briefs** per vendor, drafted from the approved plan: budget, campaign codes, cost-per-qualified-lead and response-time targets, deliverables with due dates.
- **Monthly lead feedback** per vendor from the CRM: what converted, the main loss reason, where to shift targeting.
- **Chasing:** late deliverables get up to two reminders, then the manager is asked to phone the vendor.
- **Non-renewal notices** with a handover list (final report, files, account access, final invoice).
- **Verification:** after a message is sent, the director checks the result against the data — deliverables received, spend within ±10% of the briefed budget — and closes the work order.
- **"What vendors owe us":** every expected deliverable, due date, status and reminders. Received items feed each vendor's on-time score.
- **Batch approval:** routine messages and the month's briefs in one click (still with a name and a read confirmation). Emails go out in each vendor's language.

## 3. Daily scheduled reports

- A report every scheduled morning (default 07:30 Riyadh time, Sunday–Thursday, English and Arabic): brief, sales vs target, **what changed since the last report**, **campaign recommendations** (what to change, why, what's at stake and how), decisions waiting with minutes, vendors, risks, invoices, data freshness.
- **Charts in every report:**
  - sales vs target per project (red below 75%, amber 75–95%, green from 95%);
  - sales by month this year;
  - revenue share by vendor;
  - cost to sales by channel (red where it is more than 1.5× the 2023–2025 average).

  The charts are built from plain HTML tables rather than images or SVG, so they look the same in Outlook, Gmail, Apple Mail, on phones, in the app and in the PDF and HTML downloads. Their numbers come from the same chart engine as the assistant, in English and Arabic.
- Emailed through Outlook to internal addresses only; kept in a history to view or download. Optional copy of the brief to Kinan's agent.

## 4. Vendor performance — measured fairly

- **Monitoring:** spend → leads → qualified → viewings → reservations → contracts → sales, per vendor and campaign; cost to sales, cost per lead, budget pacing, alerts (SLA breaches, contracts ending, cost-to-sales above 3%, lead-quality decay).
- **One source of truth per number (in the background):** vendor reports, ad platforms, CRM and Oracle invoices joined behind the scenes; the screens show the verified results, not the plumbing. Vendor-reported vs independently verified figures (spend, leads, contracts, response time).
- **Fair scorecard:** each vendor scored against its own channel's benchmark, adjusted for budget size (50 = par), with a score range and a confidence level.

## 5. Meta ads — which agency runs each campaign

- **Meta connector** (Facebook / Instagram): ad accounts, campaigns, weekly spend, impressions, clicks and leads, the tracking codes on the ads, and who created each campaign (the ad account's activity log).
- **Agency recognition:** Meta doesn't label a campaign with the agency behind it, so the agent works it out from the evidence: our campaign code in the name, `utm_campaign` on the ads, the person and business who created it, and who owns the ad account. Each campaign gets an agency, a campaign code and a confidence level (high / medium / low), with the evidence listed.
- **Catches what needs a human:**
  - an agency that isn't one of your vendors running ads in your account;
  - conflicting evidence (one agency's code on a campaign another agency created);
  - campaigns without tracking codes, whose leads reach the CRM unattributed;
  - your own team's boosted posts, kept separate from agency spend.
- **The manager confirms or corrects** in one click; the agent can learn an unknown creator, but never re-labels an agency it already knows. Only attributed spend counts when checking a vendor's reported media spend.
- **Recommendations:** an urgent alert for an unknown agency, a "who runs this?" decision for conflicts, and a drafted email asking the agency to add campaign codes.

## 6. Proof that a vendor caused the sales (incrementality)

- **Holdout and geo tests:** lift, 90% interval, share of results the vendor actually caused, cost per extra result.
- **Test designer** with a minimum-detectable-lift calculation; tests start only after approval.
- **Media-mix model** across channels (carry-over, saturation, seasonality such as Ramadan and summer) with reliability checks. Controlled tests take precedence.

## 7. Renewal decisions

- Per vendor: **re-engage, renegotiate, performance plan, test a replacement, or exit** — with the evidence, a confidence level, what would change the decision, and targets.

## 8. Vendor reviews and re-bidding

- **Quarterly business review** per vendor, printable and sendable.
- **Billing anomaly detection** (invoice spikes vs the campaign's history).
- **RFP** for a replacement, generated from the incumbent's data and sent to bench vendors.
- **Bench of pre-vetted alternatives:** when a vendor is flagged, the agent proposes a **paid trial** against it; results are read from the CRM by trial code and the winner can be promoted.

## 9. Supplier invoices (Oracle)

- Purchase orders and supplier invoices reconciled against what each vendor delivered: amount variances, billed with no delivery, duplicates, missing POs, PO overruns, overdue payments, delivered-but-not-invoiced.
- Approve clean invoices or dispute with a reason; invoices with critical exceptions cannot be approved. Nothing is written back to Oracle.

## 10. The assistant (chat)

- Ask about targets, the plan, today's check and what changed since yesterday, any campaign (live or past, by name or code), any vendor (current, alternative or past), projects, channels, any month, quarter or year, comparisons, the campaign history and its lessons, metric definitions, tests, trials, invoices, Meta, what vendors owe, the daily report — in **English or Arabic**.
- **Three AI providers built in: Claude (Anthropic), OpenAI and Google Gemini**, with a task router: each kind of work goes to the provider best suited to it (data questions, analysis and Arabic drafting to Claude first; campaign ideation to Gemini plus a second model; long or bulk work to Gemini Flash), and the next provider answers if one fails. With any key, the assistant answers free-form questions using 20 read-only data tools plus campaign ideation. Each answer shows which model wrote it.
- **Without a key** (and in the demo file), built-in answers cover a wide range of questions, including campaign ideas; a 145-question English/Arabic test checks them.
- **Test it in the Claude app:** the demo can be opened as a claude.ai artifact, where the assistant, the daily second opinion and ideation run on Claude through the viewer's own Claude account, with no API key.
- **Charts from a prompt, without limits.** With the AI (Claude, OpenAI, Gemini, or Claude in the Claude app), the assistant writes a chart *query* and the app computes it. So almost any chart the data can support can be asked for. For example:
  - *"Spend by year split by channel"*
  - *"CRM-verified vs vendor-reported sales per vendor"*
  - *"Spend vs sales per vendor as a scatter"*
  - *"Price per sqm by district, indexed"*
  - *"Cumulative 2025 sales"*
  - *"Share of buyer types in each city"*
  - *"Unpaid invoices by vendor"*
  - *"Competitor ads per month"*
  - *"2025 at a glance"* (KPI figures)
  - several charts in one message.
  - **What a query can include:**
    - **8 datasets:** campaigns by month 2023–2026, CRM leads, creatives, invoices, the vendor scorecard, the market, mortgages and competitors.
    - **Groupings:** any dimension (vendor, project, channel, campaign, month, quarter, year, season, city, buyer type, payment status, district and more), plus an optional split into coloured series.
    - **Measures:** any formula (sum, avg, min, max, median, count, distinct with + − × ÷), or a named measure (cost to sales, CPL, CPQL, CAC, ROAS, qualified rate, close rate, win rate, CTR, average deal, reported-vs-CRM overstatement).
    - **Filters and periods:** filters (=, ≠, in, >, <, between, contains) and any period ("Q1 2025", "last 6 months", from/to).
    - **Transforms:** share, cumulative, index, change and rank.
    - **12 chart types:** pie, donut, bars, horizontal bars, stacked, stacked horizontal, side-by-side, line, area, scatter, table and KPI figures.
  - **The numbers are always computed from the data, never typed by the AI.** A ratio is never drawn as a pie, different units are never mixed on one axis (the assistant makes two charts instead), and more than 8 series fold into "Other". 2026 is labelled as partial.
  - **If the AI writes an impossible query,** the app replies with the valid fields and the AI corrects it.
  - **Where the AI can't use tools,** it writes the query as a `chart` block in its reply and the app draws it.
  - **If no chart comes back at all,** the built-in reading of the request is drawn, so a chart request always gets a chart.
  - **Under each chart:** a hover tooltip, a type switcher (only types that suit the data), a table view, and PNG, SVG or CSV download. On phones, legends move under pies and long bar charts turn horizontal.
  - **Through the API:** `GET /api/chart` lists the datasets and fields. `POST /api/chart` takes `{ "prompt": "…" }` (the AI plans one or more charts; without a key, the built-in reading), `{ "query": {…} }` or `{ "queries": [ … ] }`, and returns the computed charts. Any system, including Kinan's agent, a BI tool or a script, can request any chart.
  - **Without an AI key,** the built-in answers still draw the common charts (revenue, spend, leads, contracts, cost to sales by vendor, project, channel, month, year or lead profile), in English and Arabic.
- Shows recommendations as cards and **drafts vendor emails** for approval. The AI can only read and draft — never send, approve or spend.

### Questions nobody anticipated (how the assistant stays reliable)
People can ask anything, so the assistant has five layers of protection:
1. **AI first.** With a Claude, OpenAI or Gemini key, or in the Claude app edition, the AI answers in its own words. It looks things up in the data with 20 read-only tools rather than matching keywords. The built-in rules are only the fallback.
2. **Built-in rules that don't guess.** Specific topics take priority over generic words (for example, "suggest" no longer sends a termination question to the general list). If a question can't be matched, the assistant says so and offers the **closest questions it can answer** as one-click buttons. It does not give a confident wrong answer.
3. **"Related" and "Not what I asked".** Every answer shows related questions. If an answer misses, from the AI or the rules, one click logs it and offers the closest alternatives.
4. **A miss log.** Reports → *Questions the assistant missed* lists every unmatched question and every "Not what I asked", newest first. Each one becomes a new answer, a synonym or a test question.
5. **Regression tests on unseen phrasings.** `npm run chat:eval` checks 145 standard questions and 148 off-script phrasings (paraphrases, informal wording, Arabic dialect and a held-out set written without tuning). Every miss found is added, so a fixed question can't silently break again.

## 10b. Buyers, ads and the market (sample data)

- **Who the campaigns bring:** leads by city, nationality, buyer type, budget, unit type and age, with qualified and win rates per segment; why leads are lost; how response time relates to conversion.
- **Which ads work:** each campaign's creatives by message, format and language, with cost per qualified lead and fatigue warnings.
- **The market:** prices and sales per Jeddah district (and Riyadh), off-plan supply, mortgage rates; competitor developers' offers and ad activity; the marketing calendar.
- Available in the assistant now, as sample data shaped like the real sources (Yardi, the ad platforms, REGA / Ministry of Justice, the Meta Ad Library).

## 11. Vendor emails through Outlook

- Drafts in the vendor's language, using only verifiable facts. Sending needs a named approver, the exact revision reviewed and an "I have read this" confirmation. Recipient is fixed to the vendor's account manager.

## 12. Kinan integration (CRM = Yardi + Kinan's AI agent)

- **Scope:** Kinan's own agent handles leads, follow-up, sales and the CRM. The director reads CRM results and shares marketing context.
- **Outbox to Kinan:** approved plan, campaign status changes, daily brief with campaign recommendations — stored, delivered, retried; signed webhooks (HMAC-SHA256).
- **Kinan's agent can read** targets, the plan, campaign codes, campaign quality and recommendations (API-key protected).

## 13. Arabic

- The whole app, the assistant, vendor emails and the reports switch to Arabic, right-to-left, with Gregorian dates and Western digits.
- **Reply language follows the question:** an English question gets an English answer and an Arabic question an Arabic one, whatever the app language, earlier messages or the viewer's Claude settings. Chart titles follow the same rule.

## Data that would sharpen the recommendations (suggested next connectors)

The recommendations are only as good as the data behind them. In order of value:

1. **Real CRM outcomes with campaign codes** (Yardi via Kinan): qualified, viewing, reservation, contract and value per lead. This matters more than any model.
2. **Google Ads API**, **TikTok Marketing API** and **Snapchat Marketing API**: actual spend, clicks and leads per campaign, to check vendor reports and pacing directly (Meta is already built).
3. **Meta Conversions API / Google offline conversions**: send CRM-qualified and won leads back to the ad platforms, so their bidding optimises for buyers rather than form-fills.
4. **GA4 Data API** (and Search Console): site visits, landing-page conversion and search demand per project, which explain whether a drop is the campaign or the market.
5. **Saudi property market data**: REGA / Ministry of Justice sales transactions, Ejar, and portal listings and prices (Bayut, Aqar, Property Finder), so a weak month can be compared with the market.
6. **Calendar data**: Hijri calendar (Ramadan, Eid), school holidays and events such as Cityscape, to time budgets better than fixed summer and Ramadan rules.
7. **Meta Ad Library API**: competitor developers' active ads and offers.
8. **Call tracking** (e.g. CallRail or a local provider): phone leads by campaign, often the biggest unattributed share in real estate.

---

## Integration status

| Component | In the demo | Status | Needed to go live |
|---|---|---|---|
| Kinan AI agent (shares plan, campaign changes, brief) | Simulated | Built (signed webhook, retries; read-only context API) | Kinan's webhook URL, shared secret, an API key |
| Yardi (reading CRM results) | Sample CRM data | **Not built** | Kinan's Yardi interface licence and credentials; field mapping |
| Outlook (send, and read vendor correspondence) | Simulated | Built, not yet tested on a real tenant | Entra app registration with Mail.Send and Mail.Read, scoped to the marketing mailbox |
| Oracle Fusion (invoices) | Sample data | Built (read-only), not yet tested on a real instance | Oracle user and URL |
| CRM results | Sample data | Ingest API built; Yardi pull pending | Lead results with campaign codes |
| Meta ads (Facebook / Instagram) | Sample accounts and campaigns | Built; live mode written against the Marketing API, not yet run on a real account | A system-user token with `ads_read` (and `business_management` to see partner access); the ad account IDs |
| Other ad platforms (Google, Snap, TikTok) | Sample data | Ingest API built; pull adapters not built | Platform access per account |
| AI: Claude, OpenAI and Gemini with task routing — free-form chat, campaign ideation, AI second opinion, draft polishing | Built-in answers (Claude through your own account in the Claude app edition) | Built, with per-task routing and failover; tested against mock servers | Any of an Anthropic, OpenAI or Gemini API key |
| Report scheduler | "Send now" | Built | A scheduler calling the report endpoint every 15 minutes |

All figures in the demo are **sample data**, frozen on **8 June 2026**.
