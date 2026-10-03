import { NextResponse } from "next/server";
import { chartApi, chartCatalogue } from "@/lib/chart-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET -> datasets, fields, named measures, chart types, transforms.
// POST { prompt } | { query } | { queries } -> { charts: ChartSpec[], queries, engine }
export async function GET() {
  return NextResponse.json(chartCatalogue());
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await chartApi(await req.json()));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Chart failed." }, { status: 400 });
  }
}
