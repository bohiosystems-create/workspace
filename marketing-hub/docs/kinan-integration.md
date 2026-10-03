# Kinan's sales agent — a read-only data source

**Scope.** Kinan's sales agent is the AI that handles leads, follow-up and sales in Kinan's CRM (Yardi). The AI
Assistant Director of Marketing **does not talk to it**. It sends it nothing — no plan, no brief, no campaign
changes — and exposes no API for it to call. It only **reads** the CRM results the sales agent produces, to judge
campaigns and vendors.

```
 Kinan's sales agent ─► Yardi (CRM results) ──read──► Director (this app)
```

## 1. What the director reads
Per lead, by campaign code: created, qualified, viewing, reservation, contract (won) or lost with the reason, deal
value and first-response time. That is all the director needs to compute cost to sales, qualified rate and vendor
scores and to spot anomalies (lib/crm.ts, lib/crm-signals.ts). The Director page shows the source, the last sync and
how many leads matched a campaign code; the assistant answers "what data do we read from Kinan's sales agent?".

## 2. What the director never does
- send events, briefs, plans or campaign changes to the sales agent or to Yardi;
- create, assign or follow up leads, or suggest sales tasks;
- write anything into Yardi.

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
3. Can the export run daily (before the 07:30 report), and who at Kinan owns it?
4. Data residency and retention requirements for the CRM results we read.
