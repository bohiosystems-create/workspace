import { NextResponse } from "next/server";
import { viewsState, viewsAction } from "@/lib/view-blocks";

export const runtime = "nodejs";

// GET /api/views -> which blocks each dashboard hides (changed from the chat)
export async function GET() {
  try { return NextResponse.json(await viewsState()); }
  catch (err: any) { return NextResponse.json({ error: err?.message ?? "Views failed." }, { status: 500 }); }
}
// POST { action: "UNDO" | "RESET" | "SHOW" | "HIDE", page?, block?, lang }
export async function POST(req: Request) {
  try { return NextResponse.json(await viewsAction(await req.json())); }
  catch (err: any) { return NextResponse.json({ error: err?.message ?? "Views failed." }, { status: 400 }); }
}
