import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatMsg } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const b = await req.json();
  const messages: ChatMsg[] = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m: ChatMsg) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return NextResponse.json({ error: "Send a user message" }, { status: 400 });
  try {
    const out = await runAgent(messages, {
      author: b.author || "Dev Manager",
      focus: b.focus,
      here: b.here,
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent error";
    return NextResponse.json({ reply: `Agent error: ${msg}`, actions: [], mode: "claude" }, { status: 200 });
  }
}
