import { NextResponse } from "next/server";
import { campaignBoards } from "@/lib/campaign-boards";
import { campaignLayoutAction } from "@/lib/campaign-layout";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";

// GET /api/campaigns/boards?lang=ar -> every campaign run (live + 2023–2025) with its dashboard, per the layout set from the chat
export async function GET(req: Request) {
  try {
    const l = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await campaignBoards(isLang(l) ? l : "en"));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Campaign dashboards failed." }, { status: 500 });
  }
}

// POST { action: "UNDO" | "RESET", lang } -> undo the last dashboard change / back to the standard dashboards
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const r = await campaignLayoutAction(b);
    return NextResponse.json({ ...r, boards: await campaignBoards(b?.lang === "ar" ? "ar" : "en") });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Campaign dashboards failed." }, { status: 400 });
  }
}
