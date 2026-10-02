// More built-in answers for the assistant (no AI key needed): help, metric definitions, the daily campaign check,
// comparisons, any month / quarter / year, the 2024–2025 campaign history, projects, channels and past vendors.
// Every number comes from lib/query.ts, lib/history.ts or lib/daily.ts. Returns null when the question is not one of these.
import type { ChatContext } from "./chat";
import { resolve, describe, parsePeriod, periodSummary, latestLiveMonth, projectSummary, channelSummary, vendorDetail, type Entity } from "./query";
import { FAMILY_LABEL, SEASON_LABEL } from "./history";
import { type Lang, tx, K, M, nm, dt, firstSentence } from "./i18n";

const RX = {
  help: /^(help|hi|hello|hey|menu|\?)\b|what can (you|i) (do|ask)|how (do|can) (i|you) use|what do you know|capabilit|example questions|مساعدة|ماذا (تستطيع|يمكنك)|ما الذي يمكنك|ماذا أسأل|كيف أستخدم|مرحبا|أهلا/,
  define: /what (is|are|does|'s) (an? |the )?(cost.?to.?sales|cpl|cpql|cac|qualified (lead )?rate|close rate|pacing|incremental|fair score|score ?card|holdout|geo.?test|mmm|media.?mix|last.?touch|attribution|utm|sla|benchmark|cost per)|\bdefin|meaning of|stand for|ما معنى|ماذا يعني|ما هو|ما هي|تعريف/,
  daily: /daily (campaign )?check|campaign check|since yesterday|changed (today|since|overnight)|what('s| is) new|new today|today'?s (check|changes|findings)|open (items|findings) (on|for) campaigns|الفحص اليومي|فحص الحملات|منذ الأمس|ما الجديد|جديد اليوم|تغيّر اليوم|تغير اليوم/,
  compare: /compar|\bvs\.?\b|versus|against|better than|worse than|difference between|قارن|مقارنة|مقابل|أفضل من|أسوأ من|الفرق بين/,
  metric: /spend|spent|cost|sales|revenue|contracts?|leads?|qualified|how much|how many|perform|result|numbers|total|إنفاق|أنفق|الإنفاق|مبيعات|المبيعات|عقود|عقد|عملاء|مؤهل|كم|أداء|نتائج|أرقام|إجمالي/,
  history: /histor|\bpast\b|previous|last year|lesson|learn|ramadan|summer|season|launch (season|campaigns)|launches|always.on|did we (run|do)|we ran|have we (ever|run|done)|سابق|السابقة|الماضي|العام الماضي|رمضان|الصيف|موسم|المواسم|إطلاق|دروس|الدروس|تعلم|تعلّم|تاريخ|أرشيف/,
  best: /best|top|most efficient|cheapest|strong|winner|أفضل|الأفضل|أكفأ|الأقوى/,
  worst: /worst|weakest|most expensive|bad|poor|lowest|failed|أسوأ|الأسوأ|أضعف|الأغلى|فشل/,
  lessons: /lesson|learn|takeaway|insight|دروس|الدروس|تعلم|تعلّم|استنتاج/,
  groupProject: /by project|per project|each project|حسب المشروع|لكل مشروع/,
  groupChannel: /by channel|per channel|each channel|حسب القناة|لكل قناة/,
  groupCampaign: /by campaign|per campaign|each campaign|حسب الحملة|لكل حملة/,
};
const SEASON_RX: [string, RegExp][] = [
  ["RAMADAN", /ramadan|رمضان/], ["SUMMER", /summer|الصيف|صيف/], ["LAUNCH", /launch (season|campaigns)|launches|حملات الإطلاق|حملات الاطلاق/],
  ["EVENT", /\bevent season|exhibition season|cityscape|موسم المعارض/], ["ALWAYS_ON", /always.on|مستمر/], ["BRAND", /brand campaign|حملة العلامة|العلامة التجارية/],
];

// Metric definitions (EN/AR), matched by key words.
const GLOSSARY: { rx: RegExp; en: string; ar: string }[] = [
  { rx: /cost.?to.?sales|التكلفة إلى المبيعات|تكلفة إلى المبيعات/, en: "**Cost to sales** = marketing spend ÷ contracted sales value (CRM). It is the main efficiency measure: 1.5% means SAR 15K of marketing per SAR 1M sold. Lower is better; compare with the same channel's history because channels differ a lot.", ar: "**نسبة التكلفة إلى المبيعات** = الإنفاق التسويقي ÷ قيمة المبيعات المتعاقد عليها (من نظام إدارة العملاء). هي مقياس الكفاءة الرئيسي: 1.5% تعني 15 ألف ر.س تسويق لكل مليون ر.س مبيعات. الأقل أفضل؛ وقارنوها بتاريخ القناة نفسها لأن القنوات تختلف كثيراً." },
  { rx: /\bcpql\b|cost per qualified|تكلفة العميل المؤهل/, en: "**CPQL (cost per qualified lead)** = spend ÷ leads the sales team marked as qualified in the CRM. Better than cost per lead because cheap, unqualified leads are excluded.", ar: "**تكلفة العميل المؤهل** = الإنفاق ÷ العملاء الذين صنّفهم فريق المبيعات مؤهلين في النظام. أفضل من تكلفة العميل المحتمل لأنها تستبعد العملاء الرخيصين غير المؤهلين." },
  { rx: /\bcpl\b|cost per lead|تكلفة العميل المحتمل/, en: "**CPL (cost per lead)** = spend ÷ leads recorded in the CRM (not the vendor's own count).", ar: "**تكلفة العميل المحتمل** = الإنفاق ÷ العملاء المحتملين المسجلين في النظام (لا عدد المورد نفسه)." },
  { rx: /\bcac\b|cost per (contract|sale|acquisition)|تكلفة اكتساب/, en: "**CAC** = spend ÷ signed contracts — what one sale cost in marketing.", ar: "**تكلفة اكتساب العقد** = الإنفاق ÷ العقود الموقعة — كم كلّف البيع الواحد تسويقياً." },
  { rx: /qualified (lead )?rate|qual rate|نسبة المؤهلين|نسبة العملاء المؤهلين/, en: "**Qualified rate** = qualified leads ÷ all leads. The history shows a low qualified rate in the first month predicts weak sales.", ar: "**نسبة المؤهلين** = العملاء المؤهلون ÷ جميع العملاء المحتملين. يُظهر التاريخ أن انخفاضها في الشهر الأول ينبئ بمبيعات ضعيفة." },
  { rx: /close rate|lead.?to.?contract|conversion rate|نسبة الإغلاق|معدل التحويل/, en: "**Close rate** = contracts ÷ qualified leads (lead-to-contract uses all leads).", ar: "**نسبة الإغلاق** = العقود ÷ العملاء المؤهلين (ومن العميل إلى العقد تستخدم جميع العملاء)." },
  { rx: /pacing|وتيرة/, en: "**Pacing** = spend to date ÷ the budget expected to be spent by today. Over 110% means the budget runs out early; under 80% means under-delivery. Not used for commission-based vendors.", ar: "**وتيرة الإنفاق** = الإنفاق حتى اليوم ÷ الميزانية المتوقع إنفاقها حتى اليوم. فوق 110% تنفد الميزانية مبكراً، وتحت 80% تأخر في التنفيذ. لا تُستخدم مع موردي العمولة." },
  { rx: /incremental|holdout|geo.?test|الأثر الإضافي|المجموعة المستبعدة/, en: "**Incrementality** = the share of sales that would not have happened without the campaign. Measured with holdout or geo tests (strongest) or the media-mix model; used to correct the scorecard.", ar: "**الأثر الإضافي** = نسبة المبيعات التي لم تكن لتحدث دون الحملة. يُقاس باختبارات المجموعة المستبعدة أو الاختبار الجغرافي (الأقوى) أو نموذج مزيج الإعلام؛ ويُستخدم لتصحيح التقييم." },
  { rx: /\bmmm\b|media.?mix|مزيج الإعلام/, en: "**Media-mix model (MMM)** = a statistical model of weekly sales against spend by channel; estimates how much of each channel's attributed sales is incremental, with a range.", ar: "**نموذج مزيج الإعلام** = نموذج إحصائي للمبيعات الأسبوعية مقابل الإنفاق لكل قناة؛ يقدّر الجزء الإضافي فعلاً من مبيعات كل قناة مع نطاق." },
  { rx: /fair score|score ?card|scorecard|التقييم العادل|بطاقة التقييم/, en: "**Fair score (0–100)** = each vendor's verified results normalised by channel and budget, so a broker is not compared with a billboard. 50 = channel benchmark. Shown with a range and a confidence level.", ar: "**التقييم العادل (0–100)** = نتائج كل مورد المتحقَّق منها، معدّلة حسب القناة والميزانية حتى لا يُقارن الوسيط باللوحة الإعلانية. 50 = معيار القناة. يُعرض مع نطاق ومستوى ثقة." },
  { rx: /last.?touch|attribution|الإسناد|آخر نقرة/, en: "**Last-touch attribution** credits a sale to the last campaign the buyer came through. It under-credits PR, outdoor and radio, which build awareness earlier — so those are judged with tests and the media-mix model too.", ar: "**إسناد آخر نقرة** ينسب البيع إلى آخر حملة جاء منها المشتري. يقلّل من أثر العلاقات العامة واللوحات والإذاعة التي تبني الوعي مبكراً — لذا تُقيَّم أيضاً بالاختبارات ونموذج مزيج الإعلام." },
  { rx: /\butm\b|campaign code|رمز الحملة/, en: "**Campaign code / utm_campaign** = the code each vendor must put in campaign names and links (e.g. ASH-SEARCH-26). It is how CRM leads and Meta campaigns are matched to a vendor.", ar: "**رمز الحملة / utm_campaign** = الرمز الذي يضعه كل مورد في أسماء الحملات وروابطها (مثل ASH-SEARCH-26). به تُربط عملاء النظام وحملات ميتا بالمورد." },
  { rx: /\bsla\b|response time|اتفاقية الخدمة|زمن الاستجابة/, en: "**SLA response time** = hours from lead to first contact, measured in the CRM, against the hours agreed in the vendor's contract.", ar: "**زمن الاستجابة في اتفاقية الخدمة** = الساعات من وصول العميل إلى أول تواصل، مقاسة في النظام، مقابل المتفق عليه في عقد المورد." },
  { rx: /benchmark|المعيار|معيار/, en: "**Benchmark** = the same channel's result across the 2024–2025 campaign history (e.g. digital, brokers, outdoor). Live campaigns are judged against it in the daily check.", ar: "**المعيار** = نتيجة القناة نفسها عبر تاريخ الحملات 2024–2025 (رقمي، وسطاء، لوحات…). تُقارن به الحملات النشطة في الفحص اليومي." },
];

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x}%`);

/** Early intents (before the vendor / campaign answers). */
export function extraEarly(question: string, c: ChatContext): string | null {
  const L: Lang = c.lang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const q = question.toLowerCase();
  const ents = resolve(question, c.q);
  const h = c.history;

  // Help.
  if (RX.help.test(q.trim()) && question.trim().split(/\s+/).length <= 8) return help(L);

  // Definitions.
  if (RX.define.test(q)) {
    const hits = GLOSSARY.filter((g) => g.rx.test(q));
    if (hits.length) return hits.slice(0, 3).map((g) => T(g.en, g.ar)).join("\n\n");
  }

  // Daily campaign check.
  if (RX.daily.test(q)) return dailyAnswer(c, ents);

  // Comparison of two or more things.
  const uniq = ents.filter((e, i) => ents.findIndex((x) => x.kind === e.kind && x.name === e.name) === i);
  // "Tasweeq Digital vs Hajar Outdoor" names two vendors, not the digital and outdoor channels.
  const distinct = uniq.filter((e) => e.kind !== "channel").length >= 2 ? uniq.filter((e) => e.kind !== "channel") : uniq;
  const years = [...new Set(q.match(/\b(2024|2025|2026)\b/g) ?? [])];
  if (RX.compare.test(q) && years.length >= 2 && distinct.length === 0) return yearCompare(c, years);
  if (RX.compare.test(q) && distinct.length >= 2) return compareAnswer(c, distinct.slice(0, 4));

  // Past campaign named explicitly.
  const past = ents.find((e) => e.kind === "past");
  if (past) return pastAnswer(c, past.code);

  // History questions (seasons, years, lessons, best / worst past campaigns, benchmarks).
  const season = SEASON_RX.find(([, rx]) => rx.test(q))?.[0];
  const live = ents.some((e) => e.kind === "campaign");
  if ((RX.history.test(q) && !(live && !/histor|\bpast\b|previous|last year|سابق|الماضي|تاريخ/.test(q))) || (season && !RX.metric.test(q) && !live)) return historyAnswer(c, q, ents, season);

  // Any month / quarter / year with a metric.
  const period = parsePeriod(question, latestLiveMonth(c.q));
  if (period && RX.metric.test(q) && !/invoice|فاتور|فواتير/.test(q)) {
    const focus = ents.find((e) => e.kind !== "past");
    const groupBy = RX.groupProject.test(q) || focus?.kind === "project" ? "project" : RX.groupChannel.test(q) || focus?.kind === "channel" ? "channel" : RX.groupCampaign.test(q) || focus?.kind === "campaign" ? "campaign" : "vendor";
    const s = periodSummary(c.q, period.months, groupBy);
    if (!s.rows.length) return T(`I have no campaign data for ${period.label}. Live data covers Jan–May 2026; the history covers 2024–2025.`, `لا تتوفر بيانات حملات لـ${period.label}. البيانات الحية تغطي يناير–مايو 2026، والتاريخ يغطي 2024–2025.`);
    const label = (g: string) => groupBy === "channel" ? T(FAMILY_LABEL[g]?.[0] ?? g, FAMILY_LABEL[g]?.[1] ?? g) : nm(L, g);
    const key = focus ? (focus.kind === "channel" ? focus.family : focus.name) : null;
    const row = key ? s.rows.find((r) => r.group === key) : null;
    const head = row
      ? T(`**${label(row.group)} — ${period.label}**: ${K(L, row.spendK)} spend, ${row.qualified} qualified leads, ${row.contracts} contracts, ${M(L, row.salesM)} sales (${pct(row.costToSalesPct)} cost to sales).\n\n`, `**${label(row.group)} — ${period.label}**: إنفاق ${K(L, row.spendK)}، ${row.qualified} عميلاً مؤهلاً، ${row.contracts} عقداً، مبيعات ${M(L, row.salesM)} (${pct(row.costToSalesPct)} من المبيعات).\n\n`)
      : "";
    const GB: Record<string, [string, string]> = { vendor: ["vendor", "المورد"], project: ["project", "المشروع"], channel: ["channel", "القناة"], campaign: ["campaign", "الحملة"] };
    return head + T(`**${period.label} — all campaigns**: ${K(L, s.total.spendK)} spend → ${s.total.qualified} qualified leads → ${s.total.contracts} contracts, ${M(L, s.total.salesM)} sales (${pct(s.total.costToSalesPct)} cost to sales).\nBy ${GB[groupBy][0]}:\n`, `**${period.label} — جميع الحملات**: إنفاق ${K(L, s.total.spendK)} ← ${s.total.qualified} عميلاً مؤهلاً ← ${s.total.contracts} عقداً، مبيعات ${M(L, s.total.salesM)} (${pct(s.total.costToSalesPct)} من المبيعات).\nحسب ${GB[groupBy][1]}:\n`) +
      s.rows.slice(0, 10).map((r) => T(`- ${label(r.group)}: ${K(L, r.spendK)} → ${r.contracts} contracts, ${M(L, r.salesM)} (${pct(r.costToSalesPct)})`, `- ${label(r.group)}: ${K(L, r.spendK)} ← ${r.contracts} عقداً، ${M(L, r.salesM)} (${pct(r.costToSalesPct)})`)).join("\n") +
      T(`\n\nAsk "by project", "by channel" or "by campaign" to regroup.`, `\n\nاسألوا «حسب المشروع» أو «حسب القناة» أو «حسب الحملة» لإعادة التجميع.`);
  }
  return null;
}

/** Late intents (after vendor / campaign answers): projects, channels, past or bench vendors. */
export function extraLate(question: string, c: ChatContext): string | null {
  const L: Lang = c.lang;
  const T = (en: string, ar: string) => tx(L, en, ar);
  const ents = resolve(question, c.q);
  const project = ents.find((e) => e.kind === "project");
  if (project) {
    const p = projectSummary(c.q, project.name), hp = p.history;
    return T(`**${p.project}** — ${p.live.campaigns} campaigns in 2026: ${K(L, p.live.spendK)} spend → ${p.live.qualified} qualified → ${p.live.contracts} contracts, ${M(L, p.live.salesM)} sales (${pct(p.live.costToSalesPct)} cost to sales).\n`, `**${nm(L, p.project)}** — ${p.live.campaigns} حملات في 2026: إنفاق ${K(L, p.live.spendK)} ← ${p.live.qualified} مؤهلاً ← ${p.live.contracts} عقداً، مبيعات ${M(L, p.live.salesM)} (${pct(p.live.costToSalesPct)} من المبيعات).\n`) +
      p.live.list.map((x) => `- ${nm(L, x.name)} (${nm(L, x.vendor)}): ${pct(x.costToSalesPct)}`).join("\n") +
      (hp ? T(`\n\nHistory 2024–2025: ${hp.campaigns} campaigns, ${hp.contracts} contracts, ${M(L, hp.salesM)} sales at ${pct(hp.costToSalesPct)}.`, `\n\nالتاريخ 2024–2025: ${hp.campaigns} حملات، ${hp.contracts} عقداً، مبيعات ${M(L, hp.salesM)} بنسبة ${pct(hp.costToSalesPct)}.`) : "") +
      (p.dailyCheck.length ? T(`\n\nToday's check flags: ${p.dailyCheck.slice(0, 4).join("; ")}.`, `\n\nيشير فحص اليوم إلى: ${p.dailyCheck.slice(0, 4).join("؛ ")}.`) : "");
  }
  const vendor = ents.find((e) => e.kind === "vendor" && !e.id);
  if (vendor) {
    const v = vendorDetail(c.q, vendor.name) as any;
    return T(`**${vendor.name}** — not a current vendor${v.onBench ? " (on the bench as an alternative)" : ""}.\n`, `**${nm(L, vendor.name)}** — ليس مورداً حالياً${v.onBench ? " (ضمن البدائل الجاهزة)" : ""}.\n`) +
      (v.pastCampaigns.length ? T("Past campaigns:\n", "حملات سابقة:\n") + v.pastCampaigns.map((p: any) => `- ${p.name} (${p.when}): ${pct(p.costToSalesPct)}, ${p.contracts} ${T("contracts", "عقداً")}${p.lesson ? ` — ${p.lesson}` : ""}`).join("\n") : T("No past campaigns on record.", "لا حملات سابقة مسجلة.")) +
      (v.bench ? `\n${T("Bench note", "ملاحظة")}: ${nm(L, v.bench.rateNote ?? "")}` : "");
  }
  const channel = ents.find((e) => e.kind === "channel");
  if (channel && channel.kind === "channel") {
    const s = channelSummary(c.q, channel.family), hb = s.history;
    return T(`**${s.channel}** — ${s.live.campaigns} live campaign(s) in 2026: ${K(L, s.live.spendK)} spend → ${s.live.contracts} contracts, ${M(L, s.live.salesM)} sales (${pct(s.live.costToSalesPct)} cost to sales).\n`, `**${s.channel}** — ${s.live.campaigns} حملات في 2026: إنفاق ${K(L, s.live.spendK)} ← ${s.live.contracts} عقداً، مبيعات ${M(L, s.live.salesM)} (${pct(s.live.costToSalesPct)} من المبيعات).\n`) +
      s.live.list.map((x) => `- ${nm(L, x.name)} (${nm(L, x.vendor)}): ${pct(x.costToSalesPct)}`).join("\n") +
      (hb ? T(`\n\nBenchmark from ${hb.campaigns} past campaigns: ${pct(hb.costToSalesPct)} cost to sales, ${pct(hb.qualPct)} qualified rate, CPQL SAR ${hb.cpqlSAR ?? "—"}.`, `\n\nالمعيار من ${hb.campaigns} حملات سابقة: ${pct(hb.costToSalesPct)} من المبيعات، نسبة المؤهلين ${pct(hb.qualPct)}، تكلفة العميل المؤهل ${hb.cpqlSAR ?? "—"} ر.س.`) : "") +
      (s.seasons.length ? T(`\nPast: ${s.seasons.map((x) => `${x.name} (${x.season}) ${pct(x.costToSalesPct)}`).join("; ")}.`, `\nسابقاً: ${s.seasons.map((x) => `${x.name} (${x.season}) ${pct(x.costToSalesPct)}`).join("؛ ")}.`) : "");
  }
  return null;
}

