import { NextRequest, NextResponse } from "next/server";
import { getRepo, newId, readBytes, saveUpload } from "@/lib/store";
import { describeUpload } from "@/lib/ingest";
import { CATEGORIES, type Category, type Doc } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;
const TEXTY = /\.(txt|md|csv|json|log)$/i;
const DIRECT_PREFIX = "uploads/direct/";

interface Meta { title?: string; category?: string; revision?: string; summary?: string; tags?: string; author?: string; locationId: string; x?: number; y?: number }

async function register(meta: Meta, file: { name: string; mime: string; bytes: Uint8Array | null; size: number; fileKey?: string }) {
  const repo = await getRepo();
  if (!repo.db.locations.some((l) => l.id === meta.locationId)) return NextResponse.json({ error: "Pick a location" }, { status: 400 });
  const str = (v?: string) => { const t = String(v ?? "").trim(); return t || undefined; };
  let title = str(meta.title), category = str(meta.category) as Category | undefined, revision = str(meta.revision);
  let summary = str(meta.summary) ?? "", discipline: string | undefined;
  let text = file.bytes && TEXTY.test(file.name) ? new TextDecoder().decode(file.bytes).slice(0, 20000) : "";
  const ai = file.bytes ? await describeUpload(Buffer.from(file.bytes), file.mime, file.name) : null;
  if (ai) { title ??= ai.title; category ??= ai.category; discipline = ai.discipline; revision ??= ai.revision; summary ||= ai.summary; text ||= ai.text; }
  if (!category || !CATEGORIES.includes(category)) category = file.mime.startsWith("image/") ? "Photo" : "Other";
  const doc: Doc = {
    id: newId("d"), title: title || file.name.replace(/\.[^.]+$/, ""), category, discipline, revision, locationId: meta.locationId,
    pin: Number.isFinite(meta.x) && Number.isFinite(meta.y) ? { x: Number(meta.x), y: Number(meta.y) } : undefined,
    filename: file.name, mime: file.mime, size: file.size, summary, text, fileKey: file.fileKey,
    tags: (str(meta.tags) ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    uploadedAt: new Date().toISOString(), uploadedBy: str(meta.author) ?? "Dev Manager",
  };
  if (file.bytes && !file.fileKey) await saveUpload(doc.id, file.bytes, file.mime);
  repo.db.docs.unshift(doc);
  await repo.save();
  return NextResponse.json({ doc: { ...doc, text: undefined }, indexed: Boolean(ai) });
}

export async function POST(req: NextRequest) {
  // Large files on Vercel: the browser uploads straight to Blob storage, then registers the file here.
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = await req.json();
    const key = String(b.fileKey ?? "");
    if (!key.startsWith(DIRECT_PREFIX) || key.includes("..")) return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
    const size = Number(b.size) || 0;
    // Only small enough files are read back for AI indexing.
    const bytes = size <= 4.5 * 1024 * 1024 ? await readBytes(key) : null;
    if (size <= 4.5 * 1024 * 1024 && !bytes) return NextResponse.json({ error: "Uploaded file not found" }, { status: 400 });
    return register(b as Meta, { name: String(b.filename ?? "file"), mime: String(b.mime ?? "application/octet-stream"), bytes, size, fileKey: key });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File over 40 MB" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  const f = (k: string) => (form.get(k) === null ? undefined : String(form.get(k)));
  return register(
    { title: f("title"), category: f("category"), revision: f("revision"), summary: f("summary"), tags: f("tags"), author: f("author"), locationId: String(form.get("locationId") ?? ""), x: form.get("x") === null ? undefined : Number(form.get("x")), y: form.get("y") === null ? undefined : Number(form.get("y")) },
    { name: file.name, mime, bytes, size: bytes.length },
  );
}

/** Re-file a document to another location / pin position. */
export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const repo = await getRepo();
  if (b.locationId && !repo.db.locations.some((l) => l.id === b.locationId)) return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  const d = repo.db.docs.find((x) => x.id === b.id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.locationId) d.locationId = b.locationId;
  if (b.pin) d.pin = b.pin;
  await repo.save();
  return NextResponse.json({ ok: true });
}
