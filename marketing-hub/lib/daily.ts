// Daily campaign check — every morning the director looks at each live campaign and says what to change.
//
// For each live campaign, as of the day (data available up to that date):
//   COST_TO_SALES_HIGH   last-3-month CRM-verified cost to sales well above past campaigns of the same channel
//   SCALE_WINNER         clearly cheaper than the channel's history, with a healthy qualified rate
//   CPQL_RISING          cost per CRM-qualified lead last month vs the two months before (+20% or more)
//   QUALITY_DROP         qualified share of recent leads (14–44 days old) vs earlier leads (45–104 days)
//   PACING_OVER / UNDER  spend vs flight elapsed (media buys and retainers; not commission vendors)
//   SEASON_AHEAD         a season the history shows is weak (summer) starts within 30 days
//   ENDING_EXTEND / ENDING_LET_END   flight ends within 60 days: renew what works, let the rest end
// Benchmarks come from the campaign history (lib/history.ts). Each day's recommendations are stored, so the
// director can say what is new today, what has been open since when, and what resolved since yesterday. A decision
// (accepted / dismissed) carries over to the following days while the finding stays the same.
import { prisma } from "./prisma";
import { serial, single } from "./single";
import { buildAgent, type Agent } from "./agent";
import { benchmark, familyOf, FAMILY_LABEL, pastCampaigns, kpis } from "./history";
import { type Lang, tx, nm, K, dt, monthShort } from "./i18n";
import { TODAY } from "./clock";

const DAY = 86_400_000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const todayKey = () => iso(TODAY);
const SEV: Record<string, number> = { crit: 0, warn: 1, info: 2 };
// "past <noun> campaigns"
const NOUN: Record<string, [string, string]> = { DIGITAL: ["digital", "الرقمية"], INFLUENCER: ["influencer", "المؤثرين"], PORTAL: ["portal", "البوابات العقارية"], BROKER: ["broker", "الوسطاء"], PR: ["PR", "العلاقات العامة"], OUTDOOR: ["outdoor", "الإعلانات الخارجية"], EVENT: ["event", "الفعاليات"], RADIO: ["radio", "الإذاعة"] };
const monthLabel = (l: Lang, ym: string) => `${monthShort(l, ym)} ${ym.slice(0, 4)}`;

type Bi = { en: string; ar: string };
type Finding = { type: string; severity: "crit" | "warn" | "info"; code: string; campaign: string; vendor: string; asset: string; title: Bi; why: Bi; action: Bi; numbers: Record<string, number | string | null>; similar: string[]; href: string };

