// The daily scan: every data source is checked once a day, before the report is built, for anything a marketing
// initiative should answer. Findings from all sources share one shape (Signal, lib/crm-signals.ts) and are stored per
// day (SignalScan), so the report, the Initiatives page and the assistant use the same findings.
//
//   CRM          unusual falls / surges in leads, qualified leads, contracts, lost reasons     lib/crm-signals.ts
//   Email        vendor notices, proposals, market news and event deadlines in the inbox      lib/inbox.ts
//   Invoices     committed PO budget doing nothing (paused or under-spent campaigns)           Oracle POs
//   Social & ads click-through down ≥20% over 12 weeks (creative fatigue), cost per platform lead up ≥25%
//   Competitors  a competitor ramping up Meta ads, with its offer                              Meta Ad Library
//   Market       district transactions / prices moving, mortgage rates moving                  market data
//   Calendar     the moments in the next four months that need planning now                    marketing calendar
//
// Signals are cross-linked: evidence from one source that explains another (a vendor's email about a CRM dip, unused
// PO budget on a paused campaign behind a decline) is attached to it and answered together with it.
import { prisma } from "./prisma";
import { TODAY } from "./clock";
import { ensureCrmSynced } from "./crm";
import { crmSignals, signalView, SOURCE_LABEL, type Signal, type SignalSource } from "./crm-signals";
import { readInbox, senderLabel } from "./inbox";
import { buildInvoiceDashboard, ensureOracleSynced } from "./invoices";
import { ensureAdsSynced } from "./adaccounts";
import { COMPETITORS, AD_MONTHS, marketSummary, MORTGAGE } from "./market";
import { upcoming, momentView } from "./calendar";
import { readNews, newsAngle, newsCities, TOPIC_LABEL } from "./news";
import { familyOf } from "./history";
import { type Lang, nm, dt } from "./i18n";
import { serial } from "./single";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const r1 = (x: number) => Math.round(x * 10) / 10;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const base = { recent: 0, baseline: 0, changePct: 0, stat: 0, drivers: [] as Signal["drivers"], campaign: null as string | null, vendor: null as string | null, family: null as string | null };

export type ScannedSource = { source: SignalSource; items: number; unit: Bi; mode: string; note: Bi | null; found: number };
export type Scan = { date: string; scannedAt: string; liveAt?: string; sources: ScannedSource[]; signals: Signal[] };

type Camp = { id: string; name: string; project: string; vendor: string; family: string; status: string; startDate: Date; endDate: Date; crmCode: string | null };

// ------------------------------------------------------------------ email
function emailSignals(msgs: Awaited<ReturnType<typeof readInbox>>["messages"], camps: Camp[], now: Date): Signal[] {
  const KIND = { ISSUE: "EMAIL_ISSUE", OPPORTUNITY: "EMAIL_OPPORTUNITY", MARKET: "EMAIL_MARKET", EVENT: "EMAIL_EVENT" } as const;
  return msgs.filter((m) => m.topic !== "OTHER" && now.getTime() - Date.parse(m.date) <= 30 * DAY && Date.parse(m.date) <= now.getTime() + DAY).map((m): Signal => {
    const fam = m.vendor ? camps.find((c) => c.vendor === m.vendor && (!m.project || c.project === m.project))?.family ?? null : null;
    const who = { en: senderLabel(m, "en"), ar: senderLabel(m, "ar") };
    return { ...base, source: "EMAIL", id: `EMAIL|${m.id}`, kind: KIND[m.topic as keyof typeof KIND], metric: "mail", direction: m.topic === "ISSUE" || m.topic === "MARKET" ? "down" : "up",
      severity: m.topic === "ISSUE" || m.topic === "MARKET" ? "warn" : "info", scope: m.project ? "project" : "portfolio", project: m.project, vendor: m.vendor, family: fam,
      from: m.date.slice(0, 10), to: m.date.slice(0, 10), meta: { sender: who.en, topic: m.topic },
      title: bi(`${who.en}: ${m.subject.en}`, `${who.ar}: ${m.subject.ar}`),
      why: bi(`Email of ${dt("en", m.date)}: “${m.preview.en}”`, `رسالة بتاريخ ${dt("ar", m.date)}: «${m.preview.ar}»`) };
  });
}

