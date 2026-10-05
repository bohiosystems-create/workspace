"""
Builds the two client demos as separate, independently deployable Vercel projects:

    python tools/build_options.py

dist/option2-readonly/   Option 2: read-only agent (reads EstateMaster exports, an analyst applies approved changes)
dist/option3-analyst/    Option 3: analyst in the loop (agent writes the control workbook, analyst presses Refresh Values + Export)
dist/*.zip               one zip per option

Each build locks its option (window.BOHIO_MODE), has no runner function; its runner code is never called.
The source index.html still opens any option with ?mode=full|readonly|analyst.
"""
import json, re, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OPTIONS = {
    "readonly": ("option2-readonly", "Option 2 · Read-only agent"),
    "analyst": ("option3-analyst", "Option 3 · Analyst in the loop"),
}

README = {
"readonly": """# Bohio agent on EstateMaster · Option 2: read-only agent (demo)

The agent reads ARGUS EstateMaster's exports and never writes to EstateMaster. Every change it suggests
becomes a change request; once a person approves it, an analyst enters the values in EstateMaster and
uploads the new export (Office Links → Excel). Every figure shown as EstateMaster's comes from an export.

**Can:** read every input and output from exports · answer questions and compare exports · check assumptions
against market data, zoning, Outlook and actuals · propose changes for approval · design stress scenarios for an
analyst to run · draft reports from the latest export · keep a memory of every change, task and export.

**Can't:** write to EstateMaster · calculate the effect of a change (EstateMaster does, after the analyst enters it)
· run scenarios in EstateMaster · create or promote models by itself · show figures newer than the last export.

## Try it
1. Ask "what if sale price drops 10%" → a change request, no figure.
2. Approve it → a task on the **EstateMaster** tab with the exact values to enter.
3. Press **Mark done (simulated export)**, or **Upload export** with a real Office Links export.
   The returns tiles now show that export.
""",
"analyst": """# Bohio agent on EstateMaster · Option 3: analyst in the loop (demo)

The agent writes approved values into the KINAN control workbook that the EstateMaster model is linked to
(Links to Excel Files). An analyst then opens the model, presses **Refresh Values**, recalculates and exports
(about a minute). The agent reads EstateMaster's figures from that export. It never touches EstateMaster.

**Can:** everything in Option 2 · write approved values to the control workbook (production: SharePoint via
Microsoft Graph; demo: download) · batch approved changes into one refresh task · prepare stress scenarios as
control-workbook value sets · set up a new model from a KINAN template and a filled workbook.

**Can't:** press buttons in EstateMaster · run unattended (results wait for the analyst) · change inputs not linked
to the workbook (they become manual steps in the task) · promote to the live model by itself.

## Try it
1. Ask "what if construction cost rises 8%" → a change request, no figure.
2. Approve it → a refresh task on the **EstateMaster** tab. **Download control workbook** gives the workbook
   with the approved values.
3. Press **Mark done (simulated export)**, or **Upload export** with a real Office Links export.
""",
}
DEPLOY = """
## Deploy to Vercel
Run `vercel` in this folder (or import it from Git, framework *Other*, no build command).
Environment variables: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` for the AI routes, `DEMO_PASSWORD` (recommended),
`ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`) for ElevenLabs narration in ▶ Play and Read (the browser's own voice otherwise),\n`CRON_SECRET`, `ALERT_TO`, `REPORT_TO`, `EXPORTS_FOLDER` for the twice-daily email scan with alerts and the morning EstateMaster report (see SETUP.md),
and for live Outlook the Microsoft Graph variables listed in the main README. No runner variables: this option has no runner.

All data is dummy data. Browser memory is kept per option.
"""


def build(mode):
    folder, name = OPTIONS[mode]
    out = DIST / folder
    if out.exists():
        shutil.rmtree(out)
    (out / "api").mkdir(parents=True)
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert html.count("\n<script>\n") == 1
    html = html.replace("\n<script>\n", f"\n<script>window.BOHIO_MODE='{mode}';</script>\n<script>\n", 1)
    html = re.sub(r"<title>.*?</title>", f"<title>KINAN · {name}</title>", html, count=1, flags=re.S)
    (out / "index.html").write_text(html, encoding="utf-8")
    for f in ("llm.js", "scan.js", "voice.js", "mail.js", "cron.js"):
        shutil.copy(ROOT / "api" / f, out / "api" / f)
    shutil.copytree(ROOT / "api" / "_lib", out / "api" / "_lib")
    vj = json.loads((ROOT / "vercel.json").read_text())
    vj["functions"].pop("api/runner.js", None)
    (out / "vercel.json").write_text(json.dumps(vj, indent=2) + "\n")
    pk = json.loads((ROOT / "package.json").read_text()); pk["name"] = f"bohio-estatemaster-{folder}"
    (out / "package.json").write_text(json.dumps(pk, indent=2) + "\n")
    shutil.copy(ROOT / "market-data.xlsx", out / "market-data.xlsx")
    readme = README[mode] + DEPLOY
    if mode == "analyst":
        (out / "setup").mkdir()
        for f in ("KINAN_control_workbook_template.xlsx", "copilot_setup_agent.md"):
            shutil.copy(ROOT / "setup" / f, out / "setup" / f)
        shutil.copy(ROOT / "runner" / "control_check.py", out / "setup" / "control_check.py")
        shutil.copy(ROOT / "runner" / "register_map.csv", out / "setup" / "register_map.csv")
        (out / ".vercelignore").write_text("setup/\n")
        readme += "\n`setup/`: control workbook template, Copilot setup instructions and the checker (`py setup/control_check.py <file>`); not deployed.\n"
    shutil.copy(ROOT / "docs" / f"SETUP_{'option2_readonly' if mode == 'readonly' else 'option3_analyst'}.md", out / "SETUP.md")
    readme += "\nSee `SETUP.md` for the step-by-step setup guide.\n"
    (out / "README.md").write_text(readme, encoding="utf-8")
    z = DIST / f"bohio-{folder}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out.rglob("*")):
            if p.is_file():
                zf.write(p, Path(folder) / p.relative_to(out))
    print(f"{out.relative_to(ROOT)}  ({z.name}, {z.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    import subprocess, sys
    subprocess.run([sys.executable, str(ROOT / "tools/sync_emcheck.py")], check=True)
    for m in OPTIONS:
        build(m)
