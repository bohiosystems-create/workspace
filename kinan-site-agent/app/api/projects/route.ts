import { NextResponse } from "next/server";
import { readGenerated, syncGenerated } from "@/lib/generated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  -> { projects, deleted }   the generated projects kept on the server
// POST { projects, deleted }      merge this device's list in; returns the merged list
export async function GET() {
  return NextResponse.json(await readGenerated());
}
export async function POST(req: Request) {
  try {
    const b = await req.json();
    return NextResponse.json(await syncGenerated(Array.isArray(b.projects) ? b.projects : [], Array.isArray(b.deleted) ? b.deleted.map(String) : []));
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Sync failed." }, { status: 400 });
  }
}
