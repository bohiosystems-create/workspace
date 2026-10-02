import { prisma } from "./prisma";
import { MONTHS } from "./seed-marketing";
import { queueKinanEvent } from "./kinan";
import { type Lang, tx, K, M, nm, dt, hrs } from "./i18n";

const TODAY = new Date("2026-06-08");
const DAY = 86_400_000;

export type CampaignRow = {
  id: string;
  name: string;
  vendor: string;
  vendorId: string;
  asset: string;
  channel: string;
  status: "LIVE" | "PAUSED" | "ENDED";
  budgetK: number;
  spendK: number;
  remainingK: number;
  pacingPct: number | null; // % of budget spent vs % of flight elapsed (100 = on plan)
  leads: number;
  qualified: number;
  viewings: number;
  reservations: number;
  contracts: number;
  revenueM: number;
  cplSar: number | null;
  qualRatePct: number | null;
  leadToContractPct: number | null;
  cacK: number | null; // SAR K of marketing spend per contract
  costToSalesPct: number | null; // marketing spend / contracted sales value
  cplTrendPct: number | null; // latest month CPL vs prior months
  latestRespHrs: number | null;
  latestQualRatePct: number | null;
  attribution: "Direct" | "Weak"; // brand channels convert through other touchpoints
  health: "Strong" | "OK" | "Weak" | "Idle";
};

export type VendorRow = {
  id: string;
  name: string;
  category: string;
  model: string;
  contact: string;
  contractEnd: string;
  monthsToExpiry: number;
  campaigns: number;
  liveCampaigns: number;
  spendK: number;
  spendSharePct: number;
  leads: number;
  qualified: number;
  contracts: number;
  revenueM: number;
  costToSalesPct: number | null;
  cacK: number | null;
  qualRatePct: number | null;
  slaResponseHrs: number;
  slaQualifiedPct: number;
  latestRespHrs: number | null;
  slaBreaches: string[]; // localised text
  slaBreachCodes: string[]; // language-neutral, used for stable keys
  score: number;
  scoreParts: { efficiency: number; quality: number; responsiveness: number; delivery: number };
  verdict: "Scale" | "Hold" | "Fix" | "Review";
};

export type MktAlert = {
  severity: "crit" | "warn" | "info";
  title: string;
  detail: string;
  tag: string;
};

export type Recommendation =
  | { type: "PAUSE"; campaignId: string; campaign: string; vendor: string; rationale: string; impact: string }
  | {
      type: "SHIFT_BUDGET";
      campaignId: string; campaign: string; vendor: string;
      toCampaignId: string; toCampaign: string; toVendor: string;
      amountK: number; rationale: string; impact: string;
    };

export type MarketingDashboard = {
  currency: string;
  asOf: string;
  kpis: {
    spendK: number;
    leads: number;
    contracts: number;
    revenueM: number;
    costToSalesPct: number | null;
    cacK: number | null;
    liveCampaigns: number;
    alertCount: number;
  };
  monthly: { month: string; spendK: number; leads: number; contracts: number; revenueM: number }[];
  funnel: { stage: string; value: number }[];
  vendors: VendorRow[];
  campaigns: CampaignRow[];
  assets: { asset: string; spendK: number; contracts: number; revenueM: number; costToSalesPct: number | null }[];
  alerts: MktAlert[];
  recommendations: Recommendation[];
  actions: { id: string; createdAt: string; type: string; campaign: string; detail: string }[];
};

