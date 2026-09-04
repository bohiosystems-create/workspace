#!/usr/bin/env node
/**
 * Bohio · Procore MCP server (reference implementation)
 * -----------------------------------------------------
 * Daily logs & RFIs — the human directive channel. When the agent issues a
 * directive to a human crew, it lands here as an RFI/instruction. Reference
 * build uses an in-memory store; swap tool bodies for the Procore REST API.
 *
 * Run:  npm install && node procore-mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let rfis = [
  { id: "RFI-231", package: "A1400", contractor: "Voltaic Power Systems", subject: "Authorize second night-shift crew on ductbank", status: "acknowledged" },
];
const dailyLogs = [
  { date: "2026-08-28", package: "A1400", manpower: 22, weather: "Clear", note: "Ductbank pours grid E; transformer staged." },
  { date: "2026-08-28", package: "A1500", manpower: 16, weather: "Clear", note: "Sub-base south loop trimming." },
];
let seq = 232;
const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "procore", version: "1.0.0" });

server.tool("list_daily_logs", "Return daily logs (manpower, weather, notes), optionally by package.",
  { package: z.string().optional() },
  async ({ package: pkg }) => ok({ logs: pkg ? dailyLogs.filter((l) => l.package === pkg) : dailyLogs }));

server.tool("create_rfi", "Issue an RFI / instruction to a human crew (the human directive channel).",
  { package: z.string(), contractor: z.string(), subject: z.string() },
  async ({ package: pkg, contractor, subject }) => {
    const r = { id: "RFI-" + seq++, package: pkg, contractor, subject, status: "open" };
    rfis.push(r); return ok({ issued: r });
  });

server.tool("get_directive_status", "Check the status of an issued RFI / directive.", { id: z.string() },
  async ({ id }) => {
    const r = rfis.find((x) => x.id === id);
    if (!r) return { isError: true, content: [{ type: "text", text: `Unknown RFI: ${id}` }] };
    return ok(r);
  });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[procore] MCP server ready on stdio ·", rfis.length, "RFIs");
