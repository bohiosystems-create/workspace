# Data sources — the unified vendor data model

Vendors report their own results. The agent never scores a vendor on those reports alone: each metric
comes from an independent source of truth, and the vendor's own figures are kept only to show the gap.

| Metric | Source of truth | Fallback |
|---|---|---|
| Cost | Oracle supplier invoices + accrued delivery not yet invoiced (disputed / duplicate invoices excluded) | vendor-reported spend |
| Leads, qualified leads (QUALIFIED and later stages), wins, sales value | CRM | vendor report |
| Pipeline influenced | CRM open opportunities × stage weight (qualified 10%, viewing 25%, reserved 60%) | — |
| First-response time | CRM (first human response) | vendor report |
| Media actually bought | Ad platforms (Meta, Google, Snap, TikTok) — checks the vendor's reported media spend | — |
| Deadlines, revisions | Deliverables tracker | — |
| Media-mix model input | Weekly spend per channel + weekly CRM sales (≥ 52 weeks) | — |

Code: `lib/unified.ts` (model), `lib/adaccounts.ts`, `lib/vendor-reports.ts`, `lib/crm.ts`, `lib/oracle.ts`.

## Connecting each source

| Source | Setting | Status |
|---|---|---|
| Vendor reports | CSV upload on the `/data` page (not in the menu), or `POST /api/ingest/vendor-report` | **Built** (template: `GET /api/ingest/vendor-report`) |
| Ad accounts | `ADS_MODE=mock` (default) · `ingest` → `POST /api/ingest/ad-spend` · `meta` / `google` pull adapters | push **built**; pull adapters **not implemented** |
| Meta ads | `META_MODE=mock` (default) · `live` (Marketing API) · `off` — accounts, campaigns, creator, utm codes, weekly insights; agency attribution in `lib/meta.ts` | **built**; live mode not yet run on a real account |
| CRM | `CRM_MODE=mock` · `ingest` → `POST /api/crm/leads` · `salesforce` / `dynamics` | push **built**; pull adapters **not implemented** (see `crm-integration.md`) |
| Oracle | `ORACLE_MODE=mock` · `live` (read-only REST) | **built**, live mode untested against a real instance |
| Outlook | `OUTLOOK_MODE=mock` · `live` (Microsoft Graph, human-approved sends only) | **built**, live mode untested against a real tenant |
| Deliverables | sample data; connect a PM tool (Asana / Jira / Monday) or upload | **not connected** |
| Media-mix history | sample 104 weeks; load real weekly spend per channel + CRM sales | **sample only** |

All push endpoints require the `x-api-key` header (`INGEST_API_KEY`, or `CRM_INGEST_KEY` for the CRM) and are disabled when the key is not set.

### Ad-spend push format
```json
{ "rows": [ { "week": "2026-06-01", "platform": "META", "campaignCode": "ASH-SEARCH-26",
              "spendSar": 23500, "impressions": 520000, "clicks": 6100, "platformLeads": 96 } ] }
```
`week` is the Monday of the week; `campaignCode` must match the campaign's CRM / UTM code. Re-sending a row replaces it.

### Vendor report template (CSV, one row per campaign and month)
`campaign_code, month (YYYY-MM), spend_sar, leads, qualified, viewings, reservations, contracts, sales_sar, avg_response_hours`
Rows with unknown campaign codes, bad months, negative numbers, or funnels that do not narrow are rejected with the line number and reason.

## What still needs the client
1. Read access to each ad account (or a scheduled export pushed to the ingest endpoint).
2. Consistent campaign codes on every lead and ad campaign (UTM `utm_campaign` = `Campaign.crmCode`).
3. The CRM and its stage names / first-response field (see `crm-integration.md`).
4. Where deliverables are tracked today.
5. Two years of weekly spend per channel and sales for the media-mix model; until then use it as directional only and rely on holdout / geo tests for decisions.
