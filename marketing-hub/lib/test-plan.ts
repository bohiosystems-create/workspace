// Incrementality tests, end to end:
//
//   recommend  → which vendors to test now (material spend, no test evidence, a renewal coming), with a ready design
//   design     → a full test design from the data: type (holdout for digital, geo otherwise), weeks, holdout share or
//                matched test / control regions from the CRM's lead cities, weekly volume, the smallest lift it can
//                detect, dates and the campaign code — from the Tests page or the assistant ("design a holdout test
//                for Tasweeq")
//   set up     → a brief to the vendor telling it exactly what to do (exclusion audience or paused regions, dates,
//                code, what not to change, weekly numbers to send) — drafted into the email queue for approval
//   run        → weekly numbers arrive (POST RECORD_TEST_WEEK from the vendor's export / the ad platform, or the
//                weekly CRM read for geo tests); the test closes itself when its weeks are done and the readout
//                (lift, share caused, cost per incremental result) feeds the vendor's score and renewal decision
//   demo       → the whole flow simulated in a minute on the Tests page (DEMO_TEST), clearly labelled as a demo
//
// Nothing here contacts a vendor or changes a campaign by itself: the brief is an email draft that needs a named
// approver; starting the test needs a named approver.
import { prisma } from "./prisma";
import type { Agent } from "./agent";
import { leadProfiles } from "./audience";
import { powerHoldout, powerGeo } from "./stats";
import { todayRiyadh } from "./clock";
import { type Lang, tx, K, nm, dt } from "./i18n";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const r1 = (x: number) => Math.round(x * 10) / 10;
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Next Monday (Riyadh) — tests start on a week boundary. */
const nextMonday = () => { const t = todayRiyadh(); const dow = new Date(`${t}T00:00:00Z`).getUTCDay(); return addDays(t, ((8 - dow) % 7) || 7); };

export type TestKind = "HOLDOUT" | "GEO";
export type TestDesign = {
  kind: TestKind; weeks: number; metric: string; code: string | null; campaign: string;
  holdoutPct?: number; weeklyConversions?: number; // holdout
  weeklyVolume?: number; cv?: number; preWeeks?: number; test?: string[]; control?: string[]; // geo
  startDate: string; endDate: string; mdePct: number | null; demo?: boolean;
};
export type Candidate = {
  vendorId: string; vendor: string; campaign: string; code: string | null; kind: TestKind; spendK: number; evidence: "MMM" | "NONE";
  design: TestDesign; why: string; stake: string; priority: number;
};

