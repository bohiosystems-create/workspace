import { single } from "./single";
import { prisma } from "./prisma";
import { ensureMarketingSeeded } from "./seed-marketing";

// Sample data for vendor operations (deliverables), the bench of alternative vendors, a completed
// paid trial, two completed incrementality tests, and 104 weeks of channel spend / sales history for
// the media-mix model. Idempotent. All of it is illustrative.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export const BENCH = [
  { name: "Wasel Performance", category: "Performance media", model: "Media buy", contact: "Huda Saleh", email: "huda.saleh@wasel-performance.example", language: "en", rateNote: "12% media fee, media at cost (no markup), bonus per CRM-qualified lead above target", slaResponseHrs: 2, slaQualifiedPct: 25 },
  { name: "Manazel Portal", category: "Property portal", model: "Media buy", contact: "Tariq Mansour", email: "tariq.mansour@manazel-portal.example", language: "ar", rateNote: "SAR 38K / month featured package, cancellable monthly", slaResponseHrs: 4, slaQualifiedPct: 25 },
  { name: "Rukn Realty Brokers", category: "Broker network", model: "Commission", contact: "Salma Haddad", email: "salma.haddad@rukn-brokers.example", language: "ar", rateNote: "1.75% commission on signed contracts only", slaResponseHrs: 8, slaQualifiedPct: 55 },
  { name: "Mada Outdoor", category: "Outdoor", model: "Media buy", contact: "Majed Aziz", email: "majed.aziz@mada-outdoor.example", language: "ar", rateNote: "Digital billboards, SAR 60K per 4-week flight, QR-tracked creative included", slaResponseHrs: 24, slaQualifiedPct: 0 },
  { name: "Bayan Creators", category: "Influencer", model: "Retainer", contact: "Lina Farouk", email: "lina.farouk@bayan-creators.example", language: "en", rateNote: "SAR 8K per creator package, paid on tracked leads", slaResponseHrs: 6, slaQualifiedPct: 15 },
];

// Deadline adherence / revision profile per active vendor: [on-time probability, mean revisions]
const DELIVERY: Record<string, [number, number]> = {
  "Tasweeq Digital": [0.7, 2.4], "PropertyHub KSA": [0.85, 1.1], "Mubasher Brokerage Network": [0.9, 0.6],
  "Nakhla Communications": [0.8, 1.5], "Hajar Outdoor": [0.6, 1.0], "Sada Influence": [0.55, 3.1],
};
const KINDS: Record<string, string[]> = {
  "Performance media": ["CREATIVE", "LANDING_PAGE", "REPORT"], "Property portal": ["LISTING", "REPORT"],
  "Broker network": ["EVENT", "REPORT"], "PR & brand": ["CREATIVE", "EVENT", "REPORT"], "Outdoor": ["CREATIVE", "REPORT"],
  "Influencer": ["CREATIVE", "REPORT"],
};
const TITLE: Record<string, string> = {
  CREATIVE: "Creative set", LANDING_PAGE: "Landing page", REPORT: "Monthly report", LISTING: "Listing refresh", EVENT: "Broker / media event",
};

// Media-mix history: true (hidden) effect of each channel — only used to generate the sample.
const TRUE_EFFECT: Record<string, { decay: number; beta: number }> = {
  "Performance media": { decay: 0.3, beta: 1.25 }, "Property portal": { decay: 0.4, beta: 1.3 }, "Broker network": { decay: 0.2, beta: 4.5 },
  "PR & brand": { decay: 0.7, beta: 0.65 }, "Outdoor": { decay: 0.5, beta: 0.12 }, "Influencer": { decay: 0.3, beta: 0.35 },
};

