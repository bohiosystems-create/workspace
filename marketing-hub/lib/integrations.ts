// Every integration the AI Assistant Director of Marketing can use, with its live status — for the settings panel
// (gear icon, top right of every page) and the assistant. Secrets (API keys, tokens, passwords) are set as server
// environment variables only and are never shown or saved from the page; the panel saves only non-secret settings:
// the news cities and your calendar links (ICS).
import { prisma } from "./prisma";
import { type Lang, tx } from "./i18n";

type Bi = [string, string];
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
const has = (k: string) => !!env(k);

// ------------------------------------------------------------------ non-secret settings (saved from the panel)
export type Settings = { newsCities: string | null; newsOn: boolean; icsUrls: string | null };
const ID = "settings";
let cached: Settings | null = null;
export async function getSettings(): Promise<Settings> {
  try {
    const row = (await prisma.viewLayout.findMany()).find((r: any) => r.id === ID);
    const j = row ? JSON.parse(row.json) : {};
    cached = { newsCities: typeof j.newsCities === "string" && j.newsCities.trim() ? j.newsCities : null, newsOn: j.newsOn !== false, icsUrls: typeof j.icsUrls === "string" && j.icsUrls.trim() ? j.icsUrls : null };
  } catch { cached = { newsCities: null, newsOn: true, icsUrls: null }; }
  return cached;
}
/** Last settings read (sync callers). */
export const settingsCached = (): Settings => cached ?? { newsCities: null, newsOn: true, icsUrls: null };
export async function saveSettings(b: Partial<Settings>, by: string | null) {
  const cur = await getSettings();
  const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\r\n]+/g, ",").slice(0, max).trim() : null);
  const urls = b.icsUrls !== undefined ? clean(b.icsUrls, 2000) : cur.icsUrls;
  if (urls) for (const u of urls.split(",").map((x) => x.trim()).filter(Boolean)) {
    let ok = false; try { const x = new URL(u.replace(/^webcal:/i, "https:")); ok = x.protocol === "https:"; } catch { /* invalid */ }
    if (!ok) throw new Error(`Not a valid https / webcal calendar link: ${u}`);
  }
  const next: Settings = { newsCities: b.newsCities !== undefined ? clean(b.newsCities, 200) || null : cur.newsCities, newsOn: b.newsOn !== undefined ? !!b.newsOn : cur.newsOn, icsUrls: urls || null };
  const data = { json: JSON.stringify(next), updatedBy: by, updatedAt: new Date() };
  if ((await prisma.viewLayout.findMany()).some((r: any) => r.id === ID)) await prisma.viewLayout.update({ where: { id: ID }, data });
  else await prisma.viewLayout.create({ data: { id: ID, ...data } });
  cached = next;
  return next;
}

// ------------------------------------------------------------------ the catalogue
export type Status = "connected" | "sample" | "snapshot" | "builtin" | "off" | "available";
export type Integration = { id: string; group: "social" | "email" | "calendar" | "news" | "business" | "ai"; name: Bi; status: Status; detail: Bi; brings: Bi; connect: Bi; env: string[]; editable?: ("newsCities" | "newsOn" | "icsUrls")[]; test?: boolean };

