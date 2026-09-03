#!/usr/bin/env node
/**
 * Bohio · Primavera P6 MCP server (reference implementation)
 * -----------------------------------------------------------
 * A Model Context Protocol server that fronts an Oracle Primavera P6 schedule
 * so an agent can read activities, write progress back, inspect the critical
 * path, re-baseline after an award, and attach directives to activities.
 *
 * This reference build is backed by ./schedule.sample.json so it runs with no
 * P6 instance. To connect a real P6 EPPM system, replace the `store` load/save
 * and each tool body with calls to the P6 REST/Integration API using
 * P6_BASE_URL / P6_API_KEY from the environment.
 *
 * Run:  npm install && node primavera-mcp-server.mjs
 * Register it with any MCP client (see mcp-config.example.json).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, "schedule.sample.json");

// In-memory store (a real server would proxy P6). Progress writes mutate it.
const store = JSON.parse(readFileSync(DATA, "utf8"));
const P6_BASE_URL = process.env.P6_BASE_URL || "(sample data — no live P6)";

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const err = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });
const findAct = (id) => store.activities.find((a) => a.id === id || a.name === id);

const server = new McpServer({ name: "primavera-p6", version: "1.0.0" });

server.tool(
  "list_activities",
  "List Primavera P6 activities with dates, % complete and total float. Optional status filter: not_started | in_progress | complete | critical.",
  { status: z.enum(["not_started", "in_progress", "complete", "critical"]).optional() },
  async ({ status }) => {
    let acts = store.activities;
    if (status === "not_started") acts = acts.filter((a) => a.percentComplete === 0);
    else if (status === "in_progress") acts = acts.filter((a) => a.percentComplete > 0 && a.percentComplete < 100);
    else if (status === "complete") acts = acts.filter((a) => a.percentComplete === 100);
    else if (status === "critical") acts = acts.filter((a) => a.critical);
    return ok({ dataDate: store.project.dataDate, source: P6_BASE_URL, count: acts.length, activities: acts });
  }
);

server.tool(
  "get_activity",
  "Fetch one activity by id (e.g. A1400) or name, including its predecessors.",
  { id: z.string() },
  async ({ id }) => {
    const a = findAct(id);
    if (!a) return err(`Activity not found: ${id}`);
    return ok(a);
  }
);

server.tool(
  "update_progress",
  "Write actuals back to a P6 activity: percent complete and optional actual start / finish dates (YYYY-MM-DD).",
  {
    id: z.string(),
    percentComplete: z.number().min(0).max(100),
    actualStart: z.string().optional(),
    actualFinish: z.string().optional(),
  },
  async ({ id, percentComplete, actualStart, actualFinish }) => {
    const a = findAct(id);
    if (!a) return err(`Activity not found: ${id}`);
    a.percentComplete = percentComplete;
    if (actualStart) a.actualStart = actualStart;
    if (actualFinish) a.actualFinish = actualFinish;
    if (percentComplete === 100 && !a.actualFinish) a.actualFinish = store.project.dataDate;
    return ok({ updated: a.id, name: a.name, percentComplete: a.percentComplete, actualStart: a.actualStart, actualFinish: a.actualFinish, writtenTo: P6_BASE_URL });
  }
);

server.tool(
  "get_critical_path",
  "Return the activities currently on the critical path (total float = 0), in schedule order.",
  {},
  async () => {
    const cp = store.activities.filter((a) => a.critical).sort((x, y) => x.plannedStart.localeCompare(y.plannedStart));
    return ok({ dataDate: store.project.dataDate, length: cp.length, criticalPath: cp.map((a) => ({ id: a.id, name: a.name, plannedFinish: a.plannedFinish, percentComplete: a.percentComplete })) });
  }
);

server.tool(
  "rebaseline",
  "Re-baseline the schedule after an award or re-sequence. Optionally pass the activity id whose contractor/dates changed and a note.",
  { activityId: z.string().optional(), note: z.string().optional() },
  async ({ activityId, note }) => {
    return ok({ rebaselined: true, at: new Date().toISOString(), activityId: activityId || "all", note: note || "Baseline snapshot taken", project: store.project.id });
  }
);

server.tool(
  "push_directive",
  "Attach an agent directive to a P6 activity as a note / RFI, and route it (procore for human crews, trimble for robotic fleets).",
  { activityId: z.string(), text: z.string(), channel: z.enum(["procore", "trimble", "p6_note"]).optional() },
  async ({ activityId, text, channel }) => {
    const a = findAct(activityId);
    if (!a) return err(`Activity not found: ${activityId}`);
    return ok({ attachedTo: a.id, name: a.name, channel: channel || (a.resourceType === "Robot" ? "trimble" : "procore"), directive: text, status: "queued" });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[primavera-p6] MCP server ready on stdio · source:", P6_BASE_URL);
