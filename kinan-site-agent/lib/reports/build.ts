/**
 * The daily status report: one e-mail covering every active project. Computed from the project data (no AI), so it
 * is the same every time for the same data. Mail-client-safe HTML (tables, inline styles, no images or scripts), so
 * Outlook, Gmail and Apple Mail all show it as it looks in the app; the same HTML is attached as a file.
 *
 * Kinan Heights: progress vs baseline, completion forecast, critical activities late / at risk / starting, milestones,
 * procurement risks, safety, and the site notes logged in the last day (WhatsApp and the app).
 * Generated projects (from uploaded documents): planned progress at their data date, the critical path worked out from
 * the programme dates, and what starts and finishes on it in the next two weeks.
 */
import type { Db } from "../types";
import type { GenProject } from "../model3d/store";
import * as P from "../core/project";
import { critState, expectedPct, liveCritical, slipOf, specCritical, specEarnedPct, specPlannedPct, specSlip, specState } from "../critical";
import { KINAN } from "../brand";
import type { Email } from "../core/emails";

export type Lang = "en" | "ar";
export const tx = (l: Lang, en: string, ar: string) => (l === "ar" ? ar : en);
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10)) + n * DAY).toISOString().slice(0, 10);
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"] };
export const dt = (iso: string, l: Lang) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return y ? `${d} ${MONTHS[l][m - 1]} ${y}` : "—"; };
const days = (n: number, l: Lang) => (n > 0 ? tx(l, `+${n} d`, `+${n} يوم`) : n < 0 ? tx(l, `${n} d`, `${n} يوم`) : tx(l, "on time", "في الموعد"));

/** Per-project figures kept with each report, so the next one can say what changed. */
export type ProjMetrics = { name: string; progress: number; planned: number; critLate: number; critRisk: number; completion: string; slip: number };
export type Metrics = { projects: Record<string, ProjMetrics>; buildSec?: number };

const C = { ink: KINAN.charcoal, soft: "#6b6b6d", line: KINAN.line, page: KINAN.page, or: KINAN.orange, orSoft: "#fff1ea", red: KINAN.alert, amber: "#b56f00", green: KINAN.green, taupe: KINAN.taupe };
const FONT = "Montserrat,'Segoe UI',Arial,sans-serif";
const FONT_AR = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";

// ------------------------------------------------------------ building blocks (table-based, inline styles)
function pill(text: string, color: string) {
  return `<span style="display:inline-block;border:1px solid ${color};color:${color};font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;white-space:nowrap">${esc(text)}</span>`;
}
const critTag = (l: Lang) => `<span style="display:inline-block;background:${C.or};color:#ffffff;font-size:9px;font-weight:800;letter-spacing:.12em;padding:1px 5px;margin-${l === "ar" ? "left" : "right"}:6px">${tx(l, "CRITICAL", "حرج")}</span>`;
function h2(text: string, sub?: string) {
  return `<tr><td style="padding:24px 28px 6px"><div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${C.or}"><span style="font-size:16px">&#8250;</span>&nbsp; ${esc(text)}</div>${sub ? `<div style="font-size:12px;color:${C.soft};margin-top:3px">${esc(sub)}</div>` : ""}</td></tr>`;
}
/** "To know today": the red-ruled box the other Kinan agents open with. */
function knowBox(title: string, items: { tag: string; color: string; html: string }[], empty: string) {
  const rows = items.length ? items.map((i) => `<tr><td valign="top" style="padding:8px 10px;border-top:1px solid ${C.line};width:92px"><span style="display:inline-block;background:${i.color};color:#ffffff;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:2px 6px;white-space:nowrap">${esc(i.tag)}</span></td><td style="padding:8px 10px;border-top:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.ink}">${i.html}</td></tr>`).join("")
    : `<tr><td style="padding:10px;font-size:13px;color:${C.soft}">${esc(empty)}</td></tr>`;
  return `<tr><td style="padding:22px 28px 4px"><div style="font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:${C.red};padding-bottom:8px">${esc(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:2px solid ${C.red}">${rows}</table></td></tr>`;
}
/** A day-by-day block: label column + lines. */
function dayBlock(groups: { label: string; lines: string[] }[]) {
  const g = groups.filter((x) => x.lines.length);
  if (!g.length) return "";
  return `<tr><td style="padding:4px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;line-height:1.5">${g.map((x) =>
    `<tr><td valign="top" style="padding:8px 10px 8px 0;border-bottom:1px solid ${C.line};width:130px;font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.taupe}">${esc(x.label)}</td><td style="padding:6px 0;border-bottom:1px solid ${C.line};color:${C.ink}">${x.lines.map((t) => `<div style="padding:2px 0">${t}</div>`).join("")}</td></tr>`).join("")}</table></td></tr>`;
}
function kpis(cells: { label: string; value: string; sub?: string; bad?: boolean }[]) {
  const w = Math.floor(100 / cells.length);
  return `<tr><td style="padding:6px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells.map((c) =>
    `<td width="${w}%" valign="top" style="border-top:2px solid ${C.or};border-bottom:1px solid ${C.line};padding:8px 8px 8px 0"><div style="font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${C.taupe}">${esc(c.label)}</div><div style="font-size:20px;font-weight:600;color:${c.bad ? C.red : C.ink};padding-top:2px">${esc(c.value)}</div>${c.sub ? `<div style="font-size:11px;color:${C.soft}">${esc(c.sub)}</div>` : ""}</td>`).join("")}</tr></table></td></tr>`;
}
function table(head: string[], rows: string[][], align: ("l" | "r")[] = [], l: Lang = "en", marks: (string | null)[] = []) {
  const side = (i: number) => (align[i] === "r" ? (l === "ar" ? "left" : "right") : l === "ar" ? "right" : "left");
  return `<tr><td style="padding:6px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
<tr>${head.map((h, i) => `<th align="${side(i)}" style="font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.taupe};border-bottom:1px solid ${C.ink};padding:5px 6px">${esc(h)}</th>`).join("")}</tr>
${rows.map((r, k) => `<tr>${r.map((c, i) => `<td align="${side(i)}" valign="top" style="padding:6px;border-bottom:1px solid ${C.line};${i === 0 && marks[k] ? `border-${l === "ar" ? "right" : "left"}:3px solid ${marks[k]};` : ""}color:${C.ink}">${c}</td>`).join("")}</tr>`).join("\n")}
</table></td></tr>`;
}
const para = (html: string) => `<tr><td style="padding:4px 28px;font-size:13px;line-height:1.55;color:${C.ink}">${html}</td></tr>`;
const bullets = (items: string[]) => `<tr><td style="padding:2px 28px 4px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;color:${C.ink}">${items.map((x) => `<tr><td valign="top" style="color:${C.or};padding:0 8px 0 0">&#9656;</td><td style="padding:1px 0">${x}</td></tr>`).join("")}</table></td></tr>`;
const projectBand = (name: string, meta: string, status: string, color: string) =>
  `<tr><td style="padding:26px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${C.ink}"><tr><td style="padding:12px 14px;border-top:3px solid ${C.or}"><div style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:.02em">${esc(name)}</div><div style="font-size:11px;color:#c9c9cb;padding-top:2px">${esc(meta)}</div></td><td align="right" style="padding:12px 14px;border-top:3px solid ${C.or}"><span style="display:inline-block;background:${color};color:#ffffff;font-size:10px;font-weight:800;letter-spacing:.12em;padding:4px 8px;text-transform:uppercase">${esc(status)}</span></td></tr></table></td></tr>`;

