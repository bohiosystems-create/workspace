// The marketing inbox (Outlook) as a data source for the daily scan: vendor notices, proposals and market news that
// arrive by email. Each message is classified (rules, no AI needed) into ISSUE / OPPORTUNITY / MARKET / EVENT and
// tagged with the project and vendor it concerns.
//   mock — sample messages below (consistent with the CRM, ads and market data in the demo)
//   live — the last 30 days of the shared mailbox via Microsoft Graph (Mail.Read), same classification
// Nothing here replies to anyone: messages only feed signals and initiatives; any email out still needs approval.
import { outlookMode, outlookSender, graphToken } from "./outlook";
import { type Lang, nm } from "./i18n";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
export type InboxTopic = "ISSUE" | "OPPORTUNITY" | "MARKET" | "EVENT" | "OTHER";
export type InboxMessage = { id: string; date: string; from: string; fromName: string; vendor: string | null; subject: Bi; preview: Bi; topic: InboxTopic; project: string | null; source: "sample" | "outlook" };

// Sample inbox (May–June 2026). Fictional senders; vendor names match the demo vendors.
const SAMPLE: Omit<InboxMessage, "source">[] = [
  { id: "mail-phub-slot", date: "2026-05-12T08:40:00.000Z", from: "accounts@propertyhub.sa", fromName: "PropertyHub KSA", vendor: "PropertyHub KSA", topic: "ISSUE", project: "Marina Tower",
    subject: bi("Marina Tower — featured slot ended 10 May", "برج المارينا — انتهى الموقع المميز في 10 مايو"),
    preview: bi("The featured / top-of-search slot for Marina Tower expired on 10 May as the monthly renewal was not confirmed. Listings are live as standard listings. Renewal is SAR 18K a month; reply to reactivate within 48 hours.", "انتهى الموقع المميز وأعلى نتائج البحث لبرج المارينا في 10 مايو لعدم تأكيد التجديد الشهري. الإعلانات ما زالت ظاهرة كإعلانات عادية. التجديد 18 ألف ر.س شهرياً؛ يمكن إعادة التفعيل خلال 48 ساعة من الرد.") },
  { id: "mail-mubasher-lumen", date: "2026-05-27T13:15:00.000Z", from: "ops@mubasher.sa", fromName: "Mubasher Brokerage Network", vendor: "Mubasher Brokerage Network", topic: "MARKET", project: "Andalus Quarter",
    subject: bi("Brokers' feedback — Jeddah South buyers comparing offers", "ملاحظات الوسطاء — مشترو جنوب جدة يقارنون العروض"),
    preview: bi("Several of our brokers report Andalus Quarter prospects comparing with Lumen South's 1% down payment offer and Qimma's fees-covered promotion. Buyers ask whether we can match a low first payment.", "أفاد عدد من وسطائنا بأن المهتمين بحي الأندلس يقارنون بعرض لومن الجنوب (دفعة أولى 1%) وعرض قمة بتحمّل الرسوم. ويسأل المشترون إن كان بالإمكان تقديم دفعة أولى منخفضة.") },
  { id: "mail-bank-partner", date: "2026-06-02T09:05:00.000Z", from: "partnerships@gulfhomefinance.sa", fromName: "Gulf Home Finance (sample bank)", vendor: null, topic: "OPPORTUNITY", project: null,
    subject: bi("Co-marketing proposal: pre-approved mortgages for your buyers", "مقترح تسويق مشترك: تمويل عقاري معتمد مسبقاً لمشتريكم"),
    preview: bi("We would like to partner on your Jeddah projects: pre-approval in 24 hours for your buyers, a finance desk at your sales centre on weekends, and a joint campaign to our salaried customers. Rates from 4.9% this quarter.", "نرغب في الشراكة في مشاريعكم بجدة: موافقة مسبقة خلال 24 ساعة لمشتريكم، ومكتب تمويل في مركز المبيعات في عطلات نهاية الأسبوع، وحملة مشتركة لعملائنا من الموظفين. أسعار تبدأ من 4.9% هذا الربع.") },
  { id: "mail-sada-restart", date: "2026-06-03T11:20:00.000Z", from: "hello@sada-influence.com", fromName: "Sada Influence", vendor: "Sada Influence", topic: "OPPORTUNITY", project: "Andalus Quarter",
    subject: bi("Proposal: restart Andalus creators on pay-per-qualified-lead", "مقترح: إعادة تشغيل صناع المحتوى للأندلس بالدفع لكل عميل مؤهل"),
    preview: bi("Following the pause, we propose restarting the Andalus creator programme with six creators and payment per CRM-qualified lead (SAR 950) instead of a flat fee, using the remaining PO.", "بعد الإيقاف، نقترح إعادة تشغيل برنامج صناع المحتوى لحي الأندلس بستة صناع محتوى والدفع لكل عميل مؤهل في النظام (950 ر.س) بدل المبلغ الثابت، من المتبقي في أمر الشراء.") },
  { id: "mail-cityscape", date: "2026-06-01T07:30:00.000Z", from: "exhibitors@cityscape-sample.com", fromName: "Cityscape Global (exhibitor team)", vendor: null, topic: "EVENT", project: null,
    subject: bi("Cityscape Global 2026 — exhibitor early-bird closes 30 June", "سيتي سكيب جلوبال 2026 — ينتهي سعر الحجز المبكر للعارضين في 30 يونيو"),
    preview: bi("Stands in the residential hall are 70% booked. Early-bird pricing (−15%) ends 30 June; the event runs 9–12 November in Riyadh.", "حُجز 70% من أجنحة قاعة السكني. ينتهي سعر الحجز المبكر (خصم 15%) في 30 يونيو؛ وتقام الفعالية 9–12 نوفمبر في الرياض.") },
  { id: "mail-nakhla-routine", date: "2026-06-04T09:10:00.000Z", from: "team@nakhla.sa", fromName: "Nakhla Communications", vendor: "Nakhla Communications", topic: "OTHER", project: "Andalus Quarter",
    subject: bi("May 2026 performance report", "تقرير أداء مايو 2026"), preview: bi("Attached is our May report in your template.", "مرفق تقرير مايو بالقالب المعتمد لديكم.") },
];

