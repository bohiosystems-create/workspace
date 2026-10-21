# The Excel add-in

The agent inside Excel: a task pane (`taskpane.html`) that reads the open workbook through Office.js, shows its headline figures
with their cells, runs what-ifs that **Excel itself recalculates** (the inputs are written, Excel recalculates, the outputs are
read, the inputs are put back and every output is checked to read its original value again), explains a cell through its
formula and the cells it reads, reads questions with the AI (which only names cells; a formula cell is refused as a lever), and
opens the model in the workspace (the workbook is passed to the app in an Office dialog and becomes a project there).

`tools/deploy.sh` publishes it with each app that has one (`kinan-estatemaster`, `jadwa-estatemaster`) at `/addin/`, with the
manifest filled in for that app (`/addin/manifest.xml`).

## Try it (sideload)

1. Sign in to the app once in the browser (bohiotech.com/demo).
2. Download `https://<app>.bohiotech.com/addin/manifest.xml`.
3. Excel (Windows, Mac or web) → Home → Add-ins → More add-ins → My Add-ins → Upload My Add-in → choose the file.
4. Home → **AI agent** opens the pane.

For a client: their Microsoft 365 admin deploys the manifest to the users (admin.microsoft.com → Settings → Integrated apps →
Upload custom apps). No store listing is needed.

## Tests

`tests/t_addin.mjs` runs the pane on `tests/addin_officemock.js`, a stand-in for Office.js whose workbook is the fixture
calculated by HyperFormula, so the what-ifs are real recalculations, checked against the LibreOffice golden answers.
Real Excel is not available in CI: test a change in Excel before a demo.
