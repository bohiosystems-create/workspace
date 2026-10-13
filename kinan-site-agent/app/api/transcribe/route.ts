import { NextResponse } from "next/server";
import { transcribe, voiceEnabled } from "@/lib/deck/voice";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/transcribe  (multipart: audio, lang) -> { text }   a question spoken into the player, as words
export async function POST(req: Request) {
  if (!voiceEnabled()) return NextResponse.json({ error: "Voice is not configured." }, { status: 501 });
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size < 1000) return NextResponse.json({ error: "No audio." }, { status: 400 });
    if (audio.size > 4_000_000) return NextResponse.json({ error: "Recording too long." }, { status: 413 });
    const lang = form.get("lang") === "ar" ? "ar" : "en";
    const name = audio instanceof File && audio.name ? audio.name : audio.type.includes("mp4") ? "question.mp4" : "question.webm";
    const text = await transcribe(audio, lang, name);
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Transcription failed." }, { status: 502 });
  }
}
