// Vendor orchestration — the director does the marketing team's job for a single manager.
//
// Kinan has one marketing manager and no team, so the director runs the vendors:
//   1. BRIEF     after the manager approves the month's budget plan, a brief per vendor (budget, campaign codes,
//                targets, expected deliverables with due dates)
//   2. FEEDBACK  monthly lead-quality feedback per vendor from the CRM (incl. outcomes logged by Kinan's agent)
//   3. CHASE     late deliverables are chased (up to 2 reminders), then escalated to the manager to call
//   4. NOTICE    vendors the agent recommends exiting get a non-renewal notice with a handover list
//   5. VERIFY    after a work order is sent, the director checks it against the data: deliverables received,
//                spend within ±10% of the briefed budget (ad platforms / vendor report), and closes it
// Every work order is an email draft; nothing reaches a vendor until the manager approves it (one by one, or
// routine ones — feedback and reminders, no money or contract change — in a batch). Received deliverables feed the
// scorecard's deadline-adherence metric.
import { prisma } from "./prisma";
import { single, serial } from "./single";
import { buildAgent, type Agent } from "./agent";
import { createCustomDraft, approveAndSend, rejectDraft } from "./recommendations";
import { outlookSenderName, outlookSenderNameAr } from "./outlook";
import { type Lang, tx, nm, dt, K, ltr, an } from "./i18n";
import { TODAY, PLAN_MONTH } from "./clock";
import type { PlanLine } from "./director";

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const MONTH_NAME: Record<string, [string, string]> = { "2026-05": ["May 2026", "مايو 2026"], "2026-06": ["June 2026", "يونيو 2026"], "2026-07": ["July 2026", "يوليو 2026"] };
const mName = (l: Lang, ym: string) => (MONTH_NAME[ym] ? MONTH_NAME[ym][l === "ar" ? 1 : 0] : ym);
const LOST_AR: Record<string, string> = { Price: "السعر", Location: "الموقع", Financing: "التمويل", "Chose competitor": "اختار منافساً", "No response": "لا رد", "Not a buyer": "ليس مشترياً" };
const QUALIFIED = ["QUALIFIED", "VIEWING", "RESERVED", "WON"];
const MAX_CHASES = 2;

// Minutes of the manager's time per item — used to show how much of the week the approvals take.
export const MINUTES: Record<string, number> = { MONTHLY_BRIEF: 3, NON_RENEWAL: 5, LEAD_FEEDBACK: 1, DELIVERABLE_CHASE: 1, ESCALATION: 10 };

type Expected = { kind: string; title: string; titleAr: string; due: string };
type Proposal = { key: string; vendorId: string; kind: string; routine: boolean; title: [string, string]; detail: [string, string]; payload: any; email: (l: Lang) => { subject: string; body: string } };

function letter(l: Lang, contact: string, vendor: string, intro: string, lines: string[], ask: string) {
  return [
    tx(l, `Dear ${contact.split(" ")[0]},`, `السادة / ${nm(l, vendor)} المحترمون،`), "", intro, "", ...lines.map((x) => `  • ${x}`), "", ask, "",
    tx(l, "Kind regards,", "وتفضلوا بقبول فائق الاحترام،"), l === "ar" ? outlookSenderNameAr() : outlookSenderName(),
  ].join("\n");
}

// In-flight sample work (June deliverables not yet received). Undelivered items do not affect scores.
const IN_FLIGHT: { vendor: string; kind: string; title: string; due: string }[] = [
  { vendor: "Sada Influence", kind: "CREATIVE", title: "Creator content — June batch", due: "2026-06-03" },
  { vendor: "Nakhla Communications", kind: "CREATIVE", title: "Press release — Andalus phase 2", due: "2026-06-05" },
  { vendor: "PropertyHub KSA", kind: "LISTING", title: "Listing refresh — Marina Tower", due: "2026-06-12" },
  { vendor: "Mubasher Brokerage Network", kind: "EVENT", title: "Broker open day — Ash Shati", due: "2026-06-20" },
];
const TITLE_AR: Record<string, string> = {
  "Creator content — June batch": "محتوى صنّاع المحتوى — دفعة يونيو",
  "Press release — Andalus phase 2": "بيان صحفي — المرحلة الثانية من الأندلس",
  "Listing refresh — Marina Tower": "تحديث الإعلانات العقارية — برج المارينا",
  "Broker open day — Ash Shati": "يوم مفتوح للوسطاء — الشاطئ",
};
export const ensureInFlight = single(async function ensureInFlightImpl() {
  const [ds, vs] = await Promise.all([prisma.deliverable.findMany(), prisma.vendor.findMany()]);
  for (const x of IN_FLIGHT) {
    const v = vs.find((y) => y.name === x.vendor);
    if (v && !ds.some((d) => d.vendorId === v.id && d.title === x.title))
      await prisma.deliverable.create({ data: { vendorId: v.id, kind: x.kind, title: x.title, dueDate: new Date(x.due), deliveredAt: null, revisions: 0 } });
  }
});
const titleIn = (l: Lang, title: string, titleAr?: string | null) => (l === "ar" ? titleAr ?? TITLE_AR[title] ?? title : title);

