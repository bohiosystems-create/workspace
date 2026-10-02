// The vendor agent's view of the world, built in one pass:
//   unified data → incrementality → fair scores → renewal decisions → automatic re-bid (trial proposals).
import { prisma } from "./prisma";
import { buildScores } from "./scoring";
import { buildMarketingDashboard } from "./marketing";
import { buildCrmDashboard } from "./crm";
import { buildInvoiceDashboard } from "./invoices";
import { buildBench, autoRebid } from "./bench";
import { decide, type RenewalDecision } from "./renewal";
import { type Lang } from "./i18n";

export async function buildAgent(lang: Lang = "en") {
  const sc = await buildScores(lang);
  const [mkt, crm, inv, vendors] = await Promise.all([buildMarketingDashboard(lang), buildCrmDashboard(lang), buildInvoiceDashboard(lang), prisma.vendor.findMany()]);

  const decideAll = (bench: Awaited<ReturnType<typeof buildBench>>): RenewalDecision[] =>
    sc.scores.map((score) => {
      const mv = mkt.vendors.find((v) => v.id === score.vendorId)!;
      const lastTrial = bench.trials.filter((t) => t.incumbentId === score.vendorId && t.readout).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0];
      return decide({
        score,
        inc: sc.incrementality.perVendor.find((x) => x.vendorId === score.vendorId),
        vendor: { id: mv.id, name: mv.name, category: mv.category, contractEnd: mv.contractEnd, monthsToExpiry: mv.monthsToExpiry, slaBreaches: mv.slaBreaches, slaResponseHrs: mv.slaResponseHrs, latestRespHrs: mv.latestRespHrs, model: mv.model },
        crmFlags: crm.vendors.find((v) => v.id === score.vendorId)?.flags ?? [],
        dataFlags: sc.unified.vendors.find((v) => v.id === score.vendorId)?.flags ?? [],
        billing: {
          blocked: inv.invoices.filter((i) => i.vendorId === score.vendorId && i.blocked && i.outstandingK > 0 && i.decision === "PENDING").length,
          anomalies: inv.invoices.filter((i) => i.vendorId === score.vendorId && i.decision !== "APPROVED").flatMap((i) => i.flags.filter((f) => f.code === "SPIKE").map((f) => `${i.invoiceNumber}: ${f.text}`)),
        },
        bench: vendors.filter((v) => v.status === "BENCH" && v.category === mv.category).map((v) => v.name),
        trial: lastTrial?.readout ? { challenger: lastTrial.challenger, readout: lastTrial.readout } : null,
      }, lang);
    });

  let bench = await buildBench(lang);
  let decisions = decideAll(bench);
  const proposed = await autoRebid(decisions);
  // Rebuild when this call proposed a trial, or when a concurrent call did after this bench was read.
  if (proposed.length || (await prisma.trial.count()) !== bench.trials.length) { bench = await buildBench(lang); decisions = decideAll(bench); }

  return { scores: sc.scores, method: sc.method, unified: sc.unified, incrementality: sc.incrementality, decisions, bench, mkt, crm, inv, proposed };
}
export type Agent = Awaited<ReturnType<typeof buildAgent>>;
