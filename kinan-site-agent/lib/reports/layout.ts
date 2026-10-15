// The daily brief's layout, changed from the agent's chat ("remove the procurement section", "move safety to the top",
// "only Kinan Heights", "top 3 items", "add a note: …", "undo") — the same model as the Kinan marketing agent's report
// layout. Stored once and applied by build.ts to the e-mail, the in-app view and the ▶ Play deck, from the next brief
// on. Every change is logged with what it replaced, so it can be undone. The layout only shapes what the brief shows:
// figures still come from the data, and nothing here sends or approves. Storage-agnostic: the engine keeps it.
import { tx, type Lang } from "./build";

export const SECTIONS = ["headline", "since", "today", "next48", "critical", "milestones", "procurement", "safety", "projects"] as const;
export type SectionId = (typeof SECTIONS)[number];

export type Layout = { hidden: SectionId[]; order: SectionId[]; maxItems: number | null; focus: string | null; notes: { text: string; at: string }[] };
export const DEFAULT_LAYOUT: Layout = { hidden: [], order: [...SECTIONS], maxItems: null, focus: null, notes: [] };

export type Op =
  | { op: "hide" | "show"; section: SectionId }
  | { op: "move"; section: SectionId; to: "top" | "bottom" | "before" | "after"; ref?: SectionId }
  | { op: "limit"; n: number | null }
  | { op: "focus"; project: string | null }
  | { op: "add_note"; text: string }
  | { op: "clear_notes" }
  | { op: "reset" };

const SECTION_NAME: Record<SectionId, [string, string]> = {
  headline: ["Today in one line & to know today", "اليوم في سطر وللعلم اليوم"], since: ["Since the last brief", "منذ الموجز السابق"],
  today: ["The last 24 hours on site", "آخر 24 ساعة في الموقع"], next48: ["Next 48 hours", "الثماني والأربعون ساعة القادمة"],
  critical: ["Critical path", "المسار الحرج"], milestones: ["Milestones — next 60 days", "المعالم — الستون يوماً القادمة"],
  procurement: ["Procurement", "المشتريات"], safety: ["Safety", "السلامة"], projects: ["Generated projects", "المشاريع المولّدة"],
};
export const sectionName = (id: SectionId, l: Lang) => SECTION_NAME[id][l === "ar" ? 1 : 0];

export const cleanLayout = (x: unknown): Layout => {
  const l = { ...DEFAULT_LAYOUT, ...(x && typeof x === "object" ? (x as Partial<Layout>) : {}) } as Layout;
  const ok = (s: unknown): s is SectionId => (SECTIONS as readonly string[]).includes(String(s));
  const order = (Array.isArray(l.order) ? l.order : []).filter(ok);
  return {
    hidden: [...new Set((l.hidden ?? []).filter((s) => ok(s) && s !== "headline"))],
    order: ["headline", ...[...new Set([...order, ...SECTIONS])].filter((s) => s !== "headline")] as SectionId[],
    maxItems: typeof l.maxItems === "number" && l.maxItems >= 1 ? Math.min(10, Math.round(l.maxItems)) : null,
    focus: typeof l.focus === "string" && l.focus.trim() ? l.focus.trim() : null,
    notes: (l.notes ?? []).filter((n) => n && typeof n.text === "string").slice(-5),
  };
};

