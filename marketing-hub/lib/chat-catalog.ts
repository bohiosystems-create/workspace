// Questions the built-in answers handle well, used as a safety net when a question is phrased in a way the rules
// don't recognise: the assistant offers the closest ones as one-click follow-ups ("Did you mean…?") instead of
// guessing. Matching is by meaning-bearing words after folding synonyms (agency → vendor, terminate → exit, …).
import type { Lang } from "./i18n";

export const CATALOG: { en: string; ar: string }[] = [
  { en: "What's today's brief?", ar: "ما موجز اليوم؟" },
  { en: "What are the top recommendations?", ar: "ما أهم التوصيات؟" },
  { en: "What should I change in the campaigns?", ar: "ماذا أغير في الحملات؟" },
  { en: "What changed since yesterday?", ar: "ما الجديد منذ الأمس؟" },
  { en: "What needs my approval?", ar: "ما الذي ينتظر اعتمادي؟" },
  { en: "Are we on track against target?", ar: "هل نحن على المسار نحو المستهدف؟" },
  { en: "Which vendor should we terminate, and why?", ar: "أي مورد تقترح إنهاء عقده ولماذا؟" },
  { en: "Renewal recommendation for each vendor", ar: "توصية التجديد لكل مورد" },
  { en: "Which vendor converts best?", ar: "أي مورد يحقق أفضل تحويل؟" },
  { en: "How is Tasweeq Digital doing?", ar: "كيف أداء تسويق ديجيتال؟" },
  { en: "Contracts ending soon", ar: "العقود التي تنتهي قريباً" },
  { en: "What do vendors owe us?", ar: "ما الذي يدين به الموردون؟" },
  { en: "Which trials and replacements are running?", ar: "ما التجارب والبدائل الجارية؟" },
  { en: "Overdue invoices", ar: "الفواتير المتأخرة" },
  { en: "Do vendor numbers match the CRM?", ar: "هل أرقام الموردين تطابق نظام إدارة العملاء؟" },
  { en: "Do our ads actually cause sales? (incrementality tests)", ar: "هل تسبب إعلاناتنا المبيعات فعلاً؟ (اختبارات الأثر الإضافي)" },
  { en: "What's the budget plan for June?", ar: "خطة الميزانية" },
  { en: "Which agency runs each Meta campaign?", ar: "من يدير حملات ميتا؟" },
  { en: "Overall spend and sales", ar: "الإنفاق والمبيعات الإجمالية" },
  { en: "How much did we spend last month by vendor?", ar: "كم أنفقنا الشهر الماضي حسب المورد؟" },
  { en: "Spend year to date", ar: "الإنفاق منذ بداية العام" },
  { en: "Compare 2024 and 2025", ar: "قارن 2024 و 2025" },
  { en: "Compare Tasweeq Digital and Hajar Outdoor", ar: "قارن تسويق ديجيتال وهجر للإعلانات الخارجية" },
  { en: "How is Andalus Quarter doing?", ar: "كيف أداء حي الأندلس؟" },
  { en: "How are influencers performing?", ar: "كيف أداء المؤثرين؟" },
  { en: "How is outdoor (billboards) doing?", ar: "كيف أداء الإعلانات الخارجية؟" },
  { en: "How is ASH-SEARCH-26 doing?", ar: "كيف أداء ASH-SEARCH-26؟" },
  { en: "What did we learn from past campaigns?", ar: "ما الدروس من الحملات السابقة؟" },
  { en: "How did Ramadan campaigns perform?", ar: "كيف كان أداء حملات رمضان؟" },
  { en: "Worst past campaigns", ar: "أسوأ الحملات السابقة" },
  { en: "Benchmarks by channel from history", ar: "معايير القنوات من الحملات السابقة" },
  { en: "Give me campaign ideas for Marina Tower", ar: "أفكار حملة لبرج المارينا" },
  { en: "Investors or end users — who converts better?", ar: "المستثمرون أم المستخدمون النهائيون؟" },
  { en: "Which cities do our leads come from?", ar: "من أين يأتي العملاء؟ حسب المدينة" },
  { en: "Why do we lose leads?", ar: "لماذا نخسر العملاء؟" },
  { en: "Which creatives work best?", ar: "أي الإعلانات الأفضل؟" },
  { en: "How is the property market in Jeddah?", ar: "كيف السوق العقاري في جدة؟" },
  { en: "What are competitors doing?", ar: "ماذا يفعل المنافسون؟" },
  { en: "Key dates in the marketing calendar", ar: "المواعيد المهمة في التقويم التسويقي" },
  { en: "What did we send to Kinan?", ar: "ماذا أرسلنا إلى كنان؟" },
  { en: "Show the daily report schedule", ar: "جدول التقرير اليومي" },
  { en: "What is cost to sales?", ar: "ما معنى نسبة التكلفة إلى المبيعات؟" },
];

