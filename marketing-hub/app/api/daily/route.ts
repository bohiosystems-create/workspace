import { NextResponse } from "next/server";
import { dailyApiState, dailyAction } from "@/lib/daily-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET  /api/daily?lang=ar&date=2026-06-07 -> the daily campaign check for a day (default: today)
// POST { action: DECIDE (id, decision ACCEPT|DISMISS|REOPEN, approver, note) | AI_NOTE, lang }
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams, l = u.get("lang");
    return NextResponse.json(await dailyApiState(isLang(l) ? l : "en", u.get("date") ?? undefined));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Daily check failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await dailyAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
