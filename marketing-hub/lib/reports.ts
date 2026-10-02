// Daily scheduled reports — the director writes the manager's morning report and emails it.
//
// Schedule: one ReportSchedule row (time, timezone, days, recipients, languages, optional copy to Kinan's agent).
// Trigger:  POST /api/reports/run with x-api-key: $REPORTS_CRON_KEY (or Authorization: Bearer) — point any scheduler
//           at it every 15 minutes; a report runs once per local day, at or after the scheduled time, on the
//           scheduled days. "Send now" / "Preview" on the Reports page run it by hand.
// Content:  computed from the same data as the Director page (no AI needed): headline and brief, sales vs target,
//           what changed since the last report, decisions waiting (with minutes), vendors, leads and Kinan, risks,
//           invoices, data freshness. Stored as HTML + text with a metrics snapshot for the next day's comparison.
// Delivery: Outlook (lib/outlook.ts), internal recipients only — every address must be on an allowed domain
//           (REPORTS_ALLOWED_DOMAINS, default: the sender's domain). The report takes no action and contacts no
//           vendor or customer.
import { prisma } from "./prisma";
import { single, serial } from "./single";
import { buildAgent } from "./agent";
import { buildDirector } from "./director";
import { buildOrchestration } from "./orchestrator";
import { buildRecommendations } from "./recommendations";
import { queueKinanEvent } from "./kinan";
import { deliverMail, outlookMode, outlookSender } from "./outlook";
import { type Lang, tx, nm, dt, M, K, an } from "./i18n";
import { TODAY } from "./clock";

const DAY = 86_400_000;
export const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Africa/Cairo", "Europe/London", "UTC"];

