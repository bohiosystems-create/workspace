// "Claude app edition" of the offline demo: lib/llm.ts replaced by the claude.ai artifact runtime's `sample`
// capability. When the demo is opened as an artifact in the Claude app (web, desktop or mobile), the assistant,
// the daily second opinion and campaign ideation run on Claude through the VIEWER's own Claude account — no API
// key — with the same read-only data tools as the live app (they run here, in the page, on the in-memory data).
// Outside the Claude app, or if the viewer declines, `sample` is unavailable and the demo uses its built-in rules.
export type Provider = "anthropic" | "openai" | "gemini";
export type Task = "chat" | "analysis" | "draft" | "ideate" | "judge" | "summarize";
export type LlmTool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export type LlmTurn = { role: "user" | "assistant"; content: string };
export { TASKS } from "./demo-llm";
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };
const MODEL = "Claude (your Claude account)";

let sample: any = null;
let gone = false; // the viewer declined, or Claude is not available for this account: stop trying for this view
/** Started once by the demo entry; resolves null outside the Claude app (after ~10 s at most). */
export const sampleReady: Promise<boolean> = (async () => {
  try { sample = (await (window as any).claude?.use?.("sample")) ?? null; } catch { sample = null; }
  return !!sample;
})();
const on = () => !!sample && !gone;

export const routeFor = (_?: Task): Provider[] => (on() ? ["anthropic"] : []);
export const ensembleFor = (_?: Task, __?: number): Provider[] => (on() ? ["anthropic"] : []);
export const providerOrder = () => routeFor("chat");
export const llmStatus = () => ({
  enabled: on(), primary: on() ? ("anthropic" as const) : null, fallback: null,
  models: { anthropic: MODEL, openai: "gpt-5", gemini: "gemini-3.8-flash", geminiFast: "gemini-3.5-flash-lite" },
  keys: { anthropic: on(), openai: false, gemini: false },
  routes: (["chat", "analysis", "draft", "ideate", "judge", "summarize"] as Task[]).map((t) => ({ task: t, order: on() ? (["anthropic"] as Provider[]) : [], model: on() ? MODEL : null, custom: false })),
});

const TIER: Record<Task, "quick" | "default" | "complex"> = { chat: "default", analysis: "default", draft: "quick", ideate: "default", judge: "default", summarize: "quick" };
// Permanent for this view: stop asking Claude and say why. (tools_unavailable is NOT here: plain calls still work.)
const HIDE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);
// When the view allows fewer tools than the assistant has, keep the ones that answer most questions.
const PRIORITY = ["search", "make_chart", "query_data", "get_vendor", "get_campaign", "get_daily_check", "get_signals", "compare", "get_history", "get_period", "show_recommendations", "draft_email", "get_project", "get_channel", "get_audience", "get_market", "get_creatives", "get_competitors", "ideate_campaigns", "get_invoices", "get_meta", "get_calendar"];
const MAX_RESULT = 30_000; // a tool result may be at most 32 KB
const MAX_PROMPT = 240_000; // all turns together at most 256 KiB

let lastError: string | null = null;
let limits: { maxPromptBytes?: number; tools?: { maxCount: number } } | null | undefined;
const getLimits = async () => {
  if (limits === undefined) limits = await Promise.resolve(sample?.limits?.()).catch(() => null) ?? null;
  return limits;
};
/** Why Claude did or didn't answer, for the chat's footnote. */
export const aiState = () => ({ available: !!sample, gone, lastError });

const bytes = (x: string) => new TextEncoder().encode(x).length;
const clip = (x: string, max: number) => (bytes(x) <= max ? x : `${x.slice(0, Math.floor(max / 2))}\n…[cut to fit]`);

type Run = { task?: Task; system: string; data?: string; messages: LlmTurn[]; tools?: LlmTool[]; exec?: (name: string, input: any) => Promise<string>; maxTurns?: number; maxTokens?: number; only?: Provider };
export async function runLlm(r: Run): Promise<{ text: string; provider: Provider; model: string; task: Task; refused?: boolean; tried?: Provider[] }> {
  const task = r.task ?? "chat";
  await sampleReady;
  if (!on()) throw new Error(gone ? `Claude is off for this view (${lastError})` : "Claude is not available in this view; using the built-in answers.");
  const lim = await getLimits();
  // No system role in `sample`: standing instructions and the data go in a leading user turn.
  const msgs = r.messages.filter((m) => m.content?.trim()).slice(-10);
  const room = Math.min(lim?.maxPromptBytes ?? 262_144, MAX_PROMPT) - bytes(r.system) - msgs.reduce((n, m) => n + bytes(m.content), 0) - 2_000;
  const turns = [{ role: "user" as const, content: `${r.system}${r.data ? `\n\n${clip(r.data, Math.max(room, 20_000))}` : ""}` }, ...msgs];
  if (turns[turns.length - 1].role !== "user") turns.push({ role: "user", content: "Continue." });
  // Merge consecutive same-role turns (the first turn is ours, the chat may also start with the viewer's).
  const merged = turns.reduce<LlmTurn[]>((a, t) => { const p = a[a.length - 1]; if (p && p.role === t.role) p.content += `\n\n${t.content}`; else a.push({ ...t }); return a; }, []);
  let tools = r.tools?.length && r.exec && lim?.tools?.maxCount
    ? [...r.tools].sort((a, b) => rank(a.name) - rank(b.name)).slice(0, lim.tools.maxCount).map((t) => ({
        name: t.name, description: t.description.slice(0, 1000), inputSchema: t.parameters,
        execute: async (input: any) => clip(String(await r.exec!(t.name, input ?? {})), MAX_RESULT),
      }))
    : undefined;
  for (;;) {
    try {
      const res = await sample(merged, { modelTier: TIER[task], cache: false, ...(tools ? { tools } : {}) });
      lastError = null;
      return { text: String(res.text ?? "").trim(), provider: "anthropic", model: MODEL, task, tried: ["anthropic"] };
    } catch (e: any) {
      lastError = e?.code ?? "error";
      // One retry without the data tools when this view can't run them (never a loop: tools is now undefined).
      if (tools && (e?.code === "tools_unavailable" || e?.code === "invalid_request" || e?.code === "prompt_too_large")) { console.warn("Claude: retrying without tools", e); tools = undefined; continue; }
      if (HIDE.has(e?.code)) gone = true;
      if (e?.code === "refused") return { text: "", provider: "anthropic", model: MODEL, task, refused: true };
      throw new Error(`Claude (${e?.code ?? "error"}): ${e?.message ?? e}`);
    }
  }
}
const rank = (n: string) => { const i = PRIORITY.indexOf(n); return i < 0 ? 99 : i; };
