// Campaign history — the developer's past campaigns (2023–2025: Palm Villas, Ash Shati, Marina Tower, Andalus, corporate brand and Cityscape), as sample data.
//
// Used for: benchmarks per channel / season / project / vendor / year, lessons learned (what worked, what didn't,
// seasonality), the daily campaign check (lib/daily.ts compares live campaigns against similar past ones), the
// History page and the assistant. Kept apart from live campaigns so scores and plans are unaffected.
import { prisma } from "./prisma";
import { single } from "./single";
import { type Lang, tx, nm, M } from "./i18n";

export const FAMILY: Record<string, string> = {
  "Google / Meta": "DIGITAL", "Meta / Snap": "DIGITAL", "Instagram / TikTok": "INFLUENCER", Portal: "PORTAL", "Broker network": "BROKER",
  PR: "PR", OOH: "OUTDOOR", Event: "EVENT", Radio: "RADIO",
};
export const FAMILY_LABEL: Record<string, [string, string]> = {
  DIGITAL: ["Digital (search & social)", "رقمي (بحث وتواصل)"], INFLUENCER: ["Influencers", "مؤثرون"], PORTAL: ["Property portals", "بوابات عقارية"],
  BROKER: ["Broker networks", "شبكات الوسطاء"], PR: ["PR & media", "علاقات عامة وإعلام"], OUTDOOR: ["Outdoor", "إعلانات خارجية"],
  EVENT: ["Events & expos", "فعاليات ومعارض"], RADIO: ["Radio", "إذاعة"],
};
export const SEASON_LABEL: Record<string, [string, string]> = {
  LAUNCH: ["Launch", "إطلاق"], RAMADAN: ["Ramadan", "رمضان"], SUMMER: ["Summer", "الصيف"], ALWAYS_ON: ["Always-on", "مستمرة"], EVENT: ["Event", "فعالية"], BRAND: ["Brand", "علامة تجارية"],
};
export const familyOf = (channel: string) => FAMILY[channel] ?? "OTHER";

type Seed = [code: string, name: string, nameAr: string, project: string, vendor: string, channel: string, season: string, start: string, end: string, budgetK: number, spendK: number, leads: number, qualified: number, viewings: number, contracts: number, salesM: number, lesson: string, lessonAr: string];

