import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/deck/narration";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/deck-ask { question, lang, slide, title, slides: [{kind, title, say}], history: [{q, a}] }
//   -> { answer }  the presenter's spoken answer to a question asked during ▶ Play (same-origin only)
export async function POST(req: Request) {
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json().catch(() => null)) ?? {}; // malformed body: no question (400) below
    const question = String(b.question ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!question) return NextResponse.json({ error: "No question." }, { status: 400 });
    const lang = b.lang === "ar" ? "ar" : "en";
    const slides = (Array.isArray(b.slides) ? b.slides : []).slice(0, 60).map((x: any) => ({ kind: String(x?.kind ?? ""), title: x?.title ? String(x.title).slice(0, 200) : undefined, say: String(x?.say ?? "").slice(0, 900) }));
    const history = (Array.isArray(b.history) ? b.history : []).slice(-3).map((h: any) => ({ q: String(h?.q ?? "").slice(0, 500), a: String(h?.a ?? "").slice(0, 900) }));
    const answer = await answerQuestion(lang, question, { title: String(b.title ?? ""), slide: Number(b.slide) || 0, slides, history });
    return NextResponse.json({ answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed." }, { status: 500 });
  }
}
