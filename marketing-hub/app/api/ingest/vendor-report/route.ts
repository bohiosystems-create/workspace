import { NextResponse } from "next/server";
import { templateCsv, importVendorReport } from "@/lib/vendor-reports";

export const runtime = "nodejs";

// GET  -> the canonical monthly report template (CSV) vendors fill in
// POST { csv, fileName } with x-api-key: <INGEST_API_KEY>  -> import (the in-app upload uses /api/agent instead)
export async function GET() {
  return new NextResponse(await templateCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=vendor-report-template.csv" } });
}

export async function POST(req: Request) {
  const key = process.env.INGEST_API_KEY;
  if (!key) return NextResponse.json({ error: "Ingest is disabled (INGEST_API_KEY is not set)." }, { status: 503 });
  if (req.headers.get("x-api-key") !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const b = await req.json();
    return NextResponse.json(await importVendorReport(String(b.csv ?? ""), String(b.fileName ?? "api.csv")));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Import failed." }, { status: 400 });
  }
}