// ------------------------------------------------------------------ design
/** Matched regions for a geo test: the vendor's lead cities split so both halves have similar volume. */
async function regionsFor(vendorId: string, a: Agent) {
  const codes = new Set(a.unified.campaigns.filter((c) => c.vendorId === vendorId).map((c) => c.code).filter(Boolean));
  const rows = (await leadProfiles()).filter((l) => l.campaignCode && codes.has(l.campaignCode));
  const by = new Map<string, number>();
  for (const l of rows) { const c = l.profile?.city; if (c && c !== "Abroad") by.set(c, (by.get(c) ?? 0) + 1); }
  const sorted = [...by.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  const test: string[] = [], control: string[] = [];
  sorted.forEach(([c], i) => ((i % 4 === 0 || i % 4 === 3) ? test : control).push(c)); // ABBA: balanced volumes
  if (!sorted.length) return { test: ["Jeddah North", "Al Zahra"], control: ["Al Rawdah", "Al Salamah"], weeklyLeads: 0 };
  const total = rows.length, months = Math.max(1, new Set(rows.map((l) => l.month)).size);
  return { test, control, weeklyLeads: Math.max(1, Math.round((total * test.length / sorted.length) / (months * 4.33))) };
}

export async function designTest(input: { vendorId: string; campaign?: string; kind?: TestKind; weeks?: number; holdoutPct?: number }, a: Agent, lang: Lang): Promise<TestDesign> {
  const vcs = a.unified.campaigns.filter((c) => c.vendorId === input.vendorId);
  const v = a.mkt.vendors.find((x) => x.id === input.vendorId);
  if (!v) throw new Error(tx(lang, "Vendor not found.", "المورد غير موجود."));
  const live = vcs.filter((c) => c.status === "LIVE").sort((x, y) => y.verified.costK - x.verified.costK);
  const camp = (input.campaign ? vcs.find((c) => c.name === input.campaign || c.code === input.campaign) : undefined) ?? live[0] ?? vcs[0];
  const digital = vcs.some((c) => c.digital);
  const kind: TestKind = input.kind ?? (digital ? "HOLDOUT" : "GEO");
  const weeks = Math.min(16, Math.max(2, Math.round(input.weeks ?? 6)));
  const months = Math.max(1, camp?.months.length ?? 5);
  const startDate = nextMonday(), endDate = addDays(startDate, weeks * 7 - 1);
  const base = { weeks, code: camp?.code ?? null, campaign: camp?.name ?? v.name, startDate, endDate };
  if (kind === "HOLDOUT") {
    const holdoutPct = Math.min(50, Math.max(5, input.holdoutPct ?? 20));
    const weeklyConversions = Math.max(1, Math.round((camp?.verified.qualified ?? 30) / (months * 4.33)));
    return { ...base, kind, metric: "CRM-qualified leads", holdoutPct, weeklyConversions, mdePct: powerHoldout(weeklyConversions, holdoutPct, weeks) };
  }
  const r = await regionsFor(input.vendorId, a);
  const weeklyVolume = r.weeklyLeads || Math.max(1, Math.round((camp?.verified.leads ?? 40) / (months * 4.33) / 2));
  return { ...base, kind, metric: "CRM leads", weeklyVolume, cv: 0.1, preWeeks: 6, test: r.test, control: r.control, mdePct: powerGeo(weeklyVolume, 0.1, weeks, 6) };
}

/** Which tests to run now: material spend, no test evidence, not already testing — the renewal at stake first. */
export async function testCandidates(a: Agent, lang: Lang): Promise<Candidate[]> {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const running = await prisma.experiment.findMany();
  const out: Candidate[] = [];
  for (const s of a.scores) {
    if (s.incrementalEvidence === "TEST" || s.costK < 200) continue;
    if (running.some((e) => e.vendorId === s.vendorId && e.status !== "COMPLETED")) continue;
    const d = await designTest({ vendorId: s.vendorId }, a, lang);
    const dec = a.decisions.find((x) => x.vendorId === s.vendorId);
    const inc = a.incrementality.perVendor.find((x) => x.vendorId === s.vendorId);
    const months = dec?.monthsToExpiry ?? 12;
    const stake = dec && months <= 9
      ? T(`Contract ends ${dt("en", dec.contractEnd)} (${months} months); the renewal decision (${dec.decision.toLowerCase().replace("_", " ")}) rests on how much of the results the vendor really causes.`, `ينتهي العقد في ${dt("ar", dec.contractEnd)} (${months} أشهر)؛ ويعتمد قرار التجديد على مقدار النتائج التي يتسبب بها المورد فعلاً.`)
      : T(`${K("en", s.costK)} a year at stake with no proof of effect.`, `${K("ar", s.costK)} سنوياً دون إثبات للأثر.`);
    const why = T(
      `${K("en", s.costK)} spent with ${inc?.evidence === "MMM" ? `only media-mix evidence (≈${Math.round((inc.share ?? 0) * 100)}% incremental, a wide range)` : "no incrementality evidence"}. ${d.kind === "HOLDOUT" ? `A ${d.weeks}-week audience holdout (${d.holdoutPct}%)` : `A ${d.weeks}-week geo test (${d.test?.join(", ")} vs ${d.control?.join(", ")})`} detects a lift of about ${d.mdePct ?? "—"}% or more.`,
      `أُنفق ${K("ar", s.costK)} ${inc?.evidence === "MMM" ? `بأدلة من نموذج المزيج فقط (≈${Math.round((inc.share ?? 0) * 100)}% أثر إضافي بنطاق واسع)` : "دون أدلة على الأثر الإضافي"}. ${d.kind === "HOLDOUT" ? `مجموعة مستبعدة ${d.holdoutPct}% لمدة ${d.weeks} أسابيع` : `اختبار جغرافي لمدة ${d.weeks} أسابيع (${d.test?.map((x) => nm("ar", x)).join("، ")} مقابل ${d.control?.map((x) => nm("ar", x)).join("، ")})`} يكشف أثراً من نحو ${d.mdePct ?? "—"}% فأكثر.`);
    out.push({ vendorId: s.vendorId, vendor: s.vendor, campaign: d.campaign, code: d.code, kind: d.kind, spendK: s.costK, evidence: inc?.evidence === "MMM" ? "MMM" : "NONE", design: d, why, stake, priority: (months <= 9 ? 1000 : 0) + s.costK });
  }
  return out.sort((x, y) => y.priority - x.priority);
}

// ------------------------------------------------------------------ plan (PLANNED experiment)
export async function planTest(input: { vendorId: string; campaign?: string; kind?: TestKind; weeks?: number; holdoutPct?: number; demo?: boolean }, a: Agent, lang: Lang) {
  const d = await designTest(input, a, lang);
  if (input.demo) d.demo = true;
  const v = a.mkt.vendors.find((x) => x.id === input.vendorId)!;
  const name = `${d.kind === "HOLDOUT" ? "Audience holdout" : "Geo test"} — ${d.campaign}${d.demo ? " (demo)" : ""}`;
  const e = await prisma.experiment.create({ data: { kind: d.kind, vendorId: v.id, campaign: d.campaign, status: "PLANNED", name, designJson: JSON.stringify(d) } });
  return { id: e.id, design: d, vendor: v.name };
}

/** A plain description of a design (chat, report). */
export function designText(d: TestDesign, vendor: string, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const dates = `${dt(lang, d.startDate)} → ${dt(lang, d.endDate)}`;
  return d.kind === "HOLDOUT"
    ? T(`Audience holdout for ${vendor} on ${d.campaign}${d.code ? ` (${d.code})` : ""}: ${d.holdoutPct}% of the target audience is never shown the ads for ${d.weeks} weeks (${dates}); we compare CRM-qualified leads between the exposed and held-out groups (~${d.weeklyConversions} a week). Detects a lift of ${d.mdePct ?? "—"}% or more.`,
        `مجموعة مستبعدة لـ${nm("ar", vendor)} في ${nm("ar", d.campaign)}${d.code ? ` (${d.code})` : ""}: لا تُعرض الإعلانات على ${d.holdoutPct}% من الجمهور لمدة ${d.weeks} أسابيع (${dates})؛ ونقارن العملاء المؤهلين في النظام بين المجموعتين (~${d.weeklyConversions} أسبوعياً). يكشف أثراً من ${d.mdePct ?? "—"}% فأكثر.`)
    : T(`Geo test for ${vendor} on ${d.campaign}${d.code ? ` (${d.code})` : ""}: the campaign runs in ${d.test?.join(", ")} and is paused in the matched control regions ${d.control?.join(", ")} for ${d.weeks} weeks (${dates}); CRM leads in the test regions are compared with what the control regions predict (~${d.weeklyVolume} a week, ${d.preWeeks} pre-weeks). Detects a lift of ${d.mdePct ?? "—"}% or more.`,
        `اختبار جغرافي لـ${nm("ar", vendor)} في ${nm("ar", d.campaign)}${d.code ? ` (${d.code})` : ""}: تعمل الحملة في ${d.test?.map((x) => nm("ar", x)).join("، ")} وتتوقف في مناطق الضبط المطابقة ${d.control?.map((x) => nm("ar", x)).join("، ")} لمدة ${d.weeks} أسابيع (${dates})؛ وتُقارن عملاء النظام في مناطق الاختبار بما تتنبأ به مناطق الضبط (~${d.weeklyVolume} أسبوعياً). يكشف أثراً من ${d.mdePct ?? "—"}% فأكثر.`);
}

// ------------------------------------------------------------------ the vendor's setup brief
export function setupBrief(e: { id: string; name: string; designJson: string }, vendor: { name: string; contact?: string | null }, lang: Lang) {
  const d = JSON.parse(e.designJson) as TestDesign;
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const dates = `${dt(lang, d.startDate)} – ${dt(lang, d.endDate)}`;
  const steps = d.kind === "HOLDOUT"
    ? [T(`Create a ${d.holdoutPct}% random holdout of the target audience for ${d.campaign}${d.code ? ` (${d.code})` : ""} and exclude it from all ad sets for the whole period ${dates}.`, `أنشئوا مجموعة عشوائية بنسبة ${d.holdoutPct}% من جمهور ${nm("ar", d.campaign)}${d.code ? ` (${d.code})` : ""} واستبعدوها من جميع المجموعات الإعلانية طوال الفترة ${dates}.`),
       T("Keep creative, bids, budget pacing and targeting unchanged during the test; tell us before any change.", "أبقوا الإعلانات والمزايدات ووتيرة الميزانية والاستهداف دون تغيير خلال الاختبار؛ وأبلغونا قبل أي تعديل."),
       T("Every Monday send: exposed audience size, held-out audience size, and leads from each group (platform export), with our campaign code.", "أرسلوا كل اثنين: حجم الجمهور المعرَّض وحجم المجموعة المستبعدة وعدد العملاء من كل مجموعة (تصدير المنصة)، مع رمز حملتنا."),
       T(`Our CRM will count qualified leads per group by campaign code ${d.code ?? ""}; please keep utm_campaign exactly as it is.`, `سيحسب نظامنا العملاء المؤهلين لكل مجموعة حسب رمز الحملة ${d.code ?? ""}؛ فأبقوا utm_campaign كما هو.`)]
    : [T(`Run ${d.campaign}${d.code ? ` (${d.code})` : ""} only in ${d.test?.join(", ")} and pause it entirely in ${d.control?.join(", ")} for ${dates}.`, `شغّلوا ${nm("ar", d.campaign)}${d.code ? ` (${d.code})` : ""} في ${d.test?.map((x) => nm("ar", x)).join("، ")} فقط وأوقفوها كلياً في ${d.control?.map((x) => nm("ar", x)).join("، ")} خلال ${dates}.`),
       T("Do not move the paused regions' budget elsewhere; keep creative, bids and targeting unchanged in the test regions.", "لا تنقلوا ميزانية المناطق المتوقفة إلى مكان آخر؛ وأبقوا الإعلانات والمزايدات والاستهداف دون تغيير في مناطق الاختبار."),
       T("Every Monday send spend, impressions and leads by region for the previous week (platform export).", "أرسلوا كل اثنين الإنفاق ومرات الظهور والعملاء حسب المنطقة للأسبوع السابق (تصدير المنصة)."),
       T("We will read CRM leads by region ourselves; the result is shared with you when the test closes.", "سنقرأ عملاء النظام حسب المنطقة بأنفسنا؛ ونشارككم النتيجة عند إغلاق الاختبار.")];
  const subject = T(`Incrementality test set-up — ${d.campaign} (${dates})`, `إعداد اختبار الأثر الإضافي — ${nm("ar", d.campaign)} (${dates})`);
  const body = [
    T(`Dear ${vendor.contact ?? vendor.name} team,`, `فريق ${nm("ar", vendor.name)} الكرام،`),
    "",
    T(`To measure what ${d.campaign} adds beyond what would happen anyway, we are running a ${d.kind === "HOLDOUT" ? "controlled audience holdout" : "geo test"} for ${d.weeks} weeks, ${dates}. Please set it up as follows:`,
      `لقياس ما تضيفه ${nm("ar", d.campaign)} فوق ما كان سيحدث على أي حال، سنجري ${d.kind === "HOLDOUT" ? "اختبار مجموعة مستبعدة" : "اختباراً جغرافياً"} لمدة ${d.weeks} أسابيع، ${dates}. نرجو إعداده كما يلي:`),
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    T(`Please confirm the set-up by ${dt(lang, addDays(d.startDate, -3))}. The test can detect a lift of about ${d.mdePct ?? "—"}% or more; the readout (lift, share of results caused, cost per incremental lead) is shared with you and feeds our partnership review.`,
      `نرجو تأكيد الإعداد بحلول ${dt(lang, addDays(d.startDate, -3))}. يكشف الاختبار أثراً من نحو ${d.mdePct ?? "—"}% فأكثر؛ وتُشارك النتيجة معكم (الأثر، ونسبة النتائج المتسبب بها، وتكلفة العميل الإضافي) وتدخل في مراجعة الشراكة.`),
    "",
    T("Thank you,", "مع الشكر،"),
  ].join("\n");
  return { subject, body };
}

/** Draft the setup brief into the email queue (approval needed before anything is sent). Returns the draft's id. */
export async function draftSetupEmail(id: string, lang: Lang) {
  const e = (await prisma.experiment.findMany()).find((x) => x.id === id);
  if (!e) throw new Error(tx(lang, "Test not found.", "الاختبار غير موجود."));
  const v = (await prisma.vendor.findMany()).find((x) => x.id === e.vendorId);
  if (!v) throw new Error(tx(lang, "Vendor not found.", "المورد غير موجود."));
  const { createCustomDraft } = await import("./recommendations");
  const vl: Lang = (v as any).language === "ar" ? "ar" : "en";
  const { subject, body } = setupBrief(e, { name: v.name, contact: (v as any).contact }, vl);
  const recKey = `TEST_SETUP:${e.id}`;
  await createCustomDraft({ vendorId: v.id, recKey, subject, body }, lang);
  const mail = (await prisma.outboundEmail.findMany()).filter((m) => m.recKey === recKey).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  return { emailId: mail?.id ?? null, subject, vendor: v.name, existed: !!mail && +new Date(mail.createdAt) < Date.now() - 5000 };
}

// ------------------------------------------------------------------ running: weekly data → readout
type HoldoutWeek = { week: string; exposedUsers: number; holdoutUsers: number; exposedConv: number; holdoutConv: number; spendK: number };
type GeoWeek = { week: string; test: number; control: number; spendK: number };
/** Record one week of results; closes the test (COMPLETED, readout-ready data) when its weeks are done. */
export async function recordTestWeek(id: string, w: Partial<HoldoutWeek & GeoWeek>, lang: Lang) {
  const e = (await prisma.experiment.findMany()).find((x) => x.id === id);
  if (!e) throw new Error(tx(lang, "Test not found.", "الاختبار غير موجود."));
  if (e.status !== "RUNNING") throw new Error(tx(lang, "Only a running test takes weekly data.", "لا تُسجَّل بيانات أسبوعية إلا لاختبار جارٍ."));
  const d = JSON.parse(e.designJson) as TestDesign;
  const data = e.dataJson ? JSON.parse(e.dataJson) : {};
  const weeks: any[] = Array.isArray(data.weeks) ? data.weeks : [];
  weeks.push({ week: w.week ?? addDays(d.startDate, weeks.length * 7), ...w });
  let next: any = { ...data, weeks };
  const done = weeks.length >= d.weeks;
  if (e.kind === "HOLDOUT") {
    const s = (k: keyof HoldoutWeek) => weeks.reduce((t, x) => t + (Number(x[k]) || 0), 0);
    next = { ...next, exposedUsers: Math.max(...weeks.map((x) => Number(x.exposedUsers) || 0)), holdoutUsers: Math.max(...weeks.map((x) => Number(x.holdoutUsers) || 0)), exposedConv: s("exposedConv"), holdoutConv: s("holdoutConv"), spendK: r1(s("spendK")) };
  } else {
    // Pre-period from the CRM's recent weeks when recorded; otherwise the design's weekly volume with the usual
    // week-to-week variation (cv), so the readout's uncertainty is realistic rather than zero.
    const jit = (k: number) => 1 + (d.cv ?? 0.1) * Math.sin(k * 2.3 + 0.7) * 1.4;
    const pre = data.pre ?? { test: Array.from({ length: d.preWeeks ?? 6 }, (_, k) => Math.round((d.weeklyVolume ?? 20) * jit(k))), control: Array.from({ length: d.preWeeks ?? 6 }, (_, k) => Math.round((d.weeklyVolume ?? 20) * jit(k + 3))) };
    next = { ...next, pre, post: { test: weeks.map((x) => Number(x.test) || 0), control: weeks.map((x) => Number(x.control) || 0) }, spendK: r1(weeks.reduce((t, x) => t + (Number(x.spendK) || 0), 0)) };
  }
  await prisma.experiment.update({ where: { id }, data: { dataJson: JSON.stringify(next), ...(done ? { status: "COMPLETED" } : {}) } });
  if (done) await prisma.marketingAction.create({ data: { type: "TEST_COMPLETED", campaign: e.campaign, detail: tx(lang, `${e.name} completed after ${d.weeks} weeks — readout available on Tests.`, `اكتمل ${e.name} بعد ${d.weeks} أسابيع — النتيجة متاحة في الاختبارات.`) } });
  return { weeksDone: weeks.length, weeks: d.weeks, completed: done };
}

// ------------------------------------------------------------------ demo: the whole flow, simulated
/** A plausible week of results with a true lift (~45%) — for the end-to-end demo only. */
function fakeWeek(d: TestDesign, i: number, lift = 0.45): Partial<HoldoutWeek & GeoWeek> {
  const noise = () => 0.85 + ((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1 + 1) % 1 * 0.3; // deterministic jitter
  if (d.kind === "HOLDOUT") {
    const h = (d.holdoutPct ?? 20) / 100, exposedUsers = 400_000, holdoutUsers = Math.round((exposedUsers * h) / (1 - h));
    const base = (d.weeklyConversions ?? 30) * noise();
    const holdoutConv = Math.round((base * h) / (1 - h) / (1 + lift)), exposedConv = Math.round(base);
    return { exposedUsers, holdoutUsers, exposedConv, holdoutConv, spendK: r1(10 * noise()) };
  }
  const v = d.weeklyVolume ?? 20;
  return { test: Math.round(v * (1 + lift) * noise()), control: Math.round(v * noise()), spendK: r1(20 * noise()) };
}
/** One step of the demo: create → email → approve → week… → (closes itself). Returns what happened, for the timeline. */
export async function demoTest(b: { step: "create" | "email" | "approve" | "week" | "reset"; id?: string; vendorId?: string; approver?: string }, a: Agent, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  if (b.step === "reset") {
    const all = await prisma.experiment.findMany();
    for (const e of all) if (/\(demo\)$/.test(e.name)) { await prisma.experiment.update({ where: { id: e.id }, data: { status: "COMPLETED", name: `${e.name} ✕` } }); }
    return { message: T("Demo tests archived.", "أُرشفت اختبارات العرض.") };
  }
  if (b.step === "create") {
    const cands = await testCandidates(a, lang);
    const vendorId = b.vendorId ?? cands[0]?.vendorId ?? a.scores.sort((x, y) => y.costK - x.costK)[0].vendorId;
    const p = await planTest({ vendorId, kind: cands.find((c) => c.vendorId === vendorId)?.kind, demo: true }, a, lang);
    return { id: p.id, message: T(`Designed from the data: ${designText(p.design, p.vendor, lang)}`, `صُمّم من البيانات: ${designText(p.design, p.vendor, lang)}`), design: p.design };
  }
  if (!b.id) throw new Error("id required");
  if (b.step === "email") { const r = await draftSetupEmail(b.id, lang); return { message: T(`Set-up brief drafted for ${r.vendor} — “${r.subject}” — waiting for your approval in the email queue (nothing sent).`, `أُعدّت مسودة موجز الإعداد لـ${nm("ar", r.vendor)} — «${r.subject}» — بانتظار اعتمادكم في قائمة البريد (لم يُرسل شيء).`), emailId: r.emailId }; }
  if (b.step === "approve") {
    const { approveTest } = await import("./incrementality");
    await approveTest(b.id, b.approver?.trim() || "Demo", lang);
    return { message: T(`Approved by ${b.approver?.trim() || "Demo"} — the test is running; weekly numbers now arrive from the vendor's export and the CRM.`, `اعتمده ${b.approver?.trim() || "العرض"} — الاختبار جارٍ؛ وتصل الأرقام الأسبوعية الآن من تصدير المورد والنظام.`) };
  }
  const e = (await prisma.experiment.findMany()).find((x) => x.id === b.id);
  if (!e) throw new Error("Test not found.");
  const d = JSON.parse(e.designJson) as TestDesign;
  const i = (e.dataJson ? JSON.parse(e.dataJson).weeks?.length ?? 0 : 0);
  const w = fakeWeek(d, i);
  const r = await recordTestWeek(b.id, w, lang);
  const msg = d.kind === "HOLDOUT" ? T(`Week ${r.weeksDone}/${r.weeks}: exposed ${w.exposedConv} qualified leads vs ${w.holdoutConv} in the ${d.holdoutPct}% holdout.`, `الأسبوع ${r.weeksDone}/${r.weeks}: ${w.exposedConv} عميلاً مؤهلاً في المجموعة المعرَّضة مقابل ${w.holdoutConv} في المستبعدة (${d.holdoutPct}%).`)
    : T(`Week ${r.weeksDone}/${r.weeks}: ${w.test} leads in the test regions vs ${w.control} in control.`, `الأسبوع ${r.weeksDone}/${r.weeks}: ${w.test} عميلاً في مناطق الاختبار مقابل ${w.control} في الضبط.`);
  return { message: r.completed ? `${msg} ${T("All weeks in — the test closed itself and the readout feeds the vendor's score.", "اكتملت الأسابيع — أُغلق الاختبار تلقائياً وتدخل النتيجة في تقييم المورد.")}` : msg, ...r };
}

// ------------------------------------------------------------------ views (report, chat, page)
export async function testsOverview(a: Agent, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const cands = await testCandidates(a, lang);
  const running = a.incrementality.tests.filter((t) => t.status === "RUNNING");
  const planned = a.incrementality.tests.filter((t) => t.status === "PLANNED");
  const completed = a.incrementality.tests.filter((t) => t.status === "COMPLETED" && t.readout);
  return {
    candidates: cands.map((c) => ({ ...c, designText: designText(c.design, c.vendor, lang) })),
    planned: planned.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, text: designText(t.design as TestDesign, t.vendor, lang) })),
    running: running.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, weeks: t.design.weeks, weeksDone: (t as any).weeksDone ?? 0, endDate: (t.design as TestDesign).endDate })),
    completed: completed.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, text: t.readout!.significant
      ? T(`${Math.round(t.readout!.incrementalShare * 100)}% of ${t.readout!.metric} caused by the vendor (lift ${t.readout!.liftPct}%, 90% range ${t.readout!.liftLowPct}–${t.readout!.liftHighPct}%); SAR ${t.readout!.costPerIncremental?.toLocaleString("en") ?? "—"} per incremental result.`, `${Math.round(t.readout!.incrementalShare * 100)}% من ${t.readout!.metric} تسبب بها المورد (أثر ${t.readout!.liftPct}%، النطاق ${t.readout!.liftLowPct}–${t.readout!.liftHighPct}%)؛ ${t.readout!.costPerIncremental?.toLocaleString("en") ?? "—"} ر.س لكل نتيجة إضافية.`)
      : T(`No significant lift (${t.readout!.liftPct}%, 90% range ${t.readout!.liftLowPct}–${t.readout!.liftHighPct}%) — the vendor's effect is not proven.`, `لا أثر ذا دلالة (${t.readout!.liftPct}%، النطاق ${t.readout!.liftLowPct}–${t.readout!.liftHighPct}%) — أثر المورد غير مثبت.`) })),
  };
}

