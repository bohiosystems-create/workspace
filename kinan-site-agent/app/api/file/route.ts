import { NextRequest, NextResponse } from "next/server";
import { getRepo, readUpload, signedUploadUrl, storageKind } from "@/lib/store";
import { renderDrawing } from "@/lib/drawings";

export const dynamic = "force-dynamic";

/** Serves document files to the logged-in app (storage stays private). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const d = (await getRepo()).db.docs.find((x) => x.id === id);
  if (!d) return new NextResponse("Not found", { status: 404 });
  if (d.generated) {
    return new NextResponse(renderDrawing(d.generated.kind, d.generated.label, d.revision), {
      headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=300" },
    });
  }
  // Vercel functions can return at most ~4.5 MB: send big files via a short-lived signed URL.
  if (storageKind() === "blob" && d.size > 4 * 1024 * 1024) {
    const url = await signedUploadUrl(d);
    if (url) return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
  }
  const buf = await readUpload(d);
  if (!buf) return new NextResponse(d.text || d.summary, { headers: { "content-type": "text/plain; charset=utf-8" } });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": d.mime || "application/octet-stream",
      "content-disposition": `inline; filename="${encodeURIComponent(d.filename)}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
