// Offline demo stand-in for lib/llm.ts: no AI provider (keeps the SDKs out of the bundle). The app runs on its rules.
export type Provider = "anthropic" | "openai" | "gemini";
export type Task = "chat" | "analysis" | "draft" | "ideate" | "judge" | "summarize";
export type LlmTool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };
export const routeFor = (_?: Task): Provider[] => [];
export const ensembleFor = (_?: Task, __?: number): Provider[] => [];
export const providerOrder = (): Provider[] => [];
export const llmStatus = () => ({ enabled: false, primary: null, fallback: null, models: { anthropic: "claude-opus-5-5", openai: "gpt-5", gemini: "gemini-3.8-flash", geminiFast: "gemini-3.5-flash-lite" }, keys: { anthropic: false, openai: false, gemini: false }, routes: [] as any[] });
export async function runLlm(_: unknown): Promise<{ text: string; provider: Provider; model: string; task: Task; refused?: boolean }> {
  throw new Error("The offline demo has no AI provider; the live app uses Claude, OpenAI or Gemini.");
}
