// Incrementality: what a vendor CAUSED vs what would have happened anyway.
//
//  1. Audience holdout — a share of the target audience is never shown the vendor's ads; compare conversion rates.
//  2. Geo test — the vendor runs in some regions and not in matched ones; compare against a scaled control.
//  3. Media-mix model — weekly regression of sales on adstocked, saturating spend per channel (with trend,
//     Ramadan and summer effects), bootstrapped for uncertainty. Directional unless ≥ 52 weeks with spend variation.
//
// Tests are the gold standard; the MMM fills gaps for vendors that have not been tested.
import { prisma } from "./prisma";
import { ensureOpsSeeded } from "./seed-ops";
import { type Lang, tx, K, M, nm } from "./i18n";
import { powerHoldout, powerGeo } from "./stats";
export { powerHoldout, powerGeo };

const Z90 = 1.645, Z80POWER = 0.842;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pFromZ = (z: number) => { // two-sided p-value, normal approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.min(1, 2 * p);
};

// --------------------------------------------------------------- test readouts
export type Readout = {
  liftPct: number; liftLowPct: number; liftHighPct: number; // relative lift vs counterfactual, 90% CI
  incremental: number; incrementalShare: number; incrementalShareLow: number; incrementalShareHigh: number; // share of observed results the vendor caused
  pValue: number; significant: boolean; costPerIncremental: number | null; // SAR
  metric: string; observed: number; counterfactual: number;
};

export function holdoutReadout(d: { exposedUsers: number; holdoutUsers: number; exposedConv: number; holdoutConv: number; spendK: number }, metric: string): Readout {
  const pe = d.exposedConv / d.exposedUsers, ph = d.holdoutConv / d.holdoutUsers;
  const se = Math.sqrt((pe * (1 - pe)) / d.exposedUsers + (ph * (1 - ph)) / d.holdoutUsers);
  const diff = pe - ph;
  const incremental = diff * d.exposedUsers;
  const share = (x: number) => (x * d.exposedUsers) / d.exposedConv;
  return {
    liftPct: r1((pe / ph - 1) * 100), liftLowPct: r1(((diff - Z90 * se) / ph) * 100), liftHighPct: r1(((diff + Z90 * se) / ph) * 100),
    incremental: Math.round(incremental), incrementalShare: r2(share(diff)), incrementalShareLow: r2(Math.max(0, share(diff - Z90 * se))), incrementalShareHigh: r2(Math.min(1, share(diff + Z90 * se))),
    pValue: r2(pFromZ(diff / se)), significant: pFromZ(diff / se) < 0.1,
    costPerIncremental: incremental > 0 ? Math.round((d.spendK * 1000) / incremental) : null,
    metric, observed: d.exposedConv, counterfactual: Math.round(ph * d.exposedUsers),
  };
}

export function geoReadout(d: { spendK: number; pre: { test: number[]; control: number[] }; post: { test: number[]; control: number[] } }, metric: string): Readout {
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const ratio = sum(d.pre.test) / sum(d.pre.control);
  const resid = d.pre.test.map((x, i) => x - d.pre.control[i] * ratio);
  const sd = Math.sqrt(resid.reduce((s, e) => s + e * e, 0) / Math.max(1, resid.length - 1));
  const cf = sum(d.post.control) * ratio;
  const obs = sum(d.post.test);
  const effect = obs - cf;
  const se = sd * Math.sqrt(d.post.test.length) * Math.sqrt(1 + d.post.test.length / d.pre.test.length);
  return {
    liftPct: r1((effect / cf) * 100), liftLowPct: r1(((effect - Z90 * se) / cf) * 100), liftHighPct: r1(((effect + Z90 * se) / cf) * 100),
    incremental: Math.round(effect), incrementalShare: r2(Math.max(0, effect / obs)), incrementalShareLow: r2(Math.max(0, (effect - Z90 * se) / obs)), incrementalShareHigh: r2(Math.min(1, Math.max(0, (effect + Z90 * se) / obs))),
    pValue: r2(pFromZ(effect / se)), significant: pFromZ(effect / se) < 0.1,
    costPerIncremental: effect > 0 ? Math.round((d.spendK * 1000) / effect) : null,
    metric, observed: Math.round(obs), counterfactual: Math.round(cf),
  };
}

