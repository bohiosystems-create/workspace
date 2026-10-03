// Daily scheduled reports — the director writes the manager's morning report and emails it.
//
// Schedule: one ReportSchedule row (time, timezone, days, recipients, languages, optional copy to Kinan's agent).
// Trigger:  POST /api/reports/run with x-api-key: $REPORTS_CRON_KEY (or Authorization: Bearer) — point any scheduler
//           at it every 15 minutes; a report runs once per local day, at or after the scheduled time, on the
//           scheduled days. "Send now" / "Preview" on the Reports page run it by hand.
// Content:  computed from the same data as the Director page (no AI needed): headline and brief, sales vs target,
//           what changed since the last report, decisions waiting (with minutes), campaign recommendations, vendors, risks,
//           invoices. Stored as HTML + text with a metrics snapshot for the next day's comparison.
// Delivery: Outlook (lib/outlook.ts), internal recipients only — every address must be on an allowed domain
//           (REPORTS_ALLOWED_DOMAINS, default: the sender's domain). The report takes no action and contacts no
//           vendor or customer.
import { prisma } from "./prisma";
import { now } from "./clock";
import { KINAN, kinanLogoHtml, kinanLogoSrc, chevron } from "./brand";
import { type DeckSlide, type Deck, deckScript, short } from "./deck";

/** A report in the style of Kinan's collateral (the Malls corporate profile) and kinan.com.sa: white pages on a soft
 *  faceted texture, the charcoal logo top-left and the orange chevron top-right, a full-bleed orange title page with the
 *  white uppercase title, orange uppercase section headings with the chevron, and a charcoal closing band with the white
 *  logo, orange social icons and www.kinan.com.sa. Email-safe (tables and inline styles; the web font falls back to
 *  Helvetica / Tahoma where mail clients block it). On screen it animates — the title page settles, sections rise as they
 *  scroll into view, bars grow and columns rise — and it is complete without motion: mail clients that drop the <style>,
 *  reduced-motion viewers and the PDF all get the finished page. */
