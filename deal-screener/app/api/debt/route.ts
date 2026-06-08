import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { buildDebtDashboard } from "@/lib/debt";
import { draftDebtNarrative } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const dashboard = await buildDebtDashboard();

    // Narrative is optional — only call Claude when ?narrative=1 so the
    // dashboard loads instantly and the AI summary can be requested on demand.
    const url = new URL(req.url);
    let narrative: string | null = null;
    if (url.searchParams.get("narrative") === "1") {
      narrative = await draftDebtNarrative({ dashboard });
    }

    return NextResponse.json({ dashboard, narrative });
  } catch (err: any) {
    console.error("debt error", err);
    const message =
      err?.status === 401
        ? "Authentication failed — check ANTHROPIC_API_KEY."
        : err?.message ?? "Debt dashboard failed.";
    return NextResponse.json({ error: message }, { status: err?.status ?? 500 });
  }
}
