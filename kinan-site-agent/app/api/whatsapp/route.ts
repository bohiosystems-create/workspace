import { after, NextRequest, NextResponse } from "next/server";
import { handleWebhook, signatureOk } from "@/lib/whatsapp/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Background processing (agent + images) continues after the 200 ack, within this limit.
export const maxDuration = 60;

/** Meta webhook verification handshake. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN)
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

/**
 * Incoming messages. Acknowledge immediately (Meta retries slow acks) and keep
 * processing with after() — on Vercel this keeps the function alive until done.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("bad signature", { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new NextResponse("bad json", { status: 400 }); }
  const jobs = handleWebhook(body);
  if (process.env.WHATSAPP_TEST_SYNC === "true") await Promise.allSettled(jobs); // test hook: process before acking
  else after(() => Promise.allSettled(jobs).then(() => undefined));
  return NextResponse.json({ ok: true });
}