// ----------------------------------------------------------- media-mix model
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function ridge(X: number[][], y: number[], lambda: number, active: boolean[]) {
  const p = X[0].length;
  const cols = [...Array(p).keys()].filter((j) => active[j]);
  const A = cols.map((i) => cols.map((j) => X.reduce((s, row) => s + row[i] * row[j], 0) + (i === j && i > 0 ? lambda : 0)));
  const b = cols.map((i) => X.reduce((s, row, t) => s + row[i] * y[t], 0));
  const sol = solve(A, b);
  const beta = Array(p).fill(0);
  cols.forEach((j, k) => (beta[j] = sol[k]));
  return beta;
}
const adstock = (x: number[], decay: number) => { let a = 0; return x.map((v) => (a = v + decay * a)); };
const hill = (a: number[], half: number) => a.map((v) => v / (v + half));

export type MmmChannel = {
  channel: string; spendK: number; contributionM: number; lowM: number; highM: number; salesPerSar: number;
  attributedM: number | null; incrementalRatio: number | null; incrementalRatioLow: number | null; incrementalRatioHigh: number | null;
  decay: number; spendVariation: number; reliable: boolean; caveat: string | null;
};
export type Mmm = {
  weeks: number; r2: number; mape: number; sufficient: boolean; periodLabel: string; baseShare: number;
  channels: MmmChannel[]; notes: string[];
};

