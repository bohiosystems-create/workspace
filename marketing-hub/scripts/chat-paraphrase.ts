// Off-script phrasing test: the same intents as chat-eval.ts, asked the way a manager might actually type them
// (paraphrases, informal wording, typos, mixed questions). Checks the built-in rules route each one to the right
// answer — not the generic list. Run: npm run chat:paraphrase   (add -v to print the answers)
import { localAnswer, buildChatContext } from "../lib/chat";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

// [question, expected markers (any one of each group, "|" separated)]
export const PARAPHRASES: [string, string[]][] = [
  // Terminate / exit / renewal
  ["Which agency would you get rid of?", ["My recommendation|wouldn't terminate"]],
  ["Who should we stop working with?", ["My recommendation"]],
  ["If you had to cut one vendor, who would it be?", ["My recommendation"]],
  ["Which supplier is underperforming so badly we should end the contract?", ["My recommendation"]],
  ["Is there any vendor we should let go?", ["My recommendation"]],
  ["Should I fire Hajar?", ["Hajar"]],
  ["Can we drop Tasweeq?", ["Tasweeq"]],
  ["Who is the weakest agency and should we replace them?", ["My recommendation|Fair scorecard"]],
  ["Which vendor contracts should not be renewed?", ["Renewal|My recommendation"]],
  ["What's your renewal call on each agency?", ["Renewal recommendation"]],
  ["Keep or replace Sada Influence?", ["Sada"]],
  ["Which vendors deserve a renewal?", ["Renewal recommendation"]],
  ["Recommend a vendor to terminate", ["My recommendation"]],
  ["Any agency you'd advise us to exit?", ["My recommendation"]],
  ["Suggest which vendor to replace", ["My recommendation"]],
  ["مين المورد اللي لازم نوقف التعامل معه؟", ["توصيتي"]],
  ["هل ننهي العقد مع هجر؟", ["هجر"]],
  ["أي وكالة يجب استبدالها؟", ["توصيتي|التجديد"]],
  // Vendor performance / ranking
  ["Who is our best agency?", ["Fair scorecard|scorecard"]],
  ["Rank the vendors", ["scorecard"]],
  ["Which vendor gives the best value for money?", ["scorecard"]],
  ["Worst performing vendor?", ["scorecard|My recommendation"]],
  ["How's Hajar doing lately?", ["Hajar"]],
  ["Give me an update on Sada Influence", ["Sada"]],
  ["Is Tasweeq Digital worth the money?", ["Tasweeq"]],
  ["Tell me everything about Wasel Performance", ["Wasel"]],
  ["What's going on with Bayan Creators?", ["Bayan"]],
  // Recommendations / today
  ["What should I focus on today?", ["Campaign recommendations|open recommendations|Daily campaign check"]],
  ["What's most urgent?", ["open recommendations|urgent"]],
  ["Any suggestions for today?", ["open recommendations|Campaign recommendations"]],
  ["Give me your top 3 actions", ["open recommendations"]],
  ["What are you recommending we do this week?", ["open recommendations|Campaign recommendations"]],
  ["Which campaigns should I pause?", ["Campaign recommendations|Daily campaign check"]],
  ["Where should I move budget?", ["Budget plan|Campaign recommendations"]],
  ["anything new since yesterday", ["Daily campaign check"]],
  ["What needs my sign off?", ["Waiting for your decision"]],
  ["Do I have anything to approve?", ["Waiting for your decision"]],
  ["Are we going to hit the target?", ["target"]],
  // Campaigns
  ["How's the Ash Shati search campaign going?", ["Ash Shati"]],
  ["Is ASH-SEARCH-26 wasting money?", ["Ash Shati|ASH-SEARCH-26"]],
  ["Which campaign is the most efficient right now?", ["Campaign|scorecard"]],
  ["Which live campaigns are doing badly?", ["Campaign recommendations|Daily campaign check|scorecard"]],
  ["Show me the Andalus campaigns", ["Andalus"]],
  ["What is the cost to sales on Marina Tower?", ["Marina"]],
  // Money, periods
  ["How much have we spent so far this year?", ["2026 YTD|spend"]],
  ["What did we spend last month?", ["2026-05"]],
  ["Spend by vendor in May", ["2026-05", "vendor"]],
  ["How much revenue did marketing bring in 2025?", ["2025"]],
  ["What's our total marketing spend?", ["Overall|spend"]],
  ["How many deals did we close in Q1?", ["Q1"]],
  // Invoices
  ["Any invoices I should worry about?", ["Supplier invoices"]],
  ["Which invoices are unpaid?", ["Supplier invoices"]],
  ["Has any vendor overbilled us?", ["Supplier invoices|invoice"]],
  ["Show invoice problems for Sada", ["Sada"]],
  // Orchestration / deliverables
  ["What is late from the agencies?", ["What vendors owe us|Vendor orchestration"]],
  ["Which deliverables are overdue?", ["Vendor orchestration|What vendors owe us"]],
  ["Who hasn't delivered on time?", ["Vendor orchestration|What vendors owe us"]],
  // Contracts
  ["When do the vendor contracts expire?", ["contracts by end date|Renewal"]],
  ["Which contracts are up for renewal soon?", ["contracts by end date|Renewal"]],
  // History
  ["What worked best in previous years?", ["Most efficient|What the 2023–2025 campaigns taught us|Campaign history"]],
  ["Lessons learned from 2024", ["2024"]],
  ["How did we do at Cityscape last year?", ["Cityscape"]],
  ["Did radio ever work for us?", ["Radio"]],
  ["Which past campaign was the biggest flop?", ["Least efficient"]],
  ["Compare this year with last year", ["Year comparison|2025"]],
  // Channels / projects
  ["Are influencers worth it?", ["Influencer"]],
  ["Should we spend more on brokers?", ["Broker"]],
  ["Is outdoor advertising working?", ["Outdoor|Billboards"]],
  ["How is Ash Shati Residences doing overall?", ["Ash Shati"]],
  ["Which project is behind target?", ["target|Campaign recommendations"]],
  // Audience, creatives, market
  ["Who are our buyers?", ["Buyer type"]],
  ["Where do most of our leads live?", ["City"]],
  ["Do investors buy more than families?", ["Buyer type"]],
  ["What makes us lose deals?", ["Reason lost"]],
  ["Which ad message works best?", ["Creatives by message"]],
  ["Are videos better than images?", ["Creatives by format"]],
  ["How are property prices moving in Jeddah?", ["Property market"]],
  ["Who are our main competitors?", ["Competitors"]],
  ["When is Cityscape this year?", ["Marketing calendar|Cityscape"]],
  // Ideation
  ["We need a campaign for National Day", ["Market initiatives"]],
  ["Come up with something for Andalus in October with 200K", ["Market initiatives", "October 2026"]],
  ["What campaign would you run next for Marina Tower?", ["Market initiatives"]],
  // Meta, CRM, Kinan, reports
  ["Who's running our Instagram ads?", ["Meta ads"]],
  ["Are the agencies' lead numbers real?", ["CRM verification"]],
  ["Do the vendor reports match Yardi?", ["CRM verification|Kinan"]],
  ["What have we shared with Kinan's agent?", ["Shared with Kinan's sales agent"]],
  ["When does the daily report go out?", ["Daily report"]],
  ["Do our ads actually cause sales?", ["Controlled tests|Incrementality"]],
  // Definitions / help
  ["what's CPQL", ["CPQL"]],
  ["explain the fair score", ["Fair score"]],
  ["What can I ask you?", ["History"]],
  // Arabic
  ["وش أفضل وكالة عندنا؟", ["التقييم"]],
  ["كم صرفنا الشهر الماضي؟", ["2026-05"]],
  ["أي الفواتير غير مدفوعة؟", ["فواتير الموردين"]],
  ["ما المتأخر من الموردين؟", ["تنسيق الموردين|ما يدين به الموردون"]],
  ["من هم المنافسون؟", ["المنافسون"]],
  ["أعطني أفكار حملة لليوم الوطني", ["مبادرات السوق"]],
  ["ما الذي يجب أن أركز عليه اليوم؟", ["توصيات الحملات|توصية|الفحص اليومي"]],
  ["هل المؤثرون يستحقون الإنفاق؟", ["المعيار|المؤثر"]],
  ["How do buyers feel about the payment plan offers?", ["Creatives by message"]],
  // Charts, phrased loosely
  ["show me revenue split by agency as a pie", ["Revenue (contracted sales) by vendor"]],
  ["can you plot leads per month", ["Leads (CRM sample) by month"]],
  ["make a graph of spend per vendor", ["Marketing spend by vendor"]],
  ["I want a visual of contracts by project", ["Contracts signed by project"]],
  ["pie of sales by channel for 2024", ["by channel", "2024"]],
  ["chart the cost per qualified lead by vendor", ["Cost per qualified lead by vendor"]],
  ["اعرض الإنفاق الشهري كرسم خطي", ["الإنفاق التسويقي حسب الشهر"]],
  ["رسم بياني للعقود حسب القناة", ["العقود الموقعة حسب القناة"]],
  // Held-out round 1 (written fresh, measured before tuning: 27 right, 7 honest "closest questions", 6 wrong)
  ["Which agency is costing us the most per sale?", ["scorecard|Comparison|Overall"]],
  ["Who should get more budget next month?", ["Budget plan"]],
  ["Is any vendor lying about their numbers?", ["CRM verification"]],
  ["What's the status of Hajar's contract?", ["Hajar"]],
  ["Which vendor would you keep no matter what?", ["Renewal|scorecard"]],
  ["How many leads did influencers bring in April?", ["2026-04"]],
  ["What went wrong with the billboards?", ["Outdoor|Hajar|Billboards"]],
  ["Which deliverables are due this week?", ["Vendor orchestration|What vendors owe us"]],
  ["Did Ramadan 2025 beat Ramadan 2024?", ["Ramadan"]],
  ["How much do we owe the vendors?", ["Supplier invoices"]],
  ["Who signed off the June plan?", ["Budget plan"]],
  ["Which campaign should get cut first?", ["Campaign recommendations|Daily campaign check"]],
  ["What's our cheapest channel for qualified leads?", ["Benchmark|Comparison|scorecard|channel"]],
  ["Show me Tasweeq's invoices", ["Tasweeq"]],
  ["Are we overspending anywhere?", ["Campaign recommendations|pacing|Daily campaign check|open recommendations"]],
  ["Which vendor answers emails slowest?", ["scorecard|SLA|response|CRM"]],
  ["Do we have a replacement lined up for Hajar?", ["Hajar|Mada"]],
  ["What do buyers from Riyadh want?", ["City|Riyadh|Buyer"]],
  ["Is the market slowing down?", ["Property market"]],
  ["Any new competitor launches?", ["Competitors"]],
  ["Plan something for the summer holidays", ["Market initiatives"]],
  ["What's the ROI on PR?", ["PR"]],
  ["Have we ever done a radio campaign?", ["Radio"]],
  ["How did Marina Tower sell in 2024?", ["Marina|2024"]],
  ["Who runs the Andalus retargeting ads on Facebook?", ["Meta ads|Andalus"]],
  ["Has Kinan's agent replied to anything?", ["Kinan"]],
  ["Send me the morning report", ["Daily report"]],
  ["Is Sada Influence improving?", ["Sada"]],
  ["Rank our projects by cost to sales", ["project|Comparison|Ash Shati|Overall"]],
  ["What's a good cost to sales for brokers?", ["Broker"]],
  ["كم دفعنا لسدى؟", ["سدى|صدى"]],
  ["أي حملة أنجح حالياً؟", ["الحملات|التقييم|المعيار"]],
  ["هل يوجد مورد يجب أن نوقفه؟", ["توصيتي"]],
  ["ما وضع العقود؟", ["عقود|التجديد"]],
  ["أعطني ملخص الأداء", ["الإجمالي|موجز|توصيات"]],
  ["ما هي أهم ثلاث خطوات الآن؟", ["توصية|توصيات"]],
  ["كيف أداء البوابات العقارية؟", ["البوابات|المعيار"]],
  ["من أفضل وسيط؟", ["الوسطاء|التقييم|المعيار"]],
  ["هل الفيديو أفضل من الصور؟", ["الإعلانات حسب"]],
  ["متى اليوم الوطني؟", ["التقويم"]],
];

