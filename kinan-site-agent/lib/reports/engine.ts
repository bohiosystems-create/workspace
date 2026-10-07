// Daily status reports — the same rules and structure as the Kinan marketing agent's reports.
//
// Schedule: one record (time, timezone, days, recipients, languages). Reports go to internal recipients only.
// Trigger:  GET/POST /api/reports/run with x-api-key: $REPORTS_CRON_KEY (or Authorization: Bearer; Vercel Cron's
//           Bearer $CRON_SECRET is accepted too). Vercel Cron calls it every minute (vercel.json); a report
//           runs once per local day, at or after the scheduled time, on the scheduled days — a missed slot is sent at
//           the next check that day. "Preview today's report", "Run snapshot" and "Send test now" run it by hand.
// Content:  lib/reports/build.ts — every active project: Kinan Heights from the live data, plus the projects
//           generated from uploaded documents. No AI needed. Stored as HTML + text with a metrics snapshot, so the
//           next report says what changed.
// Delivery: Outlook (lib/outlook.ts), internal recipients only — every address must be on an allowed domain
//           (REPORTS_ALLOWED_DOMAINS, default: the sender's domain) or be named one by one in
//           REPORTS_ALLOWED_RECIPIENTS. The list is checked again at every send. The full report also rides along as
//           an HTML attachment. The report takes no action.
//
// Storage-agnostic: the server passes Vercel Blob / disk (lib/reports/server.ts); the standalone page passes IndexedDB.
import type { Db } from "../types";
import type { GenProject } from "../model3d/store";
import type { MailToSend, SendResult } from "../outlook";
import { buildReport, tx, type Lang, type Metrics } from "./build";

export type { Lang };
export interface ReportsIO {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  /** Run fn only if no other instance holds the named lock; null when it is held. */
  lock<T>(name: string, fn: () => Promise<T>): Promise<T | null>;
  db(): Promise<Db>;
  projects(): Promise<GenProject[]>;
  send(mail: MailToSend): Promise<SendResult>;
  env: { mode: "mock" | "live"; creds: boolean; sender: string; senderSet: boolean; cron: boolean; allowedDomains?: string; allowedRecipients?: string; appUrl?: string | null };
  now?: () => Date;
}

export interface Schedule { enabled: boolean; time: string; timezone: string; days: string; recipients: string; languages: string; updatedBy?: string; updatedAt: string }
export type Status = "GENERATED" | "SENT" | "FAILED";
export interface ReportMeta { id: string; createdAt: string; date: string; kind: "DAILY" | "SNAPSHOT"; trigger: "SCHEDULED" | "MANUAL"; lang: Lang; title: string; status: Status; delivery: "mock" | "send" | null; recipients: string; error: string | null; sentAt: string | null; projects: number }
interface ReportFull extends ReportMeta { html: string; text: string; metrics: Metrics }

