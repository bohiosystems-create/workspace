import { NextResponse } from "next/server";
import { llmStatus, TASKS } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // key status is read at request time, never at build time

// GET /api/ai -> which AI providers have keys, their models, and which provider each task is routed to (no secrets)
export async function GET() {
  return NextResponse.json({ status: llmStatus(), tasks: TASKS });
}