async function findings(a: Agent, date: string): Promise<Finding[]> {
  const d = new Date(`${date}T12:00:00Z`);
  const [dbCamps, leads, past] = await Promise.all([prisma.campaign.findMany(), prisma.crmLead.findMany(), pastCampaigns()]);
  const out: Finding[] = [];
  const both = (en: string, ar: string): Bi => ({ en, ar });
  // CRM freshness: volume checks are measured up to the CRM's latest lead, and a stale feed is a finding itself.
  // "As of" = the last day with normal daily volume (at least a quarter of the 28-day average), so a trickle of
  // stray leads after a feed stops doesn't read as a collapse in every campaign.
  const seen = leads.filter((x) => x.createdAt.getTime() <= d.getTime());
  const perDay = new Map<string, number>();
  for (const x of seen) perDay.set(iso(x.createdAt), (perDay.get(iso(x.createdAt)) ?? 0) + 1);
  let crmAsOf = d;
  for (let i = 0; i < 60; i++) {
    const day = new Date(d.getTime() - i * DAY);
    const avg = Array.from({ length: 28 }, (_, j) => perDay.get(iso(new Date(day.getTime() - (j + 1) * DAY))) ?? 0).reduce((x, y) => x + y, 0) / 28;
    if ((perDay.get(iso(day)) ?? 0) >= Math.max(1, avg * 0.25)) { crmAsOf = new Date(`${iso(day)}T23:59:59Z`); break; }
  }
  const staleDays = Math.floor((d.getTime() - crmAsOf.getTime()) / DAY);
  if (staleDays >= 3) out.push({ type: "DATA_STALE", severity: staleDays >= 7 ? "crit" : "warn", code: "ALL", campaign: "CRM feed", vendor: "", asset: "", similar: [], href: "/data",
    title: both(`CRM feed: almost no new leads for ${staleDays} days (normal volume until ${dt("en", crmAsOf)})`, `نظام العملاء: شبه انعدام للعملاء الجدد منذ ${staleDays} أيام (حجم طبيعي حتى ${dt("ar", crmAsOf)})`),
    why: both("Campaign results after that date are missing, so today's lead-volume and quality checks stop at that date.", "نتائج الحملات بعد ذلك التاريخ غير متوفرة، لذا تتوقف فحوص حجم العملاء وجودتهم اليوم عند ذلك التاريخ."),
    action: both("Ask Kinan to check the Yardi export / sync; campaign decisions this week rely on it.", "اطلبوا من كنان التحقق من تصدير Yardi أو المزامنة؛ فقرارات الحملات هذا الأسبوع تعتمد عليه."),
    numbers: { staleDays } });
  for (const c of a.unified.campaigns.filter((x) => x.status === "LIVE" && x.code)) {
    const m = a.mkt.campaigns.find((x) => x.id === c.id)!;
    const db = dbCamps.find((x) => x.id === c.id)!;
    const mv = a.mkt.vendors.find((v) => v.id === c.vendorId);
    const fam = familyOf(c.channel);
    const bench = await benchmark(fam);
    const famLabel = NOUN[fam] ?? FAMILY_LABEL[fam] ?? [c.channel, c.channel];
    const overall = await benchmark("ALL");
    const base = { code: c.code!, campaign: c.name, vendor: c.vendor, asset: c.asset || m.asset, href: "/campaigns" };
    const nmAr = nm("ar", c.name);
    const similar = past.filter((p) => familyOf(p.channel) === fam).sort((x, y) => (x.project === base.asset ? -1 : 0) - (y.project === base.asset ? -1 : 0)).slice(0, 3).map((p) => p.code);

    // Summer (July–August) is the weakest season for digital and creators in the history.
    const summer = new Date(`${date.slice(0, 4)}-07-01T00:00:00Z`);
    const daysTo = Math.round((summer.getTime() - d.getTime()) / DAY);
    const summerSoon = (fam === "DIGITAL" || fam === "INFLUENCER") && daysTo > 0 && daysTo <= 30;
    let winner = false;

    // Cost to sales over the last three complete months, vs the channel's history.
    const months = c.months.filter((x) => `${x.month}-28` < date);
    const last3 = months.slice(-3);
    const k3 = last3.reduce((s, x) => s + x.costK, 0), s3 = last3.reduce((s, x) => s + x.salesM, 0), q3 = last3.reduce((s, x) => s + x.qualified, 0);
    const c2s = s3 > 0 ? r1((k3 / (s3 * 1000)) * 100) : null;
    if (bench && c2s !== null && bench.costToSalesPct) {
      const ratio = c2s / bench.costToSalesPct;
      if (ratio >= 1.6 && c2s >= 2.5) {
        out.push({ ...base, type: "COST_TO_SALES_HIGH", severity: ratio >= 3 || c2s >= 6 ? "crit" : "warn", similar,
          title: both(`${c.name}: costs ${c2s}% of sales — ${r1(ratio)}× past ${famLabel[0]} campaigns`, `${nmAr}: تكلف ${c2s}% من المبيعات — ${r1(ratio)}× حملات ${famLabel[1]} السابقة`),
          why: both(`Last 3 months: ${K("en", r1(k3))} spent for SAR ${r1(s3)}M of CRM-verified sales. Past ${famLabel[0]} campaigns (${bench.n}) ran at ${bench.costToSalesPct}%.`, `آخر 3 أشهر: أُنفق ${K("ar", r1(k3))} مقابل ${r1(s3)} مليون ر.س مبيعات متحقَّق منها. عملت حملات ${famLabel[1]} السابقة (${bench.n}) بنسبة ${bench.costToSalesPct}%.`),
          action: both(c2s >= 6 ? "Pause or cut the budget by half; move it to the channel that converts best this month." : "Cut the budget by ~30% and ask the agency for a fix plan (targeting, offer, landing page).", c2s >= 6 ? "أوقفوها أو اخفضوا الميزانية إلى النصف؛ وانقلوها إلى القناة الأعلى تحويلاً هذا الشهر." : "اخفضوا الميزانية نحو 30% واطلبوا من الوكالة خطة تصحيح (الاستهداف، العرض، صفحة الهبوط)."),
          numbers: { costToSalesPct: c2s, benchmarkPct: bench.costToSalesPct, spendK: r1(k3), salesM: r1(s3) } });
      } else if (ratio <= 0.8 && (m.qualRatePct ?? 0) >= (bench.qualPct ?? 0) * 0.9 && (m.pacingPct ?? 100) <= 115) {
        winner = true;
        if (!summerSoon) out.push({ ...base, type: "SCALE_WINNER", severity: "info", similar,
          title: both(`${c.name}: a winner — ${c2s}% cost to sales vs ${bench.costToSalesPct}% historically`, `${nmAr}: حملة رابحة — ${c2s}% من المبيعات مقابل ${bench.costToSalesPct}% تاريخياً`),
          why: both(`Last 3 months: ${K("en", r1(k3))} for SAR ${r1(s3)}M; qualified rate ${m.qualRatePct}% (history ${bench.qualPct}%).`, `آخر 3 أشهر: ${K("ar", r1(k3))} مقابل ${r1(s3)} مليون ر.س؛ نسبة المؤهلين ${m.qualRatePct}% (تاريخياً ${bench.qualPct}%).`),
          action: mv?.model === "Commission"
            ? both("Give this broker network priority on inventory and launch events; consider a higher commission tier for the best units.", "امنحوا شبكة الوسطاء هذه أولوية في الوحدات وفعاليات الإطلاق؛ ويُنظر في شريحة عمولة أعلى لأفضل الوحدات.")
            : both("Raise the budget by ~15% in the next plan; watch cost per qualified lead weekly.", "ارفعوا الميزانية نحو 15% في الخطة القادمة؛ وراقبوا تكلفة العميل المؤهل أسبوعياً."),
          numbers: { costToSalesPct: c2s, benchmarkPct: bench.costToSalesPct, qualPct: m.qualRatePct } });
      }
    }

    // Cost per CRM-qualified lead: last month vs the two before.
    if (months.length >= 3) {
      const [p1, p2, l] = months.slice(-3);
      const prevQ = p1.qualified + p2.qualified, prev = prevQ ? ((p1.costK + p2.costK) * 1000) / prevQ : null, last = l.qualified ? (l.costK * 1000) / l.qualified : null;
      if (prev && last && last / prev >= 1.2) {
        const up = Math.round((last / prev - 1) * 100);
        out.push({ ...base, type: "CPQL_RISING", severity: up >= 35 ? "warn" : "info", similar,
          title: both(`${c.name}: cost per qualified lead up ${up}% in ${monthLabel("en", l.month)}`, `${nmAr}: ارتفعت تكلفة العميل المؤهل ${up}% في ${monthLabel("ar", l.month)}`),
          why: both(`SAR ${Math.round(last).toLocaleString("en-GB")} per CRM-qualified lead in ${monthLabel("en", l.month)}, vs SAR ${Math.round(prev).toLocaleString("en-GB")} in the two months before.`, `${Math.round(last).toLocaleString("en-GB")} ر.س لكل عميل مؤهل في ${monthLabel("ar", l.month)}، مقابل ${Math.round(prev).toLocaleString("en-GB")} ر.س في الشهرين السابقين.`),
          action: both("Ask the agency to refresh creative and tighten audiences this week; review again next Monday.", "اطلبوا من الوكالة تجديد المواد الإبداعية وتضييق الجمهور هذا الأسبوع؛ ثم المراجعة يوم الاثنين القادم."),
          numbers: { cpqlLast: Math.round(last), cpqlPrev: Math.round(prev), upPct: up } });
      }
    }

    // Lead quality: qualified share of leads 14–44 days old vs 45–104 days old (as of the date).
    const ls = leads.filter((x) => x.campaignId === c.id && x.createdAt.getTime() <= d.getTime());
    const age = (x: (typeof ls)[number]) => (crmAsOf.getTime() - x.createdAt.getTime()) / DAY;
    const QUAL = ["QUALIFIED", "VIEWING", "RESERVED", "WON"];
    const recent = ls.filter((x) => age(x) >= 14 && age(x) < 45), earlier = ls.filter((x) => age(x) >= 45 && age(x) < 105);
    if (recent.length >= 30 && earlier.length >= 30) {
      const qr = recent.filter((x) => QUAL.includes(x.stage)).length / recent.length, qe = earlier.filter((x) => QUAL.includes(x.stage)).length / earlier.length;
      if (qe > 0 && qr / qe <= 0.7) {
        const down = Math.round((1 - qr / qe) * 100);
        out.push({ ...base, type: "QUALITY_DROP", severity: "warn", similar,
          title: both(`${c.name}: lead quality down ${down}%`, `${nmAr}: انخفضت جودة العملاء المحتملين ${down}%`),
          why: both(`${Math.round(qr * 100)}% of leads from the last month qualified in the CRM, vs ${Math.round(qe * 100)}% before (${recent.length} vs ${earlier.length} leads).`, `تأهّل ${Math.round(qr * 100)}% من عملاء الشهر الأخير في النظام، مقابل ${Math.round(qe * 100)}% قبل ذلك (${recent.length} مقابل ${earlier.length} عميلاً).`),
          action: both("Check what changed (audience, placement, form questions) with the agency before spending more.", "تحققوا مع الوكالة مما تغيّر (الجمهور، أماكن الظهور، أسئلة النموذج) قبل زيادة الإنفاق."),
          numbers: { recentPct: Math.round(qr * 100), earlierPct: Math.round(qe * 100) } });
      }
    }

    // Lead volume this week vs the 4 weeks before (CRM, by creation date) — catches stalls early.
    const inWin = (from: number, to: number) => ls.filter((x) => age(x) >= from && age(x) < to).length;
    const week = inWin(0, 7), base4 = inWin(7, 35) / 4;
    if (base4 >= 8 && week <= base4 * 0.6) {
      const down = Math.round((1 - week / base4) * 100);
      out.push({ ...base, type: "VOLUME_DROP", severity: down >= 60 ? "warn" : "info", similar: [],
        title: both(`${c.name}: leads down ${down}% this week`, `${nmAr}: انخفض العملاء المحتملون ${down}% هذا الأسبوع`),
        why: both(`${week} new CRM leads in the 7 days to ${dt("en", crmAsOf)} vs ${Math.round(base4)} a week on average over the previous 4 weeks.`, `${week} عملاء جدد في النظام خلال 7 أيام حتى ${dt("ar", crmAsOf)} مقابل ${Math.round(base4)} أسبوعياً في المتوسط خلال الأسابيع الأربعة السابقة.`),
        action: both("Ask the agency today whether ads, forms or tracking stopped — a stall costs the whole month.", "اسألوا الوكالة اليوم إن كانت الإعلانات أو النماذج أو التتبع قد توقفت — التوقف يكلّف الشهر كله."),
        numbers: { week, avgWeek: Math.round(base4), downPct: down } });
    }

    // Pacing (not for commission vendors, whose spend follows sales).
    if (mv?.model !== "Commission" && m.pacingPct !== null) {
      if (m.pacingPct >= 120) out.push({ ...base, type: "PACING_OVER", severity: "warn", similar: [],
        title: both(`${c.name}: spending ahead of plan (${m.pacingPct}% pacing)`, `${nmAr}: إنفاق يسبق الخطة (وتيرة ${m.pacingPct}%)`),
        why: both(`${K("en", m.spendK)} of ${K("en", m.budgetK)} spent; at this rate the budget runs out before the flight ends on ${dt("en", db.endDate)}.`, `أُنفق ${K("ar", m.spendK)} من ${K("ar", m.budgetK)}؛ وبهذه الوتيرة تنفد الميزانية قبل نهاية الحملة في ${dt("ar", db.endDate)}.`),
        action: both("Cap the daily budget, or decide now whether to extend the budget — not after it runs out.", "ضعوا سقفاً للميزانية اليومية، أو قرروا الآن تمديد الميزانية — لا بعد نفادها."),
        numbers: { pacingPct: m.pacingPct, spendK: m.spendK, budgetK: m.budgetK } });
      else if (m.pacingPct <= 80) out.push({ ...base, type: "PACING_UNDER", severity: "info", similar: [],
        title: both(`${c.name}: under-delivering (${m.pacingPct}% pacing)`, `${nmAr}: تنفيذ أقل من المخطط (وتيرة ${m.pacingPct}%)`),
        why: both(`${K("en", m.spendK)} of ${K("en", m.budgetK)} spent so far.`, `أُنفق حتى الآن ${K("ar", m.spendK)} من ${K("ar", m.budgetK)}.`),
        action: both("Ask the agency why delivery is behind; release the unused budget to a winner if it can't catch up.", "اسألوا الوكالة عن سبب تأخر التنفيذ؛ وحرّروا الميزانية غير المستخدمة لحملة رابحة إن تعذّر اللحاق."),
        numbers: { pacingPct: m.pacingPct } });
    }

    // Season ahead: summer starts within 30 days (a winner trims less and scales again in September).
    if (summerSoon) {
      const s = await benchmark(fam, "SUMMER"), all = bench;
      if (s && all && s.costToSalesPct && all.costToSalesPct && s.costToSalesPct > all.costToSalesPct) out.push({ ...base, type: "SEASON_AHEAD", severity: winner ? "info" : "warn", similar: s.campaigns,
        title: both(`${c.name}: summer starts in ${daysTo} days — past summers cost ${s.costToSalesPct}% of sales`, `${nmAr}: يبدأ الصيف خلال ${daysTo} يوماً — كلّفت المواسم الصيفية السابقة ${s.costToSalesPct}% من المبيعات`),
        why: both(`Past summer ${famLabel[0]} campaigns (${s.campaigns.join(", ")}) ran at ${s.costToSalesPct}% cost to sales vs ${all.costToSalesPct}% for the channel overall.`, `عملت حملات ${famLabel[1]} الصيفية السابقة (${s.campaigns.join("، ")}) بنسبة ${s.costToSalesPct}% من المبيعات مقابل ${all.costToSalesPct}% للقناة عموماً.`),
        action: winner
          ? both(`It converts well (${c2s}% vs ${bench?.costToSalesPct}% historically), so trim only ~15% in July–August and scale it up again in September.`, `تحقق تحويلاً جيداً (${c2s}% مقابل ${bench?.costToSalesPct}% تاريخياً)، لذا اخفضوا نحو 15% فقط في يوليو وأغسطس وارفعوها مجدداً في سبتمبر.`)
          : both("Trim July–August budget by ~30%, keep retargeting on, and hold the difference for September.", "اخفضوا ميزانية يوليو وأغسطس نحو 30%، وأبقوا إعادة الاستهداف، واحتفظوا بالفرق لسبتمبر."),
        numbers: { daysToSummer: daysTo, summerPct: s.costToSalesPct, channelPct: all.costToSalesPct } });
    }

    // Flight ending within 60 days.
    const daysLeft = Math.round((db.endDate.getTime() - d.getTime()) / DAY);
    if (daysLeft > 0 && daysLeft <= 60 && bench?.costToSalesPct && c2s !== null) {
      const exiting = a.decisions.find((x) => x.vendorId === c.vendorId)?.decision === "EXIT";
      const good = !exiting && c2s <= bench.costToSalesPct * 1.3 && (!overall?.costToSalesPct || c2s <= overall.costToSalesPct * 2);
      out.push({ ...base, type: good ? "ENDING_EXTEND" : "ENDING_LET_END", severity: good ? "warn" : "info", similar,
        title: good ? both(`${c.name}: ends ${dt("en", db.endDate)} — worth renewing`, `${nmAr}: تنتهي ${dt("ar", db.endDate)} — تستحق التجديد`) : both(`${c.name}: ends ${dt("en", db.endDate)} — let it end`, `${nmAr}: تنتهي ${dt("ar", db.endDate)} — اتركوها تنتهي`),
        why: both(`${daysLeft} days left; ${c2s}% cost to sales vs ${bench.costToSalesPct}% for past ${famLabel[0]} campaigns and ${overall?.costToSalesPct}% across all past campaigns${exiting ? "; the vendor is being exited" : ""}.`, `بقي ${daysLeft} يوماً؛ ${c2s}% من المبيعات مقابل ${bench.costToSalesPct}% لحملات ${famLabel[1]} السابقة و${overall?.costToSalesPct}% لكل الحملات السابقة${exiting ? "؛ ويجري إنهاء التعامل مع المورد" : ""}.`),
        action: good ? both("Agree the renewal (and better terms) before the end date so leads don't stop.", "اتفقوا على التجديد (وبشروط أفضل) قبل تاريخ الانتهاء حتى لا يتوقف تدفق العملاء.") : both("Don't renew; move the budget to a channel that converts better.", "لا تجددوا؛ وانقلوا الميزانية إلى قناة أعلى تحويلاً."),
        numbers: { daysLeft, costToSalesPct: c2s, benchmarkPct: bench.costToSalesPct } });
    }
  }
  return out.sort((x, y) => SEV[x.severity] - SEV[y.severity]);
}