// ------------------------------------------------------------- proposals
async function proposals(agents: (l: Lang) => Promise<Agent>): Promise<Proposal[]> {
  const a = await agents("en");
  const [vendors, plans, leads, ds, wos] = await Promise.all([prisma.vendor.findMany(), prisma.budgetPlan.findMany(), prisma.crmLead.findMany(), prisma.deliverable.findMany(), prisma.workOrder.findMany()]);
  const out: Proposal[] = [];
  const vendorOf = (id: string) => vendors.find((v) => v.id === id)!;

  // 1. Monthly briefs — only once the manager has approved the plan.
  const plan = plans.find((p) => p.month === PLAN_MONTH && p.status === "APPROVED");
  if (plan) {
    const reportDue = "2026-07-05", creativeDue = "2026-06-15";
    for (const line of JSON.parse(plan.linesJson) as PlanLine[]) {
      const v = vendorOf(line.vendorId);
      if (!v) continue;
      const codes = a.unified.campaigns.filter((c) => c.vendorId === v.id && c.status === "LIVE" && c.code).map((c) => c.code!);
      const d = a.decisions.find((x) => x.vendorId === v.id);
      const expected: Expected[] = [{ kind: "REPORT", title: `Performance report — ${mName("en", PLAN_MONTH)}`, titleAr: `تقرير الأداء — ${mName("ar", PLAN_MONTH)}`, due: reportDue }];
      if (line.decision !== "EXIT" && ["Performance media", "Influencer", "PR & brand"].includes(v.category))
        expected.push({ kind: "CREATIVE", title: `Creative refresh — ${mName("en", PLAN_MONTH)}`, titleAr: `تجديد المواد الإبداعية — ${mName("ar", PLAN_MONTH)}`, due: creativeDue });
      const targets = (l: Lang) => {
        const cpql = d?.targets[0]?.match(/[\d,]+(?!.*\d)/)?.[0];
        const resp = d?.targets[1]?.match(/(\d+)h/)?.[1];
        return [
          ...(cpql ? [tx(l, `Cost per CRM-qualified lead at or below SAR ${cpql}`, `تكلفة العميل المؤهل في نظامنا لا تتجاوز ${cpql} ر.س`)] : []),
          ...(resp ? [tx(l, `Leads answered within ${resp}h (measured in our CRM)`, `الرد على العملاء المحتملين خلال ${resp} ساعة (حسب نظامنا)`)] : []),
        ];
      };
      const change = line.currentK ? Math.round(((line.proposedK - line.currentK) / line.currentK) * 100) : null;
      out.push({
        key: `BRIEF:${v.id}:${PLAN_MONTH}`, vendorId: v.id, kind: "MONTHLY_BRIEF", routine: false,
        title: [`${mName("en", PLAN_MONTH)} brief — ${K("en", line.proposedK)}`, `موجز ${mName("ar", PLAN_MONTH)} — ${K("ar", line.proposedK)}`],
        detail: [
          `Budget ${K("en", line.proposedK)} (${line.currentK ? `May ${K("en", line.currentK)}` : "new vendor"}), ${codes.length} campaign code(s), ${expected.length} deliverable(s). Checked against ad-platform spend and the CRM when ${mName("en", PLAN_MONTH)} data arrives.`,
          `ميزانية ${K("ar", line.proposedK)} (${line.currentK ? `مايو ${K("ar", line.currentK)}` : "مورد جديد"})، ${an(codes.length, "رمز حملة واحد", "رمزا حملة", "رموز حملات", "رمز حملة")}، ${an(expected.length, "تسليم واحد", "تسليمان", "تسليمات", "تسليماً")}. يُتحقَّق منه مقابل إنفاق منصات الإعلان ونظام العملاء عند وصول بيانات ${mName("ar", PLAN_MONTH)}.`,
        ],
        payload: { budgetK: line.proposedK, previousK: line.currentK, codes, expected },
        email: (l) => ({
          subject: tx(l, `${mName("en", PLAN_MONTH)} brief — budget, targets and deliverables`, `موجز ${mName("ar", PLAN_MONTH)} — الميزانية والمستهدفات والتسليمات`),
          body: letter(l, v.contact, v.name,
            line.decision === "PROMOTED"
              ? tx(l, `Welcome on board. Following the trial, here is your brief for ${mName("en", PLAN_MONTH)}:`, `أهلاً بكم. بعد التجربة، نرفق لكم موجز ${mName("ar", PLAN_MONTH)}:`)
              : tx(l, `Here is your brief for ${mName("en", PLAN_MONTH)}:`, `نرفق لكم موجز ${mName("ar", PLAN_MONTH)}:`),
            [
              tx(l, `Budget: SAR ${line.proposedK}K${line.currentK ? ` (May: SAR ${line.currentK}K${change ? `, ${change > 0 ? "+" : ""}${change}%` : ""})` : ""}`, `الميزانية: ${K("ar", line.proposedK)}${line.currentK ? ` (مايو: ${K("ar", line.currentK)}${change ? `، ${ltr(`${change > 0 ? "+" : ""}${change}%`)}` : ""})` : ""}`),
              ...(codes.length ? [tx(l, `Tag every lead with its campaign code: ${codes.join(", ")}`, `يرجى وسم كل عميل محتمل برمز حملته: ${codes.map(ltr).join("، ")}`)] : []),
              ...targets(l),
              ...expected.map((e) => tx(l, `${e.title}: by ${dt("en", e.due)}`, `${e.titleAr}: بحلول ${dt("ar", e.due)}`)),
              tx(l, "Reports in the shared template; spend must reconcile to the ad platforms and invoices within 5%", "التقارير وفق النموذج المعتمد؛ ويجب أن يتطابق الإنفاق مع منصات الإعلان والفواتير بفارق لا يتجاوز 5%"),
            ],
            tx(l, "Please reply to confirm the brief and the dates.", "نرجو الرد لتأكيد الموجز والمواعيد.")),
        }),
      });
    }
  }

  // 2. Lead feedback for last month, per vendor (from the CRM, incl. Kinan's agent outcomes).
  const FEEDBACK_MONTH = "2026-05";
  for (const d of a.decisions.filter((x) => x.decision !== "EXIT")) {
    const v = vendorOf(d.vendorId);
    const camps = a.unified.campaigns.filter((c) => c.vendorId === v.id && c.code);
    const rows = camps.map((c) => {
      const ls = leads.filter((x) => x.campaignId === c.id && x.createdAt.toISOString().startsWith(FEEDBACK_MONTH));
      const lost = new Map<string, number>();
      for (const x of ls) if (x.stage === "LOST" && x.lostReason) lost.set(x.lostReason, (lost.get(x.lostReason) ?? 0) + 1);
      const top = [...lost.entries()].sort((p, q) => q[1] - p[1])[0];
      return { code: c.code!, leads: ls.length, qPct: ls.length ? Math.round((ls.filter((x) => QUALIFIED.includes(x.stage)).length / ls.length) * 100) : 0, won: ls.filter((x) => x.stage === "WON").length, top: top ? { reason: top[0], pct: Math.round((top[1] / ls.length) * 100) } : null };
    }).filter((r) => r.leads > 0).sort((p, q) => q.qPct - p.qPct);
    if (!rows.length) continue;
    const best = rows[0], junk = rows.find((r) => r !== best && r.top?.reason === "Not a buyer" && r.top.pct >= 10);
    out.push({
      key: `FEEDBACK:${v.id}:${FEEDBACK_MONTH}`, vendorId: v.id, kind: "LEAD_FEEDBACK", routine: true,
      title: [`Lead feedback — ${mName("en", FEEDBACK_MONTH)}`, `ملاحظات على العملاء المحتملين — ${mName("ar", FEEDBACK_MONTH)}`],
      detail: [
        `${rows.reduce((s, r) => s + r.leads, 0)} CRM leads across ${rows.length} code(s); best ${best.code} (${best.qPct}% qualified).`,
        `${an(rows.reduce((s, r) => s + r.leads, 0), "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} في النظام عبر ${an(rows.length, "رمز واحد", "رمزين", "رموز", "رمزاً")}؛ الأفضل ${ltr(best.code)} (${best.qPct}% مؤهلون).`,
      ],
      payload: { month: FEEDBACK_MONTH, rows },
      email: (l) => ({
        subject: tx(l, `Lead feedback for ${mName("en", FEEDBACK_MONTH)} — what converted`, `ملاحظات العملاء المحتملين لشهر ${mName("ar", FEEDBACK_MONTH)} — ما الذي تحوّل إلى مبيعات`),
        body: letter(l, v.contact, v.name,
          tx(l, `Here is how your ${mName("en", FEEDBACK_MONTH)} leads did in our CRM:`, `إليكم نتائج العملاء المحتملين لشهر ${mName("ar", FEEDBACK_MONTH)} في نظامنا:`),
          rows.map((r) => tx(l,
            `${r.code}: ${r.leads} leads, ${r.qPct}% qualified, ${r.won} won${r.top ? `; most common loss reason: ${r.top.reason.toLowerCase()} (${r.top.pct}% of leads)` : ""}`,
            `${ltr(r.code)}: ${an(r.leads, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")}، ${r.qPct}% مؤهلون، ${r.won ? an(r.won, "صفقة واحدة", "صفقتان", "صفقات", "صفقة") : "لا صفقات"}${r.top ? `؛ أكثر أسباب الخسارة: ${LOST_AR[r.top.reason] ?? r.top.reason} (${r.top.pct}% من العملاء)` : ""}`)),
          tx(l,
            `Please put more weight on what works in ${best.code}${junk ? ` and tighten targeting on ${junk.code}, where ${junk.top!.pct}% of leads were not buyers` : ""}. Reply with the changes you make.`,
            `نرجو إعطاء وزن أكبر لما ينجح في ${ltr(best.code)}${junk ? ` وتضييق الاستهداف في ${ltr(junk.code)} حيث لم يكن ${junk.top!.pct}% من العملاء مشترين` : ""}. نرجو الرد بالتغييرات التي ستُجرونها.`)),
      }),
    });
  }

  // 3. Chase late deliverables (max 2 reminders, 3 days apart).
  for (const del of ds.filter((x) => !x.deliveredAt && x.dueDate < TODAY)) {
    const v = vendorOf(del.vendorId);
    const chases = wos.filter((w) => w.kind === "DELIVERABLE_CHASE" && w.status !== "CANCELLED" && JSON.parse(w.payload ?? "{}").deliverableId === del.id);
    if (chases.length >= MAX_CHASES || chases.some((w) => w.status === "PROPOSED")) continue;
    const last = chases.map((w) => w.issuedAt?.getTime() ?? 0).sort().pop();
    if (last && TODAY.getTime() - last < 3 * DAY) continue;
    const n = chases.length + 1, daysLate = Math.round((TODAY.getTime() - del.dueDate.getTime()) / DAY);
    const t = (l: Lang) => titleIn(l, del.title);
    out.push({
      key: `CHASE:${del.id}:${n}`, vendorId: v.id, kind: "DELIVERABLE_CHASE", routine: true,
      title: [`Reminder ${n}: ${t("en")}`, `تذكير ${n}: ${t("ar")}`],
      detail: [`Due ${dt("en", del.dueDate)} — ${daysLate} days late.`, `موعده ${dt("ar", del.dueDate)} — متأخر ${an(daysLate, "يوماً واحداً", "يومين", "أيام", "يوماً")}.`],
      payload: { deliverableId: del.id, n },
      email: (l) => ({
        subject: tx(l, `${n > 1 ? "Second reminder" : "Reminder"}: ${t("en")}`, `${n > 1 ? "تذكير ثانٍ" : "تذكير"}: ${t("ar")}`),
        body: letter(l, v.contact, v.name,
          tx(l, `We have not yet received the following, which was due on ${dt("en", del.dueDate)}:`, `لم نستلم بعد ما يلي، وكان موعد تسليمه ${dt("ar", del.dueDate)}:`),
          [t(l)],
          tx(l, `Please send it by ${dt("en", addDays(TODAY, 2))}, or reply with a firm new date.`, `نرجو إرساله بحلول ${dt("ar", addDays(TODAY, 2))}، أو الرد بموعد جديد مؤكد.`)),
      }),
    });
  }

  // 4. Non-renewal notice for vendors the agent recommends exiting.
  for (const d of a.decisions.filter((x) => x.decision === "EXIT")) {
    const v = vendorOf(d.vendorId);
    const end = new Date(d.contractEnd);
    const expected: Expected[] = [{ kind: "REPORT", title: "Handover pack (final report, files, account access)", titleAr: "حزمة التسليم (التقرير الختامي، الملفات، صلاحيات الحسابات)", due: addDays(end, 5).toISOString().slice(0, 10) }];
    out.push({
      key: `NONRENEW:${v.id}`, vendorId: v.id, kind: "NON_RENEWAL", routine: false,
      title: [`Non-renewal notice — contract ends ${dt("en", end)}`, `إشعار عدم التجديد — ينتهي العقد ${dt("ar", end)}`],
      detail: [
        "Recommended exit (see Decisions). Check the contract's notice period before approving. Includes the handover list.",
        "خروج موصى به (انظر القرارات). تحققوا من مهلة الإشعار في العقد قبل الاعتماد. يشمل قائمة التسليم.",
      ],
      payload: { contractEnd: d.contractEnd, expected },
      email: (l) => ({
        subject: tx(l, `Contract ending ${dt("en", end)} — notice of non-renewal`, `العقد المنتهي في ${dt("ar", end)} — إشعار بعدم التجديد`),
        body: letter(l, v.contact, v.name,
          tx(l, `Thank you for your work with us. We are writing to let you know that we will not renew the contract ending on ${dt("en", end)}. To close out, please send:`, `نشكركم على تعاونكم. نود إعلامكم بأننا لن نجدد العقد المنتهي في ${dt("ar", end)}. ولإتمام الإغلاق نرجو إرسال:`),
          [
            tx(l, `The final performance report and all creative files by ${dt("en", expected[0].due)}`, `التقرير الختامي للأداء وجميع الملفات الإبداعية بحلول ${dt("ar", expected[0].due)}`),
            tx(l, "Transfer of any media accounts, listings and tracking set up on our behalf", "نقل أي حسابات إعلانية أو إعلانات عقارية أو أدوات تتبع أُنشئت باسمنا"),
            tx(l, "The final invoice against the purchase order", "الفاتورة النهائية مقابل أمر الشراء"),
          ],
          tx(l, "Please reply to confirm receipt of this notice.", "نرجو الرد بتأكيد استلام هذا الإشعار.")),
      }),
    });
  }
  return out;
}

