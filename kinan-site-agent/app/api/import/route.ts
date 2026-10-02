import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { importRegister, importSchedule } from "@/lib/importers";
import { bearerOk } from "@/lib/secret";

export const dynamic = "force-dynamic";

/** POST text/csv to ?type=schedule[&dataDate=YYYY-MM-DD] or ?type=register. Auth: Bearer $IMPORT_SECRET. */
export async function POST(req: NextRequest) {
  if (!bearerOk(req, process.env.IMPORT_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const csv = await req.text();
  if (!csv.trim()) return NextResponse.json({ error: "empty body" }, { status: 400 });
  const r = await getRepo();
  const res = type === "schedule" ? importSchedule(r.db, csv, req.nextUrl.searchParams.get("dataDate") ?? undefined)
    : type === "register" ? importRegister(r.db, csv) : null;
  if (!res) return NextResponse.json({ error: "type must be schedule or register" }, { status: 400 });
  await r.save();
  return NextResponse.json({ ok: true, ...res });
}
