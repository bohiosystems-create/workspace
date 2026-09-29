# Bohio — Marketing Hub (standalone)

Monitor and orchestrate external marketing vendors: the campaigns they run per
asset, their results, and how spend translates into contracted sales. Separate
app with its own database — no dependency on `deal-screener`.

- **Monitor** — spend → leads → qualified → viewings → reservations → contracts → sales; cost-to-sales, CAC, CPL, budget pacing; 0–100 vendor scorecard (efficiency 40, quality 25, SLA responsiveness 20, delivery 15).
- **Alerts** — SLA breaches, contract expiry, cost-to-sales > 3%, CPL inflation, lead-quality decay, pacing, vendor concentration.
- **Orchestrate** — recommended Pause / Shift-budget actions, one-click apply, plus manual Pause/Resume; every action is written to an audit trail.
- **Claude** — vendor briefing and drafted notes to vendors (optional; needs `ANTHROPIC_API_KEY`). All numbers are computed in code.

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
