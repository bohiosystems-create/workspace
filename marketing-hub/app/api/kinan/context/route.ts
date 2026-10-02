import { NextResponse } from "next/server";
import { kinanContext } from "@/lib/director";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// For Kinan's AI agent: what the marketing director wants it to know and do.
//   GET /api/kinan/context?lang=ar   header x-api-key: <KINAN_API_KEY>
export async function GET(req: Request) {
  const key = process.env.KINAN_API_KEY;
  if (!key) return NextResponse.json({ error: "Kinan API is disabled (KINAN_API_KEY is not set)." }, { status: 503 });
  if (req.headers.get("x-api-key") !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const l = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await kinanContext(isLang(l) ? l : "en"));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Context failed." }, { status: 500 });
  }
}
