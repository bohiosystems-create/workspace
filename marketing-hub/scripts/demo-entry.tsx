// Entry for the static demo: mounts the real page and answers /api/marketing in the browser.
import React from "react";
import { createRoot } from "react-dom/client";
import DirectorPage from "../app/page";
import OrchestrationPage from "../app/orchestration/page";
import Page from "../app/campaigns/page";
import InvoicesPage from "../app/invoices/page";
import DecisionsPage from "../app/decisions/page";
import ExperimentsPage from "../app/experiments/page";
import BenchPage from "../app/bench/page";
import DataPage from "../app/data/page";
import { agentState, agentDoc, agentAction } from "../lib/agent-api";
import { directorState, directorAction } from "../lib/director-api";
import { orchestrationState, orchestrationAction } from "../lib/orchestrator-api";
import { templateCsv } from "../lib/vendor-reports";
import Chat from "../app/_components/Chat";
import { buildMarketingDashboard, applyAction } from "../lib/marketing";
import { buildRecommendations, handleRecommendationRequest } from "../lib/recommendations";
import { localAnswer } from "../lib/chat";
import { buildCrmDashboard, syncCrm } from "../lib/crm";
import { type Lang, isLang, nm, K, M, dt } from "../lib/i18n";
import { ensureOracleSynced, syncOracle, buildInvoiceDashboard, applyInvoiceAction } from "../lib/invoices";

const json = (o: any) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

const langOf = (x: any): Lang => (isLang(x) ? x : "en");

function briefing(d: any, l: Lang) {
  const top = d.vendors[0], low = d.vendors[d.vendors.length - 1];
  const recs = d.recommendations.map((r: any) => (r.type === "PAUSE"
    ? (l === "ar" ? `إيقاف ${nm(l, r.campaign)}` : `pause ${r.campaign}`)
    : (l === "ar" ? `نقل ${K(l, r.amountK)} من ${nm(l, r.vendor)} إلى ${nm(l, r.toVendor)}` : `move SAR ${r.amountK}K from ${r.vendor} to ${r.toVendor}`)));
  if (l === "ar")
    return `[ملخص تجريبي دون اتصال — في التطبيق الفعلي يكتبه Claude.] أنتج إنفاق تسويقي بقيمة ${K(l, d.kpis.spendK)} ما مجموعه ${d.kpis.contracts} عقداً بقيمة ${M(l, d.kpis.revenueM)} (نسبة التكلفة إلى المبيعات ${d.kpis.costToSalesPct}%). يتصدّر ${nm(l, top.name)} بطاقة التقييم بـ ${top.score}/100، بينما يأتي ${nm(l, low.name)} أخيراً بـ ${low.score}/100. ${recs.length ? `القرارات المطلوبة الآن: ${recs.join("؛ ")}.` : "لا توجد إجراءات موصى بها."} ويوجد ${d.alerts.length} تنبيهاً مفتوحاً، أغلبها إخلالات باتفاقيات الخدمة وتجديدات العقود.`;
  return `[Offline demo summary — the live app has Claude write this.] Marketing spend of SAR ${d.kpis.spendK}K has produced ${d.kpis.contracts} contracts worth SAR ${d.kpis.revenueM}M (${d.kpis.costToSalesPct}% cost-to-sales). ${top.name} leads the scorecard at ${top.score}/100; ${low.name} trails at ${low.score}/100. ${recs.length ? `Decisions to take now: ${recs.join("; ")}.` : "No actions recommended."} ${d.alerts.length} alerts are open, mainly SLA breaches and contract renewals.`;
}

function vendorNote(d: any, id: string, l: Lang) {
  const v = d.vendors.find((x: any) => x.id === id);
  if (l === "ar")
    return `[مسودة تجريبية دون اتصال]\nالموضوع: ${nm(l, v.name)} — مراجعة الأداء والخطوات التالية\n\nالسادة / ${nm(l, v.name)} المحترمون،\n\nتضع بطاقة التقييم الأخيرة لدينا ${nm(l, v.name)} عند ${v.score}/100: إنفاق ${K(l, v.spendK)}، ${v.contracts} عقداً، نسبة التكلفة إلى المبيعات ${v.costToSalesPct ?? "غير متاحة"}%، ونسبة المؤهلين ${v.qualRatePct ?? "غير متاحة"}%.\n${v.slaBreaches.length ? `إخلالات اتفاقية الخدمة: ${v.slaBreaches.join("؛ ")}.\n` : ""}نرجو إرسال خطة تصحيحية بنهاية الأسبوع القادم. يمتد عقدكم حتى ${dt(l, v.contractEnd, { month: "short", year: "numeric" })}.\n\nوتفضلوا بقبول فائق الاحترام،\nفريق التسويق`;
  return `[Offline demo draft]\nSubject: ${v.name} — performance review and next steps\n\nHi ${v.contact.split(" ")[0]},\n\nOur latest scorecard puts ${v.name} at ${v.score}/100 (${v.verdict}): SAR ${v.spendK}K spend, ${v.contracts} contracts, ${v.costToSalesPct ?? "n/a"}% cost-to-sales, qualified rate ${v.qualRatePct ?? "n/a"}%.\n${v.slaBreaches.length ? `SLA breaches: ${v.slaBreaches.join("; ")}.\n` : ""}Please send a remediation plan by end of next week. Your contract runs to ${new Date(v.contractEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}.\n\nBest regards,\nMarketing`;
}

