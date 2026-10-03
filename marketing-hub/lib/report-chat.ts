// Changing the daily report from the assistant's chat. The message is read by lib/report-layout.ts (English or Arabic);
// the change is saved, logged and shown back as a card with the report's sections, with undo one click away. The AI
// chat reaches the same functions through its change_daily_report tool.
import { type Lang, tx, nm, looksArabic } from "./i18n";
import { parseReportEdit, changeLayout, undoLayout, getLayout, layoutView, layoutHelp, type Op } from "./report-layout";
import type { ChatContext, ChatReply } from "./chat";

const PROJECTS = ["Ash Shati Residences", "Marina Tower", "Andalus Quarter"];
export const reportProjects = () => PROJECTS.map((name) => ({ name, ar: nm("ar", name) }));

/** A chart the chat can add: validated now (it must draw from today's data), re-run on fresh data in every report. */
export async function chartValidator(ctx: () => Promise<ChatContext>, lang: Lang) {
  const c = await ctx();
  const { chartFromText } = await import("./chart-query");
  return (prompt: string) => {
    const r = chartFromText(prompt, c.q, lang);
    if ("error" in r) return { error: r.error };
    const { title: _t, ...query } = (r.query ?? {}) as any;
    return { title: r.title, ...(r.query ? { query } : {}) };
  };
}

export async function applyReportOps(ops: Op[], lang: Lang, ctx: () => Promise<ChatContext>, source = "chat") {
  const needsChart = ops.some((o) => o.op === "add_chart");
  return changeLayout(ops, lang, { source, validateChart: needsChart ? await chartValidator(ctx, lang) : undefined });
}

/** The chat answer for a report change, or null when the message isn't about changing the report. */
export async function reportEditAnswer(question: string, uiLang: Lang, ctx: () => Promise<ChatContext>, opts: { allowUnclear?: boolean } = {}): Promise<ChatReply | null> {
  const p = parseReportEdit(question, reportProjects());
  if (!p) return null;
  if (p.kind === "unclear" && !opts.allowUnclear) return null;
  const L: Lang = looksArabic(question) ? "ar" : /[A-Za-z]{3,}/.test(question) ? "en" : uiLang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const suggest = [T("What's in the daily report?", "ما أقسام التقرير؟"), T("Undo the last report change", "تراجع عن آخر تعديل على التقرير"), T("Make the report shorter", "اجعل التقرير أقصر")];
  const card = async () => ({ kind: "report" as const, view: layoutView(await getLayout(), L) });
  const out = (reply: string, withCard = true): Promise<ChatReply> => (async () => ({ reply, cards: withCard ? [await card()] : [], engine: "rules" as const, suggest }))();
  const tail = T("\n\nIt applies from the next report — open Reports → **Preview today's report** to see it now. Say “undo” to revert.", "\n\nيُطبَّق من التقرير التالي — افتحوا التقارير ← **معاينة تقرير اليوم** لرؤيته الآن. قولوا «تراجع» للعودة.");

  if (p.kind === "unclear") return out(T("I can change the daily report, but I couldn't tell what to change.\n\n", "يمكنني تعديل التقرير اليومي، لكن لم أتبيّن ما المطلوب تغييره.\n\n") + layoutHelp(L));
  if (p.kind === "view") {
    const v = layoutView(await getLayout(), L);
    const on = v.sections.filter((s) => s.on).map((s, i) => `${i + 1}. ${s.name}`).join("\n");
    const off = v.sections.filter((s) => !s.on).map((s) => s.name);
    return out(T("**The daily report, in order:**\n", "**التقرير اليومي بالترتيب:**\n") + on +
      (off.length ? T(`\n\nNot shown: ${off.join(", ")}.`, `\n\nغير معروض: ${off.join("، ")}.`) : "") +
      (v.focus ? T(`\nFocus: ${v.focus}.`, `\nالتركيز: ${nm("ar", v.focus)}.`) : "") + (v.maxItems ? T(`\nLists: top ${v.maxItems}.`, `\nالقوائم: أعلى ${v.maxItems}.`) : "") +
      (v.added.length ? T(`\nAdded charts: ${v.added.map((c) => c.title).join(", ")}.`, `\nرسوم مضافة: ${v.added.map((c) => c.title).join("، ")}.`) : "") +
      (v.notes.length ? T(`\nNotes: ${v.notes.join(" · ")}`, `\nملاحظات: ${v.notes.join(" · ")}`) : "") +
      T("\n\nTell me what to change — e.g. “remove the invoices section”, “move risks to the top”, “only Andalus Quarter”, “add a chart of spend by channel”.", "\n\nأخبروني بما تريدون تغييره — مثل «احذف قسم الفواتير» أو «انقل المخاطر إلى الأعلى» أو «ركّز على حي الأندلس فقط»."));
  }
  if (p.kind === "undo") { const u = await undoLayout(L); return out(u.message + (u.ok ? tail.split("—")[0].replace(/\s+$/, ".") : "")); }
  const r = await applyReportOps(p.ops, L, ctx);
  const msg = r.done.length
    ? T(`**Daily report updated:** ${r.done.join("; ")}.`, `**تم تعديل التقرير اليومي:** ${r.done.join("؛ ")}.`) + (r.notes.length ? `\n${r.notes.join(" ")}` : "") + tail
    : (r.notes.join(" ") || T("Nothing to change.", "لا شيء لتغييره."));
  return out(msg);
}
