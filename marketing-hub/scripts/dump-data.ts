// Dumps the seeded DB to scripts/demo-data.json (input for the static demo build). Run on a fresh DB.
import { writeFileSync } from "fs";
import { ensureOpsSeeded } from "../lib/seed-ops";
import { buildScores } from "../lib/scoring";
import { prisma } from "../lib/prisma";

(async () => {
  await ensureOpsSeeded();
  await buildScores("en"); // syncs the CRM and fits the media-mix model, which fills in the weekly qualified-lead series
  const [vendors, campaigns, assets, deliverables, trials, experiments, channelWeeks, salesWeeks] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { vendor: true, asset: true, months: true } }),
    prisma.asset.findMany(),
    prisma.deliverable.findMany(),
    prisma.trial.findMany(),
    prisma.experiment.findMany(),
    prisma.channelWeek.findMany(),
    prisma.salesWeek.findMany(),
  ]);
  writeFileSync(new URL("./demo-data.json", import.meta.url), JSON.stringify({ vendors, campaigns, assets, deliverables, trials, experiments, channelWeeks, salesWeeks }));
  console.log(`dumped ${vendors.length} vendors, ${campaigns.length} campaigns, ${deliverables.length} deliverables, ${salesWeeks.length} weeks`);
})();
