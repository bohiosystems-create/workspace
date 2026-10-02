import { NextResponse } from "next/server";
import { llmStatus, TASKS } from "@/lib/llm";

export const runtime = "nodejs";

// GET /api/ai -> which AI providers have keys, their models, and which provider each task is routed to (no secrets)
export async function GET() {
  return NextResponse.json({ status: llmStatus(), tasks: TASKS });
}
