// The daily report's layout, changed from the assistant's chat ("remove the invoices section", "move risks to the top",
// "only Andalus Quarter", "top 3 items", "add a pie chart of spend by channel", "add a note: …", "undo").
// Stored once (id "daily") and applied by lib/reports.ts to the e-mail, the in-app view and the ▶ Play deck, from the
// next report on. Every change is logged with what it replaced, so it can be undone.
// The layout only shapes what the report shows: numbers still come from the data, and nothing here sends or approves.
import { prisma } from "./prisma";
import { type Lang, tx } from "./i18n";

export const SECTIONS = ["brief", "sales", "glance", "since", "campaigns", "initiatives", "decisions", "vendors", "risks", "invoices"] as const;
export type SectionId = (typeof SECTIONS)[number];
export const CHARTS = ["monthly", "vendors", "channels"] as const;
export type ChartId = (typeof CHARTS)[number];

export type CustomChart = { id: string; prompt: string; title: string; query?: unknown };
export type Layout = {
  hidden: SectionId[]; order: SectionId[]; hiddenCharts: ChartId[];
  maxItems: number | null; focus: string | null;
  notes: { text: string; at: string }[]; charts: CustomChart[];
};
export const DEFAULT_LAYOUT: Layout = { hidden: [], order: [...SECTIONS], hiddenCharts: [], maxItems: null, focus: null, notes: [], charts: [] };

export type Op =
  | { op: "hide" | "show"; section: SectionId }
  | { op: "hide_chart" | "show_chart"; chart: ChartId }
  | { op: "move"; section: SectionId; to: "top" | "bottom" | "before" | "after"; ref?: SectionId }
  | { op: "limit"; n: number | null }
  | { op: "focus"; project: string | null }
  | { op: "add_note"; text: string }
  | { op: "clear_notes" }
  | { op: "add_chart"; prompt: string }
  | { op: "remove_chart"; which: string }
  | { op: "reset" };

const SECTION_NAME: Record<SectionId, [string, string]> = {
  brief: ["Today's brief", "موجز اليوم"], sales: ["Sales vs target", "المبيعات مقابل المستهدف"], glance: ["Charts (at a glance)", "الرسوم (نظرة سريعة)"],
  since: ["Since the last report", "منذ التقرير السابق"], campaigns: ["Campaign recommendations", "توصيات الحملات"],
  initiatives: ["What the data shows & market initiatives", "ما تُظهره البيانات ومبادرات السوق"], decisions: ["Waiting for your decision", "بانتظار قراركم"],
  vendors: ["Vendors", "الموردون"], risks: ["Risks", "المخاطر"], invoices: ["Supplier invoices", "فواتير الموردين"],
};
const CHART_NAME: Record<ChartId, [string, string]> = {
  monthly: ["Sales by month", "المبيعات حسب الشهر"], vendors: ["Revenue by vendor", "الإيرادات حسب المورد"], channels: ["Cost to sales by channel", "نسبة التكلفة إلى المبيعات حسب القناة"],
};
export const sectionName = (id: SectionId, l: Lang) => SECTION_NAME[id][l === "ar" ? 1 : 0];
export const chartName = (id: ChartId, l: Lang) => CHART_NAME[id][l === "ar" ? 1 : 0];

// ------------------------------------------------------------------ storage
const clean = (x: any): Layout => {
  const l = { ...DEFAULT_LAYOUT, ...(x && typeof x === "object" ? x : {}) } as Layout;
  const order = (Array.isArray(l.order) ? l.order : []).filter((s): s is SectionId => (SECTIONS as readonly string[]).includes(s));
  return {
    hidden: [...new Set((l.hidden ?? []).filter((s) => (SECTIONS as readonly string[]).includes(s) && s !== "brief"))],
    order: ["brief", ...[...new Set([...order, ...SECTIONS])].filter((s) => s !== "brief")] as SectionId[],
    hiddenCharts: [...new Set((l.hiddenCharts ?? []).filter((c) => (CHARTS as readonly string[]).includes(c)))],
    maxItems: typeof l.maxItems === "number" && l.maxItems >= 1 ? Math.min(10, Math.round(l.maxItems)) : null,
    focus: typeof l.focus === "string" && l.focus.trim() ? l.focus : null,
    notes: (l.notes ?? []).filter((n) => n && typeof n.text === "string").slice(-5),
    charts: (l.charts ?? []).filter((c) => c && typeof c.prompt === "string").slice(-4),
  };
};

