import { serial } from "./single";
// Re-bidding: a bench of pre-vetted alternative vendors and small paid trials against incumbents.
// The agent proposes trials automatically when a vendor's decision is "test a replacement" or "exit";
// spending money always needs a named approver.
import { prisma } from "./prisma";
import { ensureOpsSeeded } from "./seed-ops";
import { rateRatio } from "./stats";
import { type Lang, tx, K, nm } from "./i18n";

const TODAY = new Date("2026-06-08");
// Smallest sensible trial budget per channel (SAR K) — a 6-week flight below this is not readable.
const MIN_TRIAL_K: Record<string, number> = { "Performance media": 30, "Property portal": 38, "Broker network": 0, "PR & brand": 30, "Outdoor": 60, "Influencer": 24 };

export type TrialResults = { challenger: { spendK: number; leads: number; qualified: number; contracts: number }; incumbent: { spendK: number; leads: number; qualified: number; contracts: number } };
export type TrialReadout = {
  qlRatio: number | null; qlLow: number | null; qlHigh: number | null; pOneSided: number | null;
  challengerCpql: number | null; incumbentCpql: number | null;
  outcome: "PROMOTE" | "EXTEND" | "KEEP_INCUMBENT"; confidencePct: number | null; source: "crm" | "recorded";
};

export function trialReadout(r: TrialResults, source: TrialReadout["source"] = "recorded"): TrialReadout {
  const rr = rateRatio({ n: r.challenger.qualified, spendK: r.challenger.spendK }, { n: r.incumbent.qualified, spendK: r.incumbent.spendK });
  const outcome: TrialReadout["outcome"] = !rr ? "EXTEND" : rr.ratio > 1.15 && rr.pOneSided < 0.1 ? "PROMOTE" : rr.ratio < 0.87 && rr.pOneSided < 0.1 ? "KEEP_INCUMBENT" : "EXTEND";
  return {
    qlRatio: rr?.ratio ?? null, qlLow: rr?.low ?? null, qlHigh: rr?.high ?? null, pOneSided: rr?.pOneSided ?? null,
    challengerCpql: r.challenger.qualified ? Math.round((r.challenger.spendK * 1000) / r.challenger.qualified) : null,
    incumbentCpql: r.incumbent.qualified ? Math.round((r.incumbent.spendK * 1000) / r.incumbent.qualified) : null,
    outcome, confidencePct: rr ? Math.round((1 - rr.pOneSided) * 100) : null, source,
  };
}

/** Results from the CRM when trial leads carry the trial code; otherwise the recorded results. */
async function resultsFor(t: { crmCode: string; incumbentId: string; asset: string; startDate: Date | null; weeks: number; budgetK: number; resultsJson: string | null }): Promise<{ r: TrialResults; source: "crm" | "recorded" } | null> {
  const leads = await prisma.crmLead.findMany();
  const mine = leads.filter((l) => l.source.toLowerCase() === t.crmCode.toLowerCase());
  if (mine.length && t.startDate) {
    const end = new Date(Math.min(TODAY.getTime(), t.startDate.getTime() + t.weeks * 7 * 86_400_000));
    const frac = Math.min(1, (end.getTime() - t.startDate.getTime()) / (t.weeks * 7 * 86_400_000));
    const campaigns = (await prisma.campaign.findMany({ include: { months: true } })).filter((c) => c.vendorId === t.incumbentId);
    const asset = (await prisma.asset.findMany()).find((a) => a.name === t.asset);
    const inc = campaigns.filter((c) => !asset || c.assetId === asset.id);
    const incLeads = leads.filter((l) => inc.some((c) => c.id === l.campaignId) && l.createdAt >= t.startDate! && l.createdAt <= end);
    const q = (xs: typeof leads) => xs.filter((l) => ["QUALIFIED", "VIEWING", "RESERVED", "WON"].includes(l.stage)).length;
    const incSpend = inc.flatMap((c) => c.months).reduce((s, m) => s + m.spendK, 0) / 5 * (t.weeks / 4.33) * frac;
    return {
      source: "crm",
      r: {
        challenger: { spendK: Math.round(t.budgetK * frac), leads: mine.length, qualified: q(mine), contracts: mine.filter((l) => l.stage === "WON").length },
        incumbent: { spendK: Math.round(incSpend), leads: incLeads.length, qualified: q(incLeads), contracts: incLeads.filter((l) => l.stage === "WON").length },
      },
    };
  }
  return t.resultsJson ? { source: "recorded", r: JSON.parse(t.resultsJson) } : null;
}