const propose = serial(async (agents: (l: Lang) => Promise<Agent>) => {
  const existing = await prisma.workOrder.findMany();
  for (const p of await proposals(agents)) {
    if (existing.some((w) => w.key === p.key)) continue;
    const v = (await prisma.vendor.findMany()).find((x) => x.id === p.vendorId)!;
    const vl: Lang = v.language === "ar" ? "ar" : "en";
    const wo = await prisma.workOrder.create({ data: { key: p.key, vendorId: p.vendorId, kind: p.kind, routine: p.routine, title: p.title[0], titleAr: p.title[1], detail: p.detail[0], detailAr: p.detail[1], payload: JSON.stringify(p.payload) } });
    try {
      await createCustomDraft({ vendorId: v.id, recKey: `WO:${p.key}`, ...p.email(vl) });
    } catch (e: any) {
      await prisma.workOrder.update({ where: { id: wo.id }, data: { error: String(e?.message ?? e) } });
    }
  }
});

// --------------------------------------------------- sync with mail + data
const sync = serial(async (a: Agent) => {
  const [wos, emails, ds] = await Promise.all([prisma.workOrder.findMany(), prisma.outboundEmail.findMany(), prisma.deliverable.findMany()]);
  for (const w of wos) {
    const e = emails.filter((x) => x.recKey === `WO:${w.key}`).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime())[0];
    const p = JSON.parse(w.payload ?? "{}");
    if (w.status === "PROPOSED" && e?.status === "REJECTED") { await prisma.workOrder.update({ where: { id: w.id }, data: { status: "CANCELLED", approvedBy: e.approvedBy } }); continue; }
    if (w.status === "PROPOSED" && e?.status === "SENT") {
      // Sample data runs on a fixed clock (lib/clock.ts); keep sent dates on it so reminders and timelines line up.
      const sentAt = e.sentAt && e.sentAt < TODAY ? e.sentAt : TODAY;
      await prisma.workOrder.update({ where: { id: w.id }, data: { status: "ISSUED", issuedAt: sentAt, approvedBy: e.approvedBy } });
      for (const x of (p.expected ?? []) as Expected[])
        if (!ds.some((d) => d.vendorId === w.vendorId && d.title === x.title))
          await prisma.deliverable.create({ data: { vendorId: w.vendorId, kind: x.kind, title: x.title, dueDate: new Date(x.due), deliveredAt: null, revisions: 0 } });
      if (w.kind === "LEAD_FEEDBACK") await prisma.workOrder.update({ where: { id: w.id }, data: { status: "DONE", doneAt: sentAt } });
    }
  }
  // Close issued work orders whose checks have all passed.
  const fresh = await Promise.all([prisma.workOrder.findMany(), prisma.deliverable.findMany()]);
  for (const w of fresh[0].filter((x) => x.status === "ISSUED")) {
    const c = checks(w, fresh[1], a, "en");
    if (c.length && c.every((x) => x.state === "ok")) await prisma.workOrder.update({ where: { id: w.id }, data: { status: "DONE", doneAt: TODAY } });
  }
});