export async function getLayout(): Promise<Layout> {
  try {
    const row = (await prisma.reportLayout.findMany()).find((x: any) => x.id === "daily");
    return clean(row ? JSON.parse(row.json) : null);
  } catch { return clean(null); }
}
async function putLayout(next: Layout, by: string) {
  const rows = await prisma.reportLayout.findMany();
  const data = { json: JSON.stringify(next), updatedBy: by, updatedAt: new Date() };
  if (rows.some((x: any) => x.id === "daily")) await prisma.reportLayout.update({ where: { id: "daily" }, data });
  else await prisma.reportLayout.create({ data: { id: "daily", ...data } });
}
export async function layoutHistory(n = 10) {
  const rows = await prisma.reportLayoutChange.findMany();
  return rows.sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, n)
    .map((r: any) => ({ id: r.id, at: new Date(r.createdAt).toISOString(), summary: r.summary, by: r.by ?? null, source: r.source, undone: !!r.undone }));
}

/** Apply changes and save them (with what they replaced, for undo). */
export async function changeLayout(ops: Op[], lang: Lang, opts: { by?: string; source?: string; validateChart?: (prompt: string) => { title: string; query?: unknown } | { error: string } } = {}) {
  const before = await getLayout();
  const r = applyOps(before, ops, lang, opts.validateChart);
  if (r.done.length) {
    await putLayout(r.layout, opts.by ?? "chat");
    await prisma.reportLayoutChange.create({ data: { summary: r.done.join(" · "), before: JSON.stringify(before), after: JSON.stringify(r.layout), source: opts.source ?? "chat", by: opts.by ?? null, undone: false, createdAt: new Date() } });
  }
  return { ...r, before };
}

/** Undo the latest change that is still in effect. */
export async function undoLayout(lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const rows = (await prisma.reportLayoutChange.findMany()).filter((x: any) => !x.undone && x.source !== "undo")
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const last = rows[0];
  if (!last) return { ok: false, message: T("There is no report change to undo.", "لا يوجد تعديل على التقرير للتراجع عنه."), layout: await getLayout() };
  const layout = clean(JSON.parse(last.before));
  await putLayout(layout, "undo");
  await prisma.reportLayoutChange.update({ where: { id: last.id }, data: { undone: true } });
  return { ok: true, message: T(`Undone: ${last.summary}.`, `تم التراجع عن: ${last.summary}.`), layout };
}