export const ensureOpsSeeded = single(async function ensureOpsSeededImpl() {
  await ensureMarketingSeeded();
  if ((await prisma.deliverable.count()) > 0) return;
  const vendors = await prisma.vendor.findMany();
  const byName = (n: string) => vendors.find((v) => v.name === n)!;

  // Bench vendors
  for (const b of BENCH) {
    if (vendors.some((v) => v.name === b.name)) continue;
    vendors.push(await prisma.vendor.create({ data: { ...b, retainerK: 0, status: "BENCH", contractEnd: new Date("2027-12-31") } }));
  }

  // Deliverables (Jan–May 2026)
  const r = rng(7);
  for (const v of vendors.filter((x) => x.status === "ACTIVE")) {
    const [onTime, revMean] = DELIVERY[v.name] ?? [0.8, 1];
    const kinds = KINDS[v.category] ?? ["REPORT"];
    let i = 0;
    for (let d = new Date("2026-01-08"); d < new Date("2026-06-01"); d = addDays(d, 12 + Math.floor(r() * 10))) {
      const kind = kinds[i++ % kinds.length];
      const late = r() > onTime;
      const delivered = d < new Date("2026-06-08") ? addDays(d, late ? 2 + Math.floor(r() * 9) : -Math.floor(r() * 3)) : null;
      const revisions = Math.max(0, Math.round(revMean + (r() - 0.5) * 2 * Math.min(revMean, 1.5)));
      await prisma.deliverable.create({ data: { vendorId: v.id, kind, title: `${TITLE[kind]} #${i}`, dueDate: d, deliveredAt: delivered, revisions } });
    }
  }

  // Completed paid trial: Wasel Performance vs Tasweeq Digital on the Andalus off-plan brief
  await prisma.trial.create({
    data: {
      challengerId: byName("Wasel Performance").id, incumbentId: byName("Tasweeq Digital").id, asset: "Andalus Quarter",
      brief: "Off-plan launch funnel for Andalus Quarter: Meta / Snap lead generation, same creative guidelines, same landing page, CRM-qualified leads as the success metric.",
      budgetK: 60, weeks: 6, crmCode: "TRIAL-AND-WASEL", status: "COMPLETED", origin: "USER", approvedBy: "Marketing Director",
      startDate: new Date("2026-04-06"),
      resultsJson: JSON.stringify({ challenger: { spendK: 60, leads: 212, qualified: 41, contracts: 3 }, incumbent: { spendK: 62, leads: 205, qualified: 24, contracts: 1 } }),
    },
  });

  // Incrementality tests
  await prisma.experiment.create({
    data: {
      kind: "HOLDOUT", vendorId: byName("Tasweeq Digital").id, campaign: "Ash Shati — Search & Social Always-On", status: "COMPLETED",
      name: "Audience holdout — Ash Shati search & social", approvedBy: "Marketing Director",
      designJson: JSON.stringify({ holdoutPct: 20, weeks: 6, start: "2026-03-02", metric: "CRM-qualified leads" }),
      dataJson: JSON.stringify({ exposedUsers: 410000, holdoutUsers: 102500, exposedConv: 262, holdoutConv: 39, spendK: 61 }),
    },
  });
  await prisma.experiment.create({
    data: {
      kind: "GEO", vendorId: byName("Hajar Outdoor").id, campaign: "Marina Tower — Corniche Billboards", status: "COMPLETED",
      name: "Geo test — Corniche billboards", approvedBy: "Marketing Director",
      designJson: JSON.stringify({ test: ["Al Shati", "Al Zahra", "Corniche"], control: ["Al Rawdah", "Al Salamah", "Al Naeem"], preWeeks: 6, weeks: 6, start: "2026-02-02", metric: "CRM leads for Marina Tower" }),
      dataJson: JSON.stringify({ spendK: 128, pre: { test: [20, 24, 18, 22, 25, 19], control: [18, 19, 17, 20, 19, 18] }, post: { test: [22, 24, 21, 23, 22, 25], control: [19, 20, 18, 21, 19, 21] } }),
    },
  });

  // Media-mix history: 104 weeks of spend per channel and contracted sales.
  const campaigns = await prisma.campaign.findMany({ include: { vendor: true, months: true } });
  const channels = Object.keys(TRUE_EFFECT);
  const r2 = rng(42);
  const start = new Date("2024-06-03T00:00:00Z");
  const level: Record<string, number> = {};
  for (const ch of channels) {
    const ms = campaigns.filter((c) => c.vendor.category === ch).flatMap((c) => c.months);
    level[ch] = ms.reduce((s, m) => s + m.spendK, 0) / 21.6 || 10; // avg weekly spend Jan–May 2026
  }
  const ad: Record<string, number> = Object.fromEntries(channels.map((c) => [c, 0]));
  const walk: Record<string, number> = Object.fromEntries(channels.map((c) => [c, 1]));
  const ramadan = (d: Date) => (d >= new Date("2025-03-01") && d < new Date("2025-03-31")) || (d >= new Date("2026-02-18") && d < new Date("2026-03-20"));
  for (let w = 0; w < 104; w++) {
    const d = addDays(start, w * 7);
    const week = iso(d);
    const ym = week.slice(0, 7);
    let sales = 3.2 * (1 + 0.006 * w); // base demand, SAR M / week
    if (ramadan(d)) sales *= 0.75;
    if (["07", "08"].includes(week.slice(5, 7))) sales *= 0.85;
    for (const ch of channels) {
      let spend: number;
      if (d >= new Date("2026-01-01")) {
        spend = campaigns.filter((c) => c.vendor.category === ch).flatMap((c) => c.months).filter((m) => m.month === ym).reduce((s, m) => s + m.spendK, 0) / 4.33;
      } else {
        walk[ch] = Math.min(1.6, Math.max(0.3, walk[ch] + (r2() - 0.5) * 0.45));
        const on =
          ch === "Outdoor" ? Math.floor(w / 8) % 2 === 0 :
          ch === "Influencer" ? Math.floor(w / 6) % 3 !== 2 :
          ch === "PR & brand" ? (w % 13 < 5) : true;
        spend = on ? level[ch] * walk[ch] * (ch === "PR & brand" ? 1.6 : 1) : level[ch] * 0.05;
      }
      spend = Math.round(spend * 10) / 10;
      const e = TRUE_EFFECT[ch];
      ad[ch] = spend + e.decay * ad[ch];
      const half = level[ch] * 1.5;
      sales += e.beta * (ad[ch] / (ad[ch] + half));
      await prisma.channelWeek.create({ data: { week, channel: ch, spendK: spend } });
    }
    sales *= 1 + (r2() - 0.5) * 0.12;
    await prisma.salesWeek.create({ data: { week, salesM: Math.round(sales * 100) / 100, ramadan: ramadan(d) } });
  }
});