// --------------------------------------------------------------- invoices
async function invoiceSignals(camps: Camp[], now: Date): Promise<{ signals: Signal[]; items: number; mode: string }> {
  await ensureOracleSynced();
  const inv = await buildInvoiceDashboard("en");
  const commission = new Set((await prisma.vendor.findMany()).filter((v) => /commission/i.test(v.model)).map((v) => v.name));
  const out: Signal[] = [];
  for (const po of inv.purchaseOrders) {
    const c = camps.find((x) => x.name === po.campaign);
    if (!c || po.remainingK < 50 || commission.has(c.vendor)) continue; // commission vendors are paid as sales close
    const elapsed = Math.round(Math.min(1, Math.max(0, (now.getTime() - c.startDate.getTime()) / (c.endDate.getTime() - c.startDate.getTime()))) * 100);
    const paused = c.status === "PAUSED";
    if (!paused && po.utilisationPct > elapsed - 15) continue; // spending roughly in line with the flight
    const k = Math.round(po.remainingK);
    out.push({ ...base, source: "INVOICES", id: `INVOICES|${po.poNumber}`, kind: "BUDGET_HEADROOM", metric: "budget", direction: "up", severity: paused ? "warn" : "info", scope: "campaign",
      project: c.project, campaign: c.name, vendor: c.vendor, family: c.family, recent: po.utilisationPct, baseline: elapsed, from: iso(c.startDate), to: iso(c.endDate), meta: { amountK: k, po: po.poNumber },
      title: paused ? bi(`SAR ${k}K unused on the paused ${c.name} (${po.poNumber})`, `${k} ألف ر.س غير مستخدمة في ${nm("ar", c.name)} المتوقفة (${po.poNumber})`)
        : bi(`SAR ${k}K left on ${c.name} — spending behind the flight (${po.poNumber})`, `${k} ألف ر.س متبقية في ${nm("ar", c.name)} — الإنفاق متأخر عن مدة الحملة (${po.poNumber})`),
      why: bi(`Oracle: SAR ${Math.round(po.invoicedK)}K of ${Math.round(po.amountK)}K invoiced on ${c.vendor}'s PO (${po.utilisationPct}%) with ${elapsed}% of the flight gone${paused ? "; the campaign is paused, so the rest is committed budget doing nothing" : ""}. It can be redeployed (or the campaign restarted) without new budget approval.`,
        `أوراكل: فوترة ${Math.round(po.invoicedK)} ألف من ${Math.round(po.amountK)} ألف ر.س على أمر شراء ${nm("ar", c.vendor)} (${po.utilisationPct}%) بعد مضي ${elapsed}% من مدة الحملة${paused ? "؛ والحملة متوقفة، فالمتبقي ميزانية ملتزم بها بلا استخدام" : ""}. يمكن إعادة توجيهها (أو إعادة تشغيل الحملة) دون اعتماد ميزانية جديدة.`) });
  }
  return { signals: out, items: inv.invoices.length + inv.purchaseOrders.length, mode: inv.integration.mode };
}

