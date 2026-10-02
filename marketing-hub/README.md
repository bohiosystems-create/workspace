# Bohio — AI Director of Marketing (standalone)

An AI assistant director of marketing for a company with **one marketing manager
and no marketing team**: it holds the plan to the sales targets, runs the
external marketing vendors (briefs, feedback, chasing, verification), decides
where the money goes, and feeds approved work into **Kinan's CRM (Yardi) and
Kinan's AI agent**. The manager only approves. Separate
app with its own database — no dependency on `deal-screener`.

**Client demo:** capabilities in [`docs/capabilities.md`](docs/capabilities.md), step-by-step script in [`docs/demo-checklist.md`](docs/demo-checklist.md). `npm run demo:reset` gives the live app a clean sample database; `npm run demo:build` rebuilds the one-file demo (`demo.html`). In mock mode, "Simulate Kinan's reply" on the Director page plays Kinan's agent reporting back through the real feedback API.

## Director (`/`) and the Kinan feed

The home page is the director's desk (`lib/director.ts`, `app/page.tsx`); vendor and campaign monitoring moved to `/campaigns`.

- **Today's brief** — sales vs target year to date (CRM-verified), the asset furthest behind, June forecast per asset, vendor calls, risks and what to do this week. Also answerable in the assistant ("What's today's brief?").
- **Targets** — monthly contracted-sales targets per asset (`SalesTarget`, sample values Jan–Jun 2026), actual vs target by month.
- **Approval inbox** — everything waiting for a named person: delegations, vendor non-renewals, trials to approve or read out, invoice exceptions, email drafts.
- **Budget plan** — next month's budget per vendor, inside the range each vendor's renewal decision allows (exit, test a replacement, performance plan, renegotiate, re-engage; commission vendors ±10%). Money moves to the highest incremental sales per SAR with diminishing returns (sales ∝ spend^0.7); the plan shows expected incremental sales vs unchanged and what is held in reserve. Indicative, not a promise.
- **Your time** — every item in the inbox carries a time estimate; the brief says how many minutes of decisions the week needs.
- **Delegations to Kinan's AI agent** — e.g. *follow up leads nobody contacted within 48h* and *re-engage leads lost on price or financing*. A task that leads to customers being contacted is only sent to Kinan after a named approver approves it.
- **Lead-source quality** — every campaign code ranked by qualified and win rate (percentiles): prioritise / standard / deprioritise, with handling guidance for Kinan's agent and Yardi.

## Vendor orchestration (`/orchestration`)

The work a marketing team would do with the vendors, done by the director (`lib/orchestrator.ts`). Each item is a **work order** — an email draft in the vendor's language that is only sent after the manager approves it:

| Work order | When | Closed when |
|---|---|---|
| **Monthly brief** — budget, campaign codes, cost-per-qualified-lead and response targets, deliverables with due dates | the month's budget plan is approved | deliverables received **and** spend within ±10% of the briefed budget (ad platforms / vendor report) |
| **Lead feedback** — per campaign code: CRM leads, qualified %, wins, top loss reason; where to shift targeting | monthly, per vendor | sent (routine) |
| **Reminder** — for a late deliverable; 2 reminders 3 days apart, then an **escalation** asking the manager to call | weekly | the deliverable is received (routine) |
| **Non-renewal notice** — with handover list (final report, files, account access, final invoice) | the agent recommends exit | handover pack received |

- **Approvals for one person:** routine work orders (feedback, reminders — no money, no contract change) and the month's briefs (the money was decided when the plan was approved) can be approved in one batch; each still requires the approver's name, an "I have read" confirmation and the exact revision reviewed. Notices are approved one by one. Wording can be edited from the assistant's drafts.
- **What vendors owe us:** every expected deliverable with due date, status and reminders sent. Received items feed the scorecard's deadline-adherence metric. Until vendor replies are read from Outlook (Graph `Mail.Read`, not built yet), the manager marks items received in one click.
- **Operating rhythm:** daily lead-response watch, weekly chasing, monthly plan → briefs → feedback → reports, quarterly reviews / renewals / re-bids. `POST /api/orchestration {"action":"RUN"}` runs a cycle (point a scheduler at it).
- The sample data runs on a fixed clock (`lib/clock.ts`, 8 June 2026); switch it to the real date when live feeds are connected.

## Meta ads — which agency runs each campaign (`/data#meta`)

