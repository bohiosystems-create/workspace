/**
 * The agent for a project created from documents (lib/model3d): no document library or registers behind it, only the
 * model spec the documents produced — buildings, programme activities, logistics. The spec is small, so it goes to the
 * AI model whole, with the critical path, progress and each building's state at the data date worked out here.
 */
import type { AgentReply } from "./agent";
import type { ChatTurn, LlmConfig } from "./llm/types";
import type { RouteInfo } from "../types";
import { availableProviders, routeAndRun } from "./llm/router";
import { specAt, type ProjectModelSpec } from "../model3d/spec";
import { specCritical, specEarnedPct, specPlannedPct, specSlip, specState } from "../critical";

export function specContext(spec: ProjectModelSpec): string {
  const d0 = spec.schedule.dataDate;
  const st = specAt(spec, d0), cp = specCritical(spec);
  const earned = specEarnedPct(spec), planned = specPlannedPct(spec, d0);
  const name = (id: string) => spec.buildings.find((b) => b.id === id)?.name ?? id;
  const lines: string[] = [
    `Project: ${spec.name}${spec.location ? ` · ${spec.location}` : ""}${spec.client ? ` · client ${spec.client}` : ""}`,
    `Data date ${d0} · programme ${spec.schedule.start} → ${spec.schedule.finish}${spec.schedule.baselineFinish ? ` (baseline finish ${spec.schedule.baselineFinish})` : ""}`,
    `Progress at data date: planned ${planned}%${earned != null ? ` · earned ${earned}%` : " · earned % not given by the programme"}`,
    `Critical path (${cp.source === "programme" ? "from the programme's float" : "worked out from the dates"}): forecast completion ${cp.finish}${cp.slip ? `, ${cp.slip} days late` : ""}`,
    "", "Buildings (state at data date):",
    ...spec.buildings.map((b) => { const s = st[b.id]; return `- ${b.name} [${b.id}] ${b.use}, ${b.floors} floors${b.basements ? ` + ${b.basements} basements` : ""}: ${s ? `${s.built}/${b.floors} levels cast, ${Math.floor(s.glazed)} clad, ${s.fitted} fitted out${s.handedOver ? ", handed over" : ""}` : "not started"}${b.source ? ` (source: ${b.source})` : ""}`; }),
    "", "Programme activities (id · building · phase · start → finish · baseline · % · float · state):",
    ...spec.schedule.activities.slice(0, 400).map((a, i) => {
      const crit = cp.items[i]?.critical ? " · CRITICAL" : "";
      return `- ${a.id ?? `#${i + 1}`} · ${name(a.building)} · ${a.name ?? a.phase} · ${a.start} → ${a.finish}${a.baselineFinish ? ` · bl ${a.baselineFinish} (${specSlip(a) > 0 ? `+${specSlip(a)} d` : "on time"})` : ""}${a.progress != null ? ` · ${a.progress}%` : ""}${a.float != null ? ` · float ${a.float} d` : ""} · ${specState(a, d0)}${crit}`;
    }),
  ];
  if (spec.schedule.activities.length > 400) lines.push(`(…${spec.schedule.activities.length - 400} more activities not listed)`);
  if (spec.zones.length || spec.gates.length || spec.cranes.length) lines.push("", "Logistics: " + [
    ...spec.zones.map((z) => `${z.name} (${z.kind})`), ...spec.gates.map((g) => g.name), ...spec.cranes.map((c) => `crane ${c.id}${c.building ? ` at ${name(c.building)}` : ""}`),
  ].join(", "));
  if (spec.assumptions.length) lines.push("", "Assumptions made when the model was built:", ...spec.assumptions.map((a) => `- ${a}`));
  if (spec.sources.length) lines.push("", "Source documents:", ...spec.sources.map((s) => `- ${s.file}: ${s.used}`));
  return lines.join("\n");
}

export async function runSpecAgent(spec: ProjectModelSpec, history: ChatTurn[], ctx: { author: string; channel: "web" | "whatsapp"; deadline?: number }, cfg: LlmConfig): Promise<AgentReply> {
  const wa = ctx.channel === "whatsapp";
  if (!availableProviders(cfg).length) {
    const st = specAt(spec, spec.schedule.dataDate);
    const reply = `*${spec.name}* — ${spec.buildings.length} buildings, programme ${spec.schedule.start} → ${spec.schedule.finish}.\n` +
      spec.buildings.map((b) => `• ${b.name}: ${st[b.id]?.built ?? 0}/${b.floors} levels`).join("\n") + "\n\n(No AI provider is configured, so only this summary is available.)";
    return { reply, actions: [], route: { provider: "offline", model: "summary", tier: "offline", reason: "no AI provider configured" } };
  }
  const system = `You are the Onsite Agent for ${spec.name}, a project whose 3D/4D model was built from its documents. You help ${ctx.author} and the site team.

Everything you know about this project is below — the buildings, the programme and the logistics taken from the documents. Answer only from it; if something isn't in it (drawings, procurement, safety, people), say the project's documents don't cover it yet. Never invent facts.

Style: lead with the answer in 1–2 short sentences, then the details that matter (dates, levels, days late, which activity). Name the activity id or building. ${wa ? "This is WhatsApp: use *bold* sparingly, '•' bullets, no markdown headings or tables; keep it under ~900 characters unless asked for detail." : "No markdown tables; at most a short bullet list."}
"Late" means forecast finish after baseline finish. Today's data date is ${spec.schedule.dataDate}.

${specContext(spec)}`;
  const { out, route } = await routeAndRun(cfg, { system, history: history.slice(-20), tools: [], exec: async () => "", maxTokens: 1500, deadline: ctx.deadline });
  return { reply: out.text || "Done.", actions: [], route: route as RouteInfo };
}