// ------------------------------------------------------------- social & ads
async function adSignals(camps: Camp[]): Promise<{ signals: Signal[]; items: number }> {
  await ensureAdsSynced();
  const rows = await prisma.adPlatformWeek.findMany();
  const out: Signal[] = [];
  const weeks = [...new Set(rows.map((r) => r.week))].sort().slice(-12);
  if (weeks.length < 8) return { signals: out, items: rows.length };
  for (const c of camps.filter((x) => x.crmCode && x.status === "LIVE")) {
    const rs = rows.filter((r) => r.campaignCode === c.crmCode && weeks.includes(r.week));
    if (!rs.length) continue;
    const agg = (ws: string[], plat?: string) => { const x = rs.filter((r) => ws.includes(r.week) && (!plat || r.platform === plat)); const imp = x.reduce((s, r) => s + r.impressionsK, 0), clk = x.reduce((s, r) => s + r.clicks, 0), sp = x.reduce((s, r) => s + r.spendK, 0), ld = x.reduce((s, r) => s + r.platformLeads, 0); return { ctr: imp ? clk / (imp * 10) : 0, cpl: ld ? (sp * 1000) / ld : 0 }; };
    const first = weeks.slice(0, 4), last = weeks.slice(-4);
    const a = agg(first), b = agg(last);
    if (!a.ctr) continue;
    const ch = b.ctr / a.ctr - 1;
    const plats = [...new Set(rs.map((r) => r.platform))].filter((p) => { const x = agg(first, p), y = agg(last, p); return x.ctr && y.ctr / x.ctr - 1 <= -0.2; });
    if (ch <= -0.2) {
      out.push({ ...base, source: "ADS", id: `ADS|${c.crmCode}|ctr`, kind: "AD_FATIGUE", metric: "ctr", direction: "down", severity: ch <= -0.4 ? "crit" : "warn", scope: "campaign",
        project: c.project, campaign: c.name, vendor: c.vendor, family: c.family, recent: r1(b.ctr), baseline: r1(a.ctr), changePct: Math.round(ch * 100), from: weeks[0], to: weeks[weeks.length - 1], meta: { platforms: plats.join(", ") }, series: weeks.map((w) => r1(agg([w]).ctr * 100) / 100),
        title: bi(`${c.name}: click-through rate down ${Math.round(-ch * 100)}% in 12 weeks${plats.length ? ` (${plats.map((p) => p[0] + p.slice(1).toLowerCase()).join(", ")})` : ""}`, `${nm("ar", c.name)}: انخفاض نسبة النقر ${Math.round(-ch * 100)}% خلال 12 أسبوعاً${plats.length ? ` (${plats.join("، ")})` : ""}`),
        why: bi(`Ad platforms: ${r1(a.ctr)}% CTR in the first 4 weeks vs ${r1(b.ctr)}% in the last 4, with the same creatives running — the audience has seen them too often (creative fatigue). Cost per platform lead SAR ${Math.round(a.cpl)} → ${Math.round(b.cpl)}.`,
          `المنصات الإعلانية: نسبة نقر ${r1(a.ctr)}% في أول 4 أسابيع مقابل ${r1(b.ctr)}% في آخر 4، بالإعلانات نفسها — شاهدها الجمهور أكثر من اللازم (إرهاق الإعلانات). تكلفة العميل من المنصة ${Math.round(a.cpl)} ← ${Math.round(b.cpl)} ر.س.`) });
      continue;
    }
    const cc = a.cpl ? b.cpl / a.cpl - 1 : 0;
    if (cc >= 0.25) out.push({ ...base, source: "ADS", id: `ADS|${c.crmCode}|cpl`, kind: "AD_COST_RISE", metric: "cpl", direction: "down", severity: "warn", scope: "campaign",
      project: c.project, campaign: c.name, vendor: c.vendor, family: c.family, recent: Math.round(b.cpl), baseline: Math.round(a.cpl), changePct: Math.round(cc * 100), from: weeks[0], to: weeks[weeks.length - 1],
      title: bi(`${c.name}: cost per platform lead up ${Math.round(cc * 100)}%`, `${nm("ar", c.name)}: ارتفاع تكلفة العميل من المنصات ${Math.round(cc * 100)}%`),
      why: bi(`Ad platforms: SAR ${Math.round(a.cpl)} per lead in the first 4 of the last 12 weeks vs SAR ${Math.round(b.cpl)} in the last 4.`, `المنصات الإعلانية: ${Math.round(a.cpl)} ر.س للعميل في أول 4 من آخر 12 أسبوعاً مقابل ${Math.round(b.cpl)} ر.س في آخر 4.`) });
  }
  return { signals: out, items: rows.length };
}

// ------------------------------------------------------------ competitors
function competitorSignals(): Signal[] {
  const out: Signal[] = [];
  const n = AD_MONTHS.length, mL = (l: Lang, m: string) => dt(l, `${m}-01`, { month: "long" });
  for (const x of COMPETITORS) {
    const now = x.activeAds[n - 1], before = x.activeAds[n - 4] ?? 0;
    if (now < 10 || !(before === 0 || now / before >= 1.5)) continue;
    out.push({ ...base, source: "COMPETITORS", id: `COMPETITORS|${x.name}`, kind: "COMPETITOR_PUSH", metric: "ads", direction: "down", severity: "warn", scope: "project",
      project: x.threatTo, recent: now, baseline: before, changePct: before ? Math.round((now / before - 1) * 100) : 100, from: `${AD_MONTHS[n - 4]}-01`, to: `${AD_MONTHS[n - 1]}-01`,
      meta: { competitor: x.name, offer: x.offer, offerAr: x.offerAr, project: x.project, pricePerSqm: x.pricePerSqmSAR, district: x.district },
      title: bi(`${x.name} ramps up: ${before} → ${now} Meta ads since ${mL("en", AD_MONTHS[n - 4])} — “${x.offer}”`, `${x.nameAr} يكثّف: ${before} ← ${now} إعلاناً على ميتا منذ ${mL("ar", AD_MONTHS[n - 4])} — «${x.offerAr}»`),
      why: bi(`Meta Ad Library: ${x.project} (${x.district}, ${x.type.toLowerCase()}, SAR ${x.pricePerSqmSAR.toLocaleString("en")}/sqm) is competing for the same buyers as ${x.threatTo} on ${x.channels}.`, `مكتبة إعلانات ميتا: ${x.projectAr} (${nm("ar", x.district)}، ${x.pricePerSqmSAR.toLocaleString("en")} ر.س/م²) ينافس على مشتري ${nm("ar", x.threatTo)} نفسهم.`) });
  }
  return out;
}

