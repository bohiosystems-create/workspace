import { NextRequest, NextResponse } from "next/server";
import { addNote, db, locationById, updateNote } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json();
  const text = String(b.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty note" }, { status: 400 });
  if (b.docId && !db().docs.some((d) => d.id === b.docId)) return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  if (b.locationId && !locationById(b.locationId)) return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  if (!b.docId && !b.locationId) return NextResponse.json({ error: "Attach to a document or location" }, { status: 400 });
  const at = b.at && Number.isFinite(b.at.x) && Number.isFinite(b.at.y) ? { x: +b.at.x, y: +b.at.y } : undefined;
  const note = addNote({
    text, docId: b.docId, locationId: b.locationId, at,
    kind: ["note", "issue", "instruction"].includes(b.kind) ? b.kind : "note",
    author: b.author || "Dev Manager", via: "manual",
  });
  return NextResponse.json({ note });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const n = updateNote(String(b.id), { status: b.status === "closed" ? "closed" : "open" });
  return n ? NextResponse.json({ note: n }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