// Sample history. Figures are illustrative but internally consistent (spend → leads → qualified → viewings → contracts → sales).
const SEED: Seed[] = [
  // ---- 2023: Palm Villas (sold out April 2024) and the corporate brand
  ["PLM-LAUNCH-23", "Palm Villas — Digital launch", "فلل النخيل — الإطلاق الرقمي", "Palm Villas", "Najm Media", "Google / Meta", "LAUNCH", "2023-01", "2023-03", 380, 370, 2900, 470, 160, 9, 20,
    "Villa buyers needed to see the product: digital gave volume but few contracts until the show villa opened.", "احتاج مشترو الفلل إلى رؤية المنتج: أعطى الإعلان الرقمي حجماً لكن عقوداً قليلة حتى افتتاح الفيلا النموذجية."],
  ["PLM-OPENDAYS-23", "Palm Villas — Show-villa open days", "فلل النخيل — أيام مفتوحة في الفيلا النموذجية", "Palm Villas", "Wajha Events", "Event", "EVENT", "2023-02", "2023-02", 220, 230, 520, 330, 260, 16, 36,
    "Open days at the show villa closed 16 villas in one month (0.6% cost to sales) — the best result of 2023.", "أغلقت الأيام المفتوحة في الفيلا النموذجية 16 فيلا في شهر واحد (0.6% من المبيعات) — أفضل نتيجة في 2023."],
  ["PLM-BROKER-23", "Palm Villas — Broker network 2023", "فلل النخيل — شبكة الوسطاء 2023", "Palm Villas", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2023-01", "2023-12", 900, 880, 980, 640, 470, 38, 84,
    "Brokers sold most villas at about 1.0% cost to sales.", "باع الوسطاء معظم الفلل بنسبة تقارب 1.0% من المبيعات."],
  ["PLM-RAMADAN-23", "Palm Villas — Ramadan 2023", "فلل النخيل — رمضان 2023", "Palm Villas", "Najm Media", "Google / Meta", "RAMADAN", "2023-03", "2023-04", 240, 240, 2400, 380, 110, 5, 11,
    "Ramadan without an offer: cheap leads, few contracts (2.2% cost to sales). The 2025 payment-plan offer fixed this.", "رمضان دون عرض: عملاء رخيصون وعقود قليلة (2.2% من المبيعات). عالج عرض خطة السداد في 2025 ذلك."],
  ["PLM-PORTAL-23", "Palm Villas — Portal listings 2023", "فلل النخيل — إعلانات البوابات 2023", "Palm Villas", "PropertyHub KSA", "Portal", "ALWAYS_ON", "2023-01", "2023-12", 460, 450, 3800, 860, 300, 14, 30,
    "Portals were steady at 1.5% cost to sales; villa listings with video tours got twice the enquiries.", "كانت البوابات ثابتة بنسبة 1.5% من المبيعات؛ وحصلت إعلانات الفلل المصحوبة بجولات فيديو على ضعف الاستفسارات."],
  ["PLM-OOH-23", "Palm Villas — Highway billboards", "فلل النخيل — لوحات الطرق السريعة", "Palm Villas", "Hajar Outdoor", "OOH", "BRAND", "2023-04", "2023-06", 300, 300, 180, 50, 20, 2, 4.4,
    "Highway billboards cost 6.8% of sales and could not be tracked.", "كلّفت لوحات الطرق السريعة 6.8% من المبيعات وتعذّر تتبعها."],
  ["PLM-RETARGET-23", "Palm Villas — Retargeting 2023", "فلل النخيل — إعادة الاستهداف 2023", "Palm Villas", "Najm Media", "Google / Meta", "ALWAYS_ON", "2023-05", "2023-12", 110, 105, 800, 220, 90, 5, 10.5,
    "Retargeting visitors of the villa pages was the cheapest digital source (1.0% cost to sales).", "كانت إعادة استهداف زوار صفحات الفلل أرخص مصدر رقمي (1.0% من المبيعات)."],
  ["PLM-SUMMER-23", "Palm Villas — Summer 2023", "فلل النخيل — صيف 2023", "Palm Villas", "Najm Media", "Google / Meta", "SUMMER", "2023-07", "2023-08", 200, 200, 1900, 240, 60, 2, 4.6,
    "Summer was weak already in 2023: 4.3% cost to sales.", "كان الصيف ضعيفاً منذ 2023: 4.3% من المبيعات."],
  ["PLM-CREATOR-23", "Palm Villas — Family creators", "فلل النخيل — صنّاع محتوى عائليون", "Palm Villas", "Sada Influence", "Instagram / TikTok", "BRAND", "2023-10", "2023-11", 120, 120, 700, 120, 40, 2, 4.0,
    "Family creators touring the villa built awareness (3.0% cost to sales); the tours were reused in ads.", "بنت جولات صنّاع المحتوى العائليين في الفيلا الوعي (3.0% من المبيعات)؛ وأُعيد استخدام الجولات في الإعلانات."],
  ["BRAND-PR-23", "Corporate brand — Developer story", "العلامة المؤسسية — قصة المطوّر", "All projects", "Nakhla Communications", "PR", "BRAND", "2023-05", "2023-07", 180, 180, 300, 90, 40, 3, 6.5,
    "The developer story in business media lifted trust ahead of Ash Shati; direct sales were small (2.8%).", "رفعت قصة المطوّر في الإعلام الاقتصادي الثقة قبل الشاطئ؛ وكانت المبيعات المباشرة محدودة (2.8%)."],
  ["BRAND-RADIO-23", "Corporate brand — Radio 2023", "العلامة المؤسسية — الإذاعة 2023", "All projects", "Sawt FM", "Radio", "BRAND", "2023-09", "2023-10", 160, 160, 120, 30, 10, 1, 1.3,
    "Brand radio did not pay back (12.3% cost to sales).", "لم تحقق إذاعة العلامة عائداً (12.3% من المبيعات)."],
  ["CITYSCAPE-23", "Cityscape Global 2023 (Riyadh)", "سيتي سكيب جلوبال 2023 (الرياض)", "All projects", "Wajha Events", "Event", "EVENT", "2023-09", "2023-09", 450, 470, 1300, 520, 260, 12, 30,
    "Riyadh buyers and investors: the stand cost more per contract than Jeddah events (1.6%) but opened the investor segment.", "مشترو الرياض والمستثمرون: كلّف الجناح أكثر لكل عقد من فعاليات جدة (1.6%) لكنه فتح شريحة المستثمرين."],
  // ---- 2024 additions
  ["PLM-CLOSEOUT-24", "Palm Villas — Last villas close-out", "فلل النخيل — بيع آخر الفلل", "Palm Villas", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2024-01", "2024-04", 260, 250, 300, 210, 160, 11, 25,
    "The last 11 villas sold through brokers with a price lock; the project sold out in April 2024.", "بيعت آخر 11 فيلا عبر الوسطاء مع تثبيت السعر؛ واكتمل بيع المشروع في أبريل 2024."],
  ["ASH-RETARGET-24", "Ash Shati — Retargeting 2024", "الشاطئ — إعادة الاستهداف 2024", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "ALWAYS_ON", "2024-05", "2024-12", 120, 115, 850, 230, 95, 6, 9.2,
    "Retargeting kept converting at 1.3% cost to sales.", "واصلت إعادة الاستهداف التحويل بنسبة 1.3% من المبيعات."],
  ["MAR-PRESALE-24", "Marina Tower — VIP pre-sale evening", "برج المارينا — أمسية البيع المسبق لكبار العملاء", "Marina Tower", "Wajha Events", "Event", "LAUNCH", "2024-10", "2024-10", 160, 170, 220, 150, 110, 8, 22,
    "An invitation-only evening for past buyers and brokers sold 8 units at 0.8% cost to sales.", "باعت أمسية بالدعوة لمشترين سابقين ووسطاء 8 وحدات بنسبة 0.8% من المبيعات."],
  ["CITYSCAPE-24", "Cityscape Global 2024 (Riyadh)", "سيتي سكيب جلوبال 2024 (الرياض)", "All projects", "Wajha Events", "Event", "EVENT", "2024-11", "2024-11", 520, 540, 1500, 640, 330, 16, 48,
    "Cityscape 2024 brought Riyadh investors to Marina Tower: 16 contracts at 1.1% cost to sales.", "جلب سيتي سكيب 2024 مستثمري الرياض إلى برج المارينا: 16 عقداً بنسبة 1.1% من المبيعات."],
  // ---- 2025 additions
  ["MAR-OOH-25", "Marina Tower — Corniche billboards 2025", "برج المارينا — لوحات الكورنيش 2025", "Marina Tower", "Hajar Outdoor", "OOH", "BRAND", "2025-03", "2025-05", 330, 330, 240, 55, 22, 2, 4.4,
    "The second billboard flight repeated the first: 7.5% cost to sales — the basis of the 2026 exit decision.", "كرّرت الحملة الثانية للوحات نتيجة الأولى: 7.5% من المبيعات — وهو أساس قرار الخروج في 2026."],
  ["MAR-CREATOR-25", "Marina Tower — Lifestyle creators", "برج المارينا — صنّاع محتوى أسلوب الحياة", "Marina Tower", "Sada Influence", "Instagram / TikTok", "BRAND", "2025-04", "2025-06", 130, 130, 800, 140, 50, 2, 5.2,
    "Creators worked better for the tower's large units (2.5%) than for Ash Shati, but still behind brokers.", "نجح صنّاع المحتوى مع وحدات البرج الكبيرة (2.5%) أكثر من الشاطئ، لكنهم بقوا خلف الوسطاء."],
  ["MAR-BROKER-25H2", "Marina Tower — Broker network H2 2025", "برج المارينا — شبكة الوسطاء النصف الثاني 2025", "Marina Tower", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2025-07", "2025-12", 600, 590, 480, 330, 250, 15, 47,
    "Brokers kept the tower selling through the summer at 1.3% cost to sales.", "أبقى الوسطاء مبيعات البرج مستمرة خلال الصيف بنسبة 1.3% من المبيعات."],
  ["CITYSCAPE-25", "Cityscape Global 2025 (Riyadh)", "سيتي سكيب جلوبال 2025 (الرياض)", "All projects", "Wajha Events", "Event", "EVENT", "2025-11", "2025-11", 560, 580, 1700, 700, 360, 17, 52,
    "Cityscape 2025: 17 contracts at 1.1%; investors asked for rental guarantees.", "سيتي سكيب 2025: 17 عقداً بنسبة 1.1%؛ وطلب المستثمرون ضمانات إيجار."],
  ["AND-BROKER-25", "Andalus — Broker pre-sales", "الأندلس — البيع المسبق عبر الوسطاء", "Andalus Quarter", "Mubasher Brokerage Network", "Broker network", "LAUNCH", "2025-11", "2025-12", 180, 170, 210, 140, 90, 4, 3.6,
    "Even brokers struggled to pre-sell Andalus before show units existed (4.7% cost to sales).", "واجه حتى الوسطاء صعوبة في البيع المسبق للأندلس قبل وجود وحدات نموذجية (4.7% من المبيعات)."],
  ["ASH-PRELAUNCH-24", "Ash Shati — Pre-launch register interest", "الشاطئ — التسجيل المسبق للاهتمام", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "LAUNCH", "2024-01", "2024-03", 450, 420, 3900, 820, 260, 18, 27,
    "Pre-launch digital built the waiting list cheaply; most contracts came after the launch event.", "بنى الإعلان الرقمي قبل الإطلاق قائمة الانتظار بتكلفة منخفضة؛ وجاءت أغلب العقود بعد فعالية الإطلاق."],
  ["ASH-LAUNCH-EVENT-24", "Ash Shati — Launch event", "الشاطئ — فعالية الإطلاق", "Ash Shati Residences", "Wajha Events", "Event", "EVENT", "2024-03", "2024-03", 300, 310, 640, 380, 240, 22, 33,
    "The launch event converted the pre-launch list: 22 contracts in one month at 0.9% cost to sales.", "حوّلت فعالية الإطلاق قائمة ما قبل الإطلاق: 22 عقداً في شهر واحد بنسبة تكلفة إلى مبيعات 0.9%."],
  ["ASH-BROKER-24", "Ash Shati — Broker network 2024", "الشاطئ — شبكة الوسطاء 2024", "Ash Shati Residences", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2024-02", "2024-12", 1000, 980, 1100, 690, 520, 61, 88,
    "Brokers delivered the most contracts at a steady ~1.1% cost to sales (commission-based).", "حقق الوسطاء أكبر عدد من العقود بنسبة ثابتة تقارب 1.1% من المبيعات (قائم على العمولة)."],
  ["ASH-RAMADAN-24", "Ash Shati — Ramadan 2024", "الشاطئ — رمضان 2024", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "RAMADAN", "2024-03", "2024-04", 260, 260, 2600, 470, 140, 9, 13,
    "Ramadan brought cheap leads but fewer contracts in-month; contracts followed 4–8 weeks later.", "جلب رمضان عملاء محتملين بتكلفة منخفضة لكن بعقود أقل خلال الشهر؛ وجاءت العقود بعد 4–8 أسابيع."],
  ["ASH-PORTAL-24", "Ash Shati — Portal listings 2024", "الشاطئ — إعلانات البوابات 2024", "Ash Shati Residences", "PropertyHub KSA", "Portal", "ALWAYS_ON", "2024-01", "2024-12", 540, 520, 4800, 1150, 410, 24, 34,
    "Portals gave steady volume at ~1.5% cost to sales; featured slots mattered more than listing count.", "وفّرت البوابات حجماً ثابتاً بنسبة تقارب 1.5% من المبيعات؛ وكانت المواقع المميزة أهم من عدد الإعلانات."],
  ["ASH-RADIO-24", "Ash Shati — Radio spots", "الشاطئ — إعلانات إذاعية", "Ash Shati Residences", "Sawt FM", "Radio", "BRAND", "2024-05", "2024-06", 180, 180, 150, 40, 12, 1, 1.4,
    "Radio did not pay back: 12.9% cost to sales and almost no trackable leads. Not repeated.", "لم تحقق الإذاعة عائداً: 12.9% من المبيعات وعملاء محتملون قابلون للتتبع شبه معدومين. لم تتكرر."],
  ["ASH-SUMMER-24", "Ash Shati — Summer 2024", "الشاطئ — صيف 2024", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "SUMMER", "2024-07", "2024-08", 220, 210, 2100, 300, 80, 4, 5.8,
    "Summer digital was the weakest period: 3.6% cost to sales; buyers travel and decisions slip to September.", "كان الصيف أضعف فترة للإعلان الرقمي: 3.6% من المبيعات؛ إذ يسافر المشترون وتتأخر القرارات إلى سبتمبر."],
  ["ASH-CREATOR-24", "Ash Shati — Creators pilot", "الشاطئ — تجربة صنّاع المحتوى", "Ash Shati Residences", "Sada Influence", "Instagram / TikTok", "BRAND", "2024-09", "2024-11", 150, 150, 900, 170, 60, 3, 4.2,
    "Creators built awareness but converted weakly (3.6% cost to sales); worked best paired with retargeting.", "بنى صنّاع المحتوى الوعي لكن تحويلهم كان ضعيفاً (3.6% من المبيعات)؛ وكان الأفضل مع إعادة الاستهداف."],
  ["MAR-TEASER-24", "Marina Tower — Launch PR", "برج المارينا — علاقات عامة للإطلاق", "Marina Tower", "Nakhla Communications", "PR", "LAUNCH", "2024-09", "2024-11", 210, 210, 380, 120, 70, 6, 14,
    "PR for the tower launch reached high-value buyers: few leads but large tickets (1.5% cost to sales).", "وصلت العلاقات العامة لإطلاق البرج إلى مشترين ذوي قيمة عالية: عملاء أقل لكن صفقات كبيرة (1.5% من المبيعات)."],
  ["MAR-OOH-24", "Marina Tower — Corniche billboards 2024", "برج المارينا — لوحات الكورنيش 2024", "Marina Tower", "Hajar Outdoor", "OOH", "BRAND", "2024-10", "2024-12", 360, 360, 260, 60, 25, 2, 4.6,
    "Billboards were expensive per contract (7.8% cost to sales) and hard to attribute.", "كانت اللوحات مكلفة لكل عقد (7.8% من المبيعات) ويصعب نسبها."],
  ["MAR-LAUNCH-24", "Marina Tower — Digital launch", "برج المارينا — الإطلاق الرقمي", "Marina Tower", "Najm Media", "Google / Meta", "LAUNCH", "2024-11", "2025-01", 400, 380, 3100, 420, 120, 7, 15,
    "High lead volume, low quality (13.5% qualified); the agency was replaced in 2025.", "حجم كبير من العملاء المحتملين بجودة منخفضة (13.5% مؤهلون)؛ واستُبدلت الوكالة في 2025."],
  ["MAR-BROKER-25H1", "Marina Tower — Broker network H1 2025", "برج المارينا — شبكة الوسطاء النصف الأول 2025", "Marina Tower", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2025-01", "2025-06", 650, 640, 520, 330, 260, 21, 52,
    "Brokers sold the tower's larger units at 1.2% cost to sales.", "باع الوسطاء الوحدات الأكبر في البرج بنسبة 1.2% من المبيعات."],
  ["MAR-RAMADAN-25", "Marina Tower — Ramadan 2025 payment plan", "برج المارينا — خطة سداد رمضان 2025", "Marina Tower", "Tasweeq Digital", "Google / Meta", "RAMADAN", "2025-02", "2025-03", 300, 300, 2500, 560, 210, 11, 26,
    "Best Ramadan so far: a payment-plan offer lifted the qualified rate to 22% (1.2% cost to sales).", "أفضل رمضان حتى الآن: رفع عرض خطة السداد نسبة المؤهلين إلى 22% (1.2% من المبيعات)."],
  ["ASH-RAMADAN-25", "Ash Shati — Ramadan 2025", "الشاطئ — رمضان 2025", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "RAMADAN", "2025-02", "2025-03", 240, 240, 2300, 520, 170, 12, 17,
    "Repeating the payment-plan message worked for Ash Shati too: 1.4% cost to sales vs 2.0% in Ramadan 2024.", "نجح تكرار رسالة خطة السداد للشاطئ أيضاً: 1.4% من المبيعات مقابل 2.0% في رمضان 2024."],
  ["ASH-PORTAL-25", "Ash Shati — Portal listings 2025", "الشاطئ — إعلانات البوابات 2025", "Ash Shati Residences", "PropertyHub KSA", "Portal", "ALWAYS_ON", "2025-01", "2025-12", 580, 560, 5100, 1300, 470, 27, 39,
    "Portals held at ~1.4% cost to sales; response time to portal leads drove conversion.", "حافظت البوابات على نحو 1.4% من المبيعات؛ وكان زمن الرد على عملائها هو محرك التحويل."],
  ["ASH-BROKER-25", "Ash Shati — Broker network 2025", "الشاطئ — شبكة الوسطاء 2025", "Ash Shati Residences", "Mubasher Brokerage Network", "Broker network", "ALWAYS_ON", "2025-01", "2025-12", 1080, 1050, 1200, 760, 580, 66, 95,
    "Brokers remained the backbone: 66 contracts at 1.1% cost to sales.", "ظل الوسطاء العمود الفقري: 66 عقداً بنسبة 1.1% من المبيعات."],
  ["MAR-PORTAL-25", "Marina Tower — Portal listings 2025", "برج المارينا — إعلانات البوابات 2025", "Marina Tower", "PropertyHub KSA", "Portal", "ALWAYS_ON", "2025-04", "2025-12", 420, 410, 2900, 640, 230, 13, 31,
    "Portals worked for the tower at 1.3% cost to sales.", "نجحت البوابات للبرج بنسبة 1.3% من المبيعات."],
  ["ASH-SUMMER-25", "Ash Shati — Summer creators 2025", "الشاطئ — صنّاع المحتوى صيف 2025", "Ash Shati Residences", "Sada Influence", "Instagram / TikTok", "SUMMER", "2025-06", "2025-08", 140, 140, 1000, 150, 50, 2, 2.9,
    "Summer again underperformed: 4.8% cost to sales. Better to hold budget for September.", "تكرر ضعف الصيف: 4.8% من المبيعات. الأفضل الاحتفاظ بالميزانية لسبتمبر."],
  ["ASH-RETARGET-25", "Ash Shati — Retargeting 2025", "الشاطئ — إعادة الاستهداف 2025", "Ash Shati Residences", "Tasweeq Digital", "Google / Meta", "ALWAYS_ON", "2025-04", "2025-12", 130, 120, 900, 260, 110, 8, 11,
    "Retargeting site visitors was the cheapest digital source of contracts (1.1% cost to sales).", "كانت إعادة استهداف زوار الموقع أرخص مصدر رقمي للعقود (1.1% من المبيعات)."],
  ["AND-TEASER-25", "Andalus — Teaser & register interest", "الأندلس — التشويق والتسجيل المسبق", "Andalus Quarter", "Tasweeq Digital", "Meta / Snap", "LAUNCH", "2025-09", "2025-11", 340, 330, 3600, 520, 120, 5, 4.1,
    "Andalus pre-launch built a large list but quality was low (14% qualified) — an early warning for the 2026 launch funnel.", "بنى ما قبل إطلاق الأندلس قائمة كبيرة بجودة منخفضة (14% مؤهلون) — إنذار مبكر لمسار إطلاق 2026."],
  ["AND-PR-25", "Andalus — Pre-launch PR", "الأندلس — علاقات عامة قبل الإطلاق", "Andalus Quarter", "Nakhla Communications", "PR", "LAUNCH", "2025-10", "2025-12", 150, 150, 210, 60, 30, 2, 1.7,
    "Pre-launch PR built awareness; direct sales impact was small (8.8% cost to sales).", "بنت العلاقات العامة قبل الإطلاق الوعي؛ وكان أثرها المباشر على المبيعات محدوداً (8.8% من المبيعات)."],
  ["MAR-EXPO-25", "Marina Tower — Jeddah Property Expo 2025", "برج المارينا — معرض جدة العقاري 2025", "Marina Tower", "Wajha Events", "Event", "EVENT", "2025-10", "2025-10", 280, 280, 900, 410, 300, 14, 36,
    "The expo was the best-converting activity of 2025: 14 contracts at 0.8% cost to sales.", "كان المعرض الأعلى تحويلاً في 2025: 14 عقداً بنسبة 0.8% من المبيعات."],
];

