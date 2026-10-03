// Every page's dashboard, editable from the assistant's chat: each figure tile, chart and section has an id here, with
// its names in English and Arabic and the words people use for it. "Remove the YTD sales from all dashboards", "hide
// the budget plan on the director page", "show the alerts again", "reset the vendors page", "undo" — saved
// (ViewLayout "page:<id>"), logged with what it replaced (ViewLayoutChange view "pages"), undoable. Pages read it
// through /api/views and hide what is hidden. The Campaigns page's per-campaign dashboards have their own, richer
// editor (lib/campaign-layout.ts); the daily report too (lib/report-layout.ts).
import { prisma } from "./prisma";
import { type Lang, tx } from "./i18n";

type Bi = [string, string];
export type BlockDef = { id: string; name: Bi; rx: RegExp; kind: "kpi" | "chart" | "section" };
export type PageDef = { id: string; name: Bi; path: string; rx: RegExp; blocks: BlockDef[] };

const B = (id: string, en: string, ar: string, rx: RegExp, kind: BlockDef["kind"] = "section"): BlockDef => ({ id, name: [en, ar], rx, kind });
export const PAGES: PageDef[] = [
  { id: "director", name: ["Director", "المدير"], path: "/", rx: /\bdirector\b|home ?page|\bhome\b|main (page|dashboard)|المدير|الصفحة الرئيسية|الرئيسية/i, blocks: [
    B("brief", "Today's brief", "موجز اليوم", /today'?s brief|\bbrief\b|موجز/i),
    B("risks", "Risks", "المخاطر", /\brisks?\b|المخاطر/i),
    B("recommend", "This week I recommend", "أوصي هذا الأسبوع", /this week i recommend|weekly recommendations?|أوصي هذا الأسبوع/i),
    B("campaignRecs", "Campaign recommendations", "توصيات الحملات", /campaign recommendations?|توصيات الحملات/i),
    B("signals", "What the data shows today", "ما تُظهره البيانات اليوم", /what the data shows|signals?|findings|ما تظهره البيانات|الإشارات/i),
    B("kpi-ytd", "Sales year to date", "المبيعات منذ بداية العام", /\bytd\b|year.to.date|sales (this|so far this) year|منذ بداية العام/i, "kpi"),
    B("kpi-target", "Of target", "من المستهدف", /(% |percent |percentage )?of target|target (tile|%|percent)|من المستهدف/i, "kpi"),
    B("kpi-ash", "Ash Shati Residences tile", "بطاقة مساكن الشاطئ", /ash shati|الشاطئ/i, "kpi"),
    B("kpi-marina", "Marina Tower tile", "بطاقة برج المارينا", /marina|المارينا/i, "kpi"),
    B("kpi-andalus", "Andalus Quarter tile", "بطاقة حي الأندلس", /andalus|الأندلس/i, "kpi"),
    B("chart-sales", "Contracted sales vs target chart", "رسم المبيعات مقابل المستهدف", /sales (vs|versus|against) target|target chart|sales chart|monthly sales|المبيعات مقابل المستهدف/i, "chart"),
    B("inbox", "Waiting for your decision", "بانتظار قراركم", /waiting for (your|my) decision|\binbox\b|decisions? waiting|بانتظار قرار/i),
    B("plan", "Budget plan", "خطة الميزانية", /budget plan|the plan\b|خطة الميزانية/i),
    B("salesAgent", "Data from Kinan's sales agent", "بيانات وكيل المبيعات في كنان", /sales agent|kinan'?s (agent|data)|وكيل المبيعات/i),
    B("quality", "Campaign quality from the CRM", "جودة الحملات من النظام", /campaign quality|quality from the crm|جودة الحملات/i),
  ] },
  { id: "daily", name: ["Daily check", "الفحص اليومي"], path: "/daily", rx: /daily check|daily campaign check|الفحص اليومي/i, blocks: [
    B("kpi-recs", "Recommendations tile", "بطاقة التوصيات", /recommendations? (tile|count)|number of recommendations|عدد التوصيات/i, "kpi"),
    B("kpi-urgent", "Urgent tile", "بطاقة العاجل", /\burgent\b|عاجل/i, "kpi"),
    B("kpi-new", "New today tile", "بطاقة الجديد اليوم", /new today|جديدة اليوم/i, "kpi"),
    B("kpi-resolved", "Resolved since yesterday tile", "بطاقة المحلولة منذ الأمس", /resolved( since yesterday)? (tile|count)|المحلولة/i, "kpi"),
    B("kpi-decided", "Decided tile", "بطاقة المحسومة", /\bdecided\b|محسوم/i, "kpi"),
    B("second", "AI second opinion", "الرأي الثاني", /second opinion|الرأي الثاني/i),
    B("resolved", "Resolved since yesterday list", "قائمة المحلولة منذ الأمس", /resolved (list|items|section)|ما حُل/i),
  ] },
  { id: "ideas", name: ["Initiatives", "المبادرات"], path: "/ideas", rx: /initiatives?( page)?|ideas page|المبادرات/i, blocks: [
    B("signals", "What the data shows", "ما تُظهره البيانات", /what the data shows|signals?|findings|daily scan|ما تظهره البيانات|الإشارات/i),
    B("calendar", "Celebrations and moments", "المناسبات والمواسم", /celebrations?|calendar|moments|المناسبات|التقويم/i),
  ] },
  { id: "vendors", name: ["Vendors", "الموردون"], path: "/orchestration", rx: /vendors? page|vendors?( dashboard)?\b|orchestration page|صفحة الموردين|الموردين/i, blocks: [
    B("roles", "Who does what", "من يفعل ماذا", /who does what|roles|الأدوار/i),
    B("kpi-waiting", "Waiting for you tile", "بطاقة بانتظاركم", /waiting for (you|me)\b(?! decision)|بانتظاركم/i, "kpi"),
    B("kpi-with", "With vendors tile", "بطاقة لدى الموردين", /with vendors|لدى الموردين/i, "kpi"),
    B("kpi-late", "Late deliverables tile", "بطاقة التسليمات المتأخرة", /late deliverables|التسليمات المتأخرة/i, "kpi"),
    B("kpi-closed", "Closed tile", "بطاقة المغلقة", /\bclosed\b|المغلقة/i, "kpi"),
    B("kpi-minutes", "Minutes of your time tile", "بطاقة دقائق وقتكم", /minutes( of (your|my) time)?|الدقائق/i, "kpi"),
    B("approvals", "Waiting for your approval", "بانتظار اعتمادكم", /approvals?|waiting for (your|my) approval|الاعتماد/i),
    B("scoring", "Vendor scoring board", "لوحة تقييم الموردين", /scoring board|scoreboard|vendor scores?|لوحة تقييم/i, "chart"),
    B("scorecard", "Fair scorecard table", "جدول التقييم العادل", /scorecard|التقييم العادل|جدول التقييم/i),
    B("renewals", "Renewal recommendations", "توصيات التجديد", /renewals?|التجديد/i),
    B("qbr", "Quarterly business review", "المراجعة الربعية", /\bqbr\b|quarterly (business )?review|المراجعة الربعية/i),
    B("rfp", "Replacement RFP", "طلب العروض البديل", /\brfp\b|replacement brief|طلب العروض/i),
    B("rhythm", "Operating rhythm", "إيقاع التشغيل", /operating rhythm|what runs without you|إيقاع التشغيل/i),
    B("invoices", "Supplier invoices", "فواتير الموردين", /invoices?|الفواتير/i),
  ] },
  { id: "campaigns", name: ["Campaigns", "الحملات"], path: "/campaigns", rx: /campaigns? page|الحملات/i, blocks: [
    B("kpi-campaigns", "Campaigns count tile", "بطاقة عدد الحملات", /campaigns? (count|tile)|number of campaigns|عدد الحملات/i, "kpi"),
    B("kpi-spend", "Spend tile", "بطاقة الإنفاق", /\bspend\b|الإنفاق/i, "kpi"),
    B("kpi-qualified", "Qualified leads tile", "بطاقة العملاء المؤهلين", /qualified leads|العملاء المؤهل/i, "kpi"),
    B("kpi-contracts", "Contracts tile", "بطاقة العقود", /\bcontracts\b|العقود/i, "kpi"),
    B("kpi-cts", "Cost-to-sales tile", "بطاقة التكلفة إلى المبيعات", /cost.?to.?sales|التكلفة إلى المبيعات/i, "kpi"),
    B("orchestration", "Orchestration recommendations", "توصيات التنسيق", /orchestration|pause and shift|توصيات التنسيق/i),
    B("alerts", "Alerts", "التنبيهات", /\balerts?\b|التنبيهات/i),
    B("crm", "CRM verification", "التحقق من النظام", /crm verification|vendor.?reported vs crm|التحقق/i),
    B("audit", "Audit trail", "سجل التدقيق", /audit( trail)?|سجل التدقيق/i),
    B("meta", "Meta ads review", "مراجعة إعلانات ميتا", /\bmeta\b|facebook|instagram|ميتا/i),
  ] },
  { id: "reports", name: ["Reports", "التقارير"], path: "/reports", rx: /reports? page|reporting page|صفحة التقارير/i, blocks: [
    B("schedule", "Schedule", "الجدولة", /schedule|الجدولة/i),
    B("run", "Run and history", "التشغيل والسجل", /\brun\b|history of reports|report history|سجل التقارير/i),
    B("missed", "Questions the assistant missed", "الأسئلة التي فاتت المساعد", /missed questions|questions (the assistant )?missed|الأسئلة/i),
  ] },
  { id: "experiments", name: ["Experiments", "الاختبارات"], path: "/experiments", rx: /experiments?( page)?|incrementality|الاختبارات/i, blocks: [
    B("tests", "Tests", "الاختبارات", /\btests\b|holdout/i),
    B("design", "Design a new test", "تصميم اختبار", /design (a )?(new )?test|تصميم اختبار/i),
    B("mmm", "Media-mix model", "نموذج المزيج الإعلاني", /media.?mix|\bmmm\b|المزيج/i, "chart"),
  ] },
];
export const pageName = (id: string, l: Lang) => PAGES.find((p) => p.id === id)?.name[l === "ar" ? 1 : 0] ?? id;
export const blockName = (page: string, id: string, l: Lang) => PAGES.find((p) => p.id === page)?.blocks.find((b) => b.id === id)?.name[l === "ar" ? 1 : 0] ?? id;

// ------------------------------------------------------------------ storage
export type Layouts = Record<string, string[]>; // page -> hidden block ids
const KEY = (p: string) => `page:${p}`;
export async function getLayouts(): Promise<Layouts> {
  const rows = await prisma.viewLayout.findMany().catch(() => [] as any[]);
  const out: Layouts = {};
  for (const p of PAGES) {
    const r = rows.find((x: any) => x.id === KEY(p.id));
    try { const h = r ? JSON.parse(r.json).hidden : []; out[p.id] = (Array.isArray(h) ? h : []).filter((id: string) => p.blocks.some((b) => b.id === id)); } catch { out[p.id] = []; }
  }
  return out;
}
async function putLayouts(next: Layouts, by: string) {
  const rows = await prisma.viewLayout.findMany();
  for (const p of PAGES) {
    const data = { json: JSON.stringify({ hidden: next[p.id] ?? [] }), updatedBy: by, updatedAt: new Date() };
    if (rows.some((r: any) => r.id === KEY(p.id))) await prisma.viewLayout.update({ where: { id: KEY(p.id) }, data });
    else if ((next[p.id] ?? []).length) await prisma.viewLayout.create({ data: { id: KEY(p.id), ...data } });
  }
}

// ------------------------------------------------------------------ changes
export type ViewOp = { op: "hide" | "show"; page: string | "all"; block: string } | { op: "reset"; page: string | "all" };
/** Blocks a phrase names, on one page or all of them. */
export function findBlocks(text: string, page: string | "all"): { page: string; block: string }[] {
  const pages = page === "all" ? PAGES : PAGES.filter((p) => p.id === page);
  const hits: { page: string; block: string }[] = [];
  for (const p of pages) for (const b of p.blocks) if (b.rx.test(text) || text.toLowerCase().includes(b.name[0].toLowerCase()) || text.includes(b.name[1])) hits.push({ page: p.id, block: b.id });
  // On a single page, a tile and a section with the same words: prefer the more specific one (the longest name match).
  return hits;
}
export async function changeViews(ops: ViewOp[], lang: Lang, source = "chat") {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const before = await getLayouts();
  const next: Layouts = JSON.parse(JSON.stringify(before));
  const done: string[] = [], notes: string[] = [];
  for (const o of ops) {
    if (o.op === "reset") {
      const ps = o.page === "all" ? PAGES.map((p) => p.id) : [o.page];
      for (const p of ps) next[p] = [];
      done.push(o.page === "all" ? T("every dashboard back to standard", "كل اللوحات عادت إلى الوضع القياسي") : T(`${pageName(o.page, lang)} back to standard`, `${pageName(o.page, lang)} عادت إلى الوضع القياسي`));
      continue;
    }
    const targets = PAGES.some((p) => p.id === o.page) && PAGES.find((p) => p.id === o.page)!.blocks.some((b) => b.id === o.block) ? [{ page: o.page, block: o.block }] : findBlocks(o.block, o.page);
    if (!targets.length) { notes.push(T(`I couldn't find “${o.block}” on ${o.page === "all" ? "any dashboard" : pageName(o.page, lang)}.`, `لم أجد «${o.block}» في ${o.page === "all" ? "أي لوحة" : pageName(o.page, lang)}.`)); continue; }
    for (const t of targets) {
      const h = new Set(next[t.page] ?? []);
      if (o.op === "hide" ? h.has(t.block) : !h.has(t.block)) continue;
      o.op === "hide" ? h.add(t.block) : h.delete(t.block);
      next[t.page] = [...h];
      done.push(`${o.op === "hide" ? T("hid", "أُخفي") : T("showed", "أُظهر")} “${blockName(t.page, t.block, lang)}” (${pageName(t.page, lang)})`);
    }
  }
  if (done.length) {
    await putLayouts(next, source);
    await prisma.viewLayoutChange.create({ data: { view: "pages", summary: done.join(" · "), before: JSON.stringify(before), after: JSON.stringify(next), source, undone: false, createdAt: new Date() } });
  } else if (!notes.length) notes.push(T("Nothing to change — that's already how the dashboards look.", "لا شيء لتغييره — اللوحات هكذا بالفعل."));
  return { layouts: next, done, notes };
}
export async function undoViews(lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const last = (await prisma.viewLayoutChange.findMany()).filter((r: any) => r.view === "pages" && !r.undone).sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!last) return { ok: false, message: T("There is no dashboard change to undo.", "لا يوجد تعديل على اللوحات للتراجع عنه.") };
  await putLayouts(JSON.parse(last.before), "undo");
  await prisma.viewLayoutChange.update({ where: { id: last.id }, data: { undone: true } });
  return { ok: true, message: T(`Undone: ${last.summary}.`, `تم التراجع عن: ${last.summary}.`) };
}
/** What each dashboard hides (chat card, get_dashboards). */
export function viewsView(l: Layouts, lang: Lang) {
  return PAGES.map((p) => ({ page: p.id, name: p.name[lang === "ar" ? 1 : 0], path: p.path, blocks: p.blocks.map((b) => ({ id: b.id, name: b.name[lang === "ar" ? 1 : 0], kind: b.kind, hidden: (l[p.id] ?? []).includes(b.id) })) }));
}
export type ViewsView = ReturnType<typeof viewsView>;

// ------------------------------------------------------------------ reading a chat message
const RX_ALL = /\b(all|every|each) (the )?(dashboards?|pages?|screens?)\b|\beverywhere\b|across (the )?(app|dashboards|pages)|كل اللوحات|جميع اللوحات|كل الصفحات|في كل مكان/i;
const RX_DASH = /dashboards?|\bpage\b|\bscreen\b|\btile\b|\bwidget\b|\bsection\b|لوحة|اللوحات|صفحة|بطاقة|قسم/i;
const RX_HIDE = /\b(remove|hide|drop|delete|take (out|off)|get rid of|don'?t show|do not show|stop showing)\b|احذف|أزل|ازل|أخف|اخف|لا تعرض/i;
const RX_SHOW = /\b(show|bring back|restore|unhide|put back|add back|display)\b|أظهر|اظهر|أعد|اعرض/i;
export type ViewParsed = { kind: "edit"; ops: ViewOp[] } | { kind: "undo" } | { kind: "view"; page: string | "all" } | null;
/** Read a chat message as a change to the dashboards; null when it isn't one. */
export function parseViewEdit(text: string): ViewParsed {
  const q = text.trim(), lq = q.toLowerCase();
  if (/\breport\b|التقرير/.test(lq)) return null; // the daily report has its own editor
  if (/campaign (dashboards?|cards?)|each campaign|every campaign|per campaign|لوحات الحملات|كل حملة|لكل حملة/i.test(lq) && !RX_ALL.test(q)) return null; // per-campaign dashboards: lib/campaign-layout.ts
  const all = RX_ALL.test(q);
  const page = all ? "all" : PAGES.find((p) => p.rx.test(q) && new RegExp(`(on|from|in|to|من|في|على|إلى)\\s+(the\\s+)?(${p.rx.source})`, "i").test(q))?.id ?? null;
  if (!all && !page && !RX_DASH.test(q)) return null;
  if (/\b(undo|revert|roll ?back)\b|تراجع/.test(lq) && /dashboard|page|لوحة|اللوحات/.test(lq) && !/campaign dashboard/.test(lq)) return { kind: "undo" };
  if (/\breset\b|back to (the )?(default|standard)|الافتراضي|القياسي/.test(lq) && (all || page)) return page && page !== "campaigns" || all ? { kind: "edit", ops: [{ op: "reset", page: page ?? "all" }] } : null;
  if (/what('?s| is) (on|hidden on) (the )?(\w+ )?(dashboards?|page)|which (tiles|sections) are hidden|ما المخفي/.test(lq)) return { kind: "view", page: page ?? "all" };
  const hide = RX_HIDE.test(q), show = !hide && RX_SHOW.test(q);
  if (!hide && !show) return null;
  // The thing named: the message without the verb and the page words.
  const what = q.replace(RX_HIDE, " ").replace(RX_SHOW, " ").replace(RX_ALL, " ").replace(/\b(from|on|in|to|the|again|please|tile|section|chart|card|widget|dashboards?|pages?)\b/gi, " ").trim();
  const found = findBlocks(what, page ?? "all");
  // Nothing named on a single page: not a dashboard change (e.g. "show only live campaigns on the campaigns page").
  if (!found.length) return all && hide ? { kind: "edit", ops: [{ op: "hide", page: "all", block: what }] } : null;
  // Without "all" or a page, only act when the words name exactly one page's block(s).
  if (!all && !page && new Set(found.map((f) => f.page)).size > 1) return null;
  return { kind: "edit", ops: found.map((f) => ({ op: hide ? "hide" : "show", page: f.page, block: f.block })) };
}

// ------------------------------------------------------------------ API (also used by the demo)
export async function viewsState() { return { layouts: await getLayouts() }; }
export async function viewsAction(b: any) {
  const lang: Lang = b?.lang === "ar" ? "ar" : "en";
  if (b?.action === "UNDO") return { message: (await undoViews(lang)).message, layouts: await getLayouts() };
  if (b?.action === "SHOW" || b?.action === "HIDE") { const r = await changeViews([{ op: b.action === "HIDE" ? "hide" : "show", page: String(b.page), block: String(b.block) }], lang, "page"); return { message: r.done.join("; ") || r.notes.join(" "), layouts: r.layouts }; }
  if (b?.action === "RESET") { const r = await changeViews([{ op: "reset", page: b.page ? String(b.page) : "all" }], lang, "page"); return { message: r.done.join("; "), layouts: r.layouts }; }
  throw new Error("Unknown action.");
}
