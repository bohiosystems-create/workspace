// Built-in assistant eval: asks ~90 English and Arabic questions with no AI key and checks each one gets a real
// answer (not the generic fallback) that mentions what it should. Run: npm run chat:eval
import { localAnswer, buildChatContext } from "../lib/chat";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

// [question, words the answer must contain (any one of each group, "|" separated)]
const CASES: [string, string[]][] = [
  // Today
  ["What's today's brief?", ["Campaign recommendations"]],
  ["What should I change in the campaigns?", ["Campaign recommendations"]],
  ["What changed since yesterday?", ["Daily campaign check"]],
  ["Show me the daily campaign check", ["Daily campaign check", "urgent"]],
  ["What needs my approval?", ["Waiting for your decision"]],
  ["What are the top recommendations?", ["open recommendations"]],
  ["Are we on track against target?", ["Campaign recommendations|target"]],
  ["Help", ["History", "Periods"]],
  ["What can you do?", ["History"]],
  // Definitions
  ["What is cost to sales?", ["Cost to sales"]],
  ["What does CPQL mean?", ["CPQL"]],
  ["What is pacing?", ["Pacing"]],
  ["Define incrementality", ["Incrementality"]],
  ["What is the fair score?", ["Fair score"]],
  ["What is last-touch attribution?", ["Last-touch"]],
  ["What is a benchmark?", ["Benchmark"]],
  // Campaigns
  ["How is ASH-SEARCH-26 doing?", ["Ash Shati", "Benchmark|Today's check"]],
  ["How is Ash Shati Broker Push doing?", ["Broker", "Funnel"]],
  ["Tell me about the Andalus creator programme campaign", ["Andalus", "Funnel"]],
  ["What does today's check say about AND-OFFPLAN-26?", ["Daily campaign check"]],
  // Vendors
  ["Which vendor converts best?", ["Fair scorecard|scorecard"]],
  ["Should we renew Hajar Outdoor?", ["Hajar"]],
  ["What vendor you suggest to terminate and why", ["My recommendation: terminate", "Hajar", "Why"]],
  ["Which agency should we drop?", ["My recommendation", "Hajar"]],
  ["Should we terminate Sada Influence?", ["Sada"]],
  ["أي مورد تقترح إنهاء عقده ولماذا؟", ["توصيتي", "السبب"]],
  ["How is Tasweeq Digital doing?", ["Tasweeq", "scorecard"]],
  ["What do vendors owe us?", ["What vendors owe us|Vendor orchestration"]],
  ["Which trials are running?", ["Trials"]],
  ["Draft an email to Hajar Outdoor", ["draft|nothing to email|Which one"]],
  ["Contracts ending soon", ["contracts by end date"]],
  ["Tell me about Wajha Events", ["Wajha", "Past campaigns"]],
  ["Tell me about Mada Outdoor", ["Mada", "bench"]],
  ["What did Najm Media do for us?", ["Najm", "Past campaigns"]],
  // Compare
  ["Compare Tasweeq Digital and Hajar Outdoor", ["Comparison", "Tasweeq", "Hajar"]],
  ["Compare Ash Shati and Marina Tower", ["Comparison", "Ash Shati", "Marina"]],
  ["Brokers vs influencers", ["Comparison"]],
  ["Compare 2024 and 2025", ["Year comparison", "2024", "2025"]],
  ["2025 vs 2026", ["Year comparison"]],
  // Periods
  ["How much did we spend in March?", ["2026-03", "spend"]],
  ["Sales in Q1 2025 by project", ["Q1 2025", "By project"]],
  ["Total spend in 2024", ["2024", "spend"]],
  ["How many contracts last month?", ["2026-05", "contracts"]],
  ["Spend in April by channel", ["2026-04", "By channel"]],
  ["How much did Hajar Outdoor spend in February?", ["Hajar", "2026-02"]],
  ["Spend year to date", ["2026 YTD"]],
  // History
  ["What did we learn from past campaigns?", ["What the 2023–2025 campaigns taught us"]],
  ["How did Ramadan campaigns perform?", ["Ramadan", "Campaign history"]],
  ["How did summer campaigns do?", ["Summer"]],
  ["Worst past campaigns", ["Least efficient"]],
  ["Best campaigns last year", ["Most efficient"]],
  ["Past broker campaigns", ["Campaign history", "Broker"]],
  ["Show me the campaign history", ["Campaign history", "Lessons"]],
  ["Benchmarks by channel from history", ["Benchmarks by channel"]],
  ["Tell me about MAR-RAMADAN-25", ["Lesson"]],
  ["Past campaigns for Andalus Quarter", ["Campaign history", "Andalus"]],
  ["Previous radio campaigns", ["Radio"]],
  ["What happened in 2024 campaigns history?", ["Campaign history", "2024"]],
  // Projects and channels
  ["How is Andalus Quarter doing?", ["Andalus Quarter", "History 2023–2025"]],
  ["How is Marina Tower performing?", ["Marina Tower"]],
  ["How are influencers performing?", ["Influencer", "Benchmark"]],
  ["How is outdoor doing?", ["Outdoor|Billboards", "Benchmark"]],
  ["How are the portals doing?", ["Portal"]],
  // Data
  ["Do vendor numbers match the CRM?", ["CRM verification"]],
  ["Which agency runs each Meta campaign?", ["Meta ads"]],
  ["Overdue invoices", ["Supplier invoices"]],
  ["What's the budget plan for June?", ["Budget plan"]],
  ["What did we send to Kinan?", ["Feed to Kinan"]],
  ["Show the daily report schedule", ["Daily report"]],
  ["Incrementality tests", ["Controlled tests"]],
  ["Overall spend and sales", ["Overall"]],

  // Campaign ideation
  ["Give me campaign ideas for Marina Tower in Ramadan with SAR 300K", ["Campaign ideas", "Marina Tower", "February 2027", "SAR 300K"]],
  ["Brainstorm a new campaign for Andalus", ["Campaign ideas", "Andalus Quarter", "Forecast"]],
  ["Ideas for a summer campaign for Ash Shati", ["July 2026", "priority list"]],
  ["Plan a campaign for the Cityscape season", ["November 2026", "open-house"]],

  // Lead profiles (sample CRM fields)
  ["Which cities do our leads come from?", ["City", "Jeddah", "Riyadh"]],
  ["Investors or end users — who converts better?", ["Buyer type", "Investor"]],
  ["Buyer types for Marina Tower", ["Buyer type — Marina Tower", "Investor"]],
  ["What nationalities are the leads for Marina Tower?", ["Nationality", "GCC"]],
  ["What budget range do buyers have for Andalus?", ["Budget", "Under SAR 1M"]],
  ["Why do we lose leads?", ["Reason lost", "Not a buyer"]],
  ["Lost reasons for Andalus Quarter", ["Reason lost — Andalus Quarter"]],
  ["Age groups of the leads from influencers", ["Age", "25–34"]],
  ["Unit types for Ash Shati", ["Unit type", "Townhouse"]],
  ["Show me the audience profile", ["Buyer type", "City", "Nationality"]],
  ["Does response time affect conversion?", ["First response"]],
  // Creatives (sample, adds up to campaign totals)
  ["Which creatives work best?", ["Creatives by message", "Payment plan"]],
  ["Which ad format performs best for Ash Shati?", ["Creatives by format", "Video 15s"]],
  ["Arabic or English ads?", ["Creatives by language", "Arabic"]],
  ["Which ads are fatigued?", ["Fatigued"]],
  ["Best ads for ASH-SEARCH-26", ["Creatives by creative", "Payment plan 10/90"]],
  // Market, competitors, calendar (sample)
  ["How is the property market in Jeddah?", ["Property market", "Jeddah South", "Mortgages"]],
  ["Price per sqm around Andalus Quarter", ["Jeddah South", "off-plan"]],
  ["What are competitors doing?", ["Competitors", "Sahil Living"]],
  ["Who competes with Marina Tower?", ["Mirsa Developments"]],
  ["When is Ramadan next year?", ["Marketing calendar", "Ramadan 2027"]],
  ["Key dates in the marketing calendar", ["Cityscape"]],
  // Expanded history
  ["How did Palm Villas campaigns perform?", ["Campaign history", "Palm Villas"]],
  ["Cityscape results in past years", ["Cityscape"]],
  ["Compare 2023 and 2025", ["Year comparison", "2023", "2025"]],
  ["Spend in 2023", ["2023", "spend"]],

  // Arabic
  ["ما موجز اليوم؟", ["توصيات الحملات"]],
  ["ما الجديد منذ الأمس؟", ["الفحص اليومي"]],
  ["ماذا أغير في الحملات؟", ["توصيات الحملات"]],
  ["ما الذي ينتظر اعتمادي؟", ["بانتظار قراركم"]],
  ["مساعدة", ["التاريخ"]],
  ["ما معنى نسبة التكلفة إلى المبيعات؟", ["نسبة التكلفة إلى المبيعات"]],
  ["ما معنى وتيرة الإنفاق؟", ["وتيرة"]],
  ["كيف أداء ASH-SEARCH-26؟", ["المعيار|فحص اليوم"]],
  ["أي مورد يحقق أفضل تحويل؟", ["التقييم"]],
  ["هل نجدد لهجر؟", ["هجر"]],
  ["قارن 2024 و 2025", ["مقارنة السنوات"]],
  ["الإنفاق في مارس", ["2026-03"]],
  ["المبيعات في Q1 2025 حسب المشروع", ["Q1 2025", "حسب المشروع"]],
  ["ما الدروس من الحملات السابقة؟", ["ما تعلمناه"]],
  ["كيف كان أداء حملات رمضان؟", ["رمضان"]],
  ["أسوأ الحملات السابقة", ["الأقل كفاءة"]],
  ["كيف أداء الأندلس؟", ["الأندلس"]],
  ["كيف أداء المؤثرين؟", ["المعيار"]],
  ["هل أرقام الموردين تطابق نظام إدارة العملاء؟", ["التحقق"]],
  ["من يدير حملات ميتا؟", ["ميتا"]],
  ["الفواتير المتأخرة", ["فواتير الموردين"]],
  ["خطة الميزانية", ["خطة الميزانية"]],
  ["ماذا أرسلنا إلى كنان؟", ["كنان"]],
  ["حدثني عن وجهة للفعاليات", ["حملات سابقة"]],
  ["معيار الوسطاء في الحملات السابقة", ["تاريخ الحملات"]],
  ["اقترح حملة جديدة للأندلس في نوفمبر", ["أفكار الحملات", "نوفمبر 2026"]],
  ["أفكار لحملة رمضان لبرج المارينا", ["أفكار الحملات", "فبراير 2027"]],
  ["من أين يأتي العملاء؟ حسب المدينة", ["المدينة", "جدة"]],
  ["لماذا نخسر العملاء؟", ["سبب الخسارة"]],
  ["أي الإعلانات الأفضل؟", ["الإعلانات حسب"]],
  ["كيف السوق العقاري في جدة؟", ["السوق العقاري"]],
  ["ماذا يفعل المنافسون؟", ["المنافسون"]],
  ["متى رمضان القادم؟", ["التقويم التسويقي"]],
  ["المستثمرون أم المستخدمون النهائيون؟", ["نوع المشتري"]],
];

