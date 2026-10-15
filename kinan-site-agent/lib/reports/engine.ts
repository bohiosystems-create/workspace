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
import type { Email } from "../core/emails";
import type { Db } from "../types";
import type { GenProject } from "../model3d/store";
import type { MailToSend, SendResult } from "../outlook";
import { buildReport, tx, type Lang, type Metrics } from "./build";
import { deckScript, speakDates, type Deck, type DeckSlide } from "../deck/deck";
import { kinanLogoText } from "../deck/brand";
import { applyOps, cleanLayout, layoutView, type Layout, type LayoutChange, type LayoutState, type Op } from "./layout";

export type { Lang };
export interface ReportsIO {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  /** Run fn only if no other instance holds the named lock; null when it is held. */
  lock<T>(name: string, fn: () => Promise<T>): Promise<T | null>;
  db(): Promise<Db>;
  projects(): Promise<GenProject[]>;
  /** Contractor emails from the project inbox (for "In the last 24 hours" and "To know today"). */
  emails?(): Promise<Email[]>;
  send(mail: MailToSend): Promise<SendResult>;
  /** The presenter's script for ▶ Play (server: lib/deck/narration.ts with the AI). Without it, the slides' own text is spoken. */
  narrate?(deck: Deck, opts: { timeoutMs?: number }): Promise<Deck>;
  env: { mode: "mock" | "live"; creds: boolean; sender: string; senderSet: boolean; cron: boolean; allowedDomains?: string; allowedRecipients?: string; appUrl?: string | null };
  now?: () => Date;
}

export interface Schedule { enabled: boolean; time: string; timezone: string; days: string; recipients: string; languages: string; updatedBy?: string; updatedAt: string }
export type Status = "GENERATED" | "SENT" | "FAILED";
export interface ReportMeta { id: string; createdAt: string; date: string; kind: "DAILY" | "SNAPSHOT"; trigger: "SCHEDULED" | "MANUAL"; lang: Lang; title: string; status: Status; delivery: "mock" | "send" | null; recipients: string; error: string | null; sentAt: string | null; projects: number }
interface ReportFull extends ReportMeta { html: string; text: string; metrics: Metrics }

