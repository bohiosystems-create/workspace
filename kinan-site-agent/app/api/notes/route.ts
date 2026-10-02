import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { addNoteTo } from "@/lib/core/tools";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json();
  const repo = await getRepo();
  const text = String(b.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty note" }, { status: 400 });
  if (b.docId && !repo.db.docs.some((d) => d.id === b.docId)) return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  if (b.locationId && !repo.db.locations.some((l) => l.id === b.locationId)) return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  if (!b.docId && !b.locationId) return NextResponse.json({ error: "Attach to a document or location" }, { status: 400 });
  const at = b.at && Number.isFinite(b.at.x) && Number.isFinite(b.at.y) ? { x: +b.at.x, y: +b.at.y } : undefined;
  const note = await addNoteTo(repo, {
    text: text.slice(0, 4000), docId: b.docId, locationId: b.locationId, at,
    kind: ["note", "issue", "instruction"].includes(b.kind) ? b.kind : "note",
    author: String(b.author || "Dev Manager").slice(0, 80), via: "manual",
  });
  return NextResponse.json({ note });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const repo = await getRepo();
  const n = repo.db.notes.find((x) => x.id === b.id);
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
  n.status = b.status === "closed" ? "closed" : "open";
  await repo.save();
  return NextResponse.json({ note: n });
}