/** Store the day's findings; a decision carries over while the same finding (type + campaign) keeps appearing. */
const store = serial(async (date: string, fs: Finding[]) => {
  const existing = await prisma.dailyRecommendation.findMany();
  for (const f of fs) {
    const key = `${date}|${f.type}|${f.code}`;
    if (existing.some((e) => e.key === key)) continue;
    const prior = existing.filter((e) => e.type === f.type && e.campaignCode === f.code && e.date < date).sort((p, q) => q.date.localeCompare(p.date))[0];
    const inherit = prior && prior.status !== "OPEN" && Date.parse(date) - Date.parse(prior.date) <= 14 * DAY;
    await prisma.dailyRecommendation.create({ data: { key, date, campaignCode: f.code, type: f.type, severity: f.severity, payload: JSON.stringify(f), status: inherit ? prior.status : "OPEN", decidedBy: inherit ? prior.decidedBy : null, decidedAt: inherit ? prior.decidedAt : null, note: inherit ? prior.note : null } });
  }
});

/** Run the check for the last 7 days (first run backfills, then only missing days). */
export const ensureDaily = single(async function ensureDailyImpl() {
  const have = new Set((await prisma.dailyRecommendation.findMany()).map((r) => r.date));
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(TODAY.getTime() - (6 - i) * DAY)));
  const missing = days.filter((x) => !have.has(x));
  if (!missing.length) return;
  const a = await buildAgent("en");
  for (const day of missing) await store(day, await findings(a, day));
});