/** Extra lines for a live campaign answer: benchmark, today's check, similar past campaigns. */
export function campaignExtras(c: ChatContext, campaignId: string): string {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar);
  const e = c.q.agent.unified.campaigns.find((u) => u.id === campaignId);
  if (!e) return "";
  const d = describe(c.q, { kind: "campaign", code: e.code ?? e.id, name: e.name, id: e.id }) as any;
  if (!d) return "";
  const recs = c.daily.recommendations.filter((r) => r.code === e.code);
  const sim = [...new Map(recs.flatMap((r) => r.similarPast).map((p: any) => [p.code, p])).values()].slice(0, 3);
  return (d.benchmark ? T(`\n- Benchmark (${d.benchmark.channel}, ${d.benchmark.pastCampaigns} past campaigns): ${pct(d.benchmark.costToSalesPct)} cost to sales`, `\n- المعيار (${d.benchmark.channel}، ${d.benchmark.pastCampaigns} حملات سابقة): ${pct(d.benchmark.costToSalesPct)} من المبيعات`) : "") +
    (recs.length ? T(`\n\n**Today's check**\n`, `\n\n**فحص اليوم**\n`) + recs.map((r) => `- ${r.title} → ${r.action}`).join("\n") : T("\n\nNothing flagged for it in today's check.", "\n\nلا ملاحظات عليها في فحص اليوم.")) +
    (sim.length ? T(`\n\n**Similar past campaigns**\n`, `\n\n**حملات سابقة مشابهة**\n`) + sim.map((p: any) => `- ${p.name}: ${pct(p.costToSalesPct)} — ${p.lesson}`).join("\n") : "");
}

