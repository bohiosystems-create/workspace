import { NextRequest, NextResponse } from "next/server";
import { extractModel, model3dConfig, type Engine, type ExtractDoc } from "@/lib/model3d/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEXT = /\.(csv|tsv|txt|md|json|xml|xer|html?)$/i;
const MAX_FILES = 20, MAX_BYTES = 4_000_000; // Vercel's request limit is 4.5 MB

/** Which engines are available (keys configured). Never returns keys. */
export async function GET() {
  const c = model3dConfig(process.env as Record<string, string | undefined>);
  return NextResponse.json({ engines: { anthropic: c.anthropic?.model ?? null, openai: c.openai?.model ?? null, gemini: c.gemini?.model ?? null, offline: "offline parser" } });
}

/** multipart/form-data: files (many), engine = auto | anthropic | openai | gemini | offline */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const engine = (String(fd.get("engine") ?? "auto") as Engine);
  const files = fd.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f).slice(0, MAX_FILES);
  if (!files.length) return NextResponse.json({ error: "Add at least one document" }, { status: 400 });
  let total = 0; const docs: ExtractDoc[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer()); total += buf.length;
    if (total > MAX_BYTES) return NextResponse.json({ error: "Documents are larger than 4 MB in total — send fewer or smaller files" }, { status: 413 });
    const mime = f.type || (TEXT.test(f.name) ? "text/plain" : /\.pdf$/i.test(f.name) ? "application/pdf" : "application/octet-stream");
    if (TEXT.test(f.name) || mime.startsWith("text/")) docs.push({ name: f.name, mime, text: buf.toString("utf8") });
    else if (mime === "application/pdf" || mime.startsWith("image/")) docs.push({ name: f.name, mime, base64: buf.toString("base64") });
  }
  try {
    const out = await extractModel(model3dConfig(process.env as Record<string, string | undefined>), docs, engine, { deadline: Date.now() + 55_000 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
