import { NextResponse } from "next/server";
import { ensureMarketingSeeded } from "@/lib/seed-marketing";
import { buildMarketingDashboard, applyAction } from "@/lib/marketing";
import { draftMarketingBrief, draftVendorNote } from "@/lib/claude";
import { isLang, nm } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

function fail(err: any, label: string) {
  console.error(label, err);
  const message =
    err?.status === 401
      ? "Authentication failed — check ANTHROPIC_API_KEY / OPENAI_API_KEY."
      : err?.message ?? "Marketing request failed.";
  return NextResponse.json({ error: message }, { status: err?.status ?? 500 });
}

// GET  /api/marketing              -> dashboard (deterministic, no Claude)
// GET  /api/marketing?narrative=1  -> dashboard + AI vendor brief (Anthropic or OpenAI)
export async function GET(req: Request) {
  try {
    await ensureMarketingSeeded();
    const q = new URL(req.url).searchParams.get("lang");
    const lang = isLang(q) ? q : "en";
    const dashboard = await buildMarketingDashboard(lang);
    let narrative: string | null = null;
    if (new URL(req.url).searchParams.get("narrative") === "1") {
      narrative = await draftMarketingBrief({ dashboard, lang });
    }
    return NextResponse.json({ dashboard, narrative });
  } catch (err) {
    return fail(err, "marketing error");
  }
}

// POST { action: "PAUSE" | "RESUME" | "SHIFT_BUDGET", ... } -> apply + return fresh dashboard
// POST { action: "VENDOR_NOTE", vendorId }                  -> AI-drafted note to the vendor
export async function POST(req: Request) {
  try {
    await ensureMarketingSeeded();
    const body = await req.json();
    const lang = isLang(body.lang) ? body.lang : "en";

    if (body.action === "VENDOR_NOTE") {
      const dashboard = await buildMarketingDashboard(lang);
      const vendor = dashboard.vendors.find((v) => v.id === body.vendorId);
      if (!vendor) return NextResponse.json({ error: lang === "ar" ? "المورد غير موجود." : "Vendor not found." }, { status: 404 });
      const note = await draftVendorNote({
        vendor,
        campaigns: dashboard.campaigns.filter((c) => c.vendorId === vendor.id),
        alerts: dashboard.alerts.filter((a) => a.title.startsWith(nm(lang, vendor.name))),
        lang,
      });
      return NextResponse.json({ note });
    }

    if (body.action === "PAUSE" || body.action === "RESUME") {
      await applyAction({ type: body.action, campaignId: String(body.campaignId) }, lang);
    } else if (body.action === "SHIFT_BUDGET") {
      await applyAction({
        type: "SHIFT_BUDGET",
        campaignId: String(body.campaignId),
        toCampaignId: String(body.toCampaignId),
        amountK: Number(body.amountK),
      }, lang);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ dashboard: await buildMarketingDashboard(lang) });
  } catch (err) {
    return fail(err, "marketing action error");
  }
}
