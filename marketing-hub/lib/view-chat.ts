// Changing any page's dashboard from the assistant's chat ("remove the YTD sales from all dashboards", "hide the budget
// plan on the director page", "show the alerts again", "undo"). Read by lib/view-blocks.ts; saved, logged, shown back
// as a card with undo. The AI chat reaches the same functions through its change_dashboard tool.
import { type Lang, tx, looksArabic } from "./i18n";
import { parseViewEdit, changeViews, undoViews, getLayouts, viewsView, pageName } from "./view-blocks";
import type { ChatReply } from "./chat";

export async function viewEditAnswer(question: string, uiLang: Lang): Promise<ChatReply | null> {
  const p = parseViewEdit(question);
  if (!p) return null;
  const L: Lang = looksArabic(question) ? "ar" : /[A-Za-z]{3,}/.test(question) ? "en" : uiLang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const suggest = [T("What's hidden on the dashboards?", "ما المخفي في اللوحات؟"), T("Undo the last dashboard change", "تراجع عن آخر تعديل على اللوحات"), T("Reset all dashboards", "أعد كل اللوحات إلى الوضع القياسي")];
  const out = async (reply: string, changed: string[] = []): Promise<ChatReply> => ({ reply, cards: [{ kind: "views", view: viewsView(await getLayouts(), L), changed }], engine: "rules", suggest });
  if (p.kind === "undo") { const u = await undoViews(L); return out(u.message); }
  if (p.kind === "view") {
    const v = viewsView(await getLayouts(), L).filter((x) => p.page === "all" || x.page === p.page);
    const hidden = v.flatMap((x) => x.blocks.filter((b) => b.hidden).map((b) => `${b.name} (${x.name})`));
    return out(hidden.length ? T(`**Hidden on the dashboards:** ${hidden.join(", ")}.\n\nSay “show … again” to bring one back, or “reset all dashboards”.`, `**المخفي في اللوحات:** ${hidden.join("، ")}.\n\nقولوا «أظهر … مجدداً» لإعادة أي منها، أو «أعد كل اللوحات».`)
      : T("Nothing is hidden — every dashboard shows all its tiles, charts and sections. Tell me what to remove, e.g. “remove the YTD sales from all dashboards” or “hide the budget plan on the director page”.", "لا شيء مخفي — كل اللوحات تعرض جميع بطاقاتها ورسومها وأقسامها. أخبروني بما تريدون إزالته، مثل «أزل المبيعات منذ بداية العام من كل اللوحات»."));
  }
  const r = await changeViews(p.ops, L);
  const pages = [...new Set(p.ops.map((o) => o.page))].filter((x) => x !== "all").map((x) => pageName(x, L));
  return out(r.done.length
    ? T(`**Dashboards updated:** ${r.done.join("; ")}.`, `**تم تعديل اللوحات:** ${r.done.join("؛ ")}.`) + (r.notes.length ? `\n${r.notes.join(" ")}` : "") + T(`\n\nIt shows now${pages.length ? ` on ${pages.join(", ")}` : ""}. Say “undo” to revert.`, `\n\nيظهر الآن${pages.length ? ` في ${pages.join("، ")}` : ""}. قولوا «تراجع» للعودة.`)
    : r.notes.join(" "), r.done);
}
