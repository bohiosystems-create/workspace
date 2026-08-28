# Bohio · Infrastructure PM

A project-management tool for real-estate infrastructure delivery. It ingests
progress reports from every contractor on a project and consolidates them into a
single **actual timeline measured against the planned baseline and planned
milestones**.

Open `infra-pm/index.html` in any browser — it is fully self-contained (no build,
no server) and persists to `localStorage`. It ships seeded with a realistic
demo project so the whole flow is visible immediately.

## What it does

- **Consolidation engine.** Every contractor report is a dated snapshot. The
  engine keeps the *latest* reported state per work package, reconstructs actual
  start / finish dates, and extrapolates a completion forecast from the reported
  rate of progress. Nothing on the actual side is hand-entered — it is 100%
  report-driven.
- **Dependency cascade.** Work packages are linked finish-to-start, so a slip in
  one package pushes the forecast start (and finish) of everything downstream,
  and cascades into the affected milestones. This is what turns a pile of
  reports into a *consolidated* project view.
- **Planned vs actual, everywhere:**
  - **Overview** — rollup KPIs (earned % vs plan-to-date, schedule performance
    index, forecast completion date & slip, delayed packages, milestones on
    track), a planned-vs-actual **S-curve**, and a "needs attention" exceptions
    table.
  - **Timeline** — a Gantt with the grey planned baseline, the actual progress
    bar (green = complete, red = delayed), a hatched forecast-to-complete tail,
    the data-date line, and planned ◇ vs forecast ◆ milestone markers.
  - **Milestones** — planned date vs forecast/actual date and variance for each
    key milestone, driven by its governing work package.
  - **Contractors** — per-contractor earned progress vs plan, schedule variance,
    and delayed-package count.

## Feeding it reports

On the **Contractor Reports** tab you can:

1. **Fill the form** — pick a contractor and report date, enter % complete and
   actual start/finish per work package, and submit.
2. **Paste a raw report** — free-text or CSV. The parser extracts the package,
   percent, and dates and drops them into the form for review. Examples:
   ```
   Excavation 100% complete, finished 2026-04-22
   Drainage network at 88%, started 2026-03-20
   ductbank, 68, 2026-05-18,
   ```

Submitting a report advances the data date if it is newer, re-runs
consolidation, and updates every view. Use **Export JSON** to save the full
project state, or **Reset demo data** to restore the seed.

## Model

- **Project** → **work packages** (planned start/end, weight, contractor,
  predecessor) → **milestones** (planned date, governing package).
- **Reports** → per-package `{ percent, actualStart, actualFinish }`, stamped
  with contractor + date.

All computation (earned value, forecasts, cascade, S-curve sampling) runs
client-side in vanilla JS — see the single `<script>` block in `index.html`.
