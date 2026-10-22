import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { currentUser } from "@/lib/auth/session";
import { approvals, decideApproval } from "@/lib/approvals";
import type { RejectReason } from "@/lib/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every open proposal (building site + facilities), with whether the signed-in person may approve it.
// GET  -> { items }
// POST { key, decision: "approved" | "rejected", reason?, note? } -> { message }  (approval limits apply)
export async function GET(req: Request) {
  const me = await currentUser(req);
  return NextResponse.json({ items: approvals((await getRepo()).db, me) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  try {
    const me = await currentUser(req);
    const b = (await req.json()) as { key: string; decision: "approved" | "rejected"; reason?: RejectReason; note?: string };
    const repo = await getRepo();
    const r = decideApproval(repo.db, b, me, "web");
    await repo.save();
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
