import type { LlmConfig, LoopInput, LoopOutput } from "./types";
import { DeadlineError, LlmError, callBudget, httpJson } from "./types";

const TIMEOUT_TEXT = "I ran out of time gathering everything for that — please ask a narrower question (one place, package or date range).";

/** Claude Messages API tool loop over plain fetch (works in Node and the browser). */
export async function runAnthropic(cfg: LlmConfig, model: string, inp: LoopInput): Promise<LoopOutput> {
  if (!cfg.anthropic?.apiKey) throw new LlmError("Anthropic API key not configured");
  const base = (cfg.anthropic.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": cfg.anthropic.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (cfg.browser) headers["anthropic-dangerous-direct-browser-access"] = "true";

  const messages: any[] = inp.history.map((m) => ({ role: m.role, content: m.content }));
  if (inp.attachments?.length && messages.length) {
    const last = messages[messages.length - 1];
    last.content = [
      ...inp.attachments.map((a) => a.mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: a.mime, data: a.base64 } }
        : { type: "image", source: { type: "base64", media_type: a.mime, data: a.base64 } }),
      { type: "text", text: last.content },
    ];
  }
  const tools = inp.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const usage = { input: 0, output: 0 };
  let toolCalls = 0;
  for (let turn = 0; turn < (inp.maxTurns ?? 10); turn++) {
    let budget: number;
    try { budget = callBudget(cfg, inp.deadline); } catch (e) { if (turn > 0 && e instanceof DeadlineError) return { text: TIMEOUT_TEXT, usage, toolCalls }; throw e; }
    const res = await httpJson(`${base}/v1/messages`, {
      method: "POST", headers,
      body: JSON.stringify({ model, max_tokens: inp.maxTokens ?? 2000, system: inp.system, messages, ...(tools.length ? { tools } : {}) }),
    }, budget);
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    const content: any[] = res.content ?? [];
    if (res.stop_reason !== "tool_use") {
      return { text: content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(), usage, toolCalls };
    }
    messages.push({ role: "assistant", content });
    const results: any[] = [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      toolCalls++;
      results.push({ type: "tool_result", tool_use_id: b.id, content: await inp.exec(b.name, b.input ?? {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "That took too many steps — try a narrower question.", usage, toolCalls };
}
