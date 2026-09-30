import { NextResponse } from "next/server";
import { localAnswer } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { messages: [{ role: "user" | "assistant", content }] } -> { reply, cards, engine }
// Uses Claude (tool use over a data snapshot) when ANTHROPIC_API_KEY is set, otherwise the built-in
// rules answerer. The chat can only DRAFT emails; sending needs a human approval in the UI.
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const history = (Array.isArray(messages) ? messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .slice(-12);
    const last = history[history.length - 1];
    if (!last || last.role !== "user" || !last.content.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

    const useAi = process.env.ANTHROPIC_API_KEY && process.env.CHAT_WITH_AI !== "off";
    const polish = process.env.ANTHROPIC_API_KEY && process.env.DRAFT_WITH_AI !== "off" ? (await import("@/lib/email-ai")).polishWithClaude : undefined;
    if (useAi) {
      try {
        return NextResponse.json(await (await import("@/lib/chat-ai")).claudeAnswer(history, polish));
      } catch (err) {
        console.error("chat claude error, falling back to rules", err);
      }
    }
    return NextResponse.json(await localAnswer(last.content, undefined, polish));
  } catch (err: any) {
    console.error("chat error", err);
    return NextResponse.json({ error: err?.message ?? "Chat failed." }, { status: 500 });
  }
}
