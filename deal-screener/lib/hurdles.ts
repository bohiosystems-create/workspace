// Fund return-hurdle presets. These are the criteria a deal is screened against.
// Edit freely — they drive both the underwrite assumptions and the pass/fail gate.

export type Hurdles = {
  fund: string;
  minNetIrrPct: number;
  minEquityMultiple: number;
  minNetInitialYieldPct: number;
  minWaleYears: number;
  maxSingleTenantPct: number;
  // underwrite assumptions for this fund's strategy
  holdYears: number;
  ltvPct: number; // day-1 leverage
  costOfDebtPct: number; // all-in
  exitYieldSpreadBps: number; // exit yield = entry NIY + spread
  defaultRentalGrowthPct: number; // used when indexation is unclear
};

export const FUND_HURDLES: Record<string, Hurdles> = {
  "Bevilacqua Holdings — GP Portfolio": {
    fund: "Bevilacqua Holdings — GP Portfolio",
    minNetIrrPct: 16,
    minEquityMultiple: 1.35,
    minNetInitialYieldPct: 7.0,
    minWaleYears: 5.0,
    maxSingleTenantPct: 50,
    holdYears: 7,
    ltvPct: 45,
    costOfDebtPct: 6.4,
    exitYieldSpreadBps: 30,
    defaultRentalGrowthPct: 3.0,
  },
  "Meridian Capital Partners — JV/LP": {
    fund: "Meridian Capital Partners — JV/LP",
    minNetIrrPct: 14,
    minEquityMultiple: 1.3,
    minNetInitialYieldPct: 6.5,
    minWaleYears: 5.5,
    maxSingleTenantPct: 60,
    holdYears: 7,
    ltvPct: 50,
    costOfDebtPct: 6.2,
    exitYieldSpreadBps: 25,
    defaultRentalGrowthPct: 3.0,
  },
  "Al-Harbi Development — Local JV": {
    fund: "Al-Harbi Development — Local JV",
    minNetIrrPct: 18,
    minEquityMultiple: 1.4,
    minNetInitialYieldPct: 7.5,
    minWaleYears: 4.0,
    maxSingleTenantPct: 55,
    holdYears: 5,
    ltvPct: 55,
    costOfDebtPct: 6.6,
    exitYieldSpreadBps: 40,
    defaultRentalGrowthPct: 3.5,
  },
};

export const DEFAULT_FUND = "Bevilacqua Holdings — GP Portfolio";

export function getHurdles(fund?: string | null): Hurdles {
  return FUND_HURDLES[fund ?? ""] ?? FUND_HURDLES[DEFAULT_FUND];
}
