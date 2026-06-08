import type { ExtractedDeal } from "./claude";
import type { Hurdles } from "./hurdles";

// A transparent, first-pass (indicative) underwrite. This is deterministic
// TypeScript math — NOT an LLM guess. It builds a simple levered cashflow over
// the hold period and solves for the unlevered/levered return so the figures
// are reproducible and auditable. It is intentionally simple; replace with a
// full cashflow model when you wire one in.

export type HurdleResult = {
  label: string;
  target: string;
  actual: string;
  pass: boolean;
};

export type Underwrite = {
  assumptions: {
    holdYears: number;
    ltvPct: number;
    costOfDebtPct: number;
    entryYieldPct: number;
    exitYieldPct: number;
    rentalGrowthPct: number;
  };
  equityM: number | null;
  debtM: number | null;
  netIrrPct: number | null;
  equityMultiple: number | null;
  exitValueM: number | null;
  hurdles: HurdleResult[];
  verdict: "PASS" | "REVIEW" | "FAIL";
  rationale: string;
};

// Internal rate of return for a cashflow series (t0 negative). Bisection solver.
function irr(cashflows: number[]): number | null {
  const npv = (rate: number) =>
    cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  // Need a sign change to bracket a root.
  let lo = -0.9;
  let hi = 1.0;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) return null; // no bracketed root

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

export function runUnderwrite(d: ExtractedDeal, h: Hurdles): Underwrite {
  const price = num(d.askingPriceM);
  let noi = num(d.inPlaceNoiM);
  const niyExtracted = num(d.netInitialYieldPct);

  // Derive NOI from NIY if missing, and vice-versa.
  if (noi == null && price != null && niyExtracted != null) {
    noi = (niyExtracted / 100) * price;
  }
  const entryYieldPct =
    niyExtracted ?? (noi != null && price ? (noi / price) * 100 : NaN);

  // CPI/indexed leases get the fund's growth assumption; otherwise haircut it.
  const indexed = /cpi|index/i.test(d.indexation ?? "");
  const rentalGrowthPct = indexed
    ? h.defaultRentalGrowthPct
    : round(h.defaultRentalGrowthPct * 0.6);
  const exitYieldPct = (isFinite(entryYieldPct) ? entryYieldPct : h.minNetInitialYieldPct) +
    h.exitYieldSpreadBps / 100;

  const assumptions = {
    holdYears: h.holdYears,
    ltvPct: h.ltvPct,
    costOfDebtPct: h.costOfDebtPct,
    entryYieldPct: round(entryYieldPct),
    exitYieldPct: round(exitYieldPct),
    rentalGrowthPct,
  };

  let equityM: number | null = null;
  let debtM: number | null = null;
  let netIrrPct: number | null = null;
  let equityMultiple: number | null = null;
  let exitValueM: number | null = null;

  if (price != null && noi != null && isFinite(entryYieldPct)) {
    debtM = price * (h.ltvPct / 100);
    equityM = price - debtM;
    const interest = debtM * (h.costOfDebtPct / 100);

    // Build levered equity cashflows: t0 = -equity, interim = NOI(grown) - interest,
    // final year adds net sale proceeds (exit value - debt repaid).
    const cfs: number[] = [-equityM];
    let noiT = noi;
    for (let t = 1; t <= h.holdYears; t++) {
      noiT = noi * Math.pow(1 + rentalGrowthPct / 100, t);
      let cf = noiT - interest;
      if (t === h.holdYears) {
        exitValueM = noiT / (exitYieldPct / 100);
        cf += exitValueM - debtM; // repay debt at exit
      }
      cfs.push(cf);
    }

    const r = irr(cfs);
    netIrrPct = r != null ? round(r * 100) : null;
    // Total cash returned to equity over the hold (interim income + net sale
    // proceeds, which already return the original equity plus the gain).
    const totalReturned = cfs.slice(1).reduce((a, b) => a + b, 0);
    equityMultiple = equityM > 0 ? round(totalReturned / equityM, 2) : null;
  }

  // Hurdle checks.
  const occ = num(d.occupancyPct);
  const wale = num(d.waleYears);
  const tenantPct = num(d.anchorTenantPct);

  const hurdles: HurdleResult[] = [
    mk("Net IRR", `≥ ${h.minNetIrrPct}%`, pctStr(netIrrPct), netIrrPct != null && netIrrPct >= h.minNetIrrPct),
    mk("Equity multiple", `≥ ${h.minEquityMultiple}x`, xStr(equityMultiple), equityMultiple != null && equityMultiple >= h.minEquityMultiple),
    mk("Net Initial Yield", `≥ ${h.minNetInitialYieldPct}%`, pctStr(isFinite(entryYieldPct) ? round(entryYieldPct) : null), isFinite(entryYieldPct) && entryYieldPct >= h.minNetInitialYieldPct),
    mk("WALE", `≥ ${h.minWaleYears} yrs`, wale != null ? `${wale} yrs` : "—", wale != null && wale >= h.minWaleYears),
    mk("Single-tenant", `≤ ${h.maxSingleTenantPct}%`, tenantPct != null ? `${tenantPct}%` : "—", tenantPct == null || tenantPct <= h.maxSingleTenantPct),
  ];

  const passes = hurdles.filter((x) => x.pass).length;
  const total = hurdles.length;
  const verdict: Underwrite["verdict"] =
    passes === total ? "PASS" : passes >= total - 1 ? "REVIEW" : "FAIL";

  const rationale =
    verdict === "PASS"
      ? `Clears all ${total} ${h.fund.split(" — ")[0]} hurdles on the indicative underwrite.`
      : verdict === "REVIEW"
      ? `Clears ${passes} of ${total} hurdles — advance with the flagged item(s) addressed.`
      : `Fails ${total - passes} of ${total} hurdles on the indicative underwrite.`;

  return {
    assumptions,
    equityM: equityM != null ? round(equityM) : null,
    debtM: debtM != null ? round(debtM) : null,
    netIrrPct,
    equityMultiple,
    exitValueM: exitValueM != null ? round(exitValueM) : null,
    hurdles,
    verdict,
    rationale,
  };
}

function mk(label: string, target: string, actual: string, pass: boolean): HurdleResult {
  return { label, target, actual, pass };
}
function round(x: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}
function pctStr(x: number | null): string {
  return x != null ? `${x}%` : "—";
}
function xStr(x: number | null): string {
  return x != null ? `${x}x` : "—";
}
