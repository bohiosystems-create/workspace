// Vendor briefing and vendor notes, written by whichever AI provider is configured (Anthropic or OpenAI, lib/llm.ts).
import { runLlm, llmStatus } from "./llm";

async function write(system: string, content: string, maxTokens: number): Promise<string> {
  if (!llmStatus().enabled) throw Object.assign(new Error("AI needs ANTHROPIC_API_KEY or OPENAI_API_KEY."), { status: 503 });
  const res = await runLlm({ system, messages: [{ role: "user", content }], maxTokens });
  if (res.refused || !res.text) throw new Error("The AI did not return a draft — try again.");
  return res.text;
}

// ----- Vendor performance brief -------------------------
export async function draftMarketingBrief(args: { dashboard: unknown; lang?: "en" | "ar" }): Promise<string> {
  return write(`You are a head of marketing for a real-estate developer, briefing the CEO on external marketing vendors. In 3-5 sentences, say which vendors are converting spend into contracted sales, which are not, and the two or three decisions to take now (use the recommendations and alerts). Use ONLY the figures in the provided JSON; never invent numbers. Note where attribution is weak (PR / outdoor). Plain prose, no markdown headings.${args.lang === "ar" ? " Write in clear Modern Standard Arabic with Western digits (0-9); keep SAR amounts as in the data." : ""}`,
    `Brief me on vendor performance and next actions:\n\n${JSON.stringify(args.dashboard, null, 2)}`,
    4000);
}

// ----- Marketing & Sales: instruction note to a vendor ---------------------
export async function draftVendorNote(args: {
  vendor: unknown;
  campaigns: unknown;
  alerts: unknown;
  lang?: "en" | "ar";
}): Promise<string> {
  return write(`You are drafting a short, firm-but-collaborative email from a real-estate developer's marketing lead to an external marketing vendor. Cover: what the numbers show, any SLA breach against the contract, the specific change requested, and a date to respond. Use ONLY the figures provided. Plain text, under 180 words, with a subject line first.${args.lang === "ar" ? " Write in formal Modern Standard Arabic business style (Western digits), beginning 'السادة / <vendor> المحترمون،'." : ""}`,
    `Vendor scorecard: ${JSON.stringify(args.vendor)}\nCampaigns: ${JSON.stringify(args.campaigns)}\nRelevant alerts: ${JSON.stringify(args.alerts)}`,
    4000);
}
