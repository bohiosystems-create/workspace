// Live news for Kinan's focus cities (Jeddah and Riyadh by default; NEWS_CITIES to change). Read from Google News
// (RSS, English and Arabic, no key needed) every few hours, sorted into what matters to a property marketer —
// real estate and prices, financing, regulation, infrastructure, events and seasons, developers — and turned into
// signals the daily scan answers with initiatives. Headlines and links only; the article stays on the publisher's site.
//
//   NEWS_MODE=live      (default) read the feeds; if they can't be reached, fall back to the snapshot below
//   NEWS_MODE=snapshot  only the snapshot (offline demos)
//   NEWS_MODE=off       no news
//
// The snapshot is real news gathered on 3 Oct 2026 (each with its publisher and link), so the offline demo and the
// Claude app edition — which cannot reach the internet — still show proposals based on actual market news.
import { getSettings, settingsCached } from "./integrations";
type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const DAY = 86_400_000;

export type NewsTopic = "REAL_ESTATE" | "FINANCE" | "REGULATION" | "INFRASTRUCTURE" | "EVENT" | "DEVELOPER" | "ECONOMY";
export type NewsItem = {
  id: string; title: Bi; summary: Bi | null; publisher: string; url: string; date: string; city: string | null; topic: NewsTopic;
  direction: "up" | "down"; project: string | null; lang: "en" | "ar"; score: number;
};
export const TOPIC_LABEL: Record<NewsTopic, Bi> = {
  REAL_ESTATE: bi("Property market", "السوق العقاري"), FINANCE: bi("Financing & rates", "التمويل والفائدة"), REGULATION: bi("Regulation", "الأنظمة"),
  INFRASTRUCTURE: bi("Infrastructure", "البنية التحتية"), EVENT: bi("Events & seasons", "الفعاليات والمواسم"), DEVELOPER: bi("Developers", "المطورون"), ECONOMY: bi("Economy", "الاقتصاد"),
};