export async function integrations(): Promise<Integration[]> {
  const st = await getSettings();
  const ads = env("ADS_MODE") ?? "mock", meta = env("META_MODE") ?? "mock";
  const adsLive = ads === "ingest";
  const ics = [st.icsUrls, env("CALENDAR_ICS_URL")].filter(Boolean).join(",").split(",").filter((x) => x.trim()).length;
  const newsMode = !st.newsOn ? "off" : (env("NEWS_MODE") ?? "live");
  const cities = st.newsCities ?? env("NEWS_CITIES") ?? "Jeddah,Riyadh";
  const crm = env("CRM_MODE") ?? "mock", oracle = env("ORACLE_MODE") ?? "mock", outlook = env("OUTLOOK_MODE") === "live" ? "live" : "mock";
  const browser = typeof window !== "undefined"; // the offline demo: no server, nothing can be connected
  const S = (live: boolean, sample = true): Status => (live && !browser ? "connected" : sample ? "sample" : "available");
  return [
    // Social & ad platforms
    { id: "meta", group: "social", name: ["Meta — Facebook & Instagram", "ميتا — فيسبوك وإنستغرام"], status: meta === "live" && has("META_ACCESS_TOKEN") ? S(true) : "sample",
      detail: meta === "live" ? [`Marketing API ${env("META_API_VERSION") ?? ""} · ${(env("META_AD_ACCOUNT_IDS") ?? "").split(",").filter(Boolean).length} ad account(s)`, `واجهة التسويق · ${(env("META_AD_ACCOUNT_IDS") ?? "").split(",").filter(Boolean).length} حساب إعلاني`] : ["Sample ad accounts and campaigns", "حسابات وحملات تجريبية"],
      brings: ["Which agency runs each Meta campaign, spend, leads and creatives; competitors' ads from the Ad Library.", "من يدير كل حملة على ميتا والإنفاق والعملاء والإعلانات؛ وإعلانات المنافسين من مكتبة الإعلانات."],
      connect: ["Create a system-user token with ads_read in Meta Business Manager, then set META_MODE=live, META_ACCESS_TOKEN and META_AD_ACCOUNT_IDS on the server.", "أنشئوا رمز مستخدم نظام بصلاحية ads_read في مدير أعمال ميتا، ثم عيّنوا META_MODE=live وMETA_ACCESS_TOKEN وMETA_AD_ACCOUNT_IDS على الخادم."], env: ["META_MODE", "META_ACCESS_TOKEN", "META_AD_ACCOUNT_IDS", "META_API_VERSION"] },
    ...([["google", "Google Ads (Search, YouTube)", "إعلانات جوجل (البحث، يوتيوب)"], ["snap", "Snapchat Ads", "إعلانات سناب شات"], ["tiktok", "TikTok Ads", "إعلانات تيك توك"]] as const).map(([id, en, ar]): Integration => ({
      id, group: "social", name: [en, ar], status: adsLive ? S(true) : "sample", detail: adsLive ? ["Weekly rows pushed to /api/ingest/ad-spend", "صفوف أسبوعية تُرسل إلى /api/ingest/ad-spend"] : ["Sample weekly spend, clicks and leads", "إنفاق ونقرات وعملاء أسبوعية تجريبية"],
      brings: ["Independent spend, clicks and platform leads per campaign code — to check what agencies report and spot ad fatigue.", "إنفاق ونقرات وعملاء مستقلون لكل رمز حملة — للتحقق مما تبلغه الوكالات ورصد إرهاق الإعلانات."],
      connect: ["Set ADS_MODE=ingest and INGEST_API_KEY; the agency or a scheduled export posts weekly rows to /api/ingest/ad-spend (CSV/JSON). A direct API pull can be added per platform.", "عيّنوا ADS_MODE=ingest وINGEST_API_KEY؛ وترسل الوكالة أو تصدير مجدول الصفوف الأسبوعية إلى /api/ingest/ad-spend. ويمكن إضافة سحب مباشر لكل منصة."], env: ["ADS_MODE", "INGEST_API_KEY"] })),
    ...([["x", "X (Twitter)", "إكس (تويتر)"], ["linkedin", "LinkedIn", "لينكدإن"]] as const).map(([id, en, ar]): Integration => ({
      id, group: "social", name: [en, ar], status: adsLive ? S(true, false) : "available", detail: adsLive ? ["Via the ad-spend ingest", "عبر استيراد الإنفاق الإعلاني"] : ["Not connected", "غير متصل"],
      brings: ["Spend and leads for campaigns run there (investor and corporate audiences).", "الإنفاق والعملاء للحملات هناك (جمهور المستثمرين والشركات)."],
      connect: ["Post its weekly rows to /api/ingest/ad-spend with platform = " + id.toUpperCase() + " (ADS_MODE=ingest).", "أرسلوا صفوفه الأسبوعية إلى /api/ingest/ad-spend مع platform = " + id.toUpperCase() + " (ADS_MODE=ingest)."], env: ["ADS_MODE", "INGEST_API_KEY"] })),
    // Email and calendar
    { id: "outlook", group: "email", name: ["Outlook (Microsoft 365) — email", "أوتلوك (مايكروسوفت 365) — البريد"], status: S(outlook === "live"),
      detail: outlook === "live" ? [`Sending as ${env("OUTLOOK_SENDER") ?? "—"}`, `الإرسال باسم ${env("OUTLOOK_SENDER") ?? "—"}`] : ["Simulated: approved emails are recorded, not sent; sample inbox", "محاكاة: تُسجَّل الرسائل المعتمدة ولا تُرسل؛ صندوق بريد تجريبي"],
      brings: ["Vendor briefs, feedback and reminders sent after your approval; vendor replies and notices read from the inbox; the daily report by email.", "موجزات الموردين وملاحظاتهم وتذكيراتهم بعد اعتمادكم؛ وقراءة ردود الموردين وإشعاراتهم من البريد؛ والتقرير اليومي بالبريد."],
      connect: ["Register an app in Microsoft Entra with Mail.Send and Mail.Read (Graph), then set OUTLOOK_MODE=live, OUTLOOK_SENDER and the Graph credentials on the server.", "سجّلوا تطبيقاً في Microsoft Entra بصلاحيتي Mail.Send وMail.Read، ثم عيّنوا OUTLOOK_MODE=live وOUTLOOK_SENDER وبيانات Graph على الخادم."], env: ["OUTLOOK_MODE", "OUTLOOK_SENDER", "OUTLOOK_SENDER_NAME", "OUTLOOK_CC"] },
    { id: "calendar", group: "calendar", name: ["Celebrations calendar (built in)", "تقويم المناسبات (مدمج)"], status: "builtin",
      detail: ["Umm al-Qura Hijri calendar, national days, Riyadh Season, Cityscape, Jeddah events", "تقويم أم القرى الهجري، والأيام الوطنية، وموسم الرياض، وسيتي سكيب، وفعاليات جدة"],
      brings: ["Ramadan, the Eids, Founding and National Day and the seasons, with the date to start preparing — taken into account by every initiative.", "رمضان والعيدان ويوما التأسيس والوطني والمواسم، مع موعد بدء التحضير — تأخذها كل مبادرة في الحسبان."], connect: ["Always on.", "يعمل دائماً."], env: [] },
    { id: "ics", group: "calendar", name: ["Your calendar — Outlook or Google (ICS)", "تقويمكم — أوتلوك أو جوجل (ICS)"], status: ics ? S(true, false) : "available",
      detail: ics ? [`${ics} calendar link(s)`, `${ics} رابط تقويم`] : ["Not connected", "غير متصل"],
      brings: ["Your own dates — launches, handovers, company events, sales weekends — added to the calendar and to the initiatives.", "مواعيدكم — الإطلاقات والتسليمات وفعاليات الشركة وعطلات المبيعات — تُضاف إلى التقويم والمبادرات."],
      connect: ["Outlook: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link. Google: Calendar settings → Integrate calendar → Secret address in iCal format. Paste it below.", "أوتلوك: الإعدادات ← التقويم ← التقويمات المشتركة ← نشر تقويم ← انسخوا رابط ICS. جوجل: إعدادات التقويم ← دمج التقويم ← العنوان السري بتنسيق iCal. الصقوه أدناه."], env: ["CALENDAR_ICS_URL"], editable: ["icsUrls"], test: true },
    // News
    { id: "news", group: "news", name: ["Live news — Kinan's cities", "الأخبار المباشرة — مدن كنان"], status: newsMode === "off" ? "off" : newsMode === "live" && !browser ? "connected" : "snapshot",
      detail: newsMode === "off" ? ["Off", "متوقفة"] : newsMode === "live" && !browser ? [`Google News (English and Arabic) · ${cities}`, `أخبار جوجل (بالعربية والإنجليزية) · ${cities}`] : ["Real news gathered 3 Oct 2026 (this copy can't reach the internet)", "أخبار حقيقية جُمعت في 3 أكتوبر 2026 (هذه النسخة لا تصل إلى الإنترنت)"],
      brings: ["Property market, financing, regulation, infrastructure, events and developers in the focus cities — each a finding the initiatives answer.", "السوق العقاري والتمويل والأنظمة والبنية التحتية والفعاليات والمطورون في المدن المستهدفة — كل خبر نتيجة تستجيب لها المبادرات."],
      connect: ["On by default in the live app (no key). Choose the cities below; NEWS_MODE=off turns it off.", "يعمل افتراضياً في التطبيق الفعلي (دون مفتاح). اختاروا المدن أدناه؛ وNEWS_MODE=off لإيقافه."], env: ["NEWS_MODE", "NEWS_CITIES"], editable: ["newsCities", "newsOn"], test: true },
    // Business systems
    { id: "crm", group: "business", name: ["Yardi CRM — via Kinan's sales agent (read-only)", "Yardi — عبر وكيل المبيعات في كنان (قراءة فقط)"], status: S(crm !== "mock"),
      detail: crm !== "mock" ? [`Mode: ${crm}`, `الوضع: ${crm}`] : ["Sample CRM leads", "عملاء تجريبيون"], brings: ["Leads, qualification, viewings, reservations, contracts and lost reasons by campaign code. Nothing is sent back.", "العملاء والتأهيل والمعاينات والحجوزات والعقود وأسباب الخسارة حسب رمز الحملة. لا يُرسل شيء."],
      connect: ["Set CRM_MODE=yardi (or ingest) and CRM_INGEST_KEY; see docs/crm-integration.md.", "عيّنوا CRM_MODE=yardi (أو ingest) وCRM_INGEST_KEY؛ راجعوا docs/crm-integration.md."], env: ["CRM_MODE", "CRM_INGEST_KEY"] },
    { id: "oracle", group: "business", name: ["Oracle Fusion — purchase orders & invoices", "أوراكل فيوجن — أوامر الشراء والفواتير"], status: S(oracle !== "mock"),
      detail: oracle !== "mock" ? [`${env("ORACLE_BASE_URL") ?? ""}`, `${env("ORACLE_BASE_URL") ?? ""}`] : ["Sample POs and invoices", "أوامر شراء وفواتير تجريبية"], brings: ["Verified marketing cost, PO budget left, invoice exceptions.", "التكلفة التسويقية المتحقق منها، والميزانية المتبقية، واستثناءات الفواتير."],
      connect: ["Set ORACLE_MODE=live, ORACLE_BASE_URL, ORACLE_USER, ORACLE_PASSWORD (read-only role).", "عيّنوا ORACLE_MODE=live وORACLE_BASE_URL وORACLE_USER وORACLE_PASSWORD (دور قراءة فقط)."], env: ["ORACLE_MODE", "ORACLE_BASE_URL", "ORACLE_USER", "ORACLE_PASSWORD", "ORACLE_BUSINESS_UNIT"] },
    { id: "market", group: "business", name: ["Market data — REGA / Ministry of Justice, SAMA, portals", "بيانات السوق — الهيئة العامة للعقار ووزارة العدل وساما والبوابات"], status: "sample",
      detail: ["Sample district prices, transactions and mortgage rates", "أسعار وصفقات أحياء وأسعار تمويل تجريبية"], brings: ["Prices per sqm, transactions and mortgage rates by district.", "أسعار المتر والصفقات وأسعار التمويل حسب الحي."], connect: ["Import the monthly open-data files (or a portal feed); see docs/data-sources.md.", "استوردوا ملفات البيانات المفتوحة الشهرية (أو تغذية البوابات)؛ راجعوا docs/data-sources.md."], env: [] },
    // AI
    { id: "ai", group: "ai", name: ["AI — Claude, OpenAI, Gemini", "الذكاء الاصطناعي — Claude وOpenAI وGemini"], status: has("ANTHROPIC_API_KEY") || has("OPENAI_API_KEY") || has("GEMINI_API_KEY") || has("GOOGLE_API_KEY") ? S(true) : "off",
      detail: [[has("ANTHROPIC_API_KEY") && "Claude", has("OPENAI_API_KEY") && "OpenAI", (has("GEMINI_API_KEY") || has("GOOGLE_API_KEY")) && "Gemini"].filter(Boolean).join(" + ") || "Built-in rules only", [has("ANTHROPIC_API_KEY") && "Claude", has("OPENAI_API_KEY") && "OpenAI", (has("GEMINI_API_KEY") || has("GOOGLE_API_KEY")) && "Gemini"].filter(Boolean).join(" + ") || "القواعد المدمجة فقط"],
      brings: ["Open questions in the chat, initiative ideas and ranking, the AI second opinion.", "الأسئلة المفتوحة في المحادثة، وأفكار المبادرات وترتيبها، والرأي الثاني."], connect: ["Set ANTHROPIC_API_KEY (and optionally OPENAI_API_KEY / GEMINI_API_KEY) on the server.", "عيّنوا ANTHROPIC_API_KEY (واختيارياً OPENAI_API_KEY / GEMINI_API_KEY) على الخادم."], env: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"] },
    { id: "voice", group: "ai", name: ["ElevenLabs — report voice-over", "إليفن لابز — التعليق الصوتي للتقرير"], status: has("ELEVENLABS_API_KEY") ? S(true) : "off",
      detail: has("ELEVENLABS_API_KEY") ? ["Natural English and Arabic voices in ▶ Play", "أصوات طبيعية بالعربية والإنجليزية في ▶ العرض"] : ["Browser voice", "صوت المتصفح"], brings: ["The narrated daily-report presentation.", "عرض التقرير اليومي بالتعليق الصوتي."],
      connect: ["Set ELEVENLABS_API_KEY on the server (never in the page).", "عيّنوا ELEVENLABS_API_KEY على الخادم (وليس في الصفحة)."], env: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_VOICE_ID_AR"] },
  ];
}

export async function integrationsState(lang: Lang) {
  const L = (x: Bi) => x[lang === "ar" ? 1 : 0];
  const st = await getSettings();
  const list = await integrations();
  const GROUP: Record<Integration["group"], Bi> = { social: ["Social media & ad platforms", "التواصل الاجتماعي والمنصات الإعلانية"], email: ["Email", "البريد"], calendar: ["Calendar", "التقويم"], news: ["News", "الأخبار"], business: ["Business systems & data", "الأنظمة والبيانات"], ai: ["AI", "الذكاء الاصطناعي"] };
  return {
    settings: st,
    groups: (Object.keys(GROUP) as Integration["group"][]).map((g) => ({ id: g, name: L(GROUP[g]), items: list.filter((x) => x.group === g).map((x) => ({ id: x.id, name: L(x.name), status: x.status, detail: L(x.detail), brings: L(x.brings), connect: L(x.connect), env: x.env, editable: x.editable ?? [], test: !!x.test })) })),
    summary: { connected: list.filter((x) => x.status === "connected" || x.status === "builtin").length, total: list.length },
    note: tx(lang, "Keys and tokens are set on the server only — never typed into this page.", "تُعيَّن المفاتيح والرموز على الخادم فقط — ولا تُكتب في هذه الصفحة."),
  };
}

/** Test a connection now (news, your calendar). */
export async function testIntegration(id: string, lang: Lang) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  if (id === "news") {
    const { readNews } = await import("./news");
    const n = await readNews(true);
    return n.mode === "live" ? T(`Connected — ${n.items.length} relevant news items just read.`, `متصل — قُرئ ${n.items.length} خبراً ذا صلة الآن.`)
      : n.mode === "off" ? T("News is off.", "الأخبار متوقفة.") : T(`Live feeds not reachable${n.error ? ` (${n.error})` : ""} — showing the real-news snapshot instead.`, `تعذّر الوصول إلى المصادر المباشرة — تُعرض لقطة الأخبار الحقيقية بدلاً منها.`);
  }
  if (id === "ics") {
    const { loadIcs } = await import("./calendar");
    const r = await loadIcs(true);
    return !r.urls.length ? T("No calendar link yet — paste one first.", "لا يوجد رابط تقويم بعد — الصقوه أولاً.") : r.error ? T(`Problem: ${r.error}`, `مشكلة: ${r.error}`) : T(`Connected — ${r.items.length} events read.`, `متصل — قُرئت ${r.items.length} مناسبة.`);
  }
  throw new Error(T("This connection can't be tested from here.", "لا يمكن اختبار هذا الاتصال من هنا."));
}

export async function integrationsAction(b: any) {
  const lang: Lang = b?.lang === "ar" ? "ar" : "en";
  if (b?.action === "SAVE") {
    await saveSettings({ ...(b.newsCities !== undefined ? { newsCities: b.newsCities } : {}), ...(b.newsOn !== undefined ? { newsOn: b.newsOn } : {}), ...(b.icsUrls !== undefined ? { icsUrls: b.icsUrls } : {}) }, b.by ?? null);
    return { message: tx(lang, "Saved. The next scan uses it.", "حُفظ. يستخدمه الفحص التالي."), ...(await integrationsState(lang)) };
  }
  if (b?.action === "TEST") return { message: await testIntegration(String(b.id), lang), ...(await integrationsState(lang)) };
  throw new Error("Unknown action.");
}