const K = { schedule: "reports/schedule.json", index: "reports/index.json", one: (id: string) => `reports/r/${id}.json`, layout: "reports/layout.json", layoutLog: "reports/layout-log.json" };
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
    const d: Schedule = { enabled: true, time: "07:30", timezone: "Asia/Riyadh", days: "0,1,2,3,4,5,6", recipients: io.env.sender, languages: "en", updatedAt: now().toISOString() };
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
    if (outside) { const ok = [...allowedDomains().map((d) => `@${d}`), ...allowedRecipients()].join(", "); throw new Error(T(`${outside} is not an allowed recipient (${ok}). Briefs go to internal addresses only.`, `${outside} ليس من المستلمين المسموح بهم (${ok}). تُرسل الموجزات إلى عناوين داخلية فقط.`)); }
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

  // ---- the brief's layout (changed from the chat; see layout.ts), with a change log for undo
  const getLayout = async (): Promise<Layout> => cleanLayout(await io.get<Layout>(K.layout));
  const layoutLog = async (): Promise<(LayoutChange & { before: Layout; after: Layout })[]> => (await io.get<(LayoutChange & { before: Layout; after: Layout })[]>(K.layoutLog)) ?? [];
  async function projectNames() { const db = await io.db(); return [db.project.name, ...(await io.projects()).map((p) => p.result.spec.name)]; }
  async function layoutChange(ops: Op[], lang: Lang, by: string, source = "chat") {
    const before = await getLayout();
    const r = applyOps(before, ops, lang, await projectNames());
    if (r.done.length) {
      await io.put(K.layout, r.layout);
      const log = await layoutLog();
      log.unshift({ id: rid(), at: now().toISOString(), summary: r.done.join(" · "), by: by || null, source, undone: false, before, after: r.layout });
      await io.put(K.layoutLog, log.slice(0, 40));
    }
    return { ...r, view: layoutView(r.layout, lang), message: r.done.length ? tx(lang, `Brief changed: ${r.done.join("; ")}.`, `تغيّر الموجز: ${r.done.join("؛ ")}.`) : r.notes.join(" ") };
  }
  async function layoutUndo(lang: Lang) {
    const log = await layoutLog(), last = log.find((x) => !x.undone && x.source !== "undo");
    if (!last) return { ok: false, message: tx(lang, "There is no brief change to undo.", "لا يوجد تعديل على الموجز للتراجع عنه."), view: layoutView(await getLayout(), lang) };
    await io.put(K.layout, cleanLayout(last.before)); last.undone = true; await io.put(K.layoutLog, log);
    return { ok: true, message: tx(lang, `Undone: ${last.summary}.`, `تم التراجع عن: ${last.summary}.`), view: layoutView(cleanLayout(last.before), lang) };
  }
  async function layoutState(lang: Lang, message?: string): Promise<LayoutState> {
    const log = await layoutLog();
    return { view: layoutView(await getLayout(), lang), history: log.slice(0, 12).map(({ id, at, summary, by, source, undone }) => ({ id, at, summary, by, source, undone })), ...(message ? { message } : {}) };
  }
  async function layoutAction(b: Record<string, unknown>) {
    const lang: Lang = b.lang === "ar" ? "ar" : "en";
    if (b.action === "UNDO") { const u = await layoutUndo(lang); return layoutState(lang, u.message); }
    if (b.action === "RESET") { const r = await layoutChange([{ op: "reset" }], lang, String(b.by ?? ""), "briefs page"); return layoutState(lang, r.done.join("; ") || undefined); }
    throw new Error("Unknown action.");
  }

  async function build(trigger: ReportMeta["trigger"], kind: ReportMeta["kind"], date: string, lang: Lang): Promise<ReportFull> {
    const s = await ensureSchedule(), at = now(), t0 = Date.now();
    const r = buildReport({ lang, date, kind, at, timezone: s.timezone, db: await io.db(), projects: await io.projects(), prev: await lastIssued(lang, date),
      emails: io.emails ? await io.emails().catch(() => []) : [], appUrl: io.env.appUrl ?? null, sender: io.env.sender, layout: await getLayout() });
    // ▶ Play: the brief as narrated slides, embedded in the stored HTML (the e-mail drops it, see mailBody).
    const deck0: Deck = { lang, title: r.title, slides: r.slides };
    const spokenOnly = (d: Deck): Deck => ({ ...d, slides: d.slides.map((x) => ({ ...x, say: speakDates(x.since?.length && !x.ytd ? `${x.since[0]} ${x.say}` : x.say, d.lang) }) as DeckSlide) });
    const deck = io.narrate ? await io.narrate(deck0, { timeoutMs: trigger === "SCHEDULED" ? 45_000 : 50_000 }).catch(() => spokenOnly(deck0)) : spokenOnly(deck0);
    const html = r.html.replace(/<\/body>/i, `${deckScript(deck)}</body>`);
    const full: ReportFull = { id: rid(), createdAt: at.toISOString(), date, kind, trigger, lang, title: r.title, status: "GENERATED", delivery: null, recipients: "", error: null, sentAt: null, projects: r.active,
      html, text: r.text, metrics: { ...r.metrics, buildSec: Math.round((Date.now() - t0) / 1000) } };
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
        const body = mailBody(r.html, io.env.appUrl ? { url: `${io.env.appUrl.replace(/\/+$/, "")}/?brief=${encodeURIComponent(r.id)}&play=1`, lang: l } : null);
        const res = await io.send({ to: recipients[0], cc: recipients.slice(1), subject: `Kinan · ${r.title}`, body,
          attachments: [{ name: `Kinan-site-status-${r.date}-${l}.html`, contentType: "text/html", content: body }] });
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
      { ok: s.enabled, label: s.enabled ? T("Daily sending is on", "الإرسال اليومي مفعّل") : T("Daily sending is paused", "الإرسال اليومي متوقف"), fix: s.enabled ? undefined : T("Tick “Send the daily brief automatically” and save.", "فعّلوا «إرسال الموجز اليومي تلقائياً» واحفظوا.") },
      { ok: live, label: live ? T("Outlook is live", "Outlook مفعّل") : T("Outlook is simulated — nothing is e-mailed", "Outlook تجريبي — لا يُرسل شيء"), fix: live ? undefined : T("Set OUTLOOK_MODE=live.", "اضبطوا OUTLOOK_MODE=live.") },
      { ok: e.creds, label: e.creds ? T("Microsoft 365 app credentials set", "بيانات تطبيق Microsoft 365 مضبوطة") : T("Microsoft 365 app credentials missing", "بيانات تطبيق Microsoft 365 ناقصة"), fix: e.creds ? undefined : T("Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (app with Mail.Send).", "اضبطوا MS_TENANT_ID وMS_CLIENT_ID وMS_CLIENT_SECRET (تطبيق بصلاحية Mail.Send).") },
      { ok: e.senderSet, label: T(`Sent from ${e.sender}`, `يُرسل من ${e.sender}`), fix: e.senderSet ? undefined : T("Set OUTLOOK_SENDER to the mailbox that sends the brief.", "اضبطوا OUTLOOK_SENDER على صندوق البريد المرسِل.") },
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
    if (!r) throw new Error("Brief not found.");
    const other = (await index()).find((x) => x.lang !== r.lang && x.date === r.date && x.kind === r.kind);
    return { id: r.id, title: r.title, html: r.html, text: r.text, date: r.date, lang: r.lang, status: r.status, kind: r.kind, other: other ? { id: other.id, lang: other.lang } : null };
  }

  async function action(b: Record<string, unknown>) {
    const l: Lang = b.lang === "ar" ? "ar" : "en";
    let message: string | null = null, openId: string | null = null;
    switch (b.action) {
      case "SAVE_SCHEDULE": await saveSchedule((b.schedule ?? {}) as Record<string, unknown>, String(b.by ?? ""), l); message = tx(l, "Schedule saved.", "حُفظ الجدول."); break;
      case "SNAPSHOT": openId = await runSnapshot(l); message = tx(l, "Live snapshot ready — saved in the history, not e-mailed.", "اللقطة الفورية جاهزة — حُفظت في السجل ولم تُرسل بالبريد."); break;
      case "PREVIEW": openId = (await runNow(false, l))[0]?.id ?? null; break;
      // The same brief in the other language: the one already built for that date and kind, else built now.
      case "OPEN_IN_LANG": {
        const to: Lang = b.to === "ar" ? "ar" : "en", cur = (await index()).find((r) => r.id === String(b.id ?? ""));
        const twin = cur ? (await index()).find((r) => r.lang === to && r.date === cur.date && r.kind === cur.kind) : null;
        openId = twin?.id ?? (await build("MANUAL", cur?.kind ?? "DAILY", cur?.date ?? localNow((await ensureSchedule()).timezone, now()).date, to)).id;
        break;
      }
      case "SEND_NOW": {
        const rows = await runNow(true, l);
        openId = (rows.find((x) => x.lang === l) ?? rows[0])?.id ?? null;
        const failed = rows.filter((r) => r.status === "FAILED");
        message = failed.length ? tx(l, `Not sent: ${failed[0].error}`, `لم يُرسل: ${failed[0].error}`)
          : rows[0]?.delivery === "mock" ? tx(l, `Simulated only — Outlook isn't live, so nothing reached ${rows[0].recipients}. See the delivery check.`, `إرسال تجريبي فقط — Outlook غير مفعّل، فلم يصل شيء إلى ${rows[0].recipients}. راجعوا فحص التسليم.`)
          : tx(l, `Sent to ${rows[0]?.recipients} (${rows.length} brief${rows.length > 1 ? "s" : ""}). Check the inbox — and the spam folder the first time.`, `أُرسل إلى ${rows[0]?.recipients} (${rows.length}). تحققوا من البريد الوارد — ومن مجلد الرسائل غير المرغوبة في المرة الأولى.`);
        break;
      }
      case "RUN": {
        const r = await runSchedule();
        const REASON: Record<string, string> = { paused: tx(l, "the schedule is paused", "الجدول متوقف"), "not a scheduled day": tx(l, "today is not a scheduled day", "اليوم ليس من أيام الجدول"), "already sent today": tx(l, "today's brief was already sent", "أُرسل موجز اليوم بالفعل") };
        message = r.ran ? tx(l, "Due — today's brief was generated and sent.", "حان الموعد — أُعدّ موجز اليوم وأُرسل.")
          : tx(l, `Not due: ${REASON[r.reason] ?? r.reason} (local time ${r.local.hhmm}).`, `لم يحن الموعد: ${REASON[r.reason] ?? r.reason.replace("not before", "ليس قبل")} (التوقيت المحلي ${r.local.hhmm}).`);
        openId = r.ran && r.byLang ? (r.byLang.find((x) => x.lang === l) ?? r.byLang[0])?.id ?? null : null;
        break;
      }
      default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
    }
    return { ...(await state(l)), message, openId };
  }

  return { state, getReport, action, runSchedule, getLayout, layoutChange, layoutUndo, layoutState, layoutAction };
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

