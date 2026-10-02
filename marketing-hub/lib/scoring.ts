// Fair vendor scorecard: every vendor on a common 0–100 scale, normalised by channel and budget, built
// on verified data (lib/unified.ts) and adjusted for incrementality when there is evidence.
//
// Each metric is turned into an index against the channel benchmark (adjusted for the vendor's budget,
// because cost per result naturally rises with scale): 1.0 = at benchmark → 50 points, 2.0× better → 100.
//   Cost per qualified lead (CRM)                  30%   lower is better
//   Revenue + weighted pipeline per SAR (CRM)      30%   higher is better; × incremental share when known
//   Spend vs plan (pacing deviation)               15%
//   Deadline adherence (deliverables on time)      15%
//   Revisions per deliverable                      10%
// The score comes with a range (sample size + incrementality uncertainty) and a confidence level.
import { prisma } from "./prisma";
import { buildUnified, type Unified } from "./unified";
import { buildIncrementality, type Incrementality } from "./incrementality";
import { type Lang, tx } from "./i18n";

// Assumed market benchmarks per channel — calibrate with the client's own history / market data.
export const BENCHMARKS: Record<string, { cpql: number; valuePerSar: number; refSpendK: number }> = {
  "Performance media": { cpql: 1400, valuePerSar: 120, refSpendK: 600 },
  "Property portal": { cpql: 1300, valuePerSar: 150, refSpendK: 400 },
  "Broker network": { cpql: 5000, valuePerSar: 160, refSpendK: 400 },
  "PR & brand": { cpql: 6500, valuePerSar: 60, refSpendK: 250 },
  "Outdoor": { cpql: 9000, valuePerSar: 60, refSpendK: 300 },
  "Influencer": { cpql: 2500, valuePerSar: 80, refSpendK: 200 },
};
export const WEIGHTS = { cpql: 30, value: 30, plan: 15, deadlines: 15, revisions: 10 };
const ON_TIME_PAR = 0.85, REVISIONS_PAR = 1.5, PLAN_DEV_PAR = 10, SCALE_ELASTICITY = 0.15;

const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const pts = (idx: number) => clamp(50 * idx);

export type MetricScore = { key: keyof typeof WEIGHTS; actual: number | null; benchmark: number | null; index: number | null; points: number; weight: number; unit: string };
export type VendorScore = {
  vendorId: string; vendor: string; category: string; costK: number;
  score: number; low: number; high: number; confidence: "High" | "Medium" | "Low"; rank: number;
  trend: "improving" | "declining" | "stable" | "n/a"; metrics: MetricScore[];
  incrementalShare: number | null; incrementalEvidence: "TEST" | "MMM" | "NONE";
  qualified: number; won: number; onTimePct: number | null; avgRevisions: number | null; planDeviationPct: number | null;
};

