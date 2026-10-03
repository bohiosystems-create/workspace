# Kinan Site Agent

A phone-first AI agent for a development manager walking the construction site. It answers from the project's drawings, documents, programme, procurement, safety rules and regulations, leaves notes in the right place, and pins documents to exact spots on a detailed site map. It works **in the browser** and **on WhatsApp**.

**Setup:** [SETUP.md](SETUP.md) (complete guide) · [VERCEL.md](VERCEL.md) (10-minute Vercel checklist)

## Highlights

| | |
|---|---|
| **Two AI providers, routed** | Anthropic (Claude) + OpenAI. Each question is classified *fast / main / deep* and sent to the preferred model for that tier, with automatic cross-provider fallback. An offline keyword assistant answers when no provider is reachable. Every answer shows which model replied. |
| **WhatsApp** | Text, voice notes (transcribed), photos & PDFs (filed to your location and AI-indexed), shared GPS location ("you are here" map), drawings and map snippets sent back as images. Allow-listed numbers; Meta signature verification. |
| **Project dataset** | Demo "Kinan Heights": ~635 programme activities (baseline vs forecast, critical path), ~830-sheet drawing register, 58 documents (design basis, specs, RFIs, ITRs, method statements, minutes), 32-item compliance register (SBC, Civil Defense, MHRSD, MOMRAH, GACA, SEC/NWC, NCEC, PDPL), safety rules / PPE / permits / incidents, procurement (packages, POs, deliveries, MRs, stock), NCRs, contacts. |
| **Purchasing systems** | SAP S/4HANA (OData: POs + purchase requisitions), Oracle Fusion (REST), generic REST with field mapping, and a push webhook for any integration platform. Site material requests are pushed as requisitions. |
| **Real data import** | Primavera P6 / MS Project CSV programme, document-control register CSV, uploads from phone or WhatsApp. |
| **Detailed site map** | Pan/zoom plan with layers (buildings, roads, cranes & radii, temp works, utilities, HSE, grid), per-level locations, GPS dot, pin-a-document-to-the-spot, drawing markup. |
| **Deploy anywhere** | Vercel (private Vercel Blob storage, conflict-safe saves across instances, direct large uploads, signed downloads) or Docker with automatic HTTPS. Also a single-file offline HTML build. |

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY (optional)
npm run dev                  # http://localhost:3000
```

`npm run build:html` produces `kinan-site-agent.html`: the same app as one file, with no server (map, documents, notes, project data; no AI).

The AI agent has no chat screen in the web app. It is used **only through WhatsApp**.

## Layout

```
app/                 Next.js app: UI (Map · Project · Docs) and API routes
app/api/whatsapp     WhatsApp Cloud API webhook
lib/core/            Agent core (pure, also runs in the browser): tools, queries, LLM router
lib/core/llm/        Anthropic + OpenAI adapters, tiered routing with fallback
lib/data/            Demo project dataset generators
lib/integrations/    Purchasing-system adapters (SAP, Oracle, REST, webhook)
lib/whatsapp/        WhatsApp client, sessions, map/drawing PNG rendering
lib/storage.ts       Storage: local folder · Vercel Blob (private) · temporary
lib/store.ts         Database load/save with ETag reads and conflict-safe merging
standalone/          Single-file HTML build (in-browser API shim)
samples/             Example CSV/JSON for imports and webhooks
```

> Demo data is fictional. Regulatory entries paraphrase requirements as applied to the project — verify against the official texts.
