import { NextResponse } from "next/server";
import { historyState } from "@/lib/history";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";

// GET /api/history?lang=ar -> past campaigns with KPIs, benchmarks by channel / season / year / project / vendor, lessons
export async function GET(req: Request) {
  try {
    const l = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await historyState(isLang(l) ? l : "en"));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "History request failed." }, { status: 500 });
  }
}