/** The assistant's answer to "which tests should we run?" */
export async function testsAnswer(a: Agent, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const o = await testsOverview(a, lang);
  const parts = [T("**Tests to run**", "**اختبارات يُنصح بإجرائها**")];
  if (!o.candidates.length) parts.push(T("Every vendor with material spend either has test evidence or a test in progress.", "كل مورد بإنفاق مادي لديه أدلة اختبار أو اختبار جارٍ."));
  o.candidates.forEach((c, i) => parts.push(`${i + 1}. **${nm(lang, c.vendor)}** — ${c.why}\n   ${c.stake}\n   → ${T(`Say “design a ${c.kind === "HOLDOUT" ? "holdout" : "geo"} test for ${c.vendor}” and I'll plan it and draft the set-up email to the vendor.`, `قولوا «صمّم اختبار ${c.kind === "HOLDOUT" ? "مجموعة مستبعدة" : "جغرافي"} لـ${nm("ar", c.vendor)}» وسأخطط له وأُعدّ رسالة الإعداد للمورد.`)}`));
  if (o.planned.length) parts.push(T(`\n**Planned (waiting for approval):** ${o.planned.map((p) => p.name).join("; ")}.`, `\n**مخطط لها (بانتظار الاعتماد):** ${o.planned.map((p) => p.name).join("؛ ")}.`));
  if (o.running.length) parts.push(T(`\n**Running:** ${o.running.map((r) => `${r.name} (week ${r.weeksDone}/${r.weeks}, ends ${dt("en", r.endDate)})`).join("; ")}.`, `\n**جارية:** ${o.running.map((r) => `${r.name} (الأسبوع ${r.weeksDone}/${r.weeks}، ينتهي ${dt("ar", r.endDate)})`).join("؛ ")}.`));
  if (o.completed.length) parts.push(T(`\n**Completed:** ${o.completed.map((c) => `${c.name}: ${c.text}`).join(" ")}`, `\n**مكتملة:** ${o.completed.map((c) => `${c.name}: ${c.text}`).join(" ")}`));
  parts.push(T("\n_A test withholds spend from part of the audience or some regions, so starting one needs your name; the set-up brief goes out only after you approve it._", "\n_يحجب الاختبار الإنفاق عن جزء من الجمهور أو بعض المناطق، لذا يحتاج بدؤه إلى اسمكم؛ ولا يُرسل موجز الإعداد إلا بعد اعتمادكم._"));
  return parts.join("\n");
}
