import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const dynamic = "force-dynamic";

/**
 * Issues short-lived tokens so the browser can upload large files (> 4 MB) straight to
 * Vercel Blob (Vercel functions accept at most 4.5 MB per request). Protected by the
 * app login (middleware), and tokens only allow private uploads under uploads/direct/.
 */
export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Direct upload needs a Vercel Blob store" }, { status: 400 });
  const prefix = (process.env.BLOB_PREFIX ?? "kinan/").replace(/^\/+/, "") + "uploads/direct/";
  try {
    const body = (await req.json()) as HandleUploadBody;
    const res = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix) || pathname.includes("..")) throw new Error("Invalid upload path");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
          allowedContentTypes: ["application/pdf", "image/*", "text/*", "application/vnd.*", "application/msword", "application/zip", "application/octet-stream", "image/vnd.dwg"],
        };
      },
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "upload token error" }, { status: 400 });
  }
}