// ------------------------------------------------------------------ answers
function help(L: Lang) {
  return tx(L,
    `I'm your AI director of marketing. I can answer, among others:\n` +
    `- **Today**: "today's brief", "what changed since yesterday?", "what should I change in the campaigns?", "what needs my approval?"\n` +
    `- **Campaigns**: "how is ASH-SEARCH-26 doing?", "compare Marina Influencer Launch and Ash Shati Search", "which campaigns are over budget?"\n` +
    `- **Vendors**: "which vendor converts best?", "should we renew Hajar Outdoor?", "what do vendors owe us?", "trials and alternatives"\n` +
    `- **Periods**: "spend in March", "sales in Q1 2025 by project", "2024 vs 2025"\n` +
    `- **History**: "what did we learn from past campaigns?", "how did Ramadan campaigns perform?", "worst past campaigns", "broker benchmark"\n` +
    `- **Projects and channels**: "how is Andalus Quarter doing?", "how are influencers performing?"\n` +
    `- **Data**: "do vendor numbers match the CRM?", "which agency runs each Meta campaign?", "overdue invoices", "what is cost to sales?"\n` +
    `- **Actions**: "draft an email to Hajar Outdoor" (drafts only — you approve every email), "the daily report", "what did we send to Kinan?"`,
    `أنا مدير التسويق الذكي. يمكنني الإجابة، من بين أمور أخرى، عن:\n` +
    `- **اليوم**: «موجز اليوم»، «ما الجديد منذ الأمس؟»، «ماذا أغيّر في الحملات؟»، «ما الذي ينتظر اعتمادي؟»\n` +
    `- **الحملات**: «كيف أداء ASH-SEARCH-26؟»، «قارن حملة إطلاق المؤثرين في المارينا وبحث الشاطئ»\n` +
    `- **الموردون**: «أي مورد يحقق أفضل تحويل؟»، «هل نجدد لهجر؟»، «ما يدين به الموردون»، «التجارب والبدائل»\n` +
    `- **الفترات**: «الإنفاق في مارس»، «المبيعات في Q1 2025 حسب المشروع»، «2024 مقابل 2025»\n` +
    `- **التاريخ**: «ما الدروس من الحملات السابقة؟»، «كيف كان أداء حملات رمضان؟»، «أسوأ الحملات السابقة»، «معيار الوسطاء»\n` +
    `- **المشاريع والقنوات**: «كيف أداء الأندلس؟»، «كيف أداء المؤثرين؟»\n` +
    `- **البيانات**: «هل أرقام الموردين تطابق النظام؟»، «من يدير حملات ميتا؟»، «الفواتير المتأخرة»، «ما معنى نسبة التكلفة إلى المبيعات؟»\n` +
    `- **الإجراءات**: «اكتب رسالة إلى هجر» (مسودات فقط — تعتمدون كل رسالة)، «التقرير اليومي»، «ماذا أرسلنا إلى كنان؟»`);
}

