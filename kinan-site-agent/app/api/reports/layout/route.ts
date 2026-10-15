import { NextResponse } from "next/server";
import { serverReports } from "@/lib/reports/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?lang= -> { view, history }: the daily brief's layout (changed from the chat) and its change log.
// POST { action: "UNDO" | "RESET", lang, by } -> the same, after the change.
export async function GET(req: Request) {
  const l = new URL(req.url).searchParams.get("lang");
  return NextResponse.json(await serverReports().layoutState(l === "ar" ? "ar" : "en"), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  try { return NextResponse.json(await serverReports().layoutAction(await req.json())); }
  catch (e) { return NextResponse.json({ error: (e as Error)?.message ?? "Failed." }, { status: 400 }); }
}
