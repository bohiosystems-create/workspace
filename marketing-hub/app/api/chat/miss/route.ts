import { NextResponse } from "next/server";
import { listMisses, logMiss } from "@/lib/chat-misses";

export const dynamic = "force-dynamic";

// GET -> the latest questions the assistant missed. POST { question, answer, lang, engine } -> "Not what I asked".
export async function GET() {
  return NextResponse.json(await listMisses());
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  await logMiss({ ...b, source: "USER" });
  return NextResponse.json({ ok: true });
}