export async function dailyState(lang: Lang, date?: string) {
  await ensureDaily();
  const today = date ?? todayKey();
  const all = await prisma.dailyRecommendation.findMany();
  const days = [...new Set(all.map((r) => r.date))].sort();
  const prevDay = days.filter((x) => x < today).pop() ?? null;
  const T = (b: Bi) => (lang === "ar" ? b.ar : b.en);
  const view = (r: (typeof all)[number]) => {
    const f = JSON.parse(r.payload) as Finding;
    const firstSeen = all.filter((x) => x.type === r.type && x.campaignCode === r.campaignCode && x.date <= r.date).map((x) => x.date).sort()[0];
    return {
      id: r.id, key: r.key, date: r.date, type: r.type, severity: r.severity, code: r.campaignCode, campaign: nm(lang, f.campaign), vendor: nm(lang, f.vendor), asset: nm(lang, f.asset),
      title: T(f.title), why: T(f.why), action: T(f.action), numbers: f.numbers, similar: f.similar, href: f.href,
      status: r.status, decidedBy: r.decidedBy, note: r.note, isNew: firstSeen === r.date, since: firstSeen,
    };
  };
  const todays = all.filter((r) => r.date === today).map(view).sort((x, y) => SEV[x.severity] - SEV[y.severity]);
  const resolved = prevDay ? all.filter((r) => r.date === prevDay && !todays.some((t) => t.type === r.type && t.code === r.campaignCode)).map(view) : [];
  const past = await pastCampaigns();
  const lessonFor = (code: string) => { const p = past.find((x) => x.code === code); return p ? { code, name: lang === "ar" ? p.nameAr : p.name, lesson: lang === "ar" ? p.lessonAr : p.lesson, ...kpis(p) } : null; };
  const notes = await prisma.dailyNote.findMany();
  const note = notes.find((n) => n.key === `${today}|${lang}`);
  return {
    date: today, prevDay, days: days.slice(-7),
    summary: { total: todays.length, open: todays.filter((x) => x.status === "OPEN").length, new: todays.filter((x) => x.isNew).length, urgent: todays.filter((x) => x.severity === "crit").length, resolved: resolved.length },
    recommendations: todays.map((x) => ({ ...x, similarPast: x.similar.map(lessonFor).filter(Boolean) })),
    resolved,
    aiNote: note ? { text: note.text, provider: note.provider, model: note.model, createdAt: note.createdAt.toISOString() } : null,
  };
}
export type DailyState = Awaited<ReturnType<typeof dailyState>>;