const qlang = (url: string) => langOf(new URL(url, "http://x").searchParams.get("lang"));

window.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.includes("/api/orchestration")) {
    try {
      if (init?.method === "POST") return json(await orchestrationAction(JSON.parse(init.body)));
      return json(await orchestrationState(qlang(url)));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/director")) {
    try {
      if (init?.method === "POST") return json(await directorAction(JSON.parse(init.body)));
      return json(await directorState(qlang(url)));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/agent")) {
    try {
      if (init?.method === "POST") return json(await agentAction(JSON.parse(init.body)));
      const u = new URL(url, "http://x").searchParams;
      const l = langOf(u.get("lang"));
      const doc = u.get("doc");
      if (doc === "qbr" || doc === "rfp") return json(await agentDoc(doc, String(u.get("vendor")), String(u.get("quarter") ?? "2026-Q2"), l));
      return json(await agentState(l));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/ingest/vendor-report")) return new Response(await templateCsv(), { headers: { "Content-Type": "text/csv" } });
  if (url.includes("/api/chat")) {
    try {
      const { messages, lang } = JSON.parse(init.body);
      return json(await localAnswer(messages[messages.length - 1].content, undefined, undefined, langOf(lang))); // rules answerer only in the demo
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/recommendations")) {
    try {
      let l = qlang(url);
      if (init?.method === "POST") {
        const b = JSON.parse(init.body);
        l = langOf(b.lang);
        await handleRecommendationRequest(b); // template drafts only in the demo
      }
      return json(await buildRecommendations(l));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/crm")) {
    try {
      if (init?.method === "POST") {
        const b = JSON.parse(init.body);
        await syncCrm();
        return json({ dashboard: await buildCrmDashboard(langOf(b.lang)) });
      }
      return json({ dashboard: await buildCrmDashboard(qlang(url)) });
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/invoices")) {
    try {
      await ensureOracleSynced();
      if (!init || !init.method || init.method === "GET") return json({ dashboard: await buildInvoiceDashboard(qlang(url)) });
      const b = JSON.parse(init.body);
      const l = langOf(b.lang);
      if (b.action === "SYNC") await syncOracle();
      else await applyInvoiceAction({ ...b, type: b.action }, l);
      return json({ dashboard: await buildInvoiceDashboard(l) });
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (!url.includes("/api/marketing")) throw new Error("offline demo");
  try {
    if (!init || !init.method || init.method === "GET") {
      const l = qlang(url);
      const dashboard = await buildMarketingDashboard(l);
      return json({ dashboard, narrative: url.includes("narrative=1") ? briefing(dashboard, l) : null });
    }
    const body = JSON.parse(init.body);
    const l = langOf(body.lang);
    if (body.action === "VENDOR_NOTE") return json({ note: vendorNote(await buildMarketingDashboard(l), body.vendorId, l) });
    await applyAction(body.action === "SHIFT_BUDGET"
      ? { type: "SHIFT_BUDGET", campaignId: body.campaignId, toCampaignId: body.toCampaignId, amountK: Number(body.amountK) }
      : { type: body.action, campaignId: body.campaignId }, l);
    return json({ dashboard: await buildMarketingDashboard(l) });
  } catch (e: any) {
    return json({ error: e.message });
  }
}) as any;

// Tiny client-side router (pages navigate with plain anchors).
const root = createRoot(document.getElementById("root")!);
const show = (path: string) => {
  (window as any).__demoPath = path;
  root.render(<React.Fragment key={path}>{({ "/orchestration": <OrchestrationPage />, "/campaigns": <Page />, "/invoices": <InvoicesPage />, "/decisions": <DecisionsPage />, "/experiments": <ExperimentsPage />, "/bench": <BenchPage />, "/data": <DataPage /> } as Record<string, React.ReactNode>)[path] ?? <DirectorPage />}</React.Fragment>);
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
