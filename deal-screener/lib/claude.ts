import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Hurdles } from "./hurdles";
import type { Underwrite } from "./underwrite";

export const MODEL = "claude-opus-4-8";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// ----- Extraction schema -------------------------------------------------
// All fields nullable: an OM/teaser may omit any of them, and we'd rather get a
// null than a hallucinated number. Monetary fields are in millions of the
// deal's own currency.
export const ExtractedDealSchema = z.object({
  assetName: z.string().nullable(),
  assetType: z.string().nullable(),
  location: z.string().nullable(),
  currency: z.string().nullable(),
  askingPriceM: z.number().nullable(),
  netInitialYieldPct: z.number().nullable(),
  inPlaceNoiM: z.number().nullable(),
  ervM: z.number().nullable(),
  occupancyPct: z.number().nullable(),
  waleYears: z.number().nullable(),
  anchorTenant: z.string().nullable(),
  anchorTenantPct: z.number().nullable(),
  indexation: z.string().nullable(),
  tenure: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExtractedDeal = z.infer<typeof ExtractedDealSchema>;

type Source = { pdfBase64: string } | { text: string };

const EXTRACT_PROMPT = `You are a real-estate investment analyst. Extract the key figures from this teaser / offering memorandum into the structured schema.

Rules:
- Monetary amounts go in MILLIONS of the deal's own currency (e.g. SAR 412,000,000 -> 412).
- Percentages as plain numbers (e.g. 8.1% -> 8.1).
- If a figure is not stated, return null. Do NOT guess or infer numbers that are not supported by the document.
- "anchorTenantPct" is the largest single tenant's share of income, if stated.
- "indexation" should capture the rent-review/escalation basis (e.g. "100% CPI-linked, annual").`;

export async function extractDeal(source: Source): Promise<ExtractedDeal> {
  const content: Anthropic.ContentBlockParam[] =
    "pdfBase64" in source
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: source.pdfBase64,
            },
          },
          { type: "text", text: EXTRACT_PROMPT },
        ]
      : [{ type: "text", text: `${EXTRACT_PROMPT}\n\n---\nDOCUMENT:\n${source.text}` }];

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ExtractedDealSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Extraction failed — model returned no structured output.");
  }
  return response.parsed_output;
}

// ----- IC memo drafting --------------------------------------------------
export async function draftMemo(args: {
  deal: ExtractedDeal;
  underwrite: Underwrite;
  hurdles: Hurdles;
}): Promise<string> {
  const { deal, underwrite, hurdles } = args;

  const system = `You are an investment-committee analyst at a real-estate private-equity manager. You write tight, structured first-pass screening memos. You never invent figures: use only the extracted facts and the computed underwrite provided. Where a figure is missing, say so and flag it as a diligence item. Output GitHub-flavoured Markdown only — no preamble.`;

  const user = `Draft an IC / screening memo for the deal below, underwritten against the ${hurdles.fund} hurdles.

EXTRACTED FACTS (JSON, millions of local currency):
${JSON.stringify(deal, null, 2)}

COMPUTED UNDERWRITE (deterministic, indicative — JSON):
${JSON.stringify(underwrite, null, 2)}

Structure the memo with these sections:
## Recommendation
(One paragraph. State the verdict "${underwrite.verdict}" and the single most important reason, plus the key watch item.)
## Key Terms
(A markdown table: price, NIY, NOI in-place/ERV, WALE, occupancy, tenure.)
## Indicative Underwrite
(A markdown table from the computed underwrite: hold, net IRR vs hurdle, equity multiple, entry/exit yield, day-1 LTV. Note these are first-pass figures.)
## Hurdle Assessment
(Bullet each hurdle with pass/fail and the actual vs target.)
## Strengths
## Risks & Mitigants
## Recommended Next Steps
Keep it concise — this is a screening memo, not full DD.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ----- LP Reporting: parse a natural-language report request --------------
export const ReportRequestSchema = z.object({
  fund: z.string(),
  period: z.string(),
  reportType: z.string(),
  style: z.string(),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export async function parseReportRequest(args: {
  message: string;
  funds: string[];
  periods: string[];
}): Promise<ReportRequest> {
  const prompt = `Interpret this request for a fund report and map it to the available options. Pick the closest match for each field; if a field is unstated, choose a sensible default (latest period, "LP Quarterly Report", "Institutional / Formal").

Available funds: ${args.funds.join(" | ")}
Available periods: ${args.periods.join(" | ")}
Report types: LP Quarterly Report | Board Deck | Fund Fact Sheet
Styles: Institutional / Formal | Concise / Board | Detailed / Data-rich

Return the exact fund name and period string from the lists above.

REQUEST: ${args.message}`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ReportRequestSchema) },
  });
  if (!response.parsed_output) throw new Error("Could not interpret the report request.");

  // Snap fund/period back to valid values defensively.
  const out = response.parsed_output;
  out.fund = args.funds.find((f) => f === out.fund) ?? args.funds[0];
  out.period = args.periods.find((p) => p === out.period) ?? args.periods[0];
  return out;
}

// ----- LP Reporting: manager commentary from the computed snapshot --------
export async function draftReportCommentary(args: {
  report: unknown;
}): Promise<string> {
  const styleNote =
    "Match the requested style: 'Concise / Board' = 2-3 sentences; 'Institutional / Formal' = one full paragraph; 'Detailed / Data-rich' = two paragraphs citing the specific figures.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You are a real-estate fund manager writing the manager-commentary section of an LP report. Use ONLY the figures in the provided JSON snapshot — never invent numbers. ${styleNote} Output plain prose (no headings, no markdown), suitable to drop straight into the report.`,
    messages: [
      {
        role: "user",
        content: `Write the manager commentary for this report snapshot:\n\n${JSON.stringify(args.report, null, 2)}`,
      },
    ],
  });
  return textOf(response);
}