export async function decideDaily(id: string, decision: "ACCEPT" | "DISMISS" | "REOPEN", approver: string, note: string | null, lang: Lang) {
  if (!approver?.trim()) throw new Error(tx(lang, "Your name is required.", "اسمكم مطلوب."));
  const r = (await prisma.dailyRecommendation.findMany()).find((x) => x.id === id);
  if (!r) throw new Error(tx(lang, "Recommendation not found.", "التوصية غير موجودة."));
  const status = decision === "ACCEPT" ? "ACCEPTED" : decision === "DISMISS" ? "DISMISSED" : "OPEN";
  await prisma.dailyRecommendation.update({ where: { id }, data: { status, decidedBy: status === "OPEN" ? null : approver.trim(), decidedAt: status === "OPEN" ? null : new Date(), note: note?.trim() || null } });
  const f = JSON.parse(r.payload) as Finding;
  await prisma.marketingAction.create({ data: { type: "DAILY_" + status, campaign: f.campaign, detail: tx(lang, `${f.title.en} — ${status.toLowerCase()} by ${approver.trim()}${note ? ` (${note})` : ""}.`, `${f.title.ar} — ${status === "ACCEPTED" ? "قبلها" : status === "DISMISSED" ? "رفضها" : "أعاد فتحها"} ${approver.trim()}${note ? ` (${note})` : ""}.`) } });
}