// ------------------------------------------------------------------ applying changes
export function applyOps(start: Layout, ops: Op[], lang: Lang, validateChart?: (prompt: string) => { title: string; query?: unknown } | { error: string }) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const l: Layout = JSON.parse(JSON.stringify(clean(start)));
  const done: string[] = [], notes: string[] = [];
  const S = (id: SectionId) => `“${sectionName(id, lang)}”`;
  for (const o of ops) {
    switch (o.op) {
      case "hide":
        if (o.section === "brief") { notes.push(T("The brief stays — it is the report's headline.", "يبقى الموجز — فهو عنوان التقرير.")); break; }
        if (l.hidden.includes(o.section)) { notes.push(T(`${S(o.section)} is already hidden.`, `${S(o.section)} مخفي بالفعل.`)); break; }
        l.hidden.push(o.section); done.push(T(`removed ${S(o.section)}`, `أُزيل ${S(o.section)}`)); break;
      case "show":
        if (!l.hidden.includes(o.section)) { notes.push(T(`${S(o.section)} is already in the report.`, `${S(o.section)} موجود في التقرير بالفعل.`)); break; }
        l.hidden = l.hidden.filter((x) => x !== o.section); done.push(T(`added back ${S(o.section)}`, `أُعيد ${S(o.section)}`)); break;
      case "hide_chart": case "show_chart": {
        const name = `“${chartName(o.chart, lang)}”`, hide = o.op === "hide_chart";
        if (hide === l.hiddenCharts.includes(o.chart)) { notes.push(hide ? T(`The ${name} chart is already hidden.`, `رسم ${name} مخفي بالفعل.`) : T(`The ${name} chart is already in the report.`, `رسم ${name} موجود بالفعل.`)); break; }
        l.hiddenCharts = hide ? [...l.hiddenCharts, o.chart] : l.hiddenCharts.filter((x) => x !== o.chart);
        if (!hide && l.hidden.includes("glance")) l.hidden = l.hidden.filter((x) => x !== "glance");
        done.push(hide ? T(`removed the ${name} chart`, `أُزيل رسم ${name}`) : T(`added back the ${name} chart`, `أُعيد رسم ${name}`)); break;
      }
      case "move": {
        if (o.section === "brief") { notes.push(T("The brief always opens the report.", "الموجز يفتتح التقرير دائماً.")); break; }
        const rest = l.order.filter((x) => x !== o.section);
        let at = o.to === "top" ? 1 : o.to === "bottom" ? rest.length : -1;
        if (o.to === "before" || o.to === "after") {
          const k = o.ref ? rest.indexOf(o.ref) : -1;
          if (k < 0) { notes.push(T("I couldn't tell where to move it.", "لم أتبيّن إلى أين أنقله.")); break; }
          at = Math.max(1, o.to === "before" ? k : k + 1);
        }
        rest.splice(at, 0, o.section); l.order = rest;
        if (l.hidden.includes(o.section)) l.hidden = l.hidden.filter((x) => x !== o.section);
        done.push(o.to === "top" ? T(`moved ${S(o.section)} to the top (after the brief)`, `نُقل ${S(o.section)} إلى الأعلى (بعد الموجز)`)
          : o.to === "bottom" ? T(`moved ${S(o.section)} to the end`, `نُقل ${S(o.section)} إلى النهاية`)
          : T(`moved ${S(o.section)} ${o.to} ${S(o.ref!)}`, `نُقل ${S(o.section)} ${o.to === "before" ? "قبل" : "بعد"} ${S(o.ref!)}`)); break;
      }
      case "limit":
        if (o.n === l.maxItems) { notes.push(T("That is already the length.", "هذا هو الطول الحالي بالفعل.")); break; }
        l.maxItems = o.n == null ? null : Math.max(1, Math.min(10, Math.round(o.n)));
        done.push(l.maxItems == null ? T("lists show every item again", "تعرض القوائم كل البنود مجدداً") : T(`lists show at most ${l.maxItems} item${l.maxItems === 1 ? "" : "s"}`, `تعرض القوائم ${l.maxItems} بنود كحد أقصى`)); break;
      case "focus":
        if (o.project === l.focus) { notes.push(T("That focus is already set.", "هذا التركيز مضبوط بالفعل.")); break; }
        l.focus = o.project;
        done.push(o.project ? T(`focus on ${o.project} (sales, campaigns, findings, initiatives and risks)`, `التركيز على ${o.project} (المبيعات والحملات والملاحظات والمبادرات والمخاطر)`) : T("all projects again", "كل المشاريع مجدداً")); break;
      case "add_note": {
        const text = o.text.replace(/\s+/g, " ").trim().slice(0, 300);
        if (!text) { notes.push(T("What should the note say?", "ماذا تقول الملاحظة؟")); break; }
        l.notes = [...l.notes, { text, at: new Date().toISOString() }].slice(-5); done.push(T(`added the note “${text}”`, `أُضيفت الملاحظة «${text}»`)); break;
      }
      case "clear_notes":
        if (!l.notes.length) { notes.push(T("There are no notes.", "لا توجد ملاحظات.")); break; }
        l.notes = []; done.push(T("removed the notes", "أُزيلت الملاحظات")); break;
      case "add_chart": {
        if (l.charts.length >= 4) { notes.push(T("The report holds up to 4 added charts — remove one first.", "يتسع التقرير لأربعة رسوم مضافة — أزيلوا واحداً أولاً.")); break; }
        const v = validateChart ? validateChart(o.prompt) : { title: o.prompt };
        if ("error" in v) { notes.push(T(`I couldn't draw that chart: ${v.error}`, `تعذّر رسم ذلك: ${v.error}`)); break; }
        const id = `c${Date.now().toString(36)}${l.charts.length}`;
        l.charts = [...l.charts, { id, prompt: o.prompt, title: v.title, ...(v.query ? { query: v.query } : {}) }];
        if (l.hidden.includes("glance")) l.hidden = l.hidden.filter((x) => x !== "glance");
        done.push(T(`added the chart “${v.title}”`, `أُضيف رسم «${v.title}»`)); break;
      }
      case "remove_chart": {
        const w = o.which.toLowerCase().trim();
        const hit = w === "all" ? l.charts : w === "last" ? l.charts.slice(-1) : l.charts.filter((c) => c.id === o.which || c.title.toLowerCase().includes(w) || c.prompt.toLowerCase().includes(w));
        if (!hit.length) { notes.push(T("No added chart matches that.", "لا يوجد رسم مضاف يطابق ذلك.")); break; }
        l.charts = l.charts.filter((c) => !hit.includes(c));
        done.push(T(`removed the chart${hit.length > 1 ? "s" : ""} ${hit.map((c) => `“${c.title}”`).join(", ")}`, `أُزيل ${hit.map((c) => `«${c.title}»`).join("، ")}`)); break;
      }
      case "reset":
        Object.assign(l, JSON.parse(JSON.stringify(DEFAULT_LAYOUT))); done.push(T("back to the standard report", "عاد التقرير إلى شكله القياسي")); break;
    }
  }
  return { layout: clean(l), done, notes };
}