/** The brief as e-mailed: mail clients cannot run the player, so the embedded deck is dropped and a "▶ Play" button at the
 *  top opens the brief in the app, ready to play as a narrated presentation (the marketing agent's playButton). */
export function mailBody(html: string, play: { url: string; lang: Lang } | null) {
  // as the marketing agent's e-mail: mail clients block data: images and strip inline SVG, so the logo becomes the
  // "كنان / kinan" text lockup and the chevrons become the plain › glyph
  const out = html.replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<img src="data:[^"]*" alt="Kinan" height="(\d+)"[^>]*>/g, (_, h) => kinanLogoText(Number(h), "#2e2e2f"))
    .replace(/<svg\b[^>]*aria-label="Kinan"[^>]*style="display:block;width:\d+px;height:(\d+)px"[^>]*>[\s\S]*?<\/svg>/g, (m, h) => kinanLogoText(Number(h), /fill="#fff(?:fff)?"/i.test(m) ? "#fff" : "#2e2e2f"))
    .replace(/<svg\b[^>]*aria-hidden="true"[\s\S]*?<\/svg>/g, '<span style="color:#f15a22;font-weight:700;font-size:30px;line-height:1">&#8250;</span>');
  if (!play) return out;
  const ar = play.lang === "ar", ff = ar ? "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif" : "Montserrat,'Segoe UI',Arial,sans-serif";
  const label = ar ? "▶&nbsp; شغّل الموجز كعرض تقديمي" : "▶&nbsp; Play this brief as a presentation";
  const sub = ar ? "عرض مع تعليق صوتي — يفتح في التطبيق" : "Narrated slides — opens in the app";
  const btn = `<tr><td align="center" style="padding:18px 26px 6px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td bgcolor="#f15a22" style="background:#f15a22;border-radius:14px">`
    + `<a href="${play.url}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${ff};font-size:14px;font-weight:700;letter-spacing:${ar ? "0" : ".08em"};color:#ffffff;text-decoration:none">${label}</a>`
    + `</td></tr></table><div style="font-family:${ff};font-size:11px;color:#808285;margin-top:8px">${sub}</div></td></tr>`;
  // right after the orange title band
  return out.replace(/(<tr><td style="background:#f15a22;padding:30px 28px;color:#ffffff">[\s\S]*?<\/td><\/tr>)/i, `$1${btn}`);
}
