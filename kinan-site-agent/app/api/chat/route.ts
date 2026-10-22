import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { AiUnavailable } from "@/lib/core/agent";
import type { ChatTurn } from "@/lib/core/llm/types";
import { serverReports } from "@/lib/reports/server";
import type { BriefLayoutApi } from "@/lib/core/tools";
import { currentUser } from "@/lib/auth/session";

const briefLayout = (): BriefLayoutApi => { const r = serverReports(); return { view: async (l) => (await r.layoutState(l)).view, change: (ops, l, by) => r.layoutChange(ops, l, by, "chat"), undo: (l) => r.layoutUndo(l) }; };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The in-app chat. Every answer comes from the AI API (Claude or OpenAI, routed by question size) with the agent's
 * tools over the project data — never from the keyword fallback. When no provider answers, the chat says so.
 */
export async function POST(req: NextRequest) {
  let body: { messages?: { role: string; content: string }[]; author?: string; focus?: { docId?: string; locationId?: string }; fm?: { facilityId?: string; techId?: string }; channel?: "web" | "field" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const history: ChatTurn[] = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  try {
    const me = await currentUser(req);
    const r = await runAgent(history, { author: me?.name ?? (body.author || "Site team").slice(0, 60), user: me, channel: body.channel === "field" ? "field" : "web", focus: body.focus, aiOnly: true, reports: briefLayout(), ...(body.fm ? { fm: { facilityId: body.fm.facilityId, techId: body.fm.techId } } : {}) });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof AiUnavailable ? e.message : "The AI service did not answer. Try again in a moment.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