// ----------------------------------------------------------------- market
function marketSignals(): Signal[] {
  const out: Signal[] = [];
  for (const d of marketSummary()) {
    if (!d.project) continue;
    const mon = (l: Lang) => dt(l, `${d.month}-01`, { month: "long", year: "numeric" });
    if (d.transactionsYoYPct <= -4) out.push({ ...base, source: "MARKET", id: `MARKET|${d.district}|down`, kind: "MARKET_SHIFT", metric: "transactions", direction: "down", severity: "warn", scope: "project", project: d.project,
      recent: d.transactions, changePct: Math.round(d.transactionsYoYPct), from: `${d.month}-01`, to: `${d.month}-01`, meta: { district: d.district, priceYoYPct: d.priceYoYPct, offPlanPct: d.offPlanSharePct },
      title: bi(`${d.district} market softening: transactions ${d.transactionsYoYPct}% year on year`, `تباطؤ سوق ${d.districtAr}: الصفقات ${d.transactionsYoYPct}% على أساس سنوي`),
      why: bi(`${mon("en")}: ${d.transactions} transactions, price ${d.priceYoYPct > 0 ? "+" : ""}${d.priceYoYPct}% y/y at SAR ${d.pricePerSqmSAR.toLocaleString("en")}/sqm; off-plan is ${d.offPlanSharePct}% of supply, so buyers have many alternatives to ${d.project}.`, `${mon("ar")}: ${d.transactions} صفقة، والسعر ${d.priceYoYPct}% سنوياً عند ${d.pricePerSqmSAR.toLocaleString("en")} ر.س/م²؛ والبيع على الخارطة ${d.offPlanSharePct}% من المعروض، فلدى المشترين بدائل كثيرة لـ${nm("ar", d.project)}.`) });
    else if (d.transactionsYoYPct >= 8 && d.priceYoYPct >= 5) out.push({ ...base, source: "MARKET", id: `MARKET|${d.district}|up`, kind: "MARKET_SHIFT", metric: "transactions", direction: "up", severity: "info", scope: "project", project: d.project,
      recent: d.transactions, changePct: Math.round(d.transactionsYoYPct), from: `${d.month}-01`, to: `${d.month}-01`, meta: { district: d.district, priceYoYPct: d.priceYoYPct },
      title: bi(`${d.district} rising: transactions +${d.transactionsYoYPct}%, prices +${d.priceYoYPct}% year on year`, `ارتفاع ${d.districtAr}: الصفقات +${d.transactionsYoYPct}% والأسعار +${d.priceYoYPct}% سنوياً`),
      why: bi(`${mon("en")}: SAR ${d.pricePerSqmSAR.toLocaleString("en")}/sqm. A rising market makes "buy before prices move" credible for ${d.project}.`, `${mon("ar")}: ${d.pricePerSqmSAR.toLocaleString("en")} ر.س/م². السوق الصاعد يجعل رسالة «اشترِ قبل ارتفاع الأسعار» مقنعة لـ${nm("ar", d.project)}.`) });
  }
  const last = MORTGAGE[MORTGAGE.length - 1], yAgo = MORTGAGE[MORTGAGE.length - 13];
  const diff = r1(last.rateFromPct - yAgo.rateFromPct);
  if (Math.abs(diff) >= 0.3) out.push({ ...base, source: "MARKET", id: "MARKET|mortgage", kind: "FINANCE_SHIFT", metric: "rate", direction: diff < 0 ? "up" : "down", severity: "info", scope: "portfolio", project: null,
    recent: last.rateFromPct, baseline: yAgo.rateFromPct, changePct: Math.round((diff / yAgo.rateFromPct) * 100), from: `${yAgo.month}-01`, to: `${last.month}-01`, meta: { rate: last.rateFromPct, diff },
    title: diff < 0 ? bi(`Mortgage rates down to ${last.rateFromPct}% (−${-diff} pt in a year)`, `أسعار التمويل العقاري انخفضت إلى ${last.rateFromPct}% (−${-diff} نقطة خلال عام)`) : bi(`Mortgage rates up to ${last.rateFromPct}% (+${diff} pt in a year)`, `أسعار التمويل العقاري ارتفعت إلى ${last.rateFromPct}% (+${diff} نقطة خلال عام)`),
    why: diff < 0 ? bi(`SAMA data: rates from ${last.rateFromPct}% vs ${yAgo.rateFromPct}% a year ago; new mortgages SAR ${last.newMortgagesSARbn}bn a month. Monthly instalments are lower — more salaried buyers qualify.`, `بيانات ساما: من ${last.rateFromPct}% مقابل ${yAgo.rateFromPct}% قبل عام؛ وتمويل جديد ${last.newMortgagesSARbn} مليار ر.س شهرياً. الأقساط أقل — ويتأهل مشترون موظفون أكثر.`)
      : bi(`SAMA data: rates from ${last.rateFromPct}% vs ${yAgo.rateFromPct}% a year ago — instalments rise; payment plans matter more.`, `بيانات ساما: من ${last.rateFromPct}% مقابل ${yAgo.rateFromPct}% قبل عام — ترتفع الأقساط وتزداد أهمية خطط السداد.`) });
  return out;
}