export function trialBrief(t: { asset: string; budgetK: number; weeks: number; crmCode: string }, incumbent: string, challenger: string, category: string, l: Lang) {
  return tx(l,
    `${t.weeks}-week paid trial on ${t.asset} (${category}). ${challenger} runs against ${incumbent} on the same brief, creative guidelines and landing page. Budget SAR ${t.budgetK}K. All leads tagged with CRM code ${t.crmCode}; success = lower cost per CRM-qualified lead than the incumbent with ≥ 90% confidence.`,
    `تجربة مدفوعة لمدة ${t.weeks} أسابيع على ${nm(l, t.asset)} (${nm(l, category)}). يعمل ${nm(l, challenger)} مقابل ${nm(l, incumbent)} على نفس الموجز وإرشادات المحتوى وصفحة الهبوط. الميزانية ${K(l, t.budgetK)}. تُوسم جميع العملاء المحتملين برمز نظام إدارة العملاء ⁦${t.crmCode}⁩؛ والنجاح = تكلفة أقل لكل عميل مؤهل مقارنة بالمورد الحالي بثقة لا تقل عن 90%.`);
}

/** Agent re-bid: propose a trial for every vendor flagged for replacement that has a bench alternative. */
export const autoRebid = serial(async function autoRebidImpl(decisions: { vendorId: string; decision: string }[]) {
  await ensureOpsSeeded();
  const [vendors, trials, campaigns, assets] = await Promise.all([prisma.vendor.findMany(), prisma.trial.findMany(), prisma.campaign.findMany({ include: { months: true } }), prisma.asset.findMany()]);
  const created: string[] = [];
  for (const d of decisions.filter((x) => x.decision === "TEST_REPLACEMENT" || x.decision === "EXIT")) {
    const inc = vendors.find((v) => v.id === d.vendorId);
    if (!inc) continue;
    if (trials.some((t) => t.incumbentId === inc.id && t.status !== "CANCELLED" && t.status !== "COMPLETED")) continue; // one open trial at a time
    const used = new Set(trials.filter((t) => t.incumbentId === inc.id).map((t) => t.challengerId));
    const challenger = vendors.find((v) => v.status === "BENCH" && v.category === inc.category && !used.has(v.id));
    if (!challenger) continue;
    const cs = campaigns.filter((c) => c.vendorId === inc.id);
    const top = [...cs].sort((a, b) => b.months.reduce((s, m) => s + m.spendK, 0) - a.months.reduce((s, m) => s + m.spendK, 0))[0];
    if (!top) continue;
    const monthly = cs.flatMap((c) => c.months).reduce((s, m) => s + m.spendK, 0) / 5;
    const budgetK = Math.max(MIN_TRIAL_K[inc.category] ?? 30, Math.round((monthly * 1.4 * 0.15) / 5) * 5);
    const asset = assets.find((a) => a.id === top.assetId)?.name ?? "";
    const code = `TRIAL-${(top.crmCode ?? "X").split("-")[0]}-${challenger.name.split(" ")[0].toUpperCase()}`;
    await prisma.trial.create({
      data: {
        challengerId: challenger.id, incumbentId: inc.id, asset, budgetK, weeks: 6, crmCode: code, status: "PROPOSED", origin: "AGENT",
        brief: trialBrief({ asset, budgetK, weeks: 6, crmCode: code }, inc.name, challenger.name, inc.category, "en"),
      },
    });
    created.push(challenger.name);
  }
  return created;
});

