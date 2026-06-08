import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { buildReport, listFunds, listPeriods } from "@/lib/reporting";
import { parseReportRequest, draftReportCommentary } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET → options for the UI (fund + period lists).
export async function GET() {
  await ensureSeeded();
  const [funds, periods] = await Promise.all([listFunds(), listPeriods()]);
  return NextResponse.json({ funds, periods });
}

// POST → run the reporting pipeline.
// Accepts either a free-text { message } (chatbot) or explicit
// { fund, period, reportType, style }.
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const funds = await listFunds();
    const periods = await listPeriods();

    let spec;
    if (body.message && typeof body.message === "string") {
      spec = await parseReportRequest({ message: body.message, funds, periods });
    } else {
      spec = {
        fund: funds.includes(body.fund) ? body.fund : funds[0],
        period: periods.includes(body.period) ? body.period : periods[0],
        reportType: body.reportType ?? "LP Quarterly Report",
        style: body.style ?? "Institutional / Formal",
      };
    }

    const report = await buildReport(spec);
    const commentary = await draftReportCommentary({ report });

    return NextResponse.json({ spec, report, commentary });
  } catch (err: any) {
    console.error("report error", err);
    const message =
      err?.status === 401
        ? "Authentication failed — check ANTHROPIC_API_KEY."
        : err?.message ?? "Report generation failed.";
    return NextResponse.json({ error: message }, { status: err?.status ?? 500 });
  }
}
