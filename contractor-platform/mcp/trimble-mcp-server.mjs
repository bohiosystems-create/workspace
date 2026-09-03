#!/usr/bin/env node
/**
 * Bohio · Trimble WorksManager MCP server (reference implementation)
 * -----------------------------------------------------------------
 * Dispatches machine commands to autonomous / robotic contractor fleets and
 * reads back telemetry. This is the channel the agent uses when a directive is
 * issued to a robot contractor (the human equivalent is the Procore MCP server).
 *
 * Reference build uses an in-memory fleet. For production, replace tool bodies
 * with the Trimble WorksManager / fleet-controller API.
 *
 * Run:  npm install && node trimble-mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const fleet = [
  { unit: "RP-01", type: "Autonomous paver", contractor: "RoboPave Autonomous Fleet", state: "idle",   location: "south compound", autonomy: "L4" },
  { unit: "RP-02", type: "Autonomous paver", contractor: "RoboPave Autonomous Fleet", state: "idle",   location: "south compound", autonomy: "L4" },
  { unit: "RP-03", type: "Autonomous paver", contractor: "RoboPave Autonomous Fleet", state: "idle",   location: "south compound", autonomy: "L4" },
  { unit: "GB-01", type: "Pole-setting robot", contractor: "Gridline Robotics",       state: "standby", location: "yard",           autonomy: "L3" },
  { unit: "GB-02", type: "Pole-setting robot", contractor: "Gridline Robotics",       state: "standby", location: "yard",           autonomy: "L3" },
  { unit: "TS-swarm", type: "Survey drone swarm", contractor: "Terra Survey Drones",  state: "flying", location: "sub-base south loop", autonomy: "L4" },
];
const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "trimble-works", version: "1.0.0" });

server.tool("get_fleet_status", "List robotic units, their state, autonomy level and location.", {}, async () =>
  ok({ online: fleet.length, fleet })
);

server.tool(
  "dispatch_unit",
  "Dispatch one or more robotic units of a contractor to a work location and task.",
  { contractor: z.string(), task: z.string(), location: z.string().optional(), units: z.number().optional() },
  async ({ contractor, task, location, units }) => {
    const avail = fleet.filter((f) => f.contractor === contractor && f.state !== "flying").slice(0, units || 99);
    avail.forEach((f) => { f.state = "executing"; if (location) f.location = location; });
    return ok({ dispatched: avail.map((f) => f.unit), contractor, task, location: location || "site", acknowledgedAt: new Date().toISOString(), status: avail.length ? "executing" : "no units available" });
  }
);

server.tool(
  "send_command",
  "Send a low-level command to a specific unit (e.g. start, pause, return_to_base, extend_shift).",
  { unit: z.string(), command: z.enum(["start", "pause", "return_to_base", "extend_shift"]) },
  async ({ unit, command }) => {
    const u = fleet.find((f) => f.unit === unit);
    if (!u) return { isError: true, content: [{ type: "text", text: `Unknown unit: ${unit}` }] };
    if (command === "return_to_base") u.state = "idle";
    else if (command === "start" || command === "extend_shift") u.state = "executing";
    else if (command === "pause") u.state = "paused";
    return ok({ unit, command, newState: u.state, at: new Date().toISOString() });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[trimble-works] MCP fleet server ready on stdio ·", fleet.length, "units");
