import { NextResponse } from "next/server";
import { extractDeal, draftMemo } from "@/lib/claude";
import { runUnderwrite } from "@/lib/underwrite";
import { getHurdles } from "@/lib/hurdles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let fund: string | null = null;
    let source: { pdfBase64: string } | { text: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      fund = (form.get("fund") as string) ?? null;
      const file = form.get("file");
      const text = form.get("text");
      if (file && file instanceof File && file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer());
        source = { pdfBase64: buf.toString("base64") };
      } else if (typeof text === "string" && text.trim()) {
        source = { text: text.trim() };
      }
    } else {
      const body = await req.json();
      fund = body.fund ?? null;
      if (typeof body.text === "string" && body.text.trim()) {
        source = { text: body.text.trim() };
      }
    }

    if (!source) {
      return NextResponse.json(
        { error: "Provide a PDF file or pasted deal text." },
        { status: 400 }
      );
    }

    const hurdles = getHurdles(fund);

    // 1. Claude extracts the figures (structured output).
    const deal = await extractDeal(source);
    // 2. Deterministic underwrite vs. the fund hurdles.
    const underwrite = runUnderwrite(deal, hurdles);
    // 3. Claude drafts the IC memo from facts + computed underwrite.
    const memo = await draftMemo({ deal, underwrite, hurdles });

    // 4. Persist.
    const saved = await prisma.deal.create({
      data: {
        assetName: deal.assetName ?? "Untitled deal",
        assetType: deal.assetType,
        location: deal.location,
        fund: hurdles.fund,
        verdict: underwrite.verdict,
        extracted: JSON.stringify(deal),
        underwrite: JSON.stringify(underwrite),
        memo,
      },
    });

    return NextResponse.json({ id: saved.id, fund: hurdles.fund, deal, underwrite, memo });
  } catch (err: any) {
    console.error("screen error", err);
    const message =
      err?.status === 401
        ? "Authentication failed — check ANTHROPIC_API_KEY."
        : err?.message ?? "Screening failed.";
    return NextResponse.json({ error: message }, { status: err?.status ?? 500 });
  }
}
