import { NextRequest, NextResponse } from "next/server";
import { addLocation, db, newId } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Drop a custom named pin (e.g. "Column C4 crack") anywhere on the plan. */
export async function POST(req: NextRequest) {
  const b = await req.json();
  const name = String(b.name ?? "").trim();
  const x = Number(b.x), y = Number(b.y);
  if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return NextResponse.json({ error: "name, x, y required" }, { status: 400 });
  const parent = db().locations.find((l) => l.id === b.parentId);
  const loc = addLocation({ id: newId("pin"), name, type: "pin", parentId: parent?.id, x, y });
  return NextResponse.json({ location: loc });
}
