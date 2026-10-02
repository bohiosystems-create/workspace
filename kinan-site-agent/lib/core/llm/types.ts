import type { Attachment, ToolDef, ToolResult } from "../tools";

export type Provider = "anthropic" | "openai";
export type Tier = "fast" | "main" | "deep";
export interface Target { provider: Provider; model: string }

export interface LlmConfig {
  anthropic?: { apiKey: string; baseUrl?: string };
  openai?: { apiKey: string; baseUrl?: string; reasoningEffort?: string; transcribeModel?: string };
  /** auto = route by request; anthropic/openai = prefer that provider for every tier. */
  mode: "auto" | Provider;
  routes: Record<Tier, Target[]>;
  /** Try the next candidate (other provider) when a call fails. */
  fallback: boolean;
  /** Set when running in a browser (adds Anthropic's direct-browser-access header). */
  browser?: boolean;
  timeoutMs?: number;
}

export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface LoopInput {
  system: string;
  history: ChatTurn[];
  attachments?: Attachment[];          // added to the last user turn
  tools: ToolDef[];
  exec: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  maxTurns?: number;
  maxTokens?: number;
  /** Absolute time (ms since epoch) by which we must have answered — serverless limit. */
  deadline?: number;
}
export class DeadlineError extends Error {}
/** Time left for the next HTTP call, honouring both the per-call timeout and the overall deadline. */
export function callBudget(cfg: { timeoutMs?: number }, deadline?: number): number {
  const per = cfg.timeoutMs ?? 60_000;
  if (!deadline) return per;
  const left = deadline - Date.now() - 1500; // keep time to send the reply
  if (left < 2500) throw new DeadlineError("out of time");
  return Math.min(per, left);
}
export interface LoopOutput { text: string; usage: { input: number; output: number }; toolCalls: number }

export class LlmError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export async function httpJson(url: string, init: RequestInit, timeoutMs = 60_000): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ac.signal });
  } catch (e) {
    throw new LlmError(ac.signal.aborted ? `timeout after ${timeoutMs} ms` : `network error: ${e instanceof Error ? e.message : e}`);
  } finally { clearTimeout(t); }
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.raw ?? res.statusText;
    throw new LlmError(`HTTP ${res.status}: ${msg}`, res.status);
  }
  return body;
}
