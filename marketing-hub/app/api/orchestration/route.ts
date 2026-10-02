import { NextResponse } from "next/server";
import { orchestrationState, orchestrationAction, vendorState } from "@/lib/orchestrator-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/orchestration?lang=ar -> vendor directory, work orders, deliverables, escalations, operating rhythm
// GET  /api/orchestration?vendor=<id>&lang=ar -> one vendor: campaigns, invoices, work orders, deliverables, emails
// POST { action: APPROVE (items [{id, revision}], approver, confirmRead) | CANCEL | RECEIVE | RUN, ... }
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams, l = u.get("lang"), vendor = u.get("vendor");
    if (vendor) return NextResponse.json(await vendorState(vendor, isLang(l) ? l : "en"));
    return NextResponse.json(await orchestrationState(isLang(l) ? l : "en"));
  } catch (err: any) {
    console.error("orchestration error", err);
    return NextResponse.json({ error: err?.message ?? "Orchestration request failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await orchestrationAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
