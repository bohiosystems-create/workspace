import { NextResponse } from "next/server";
import { prepareBriefs, readiness, resetDemoData } from "@/lib/ready";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// the deep check makes a real AI call and synthesises two lines; "prepare" builds two narrated briefs
export const maxDuration = 300;

// GET  /api/ready            -> the system check (keys, voices, WhatsApp, storage, briefs, data)
// GET  /api/ready?deep=1     -> also a real AI call and an English + Arabic synthesis
// POST { action: "prepare" | "reset", by }
export async function GET(req: Request) {
  try { return NextResponse.json(await readiness(new URL(req.url).searchParams.has("deep")), { headers: { "Cache-Control": "no-store" } }); }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? "Check failed." }, { status: 500 }); }
}
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { action?: string; by?: string };
    if (b.action === "prepare") return NextResponse.json({ prepared: await prepareBriefs(String(b.by ?? "System check")) });
    if (b.action === "reset") return NextResponse.json({ reset: await resetDemoData() });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Action failed." }, { status: 500 }); }
}
