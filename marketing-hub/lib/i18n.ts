// Localisation core (English / Arabic). Pure functions — usable on the server and in the browser.
//
// Conventions
//  - Western digits (0-9) in Arabic text, as is usual in Saudi business documents.
//  - Currency: "SAR 856K" ↔ "856 ألف ر.س"; "SAR 12M" ↔ "12 مليون ر.س".
//  - Dates use the Gregorian calendar with Arabic month names (not Hijri).
//  - Proper nouns come from NAMES_AR; anything not listed (e.g. a new vendor) stays as written.

export type Lang = "en" | "ar";

export const isLang = (x: unknown): x is Lang => x === "en" || x === "ar";
export const dirOf = (l: Lang) => (l === "ar" ? "rtl" : "ltr");
export const tx = (l: Lang, en: string, ar: string) => (l === "ar" ? ar : en);

// Does this text look Arabic? (used to answer chat questions in the language they were asked in)
export const looksArabic = (s: string) => (s.match(/[؀-ۿ]/g) ?? []).length >= 2;

// --- money ---------------------------------------------------------------
export const K = (l: Lang, x: number | string) => (l === "ar" ? `${x} ألف ر.س` : `SAR ${x}K`);
export const M = (l: Lang, x: number | string) => (l === "ar" ? `${x} مليون ر.س` : `SAR ${x}M`);
export const SAR = (l: Lang, x: number | string) => (l === "ar" ? `${x} ر.س` : `SAR ${x}`);
export const hrs = (l: Lang, x: number | string) => (l === "ar" ? `${x} ساعة` : `${x}h`);

// --- dates ---------------------------------------------------------------
const locale = (l: Lang) => (l === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");
export function dt(l: Lang, d: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(d).toLocaleDateString(locale(l), opts);
}
export function dtm(l: Lang, d: string | Date) {
  return new Date(d).toLocaleString(locale(l), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export const monthShort = (l: Lang, ym: string) => new Date(`${ym}-01`).toLocaleDateString(locale(l), { month: "short" });

// --- names & terms -------------------------------------------------------
export const NAMES_AR: Record<string, string> = {
  // vendors
  "Tasweeq Digital": "تسويق ديجيتال",
  "PropertyHub KSA": "بروبرتي هب السعودية",
  "Mubasher Brokerage Network": "شبكة مباشر للوساطة",
  "Nakhla Communications": "نخلة للاتصالات",
  "Hajar Outdoor": "هجر للإعلانات الخارجية",
  "Sada Influence": "صدى للتأثير",
  // bench vendors
  "Wasel Performance": "واصل للأداء", "Manazel Portal": "بوابة منازل", "Rukn Realty Brokers": "ركن للوساطة العقارية", "Mada Outdoor": "مدى للإعلانات الخارجية", "Bayan Creators": "بيان لصناع المحتوى",
  "Huda Saleh": "هدى صالح", "Tariq Mansour": "طارق منصور", "Salma Haddad": "سلمى حداد", "Majed Aziz": "ماجد عزيز", "Lina Farouk": "لينا فاروق",
  "12% media fee, media at cost (no markup), bonus per CRM-qualified lead above target": "رسوم 12% على الإعلام، والإعلام بالتكلفة (دون هامش)، ومكافأة لكل عميل مؤهل في النظام فوق المستهدف",
  "SAR 38K / month featured package, cancellable monthly": "باقة مميزة بقيمة 38 ألف ر.س شهرياً، قابلة للإلغاء شهرياً",
  "1.75% commission on signed contracts only": "عمولة 1.75% على العقود الموقعة فقط",
  "Digital billboards, SAR 60K per 4-week flight, QR-tracked creative included": "لوحات رقمية، 60 ألف ر.س لكل حملة مدتها 4 أسابيع، تشمل محتوى برموز QR قابلة للتتبع",
  "SAR 8K per creator package, paid on tracked leads": "8 آلاف ر.س لكل باقة صانع محتوى، تُدفع على العملاء المحتملين المتتبَّعين",
  // vendor contacts
  "Layla Nasser": "ليلى ناصر", "Omar Zahrani": "عمر الزهراني", "Khalid Otaibi": "خالد العتيبي",
  "Rania Habib": "رانيا حبيب", "Faisal Qahtani": "فيصل القحطاني", "Noor Bakri": "نور بكري",
  // assets
  "Ash Shati Residences": "مساكن الشاطئ", "Andalus Quarter": "حي الأندلس", "Marina Tower": "برج المارينا",
  "Ash Shati": "الشاطئ", "Andalus": "الأندلس",
  // campaign descriptors
  "Search & Social Always-On": "البحث والتواصل الاجتماعي المستمر",
  "Off-plan Launch Funnel": "مسار إطلاق البيع على الخارطة",
  "Featured Listings": "الإعلانات المميزة",
  "Retail & Residential Spotlight": "تسليط الضوء على التجزئة والسكني",
  "Broker Push": "حملة الوسطاء",
  "Launch PR & Media Relations": "العلاقات العامة والإعلام للإطلاق",
  "Corniche Billboards": "لوحات الكورنيش الإعلانية",
  "Creator Programme": "برنامج صنّاع المحتوى",
  "Lifestyle Creators": "صنّاع محتوى نمط الحياة",
  // channels / categories / commercial models
  "Google / Meta": "جوجل / ميتا", "Meta / Snap": "ميتا / سناب", "Portal": "بوابة عقارية", "Broker network": "شبكة وسطاء",
  "PR": "علاقات عامة", "OOH": "إعلانات خارجية", "Instagram / TikTok": "إنستغرام / تيك توك",
  "Performance media": "إعلام الأداء", "Property portal": "بوابة عقارية", "PR & brand": "علاقات عامة وعلامة تجارية",
  "Outdoor": "إعلانات خارجية", "Influencer": "مؤثرون",
  "Retainer": "اشتراك شهري ثابت", "Commission": "عمولة", "Media buy": "شراء إعلامي",
  // property types
  "Residential": "سكني", "Mixed-use": "متعدد الاستخدامات",
  // CRM
  "Jeddah · North": "جدة · الشمال", "Jeddah · South": "جدة · الجنوب", "Jeddah · Corniche": "جدة · الكورنيش",
};

/** Translate a proper noun / composite campaign name ("Ash Shati — Broker Push") for the given language. */
export function nm(l: Lang, name: string | null | undefined): string {
  if (!name) return "";
  if (l !== "ar") return name;
  if (NAMES_AR[name]) return NAMES_AR[name];
  if (name.includes(" — ")) return name.split(" — ").map((p) => NAMES_AR[p.trim()] ?? p.trim()).join(" — ");
  return name;
}

// Short Arabic digit-free helper for lists: "a، b و c"
export const list = (l: Lang, xs: string[]) =>
  xs.length <= 1 ? xs.join("") : l === "ar" ? `${xs.slice(0, -1).join("، ")} و${xs[xs.length - 1]}` : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** Arabic number agreement: an(3, "عقد واحد", "عقدان", "عقود", "عقداً") → "3 عقود"; 1 and 2 use the singular / dual form. */
export function an(n: number, one: string, two: string, few: string, many: string) {
  return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

/** Isolate codes (invoice / PO numbers, periods) so they keep their left-to-right order inside Arabic text. */
export const ltr = (s: string | number) => `\u2066${s}\u2069`;
