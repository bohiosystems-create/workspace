// Dumps the seeded DB to scripts/demo-data.json (input for the static demo build).
import { writeFileSync } from "fs";
import { ensureMarketingSeeded } from "../lib/seed-marketing";
import { prisma } from "../lib/prisma";

(async () => {
  await ensureMarketingSeeded();
  const [vendors, campaigns] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.campaign.findMany({ include: { vendor: true, asset: true, months: true } }),
  ]);
  writeFileSync(new URL("./demo-data.json", import.meta.url), JSON.stringify({ vendors, campaigns }));
  console.log(`dumped ${vendors.length} vendors, ${campaigns.length} campaigns`);
})();
