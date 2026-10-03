// The celebrations and moments calendar the agent plans initiatives around.
//
//   Religious   Ramadan, Eid al-Fitr, Day of Arafah, Eid al-Adha, Hijri New Year — computed from the official Umm al-Qura
//               calendar (Intl "islamic-umalqura"), so every year is right without editing; final dates follow the moon
//               sighting (usually the same day, sometimes one day later).
//   National    Founding Day (22 Feb), Flag Day (11 Mar), National Day (23 Sep).
//   Seasons     Riyadh Season, Jeddah Season, school summer holiday, back to school.
//   Events      Cityscape Global and the other dated events announced for Kinan's cities.
//   Your own    any calendar published as ICS (Outlook / Google / the company's events calendar): CALENDAR_ICS_URL
//               (comma-separated). Read live, merged in, labelled as yours.
//
// Each moment carries the marketing angle (what works, how far ahead to prepare) taken from the 2023–2025 history.
import { type Lang, tx, dt } from "./i18n";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY));

export type MomentKind = "RELIGIOUS" | "NATIONAL" | "SEASON" | "EVENT" | "SCHOOL" | "YOURS";
export type Moment = {
  id: string; key: string; kind: MomentKind; from: string; to: string; city: string | null;
  name: Bi; angle: Bi; leadWeeks: number; direction: "up" | "down";
  source: "umalqura" | "fixed" | "announced" | "estimated" | "ics"; sourceNote: Bi; url?: string;
};

// ------------------------------------------------------------------ Hijri (Umm al-Qura)
const HIJRI = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
function hijri(d: string) {
  const p = HIJRI.formatToParts(new Date(`${d}T00:00:00Z`));
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day") };
}
/** Gregorian date of a Hijri day (month, day) in the window, or null. */
function findHijri(from: string, to: string, m: number, d: number): string[] {
  const out: string[] = [];
  for (let x = from; x <= to; x = add(x, 1)) { const h = hijri(x); if (h.m === m && h.d === d) out.push(x); }
  return out;
}
const UQ = bi("Umm al-Qura calendar (final date follows the moon sighting)", "تقويم أم القرى (التاريخ النهائي حسب رؤية الهلال)");

function religious(from: string, to: string): Moment[] {
  const out: Moment[] = [];
  const f = add(from, -40), t = add(to, 40);
  for (const s of findHijri(f, t, 9, 1)) {
    const y = s.slice(0, 4), eid = findHijri(s, add(s, 31), 10, 1)[0] ?? add(s, 29);
    out.push({ id: `RAMADAN-${y}`, key: "RAMADAN", kind: "RELIGIOUS", from: s, to: add(eid, -1), city: null, source: "umalqura", sourceNote: UQ, leadWeeks: 8, direction: "up",
      name: bi(`Ramadan ${y}`, `رمضان ${y}`),
      angle: bi("Payment-plan offers worked best in the history (qualified rate up to 22% in 2025); evening (after iftar) content and site visits; book media 6–8 weeks ahead — ad costs rise in the last ten days.", "كانت عروض خطط السداد الأنجح تاريخياً (نسبة المؤهلين حتى 22% في 2025)؛ محتوى وزيارات مسائية بعد الإفطار؛ احجزوا الإعلانات قبل 6–8 أسابيع — ترتفع التكلفة في العشر الأواخر.") });
    out.push({ id: `EID_FITR-${y}`, key: "EID_FITR", kind: "RELIGIOUS", from: eid, to: add(eid, 3), city: null, source: "umalqura", sourceNote: UQ, leadWeeks: 6, direction: "up",
      name: bi(`Eid al-Fitr ${y}`, `عيد الفطر ${y}`),
      angle: bi("Families visit and decide together: an Eid open house on site with a gift on reservation; promote the week before.", "تزور العائلات وتقرر معاً: بيت مفتوح في العيد بهدية عند الحجز؛ ترويج في الأسبوع السابق.") });
  }
  for (const s of findHijri(f, t, 12, 10)) {
    const y = s.slice(0, 4);
    out.push({ id: `EID_ADHA-${y}`, key: "EID_ADHA", kind: "RELIGIOUS", from: add(s, -1), to: add(s, 3), city: null, source: "umalqura", sourceNote: UQ, leadWeeks: 6, direction: "up",
      name: bi(`Day of Arafah and Eid al-Adha ${y}`, `يوم عرفة وعيد الأضحى ${y}`),
      angle: bi("Long holiday; many travel, Hajj traffic through Jeddah and Makkah. Keep spend light during the holiday, push family offers the week before.", "إجازة طويلة يسافر فيها كثيرون، وحركة الحج عبر جدة ومكة. إنفاق خفيف خلال الإجازة، وعروض للعائلات قبلها بأسبوع.") });
  }
  for (const s of findHijri(f, t, 1, 1)) out.push({ id: `HIJRI_NY-${s.slice(0, 4)}`, key: "HIJRI_NY", kind: "RELIGIOUS", from: s, to: s, city: null, source: "umalqura", sourceNote: UQ, leadWeeks: 3, direction: "up",
    name: bi(`Hijri New Year ${hijri(s).y}`, `رأس السنة الهجرية ${hijri(s).y}`), angle: bi("A light greeting moment for content; not a sales driver.", "مناسبة تهنئة للمحتوى؛ ليست محركاً للمبيعات.") });
  return out;
}