const PROJECTS: [RegExp, string][] = [[/ash shati|الشاطئ/i, "Ash Shati Residences"], [/marina|المارينا/i, "Marina Tower"], [/andalus|الأندلس/i, "Andalus Quarter"]];
/** Rules classification of a live message (subject + preview). */
export function classify(text: string): InboxTopic {
  const t = text.toLowerCase();
  if (/expired|ended|lapsed|paused|suspend|stopped|disapproved|rejected|tracking (issue|broken)|pixel|outage|not (running|delivering)|delay/.test(t)) return "ISSUE";
  if (/proposal|partnership|co-marketing|collaborat|opportunit|sponsor|pilot|would like to partner/.test(t)) return "OPPORTUNITY";
  if (/exhibit|expo|booth|stand |cityscape|event registration|early-bird/.test(t)) return "EVENT";
  if (/competitor|buyers (are )?(asking|comparing)|comparing|discount|payment plan|price (cut|drop|increase)|down payment/.test(t)) return "MARKET";
  return "OTHER";
}

async function readLive(vendors: { name: string; email: string | null }[]): Promise<InboxMessage[]> {
  const token = await graphToken();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(outlookSender())}/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$top=100&$select=id,subject,from,receivedDateTime,bodyPreview`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Reading the Outlook inbox failed (${res.status}).`);
  const j = await res.json();
  return (j.value ?? []).map((m: any) => {
    const from = String(m.from?.emailAddress?.address ?? ""), dom = from.split("@")[1]?.toLowerCase() ?? "";
    const v = vendors.find((x) => x.email && x.email.split("@")[1]?.toLowerCase() === dom) ?? null;
    const text = `${m.subject ?? ""} ${m.bodyPreview ?? ""}`;
    return { id: String(m.id), date: m.receivedDateTime, from, fromName: m.from?.emailAddress?.name ?? from, vendor: v?.name ?? null, subject: bi(m.subject ?? "", m.subject ?? ""), preview: bi(m.bodyPreview ?? "", m.bodyPreview ?? ""),
      topic: classify(text), project: PROJECTS.find(([rx]) => rx.test(text))?.[1] ?? null, source: "outlook" as const };
  });
}

/** Inbox messages for the scan (newest first). In live mode a read failure is reported, not hidden. */
export async function readInbox(vendors: { name: string; email: string | null }[] = []): Promise<{ messages: InboxMessage[]; mode: "mock" | "live"; error: string | null }> {
  if (outlookMode() === "mock") return { messages: SAMPLE.map((m) => ({ ...m, source: "sample" as const })).sort((a, b) => b.date.localeCompare(a.date)), mode: "mock", error: null };
  try { return { messages: (await readLive(vendors)).sort((a, b) => b.date.localeCompare(a.date)), mode: "live", error: null }; }
  catch (e: any) { return { messages: [], mode: "live", error: String(e?.message ?? e) }; }
}
/** Sample inbox messages from one vendor (shown in the vendor directory's correspondence). */
export const sampleMailFrom = (vendor: string, lang: Lang) => SAMPLE.filter((m) => m.vendor === vendor).map((m) => ({
  id: m.id, direction: "IN" as const, from: m.from, to: outlookSender(), date: m.date, subject: lang === "ar" ? m.subject.ar : m.subject.en, preview: lang === "ar" ? m.preview.ar : m.preview.en,
}));
export const senderLabel = (m: InboxMessage, lang: Lang) => (m.vendor ? nm(lang, m.vendor) : m.fromName);
