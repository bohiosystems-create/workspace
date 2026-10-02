import { NextResponse } from "next/server";
import { runSchedule } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduler endpoint: call every 15 minutes (cron, Azure Logic App, Windows Task Scheduler, Vercel Cron…).
// Sends the daily report once per local day at/after the scheduled time. Auth: x-api-key or
// Authorization: Bearer <REPORTS_CRON_KEY>.
async function handle(req: Request) {
  const key = process.env.REPORTS_CRON_KEY;
  if (!key) return NextResponse.json({ error: "REPORTS_CRON_KEY is not set — scheduled reports are disabled." }, { status: 503 });
  const got = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await runSchedule());
  } catch (err: any) {
    console.error("report run failed", err);
    return NextResponse.json({ error: err?.message ?? "Report run failed." }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