function dailyAnswer(c: ChatContext, ents: Entity[]) {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar), d = c.daily, s = d.summary;
  const codes = ents.filter((e) => e.kind === "campaign").map((e) => (e as any).code);
  const items = d.recommendations.filter((r) => !codes.length || codes.includes(r.code));
  const ST: Record<string, string> = { ACCEPTED: T("accepted", "مقبولة"), DISMISSED: T("dismissed", "مرفوضة") };
  return T(`**Daily campaign check — ${dt("en", d.date)}**: ${s.total} recommendations (${s.urgent} urgent, ${s.new} new today, ${s.open} still open); ${s.resolved} resolved since yesterday.\n`, `**الفحص اليومي للحملات — ${dt("ar", d.date)}**: ${s.total} توصية (${s.urgent} عاجلة، ${s.new} جديدة اليوم، ${s.open} ما زالت مفتوحة)؛ وحُلّت ${s.resolved} منذ الأمس.\n`) +
    items.slice(0, 10).map((r) => `- ${r.severity === "crit" ? T("[urgent] ", "[عاجل] ") : ""}${r.isNew ? T("[new] ", "[جديد] ") : ""}${r.title.startsWith(r.campaign) || r.campaign === "CRM feed" ? `**${r.title}**` : `**${r.campaign}** — ${r.title}`}${r.isNew ? "" : T(` (open since ${dt("en", r.since, { day: "numeric", month: "short" })})`, ` (مفتوحة منذ ${dt("ar", r.since, { day: "numeric", month: "short" })})`)}${ST[r.status] ? ` · ${ST[r.status]}` : ""}\n  → ${r.action}`).join("\n") +
    (d.resolved.length ? T(`\n\n**Resolved since yesterday**: ${d.resolved.map((r) => r.title).join("; ")}`, `\n\n**حُلّت منذ الأمس**: ${d.resolved.map((r) => r.title).join("؛ ")}`) : "") +
    T("\n\nAccept or dismiss each item on the Daily check page; your decision carries over to the next days.", "\n\nاقبلوا أو ارفضوا كل بند من صفحة الفحص اليومي؛ ويُحتفظ بقراركم في الأيام التالية.");
}

