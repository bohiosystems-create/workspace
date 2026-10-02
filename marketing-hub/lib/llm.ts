// LLM layer — Anthropic (Claude), OpenAI and Google Gemini behind one interface, with a task router.
//
// Every AI call names its TASK; the router sends it to the provider best suited to that task among those with a key,
// and falls back down the task's list if a provider fails (outage, rate limit, auth, empty answer).
//
//   Task         What it is                                               Default order                 Tier
//   chat         data questions with tools (many lookups, exact numbers)  anthropic → openai → gemini   deep
//   analysis     the daily second opinion, vendor briefings               anthropic → openai → gemini   deep
//   draft        vendor emails (formal Arabic / English, facts only)      anthropic → openai → gemini   fast
//   ideate       campaign ideas — run on up to 2 providers for variety    gemini → openai → anthropic   deep
//   judge        rank and merge ideas against the data and the history   anthropic → openai → gemini   deep
//   summarize    long inputs, bulk and cheap work (large context)         gemini → openai → anthropic   fast
//
// Why: tool-heavy, number-exact work and formal Arabic go to Claude first; idea generation starts on Gemini and adds a
// second provider so the ideas come from different models, then Claude judges them against the data; bulk and
// long-context work starts on Gemini Flash for cost and context size. All of it is configuration, not code:
//
//   LLM_ROUTE_<TASK>=openai,gemini   order for one task (e.g. LLM_ROUTE_IDEATE=anthropic,gemini); unlisted providers follow as fallbacks
//   LLM_PROVIDER=anthropic|openai|gemini   moves one provider to the front of every task without its own route
//   LLM_FALLBACK=off                 use only the first available provider
//   Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (claude-opus-5-5), ANTHROPIC_EFFORT (medium; fast tier uses low)
//   OpenAI:    OPENAI_API_KEY, OPENAI_MODEL (gpt-5), OPENAI_BASE_URL (Azure / gateways); fast tier uses low reasoning effort
//   Gemini:    GEMINI_API_KEY (or GOOGLE_API_KEY), GEMINI_MODEL (deep tier), GEMINI_FAST_MODEL (fast tier), GEMINI_BASE_URL
//
// Models only read data and create drafts: tools never send, approve or spend. Without any key the app runs on its
// built-in rules (lib/chat.ts, lib/ideation.ts) and says so.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, type Content, type Part } from "@google/genai";

export type Provider = "anthropic" | "openai" | "gemini";
export type Task = "chat" | "analysis" | "draft" | "ideate" | "judge" | "summarize";
export type LlmTool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export type LlmTurn = { role: "user" | "assistant"; content: string };
export type LlmResult = { text: string; provider: Provider; model: string; task: Task; refused?: boolean; tried?: Provider[] };

export const PROVIDERS: Provider[] = ["anthropic", "openai", "gemini"];
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };
type Tier = "deep" | "fast";
export const TASKS: Record<Task, { order: Provider[]; tier: Tier; en: string; ar: string; why: string; whyAr: string }> = {
  chat: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Questions on the data (with lookups)", ar: "أسئلة البيانات (مع الاستعلامات)", why: "Many tool calls and exact numbers.", whyAr: "استعلامات كثيرة وأرقام دقيقة." },
  analysis: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Daily second opinion, vendor briefings", ar: "الرأي الثاني اليومي وموجزات الموردين", why: "Careful reasoning over the day's evidence.", whyAr: "استدلال دقيق على أدلة اليوم." },
  draft: { order: ["anthropic", "openai", "gemini"], tier: "fast", en: "Vendor email wording (Arabic / English)", ar: "صياغة رسائل الموردين (عربي / إنجليزي)", why: "Formal business Arabic; facts must not change.", whyAr: "عربية رسمية للأعمال؛ دون تغيير الحقائق." },
  ideate: { order: ["gemini", "openai", "anthropic"], tier: "deep", en: "Campaign ideas (two models for variety)", ar: "أفكار الحملات (نموذجان للتنوع)", why: "Different models give different ideas; two are run when available.", whyAr: "النماذج المختلفة تعطي أفكاراً مختلفة؛ يُشغَّل نموذجان عند توفرهما." },
  judge: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Rank and merge ideas against the data", ar: "ترتيب الأفكار ودمجها مقابل البيانات", why: "Checks ideas against history, targets and budget.", whyAr: "يقارن الأفكار بالتاريخ والمستهدفات والميزانية." },
  summarize: { order: ["gemini", "openai", "anthropic"], tier: "fast", en: "Long inputs, bulk and low-cost work", ar: "المدخلات الطويلة والأعمال الكبيرة منخفضة التكلفة", why: "Large context at low cost.", whyAr: "سياق كبير بتكلفة منخفضة." },
};

