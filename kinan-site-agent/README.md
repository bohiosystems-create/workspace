# Kinan Onsite Agent

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
| **Projects home + documents → 3D** | The app opens on a project list. **+ New project** takes files, whole folders or .zip archives of a project's area schedule, setting-out, P6/MS Project programme, logistics plan, brief, PDFs or plan images. the server routes them to **Claude, Gemini or OpenAI** by document type (with fallback and a cross-check against the schedules), which reads them into a model spec (buildings, floors, footprints, roads, gates, cranes, zones, programme per building, with sources, confidence and assumptions) and the app renders it as a playable 3D/4D model. An offline parser works without keys. A demo pack of 8 mock documents (fictional *Kinan Bay Residences*, 16 buildings, a P6 update with logic, float, baseline and progress at 1 Oct 2026; also `samples/kinan-bay-demo.zip`, rebuilt with `npm run demo-pack`) shows the whole flow, including a real critical path (the Waterfront Hotel, 24 days late). Generated projects are kept on the device and synced to the server, so the daily report covers them. |
| **Critical path** | Critical activities (zero float: a day lost moves completion) are highlighted everywhere: a *Critical path* panel on the programme (late now, at risk, in progress, starting in 14 days, later work already forecast late), a *Critical* tag on activity rows, and for generated projects a critical path worked out from the programme dates (the building that finishes last drives completion; every other building's float is shown). |
| **Daily report** | A scheduled e-mail each morning with the status of **all active projects** — progress vs plan, completion forecast, the critical path, milestones, procurement risks, safety and the site notes of the last 24 hours — in English and/or Arabic. Same rules as the other Kinan agents: time, timezone and days set in the app, **internal recipients only** (allowed domains, re-checked at every send), preview, snapshot, history and a delivery check. Sent through Outlook (Microsoft Graph); simulated until `OUTLOOK_MODE=live`. |
| **Detailed site map** | Pan/zoom plan with layers (buildings, roads, cranes & radii, temp works, utilities, HSE, grid), per-level locations, GPS dot, pin-a-document-to-the-spot, drawing markup. |
| **Deploy anywhere** | Vercel (private Vercel Blob storage, conflict-safe saves across instances, direct large uploads, signed downloads) or Docker with automatic HTTPS. Also a single-file offline HTML build. |

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY (optional)
npm run dev                  # http://localhost:3000
```

`npm run build:html` produces `kinan-site-agent.html`: the same app as one file, with no server (map, documents, notes, project data). New projects there use the offline parser, or Claude when the page is opened as a claude.ai artifact.

The AI agent has no chat screen in the web app. It is used **only through WhatsApp**.

## Look and feel

The app is **mobile first**: the phone layout is the base (bottom tabs, draggable bottom sheets, map controls in the thumb zone, a round pin button, 44 px touch targets, one avatar menu for your name and Light / Dark / Auto). Tablets and desktops add a left navigation rail, a side panel instead of the bottom sheet, and two- or three-column dashboards.


The app carries Kinan's visual identity, shared with the marketing assistant: the charcoal band with the white logo and the orange chevron, Kinan's typeface (Greta Arabic / Greta Sans when the licensed files are in `brand/fonts/`, see `brand/README.md`; Montserrat + IBM Plex Sans Arabic stand in, as in the other Kinan agents), orange uppercase headings, taupe caps labels over big charcoal numbers, the faceted page texture. The artwork lives in `brand/` (`kinan-logo.svg`, `kinan-chevron.svg`, `kinan-texture.jpg`) and is embedded by `npm run brand` into `lib/brand-assets.ts` (run automatically before `npm run build` and `npm run build:html`), so the web app, the single-file HTML, the WhatsApp map images and the drawing title blocks all carry the same vectors with no runtime file loads. Replace the files in `brand/` to update the artwork.

**Site map** has two views: the detailed 2D plan sheet and a **real-time 3D model** (`3D`), built in WebGL with three.js (`app/_components/SiteGL.tsx`, `app/_components/gl/`). Every structure is drawn floor by floor from the schedule (`lib/scene/progress4d.ts`): cast slabs and columns, the core and its jump-form, the deck being cast (pulsing), Kinan-branded climbing screens, curtain wall where the façade zones are complete, lit fitted-out floors at night, and a dashed ghost of the finished massing. Tower cranes run a work cycle (slew, trolley, hoist), hoists travel, trucks loop the haul roads, palms, branded hoarding, the basement pit opens and fills. A **4D timeline** under the model scrubs or plays the whole programme from notice to proceed to completion. Lighting follows the theme: afternoon sun with shadows in light mode, night with floodlights and lit windows in dark mode. Touch (handled in `SiteGL.tsx`, not by OrbitControls): one finger turns and tilts; two fingers **twist to turn**, pinch to zoom and drag to move, all at once; tap to select. Around every building (`app/_components/gl/around.ts`): while it is built, a mesh-fence work zone, stockpiles, welfare cabins, generator and lighting tower, telehandler, forklift, mixer trucks queuing for the pour, a scaffold stair tower, a waste chute during fit-out, a façade cradle where the curtain wall goes in, scaffolding and scissor lifts on the low-rise blocks, safety signs; once finished, a paved plaza with planters and palms, benches, bollards, lamp posts, an entrance canopy, a signage monolith and cars at the drop-off. The site is populated: workers walk the roads and work the live decks, trucks and cars drive, an excavator digs the pit, a pump or placing boom feeds each pour, edge protection, falsework props and debris nets follow the structure, street lights, barriers, cones, gates, flags, yard stock, rooftop plant, a helipad on the hotel, gardens and cars at handed-over villas (`app/_components/gl/details.ts`). three.js is loaded only when 3D is opened; slow phones drop resolution and shadow detail automatically; devices without WebGL get the SVG model (`Site3D.tsx`). **Project** shows counting KPIs, a progress ring and schedule gauge, the S-curve, 3D columns per building, a milestone timeline, and 3D donuts for procurement packages, permits, compliance and the drawing register (`app/_components/Charts.tsx`, geometry in `lib/chart3d.ts`). Motion is off under the device's reduce-motion setting.

## Layout

```
app/                 Next.js app: UI (Projects home · Map · Project · Docs) and API routes
app/_components/     SiteMap (2D) · SiteGL (WebGL 3D/4D) · Projects (home, new project, viewer) + ModelViewer · Charts · icons
app/_components/gl/  three.js scene kit: buildings, cranes, grounds, details, generated-project scene
app/api/model3d      Documents → 3D model spec (Claude / OpenAI / Gemini / offline)
brand/               Kinan logo, chevron and page texture (embedded by scripts/brand.mjs)
app/api/whatsapp     WhatsApp Cloud API webhook
lib/core/            Agent core (pure, also runs in the browser): tools, queries, LLM router
lib/core/llm/        Anthropic + OpenAI adapters, tiered routing with fallback
lib/model3d/         Model spec + 4D state, AI extraction, offline parser, mock pack, zip/folder intake, project store
lib/data/            Demo project dataset generators
lib/integrations/    Purchasing-system adapters (SAP, Oracle, REST, webhook)
lib/whatsapp/        WhatsApp client, sessions, map/drawing PNG rendering
lib/storage.ts       Storage: local folder · Vercel Blob (private) · temporary
lib/store.ts         Database load/save with ETag reads and conflict-safe merging
standalone/          Single-file HTML build (in-browser API shim)
samples/             Example CSV/JSON for imports and webhooks
```

> Demo data is fictional. Regulatory entries paraphrase requirements as applied to the project — verify against the official texts.
