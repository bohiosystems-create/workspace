// Kinan's sales agent — a READ-ONLY data source for the AI Assistant Director of Marketing.
//
// Kinan's sales agent is the AI that handles leads, follow-up and sales in Kinan's CRM (Yardi). The marketing
// director never talks to it: it sends it nothing (no plan, no brief, no campaign changes, no API for it to call).
// It only reads the CRM results the sales agent produces — leads, qualification, viewings, reservations, contracts
// and lost reasons, by campaign code — to judge campaigns and vendors (lib/crm.ts, CRM_MODE).
import { crmMode } from "./crm";
import { type Lang, tx } from "./i18n";

/** How the director reads Kinan's sales-agent data (for the Director page and the assistant). */
export function salesAgentSource(lang: Lang, crm: { lastSync: string | null; leads: number; matched: number; unmatched: number; attributionGapPct: number }) {
  const mode = crmMode();
  return {
    mode,
    label: mode === "mock" ? tx(lang, "Sample CRM data (Yardi not connected yet)", "بيانات نظام تجريبية (Yardi غير متصل بعد)") : tx(lang, "Yardi CRM export", "تصدير نظام Yardi"),
    lastSync: crm.lastSync, leads: crm.leads, matched: crm.matched, unmatched: crm.unmatched, attributionGapPct: crm.attributionGapPct,
    reads: [
      tx(lang, "Leads and their source campaign code", "العملاء المحتملون ورمز الحملة المصدر"),
      tx(lang, "Qualification, viewings, reservations and contracts", "التأهيل والمعاينات والحجوزات والعقود"),
      tx(lang, "Lost reasons and first-response times", "أسباب الخسارة وزمن الاستجابة الأول"),
      tx(lang, "Contracted sales by project and month", "المبيعات المتعاقد عليها حسب المشروع والشهر"),
    ],
  };
}
