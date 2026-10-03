import { NextResponse } from "next/server";
import { layoutState, layoutAction } from "@/lib/report-layout";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";

// GET ?lang= -> { view, history }: the daily report's layout (changed from the chat) and its change log.
// POST { action: "UNDO" | "RESET", lang } -> the same, after the change.
export async function GET(req: Request) {
  const l = new URL(req.url).searchParams.get("lang");
  return NextResponse.json(await layoutState(isLang(l) ? l : "en"));
}
export async function POST(req: Request) {
  try { return NextResponse.json(await layoutAction(await req.json())); }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? "Failed." }, { status: 400 }); }
}