type Check = { label: string; state: "ok" | "late" | "due" | "wait"; deliverableId?: string };
function checks(w: { kind: string; vendorId: string; payload: string | null }, ds: { id: string; vendorId: string; title: string; dueDate: Date; deliveredAt: Date | null }[], a: Agent, l: Lang): Check[] {
  const p = JSON.parse(w.payload ?? "{}");
  const T = (en: string, ar: string) => tx(l, en, ar);
  const delCheck = (d: (typeof ds)[number] | undefined, title: string, titleAr?: string): Check => {
    const name = titleIn(l, title, titleAr);
    if (!d) return { label: name, state: "wait" };
    return { label: `${name} · ${d.deliveredAt ? T(`received ${dt("en", d.deliveredAt)}`, `استُلم ${dt("ar", d.deliveredAt)}`) : T(`due ${dt("en", d.dueDate)}`, `موعده ${dt("ar", d.dueDate)}`)}`, state: d.deliveredAt ? "ok" : d.dueDate < TODAY ? "late" : "due", deliverableId: d.id };
  };
  if (w.kind === "DELIVERABLE_CHASE") { const d = ds.find((x) => x.id === p.deliverableId); return [delCheck(d, d?.title ?? "")]; }
  const out: Check[] = ((p.expected ?? []) as Expected[]).map((x) => delCheck(ds.find((d) => d.vendorId === w.vendorId && d.title === x.title), x.title, x.titleAr));
  if (w.kind === "MONTHLY_BRIEF") {
    const spent = a.unified.campaigns.filter((c) => c.vendorId === w.vendorId).flatMap((c) => c.months).filter((m) => m.month === PLAN_MONTH);
    const k = spent.reduce((s, m) => s + m.costK, 0);
    out.push(spent.length
      ? { label: T(`Spend ${K("en", Math.round(k))} vs briefed ${K("en", p.budgetK)}`, `الإنفاق ${K("ar", Math.round(k))} مقابل ${K("ar", p.budgetK)} في الموجز`), state: Math.abs(k - p.budgetK) <= p.budgetK * 0.1 ? "ok" : "late" }
      : { label: T(`Spend within ±10% of ${K("en", p.budgetK)} — awaiting ${mName("en", PLAN_MONTH)} data`, `الإنفاق ضمن ±10% من ${K("ar", p.budgetK)} — بانتظار بيانات ${mName("ar", PLAN_MONTH)}`), state: "wait" });
  }
  return out;
}