export async function approveTrial(id: string, approver: string, l: Lang = "en") {
  if (!approver?.trim()) throw new Error(tx(l, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const t = (await prisma.trial.findMany()).find((x) => x.id === id);
  if (!t) throw new Error(tx(l, "Trial not found.", "التجربة غير موجودة."));
  if (t.status !== "PROPOSED") throw new Error(tx(l, "Only proposed trials can be approved.", "لا يمكن اعتماد إلا التجارب المقترحة."));
  await prisma.trial.update({ where: { id }, data: { status: "RUNNING", approvedBy: approver.trim(), startDate: TODAY } });
  const v = await prisma.vendor.findMany();
  await prisma.marketingAction.create({
    data: { type: "TRIAL_APPROVED", campaign: `${nm(l, v.find((x) => x.id === t.challengerId)?.name)} vs ${nm(l, v.find((x) => x.id === t.incumbentId)?.name)}`, detail: tx(l, `SAR ${t.budgetK}K, ${t.weeks}-week trial approved by ${approver.trim()}.`, `اعتمد ${approver.trim()} تجربة لمدة ${t.weeks} أسابيع بميزانية ${K(l, t.budgetK)}.`) },
  });
}

export async function cancelTrial(id: string, approver: string, l: Lang = "en") {
  const t = (await prisma.trial.findMany()).find((x) => x.id === id);
  if (!t) throw new Error(tx(l, "Trial not found.", "التجربة غير موجودة."));
  if (t.status === "COMPLETED") throw new Error(tx(l, "A completed trial cannot be cancelled.", "لا يمكن إلغاء تجربة مكتملة."));
  await prisma.trial.update({ where: { id }, data: { status: "CANCELLED", decidedBy: approver?.trim() || null } });
}

export async function decideTrial(id: string, decision: "PROMOTE" | "EXTEND" | "KEEP_INCUMBENT", approver: string, l: Lang = "en") {
  if (!approver?.trim()) throw new Error(tx(l, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const t = (await prisma.trial.findMany()).find((x) => x.id === id);
  if (!t || t.status !== "COMPLETED") throw new Error(tx(l, "Only completed trials can be decided.", "لا يمكن البت إلا في التجارب المكتملة."));
  await prisma.trial.update({ where: { id }, data: { decision, decidedBy: approver.trim() } });
  const vs = await prisma.vendor.findMany();
  const ch = vs.find((x) => x.id === t.challengerId), inc = vs.find((x) => x.id === t.incumbentId);
  if (decision === "PROMOTE" && ch?.status === "BENCH") await prisma.vendor.update({ where: { id: ch.id }, data: { status: "ACTIVE" } });
  const label = { PROMOTE: tx(l, "promote the challenger", "ترقية المورد المنافس"), EXTEND: tx(l, "extend the trial", "تمديد التجربة"), KEEP_INCUMBENT: tx(l, "keep the incumbent", "الإبقاء على المورد الحالي") }[decision];
  await prisma.marketingAction.create({ data: { type: "TRIAL_DECIDED", campaign: `${nm(l, ch?.name)} vs ${nm(l, inc?.name)}`, detail: tx(l, `Decision: ${label} (by ${approver.trim()}).`, `القرار: ${label} (بواسطة ${approver.trim()}).`) } });
}

export async function buildBench(lang: Lang = "en") {
  await ensureOpsSeeded();
  const [vendors, trials] = await Promise.all([prisma.vendor.findMany(), prisma.trial.findMany()]);
  const vName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "";
  const rows = [];
  for (const t of [...trials].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const res = t.status === "COMPLETED" || t.status === "RUNNING" ? await resultsFor(t) : null;
    const inc = vendors.find((v) => v.id === t.incumbentId);
    rows.push({
      id: t.id, status: t.status, origin: t.origin, challengerId: t.challengerId, challenger: vName(t.challengerId), incumbentId: t.incumbentId, incumbent: vName(t.incumbentId),
      category: inc?.category ?? "", asset: t.asset, budgetK: t.budgetK, weeks: t.weeks, crmCode: t.crmCode, approvedBy: t.approvedBy,
      startDate: t.startDate?.toISOString() ?? null, decision: t.decision, decidedBy: t.decidedBy,
      brief: trialBrief(t, vName(t.incumbentId), vName(t.challengerId), inc?.category ?? "", lang),
      results: res?.r ?? null, readout: res && t.status === "COMPLETED" ? trialReadout(res.r, res.source) : null,
    });
  }
  return {
    bench: vendors.filter((v) => v.status === "BENCH" || trials.some((t) => t.challengerId === v.id)).map((v) => ({
      id: v.id, name: v.name, category: v.category, model: v.model, status: v.status, rateNote: v.rateNote, contact: v.contact, email: v.email, language: v.language,
      trials: trials.filter((t) => t.challengerId === v.id).length,
    })),
    trials: rows,
  };
}
export type Bench = Awaited<ReturnType<typeof buildBench>>;
