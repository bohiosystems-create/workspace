# CRM integration — what is built, what is needed

**Goal.** Vendors report their own leads, response times and wins. The CRM is the independent record. With it,
the hub can show *vendor-reported vs CRM-verified* numbers, flag inflated lead counts, measure the real
first-response time against each contract's SLA, and compute cost-to-sales on signed deals.

## What exists today
| Piece | Where |
|---|---|
| Canonical lead contract + stage mapping | `lib/crm.ts` (`CanonicalLead`, `STAGE_MAP`) |
| Adapter interface (`fetchLeads`) | `lib/crm.ts` (`CrmAdapter`) |
| Mock CRM (default, consistent with campaign data) | `CRM_MODE=mock` |
| Push endpoint for any CRM / iPaaS | `POST /api/crm/leads` (header `x-api-key: $CRM_INGEST_KEY`) — `CRM_MODE=ingest` |
| Reconciliation + flags (lead gap, win gap, response understated, untouched leads, unattributed leads) | `buildCrmDashboard` → `/api/crm`, shown on the main page and in the assistant |
| Pull adapters for Salesforce / Dynamics 365 | **not implemented** (stubs throw a clear error) |

## Canonical lead (what the CRM must provide, per lead)
| Field | Meaning |
|---|---|
| `id` | lead / opportunity id in the CRM |
| `createdAt` | when the lead was created |
| `source` | **campaign code** captured on the lead (UTM `utm_campaign` or a CRM campaign field). Must equal `Campaign.crmCode` (e.g. `ASH-BROKER-26`). Leads without a matching code show up as the *attribution gap* |
| `stage` | `NEW, CONTACTED, QUALIFIED, VIEWING, RESERVED, WON, LOST` (CRM-specific statuses are mapped in `STAGE_MAP`) |
| `firstResponseAt` | timestamp of the first human response (call / WhatsApp / email) — drives SLA verification |
| `owner` | sales rep / desk |
| `dealValueM` | SAR millions, when reserved / won |
| `closedAt`, `lostReason` | when closed; reason if lost |

## Push example (any CRM / Power Automate / Zapier)
```bash
curl -X POST "$HUB/api/crm/leads" -H "x-api-key: $CRM_INGEST_KEY" -H "content-type: application/json" \
  -d '{"leads":[{"id":"00Q5g00000AbCdE","createdAt":"2026-06-01T08:12:00Z","source":"ASH-BROKER-26",
       "stage":"Site Visit","firstResponseAt":"2026-06-01T09:40:00Z","owner":"Sales Desk A"}]}'
```
Up to 5,000 leads per call; re-sending a lead updates it (idempotent on `id`).

## Starting field mapping (confirm with your CRM admin — not verified against your org)
| Canonical | Salesforce | Dynamics 365 (Dataverse) |
|---|---|---|
| id | `Lead.Id` / `Opportunity.Id` | `leadid` / `opportunityid` |
| createdAt | `CreatedDate` | `createdon` |
| source | `Campaign.Name`/custom `UTM_Campaign__c` | `campaignid` / custom `utm_campaign` |
| stage | `Status` / `StageName` | `statuscode` / `salesstage` |
| firstResponseAt | first completed `Task`/`Event` or custom field | first completed `activitypointer` |
| dealValueM | `Opportunity.Amount` (÷ 1,000,000) | `estimatedvalue` / `actualvalue` |
| closedAt | `CloseDate` / `ConvertedDate` | `actualclosedate` |
| lostReason | `Loss_Reason__c` | `statecode`/`statuscode` reason |

## Open questions before building the pull adapter
1. Which CRM (Salesforce, Dynamics 365, Zoho, HubSpot, other) and which API access / service account?
2. Are lead sources tagged with a **campaign code** consistently (UTM or CRM campaign)? Broker and portal leads often are not.
3. How are the CRM stages named, and where is **first response time** recorded?
4. Are units / deal values stored on the opportunity, and in which currency?
5. Which business units / projects map to Ash Shati, Andalus Quarter, Marina Tower?
