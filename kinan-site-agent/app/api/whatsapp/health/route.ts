import { NextResponse } from "next/server";
import { waConfig } from "@/lib/whatsapp/graph";
import { readJson } from "@/lib/store";
import { sttProvider } from "@/lib/core/stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Is the WhatsApp channel working? Checks the access token against Meta (an expired 24-hour token is the usual reason
 * replies stop), and shows the last message the agent handled and any error. Behind the app's sign-in.
 */
export async function GET() {
  const c = waConfig();
  const last = (await readJson<{ at: string; ok: boolean; what: string; error?: string }>("whatsapp/status.json").catch(() => null))?.value ?? null;
  const out: Record<string, unknown> = {
    configured: !!c, appSecret: !!process.env.WHATSAPP_APP_SECRET, allowList: (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").split(",").filter(Boolean).length,
    voiceNotes: sttProvider() === "elevenlabs" ? "ElevenLabs" : process.env.OPENAI_API_KEY ? "OpenAI Whisper" : "not configured (set ELEVENLABS_API_KEY)",
    lastMessage: last,
  };
  if (c) {
    try {
      const r = await fetch(`${c.base}/${c.version}/${c.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${c.token}` }, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      out.token = r.ok ? { ok: true, number: j.display_phone_number, name: j.verified_name }
        : { ok: false, status: r.status, error: j?.error?.message ?? "rejected", hint: j?.error?.code === 190 ? "The access token has expired or is invalid — create a permanent System User token (SETUP.md §6.2) and set WHATSAPP_TOKEN, then redeploy." : undefined };
    } catch (e) { out.token = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
