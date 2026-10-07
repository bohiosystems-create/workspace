import { NextResponse } from "next/server";
import { serverReports } from "@/lib/reports/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Scheduler endpoint: call every minute (Vercel Cron does, see vercel.json; any scheduler will). The daily report is
// sent once per local day, at or after the scheduled time. Auth: x-api-key or Authorization: Bearer <REPORTS_CRON_KEY>;
// Vercel Cron sends Bearer $CRON_SECRET, which is accepted too. Disabled until REPORTS_CRON_KEY is set. Outside the
// sign-in gate.
async function handle(req: Request) {
  const key = process.env.REPORTS_CRON_KEY;
  if (!key) return NextResponse.json({ error: "REPORTS_CRON_KEY is not set — scheduled reports are disabled." }, { status: 503 });
  const got = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!got || (got !== key && got !== process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await serverReports().runSchedule());
  } catch (err) {
    console.error("report run failed", err);
    return NextResponse.json({ error: (err as Error)?.message ?? "Report run failed." }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
