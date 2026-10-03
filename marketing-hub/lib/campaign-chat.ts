// Changing the Campaigns page's dashboards from the assistant's chat ("add cost per qualified lead to the campaign
// dashboards", "sort campaigns by cost to sales", "show only 2024 campaigns", "add a chart of leads by city to each
// campaign"). Read by lib/campaign-layout.ts (English or Arabic); saved, logged, shown back as a card with undo. The
// AI chat reaches the same functions through its change_campaign_dashboards tool.
import { type Lang, tx, looksArabic } from "./i18n";
import { parseCampaignEdit, changeCampaignLayout, undoCampaignLayout, getCampaignLayout, campaignLayoutView, campaignLayoutHelp, type Op } from "./campaign-layout";
import { campaignChartFromText } from "./campaign-boards";
import { resolve } from "./query";
import type { ChatContext, ChatReply } from "./chat";

/** Projects, vendors and channels named in a message (English keys, as the campaign rows store them). */
function finder(c: ChatContext) {
  return (s: string) => {
    const e = resolve(s, c.q);
    const p = e.find((x) => x.kind === "project"), v = e.find((x) => x.kind === "vendor"), ch = e.find((x) => x.kind === "channel");
    return { project: p?.name, vendor: v?.name, channel: ch && "family" in ch ? ch.family : undefined };
  };
}

export async function applyCampaignOps(ops: Op[], lang: Lang, source = "chat") {
  return changeCampaignLayout(ops, lang, { source, check: (p) => campaignChartFromText(p, lang) });
}

/** The chat answer for a campaign-dashboard change, or null when the message isn't about the Campaigns page. */
export async function campaignEditAnswer(question: string, uiLang: Lang, ctx: () => Promise<ChatContext>, opts: { allowUnclear?: boolean } = {}): Promise<ChatReply | null> {
  if (!parseCampaignEdit(question, () => ({}))) return null; // cheap check before building the data context
  const c = await ctx();
  const p = parseCampaignEdit(question, finder(c));
  if (!p) return null;
  if (p.kind === "unclear" && !opts.allowUnclear) return null;
  const L: Lang = looksArabic(question) ? "ar" : /[A-Za-z]{3,}/.test(question) ? "en" : uiLang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const suggest = [T("What's on the campaign dashboards?", "ما الذي تعرضه لوحات الحملات؟"), T("Undo the last campaign dashboard change", "تراجع عن آخر تعديل على لوحات الحملات"), T("Sort campaigns by cost to sales", "رتّب الحملات حسب التكلفة إلى المبيعات")];
  const out = async (reply: string): Promise<ChatReply> => ({ reply, cards: [{ kind: "campaigns", view: campaignLayoutView(await getCampaignLayout(), L) }], engine: "rules", suggest });
  const tail = T("\n\nOpen **Campaigns** to see it. Say “undo” to revert.", "\n\nافتحوا **الحملات** لرؤيته. قولوا «تراجع» للعودة.");

  if (p.kind === "unclear") return out(T("I can change the campaign dashboards, but I couldn't tell what to change.\n\n", "يمكنني تعديل لوحات الحملات، لكن لم أتبيّن ما المطلوب.\n\n") + campaignLayoutHelp(L));
  if (p.kind === "view") {
    const v = campaignLayoutView(await getCampaignLayout(), L);
    const filters = v.filters;
    return out(T(`**Campaigns page:** ${v.scopeLabel}${filters.length ? ` · ${filters.join(", ")}` : ""}, ${v.sortLabel}.\n`, `**صفحة الحملات:** ${v.scopeLabel}${filters.length ? ` · ${filters.join("، ")}` : ""}، ${v.sortLabel}.\n`) +
      T(`**Figures on each campaign:** ${v.kpis.map((k) => k.name).join(", ")}.\n**Charts in each dashboard:** ${[...v.charts.map((x) => x.name), ...v.custom.map((x) => `+ ${x.title}`)].join(", ") || "none"}.`,
        `**الأرقام في كل حملة:** ${v.kpis.map((k) => k.name).join("، ")}.\n**الرسوم في كل لوحة:** ${[...v.charts.map((x) => x.name), ...v.custom.map((x) => `+ ${x.title}`)].join("، ") || "لا شيء"}.`) +
      T("\n\nTell me what to change — e.g. “add cost per qualified lead”, “remove the funnel”, “add a chart of leads by city to each campaign”, “only live campaigns”.", "\n\nأخبروني بما تريدون تغييره — مثل «أضف تكلفة العميل المؤهل» أو «أزل مسار العميل» أو «اعرض الحملات الحالية فقط»."));
  }
  if (p.kind === "undo") { const u = await undoCampaignLayout(L); return out(u.message); }
  const r = await applyCampaignOps(p.ops, L);
  return out(r.done.length
    ? T(`**Campaign dashboards updated:** ${r.done.join("; ")}.`, `**تم تعديل لوحات الحملات:** ${r.done.join("؛ ")}.`) + (r.notes.length ? `\n${r.notes.join(" ")}` : "") + tail
    : r.notes.join(" ") || T("Nothing to change.", "لا شيء لتغييره."));
}