// ------------------------------------------------------------------ build
export async function buildOrchestration(lang: Lang = "en", pre?: Agent) {
  const cache: Partial<Record<Lang, Promise<Agent>>> = {};
  if (pre) cache[lang] = Promise.resolve(pre);
  const agents = (l: Lang) => (cache[l] ??= buildAgent(l));
  const a = await agents(lang); // also seeds vendors on first run
  await ensureInFlight();
  await propose(agents);
  await sync(a);
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const [wos, emails, ds, vendors] = await Promise.all([prisma.workOrder.findMany(), prisma.outboundEmail.findMany(), prisma.deliverable.findMany(), prisma.vendor.findMany()]);
  const vName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "";

  const orders = wos.map((w) => {
    const e = emails.filter((x) => x.recKey === `WO:${w.key}`).sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime())[0];
    const c = checks(w, ds, a, lang);
    return {
      id: w.id, key: w.key, kind: w.kind, routine: w.routine, vendorId: w.vendorId, vendor: vName(w.vendorId),
      title: lang === "ar" ? w.titleAr : w.title, detail: lang === "ar" ? w.detailAr : w.detail,
      status: w.status, overdue: w.status === "ISSUED" && c.some((x) => x.state === "late"),
      issuedAt: w.issuedAt?.toISOString() ?? null, approvedBy: w.approvedBy, error: w.error, checks: c,
      email: e ? { id: e.id, to: e.toAddress, subject: e.subject, body: e.body, revision: e.revision, status: e.status, language: vendors.find((v) => v.id === w.vendorId)?.language ?? "en" } : null,
    };
  }).sort((p, q) => Number(q.overdue) - Number(p.overdue) || Number(p.routine) - Number(q.routine) || p.vendor.localeCompare(q.vendor));

  // Deliverables in flight (not the delivered history).
  const chased = (id: string) => wos.filter((w) => w.kind === "DELIVERABLE_CHASE" && w.status !== "CANCELLED" && w.status !== "PROPOSED" && JSON.parse(w.payload ?? "{}").deliverableId === id).length;
  const open = ds.filter((d) => !d.deliveredAt || d.deliveredAt >= new Date("2026-06-01")).map((d) => ({
    id: d.id, vendor: vName(d.vendorId), title: titleIn(lang, d.title, (wos.flatMap((w) => (JSON.parse(w.payload ?? "{}").expected ?? []) as Expected[]).find((x) => x.title === d.title)?.titleAr)),
    kind: d.kind, due: d.dueDate.toISOString(), deliveredAt: d.deliveredAt?.toISOString() ?? null,
    state: d.deliveredAt ? (d.deliveredAt <= d.dueDate ? "ON_TIME" : "LATE_RECEIVED") : d.dueDate < TODAY ? "LATE" : "DUE",
    daysLate: !d.deliveredAt && d.dueDate < TODAY ? Math.round((TODAY.getTime() - d.dueDate.getTime()) / DAY) : 0, chases: chased(d.id),
  })).sort((p, q) => p.due.localeCompare(q.due));

  // Escalations: reminders exhausted → the manager calls the vendor.
  const escalations = open.filter((d) => d.state === "LATE" && d.chases >= MAX_CHASES).map((d) => ({
    deliverableId: d.id, vendor: d.vendor,
    title: T(`Call ${d.vendor}: "${d.title}" is ${d.daysLate} days late after ${d.chases} reminders`, `اتصلوا بـ${nm(lang, d.vendor)}: «${d.title}» متأخر ${an(d.daysLate, "يوماً واحداً", "يومين", "أيام", "يوماً")} بعد ${an(d.chases, "تذكير واحد", "تذكيرين", "تذكيرات", "تذكيراً")}`),
  }));

  const waiting = orders.filter((o) => o.status === "PROPOSED" && o.email?.status === "DRAFT");
  const minutes = waiting.reduce((s, o) => s + (MINUTES[o.kind] ?? 2), 0) + escalations.length * MINUTES.ESCALATION;
  const planApproved = (await prisma.budgetPlan.findMany()).some((p) => p.month === PLAN_MONTH && p.status === "APPROVED");

  return {
    asOf: TODAY.toISOString(), planApproved,
    summary: {
      waiting: waiting.length, routineWaiting: waiting.filter((o) => o.routine).length,
      withVendors: orders.filter((o) => o.status === "ISSUED").length, overdue: orders.filter((o) => o.overdue).length,
      lateDeliverables: open.filter((d) => d.state === "LATE").length, done: orders.filter((o) => o.status === "DONE").length,
      activeVendors: vendors.filter((v) => v.status === "ACTIVE").length, minutes,
    },
    orders, deliverables: open, escalations,
    cadence: [
      { when: T("Daily", "يومياً"), what: T("Campaign check: pacing, cost to sales, Meta attribution and tracking codes — recommendations land in your brief; invoices synced from Oracle.", "فحص الحملات: وتيرة الإنفاق، والتكلفة إلى المبيعات، ونسب حملات ميتا ورموز التتبع — وتصل التوصيات إلى موجزكم؛ ومزامنة الفواتير من Oracle."), next: dt(lang, addDays(TODAY, 1)) },
      { when: T("Weekly (Sunday)", "أسبوعياً (الأحد)"), what: T("Chase late deliverables (2 reminders, then a call for you); check vendor numbers against the CRM and ad platforms.", "متابعة التسليمات المتأخرة (تذكيران ثم اتصال منكم)؛ ومطابقة أرقام الموردين مع النظام ومنصات الإعلان."), next: dt(lang, addDays(TODAY, 7 - TODAY.getDay())) },
      { when: T("Monthly (from the 25th)", "شهرياً (من يوم 25)"), what: T("Next month's budget plan → one brief per vendor; lead feedback per vendor from the CRM; reports due by the 5th, reconciled with invoices.", "خطة ميزانية الشهر التالي ← موجز لكل مورد؛ وملاحظات العملاء المحتملين لكل مورد من النظام؛ والتقارير بحلول يوم 5 ومطابقتها مع الفواتير."), next: dt(lang, "2026-06-25") },
      { when: T("Quarterly", "ربع سنوي"), what: T("Business reviews, renewal decisions, re-bids and trials; non-renewal notices.", "مراجعات الأعمال، وقرارات التجديد، وإعادة الطرح والتجارب؛ وإشعارات عدم التجديد."), next: dt(lang, "2026-07-01") },
    ],
  };
}
export type Orchestration = Awaited<ReturnType<typeof buildOrchestration>>;