// --------------------------------------------------------------- calendar
// Celebrations and moments (lib/calendar.ts) from today's real date: each one inside its preparation window, or
// coming within ~5 months, becomes a dated moment to plan for. Light content-only days are left out.
async function calendarSignals(): Promise<{ signals: Signal[]; items: number; mode: string; note: Bi | null }> {
  const u = await upcoming(170);
  const SKIP = new Set(["FLAG_DAY", "HIJRI_NY"]);
  const signals = u.items.filter((m) => !SKIP.has(m.key) && m.from > u.today).map((m): Signal => {
    const v = momentView(m, "en", u.today), va = momentView(m, "ar", u.today);
    const urgent = v.late || v.inDays <= m.leadWeeks * 7 + 7;
    return { ...base, source: "CALENDAR", id: `CALENDAR|${m.id}`, kind: "CALENDAR_MOMENT", metric: "date", direction: m.direction, severity: urgent && m.direction === "up" ? "warn" : "info", scope: "portfolio", project: null,
      recent: v.inDays, from: m.from, to: m.to, meta: { days: v.inDays, moment: m.name.en, key: m.key, city: m.city, prepBy: v.prepBy, source: m.source, url: m.url ?? null },
      title: bi(`In ${v.inDays} days: ${m.name.en} (${v.when})`, `بعد ${va.inDays} يوماً: ${m.name.ar} (${va.when})`),
      why: bi(`${m.angle.en} ${v.late ? `Preparation should have started by ${dt("en", v.prepBy)} — decide now.` : `Prepare from ${dt("en", v.prepBy)} (${m.leadWeeks} weeks ahead).`} Source: ${m.sourceNote.en}.`,
        `${m.angle.ar} ${va.late ? `كان ينبغي بدء التحضير بحلول ${dt("ar", v.prepBy)} — قرروا الآن.` : `التحضير من ${dt("ar", v.prepBy)} (قبل ${m.leadWeeks} أسابيع).`} المصدر: ${m.sourceNote.ar}.`) };
  });
  return { signals, items: u.items.length, mode: u.ics.connected ? "Umm al-Qura + your calendar" : "Umm al-Qura + announced", note: u.ics.error ? bi(`your calendar: ${u.ics.error}`, `تقويمكم: ${u.ics.error}`) : null };
}

