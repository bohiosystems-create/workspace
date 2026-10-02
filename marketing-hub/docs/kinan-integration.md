# Kinan integration — the AI Director of Marketing feeding Kinan's CRM (Yardi) and Kinan's AI agent

The hub plays the **director of marketing**: it decides which vendors and campaigns deserve money and
which leads deserve attention. Kinan's CRM (Yardi) is where leads live and are worked, and Kinan's AI
agent is what talks to those leads. This document is the contract between the three.

```
 ad accounts · vendor reports · Oracle ─┐
                                        ▼
 Yardi (guest cards / prospects) ──► Director (this app) ──► events ──► Kinan AI agent ──► leads (WhatsApp / call / email)
        ▲                                   ▲                 │
        └──────── outcomes in Yardi ◄───────┴── feedback ◄────┘
```

## 1. Director → Kinan (outbox, `lib/kinan.ts`)
Every event is stored first (outbox), delivered, retried on failure (max 5) and visible on the Director page.

| Event | Sent when | Needs a person? | Payload (summary) |
|---|---|---|---|
| `lead.followup_requested` | a delegation to Kinan's agent is approved (leads not contacted in 48h; leads lost on price/financing) | **yes** — it leads to customers being contacted | `taskId, title, instructions, reason, leads[{leadId, campaignCode, …}]` |
| `lead_source.quality` | "Send lead-source quality" | no | per campaign code: qualified rate, win rate, median response, `qualityScore`, `guidance` (PRIORITISE / NORMAL / DEPRIORITISE) |
| `director.plan_approved` | the monthly budget plan is approved | approval is the trigger | month, total, allocations per vendor, campaign codes and statuses |
| `campaign.status_changed` | a campaign is paused / resumed / budget moved | the change itself is a human action | campaign code, status |
| `brief.daily` | "Send brief to Kinan" | no | headline, bullets, risks, actions |

Delivery modes: `KINAN_MODE=mock` (default, nothing leaves) or `webhook`:
`POST $KINAN_AGENT_WEBHOOK_URL` with JSON `{ id, type, createdAt, payload }` and headers
`X-Bohio-Event`, `X-Bohio-Delivery` (event id — use it to de-duplicate), `X-Bohio-Signature: sha256=<HMAC-SHA256(body, KINAN_WEBHOOK_SECRET)>`.
Kinan should verify the signature, respond 2xx quickly, and process asynchronously.

**No personal data is sent** — leads are referenced by their Yardi / CRM id only; Kinan's agent looks up the person in Yardi.

## 2. Kinan's agent → Director
Both need `x-api-key: $KINAN_API_KEY` (disabled when unset).

- `GET /api/kinan/context?lang=en|ar` — what the director wants the agent to know: brief, targets per project,
  lead-source quality and handling guidance, active campaigns and codes, vendor decisions, the budget plan, and
  approved tasks for the agent. Intended to be called at the start of each agent session (or every few minutes) and used as context / tool output.
- `POST /api/kinan/feedback` — outcomes:
  `{type:"lead.contacted", leadId, at}`, `{type:"lead.outcome", leadId, stage, dealValueM?}`, `{type:"task.done", taskId}`.
  Lead updates update the CRM record used for scoring (first-response time, stage); `task.done` closes the director's task.

If Kinan's agent is built on an MCP-capable framework, the two endpoints map directly onto two tools
(`get_marketing_context`, `report_lead_outcome`); an MCP wrapper can be added once the framework is known.

## 3. Yardi as the CRM source (`CRM_MODE=yardi`) — not implemented yet
The CRM layer already accepts leads in a canonical format (`docs/crm-integration.md`). For Yardi, either:
- **push** — Kinan's integration (or their agent) posts guest cards to `POST /api/crm/leads` (works today), or
- **pull** — a Yardi adapter reads prospects / guest cards and their activities. This needs Kinan's **Yardi interface
  licence and credentials** (Yardi exposes guest-card / prospect data through its partner interfaces; the exact
  interface — Voyager guest-card interface, RentCafe CRM API, or a report export — must be confirmed with Kinan's Yardi admin).

Starting field mapping (to confirm):

| Canonical lead | Yardi (guest card / prospect) |
|---|---|
| `id` | prospect / guest-card id |
| `createdAt` | first contact / created date |
| `source` | marketing source → must carry the campaign code (`ASH-BROKER-26`, …) |
| `stage` | prospect status / events (contact, show / tour, application / reservation, signed, lost) via `STAGE_MAP` |
| `firstResponseAt` | first outbound contact event |
| `owner` | leasing / sales agent |
| `dealValueM`, `closedAt`, `lostReason` | unit price / contract, signed date, lost reason |

## 4. Questions for Kinan
1. Which Yardi products (Voyager, RentCafe CRM, other) and which interface can we be licensed for?
2. How are marketing sources / campaign codes captured on Yardi guest cards today?
3. Kinan's AI agent: what can it receive (webhook, queue, MCP tools) and act on (WhatsApp, calls, email)? Who approves its outreach?
4. Which events should require a human on Kinan's side as well as ours?
5. Data residency and retention requirements for lead ids and outcomes.
