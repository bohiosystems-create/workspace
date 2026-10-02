# AI Director of Marketing — capabilities

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
- **Optional AI second opinion** (Claude or OpenAI): reads the day's check with the history and says what to do first.

## 1b. Campaign history — 2024–2025

- 22 past campaigns (sample data): launches, Ramadan, summer, always-on, events, brand, radio and billboards, across the three projects and nine vendors, including three vendors no longer used. SAR 8.2M spend, SAR 555.7M sales, 1.5% cost to sales.
- Benchmarks by channel, season, year, project and vendor; a lesson per campaign and overall lessons (brokers and events convert best; Ramadan with a payment-plan offer works; summer is weakest; radio and billboards cost the most per sale; a low qualified rate in month one predicts weak sales).
- Used as the yardstick by the daily check and the assistant.

## 2. Vendor orchestration — the team's work, done for one manager

- **Monthly briefs** per vendor, drafted from the approved plan: budget, campaign codes, cost-per-qualified-lead and response-time targets, deliverables with due dates.
- **Monthly lead feedback** per vendor from the CRM: what converted, the main loss reason, where to shift targeting.
- **Chasing:** late deliverables get up to two reminders, then the manager is asked to phone the vendor.
- **Non-renewal notices** with a handover list (final report, files, account access, final invoice).
- **Verification:** after a message is sent, the director checks the result against the data — deliverables received, spend within ±10% of the briefed budget — and closes the work order.
- **"What vendors owe us":** every expected deliverable, due date, status and reminders. Received items feed each vendor's on-time score.
- **Batch approval:** routine messages and the month's briefs in one click (still with a name and a read confirmation). Emails go out in each vendor's language.

## 3. Daily scheduled reports

- A report every scheduled morning (default 07:30 Riyadh time, Sunday–Thursday, English and Arabic): brief, sales vs target, **what changed since the last report**, **campaign recommendations** (what to change, why, what's at stake and how), decisions waiting with minutes, vendors, risks, invoices, data freshness.
- Emailed through Outlook to internal addresses only; kept in a history to view or download. Optional copy of the brief to Kinan's agent.

## 4. Vendor performance — measured fairly

- **Monitoring:** spend → leads → qualified → viewings → reservations → contracts → sales, per vendor and campaign; cost to sales, cost per lead, budget pacing, alerts (SLA breaches, contracts ending, cost-to-sales above 3%, lead-quality decay).
- **One source of truth per number:** vendor reports, ad platforms, CRM and Oracle invoices side by side. Vendor-reported vs independently verified figures (spend, leads, contracts, response time).
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
- **Two AI providers built in: Anthropic (Claude) and OpenAI.** With either key, the assistant answers free-form questions using 13 read-only data tools. If one provider is down, the other answers. Each answer shows which model wrote it.
- **Without a key** (and in the demo file), built-in answers cover a wide range of questions; a 92-question English/Arabic test checks them.
- Shows recommendations as cards and **drafts vendor emails** for approval. The AI can only read and draft — never send, approve or spend.

## 11. Vendor emails through Outlook

- Drafts in the vendor's language, using only verifiable facts. Sending needs a named approver, the exact revision reviewed and an "I have read this" confirmation. Recipient is fixed to the vendor's account manager.

## 12. Kinan integration (CRM = Yardi + Kinan's AI agent)

- **Scope:** Kinan's own agent handles leads, follow-up, sales and the CRM. The director reads CRM results and shares marketing context.
- **Outbox to Kinan:** approved plan, campaign status changes, daily brief with campaign recommendations — stored, delivered, retried; signed webhooks (HMAC-SHA256).
- **Kinan's agent can read** targets, the plan, campaign codes, campaign quality and recommendations (API-key protected).

## 13. Arabic

- The whole app, the assistant, vendor emails and the reports switch to Arabic, right-to-left, with Gregorian dates and Western digits.

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
| Outlook | Simulated | Built, not yet tested on a real tenant | Entra app registration, sending mailbox |
| Oracle Fusion (invoices) | Sample data | Built (read-only), not yet tested on a real instance | Oracle user and URL |
| CRM results | Sample data | Ingest API built; Yardi pull pending | Lead results with campaign codes |
| Meta ads (Facebook / Instagram) | Sample accounts and campaigns | Built; live mode written against the Marketing API, not yet run on a real account | A system-user token with `ads_read` (and `business_management` to see partner access); the ad account IDs |
| Other ad platforms (Google, Snap, TikTok) | Sample data | Ingest API built; pull adapters not built | Platform access per account |
| AI: Anthropic (Claude) and OpenAI — free-form chat, AI second opinion, draft polishing | Built-in answers | Built, with automatic failover; tested against mock servers | An Anthropic and/or OpenAI API key |
| Report scheduler | "Send now" | Built | A scheduler calling the report endpoint every 15 minutes |

All figures in the demo are **sample data**, frozen on **8 June 2026**.