// ------------------------------------------------------------------ fixed national days, seasons and announced events
const FIXED: { key: string; mmdd: string; days: number; name: Bi; angle: Bi; lead: number }[] = [
  { key: "FOUNDING_DAY", mmdd: "02-22", days: 1, lead: 6, name: bi("Founding Day", "يوم التأسيس"), angle: bi("Heritage pride: Saudi-heritage design stories and a dated family offer; ad competition is high on the day — spend in the week before.", "فخر بالإرث: قصص التصميم المستوحى من التراث وعرض عائلي مؤقت؛ المنافسة الإعلانية عالية يومها — الإنفاق في الأسبوع السابق.") },
  { key: "FLAG_DAY", mmdd: "03-11", days: 1, lead: 2, name: bi("Flag Day", "يوم العلم"), angle: bi("A content moment only.", "مناسبة محتوى فقط.") },
  { key: "NATIONAL_DAY", mmdd: "09-23", days: 1, lead: 8, name: bi("Saudi National Day", "اليوم الوطني السعودي"), angle: bi("High ad competition and strong family footfall: a National Day family weekend on site with a dated offer, promoted two weeks ahead.", "منافسة إعلانية عالية وإقبال عائلي قوي: عطلة عائلية في الموقع بعرض مؤقت، يُروَّج لها قبل أسبوعين.") },
];
// Dated moments announced for 2026–27 (sources: organisers' announcements, Oct 2026). Approximate ones say so.
const ANNOUNCED: Omit<Moment, "id">[] = [
  { key: "RIYADH_SEASON", kind: "SEASON", from: "2026-10-21", to: "2026-12-31", city: "Riyadh", source: "announced", leadWeeks: 4, direction: "up", url: "https://www.tradearabia.com/News/486894/Riyadh-Season-2026-to-open-on-October-21",
    sourceNote: bi("Announced by the General Entertainment Authority: opens 21 Oct 2026, ten weeks", "أعلنت الهيئة العامة للترفيه: يبدأ 21 أكتوبر 2026 لعشرة أسابيع"),
    name: bi("Riyadh Season 2026 (“Big Time”)", "موسم الرياض 2026 («بيق تايم»)"), angle: bi("Ten weeks of crowds in Riyadh — Riyadh is where Jeddah's investor buyers live: a Riyadh investor lounge / roadshow and targeted digital around the season's venues.", "عشرة أسابيع من الحشود في الرياض — حيث يقيم المستثمرون المشترون في جدة: صالة أو جولة للمستثمرين في الرياض وإعلانات رقمية حول مواقع الموسم.") },
  { key: "CITYSCAPE", kind: "EVENT", from: "2026-11-16", to: "2026-11-19", city: "Riyadh", source: "announced", leadWeeks: 10, direction: "up", url: "https://cityscapeglobal.com/why-visit",
    sourceNote: bi("Cityscape Global: 16–19 Nov 2026, Riyadh Exhibition & Convention Centre (Malham)", "سيتي سكيب جلوبال: 16–19 نوفمبر 2026، مركز الرياض للمعارض والمؤتمرات (ملهم)"),
    name: bi("Cityscape Global 2026, Riyadh", "سيتي سكيب جلوبال 2026، الرياض"), angle: bi("Events converted best in the history (Cityscape 2024: 16 contracts at 1.1% cost to sales): stand, show-unit VR and pre-booked investor meetings.", "الفعاليات الأعلى تحويلاً تاريخياً (سيتي سكيب 2024: 16 عقداً بتكلفة 1.1% من المبيعات): جناح وجولة افتراضية واجتماعات مستثمرين محجوزة مسبقاً.") },
  { key: "JEWELS_JEDDAH", kind: "EVENT", from: "2026-10-19", to: "2026-10-22", city: "Jeddah", source: "announced", leadWeeks: 3, direction: "up",
    sourceNote: bi("“Jewels of the World” exhibition, Jeddah, 19–22 Oct 2026", "معرض «مجوهرات العالم»، جدة، 19–22 أكتوبر 2026"),
    name: bi("Jewels of the World, Jeddah", "معرض مجوهرات العالم، جدة"), angle: bi("A high-net-worth Jeddah audience: a fit for Marina Tower penthouses (private viewings, not a stand).", "جمهور من أصحاب الثروات في جدة: مناسب لبنتهاوس برج المارينا (معاينات خاصة لا جناح).") },
  { key: "RSIFF", kind: "EVENT", from: "2026-12-03", to: "2026-12-12", city: "Jeddah", source: "estimated", leadWeeks: 6, direction: "up",
    sourceNote: bi("Red Sea International Film Festival, Jeddah Al Balad — early December (dates approx.)", "مهرجان البحر الأحمر السينمائي الدولي، جدة البلد — أوائل ديسمبر (تواريخ تقريبية)"),
    name: bi("Red Sea International Film Festival, Jeddah (approx.)", "مهرجان البحر الأحمر السينمائي، جدة (تقريبي)"), angle: bi("International and cultural audience in Jeddah: brand content and PR, not a lead driver.", "جمهور دولي وثقافي في جدة: محتوى وعلاقات عامة للعلامة، لا مصدر عملاء.") },
];
// Seasons that repeat every year (approximate windows).
const YEARLY: { key: string; kind: MomentKind; from: string; to: string; city: string | null; name: Bi; angle: Bi; lead: number; direction: "up" | "down" }[] = [
  { key: "SUMMER", kind: "SCHOOL", from: "06-26", to: "08-29", city: null, lead: 8, direction: "down", name: bi("School summer holiday", "الإجازة الصيفية المدرسية"), angle: bi("Many families travel — the weakest season in the history (3.6% cost to sales). Spend lightly, build a priority list for September.", "تسافر أسر كثيرة — أضعف موسم تاريخياً (3.6% من المبيعات). إنفاق خفيف وبناء قائمة أولوية لسبتمبر.") },
  { key: "BACK_TO_SCHOOL", kind: "SCHOOL", from: "08-30", to: "09-06", city: null, lead: 4, direction: "up", name: bi("Back to school — buyers return", "العودة إلى المدارس — عودة المشترين"), angle: bi("Buyers are back and deciding before winter: restart lead generation in the last week of August.", "يعود المشترون ويقررون قبل الشتاء: أعيدوا توليد العملاء في الأسبوع الأخير من أغسطس.") },
  { key: "JEDDAH_SEASON", kind: "SEASON", from: "06-20", to: "08-15", city: "Jeddah", lead: 6, direction: "up", name: bi("Jeddah Season (summer, approx.)", "موسم جدة (الصيف، تقريبي)"), angle: bi("Visitors and concerts on the Corniche: waterfront-living content for Marina Tower and Ash Shati; footfall, not many buyers.", "زوار وحفلات على الكورنيش: محتوى الحياة البحرية لبرج المارينا والشاطئ؛ إقبال لا مشترون كثر.") },
];

