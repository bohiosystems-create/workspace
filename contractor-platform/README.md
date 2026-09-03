# Bohio · Contractor Platform

A standalone demo of a contractor-management platform for heavy-duty,
physical-world infrastructure programmes — where **human crews and robotic
fleets are interchangeable contractors**. The platform lets you pick the best
proposal for each work package, monitor delivery against plan, **predict delays
before they land**, and **agentically issue corrective directives** to the
contractors themselves — human or robot. It connects to the PM systems these
industries already run on (Primavera P6 and others) over **MCP**.

This demo is self-contained and separate from the rest of the Bohio workspace.
`index.html` needs no build, no server and no API key. The `mcp/` folder holds
runnable MCP servers.

## Run it

Open `index.html` in any browser. It seeds a live infrastructure programme
(Marina District — Access & Utilities) and persists your changes to
`localStorage`. Use **Reset demo** to return to the starting state.

## What it shows

| Tab | What it demonstrates |
|-----|----------------------|
| **Command Center** | Programme KPIs, **predicted delays flagged before they land** (with lead time and root cause), a live human/robot activity feed, and the workforce mix. |
| **Contractors** | A roster of human crews and robotic fleets, scored on the same axes — interchangeable by design. |
| **Procurement** | Open tenders with competing **human vs robot proposals**, each scored on cost / duration / risk / availability / rating. The platform recommends one; you **award with a click** and the timeline re-plans around the winner. |
| **Timeline** | The consolidated planned-vs-actual Gantt (robot bars distinct from human), forecast-to-complete tails, milestone markers, and the S-curve. |
| **Agent Console** | The **agentic control loop**: the platform detects a breach, drafts a corrective directive, and — on approval — issues it. Human crews are instructed via Procore; **robotic fleets are dispatched a machine command via the Trimble fleet MCP** and auto-acknowledge → execute. |
| **Integrations · MCP** | Connected systems — **Oracle Primavera P6** (schedule of record), Bentley SYNCHRO 4D, Autodesk Construction Cloud, SAP S/4HANA EPC, Procore, Trimble WorksManager — with live sync activity and the Primavera MCP tool catalog. |

## Suggested demo flow

1. **Command Center** — point out the predicted ductbank breach flagged ~5 weeks early.
2. **Procurement** — award **Asphalt & Surfacing** to the *RoboPave Autonomous Fleet* (robot) over the human incumbent; note the fit score and that the timeline re-plans.
3. **Agent Console** — click **Generate recommendations**, then **issue** a directive; watch a robot directive move Draft → Issued → Acknowledged → Executing.
4. **Integrations** — show Primavera P6 and the other MCP connectors, and the config that wires the bundled server in.

## MCP servers (`mcp/`)

Runnable reference MCP servers that back the Integrations tab:

- **`primavera-mcp-server.mjs`** — fronts an Oracle Primavera P6 schedule. Tools:
  `list_activities`, `get_activity`, `update_progress`, `get_critical_path`,
  `rebaseline`, `push_directive`. Backed by `schedule.sample.json` so it runs
  with no P6 instance; swap the tool bodies for the P6 REST/Integration API and
  set `P6_BASE_URL` / `P6_API_KEY` to go live.
- **`trimble-mcp-server.mjs`** — dispatches robotic fleets. Tools:
  `get_fleet_status`, `dispatch_unit`, `send_command`.

Install and register:

```bash
cd mcp
npm install
node primavera-mcp-server.mjs      # runs on stdio
```

Then add `mcp/mcp-config.example.json` to your MCP client (Claude Desktop, Claude
Code, or any MCP host) — it registers `primavera-p6` and `trimble-works`. The
agent can then call the schedule tools directly (read activities, write progress
back to P6, dispatch fleets, attach directives).

Other systems named in the demo (SYNCHRO 4D, Autodesk Construction Cloud, SAP
S/4HANA, Procore) follow the same pattern — add an MCP server per system exposing
its read/write tools.

## Notes

- All actual progress in the timeline is derived from consolidated reports and
  the dependency cascade, exactly as in the schedule engine — nothing on the
  actual side is hand-drawn.
- The proposal scoring, delay prediction and directive routing all run
  client-side in vanilla JS (see the single `<script>` in `index.html`).
