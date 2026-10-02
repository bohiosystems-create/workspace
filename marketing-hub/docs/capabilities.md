# AI Director of Marketing — capabilities

An AI assistant director of marketing for a real-estate developer with **one marketing manager and no marketing team**. It holds the plan to the sales targets, runs the external marketing vendors, measures what they really deliver, decides where the money goes, and feeds the work into **Kinan's CRM (Yardi) and Kinan's AI agent**. The manager makes the decisions; the director does the rest.

**Ground rule:** nothing that spends money or contacts a vendor or a customer happens without a named person approving it. Every approval is recorded in an audit trail.

---

## 1. Director — plan and decide (home page)

- **Daily brief:** where sales stand against target (CRM-verified), which project is furthest behind, the next month's forecast per project, vendor decisions, risks, and what to do this week.
- **Sales targets:** monthly contracted-sales targets per project, with actual vs target by month.
- **Budget plan:** next month's budget per vendor, moved towards the vendors that bring the most *extra* sales per riyal. Each vendor stays inside the range its renewal decision allows. Shows expected extra sales and the reserve held back.
- **One approval inbox:** everything waiting for the manager in one list, each item with a time estimate and a weekly total ("about 44 minutes for 8 decisions").
- **Tasks for Kinan's AI agent:** follow up leads nobody contacted within 48 hours; re-engage leads lost on price or financing. Released only after approval.
- **Lead-source quality:** every campaign code ranked by qualified and win rate, with handling guidance (prioritise / standard / deprioritise) sent to Kinan.

## 2. Vendor orchestration — the team's work, done for one manager

- **Monthly briefs** per vendor, drafted from the approved plan: budget, campaign codes, cost-per-qualified-lead and response-time targets, deliverables with due dates.
- **Monthly lead feedback** per vendor from the CRM: what converted, the main loss reason, where to shift targeting.
- **Chasing:** late deliverables get up to two reminders, then the manager is asked to phone the vendor.
- **Non-renewal notices** with a handover list (final report, files, account access, final invoice).
- **Verification:** after a message is sent, the director checks the result against the data — deliverables received, spend within ±10% of the briefed budget — and closes the work order.
- **"What vendors owe us":** every expected deliverable, due date, status and reminders. Received items feed each vendor's on-time score.
- **Batch approval:** routine messages and the month's briefs in one click (still with a name and a read confirmation). Emails go out in each vendor's language.

## 3. Daily scheduled reports

- A report every scheduled morning (default 07:30 Riyadh time, Sunday–Thursday, English and Arabic): brief, sales vs target, **what changed since the last report**, decisions waiting with minutes, vendors, leads and Kinan, risks, invoices, data freshness.
- Emailed through Outlook to internal addresses only; kept in a history to view or download. Optional copy of the brief to Kinan's agent.

## 4. Vendor performance — measured fairly

- **Monitoring:** spend → leads → qualified → viewings → reservations → contracts → sales, per vendor and campaign; cost to sales, cost per lead, budget pacing, alerts (SLA breaches, contracts ending, cost-to-sales above 3%, lead-quality decay).
- **One source of truth per number:** vendor reports, ad platforms, CRM and Oracle invoices side by side. Vendor-reported vs independently verified figures (spend, leads, contracts, response time).
- **Fair scorecard:** each vendor scored against its own channel's benchmark, adjusted for budget size (50 = par), with a score range and a confidence level.

## 5. Proof that a vendor caused the sales (incrementality)

- **Holdout and geo tests:** lift, 90% interval, share of results the vendor actually caused, cost per extra result.
- **Test designer** with a minimum-detectable-lift calculation; tests start only after approval.
- **Media-mix model** across channels (carry-over, saturation, seasonality such as Ramadan and summer) with reliability checks. Controlled tests take precedence.

## 6. Renewal decisions

- Per vendor: **re-engage, renegotiate, performance plan, test a replacement, or exit** — with the evidence, a confidence level, what would change the decision, and targets.

## 7. Vendor reviews and re-bidding

- **Quarterly business review** per vendor, printable and sendable.
- **Billing anomaly detection** (invoice spikes vs the campaign's history).
- **RFP** for a replacement, generated from the incumbent's data and sent to bench vendors.
- **Bench of pre-vetted alternatives:** when a vendor is flagged, the agent proposes a **paid trial** against it; results are read from the CRM by trial code and the winner can be promoted.

## 8. Supplier invoices (Oracle)

- Purchase orders and supplier invoices reconciled against what each vendor delivered: amount variances, billed with no delivery, duplicates, missing POs, PO overruns, overdue payments, delivered-but-not-invoiced.
- Approve clean invoices or dispute with a reason; invoices with critical exceptions cannot be approved. Nothing is written back to Oracle.

## 9. The assistant (chat)

- Ask anything about targets, the plan, vendors, campaigns, tests, trials, invoices, what vendors owe, the daily report — in **English or Arabic**.
- Shows recommendations as cards and **drafts vendor emails** for approval. With a Claude API key it answers free-form questions; without one, built-in answers cover the common questions.

## 10. Vendor emails through Outlook

- Drafts in the vendor's language, using only verifiable facts. Sending needs a named approver, the exact revision reviewed and an "I have read this" confirmation. Recipient is fixed to the vendor's account manager.

## 11. Kinan integration (CRM = Yardi + Kinan's AI agent)

- **Outbox to Kinan:** approved plan, lead follow-up tasks, lead-source quality, campaign status changes, daily brief — stored, delivered, retried; signed webhooks (HMAC-SHA256).
- **Kinan's agent can read** priorities, source quality, campaign codes and open tasks, and **report back** contacts, outcomes and completed tasks (API-key protected). Those outcomes update the CRM view and the reports.

## 12. Arabic

- The whole app, the assistant, vendor emails and the reports switch to Arabic, right-to-left, with Gregorian dates and Western digits.

---

## Integration status

| Component | In the demo | Status | Needed to go live |
|---|---|---|---|
| Kinan AI agent (outbound) | Simulated | Built (signed webhook, retries) | Kinan's webhook URL and shared secret |
| Kinan AI agent (inbound) | Simulated reply button | Built (context + feedback APIs) | Exchange an API key with Kinan |
| Yardi | Simulated | **Not built** | Kinan's Yardi interface licence and credentials; field mapping |
| Outlook | Simulated | Built, not yet tested on a real tenant | Entra app registration, sending mailbox |
| Oracle Fusion (invoices) | Sample data | Built (read-only), not yet tested on a real instance | Oracle user and URL |
| CRM leads | Sample data | Ingest API built; Yardi pull pending | Lead feed with campaign codes |
| Ad platforms | Sample data | Interface prepared | Platform access per vendor account |
| Claude (free-form chat) | Built-in answers | Built | Anthropic API key |
| Report scheduler | "Send now" | Built | A scheduler calling the report endpoint every 15 minutes |

All figures in the demo are **sample data**, frozen on **8 June 2026**.