export async function buildScores(lang: Lang = "en", pre?: { unified?: Unified; incrementality?: Incrementality }) {
  const unified = pre?.unified ?? (await buildUnified(lang));
  const attributed: Record<string, number> = {};
  for (const v of unified.vendors) attributed[v.category] = (attributed[v.category] ?? 0) + v.verified.salesM;
  const inc = pre?.incrementality ?? (await buildIncrementality(lang, attributed));
  const [deliverables, vendorRecs] = await Promise.all([prisma.deliverable.findMany(), prisma.vendor.findMany()]);

  const scores: VendorScore[] = unified.vendors.map((v) => {
    const b = BENCHMARKS[v.category] ?? { cpql: 3000, valuePerSar: 100, refSpendK: 300 };
    const scale = Math.pow(Math.max(v.verified.costK, 1) / b.refSpendK, SCALE_ELASTICITY);
    const cpqlBench = b.cpql * scale, valueBench = b.valuePerSar / scale;
    const iv = inc.perVendor.find((x) => x.vendorId === v.id);
    // MMM on a channel with little spend variation is shrunk halfway towards "no adjustment".
    const mmmChannel = inc.mmm?.channels.find((c) => c.channel === v.category);
    const shrink = (s: number | null) => (s === null ? null : iv?.evidence === "MMM" && mmmChannel && !mmmChannel.reliable ? 1 + (s - 1) * 0.5 : s);
    const share = shrink(iv?.share ?? null), shareLow = shrink(iv?.low ?? null), shareHigh = shrink(iv?.high ?? null);

    const q = v.verified.qualified, w = v.verified.won;
    const cpql = q > 0 ? (v.verified.costK * 1000) / q : null;
    const valueRaw = v.verified.costK > 0 ? ((v.verified.salesM + v.verified.pipelineM) * 1e6) / (v.verified.costK * 1000) : 0;
    const value = valueRaw * (share ?? 1);

    // Commission is paid on sales, so spend-vs-plan is not under a commission vendor's control: neutral.
    const commission = vendorRecs.find((x) => x.id === v.id)?.model === "Commission";
    const cs = unified.campaigns.filter((c) => c.vendorId === v.id && c.status === "LIVE" && c.pacingPct !== null);
    const planDev = commission ? null : cs.length ? cs.reduce((s, c) => s + Math.abs(c.pacingPct! - 100), 0) / cs.length : null;
    const ds = deliverables.filter((d) => d.vendorId === v.id && d.deliveredAt);
    const onTime = ds.length ? ds.filter((d) => d.deliveredAt! <= new Date(d.dueDate.getTime() + 86_400_000)).length / ds.length : null;
    const revisions = ds.length ? ds.reduce((s, d) => s + d.revisions, 0) / ds.length : null;

    const idx = {
      cpql: cpql ? cpqlBench / cpql : 0.25,
      value: valueBench > 0 ? value / valueBench : 0,
      plan: planDev === null ? 1 : (PLAN_DEV_PAR + 5) / (planDev + 5),
      deadlines: onTime === null ? 1 : onTime / ON_TIME_PAR,
      revisions: revisions === null ? 1 : (REVISIONS_PAR + 0.5) / (revisions + 0.5),
    };
    const total = (i: typeof idx) => (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((s, k) => s + (pts(i[k]) * WEIGHTS[k]) / 100, 0);
    const score = total(idx);
    // Uncertainty: Poisson noise on qualified leads and wins, plus the incrementality range.
    const seQ = q > 0 ? 1.645 / Math.sqrt(q) : 0.5, seW = 1.645 / Math.sqrt(Math.max(w, 1));
    const lowIdx = { ...idx, cpql: idx.cpql * (1 - Math.min(0.6, seQ)), value: valueBench > 0 ? (valueRaw * (shareLow ?? share ?? 1) * (1 - Math.min(0.6, seW * 0.5))) / valueBench : 0 };
    const highIdx = { ...idx, cpql: idx.cpql * (1 + Math.min(0.6, seQ)), value: valueBench > 0 ? (valueRaw * (shareHigh ?? share ?? 1) * (1 + Math.min(0.6, seW * 0.5))) / valueBench : 0 };
    const low = Math.min(score, total(lowIdx)), high = Math.max(score, total(highIdx));
    const width = high - low;

    // Trend: verified cost per qualified lead, last two months vs earlier months.
    const months = new Map<string, { cost: number; q: number }>();
    for (const c of unified.campaigns.filter((c) => c.vendorId === v.id)) for (const m of c.months) {
      const e = months.get(m.month) ?? { cost: 0, q: 0 };
      e.cost += m.costK; e.q += m.qualified; months.set(m.month, e);
    }
    const ms = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, x]) => x);
    let trend: VendorScore["trend"] = "n/a";
    if (ms.length >= 4) {
      const cp = (xs: { cost: number; q: number }[]) => xs.reduce((s, x) => s + x.cost, 0) / Math.max(1, xs.reduce((s, x) => s + x.q, 0));
      const ratio = cp(ms.slice(-2)) / cp(ms.slice(0, -2));
      trend = ratio < 0.9 ? "improving" : ratio > 1.1 ? "declining" : "stable";
    }

    const metrics: MetricScore[] = [
      { key: "cpql", actual: cpql === null ? null : Math.round(cpql), benchmark: Math.round(cpqlBench), index: r1(idx.cpql), points: r1(pts(idx.cpql)), weight: WEIGHTS.cpql, unit: "SAR" },
      { key: "value", actual: r1(value), benchmark: r1(valueBench), index: r1(idx.value), points: r1(pts(idx.value)), weight: WEIGHTS.value, unit: "SAR/SAR" },
      { key: "plan", actual: planDev === null ? null : r1(planDev), benchmark: PLAN_DEV_PAR, index: r1(idx.plan), points: r1(pts(idx.plan)), weight: WEIGHTS.plan, unit: "%" },
      { key: "deadlines", actual: onTime === null ? null : Math.round(onTime * 100), benchmark: ON_TIME_PAR * 100, index: r1(idx.deadlines), points: r1(pts(idx.deadlines)), weight: WEIGHTS.deadlines, unit: "%" },
      { key: "revisions", actual: revisions === null ? null : r1(revisions), benchmark: REVISIONS_PAR, index: r1(idx.revisions), points: r1(pts(idx.revisions)), weight: WEIGHTS.revisions, unit: "" },
    ];
    return {
      vendorId: v.id, vendor: v.name, category: v.category, costK: v.verified.costK,
      score: Math.round(score), low: Math.round(low), high: Math.round(high),
      confidence: width < 12 ? "High" : width < 25 ? "Medium" : "Low", rank: 0, trend, metrics,
      incrementalShare: share === null ? null : Math.round(share * 100) / 100, incrementalEvidence: iv?.evidence ?? "NONE",
      qualified: q, won: w, onTimePct: onTime === null ? null : Math.round(onTime * 100), avgRevisions: revisions === null ? null : r1(revisions), planDeviationPct: planDev === null ? null : r1(planDev),
    } satisfies VendorScore;
  });
  scores.sort((a, b) => b.score - a.score).forEach((s, i) => (s.rank = i + 1));
  const method = tx(lang,
    "Each metric is indexed against its channel benchmark, adjusted for budget size (cost per result rises with scale). 50 = at benchmark, 100 = twice as good. Value is CRM revenue plus stage-weighted pipeline per SAR spent, multiplied by the measured incremental share where a test or the media-mix model provides one. Benchmarks are assumptions to calibrate.",
    "يُقاس كل مؤشر مقارنةً بمعيار قناته بعد تعديله حسب حجم الميزانية (ترتفع تكلفة النتيجة مع زيادة الحجم). 50 = عند المعيار، و100 = ضعف الأداء المعياري. القيمة هي إيرادات نظام إدارة العملاء مضافاً إليها خط المبيعات المرجّح بالمرحلة لكل ريال منفق، مضروبة في نسبة الأثر الإضافي المقاسة عند توفّر اختبار أو نموذج مزيج إعلامي. المعايير افتراضات تحتاج إلى معايرة.");
  return { scores, unified, incrementality: inc, method };
}
export type Scores = Awaited<ReturnType<typeof buildScores>>;
