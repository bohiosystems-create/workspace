import { NextResponse } from "next/server";
import { serverReports } from "@/lib/reports/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/reports?lang=ar          -> schedule, next run, delivery check, report history
// GET  /api/reports?id=<id>          -> one report (title, html, text)
// POST { action: SAVE_SCHEDULE | SNAPSHOT | PREVIEW | SEND_NOW | RUN, lang, ... }
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams, r = serverReports();
    if (u.get("id")) return NextResponse.json(await r.getReport(String(u.get("id"))));
    return NextResponse.json(await r.state(u.get("lang") === "ar" ? "ar" : "en"));
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Reports request failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await serverReports().action(await req.json()));
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Action failed." }, { status: 400 });
  }
}