const FALLBACK = /I'm your AI assistant director of marketing\. Ask me|أنا مساعد مدير التسويق الذكي\. اسألوني|couldn't match that question|لم أتمكن من مطابقة/;

if (require.main === module) (async () => {
  const ctx = { en: await buildChatContext("en"), ar: await buildChatContext("ar") };
  let pass = 0;
  const fails: string[] = [];
  for (const [question, groups] of PARAPHRASES) {
    const ar = /[؀-ۿ]/.test(question);
    const r = await localAnswer(question, ar ? ctx.ar : ctx.en, undefined, ar ? "ar" : "en");
    const missing = groups.filter((g) => !g.split("|").some((w) => r.reply.toLowerCase().includes(w.toLowerCase())));
    const fb = FALLBACK.test(r.reply);
    if (!fb && !missing.length) pass++;
    else fails.push(`✗ ${question}\n    ${fb ? "fell back to the generic answer" : `missing: ${missing.join(", ")}`}\n    got: ${r.reply.slice(0, 160).replace(/\n/g, " ⏎ ")}`);
    if (process.argv.includes("-v")) console.log(`\n### ${question}\n${r.reply}`);
  }
  if (fails.length) console.log(fails.join("\n"));
  console.log(`\n${pass}/${PARAPHRASES.length} off-script questions routed to the right answer.`);
  process.exit(fails.length ? 1 : 0);
})();
