import { prisma } from "./prisma";

// Seeds the reference dataset (funds, assets, facilities, distributions) once.
// Idempotent: if any Fund exists, it does nothing. Called lazily by the
// reporting/debt routes so there's no separate seed step to run.
export async function ensureSeeded() {
  const count = await prisma.fund.count();
  if (count > 0) return;

  // period helper
  const d = (s: string) => new Date(s);

  // --- Bevilacqua Holdings — GP Portfolio ---
  const bev = await prisma.fund.create({
    data: {
      name: "Bevilacqua Holdings — GP Portfolio",
      strategy: "Sponsor / GP — core-plus, KSA",
      netIrrPct: 18.2,
      equityMultiple: 1.43,
      yieldOnCostPct: 7.1,
      dscr: 2.17,
      assets: {
        create: [
          {
            name: "Marina Tower",
            type: "Mixed-use",
            location: "Jeddah · Corniche",
            valuationM: 312.0,
            noiM: 13.2,
            occupancyPct: 94.1,
            waleYears: 6.2,
            facility: {
              create: {
                lender: "SNB", drawnM: 59.4, ratePct: 6.6, marginBps: 280,
                ltvPct: 58, dscr: 2.24, icr: 2.71, covenantDscr: 1.25,
                covenantLtvPct: 65, maturity: d("2029-06-30"),
              },
            },
          },
          {
            name: "Rawdah Plaza",
            type: "Commercial",
            location: "Jeddah · Central",
            valuationM: 118.4,
            noiM: 5.0,
            occupancyPct: 91.8,
            waleYears: 4.4,
            facility: {
              create: {
                lender: "ANB", drawnM: 18.6, ratePct: 7.0, marginBps: 320,
                ltvPct: 61, dscr: 1.68, icr: 1.95, covenantDscr: 1.50,
                covenantLtvPct: 65, maturity: d("2026-09-30"),
              },
            },
          },
          {
            name: "Andalus Quarter",
            type: "Residential",
            location: "Jeddah · South",
            valuationM: 105.8,
            noiM: 0,
            occupancyPct: null,
            waleYears: null,
            conceptStage: true,
          },
        ],
      },
      distributions: {
        create: [
          { period: "Q1 2026", amountM: 14.2 },
          { period: "Q4 2025", amountM: 12.8 },
          { period: "Q3 2025", amountM: 11.5 },
        ],
      },
    },
  });

  // --- Meridian Capital Partners — JV/LP ---
  const mer = await prisma.fund.create({
    data: {
      name: "Meridian Capital Partners — JV/LP",
      strategy: "JV · LP — value-add & logistics, KSA",
      netIrrPct: 19.1,
      equityMultiple: 1.38,
      yieldOnCostPct: 7.6,
      dscr: 2.18,
      assets: {
        create: [
          {
            name: "Ash Shati Residences",
            type: "Residential",
            location: "Jeddah · North",
            valuationM: 198.0,
            noiM: 11.4,
            occupancyPct: 97.0,
            waleYears: 5.1,
            facility: {
              create: {
                lender: "Riyad Bank", drawnM: 44.2, ratePct: 6.4, marginBps: 260,
                ltvPct: 55, dscr: 1.95, icr: 2.32, covenantDscr: 1.30,
                covenantLtvPct: 65, maturity: d("2028-12-31"),
              },
            },
          },
          {
            name: "Nahdah Logistics",
            type: "Logistics",
            location: "Jeddah · East",
            valuationM: 164.0,
            noiM: 7.8,
            occupancyPct: 98.8,
            waleYears: 7.1,
            facility: {
              create: {
                lender: "SNB", drawnM: 12.4, ratePct: 5.9, marginBps: 190,
                ltvPct: 44, dscr: 2.56, icr: 2.88, covenantDscr: 1.25,
                covenantLtvPct: 60, maturity: d("2030-09-30"),
              },
            },
          },
        ],
      },
      distributions: {
        create: [
          { period: "Q1 2026", amountM: 9.1 },
          { period: "Q4 2025", amountM: 8.4 },
          { period: "Q3 2025", amountM: 7.9 },
        ],
      },
    },
  });

  // --- Al-Harbi Development — Local JV ---
  const alh = await prisma.fund.create({
    data: {
      name: "Al-Harbi Development — Local JV",
      strategy: "Local JV — office-led, KSA",
      netIrrPct: 19.1,
      equityMultiple: 1.41,
      yieldOnCostPct: 7.6,
      dscr: 2.41,
      assets: {
        create: [
          {
            name: "Olaya Block",
            type: "Office",
            location: "Riyadh · Olaya",
            valuationM: 176.4,
            noiM: 9.6,
            occupancyPct: 96.2,
            waleYears: 6.0,
            facility: {
              create: {
                lender: "Al Rajhi", drawnM: 32.8, ratePct: 6.3, marginBps: 230,
                ltvPct: 49, dscr: 2.41, icr: 2.45, covenantDscr: 1.30,
                covenantLtvPct: 60, maturity: d("2027-03-31"),
              },
            },
          },
        ],
      },
      distributions: {
        create: [
          { period: "Q1 2026", amountM: 4.1 },
          { period: "Q4 2025", amountM: 3.8 },
          { period: "Q3 2025", amountM: 3.5 },
        ],
      },
    },
  });

  return { bev: bev.id, mer: mer.id, alh: alh.id };
}
