import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { importRegister, importSchedule } from "@/lib/importers";
import { bearerOk } from "@/lib/secret";
import { readXer } from "@/lib/pm/xer";
import { importProgramme } from "@/lib/pm/api";

export const dynamic = "force-dynamic";

/** POST text/csv to ?type=schedule[&dataDate=YYYY-MM-DD] or ?type=register; a P6 .xer to ?type=xer[&project=CODE]. Auth: Bearer $IMPORT_SECRET. */
export async function POST(req: NextRequest) {
  if (!bearerOk(req, process.env.IMPORT_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const csv = await req.text();
  if (!csv.trim()) return NextResponse.json({ error: "empty body" }, { status: 400 });
  const r = await getRepo();
  if (type === "xer") {
    try {
      const x = readXer(csv, req.nextUrl.searchParams.get("project") ?? undefined);
      const res = importProgramme(r.db, { activities: x.activities, dataDate: x.dataDate, kind: "xer", name: `${x.code} (XER, ${x.dataDate})`, projectId: x.id });
      await r.save();
      return NextResponse.json({ ok: true, ...res, warnings: x.warnings });
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  const res = type === "schedule" ? importSchedule(r.db, csv, req.nextUrl.searchParams.get("dataDate") ?? undefined)
    : type === "register" ? importRegister(r.db, csv) : null;
  if (!res) return NextResponse.json({ error: "type must be schedule, xer or register" }, { status: 400 });
  await r.save();
  return NextResponse.json({ ok: true, ...res });
}