// Synonyms folded to one word so different phrasings meet.
const FOLD: [RegExp, string][] = [
  [/^(agenc(y|ies)|suppliers?|partners?|vendors?|مورد|موردين|الموردين|وكالة|الوكالة|وكالات)$/, "vendor"],
  [/^(terminat\w*|exit\w*|drop\w*|fire|replac\w*|cut|remov\w*|rid|dump|ditch|renew\w*|إنهاء|ننهي|استبدال\w*|نستغني|تجديد|التجديد|نجدد)$/, "exit"],
  [/^(spen[dt]\w*|burn\w*|cost\w*|budget\w*|money|صرف\w*|إنفاق|الإنفاق|أنفقنا)$/, "spend"],
  [/^(sales|revenue|deals?|contracts?|مبيعات|المبيعات|عقود)$/, "sales"],
  [/^(best|top|strongest|efficien\w*|converts?|winner|أفضل|الأفضل)$/, "best"],
  [/^(worst|weakest|flop|poor|bad|أسوأ|الأسوأ|أضعف)$/, "worst"],
  [/^(invoices?|bill(s|ed|ing)?|payments?|unpaid|فاتورة|فواتير|الفواتير)$/, "invoice"],
  [/^(late|overdue|owe|delay\w*|deliver\w*|متأخر\w*|المتأخر\w*)$/, "late"],
  [/^(ads?|creatives?|messages?|videos?|formats?|إعلان\w*|الإعلانات)$/, "creative"],
  [/^(buyers?|audience|investors?|customers?|clients?|leads?|عملاء|العملاء|المشترين)$/, "buyer"],
  [/^(ideas?|brainstorm|concepts?|أفكار|فكرة)$/, "idea"],
  [/^(past|previous|history|historical|last|before|السابقة|سابقة|الماضي)$/, "past"],
  [/^(approv\w*|sign|pending|اعتماد\w*|بانتظار)$/, "approve"],
  [/^(today|now|urgent|priorit\w*|focus|اليوم|الأهم|عاجل)$/, "today"],
  [/^(influencers?|creators?|المؤثرين|مؤثرين|المؤثرون)$/, "influencer"],
  [/^(competitors?|competition|rivals?|المنافسون|المنافسين)$/, "competitor"],
  [/^(outdoor|billboards?|ooh|hoardings?|اللوحات|الخارجية)$/, "outdoor"],
  [/^(market|prices?|sqm|السوق|أسعار)$/, "market"],
];
const STOP = new Set("a an the is are was were do does did of for to in on at by and or with we our us you your me my i it its this that what which who how why when where should would could can will be have has there any much many from about than then them they also please tell show give get let one".split(" ")
  .concat("ما ماذا هل من في على إلى عن مع أي كيف لماذا متى أين هو هي هذا هذه التي الذي كم لنا لدينا".split(" ")));

export function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean)
    .map((raw) => {
      const w = raw.replace(/^(و|ب|ل|ف)?ال(?=\p{L}{3})/u, "");
      for (const [rx, to] of FOLD) if (rx.test(w) || rx.test(raw)) return to;
      return w.replace(/^(.{4,}?)(ing|ed|es|s)$/, "$1");
    })
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** The catalog questions closest to `question` (most shared meaning-bearing words first), excluding near-duplicates. */
export function closest(question: string, lang: Lang, n = 3): string[] {
  const q = new Set(words(question));
  if (!q.size) return [];
  return CATALOG.map((c) => {
    const w = new Set(words(c[lang]).concat(lang === "ar" ? words(c.en) : []));
    let hit = 0; for (const x of q) if (w.has(x)) hit++;
    return { text: c[lang], score: hit / Math.sqrt(w.size + 1) };
  }).filter((x) => x.score > 0 && x.text.trim().toLowerCase() !== question.trim().toLowerCase()).sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.text);
}
