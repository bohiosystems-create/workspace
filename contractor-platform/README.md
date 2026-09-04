# Bohio · Contractor Platform

A standalone demo of a contractor-management platform for heavy-duty,
physical-world infrastructure programmes — where **human crews and robotic
fleets are interchangeable contractors**. The platform lets you pick the best
proposal for each work package, monitor delivery against plan, **predict delays
before they land**, and **agentically issue corrective directives** to the
contractors themselves — human or robot. It connects to the PM systems these
industries already run on (Primavera P6 and others) over **MCP**.

This demo is self-contained and separate from the rest of the Bohio workspace.
It ships **two interfaces**: the owner/PMC/GC platform (`index.html`) and the
contractor-facing portal (`contractor-portal.html`). Both need no build, no
server and no API key. The `mcp/` folder holds runnable MCP servers.

## Run it

Open `index.html` (the owner/PMC/GC side) or `contractor-portal.html` (the
contractor side) in any browser. Each seeds the same live programme
(Marina District — Access & Utilities) and persists to `localStorage`. On the
platform, use **Reset demo** to return to the starting state.

## Owner / PMC / GC platform (`index.html`)

| Tab | What it demonstrates |
|-----|----------------------|
| **Contractors** *(landing)* | A roster of human crews and robotic fleets, scored on the same axes — interchangeable by design. **Rate & review** any contractor (stars, tags, note); that feedback blends into their rating and feeds the contract-award fit score. |
| **Contractor Management** | A **worksite site plan** with each contractor's live location (human circles, robot squares, delayed in red). Click a contractor for their **last update**, their **latest site reports**, and to **send a request for clarification with a response deadline** (routed via Procore). |
| **Contract Awards** | The **contract awards register** (every package, who it's awarded to, value, status) plus **open tenders** — competing human vs robot bids scored on cost / duration / risk / availability / rating; **award a contract with a click** and the plan re-plans around the winner. |
| **Agent Console** | The **agentic control loop**: the platform detects a breach, drafts a corrective directive, and — on approval — issues it. Human crews are instructed via Procore; **robotic fleets are dispatched via the Trimble fleet MCP** and auto-acknowledge → execute. |
| **⚙ Settings** *(top-right gear)* | **Anthropic API** — set the Claude model the agent uses to draft directives (key stored locally only). Plus connected systems over MCP — **Oracle Primavera P6** (schedule of record), SYNCHRO 4D, Autodesk Construction Cloud, SAP S/4HANA EPC, Procore, Trimble — with live sync activity and the MCP tool catalog. |

The consolidated schedule itself (planned vs actual, critical path, milestones)
lives in Primavera P6, reached through the MCP connection in Settings.

## Contractor portal (`contractor-portal.html`)

The other side of the loop — what a **human contractor** sees. Sign in as any
contractor (top-right) to:

- **Instructions** — receive and act on instructions issued by the owner, PMC,
  GC and the platform agent: acknowledge, start, mark complete, and reply.
  Responses flow back to the owner's programme (via Procore / Primavera P6).
- **My Work** — see assigned packages and **submit a progress update** that
  feeds straight into the owner's consolidated timeline.

### The two interfaces are connected

When both pages are served from the **same origin** (any static host, or the
same folder behind a local server), they share a live channel: issuing a
directive in the platform's **Agent Console**, or sending a **clarification
request** from **Contractor Management**, delivers it into the contractor's
portal inbox in real time (with its deadline) — no reload, no backend. It uses
shared `localStorage` plus `storage` events, so it works on a host but not from
`file://` (where browsers isolate each file); there each page falls back to its
seeded data. A shared backend (the Procore/MCP layer in production) would make
this durable and multi-device.

Quick local run:

```bash
cd bohio-contractor-platform
python3 -m http.server 8099
# open http://localhost:8099/index.html and http://localhost:8099/contractor-portal.html
```

## Suggested demo flow

1. **Contractors** — leave a review on a contractor and watch its rating shift.
2. **Contractor Management** — open the worksite map, click the delayed contractor, read its last update and site reports, and send a clarification request with a deadline.
3. **Contract Awards** — award **Asphalt & Surfacing** to the *RoboPave Autonomous Fleet* (robot) over the human incumbent; note the fit score and the updated register.
4. **Agent Console** — click **Generate recommendations**, then **issue** a directive; watch a robot directive move Draft → Issued → Acknowledged → Executing.
5. **Contractor portal** — open `contractor-portal.html`, sign in as the same contractor, and see the instruction arrive; acknowledge and reply.

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
