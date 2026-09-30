import { NextRequest, NextResponse } from "next/server";
import { addDoc, locationById, moveDoc, newId } from "@/lib/store";
import { describeUpload } from "@/lib/ingest";
import { CATEGORIES, type Category, type Doc } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;
const TEXTY = /\.(txt|md|csv|json|log)$/i;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const locationId = String(form.get("locationId") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!locationById(locationId)) return NextResponse.json({ error: "Pick a location" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File over 40 MB" }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  const str = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v || undefined; };

  let title = str("title");
  let category = str("category") as Category | undefined;
  let discipline = str("discipline");
  let revision = str("revision");
  let summary = str("summary") ?? "";
  let text = TEXTY.test(file.name) ? buf.toString("utf8").slice(0, 20000) : "";

  const ai = await describeUpload(buf, mime, file.name);
  if (ai) {
    title ??= ai.title; category ??= ai.category as Category | undefined; discipline ??= ai.discipline;
    revision ??= ai.revision; summary ||= ai.summary; text ||= ai.text;
  }
  if (!category || !CATEGORIES.includes(category)) category = mime.startsWith("image/") ? "Photo" : "Other";

  const px = Number(form.get("x")), py = Number(form.get("y"));
  const doc: Doc = {
    id: newId("d"),
    title: title || file.name.replace(/\.[^.]+$/, ""),
    category, discipline, revision, locationId,
    pin: Number.isFinite(px) && Number.isFinite(py) && form.get("x") !== null ? { x: px, y: py } : undefined,
    filename: file.name, mime, size: buf.length, summary, text,
    tags: (str("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    uploadedAt: new Date().toISOString(),
    uploadedBy: str("author") ?? "Dev Manager",
  };
  addDoc(doc, buf);
  return NextResponse.json({ doc: { ...doc, text: undefined }, indexed: Boolean(ai) });
}

/** Re-file a document to another location / pin position. */
export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (b.locationId && !locationById(b.locationId)) return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  const d = moveDoc(String(b.id), {
    ...(b.locationId ? { locationId: b.locationId } : {}),
    ...(b.pin ? { pin: b.pin } : {}),
  });
  return d ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
