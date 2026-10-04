/**
 * Document → ProjectModelSpec with an AI model. One prompt, three providers:
 *   Claude  — Messages API, the schema as a forced tool (the reply is always schema-shaped JSON)
 *   OpenAI  — Chat Completions, JSON mode, schema in the instructions
 *   Gemini  — generateContent, application/json response, schema in the instructions
 * PDFs and images go to the model as attachments; text files inline. "auto" tries the configured providers in
 * order and falls back to the offline parser, so the Studio always produces a model.
 */
import { LlmError, httpJson } from "../core/llm/types";
import { SPEC_SCHEMA, normalizeSpec, type ProjectModelSpec } from "./spec";
import { parseOffline, type ParseLog } from "./offline";

export type Engine = "auto" | "anthropic" | "openai" | "gemini" | "offline";
export interface ExtractDoc { name: string; mime: string; text?: string; base64?: string }
export interface Model3dConfig {
  anthropic?: { apiKey: string; model: string; baseUrl?: string };
  openai?: { apiKey: string; model: string; baseUrl?: string; reasoningEffort?: string };
  gemini?: { apiKey: string; model: string; baseUrl?: string };
}
export interface ExtractResult { spec: ProjectModelSpec; warnings: string[]; engine: Exclude<Engine, "auto">; model: string; ms: number; log: ParseLog[]; tried: { engine: string; error: string }[] }

export function model3dConfig(env: Record<string, string | undefined>): Model3dConfig {
  return {
    anthropic: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL3D_ANTHROPIC_MODEL || "claude-sonnet-5-5", baseUrl: env.ANTHROPIC_BASE_URL } : undefined,
    openai: env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY, model: env.MODEL3D_OPENAI_MODEL || "gpt-5", baseUrl: env.OPENAI_BASE_URL, reasoningEffort: env.OPENAI_REASONING_EFFORT ?? "low" } : undefined,
    gemini: env.GEMINI_API_KEY ? { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-2.5-pro", baseUrl: env.GEMINI_BASE_URL } : undefined,
  };
}

export const SYSTEM = `You are a construction digital-twin engineer. From the project documents provided, build the data for a 3D/4D model of the development.

Rules:
- Read every document. Use the area / accommodation schedule for storeys and floor-to-floor heights, the setting-out or survey schedule for footprints, the programme for dates, the logistics plan for roads, gates, cranes and zones.
- Output coordinates in metres on the SITE GRID: x = distance EAST from the site's west boundary to the footprint's west edge; z = distance SOUTH from the site's north boundary to the footprint's NORTH edge.
  Documents often give Easting/Northing measured from the SOUTH-west corner: then z = siteDepth − (Northing of the footprint's north edge). For road centrelines, gates, cranes: z = siteDepth − Northing.
- Footprint w is the east–west width and d the north–south depth of the building's bounding rectangle.
- floors = storeys above ground; storeyHeight = typical floor-to-floor; basements = levels below ground.
- Map every programme activity that belongs to a building to ONE phase: substructure (piling, excavation, raft, basement), structure (frame, slabs, core), facade (curtain wall, cladding, glazing), fitout (MEP, finishes, fit-out), handover (T&C, commissioning, handover). Dates as YYYY-MM-DD (P6 dates like 01-Sep-26 mean 2026-09-01).
- schedule.dataDate is the programme's data date (or the reporting date in the brief).
- For each building set "source" to the document(s) and row used, and "confidence" (high when read directly, medium when combined, low when inferred).
- Put anything you inferred rather than read in "assumptions". List the documents you used in "sources".
- Use only the documents. Do not invent buildings.`;

const TEXT_LIMIT = 220_000;
export function promptFor(docs: ExtractDoc[]): string {
  let budget = TEXT_LIMIT, out = "PROJECT DOCUMENTS\n";
  for (const d of docs) {
    if (!d.text) { out += `\n=== ${d.name} (${d.mime}) — attached ===\n`; continue; }
    const t = d.text.length > budget ? d.text.slice(0, Math.max(0, budget)) + "\n[…truncated]" : d.text;
    budget -= t.length; out += `\n=== ${d.name} ===\n${t}\n`;
  }
  return `${out}\n\nReturn the model data as JSON matching this JSON Schema (no prose):\n${JSON.stringify(SPEC_SCHEMA)}`;
}

function parseJsonLoose(s: string): unknown {
  try { return JSON.parse(s); } catch { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s); if (fence) { try { return JSON.parse(fence[1]); } catch { /* */ } }
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new LlmError("model did not return JSON");
}
const attach = (docs: ExtractDoc[]) => docs.filter((d) => d.base64 && (d.mime === "application/pdf" || d.mime.startsWith("image/")));