// ------------------------------------------------------------------- news
// Live news for Kinan's focus cities (lib/news.ts): what a property marketer should act on becomes a signal.
async function newsSignals(): Promise<{ signals: Signal[]; items: number; mode: string; note: Bi | null }> {
  const n = await readNews();
  const signals = n.items.filter((x) => x.topic !== "ECONOMY" || x.score >= 3).slice(0, 10).map((x): Signal => {
    const a = newsAngle(x), lab = TOPIC_LABEL[x.topic];
    return { ...base, source: "NEWS", id: `NEWS|${x.id}`, kind: "NEWS_ITEM", metric: "news", direction: x.direction, severity: x.topic === "REGULATION" || (x.direction === "down" && x.topic === "REAL_ESTATE") ? "warn" : "info",
      scope: x.project ? "project" : "portfolio", project: x.project, from: x.date, to: x.date,
      meta: { url: x.url, publisher: x.publisher, topic: x.topic, city: x.city, date: x.date },
      title: bi(`${x.city && !x.title.en.includes(x.city) ? `${x.city} · ` : ""}${x.title.en}`, `${x.city && !x.title.ar.includes(nm("ar", x.city)) ? `${nm("ar", x.city)} · ` : ""}${x.title.ar}`),
      why: bi(`${lab.en} — ${x.publisher}, ${dt("en", x.date)}${x.summary ? `: ${x.summary.en}` : "."} What it means: ${a.en}`, `${lab.ar} — ${x.publisher}، ${dt("ar", x.date)}${x.summary ? `: ${x.summary.ar}` : "."} ما يعنيه: ${a.ar}`) };
  });
  const when = dt("en", n.fetchedAt.slice(0, 10));
  return { signals, items: n.items.length, mode: n.mode === "live" ? "live (Google News)" : n.mode,
    note: n.mode === "snapshot" ? bi(`real news gathered ${when}${n.error ? ` — live feeds unreachable (${n.error})` : ""}`, `أخبار حقيقية جُمعت في ${dt("ar", n.fetchedAt.slice(0, 10))}${n.error ? ` — تعذّر الوصول للمصادر المباشرة` : ""}`)
      : bi(`read ${new Date(n.fetchedAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (Riyadh) · ${newsCities().join(", ")}`, `قُرئت ${new Date(n.fetchedAt).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${newsCities().map((c) => nm("ar", c)).join("، ")}`) };
}

// -------------------------------------------------------------- linking
/** Attach evidence across sources; mark a signal as answered with another when it explains it. */
function link(all: Signal[]) {
  const add = (to: Signal, s: Signal) => { (to.related ??= []).push({ id: s.id, source: s.source, title: s.title, why: s.why }); };
  const crmDown = all.filter((s) => s.source === "CRM" && s.direction === "down");
  const drives = (s: Signal, pred: (d: Signal["drivers"][number]) => boolean) => s.drivers.some((d) => d.perWeek < 0 && pred(d));
  for (const s of all) {
    if (s.source === "CRM") continue;
    let host: Signal | undefined;
    if (s.kind === "EMAIL_ISSUE" || s.kind === "EMAIL_OPPORTUNITY") host = crmDown.find((c) => c.project === s.project && (drives(c, (d) => d.vendor === s.vendor) || c.vendor === s.vendor));
    if (s.kind === "BUDGET_HEADROOM") host = crmDown.find((c) => c.project === s.project && drives(c, (d) => d.campaign === s.campaign));
    if (s.kind === "EMAIL_MARKET") host = all.find((c) => c.kind === "COMPETITOR_PUSH" && c.project === s.project);
    if (host) { add(host, s); s.linkedTo = host.id; continue; }
    // Context without merging: a competitor push, ad fatigue or a softening market next to a CRM fall.
    if (["COMPETITOR_PUSH", "AD_FATIGUE", "AD_COST_RISE", "MARKET_SHIFT"].includes(s.kind) && s.direction === "down") for (const c of crmDown.filter((x) => x.project === s.project)) add(c, s);
  }
}

const SEV = { crit: 0, warn: 1, info: 2 } as const;
const SRC_ORDER: SignalSource[] = ["CRM", "EMAIL", "ADS", "INVOICES", "COMPETITORS", "MARKET", "NEWS", "CALENDAR"];

