# Bohio — Fund Operations OS (functioning app)

A real, runnable Next.js app implementing all three Bohio workflows against one
fund dataset. Claude does the language work; deterministic TypeScript does the
maths. (Directory is still named `deal-screener/` from when it was the first
workflow.)

| # | Workflow | What's real |
|---|----------|-------------|
| 01 | **LP & Board Reporting** | Chatbot: Claude parses the request → snapshot & returns are **computed from the seeded fund/asset data and live debt** (NAV = valuation − debt, weighted occupancy/WALE, etc.) → Claude drafts the manager commentary in the requested style. |
| 02 | **Debt & Covenants** | ICR / LTV / DSCR, weighted cost, maturity ladder and covenant headroom **computed from the facilities register**, with **rule-based forward-looking alerts** (covenant headroom < 15%, refi windows < 18mo, maturity concentration) + an on-demand Claude risk narrative. |
| 03 | **Deal Screening** | Upload a teaser/OM PDF → Claude **extracts** figures (structured output) → **deterministic underwrite** (real IRR solver) vs. fund hurdles → Claude **drafts** the IC memo → saved to SQLite. |

## Architecture

```
SQLite (Prisma)  ── Fund / Asset / Facility / Distribution / Deal
   ▲                         │
   │ seeded lazily           │ read
   │ (lib/seed.ts)           ▼
LP Reporting   /api/report  → lib/reporting.ts (compute) + lib/claude.ts (parse + commentary)
Debt&Covenants /api/debt    → lib/debt.ts (compute + alerts) + lib/claude.ts (narrative)
Deal Screening /api/screen  → lib/claude.ts (extract) + lib/underwrite.ts (IRR) + lib/claude.ts (memo)
```

Pages: `/` landing, `/reporting`, `/debt`, `/screening`. Shared Bohio
monochrome design in `app/globals.css`.

## Run it locally

Requires Node 18+ and an Anthropic API key.

```bash
cd deal-screener
cp .env.example .env          # put your real ANTHROPIC_API_KEY in .env
npm install                   # also runs `prisma generate`
npm run db:push               # creates the SQLite schema (prisma/dev.db)
npm run dev                   # http://localhost:3000
```

The fund/asset/facility/distribution dataset **seeds itself** on the first
Reporting or Debt request (`lib/seed.ts`, idempotent) — no separate seed step.

Try it:
- **/reporting** — click a suggestion chip or type *"Q1 2026 LP report for Bevilacqua, formal style"*.
- **/debt** — loads instantly; click **AI risk narrative** for the Claude summary.
- **/screening** — a sample teaser is pre-filled; pick a fund and **Screen this deal**, or upload a PDF.

> **Cost:** Reporting ≈ 2 Opus calls, Screening ≈ 2, Debt ≈ 0 (1 only if you
> request the narrative). `claude-opus-4-8` is \$5/\$25 per 1M tokens — a few
> cents per run. Switch `MODEL` in `lib/claude.ts` to `claude-sonnet-4-6` to
> reduce cost.

## Notes & caveats

- The screening underwrite and the report's NAV math are **first-pass /
  indicative** — simple, documented models meant for screening and reporting,
  not committee-grade output. The fund-level IRR/MOIC/YoC come from the seed
  (they'd come from your cashflow models in production).
- Seed data mirrors the demo's KSA portfolio (SAR; Jeddah/Riyadh assets).
- Built and committed in an environment **without** npm/registry access or an
  API key, so it was **not** run or verified there. The code follows the current
  Anthropic SDK docs; if `npm install` flags a version, run
  `npm install @anthropic-ai/sdk@latest`.
- Memos/commentary are rendered from model output; sanitize HTML before a
  multi-user deployment.
