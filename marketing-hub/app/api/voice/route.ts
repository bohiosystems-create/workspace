import { NextResponse } from "next/server";
import { synthesize, voiceStatus, voiceEnabled } from "@/lib/voice";

export const runtime = "nodejs";

// GET  /api/voice            -> { enabled, provider, model }   (is ElevenLabs narration available?)
// POST /api/voice { text, lang } -> audio/mpeg                  (ElevenLabs; same-origin requests only)
export async function GET() {
  return NextResponse.json(voiceStatus());
}
export async function POST(req: Request) {
  if (!voiceEnabled()) return NextResponse.json({ error: "Voice is not configured." }, { status: 501 });
  // Only the app itself may spend voice credits.
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = await req.json();
    const audio = await synthesize(String(b.text ?? ""), b.lang === "ar" ? "ar" : "en");
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Voice failed." }, { status: 502 });
  }
}
