# Bohio — Marketing Hub (standalone)

Monitor and orchestrate external marketing vendors: the campaigns they run per
asset, their results, and how spend translates into contracted sales. Separate
app with its own database — no dependency on `deal-screener`.

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

## Recommendations & vendor emails (`/actions`)

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

Layout: `lib/marketing.ts` (compute, alerts, recommendations, actions) · `app/api/marketing/route.ts` · `app/page.tsx` · `lib/claude.ts`.

## Static demo

`npx tsx scripts/dump-data.ts && node scripts/build-demo.mjs` builds a single-file `demo.html` (both pages, in-memory data, offline).