// ------------------------------------------------------------ the report
export interface BuildIn { lang: Lang; date: string; kind: "DAILY" | "SNAPSHOT"; at: Date; timezone: string; db: Db; projects: GenProject[]; prev: { metrics: Metrics; date: string } | null;
  /** contractor emails from the project inbox; the app's address for "Open the app"; the mailbox it is sent from */
  emails?: Email[]; appUrl?: string | null; sender?: string }
export interface Built { title: string; html: string; text: string; metrics: Metrics; active: number }

export function buildReport(o: BuildIn): Built {
  const { lang: l, db } = o;
  const T = (en: string, ar: string) => tx(l, en, ar);
  const metrics: Metrics = { projects: {} };
  const body: string[] = [], text: string[] = [], summary: string[][] = [], marks: (string | null)[] = [];
  const know: { tag: string; color: string; html: string }[] = [], headline: string[] = [];
  const isCrit = (a: { critical: boolean; totalFloat: number }) => a.critical || a.totalFloat <= 0;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: o.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(o.at);

  // ---------------- Kinan Heights (live data)
  const d0 = db.data.meta.dataDate, s = P.scheduleSummary(db), cp = liveCritical(db);
  const comp = cp.completion;
  const liveStatus = (comp && comp.slip > 0) || cp.late.length ? [T("Behind", "متأخر"), C.red] : cp.atRisk.length || s.spi < 0.97 ? [T("Watch", "متابعة"), C.amber] : [T("On track", "على المسار"), C.green];
  metrics.projects.site = { name: db.project.name, progress: s.progressPercent, planned: s.plannedPercent, critLate: cp.late.length, critRisk: cp.atRisk.length, completion: comp?.forecast ?? "", slip: comp?.slip ?? 0 };
  summary.push([`<b>${esc(db.project.name)}</b>`, `${s.progressPercent}% <span style="color:${C.soft}">/ ${s.plannedPercent}%</span>`, String(s.spi.toFixed(2)), `${comp ? dt(comp.forecast, l) : "—"}<br><span style="color:${comp && comp.slip > 0 ? C.red : C.soft}">${comp ? days(comp.slip, l) : ""}</span>`, `<b style="color:${cp.late.length ? C.red : C.ink}">${cp.late.length}</b> / ${cp.atRisk.length}`, pill(liveStatus[0], liveStatus[1])]);
  marks.push(liveStatus[1]);

  body.push(projectBand(db.project.name, `${db.project.client} · ${db.project.code} · ${T("data date", "تاريخ البيانات")} ${dt(d0, l)}`, liveStatus[0], liveStatus[1]));
  body.push(kpis([
    { label: T("Complete", "الإنجاز"), value: `${s.progressPercent}%`, sub: T(`plan ${s.plannedPercent}%`, `المخطط ${s.plannedPercent}%`), bad: s.progressPercent < s.plannedPercent - 2 },
    { label: "SPI", value: s.spi.toFixed(2), sub: s.spi < 0.95 ? T("behind schedule", "متأخر عن الجدول") : T("on schedule", "حسب الجدول"), bad: s.spi < 0.95 },
    { label: T("Completion", "الإنجاز النهائي"), value: comp ? dt(comp.forecast, l) : "—", sub: comp ? `${T("baseline", "الأساس")} ${dt(comp.baseline, l)}` : "", bad: !!comp && comp.slip > 0 },
    { label: T("Critical late now", "حرجة متأخرة الآن"), value: String(cp.late.length), sub: T(`${cp.atRisk.length} at risk · ${cp.slipped.length} later`, `${cp.atRisk.length} معرّضة · ${cp.slipped.length} لاحقة`), bad: cp.late.length > 0 },
  ]));
  const since = sinceLines(l, o.prev, "site", metrics.projects.site);
  if (since.length) { body.push(h2(T("Since the last brief", "منذ الموجز السابق"), o.prev ? dt(o.prev.date, l) : undefined)); body.push(bullets(since)); }

  // ---- what happened since the last brief (default: the last 24 hours) and what comes in the next 48 hours
  const from = o.prev && o.prev.date < d0 ? o.prev.date : addDays(d0, -1);
  const inWin = (x: string) => x.slice(0, 10) > from && x.slice(0, 10) <= d0;
  const fromAt = new Date(Date.parse(from + "T00:00:00Z") + DAY).toISOString(), sinceAt = o.prev && o.prev.date < d0 ? fromAt : new Date(o.at.getTime() - DAY).toISOString();
  const sched = db.data.schedule;
  const done = sched.filter((a) => !a.milestone && inWin(a.finish)), started = sched.filter((a) => !a.milestone && inWin(a.start) && a.finish > d0);
  const msDone = sched.filter((a) => a.milestone && inWin(a.finish));
  const slabs = done.filter((a) => /-STR-L\d+$/.test(a.id));
  const delAll = db.data.procurement.deliveries;
  const received = delAll.filter((x) => inWin(x.date) && (x.status === "Received" || x.status === "Rejected"));
  const mails = (o.emails ?? []).filter((e) => e.received >= sinceAt && e.received <= o.at.toISOString()).sort((a, b) => b.received.localeCompare(a.received));
  const filed = db.docs.filter((x) => x.uploadedAt && x.uploadedAt >= sinceAt);
  const incid = db.data.safety.incidents.filter((x) => inWin(x.date));
  const notesNew = db.notes.filter((n) => n.createdAt >= sinceAt && !n.text.startsWith("Progress: "));
  const siteUpd = (db.data.updates ?? []).filter((u) => u.at >= sinceAt);
  // linear % complete on a date, as the programme is read (the same rule as the data)
  const pctAt = (a: { start: string; finish: string }, d: string) => (a.finish <= d ? 100 : a.start > d ? 0 : Math.min(99, Math.max(1, Math.round(((Date.parse(d) - Date.parse(a.start)) / Math.max(DAY, Date.parse(a.finish) - Date.parse(a.start))) * 100))));
  const progressed = sched.filter((a) => !a.milestone && a.start <= from && a.finish > d0).map((a) => ({ a, p0: pctAt(a, from), p1: pctAt(a, d0) })).filter((x) => x.p1 > x.p0)
    .sort((x, y) => Number(isCrit(y.a)) - Number(isCrit(x.a)) || (y.p1 - y.p0) - (x.p1 - x.p0));
  const act = (a: { name: string; id: string; finish: string; baselineFinish: string }) => `<b>${esc(a.name)}</b> <span style="color:${C.soft}">${esc(a.id)}</span>${slipOf(a as never) > 0 ? ` <span style="color:${C.red};font-weight:700">${days(slipOf(a as never), l)}</span>` : ""}`;
  const mailLine = (e: Email) => `<b>${esc(e.subject)}</b> — ${esc(e.fromName)}, ${esc(e.company)} <span style="color:${C.soft}">${esc(e.received.slice(11, 16))}</span><br><span style="color:${C.soft}">${esc(e.text.replace(/\s+/g, " ").slice(0, 170))}…</span>`;
  const winLabel = o.prev && o.prev.date < addDays(d0, -1) ? T(`Since the last brief (${dt(addDays(from, 1), l)} – ${dt(d0, l)})`, `منذ الموجز السابق (${dt(addDays(from, 1), l)} – ${dt(d0, l)})`) : T("In the last 24 hours", "خلال آخر 24 ساعة");
  body.push(h2(winLabel, T(`${done.length} activities finished · ${progressed.length} progressed · ${started.length} started · ${received.length} deliveries · ${mails.length} contractor emails · ${notesNew.length} site notes`, `${done.length} نشاطاً انتهى · ${progressed.length} تقدّم · ${started.length} بدأ · ${received.length} توريدات · ${mails.length} رسائل من المقاولين · ${notesNew.length} ملاحظات`)));
  const happened = dayBlock([
    { label: T("Milestones", "المعالم"), lines: msDone.map((a) => `◆ ${act(a)}`) },
    { label: T("Finished", "انتهى"), lines: [...slabs, ...done.filter((a) => !slabs.includes(a))].slice(0, 10).map(act).concat(done.length > 10 ? [`<span style="color:${C.soft}">+${done.length - 10} ${T("more", "أخرى")}</span>`] : []) },
    { label: T("Progressed", "تقدّم"), lines: progressed.slice(0, 8).map((x) => `${isCrit(x.a) ? critTag(l) : ""}${esc(x.a.name)} <span style="color:${C.soft}">${x.p0}% → </span><b>${x.p1}%</b>`).concat(progressed.length > 8 ? [`<span style="color:${C.soft}">+${progressed.length - 8} ${T("more activities moved on", "أنشطة أخرى تقدمت")}</span>`] : []) },
    { label: T("Started", "بدأ"), lines: started.slice(0, 8).map((a) => `${act(a)} <span style="color:${C.soft}">→ ${dt(a.finish, l)}</span>`).concat(started.length > 8 ? [`<span style="color:${C.soft}">+${started.length - 8} ${T("more", "أخرى")}</span>`] : []) },
    { label: T("Deliveries", "التوريدات"), lines: received.slice(0, 8).map((x) => `${x.status === "Rejected" ? pill(T("rejected", "مرفوض"), C.red) + " " : ""}${esc(x.items)} <span style="color:${C.soft}">${esc(x.po)} · ${esc(x.gate)}${x.grn ? ` · ${esc(x.grn)}` : ""}</span>`) },
    { label: T("Contractor emails", "رسائل المقاولين"), lines: mails.slice(0, 6).map(mailLine) },
    { label: T("Reported from site", "تحديثات من الموقع"), lines: siteUpd.slice(0, 8).map((u) => { const a = db.data.schedule.find((x) => x.id === u.activityId); return `${pill(u.state === "completed" ? T("done", "منجز") : u.state === "pending" ? T("pending", "معلّق") : `${a?.percent ?? u.percent ?? ""}%`, u.state === "pending" ? C.red : u.state === "completed" ? C.green : C.amber)} ${esc(a?.name ?? u.activityId)} <span style="color:${C.soft}">— ${esc(u.by)}${u.channel === "whatsapp" ? " · WhatsApp" : ""}${u.evidence.length ? ` · ${u.evidence.length} ${T("photo(s)", "صورة")}` : ""}</span>`; }) },
    { label: T("Site notes", "ملاحظات الموقع"), lines: notesNew.slice(0, 6).map((n) => `${n.kind !== "note" ? pill(n.kind === "issue" ? T("issue", "مسألة") : T("instruction", "تعليمات"), n.kind === "issue" ? C.red : C.amber) + " " : ""}${esc(n.text.slice(0, 200))} <span style="color:${C.soft}">— ${esc(n.author)}</span>`) },
    { label: T("Documents filed", "مستندات مُودعة"), lines: filed.slice(0, 6).map((x) => `${esc(x.title)} <span style="color:${C.soft}">${esc(x.category)} · ${esc(x.uploadedBy ?? "")}</span>`) },
    { label: T("Incidents", "الحوادث"), lines: incid.map((x) => `<b>${esc(x.type)}</b> — ${esc(x.description)}`) },
  ]);
  body.push(happened || para(T("Nothing was recorded on site in this period.", "لم يُسجل شيء في الموقع خلال هذه الفترة.")));

  const to2 = addDays(d0, 2), soon = (x: string) => x > d0 && x <= to2;
  const startNext = sched.filter((a) => !a.milestone && soon(a.start)), finishNext = sched.filter((a) => !a.milestone && soon(a.finish) && a.start <= d0);
  const delNext = delAll.filter((x) => soon(x.date) || (x.date === d0 && x.status !== "Received" && x.status !== "Rejected"));
  const permExp = db.data.safety.permits.filter((x) => x.status === "Active" && x.validTo.slice(0, 10) >= d0 && x.validTo.slice(0, 10) <= to2);
  body.push(h2(T("Next 48 hours", "الثماني والأربعون ساعة القادمة"), `${dt(addDays(d0, 1), l)} – ${dt(to2, l)}`));
  body.push(dayBlock([
    { label: T("Due to finish", "ينتهي"), lines: finishNext.slice(0, 8).map((a) => `${isCrit(a) ? critTag(l) : ""}${esc(a.name)} <span style="color:${C.soft}">${dt(a.finish, l)}</span>`) },
    { label: T("Starting", "يبدأ"), lines: startNext.slice(0, 8).map((a) => `${isCrit(a) ? critTag(l) : ""}${esc(a.name)} <span style="color:${C.soft}">${dt(a.start, l)}</span>`) },
    { label: T("Deliveries booked", "توريدات محجوزة"), lines: delNext.slice(0, 8).map((x) => `${x.status === "Delayed" ? pill(T("delayed", "متأخر"), C.red) + " " : ""}${esc(x.items)} <span style="color:${C.soft}">${dt(x.date, l)} ${esc(x.slot)} · ${esc(x.gate)}</span>`) },
    { label: T("Permits expiring", "تصاريح تنتهي"), lines: permExp.map((x) => `${esc(x.type)} — ${esc(x.description)} <span style="color:${C.soft}">${dt(x.validTo, l)}</span>`) },
  ]) || para(T("Nothing booked for the next two days.", "لا شيء محجوز لليومين القادمين.")));

  // ---- "To know today" (shown at the top of the brief)
  const urgentMail = mails.filter((e) => e.importance === "high" || /delay|postpon|approv|urgent|request|reject|stop|hold/i.test(e.subject + " " + e.text.slice(0, 400)));
  know.push(
    ...cp.late.map((a) => ({ tag: T("Critical late", "حرج متأخر"), color: C.red, html: `<b>${esc(a.name)}</b> — ${T("forecast", "متوقع")} ${dt(a.finish, l)} <b style="color:${C.red}">${days(slipOf(a), l)}</b><br><span style="color:${C.soft}">${esc(a.contractor)} · ${T("completion moves with it", "يتأخر الإنجاز معه")}</span>` })),
    ...delAll.filter((x) => x.status === "Delayed" && x.date >= d0 && x.date <= addDays(d0, 7)).slice(0, 4).map((x) => ({ tag: T("Delayed load", "توريد متأخر"), color: C.red, html: `<b>${esc(x.items)}</b> — ${T("booked", "محجوز")} ${dt(x.date, l)}, ${esc(x.po)}${x.remarks ? `<br><span style="color:${C.soft}">${esc(x.remarks)}</span>` : ""}` })),
    ...urgentMail.slice(0, 4).map((e) => ({ tag: T("Email", "رسالة"), color: C.amber, html: `<b>${esc(e.subject)}</b> — ${esc(e.fromName)}, ${esc(e.company)}<br><span style="color:${C.soft}">${esc(e.text.replace(/\s+/g, " ").slice(0, 160))}…</span>` })),
    ...cp.atRisk.slice(0, 3).map((a) => ({ tag: T("At risk", "معرّض"), color: C.amber, html: `<b>${esc(a.name)}</b> — ${a.percent}% ${T("done, the dates call for", "منجز، والتواريخ تتطلب")} ${expectedPct(a, d0)}%` })),
    ...db.data.safety.incidents.filter((x) => x.status === "Open" && x.date >= addDays(d0, -3)).slice(0, 3).map((x) => ({ tag: T("Incident", "حادث"), color: C.red, html: `<b>${esc(x.type)}</b> — ${esc(x.description)} <span style="color:${C.soft}">${dt(x.date, l)}</span>` })),
    ...cp.next.filter((a) => a.start <= addDays(d0, 2)).slice(0, 3).map((a) => ({ tag: T("Critical start", "بدء حرج"), color: C.or, html: `<b>${esc(a.name)}</b> ${T("starts", "يبدأ")} ${dt(a.start, l)} — ${esc(a.contractor)}` })),
  );
  headline.push(
    slabs.length ? T(`${slabs.length} slab${slabs.length > 1 ? "s" : ""} poured (${slabs.map((a) => a.name.split(" — ")[0]).join(", ")})`, `صُبّت ${slabs.length} بلاطات (${slabs.map((a) => a.name.split(" — ")[0]).join("، ")})`)
      : done.length ? T(`${done.length} activit${done.length > 1 ? "ies" : "y"} finished`, `انتهى ${done.length} نشاطاً`) : T(`work moved on in ${progressed.length} activities`, `تقدّم العمل في ${progressed.length} نشاطاً`),
    cp.late.length ? T(`${cp.late.length} critical activit${cp.late.length > 1 ? "ies" : "y"} late, completion ${days(comp?.slip ?? 0, l)}`, `${cp.late.length} أنشطة حرجة متأخرة، الإنجاز ${days(comp?.slip ?? 0, l)}`) : T("no critical activity late", "لا نشاط حرجاً متأخراً"),
    T(`${delNext.length} deliveries in the next 48 hours${delNext.some((x) => x.status === "Delayed") ? `, ${delNext.filter((x) => x.status === "Delayed").length} delayed` : ""}`, `${delNext.length} توريدات خلال 48 ساعة`),
    T(`${mails.length} contractor email${mails.length === 1 ? "" : "s"}`, `${mails.length} رسائل من المقاولين`),
  );
  text.push(`${winLabel}: ${done.length} finished, ${started.length} started, ${received.length} deliveries, ${mails.length} emails`, ...slabs.map((a) => `  · ${a.name}`), "");

  body.push(h2(T("Critical path", "المسار الحرج"), T(`${cp.remaining.length} critical activities left — zero float: a day lost on any of them moves completion`, `${cp.remaining.length} نشاطاً حرجاً متبقياً — بلا فائض: أي يوم تأخير فيها يؤخر الإنجاز النهائي`)));
  const critRows = [...cp.late, ...cp.atRisk, ...cp.inProgress.filter((a) => critState(a, d0) === "ok")].slice(0, 12);
  if (critRows.length) {
    body.push(table([T("Activity", "النشاط"), T("Forecast finish", "الإنهاء المتوقع"), T("Progress", "التقدم"), T("Variance", "الفرق")],
      critRows.map((a) => {
        const st = critState(a, d0);
        return [`${critTag(l)}<b>${esc(a.name)}</b><br><span style="color:${C.soft};font-size:11px">${esc(a.id)} · ${esc(a.contractor)}${st === "risk" ? ` · <span style="color:${C.amber}">${T("at risk", "معرّض للتأخر")}</span>` : ""}</span>`,
          dt(a.finish, l), a.status === "in_progress" ? `${a.percent}% <span style="color:${C.soft}">/ ${expectedPct(a, d0)}%</span>` : T("not started", "لم يبدأ"),
          `<span style="color:${slipOf(a) > 0 ? C.red : C.green};font-weight:700">${days(slipOf(a), l)}</span>`];
      }), ["l", "r", "r", "r"], l, critRows.map((a) => { const st = critState(a, d0); return st === "late" ? C.red : st === "risk" ? C.amber : C.or; })));
  } else body.push(para(T("No critical activity is late, at risk or in progress.", "لا يوجد نشاط حرج متأخر أو معرّض للتأخر أو قيد التنفيذ.")));
  if (cp.next.length) body.push(para(`<b>${T("Critical starts in the next 14 days:", "أنشطة حرجة تبدأ خلال 14 يوماً:")}</b> ${cp.next.slice(0, 6).map((a) => `${esc(a.name)} (${dt(a.start, l)})`).join(" · ")}`));
  if (cp.slipped.length) body.push(para(`<b>${T(`Delay carried forward — ${cp.slipped.length} later critical activities already forecast late:`, `تأخير منقول — ${cp.slipped.length} أنشطة حرجة لاحقة متوقع تأخرها:`)}</b> ${cp.slipped.slice(0, 4).map((a) => `${esc(a.name)} <span style="color:${C.red};font-weight:700">${days(slipOf(a), l)}</span>`).join(" · ")}`));

  const ms = s.upcomingMilestones.filter((m) => m.forecast <= addDays(d0, 60)).slice(0, 5);
  if (ms.length) {
    body.push(h2(T("Milestones — next 60 days", "المعالم — الستون يوماً القادمة")));
    body.push(table([T("Milestone", "المعلم"), T("Forecast", "المتوقع"), T("Baseline", "الأساس"), T("Variance", "الفرق")],
      ms.map((m) => [esc(m.name), dt(m.forecast, l), dt(m.baseline, l), `<span style="color:${m.varianceDays > 0 ? C.red : C.green};font-weight:700">${days(m.varianceDays, l)}</span>`]), ["l", "r", "r", "r"], l));
  }

  const pk = P.packagesQuery(db, { atRisk: true }).packages.slice(0, 5);
  const dl = (P.deliveriesQuery(db, { from: d0, to: addDays(d0, 7) }).deliveries ?? []);
  const delayed = dl.filter((d) => d.status === "Delayed");
  body.push(h2(T("Procurement", "المشتريات"), T(`${pk.length} packages behind their need date · ${dl.length} deliveries in the next 7 days, ${delayed.length} delayed`, `${pk.length} حزم متأخرة عن موعد الحاجة · ${dl.length} توريدات خلال 7 أيام، ${delayed.length} متأخرة`)));
  const procItems = [
    ...pk.map((p) => `<b>${esc(p.id)} ${esc(p.name)}</b> — ${T("needed", "مطلوب")} ${dt(p.requiredOnSite, l)}, ${T("forecast", "متوقع")} ${dt(p.forecastOnSite, l)} <span style="color:${C.red};font-weight:700">(${p.floatDays} ${T("d", "يوم")})</span>`),
    ...delayed.slice(0, 4).map((d) => `${T("Delayed delivery", "توريد متأخر")}: ${esc(d.items)} — ${esc(d.supplier)}, ${dt(d.date, l)}${d.remarks ? ` · ${esc(d.remarks)}` : ""}`),
  ];
  body.push(procItems.length ? bullets(procItems) : para(T("Nothing at risk.", "لا شيء معرّض للخطر.")));

  const h = P.hseOverview(db), st = h.stats as Record<string, number | string>;
  body.push(h2(T("Safety", "السلامة")));
  body.push(kpis([
    { label: T("LTI-free days", "أيام بلا إصابات مضيعة"), value: String(st.ltiFreeDays ?? "—") },
    { label: "TRIR", value: String(st.trir ?? "—"), bad: Number(st.trir) >= 1 },
    { label: T("Workforce", "القوى العاملة"), value: String(st.workforceToday ?? "—") },
    { label: T("Open incidents", "حوادث مفتوحة"), value: String(h.openIncidents.length), bad: h.openIncidents.length > 0 },
  ]));
  if (h.openIncidents.length) body.push(bullets(h.openIncidents.slice(0, 4).map((i) => `<b>${esc(i.type)}</b> — ${esc(i.description)} (${dt(i.date, l)})`)));

  text.push(`${db.project.name} — ${liveStatus[0]}`, `  ${T("Complete", "الإنجاز")} ${s.progressPercent}% (${T("plan", "المخطط")} ${s.plannedPercent}%), SPI ${s.spi.toFixed(2)}`,
    comp ? `  ${T("Completion", "الإنجاز النهائي")} ${comp.forecast} (${T("baseline", "الأساس")} ${comp.baseline}, ${days(comp.slip, l)})` : "",
    `  ${T("Critical path", "المسار الحرج")}: ${cp.late.length} ${T("late", "متأخرة")}, ${cp.atRisk.length} ${T("at risk", "معرّضة")}, ${cp.remaining.length} ${T("left", "متبقية")}`,
    ...cp.late.slice(0, 6).map((a) => `   ! ${a.id} ${a.name} — ${days(slipOf(a), l)}`), "");

  // ---------------- generated projects (from uploaded documents)
  const active = o.projects.filter((p) => p.result?.spec?.schedule && p.result.spec.schedule.finish >= o.date);
  for (const p of active) {
    const spec = p.result.spec, dd = spec.schedule.dataDate || o.date;
    const pc = specCritical(spec), planned = specPlannedPct(spec, dd), earned = specEarnedPct(spec);
    const logic = pc.source === "programme";
    const to14 = addDays(dd, 14);
    const open = pc.path.filter((x) => specState(x.a, dd) !== "done");
    const now = open.filter((x) => x.a.start <= dd && x.a.finish >= dd);
    const startSoon = open.filter((x) => x.a.start > dd && x.a.start <= to14);
    const finishSoon = open.filter((x) => x.a.finish >= dd && x.a.finish <= to14);
    const late = open.filter((x) => specState(x.a, dd) === "late"), risk = open.filter((x) => specState(x.a, dd) === "risk");
    const carried = open.filter((x) => specState(x.a, dd) === "slipped");
    const crit = pc.buildings.filter((b) => b.critical).map((b) => b.name);
    const bName = (id: string) => spec.buildings.find((b) => b.id === id)?.name ?? id;
    const label = (a: { building: string; name?: string; phase: string }) => { const b = bName(a.building), n = a.name ?? a.phase; return n.toLowerCase().startsWith(b.toLowerCase()) ? n : `${b} — ${n}`; };
    const tracked = earned !== null;
    const st: [string, string] = !tracked ? [T("Planned", "مخطط"), C.taupe]
      : pc.slip > 0 || late.length ? [T("Behind", "متأخر"), C.red] : risk.length || (earned ?? 0) < planned - 3 ? [T("Watch", "متابعة"), C.amber] : [T("On track", "على المسار"), C.green];
    const prog = earned ?? planned;
    metrics.projects[p.id] = { name: spec.name, progress: prog, planned, critLate: late.length, critRisk: risk.length, completion: pc.finish, slip: pc.slip };
    summary.push([`<b>${esc(spec.name)}</b><br><span style="color:${C.soft};font-size:11px">${T("from documents", "من المستندات")}</span>`,
      tracked ? `${earned}% <span style="color:${C.soft}">/ ${planned}%</span>` : `<span style="color:${C.soft}">${T("plan", "مخطط")}</span> ${planned}%`,
      tracked && planned ? (earned! / planned).toFixed(2) : "—",
      `${dt(pc.finish, l)}${pc.baselineFinish ? `<br><span style="color:${pc.slip > 0 ? C.red : C.soft}">${days(pc.slip, l)}</span>` : ""}`,
      tracked ? `<b style="color:${late.length ? C.red : C.ink}">${late.length}</b> / ${risk.length}` : `${now.length} ${T("live", "جارية")}`, pill(st[0], st[1])]);
    marks.push(st[1]);
    body.push(projectBand(spec.name, `${spec.location ?? ""}${spec.client ? ` · ${spec.client}` : ""} · ${spec.buildings.length} ${T("buildings", "مبانٍ")} · ${T("data date", "تاريخ البيانات")} ${dt(dd, l)}`, st[0], st[1]));
    body.push(kpis(tracked ? [
      { label: T("Complete", "الإنجاز"), value: `${earned}%`, sub: T(`plan ${planned}%`, `المخطط ${planned}%`), bad: earned! < planned - 2 },
      { label: "SPI", value: planned ? (earned! / planned).toFixed(2) : "—", sub: planned && earned! / planned < 0.95 ? T("behind schedule", "متأخر عن الجدول") : T("on schedule", "حسب الجدول"), bad: !!planned && earned! / planned < 0.95 },
      { label: T("Completion", "الإنجاز النهائي"), value: dt(pc.finish, l), sub: pc.baselineFinish ? `${T("baseline", "الأساس")} ${dt(pc.baselineFinish, l)}` : "", bad: pc.slip > 0 },
      { label: T("Critical late now", "حرجة متأخرة الآن"), value: String(late.length), sub: T(`${risk.length} at risk · ${carried.length} later`, `${risk.length} معرّضة · ${carried.length} لاحقة`), bad: late.length > 0 },
    ] : [
      { label: T("Planned complete", "الإنجاز المخطط"), value: `${planned}%`, sub: T("at the data date", "في تاريخ البيانات") },
      { label: T("Completion", "الإنجاز النهائي"), value: dt(pc.finish, l), sub: T(`started ${dt(spec.schedule.start, l)}`, `البدء ${dt(spec.schedule.start, l)}`) },
      { label: T("Critical now", "حرجة الآن"), value: String(now.length), sub: T(`${startSoon.length} start in 14 days`, `${startSoon.length} تبدأ خلال 14 يوماً`) },
    ]));
    const since = sinceLines(l, o.prev, p.id, metrics.projects[p.id]);
    if (tracked && since.length) { body.push(h2(T("Since the last brief", "منذ الموجز السابق"), o.prev ? dt(o.prev.date, l) : undefined)); body.push(bullets(since)); }
    body.push(h2(T("Critical path", "المسار الحرج"), logic
      ? T(`${open.length} critical activities left — total float and critical flags from the programme; ${crit.join(", ") || "—"} drive${crit.length === 1 ? "s" : ""} completion.`, `${open.length} نشاطاً حرجاً متبقياً — الفائض الكلي والأنشطة الحرجة من البرنامج؛ ${crit.join("، ") || "—"} يحدد موعد الإنجاز.`)
      : T(`${crit.join(", ") || "—"} finish${crit.length === 1 ? "es" : ""} last and drive${crit.length === 1 ? "s" : ""} completion. Taken from the programme dates (the documents have no logic links).`, `${crit.join("، ") || "—"} ينتهي أخيراً ويحدد موعد الإنجاز. مأخوذ من تواريخ البرنامج (لا تتضمن المستندات علاقات منطقية).`)));
    const rows = [...late, ...risk, ...now.filter((x) => !late.includes(x) && !risk.includes(x)), ...startSoon.filter((x) => !now.includes(x))].slice(0, 8);
    const stColor = (x: typeof rows[number]) => { const k = specState(x.a, dd); return k === "late" ? C.red : k === "risk" ? C.amber : C.or; };
    if (rows.length && tracked) body.push(table([T("Activity", "النشاط"), T("Forecast finish", "الإنهاء المتوقع"), T("Progress", "التقدم"), T("Variance", "الفرق")],
      rows.map((x) => [`${critTag(l)}<b>${esc(label(x.a))}</b><br><span style="color:${C.soft};font-size:11px">${esc(x.a.id ?? "")}${x.float ? ` · ${T("float", "الفائض")} ${x.float} ${T("d", "يوم")}` : ""}${specState(x.a, dd) === "risk" ? ` · <span style="color:${C.amber}">${T("at risk", "معرّض للتأخر")}</span>` : ""}</span>`,
        dt(x.a.finish, l), x.a.start > dd ? T(`starts ${dt(x.a.start, l)}`, `يبدأ ${dt(x.a.start, l)}`) : `${x.a.progress ?? 0}%`,
        `<span style="color:${specSlip(x.a) > 0 ? C.red : C.green};font-weight:700">${days(specSlip(x.a), l)}</span>`]), ["l", "r", "r", "r"], l, rows.map(stColor)));
    else if (rows.length) body.push(table([T("Activity", "النشاط"), T("Start", "البدء"), T("Finish", "الإنهاء")],
      rows.map((x) => [`${critTag(l)}<b>${esc(label(x.a))}</b>${x.a.start > dd ? ` <span style="color:${C.soft}">(${T("starts soon", "يبدأ قريباً")})</span>` : ""}`, dt(x.a.start, l), dt(x.a.finish, l)]), ["l", "r", "r"], l, rows.map(() => C.or)));
    else body.push(para(T("No critical activity is running or starting in the next 14 days.", "لا يوجد نشاط حرج جارٍ أو يبدأ خلال 14 يوماً.")));
    if (finishSoon.length) body.push(para(`<b>${T("Critical finishes in the next 14 days:", "أنشطة حرجة تنتهي خلال 14 يوماً:")}</b> ${finishSoon.map((x) => `${esc(label(x.a))} (${dt(x.a.finish, l)})`).join(" · ")}`));
    if (carried.length) body.push(para(`<b>${T(`Delay carried forward — ${carried.length} later critical activities already forecast late:`, `تأخير منقول — ${carried.length} أنشطة حرجة لاحقة متوقع تأخرها:`)}</b> ${carried.slice(0, 4).map((x) => `${esc(label(x.a))} <span style="color:${C.red};font-weight:700">${days(specSlip(x.a), l)}</span>`).join(" · ")}`));
    const slipped = spec.schedule.activities.filter((a) => !pc.path.some((x) => x.a === a) && specState(a, dd) === "late" && specSlip(a) >= 3).sort((x, y) => specSlip(y) - specSlip(x)).slice(0, 3);
    if (slipped.length) body.push(para(`${T("Late but with float (completion not affected yet):", "متأخرة لكن لديها فائض (لا تؤثر على الإنجاز بعد):")} ${slipped.map((a) => `${esc(label(a))} <span style="color:${C.amber};font-weight:700">${days(specSlip(a), l)}</span>${(() => { const f = pc.items.find((x) => x.a === a)?.float; return f !== undefined ? ` (${T("float", "الفائض")} ${f} ${T("d", "يوم")})` : ""; })()}`).join(" · ")}`));
    const tight = pc.buildings.filter((b) => !b.critical && b.finish && b.float <= 60);
    if (tight.length) body.push(para(`${T("Little float left:", "فائض قليل:")} ${tight.map((b) => `${esc(b.name)} (${b.float} ${T("d", "يوم")})`).join(" · ")}`));
    text.push(`${spec.name} — ${st[0]} · ${tracked ? `${earned}% (${T("plan", "المخطط")} ${planned}%)` : `${T("planned", "مخطط")} ${planned}%`}, ${T("completion", "الإنجاز")} ${pc.finish}${pc.baselineFinish ? ` (${T("baseline", "الأساس")} ${pc.baselineFinish}, ${days(pc.slip, l)})` : ""}`,
      `  ${T("Critical path", "المسار الحرج")}: ${crit.join(", ")} · ${late.length} ${T("late", "متأخرة")}, ${risk.length} ${T("at risk", "معرّضة")}, ${now.length} ${T("running", "جارية")}`,
      ...late.slice(0, 4).map((x) => `   ! ${x.a.id ?? ""} ${label(x.a)} — ${days(specSlip(x.a), l)}`), "");
  }

  // ---------------- assemble
  const nActive = 1 + active.length;
  const heading = o.kind === "SNAPSHOT" ? T("Live snapshot", "لقطة فورية") : T("Daily site brief", "الموجز اليومي للمواقع");
  const title = `${heading} — ${dt(o.date, l)}${o.kind === "SNAPSHOT" ? ` ${time}` : ""}`;
  const portfolio = table([T("Project", "المشروع"), T("Progress / plan", "التقدم / المخطط"), "SPI", T("Completion", "الإنجاز"), T("Critical late / risk", "حرجة متأخرة / معرّضة"), T("Status", "الحالة")],
    summary, ["l", "r", "r", "r", "r", "r"], l, marks);
  const dir = l === "ar" ? "rtl" : "ltr", font = l === "ar" ? FONT_AR : FONT, end = l === "ar" ? "left" : "right";
  const weekday = new Date(o.date + "T12:00:00Z").toLocaleDateString(l === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", timeZone: "UTC" });
  const html = `<!doctype html><html lang="${l}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" dir="${dir}" style="width:100%;max-width:640px;background:#ffffff;font-family:${font};color:${C.ink};border-collapse:collapse">
<tr><td style="background:${C.ink};padding:18px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:12px;font-weight:800;letter-spacing:.32em;color:#ffffff">KINAN <span style="color:${C.or}">&#8250;</span></td>
<td align="${end}" style="font-size:9px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:#cfcfcf">${T("AI onsite agent · site &amp; projects", "الوكيل الميداني · المواقع والمشاريع")}</td></tr></table></td></tr>
<tr><td style="background:${C.or};padding:30px 28px;color:#ffffff">
<div style="font-size:11px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;opacity:.92">${esc(heading)}</div>
<div style="font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding-top:6px;line-height:1.2">${esc(weekday)} ${dt(o.date, l)}${o.kind === "SNAPSHOT" ? ` · ${time}` : ""}</div>
<div style="font-size:12px;padding-top:6px;opacity:.92">${T(`${nActive} active project${nActive > 1 ? "s" : ""} · ${o.kind === "SNAPSHOT" ? "snapshot taken" : "prepared"} ${time} (${o.timezone}) · data to ${dt(db.data.meta.dataDate, l)}`, `${nActive} مشاريع نشطة · ${o.kind === "SNAPSHOT" ? "التُقطت" : "أُعد"} ${time} (${o.timezone}) · البيانات حتى ${dt(db.data.meta.dataDate, l)}`)}</div></td></tr>
${headline.length ? `<tr><td style="padding:22px 28px 0;font-size:15px;line-height:1.55;color:${C.ink}"><b>${T("Today in one line:", "اليوم في سطر:")}</b> ${headline.map(esc).join(" · ")}.</td></tr>` : ""}
${knowBox(T("To know today", "للعلم اليوم"), know.slice(0, 12), T("Nothing late on the critical path, no delayed load, no email asking for a decision and no open incident.", "لا تأخير على المسار الحرج ولا توريد متأخر ولا رسالة تطلب قراراً ولا حادث مفتوح."))}
${h2(T("All active projects", "جميع المشاريع النشطة"))}
${portfolio}
${body.join("\n")}
${o.appUrl ? `<tr><td style="padding:26px 28px 6px"><a href="${esc(o.appUrl)}" style="display:inline-block;background:${C.or};color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;padding:12px 20px">${T("Open the Onsite Agent", "افتح الوكيل الميداني")}</a></td></tr>` : ""}
<tr><td style="padding:22px 28px 22px"><div style="border-top:1px solid ${C.line};padding-top:12px;font-size:11px;color:${C.soft};line-height:1.5">${T("Prepared by the Kinan Onsite Agent from the project programme, procurement, safety, site notes and the contractors' emails. Critical = zero float: a delay to it delays completion.", "أعده الوكيل الميداني لكنان من برنامج المشروع والمشتريات والسلامة وملاحظات الموقع ورسائل المقاولين. الحرج = بلا فائض: أي تأخير فيه يؤخر الإنجاز.")}</div></td></tr>
<tr><td style="background:${C.ink};padding:16px 28px;color:#bbbbbb;font-size:11px;line-height:1.5">${T(`This brief takes no action: nothing changes in the programme, orders or permits until a person does it. Sent by the Kinan Onsite Agent${o.sender ? ` from ${esc(o.sender)}` : ""}.`, `لا يتخذ هذا الموجز أي إجراء: لا يتغير شيء في البرنامج أو الطلبات أو التصاريح ما لم يقم به شخص. أرسله الوكيل الميداني لكنان${o.sender ? ` من ${esc(o.sender)}` : ""}.`)}
<div style="padding-top:8px"><span style="color:${C.or};font-weight:700;letter-spacing:.3em">${KINAN.tagline}</span> &nbsp; <span style="color:#ffffff">www.kinan.com.sa</span></div></td></tr>
</table></td></tr></table></body></html>`;
  return { title, html, text: [title, "", ...text.filter((x) => x !== undefined)].join("\n"), metrics, active: nActive };
}

function sinceLines(l: Lang, prev: { metrics: Metrics; date: string } | null, id: string, m: ProjMetrics) {
  const p = prev?.metrics?.projects?.[id];
  if (!p) return [];
  const T = (en: string, ar: string) => tx(l, en, ar), out: string[] = [];
  const dp = Math.round((m.progress - p.progress) * 10) / 10;
  if (dp) out.push(T(`Progress ${dp > 0 ? "+" : ""}${dp} points (${p.progress}% → ${m.progress}%).`, `التقدم ${dp > 0 ? "+" : ""}${dp} نقطة (${p.progress}% ← ${m.progress}%).`));
  if (m.completion && p.completion && m.completion !== p.completion) out.push(T(`Completion forecast moved from ${dt(p.completion, l)} to <b>${dt(m.completion, l)}</b>.`, `تغيّر موعد الإنجاز المتوقع من ${dt(p.completion, l)} إلى <b>${dt(m.completion, l)}</b>.`));
  if (m.critLate !== p.critLate) out.push(T(`Critical activities late: ${p.critLate} → <b>${m.critLate}</b>.`, `الأنشطة الحرجة المتأخرة: ${p.critLate} ← <b>${m.critLate}</b>.`));
  if (m.critRisk !== p.critRisk) out.push(T(`Critical activities at risk: ${p.critRisk} → ${m.critRisk}.`, `الأنشطة الحرجة المعرّضة للتأخر: ${p.critRisk} ← ${m.critRisk}.`));
  if (!out.length) out.push(T("No change in progress, completion forecast or the critical path.", "لا تغيير في التقدم أو موعد الإنجاز أو المسار الحرج."));
  return out;
}