function line(c: ChatContext, e: Entity): string {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar);
  const d: any = describe(c.q, e);
  if (!d) return `- ${e.name}: ${T("not found", "غير موجود")}`;
  if (e.kind === "campaign") return T(`- **${d.name}** (${d.vendor}, live): ${K(L, d.spendK)} spend → ${d.crm.qualified} qualified, ${d.crm.won} contracts, ${M(L, d.crm.salesM)} — **${pct(d.kpis.costToSalesPct)}** cost to sales, CPL SAR ${d.kpis.cplSAR ?? "—"}, qualified ${pct(d.kpis.qualRatePct)}${d.benchmark ? `; channel benchmark ${pct(d.benchmark.costToSalesPct)}` : ""}`, `- **${nm(L, d.name)}** (${nm(L, d.vendor)}، نشطة): إنفاق ${K(L, d.spendK)} ← ${d.crm.qualified} مؤهلاً، ${d.crm.won} عقداً، ${M(L, d.crm.salesM)} — **${pct(d.kpis.costToSalesPct)}** من المبيعات، تكلفة العميل ${d.kpis.cplSAR ?? "—"} ر.س، المؤهلون ${pct(d.kpis.qualRatePct)}${d.benchmark ? `؛ معيار القناة ${pct(d.benchmark.costToSalesPct)}` : ""}`);
  if (e.kind === "past") return T(`- **${d.name}** (${d.vendor}, ${d.start}→${d.end}): ${K(L, d.spendK)} → ${d.qualified} qualified, ${d.contracts} contracts, ${M(L, d.salesM)} — **${pct(d.costToSalesPct)}** cost to sales, qualified ${pct(d.qualPct)}`, `- **${d.name}** (${d.vendor}، ${d.start}→${d.end}): ${K(L, d.spendK)} ← ${d.qualified} مؤهلاً، ${d.contracts} عقداً، ${M(L, d.salesM)} — **${pct(d.costToSalesPct)}** من المبيعات، المؤهلون ${pct(d.qualPct)}`);
  if (e.kind === "vendor") return d.current
    ? T(`- **${d.name}** (${d.category}): score ${d.score?.score ?? "—"}/100, ${K(L, d.totals.spendK)} → ${d.totals.contracts} contracts, ${M(L, d.totals.salesM)} — **${pct(d.totals.costToSalesPct)}** cost to sales${d.decision ? `; ${d.decision.headline}` : ""}`, `- **${nm(L, d.name)}** (${nm(L, d.category)}): التقييم ${d.score?.score ?? "—"}/100، ${K(L, d.totals.spendK)} ← ${d.totals.contracts} عقداً، ${M(L, d.totals.salesM)} — **${pct(d.totals.costToSalesPct)}** من المبيعات${d.decision ? `؛ ${d.decision.headline}` : ""}`)
    : T(`- **${d.name}** (not current): ${d.pastCampaigns.length} past campaign(s)${d.pastCampaigns.length ? `, e.g. ${d.pastCampaigns[0].name} at ${pct(d.pastCampaigns[0].costToSalesPct)}` : ""}`, `- **${nm(L, d.name)}** (ليس حالياً): ${d.pastCampaigns.length} حملات سابقة${d.pastCampaigns.length ? `، مثل ${d.pastCampaigns[0].name} بنسبة ${pct(d.pastCampaigns[0].costToSalesPct)}` : ""}`);
  if (e.kind === "project") return T(`- **${d.project}**: 2026 ${K(L, d.live.spendK)} → ${d.live.contracts} contracts, ${M(L, d.live.salesM)} (**${pct(d.live.costToSalesPct)}**)${d.history ? `; history ${pct(d.history.costToSalesPct)} over ${d.history.campaigns} campaigns` : ""}`, `- **${nm(L, d.project)}**: 2026 ${K(L, d.live.spendK)} ← ${d.live.contracts} عقداً، ${M(L, d.live.salesM)} (**${pct(d.live.costToSalesPct)}**)${d.history ? `؛ التاريخ ${pct(d.history.costToSalesPct)} عبر ${d.history.campaigns} حملات` : ""}`);
  return T(`- **${d.channel}**: 2026 ${K(L, d.live.spendK)} → ${d.live.contracts} contracts, ${M(L, d.live.salesM)} (**${pct(d.live.costToSalesPct)}**)${d.history ? `; benchmark ${pct(d.history.costToSalesPct)}` : ""}`, `- **${d.channel}**: 2026 ${K(L, d.live.spendK)} ← ${d.live.contracts} عقداً، ${M(L, d.live.salesM)} (**${pct(d.live.costToSalesPct)}**)${d.history ? `؛ المعيار ${pct(d.history.costToSalesPct)}` : ""}`);
}

