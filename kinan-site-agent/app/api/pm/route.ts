import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { currentUser } from "@/lib/auth/session";
import { importProgramme, programmeState } from "@/lib/pm/api";
import { whatIf } from "@/lib/pm/recovery";
import { readXer, writeXer } from "@/lib/pm/xer";
import { outboxCsv, p6Config, readP6, sendOutbox } from "@/lib/pm/p6";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The schedule agent over Primavera P6 (lib/pm).
// GET                 -> the programme's state: forecasts, DCMA health, changes since the last update, site vs P6,
//                        recovery options, the critical path, the P6 outbox
// GET ?export=xer     -> the programme as it now stands, as an XER for P6 (File → Import)
// GET ?export=csv     -> the P6 outbox as CSV
// POST ?import=xer    (body: the .xer file) -> replaces the programme; the current one becomes the previous update
// POST { op: "whatif", activityId, days }   -> what a delay (or a gain) on one activity does to completion
// POST { op: "sync" }                       -> read the programme from the P6 API (env P6)
// POST { op: "push" }                       -> send the pending outbox to the P6 API
// POST { op: "mark", ids, status }          -> mark outbox changes sent by hand (after an XER / CSV import)
// Importing, syncing, pushing and marking need a signed-in manager or above.
const MANAGERS = new Set(["manager", "director", "admin"]);

export async function GET(req: Request) {
  const db = (await getRepo()).db, ex = new URL(req.url).searchParams.get("export");
  const code = db.project.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 20) || "PROJECT";
  if (ex === "xer") return new Response(writeXer(db.data.schedule, { projectCode: code, dataDate: db.data.meta.dataDate }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${code}-${db.data.meta.dataDate}.xer"` } });
  if (ex === "csv") return new Response(outboxCsv(db.p6Outbox ?? []), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="p6-changes-${db.data.meta.dataDate}.csv"` } });
  return NextResponse.json(programmeState(db), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url), me = await currentUser(req);
    const manager = () => { if (!me || !MANAGERS.has(me.role)) throw new Error("Only a manager (or above) can change the programme or what goes to P6 — sign in first."); };
    const repo = await getRepo();
    if (url.searchParams.get("import") === "xer") {
      manager();
      const text = await req.text();
      if (text.length > 40_000_000) throw new Error("That XER is over 40 MB.");
      const x = readXer(text, url.searchParams.get("project") ?? undefined);
      const r = importProgramme(repo.db, { activities: x.activities, dataDate: x.dataDate, kind: "xer", name: `${x.code} (XER, ${x.dataDate})`, projectId: x.id });
      await repo.save();
      return NextResponse.json({ ok: true, ...r, warnings: x.warnings });
    }
    const b = (await req.json()) as { op: string; activityId?: string; days?: number; ids?: string[]; status?: "sent" | "pending" };
    if (b.op === "whatif") {
      const s = repo.db.data.schedule;
      return NextResponse.json(whatIf(s, repo.db.data.meta.dataDate, String(b.activityId ?? "").trim().toUpperCase(), Math.max(-365, Math.min(365, Math.round(Number(b.days) || 0)))));
    }
    manager();
    const c = p6Config();
    if (b.op === "sync" || b.op === "push") {
      if (!c) throw new Error("P6 isn't connected: set P6 to {\"url\",\"user\",\"password\",\"projectObjectId\"} (SETUP.md). Meanwhile, import an XER and download the changes.");
      if (b.op === "sync") {
        const p = await readP6(c);
        if (!p.activities.length) throw new Error("P6 returned no activities for that project.");
        const r = importProgramme(repo.db, { activities: p.activities, dataDate: p.dataDate, kind: "p6-api", name: `P6 project ${c.projectObjectId} (${p.dataDate})`, projectId: c.projectObjectId });
        await repo.save();
        return NextResponse.json({ ok: true, ...r });
      }
      const r = await sendOutbox(repo.db, c);
      await repo.save();
      return NextResponse.json({ ok: true, ...r });
    }
    if (b.op === "mark") {
      const ids = new Set(b.ids ?? []);
      let n = 0;
      for (const x of repo.db.p6Outbox ?? []) if (ids.has(x.id)) { x.status = b.status === "pending" ? "pending" : "sent"; x.note = x.status === "sent" ? `Marked in P6 by ${me!.name}` : undefined; n++; }
      await repo.save();
      return NextResponse.json({ ok: true, marked: n });
    }
    throw new Error("Unknown op.");
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
