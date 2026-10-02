// Offline demo stand-in for lib/llm.ts: no AI provider (keeps both SDKs out of the bundle). The app runs on its rules.
export type Provider = "anthropic" | "openai";
export type LlmTool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export const providerOrder = (): Provider[] => [];
export const llmStatus = () => ({ enabled: false, primary: null, fallback: null, models: { anthropic: "claude-opus-5-5", openai: "gpt-5" }, keys: { anthropic: false, openai: false } });
export async function runLlm(_: unknown): Promise<{ text: string; provider: Provider; model: string; refused?: boolean }> {
  throw new Error("The offline demo has no AI provider; the live app uses Anthropic or OpenAI.");
}
