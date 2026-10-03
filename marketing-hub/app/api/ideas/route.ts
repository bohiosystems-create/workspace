import { NextResponse } from "next/server";
import { ideasState, ideasAction } from "@/lib/ideas-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET  /api/ideas?lang=ar -> saved market initiatives, CRM signals, form defaults, which AI providers ideate and judge
// POST { action: GENERATE, brief: { project, month, budgetK, goal, audience, notes, engine: auto|rules, signalId? (answer this CRM signal) }, lang }
//      { action: DECIDE, id, decision: SHORTLIST|APPROVE|DISCARD|REOPEN, approver, note, lang }  (APPROVE drafts a vendor brief)
export async function GET(req: Request) {
  try {
    const l = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await ideasState(isLang(l) ? l : "en"));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ideas request failed." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await ideasAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