const K = { schedule: "reports/schedule.json", index: "reports/index.json", one: (id: string) => `reports/r/${id}.json` };
const DAY = 86_400_000;
export const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Africa/Cairo", "Europe/London", "UTC"];
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const rid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function reports(io: ReportsIO) {
  const now = () => (io.now ? io.now() : new Date());

  // ---------------------------------------------------------------- schedule
  async function ensureSchedule(): Promise<Schedule> {
    const s = await io.get<Schedule>(K.schedule);
    if (s) return s;
    const d: Schedule = { enabled: true, time: "07:30", timezone: "Asia/Riyadh", days: "0,1,2,3,4", recipients: io.env.sender, languages: "en", updatedAt: now().toISOString() };
    await io.put(K.schedule, d);
    return d;
  }
  const allowedDomains = () => (io.env.allowedDomains || io.env.sender.split("@")[1] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowedRecipients = () => (io.env.allowedRecipients ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const recipientAllowed = (addr: string) => {
    const a = addr.trim().toLowerCase(), domains = allowedDomains();
    return allowedRecipients().includes(a) || (domains.length > 0 && domains.includes(a.split("@")[1] ?? ""));
  };

  async function saveSchedule(b: Record<string, unknown>, by: string, l: Lang) {
    const T = (en: string, ar: string) => tx(l, en, ar);
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
    const outside = recipients.find((r) => !recipientAllowed(r));
    if (outside) { const ok = [...allowedDomains().map((d) => `@${d}`), ...allowedRecipients()].join(", "); throw new Error(T(`${outside} is not an allowed recipient (${ok}). Reports go to internal addresses only.`, `${outside} ليس من المستلمين المسموح بهم (${ok}). تُرسل التقارير إلى عناوين داخلية فقط.`)); }
    await io.put(K.schedule, { enabled: !!b.enabled, time, timezone, days: days.join(","), recipients: recipients.join(", "), languages: langs.join(","), updatedBy: by.trim().slice(0, 60) || undefined, updatedAt: now().toISOString() } satisfies Schedule);
  }

  // ---------------------------------------------------------------- history
  const index = async () => (await io.get<ReportMeta[]>(K.index)) ?? [];
  async function addToIndex(m: ReportMeta) {
    const xs = await index();
    await io.put(K.index, [m, ...xs.filter((x) => x.id !== m.id)].slice(0, 200));
  }
  async function updateIndex(id: string, patch: Partial<ReportMeta>) {
    const xs = await index();
    await io.put(K.index, xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  /** The last report actually issued in this language before a date (for "since the last report"). */
  async function lastIssued(lang: Lang, date: string) {
    const prev = (await index()).find((r) => r.lang === lang && r.date < date && (r.status === "SENT" || r.kind === "DAILY"));
    if (!prev) return null;
    const full = await io.get<ReportFull>(K.one(prev.id));
    return full ? { metrics: full.metrics, date: full.date } : null;
  }

  async function build(trigger: ReportMeta["trigger"], kind: ReportMeta["kind"], date: string, lang: Lang): Promise<ReportFull> {
    const s = await ensureSchedule(), at = now(), t0 = Date.now();
    const r = buildReport({ lang, date, kind, at, timezone: s.timezone, db: await io.db(), projects: await io.projects(), prev: await lastIssued(lang, date) });
    const full: ReportFull = { id: rid(), createdAt: at.toISOString(), date, kind, trigger, lang, title: r.title, status: "GENERATED", delivery: null, recipients: "", error: null, sentAt: null, projects: r.active,
      html: r.html, text: r.text, metrics: { ...r.metrics, buildSec: Math.round((Date.now() - t0) / 1000) } };
    await io.put(K.one(full.id), full);
    const { html: _h, text: _t, metrics: _m, ...meta } = full;
    await addToIndex(meta);
    return full;
  }

  /** E-mail a built report to the schedule's recipients; the record keeps the outcome. */
  async function deliver(r: ReportFull) {
    const s = await ensureSchedule(), recipients = list(s.recipients), l = r.lang;
    let status: Status = "SENT", delivery: ReportMeta["delivery"] = null, error: string | null = null, sentAt: string | null = null;
    const blocked = recipients.filter((x) => !recipientAllowed(x));
    if (!recipients.length) { status = "FAILED"; error = tx(l, "No recipients set.", "لم يُحدَّد مستلمون."); }
    else if (blocked.length) { status = "FAILED"; error = tx(l, `Not an allowed recipient: ${blocked.join(", ")}.`, `ليس من المستلمين المسموح بهم: ${blocked.join("، ")}.`); }
    else {
      try {
        const res = await io.send({ to: recipients[0], cc: recipients.slice(1), subject: `Kinan · ${r.title}`, body: r.html,
          attachments: [{ name: `Kinan-site-status-${r.date}-${l}.html`, contentType: "text/html", content: r.html }] });
        delivery = res.delivery; sentAt = now().toISOString();
      } catch (e) { status = "FAILED"; error = String((e as Error)?.message ?? e).slice(0, 300); }
    }
    const patch = { status, delivery, error, sentAt, recipients: recipients.join(", ") };
    await io.put(K.one(r.id), { ...r, ...patch });
    await updateIndex(r.id, patch);
    return { ...r, ...patch };
  }

  // ---------------------------------------------------------------- on time
  async function runSchedule() {
    const s = await ensureSchedule();
    const ln = localNow(s.timezone, now());
    if (!s.enabled) return { ran: false, reason: "paused", local: ln };
    if (!s.days.split(",").map(Number).includes(ln.dow)) return { ran: false, reason: "not a scheduled day", local: ln };
    if (ln.hhmm < s.time) return { ran: false, reason: `not before ${s.time}`, local: ln };
    const sentToday = (xs: ReportMeta[]) => xs.some((r) => r.trigger === "SCHEDULED" && r.date === ln.date && (r.status === "SENT" || r.status === "FAILED"));
    if (sentToday(await index())) return { ran: false, reason: "already sent today", local: ln };
    // One instance builds and sends; a second tick arriving meanwhile does nothing.
    const out = await io.lock("report-send", async () => {
      if (sentToday(await index())) return null;
      const byLang: { id: string; lang: Lang }[] = [];
      for (const lang of s.languages.split(",") as Lang[]) { const r = await deliver(await build("SCHEDULED", "DAILY", ln.date, lang)); byLang.push({ id: r.id, lang }); }
      return byLang;
    });
    if (!out) return { ran: false, reason: "already sent today", local: ln };
    return { ran: true, reason: "sent", local: ln, byLang: out };
  }

  /** Preview (no send) in one language, or send now to the schedule's recipients in its languages. */
  async function runNow(send: boolean, lang: Lang) {
    const s = await ensureSchedule(), ln = localNow(s.timezone, now());
    const out: ReportFull[] = [];
    for (const l of send ? (s.languages.split(",") as Lang[]) : [lang]) { const r = await build("MANUAL", "DAILY", ln.date, l); out.push(send ? await deliver(r) : r); }
    return out;
  }
  async function runSnapshot(lang: Lang) {
    const s = await ensureSchedule();
    return (await build("MANUAL", "SNAPSHOT", localNow(s.timezone, now()).date, lang)).id;
  }

  // ---------------------------------------------------------------- what the page shows
  function deliveryCheck(s: Schedule, xs: ReportMeta[], l: Lang) {
    const T = (en: string, ar: string) => tx(l, en, ar);
    const rcpt = list(s.recipients), blocked = rcpt.filter((x) => !recipientAllowed(x));
    const live = io.env.mode === "live", e = io.env;
    const sent = xs.filter((r) => r.kind === "DAILY" && r.recipients);
    const lastOk = sent.find((r) => r.status === "SENT" && r.delivery === "send"), lastFail = sent.find((r) => r.status === "FAILED");
    const failNewer = lastFail && (!lastOk || lastFail.createdAt > lastOk.createdAt);
    const items: { ok: boolean; label: string; fix?: string }[] = [
      { ok: rcpt.length > 0 && !blocked.length, label: rcpt.length ? T(`Recipients: ${rcpt.join(", ")}`, `المستلمون: ${rcpt.join("، ")}`) : T("No recipients", "لا مستلمين"),
        fix: blocked.length ? T(`Not allowed: ${blocked.join(", ")}`, `غير مسموح: ${blocked.join("، ")}`) : rcpt.length ? undefined : T("Add your address and save the schedule.", "أضيفوا عنوانكم واحفظوا الجدول.") },
      { ok: s.enabled, label: s.enabled ? T("Daily sending is on", "الإرسال اليومي مفعّل") : T("Daily sending is paused", "الإرسال اليومي متوقف"), fix: s.enabled ? undefined : T("Tick “Send the daily report automatically” and save.", "فعّلوا «إرسال التقرير اليومي تلقائياً» واحفظوا.") },
      { ok: live, label: live ? T("Outlook is live", "Outlook مفعّل") : T("Outlook is simulated — nothing is e-mailed", "Outlook تجريبي — لا يُرسل شيء"), fix: live ? undefined : T("Set OUTLOOK_MODE=live.", "اضبطوا OUTLOOK_MODE=live.") },
      { ok: e.creds, label: e.creds ? T("Microsoft 365 app credentials set", "بيانات تطبيق Microsoft 365 مضبوطة") : T("Microsoft 365 app credentials missing", "بيانات تطبيق Microsoft 365 ناقصة"), fix: e.creds ? undefined : T("Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (app with Mail.Send).", "اضبطوا MS_TENANT_ID وMS_CLIENT_ID وMS_CLIENT_SECRET (تطبيق بصلاحية Mail.Send).") },
      { ok: e.senderSet, label: T(`Sent from ${e.sender}`, `يُرسل من ${e.sender}`), fix: e.senderSet ? undefined : T("Set OUTLOOK_SENDER to the mailbox that sends the report.", "اضبطوا OUTLOOK_SENDER على صندوق البريد المرسِل.") },
      { ok: e.cron, label: e.cron ? T("Scheduler endpoint enabled", "نقطة الجدولة مفعّلة") : T("No scheduler yet", "لا جدولة بعد"), fix: e.cron ? undefined : T("Set REPORTS_CRON_KEY (and CRON_SECRET for Vercel Cron) — /api/reports/run is then called every minute.", "اضبطوا REPORTS_CRON_KEY (وCRON_SECRET لـ Vercel Cron) — ثم يُستدعى المسار ‎/api/reports/run كل دقيقة.") },
      { ok: !!lastOk && !failNewer, label: failNewer ? T(`Last send failed: ${lastFail!.error ?? ""}`, `فشل آخر إرسال: ${lastFail!.error ?? ""}`) : lastOk ? T(`Last delivered ${lastOk.createdAt.slice(0, 16).replace("T", " ")} UTC to ${lastOk.recipients}`, `آخر تسليم ${lastOk.createdAt.slice(0, 16).replace("T", " ")} UTC إلى ${lastOk.recipients}`) : T("Not delivered yet", "لم يُسلَّم بعد"),
        fix: lastOk && !failNewer ? undefined : T("Press “Send test now” and check your inbox (and spam folder).", "اضغطوا «إرسال تجريبي الآن» وتحققوا من بريدكم (ومجلد الرسائل غير المرغوبة).") },
    ];
    const senderDomain = e.sender.split("@")[1]?.toLowerCase() ?? "";
    const external = rcpt.filter((x) => x.split("@")[1]?.toLowerCase() !== senderDomain);
    const notes = external.length ? [T(`${external.join(", ")} is outside ${senderDomain || "the sender's domain"}: the Microsoft 365 tenant must allow sending to external recipients.`, `${external.join("، ")} خارج نطاق ${senderDomain || "المرسِل"}: يجب أن يسمح مستأجر Microsoft 365 بالإرسال إلى مستلمين خارجيين.`)] : [];
    return { ready: items.every((i) => i.ok), items, notes };
  }

  async function state(lang: Lang) {
    const s = await ensureSchedule(), ln = localNow(s.timezone, now()), xs = await index();
    const ranToday = xs.some((r) => r.trigger === "SCHEDULED" && r.date === ln.date && (r.status === "SENT" || r.status === "FAILED"));
    const projects = await io.projects();
    return {
      schedule: { ...s, days: s.days.split(",").map(Number), languages: s.languages.split(",") },
      local: ln, next: nextRun(s, ranToday, now()), timezones: TIMEZONES, allowedDomains: allowedDomains(), allowedRecipients: allowedRecipients(),
      delivery: deliveryCheck(s, xs, lang), outlook: io.env.mode, cronConfigured: io.env.cron,
      active: 1 + projects.filter((p) => p.result?.spec?.schedule?.finish >= ln.date).length,
      reports: xs.slice(0, 60),
      latestId: xs.find((r) => r.lang === lang)?.id ?? null,
    };
  }

  async function getReport(id: string) {
    const r = await io.get<ReportFull>(K.one(id));
    if (!r) throw new Error("Report not found.");
    return { id: r.id, title: r.title, html: r.html, text: r.text, date: r.date, lang: r.lang, status: r.status, kind: r.kind };
  }

  async function action(b: Record<string, unknown>) {
    const l: Lang = b.lang === "ar" ? "ar" : "en";
    let message: string | null = null, openId: string | null = null;
    switch (b.action) {
      case "SAVE_SCHEDULE": await saveSchedule((b.schedule ?? {}) as Record<string, unknown>, String(b.by ?? ""), l); message = tx(l, "Schedule saved.", "حُفظ الجدول."); break;
      case "SNAPSHOT": openId = await runSnapshot(l); message = tx(l, "Live snapshot ready — saved in the history, not e-mailed.", "اللقطة الفورية جاهزة — حُفظت في السجل ولم تُرسل بالبريد."); break;
      case "PREVIEW": openId = (await runNow(false, l))[0]?.id ?? null; break;
      case "SEND_NOW": {
        const rows = await runNow(true, l);
        openId = (rows.find((x) => x.lang === l) ?? rows[0])?.id ?? null;
        const failed = rows.filter((r) => r.status === "FAILED");
        message = failed.length ? tx(l, `Not sent: ${failed[0].error}`, `لم يُرسل: ${failed[0].error}`)
          : rows[0]?.delivery === "mock" ? tx(l, `Simulated only — Outlook isn't live, so nothing reached ${rows[0].recipients}. See the delivery check.`, `إرسال تجريبي فقط — Outlook غير مفعّل، فلم يصل شيء إلى ${rows[0].recipients}. راجعوا فحص التسليم.`)
          : tx(l, `Sent to ${rows[0]?.recipients} (${rows.length} report${rows.length > 1 ? "s" : ""}). Check the inbox — and the spam folder the first time.`, `أُرسل إلى ${rows[0]?.recipients} (${rows.length}). تحققوا من البريد الوارد — ومن مجلد الرسائل غير المرغوبة في المرة الأولى.`);
        break;
      }
      case "RUN": {
        const r = await runSchedule();
        const REASON: Record<string, string> = { paused: tx(l, "the schedule is paused", "الجدول متوقف"), "not a scheduled day": tx(l, "today is not a scheduled day", "اليوم ليس من أيام الجدول"), "already sent today": tx(l, "today's report was already sent", "أُرسل تقرير اليوم بالفعل") };
        message = r.ran ? tx(l, "Due — today's report was generated and sent.", "حان الموعد — أُعدّ تقرير اليوم وأُرسل.")
          : tx(l, `Not due: ${REASON[r.reason] ?? r.reason} (local time ${r.local.hhmm}).`, `لم يحن الموعد: ${REASON[r.reason] ?? r.reason.replace("not before", "ليس قبل")} (التوقيت المحلي ${r.local.hhmm}).`);
        openId = r.ran && r.byLang ? (r.byLang.find((x) => x.lang === l) ?? r.byLang[0])?.id ?? null : null;
        break;
      }
      default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
    }
    return { ...(await state(l)), message, openId };
  }

  return { state, getReport, action, runSchedule };
}

/** Local date / time / weekday in a timezone. */
export function localNow(tz: string, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(now).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, dow };
}

/** Next scheduled run (local date + time), skipping today if it already ran. */
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