// ----- Debt & Covenants: portfolio risk narrative ------------------------
export async function draftDebtNarrative(args: { dashboard: unknown }): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You are a treasury / debt analyst. Write a short risk narrative (2-4 sentences) summarising the portfolio's debt position and the most pressing forward-looking actions. Use ONLY the figures and alerts in the provided JSON. Output plain prose, no markdown headings.`,
    messages: [
      {
        role: "user",
        content: `Summarise the debt position and priorities:\n\n${JSON.stringify(args.dashboard, null, 2)}`,
      },
    ],
  });
  return textOf(response);
}

// ----- CRM: parse a freeform interaction note ----------------------------
// Turns a quick jotted note ("called Faisal, happy with returns, wants the
// Andalus schedule by next week") into a structured, filed interaction.
export const ParsedInteractionSchema = z.object({
  channel: z.enum(["Call", "Email", "Meeting", "Note"]),
  summary: z.string(), // cleaned, third-person, one or two sentences
  sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  nextStep: z.string().nullable(),
  followUpInDays: z.number().nullable(), // days from today, if a follow-up is implied
});
export type ParsedInteraction = z.infer<typeof ParsedInteractionSchema>;

export async function parseInteractionNote(args: {
  note: string;
  contactName: string;
  company?: string | null;
}): Promise<ParsedInteraction> {
  const prompt = `You are the CRM assistant for a real-estate private-equity manager. A team member jotted a quick note about an interaction with a contact. Turn it into a clean, filed CRM entry.

CONTACT: ${args.contactName}${args.company ? ` (${args.company})` : ""}
NOTE: ${args.note}

Rules:
- "channel": infer Call / Email / Meeting from the note; use Note if unclear.
- "summary": rewrite as a clean, third-person, past-tense summary (1-2 sentences). Do not invent facts.
- "sentiment": the contact's disposition in this interaction.
- "nextStep": the concrete action the team member should take next, if implied; otherwise null.
- "followUpInDays": if the note implies a follow-up timeframe (e.g. "next week" ≈ 7, "in a month" ≈ 30), the number of days from today; otherwise null.`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ParsedInteractionSchema) },
  });
  if (!response.parsed_output) throw new Error("Could not parse the interaction note.");
  return response.parsed_output;
}

// ----- CRM: draft a follow-up email --------------------------------------
export async function draftFollowUpEmail(args: {
  contact: {
    name: string;
    title?: string | null;
    company?: string | null;
    category: string;
    stage: string;
  };
  interactions: Array<{ date: string; channel: string; summary: string; nextStep?: string | null }>;
  instruction?: string | null;
  senderName?: string | null;
}): Promise<string> {
  const { contact, interactions, instruction, senderName } = args;

  const system = `You are a relationship manager at Bohio, a real-estate private-equity manager in Saudi Arabia. You write warm but concise, professional follow-up emails. Never invent facts, figures, meeting outcomes or commitments — rely only on the interaction history provided. If a specific document or figure was promised, reference it generically without fabricating numbers. Output the email as plain text: a "Subject:" line, then the body. No markdown, no commentary before or after.`;

  const user = `Draft a follow-up email to the contact below${
    instruction ? `, following this instruction: "${instruction}"` : "."
  }

CONTACT:
${JSON.stringify(contact, null, 2)}

INTERACTION HISTORY (most recent first):
${JSON.stringify(interactions, null, 2)}

Sign the email from ${senderName || "the Bohio team"}. Keep it to a short, natural email — no more than ~150 words. Pick up on the most recent open item or next step.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textOf(response);
}
