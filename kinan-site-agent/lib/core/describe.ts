import { CATEGORIES, type Category } from "../types";
import { routeAndRun, availableProviders } from "./llm/router";
import type { LlmConfig } from "./llm/types";
import { toBase64 } from "./tools";

export interface Described { title?: string; category?: Category; discipline?: string; revision?: string; summary: string; text: string; via?: string }

/** Index an uploaded PDF / photo with whichever provider the router picks (PDFs prefer Anthropic). */
export async function describeUpload(cfg: LlmConfig, bytes: Uint8Array, mime: string, name: string): Promise<Described | null> {
  if (!availableProviders(cfg).length || bytes.length > 4.5 * 1024 * 1024) return null;
  if (mime !== "application/pdf" && !/^image\/(jpeg|png|gif|webp)$/.test(mime)) return null;
  try {
    const { out, route } = await routeAndRun(cfg, {
      system: "You index construction project documents for a onsite agent. Reply with JSON only.",
      history: [{ role: "user", content: `File name: "${name}". Return ONLY JSON: {"title": string, "category": one of ${JSON.stringify(CATEGORIES)}, "discipline": "ARC"|"STR"|"MEP"|"CIV"|"HSE"|"QA"|null, "revision": string|null, "summary": "<=200 chars", "text": "faithful transcription of the key content: titles/sheet numbers, revisions, notes, dimensions, levels, grid references, specifications, status, dates, names. Max ~3500 chars. For a site photo describe what is visible and any visible defects or safety issues."}` }],
      attachments: [{ mime, base64: toBase64(bytes), name }],
      tools: [], exec: async () => "", maxTurns: 1, maxTokens: 2500,
    }, { tier: "main", reason: "document indexing", hasPdf: mime === "application/pdf" });
    const raw = out.text;
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return {
      title: j.title || undefined,
      category: CATEGORIES.includes(j.category) ? j.category : undefined,
      discipline: j.discipline || undefined, revision: j.revision || undefined,
      summary: String(j.summary ?? "").slice(0, 300), text: String(j.text ?? "").slice(0, 6000),
      via: `${route.provider}/${route.model}`,
    };
  } catch {
    return null;
  }
}