function monthsBetween(a: string, b: string) {
  const out: string[] = [];
  const d = new Date(`${a}-01T00:00:00Z`);
  while (d.toISOString().slice(0, 7) <= b) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}
/** Split totals over the months (ramp-up in the first month, slightly stronger later months). */
function spread(s: Seed) {
  const ms = monthsBetween(s[7], s[8]);
  const w = ms.map((_, i) => (ms.length === 1 ? 1 : i === 0 ? 0.7 : 1 + i * 0.03));
  const tw = w.reduce((x, y) => x + y, 0);
  const part = (total: number, i: number, dec = 0) => Math.round((total * w[i]) / tw * 10 ** dec) / 10 ** dec;
  // The last month takes the rounding remainder, so the months always add up exactly to the campaign's totals.
  const split = (total: number, dec = 0) => { const xs = ms.map((_, i) => part(total, i, dec)); xs[xs.length - 1] = Math.round((total - xs.slice(0, -1).reduce((a, b) => a + b, 0)) * 10 ** dec) / 10 ** dec; return xs; };
  const [sp, ld, ql, ct, sl] = [split(s[10], 1), split(s[11]), split(s[12]), split(s[14]), split(s[15], 1)];
  return ms.map((month, i) => ({ month, spendK: sp[i], leads: ld[i], qualified: ql[i], contracts: ct[i], salesM: sl[i] }));
}

