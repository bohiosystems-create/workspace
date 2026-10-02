// Questions the assistant missed — the feedback loop for "infinite" questions. Logged automatically when the
// built-in answers can't match a question, and by a person pressing "Not what I asked" under any answer (AI or rules).
// Reviewed on the Reports page; each one becomes a new built-in answer, synonym or test question.
import { prisma } from "./prisma";

export type Miss = { id: string; question: string; answer: string; lang: string; engine: string; source: "AUTO" | "USER"; createdAt: string };

export async function logMiss(m: { question: string; answer?: string; lang?: string; engine?: string; source: "AUTO" | "USER" }) {
  const question = String(m.question ?? "").trim().slice(0, 500);
  if (!question) return;
  await prisma.chatMiss.create({ data: { question, answer: String(m.answer ?? "").slice(0, 600), lang: m.lang === "ar" ? "ar" : "en", engine: String(m.engine ?? "rules").slice(0, 20), source: m.source } });
}

export async function listMisses(take = 50): Promise<{ misses: Miss[]; total: number }> {
  const [rows, total] = await Promise.all([prisma.chatMiss.findMany({ orderBy: { createdAt: "desc" }, take }), prisma.chatMiss.count()]);
  return { misses: rows.map((r: any) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })), total };
}
