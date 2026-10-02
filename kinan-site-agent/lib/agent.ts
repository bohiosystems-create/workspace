import { runAgent as coreRun, type AgentContext, type AgentReply } from "./core/agent";
import type { ChatTurn } from "./core/llm/types";
import { serverLlm } from "./llmConfig";
import { getRepo } from "./store";

export type ChatMsg = ChatTurn;
export type { AgentReply };

/** Seconds the agent may spend per answer. Vercel functions stop at maxDuration (60 s here). */
export const agentBudgetMs = () => Number(process.env.AGENT_DEADLINE_MS) || (process.env.VERCEL ? 50_000 : 110_000);

export async function runAgent(history: ChatTurn[], ctx: AgentContext): Promise<AgentReply> {
  return coreRun(await getRepo(), history, { deadline: Date.now() + agentBudgetMs(), ...ctx }, serverLlm());
}
