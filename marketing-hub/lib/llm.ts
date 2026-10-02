// LLM provider layer — Anthropic (Claude) and OpenAI behind one interface, with automatic fallback.
//
//   LLM_PROVIDER=auto (default) | anthropic | openai
//     auto: Anthropic when ANTHROPIC_API_KEY is set, else OpenAI when OPENAI_API_KEY is set.
//     If the chosen provider fails (rate limit, outage, auth), the other one is tried when its key is set.
//   Anthropic: ANTHROPIC_MODEL (default claude-opus-5-5), ANTHROPIC_EFFORT (default medium). Uses prompt caching on the
//     system prompt and data snapshot, and server-side refusal fallbacks ("default").
//   OpenAI:    OPENAI_MODEL (default gpt-5), OPENAI_BASE_URL optional (Azure / compatible gateways).
//
// The app never lets a model act on its own: tools only read data or create drafts; sending and approving stay with
// people. Without any key, the app runs on its built-in rules (lib/chat.ts) and says so.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "anthropic" | "openai";
export type LlmTool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export type LlmTurn = { role: "user" | "assistant"; content: string };
export type LlmResult = { text: string; provider: Provider; model: string; refused?: boolean };

const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const openaiModel = () => process.env.OPENAI_MODEL || "gpt-5";
const has = (p: Provider) => (p === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY);

/** Providers to try, in order. Empty = no AI configured (built-in rules only). */
export function providerOrder(): Provider[] {
  const pref = process.env.LLM_PROVIDER;
  const order: Provider[] = pref === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  if (pref === "anthropic" || pref === "openai") return order.filter(has).slice(0, process.env.LLM_FALLBACK === "off" ? 1 : 2);
  return order.filter(has);
}
export function llmStatus() {
  const order = providerOrder();
  return { enabled: order.length > 0, primary: order[0] ?? null, fallback: order[1] ?? null, models: { anthropic: anthropicModel(), openai: openaiModel() }, keys: { anthropic: has("anthropic"), openai: has("openai") } };
}

type Exec = (name: string, input: any) => Promise<string>;
type Run = { system: string; data?: string; messages: LlmTurn[]; tools?: LlmTool[]; exec?: Exec; maxTurns?: number; maxTokens?: number };

/** Run a conversation (optionally with tools) on the first provider that answers. */
export async function runLlm(r: Run): Promise<LlmResult> {
  const order = providerOrder();
  if (!order.length) throw new Error("No AI provider configured (set ANTHROPIC_API_KEY and/or OPENAI_API_KEY).");
  let last: unknown = null;
  for (const p of order) {
    try {
      return p === "anthropic" ? await runAnthropic(r) : await runOpenAI(r);
    } catch (err) {
      last = err;
      console.error(`LLM provider ${p} failed`, err instanceof Error ? err.message : err);
    }
  }
  throw last instanceof Error ? last : new Error("AI providers failed.");
}

// ------------------------------------------------------------------ Anthropic
async function runAnthropic(r: Run): Promise<LlmResult> {
  const client = new Anthropic();
  const model = anthropicModel();
  // Stable system prompt and data snapshot first, each cached; the conversation follows.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }];
  if (r.data) system.push({ type: "text", text: r.data, cache_control: { type: "ephemeral" } });
  const tools: Anthropic.Beta.BetaTool[] = (r.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages: Anthropic.Beta.BetaMessageParam[] = r.messages.map((m) => ({ role: m.role, content: m.content }));
  const effort = (process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || "medium";

  for (let turn = 0; turn < (r.maxTurns ?? 6); turn++) {
    const res = await client.beta.messages.create({
      model, max_tokens: r.maxTokens ?? 16000, system, messages,
      ...(tools.length ? { tools } : {}),
      output_config: { effort },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return { text: "", provider: "anthropic", model: res.model, refused: true };
    if (res.stop_reason !== "tool_use" || !r.exec) {
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text, provider: "anthropic", model: res.model };
    }
    // Keep the assistant turn exactly as returned (thinking blocks included), then answer every tool call in one message.
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      try { results.push({ type: "tool_result", tool_use_id: b.id, content: await r.exec(b.name, b.input) }); }
      catch (e: any) { results.push({ type: "tool_result", tool_use_id: b.id, content: `Error: ${e?.message ?? e}`, is_error: true }); }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", provider: "anthropic", model };
}

// -------------------------------------------------------------------- OpenAI
async function runOpenAI(r: Run): Promise<LlmResult> {
  const client = new OpenAI(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {});
  const model = openaiModel();
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = (r.tools ?? []).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: r.data ? `${r.system}\n\n${r.data}` : r.system },
    ...r.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];
  for (let turn = 0; turn < (r.maxTurns ?? 6); turn++) {
    const res = await client.chat.completions.create({ model, messages, ...(tools.length ? { tools } : {}), max_completion_tokens: r.maxTokens ?? 8000 });
    const choice = res.choices[0];
    const msg = choice.message;
    const calls = (msg.tool_calls ?? []).filter((c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => c.type === "function");
    if (!calls.length || !r.exec) return { text: (msg.content ?? "").trim(), provider: "openai", model: res.model, refused: !!msg.refusal };
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const c of calls) {
      let out: string;
      try { out = await r.exec(c.function.name, JSON.parse(c.function.arguments || "{}")); } catch (e: any) { out = `Error: ${e?.message ?? e}`; }
      messages.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
  return { text: "", provider: "openai", model };
}
