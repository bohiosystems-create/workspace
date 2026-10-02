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
export const TASKS: Record<Task, { order: Provider[]; tier: "deep" | "fast"; en: string; ar: string; why: string; whyAr: string }> = {
  chat: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Questions on the data (with lookups)", ar: "أسئلة البيانات (مع الاستعلامات)", why: "Many tool calls and exact numbers.", whyAr: "استعلامات كثيرة وأرقام دقيقة." },
  analysis: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Daily second opinion, vendor briefings", ar: "الرأي الثاني اليومي وموجزات الموردين", why: "Careful reasoning over the day's evidence.", whyAr: "استدلال دقيق على أدلة اليوم." },
  draft: { order: ["anthropic", "openai", "gemini"], tier: "fast", en: "Vendor email wording (Arabic / English)", ar: "صياغة رسائل الموردين (عربي / إنجليزي)", why: "Formal business Arabic; facts must not change.", whyAr: "عربية رسمية للأعمال؛ دون تغيير الحقائق." },
  ideate: { order: ["gemini", "openai", "anthropic"], tier: "deep", en: "Campaign ideas (two models for variety)", ar: "أفكار الحملات (نموذجان للتنوع)", why: "Different models give different ideas; two are run when available.", whyAr: "النماذج المختلفة تعطي أفكاراً مختلفة؛ يُشغَّل نموذجان عند توفرهما." },
  judge: { order: ["anthropic", "openai", "gemini"], tier: "deep", en: "Rank and merge ideas against the data", ar: "ترتيب الأفكار ودمجها مقابل البيانات", why: "Checks ideas against history, targets and budget.", whyAr: "يقارن الأفكار بالتاريخ والمستهدفات والميزانية." },
  summarize: { order: ["gemini", "openai", "anthropic"], tier: "fast", en: "Long inputs, bulk and low-cost work", ar: "المدخلات الطويلة والأعمال الكبيرة منخفضة التكلفة", why: "Large context at low cost.", whyAr: "سياق كبير بتكلفة منخفضة." },
};
export const sampleReady: Promise<boolean> = Promise.resolve(false);
export const aiState = (): { available: boolean; gone: boolean; lastError: string | null } => ({ available: false, gone: false, lastError: null });