// ------------------------------------------------------------------ snapshot (real news, gathered 3 Oct 2026)
export const SNAPSHOT_DATE = "2026-10-03";
const S = (x: Omit<NewsItem, "score" | "lang"> & { lang?: "en" | "ar" }): NewsItem => ({ lang: "en", score: 0, ...x });
export const NEWS_SNAPSHOT: NewsItem[] = [
  S({ id: "snap-riyadh-season", city: "Riyadh", topic: "EVENT", direction: "up", project: null, date: "2026-09-29", publisher: "TradeArabia / Gulf News", url: "https://www.tradearabia.com/News/486894/Riyadh-Season-2026-to-open-on-October-21",
    title: bi("Riyadh Season 2026 opens on 21 October with ten weeks of entertainment", "موسم الرياض 2026 ينطلق في 21 أكتوبر بعشرة أسابيع من الترفيه"),
    summary: bi("The General Entertainment Authority set the seventh edition (“Big Time”) for 21 October: boxing, UFC, WWE Crown Jewel (7 Nov), the Six Kings Slam (21–24 Oct), concerts and family attractions.", "حددت الهيئة العامة للترفيه انطلاق النسخة السابعة («بيق تايم») في 21 أكتوبر: ملاكمة وUFC وكراون جول (7 نوفمبر) وبطولة الملوك الستة (21–24 أكتوبر) وحفلات وفعاليات عائلية.") }),
  S({ id: "snap-cityscape", city: "Riyadh", topic: "EVENT", direction: "up", project: null, date: "2026-09-30", publisher: "Cityscape Global", url: "https://cityscapeglobal.com/why-visit",
    title: bi("Cityscape Global 2026: 16–19 November at Malham, Riyadh — exhibitor list published", "سيتي سكيب جلوبال 2026: 16–19 نوفمبر في ملهم بالرياض — نُشرت قائمة العارضين"),
    summary: bi("The Kingdom's largest property show returns to the Riyadh Exhibition & Convention Centre; developers are confirming stands now.", "يعود أكبر معرض عقاري في المملكة إلى مركز الرياض للمعارض والمؤتمرات؛ والمطورون يؤكدون أجنحتهم الآن.") }),
  S({ id: "snap-jed-t4", city: "Jeddah", topic: "INFRASTRUCTURE", direction: "up", project: "Ash Shati Residences", date: "2026-09-27", publisher: "Wego Travel", url: "https://blog.wego.com/jeddah-airport-terminal-4",
    title: bi("Jeddah airport Terminal 4 opens its first phase", "مطار جدة: افتتاح المرحلة الأولى من الصالة 4"),
    summary: bi("King Abdulaziz International Airport started Terminal 4 operations on 27 September (Wizz Air, AJet, SalamAir moved first), part of the plan to handle 90+ million passengers a year by 2030.", "بدأ مطار الملك عبدالعزيز الدولي تشغيل الصالة 4 في 27 سبتمبر (انتقلت ويز إير وأجت وسلام إير أولاً) ضمن خطة استيعاب أكثر من 90 مليون مسافر سنوياً بحلول 2030.") }),
  S({ id: "snap-jed-weekly", city: "Jeddah", topic: "REAL_ESTATE", direction: "up", project: null, date: "2026-09-28", publisher: "Amlak", url: "https://amlak.net.sa/en/109663/",
    title: bi("Jeddah leads Saudi real-estate transactions through September", "جدة تتصدر الصفقات العقارية في المملكة خلال سبتمبر"),
    summary: bi("Amlak's weekly roundups: Jeddah topped the transaction tables in several September weeks (819 deals worth SAR 950M in one week; 464 deals worth SAR 610M in late September, average SAR 3,042/sqm); Al-Safa and Al-Salamah among the most active districts.", "ملخصات أملاك الأسبوعية: تصدّرت جدة جداول الصفقات في عدة أسابيع من سبتمبر (819 صفقة بقيمة 950 مليون ر.س في أسبوع؛ و464 صفقة بقيمة 610 ملايين ر.س أواخر سبتمبر بمتوسط 3,042 ر.س/م²)، ومن أنشط الأحياء الصفا والسلامة.") }),
  S({ id: "snap-sama", city: null, topic: "FINANCE", direction: "up", project: null, date: "2026-09-30", publisher: "Bayut / SAMA", url: "https://www.bayut.sa/blog/en/marketing-intelligence/saudi-arabia-mortgage-2026-rates-redf-and-expat-home-loans/",
    title: bi("SAMA holds its repo rate at 4.25%; bank mortgages from about 3.99%", "ساما تُبقي سعر إعادة الشراء عند 4.25%؛ والتمويل العقاري من نحو 3.99%"),
    summary: bi("Rates unchanged since the December 2025 cut; Al Rajhi quotes 4.10–4.25%, Alinma and AlBilad around 3.99%. Markets expect further cuts if the Fed keeps easing.", "الأسعار دون تغيير منذ خفض ديسمبر 2025؛ الراجحي 4.10–4.25% والإنماء والبلاد نحو 3.99%. وتتوقع الأسواق خفضاً إضافياً إذا واصل الفيدرالي التيسير.") }),
  S({ id: "snap-foreign", city: null, topic: "REGULATION", direction: "up", project: null, date: "2026-09-15", publisher: "Saudi Gazette / Lexology", url: "https://saudigazette.com.sa/article/657387/SAUDI-ARABIA/Saudi-Arabia-to-implement-new-foreign-property-law-in-2026",
    title: bi("Foreign ownership law in force: non-Saudis can buy in designated zones of Riyadh and Jeddah", "نظام تملك غير السعوديين نافذ: يمكن للأجانب الشراء في نطاقات محددة بالرياض وجدة"),
    summary: bi("In effect since 21 January 2026: foreign residents may own one home; Riyadh and Jeddah open only in approved zones; about 10% combined fees and taxes for foreign buyers.", "نافذ منذ 21 يناير 2026: يحق للمقيم تملك وحدة سكنية واحدة؛ والرياض وجدة في نطاقات معتمدة فقط؛ ونحو 10% رسوم وضرائب مجتمعة على المشتري الأجنبي.") }),
  S({ id: "snap-balance", city: "Riyadh", topic: "REGULATION", direction: "down", project: null, date: "2026-09-15", publisher: "Asharq Al-Awsat", url: "https://english.aawsat.com/business/5306051-riyadh-presses-ahead-housing-market-stabilization-through-real-estate-balance",
    title: bi("Riyadh's Real Estate Balance Program: second year of fixed-price plots closes applications", "برنامج التوازن العقاري في الرياض: إغلاق طلبات السنة الثانية من الأراضي بأسعار ثابتة"),
    summary: bi("Applications ran 16 Aug–15 Sep for developed plots at fixed prices; with the five-year rent freeze (since Sep 2025), Riyadh is cooling price growth — Riyadh buyers compare Jeddah on value.", "قُبلت الطلبات من 16 أغسطس إلى 15 سبتمبر لأراضٍ مطوّرة بأسعار ثابتة؛ ومع تجميد الإيجارات خمس سنوات (منذ سبتمبر 2025) تُبطئ الرياض نمو الأسعار — ويقارن مشترو الرياض جدة من حيث القيمة.") }),
  S({ id: "snap-yacht", city: "Jeddah", topic: "EVENT", direction: "up", project: "Marina Tower", date: "2026-09-26", publisher: "Monaco Life", url: "https://monacolife.net/new-red-sea-yacht-show-to-take-monaco-brand-to-saudi-arabia/",
    title: bi("Monaco Yacht Show organisers launch a Red Sea yacht show in Jeddah", "منظمو معرض موناكو لليخوت يطلقون معرضاً لليخوت على البحر الأحمر في جدة"),
    summary: bi("Timed for superyachts wintering in warmer water; Red Sea Global also launched a Yachting Network (AMAALA, Shura Island) from winter 2026 — more high-net-worth waterfront traffic in Jeddah.", "يتزامن مع انتقال اليخوت الفاخرة إلى المياه الدافئة شتاءً؛ وأطلقت البحر الأحمر الدولية شبكة لليخوت (أمالا وجزيرة شورى) من شتاء 2026 — حركة أكبر لأصحاب الثروات على واجهة جدة البحرية.") }),
  S({ id: "snap-jed-tower", city: "Jeddah", topic: "DEVELOPER", direction: "up", project: "Ash Shati Residences", date: "2026-09-30", publisher: "ANI", url: "https://www.aninews.in/news/business/jeddah-tower-selects-fischer-as-stability-partner20260930130553",
    title: bi("Jeddah Tower construction moves ahead — fischer named stability partner", "تقدّم أعمال برج جدة — اختيار فيشر شريكاً للتثبيت"),
    summary: bi("Suppliers are being appointed for the world's tallest tower in North Jeddah — a visible signal of the area's long-term value.", "يجري تعيين الموردين لأعلى برج في العالم شمال جدة — إشارة واضحة لقيمة المنطقة على المدى الطويل.") }),
  S({ id: "snap-megaprojects", city: "Riyadh", topic: "ECONOMY", direction: "up", project: null, date: "2026-09-28", publisher: "Arab News", url: "https://www.arabnews.com/saudi-arabia/shaping-mega-projects-summit-returns-to-riyadh-as-kingdom-enters-critical-vision-2030-delivery-phase-3002423",
    title: bi("Shaping Mega Projects summit (28–30 Sep, Riyadh): Vision 2030 enters its delivery phase", "قمة المشاريع الكبرى (28–30 سبتمبر، الرياض): رؤية 2030 تدخل مرحلة التسليم"),
    summary: bi("The developers and contractors behind the giga-projects met in Riyadh; delivery, not announcements, is now the focus.", "اجتمع مطورو ومقاولو المشاريع الكبرى في الرياض؛ والتركيز الآن على التسليم لا الإعلانات.") }),
  S({ id: "snap-jed-events", city: "Jeddah", topic: "EVENT", direction: "up", project: "Marina Tower", date: "2026-09-25", publisher: "10times / Time Out", url: "https://10times.com/jeddah-sa",
    title: bi("Jeddah in October: “Jewels of the World” (19–22 Oct) and the first International Trade Exchange Exhibition (27–29 Oct)", "جدة في أكتوبر: معرض «مجوهرات العالم» (19–22 أكتوبر) وأول معرض دولي للتبادل التجاري (27–29 أكتوبر)"),
    summary: null }),
];

