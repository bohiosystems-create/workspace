import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./types";
import { MODEL } from "./agent";

export interface Described { title?: string; category?: string; discipline?: string; revision?: string; summary: string; text: string }

/**
 * Reads an uploaded PDF / photo with Claude so it becomes searchable by the agent
 * (title, category, revision, summary and a transcription of key content).
 * Best-effort: returns null on any failure — upload still succeeds.
 */
export async function describeUpload(buf: Buffer, mime: string, hint: string): Promise<Described | null> {
  if (!process.env.ANTHROPIC_API_KEY || buf.length > 4.5 * 1024 * 1024) return null;
  const isPdf = mime === "application/pdf";
  const isImg = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
  if (!isPdf && !isImg) return null;
  try {
    const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
    const file = isPdf
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: buf.toString("base64") } } as const);
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: [file, { type: "text", text:
          `You index construction project documents for a site agent. File name: "${hint}".\nReturn ONLY JSON: {"title": string, "category": one of ${JSON.stringify(CATEGORIES)}, "discipline": "ARC"|"STR"|"MEP"|"CIV"|"HSE"|"QA"|null, "revision": string|null, "summary": "<=200 chars", "text": "faithful transcription of the key content: titles/sheet numbers, revisions, notes, dimensions, levels, grid references, specifications, status, dates, names. Max ~3500 chars. For a site photo describe what is visible and any visible defects or safety issues."}` }],
      }],
    });
    const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return {
      title: j.title || undefined,
      category: CATEGORIES.includes(j.category) ? j.category : undefined,
      discipline: j.discipline || undefined,
      revision: j.revision || undefined,
      summary: String(j.summary ?? "").slice(0, 300),
      text: String(j.text ?? "").slice(0, 6000),
    };
  } catch {
    return null;
  }
}
