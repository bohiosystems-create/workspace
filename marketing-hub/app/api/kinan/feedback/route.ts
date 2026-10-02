import { NextResponse } from "next/server";
import { recordKinanFeedback } from "@/lib/kinan";

export const runtime = "nodejs";

// Kinan's AI agent reports back.  header x-api-key: <KINAN_API_KEY>
//   { "type": "lead.contacted", "leadId": "<Yardi prospect / CRM id>", "at": "2026-06-08T10:00:00Z" }
//   { "type": "lead.outcome",   "leadId": "...", "stage": "VIEWING" | "RESERVED" | "WON" | "LOST", "dealValueM": 1.4 }
//   { "type": "task.done",      "taskId": "<id from the follow-up event>" }
export async function POST(req: Request) {
  const key = process.env.KINAN_API_KEY;
  if (!key) return NextResponse.json({ error: "Kinan API is disabled (KINAN_API_KEY is not set)." }, { status: 503 });
  if (req.headers.get("x-api-key") !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await recordKinanFeedback(await req.json()));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Feedback failed." }, { status: 400 });
  }
}