function costOf(c: ChatContext, e: Entity): number | null {
  const d: any = describe(c.q, e);
  if (!d) return null;
  return e.kind === "campaign" ? d.kpis.costToSalesPct : e.kind === "past" ? d.costToSalesPct : e.kind === "vendor" ? d.totals?.costToSalesPct ?? null : d.live?.costToSalesPct ?? null;
}

function compareAnswer(c: ChatContext, ents: Entity[]) {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar);
  const ranked = ents.map((e) => ({ e, v: costOf(c, e) })).filter((x) => x.v !== null && x.v > 0).sort((a, b) => a.v! - b.v!);
  const verdict = ranked.length >= 2
    ? T(`\n\n**${nm("en", ranked[0].e.name)}** is the most efficient (${ranked[0].v}% cost to sales vs ${ranked[ranked.length - 1].v}% for ${ranked[ranked.length - 1].e.name}). Keep in mind PR, outdoor and radio are under-credited by last-touch attribution.`, `\n\n**${nm("ar", ranked[0].e.name)}** الأكفأ (${ranked[0].v}% من المبيعات مقابل ${ranked[ranked.length - 1].v}% لـ${nm("ar", ranked[ranked.length - 1].e.name)}). تذكّروا أن إسناد آخر نقرة يقلّل من أثر العلاقات العامة واللوحات والإذاعة.`)
    : "";
  return T("**Comparison**\n", "**مقارنة**\n") + ents.map((e) => line(c, e)).join("\n") + verdict;
}

