import { CATEGORIES, type Category, type Db, type PhotoReading } from "../types";
import { descendantIds, locationPath, resolveLocation } from "./query";
import { routeAndRun, availableProviders } from "./llm/router";
import type { LlmConfig } from "./llm/types";
import { toBase64 } from "./tools";

export interface Described { title?: string; category?: Category; discipline?: string; revision?: string; summary: string; text: string; via?: string; photo?: PhotoReading }

/** What the photo reader knows about the project: the programme around today, and any hint from the sender. */
export interface PhotoContext { db: Db; /** caption or message sent with the photo */ hint?: string; /** where the sender is / chose to file it */ locationId?: string }

const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Activities a site photo taken today could show: live work first, around the sender's place when known. */
function shortlist(c: PhotoContext) {
  const d0 = c.db.data.meta.dataDate, lo = addDays(d0, -45), hi = addDays(d0, 30);
  const near = c.locationId && c.locationId !== "site" ? descendantIds(c.db, c.locationId) : null;
  const xs = c.db.data.schedule.filter((a) => !a.milestone && (a.status === "in_progress" || (a.start <= hi && a.finish >= lo)));
  const rank = (a: (typeof xs)[number]) => (near?.has(a.locationId) ? 0 : 2) + (a.status === "in_progress" ? 0 : 1);
  return xs.sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start)).slice(0, 140)
    .map((a) => `${a.id} | ${a.name} | ${locationPath(c.db, a.locationId)} | ${a.status === "in_progress" ? `${a.percent}%` : a.status === "completed" ? "done" : `starts ${a.start}`}`);
}

/** Index an uploaded PDF / photo with whichever provider the router picks (PDFs prefer Anthropic). */
export async function describeUpload(cfg: LlmConfig, bytes: Uint8Array, mime: string, name: string, ctx?: PhotoContext): Promise<Described | null> {
  if (!availableProviders(cfg).length || bytes.length > 4.5 * 1024 * 1024) return null;
  if (mime !== "application/pdf" && !/^image\/(jpeg|png|gif|webp)$/.test(mime)) return null;
  if (ctx && mime.startsWith("image/")) return readPhoto(cfg, bytes, mime, name, ctx);
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

/**
 * Read a site photo like a construction manager would: what it shows, the stage of the work, which programme activity it is
 * most likely evidence for (from a shortlist of live activities), and any safety or quality issue visible.
 */
async function readPhoto(cfg: LlmConfig, bytes: Uint8Array, mime: string, name: string, c: PhotoContext): Promise<Described | null> {
  const db = c.db;
  const here = c.locationId && c.locationId !== "site" ? locationPath(db, c.locationId) : null;
  const prompt = `A site photo from ${db.project.name} (${db.project.client}), a mixed-use development in Riyadh: towers, podium, hotel, villas, infrastructure. Today is ${db.data.meta.dataDate}.
File: "${name}".${c.hint ? `\nThe sender wrote: "${c.hint}"` : ""}${here ? `\nThe sender is at / filed it under: ${here}` : ""}

Read the photo as an experienced construction manager would. Describe only what you can actually see; never invent levels, grids or quantities. Then match it to the programme: which activity below is this photo most likely evidence of, and what state does the photo show? If nothing fits, leave "activity" null. Confidence: high only when the place AND the work type are clear (sign, level marking, the sender's words, or an unmistakable view); otherwise medium/low.

Live programme activities (id | name | place | status):
${shortlist(c).join("\n")}

Return ONLY JSON:
{"title": "<=60 chars, e.g. 'Tower A L14 — PT slab before pour'",
 "category": one of ${JSON.stringify(CATEGORIES)} (usually "Photo"),
 "discipline": "ARC"|"STR"|"MEP"|"CIV"|"HSE"|"QA"|null,
 "summary": "<=200 chars",
 "scene": "1-2 sentences: what is in the picture",
 "work": "the work visible and its stage, or null",
 "trade": "e.g. concrete, formwork, rebar, façade, MEP, blockwork, finishes, earthworks, lifting — or null",
 "where": "place as read from the photo (level signs, grid marks, building, view), or null",
 "activity": null or {"id": "<id from the list>", "state": "completed"|"in_progress"|"pending", "percent": 0-100 or null, "confidence": "high"|"medium"|"low", "why": "<=120 chars"},
 "safety": ["visible safety issues, e.g. missing edge protection, no harness, open shaft — empty if none"],
 "quality": ["visible defects, e.g. honeycombing, cracking, poor alignment — empty if none"]}`;
  try {
    const { out, route } = await routeAndRun(cfg, {
      system: "You read construction site photos for a site agent. Reply with JSON only.",
      history: [{ role: "user", content: prompt }],
      attachments: [{ mime, base64: toBase64(bytes), name }],
      tools: [], exec: async () => "", maxTurns: 1, maxTokens: 1500,
    }, { tier: "main", reason: "site photo reading" });
    const raw = out.text;
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : []);
    const a = j.activity && db.data.schedule.find((x) => x.id.toLowerCase() === String(j.activity.id ?? "").toLowerCase());
    const where = j.where ? String(j.where).slice(0, 120) : undefined;
    const loc = (where && resolveLocation(db, where)) || (a ? db.locations.find((l) => l.id === a.locationId) : undefined);
    const photo: PhotoReading = {
      scene: String(j.scene ?? j.summary ?? "").slice(0, 400), work: j.work ? String(j.work).slice(0, 200) : undefined, trade: j.trade ? String(j.trade).slice(0, 40) : undefined,
      where, locationId: loc?.id,
      activity: a ? {
        id: a.id, name: a.name, state: ["completed", "in_progress", "pending"].includes(j.activity.state) ? j.activity.state : "in_progress",
        percent: Number.isFinite(Number(j.activity.percent)) && j.activity.percent !== null ? Math.max(0, Math.min(100, Math.round(Number(j.activity.percent)))) : undefined,
        confidence: ["high", "medium", "low"].includes(j.activity.confidence) ? j.activity.confidence : "low", why: String(j.activity.why ?? "").slice(0, 160),
      } : undefined,
      safety: list(j.safety), quality: list(j.quality), via: `${route.provider}/${route.model}`, at: new Date().toISOString(),
    };
    const text = [photo.scene, photo.work && `Work: ${photo.work}`, photo.where && `Where: ${photo.where}`, photo.activity && `Likely activity: ${photo.activity.id} ${photo.activity.name} (${photo.activity.state}${photo.activity.percent !== undefined ? ` ${photo.activity.percent}%` : ""}, ${photo.activity.confidence} confidence)`,
      photo.safety.length && `Safety: ${photo.safety.join("; ")}`, photo.quality.length && `Quality: ${photo.quality.join("; ")}`].filter(Boolean).join("\n");
    return {
      title: j.title ? String(j.title).slice(0, 80) : undefined,
      category: CATEGORIES.includes(j.category) ? j.category : "Photo",
      discipline: j.discipline || undefined, summary: String(j.summary ?? photo.scene).slice(0, 300), text, via: photo.via, photo,
    };
  } catch {
    return null;
  }
}