/** Apply changes; `done` lists what changed (for the log and the chat), `notes` what could not be done. */
export function applyOps(start: Layout, ops: Op[], lang: Lang, projects: string[] = []) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const l: Layout = JSON.parse(JSON.stringify(cleanLayout(start)));
  const done: string[] = [], notes: string[] = [];
  const S = (id: SectionId) => `“${sectionName(id, lang)}”`;
  for (const o of ops) {
    switch (o.op) {
      case "hide":
        if (o.section === "headline") { notes.push(T("The headline stays — it is the brief's opening.", "يبقى السطر الأول — فهو افتتاحية الموجز.")); break; }
        if (!(SECTIONS as readonly string[]).includes(o.section)) { notes.push(T(`No section called “${o.section}”.`, `لا يوجد قسم باسم «${o.section}».`)); break; }
        if (l.hidden.includes(o.section)) { notes.push(T(`${S(o.section)} is already hidden.`, `${S(o.section)} مخفي بالفعل.`)); break; }
        l.hidden.push(o.section); done.push(T(`removed ${S(o.section)}`, `أُزيل ${S(o.section)}`)); break;
      case "show":
        if (!l.hidden.includes(o.section)) { notes.push(T(`${S(o.section)} is already in the brief.`, `${S(o.section)} موجود في الموجز بالفعل.`)); break; }
        l.hidden = l.hidden.filter((x) => x !== o.section); done.push(T(`added back ${S(o.section)}`, `أُعيد ${S(o.section)}`)); break;
      case "move": {
        if (o.section === "headline") { notes.push(T("The headline always opens the brief.", "السطر الأول يفتتح الموجز دائماً.")); break; }
        const rest = l.order.filter((x) => x !== o.section);
        let at = o.to === "top" ? 1 : o.to === "bottom" ? rest.length : -1;
        if (o.to === "before" || o.to === "after") {
          const k = o.ref ? rest.indexOf(o.ref) : -1;
          if (k < 0) { notes.push(T("I couldn't tell where to move it.", "لم أتبيّن إلى أين أنقله.")); break; }
          at = Math.max(1, o.to === "before" ? k : k + 1);
        }
        rest.splice(at, 0, o.section); l.order = rest;
        if (l.hidden.includes(o.section)) l.hidden = l.hidden.filter((x) => x !== o.section);
        done.push(o.to === "top" ? T(`moved ${S(o.section)} to the top (after the headline)`, `نُقل ${S(o.section)} إلى الأعلى (بعد السطر الأول)`)
          : o.to === "bottom" ? T(`moved ${S(o.section)} to the end`, `نُقل ${S(o.section)} إلى النهاية`)
          : T(`moved ${S(o.section)} ${o.to} ${S(o.ref!)}`, `نُقل ${S(o.section)} ${o.to === "before" ? "قبل" : "بعد"} ${S(o.ref!)}`)); break;
      }
      case "limit":
        if (o.n === l.maxItems) { notes.push(T("That is already the length.", "هذا هو الطول الحالي بالفعل.")); break; }
        l.maxItems = o.n == null ? null : Math.max(1, Math.min(10, Math.round(o.n)));
        done.push(l.maxItems == null ? T("lists show every item again", "تعرض القوائم كل البنود مجدداً") : T(`lists show at most ${l.maxItems} item${l.maxItems === 1 ? "" : "s"}`, `تعرض القوائم ${l.maxItems} بنود كحد أقصى`)); break;
      case "focus": {
        if (o.project == null) { if (!l.focus) { notes.push(T("The brief already covers every project.", "الموجز يغطي كل المشاريع بالفعل.")); break; } l.focus = null; done.push(T("all projects again", "كل المشاريع مجدداً")); break; }
        const hit = projects.find((p) => mentions(p, o.project!)) ?? (projects.length ? null : o.project);
        if (!hit) { notes.push(T(`No project matches “${o.project}” (${projects.join(", ")}).`, `لا يوجد مشروع يطابق «${o.project}» (${projects.join("، ")}).`)); break; }
        if (hit === l.focus) { notes.push(T("That focus is already set.", "هذا التركيز مضبوط بالفعل.")); break; }
        l.focus = hit; done.push(T(`focus on ${hit} only`, `التركيز على ${hit} فقط`)); break;
      }
      case "add_note": {
        const text = String(o.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
        if (!text) { notes.push(T("What should the note say?", "ماذا تقول الملاحظة؟")); break; }
        l.notes = [...l.notes, { text, at: new Date().toISOString() }].slice(-5); done.push(T(`added the note “${text}”`, `أُضيفت الملاحظة «${text}»`)); break;
      }
      case "clear_notes":
        if (!l.notes.length) { notes.push(T("There are no notes.", "لا توجد ملاحظات.")); break; }
        l.notes = []; done.push(T("removed the notes", "أُزيلت الملاحظات")); break;
      case "reset":
        Object.assign(l, JSON.parse(JSON.stringify(DEFAULT_LAYOUT))); done.push(T("back to the standard brief", "عاد الموجز إلى شكله القياسي")); break;
    }
  }
  return { layout: cleanLayout(l), done, notes };
}

/** What the brief will contain, for the chat card and the Briefs page. */
export function layoutView(l: Layout, lang: Lang) {
  return {
    sections: l.order.map((id) => ({ id, name: sectionName(id, lang), on: !l.hidden.includes(id) })),
    maxItems: l.maxItems, focus: l.focus, notes: l.notes.map((n) => n.text),
    custom: JSON.stringify(cleanLayout(l)) !== JSON.stringify(DEFAULT_LAYOUT),
  };
}
export type LayoutView = ReturnType<typeof layoutView>;
export interface LayoutChange { id: string; at: string; summary: string; by: string | null; source: string; undone: boolean }
export interface LayoutState { view: LayoutView; history: LayoutChange[]; message?: string }

/** Does a project name match what the user said (full name, or its first distinctive word)? */
export function mentions(name: string, said: string) {
  const a = name.toLowerCase().trim(), b = said.toLowerCase().trim();
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const first = a.replace(/^(kinan|al|the)\s+/, "").split(/\s+/)[0];
  return first.length >= 4 && b.includes(first);
}

export const layoutHelp = (l: Lang) => tx(l,
  "You can change the daily brief from here, for example: \"remove the procurement section\", \"move safety to the top\", \"only Kinan Heights\", \"top 3 items\", \"add a note: the client visits on Thursday\", \"undo\", \"back to the standard brief\".",
  "يمكنكم تعديل الموجز اليومي من هنا، مثلاً: «احذف قسم المشتريات»، «انقل السلامة إلى الأعلى»، «كنان هايتس فقط»، «أعلى 3 بنود»، «أضف ملاحظة: زيارة العميل الخميس»، «تراجع»، «أعد الموجز القياسي».");
