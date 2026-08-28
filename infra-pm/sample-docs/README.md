# Bohio Infrastructure PM — Sample Documents

A pack of sample contractor progress reports for the **Marina District — Access
& Utilities Infrastructure** demo. Use them to feed the tool and watch the
consolidated timeline, S-curve and milestone forecasts respond to new data.

These reports are a **September 2026 reporting period** — they continue the
story the demo loads with (data date 28 Aug 2026). Ingesting them advances the
data date to **25 Sep 2026** and shows the project moving: Voltaic recovers the
electrical ductbank, fibre ducting completes, Meridian finishes the road
sub-base and finally starts asphalt surfacing.

## What's in the pack

| File | Contractor | What it shows |
|------|------------|---------------|
| `01-Voltaic-Power-Systems-Sept-2026.pdf` | Voltaic Power Systems | Ductbank recovering 68% → 92%; fibre ducting complete; street lighting still not started |
| `02-Meridian-Roads-Sept-2026.pdf` | Meridian Roads | Sub-base complete; asphalt surfacing just started (8%) |
| `03-AquaFlow-Infrastructure-Sept-2026.pdf` | AquaFlow Infrastructure | Drainage & water mains closeout (no change) |
| `04-Delta-Civil-Sept-2026.pdf` | Delta Civil | Enabling works closeout (no change) |
| `paste-ready/*.csv` | — | The same figures as copy-paste-ready CSV, one file per contractor |

Each PDF also contains a **"Digital submission — paste-ready"** box at the
bottom, so you can copy the figures straight out of the document during the
demo.

## How to run the demo

1. Open the tool (`infra-pm/index.html`) and go to the **Contractor Reports** tab.
2. For each contractor, in this order — **Voltaic → Meridian → AquaFlow → Delta**:
   1. Select the contractor in the dropdown.
   2. Set the **report date** to `2026-09-25`.
   3. Open that contractor's PDF (or the matching `paste-ready/*.csv`) and copy
      the CSV block.
   4. Paste it into the **raw report** box and click **Parse into form**.
   5. Review the figures, then click **Submit report**.
3. Switch to **Overview** and **Timeline** and watch the change:
   - Actual complete rises to ~70%.
   - The **Utilities Energized** milestone forecast pulls back to early Oct as
     the ductbank recovers.
   - **Asphalt & Surfacing** appears as started; **Road Open** and **Handover**
     recompute.

> Tip: the free-text parser also reads narrative sentences (e.g.
> `Asphalt 8%, started 2026-09-22`), not just CSV — try pasting a line from the
> report's notes to show it working. Use **Reset demo data** to return to the
> starting state at any time.

## CSV format

`work-package-id, % complete, actual start (YYYY-MM-DD), actual finish (YYYY-MM-DD)`

Work-package IDs: `mob, earth, drain, water, duct, tele, sub, asph, light, land`.
Leave the finish date blank for in-progress packages. Only lines for the
selected contractor's packages are applied.