export async function fitMmm(lang: Lang = "en", attributedByChannel: Record<string, number> = {}): Promise<Mmm | null> {
  await ensureOpsSeeded();
  const [cw, sw] = await Promise.all([prisma.channelWeek.findMany(), prisma.salesWeek.findMany()]);
  if (sw.length < 20) return null;
  const weeks = [...sw].sort((a, b) => a.week.localeCompare(b.week));
  const channels = [...new Set(cw.map((c) => c.channel))].sort();
  const spend: Record<string, number[]> = Object.fromEntries(channels.map((ch) => [ch, weeks.map((w) => cw.find((c) => c.week === w.week && c.channel === ch)?.spendK ?? 0)]));
  const y = weeks.map((w) => w.salesM);
  const T = weeks.length;
  const base = weeks.map((w, t) => [1, t / T, w.ramadan ? 1 : 0, ["07", "08"].includes(w.week.slice(5, 7)) ? 1 : 0]);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const params: Record<string, { decay: number; k: number }> = Object.fromEntries(channels.map((ch) => [ch, { decay: 0.3, k: 1.5 }]));
  const feature = (ch: string, p = params[ch]) => { const a = adstock(spend[ch], p.decay); return hill(a, Math.max(1e-6, p.k * mean(a))); };
  const design = () => base.map((row, t) => [...row, ...channels.map((ch) => feats[ch][t])]);
  let feats: Record<string, number[]> = Object.fromEntries(channels.map((ch) => [ch, feature(ch)]));
  const lambda = 0.05;
  const fit = () => {
    const X = design();
    const active = X[0].map(() => true);
    let beta = ridge(X, y, lambda, active);
    for (let it = 0; it < channels.length; it++) { // non-negative media effects
      const neg = channels.findIndex((_, j) => active[4 + j] && beta[4 + j] < 0);
      if (neg < 0) break;
      active[4 + neg] = false;
      beta = ridge(X, y, lambda, active);
    }
    const yhat = X.map((row) => row.reduce((s, x, j) => s + x * beta[j], 0));
    const sse = y.reduce((s, v, t) => s + (v - yhat[t]) ** 2, 0);
    return { X, beta, yhat, sse, active };
  };
  // Coordinate search over each channel's carry-over (decay) and saturation (half-effect point).
  for (let pass = 0; pass < 2; pass++) {
    for (const ch of channels) {
      let best = { sse: Infinity, p: params[ch] };
      for (const decay of [0.1, 0.3, 0.5, 0.7]) for (const k of [0.75, 1.5, 3]) {
        params[ch] = { decay, k };
        feats[ch] = feature(ch);
        const f = fit();
        if (f.sse < best.sse) best = { sse: f.sse, p: { decay, k } };
      }
      params[ch] = best.p;
      feats[ch] = feature(ch);
    }
  }
  const f = fit();
  const ybar = mean(y);
  const r2v = 1 - f.sse / y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const mape = mean(y.map((v, t) => Math.abs(v - f.yhat[t]) / v)) * 100;
  const period = weeks.map((w, t) => (w.week >= "2026-01-01" ? t : -1)).filter((t) => t >= 0);
  const contrib = (beta: number[], j: number) => period.reduce((s, t) => s + beta[4 + j] * f.X[t][4 + j], 0);

  // Moving-block bootstrap of residuals for uncertainty (nonlinear parameters held fixed).
  const resid = y.map((v, t) => v - f.yhat[t]);
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const B = 150, block = 4;
  const draws: number[][] = channels.map(() => []);
  for (let b = 0; b < B; b++) {
    const e: number[] = [];
    while (e.length < T) { const s0 = Math.floor(rand() * (T - block)); for (let k = 0; k < block && e.length < T; k++) e.push(resid[s0 + k]); }
    const ys = f.yhat.map((v, t) => v + e[t]);
    const beta = ridge(f.X, ys, lambda, f.active).map((x, j) => (j >= 4 ? Math.max(0, x) : x));
    channels.forEach((_, j) => draws[j].push(contrib(beta, j)));
  }
  const pct = (a: number[], q: number) => { const s = [...a].sort((x, z) => x - z); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const totalPeriod = period.reduce((s, t) => s + y[t], 0);

  const out: MmmChannel[] = channels.map((ch, j) => {
    const sp = period.reduce((s, t) => s + spend[ch][t], 0);
    const c = contrib(f.beta, j);
    const cv = Math.sqrt(mean(spend[ch].map((x) => (x - mean(spend[ch])) ** 2))) / Math.max(1e-6, mean(spend[ch]));
    const attributed = attributedByChannel[ch] ?? null;
    const caveat = ch === "Broker network"
      ? tx(lang, "Commission is paid on sales, so spend follows sales — the model can overstate this channel.", "تُدفع العمولة على المبيعات، فيتبع الإنفاق المبيعات — قد يبالغ النموذج في تقدير هذه القناة.")
      : cv < 0.2 ? tx(lang, "Spend barely varied, so its effect cannot be separated reliably.", "لم يتغيّر الإنفاق كثيراً، فلا يمكن فصل أثره بموثوقية.") : null;
    return {
      channel: ch, spendK: r1(sp), contributionM: r1(c), lowM: r1(pct(draws[j], 0.05)), highM: r1(pct(draws[j], 0.95)),
      salesPerSar: sp > 0 ? r1((c * 1000) / sp) : 0,
      attributedM: attributed === null ? null : r1(attributed),
      incrementalRatio: attributed ? r2(c / attributed) : null,
      incrementalRatioLow: attributed ? r2(pct(draws[j], 0.05) / attributed) : null,
      incrementalRatioHigh: attributed ? r2(pct(draws[j], 0.95) / attributed) : null,
      decay: params[ch].decay, spendVariation: r2(cv), reliable: cv >= 0.2 && ch !== "Broker network", caveat,
    };
  });
  const media = out.reduce((s, c) => s + c.contributionM, 0);
  const sufficient = T >= 52;
  const notes = [
    tx(lang, `${T} weeks of history; fit R² ${r2(r2v)}, mean error ${r1(mape)}%.`, `${T} أسبوعاً من البيانات التاريخية؛ جودة المطابقة R² ${r2(r2v)}، ومتوسط الخطأ ${r1(mape)}%.`),
    sufficient
      ? tx(lang, "Enough history to be directionally useful. Validate big decisions with a test.", "البيانات كافية لاستخدام النتائج بشكل استرشادي. تحقّقوا من القرارات الكبيرة باختبار.")
      : tx(lang, "Less than 52 weeks of history — treat as indicative only.", "أقل من 52 أسبوعاً من البيانات — النتائج إرشادية فقط."),
    tx(lang, "Sample history (seeded). Replace with real weekly spend per channel and CRM sales before relying on it.", "بيانات تاريخية تجريبية. استبدلوها بالإنفاق الأسبوعي الفعلي لكل قناة ومبيعات نظام إدارة العملاء قبل الاعتماد عليها."),
  ];
  return { weeks: T, r2: r2(r2v), mape: r1(mape), sufficient, periodLabel: "Jan–May 2026", baseShare: r2(1 - media / totalPeriod), channels: out, notes };
}

// ------------------------------------------------------------ per-vendor view
export type VendorIncrementality = {
  vendorId: string; evidence: "TEST" | "MMM" | "NONE"; share: number | null; low: number | null; high: number | null;
  significant: boolean | null; source: string; text: string;
};

export async function buildIncrementality(lang: Lang = "en", attributedByChannel: Record<string, number> = {}) {
  await ensureOpsSeeded();
  const [experiments, vendors, mmm] = await Promise.all([prisma.experiment.findMany(), prisma.vendor.findMany(), fitMmm(lang, attributedByChannel)]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  const tests = experiments.map((e) => {
    const design = JSON.parse(e.designJson);
    const data = e.dataJson ? JSON.parse(e.dataJson) : null;
    const readout = e.status === "COMPLETED" && data ? (e.kind === "HOLDOUT" ? holdoutReadout(data, design.metric) : geoReadout(data, design.metric)) : null;
    const mde = e.kind === "HOLDOUT" ? powerHoldout(design.weeklyConversions ?? 40, design.holdoutPct ?? 20, design.weeks ?? 6) : powerGeo(design.weeklyVolume ?? 20, design.cv ?? 0.1, design.weeks ?? 6, design.preWeeks ?? 6);
    const kindLabel = e.kind === "HOLDOUT" ? tx(lang, "Audience holdout", "مجموعة مستبعدة من الجمهور") : tx(lang, "Geo test", "اختبار جغرافي");
    const metric = /qualified/i.test(design.metric ?? "") ? tx(lang, "CRM-qualified leads", "العملاء المؤهلون في النظام") : tx(lang, "CRM leads", "العملاء المحتملون في النظام");
    design.metric = metric;
    if (readout) readout.metric = metric;
    return { id: e.id, kind: e.kind, vendorId: e.vendorId, vendor: vName.get(e.vendorId) ?? "", campaign: e.campaign, name: `${kindLabel} — ${nm(lang, e.campaign)}`, status: e.status, design, readout, mdePct: mde, approvedBy: e.approvedBy, createdAt: e.createdAt.toISOString() };
  });
  const perVendor: VendorIncrementality[] = vendors.filter((v) => (v.status ?? "ACTIVE") !== "BENCH").map((v) => {
    const t = tests.filter((x) => x.vendorId === v.id && x.readout).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (t?.readout) {
      const r = t.readout;
      return {
        vendorId: v.id, evidence: "TEST", share: r.incrementalShare, low: r.incrementalShareLow, high: r.incrementalShareHigh, significant: r.significant, source: t.name,
        text: r.significant
          ? tx(lang, `${t.kind === "HOLDOUT" ? "Holdout" : "Geo"} test: ${Math.round(r.incrementalShare * 100)}% of ${r.metric} were caused by the vendor (90% range ${Math.round(r.incrementalShareLow * 100)}–${Math.round(r.incrementalShareHigh * 100)}%); cost per incremental result SAR ${r.costPerIncremental ?? "n/a"}.`,
              `اختبار ${t.kind === "HOLDOUT" ? "مجموعة مستبعدة" : "جغرافي"}: ${Math.round(r.incrementalShare * 100)}% من النتائج تسبّب بها المورد فعلاً (النطاق عند ثقة 90%: ${Math.round(r.incrementalShareLow * 100)}–${Math.round(r.incrementalShareHigh * 100)}%)؛ تكلفة النتيجة الإضافية ${r.costPerIncremental ?? "غير متاحة"} ر.س.`)
          : tx(lang, `${t.kind === "HOLDOUT" ? "Holdout" : "Geo"} test: no significant lift (${r.liftPct}%, 90% range ${r.liftLowPct}% to ${r.liftHighPct}%) — the vendor's effect is not proven.`,
              `اختبار ${t.kind === "HOLDOUT" ? "مجموعة مستبعدة" : "جغرافي"}: لا يوجد أثر إضافي ذو دلالة (${r.liftPct}%، النطاق عند ثقة 90%: ${r.liftLowPct}% إلى ${r.liftHighPct}%) — أثر المورد غير مُثبت.`),
      };
    }
    const ch = mmm?.channels.find((c) => c.channel === v.category);
    if (ch && ch.incrementalRatio !== null) {
      return {
        vendorId: v.id, evidence: "MMM", share: ch.incrementalRatio, low: ch.incrementalRatioLow, high: ch.incrementalRatioHigh, significant: ch.reliable ? ch.lowM > 0 : null, source: "MMM",
        text: tx(lang,
          `Media-mix model: incremental sales ≈ ${Math.round(ch.incrementalRatio * 100)}% of CRM-attributed sales (90% range ${Math.round((ch.incrementalRatioLow ?? 0) * 100)}–${Math.round((ch.incrementalRatioHigh ?? 0) * 100)}%)${ch.reliable ? "" : " — low reliability"}.`,
          `نموذج مزيج الإعلام: المبيعات الإضافية ≈ ${Math.round(ch.incrementalRatio * 100)}% من المبيعات المنسوبة في النظام (النطاق عند ثقة 90%: ${Math.round((ch.incrementalRatioLow ?? 0) * 100)}–${Math.round((ch.incrementalRatioHigh ?? 0) * 100)}%)${ch.reliable ? "" : " — موثوقية منخفضة"}.`),
      };
    }
    return { vendorId: v.id, evidence: "NONE", share: null, low: null, high: null, significant: null, source: "", text: tx(lang, "No incrementality evidence yet.", "لا توجد أدلة على الأثر الإضافي بعد.") };
  });
  return { tests, mmm, perVendor };
}
export type Incrementality = Awaited<ReturnType<typeof buildIncrementality>>;

// ------------------------------------------------------------ test management
export async function createTest(input: { vendorId: string; campaign: string; kind: "HOLDOUT" | "GEO"; weeks: number; holdoutPct?: number; weeklyConversions?: number; weeklyVolume?: number; name?: string }, lang: Lang = "en") {
  await ensureOpsSeeded();
  const v = (await prisma.vendor.findMany()).find((x) => x.id === input.vendorId);
  if (!v) throw new Error(tx(lang, "Vendor not found.", "المورد غير موجود."));
  const weeks = Math.min(16, Math.max(2, Math.round(input.weeks || 6)));
  const design = input.kind === "HOLDOUT"
    ? { holdoutPct: Math.min(50, Math.max(5, input.holdoutPct ?? 20)), weeks, metric: "CRM-qualified leads", weeklyConversions: input.weeklyConversions ?? 40 }
    : { weeks, preWeeks: 6, metric: "CRM leads", weeklyVolume: input.weeklyVolume ?? 20, cv: 0.1, test: [], control: [] };
  await prisma.experiment.create({
    data: { kind: input.kind, vendorId: v.id, campaign: input.campaign, status: "PLANNED", name: input.name ?? `${input.kind === "HOLDOUT" ? "Audience holdout" : "Geo test"} — ${input.campaign}`, designJson: JSON.stringify(design) },
  });
}

export async function approveTest(id: string, approver: string, lang: Lang = "en") {
  if (!approver?.trim()) throw new Error(tx(lang, "Approver name is required.", "اسم المعتمِد مطلوب."));
  const e = (await prisma.experiment.findMany()).find((x) => x.id === id);
  if (!e) throw new Error(tx(lang, "Test not found.", "الاختبار غير موجود."));
  if (e.status !== "PLANNED") throw new Error(tx(lang, "Only planned tests can be approved.", "لا يمكن اعتماد إلا الاختبارات المخطط لها."));
  await prisma.experiment.update({ where: { id }, data: { status: "RUNNING", approvedBy: approver.trim() } });
  await prisma.marketingAction.create({ data: { type: "TEST_APPROVED", campaign: e.campaign, detail: tx(lang, `${e.name} approved by ${approver.trim()}.`, `اعتمد ${approver.trim()} الاختبار: ${e.name}.`) } });
}

void K; void M; void nm;