function yearCompare(c: ChatContext, years: string[]) {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar);
  const rows = years.sort().map((y) => {
    const p = parsePeriod(y, latestLiveMonth(c.q))!;
    return { y, t: periodSummary(c.q, p.months, "vendor").total };
  });
  return T("**Year comparison** (2024–2025 from the history; 2026 is live data to date)\n", "**مقارنة السنوات** (2024–2025 من التاريخ؛ 2026 بيانات حية حتى الآن)\n") +
    rows.map(({ y, t }) => T(`- **${y}**: ${K(L, t.spendK)} spend → ${t.qualified} qualified, ${t.contracts} contracts, ${M(L, t.salesM)} sales (**${pct(t.costToSalesPct)}** cost to sales)`, `- **${y}**: إنفاق ${K(L, t.spendK)} ← ${t.qualified} مؤهلاً، ${t.contracts} عقداً، مبيعات ${M(L, t.salesM)} (**${pct(t.costToSalesPct)}** من المبيعات)`)).join("\n");
}

function pastAnswer(c: ChatContext, code: string) {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar);
  const p = c.history.rows.find((r) => r.code === code)!;
  const bench = c.history.byFamily.find((x) => x.key === p.family);
  return `**${p.name}** (${p.code})\n` +
    T(`- ${p.vendor} · ${p.project} · ${p.channel} · ${p.seasonLabel}, ${p.start} → ${p.end}\n- Budget ${K(L, p.budgetK)}, spent ${K(L, p.spendK)} → ${p.leads} leads → ${p.qualified} qualified (${pct(p.qualPct)}) → ${p.contracts} contracts, ${M(L, p.salesM)} sales\n- **${pct(p.costToSalesPct)}** cost to sales, CPL SAR ${p.cplSAR ?? "—"}, CPQL SAR ${p.cpqlSAR ?? "—"}${bench ? `; channel benchmark ${pct(bench.costToSalesPct)}` : ""}\n\n**Lesson**: ${p.lesson}`,
      `- ${p.vendor} · ${p.project} · ${p.channel} · ${p.seasonLabel}، ${p.start} → ${p.end}\n- الميزانية ${K(L, p.budgetK)}، الإنفاق ${K(L, p.spendK)} ← ${p.leads} عميلاً محتملاً ← ${p.qualified} مؤهلاً (${pct(p.qualPct)}) ← ${p.contracts} عقداً، مبيعات ${M(L, p.salesM)}\n- **${pct(p.costToSalesPct)}** من المبيعات، تكلفة العميل ${p.cplSAR ?? "—"} ر.س، تكلفة المؤهل ${p.cpqlSAR ?? "—"} ر.س${bench ? `؛ معيار القناة ${pct(bench.costToSalesPct)}` : ""}\n\n**الدرس**: ${p.lesson}`);
}

