import { NextResponse } from "next/server";
import { buildCrmDashboard, syncCrm } from "@/lib/crm";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET  /api/crm?lang=ar -> CRM-verified vs vendor-reported reconciliation
// POST { action: "SYNC" } -> pull from the configured CRM adapter now
export async function GET(req: Request) {
  try {
    const lang = new URL(req.url).searchParams.get("lang");
    return NextResponse.json({ dashboard: await buildCrmDashboard(isLang(lang) ? lang : "en") });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "CRM request failed." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action !== "SYNC") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    await syncCrm();
    return NextResponse.json({ dashboard: await buildCrmDashboard(isLang(b.lang) ? b.lang : "en") });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "CRM sync failed." }, { status: 400 });
  }
}