async function viaAnthropic(c: NonNullable<Model3dConfig["anthropic"]>, docs: ExtractDoc[], timeout: number) {
  const base = (c.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const content: unknown[] = [
    ...attach(docs).map((d) => d.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: d.mime, data: d.base64 }, title: d.name }
      : { type: "image", source: { type: "base64", media_type: d.mime, data: d.base64 } }),
    { type: "text", text: promptFor(docs) },
  ];
  const res = await httpJson(`${base}/v1/messages`, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: c.model, max_tokens: 16000, system: SYSTEM, messages: [{ role: "user", content }],
      tools: [{ name: "build_model", description: "Return the 3D/4D model data extracted from the documents.", input_schema: SPEC_SCHEMA }],
      tool_choice: { type: "tool", name: "build_model" } }),
  }, timeout);
  const tu = (res.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!tu) throw new LlmError("Claude returned no model data");
  return tu.input;
}
async function viaOpenAI(c: NonNullable<Model3dConfig["openai"]>, docs: ExtractDoc[], timeout: number) {
  const base = (c.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const parts: unknown[] = [{ type: "text", text: promptFor(docs) }, ...attach(docs).map((d) => d.mime === "application/pdf"
    ? { type: "file", file: { filename: d.name, file_data: `data:${d.mime};base64,${d.base64}` } }
    : { type: "image_url", image_url: { url: `data:${d.mime};base64,${d.base64}` } })];
  const body: Record<string, unknown> = { model: c.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: parts }], response_format: { type: "json_object" }, max_completion_tokens: 24000 };
  if (/^(o\d|gpt-5)/.test(c.model) && c.reasoningEffort) body.reasoning_effort = c.reasoningEffort;
  const res = await httpJson(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` }, body: JSON.stringify(body) }, timeout);
  return parseJsonLoose(String(res.choices?.[0]?.message?.content ?? ""));
}
async function viaGemini(c: NonNullable<Model3dConfig["gemini"]>, docs: ExtractDoc[], timeout: number) {
  const base = (c.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const parts: unknown[] = [{ text: promptFor(docs) }, ...attach(docs).map((d) => ({ inline_data: { mime_type: d.mime, data: d.base64 } }))];
  const res = await httpJson(`${base}/models/${encodeURIComponent(c.model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 24000 } }),
  }, timeout);
  const text = (res.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new LlmError(`Gemini returned no content${res.candidates?.[0]?.finishReason ? ` (${res.candidates[0].finishReason})` : ""}`);
  return parseJsonLoose(text);
}

/** Run the chosen engine (or the first that works, for "auto") and normalise the result. */
export async function extractModel(cfg: Model3dConfig, docs: ExtractDoc[], engine: Engine, opts: { deadline?: number } = {}): Promise<ExtractResult> {
  const t0 = Date.now(), tried: { engine: string; error: string }[] = [];
  const order: Exclude<Engine, "auto">[] = engine === "auto" ? ["anthropic", "openai", "gemini", "offline"] : [engine];
  const left = () => Math.max(5000, (opts.deadline ?? t0 + 110_000) - Date.now() - 2000);
  for (const e of order) {
    try {
      if (e === "offline") {
        const { raw, log } = parseOffline(docs.filter((d) => d.text).map((d) => ({ name: d.name, text: d.text! })));
        const { spec, warnings } = normalizeSpec(raw);
        if (docs.some((d) => !d.text)) warnings.push("The offline parser reads text, CSV and Markdown only — PDFs and images were skipped (an AI engine reads them).");
        return { spec, warnings, engine: e, model: "offline parser", ms: Date.now() - t0, log, tried };
      }
      const c = cfg[e];
      if (!c) { if (engine !== "auto") throw new LlmError(`${e === "anthropic" ? "ANTHROPIC_API_KEY" : e === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} is not set`); continue; }
      const raw = e === "anthropic" ? await viaAnthropic(c as NonNullable<Model3dConfig["anthropic"]>, docs, left()) : e === "openai" ? await viaOpenAI(c as NonNullable<Model3dConfig["openai"]>, docs, left()) : await viaGemini(c as NonNullable<Model3dConfig["gemini"]>, docs, left());
      const { spec, warnings } = normalizeSpec(raw);
      if (!spec.buildings.length) throw new LlmError("no buildings in the model's answer");
      return { spec, warnings, engine: e, model: c.model, ms: Date.now() - t0, log: [{ step: "AI", detail: `${spec.buildings.length} buildings, ${spec.schedule.activities.length} activities read by ${c.model}` }], tried };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 240) : String(err);
      tried.push({ engine: e, error: msg });
      if (engine !== "auto") throw new LlmError(msg);
    }
  }
  throw new LlmError("no engine produced a model");
}