const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const openaiModel = () => process.env.OPENAI_MODEL || "gpt-5";
const geminiModel = (tier: Tier) => (tier === "fast" ? process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite" : process.env.GEMINI_MODEL || "gemini-3.8-flash");
const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const has = (p: Provider) => (p === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : p === "openai" ? !!process.env.OPENAI_API_KEY : !!geminiKey());
const modelOf = (p: Provider, tier: Tier) => (p === "anthropic" ? anthropicModel() : p === "openai" ? openaiModel() : geminiModel(tier));

/** Providers to try for a task, in order (only those with a key). Empty = no AI (built-in rules only). */
export function routeFor(task: Task = "chat"): Provider[] {
  const own = process.env[`LLM_ROUTE_${task.toUpperCase()}`];
  let order: Provider[] = own ? (own.split(",").map((s) => s.trim().toLowerCase()).filter((s): s is Provider => (PROVIDERS as string[]).includes(s))) : [...TASKS[task].order];
  const pref = process.env.LLM_PROVIDER as Provider | undefined;
  if (!own && pref && PROVIDERS.includes(pref)) order = [pref, ...order.filter((p) => p !== pref)];
  for (const p of PROVIDERS) if (!order.includes(p)) order.push(p); // the rest stay as fallbacks
  const avail = order.filter(has);
  return process.env.LLM_FALLBACK === "off" ? avail.slice(0, 1) : avail;
}
/** Kept for callers that only need "is any AI on": the chat route. */
export const providerOrder = () => routeFor("chat");

export function llmStatus() {
  const order = routeFor("chat");
  return {
    enabled: order.length > 0, primary: order[0] ?? null, fallback: order[1] ?? null,
    models: { anthropic: anthropicModel(), openai: openaiModel(), gemini: geminiModel("deep"), geminiFast: geminiModel("fast") },
    keys: { anthropic: has("anthropic"), openai: has("openai"), gemini: has("gemini") },
    routes: (Object.keys(TASKS) as Task[]).map((t) => {
      const r = routeFor(t);
      return { task: t, label: TASKS[t].en, labelAr: TASKS[t].ar, why: TASKS[t].why, whyAr: TASKS[t].whyAr, tier: TASKS[t].tier, order: r, model: r[0] ? modelOf(r[0], TASKS[t].tier) : null, custom: !!process.env[`LLM_ROUTE_${t.toUpperCase()}`] };
    }),
  };
}

type Exec = (name: string, input: any) => Promise<string>;
type Run = { task?: Task; system: string; data?: string; messages: LlmTurn[]; tools?: LlmTool[]; exec?: Exec; maxTurns?: number; maxTokens?: number; only?: Provider };

/** Run a task on the first provider of its route that answers (or on `only`). */
export async function runLlm(r: Run): Promise<LlmResult> {
  const task = r.task ?? "chat";
  const order = r.only ? (has(r.only) ? [r.only] : []) : routeFor(task);
  if (!order.length) throw new Error("No AI provider configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY and/or GEMINI_API_KEY).");
  const tier = TASKS[task].tier;
  let last: unknown = null;
  const tried: Provider[] = [];
  for (const p of order) {
    tried.push(p);
    try {
      const res = p === "anthropic" ? await runAnthropic(r, tier) : p === "openai" ? await runOpenAI(r, tier) : await runGemini(r, tier);
      if (!res.text && !res.refused && order.indexOf(p) < order.length - 1) { last = new Error(`${p} returned no text`); continue; } // empty → try the next one
      return { ...res, task, tried };
    } catch (err) {
      last = err;
      console.error(`LLM ${task}: provider ${p} failed`, err instanceof Error ? err.message : err);
    }
  }
  throw last instanceof Error ? last : new Error("AI providers failed.");
}

/** Providers to use for a task that benefits from several models (e.g. ideation): the first `n` distinct ones. */
export const ensembleFor = (task: Task, n = 2) => routeFor(task).slice(0, n);

type Partial_ = Omit<LlmResult, "task" | "tried">;

// ------------------------------------------------------------------ Anthropic
async function runAnthropic(r: Run, tier: Tier): Promise<Partial_> {
  const client = new Anthropic();
  const model = anthropicModel();
  // Stable system prompt and data snapshot first, each cached; the conversation follows.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }];
  if (r.data) system.push({ type: "text", text: r.data, cache_control: { type: "ephemeral" } });
  const tools: Anthropic.Beta.BetaTool[] = (r.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages: Anthropic.Beta.BetaMessageParam[] = r.messages.map((m) => ({ role: m.role, content: m.content }));
  const effort = tier === "fast" ? "low" : ((process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || "medium");

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
async function runOpenAI(r: Run, tier: Tier): Promise<Partial_> {
  const client = new OpenAI(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {});
  const model = openaiModel();
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = (r.tools ?? []).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: r.data ? `${r.system}\n\n${r.data}` : r.system },
    ...r.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];
  for (let turn = 0; turn < (r.maxTurns ?? 6); turn++) {
    const res = await client.chat.completions.create({ model, messages, ...(tools.length ? { tools } : {}), max_completion_tokens: r.maxTokens ?? 8000, ...(tier === "fast" ? { reasoning_effort: "low" as const } : {}) });
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

// -------------------------------------------------------------------- Gemini
async function runGemini(r: Run, tier: Tier): Promise<Partial_> {
  const ai = new GoogleGenAI({ apiKey: geminiKey(), ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}) });
  const model = geminiModel(tier);
  const contents: Content[] = r.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const config = {
    systemInstruction: r.data ? `${r.system}\n\n${r.data}` : r.system,
    maxOutputTokens: r.maxTokens ?? 16000,
    ...(r.tools?.length ? { tools: [{ functionDeclarations: r.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] } : {}),
  };
  for (let turn = 0; turn < (r.maxTurns ?? 6); turn++) {
    const res = await ai.models.generateContent({ model, contents, config });
    const cand = res.candidates?.[0];
    if (res.promptFeedback?.blockReason || !cand || cand.finishReason === "SAFETY") return { text: "", provider: "gemini", model: res.modelVersion ?? model, refused: true };
    const calls = res.functionCalls ?? [];
    if (!calls.length || !r.exec) return { text: (res.text ?? "").trim(), provider: "gemini", model: res.modelVersion ?? model };
    // Keep the model turn as returned (thought signatures included), then answer every call in one user turn.
    if (cand.content) contents.push(cand.content);
    const parts: Part[] = [];
    for (const c of calls) {
      let out: string;
      try { out = await r.exec(c.name ?? "", c.args ?? {}); } catch (e: any) { out = `Error: ${e?.message ?? e}`; }
      parts.push({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts });
  }
  return { text: "", provider: "gemini", model };
}
