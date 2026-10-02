import { NextResponse } from "next/server";
import { orchestrationState, orchestrationAction } from "@/lib/orchestrator-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/orchestration?lang=ar -> work orders, deliverables, escalations, operating rhythm
// POST { action: APPROVE (items [{id, revision}], approver, confirmRead) | CANCEL | RECEIVE | RUN, ... }
export async function GET(req: Request) {
  try {
    const l = new URL(req.url).searchParams.get("lang");
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
