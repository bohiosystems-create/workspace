# Kinan Site Agent

A phone-first AI agent for a development manager walking a construction site.
Pull up any project document, read and mark up drawings, leave notes, and
attach new documents to exact spots on a detailed site map — by tapping or by voice.

## What it does

| | |
|---|---|
| **Detailed site map** | Pan/pinch-zoom plan of the plot (800 × 500 m): boundary, zones, roads, 3 gates, towers / podium / hotel / club / 12 villas, basement footprint & ramp, structural grid, site offices, camp, batching plant, rebar & laydown yards, tower cranes with slew radii, hoists, HSE muster points, underground utilities (water, sewer, storm, power, telecom, fire), landscaping. Labels appear progressively as you zoom; layers toggle on/off. |
| **Attach documents to places** | Tap a building / yard / crane → *Upload here*, or **📌 Pin a document to the plan** and tap the exact spot. Buildings have per-level locations (B3 … roof). Take a photo or choose a file (PDF, image, text). |
| **Pins & issue flags** | Every place with documents shows a pin with a count; open issues/instructions add a red flag. |
| **Drawing viewer** | Pan / pinch-zoom drawings and photos. ✎ drops a numbered note pin on the exact spot of the drawing. Notes can be closed/reopened. |
| **AI agent** | Claude with tools over the project: search documents, read a document (PDFs/photos are shown to the model), get everything known about a place, add/list/close notes, open a drawing, pan the map. Ask "What's the slab thickness on Tower A L12?", "Any open RFIs at Tower B?", or say "note: check trimmer bars here". |
| **Voice** | 🎙 dictation (Web Speech API) and optional spoken replies. |
| **GPS** | Blue dot on the plan; the agent knows which place you're standing at ("note here: …"). |
| **Auto-indexing** | With an API key, uploaded PDFs/photos are read by Claude to fill in title, type, revision, summary and searchable text. |
| **Offline fallback** | Without an API key a keyword assistant (same tools) still searches, opens, notes and locates. |

## Run it

```bash
cd kinan-site-agent
npm install
cp .env.example .env.local      # add ANTHROPIC_API_KEY
npm run dev                      # or: npm run build && npm start
```

Open `http://<your-computer>:3000` on the phone (same Wi-Fi). Data seeds on first run
(`data/db.json`, uploads in `data/uploads/`). Delete `data/` to reset.

Try `/?at=560,430` to simulate a GPS position on the plan (plan units; see `lib/siteplan.ts`).

## Make the map yours

- **Geometry & places:** `lib/siteplan.ts` — shapes, layers, and the location tree
  (each shape can carry a `loc` id). 1 plan unit = 0.5 m.
- **GPS calibration:** set `GEO.originLat/originLon` (the plan's top-left corner) and
  `PLAN.metresPerUnit`. Plan north is up; add rotation in `gpsToPlan` if the site isn't north-up.
- **Real project data:** replace `lib/seed.ts`, or bulk-upload through `/api/upload`.
- **Real CAD/PDF site plan:** swap the SVG shapes for your survey drawing, keeping `locationAt` /
  `SEED_LOCATIONS` as the place index.

## Architecture

```
app/page.tsx            tabs: Map · Agent · Documents; owns selection state
app/_components/        SiteMap, LocationSheet, UploadSheet, DocViewer, AgentChat, DocsTab, usePanZoom
app/api/                state · upload · file · notes · locations · agent
lib/agent.ts            Claude tool-use loop (+ offline fallback)
lib/tools.ts            the agent's tools, shared rules with the UI
lib/store.ts            JSON-file store + place resolver ("tower a level 12", "tc1", "laydown 2")
lib/ingest.ts           Claude reads uploaded PDFs/photos to index them
lib/siteplan.ts         the map
```

The model is `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

## Before real use (known limits)

- **No authentication / single tenant.** Put it behind your SSO or VPN; add user identity so notes
  carry real authors (today the name is typed in the header).
- **JSON file storage** is fine for a pilot, not for concurrent multi-user use — move `lib/store.ts`
  to Postgres + object storage (S3/Azure Blob).
- **Documents aren't versioned**; "latest revision" is whatever's marked in the metadata.
  Connect your CDE / document control system (Aconex, Procore, ACC) as the source of truth.
- **Large PDFs/drawings (>4.5 MB)** aren't passed to the model as files; only indexed text is used.
  Drawing sets should be pre-indexed or split per sheet.
- **Voice** relies on the browser's speech recognition (Chrome/Safari); it needs signal on site.
- **Agent answers are only as good as the documents** — it cites the document + revision; verify
  against the drawing before instructing work. It records notes; it does not instruct subcontractors.
