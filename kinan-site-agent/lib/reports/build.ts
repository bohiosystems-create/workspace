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
import { critState, expectedPct, liveCritical, slipOf, specCritical, specPlannedPct } from "../critical";
import { KINAN } from "../brand";

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
  return `<tr><td style="padding:22px 28px 6px"><div style="font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${C.or}">&#8212;&nbsp;${esc(text)}</div>${sub ? `<div style="font-size:12px;color:${C.soft};margin-top:3px">${esc(sub)}</div>` : ""}</td></tr>`;
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
export interface BuildIn { lang: Lang; date: string; kind: "DAILY" | "SNAPSHOT"; at: Date; timezone: string; db: Db; projects: GenProject[]; prev: { metrics: Metrics; date: string } | null }
export interface Built { title: string; html: string; text: string; metrics: Metrics; active: number }

export function buildReport(o: BuildIn): Built {
  const { lang: l, db } = o;
  const T = (en: string, ar: string) => tx(l, en, ar);
  const metrics: Metrics = { projects: {} };
  const body: string[] = [], text: string[] = [], summary: string[][] = [], marks: (string | null)[] = [];
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
  if (since.length) { body.push(h2(T("Since the last report", "منذ التقرير السابق"), o.prev ? dt(o.prev.date, l) : undefined)); body.push(bullets(since)); }

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

  const dayAgo = new Date(o.at.getTime() - DAY).toISOString();
  const fresh = db.notes.filter((n) => n.createdAt >= dayAgo).slice(0, 8);
  const openIssues = db.notes.filter((n) => n.kind !== "note" && n.status === "open");
  body.push(h2(T("From site — last 24 hours", "من الموقع — آخر 24 ساعة"), T(`${fresh.length} new notes · ${openIssues.length} open issues and instructions`, `${fresh.length} ملاحظات جديدة · ${openIssues.length} مسائل وتعليمات مفتوحة`)));
  body.push(fresh.length ? bullets(fresh.map((n) => `${n.kind !== "note" ? pill(n.kind === "issue" ? T("issue", "مسألة") : T("instruction", "تعليمات"), n.kind === "issue" ? C.red : C.amber) + " " : ""}${esc(n.text.slice(0, 220))} <span style="color:${C.soft}">— ${esc(n.author)}</span>`)) : para(T("No notes logged on site since the last report.", "لم تُسجل ملاحظات في الموقع منذ التقرير السابق.")));

  text.push(`${db.project.name} — ${liveStatus[0]}`, `  ${T("Complete", "الإنجاز")} ${s.progressPercent}% (${T("plan", "المخطط")} ${s.plannedPercent}%), SPI ${s.spi.toFixed(2)}`,
    comp ? `  ${T("Completion", "الإنجاز النهائي")} ${comp.forecast} (${T("baseline", "الأساس")} ${comp.baseline}, ${days(comp.slip, l)})` : "",
    `  ${T("Critical path", "المسار الحرج")}: ${cp.late.length} ${T("late", "متأخرة")}, ${cp.atRisk.length} ${T("at risk", "معرّضة")}, ${cp.remaining.length} ${T("left", "متبقية")}`,
    ...cp.late.slice(0, 6).map((a) => `   ! ${a.id} ${a.name} — ${days(slipOf(a), l)}`), "");

  // ---------------- generated projects (from uploaded documents)
  const active = o.projects.filter((p) => p.result?.spec?.schedule && p.result.spec.schedule.finish >= o.date);
  for (const p of active) {
    const spec = p.result.spec, dd = spec.schedule.dataDate || o.date;
    const pc = specCritical(spec), planned = specPlannedPct(spec, dd);
    const to14 = addDays(dd, 14);
    const now = pc.path.filter((x) => x.a.start <= dd && x.a.finish >= dd);
    const startSoon = pc.path.filter((x) => x.a.start > dd && x.a.start <= to14);
    const finishSoon = pc.path.filter((x) => x.a.finish >= dd && x.a.finish <= to14);
    const crit = pc.buildings.filter((b) => b.critical).map((b) => b.name);
    const bName = (id: string) => spec.buildings.find((b) => b.id === id)?.name ?? id;
    const label = (a: { building: string; name?: string; phase: string }) => { const b = bName(a.building), n = a.name ?? a.phase; return n.toLowerCase().startsWith(b.toLowerCase()) ? n : `${b} — ${n}`; };
    metrics.projects[p.id] = { name: spec.name, progress: planned, planned, critLate: 0, critRisk: 0, completion: pc.finish, slip: 0 };
    summary.push([`<b>${esc(spec.name)}</b><br><span style="color:${C.soft};font-size:11px">${T("from documents", "من المستندات")}</span>`, `<span style="color:${C.soft}">${T("plan", "مخطط")}</span> ${planned}%`, "—", dt(pc.finish, l), `${now.length} ${T("live", "جارية")}`, pill(T("Planned", "مخطط"), C.taupe)]);
    marks.push(C.taupe);
    body.push(projectBand(spec.name, `${spec.location ?? ""}${spec.client ? ` · ${spec.client}` : ""} · ${spec.buildings.length} ${T("buildings", "مبانٍ")} · ${T("data date", "تاريخ البيانات")} ${dt(dd, l)}`, T("Planned", "مخطط"), C.taupe));
    body.push(kpis([
      { label: T("Planned complete", "الإنجاز المخطط"), value: `${planned}%`, sub: T("at the data date", "في تاريخ البيانات") },
      { label: T("Completion", "الإنجاز النهائي"), value: dt(pc.finish, l), sub: T(`started ${dt(spec.schedule.start, l)}`, `البدء ${dt(spec.schedule.start, l)}`) },
      { label: T("Critical now", "حرجة الآن"), value: String(now.length), sub: T(`${startSoon.length} start in 14 days`, `${startSoon.length} تبدأ خلال 14 يوماً`) },
    ]));
    body.push(h2(T("Critical path", "المسار الحرج"), T(`${crit.join(", ") || "—"} finish${crit.length === 1 ? "es" : ""} last and drive${crit.length === 1 ? "s" : ""} completion. Taken from the programme dates (the documents have no logic links).`, `${crit.join("، ") || "—"} ينتهي أخيراً ويحدد موعد الإنجاز. مأخوذ من تواريخ البرنامج (لا تتضمن المستندات علاقات منطقية).`)));
    const rows = [...now, ...startSoon.filter((x) => !now.includes(x))].slice(0, 8);
    if (rows.length) body.push(table([T("Activity", "النشاط"), T("Start", "البدء"), T("Finish", "الإنهاء")],
      rows.map((x) => [`${critTag(l)}<b>${esc(label(x.a))}</b>${x.a.start > dd ? ` <span style="color:${C.soft}">(${T("starts soon", "يبدأ قريباً")})</span>` : ""}`, dt(x.a.start, l), dt(x.a.finish, l)]), ["l", "r", "r"], l, rows.map(() => C.or)));
    else body.push(para(T("No critical activity is running or starting in the next 14 days.", "لا يوجد نشاط حرج جارٍ أو يبدأ خلال 14 يوماً.")));
    if (finishSoon.length) body.push(para(`<b>${T("Critical finishes in the next 14 days:", "أنشطة حرجة تنتهي خلال 14 يوماً:")}</b> ${finishSoon.map((x) => `${esc(label(x.a))} (${dt(x.a.finish, l)})`).join(" · ")}`));
    const tight = pc.buildings.filter((b) => !b.critical && b.finish && b.float <= 30);
    if (tight.length) body.push(para(`${T("Little float left:", "فائض قليل:")} ${tight.map((b) => `${esc(b.name)} (${b.float} ${T("d", "يوم")})`).join(" · ")}`));
    text.push(`${spec.name} — ${T("planned", "مخطط")} ${planned}%, ${T("completion", "الإنجاز")} ${pc.finish}`, `  ${T("Critical path", "المسار الحرج")}: ${crit.join(", ")} · ${now.length} ${T("running", "جارية")}, ${startSoon.length} ${T("starting in 14 days", "تبدأ خلال 14 يوماً")}`, "");
  }

  // ---------------- assemble
  const nActive = 1 + active.length;
  const heading = o.kind === "SNAPSHOT" ? T("Live snapshot", "لقطة فورية") : T("Daily site status", "الحالة اليومية للمواقع");
  const title = `${heading} — ${dt(o.date, l)}${o.kind === "SNAPSHOT" ? ` ${time}` : ""}`;
  const portfolio = table([T("Project", "المشروع"), T("Progress / plan", "التقدم / المخطط"), "SPI", T("Completion", "الإنجاز"), T("Critical late / risk", "حرجة متأخرة / معرّضة"), T("Status", "الحالة")],
    summary, ["l", "r", "r", "r", "r", "r"], l, marks);
  const dir = l === "ar" ? "rtl" : "ltr", font = l === "ar" ? FONT_AR : FONT;
  const html = `<!doctype html><html lang="${l}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" dir="${dir}" style="width:100%;max-width:640px;background:#ffffff;font-family:${font};color:${C.ink};border-collapse:collapse">
<tr><td style="background:${C.ink};padding:16px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:20px;font-weight:800;letter-spacing:.32em;color:#ffffff">KINAN</td>
<td align="${l === "ar" ? "left" : "right"}" style="font-size:9px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:#c9c9cb">${T("AI onsite agent · site &amp; projects", "الوكيل الميداني · المواقع والمشاريع")}</td></tr></table></td></tr>
<tr><td style="height:3px;background:${C.or};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 4px"><div style="font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${C.or}">${l === "ar" ? "&#8249;" : "&#8250;"}&nbsp;${esc(heading)}</div>
<div style="font-size:24px;font-weight:700;padding-top:4px">${dt(o.date, l)}</div>
<div style="font-size:12px;color:${C.soft};padding-top:4px">${T(`${nActive} active project${nActive > 1 ? "s" : ""} · ${o.kind === "SNAPSHOT" ? "snapshot taken" : "prepared"} ${time} (${o.timezone})`, `${nActive} مشاريع نشطة · ${o.kind === "SNAPSHOT" ? "التُقطت" : "أُعد"} ${time} (${o.timezone})`)}</div></td></tr>
${h2(T("All active projects", "جميع المشاريع النشطة"))}
${portfolio}
${body.join("\n")}
<tr><td style="padding:28px 28px 22px"><div style="border-top:1px solid ${C.line};padding-top:12px;font-size:11px;color:${C.soft};line-height:1.5">${T("Prepared by the Kinan Onsite Agent from the project programme, procurement, safety and site notes. Critical = zero float: a delay to it delays completion. This report takes no action.", "أعده الوكيل الميداني لكنان من برنامج المشروع والمشتريات والسلامة وملاحظات الموقع. الحرج = بلا فائض: أي تأخير فيه يؤخر الإنجاز. لا يتخذ هذا التقرير أي إجراء.")}</div>
<div style="font-size:10px;font-weight:700;letter-spacing:.3em;color:${C.or};padding-top:8px">${KINAN.tagline}</div></td></tr>
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
