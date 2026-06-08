import { prisma } from "./prisma";

export type ReportAsset = {
  name: string;
  type: string;
  valuationM: number;
  occupancyPct: number | null;
  waleYears: number | null;
  noiM: number;
  conceptStage: boolean;
};

export type FundReport = {
  fund: string;
  currency: string;
  period: string;
  reportType: string;
  style: string;
  snapshot: {
    grossValuationM: number;
    totalDebtM: number;
    navM: number;
    noiM: number;
    weightedOccupancyPct: number | null;
    weightedWaleYears: number | null;
    distributionM: number | null;
  };
  returns: {
    netIrrPct: number;
    equityMultiple: number;
    yieldOnCostPct: number;
    dscr: number;
  };
  assets: ReportAsset[];
};

function round(x: number, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

export async function listFunds(): Promise<string[]> {
  const funds = await prisma.fund.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return funds.map((f) => f.name);
}

export async function listPeriods(): Promise<string[]> {
  const periods = await prisma.distribution.findMany({
    select: { period: true },
    distinct: ["period"],
  });
  // Newest first (string sort works for "Qn YYYY" once mapped).
  return periods
    .map((p) => p.period)
    .sort((a, b) => periodKey(b) - periodKey(a));
}
function periodKey(p: string): number {
  const m = p.match(/Q([1-4])\s+(\d{4})/);
  if (!m) return 0;
  return parseInt(m[2]) * 10 + parseInt(m[1]);
}

// Pulls scattered asset data into one computed fund snapshot. This is the
// "real" pull-and-aggregate the demo only mimicked.
export async function buildReport(args: {
  fund: string;
  period: string;
  reportType: string;
  style: string;
}): Promise<FundReport> {
  const fund = await prisma.fund.findUnique({
    where: { name: args.fund },
    include: { assets: { include: { facility: true } }, distributions: true },
  });
  if (!fund) throw new Error(`Unknown fund: ${args.fund}`);

  const incomeAssets = fund.assets.filter((a) => !a.conceptStage);

  const grossValuationM = round(fund.assets.reduce((s, a) => s + a.valuationM, 0));
  const totalDebtM = round(
    fund.assets.reduce((s, a) => s + (a.facility?.drawnM ?? 0), 0)
  );
  const navM = round(grossValuationM - totalDebtM);
  const noiM = round(fund.assets.reduce((s, a) => s + a.noiM, 0));

  // Valuation-weighted occupancy and WALE over income-producing assets.
  const valBase = incomeAssets.reduce((s, a) => s + a.valuationM, 0);
  const weightedOccupancyPct =
    valBase > 0
      ? round(
          incomeAssets.reduce((s, a) => s + (a.occupancyPct ?? 0) * a.valuationM, 0) / valBase
        )
      : null;
  const weightedWaleYears =
    valBase > 0
      ? round(
          incomeAssets.reduce((s, a) => s + (a.waleYears ?? 0) * a.valuationM, 0) / valBase,
          1
        )
      : null;

  const dist = fund.distributions.find((d) => d.period === args.period);

  return {
    fund: fund.name,
    currency: fund.currency,
    period: args.period,
    reportType: args.reportType,
    style: args.style,
    snapshot: {
      grossValuationM,
      totalDebtM,
      navM,
      noiM,
      weightedOccupancyPct,
      weightedWaleYears,
      distributionM: dist ? round(dist.amountM) : null,
    },
    returns: {
      netIrrPct: fund.netIrrPct,
      equityMultiple: fund.equityMultiple,
      yieldOnCostPct: fund.yieldOnCostPct,
      dscr: fund.dscr,
    },
    assets: fund.assets
      .sort((a, b) => b.valuationM - a.valuationM)
      .map((a) => ({
        name: a.name,
        type: a.type,
        valuationM: round(a.valuationM),
        occupancyPct: a.occupancyPct,
        waleYears: a.waleYears,
        noiM: round(a.noiM),
        conceptStage: a.conceptStage,
      })),
  };
}