function historyAnswer(c: ChatContext, q: string, ents: Entity[], season?: string) {
  const L = c.lang, T = (en: string, ar: string) => tx(L, en, ar), h = c.history;
  const year = q.match(/\b(2024|2025)\b/)?.[1];
  const ch = ents.find((e) => e.kind === "channel") as Extract<Entity, { kind: "channel" }> | undefined;
  const proj = ents.find((e) => e.kind === "project");
  const vend = ents.find((e) => e.kind === "vendor");
  let rows = h.rows.filter((r) => (!year || r.year === year) && (!season || r.season === season) && (!ch || r.family === ch.family) && (!proj || r.projectKey === proj.name) && (!vend || r.vendorKey === vend.name));
  const scope = [season && T(SEASON_LABEL[season][0], SEASON_LABEL[season][1]), ch && T(FAMILY_LABEL[ch.family]?.[0] ?? ch.name, FAMILY_LABEL[ch.family]?.[1] ?? ch.name), proj && nm(L, proj.name), vend && nm(L, vend.name), year].filter(Boolean).join(" · ");
  const fmt = (r: (typeof rows)[number]) => T(`- **${r.name}** (${r.vendor}, ${r.start}→${r.end}): ${K(L, r.spendK)} → ${r.contracts} contracts, ${M(L, r.salesM)} — **${pct(r.costToSalesPct)}**`, `- **${r.name}** (${r.vendor}، ${r.start}→${r.end}): ${K(L, r.spendK)} ← ${r.contracts} عقداً، ${M(L, r.salesM)} — **${pct(r.costToSalesPct)}**`);

  if (RX.lessons.test(q) && !scope) return T(`**What the 2024–2025 campaigns taught us** (${h.total.campaigns} campaigns)\n`, `**ما تعلمناه من حملات 2024–2025** (${h.total.campaigns} حملة)\n`) + h.lessons.map((x) => `- ${x}`).join("\n");

  if (!rows.length) return T(`No past campaigns match ${scope || "that"}. The history covers ${h.total.from} to ${h.total.to}.`, `لا حملات سابقة تطابق ${scope || "ذلك"}. يغطي التاريخ ${h.total.from} إلى ${h.total.to}.`);
  const sorted = [...rows].filter((r) => r.costToSalesPct !== null).sort((a, b) => a.costToSalesPct! - b.costToSalesPct!);
  const best = RX.best.test(q), worst = RX.worst.test(q);
  const sum = rows.reduce((s, r) => ({ spendK: s.spendK + r.spendK, contracts: s.contracts + r.contracts, salesM: s.salesM + r.salesM }), { spendK: 0, contracts: 0, salesM: 0 });
  const cts = sum.salesM ? Math.round((sum.spendK / (sum.salesM * 1000)) * 1000) / 10 : null;
  const head = T(`**Campaign history${scope ? ` — ${scope}` : ""}**: ${rows.length} campaign(s), ${K(L, Math.round(sum.spendK))} spend → ${sum.contracts} contracts, ${M(L, Math.round(sum.salesM * 10) / 10)} sales (**${pct(cts)}** cost to sales; all history ${pct(h.total.costToSalesPct)}).\n`, `**تاريخ الحملات${scope ? ` — ${scope}` : ""}**: ${rows.length} حملات، إنفاق ${K(L, Math.round(sum.spendK))} ← ${sum.contracts} عقداً، مبيعات ${M(L, Math.round(sum.salesM * 10) / 10)} (**${pct(cts)}** من المبيعات؛ كل التاريخ ${pct(h.total.costToSalesPct)}).\n`);

  if (best || worst) {
    const pick = (worst && !best ? [...sorted].reverse() : sorted).slice(0, 5);
    return head + T(worst && !best ? "Least efficient:\n" : "Most efficient:\n", worst && !best ? "الأقل كفاءة:\n" : "الأكفأ:\n") + pick.map((r) => `${fmt(r)}\n  ${firstSentence(r.lesson)}`).join("\n");
  }
  if (!scope && /benchmark|by channel|channels|معيار|المعايير|القنوات/.test(q)) {
    return T("**Benchmarks by channel** (2024–2025, cost to sales — lower is better)\n", "**المعايير حسب القناة** (2024–2025، التكلفة إلى المبيعات — الأقل أفضل)\n") + h.byFamily.map((x) => T(`- ${x.label}: **${pct(x.costToSalesPct)}**, qualified ${pct(x.qualPct)}, ${x.contracts} contracts from ${x.campaigns} campaign(s)`, `- ${x.label}: **${pct(x.costToSalesPct)}**، المؤهلون ${pct(x.qualPct)}، ${x.contracts} عقداً من ${x.campaigns} حملات`)).join("\n");
  }
  if (!scope) {
    return head + T("\nBy season: ", "\nحسب الموسم: ") + h.bySeason.map((x) => `${x.label} ${pct(x.costToSalesPct)}`).join(T("; ", "؛ ")) +
      T("\nBy channel: ", "\nحسب القناة: ") + h.byFamily.map((x) => `${x.label} ${pct(x.costToSalesPct)}`).join(T("; ", "؛ ")) +
      T("\nBy year: ", "\nحسب السنة: ") + h.byYear.map((x) => `${x.key} ${pct(x.costToSalesPct)} (${M(L, x.salesM)})`).join(T("; ", "؛ ")) +
      T("\n\n**Lessons**\n", "\n\n**الدروس**\n") + h.lessons.slice(0, 4).map((x) => `- ${x}`).join("\n") +
      T("\n\nAsk about a season (Ramadan, summer), a year, a channel or a past campaign by name; the full list is on the History page.", "\n\nاسألوا عن موسم (رمضان، الصيف) أو سنة أو قناة أو حملة سابقة بالاسم؛ القائمة الكاملة في صفحة التاريخ.");
  }
  return head + sorted.slice(0, 8).map(fmt).join("\n") + (rows.length <= 3 ? `\n\n${rows.map((r) => `${r.name}: ${r.lesson}`).join("\n")}` : "");
}
