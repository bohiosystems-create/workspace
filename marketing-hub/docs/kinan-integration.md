# Kinan integration — what the AI Assistant Director of Marketing shares with Kinan's CRM (Yardi) and Kinan's AI agent

**Scope.** Kinan's own AI agent takes care of leads, follow-up, sales and the CRM. The director does not work leads.
It **reads** CRM results (which campaigns bring leads that qualify and buy) to judge campaigns and vendors, and it
**shares** marketing context with Kinan's agent: the approved budget plan, campaign codes and campaign changes, the
daily brief and its campaign recommendations.

```
 ad accounts · Meta · vendor reports · Oracle ─┐
                                               ▼
 Yardi (CRM results, read) ───────────► Director (this app) ──► events / context ──► Kinan AI agent
                                                                                     (owns leads, follow-up, sales)
```

## 1. Director → Kinan (outbox, `lib/kinan.ts`)
Every event is stored first (outbox), delivered, retried on failure (max 5) and visible on the Director page.

| Event | Sent when | Payload (summary) |
|---|---|---|
| `director.plan_approved` | the monthly budget plan is approved by a named person | month, total, allocations per vendor, campaign codes and statuses |
| `campaign.status_changed` | a campaign is paused / resumed / budget moved (a human action) | campaign code, status |
| `brief.daily` | "Send brief to Kinan's agent", or with the daily report when enabled | headline, bullets, risks, actions, campaign recommendations |

Delivery modes: `KINAN_MODE=mock` (default, nothing leaves) or `webhook`:
`POST $KINAN_AGENT_WEBHOOK_URL` with JSON `{ id, type, createdAt, payload }` and headers
`X-Bohio-Event`, `X-Bohio-Delivery` (event id — use it to de-duplicate), `X-Bohio-Signature: sha256=<HMAC-SHA256(body, KINAN_WEBHOOK_SECRET)>`.
Kinan should verify the signature, respond 2xx quickly, and process asynchronously. **No personal data is sent.**

## 2. Kinan's agent → Director (read-only)
`GET /api/kinan/context?lang=en|ar` with `x-api-key: $KINAN_API_KEY` (disabled when unset): the brief, targets per
project, active campaigns and codes, campaign quality from the CRM, campaign recommendations, vendor decisions and the
budget plan. Useful as context for Kinan's agent (e.g. which campaign a lead came from and whether it is being scaled
or paused). If Kinan's agent uses MCP, this maps onto one tool (`get_marketing_context`).

## 3. Yardi as the CRM source (`CRM_MODE=yardi`) — not implemented yet
The director needs CRM **results** per campaign code (lead created, qualified, viewing, reserved, won / lost, deal
value). The CRM layer already accepts leads in a canonical format (`docs/crm-integration.md`). For Yardi, either:
- **push** — Kinan's integration posts guest cards to `POST /api/crm/leads` (works today), or
- **pull** — a Yardi adapter reads prospects / guest cards and their status. This needs Kinan's **Yardi interface
  licence and credentials** (Voyager guest-card interface, RentCafe CRM API, or a report export — to confirm with
  Kinan's Yardi admin).

Starting field mapping (to confirm):

| Canonical lead | Yardi (guest card / prospect) |
|---|---|
| `id` | prospect / guest-card id |
| `createdAt` | first contact / created date |
| `source` | marketing source → must carry the campaign code (`ASH-BROKER-26`, …) |
| `stage` | prospect status (contact, show / tour, reservation, signed, lost) via `STAGE_MAP` |
| `firstResponseAt` | first outbound contact event |
| `dealValueM`, `closedAt`, `lostReason` | unit price / contract, signed date, lost reason |

## 4. Questions for Kinan
1. Which Yardi products (Voyager, RentCafe CRM, other) and which interface can we read from?
2. How are marketing sources / campaign codes captured on Yardi guest cards today?
3. Does Kinan's agent want the plan / campaign changes / brief (webhook, queue or MCP), and in which language?
4. Data residency and retention requirements for the CRM results we read.
