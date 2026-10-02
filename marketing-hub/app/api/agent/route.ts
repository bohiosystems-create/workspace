import { NextResponse } from "next/server";
import { agentState, agentDoc, agentAction } from "@/lib/agent-api";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/agent?lang=ar                              -> scores, decisions, incrementality, bench, data sources
// GET  /api/agent?doc=qbr&vendor=..&quarter=2026-Q2   -> quarterly business review
// GET  /api/agent?doc=rfp&vendor=..                    -> replacement brief / RFP
// POST { action, ... }                                 -> tests, trials, RFP / QBR drafts, ad sync, report import
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    const lang = isLang(u.get("lang")) ? (u.get("lang") as "en" | "ar") : "en";
    const doc = u.get("doc");
    if (doc === "qbr" || doc === "rfp") return NextResponse.json(await agentDoc(doc, String(u.get("vendor")), String(u.get("quarter") ?? "2026-Q2"), lang));
    return NextResponse.json(await agentState(lang));
  } catch (err: any) {
    console.error("agent error", err);
    return NextResponse.json({ error: err?.message ?? "Agent request failed." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return NextResponse.json(await agentAction(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed." }, { status: 400 });
  }
}
