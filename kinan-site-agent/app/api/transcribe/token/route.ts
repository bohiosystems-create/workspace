import { NextResponse } from "next/server";
import { voiceEnabled } from "@/lib/deck/voice";

export const runtime = "nodejs";

// POST /api/transcribe/token -> { token }   a single-use key (15 minutes) for ElevenLabs real-time transcription, so
// the browser can stream the microphone to Scribe and show the words live without ever seeing the API key.
export async function POST(req: Request) {
  if (!voiceEnabled()) return NextResponse.json({ error: "Voice is not configured." }, { status: 501 });
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const base = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
    const r = await fetch(`${base}/v1/single-use-token/realtime_scribe`, { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } });
    if (!r.ok) return NextResponse.json({ error: `ElevenLabs (${r.status}): ${(await r.text()).slice(0, 200)}` }, { status: 502 });
    const j = await r.json();
    return NextResponse.json({ token: j.token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    // the player then shows live words from the browser's own recognition instead (useVoiceInput)
    return NextResponse.json({ error: e?.message ?? "ElevenLabs unreachable." }, { status: 502 });
  }
}