// ---------------------------------------------------------------- actions
export async function approveWorkOrders(items: { id: string; revision: number }[], approver: string, confirmRead: boolean, lang: Lang) {
  if (!approver?.trim()) throw new Error(tx(lang, "Approver name is required.", "اسم المعتمِد مطلوب."));
  if (!confirmRead) throw new Error(tx(lang, "Confirm that you have read the message(s) first.", "أكّدوا أولاً أنكم قرأتم الرسالة/الرسائل."));
  const [wos, emails] = await Promise.all([prisma.workOrder.findMany(), prisma.outboundEmail.findMany()]);
  const errors: string[] = [];
  for (const it of items) {
    const w = wos.find((x) => x.id === it.id);
    const e = w && emails.find((x) => x.recKey === `WO:${w.key}` && x.status !== "REJECTED");
    if (!w || !e) { errors.push(tx(lang, "Work order not found.", "أمر العمل غير موجود.")); continue; }
    try { await approveAndSend({ id: e.id, approver, revision: it.revision }, lang); } catch (err: any) { errors.push(`${nm(lang, (await prisma.vendor.findMany()).find((v) => v.id === w.vendorId)?.name ?? "")}: ${err.message}`); }
  }
  if (errors.length) throw new Error(errors.join(" · "));
}

export async function cancelWorkOrder(id: string, approver: string, lang: Lang) {
  if (!approver?.trim()) throw new Error(tx(lang, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const w = (await prisma.workOrder.findMany()).find((x) => x.id === id);
  if (!w || w.status !== "PROPOSED") throw new Error(tx(lang, "Only proposed work orders can be cancelled.", "لا يمكن إلغاء إلا أوامر العمل المقترحة."));
  const e = (await prisma.outboundEmail.findMany()).find((x) => x.recKey === `WO:${w.key}` && x.status === "DRAFT");
  if (e) await rejectDraft(e.id, approver, lang);
  await prisma.workOrder.update({ where: { id }, data: { status: "CANCELLED", approvedBy: approver.trim() } });
}

/** A deliverable arrived (until vendor replies are read from Outlook, the manager marks it in one click). */
export async function receiveDeliverable(id: string, approver: string, lang: Lang) {
  const d = (await prisma.deliverable.findMany()).find((x) => x.id === id);
  if (!d) throw new Error(tx(lang, "Deliverable not found.", "التسليم غير موجود."));
  if (d.deliveredAt) return;
  await prisma.deliverable.update({ where: { id }, data: { deliveredAt: TODAY } });
  const v = (await prisma.vendor.findMany()).find((x) => x.id === d.vendorId);
  await prisma.marketingAction.create({ data: { type: "DELIVERABLE_RECEIVED", campaign: `${nm(lang, v?.name ?? "")} · ${titleIn(lang, d.title)}`, detail: tx(lang, `Marked received${approver?.trim() ? ` by ${approver.trim()}` : ""}${d.dueDate < TODAY ? " (late)" : ""}.`, `سُجّل استلامه${approver?.trim() ? ` بواسطة ${approver.trim()}` : ""}${d.dueDate < TODAY ? " (متأخر)" : ""}.`) } });
}
