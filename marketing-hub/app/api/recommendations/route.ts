import { NextResponse } from "next/server";
import { buildRecommendations, handleRecommendationRequest } from "@/lib/recommendations";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (err: any, label: string) => {
  console.error(label, err);
  return NextResponse.json({ error: err?.message ?? "Request failed." }, { status: 400 });
};

export async function GET(req: Request) {
  try {
    const lang = new URL(req.url).searchParams.get("lang");
    return NextResponse.json(await buildRecommendations(isLang(lang) ? lang : "en"));
  } catch (err) {
    return fail(err, "recommendations error");
  }
}

// POST { action: "DRAFT", key } | "UPDATE" {id, subject, body, cc} | "APPROVE_SEND" {id, approver, revision}
//      | "REJECT" {id, approver} | "DISMISS" / "RESTORE" {key}
// Nothing is sent except through APPROVE_SEND, which needs a named approver and the reviewed revision.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const useAi = process.env.ANTHROPIC_API_KEY && process.env.DRAFT_WITH_AI !== "off";
    const polish = body.action === "DRAFT" && useAi ? (await import("@/lib/email-ai")).polishWithClaude : undefined;
    await handleRecommendationRequest(body, polish);
    return NextResponse.json(await buildRecommendations(isLang(body.lang) ? body.lang : "en"));
  } catch (err) {
    return fail(err, "recommendations action error");
  }
}
