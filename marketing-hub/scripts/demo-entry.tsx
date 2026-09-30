// Entry for the static demo: mounts the real page and answers /api/marketing in the browser.
import React from "react";
import { createRoot } from "react-dom/client";
import Page from "../app/page";
import InvoicesPage from "../app/invoices/page";
import Chat from "../app/_components/Chat";
import { buildMarketingDashboard, applyAction } from "../lib/marketing";
import { buildRecommendations, handleRecommendationRequest } from "../lib/recommendations";
import { localAnswer } from "../lib/chat";
import { ensureOracleSynced, syncOracle, buildInvoiceDashboard, applyInvoiceAction } from "../lib/invoices";

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
  if (url.includes("/api/chat")) {
    try {
      const { messages } = JSON.parse(init.body);
      return json(await localAnswer(messages[messages.length - 1].content)); // rules answerer only in the demo
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/recommendations")) {
    try {
      if (init?.method === "POST") await handleRecommendationRequest(JSON.parse(init.body)); // template drafts only in the demo
      return json(await buildRecommendations());
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/invoices")) {
    try {
      await ensureOracleSynced();
      if (!init || !init.method || init.method === "GET") return json({ dashboard: await buildInvoiceDashboard() });
      const b = JSON.parse(init.body);
      if (b.action === "SYNC") await syncOracle();
      else await applyInvoiceAction({ ...b, type: b.action });
      return json({ dashboard: await buildInvoiceDashboard() });
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
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

// Tiny client-side router (pages navigate with plain anchors).
const root = createRoot(document.getElementById("root")!);
const show = (path: string) => {
  (window as any).__demoPath = path;
  root.render(<React.Fragment key={path}>{path === "/invoices" ? <InvoicesPage /> : <Page />}</React.Fragment>);
};
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a[href^='/']");
  if (!a) return;
  e.preventDefault();
  show(a.getAttribute("href")!);
});
// The assistant lives outside the page root so it survives navigation.
const chatHost = document.createElement("div");
document.body.appendChild(chatHost);
createRoot(chatHost).render(<Chat />);
show("/");
