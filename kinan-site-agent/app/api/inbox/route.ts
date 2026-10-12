import { NextRequest, NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** The project's Outlook inbox (contractor emails), synced when stale; ?sync=1 forces a sync. Read-only. */
export async function GET(req: NextRequest) {
  return NextResponse.json(await getInbox(req.nextUrl.searchParams.get("sync") === "1"));
}
