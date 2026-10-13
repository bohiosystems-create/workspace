import { NextResponse } from "next/server";
import { synthesize, voiceStatus, voiceEnabled, voiceAccount } from "@/lib/deck/voice";

export const runtime = "nodejs";

// GET  /api/voice                -> { enabled, provider, model }   (is ElevenLabs narration available?)
// POST /api/voice { text, lang, pauses? } -> { audio (base64 mp3), chars, starts }  (ElevenLabs; same-origin requests only)
//                                   chars/starts: every character of the spoken text and the second it is spoken at
// GET  /api/voice?check=1         -> also { account: { ok, used, limit, error } } — why ElevenLabs is not speaking
export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.has("check");
  return NextResponse.json({ ...voiceStatus(), ...(check && voiceEnabled() ? { account: await voiceAccount() } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  if (!voiceEnabled()) return NextResponse.json({ error: "Voice is not configured." }, { status: 501 });
  // Only the app itself may spend voice credits.
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = await req.json();
    const pauses = Array.isArray(b.pauses) ? b.pauses.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, 40) : [];
    const speech = await synthesize(String(b.text ?? ""), b.lang === "ar" ? "ar" : "en", pauses);
    return NextResponse.json(speech, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Voice failed." }, { status: 502 });
  }
}
