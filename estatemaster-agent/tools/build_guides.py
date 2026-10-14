#!/usr/bin/env python3
"""One-page guide per app: what to click, what the agent refuses and why. Writes guides/{readonly,analyst,api}.html."""
import os, html
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS={
 'readonly':dict(name='KINAN · EstateMaster agent (read-only)',tag='Reads EstateMaster. Never writes to it.',
  what='This agent reads your EstateMaster exports, checks them, works out the effect of proposed changes and reports. It does not change anything in EstateMaster: every figure it shows as EstateMaster’s comes from an export, and every estimate is labelled as the agent’s own.',
  clicks=[('Daily feed','What happened since the last export: proposed changes with their worked-out impact, stress tests, model reviews. Each row opens with <b>details ›</b>.'),
          ('Financial modelling → Upload export','Upload an Office Links → Excel export. The model is read cell by cell; a <b>Model debug</b> window opens and shows the checks live. The <b>Model debug</b> button reopens it any time.'),
          ('Scenarios & stress','Sensitivity tables and stress runs. With a cash flow in the export they are exact; otherwise the agent says what it needs.'),
          ('Chat (bottom right)','Ask in plain words: “what if sale price drops 10%?”, “why did the IRR fall?”, “approve CR-104” (declined here: see below). Click any bold figure for how it was computed.'),
          ('Reports → ▶ Play','A narrated board deck of the model. Arrow keys move between slides; a question can be typed or spoken while it plays.'),
          ('Settings','AI providers and routing, Outlook scan, voice, market data, the change memory, this guide and the demo video.')],
  refuses=[('Approving or rejecting a change','This agent is read-only. It works out and checks the impact of each proposed change; the decision and the entry into EstateMaster are made by a person. The mock-API agent is the one that writes.'),
           ('Assuming a missing input','If the export has no cash flow, no land cost or no finance rate, the agent asks in the chat instead of filling the gap. A figure built on a guess would be presented as fact, so it is never produced.'),
           ('Showing an IRR it cannot reproduce','The agent first proves that EstateMaster’s own cash flow reproduces EstateMaster’s IRR. If it cannot (within 0.05 points), it refuses to compute IRR changes and flags the model for review.'),
           ('Reporting an IRR where none exists','If a scenario leaves the equity never recovering, the answer is “no IRR exists”, not a number from the AI.'),
           ('Replacing EstateMaster’s figures with the AI’s','AI estimates are cross-checked by a second model and overridden by the exact engine whenever the export carries a cash flow. The AI’s own figure is kept visible, labelled, so the difference can be seen.')]),
 'analyst':dict(name='KINAN · EstateMaster agent (analyst)',tag='Reads EstateMaster. Prepares the analyst’s workbook.',
  what='Same reading, checking and reporting as the read-only agent. In addition, an approved change becomes a task with a <b>control workbook</b> for the analyst: the change, where it goes in EstateMaster, and the figures expected after it. The analyst enters it in EstateMaster and exports again; the agent then reconciles.',
  clicks=[('Daily feed','Proposed changes with their impact. <b>Approve</b> turns a change into an analyst task; <b>Reject</b> closes it with a reason. Rows open with <b>details ›</b>.'),
          ('For the analyst (in the Daily feed)','Open tasks. <b>Download T-00x</b> in the row header gives the control workbook; mark a task done once the export is back.'),
          ('Financial modelling → Upload export','Upload the new export after the analyst’s entry. The <b>Model debug</b> window checks it and the feed shows what moved against the previous export.'),
          ('Scenarios & stress','Exact sensitivity tables and stress runs on EstateMaster’s own cash flow.'),
          ('Chat','What-ifs, explanations, “approve CR-104”, “reject CR-105 because …”. Bold figures open their working.'),
          ('Reports → ▶ Play','Narrated board deck; questions while it plays.'),
          ('Settings','Providers, Outlook, voice, market data, change memory, this guide and the demo video.')],
  refuses=[('Writing into EstateMaster','This agent never touches EstateMaster. It prepares the workbook; a person enters the change and exports.'),
           ('Assuming a missing input','No land cost, finance rate or cash flow is ever assumed; the chat asks.'),
           ('Showing an IRR it cannot reproduce','The base IRR must be reproduced from the export’s own cash flow before any IRR change is computed.'),
           ('Reporting an IRR where none exists','“No IRR exists” is a possible answer.'),
           ('Closing a task without an export','A task stays open until a new export is uploaded and reconciles with the expected figures, or a person marks it done.')]),
 'api':dict(name='KINAN · EstateMaster agent (mock API)',tag='Reads and, after approval, writes to EstateMaster through its API.',
  what='The full loop against a mock EstateMaster API: the agent reads models and outputs through the API, proposes changes, and after a person approves, writes the change, asks EstateMaster to recalculate and reads the outputs back. Every call is logged and shown.',
  clicks=[('Daily feed','Proposed changes with their impact. <b>Approve</b> writes the change through the API (PATCH → calculate → GET outputs) and shows the new figures; <b>Reject</b> closes it. Rows open with <b>details ›</b>.'),
          ('Financial modelling','The model as read from the API, with every input and output. Upload an export as well to compare.'),
          ('Scenarios & stress','Stress runs in the API’s sandbox: EstateMaster calculates, the agent reads back.'),
          ('Chat','What-ifs (estimates, nothing written), “propose …” (a change request), “approve CR-104” (written after confirmation).'),
          ('API calls (header chip EstateMaster · API)','Every request and response, in order, with timing.'),
          ('Settings','Providers, voice, market data, change memory, this guide and the demo video.')],
  refuses=[('Writing anything before approval','A what-if or a proposal never reaches EstateMaster. Only an explicit approval by a person triggers a write, and it is logged.'),
           ('Writing to a model it has not read back','After every write the agent reads the outputs again and compares them with what it expected; a mismatch is flagged, never hidden.'),
           ('Assuming a missing input','As in the other agents: the chat asks.'),
           ('Showing an IRR it cannot reproduce','The base IRR is proved before IRR changes are computed.'),
           ('Reporting an IRR where none exists','“No IRR exists” is a possible answer.')]),
}
CSS="""*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:#2e2e2f;background:#f6f5f2;line-height:1.5}
.wrap{max-width:860px;margin:0 auto;padding:36px 20px 60px}.bar{height:4px;background:#f26b1d;border-radius:2px;width:56px;margin-bottom:18px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}.tag{color:#6b6b6e;margin:0 0 22px;font-size:14px}h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#f26b1d;margin:30px 0 10px}
p{margin:0 0 12px;font-size:14.5px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(46,46,47,.08)}
td{padding:11px 14px;border-top:1px solid rgba(46,46,47,.08);vertical-align:top;font-size:13.5px}tr:first-child td{border-top:0}td:first-child{width:34%;font-weight:600}
.no td:first-child{color:#b22c2c}.foot{color:#6b6b6e;font-size:12px;margin-top:30px}a{color:#f26b1d}@media print{body{background:#fff}.wrap{padding:0}}@media(max-width:600px){td{display:block;width:100%!important}td:first-child{border-top:1px solid rgba(46,46,47,.08);padding-bottom:0}tr:first-child td:first-child{border-top:0}}"""
for key,a in APPS.items():
    rows=lambda items,cls='':''.join(f'<tr class="{cls}"><td>{t}</td><td>{d}</td></tr>' for t,d in items)
    doc=f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guide · {html.escape(a['name'])}</title><style>{CSS}</style></head><body><div class="wrap"><div class="bar"></div>
<h1>{html.escape(a['name'])}</h1><p class="tag">{a['tag']}</p>
<h2>What it is</h2><p>{a['what']}</p>
<h2>What to click</h2><table>{rows(a['clicks'])}</table>
<h2>What the agent refuses, and why</h2><table>{rows(a['refuses'],'no')}</table>
<h2>Where the figures come from</h2><p>Three kinds of figure appear, always labelled: <b>EstateMaster’s</b> (read from an export or the API, never recalculated), <b>exact</b> (computed by the agent from EstateMaster’s own cash flow, proved against EstateMaster’s IRR first) and <b>AI estimate</b> (two models, cross-checked; shown only when nothing exact is possible). Click any bold figure to see its working.</p>
<p class="foot">Demo for KINAN by Bohio · EstateMaster is the trusted layer; nothing in this demo changes a real model. <a href="./">Back to the app</a></p></div></body></html>"""
    open(os.path.join(ROOT,'guides',key+'.html'),'w').write(doc)
print('guides written:',', '.join(APPS))