`lib/meta.ts` reads Meta ad accounts and campaigns (`META_MODE=mock` default · `live` · `off`). Meta does not say which agency runs a campaign, so the agent attributes each one from evidence:
- **Campaign code in the name**, **`utm_campaign` on the ads** (also what lets the CRM credit leads), the **creator** (ad-account activity log, `create_campaign_group`) mapped to an agency's Business Manager or user, and the **ad-account owner**.
- Result per campaign: agency + campaign code + confidence (HIGH / MEDIUM / LOW), or **in-house** (the client's own people), **not one of your agencies** (a business with partner access but no contract), **conflict** (evidence points at two vendors).
- A missing code is inferred from the agency's other campaigns in the same account, and flagged.
- Only attributed spend (HIGH/MEDIUM, or confirmed) is written to the ad-platform figures that check each vendor's reported media spend.
- The manager confirms or corrects on Data Sources → Meta. "Remember this creator" teaches the agent an unknown creator, but never re-labels a known agency.
- Recommendations: unknown agency (urgent), conflict (decide), no tracking codes (vendor email).
- The Director inbox shows campaigns to check, and the assistant answers "which agency runs each Meta campaign?".
- **Live mode** (`META_ACCESS_TOKEN` system-user token with `ads_read` + `business_management`, `META_AD_ACCOUNT_IDS`, `META_API_VERSION`) is written against the Marketing API (account + `agencies`, `campaigns`, `activities`, `ads{creative{url_tags}}`, weekly `insights`) and **has not been run against a real account**. In live mode, agencies' businesses or users are learned from confirmations (no sample identities).

## Daily scheduled reports (`/reports`)

The director writes the manager's daily report (`lib/reports.ts`) and emails it through Outlook:

- **Content** (same data as the Director page, no AI needed): headline and brief; sales vs target per project with the month's forecast; **what changed since the last report** (sales, decisions waiting, uncontacted leads, late deliverables, overdue work orders, invoice exceptions, overdue payments, failed Kinan deliveries, critical risks — compared with the stored snapshot of the previous report); decisions waiting with minutes; vendors (escalations, late deliverables, exits / replacements); leads and Kinan (uncontacted leads, last 24h of the Kinan feed, best and weakest sources); risks; supplier invoices; data freshness. HTML email (RTL for Arabic) plus a text version; every report is kept in the history and can be viewed or downloaded.
- **Schedule** (set on the page, change recorded with a name): time, timezone (default 07:30 Asia/Riyadh), days (default Sunday–Thursday), language(s), recipients, optional copy of the brief to Kinan's agent (`brief.daily`).
- **Trigger:** a scheduler calls `POST /api/reports/run` every 15 minutes with `x-api-key: $REPORTS_CRON_KEY` (or `Authorization: Bearer …`, so Vercel Cron works). It sends once per local day, at or after the set time, on scheduled days — a missed slot is sent at the next check that day; repeated calls do nothing. Without `REPORTS_CRON_KEY` the endpoint is disabled; "Send now" and "Preview" still work.
- **Internal only:** recipients must be on `REPORTS_ALLOWED_DOMAINS` (default: the domain of `OUTLOOK_SENDER`). Reports are always sent, never left as Outlook drafts, and take no action — approvals stay in the app.

**Kinan connector** (`lib/kinan.ts`, `docs/kinan-integration.md`): an outbox (`KinanEvent`) that stores every event, delivers it and retries failures — `lead.followup_requested`, `lead_source.quality`, `director.plan_approved`, `campaign.status_changed`, `brief.daily`.

- `KINAN_MODE=mock` (default) records events without sending; `KINAN_MODE=webhook` POSTs to `KINAN_AGENT_WEBHOOK_URL`, signed with HMAC-SHA256 (`X-Bohio-Signature: sha256=…`, secret `KINAN_WEBHOOK_SECRET`).
- Kinan's agent reads `GET /api/kinan/context` (priorities, source quality, campaign codes, open tasks) and reports back on `POST /api/kinan/feedback` (`lead.contacted`, `lead.outcome`, `task.done`), both with `x-api-key: $KINAN_API_KEY`.
- **Yardi delivery is not implemented** (`YARDI_MODE=mock` only): it needs Kinan's Yardi interface licence and credentials. `CRM_MODE=yardi` is reserved for pulling leads from Yardi. The questions to settle with Kinan are in `docs/kinan-integration.md`.

- **Monitor** — spend → leads → qualified → viewings → reservations → contracts → sales; cost-to-sales, CAC, CPL, budget pacing; 0–100 vendor scorecard (efficiency 40, quality 25, SLA responsiveness 20, delivery 15).
- **Alerts** — SLA breaches, contract expiry, cost-to-sales > 3%, CPL inflation, lead-quality decay, pacing, vendor concentration.
- **Orchestrate** — recommended Pause / Shift-budget actions, one-click apply, plus manual Pause/Resume; every action is written to an audit trail.
- **Claude** — vendor briefing and drafted notes to vendors (optional; needs `ANTHROPIC_API_KEY`). All numbers are computed in code.

## Oracle integration — supplier invoices (`/invoices`)

Pulls purchase orders and supplier invoices from **Oracle Fusion Cloud Procurement / Payables**
(read-only REST GETs, `lib/oracle.ts`) and reconciles them against what each vendor reported delivering:

- **Checks:** invoice vs delivered spend (>3% warn, >10% critical), billed with no delivery, duplicate invoices, no PO, PO overrun, Oracle validation status, overdue payments, delivered-but-not-invoiced (accrual list).
- **Workflow:** approve clean invoices for payment (single or in bulk), dispute the rest with a reason. Invoices with critical exceptions cannot be approved. Decisions and syncs are stored locally with an audit trail — **nothing is written back to Oracle**.
- **Modes:** `ORACLE_MODE=mock` (default) uses built-in sample data shaped like the Oracle payloads; `ORACLE_MODE=live` needs `ORACLE_BASE_URL`, `ORACLE_USER`, `ORACLE_PASSWORD` (see `.env.example`).
- **Mapping:** vendors are matched by Oracle *Supplier Number* (`Vendor.oracleSupplierNumber`); invoices are matched to campaigns via the PO / description containing the campaign name.
- Live mode has **not been tested against a real Oracle instance**; field names follow the Fusion REST docs and are isolated in `mapInvoice` / `mapPurchaseOrder` in `lib/oracle.ts` for tenant-specific adjustment.

## Vendor agent — score, prove, decide, review, re-bid

Pages: **Decisions** (`/decisions`), **Experiments** (`/experiments`), **Bench & Trials** (`/bench`), **Data Sources** (`/data`). All bilingual; the assistant answers questions about every part.

1. **Unified data** (`lib/unified.ts`, `docs/data-sources.md`) — vendor reports, ad accounts, CRM and Oracle invoices in one model, with a source of truth per metric. The Data Sources page shows every source, its coverage, and vendor-reported vs independent figures (spend vs ad platforms, leads vs CRM, contracts vs CRM wins, response time vs CRM). Vendor reports are imported from one canonical CSV template with validation.
2. **Fair scorecard** (`lib/scoring.ts`) — cost per CRM-qualified lead (30%), CRM revenue + stage-weighted pipeline per SAR (30%), spend vs plan (15%, neutral for commission vendors), deadline adherence (15%), revisions (10%). Each metric is indexed against a **channel benchmark adjusted for budget size** (50 = par), multiplied by the measured incremental share where available, and shown with a **score range and confidence**. Benchmarks are assumptions to calibrate (`BENCHMARKS`).
3. **Incrementality** (`lib/incrementality.ts`, `lib/stats.ts`) — audience-holdout and geo-test readouts (lift, 90% interval, share of results the vendor caused, cost per incremental result, significance), a test designer with power calculation (minimum detectable lift), approval before a test starts, and a **media-mix model** (adstock + saturation per channel, ridge regression with trend / Ramadan / summer, block-bootstrap intervals, reliability and data-sufficiency checks). Tests take precedence over the model.
4. **Renewal recommendations** (`lib/renewal.ts`) — per vendor: **re-engage, renegotiate, performance plan, test a replacement, or exit**, with evidence, a confidence level (and why), what would change the decision, and targets. Renegotiate / plan / re-engage come with a vendor email (only vendor-safe facts) for human approval.
5. **Vendor reviews** (`lib/reviews.ts`) — quarterly business review per vendor (results vs last quarter and benchmark, delivery, CRM / ad-platform verification, incrementality, billing anomalies, decision and asks), printable and sendable as a draft; billing anomaly detection (invoice spikes vs the campaign's history, on top of the reconciliation checks); a replacement **RFP** generated from the incumbent's data, sendable to bench vendors as drafts in each vendor's language.
6. **Re-bid automatically** (`lib/bench.ts`) — a bench of pre-vetted alternatives; when a vendor is flagged *test replacement* or *exit*, the agent **proposes a paid trial** against the incumbent (budget, brief, CRM code, success criteria). Nothing is spent until a named person approves. Results are read from the CRM by trial code, compared on cost per qualified lead with a confidence level, and the decision (promote / extend / keep) is recorded.

Everything that spends money, withholds spend (tests) or contacts a vendor requires a named approver and is written to the audit trail. All data is sample data until the real sources are connected.

## Arabic (العربية) and RTL

A language switch in the header flips the whole app between English and Arabic (right-to-left layout, Arabic font, Gregorian dates, Western digits; the choice is remembered).

- **Everything is localised:** UI labels (`lib/i18n-ui.ts`), proper nouns such as vendors, assets and campaigns (`NAMES_AR` in `lib/i18n.ts`), and all generated text — alerts, reconciliation flags, recommendations, audit-trail entries, errors (each template has an English and an Arabic version in the code, with Arabic number agreement such as 3 عقود / 11 عقداً).
- **The assistant understands Arabic** and answers in the language the question was asked in.
- **Vendor emails** are drafted in each vendor's preferred language (`Vendor.language`; ask for "in Arabic" / "بالعربية" to override). Arabic emails use a formal business register and a gender-neutral form of address ("السادة / <vendor> المحترمون"). Claude may only polish wording and must keep the language; set `OUTLOOK_SENDER_NAME_AR` for the signature.
- Arabic strings were written to be natural business Arabic but have **not been reviewed by a native speaker** — have one proof the dictionary and the email templates before sending to vendors. Names of new vendors/campaigns not listed in `NAMES_AR` display as written.

## CRM integration (prepared)

Vendors report their own leads, response times and wins; the CRM is the independent record. The hub has a vendor-neutral CRM layer (`lib/crm.ts`) and shows **vendor-reported vs CRM-verified** numbers on the main page: lead gap, contracts claimed vs won, first-response time measured vs reported (SLA check), never-contacted leads, unattributed leads and a verified cost-to-sales. Mismatches become recommendations (and draftable vendor emails) and are answerable in the assistant.

- `CRM_MODE=mock` (default): sample leads consistent with the campaign data.
- `CRM_MODE=ingest`: any CRM / iPaaS pushes leads to `POST /api/crm/leads` (`x-api-key: $CRM_INGEST_KEY`) in a canonical format; CRM stage names are mapped in `STAGE_MAP`.
- Salesforce / Dynamics 365 pull adapters are **not implemented**; the interface, field mapping and the open questions to settle first (which CRM, campaign-code capture, where first-response time lives, stage names) are in `docs/crm-integration.md`.

## Assistant (chat) — recommendations & vendor emails

A chat assistant ("Ask" button, bottom-right of every page) answers questions about vendors, campaigns, results, sales conversion and supplier invoices, and hosts the recommendations: it shows them as cards and drafts vendor emails inside the conversation. (There is no separate Recommendations page.)

- **Engine:** with `ANTHROPIC_API_KEY` set, Claude answers from a snapshot of the data using tools (`lib/chat-ai.ts`; `CHAT_WITH_AI=off` to disable). Without a key — and in the static demo — a built-in rules answerer handles the common questions (`lib/chat.ts`), and the UI says so.
- **Claude can only draft.** Its tools are `show_recommendations` and `draft_email`; there is no tool to send or approve.

### Recommendations and emails

The agent turns vendor performance (`lib/marketing.ts`) and Oracle reconciliation (`lib/invoices.ts`) into a prioritised list (`lib/recommendations.ts`):
SLA breaches, contracts ending soon, campaigns not converting, invoice exceptions, delivered-but-not-invoiced, late payments, budget moves, and who to scale.
Items that need the vendor get a drafted email (built-in templates that may only cite the evidence; Claude can optionally tighten the wording — `lib/email-ai.ts`, off with `DRAFT_WITH_AI=off`).

**Nothing is sent without a human.** The only path to delivery is *Approve & send*, which requires:
a named approver, the exact revision they reviewed (edits bump the revision and re-lock approval), and the "I have read this message" confirmation.
The recipient is fixed to the vendor's account manager; only cc is editable. One email per recommendation; every send is audited.

- **Outlook (Microsoft Graph, `lib/outlook.ts`):** `OUTLOOK_MODE=mock` (default) records the send but delivers nothing and says so in the UI. `OUTLOOK_MODE=live` uses an Entra app registration (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`) and `OUTLOOK_SENDER`; `OUTLOOK_DELIVERY=send` uses `sendMail`, `OUTLOOK_DELIVERY=draft` only creates the message in the sender's Outlook Drafts for a person to send.
- Restrict the app registration's `Mail.Send` to the one mailbox with an Exchange ApplicationAccessPolicy.
- Vendor addresses in the sample data are `.example` placeholders. Live Graph calls have not been tested against a real tenant.

## Run

```bash
cd marketing-hub
cp .env.example .env
npm install
npm run db:push
npm run dev          # http://localhost:3001
```

Data is seeded on first load (`lib/seed-marketing.ts`, illustrative, Jan–May 2026). Replace it with vendor reporting feeds / CRM sales data to go live. Attribution is last-touch.

Layout: `lib/director.ts` + `app/page.tsx` (director) · `lib/orchestrator.ts` + `app/orchestration/page.tsx` (vendor orchestration) · `lib/reports.ts` + `app/reports/page.tsx` + `app/api/reports/run` (daily reports) · `lib/marketing.ts` + `app/campaigns/page.tsx` (vendors & campaigns) · `lib/kinan.ts` (Kinan feed) · `lib/claude.ts`.

## Static demo

`npx tsx scripts/dump-data.ts && node scripts/build-demo.mjs` builds a single-file `demo.html` (all pages + assistant, in-memory data, offline).
