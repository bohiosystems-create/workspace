import { NextResponse } from "next/server";
import { reportsState, reportsAction, getReport } from "@/lib/reports-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/reports?lang=ar          -> schedule, next run, report history
// GET  /api/reports?id=<id>          -> one report (title, html, text)
// POST { action: SAVE_SCHEDULE | PREVIEW | SEND_NOW | RUN, ... }
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    if (u.get("id")) return NextResponse.json(await getReport(String(u.get("id"))));
    const l = u.get("lang");
    return NextResponse.json(await reportsState(isLang(l) ? l : "en"));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Reports request failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await reportsAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
