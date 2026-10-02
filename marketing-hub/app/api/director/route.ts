import { NextResponse } from "next/server";
import { directorState, directorAction } from "@/lib/director-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/director?lang=ar  -> brief, targets, budget plan, approval inbox, delegations, Kinan outbox
// POST { action: APPROVE_PLAN | DECIDE_TASK | SEND_BRIEF | PUSH_SOURCES | RETRY, ... }
export async function GET(req: Request) {
  try {
    const l = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await directorState(isLang(l) ? l : "en"));
  } catch (err: any) {
    console.error("director error", err);
    return NextResponse.json({ error: err?.message ?? "Director request failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await directorAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