// ------------------------------------------------------------------ your own calendar (ICS)
let icsCache: { at: number; key: string; items: Moment[]; error: string | null } | null = null;
function parseIcs(text: string, src: string): Moment[] {
  const out: Moment[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => block.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "m"))?.[1]?.trim() ?? "";
    const d = (v: string) => (v.match(/^(\d{4})(\d{2})(\d{2})/) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : "");
    const from = d(get("DTSTART")), endRaw = d(get("DTEND")), summary = get("SUMMARY").replace(/\\,/g, ",").replace(/\\n/g, " ");
    if (!from || !summary) continue;
    const allDay = /DTSTART;VALUE=DATE:/.test(block);
    const to = endRaw ? (allDay ? add(endRaw, -1) : endRaw) : from;
    out.push({ id: `ICS-${from}-${summary.slice(0, 24)}`, key: "YOURS", kind: "YOURS", from, to: to < from ? from : to, city: get("LOCATION") || null, source: "ics", leadWeeks: 4, direction: "up",
      sourceNote: bi(`Your calendar (${src})`, `تقويمكم (${src})`), name: bi(summary, summary), angle: bi("From your calendar — plan marketing around it.", "من تقويمكم — خططوا للتسويق حوله.") });
  }
  return out;
}
export async function loadIcs(force = false): Promise<{ items: Moment[]; error: string | null; urls: string[] }> {
  const { getSettings } = await import("./integrations");
  const saved = (await getSettings()).icsUrls ?? "";
  const urls = [...new Set([saved, typeof process !== "undefined" ? process.env.CALENDAR_ICS_URL ?? "" : ""].join(",").split(",").map((s) => s.trim().replace(/^webcal:/i, "https:")).filter(Boolean))];
  if (!urls.length) return { items: [], error: null, urls };
  if (typeof window !== "undefined") return { items: [], error: "this offline copy can't reach your calendar — it is read by the live app", urls };
  if (icsCache && !force && icsCache.key === urls.join(",") && Date.now() - icsCache.at < 3 * 3_600_000) return { items: icsCache.items, error: icsCache.error, urls };
  const items: Moment[] = []; let error: string | null = null;
  for (const u of urls) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); items.push(...parseIcs(await r.text(), new URL(u).hostname)); }
    catch (e: any) { error = `${new URL(u).hostname}: ${e?.message ?? e}`; }
  }
  icsCache = { at: Date.now(), key: urls.join(","), items, error };
  return { items, error, urls };
}

