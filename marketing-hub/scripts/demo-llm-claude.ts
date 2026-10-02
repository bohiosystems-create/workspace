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
const HIDE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed", "tools_unavailable"]);

type Run = { task?: Task; system: string; data?: string; messages: LlmTurn[]; tools?: LlmTool[]; exec?: (name: string, input: any) => Promise<string>; maxTurns?: number; maxTokens?: number; only?: Provider };
export async function runLlm(r: Run): Promise<{ text: string; provider: Provider; model: string; task: Task; refused?: boolean; tried?: Provider[] }> {
  const task = r.task ?? "chat";
  if (!on()) throw new Error("Claude is not available in this view; using the built-in answers.");
  // No system role in `sample`: standing instructions and the data go in a leading user turn.
  const turns = [{ role: "user" as const, content: `${r.system}${r.data ? `\n\n${r.data}` : ""}` }, ...r.messages.filter((m) => m.content?.trim())];
  if (turns[turns.length - 1].role !== "user") turns.push({ role: "user", content: "Continue." });
  const tools = r.tools?.length && r.exec ? r.tools.map((t) => ({ name: t.name, description: t.description.slice(0, 1000), inputSchema: t.parameters, execute: (input: any) => r.exec!(t.name, input ?? {}) })) : undefined;
  try {
    const res = await sample(turns, { modelTier: TIER[task], cache: false, ...(tools ? { tools } : {}) });
    return { text: String(res.text ?? "").trim(), provider: "anthropic", model: MODEL, task, tried: ["anthropic"] };
  } catch (e: any) {
    if (HIDE.has(e?.code)) gone = true;
    if (e?.code === "refused") return { text: "", provider: "anthropic", model: MODEL, task, refused: true };
    throw new Error(`Claude (${e?.code ?? "error"}): ${e?.message ?? e}`);
  }
}