export const ensureHistory = single(async function ensureHistoryImpl() {
  // Adds any sample campaign not stored yet (so an existing database picks up newly added history too).
  const have = new Set((await prisma.pastCampaign.findMany()).map((r) => r.code));
  for (const s of SEED.filter((x) => !have.has(x[0])))
    await prisma.pastCampaign.create({ data: {
      code: s[0], name: s[1], nameAr: s[2], project: s[3], vendor: s[4], channel: s[5], season: s[6], startMonth: s[7], endMonth: s[8],
      budgetK: s[9], spendK: s[10], leads: s[11], qualified: s[12], viewings: s[13], contracts: s[14], salesM: s[15], months: JSON.stringify(spread(s)), lesson: s[16], lessonAr: s[17],
    } });
});

// ------------------------------------------------------------------ metrics
const r1 = (x: number) => Math.round(x * 10) / 10;
export type Kpis = { spendK: number; leads: number; qualified: number; contracts: number; salesM: number; costToSalesPct: number | null; cplSAR: number | null; cpqlSAR: number | null; qualPct: number | null; closePct: number | null };
export function kpis(x: { spendK: number; leads: number; qualified: number; contracts: number; salesM: number }): Kpis {
  return {
    spendK: r1(x.spendK), leads: x.leads, qualified: x.qualified, contracts: x.contracts, salesM: r1(x.salesM),
    costToSalesPct: x.salesM > 0 ? r1((x.spendK / (x.salesM * 1000)) * 100) : null,
    cplSAR: x.leads ? Math.round((x.spendK * 1000) / x.leads) : null,
    cpqlSAR: x.qualified ? Math.round((x.spendK * 1000) / x.qualified) : null,
    qualPct: x.leads ? r1((x.qualified / x.leads) * 100) : null,
    closePct: x.qualified ? r1((x.contracts / x.qualified) * 100) : null,
  };
}
const sum = (rows: { spendK: number; leads: number; qualified: number; contracts: number; salesM: number }[]) =>
  rows.reduce((a, r) => ({ spendK: a.spendK + r.spendK, leads: a.leads + r.leads, qualified: a.qualified + r.qualified, contracts: a.contracts + r.contracts, salesM: a.salesM + r.salesM }), { spendK: 0, leads: 0, qualified: 0, contracts: 0, salesM: 0 });