// ------------------------------------------------------------------ the calendar
/** Every moment overlapping [from, to] (YYYY-MM-DD), sorted by start. `extra` = moments from your ICS calendars. */
export function moments(from: string, to: string, extra: Moment[] = []): Moment[] {
  const out: Moment[] = [...religious(from, to)];
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    for (const f of FIXED) out.push({ id: `${f.key}-${y}`, key: f.key, kind: "NATIONAL", from: `${y}-${f.mmdd}`, to: add(`${y}-${f.mmdd}`, f.days - 1), city: null, source: "fixed", sourceNote: bi("Official date", "تاريخ رسمي"), name: bi(`${f.name.en} ${y}`, `${f.name.ar} ${y}`), angle: f.angle, leadWeeks: f.lead, direction: "up" });
    for (const s of YEARLY) out.push({ id: `${s.key}-${y}`, key: s.key, kind: s.kind, from: `${y}-${s.from}`, to: `${y}-${s.to}`, city: s.city, source: "estimated", sourceNote: bi("Usual window (approx.)", "الفترة المعتادة (تقريبية)"), name: s.name, angle: s.angle, leadWeeks: s.lead, direction: s.direction });
  }
  for (const a of ANNOUNCED) out.push({ ...a, id: `${a.key}-${a.from.slice(0, 4)}` });
  // An announced date replaces the usual window for the same thing that year.
  const seen = new Set(out.filter((m) => m.source === "announced").map((m) => `${m.key}-${m.from.slice(0, 4)}`));
  return [...out.filter((m) => !(m.source === "estimated" && seen.has(`${m.key}-${m.from.slice(0, 4)}`))), ...extra]
    .filter((m) => m.to >= from && m.from <= to)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** The next months from today (real date), for the Initiatives page, the assistant and the scan. */
export async function upcoming(days = 180, today = iso(new Date())) {
  const ics = await loadIcs();
  return { today, items: moments(today, add(today, days), ics.items), ics: { connected: ics.urls.length > 0, error: ics.error, count: ics.items.length } };
}

/** Same, without waiting for the ICS calendars (uses what was last read). */
export function upcomingSync(days = 180, today = iso(new Date())) {
  return { today, items: moments(today, add(today, days), icsCache?.items ?? []), ics: { connected: !!(icsCache?.key || (typeof process !== "undefined" && process.env.CALENDAR_ICS_URL)), error: icsCache?.error ?? null, count: icsCache?.items.length ?? 0 } };
}

export function momentView(m: Moment, lang: Lang, today = iso(new Date())) {
  const L = (x: Bi) => (lang === "ar" ? x.ar : x.en);
  const inDays = Math.round((Date.parse(m.from) - Date.parse(today)) / DAY);
  const prepBy = add(m.from, -m.leadWeeks * 7);
  return {
    id: m.id, key: m.key, kind: m.kind, from: m.from, to: m.to, city: m.city, name: L(m.name), angle: L(m.angle), source: m.source, sourceNote: L(m.sourceNote), url: m.url ?? null,
    inDays, ongoing: inDays <= 0 && m.to >= today, prepBy, late: prepBy < today && inDays > 0, direction: m.direction,
    when: m.from === m.to ? dt(lang, m.from) : `${dt(lang, m.from)} → ${dt(lang, m.to)}`,
    prep: tx(lang, `prepare from ${dt("en", prepBy)} (${m.leadWeeks} weeks ahead)`, `التحضير من ${dt("ar", prepBy)} (قبل ${m.leadWeeks} أسابيع)`),
  };
}
export type MomentView = ReturnType<typeof momentView>;

/** Legacy shape for the assistant's calendar answer and the AI's get_calendar tool. */
export function calendarList(days = 365) {
  const today = iso(new Date());
  return moments(today, add(today, days)).filter((m) => m.key !== "FLAG_DAY").map((m) => ({ from: m.from, to: m.to, en: `${m.name.en} — ${m.angle.en}`, ar: `${m.name.ar} — ${m.angle.ar}`, source: m.source }));
}