// ------------------------------------------------------------------ classification
const RULES: [NewsTopic, RegExp][] = [
  ["FINANCE", /mortgage|interest rate|repo|sama\b|home loan|financ|تمويل|فائدة|ساما|البنك المركزي|قرض/i],
  ["REGULATION", /law|regulat|ownership|rent (cap|freeze)|wafi|rega\b|ejar|white land|fee|tax|ministry of (housing|municipal)|نظام|تملك|لائحة|تجميد|الإيجار|وافي|الهيئة العامة للعقار|رسوم|ضريبة/i],
  ["INFRASTRUCTURE", /metro|airport|terminal|rail|road|bridge|highway|port\b|tram|corniche project|مترو|مطار|صالة|قطار|طريق|جسر|ميناء/i],
  ["EVENT", /season|festival|exhibition|expo|cityscape|concert|show\b|fair\b|tournament|grand prix|موسم|مهرجان|معرض|سيتي سكيب|حفل|بطولة|سباق/i],
  ["DEVELOPER", /developer|roshn|dar al arkan|retal|jeddah central|tower|launch(es|ed)? (a |the )?(project|community|tower)|off.?plan|مطور|روشن|دار الأركان|ريتال|وسط جدة|برج|مشروع سكني|على الخارطة/i],
  ["REAL_ESTATE", /real estate|property|housing|home(s)?\b|villa|apartment|transaction|price per|rents?\b|residential|عقار|سكني|فلل|شقق|صفقات|أسعار|الإيجار/i],
];
const DOWN = /fall|drop|declin|slow|cool|cap\b|freeze|ban|halt|delay|suspend|fine|tax|انخفاض|تراجع|تباطؤ|تجميد|حظر|تأجيل|غرامة/i;
const JEDDAH_PROJECT: [RegExp, string][] = [[/corniche|waterfront|marina|yacht|obhur|red sea|كورنيش|الواجهة البحرية|مارينا|يخوت|أبحر/i, "Marina Tower"], [/north jeddah|airport|jeddah tower|ash shati|الشاطئ|شمال جدة|مطار|برج جدة/i, "Ash Shati Residences"], [/al andalus|jeddah central|al balad|south jeddah|الأندلس|وسط جدة|البلد|جنوب جدة/i, "Andalus Quarter"]];
export function classify(text: string, city: string | null): Pick<NewsItem, "topic" | "direction" | "project"> & { relevant: boolean } {
  const topic = RULES.find(([, rx]) => rx.test(text))?.[0] ?? "ECONOMY";
  const project = city === "Jeddah" || /jeddah|جدة/i.test(text) ? JEDDAH_PROJECT.find(([rx]) => rx.test(text))?.[1] ?? null : null;
  const relevant = topic !== "ECONOMY" || /vision 2030|giga|investment|population|tourism|رؤية 2030|استثمار|سياحة/i.test(text);
  return { topic, direction: DOWN.test(text) ? "down" : "up", project, relevant };
}

