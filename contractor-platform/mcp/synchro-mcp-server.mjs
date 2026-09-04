#!/usr/bin/env node
/**
 * Bohio · Bentley SYNCHRO 4D MCP server (reference implementation)
 * ---------------------------------------------------------------
 * 4D BIM sequencing: links schedule activities to model elements/zones,
 * re-sequences work, and reports sequencing/space clashes. Reference build
 * uses an in-memory model; swap tool bodies for the SYNCHRO / iTwin API.
 *
 * Run:  npm install && node synchro-mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let links = [
  { activity: "A1100", zone: "Z-Earthworks", elements: 412, sequence: 1 },
  { activity: "A1200", zone: "Z-Drainage",   elements: 268, sequence: 2 },
  { activity: "A1400", zone: "Z-Substation", elements: 154, sequence: 3 },
  { activity: "A1500", zone: "Z-Road-South", elements: 331, sequence: 4 },
  { activity: "A1600", zone: "Z-Road-South", elements: 220, sequence: 5 },
];
const clashes = [
  { id: "C-01", between: ["A1400", "A1500"], zone: "Z-Road-South", type: "space", note: "Substation crane radius overlaps sub-base crew corridor." },
];
const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "synchro-4d", version: "1.0.0" });

server.tool("get_sequence", "Return the 4D task sequence with model-element links.", {}, async () =>
  ok({ tasks: links.sort((a, b) => a.sequence - b.sequence) })
);
server.tool("link_task", "Link a schedule activity to a model zone/element set.", { activity: z.string(), zone: z.string(), elements: z.number().optional() },
  async ({ activity, zone, elements }) => {
    links.push({ activity, zone, elements: elements || 0, sequence: links.length + 1 });
    return ok({ linked: activity, zone });
  });
server.tool("resequence", "Re-order the 4D sequence (pass activity ids in the new order).", { order: z.array(z.string()) },
  async ({ order }) => {
    order.forEach((a, i) => { const l = links.find((x) => x.activity === a); if (l) l.sequence = i + 1; });
    return ok({ resequenced: true, order, criticalPathRecomputed: true });
  });
server.tool("get_clashes", "Return current sequencing / space clashes.", {}, async () => ok({ count: clashes.length, clashes }));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[synchro-4d] MCP server ready on stdio ·", links.length, "linked tasks");
