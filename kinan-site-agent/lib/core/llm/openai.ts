import type { LlmConfig, LoopInput, LoopOutput } from "./types";
import { DeadlineError, LlmError, callBudget, httpJson } from "./types";

const TIMEOUT_TEXT = "I ran out of time gathering everything for that — please ask a narrower question (one place, package or date range).";
const reasoningModel = (m: string) => /^(gpt-5|o\d)/i.test(m);

/** OpenAI Chat Completions tool loop over plain fetch. */
export async function runOpenAI(cfg: LlmConfig, model: string, inp: LoopInput): Promise<LoopOutput> {
  if (!cfg.openai?.apiKey) throw new LlmError("OpenAI API key not configured");
  const base = (cfg.openai.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const headers = { "content-type": "application/json", authorization: `Bearer ${cfg.openai.apiKey}` };

  const filePart = (mime: string, base64: string, name = "file") => mime === "application/pdf"
    ? { type: "file", file: { filename: name.endsWith(".pdf") ? name : `${name}.pdf`, file_data: `data:${mime};base64,${base64}` } }
    : { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } };

  const messages: any[] = [{ role: "system", content: inp.system }, ...inp.history.map((m) => ({ role: m.role, content: m.content }))];
  if (inp.attachments?.length && messages.length > 1) {
    const last = messages[messages.length - 1];
    last.content = [{ type: "text", text: last.content }, ...inp.attachments.map((a) => filePart(a.mime, a.base64, a.name))];
  }
  const tools = inp.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const usage = { input: 0, output: 0 };
  let toolCalls = 0;

  for (let turn = 0; turn < (inp.maxTurns ?? 10); turn++) {
    const body: Record<string, unknown> = { model, messages, max_completion_tokens: inp.maxTokens ? inp.maxTokens * 3 : 6000 };
    if (tools.length) { body.tools = tools; body.tool_choice = "auto"; }
    if (reasoningModel(model) && cfg.openai.reasoningEffort) body.reasoning_effort = cfg.openai.reasoningEffort;
    let budget: number;
    try { budget = callBudget(cfg, inp.deadline); } catch (e) { if (turn > 0 && e instanceof DeadlineError) return { text: TIMEOUT_TEXT, usage, toolCalls }; throw e; }
    const res = await httpJson(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) }, budget);
    usage.input += res.usage?.prompt_tokens ?? 0;
    usage.output += res.usage?.completion_tokens ?? 0;
    const msg = res.choices?.[0]?.message;
    if (!msg) throw new LlmError("OpenAI returned no message");
    const calls: any[] = msg.tool_calls ?? [];
    if (!calls.length) return { text: String(msg.content ?? "").trim(), usage, toolCalls };

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    const media: any[] = [];
    for (const c of calls) {
      toolCalls++;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* model sent bad JSON */ }
      const out = await inp.exec(c.function?.name, args);
      if (typeof out === "string") {
        messages.push({ role: "tool", tool_call_id: c.id, content: out });
      } else {
        // Tool messages are text-only: send the text, then attach files in a user turn.
        messages.push({ role: "tool", tool_call_id: c.id, content: out.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n") + "\n(file attached in next message)" });
        for (const b of out) {
          const src = (b as any).source;
          if (src?.data) media.push(filePart(src.media_type, src.data, "document"));
        }
      }
    }
    if (media.length) messages.push({ role: "user", content: [{ type: "text", text: "Attached file(s) from the tool result above:" }, ...media] });
  }
  return { text: "That took too many steps — try a narrower question.", usage, toolCalls };
}

/** Speech-to-text for WhatsApp voice notes (ogg/opus accepted). */
export async function transcribe(cfg: LlmConfig, bytes: Uint8Array, mime: string, filename = "voice.ogg"): Promise<string> {
  if (!cfg.openai?.apiKey) throw new LlmError("Voice notes need OPENAI_API_KEY (transcription).");
  const base = (cfg.openai.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const fd = new FormData();
  fd.set("model", cfg.openai.transcribeModel || "whisper-1");
  fd.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const res = await httpJson(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${cfg.openai.apiKey}` }, body: fd }, cfg.timeoutMs);
  return String(res.text ?? "").trim();
}
