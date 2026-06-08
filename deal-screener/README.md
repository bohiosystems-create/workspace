# Bohio — Deal Screening (functioning app)

A real, runnable Next.js app for **Workflow 3: Deal Screening**. Upload a teaser
or OM, and it:

1. **Extracts** the key figures with Claude (`claude-opus-4-8`, structured output).
2. **Underwrites** them with a deterministic first-pass model (real IRR /
   equity-multiple math in TypeScript — not an LLM guess) against the fund's
   return hurdles.
3. **Drafts** a structured IC / screening memo with Claude from the extracted
   facts + the computed underwrite.
4. **Saves** the deal to a local SQLite database (Prisma).

This is the first of the three Bohio workflows to be made real. The original
single-file demo still lives at the repo root (`../index.html`).

## Architecture

```
PDF/text ─▶ /api/screen
              ├─ lib/claude.ts   extractDeal()   → Claude structured output  (figures)
              ├─ lib/underwrite.ts runUnderwrite() → deterministic IRR/EM vs hurdles
              ├─ lib/claude.ts   draftMemo()      → Claude memo (markdown)
              └─ Prisma          deal.create()    → SQLite
```

- `lib/hurdles.ts` — per-fund return hurdles + underwrite assumptions (edit these).
- `lib/underwrite.ts` — the cashflow model + IRR bisection solver + hurdle gate.
- `lib/claude.ts` — the two Claude calls (extraction via `messages.parse` +
  `zodOutputFormat`; memo via `messages.create` with adaptive thinking).
- `app/page.tsx` — the UI (Bohio monochrome look).

## Run it locally

Requires Node 18+ and an Anthropic API key.

```bash
cd deal-screener
cp .env.example .env          # then put your real ANTHROPIC_API_KEY in .env
npm install                   # also runs `prisma generate`
npm run db:push               # creates the SQLite schema (prisma/dev.db)
npm run dev                   # http://localhost:3000
```

A sample teaser is pre-filled in the UI — just pick a fund and click
**Screen this deal**, or upload a real PDF.

> **Cost:** each screen makes two `claude-opus-4-8` calls (extraction + memo).
> Opus 4.8 is \$5 / \$25 per 1M input/output tokens; a single teaser screen is a
> few cents. Swap the `MODEL` constant in `lib/claude.ts` to
> `claude-sonnet-4-6` if you want it cheaper.

## Notes & caveats

- The underwrite is **indicative / first-pass** by design — a simple levered
  model with documented assumptions, meant for screening, not committee-grade
  numbers. Replace `runUnderwrite` with a full cashflow model when ready.
- The memo is rendered from model-generated Markdown. For a multi-user
  deployment, sanitize the HTML (e.g. DOMPurify) before rendering.
- Built and committed in an environment **without** npm/registry access or an
  API key, so it was **not** run or verified there. The code follows the current
  Anthropic SDK docs; if `npm install` flags a version, run
  `npm install @anthropic-ai/sdk@latest prisma@latest @prisma/client@latest`.