/** Optional AI second opinion on today's check (Claude, OpenAI or Gemini). On demand, cached per day and language. */
export async function generateDailyNote(lang: Lang) {
  const { runLlm, llmStatus } = await import("./llm");
  if (!llmStatus().enabled) throw new Error(tx(lang, "AI needs an Anthropic, OpenAI or Gemini API key (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY). The rules-based check above works without it.", "يتطلب الذكاء الاصطناعي مفتاح Anthropic أو OpenAI أو Gemini (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY). يعمل الفحص المعتمد على القواعد أعلاه دونه."));
  const s = await dailyState(lang);
  const { historyState } = await import("./history");
  const h = await historyState(lang);
  const res = await runLlm({
    task: "analysis",
    system: `You are the AI Director of Marketing for a Saudi real-estate developer with a single marketing manager. Write today's note on the daily campaign check: at most 140 words, ${lang === "ar" ? "in Modern Standard Arabic with Western digits" : "in English"}, plain text with "- " bullets. Say what to do first and why, group items that belong to the same campaign, point out where today's figures repeat a lesson from the campaign history, and flag anything the rules may have missed. Use only the numbers given; do not invent any. Do not propose lead follow-up or sales tasks (Kinan's agent handles leads).`,
    data: JSON.stringify({ date: s.date, summary: s.summary, recommendations: s.recommendations.map((r) => ({ severity: r.severity, campaign: r.campaign, title: r.title, why: r.why, action: r.action, openSince: r.since, status: r.status })), resolvedSinceYesterday: s.resolved.map((r) => r.title), historyLessons: h.lessons, benchmarks: h.byFamily.map((x) => ({ channel: x.label, costToSalesPct: x.costToSalesPct })) }),
    messages: [{ role: "user", content: tx(lang, "Write today's note.", "اكتب ملاحظة اليوم.") }],
    maxTokens: 4000,
  });
  if (res.refused || !res.text) throw new Error(tx(lang, "The AI did not return a note — try again.", "لم يُرجع الذكاء الاصطناعي ملاحظة — حاولوا مجدداً."));
  const key = `${s.date}|${lang}`;
  const ex = (await prisma.dailyNote.findMany()).find((n) => n.key === key);
  const data = { date: s.date, lang, provider: res.provider, model: res.model, text: res.text };
  if (ex) await prisma.dailyNote.update({ where: { id: ex.id }, data }); else await prisma.dailyNote.create({ data: { key, ...data } });
}