// ---------------------------------------------------------------- schedule
export const ensureSchedule = single(async function ensureScheduleImpl() {
  const s = (await prisma.reportSchedule.findMany()).find((x) => x.id === "daily");
  if (s) return s;
  return prisma.reportSchedule.create({
    data: { id: "daily", enabled: true, time: "07:30", timezone: "Asia/Riyadh", days: "0,1,2,3,4", recipients: outlookSender(), languages: "en", toKinan: false, updatedAt: new Date() },
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
const C = { ink: "#000919", soft: "#5b6170", line: "#d9d7d4", alert: "#d6334b", green: "#1f7a4d", paper: "#f6f5f3" };

export async function buildReport(lang: Lang, date: string, prev: { metrics: Metrics; date: string } | null) {
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const N = (s: string) => nm(lang, s);
  const a = await buildAgent(lang);
  const [d, o, leads, events] = await Promise.all([buildDirector(lang, a), buildOrchestration(lang, a), prisma.crmLead.findMany(), prisma.kinanEvent.findMany()]);
  const untouched = leads.filter((x) => x.stage === "NEW" && !x.firstResponseAt && TODAY.getTime() - x.createdAt.getTime() > 2 * DAY && x.campaignId).length;
  const since = Date.now() - DAY;
  const ev24 = events.filter((e) => e.createdAt.getTime() >= since);
  const recs = (await buildRecommendations(lang, a)).recommendations.filter((r) => r.severity === "crit" && (r.state === "OPEN" || r.state === "DRAFTED"));

  const metrics: Metrics = {
    ytdSalesM: d.targets.ytdActualM, ytdPct: d.targets.ytdPct, decisions: d.inbox.length, minutes: d.managerMinutes,
    untouchedLeads: untouched, lateDeliverables: o.summary.lateDeliverables, overdueWorkOrders: o.summary.overdue, withVendors: o.summary.withVendors,
    invoiceExceptions: a.inv.kpis.exceptions, overdueK: Math.round(a.inv.kpis.overdueK), kinanFailed: events.filter((e) => e.status === "FAILED").length, criticalRisks: recs.length,
  };
  const LABEL: Record<string, [string, string, "up" | "down"]> = {
    ytdSalesM: ["Sales year to date (SAR M)", "المبيعات منذ بداية العام (مليون ر.س)", "up"], ytdPct: ["% of target", "% من المستهدف", "up"],
    decisions: ["Decisions waiting", "قرارات بانتظاركم", "down"], untouchedLeads: ["Leads nobody contacted (48h+)", "عملاء لم يتواصل معهم أحد (48+ ساعة)", "down"],
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
  const top = d.sourceQuality.slice(0, 2), bottom = d.sourceQuality.slice(-2);

  // Sections as [heading, html, text]
  const sec: [string, string, string][] = [];
  const ul = (xs: string[]) => `<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.6">${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const tl = (xs: string[]) => xs.map((x) => `  • ${x.replace(/<[^>]+>/g, "")}`).join("\n");

  // 1. Brief
  sec.push([T("Today's brief", "موجز اليوم"), `<p style="font-size:16px;font-weight:700;margin:0 0 6px">${esc(d.brief.headline)}</p>${ul(d.brief.bullets.map(esc))}`, `${d.brief.headline}\n${tl(d.brief.bullets)}`]);
  // 2. Sales vs target
  const rows = d.targets.byAsset.map((x) => [N(x.asset), M(lang, x.actualM), M(lang, x.targetM), `${x.pct}%`, `${M(lang, x.forecastNextM)} / ${M(lang, x.targetNextM)}`, (x.pct ?? 0) < 75]);
  const th = (h: string[]) => `<tr>${h.map((x) => `<th style="text-align:start;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:${C.ink};padding:6px 8px">${esc(x)}</th>`).join("")}</tr>`;
  sec.push([T("Sales vs target", "المبيعات مقابل المستهدف"),
    `<table style="border-collapse:collapse;width:100%;font-size:13px">${th([T("Project", "المشروع"), T("Year to date", "منذ بداية العام"), T("Target", "المستهدف"), "%", T("June forecast / target", "توقع يونيو / المستهدف")])}${rows.map((r) => `<tr>${r.slice(0, 5).map((c, i) => `<td style="padding:6px 8px;border-bottom:1px solid ${C.line};${i === 3 && r[5] ? `color:${C.alert};font-weight:700` : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>
     <p style="margin:6px 0 0;color:${C.soft};font-size:12px">${esc(T(`Total: ${M(lang, d.targets.ytdActualM)} of ${M(lang, d.targets.ytdTargetM)} (${d.targets.ytdPct}%), CRM-verified.`, `الإجمالي: ${M(lang, d.targets.ytdActualM)} من ${M(lang, d.targets.ytdTargetM)} (${d.targets.ytdPct}%)، متحقَّق منه في النظام.`))}</p>`,
    rows.map((r) => `  • ${r[0]}: ${r[1]} / ${r[2]} (${r[3]}); ${T("June", "يونيو")} ${r[4]}`).join("\n")]);
  // 3. Since last report
  const chHtml = !prev ? `<p style="margin:0;color:${C.soft}">${esc(T("First report — tomorrow's will show what changed.", "التقرير الأول — سيُظهر تقرير الغد ما تغيّر."))}</p>`
    : !changes.length ? `<p style="margin:0;color:${C.soft}">${esc(T(`No change in the key numbers since ${dt("en", prev.date)}.`, `لا تغيير في الأرقام الرئيسية منذ ${dt("ar", prev.date)}.`))}</p>`
    : ul(changes.map((c) => `${esc(c.label)}: ${c.from} → <b>${c.to}</b> <span style="color:${c.good ? C.green : C.alert}">(${c.delta > 0 ? "+" : ""}${c.delta})</span>`));
  sec.push([prev ? T(`Since the last report (${dt("en", prev.date)})`, `منذ التقرير السابق (${dt("ar", prev.date)})`) : T("Since the last report", "منذ التقرير السابق"), chHtml,
    !prev ? T("First report.", "التقرير الأول.") : changes.length ? changes.map((c) => `  • ${c.label}: ${c.from} → ${c.to} (${c.delta > 0 ? "+" : ""}${c.delta})`).join("\n") : T("No change.", "لا تغيير.")]);
  // 4. Decisions
  const dec = d.inbox.map((x) => `${esc(x.title)} <span style="color:${C.soft}">(~${x.minutes} ${T("min", "د")})</span>`);
  sec.push([T(`Waiting for your decision — about ${d.managerMinutes} min`, `بانتظار قراركم — نحو ${an(d.managerMinutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")}`), dec.length ? ul(dec) : `<p style="margin:0">${T("Nothing waiting.", "لا شيء بالانتظار.")}</p>`, tl(d.inbox.map((x) => `${x.title} (~${x.minutes} min)`))]);
  // 5. Vendors
  const vend = [
    ...o.escalations.map((x) => `<b style="color:${C.alert}">${esc(x.title)}</b>`),
    esc(T(`${o.summary.withVendors} work orders with vendors, ${o.summary.overdue} overdue; ${o.summary.waiting} drafted for your approval (${o.summary.routineWaiting} routine).`, `${an(o.summary.withVendors, "أمر عمل واحد", "أمرا عمل", "أوامر عمل", "أمر عمل")} لدى الموردين، ${o.summary.overdue} متأخرة؛ و${o.summary.waiting} مُعدّة بانتظار اعتمادكم (${o.summary.routineWaiting} روتينية).`)),
    ...lateDels.map((x) => esc(T(`Late: ${x.vendor} — ${x.title} (${x.daysLate} days, ${x.chases} reminder(s))`, `متأخر: ${N(x.vendor)} — ${x.title} (${an(x.daysLate, "يوم واحد", "يومان", "أيام", "يوماً")}، ${an(x.chases, "تذكير واحد", "تذكيران", "تذكيرات", "تذكيراً")})`))),
    ...a.decisions.filter((x) => x.decision === "EXIT" || x.decision === "TEST_REPLACEMENT").map((x) => esc(`${N(x.vendor)}: ${x.headline}`)),
  ];
  sec.push([T("Vendors", "الموردون"), ul(vend), tl(vend)]);
  // 6. Leads & Kinan
  const lk = [
    esc(T(`${untouched} leads older than 48h with no first response${untouched ? " — follow-up task for Kinan's agent is on your list" : ""}.`, `${an(untouched, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} مضى عليهم أكثر من 48 ساعة دون رد${untouched ? " — مهمة المتابعة لوكيل كنان ضمن قائمتكم" : ""}.`)),
    esc(T(`Kinan feed, last 24h: ${ev24.length} event(s), ${ev24.filter((e) => e.status === "DELIVERED").length} delivered; ${failed.length} failed overall.`, `التغذية إلى كنان، آخر 24 ساعة: ${ev24.length} حدث، سُلّم ${ev24.filter((e) => e.status === "DELIVERED").length}؛ والفاشلة إجمالاً ${failed.length}.`)),
    esc(T(`Best lead sources: ${top.map((x) => `${x.code} (${x.qualifiedRate}% qualified)`).join(", ")}; weakest: ${bottom.map((x) => `${x.code} (${x.qualifiedRate}%)`).join(", ")}.`, `أفضل مصادر العملاء: ${top.map((x) => `${x.code} (${x.qualifiedRate}% مؤهلون)`).join("، ")}؛ والأضعف: ${bottom.map((x) => `${x.code} (${x.qualifiedRate}%)`).join("، ")}.`)),
  ];
  sec.push([T("Leads and Kinan", "العملاء المحتملون وكنان"), ul(lk), tl(lk)]);
  // 7. Risks
  if (recs.length) sec.push([T("Risks", "المخاطر"), ul(recs.slice(0, 6).map((r) => `<span style="color:${C.alert}">${esc(r.title)}</span>`)), tl(recs.slice(0, 6).map((r) => r.title))]);
  // 8. Invoices
  const invl = [esc(T(`${a.inv.kpis.exceptions} invoice exception(s) to resolve; ${K(lang, Math.round(a.inv.kpis.overdueK))} overdue for payment; ${K(lang, Math.round(a.inv.kpis.unbilledK))} delivered but not yet invoiced.`, `${an(a.inv.kpis.exceptions, "استثناء واحد", "استثناءان", "استثناءات", "استثناءً")} في الفواتير بحاجة إلى معالجة؛ ${K(lang, Math.round(a.inv.kpis.overdueK))} مستحقة الدفع ومتأخرة؛ ${K(lang, Math.round(a.inv.kpis.unbilledK))} نُفّذت ولم تُفوتر بعد.`))];
  sec.push([T("Supplier invoices", "فواتير الموردين"), ul(invl), tl(invl)]);
  // 9. Data
  const src = a.unified.sources.map((x) => `${x.key}: ${x.mode}${x.lastSync ? ` · ${dt(lang, x.lastSync)}` : ""}`);
  sec.push([T("Data", "البيانات"), `<p style="margin:0;color:${C.soft};font-size:12px">${esc(T(`Figures as of ${dt("en", d.asOf)}. Sources — `, `الأرقام حتى ${dt("ar", d.asOf)}. المصادر — `))}${esc(src.join(" · "))}</p>`, src.join(" · ")]);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:${C.paper};color:${C.ink};font-family:${lang === "ar" ? "Tahoma,Arial" : "Helvetica,Arial"},sans-serif">
<div style="max-width:720px;margin:0 auto;padding:24px 20px">
<div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:700">${lang === "ar" ? "بوهيو" : "BOHIO"} · ${esc(T("AI Director of Marketing", "مدير التسويق الذكي"))}</div>
<h1 style="font-size:20px;margin:10px 0 18px;border-bottom:2px solid ${C.ink};padding-bottom:10px">${esc(title)}</h1>
${sec.map(([h, body]) => `<div style="background:#fff;border:1px solid ${C.line};padding:14px 16px;margin-bottom:12px"><div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.soft};margin-bottom:8px">${esc(h)}</div><div style="font-size:13px">${body}</div></div>`).join("\n")}
<p style="font-size:11px;color:${C.soft}">${esc(T("Generated automatically by the AI Director of Marketing. This report takes no action: approvals happen in the app.", "أُعدّ تلقائياً بواسطة مدير التسويق الذكي. لا يتخذ هذا التقرير أي إجراء: تتم الاعتمادات داخل التطبيق."))}</p>
</div></body></html>`;
  const text = `${title}\n\n${sec.map(([h, , t]) => `${h.toUpperCase()}\n${t}`).join("\n\n")}\n`;
  return { title, html, text, metrics, headline: d.brief.headline, bullets: d.brief.bullets, actions: d.brief.actions };
}

// -------------------------------------------------------------------- run
async function produce(trigger: "SCHEDULED" | "MANUAL", date: string, send: boolean, langs: Lang[]) {
  const s = await ensureSchedule();
  const recipients = list(s.recipients);
  const all = await prisma.report.findMany();
  const out: { id: string; lang: Lang }[] = [];
  let kinanSent = false;
  for (const lang of langs) {
    const prev = all.filter((r) => r.lang === lang && r.date < date).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime())[0];
    const r = await buildReport(lang, date, prev ? { metrics: JSON.parse(prev.metrics), date: prev.date } : null);
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
  const ln = localNow(s.timezone);
  return produce("MANUAL", ln.date, send, send ? (s.languages.split(",") as Lang[]) : [lang]);
}

export async function reportsState(lang: Lang) {
  const s = await ensureSchedule();
  const ln = localNow(s.timezone);
  const reports = (await prisma.report.findMany()).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime());
  const ranToday = reports.some((r) => r.trigger === "SCHEDULED" && r.date === ln.date);
  return {
    schedule: { enabled: s.enabled, time: s.time, timezone: s.timezone, days: s.days.split(",").map(Number), recipients: s.recipients, languages: s.languages.split(","), toKinan: s.toKinan, updatedBy: s.updatedBy, updatedAt: s.updatedAt.toISOString() },
    local: ln, next: nextRun(s, ranToday), timezones: TIMEZONES, allowedDomains: allowedDomains(),
    outlook: outlookMode(), cronConfigured: !!process.env.REPORTS_CRON_KEY,
    reports: reports.slice(0, 60).map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), date: r.date, trigger: r.trigger, lang: r.lang, title: r.title, status: r.status, delivery: r.delivery, recipients: r.recipients, error: r.error, kinan: !!r.kinanEventId })),
    latestId: reports.find((r) => r.lang === lang)?.id ?? null,
  };
}

export async function getReport(id: string) {
  const r = (await prisma.report.findMany()).find((x) => x.id === id);
  if (!r) throw new Error("Report not found.");
  return { id: r.id, title: r.title, html: r.html, text: r.text, date: r.date, lang: r.lang, status: r.status };
}
