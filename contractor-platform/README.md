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
| **Contractors** *(landing)* | A roster of human crews and robotic fleets, scored on the same axes — interchangeable by design. **Rate & review** any contractor (stars, tags, note); that feedback blends into their rating and feeds the procurement fit score on future tenders. |
| **Procurement** | Open tenders with competing **human vs robot proposals**, each scored on cost / duration / risk / availability / rating. The platform recommends one; you **award with a click** and the plan re-plans around the winner. |
| **Agent Console** | The **agentic control loop**: the platform detects a breach, drafts a corrective directive, and — on approval — issues it. Human crews are instructed via Procore; **robotic fleets are dispatched a machine command via the Trimble fleet MCP** and auto-acknowledge → execute. |
| **⚙ Settings** *(top-right gear)* | Connected systems over MCP — **Oracle Primavera P6** (schedule of record), Bentley SYNCHRO 4D, Autodesk Construction Cloud, SAP S/4HANA EPC, Procore, Trimble WorksManager — with live sync activity and the Primavera MCP tool catalog. |

The consolidated schedule itself (planned vs actual, critical path, milestones)
lives in Primavera P6, reached through the MCP connection in Settings.

## Suggested demo flow

1. **Contractors** — leave a review on a contractor and watch its rating shift; note that it will change the procurement score.
2. **Procurement** — award **Asphalt & Surfacing** to the *RoboPave Autonomous Fleet* (robot) over the human incumbent; note the fit score.
3. **Agent Console** — click **Generate recommendations**, then **issue** a directive; watch a robot directive move Draft → Issued → Acknowledged → Executing.
4. **⚙ Settings** — show Primavera P6 and the other MCP connectors, and the config that wires the bundled server in.

## MCP servers (`mcp/`)

Every connector in the Settings tab ships as a runnable reference MCP server —
all six are verified over a stdio JSON-RPC handshake:

| Server file | Connector | Key tools |
|-------------|-----------|-----------|
| `primavera-mcp-server.mjs` | Oracle Primavera P6 (schedule of record) | `list_activities`, `get_activity`, `update_progress`, `get_critical_path`, `rebaseline`, `push_directive` |
| `synchro-mcp-server.mjs` | Bentley SYNCHRO 4D | `get_sequence`, `link_task`, `resequence`, `get_clashes` |
| `autodesk-mcp-server.mjs` | Autodesk Construction Cloud | `list_issues`, `create_issue`, `close_issue` |
| `sap-mcp-server.mjs` | SAP S/4HANA EPC | `get_po_ledger`, `create_po`, `get_cost_summary` |
| `procore-mcp-server.mjs` | Procore (human directive channel) | `list_daily_logs`, `create_rfi`, `get_directive_status` |
| `trimble-mcp-server.mjs` | Trimble WorksManager (robot fleet dispatch) | `get_fleet_status`, `dispatch_unit`, `send_command` |

Primavera P6 is backed by `schedule.sample.json`; the rest use small in-memory
stores. Each is a reference build — swap the tool bodies for the real vendor API
(and set `P6_BASE_URL` / `P6_API_KEY` for P6) to go live.

Install and register:

```bash
cd mcp
npm install
node primavera-mcp-server.mjs      # runs on stdio (likewise synchro/autodesk/sap/procore/trimble)
```

Then add `mcp/mcp-config.example.json` to your MCP client (Claude Desktop, Claude
Code, or any MCP host) — it registers all six servers. The agent can then call
the tools directly: read/write the P6 schedule, re-sequence in SYNCHRO, log field
issues in ACC, draft POs in SAP, issue RFIs to human crews via Procore, and
dispatch robotic fleets via Trimble.

## Notes

- All actual progress in the timeline is derived from consolidated reports and
  the dependency cascade, exactly as in the schedule engine — nothing on the
  actual side is hand-drawn.
- The proposal scoring, delay prediction and directive routing all run
  client-side in vanilla JS (see the single `<script>` in `index.html`).