const round = (x: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
const pct = (n: number, d: number) => (d > 0 ? round((n / d) * 100) : null);
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const monthLabel = (m: string) =>
  new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const VERDICT_AR: Record<string, string> = { Scale: "توسّع", Hold: "إبقاء", Fix: "تصحيح", Review: "مراجعة" };
const tr = (l: Lang, v: string) => (l === "ar" ? VERDICT_AR[v] ?? v : v);

const WEAK_ATTRIBUTION = new Set(["PR", "OOH"]);

export async function buildMarketingDashboard(lang: Lang = "en"): Promise<MarketingDashboard> {
  const [vendors, campaigns, actions] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { vendor: true, asset: true, months: true } }),
    prisma.marketingAction.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  // ---- Campaign level -----------------------------------------------------
  const rows: CampaignRow[] = campaigns.map((c) => {
    const ms = [...c.months].sort((a, b) => a.month.localeCompare(b.month));
    const sum = (k: "spendK" | "leads" | "qualified" | "viewings" | "reservations" | "contracts" | "revenueM") =>
      ms.reduce((s, m) => s + m[k], 0);
    const spendK = sum("spendK");
    const leads = sum("leads");
    const qualified = sum("qualified");
    const contracts = sum("contracts");
    const revenueM = round(sum("revenueM"));

    const last = ms[ms.length - 1];
    const prior = ms.slice(0, -1);
    const priorLeads = prior.reduce((s, m) => s + m.leads, 0);
    const priorSpend = prior.reduce((s, m) => s + m.spendK, 0);
    const cplNow = last && last.leads > 0 ? last.spendK / last.leads : null;
    const cplPrior = priorLeads > 0 ? priorSpend / priorLeads : null;

    const start = c.startDate.getTime();
    const end = c.endDate.getTime();
    const elapsed = clamp((TODAY.getTime() - start) / (end - start));
    const spentFrac = c.budgetK > 0 ? spendK / c.budgetK : 0;
    const pacingPct = elapsed > 0.05 ? round((spentFrac / elapsed) * 100, 0) : null;

    const costToSalesPct = revenueM > 0 ? round((spendK / (revenueM * 1000)) * 100, 2) : null;
    const attribution = WEAK_ATTRIBUTION.has(c.channel) ? "Weak" : "Direct";

    let health: CampaignRow["health"] = "OK";
    if (c.status !== "LIVE") health = "Idle";
    else if (costToSalesPct === null || costToSalesPct > 3) health = "Weak";
    else if (costToSalesPct <= 2) health = "Strong";

    return {
      id: c.id,
      name: c.name,
      vendor: c.vendor.name,
      vendorId: c.vendorId,
      asset: c.asset.name,
      channel: c.channel,
      status: c.status as CampaignRow["status"],
      budgetK: round(c.budgetK, 0),
      spendK: round(spendK, 0),
      remainingK: round(c.budgetK - spendK, 0),
      pacingPct,
      leads,
      qualified,
      viewings: sum("viewings"),
      reservations: sum("reservations"),
      contracts,
      revenueM,
      cplSar: leads > 0 ? round((spendK * 1000) / leads, 0) : null,
      qualRatePct: pct(qualified, leads),
      leadToContractPct: pct(contracts, leads),
      cacK: contracts > 0 ? round(spendK / contracts, 1) : null,
      costToSalesPct,
      cplTrendPct: cplNow !== null && cplPrior !== null ? round((cplNow / cplPrior - 1) * 100, 0) : null,
      latestRespHrs: last && last.respHrs > 0 ? last.respHrs : null,
      latestQualRatePct: last ? pct(last.qualified, last.leads) : null,
      attribution,
      health,
    };
  });

  // ---- Vendor level -------------------------------------------------------
  const totalSpend = rows.reduce((s, r) => s + r.spendK, 0);
  const vendorRows: VendorRow[] = vendors.filter((v) => (v.status ?? "ACTIVE") !== "BENCH" && rows.some((r) => r.vendorId === v.id)).map((v) => {
    const cs = rows.filter((r) => r.vendorId === v.id);
    const spendK = cs.reduce((s, r) => s + r.spendK, 0);
    const leads = cs.reduce((s, r) => s + r.leads, 0);
    const qualified = cs.reduce((s, r) => s + r.qualified, 0);
    const contracts = cs.reduce((s, r) => s + r.contracts, 0);
    const revenueM = round(cs.reduce((s, r) => s + r.revenueM, 0));
    const live = cs.filter((r) => r.status === "LIVE");

    // Spend-weighted latest response time and qualified rate across live campaigns.
    const respBase = live.filter((r) => r.latestRespHrs !== null);
    const respW = respBase.reduce((s, r) => s + r.spendK, 0);
    const latestRespHrs = respW > 0 ? round(respBase.reduce((s, r) => s + r.latestRespHrs! * r.spendK, 0) / respW) : null;
    const qBase = live.filter((r) => r.latestQualRatePct !== null);
    const qW = qBase.reduce((s, r) => s + r.spendK, 0);
    const latestQual = qW > 0 ? qBase.reduce((s, r) => s + r.latestQualRatePct! * r.spendK, 0) / qW : null;

    const costToSalesPct = revenueM > 0 ? round((spendK / (revenueM * 1000)) * 100, 2) : null;
    const qualRatePct = pct(qualified, leads);

    const breaches: string[] = [];
    const breachCodes: string[] = [];
    if (latestRespHrs !== null && latestRespHrs > v.slaResponseHrs) {
      breachCodes.push(`response:${latestRespHrs}:${v.slaResponseHrs}`);
      breaches.push(tx(lang, `Response ${latestRespHrs}h vs ${v.slaResponseHrs}h SLA`, `زمن الاستجابة ${hrs(lang, latestRespHrs)} مقابل ${hrs(lang, v.slaResponseHrs)} في اتفاقية الخدمة`));
    }
    if (v.slaQualifiedPct > 0 && latestQual !== null && latestQual < v.slaQualifiedPct) {
      breachCodes.push(`quality:${round(latestQual)}:${v.slaQualifiedPct}`);
      breaches.push(tx(lang, `Qualified ${round(latestQual)}% vs ${v.slaQualifiedPct}% SLA`, `نسبة المؤهلين ${round(latestQual)}% مقابل ${v.slaQualifiedPct}% في اتفاقية الخدمة`));
    }

    // Composite score (0–100): efficiency 40, quality 25, responsiveness 20, delivery 15.
    const efficiency = costToSalesPct === null ? 0 : clamp((4 - costToSalesPct) / 3) * 40;
    const quality = qualRatePct === null ? 0 : clamp(qualRatePct / 50) * 25;
    const responsiveness =
      latestRespHrs === null ? 10 : latestRespHrs <= v.slaResponseHrs ? 20 : clamp(2 - latestRespHrs / v.slaResponseHrs) * 20;
    const paced = live.filter((r) => r.pacingPct !== null);
    const avgDev = paced.length ? paced.reduce((s, r) => s + Math.abs(r.pacingPct! - 100), 0) / paced.length : 0;
    const delivery = clamp(1 - Math.max(0, avgDev - 10) / 40) * 15;
    const score = Math.round(efficiency + quality + responsiveness + delivery);

    const monthsToExpiry = Math.round((v.contractEnd.getTime() - TODAY.getTime()) / (30.44 * DAY));
    let verdict: VendorRow["verdict"] = "Hold";
    if (score >= 75 && breaches.length === 0) verdict = "Scale";
    else if (score < 45) verdict = "Review";
    else if (breaches.length > 0) verdict = "Fix";

    return {
      id: v.id, name: v.name, category: v.category, model: v.model, contact: v.contact,
      contractEnd: v.contractEnd.toISOString(), monthsToExpiry,
      campaigns: cs.length, liveCampaigns: live.length,
      spendK: round(spendK, 0),
      spendSharePct: totalSpend > 0 ? round((spendK / totalSpend) * 100, 0) : 0,
      leads, qualified, contracts, revenueM, costToSalesPct,
      cacK: contracts > 0 ? round(spendK / contracts, 1) : null,
      qualRatePct,
      slaResponseHrs: v.slaResponseHrs, slaQualifiedPct: v.slaQualifiedPct,
      latestRespHrs, slaBreaches: breaches, slaBreachCodes: breachCodes, score,
      scoreParts: {
        efficiency: Math.round(efficiency), quality: Math.round(quality),
        responsiveness: Math.round(responsiveness), delivery: Math.round(delivery),
      },
      verdict,
    };
  }).sort((a, b) => b.score - a.score);

  // ---- Portfolio roll-ups -------------------------------------------------
  const all = campaigns.flatMap((c) => c.months);
  const monthly = MONTHS.map((month) => {
    const ms = all.filter((m) => m.month === month);
    return {
      month,
      spendK: round(ms.reduce((s, m) => s + m.spendK, 0), 0),
      leads: ms.reduce((s, m) => s + m.leads, 0),
      contracts: ms.reduce((s, m) => s + m.contracts, 0),
      revenueM: round(ms.reduce((s, m) => s + m.revenueM, 0)),
    };
  });
  const tot = (k: keyof (typeof all)[number]) => all.reduce((s, m) => s + (m[k] as number), 0);
  const funnel = [
    { stage: "Leads", value: tot("leads") },
    { stage: "Qualified", value: tot("qualified") },
    { stage: "Viewings", value: tot("viewings") },
    { stage: "Reservations", value: tot("reservations") },
    { stage: "Contracts", value: tot("contracts") },
  ];
  const revenueM = round(tot("revenueM"));
  const contracts = tot("contracts");

  const assetNames = [...new Set(rows.map((r) => r.asset))];
  const assets = assetNames.map((asset) => {
    const cs = rows.filter((r) => r.asset === asset);
    const spendK = cs.reduce((s, r) => s + r.spendK, 0);
    const rev = round(cs.reduce((s, r) => s + r.revenueM, 0));
    return {
      asset, spendK: round(spendK, 0), contracts: cs.reduce((s, r) => s + r.contracts, 0),
      revenueM: rev, costToSalesPct: rev > 0 ? round((spendK / (rev * 1000)) * 100, 2) : null,
    };
  }).sort((a, b) => b.revenueM - a.revenueM);

  // ---- Alerts (rule-based) ------------------------------------------------
  const alerts: MktAlert[] = [];
  const liveRows = rows.filter((r) => r.status === "LIVE");

  for (const v of vendorRows) {
    const vn = nm(lang, v.name);
    v.slaBreaches.forEach((b, i) => {
      const isResp = v.slaBreachCodes[i].startsWith("response");
      alerts.push({
        severity: isResp && v.latestRespHrs! > v.slaResponseHrs * 1.5 ? "crit" : "warn",
        title: tx(lang, `${v.name} — SLA breach`, `${vn} — إخلال باتفاقية مستوى الخدمة`),
        detail: tx(lang,
          `${b} (spend-weighted, latest month). Slow response and weak lead quality are the fastest ways to lose a sale; raise it with ${v.contact}.`,
          `${b} (مرجّح بالإنفاق، آخر شهر). بطء الاستجابة وضعف جودة العملاء المحتملين من أسرع أسباب خسارة المبيعات؛ يُرجى مناقشة ذلك مع ${nm(lang, v.contact)}.`),
        tag: "Vendor",
      });
    });
    if (v.monthsToExpiry <= 3) {
      const end = dt(lang, v.contractEnd, { month: "short", year: "numeric" });
      alerts.push({
        severity: "warn",
        title: tx(lang, `${v.name} — contract ends ${end}`, `${vn} — ينتهي العقد في ${end}`),
        detail: tx(lang,
          `Scorecard ${v.score}/100 (${v.verdict}). Decide renew / renegotiate / exit before the window closes.`,
          `التقييم ${v.score}/100 (${tr(lang, v.verdict)}). يجب اتخاذ قرار التجديد أو إعادة التفاوض أو الإنهاء قبل انتهاء المهلة.`),
        tag: "Contract",
      });
    }
    if (v.spendSharePct > 40) {
      alerts.push({
        severity: "info",
        title: tx(lang, `Vendor concentration — ${v.name} is ${v.spendSharePct}% of spend`, `تركّز الموردين — ${vn} تمثل ${v.spendSharePct}% من الإنفاق`),
        detail: tx(lang,
          "Single-vendor dependency on lead flow. Keep a second channel warm for each asset.",
          "اعتماد على مورد واحد في تدفق العملاء المحتملين. أبقوا قناة ثانية جاهزة لكل مشروع."),
        tag: "Monitor",
      });
    }
  }

  for (const r of liveRows) {
    const cn = nm(lang, r.name);
    if (r.costToSalesPct !== null && r.costToSalesPct > 3) {
      alerts.push({
        severity: r.attribution === "Weak" ? "warn" : "crit",
        title: tx(lang, `${r.name} — cost-to-sales ${r.costToSalesPct}%`, `${cn} — نسبة التكلفة إلى المبيعات ${r.costToSalesPct}%`),
        detail: tx(lang,
          `SAR ${r.spendK}K spent for SAR ${r.revenueM}M contracted (${r.contracts} contracts, CAC SAR ${r.cacK}K). Above the 3% ceiling${r.attribution === "Weak" ? "; note this channel is brand-led so last-touch attribution understates it" : ""}.`,
          `أُنفق ${K(lang, r.spendK)} مقابل ${M(lang, r.revenueM)} من العقود (${r.contracts} عقود، تكلفة اكتساب العقد ${K(lang, r.cacK ?? "—")}). أعلى من سقف 3%${r.attribution === "Weak" ? "؛ علماً أن هذه القناة تعتمد على العلامة التجارية، فيقلّل إسناد آخر نقرة من أثرها الحقيقي" : ""}.`),
        tag: "Efficiency",
      });
    }
    if (r.cplTrendPct !== null && r.cplTrendPct > 20) {
      alerts.push({
        severity: "warn",
        title: tx(lang, `${r.name} — cost per lead up ${r.cplTrendPct}%`, `${cn} — ارتفاع تكلفة العميل المحتمل ${r.cplTrendPct}%`),
        detail: tx(lang,
          `Latest-month CPL is ${r.cplTrendPct}% above the earlier average (blended SAR ${r.cplSar}/lead). Audience fatigue or rising bids.`,
          `تكلفة العميل المحتمل في آخر شهر أعلى بنسبة ${r.cplTrendPct}% من المتوسط السابق (المتوسط المرجّح ${r.cplSar} ر.س لكل عميل). قد يعود ذلك إلى إرهاق الجمهور أو ارتفاع أسعار المزايدة.`),
        tag: "Trend",
      });
    }
    if (r.qualRatePct !== null && r.latestQualRatePct !== null && r.qualRatePct > 0 && r.latestQualRatePct < r.qualRatePct * 0.75) {
      alerts.push({
        severity: "warn",
        title: tx(lang, `${r.name} — lead quality decaying`, `${cn} — تراجع جودة العملاء المحتملين`),
        detail: tx(lang,
          `Qualified rate fell to ${r.latestQualRatePct}% in the latest month vs ${r.qualRatePct}% cumulative. Volume is up but the funnel is filling with unqualified leads.`,
          `انخفضت نسبة المؤهلين إلى ${r.latestQualRatePct}% في آخر شهر مقابل ${r.qualRatePct}% تراكمياً. الحجم في ازدياد لكن المسار يمتلئ بعملاء غير مؤهلين.`),
        tag: "Funnel",
      });
    }
    if (r.pacingPct !== null && (r.pacingPct > 115 || r.pacingPct < 75)) {
      const over = r.pacingPct > 115;
      alerts.push({
        severity: "info",
        title: tx(lang, `${r.name} — pacing ${r.pacingPct}% of plan`, `${cn} — وتيرة الإنفاق ${r.pacingPct}% من الخطة`),
        detail: tx(lang,
          `${over ? "Over-delivering spend vs flight elapsed; budget will exhaust early" : "Under-spending vs flight elapsed; pipeline for this asset may starve"} (SAR ${r.spendK}K of ${r.budgetK}K).`,
          `${over ? "الإنفاق يسبق المدة المنقضية من الحملة؛ ستنفد الميزانية مبكراً" : "الإنفاق أقل من المدة المنقضية من الحملة؛ قد يجفّ تدفق العملاء المحتملين لهذا المشروع"} (${K(lang, r.spendK)} من ${K(lang, r.budgetK)}).`),
        tag: "Pacing",
      });
    }
  }

  // ---- Orchestration recommendations -------------------------------------
  const recs: Recommendation[] = [];
  const direct = liveRows.filter((r) => r.costToSalesPct !== null && r.attribution === "Direct");
  const best = [...direct].sort((a, b) => a.costToSalesPct! - b.costToSalesPct!).filter((r) => r.costToSalesPct! <= 2 && (r.qualRatePct ?? 0) >= 25);
  const worst = liveRows
    .filter((r) => r.attribution === "Direct" && (r.costToSalesPct === null || r.costToSalesPct > 2.25))
    .sort((a, b) => (b.costToSalesPct ?? 99) - (a.costToSalesPct ?? 99));

  for (const w of worst.slice(0, 2)) {
    const target = best.find((b) => b.asset === w.asset && b.id !== w.id);
    if (!target) continue;
    const amountK = Math.round((w.remainingK * 0.4) / 5) * 5;
    if (amountK <= 0) continue;
    const gained = (amountK / (target.costToSalesPct! / 100)) / 1000;
    const lost = w.costToSalesPct ? (amountK / (w.costToSalesPct / 100)) / 1000 : 0;
    recs.push({
      type: "SHIFT_BUDGET",
      campaignId: w.id, campaign: w.name, vendor: w.vendor,
      toCampaignId: target.id, toCampaign: target.name, toVendor: target.vendor,
      amountK,
      rationale: tx(lang,
        `${w.name} runs at ${w.costToSalesPct ?? "n/a"}% cost-to-sales (qualified rate ${w.qualRatePct}%); ${target.name} converts at ${target.costToSalesPct}%.`,
        `${nm(lang, w.name)} تعمل بنسبة تكلفة إلى مبيعات ${w.costToSalesPct ?? "غير متاح"}% (نسبة المؤهلين ${w.qualRatePct}%)؛ بينما ${nm(lang, target.name)} تحقق ${target.costToSalesPct}%.`),
      impact: tx(lang,
        `Indicative: ~SAR ${round(gained - lost)}M more contracted sales if ${target.vendor} can absorb the spend at its current efficiency (assumes linear scaling — validate capacity first).`,
        `تقديري: نحو ${M(lang, round(gained - lost))} مبيعات متعاقد عليها إضافية إذا استطاع ${nm(lang, target.vendor)} استيعاب الإنفاق بكفاءته الحالية (بافتراض توسّع خطي — يلزم التحقق من الطاقة الاستيعابية أولاً).`),
    });
  }
  const pauseCandidate = worst.find((w) => (w.costToSalesPct ?? 99) > 4);
  if (pauseCandidate && !recs.some((r) => r.campaignId === pauseCandidate.id && r.type === "PAUSE")) {
    recs.push({
      type: "PAUSE", campaignId: pauseCandidate.id, campaign: pauseCandidate.name, vendor: pauseCandidate.vendor,
      rationale: tx(lang,
        `${pauseCandidate.costToSalesPct ?? "No"}% cost-to-sales with a qualified rate of ${pauseCandidate.qualRatePct}% and ${pauseCandidate.latestRespHrs ?? "n/a"}h response time.`,
        `نسبة تكلفة إلى مبيعات ${pauseCandidate.costToSalesPct ?? "غير متاحة"}% مع نسبة مؤهلين ${pauseCandidate.qualRatePct}% وزمن استجابة ${pauseCandidate.latestRespHrs ?? "غير متاح"} ساعة.`),
      impact: tx(lang,
        `Frees ~SAR ${pauseCandidate.remainingK}K of remaining budget for redeployment.`,
        `يحرّر نحو ${K(lang, pauseCandidate.remainingK)} من الميزانية المتبقية لإعادة توجيهها.`),
    });
  }

  return {
    currency: "SAR",
    asOf: TODAY.toISOString(),
    kpis: {
      spendK: round(totalSpend, 0),
      leads: tot("leads"),
      contracts,
      revenueM,
      costToSalesPct: revenueM > 0 ? round((totalSpend / (revenueM * 1000)) * 100, 2) : null,
      cacK: contracts > 0 ? round(totalSpend / contracts, 1) : null,
      liveCampaigns: liveRows.length,
      alertCount: alerts.length,
    },
    monthly,
    funnel,
    vendors: vendorRows,
    campaigns: rows.sort((a, b) => b.spendK - a.spendK),
    assets,
    alerts,
    recommendations: recs,
    actions: actions.map((a) => ({
      id: a.id, createdAt: a.createdAt.toISOString(), type: a.type, campaign: a.campaign, detail: a.detail,
    })),
  };
}

