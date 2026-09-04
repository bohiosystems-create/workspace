#!/usr/bin/env node
/**
 * Bohio · SAP S/4HANA EPC MCP server (reference implementation)
 * ------------------------------------------------------------
 * Cost & procurement: purchase-order ledger, PO drafting on award, and a
 * budget-vs-committed-vs-actual cost summary. Reference build uses an
 * in-memory ledger; swap tool bodies for the S/4HANA OData/BAPI services.
 *
 * Run:  npm install && node sap-mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let ledger = [
  { po: "PO-4501", package: "A1100", contractor: "Delta Civil",             valueM: 3.10, status: "closed" },
  { po: "PO-4502", package: "A1200", contractor: "AquaFlow Infrastructure", valueM: 2.80, status: "closed" },
  { po: "PO-4503", package: "A1400", contractor: "Voltaic Power Systems",   valueM: 4.20, status: "committed" },
  { po: "PO-4504", package: "A1500", contractor: "Meridian Roads",          valueM: 2.60, status: "committed" },
];
const budgetM = 24.0;
let seq = 4505;
const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "sap-s4-epc", version: "1.0.0" });

server.tool("get_po_ledger", "Return the purchase-order ledger, optionally filtered by status.",
  { status: z.enum(["draft", "committed", "closed"]).optional() },
  async ({ status }) => ok({ ledger: status ? ledger.filter((p) => p.status === status) : ledger }));

server.tool("create_po", "Draft a purchase order for an awarded package.",
  { package: z.string(), contractor: z.string(), valueM: z.number() },
  async ({ package: pkg, contractor, valueM }) => {
    const po = { po: "PO-" + seq++, package: pkg, contractor, valueM, status: "draft" };
    ledger.push(po); return ok(po);
  });

server.tool("get_cost_summary", "Return budget vs committed vs actual (M).", {}, async () => {
  const committed = ledger.filter((p) => p.status !== "draft").reduce((s, p) => s + p.valueM, 0);
  const actual = ledger.filter((p) => p.status === "closed").reduce((s, p) => s + p.valueM, 0);
  return ok({ budgetM, committedM: +committed.toFixed(2), actualM: +actual.toFixed(2), remainingM: +(budgetM - committed).toFixed(2) });
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[sap-s4-epc] MCP server ready on stdio ·", ledger.length, "POs");