/** Run every detector now (no cache). */
export async function runScan(): Promise<Scan> {
  const now = TODAY;
  // Bring every source up to date first (each is a no-op once synced), then detect.
  await ensureCrmSynced(); await ensureOracleSynced(); await ensureAdsSynced();
  const [campaigns, vendors] = await Promise.all([prisma.campaign.findMany({ include: { asset: true, vendor: true } }), prisma.vendor.findMany()]);
  const camps: Camp[] = campaigns.map((c) => ({ id: c.id, name: c.name, project: c.asset.name, vendor: c.vendor.name, family: familyOf(c.channel), status: c.status, startDate: c.startDate, endDate: c.endDate, crmCode: c.crmCode }));
  const [crm, inbox, inv, ads] = await Promise.all([crmSignals(), readInbox(vendors.map((v) => ({ name: v.name, email: v.email }))), invoiceSignals(camps, now), adSignals(camps)]);
  const leadCount = await prisma.crmLead.count();
  const email = emailSignals(inbox.messages, camps, now), comp = competitorSignals(), mkt = marketSignals();
  const [cal, news] = await Promise.all([calendarSignals(), newsSignals()]);
  const signals = [...crm.signals, ...email, ...inv.signals, ...ads.signals, ...comp, ...mkt, ...news.signals, ...cal.signals];
  link(signals);
  signals.sort((p, q) => SEV[p.severity] - SEV[q.severity] || (p.direction === q.direction ? 0 : p.direction === "down" ? -1 : 1) || SRC_ORDER.indexOf(p.source) - SRC_ORDER.indexOf(q.source));
  const cnt = (src: SignalSource) => signals.filter((s) => s.source === src).length;
  const sources: ScannedSource[] = [
    { source: "CRM", items: leadCount, unit: bi("leads", "عميل"), mode: process.env.CRM_MODE ?? "mock", note: crm.asOf ? bi(`data to ${dt("en", crm.asOf)}`, `بيانات حتى ${dt("ar", crm.asOf)}`) : null, found: cnt("CRM") },
    { source: "EMAIL", items: inbox.messages.length, unit: bi("emails (30 days)", "رسالة (30 يوماً)"), mode: inbox.mode, note: inbox.error ? bi(inbox.error, inbox.error) : inbox.mode === "mock" ? bi("sample inbox", "صندوق بريد نموذجي") : null, found: cnt("EMAIL") },
    { source: "INVOICES", items: inv.items, unit: bi("invoices and POs", "فاتورة وأمر شراء"), mode: inv.mode, note: null, found: cnt("INVOICES") },
    { source: "ADS", items: ads.items, unit: bi("weekly ad rows", "صفاً أسبوعياً من المنصات"), mode: process.env.ADS_MODE ?? "mock", note: null, found: cnt("ADS") },
    { source: "COMPETITORS", items: COMPETITORS.length, unit: bi("competitors (Meta Ad Library)", "منافسين (مكتبة إعلانات ميتا)"), mode: "sample", note: null, found: cnt("COMPETITORS") },
    { source: "MARKET", items: marketSummary().length + 1, unit: bi("district series + mortgage rates", "سلاسل الأحياء + أسعار التمويل"), mode: "sample", note: null, found: cnt("MARKET") },
    { source: "NEWS", items: news.items, unit: bi("news items (Jeddah, Riyadh)", "خبراً (جدة، الرياض)"), mode: news.mode, note: news.note, found: cnt("NEWS") },
    { source: "CALENDAR", items: cal.items, unit: bi("celebrations and moments (6 months)", "مناسبة وموسماً (6 أشهر)"), mode: cal.mode, note: cal.note, found: cnt("CALENDAR") },
  ];
  return { date: iso(now), scannedAt: new Date().toISOString(), liveAt: new Date().toISOString(), sources, signals };
}

const LIVE_TTL = 3 * 3_600_000;
/** Replace the news and calendar findings in a stored scan with fresh ones. */
async function refreshLive(scan: Scan): Promise<Scan> {
  const [cal, news] = await Promise.all([calendarSignals(), newsSignals()]);
  const keep = scan.signals.filter((s) => s.source !== "NEWS" && s.source !== "CALENDAR");
  const signals = [...keep, ...news.signals, ...cal.signals];
  const src = (k: SignalSource, x: typeof cal, unit: Bi): ScannedSource => ({ source: k, items: x.items, unit, mode: x.mode, note: x.note, found: signals.filter((s) => s.source === k).length });
  const sources = [...scan.sources.filter((s) => s.source !== "NEWS" && s.source !== "CALENDAR"),
    src("NEWS", news, bi("news items (Jeddah, Riyadh)", "خبراً (جدة، الرياض)")), src("CALENDAR", cal, bi("celebrations and moments (6 months)", "مناسبة وموسماً (6 أشهر)"))];
  return { ...scan, liveAt: new Date().toISOString(), sources, signals };
}