const FALLBACK = /I'm your AI director of marketing\. Ask me|أنا مدير التسويق الذكي\. اسألوني|couldn't match that question|لم أتمكن من مطابقة/;

(async () => {
  const ctx = { en: await buildChatContext("en"), ar: await buildChatContext("ar") };
  let pass = 0;
  const fails: string[] = [];
  for (const [question, groups] of CASES) {
    const ar = /[؀-ۿ]/.test(question);
    const r = await localAnswer(question, ar ? ctx.ar : ctx.en, undefined, ar ? "ar" : "en");
    const missing = groups.filter((g) => !g.split("|").some((w) => r.reply.toLowerCase().includes(w.toLowerCase())));
    const fb = FALLBACK.test(r.reply);
    if (!fb && !missing.length) pass++;
    else fails.push(`✗ ${question}\n    ${fb ? "fell back to the generic answer" : `missing: ${missing.join(", ")}`}\n    got: ${r.reply.slice(0, 220).replace(/\n/g, " ⏎ ")}`);
    if (process.argv.includes("-v")) console.log(`\n### ${question}\n${r.reply}`);
  }
  if (fails.length) console.log(fails.join("\n"));
  console.log(`\n${pass}/${CASES.length} questions answered with the expected content.`);
  process.exit(fails.length ? 1 : 0);
})();