const MOTION = `<style>
@media screen and (prefers-reduced-motion: no-preference) {
  .k-card { animation: kCard .9s cubic-bezier(.2,.8,.2,1) both; }
  .k-card h1 { animation: kUp .8s cubic-bezier(.2,.8,.2,1) .25s both; }
  .k-card .k-sub { animation: kUp .8s ease .45s both; }
  .k-rule { animation: kRule 1s cubic-bezier(.2,.8,.2,1) .6s both; transform-origin: 50% 50%; }
  .k-head-chev { display: inline-block; animation: kChev .9s cubic-bezier(.34,1.56,.64,1) .1s both; }
  .k-sec { animation: kUp .7s cubic-bezier(.2,.8,.2,1) both; }
  .k-sec .k-sec-chev { display: inline-block; animation: kChev .7s cubic-bezier(.34,1.56,.64,1) both; animation-delay: inherit; }
  .k-bar { animation: kGrow 1.1s cubic-bezier(.2,.8,.2,1) .35s both; }
  [dir="rtl"] .k-bar { animation-name: kGrowR; }
  .k-col { animation: kRise .9s cubic-bezier(.34,1.3,.64,1) both; }
  .k-sec li { animation: kUp .5s ease both; }
  .k-sec li:nth-child(2) { animation-delay: .06s } .k-sec li:nth-child(3) { animation-delay: .12s } .k-sec li:nth-child(4) { animation-delay: .18s }
  .k-sec li:nth-child(5) { animation-delay: .24s } .k-sec li:nth-child(6) { animation-delay: .3s } .k-sec li:nth-child(n+7) { animation-delay: .36s }
  .k-sec [data-part] { animation: kUp .6s ease .1s both; }
  .k-foot { animation: kFade 1s ease .3s both; }
  @supports (animation-timeline: view()) {
    .k-sec, .k-sec .k-bar, .k-sec .k-col, .k-sec li, .k-sec [data-part] { animation-timeline: view(); animation-range: entry 0% entry 75%; animation-delay: 0s !important; animation-duration: auto; }
  }
}
.k-sec li::marker { color: ${KINAN.orange}; }
@keyframes kUp { from { opacity: 0; transform: translateY(18px); } }
@keyframes kFade { from { opacity: 0; } }
@keyframes kCard { from { opacity: 0; transform: translateY(26px) scale(.985); } }
@keyframes kChev { from { opacity: 0; transform: translateX(-22px) scale(.6); } }
@keyframes kRule { from { transform: scaleX(0); } }
@keyframes kGrow { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes kGrowR { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
@keyframes kRise { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0 0 0 0); } }
</style>`;
function kinanDoc(lang: Lang, kicker: string, title: string, sub: string, sec: [string, string, string][], note: string, deck?: Deck) {
  const dir = lang === "ar" ? "rtl" : "ltr", ff = lang === "ar" ? KINAN.fontAr : KINAN.font;
  const caps = lang === "ar" ? "" : "text-transform:uppercase;";
  const ls = (x: string) => (lang === "ar" ? "0" : x);
  const shown = title.startsWith(kicker) ? title.slice(kicker.length).replace(/^\s*[—–-]\s*/, "") : title;
  const tex = KINAN.texture ? `background-image:url('${KINAN.texture}');background-size:cover;background-position:center;` : "";
  // The logo in e-mail: an <img> with the SVG as a data URI (inline SVG is stripped by most mail clients; Gmail also
  // drops data URIs and shows the alt text — the HTML download, the app and the PDF show it).
  const logoImg = (h: number, white: boolean) => (kinanLogoSrc && !white ? `<img src="${kinanLogoSrc}" alt="Kinan" height="${h}" style="display:block;height:${h}px;width:auto;border:0">` : kinanLogoHtml(h, white ? "#fff" : KINAN.ink));
  const social = `<span style="color:${KINAN.orange};font-weight:700;letter-spacing:.08em">in&nbsp; f&nbsp; 𝕏&nbsp; ◎</span>&nbsp;&nbsp; ${KINAN.site}`;
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="${KINAN.fontsHref}" rel="stylesheet"><title>${esc(title)}</title>${MOTION}</head>
<body style="margin:0;background:${KINAN.page};color:${KINAN.ink};font-family:${ff}">
<div style="max-width:760px;margin:0 auto;background:${KINAN.paper};${tex}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
<td style="padding:22px 26px;width:1%">${logoImg(40, false)}</td>
<td style="padding:22px 8px;color:${KINAN.greyText};font-size:9px;letter-spacing:${ls(".3em")};${caps}text-align:end">${esc(lang === "ar" ? "مساعد مدير التسويق الذكي" : "AI Assistant Director of Marketing")}</td>
<td style="padding:22px 26px 22px 6px;width:1%;text-align:end"><span class="k-head-chev">${chevron(dir, 38)}</span></td></tr></table>
<div style="padding:4px 26px 26px">
<div class="k-card" style="background:${KINAN.orange};background-image:${KINAN.texture ? `url('${KINAN.texture}'),` : ""}linear-gradient(118deg,#f5602a,${KINAN.orange} 55%,#e04f22);background-size:cover;background-blend-mode:multiply;color:#fff;padding:44px 28px 40px;text-align:center">
<div style="font-size:11px;letter-spacing:${ls(".3em")};${caps}font-weight:700;opacity:.92">${esc(kicker)}</div>
<h1 style="font-family:${ff};font-weight:600;${caps}letter-spacing:${ls(".03em")};font-size:30px;line-height:1.2;margin:14px 0 10px;color:#fff">${esc(shown)}</h1>
<div class="k-sub" style="font-size:13px;opacity:.9">${esc(sub)}</div>
<div class="k-rule" style="width:72px;height:3px;background:#fff;margin:22px auto 0"></div>
</div>
</div>
${sec.map(([h, body], k) => `<div data-slide="${esc(h)}" class="k-sec" style="border-top:1px solid ${KINAN.line};padding:22px 26px;animation-delay:${Math.min(k, 6) * 90 + 500}ms"><div style="font-size:14px;letter-spacing:${ls(".1em")};${caps}font-weight:700;color:${KINAN.orange};margin-bottom:12px"><span class="k-sec-chev" style="vertical-align:middle;margin-inline-end:10px">${chevron(dir, 16)}</span>${esc(h)}</div><div style="font-size:13px;line-height:1.55;color:${KINAN.ink}">${body}</div></div>`).join("\n")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="k-foot" style="border-collapse:collapse;background:${KINAN.charcoal}"><tr><td align="center" style="padding:34px 26px 26px;color:#fff;text-align:center">
<div style="display:inline-block">${logoImg(56, true)}</div>
<div style="font-size:12px;color:#fff;margin-top:18px;direction:ltr">${social}</div>
<div style="font-size:12px;letter-spacing:${ls(".2em")};${caps}color:${KINAN.orange};margin-top:14px;font-weight:600">${KINAN.tagline}</div>
<div style="font-size:10.5px;color:#9a9a9a;margin-top:12px;line-height:1.5;max-width:560px;margin-inline:auto">${esc(note)}</div>
</td></tr></table>
</div>${deck ? deckScript(deck) : ""}</body></html>`;
}

/** Cover and closing slides shared by the daily report and the snapshot. */
const coverSlide = (lang: Lang, kicker: string, title: string, sub: string): DeckSlide => ({ kind: "cover", kicker, title: title.startsWith(kicker) ? title.slice(kicker.length).replace(/^\s*[—–-]\s*/, "") : title, sub, say: title });
const closingSlide = (lang: Lang): DeckSlide => ({ kind: "closing", kicker: "", title: KINAN.tagline, sub: tx(lang, "Approvals happen in the app — the report takes no action.", "الاعتمادات تتم داخل التطبيق — لا يتخذ التقرير أي إجراء."), say: tx(lang, "End of report.", "انتهى التقرير.") });
import { single, serial } from "./single";
import { buildAgent } from "./agent";
import { historyState } from "./history";
import { reportCharts, kpiTiles, metaRevenueChart, customReportChart } from "./report-charts";
import { getLayout, mentions, sectionName, type Layout, type SectionId } from "./report-layout";
import { buildChatContext } from "./chat";
import { dailyIdeas } from "./ideation";
import { dailyScan } from "./signals";
import { runChartQuery } from "./chart-query";
import { buildDirector } from "./director";
import { buildOrchestration } from "./orchestrator";
import { buildRecommendations } from "./recommendations";
import { queueKinanEvent } from "./kinan";
import { deliverMail, outlookMode, outlookSender } from "./outlook";
import { type Lang, tx, nm, dt, dtm, M, K, an, firstSentence } from "./i18n";

const DAY = 86_400_000;
export const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Africa/Cairo", "Europe/London", "UTC"];

// ---------------------------------------------------------------- schedule
export const ensureSchedule = single(async function ensureScheduleImpl() {
  const s = (await prisma.reportSchedule.findMany()).find((x) => x.id === "daily");
  if (s) return s;
  return prisma.reportSchedule.create({
    data: { id: "daily", enabled: true, time: "07:30", timezone: "Asia/Riyadh", days: "0,1,2,3,4", recipients: outlookSender(), languages: "en,ar", toKinan: false, updatedAt: new Date() },
  });
});

export const allowedDomains = () =>
  (process.env.REPORTS_ALLOWED_DOMAINS || outlookSender().split("@")[1] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export async function saveSchedule(b: any, approver: string, l: Lang) {
  const T = (en: string, ar: string) => tx(l, en, ar);
  if (!approver?.trim()) throw new Error(T("Your name is required to change the schedule.", "اسمكم مطلوب لتعديل الجدول."));
  const time = String(b.time ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(T("Time must be HH:MM (24-hour).", "يجب أن يكون الوقت بصيغة HH:MM (24 ساعة)."));
  const timezone = String(b.timezone ?? "");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new Error(T("Unknown timezone.", "منطقة زمنية غير معروفة.")); }
  const days = [...new Set(list(String(b.days ?? "")).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) throw new Error(T("Pick at least one day.", "اختاروا يوماً واحداً على الأقل."));
  const langs = [...new Set(list(String(b.languages ?? "")))].filter((x) => x === "en" || x === "ar");
  if (!langs.length) throw new Error(T("Pick at least one language.", "اختاروا لغة واحدة على الأقل."));
  const recipients = [...new Set(list(String(b.recipients ?? "")).map((x) => x.toLowerCase()))];
  const bad = recipients.find((r) => !EMAIL_RE.test(r));
  if (bad) throw new Error(T(`Not a valid address: ${bad}`, `عنوان غير صالح: ${bad}`));
  const domains = allowedDomains();
  const outside = recipients.find((r) => domains.length && !domains.includes(r.split("@")[1]));
  if (outside) throw new Error(T(`${outside} is outside the allowed domains (${domains.join(", ")}). Reports go to internal addresses only.`, `${outside} خارج النطاقات المسموح بها (${domains.join("، ")}). تُرسل التقارير إلى عناوين داخلية فقط.`));
  await ensureSchedule();
  await prisma.reportSchedule.update({
    where: { id: "daily" },
    data: { enabled: !!b.enabled, time, timezone, days: days.join(","), recipients: recipients.join(", "), languages: langs.join(","), toKinan: !!b.toKinan, updatedBy: approver.trim(), updatedAt: new Date() },
  });
  await prisma.marketingAction.create({ data: { type: "REPORT_SCHEDULE", campaign: T("Daily report", "التقرير اليومي"), detail: T(`${b.enabled ? `Daily at ${time} (${timezone})` : "Paused"} → ${recipients.join(", ") || "no recipients"}; changed by ${approver.trim()}.`, `${b.enabled ? `يومياً الساعة ${time} (${timezone})` : "متوقف"} ← ${recipients.join("، ") || "بلا مستلمين"}؛ عدّله ${approver.trim()}.`) } });
}

/** Local date / time / weekday in a timezone. */
export function localNow(tz: string, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(now).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, dow };
}

/** Next scheduled run (local date + time), skipping today if it already ran or the time has passed. */
export function nextRun(s: { enabled: boolean; time: string; timezone: string; days: string }, ranToday: boolean, now = new Date()) {
  if (!s.enabled) return null;
  const days = s.days.split(",").map(Number);
  for (let i = 0; i < 8; i++) {
    const ln = localNow(s.timezone, new Date(now.getTime() + i * DAY));
    if (!days.includes(ln.dow)) continue;
    if (i === 0 && (ranToday || ln.hhmm > s.time)) {
      if (ranToday) continue;
      return { date: ln.date, time: ln.hhmm, overdue: true }; // missed today's slot: the next check sends it
    }
    return { date: ln.date, time: s.time, overdue: false };
  }
  return null;
}

// ------------------------------------------------------------------ build
type Metrics = Record<string, number>;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const C = { ink: KINAN.ink, soft: KINAN.soft, line: KINAN.line, alert: "#d6334b", green: "#1f7a4d", paper: KINAN.page, orange: KINAN.orange };

export async function buildReport(lang: Lang, date: string, prev: { metrics: Metrics; date: string; at: Date } | null) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (s: string) => nm(lang, s);
  // The daily scan of every source (CRM, email, invoices, social & ads, competitors, market, calendar) runs first;
  // the initiatives below answer what it found.
  await dailyScan();
  // The layout the manager set in the chat (sections, order, limit, focus, notes, added charts) — lib/report-layout.ts.
  const lay: Layout = await getLayout();
  const lim = (dflt: number) => Math.min(dflt, lay.maxItems ?? dflt);
  const focusAr = lay.focus ? nm("ar", lay.focus) : undefined;
  const inFocus = (...xs: (string | null | undefined)[]) => !lay.focus || xs.some((x) => x && mentions(x, lay.focus!, focusAr));
  const ideasP = ideasSection(lang, date, { limit: lay.maxItems, inFocus: lay.focus ? inFocus : null }); // runs alongside the rest (AI ideation can take a while)
  const a = await buildAgent(lang);
  const [d, o, events] = await Promise.all([buildDirector(lang, a), buildOrchestration(lang, a), prisma.kinanEvent.findMany()]);
  const since = Date.now() - DAY;
  const ev24 = events.filter((e) => e.createdAt.getTime() >= since);
  const recs = (await buildRecommendations(lang, a)).recommendations.filter((r) => r.severity === "crit" && (r.state === "OPEN" || r.state === "DRAFTED") && inFocus(r.title, (r as any).why, (r as any).campaign, (r as any).project));

  const metrics: Metrics = {
    ytdSalesM: d.targets.ytdActualM, ytdPct: d.targets.ytdPct, decisions: d.inbox.length, minutes: d.managerMinutes,
    campaignRecs: d.campaignRecs.length, urgentCampaignRecs: d.campaignRecs.filter((r) => r.severity === "crit").length, lateDeliverables: o.summary.lateDeliverables, overdueWorkOrders: o.summary.overdue, withVendors: o.summary.withVendors,
    invoiceExceptions: a.inv.kpis.exceptions, overdueK: Math.round(a.inv.kpis.overdueK), kinanFailed: events.filter((e) => e.status === "FAILED").length, criticalRisks: recs.length,
  };
  const LABEL: Record<string, [string, string, "up" | "down"]> = {
    ytdSalesM: ["Sales year to date (SAR M)", "المبيعات منذ بداية العام (مليون ر.س)", "up"], ytdPct: ["% of target", "% من المستهدف", "up"],
    decisions: ["Decisions waiting", "قرارات بانتظاركم", "down"], campaignRecs: ["Campaign recommendations open", "توصيات الحملات المفتوحة", "down"], urgentCampaignRecs: ["Urgent campaign recommendations", "توصيات حملات عاجلة", "down"],
    lateDeliverables: ["Late vendor deliverables", "تسليمات موردين متأخرة", "down"], overdueWorkOrders: ["Overdue work orders", "أوامر عمل متأخرة", "down"],
    withVendors: ["Work orders with vendors", "أوامر عمل لدى الموردين", "up"], invoiceExceptions: ["Invoice exceptions", "استثناءات الفواتير", "down"],
    overdueK: ["Overdue payments (SAR K)", "مدفوعات متأخرة (ألف ر.س)", "down"], kinanFailed: ["Failed deliveries to Kinan", "إرسالات فاشلة إلى كنان", "down"],
    criticalRisks: ["Critical risks", "مخاطر حرجة", "down"],
  };
  const changes = prev ? Object.keys(LABEL).filter((k) => (prev.metrics[k] ?? null) !== null && Math.abs((metrics[k] ?? 0) - prev.metrics[k]) > 1e-9).map((k) => {
    const delta = Math.round(((metrics[k] ?? 0) - prev.metrics[k]) * 10) / 10;
    const good = (delta > 0) === (LABEL[k][2] === "up");
    return { label: LABEL[k][lang === "ar" ? 1 : 0], from: prev.metrics[k], to: metrics[k], delta, good };
  }) : [];

  const dateLabel = dt(lang, date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const title = T(`Daily marketing report — ${dateLabel}`, `التقرير التسويقي اليومي — ${dateLabel}`);
  const lateDels = o.deliverables.filter((x) => x.state === "LATE");
  const failed = events.filter((e) => e.status === "FAILED");
  const top = d.campaignQuality.slice(0, 2), bottom = d.campaignQuality.slice(-2);

  // Sections as [heading, html, text]
  const tagged: { id: SectionId; s: [string, string, string] }[] = [];
  const sec = { push: (x: [string, string, string]) => { tagged.push({ id: cur, s: x }); } };
  let cur: SectionId = "brief";
  const at = (id: SectionId) => { cur = id; };
  // Focused on one project: the project rows, campaigns, findings, initiatives and risks that concern it.
  const byAsset = d.targets.byAsset.filter((x) => inFocus(x.asset));
  const campRecs = d.campaignRecs.filter((r) => inFocus(r.title, r.why, (r as any).campaign, (r as any).project));
  const ul = (xs: string[]) => `<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.6">${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const tl = (xs: string[]) => xs.map((x) => `  • ${x.replace(/<[^>]+>/g, "")}`).join("\n");

  // 1. Brief (with the notes added in the chat)
  const notesHtml = lay.notes.length ? `<div style="margin:12px 0 0;padding:10px 12px;border-inline-start:3px solid ${C.orange};background:#fff4ee"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.orange};font-weight:700">${esc(T("Notes", "ملاحظات"))}</div>${ul(lay.notes.map((n) => esc(n.text)))}</div>` : "";
  const notesText = lay.notes.length ? `\n${T("Notes", "ملاحظات")}:\n${tl(lay.notes.map((n) => n.text))}` : "";
  at("brief");
  sec.push([T("Today's brief", "موجز اليوم"), `<p style="font-size:16px;font-weight:700;margin:0 0 6px">${esc(d.brief.headline)}</p>${ul(d.brief.bullets.map(esc))}${notesHtml}`, `${d.brief.headline}\n${tl(d.brief.bullets)}${notesText}`]);
  // Charts (e-mail-safe HTML, numbers from the chart engine).
  const charts = reportCharts({ agent: a, history: await historyState(lang), daily: null as any, lang, meta: null, leads: [], creatives: [] }, lang,
    { byAsset: byAsset.map((x) => ({ asset: N(x.asset), actualM: x.actualM, targetM: x.targetM, pct: x.pct })), ytdActualM: d.targets.ytdActualM, ytdTargetM: d.targets.ytdTargetM, ytdPct: d.targets.ytdPct });
  const chartBox = (h: string) => `<div data-part style="margin:0 0 16px">${h}</div>`;
  // 2. Sales vs target
  at("sales");
  const rows = byAsset.map((x) => [N(x.asset), M(lang, x.actualM), M(lang, x.targetM), `${x.pct}%`, `${M(lang, x.forecastNextM)} / ${M(lang, x.targetNextM)}`, (x.pct ?? 0) < 75]);
  const th = (h: string[]) => `<tr>${h.map((x) => `<th style="text-align:start;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:${C.ink};padding:6px 8px">${esc(x)}</th>`).join("")}</tr>`;
  const salesChart = charts.find((c) => c.title === T("Sales vs target by project", "المبيعات مقابل المستهدف حسب المشروع"));
  sec.push([T("Sales vs target", "المبيعات مقابل المستهدف"),
    salesChart ? `${salesChart.html}<p style="margin:10px 0 0;font-size:12px">${esc(T("June forecast / target:", "توقع يونيو / المستهدف:"))} ${rows.map((r) => `${esc(r[0])} <b>${esc(r[4])}</b>`).join(" · ")}</p>`
      : `<table style="border-collapse:collapse;width:100%;font-size:13px">${th([T("Project", "المشروع"), T("Year to date", "منذ بداية العام"), T("Target", "المستهدف"), "%", T("June forecast / target", "توقع يونيو / المستهدف")])}${rows.map((r) => `<tr>${r.slice(0, 5).map((c, i) => `<td style="padding:6px 8px;border-bottom:1px solid ${C.line};${i === 3 && r[5] ? `color:${C.alert};font-weight:700` : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`,
    rows.map((r) => `  • ${r[0]}: ${r[1]} / ${r[2]} (${r[3]}); ${T("June", "يونيو")} ${r[4]}`).join("\n")]);
  // 2b. At a glance — charts.
  at("glance");
  const added = lay.charts.length ? await (async () => {
    const qc = (await (await import("./chat")).buildChatContext(lang)).q;
    const { runChartQuery, chartFromText } = await import("./chart-query");
    return lay.charts.map((c) => { const r = c.query ? runChartQuery(c.query as any, qc, lang) : chartFromText(c.prompt, qc, lang); return "error" in r ? null : customReportChart(r, lang); }).filter((x): x is NonNullable<typeof x> => !!x);
  })().catch(() => []) : [];
  const glance = [...charts.filter((c) => c !== salesChart && !lay.hiddenCharts.includes(c.id as any)), ...added];
  if (glance.length) sec.push([T("At a glance", "نظرة سريعة"), glance.map((c) => chartBox(c.html)).join(""), glance.map((c) => `${c.title}\n${c.text}`).join("\n")]);
  // 3. Since last report
  at("since");
  const prevLabel = prev ? (prev.date === date ? dtm(lang, prev.at) : dt(lang, prev.date)) : "";
  const chHtml = !prev ? `<p style="margin:0;color:${C.soft}">${esc(T("First report — the next one will show what changed.", "التقرير الأول — سيُظهر التقرير التالي ما تغيّر."))}</p>`
    : !changes.length ? `<p style="margin:0;color:${C.soft}">${esc(T(`No change in the key numbers since ${prevLabel}.`, `لا تغيير في الأرقام الرئيسية منذ ${prevLabel}.`))}</p>`
    : ul(changes.map((c) => `${esc(c.label)}: ${c.from} → <b>${c.to}</b> <span style="color:${c.good ? C.green : C.alert}">(${c.delta > 0 ? "+" : ""}${c.delta})</span>`));
  sec.push([prev ? T(`Since the last report (${prevLabel})`, `منذ التقرير السابق (${prevLabel})`) : T("Since the last report", "منذ التقرير السابق"), chHtml,
    !prev ? T("First report.", "التقرير الأول.") : changes.length ? changes.map((c) => `  • ${c.label}: ${c.from} → ${c.to} (${c.delta > 0 ? "+" : ""}${c.delta})`).join("\n") : T("No change.", "لا تغيير.")]);
  // 4. Campaign recommendations — what to change in the campaigns today, with the reason and what's at stake.
  const HOW = (r: (typeof d.campaignRecs)[number]) => r.channel === "EMAIL" ? T("email to the agency drafted for your approval in the app", "رسالة إلى الوكالة مُعدّة لاعتمادكم في التطبيق")
    : r.href === "/campaigns" ? T("apply in one click on Campaigns", "تطبيق بنقرة واحدة في صفحة الحملات") : r.href === "/campaigns#meta" ? T("check on Campaigns → Meta ads", "تحقق في الحملات ← إعلانات ميتا") : r.href === "/experiments" ? T("plan the test on Experiments", "خطّطوا الاختبار في صفحة الاختبارات") : T("open in the app", "افتحوها في التطبيق");
  at("campaigns");
  const crs = campRecs.slice(0, lim(6));
  const crHtml = crs.length ? `<ol style="margin:0;padding-inline-start:20px;line-height:1.55">${crs.map((r) => `<li style="margin-bottom:8px">${r.severity === "crit" ? `<b style="color:${C.alert}">${esc(T("Urgent", "عاجل"))}</b> · ` : ""}<b>${esc(r.title)}</b>${r.impactK && !/SAR|ر\.س/.test(r.title) ? ` <span style="color:${C.soft}">(${esc(K(lang, r.impactK))})</span>` : ""}<br><span style="color:${C.soft}">${esc(firstSentence(r.why))}</span><br><span style="font-size:12px">→ ${esc(HOW(r))}</span></li>`).join("")}</ol>${d.campaignRecs.length > crs.length ? `<p style="margin:6px 0 0;color:${C.soft};font-size:12px">${esc(T(`+ ${d.campaignRecs.length - crs.length} more in the app.`, `+ ${d.campaignRecs.length - crs.length} أخرى في التطبيق.`))}</p>` : ""}
    <p style="margin:10px 0 0;color:${C.soft};font-size:12px">${esc(T(`Campaign quality in the CRM — strongest: ${top.map((x) => `${x.code} (${x.qualifiedRate}% qualified)`).join(", ")}; weakest: ${bottom.map((x) => `${x.code} (${x.qualifiedRate}%)`).join(", ")}.`, `جودة الحملات في النظام — الأقوى: ${top.map((x) => `${x.code} (${x.qualifiedRate}% مؤهلون)`).join("، ")}؛ والأضعف: ${bottom.map((x) => `${x.code} (${x.qualifiedRate}%)`).join("، ")}.`))}</p>`
    : `<p style="margin:0">${esc(T("No campaign changes recommended today.", "لا تغييرات مقترحة على الحملات اليوم."))}</p>`;
  sec.push([T(`Campaign recommendations — ${d.campaignRecs.length} open, ${d.campaignRecs.filter((r) => r.severity === "crit").length} urgent`, `توصيات الحملات — ${d.campaignRecs.length} مفتوحة، ${d.campaignRecs.filter((r) => r.severity === "crit").length} عاجلة`), crHtml,
    crs.map((r, i) => `  ${i + 1}. ${r.severity === "crit" ? `[${T("urgent", "عاجل")}] ` : ""}${r.title}${r.impactK && !/SAR|ر\.س/.test(r.title) ? ` (${K(lang, r.impactK)})` : ""} — ${firstSentence(r.why)} → ${HOW(r)}`).join("\n")]);
  // 4a. Market initiatives for today (answering what the CRM shows).
  at("initiatives");
  const ideasR = await ideasP;
  sec.push(ideasR.sec);
  // 4b. Decisions
  at("decisions");
  const dec = d.inbox.slice(0, lim(99)).map((x) => `${esc(x.title)} <span style="color:${C.soft}">(~${x.minutes} ${T("min", "د")})</span>`);
  sec.push([T(`Waiting for your decision — about ${d.managerMinutes} min`, `بانتظار قراركم — نحو ${an(d.managerMinutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")}`), dec.length ? ul(dec) : `<p style="margin:0">${T("Nothing waiting.", "لا شيء بالانتظار.")}</p>`, tl(d.inbox.map((x) => `${x.title} (~${x.minutes} min)`))]);
  // 5. Vendors
  at("vendors");
  const vend0 = [
    ...o.escalations.map((x) => `<b style="color:${C.alert}">${esc(x.title)}</b>`),
    esc(T(`${o.summary.withVendors} work orders with vendors, ${o.summary.overdue} overdue; ${o.summary.waiting} drafted for your approval (${o.summary.routineWaiting} routine).`, `${an(o.summary.withVendors, "أمر عمل واحد", "أمرا عمل", "أوامر عمل", "أمر عمل")} لدى الموردين، ${o.summary.overdue} متأخرة؛ و${o.summary.waiting} مُعدّة بانتظار اعتمادكم (${o.summary.routineWaiting} روتينية).`)),
    ...lateDels.map((x) => esc(T(`Late: ${x.vendor} — ${x.title} (${x.daysLate} days, ${x.chases} reminder(s))`, `متأخر: ${N(x.vendor)} — ${x.title} (${an(x.daysLate, "يوم واحد", "يومان", "أيام", "يوماً")}، ${an(x.chases, "تذكير واحد", "تذكيران", "تذكيرات", "تذكيراً")})`))),
    ...a.decisions.filter((x) => x.decision === "EXIT" || x.decision === "TEST_REPLACEMENT").map((x) => esc(`${N(x.vendor)}: ${x.headline}`)),
  ];
  const vend = vend0.slice(0, lim(99));
  sec.push([T("Vendors", "الموردون"), ul(vend), tl(vend)]);
  // 7. Risks
  at("risks");
  if (recs.length) sec.push([T("Risks", "المخاطر"), ul(recs.slice(0, lim(6)).map((r) => `<span style="color:${C.alert}">${esc(r.title)}</span>`)), tl(recs.slice(0, lim(6)).map((r) => r.title))]);
  // 8. Invoices
  at("invoices");
  const invl = [esc(T(`${a.inv.kpis.exceptions} invoice exception(s) to resolve; ${K(lang, Math.round(a.inv.kpis.overdueK))} overdue for payment; ${K(lang, Math.round(a.inv.kpis.unbilledK))} delivered but not yet invoiced.`, `${an(a.inv.kpis.exceptions, "استثناء واحد", "استثناءان", "استثناءات", "استثناءً")} في الفواتير بحاجة إلى معالجة؛ ${K(lang, Math.round(a.inv.kpis.overdueK))} مستحقة الدفع ومتأخرة؛ ${K(lang, Math.round(a.inv.kpis.unbilledK))} نُفّذت ولم تُفوتر بعد.`))];
  sec.push([T("Supplier invoices", "فواتير الموردين"), ul(invl), tl(invl)]);


  // The presentation (▶ Play): one idea per slide, animated charts.
  const urgentN = d.campaignRecs.filter((r) => r.severity === "crit").length;
  // Extra context for the animated charts: monthly targets under the sales columns, each project's next-month outlook.
  const enrich = (xs: DeckSlide[]): DeckSlide[] => xs.map((x) => {
    if (x.kind === "columns" && x.values.length === d.targets.monthly.length) return { ...x, target: d.targets.monthly.map((m) => m.targetM) };
    if (x.kind === "gauges") return { ...x, items: x.items.map((it, i) => { const p = d.targets.byAsset[i]; return p ? { ...it, outlook: { label: T("June forecast vs target", "توقع يونيو مقابل المستهدف"), forecast: p.forecastNextM, target: p.targetNextM } } : it; }) };
    return x;
  });
  const tag = (id: SectionId, xs: DeckSlide[]) => xs.map((slide) => ({ id, slide }));
  const divider = (title: string, sub: string, say: string): DeckSlide => ({ kind: "divider", kicker: sub, title, sub, say });
  const parts: { id: SectionId; slide: DeckSlide }[] = [
    ...tag("brief", [
    { kind: "headline", kicker: T("Today's brief", "موجز اليوم"), headline: d.brief.headline,
      kpis: [
        { label: T("Sales year to date", "المبيعات منذ بداية العام"), value: d.targets.ytdActualM, prefix: lang === "ar" ? "" : "SAR ", suffix: lang === "ar" ? " مليون" : "M", decimals: 1, sub: T(`target SAR ${d.targets.ytdTargetM}M`, `المستهدف ${d.targets.ytdTargetM} مليون`), spark: d.targets.monthly.map((m) => m.actualM) },
        { label: T("Of target", "من المستهدف"), value: d.targets.ytdPct, suffix: "%", tone: d.targets.ytdPct < 90 ? "bad" : "good", ring: d.targets.ytdPct },
        { label: T("Your decisions today", "قراراتكم اليوم"), value: d.inbox.length, sub: T(`about ${d.managerMinutes} min`, `نحو ${d.managerMinutes} دقيقة`) },
        { label: T("Campaign recommendations", "توصيات الحملات"), value: d.campaignRecs.length, sub: T(`${urgentN} urgent`, `${urgentN} عاجلة`), tone: urgentN ? "bad" : "neutral" },
      ],
      points: d.brief.actions.slice(0, 3), say: `${d.brief.headline} ${T("This week I recommend:", "أوصي هذا الأسبوع بما يلي:")} ${d.brief.actions.slice(0, 3).join(" ")}` },
      ...(lay.notes.length ? [{ kind: "list" as const, kicker: T("Notes", "ملاحظات"), title: T("For this report", "لهذا التقرير"), items: lay.notes.map((n) => ({ text: n.text })), say: `${T("Notes:", "ملاحظات:")} ${lay.notes.map((n) => n.text).join(". ")}` }] : [])]),
    ...tag("sales", [divider(T("Sales vs target", "المبيعات مقابل المستهدف"), T("Year to date, by project", "منذ بداية العام، حسب المشروع"), T("Sales against target.", "المبيعات مقابل المستهدف.")), ...enrich(salesChart?.slide ? [salesChart.slide] : [])]),
    ...tag("glance", enrich(glance.map((c) => c.slide).filter((x): x is DeckSlide => !!x))),
    ...tag("initiatives", ideasR.slides.length ? [divider(T("What the data shows", "ما تُظهره البيانات"), T("Today's scan of every source, and the initiatives that answer it", "فحص اليوم لكل المصادر والمبادرات التي تستجيب له"), T("What the data shows this morning.", "ما تُظهره البيانات هذا الصباح.")), ...ideasR.slides] : []),
    ...tag("campaigns", [{ kind: "list", kicker: T("Campaign recommendations", "توصيات الحملات"), title: T(`${d.campaignRecs.length} open · ${urgentN} urgent`, `${d.campaignRecs.length} مفتوحة · ${urgentN} عاجلة`),
      items: campRecs.slice(0, lim(5)).map((r) => ({ text: r.title, sub: short(firstSentence(r.why), 140), tone: r.severity === "crit" ? "bad" : r.severity === "warn" ? "warn" : "neutral" })), say: T(`Top campaign changes: ${d.campaignRecs.slice(0, 3).map((r) => r.title).join(". ")}.`, `أهم تغييرات الحملات: ${d.campaignRecs.slice(0, 3).map((r) => r.title).join(". ")}.`) }]),
    ...tag("decisions", [divider(T("Your decisions", "قراراتكم"), T(`${d.inbox.length} waiting · about ${d.managerMinutes} minutes`, `${d.inbox.length} بانتظاركم · نحو ${d.managerMinutes} دقيقة`), T("What is waiting for your decision.", "ما ينتظر قراركم.")), { kind: "list", kicker: T("Waiting for your decision", "بانتظار قراركم"), title: T(`About ${d.managerMinutes} minutes, ${d.inbox.length} decisions`, `نحو ${d.managerMinutes} دقيقة، ${d.inbox.length} قرارات`),
      items: d.inbox.slice(0, lim(99)).map((x) => ({ text: x.title, minutes: x.minutes, tone: x.severity === "crit" ? "bad" : x.severity === "warn" ? "warn" : "neutral" })), totalMinutes: d.managerMinutes, say: T(`${d.inbox.length} decisions wait for you, about ${d.managerMinutes} minutes in total. Everything else is handled.`, `${d.inbox.length} قرارات بانتظاركم، نحو ${d.managerMinutes} دقيقة إجمالاً. والباقي يُنجز تلقائياً.`) }]),
    ...tag("risks", recs.length ? [{ kind: "list", kicker: T("Risks", "المخاطر"), title: T("What could hurt this month", "ما قد يضر هذا الشهر"), items: recs.slice(0, lim(5)).map((r) => ({ text: r.title, tone: "bad" as const })), say: T(`Risks: ${recs.slice(0, 3).map((r) => r.title).join(". ")}.`, `المخاطر: ${recs.slice(0, 3).map((r) => r.title).join(". ")}.`) } as DeckSlide] : []),
  ];
  // Sections and slides in the layout's order, without the hidden ones.
  const shown = lay.order.filter((id) => !lay.hidden.includes(id));
  const deck: Deck = { lang, title, slides: [coverSlide(lang, T("Daily marketing report", "التقرير التسويقي اليومي"), title, T(`Figures as of ${dt("en", d.asOf)}`, `الأرقام حتى ${dt("ar", d.asOf)}`)),
    ...shown.flatMap((id) => parts.filter((x) => x.id === id).map((x) => x.slide)), closingSlide(lang)] };
  const secs = shown.flatMap((id) => tagged.filter((x) => x.id === id).map((x) => x.s));
  const custom = [lay.focus ? T(`focus: ${lay.focus}`, `التركيز: ${N(lay.focus)}`) : "", lay.maxItems ? T(`top ${lay.maxItems} per list`, `أعلى ${lay.maxItems} في كل قائمة`) : "",
    lay.hidden.length ? T(`not shown: ${lay.hidden.map((h) => sectionName(h, lang)).join(", ")}`, `غير معروض: ${lay.hidden.map((h) => sectionName(h, lang)).join("، ")}`) : ""].filter(Boolean).join(" · ");
  const html = kinanDoc(lang, T("Daily marketing report", "التقرير التسويقي اليومي"), title, T(`Figures as of ${dt("en", d.asOf)}`, `الأرقام حتى ${dt("ar", d.asOf)}`), secs,
    T("Generated automatically by the AI Assistant Director of Marketing. This report takes no action: approvals happen in the app.", "أُعدّ تلقائياً بواسطة مساعد مدير التسويق الذكي. لا يتخذ هذا التقرير أي إجراء: تتم الاعتمادات داخل التطبيق.")
      + (custom ? T(` Layout set in the chat — ${custom}.`, ` شكل التقرير مضبوط من المحادثة — ${custom}.`) : ""), deck);
  const text = `${title}\n\n${secs.map(([h, , t]) => `${h.toUpperCase()}\n${t}`).join("\n\n")}\n`;
  return { title, html, text, metrics, headline: d.brief.headline, bullets: d.brief.bullets, actions: d.brief.actions };
}

// -------------------------------------------------------------------- market initiatives section
const WHO: Record<string, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Claude", rules: "built-in rules" };
/** Today's market initiatives (and the CRM signals they answer) as a report section [heading, html, text]. Never fails the report: on error, a short note. */
async function ideasSection(lang: Lang, date: string, opt: { limit?: number | null; inFocus?: ((...xs: (string | null | undefined)[]) => boolean) | null } = {}): Promise<{ sec: [string, string, string]; slides: DeckSlide[] }> {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  try {
    const di0 = await dailyIdeas(date, lang);
    // The chat's layout: one project only, and at most N findings / initiatives.
    const f = opt.inFocus, cap = opt.limit ?? 99;
    const di = { ...di0, signals: f ? di0.signals.filter((x: any) => f(x.project, x.title, x.why)) : di0.signals,
      ideas: (f ? di0.ideas.filter((i: any) => f(i.brief?.projectLabel, i.brief?.project, i.title, i.bigIdea)) : di0.ideas).slice(0, cap) };
    if (!di.ideas.length) return { slides: [], sec: [T("What the data shows & market initiatives", "ما تُظهره البيانات ومبادرات السوق"), `<p style="margin:0">${esc(T("No initiatives today.", "لا مبادرات اليوم."))}</p>`, ""] };
    const by = di.sources.filter((x) => x !== "rules").map((x) => WHO[x] ?? x);
    const engine = by.length ? T(`Ideas by ${by.join(" + ")}${di.judge ? `, ranked by ${WHO[di.judge] ?? di.judge}` : ""}`, `أفكار من ${by.join(" + ")}${di.judge ? `، رتّبها ${WHO[di.judge] ?? di.judge}` : ""}`) : T("Ideas from the built-in rules (no AI key)", "أفكار من القواعد المدمجة (دون مفتاح ذكاء اصطناعي)");
    const rng = (x: [number, number, number]) => `${x[0]}–${x[2]}`;
    const card = (i: (typeof di.ideas)[number], n: number) => `<div data-part style="border-top:1px solid ${C.line};padding:10px 0 2px">
      <div style="font-size:14px;font-weight:700">${n}. ${esc(i.title)}${i.score ? ` <span style="font-size:11px;font-weight:400;color:${C.soft}">· ${esc(T("score", "التقييم"))} ${i.score}/10</span>` : ""}</div>
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.soft};margin-top:2px">${esc(i.kindLabel)}</div>
      ${i.trigger ? `<div style="font-size:12px;margin-top:4px;padding:4px 8px;border-inline-start:3px solid ${C.orange};background:#fff4ee">${esc(T("Answers", "يستجيب لـ"))}: <b>${esc(i.trigger.title)}</b></div>` : ""}
      <div style="margin:4px 0">${esc(i.bigIdea)}</div>
      ${i.offer ? `<div style="font-size:12px"><b>${esc(T("Offer", "العرض"))}:</b> ${esc(i.offer)}${i.headline ? ` · <b>${esc(T("Headline", "العنوان"))}:</b> “${esc(i.headline)}”` : ""}</div>` : ""}
      <div style="font-size:12px;color:${C.soft};margin-top:3px">${esc(i.channels.map((ch) => `${ch.label} ${ch.sharePct}%`).join(" · "))}${i.leadVendor ? ` · ${esc(T("lead vendor", "المورد الرئيسي"))} ${esc(i.leadVendor)}` : ""}</div>
      <div style="font-size:12px;margin-top:3px"><b>${esc(T("Forecast", "التوقع"))}:</b> ${esc(T(`${rng(i.forecast.contracts)} contracts, SAR ${rng(i.forecast.salesM)}M, ~${i.forecast.costToSalesPct}% cost to sales on SAR ${i.forecast.spendK}K`, `${rng(i.forecast.contracts)} عقود، ${rng(i.forecast.salesM)} مليون ر.س، نحو ${i.forecast.costToSalesPct}% من المبيعات مقابل ${i.forecast.spendK} ألف ر.س`))}</div>
      ${i.judge?.why ? `<div style="font-size:11px;color:${C.soft};margin-top:3px">${esc(i.judge.why)}</div>` : ""}
    </div>`;
    const spark = (xs: number[] | null, down: boolean) => { if (!xs || xs.length < 4) return ""; const max = Math.max(...xs, 0.0001); return `<span style="display:inline-block;vertical-align:middle;margin-inline-start:6px;line-height:0;white-space:nowrap">${xs.map((v, i) => `<span style="display:inline-block;width:4px;margin-inline-end:1px;height:${Math.max(1, Math.round((v / max) * 14))}px;background:${i >= xs.length - 3 ? (down ? C.alert : C.ink) : C.line}"></span>`).join("")}</span>`; };
    // Every source scanned today, then the findings (evidence from other sources nested under what it explains).
    const top = di.signals.filter((x) => !x.linkedTo && (x.direction === "down" || x.severity !== "info" || ["EMAIL_OPPORTUNITY", "EMAIL_EVENT", "BUDGET_HEADROOM"].includes(x.kind))).slice(0, Math.min(8, cap));
    const more = di.signals.filter((x) => !x.linkedTo).length - top.length;
    const scannedLine = `${esc(T(`Scanned today (${di.crmAsOf ? dt("en", di.crmAsOf) : "—"})`, `فُحص اليوم (${di.crmAsOf ? dt("ar", di.crmAsOf) : "—"})`))}: ${di.scanned.map((x) => `${esc(x.label)} <span style="color:${C.soft}">${x.items.toLocaleString("en")}</span>${x.found ? ` <b>→ ${x.found}</b>` : ""}`).join(" · ")}`;
    const sigHtml = `<div data-part style="margin:0 0 8px"><div style="font-size:11px;color:${C.soft};margin-bottom:6px">${scannedLine}</div>` + (top.length
      ? `<ul style="margin:0;padding-inline-start:18px;line-height:1.5;font-size:12px">${top.map((x) => `<li style="margin-bottom:4px"><span style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${C.soft}">${esc(x.sourceLabel)}</span> <b style="color:${x.direction === "down" ? C.alert : C.ink}">${esc(x.title)}</b>${spark(x.series, x.direction === "down")}<br><span style="color:${C.soft}">${esc(x.why)}</span>${x.related.length ? `<br><span style="font-size:11px">↳ ${x.related.map((r) => `${esc(r.sourceLabel)}: ${esc(r.title)}`).join("<br>↳ ")}</span>` : ""}</li>`).join("")}</ul>${more > 0 ? `<p style="margin:4px 0 0;color:${C.soft};font-size:11px">${esc(T(`+ ${more} smaller findings on the Initiatives page.`, `+ ${more} نتائج أصغر في صفحة المبادرات.`))}</p>` : ""}`
      : `<p style="margin:0;font-size:12px;color:${C.soft}">${esc(T("Nothing unusual in any source today.", "لا شيء غير معتاد في أي مصدر اليوم."))}</p>`) + `</div>`;
    const sigs = top;
    const html = sigHtml + `<p style="margin:0 0 4px">${esc(T(`Focus today: <${di.project}> for ${di.month} (${di.goal.toLowerCase()}), angle: ${di.angle}.`, `تركيز اليوم: <${di.project}> لشهر ${di.month} (${di.goal})، الزاوية: ${di.angle}.`)).replace(/&lt;(.*?)&gt;/, "<b>$1</b>")}</p>` +
      di.ideas.map((x, k) => card(x, k + 1)).join("") +
      `<p style="margin:8px 0 0;color:${C.soft};font-size:11px">${esc(engine)}. ${esc(T("Findings are computed from your data sources; forecasts come from the 2023–2025 history, not from the AI. Shortlist or approve on the Initiatives page; approving drafts a vendor brief for your approval.", "النتائج محسوبة من مصادر بياناتكم؛ والتوقعات من تاريخ 2023–2025 وليست من الذكاء الاصطناعي. ضعوها في القائمة المختصرة أو اعتمدوها من صفحة المبادرات؛ الاعتماد يُعدّ موجزاً للمورد بانتظار موافقتكم."))}</p>`;
    const text = `${T("Scanned", "فُحص")}: ${di.scanned.map((x) => `${x.label} ${x.items}${x.found ? ` → ${x.found}` : ""}`).join(" · ")}\n` + (sigs.length ? sigs.map((x) => `  ! [${x.sourceLabel}] ${x.title}${x.related.length ? ` (${x.related.map((r) => r.title).join("; ")})` : ""}`).join("\n") + "\n" : "") + `${T(`Focus: ${di.project}, ${di.month}; angle: ${di.angle}`, `التركيز: ${di.project}، ${di.month}؛ الزاوية: ${di.angle}`)}\n` + di.ideas.map((i, n) => `  ${n + 1}. [${i.kindLabel}] ${i.title}${i.trigger ? ` (${T("answers", "يستجيب لـ")}: ${i.trigger.title})` : ""} — ${i.bigIdea} (${rng(i.forecast.contracts)} ${T("contracts", "عقود")}, SAR ${rng(i.forecast.salesM)}M)`).join("\n") + `\n  ${engine}`;
    // Presentation slides: what was scanned, one slide per finding, one per initiative.
    const KICK = T("What the data shows", "ما تُظهره البيانات"), KICK2 = T("Market initiatives", "مبادرات السوق");
    const slides: DeckSlide[] = [
      { kind: "scan", kicker: KICK, title: T("Every source, scanned this morning", "كل المصادر، فُحصت هذا الصباح"), sources: di.scanned.map((x) => ({ label: x.label, items: x.items, found: x.found })),
        say: T(`This morning the director scanned ${di.scanned.length} sources and found ${di.scanned.reduce((a, x) => a + x.found, 0)} things worth a look.`, `فحص المدير هذا الصباح ${di.scanned.length} مصادر ووجد ${di.scanned.reduce((a, x) => a + x.found, 0)} نتيجة تستحق النظر.`) },
      ...top.slice(0, 6).map((x, n, arr): DeckSlide => ({ kind: "finding", kicker: KICK, source: x.sourceLabel, title: x.title, why: short(x.why, 230), down: x.direction === "down", changePct: x.changePct ? x.changePct : null, series: x.series,
        ...(x.series && x.series.length >= 8 ? {
          windows: x.kind === "SUDDEN_DROP" || x.kind === "SURGE" ? { base: [x.series.length - 11, x.series.length - 3] as [number, number], recent: [x.series.length - 3, x.series.length] as [number, number] } : { base: [0, 4] as [number, number], recent: [x.series.length - 4, x.series.length] as [number, number] },
          recent: x.recent, baseline: x.baseline,
          unit: x.metric === "ctr" ? T("% click-through", "% نسبة النقر") : x.metric === "qualified" ? T("qualified a week", "مؤهلاً أسبوعياً") : T("a week", "أسبوعياً") } : {}), evidence: x.related.slice(0, 4).map((r) => ({ source: r.sourceLabel, title: short(r.title, 120) })), n: n + 1, of: arr.length,
        say: `${x.title}. ${short(x.why, 200)}${x.related.length ? T(` Explained by: ${x.related.slice(0, 2).map((r) => r.title).join("; ")}.`, ` يفسّره: ${x.related.slice(0, 2).map((r) => r.title).join("؛ ")}.`) : ""}` })),
      ...di.ideas.slice(0, 5).map((i, n, arr): DeckSlide => ({ kind: "initiative", kicker: KICK2, type: i.kindLabel, project: i.brief?.projectLabel, title: ((t) => t.charAt(0).toUpperCase() + t.slice(1))(i.title.replace(/^[^:]+:\s*/, "")), answers: i.trigger?.title ?? null,
        // The idea often opens by restating the finding it answers; that is already shown, so start after it.
        idea: short((i.trigger && i.bigIdea.replace(/^(The CRM shows |An inbound offer: |An inbound proposal: |The ad platforms show |يُظهر النظام |عرض وارد: |مقترح وارد: |تُظهر المنصات الإعلانية )?/, "").startsWith(i.trigger.title.slice(0, 25)) ? i.bigIdea.slice(i.bigIdea.indexOf(". ", i.bigIdea.indexOf(i.trigger.title.slice(0, 25))) + 2) : i.bigIdea) || i.bigIdea, 260), offer: short(i.offer ?? "", 120),
        channels: i.channels.map((ch) => ({ label: ch.label, pct: ch.sharePct })), contracts: [i.forecast.contracts[0], i.forecast.contracts[2]], salesM: [i.forecast.salesM[0], i.forecast.salesM[2]], cts: i.forecast.costToSalesPct, spendK: i.forecast.spendK, n: n + 1, of: arr.length,
        say: `${i.title}. ${short(i.bigIdea, 220)} ${T(`Forecast: ${i.forecast.contracts[0]} to ${i.forecast.contracts[2]} contracts.`, `التوقع: من ${i.forecast.contracts[0]} إلى ${i.forecast.contracts[2]} عقود.`)}` })),
    ];
    return { sec: [T("What the data shows & market initiatives", "ما تُظهره البيانات ومبادرات السوق"), html, text], slides };
  } catch (e: any) {
    console.error("report: initiatives section failed:", e?.stack ?? e);
    return { slides: [], sec: [T("What the data shows & market initiatives", "ما تُظهره البيانات ومبادرات السوق"), `<p style="margin:0;color:${C.soft}">${esc(T("Initiatives could not be prepared this time; open the Initiatives page to generate them.", "تعذّر إعداد المبادرات هذه المرة؛ افتحوا صفحة المبادرات لإنشائها."))}</p>`, ""] };
  }
}

// -------------------------------------------------------------------- live snapshot
/** A live marketing snapshot: the position right now — headline figures, charts, today's campaign issues, what's
 * waiting for a decision, and what changed since the previous report or snapshot. On demand, never e-mailed. */
export async function buildSnapshot(lang: Lang, at: Date, prev: { metrics: Metrics; date: string; at: Date } | null) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (x: string) => nm(lang, x);
  await dailyScan(true); // live snapshot: rescan every source now
  const s = await ensureSchedule();
  const ln = localNow(s.timezone, at);
  const daily = await buildReport(lang, ln.date, prev); // same sections and metrics as the daily report
  const c = await buildChatContext(lang);
  const d = c.director, o = c.orch, a = c.agent;
  const k = (q: any) => { const r = runChartQuery(q, c.q, lang); return "error" in r ? null : (r.series?.[0]?.values ?? r.values); };
  const ytd = k({ dataset: "campaigns", measures: ["sum(spend)", "sum(sales)", "cost_to_sales"], period: "year to date" }) ?? [];
  const latest = d.targets.monthly[d.targets.monthly.length - 1];
  const lastMonth = k({ dataset: "campaigns", measures: ["sum(qualified)", "sum(contracts)"], period: "last month" }) ?? [];
  const meta6 = k({ dataset: "meta", measures: ["sum(revenue)", "sum(spend)"], period: "last 6 months" }) ?? [];
  const urgent = d.campaignRecs.filter((r) => r.severity === "crit").length;
  const monthName = (m: string | undefined, l: Lang) => (m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString(l === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "");
  const tiles = kpiTiles([
    { label: T("Sales year to date", "المبيعات منذ بداية العام"), value: M(lang, d.targets.ytdActualM), sub: T(`${d.targets.ytdPct}% of ${M(lang, d.targets.ytdTargetM)} target`, `${d.targets.ytdPct}% من مستهدف ${M(lang, d.targets.ytdTargetM)}`), tone: d.targets.ytdPct < 85 ? "bad" : d.targets.ytdPct < 95 ? "warn" : "good" },
    { label: T("Marketing spend YTD", "الإنفاق التسويقي منذ بداية العام"), value: K(lang, Math.round(Number(ytd[0] ?? 0))), sub: T(`cost to sales ${ytd[2] ?? "—"}%`, `نسبة التكلفة إلى المبيعات ${ytd[2] ?? "—"}%`) },
    { label: T(`Sales in ${monthName(latest?.month, "en")}`, `مبيعات ${monthName(latest?.month, "ar")}`), value: M(lang, latest?.actualM ?? 0), sub: T(`target ${M(lang, latest?.targetM ?? 0)}`, `المستهدف ${M(lang, latest?.targetM ?? 0)}`), tone: (latest?.actualM ?? 0) >= (latest?.targetM ?? 0) ? "good" : "warn" },
    { label: T("Qualified leads, last month", "العملاء المؤهلون، الشهر الماضي"), value: String(lastMonth[0] ?? "—"), sub: T(`${lastMonth[1] ?? "—"} contracts`, `${lastMonth[1] ?? "—"} عقود`) },
    { label: T("Meta ads revenue, 6 months", "إيرادات إعلانات ميتا، 6 أشهر"), value: M(lang, Math.round(Number(meta6[0] ?? 0) * 10) / 10), sub: T(`on ${K(lang, Math.round(Number(meta6[1] ?? 0)))} Meta spend`, `مقابل إنفاق ${K(lang, Math.round(Number(meta6[1] ?? 0)))} على ميتا`) },
    { label: T("Waiting for your decision", "بانتظار قراركم"), value: String(d.inbox.length), sub: T(`about ${d.managerMinutes} min`, `نحو ${d.managerMinutes} دقيقة`), tone: d.inbox.length ? "warn" : "good" },
    { label: T("Campaign recommendations", "توصيات الحملات"), value: String(d.campaignRecs.length), sub: T(`${urgent} urgent`, `${urgent} عاجلة`), tone: urgent ? "bad" : undefined },
    { label: T("Late vendor deliverables", "تسليمات موردين متأخرة"), value: String(o.summary.lateDeliverables), sub: T(`${o.summary.withVendors} work orders with vendors`, `${o.summary.withVendors} أوامر عمل لدى الموردين`), tone: o.summary.lateDeliverables ? "bad" : "good" },
    { label: T("Overdue payments", "مدفوعات متأخرة"), value: K(lang, Math.round(a.inv.kpis.overdueK)), sub: T(`${a.inv.kpis.exceptions} invoice exceptions`, `${a.inv.kpis.exceptions} استثناءات في الفواتير`), tone: a.inv.kpis.overdueK ? "bad" : "good" },
  ]);
  const charts = reportCharts(c.q, lang, { byAsset: d.targets.byAsset.map((x) => ({ asset: N(x.asset), actualM: x.actualM, targetM: x.targetM, pct: x.pct })), ytdActualM: d.targets.ytdActualM, ytdTargetM: d.targets.ytdTargetM, ytdPct: d.targets.ytdPct });
  const meta = metaRevenueChart(c.q, lang);
  const allCharts = [...charts, ...(meta ? [meta] : [])];
  // Today's per-campaign check: urgent first.
  const SEV: Record<string, number> = { crit: 0, warn: 1, info: 2 };
  const items = [...((c.daily as any).recommendations ?? [])].sort((p: any, q: any) => SEV[p.severity] - SEV[q.severity]).slice(0, 6);
  const checkHtml = items.length ? `<ol style="margin:0;padding-inline-start:20px;line-height:1.55">${items.map((r: any) => `<li style="margin-bottom:6px">${r.severity === "crit" ? `<b style="color:${C.alert}">${esc(T("Urgent", "عاجل"))}</b> · ` : ""}<b>${esc(r.title)}</b><br><span style="color:${C.soft}">${esc(firstSentence(r.why ?? ""))}</span></li>`).join("")}</ol>` : `<p style="margin:0">${esc(T("Nothing flagged on the campaigns today.", "لا ملاحظات على الحملات اليوم."))}</p>`;
  const dec = d.inbox.slice(0, 8).map((x) => `${esc(x.title)} <span style="color:${C.soft}">(~${x.minutes} ${T("min", "د")})</span>`);
  // Changes since the previous report or snapshot (same metrics as the daily report).
  const changes = daily.html.match(/<div style="font-size:10px;letter-spacing:\.2em[^>]*>([^<]*(?:Since the last report|منذ التقرير السابق)[^<]*)<\/div><div style="font-size:13px">([\s\S]*?)<\/div><\/div>/);

  const stamp = `${dt(lang, ln.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${lang === "ar" ? "، " : ", "}${ln.hhmm}`;
  const title = T(`Live marketing snapshot — ${stamp}`, `لقطة تسويقية فورية — ${stamp}`);
  const sec: [string, string, string][] = [
    [T("Headline figures", "الأرقام الرئيسية"), tiles, ""],
    [T("Charts", "الرسوم البيانية"), allCharts.map((x) => `<div data-part style="margin:0 0 18px">${x.html}</div>`).join(""), allCharts.map((x) => `${x.title}\n${x.text}`).join("\n")],
    [T(`Today's campaign check — ${items.length ? `${(c.daily as any).recommendations.length} items` : "clear"}`, `فحص الحملات اليوم — ${items.length ? `${(c.daily as any).recommendations.length} ملاحظات` : "لا ملاحظات"}`), checkHtml, items.map((r: any) => `  • ${r.title}`).join("\n")],
    [T(`Waiting for your decision — about ${d.managerMinutes} min`, `بانتظار قراركم — نحو ${d.managerMinutes} دقيقة`), dec.length ? `<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.6">${dec.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p style="margin:0">${esc(T("Nothing waiting.", "لا شيء بالانتظار."))}</p>`, d.inbox.map((x) => `  • ${x.title}`).join("\n")],
  ];
  const ideasR = await ideasSection(lang, ln.date);
  sec.splice(3, 0, ideasR.sec);
  if (changes) sec.push([T(changes[1].replace("Since the last report", "Since the last report or snapshot"), changes[1].replace("منذ التقرير السابق", "منذ التقرير أو اللقطة السابقة")), changes[2], ""]);

  const deck: Deck = { lang, title, slides: [
    coverSlide(lang, T("Live marketing snapshot", "لقطة تسويقية فورية"), title, T(`Figures as of ${dt("en", d.asOf)}`, `الأرقام حتى ${dt("ar", d.asOf)}`)),
    { kind: "headline", kicker: T("Headline figures", "الأرقام الرئيسية"), headline: d.brief.headline,
      kpis: [
        { label: T("Sales year to date", "المبيعات منذ بداية العام"), value: d.targets.ytdActualM, prefix: lang === "ar" ? "" : "SAR ", suffix: lang === "ar" ? " مليون" : "M", decimals: 1, sub: T(`${d.targets.ytdPct}% of target`, `${d.targets.ytdPct}% من المستهدف`), tone: d.targets.ytdPct < 90 ? "bad" : "good" },
        { label: T("Marketing spend YTD", "الإنفاق منذ بداية العام"), value: Math.round(Number(ytd[0] ?? 0)), prefix: lang === "ar" ? "" : "SAR ", suffix: lang === "ar" ? " ألف" : "K", sub: T(`cost to sales ${ytd[2] ?? "—"}%`, `نسبة التكلفة ${ytd[2] ?? "—"}%`) },
        { label: T("Qualified leads, last month", "العملاء المؤهلون، الشهر الماضي"), value: Number(lastMonth[0] ?? 0), sub: T(`${lastMonth[1] ?? "—"} contracts`, `${lastMonth[1] ?? "—"} عقود`) },
        { label: T("Waiting for your decision", "بانتظار قراركم"), value: d.inbox.length, sub: T(`about ${d.managerMinutes} min`, `نحو ${d.managerMinutes} دقيقة`) },
      ], points: [], say: d.brief.headline },
    ...allCharts.map((c) => c.slide).filter((x): x is DeckSlide => !!x),
    ...ideasR.slides,
    { kind: "list", kicker: T("Waiting for your decision", "بانتظار قراركم"), title: T(`About ${d.managerMinutes} minutes, ${d.inbox.length} decisions`, `نحو ${d.managerMinutes} دقيقة، ${d.inbox.length} قرارات`),
      items: d.inbox.map((x) => ({ text: x.title, minutes: x.minutes, tone: x.severity === "crit" ? "bad" : x.severity === "warn" ? "warn" : "neutral" })), say: T(`${d.inbox.length} decisions wait for you.`, `${d.inbox.length} قرارات بانتظاركم.`) },
    closingSlide(lang),
  ] };
  const html = kinanDoc(lang, T("Live marketing snapshot", "لقطة تسويقية فورية"), title, T(`Live position at ${ln.hhmm} (${s.timezone}) · figures as of ${dt("en", d.asOf)} · not e-mailed`, `الوضع الفوري الساعة ${ln.hhmm} (${s.timezone}) · الأرقام حتى ${dt("ar", d.asOf)} · لا يُرسل بالبريد`), sec,
    T("Snapshot generated on request by the AI Assistant Director of Marketing. It takes no action: approvals happen in the app.", "لقطة أُعدّت عند الطلب بواسطة مساعد مدير التسويق الذكي. لا تتخذ أي إجراء: تتم الاعتمادات داخل التطبيق."), deck);
  const text = `${title}\n\n${sec.filter(([, , t]) => t).map(([h, , t]) => `${h.toUpperCase()}\n${t}`).join("\n\n")}\n`;
  return { title, html, text, metrics: daily.metrics, date: ln.date };
}

/** Run a live snapshot in one language and keep it in the history (never sent). */
export async function runSnapshot(lang: Lang) {
  const all = await prisma.report.findMany();
  const prev = all.filter((r) => r.lang === lang).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime())[0];
  const r = await buildSnapshot(lang, now(), prev ? { metrics: JSON.parse(prev.metrics), date: prev.date, at: prev.createdAt } : null);
  const row = await prisma.report.create({ data: { date: r.date, kind: "SNAPSHOT", trigger: "MANUAL", lang, title: r.title, html: r.html, text: r.text, metrics: JSON.stringify(r.metrics), recipients: "", status: "GENERATED", delivery: null, error: null, sentAt: null, kinanEventId: null } });
  return row.id;
}

// -------------------------------------------------------------------- run
async function produce(trigger: "SCHEDULED" | "MANUAL", date: string, send: boolean, langs: Lang[]) {
  const s = await ensureSchedule();
  const recipients = list(s.recipients);
  const all = await prisma.report.findMany();
  const out: { id: string; lang: Lang }[] = [];
  let kinanSent = false;
  for (const lang of langs) {
    // Compare with the most recent earlier report in this language (yesterday's, or an earlier run today).
    const prev = all.filter((r) => r.lang === lang).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime())[0];
    const r = await buildReport(lang, date, prev ? { metrics: JSON.parse(prev.metrics), date: prev.date, at: prev.createdAt } : null);
    let status = "GENERATED", delivery: string | null = null, error: string | null = null, sentAt: Date | null = null, kinanEventId: string | null = null;
    if (send) {
      if (!recipients.length) { status = "FAILED"; error = tx(lang, "No recipients set.", "لم يُحدَّد مستلمون."); }
      else {
        try {
          const res = await deliverMail({ to: recipients[0], cc: recipients.slice(1), subject: r.title, body: r.html, html: true, internal: true });
          status = "SENT"; delivery = res.delivery; sentAt = new Date();
        } catch (e: any) { status = "FAILED"; error = String(e?.message ?? e).slice(0, 300); }
      }
      if (s.toKinan && !kinanSent) {
        kinanEventId = await queueKinanEvent("brief.daily", "AGENT", { date, headline: r.headline, bullets: r.bullets, actions: r.actions, metrics: r.metrics });
        kinanSent = true;
      }
    }
    const row = await prisma.report.create({ data: { date, kind: "DAILY", trigger, lang, title: r.title, html: r.html, text: r.text, metrics: JSON.stringify(r.metrics), recipients: send ? recipients.join(", ") : "", status, delivery, error, sentAt, kinanEventId } });
    if (send) await prisma.marketingAction.create({ data: { type: "REPORT_SENT", campaign: r.title, detail: status === "SENT" ? tx(lang, `${delivery === "mock" ? "Simulated send" : "Sent"} to ${recipients.join(", ")} (${trigger.toLowerCase()}).`, `${delivery === "mock" ? "إرسال تجريبي" : "أُرسل"} إلى ${recipients.join("، ")}.`) : tx(lang, `Not sent: ${error}`, `لم يُرسل: ${error}`) } });
    out.push({ id: row.id, lang });
  }
  return out;
}

/** Scheduler tick: runs the daily report if it is due (once per local day). Safe to call as often as you like. */
export const runSchedule = serial(async (now: Date = new Date()) => {
  const s = await ensureSchedule();
  const ln = localNow(s.timezone, now);
  if (!s.enabled) return { ran: false, reason: "paused", local: ln };
  if (!s.days.split(",").map(Number).includes(ln.dow)) return { ran: false, reason: "not a scheduled day", local: ln };
  if (ln.hhmm < s.time) return { ran: false, reason: `not before ${s.time}`, local: ln };
  if ((await prisma.report.findMany()).some((r) => r.trigger === "SCHEDULED" && r.date === ln.date)) return { ran: false, reason: "already sent today", local: ln };
  const ids = await produce("SCHEDULED", ln.date, true, s.languages.split(",") as Lang[]);
  return { ran: true, reason: "sent", local: ln, reports: ids.map((x) => x.id), byLang: ids };
});

/** Preview (no send) in one language, or send now to the schedule's recipients in its languages. */
export async function runNow(send: boolean, lang: Lang) {
  const s = await ensureSchedule();
  const ln = localNow(s.timezone, now());
  return produce("MANUAL", ln.date, send, send ? (s.languages.split(",") as Lang[]) : [lang]);
}

export async function reportsState(lang: Lang) {
  const s = await ensureSchedule();
  const ln = localNow(s.timezone, now());
  const reports = (await prisma.report.findMany()).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime());
  const ranToday = reports.some((r) => r.trigger === "SCHEDULED" && r.date === ln.date);
  return {
    schedule: { enabled: s.enabled, time: s.time, timezone: s.timezone, days: s.days.split(",").map(Number), recipients: s.recipients, languages: s.languages.split(","), toKinan: s.toKinan, updatedBy: s.updatedBy, updatedAt: s.updatedAt.toISOString() },
    local: ln, next: nextRun(s, ranToday), timezones: TIMEZONES, allowedDomains: allowedDomains(),
    outlook: outlookMode(), cronConfigured: !!process.env.REPORTS_CRON_KEY,
    reports: reports.slice(0, 60).map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), date: r.date, kind: r.kind, trigger: r.trigger, lang: r.lang, title: r.title, status: r.status, delivery: r.delivery, recipients: r.recipients, error: r.error, kinan: !!r.kinanEventId })),
    latestId: reports.find((r) => r.lang === lang)?.id ?? null,
  };
}

export async function getReport(id: string) {
  const r = (await prisma.report.findMany()).find((x) => x.id === id);
  if (!r) throw new Error("Report not found.");
  return { id: r.id, title: r.title, html: r.html, text: r.text, date: r.date, lang: r.lang, status: r.status };
}
