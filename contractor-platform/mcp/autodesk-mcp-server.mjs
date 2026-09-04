#!/usr/bin/env node
/**
 * Bohio · Autodesk Construction Cloud MCP server (reference implementation)
 * ------------------------------------------------------------------------
 * Field & QA: field issues/observations and RFIs tagged to work packages.
 * Reference build uses an in-memory store; swap tool bodies for the ACC /
 * BIM 360 API (Issues, RFIs).
 *
 * Run:  npm install && node autodesk-mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let issues = [
  { id: "ISS-104", activity: "A1400", type: "observation", status: "open", title: "Ductbank trench shoring below spec on grid E4.", severity: "high" },
  { id: "ISS-105", activity: "A1400", type: "quality",     status: "open", title: "Conduit bend radius to verify against IFC.", severity: "medium" },
  { id: "ISS-098", activity: "A1500", type: "safety",      status: "closed", title: "Edge protection at south loop.", severity: "medium" },
];
let seq = 106;
const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "autodesk-acc", version: "1.0.0" });

server.tool("list_issues", "List field issues / observations, optionally filtered by activity or status.",
  { activity: z.string().optional(), status: z.enum(["open", "closed"]).optional() },
  async ({ activity, status }) => {
    let r = issues;
    if (activity) r = r.filter((i) => i.activity === activity);
    if (status) r = r.filter((i) => i.status === status);
    return ok({ count: r.length, issues: r });
  });
server.tool("create_issue", "Log a field issue against an activity/package.",
  { activity: z.string(), title: z.string(), type: z.enum(["observation", "quality", "safety"]).optional(), severity: z.enum(["low", "medium", "high"]).optional() },
  async ({ activity, title, type, severity }) => {
    const i = { id: "ISS-" + seq++, activity, type: type || "observation", status: "open", title, severity: severity || "medium" };
    issues.push(i); return ok(i);
  });
server.tool("close_issue", "Close a field issue by id.", { id: z.string() }, async ({ id }) => {
  const i = issues.find((x) => x.id === id);
  if (!i) return { isError: true, content: [{ type: "text", text: `Unknown issue: ${id}` }] };
  i.status = "closed"; return ok(i);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[autodesk-acc] MCP server ready on stdio ·", issues.length, "issues");
