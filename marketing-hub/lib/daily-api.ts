// Request handlers for the daily campaign check (shared by the API route and the offline demo).
import { dailyState, decideDaily, generateDailyNote } from "./daily";
import { llmStatus } from "./llm";
import { type Lang, isLang, tx } from "./i18n";

export async function dailyApiState(lang: Lang, date?: string) {
  return { ...(await dailyState(lang, date)), ai: llmStatus() };
}
export async function dailyAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "DECIDE": await decideDaily(String(b.id), b.decision, String(b.approver ?? ""), b.note ? String(b.note) : null, l); break;
    case "AI_NOTE": await generateDailyNote(l); break;
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return dailyApiState(l, b.date ? String(b.date) : undefined);
}
