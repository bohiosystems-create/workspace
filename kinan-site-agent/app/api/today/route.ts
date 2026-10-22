import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { currentUser } from "@/lib/auth/session";
import { today } from "@/lib/approvals";
import { outcomes } from "@/lib/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET               -> the first screen: the day in a few lines, the approvals queue, the outcomes
// GET ?outcomes=<facility id | all> -> the outcomes only
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams, db = (await getRepo()).db;
    if (q.has("outcomes")) return NextResponse.json(outcomes(db, q.get("outcomes") === "all" ? undefined : q.get("outcomes") || undefined), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(today(db, await currentUser(req)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
