import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const d = db();
  // Strip bulky searchable text from the list payload.
  return NextResponse.json({
    project: d.project,
    locations: d.locations,
    docs: d.docs.map(({ text, ...rest }) => { void text; return rest; }),
    notes: d.notes,
    agentMode: process.env.ANTHROPIC_API_KEY ? "claude" : "offline",
  });
}
