import { NextResponse } from "next/server";
import { localAnswer } from "@/lib/chat";
import { llmStatus } from "@/lib/llm";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { messages: [{ role: "user" | "assistant", content }] } -> { reply, cards, engine }
// Uses an AI provider (Anthropic and/or OpenAI, lib/llm.ts — with data tools) when a key is set, otherwise the
// built-in rules answerer. The chat can only DRAFT emails; sending needs a human approval in the UI.
export async function POST(req: Request) {
  try {
    const { messages, lang } = await req.json();
    const ui = isLang(lang) ? lang : "en";
    const history = (Array.isArray(messages) ? messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .slice(-12);
    const last = history[history.length - 1];
    if (!last || last.role !== "user" || !last.content.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

    const ai = llmStatus().enabled;
    const useAi = ai && process.env.CHAT_WITH_AI !== "off";
    const polish = ai && process.env.DRAFT_WITH_AI !== "off" ? (await import("@/lib/email-ai")).polishWithAI : undefined;
    if (useAi) {
      try {
        return NextResponse.json(await (await import("@/lib/chat-ai")).aiAnswer(history, polish, ui));
      } catch (err) {
        console.error("chat AI error, falling back to built-in rules", err);
      }
    }
    return NextResponse.json(await localAnswer(last.content, undefined, polish, ui));
  } catch (err: any) {
    console.error("chat error", err);
    return NextResponse.json({ error: err?.message ?? "Chat failed." }, { status: 500 });
  }
}
