import { prisma } from "./prisma";

const TODAY = new Date("2026-06-08");

export type FacilityRow = {
  asset: string;
  type: string;
  lender: string;
  drawnM: number;
  ratePct: number;
  ltvPct: number;
  dscr: number;
  icr: number;
  covenantDscr: number;
  maturity: string; // ISO date
  monthsToMaturity: number;
  dscrHeadroomPct: number; // headroom of DSCR over covenant
  status: "Healthy" | "Refi" | "Watch";
};

export type Alert = {
  severity: "crit" | "warn" | "info";
  title: string;
  detail: string;
  tag: string;
};

export type DebtDashboard = {
  currency: string;
  kpis: {
    totalDebtM: number;
    facilities: number;
    wtdAvgCostPct: number;
    maturingLt18moM: number;
    maturingLt18moPct: number;
    portfolioDscr: number;
    watchCount: number;
    alertCount: number;
  };
  ladder: { year: string; drawnM: number; flagged: boolean }[];
  facilitiesTable: FacilityRow[];
  alerts: Alert[];
};

function round(x: number, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}
function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export async function buildDebtDashboard(): Promise<DebtDashboard> {
  const facilities = await prisma.facility.findMany({
    include: { asset: true },
    orderBy: { maturity: "asc" },
  });

  const totalDebtM = round(facilities.reduce((s, f) => s + f.drawnM, 0));
  const wtdAvgCostPct =
    totalDebtM > 0
      ? round(facilities.reduce((s, f) => s + f.ratePct * f.drawnM, 0) / totalDebtM, 2)
      : 0;
  const portfolioDscr =
    totalDebtM > 0
      ? round(facilities.reduce((s, f) => s + f.dscr * f.drawnM, 0) / totalDebtM, 2)
      : 0;

  const rows: FacilityRow[] = facilities.map((f) => {
    const months = monthsBetween(TODAY, f.maturity);
    const headroom = round(((f.dscr - f.covenantDscr) / f.covenantDscr) * 100);
    let status: FacilityRow["status"] = "Healthy";
    if (headroom < 15) status = "Watch";
    else if (months <= 18) status = "Refi";
    return {
      asset: f.asset.name,
      type: f.asset.type,
      lender: f.lender,
      drawnM: round(f.drawnM),
      ratePct: f.ratePct,
      ltvPct: f.ltvPct,
      dscr: f.dscr,
      icr: f.icr,
      covenantDscr: f.covenantDscr,
      maturity: f.maturity.toISOString(),
      monthsToMaturity: months,
      dscrHeadroomPct: headroom,
      status,
    };
  });

  const maturingLt18moM = round(
    rows.filter((r) => r.monthsToMaturity <= 18).reduce((s, r) => s + r.drawnM, 0)
  );
  const watchCount = rows.filter((r) => r.status === "Watch").length;

  // Maturity ladder grouped by year.
  const byYear = new Map<string, { drawn: number; flagged: boolean }>();
  for (const f of facilities) {
    const y = f.maturity.getFullYear();
    const key = y >= 2030 ? "2030+" : String(y);
    const entry = byYear.get(key) ?? { drawn: 0, flagged: false };
    entry.drawn += f.drawnM;
    if (monthsBetween(TODAY, f.maturity) <= 18) entry.flagged = true;
    byYear.set(key, entry);
  }
  const ladder = [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, v]) => ({ year, drawnM: round(v.drawn), flagged: v.flagged }));

  // ---- Forward-looking alerts (rule-based) ----
  const alerts: Alert[] = [];

  for (const r of rows) {
    if (r.dscrHeadroomPct < 15) {
      alerts.push({
        severity: "crit",
        title: `${r.asset} — DSCR covenant headroom ${r.dscrHeadroomPct}%`,
        detail: `DSCR of ${r.dscr}x sits only ${r.dscrHeadroomPct}% above the ${r.covenantDscr}x covenant — below the 15% alert threshold. Consider a partial paydown or hedge before ${fmtMonthYear(new Date(r.maturity))}.`,
        tag: "Action",
      });
    }
  }
  for (const r of rows) {
    if (r.monthsToMaturity > 0 && r.monthsToMaturity <= 18 && r.dscrHeadroomPct >= 15) {
      const est = round((r.drawnM * 0.004) , 2); // ~40bps refi saving, indicative
      alerts.push({
        severity: "warn",
        title: `${r.asset} — refinancing window open`,
        detail: `${r.drawnM} ${"SAR"}M facility matures ${fmtMonthYear(new Date(r.maturity))} (${r.monthsToMaturity} months out). Optimal refi window now to ~6 months before maturity; indicative saving ~${est} SAR M/yr at a tighter margin.`,
        tag: "Opportunity",
      });
    }
  }
  // Maturity concentration: any rolling 12-month window with >20% of debt.
  const sorted = [...rows].sort((a, b) => a.monthsToMaturity - b.monthsToMaturity);
  for (let i = 0; i < sorted.length; i++) {
    const windowEnd = sorted[i].monthsToMaturity + 12;
    const inWindow = sorted.filter(
      (r) => r.monthsToMaturity >= sorted[i].monthsToMaturity && r.monthsToMaturity <= windowEnd
    );
    const sum = inWindow.reduce((s, r) => s + r.drawnM, 0);
    if (inWindow.length >= 2 && sum / totalDebtM > 0.2) {
      const pct = round((sum / totalDebtM) * 100);
      alerts.push({
        severity: "info",
        title: `Maturity concentration — ${pct}% within 12 months`,
        detail: `${round(sum)} SAR M (${pct}% of portfolio debt) matures inside a single 12-month window starting ${fmtMonthYear(new Date(sorted[i].maturity))}. Consider staggering one facility to de-risk the ladder.`,
        tag: "Monitor",
      });
      break; // one concentration alert is enough
    }
  }

  return {
    currency: "SAR",
    kpis: {
      totalDebtM,
      facilities: facilities.length,
      wtdAvgCostPct,
      maturingLt18moM,
      maturingLt18moPct: totalDebtM > 0 ? round((maturingLt18moM / totalDebtM) * 100) : 0,
      portfolioDscr,
      watchCount,
      alertCount: alerts.length,
    },
    ladder,
    facilitiesTable: rows,
    alerts,
  };
}