// ------------------------------------------------------------------ live (Google News RSS)
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
export const newsMode = (): "live" | "snapshot" | "off" => {
  const m = (env("NEWS_MODE") ?? "live").toLowerCase();
  if (m === "off") return "off";
  if (m === "snapshot" || typeof window !== "undefined") return "snapshot"; // a browser page can't read the feeds
  return "live";
};
export const newsCities = () => (settingsCached().newsCities ?? env("NEWS_CITIES") ?? "Jeddah,Riyadh").split(",").map((s) => s.trim()).filter(Boolean);
const AR_CITY: Record<string, string> = { Jeddah: "جدة", Riyadh: "الرياض", Makkah: "مكة", Dammam: "الدمام", Khobar: "الخبر", Madinah: "المدينة المنورة" };
function queries() {
  const out: { q: string; city: string | null; lang: "en" | "ar" }[] = [];
  for (const c of newsCities()) {
    out.push({ q: `${c} real estate OR property OR housing`, city: c, lang: "en" });
    out.push({ q: `${c} (metro OR airport OR season OR festival OR exhibition OR project)`, city: c, lang: "en" });
    if (AR_CITY[c]) out.push({ q: `${AR_CITY[c]} عقار OR عقارات OR سكني`, city: c, lang: "ar" });
  }
  out.push({ q: "Saudi mortgage OR SAMA rates OR REGA OR \"foreign ownership\" Saudi property", city: null, lang: "en" });
  return out;
}
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
export function parseRss(xml: string, city: string | null, lang: "en" | "ar"): NewsItem[] {
  const out: NewsItem[] = [];
  for (const it of xml.split("<item>").slice(1)) {
    const g = (t: string) => decode(it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    let title = g("title"); const link = g("link"), pub = g("pubDate"), source = g("source");
    if (!title || !link) continue;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = pub ? new Date(pub).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const c = classify(title, city);
    if (!c.relevant) continue;
    out.push({ id: `news-${Buffer.from(link).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(-16)}`, title: bi(title, title), summary: null, publisher: source || new URL(link).hostname, url: link, date, city, topic: c.topic, direction: c.direction, project: c.project, lang, score: 0 });
  }
  return out;
}

let cache: { at: number; key?: string; items: NewsItem[]; mode: string; error: string | null } | null = null;
const TTL = 3 * 3_600_000;
/** Latest news (last 21 days), most relevant first. Falls back to the snapshot when the feeds can't be reached. */
export async function readNews(force = false): Promise<{ items: NewsItem[]; mode: "live" | "snapshot" | "off"; fetchedAt: string; error: string | null }> {
  const st = await getSettings(); // cities and on/off saved from the settings panel
  const mode = st.newsOn ? newsMode() : "off";
  if (mode === "off") return { items: [], mode, fetchedAt: new Date().toISOString(), error: null };
  if (mode === "snapshot") return { items: rank(NEWS_SNAPSHOT, SNAPSHOT_DATE), mode, fetchedAt: `${SNAPSHOT_DATE}T09:00:00Z`, error: null };
  const key = newsCities().join(",");
  if (cache && cache.key !== key) cache = null;
  if (cache && !force && Date.now() - cache.at < TTL) return { items: cache.items, mode: cache.mode as any, fetchedAt: new Date(cache.at).toISOString(), error: cache.error };
  const all: NewsItem[] = []; const errors: string[] = [];
  await Promise.all(queries().map(async (q) => {
    const hl = q.lang === "ar" ? "hl=ar&gl=SA&ceid=SA:ar" : "hl=en-SA&gl=SA&ceid=SA:en";
    try {
      const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q.q} when:14d`)}&${hl}`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (marketing-hub news reader)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      all.push(...parseRss(await r.text(), q.city, q.lang));
    } catch (e: any) { errors.push(e?.message ?? String(e)); }
  }));
  const seen = new Set<string>();
  const items = rank(all.filter((x) => { const k = x.title.en.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return Date.now() - Date.parse(x.date) <= 21 * DAY; }), new Date().toISOString().slice(0, 10)).slice(0, 30);
  if (!items.length) { // feeds unreachable: say so, use the snapshot
    cache = { at: Date.now(), key, items: rank(NEWS_SNAPSHOT, SNAPSHOT_DATE), mode: "snapshot", error: errors[0] ?? "no news returned" };
  } else cache = { at: Date.now(), key, items, mode: "live", error: errors.length ? `${errors.length} feed(s) failed` : null };
  return { items: cache.items, mode: cache.mode as any, fetchedAt: new Date(cache.at).toISOString(), error: cache.error };
}
/** The news last read (no network): the live cache, else the snapshot. */
export function newsCached() {
  if (newsMode() === "off") return { items: [] as NewsItem[], mode: "off", fetchedAt: "", error: null as string | null };
  if (cache) return { items: cache.items, mode: cache.mode, fetchedAt: new Date(cache.at).toISOString(), error: cache.error };
  return { items: rank(NEWS_SNAPSHOT, SNAPSHOT_DATE), mode: "snapshot", fetchedAt: `${SNAPSHOT_DATE}T09:00:00Z`, error: null };
}
const W: Record<NewsTopic, number> = { REAL_ESTATE: 5, REGULATION: 5, FINANCE: 4, DEVELOPER: 4, EVENT: 4, INFRASTRUCTURE: 3, ECONOMY: 1 };
function rank(items: NewsItem[], today: string) {
  return items.map((x) => ({ ...x, score: W[x.topic] + (x.project ? 2 : 0) + (x.city === "Jeddah" ? 1 : 0) - Math.max(0, (Date.parse(today) - Date.parse(x.date)) / DAY) / 7 }))
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

/** What the news means for marketing (shown with each item and used by the initiatives). */
export function newsAngle(x: NewsItem): Bi {
  switch (x.topic) {
    case "EVENT": return x.city === "Riyadh" ? bi("Crowds in Riyadh, where Jeddah's investor buyers live: meet them there (roadshow, lounge, targeted ads around the venues).", "حشود في الرياض حيث يقيم المستثمرون المشترون في جدة: قابلوهم هناك (جولة، صالة، إعلانات حول المواقع).") : bi("A Jeddah audience to reach while it's out: private viewings and targeted ads around the event.", "جمهور في جدة يمكن الوصول إليه: معاينات خاصة وإعلانات حول الفعالية.");
    case "INFRASTRUCTURE": return bi("New access changes the location story: say it in the ads (“minutes from …”) while the news is fresh.", "الوصول الجديد يغيّر قصة الموقع: قولوها في الإعلانات («دقائق من …») ما دام الخبر حديثاً.");
    case "FINANCE": return x.direction === "up" ? bi("Lower or stable rates widen who qualifies: a mortgage-ready offer with a partner bank and the instalment in the ad.", "الفائدة المنخفضة أو المستقرة توسّع من يتأهل: عرض جاهز للتمويل مع بنك شريك والقسط في الإعلان.") : bi("Rising rates: payment plans and fixed instalments matter more.", "ارتفاع الفائدة: تزداد أهمية خطط السداد والأقساط الثابتة.");
    case "REGULATION": return /foreign|non-saudi|أجانب|غير السعوديين/i.test(x.title.en + x.title.ar) ? bi("A new buyer group: an expat and foreign-buyer programme, if the project is in an approved zone (check first).", "شريحة مشترين جديدة: برنامج للمقيمين والأجانب إن كان المشروع في نطاق معتمد (تحققوا أولاً).") : bi("Policy shifts what buyers compare: reposition on value and payment terms.", "تغيّر السياسات ما يقارنه المشترون: أعيدوا التموضع على القيمة وشروط السداد.");
    case "REAL_ESTATE": return x.direction === "up" ? bi("An active market makes “buy before prices move” credible.", "السوق النشط يجعل «اشترِ قبل ارتفاع الأسعار» رسالة مقنعة.") : bi("A cooling market: compete on terms, not price.", "سوق يتباطأ: نافسوا بالشروط لا بالسعر.");
    case "DEVELOPER": return bi("Nearby landmark progress lifts the area's value story: PR and content that borrow it.", "تقدّم المعالم المجاورة يدعم قصة قيمة المنطقة: علاقات عامة ومحتوى يستفيدان منه.");
    default: return bi("Context for the plan.", "سياق للخطة.");
  }
}
