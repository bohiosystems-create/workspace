// Entry for the static demo: mounts the real page and answers /api/marketing in the browser.
import React from "react";
import { createRoot } from "react-dom/client";
import Page from "../app/page";
import { buildMarketingDashboard, applyAction } from "../lib/marketing";

const json = (o: any) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

function briefing(d: any) {
  const top = d.vendors[0], low = d.vendors[d.vendors.length - 1];
  const recs = d.recommendations.map((r: any) => (r.type === "PAUSE" ? `pause ${r.campaign}` : `move SAR ${r.amountK}K from ${r.vendor} to ${r.toVendor}`));
  return `[Offline demo summary — the live app has Claude write this.] Marketing spend of SAR ${d.kpis.spendK}K has produced ${d.kpis.contracts} contracts worth SAR ${d.kpis.revenueM}M (${d.kpis.costToSalesPct}% cost-to-sales). ${top.name} leads the scorecard at ${top.score}/100; ${low.name} trails at ${low.score}/100. ${recs.length ? `Decisions to take now: ${recs.join("; ")}.` : "No actions recommended."} ${d.alerts.length} alerts are open, mainly SLA breaches and contract renewals.`;
}

function vendorNote(d: any, id: string) {
  const v = d.vendors.find((x: any) => x.id === id);
  return `[Offline demo draft]\nSubject: ${v.name} — performance review and next steps\n\nHi ${v.contact.split(" ")[0]},\n\nOur latest scorecard puts ${v.name} at ${v.score}/100 (${v.verdict}): SAR ${v.spendK}K spend, ${v.contracts} contracts, ${v.costToSalesPct ?? "n/a"}% cost-to-sales, qualified rate ${v.qualRatePct ?? "n/a"}%.\n${v.slaBreaches.length ? `SLA breaches: ${v.slaBreaches.join("; ")}.\n` : ""}Please send a remediation plan by end of next week. Your contract runs to ${new Date(v.contractEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}.\n\nBest regards,\nMarketing`;
}

window.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.includes("/api/marketing")) throw new Error("offline demo");
  try {
    if (!init || !init.method || init.method === "GET") {
      const dashboard = await buildMarketingDashboard();
      return json({ dashboard, narrative: url.includes("narrative=1") ? briefing(dashboard) : null });
    }
    const body = JSON.parse(init.body);
    if (body.action === "VENDOR_NOTE") return json({ note: vendorNote(await buildMarketingDashboard(), body.vendorId) });
    await applyAction(body.action === "SHIFT_BUDGET"
      ? { type: "SHIFT_BUDGET", campaignId: body.campaignId, toCampaignId: body.toCampaignId, amountK: Number(body.amountK) }
      : { type: body.action, campaignId: body.campaignId });
    return json({ dashboard: await buildMarketingDashboard() });
  } catch (e: any) {
    return json({ error: e.message });
  }
}) as any;

createRoot(document.getElementById("root")!).render(<Page />);