export async function pastCampaigns() {
  await ensureHistory();
  return (await prisma.pastCampaign.findMany()).sort((a, b) => a.startMonth.localeCompare(b.startMonth));
}

/** Benchmark for a channel family (optionally a season): pooled cost to sales, cost per qualified lead, qualified rate. */
export async function benchmark(family: string, season?: string) {
  const rows = (await pastCampaigns()).filter((c) => (family === "ALL" || familyOf(c.channel) === family) && (!season || c.season === season));
  return rows.length ? { n: rows.length, ...kpis(sum(rows)), campaigns: rows.map((c) => c.code) } : null;
}

export async function historyState(lang: Lang) {
  const all = await pastCampaigns();
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (s: string) => nm(lang, s);
  const rows = all.map((c) => ({
    code: c.code, name: lang === "ar" ? c.nameAr : c.name, project: N(c.project), projectKey: c.project, vendor: N(c.vendor), vendorKey: c.vendor,
    channel: N(c.channel), family: familyOf(c.channel), season: c.season, seasonLabel: tx(lang, ...(SEASON_LABEL[c.season] ?? [c.season, c.season])),
    start: c.startMonth, end: c.endMonth, year: c.startMonth.slice(0, 4), budgetK: c.budgetK, ...kpis(c), lesson: lang === "ar" ? c.lessonAr : c.lesson,
    // Recomputed from the seed when known, so rows stored before a fix to the split pick it up too.
    months: (() => { const sd = SEED.find((x) => x[0] === c.code); return sd ? spread(sd) : JSON.parse(c.months); })(),
  }));
  const groupBy = (key: (c: (typeof all)[number]) => string, label: (k: string) => string) => {
    const m = new Map<string, typeof all>();
    for (const c of all) (m.get(key(c)) ?? m.set(key(c), []).get(key(c))!).push(c);
    return [...m.entries()].map(([k, cs]) => ({ key: k, label: label(k), campaigns: cs.length, ...kpis(sum(cs)) })).sort((a, b) => (a.costToSalesPct ?? 99) - (b.costToSalesPct ?? 99));
  };
  const byFamily = groupBy((c) => familyOf(c.channel), (k) => tx(lang, ...(FAMILY_LABEL[k] ?? [k, k])));
  const bySeason = groupBy((c) => c.season, (k) => tx(lang, ...(SEASON_LABEL[k] ?? [k, k])));
  const byYear = groupBy((c) => c.startMonth.slice(0, 4), (k) => k).sort((a, b) => a.key.localeCompare(b.key));
  const byProject = groupBy((c) => c.project, (k) => N(k));
  const byVendor = groupBy((c) => c.vendor, (k) => N(k));
  const total = kpis(sum(all));

  // Lessons the agent draws from the history (all computed from the rows above).
  const fam = (k: string) => byFamily.find((x) => x.key === k);
  const best = [...rows].filter((r) => r.costToSalesPct !== null).sort((a, b) => a.costToSalesPct! - b.costToSalesPct!);
  const ram = bySeason.find((x) => x.key === "RAMADAN"), sum_ = bySeason.find((x) => x.key === "SUMMER");
  const digital = fam("DIGITAL");
  const y24 = byYear.find((x) => x.key === "2024"), y25 = byYear.find((x) => x.key === "2025");
  const lessons = [
    best[0] && T(`Best-converting activity: ${best[0].name} (${best[0].costToSalesPct}% cost to sales, ${best[0].contracts} contracts). Events and brokers convert best.`, `النشاط الأعلى تحويلاً: ${best[0].name} (${best[0].costToSalesPct}% من المبيعات، ${best[0].contracts} عقداً). الفعاليات والوسطاء الأعلى تحويلاً.`),
    fam("BROKER") && T(`Brokers are the backbone: ${fam("BROKER")!.contracts} contracts at ${fam("BROKER")!.costToSalesPct}% cost to sales across ${fam("BROKER")!.campaigns} campaigns.`, `الوسطاء هم العمود الفقري: ${fam("BROKER")!.contracts} عقداً بنسبة ${fam("BROKER")!.costToSalesPct}% من المبيعات عبر ${fam("BROKER")!.campaigns} حملات.`),
    ram && digital && T(`Ramadan digital runs at ${ram.costToSalesPct}% cost to sales vs ${digital.costToSalesPct}% for digital overall; a payment-plan offer lifted the qualified rate to 22% in 2025.`, `يعمل الإعلان الرقمي في رمضان بنسبة ${ram.costToSalesPct}% من المبيعات مقابل ${digital.costToSalesPct}% للرقمي عموماً؛ ورفع عرض خطة السداد نسبة المؤهلين إلى 22% في 2025.`),
    sum_ && T(`Summer is the weakest season: ${sum_.costToSalesPct}% cost to sales in July–August — hold budget for September.`, `الصيف أضعف المواسم: ${sum_.costToSalesPct}% من المبيعات في يوليو وأغسطس — احتفظوا بالميزانية لسبتمبر.`),
    fam("RADIO") && fam("OUTDOOR") && T(`Radio (${fam("RADIO")!.costToSalesPct}%) and billboards (${fam("OUTDOOR")!.costToSalesPct}%) were the most expensive per sale and the hardest to track.`, `كانت الإذاعة (${fam("RADIO")!.costToSalesPct}%) واللوحات (${fam("OUTDOOR")!.costToSalesPct}%) الأعلى تكلفة لكل بيع والأصعب تتبعاً.`),
    T("High lead volume with a low qualified rate (Najm Media 2024, Andalus teaser 2025) predicted weak sales — watch the qualified rate in the first month.", "تنبأ الحجم الكبير من العملاء المحتملين مع نسبة مؤهلين منخفضة (نجم ميديا 2024، تشويق الأندلس 2025) بمبيعات ضعيفة — راقبوا نسبة المؤهلين في الشهر الأول."),
    y24 && y25 && T(`2025 vs 2024: ${M("en", y25.salesM)} sales at ${y25.costToSalesPct}% cost to sales, vs ${M("en", y24.salesM)} at ${y24.costToSalesPct}%.`, `2025 مقابل 2024: ${M("ar", y25.salesM)} مبيعات بنسبة ${y25.costToSalesPct}% من المبيعات، مقابل ${M("ar", y24.salesM)} بنسبة ${y24.costToSalesPct}%.`),
  ].filter(Boolean) as string[];

  return {
    total: { campaigns: all.length, ...total, from: all[0]?.startMonth ?? "", to: all.reduce((m, c) => (c.endMonth > m ? c.endMonth : m), "") },
    rows, byFamily, bySeason, byYear, byProject, byVendor, lessons,
  };
}
export type HistoryState = Awaited<ReturnType<typeof historyState>>;