// ---- Orchestration: apply a decision and write the audit trail -------------
export type OrchestrationInput =
  | { type: "PAUSE"; campaignId: string }
  | { type: "RESUME"; campaignId: string }
  | { type: "SHIFT_BUDGET"; campaignId: string; toCampaignId: string; amountK: number };

export async function applyAction(input: OrchestrationInput, lang: Lang = "en") {
  const from = await prisma.campaign.findUnique({ where: { id: input.campaignId }, include: { vendor: true } });
  if (!from) throw new Error(tx(lang, "Campaign not found.", "الحملة غير موجودة."));

  if (input.type === "PAUSE" || input.type === "RESUME") {
    const next = input.type === "PAUSE" ? "PAUSED" : "LIVE";
    if (from.status === "ENDED") throw new Error(tx(lang, "Campaign has ended.", "الحملة منتهية."));
    await prisma.campaign.update({ where: { id: from.id }, data: { status: next } });
    await prisma.marketingAction.create({
      data: {
        type: input.type, campaign: from.name,
        detail: tx(lang, `${input.type === "PAUSE" ? "Paused" : "Resumed"} with ${from.vendor.name}.`, `${input.type === "PAUSE" ? "تم الإيقاف" : "تم الاستئناف"} لدى ${nm(lang, from.vendor.name)}.`),
      },
    });
    // Kinan's agent stops / restarts routing to this campaign; Yardi marks the marketing source.
    await queueKinanEvent("campaign.status_changed", "AGENT", { campaign: from.name, campaignCode: from.crmCode, vendor: from.vendor.name, status: next });
    return;
  }

  const to = await prisma.campaign.findUnique({ where: { id: input.toCampaignId }, include: { vendor: true } });
  if (!to) throw new Error(tx(lang, "Destination campaign not found.", "الحملة المستلمة غير موجودة."));
  if (!(input.amountK > 0)) throw new Error(tx(lang, "Amount must be positive.", "يجب أن يكون المبلغ موجباً."));
  const spent = (await prisma.campaignMonth.aggregate({ where: { campaignId: from.id }, _sum: { spendK: true } }))._sum.spendK ?? 0;
  if (from.budgetK - spent < input.amountK) throw new Error(tx(lang, "Not enough unspent budget on the source campaign.", "لا توجد ميزانية غير منفقة كافية في الحملة المصدر."));
  await prisma.$transaction([
    prisma.campaign.update({ where: { id: from.id }, data: { budgetK: { decrement: input.amountK } } }),
    prisma.campaign.update({ where: { id: to.id }, data: { budgetK: { increment: input.amountK } } }),
    prisma.marketingAction.create({
      data: {
        type: "SHIFT_BUDGET", campaign: from.name,
        detail: tx(lang, `Moved SAR ${input.amountK}K from ${from.vendor.name} to ${to.vendor.name} — ${to.name}.`, `نُقل ${K(lang, input.amountK)} من ${nm(lang, from.vendor.name)} إلى ${nm(lang, to.vendor.name)} — ${nm(lang, to.name)}.`),
      },
    }),
  ]);
  await queueKinanEvent("campaign.status_changed", "AGENT", { campaign: from.name, campaignCode: from.crmCode, status: "BUDGET_DECREASED", amountK: input.amountK, movedTo: { campaign: to.name, campaignCode: to.crmCode } });
}

export { monthLabel };
