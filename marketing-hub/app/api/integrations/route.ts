import { NextResponse } from "next/server";
import { integrationsState, integrationsAction } from "@/lib/integrations";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";

// GET /api/integrations?lang=ar -> every integration with its status (no secrets)
export async function GET(req: Request) {
  try { const l = new URL(req.url).searchParams.get("lang"); return NextResponse.json(await integrationsState(isLang(l) ? l : "en")); }
  catch (err: any) { return NextResponse.json({ error: err?.message ?? "Integrations failed." }, { status: 500 }); }
}
// POST { action: "SAVE", newsCities?, newsOn?, icsUrls? } | { action: "TEST", id: "news" | "ics" }
export async function POST(req: Request) {
  try { return NextResponse.json(await integrationsAction(await req.json())); }
  catch (err: any) { return NextResponse.json({ error: err?.message ?? "Integrations failed." }, { status: 400 }); }
}
