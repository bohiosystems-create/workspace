import { NextRequest, NextResponse } from "next/server";
import { db, readUpload } from "@/lib/store";
import { renderDrawing } from "@/lib/drawings";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const d = db().docs.find((x) => x.id === id);
  if (!d) return new NextResponse("Not found", { status: 404 });
  if (d.generated) {
    return new NextResponse(renderDrawing(d.generated.kind, d.generated.label, d.revision), {
      headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },
    });
  }
  const buf = readUpload(d.id);
  if (!buf) {
    // Authored seed docs with no binary: serve the text.
    return new NextResponse(d.text || d.summary, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": d.mime || "application/octet-stream",
      "content-disposition": `inline; filename="${encodeURIComponent(d.filename)}"`,
      "cache-control": "no-store",
    },
  });
}