/** What the report will contain, for the chat card and the Reports page. */
export function layoutView(l: Layout, lang: Lang) {
  return {
    sections: l.order.map((id) => ({ id, name: sectionName(id, lang), on: !l.hidden.includes(id) })),
    charts: CHARTS.map((id) => ({ id, name: chartName(id, lang), on: !l.hiddenCharts.includes(id) })),
    added: l.charts.map((c) => ({ id: c.id, title: c.title })),
    maxItems: l.maxItems, focus: l.focus, notes: l.notes.map((n) => n.text),
    custom: JSON.stringify(clean(l)) !== JSON.stringify(DEFAULT_LAYOUT),
  };
}
export type LayoutView = ReturnType<typeof layoutView>;

/** Does a line of text mention the focus project (English name, first word, or Arabic name)? */
export function mentions(text: string, focus: string, ar?: string) {
  const s = String(text ?? "").toLowerCase(), f = focus.toLowerCase();
  const first = f.replace(/^(al |ash |the )/, "").split(/\s+/)[0];
  return s.includes(f) || (first.length >= 4 && s.includes(first)) || (!!ar && String(text).includes(ar));
}

// ------------------------------------------------------------------ reading a chat message
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, "واحد": 1, "اثنين": 2, "ثلاثة": 3, "ثلاث": 3, "أربعة": 4, "خمسة": 5, "ستة": 6, "عشرة": 10 };
const RX_REPORT = /\b(daily |morning |today'?s |the |my |this |next )?reports?\b|التقرير|تقرير/i;
const RX_HIDE = /\b(remove|hide|drop|delete|take (out|off)|exclude|skip|get rid of|cut|don'?t (show|include)|do not (show|include)|stop (showing|including)|no longer (show|include)|without|omit)\b|احذف|احذفوا|أزل|ازل|أزيلوا|أخف|اخف|أخفوا|بدون|لا تعرض|لا تضمّن|ألغ|الغ/i;
const RX_SHOW = /\b(add|include|show|bring back|put back|restore|re-?add|re-?enable|unhide|re-?include|also (show|include)|put)\b|أضف|اضف|أضيفوا|أعد|اعد|أظهر|اظهر|اعرض|ضمّن|ضمن/i;
const RX_MOVE = /\b(move|reorder|start with|lead with|open with|begin with|end with|finish with|close with|put .+ (first|last|at the (top|start|end|bottom)))\b|انقل|انقلوا|ابدأ ب|ابدأوا ب|اختم ب/i;
const RX_CHARTWORD = /\b(chart|graph|plot|pie|donut|doughnut|bar chart|line chart|histogram|breakdown|trend line)\b|رسم|مخطط/i;

const SECTION_RX: [SectionId, RegExp][] = [
  ["since", /since (the )?(last|previous) report|what changed|changes section|the changes|التغييرات|منذ التقرير السابق/i],
  ["sales", /sales (vs\.?|versus|against|to) targets?|targets? section|\btargets?\b|gauges?|المبيعات مقابل المستهدف|المستهدف/i],
  ["campaigns", /campaign recommendations?|campaign recs|recommendations|campaign changes|\bcampaigns?\b|توصيات الحملات|التوصيات|الحملات/i],
  ["initiatives", /initiatives?|\bideas\b|what the data shows|findings|daily scan|\bscan\b|signals|anomal|المبادرات|مبادرات|الأفكار|ما ت[ُ]?ظهره البيانات|الفحص|الملاحظات المكتشفة/i],
  ["decisions", /decisions?|waiting for (your|my) (decision|approval)|approvals?|\binbox\b|القرارات|قراركم|قراري|الاعتمادات/i],
  ["vendors", /\bvendors?\b|suppliers? section|work orders?|الموردين|الموردون|أوامر العمل/i],
  ["risks", /\brisks?\b|المخاطر/i],
  ["invoices", /invoices?|payments?|الفواتير|المدفوعات/i],
  ["glance", /at a glance|all (the )?charts|charts section|the charts|\bgraphs\b|نظرة سريعة|الرسوم البيانية|الرسوم/i],
  ["brief", /\bbrief\b|summary|headline|الموجز|موجز|الملخص/i],
];
const CHART_RX: [ChartId, RegExp][] = [
  ["monthly", /sales by month|monthly sales|monthly chart|month(ly)? (bar|column)s?|المبيعات حسب الشهر|المبيعات الشهرية/i],
  ["vendors", /revenue by vendor|vendor revenue|revenue share|vendor (share|donut|pie)|الإيرادات حسب المورد/i],
  ["channels", /cost[- ]to[- ]sales( by channel)?( chart)?|channel (chart|efficiency)|نسبة التكلفة إلى المبيعات|التكلفة إلى المبيعات/i],
];

export type Parsed =
  | { kind: "edit"; ops: Op[] }
  | { kind: "undo" } | { kind: "view" } | { kind: "unclear" };

/** Read a chat message as a change to the daily report. Null when it isn't one (the rest of the chat handles it). */
export function parseReportEdit(text: string, projects: { name: string; ar?: string }[] = []): Parsed | null {
  const raw = text.trim(), q = raw.toLowerCase();
  if (!RX_REPORT.test(q)) return null;
  if (/vendor reports?|reported (leads|numbers)|report(ed)? by/i.test(q) && !/daily report|the report'?s/.test(q)) return null;
  // Questions about sending or the schedule belong to the schedule answer, not to the layout.
  if (/\b(send|email|e-mail|mail) (me |it |the |today'?s )|schedule|what time|when (is|does)|recipients?|أرسل|جدول|متى/i.test(q) && !RX_HIDE.test(q) && !RX_MOVE.test(q)) return null;
  if (/\b(undo|revert|roll ?back)\b|تراجع|التراجع/.test(q)) return { kind: "undo" };
  if (/\breset\b|back to (the )?(default|standard|original)|restore (the )?(default|standard|original)|default layout|standard report|الافتراضي|إعادة ضبط|الشكل القياسي/.test(q)) return { kind: "edit", ops: [{ op: "reset" }] };
  if (/what('?s| is| goes) in (the |my |today'?s )?(daily )?report|report (layout|settings|sections|structure|format)|sections (of|in) the report|how is the report (set up|organi[sz]ed|structured)|أقسام التقرير|محتوى التقرير|ماذا يتضمن التقرير|ما الذي يتضمنه التقرير|شكل التقرير/.test(q)) return { kind: "view" };

  const ops: Op[] = [];
  let rest = raw;
  // Notes: "add a note to the report: …" — the note runs to the end of the message (commas and all), the rest of the
  // message can still carry other changes ("move risks to the top, then add a note: …").
  if (/\bnotes?\b|ملاحظة|ملاحظات/i.test(q) && !/findings/.test(q)) {
    const m = raw.match(/((?:,|;|،)?\s*(?:then\s+|and\s+|ثم\s+|و)?(?:please\s+)?(?:add|put|include|write|أضف|اضف|ضع|اكتب)?\s*(?:a |an |this |the )?(?:note|ملاحظة)(?![A-Za-z])[^:："“«]*?)(?:[:：]\s*|\s+(?:saying|that says|reading|تقول|مفادها)\s+)(.+)$/i);
    const quoted = raw.match(/(?:note|ملاحظة)[^"“«]*["“«]([^"”»]{2,})["”»]/i);
    if (RX_HIDE.test(q) && !m && !quoted || /\b(clear|remove|delete) (all )?(the )?notes?\b|امسح الملاحظات|احذف الملاحظات/i.test(q)) ops.push({ op: "clear_notes" });
    else {
      const t = (quoted?.[1] ?? m?.[2] ?? "").replace(/\s*(to|in|on) (the |my |today'?s )?(daily )?report\.?$/i, "").trim();
      ops.push({ op: "add_note", text: t });
    }
    rest = m ? raw.slice(0, m.index) : quoted ? "" : "";
    if (!rest.trim() || !RX_REPORT.test(rest) && !SECTION_RX.some(([, rx]) => rx.test(rest))) return { kind: "edit", ops };
  }
  // Clauses: "remove vendors and invoices, then move risks to the top".
  const clauses = rest.split(/\s*(?:[;,]|\bthen\b|\band also\b|\band\b(?=\s+(?:add|remove|move|show|hide|put|bring|include|drop|limit|focus|keep|only|make|start|end|lead))|،|\s+ثم\s+|\s+و(?=(?:أضف|احذف|انقل|أزل|أخف|اعرض|أظهر|ركز|ركّز)))\s*/i).filter(Boolean);
  let verb: "hide" | "show" | "move" | null = null;
  for (const cl of clauses) {
    const c = cl.toLowerCase();
    const hide = RX_HIDE.test(c), move = RX_MOVE.test(c) || /\b(to the (top|bottom|end|start)|first|last|before|after|at the (top|start|end|bottom))\b|إلى (الأعلى|البداية|النهاية|الأسفل)|في (البداية|النهاية)|قبل|بعد/.test(c) && !RX_SHOW.test(c.replace(/\bput\b/, "")) && !hide;
    const show = RX_SHOW.test(c) && !hide && !move;
    if (hide) verb = "hide"; else if (move) verb = "move"; else if (show) verb = "show";
    // Length: "top 3", "at most 5 items", "shorter", "full detail".
    const nm = c.match(/\b(?:top|at most|max(?:imum)?|no more than|limit(?: it| each list| lists| the lists)? to|only|just|keep(?: only)?|show only)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b(?!\s*(?:am|pm|:))/) ?? c.match(/(?:أعلى|أهم|فقط|أقصى|حد أقصى)\s*(\d{1,2}|واحد|اثنين|ثلاثة|ثلاث|أربعة|خمسة|ستة|عشرة)/) ?? c.match(/(\d{1,2})\s*(?:items|bullets|recommendations|per (?:section|list)|بنود|عناصر)/);
    if (nm) { const n = /^\d+$/.test(nm[1]) ? Number(nm[1]) : NUM[nm[1]]; if (n >= 1 && n <= 10) { ops.push({ op: "limit", n }); continue; } }
    if (/\b(shorter|more concise|concise|briefer|trim it|less detail|tighter|compact)\b|أقصر|مختصر|أوجز|اختصر/.test(c)) { ops.push({ op: "limit", n: 3 }); continue; }
    if (/\b(longer|more detail|in full|full detail|every item|all items|all the items|no limit)\b|أطول|مفصّل|مفصل|كل البنود/.test(c)) { ops.push({ op: "limit", n: null }); continue; }
    // Focus: "only Andalus Quarter", "focus on Marina Tower", "all projects again".
    if (/\ball projects\b|every project|remove the focus|stop focusing|no focus|كل المشاريع|جميع المشاريع|ألغ التركيز/.test(c)) { ops.push({ op: "focus", project: null }); continue; }
    const proj = projects.find((p) => mentions(cl, p.name, p.ar));
    if (proj && (/\b(focus|only|just|concentrate|about)\b|ركز|ركّز|فقط|خاص/.test(c))) { ops.push({ op: "focus", project: proj.name }); continue; }
    // Built-in charts before sections ("remove the revenue by vendor chart" is not the Vendors section).
    const ch = CHART_RX.find(([, rx]) => rx.test(c));
    if (ch && verb !== "move") { ops.push({ op: verb === "show" ? "show_chart" : "hide_chart", chart: ch[0] }); continue; }
    // A new chart: "add a pie chart of spend by channel".
    if (RX_CHARTWORD.test(c) && verb !== "hide" && verb !== "move") {
      const prompt = cl.replace(/\b(please|can you|could you|also)\b/gi, "").replace(/\b(to|in|into|on) (the |my |today'?s )?(daily |morning )?report\b.*$/i, "").replace(/(إلى|في) التقرير.*$/, "")
        .replace(/^\s*(add|include|put|show|insert|أضف|اضف|ضمّن|اعرض)\s+/i, "").trim();
      ops.push({ op: "add_chart", prompt }); continue;
    }
    if (RX_CHARTWORD.test(c) && verb === "hide" && /\b(added|custom|new|my|last|that|those|these)\b|المضاف|الأخير/.test(c)) {
      ops.push({ op: "remove_chart", which: /\b(all|every|those|these)\b|كل/.test(c) ? "all" : "last" }); continue;
    }
    // Sections (several per clause are fine: "remove vendors and invoices").
    const hits = SECTION_RX.filter(([, rx]) => rx.test(cl)).map(([id]) => id);
    if (verb === "move" && hits.length) {
      const target = hits[0];
      const pos = /\b(before)\b|قبل/.exec(c) ? "before" : /\b(after)\b|بعد/.exec(c) ? "after"
        : /\b(end|bottom|last|finish|close)\b|النهاية|الأسفل|اختم/.test(c) ? "bottom" : "top";
      let ref: SectionId | undefined;
      if (pos === "before" || pos === "after") {
        const m = c.split(/\bbefore\b|\bafter\b|قبل|بعد/)[1] ?? "";
        ref = SECTION_RX.find(([, rx]) => rx.test(m))?.[0];
        const first = SECTION_RX.find(([id, rx]) => id !== ref && rx.test(c.split(/\bbefore\b|\bafter\b|قبل|بعد/)[0]))?.[0];
        ops.push({ op: "move", section: first ?? target, to: pos, ref }); continue;
      }
      ops.push({ op: "move", section: target, to: pos }); continue;
    }
    if (verb && verb !== "move") for (const id of hits) ops.push({ op: verb, section: id });
  }
  if (ops.length) return { kind: "edit", ops };
  // It talks about the report and asks for a change, but nothing could be read.
  if (RX_HIDE.test(q) || RX_MOVE.test(q) || /\b(change|edit|modify|adjust|update|tweak|customi[sz]e)\b.*report|report.*\b(change|edit|modify|adjust|customi[sz]e)\b|عدّل|عدل|غيّر|غير/.test(q)) return { kind: "unclear" };
  return null;
}

/** Help text: what can be changed. */
export const layoutHelp = (l: Lang) => tx(l,
  "You can change the daily report from here, for example:\n- \"remove the invoices section from the report\" / \"add the risks back\"\n- \"move risks to the top of the report\" / \"put vendors after decisions\"\n- \"only show Andalus Quarter in the report\" / \"all projects again\"\n- \"keep the report to the top 3 items\" / \"make the report shorter\"\n- \"add a pie chart of spend by channel to the report\" / \"remove the revenue by vendor chart\"\n- \"add a note to the report: Ramadan budget freeze starts Sunday\"\n- \"what's in the daily report?\", \"undo the last report change\", \"reset the report\"",
  "يمكنكم تعديل التقرير اليومي من هنا، مثلاً:\n- «احذف قسم الفواتير من التقرير» / «أعد المخاطر إلى التقرير»\n- «انقل المخاطر إلى أعلى التقرير»\n- «ركّز التقرير على حي الأندلس فقط» / «كل المشاريع مجدداً»\n- «اجعل التقرير أقصر» / «أعلى 3 بنود في التقرير»\n- «أضف رسماً دائرياً للإنفاق حسب القناة إلى التقرير»\n- «أضف ملاحظة إلى التقرير: …»\n- «ما أقسام التقرير؟»، «تراجع عن آخر تعديل على التقرير»، «أعد ضبط التقرير إلى الافتراضي»");

// ------------------------------------------------------------------ Reports page API (also used by the static demo)
export async function layoutState(lang: Lang, message?: string) {
  return { view: layoutView(await getLayout(), lang), history: await layoutHistory(12), ...(message ? { message } : {}) };
}
export async function layoutAction(b: any) {
  const lang: Lang = b?.lang === "ar" ? "ar" : "en";
  if (b?.action === "UNDO") { const u = await undoLayout(lang); return layoutState(lang, u.message); }
  if (b?.action === "RESET") { const r = await changeLayout([{ op: "reset" }], lang, { source: "reports page" }); return layoutState(lang, r.done.join("; ") || undefined); }
  throw new Error("Unknown action.");
}