/** Today's scan: run once per day (before the report), then reused. force = rescan now (live snapshot). */
export const dailyScan = serial(async function dailyScanImpl(force = false): Promise<Scan> {
  const key = iso(TODAY);
  const existing = (await prisma.signalScan.findMany()).find((r) => r.key === key);
  if (existing && !force) {
    // The data sources are scanned once a day; the live ones (news, calendar) are refreshed every few hours.
    const scan = JSON.parse(existing.payload) as Scan;
    if (scan.liveAt && Date.now() - Date.parse(scan.liveAt) < LIVE_TTL) return scan;
    const fresh = await refreshLive(scan);
    await prisma.signalScan.update({ where: { key }, data: { payload: JSON.stringify(fresh) } });
    return fresh;
  }
  const scan = await runScan();
  if (existing) await prisma.signalScan.update({ where: { key }, data: { payload: JSON.stringify(scan) } });
  else await prisma.signalScan.create({ data: { key, date: key, payload: JSON.stringify(scan) } });
  return scan;
});

/** The scan in one language for pages, reports and the assistant. */
export function scanView(scan: Scan, lang: Lang) {
  const L = (x: Bi) => (lang === "ar" ? x.ar : x.en);
  return {
    date: scan.date, scannedAt: scan.scannedAt,
    sources: scan.sources.map((s) => ({ source: s.source, label: L(SOURCE_LABEL[s.source]), items: s.items, unit: L(s.unit), mode: s.mode, note: s.note ? L(s.note) : null, found: s.found })),
    signals: scan.signals.map(signalView(lang)),
  };
}
export type ScanView = ReturnType<typeof scanView>;

/** Short answer for the assistant: what today's scan found, by source. */
export async function scanAnswer(lang: Lang, project?: string | null) {
  const T = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const v = scanView(await dailyScan(), lang);
  const top = v.signals.filter((s) => !s.linkedTo && (!project || s.projectKey === project));
  if (project) return T(`**What the data shows for ${nm("en", project)}**\n`, `**ما تُظهره البيانات لـ${nm("ar", project)}**\n`) +
    (top.length ? top.map((s) => `- [${s.sourceLabel}] **${s.title}** — ${s.why}${s.related.length ? `\n  ${T("Explained by", "يفسّره")}: ${s.related.map((r) => `[${r.sourceLabel}] ${r.title} — ${r.why}`).join("; ")}` : ""}`).join("\n") : T("Nothing unusual for this project in any source.", "لا شيء غير معتاد لهذا المشروع في أي مصدر.")) +
    T("\n\nThe initiative that answers each finding is on the **Initiatives** page (\"Initiatives for this\").", "\n\nالمبادرة التي تستجيب لكل نتيجة في صفحة **المبادرات** («مبادرات لهذه الإشارة»).");
  return T(`**What the data shows today** — scanned ${v.sources.map((s) => `${s.label} (${s.items.toLocaleString("en")} ${s.unit})`).join(", ")}.\n`, `**ما تُظهره البيانات اليوم** — فُحص: ${v.sources.map((s) => `${s.label} (${s.items.toLocaleString("en")} ${s.unit})`).join("، ")}.\n`) +
    (top.length ? top.slice(0, 10).map((s) => `- [${s.sourceLabel}] **${s.title}** — ${s.why}${s.related.length ? `\n  ${T("Related", "مرتبط")}: ${s.related.map((r) => `[${r.sourceLabel}] ${r.title}`).join("; ")}` : ""}`).join("\n") : T("Nothing unusual in any source.", "لا شيء غير معتاد في أي مصدر.")) +
    T("\n\nEach finding gets a market initiative that answers it, in the daily report and on the **Initiatives** page. Follow-up of the leads themselves stays with Kinan's agent.", "\n\nلكل نتيجة مبادرة سوق تستجيب لها في التقرير اليومي وصفحة **المبادرات**. وتبقى متابعة العملاء أنفسهم لدى وكيل كنان.");
}
