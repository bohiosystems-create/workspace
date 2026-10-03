// Entry for the static demo: mounts the real page and answers /api/marketing in the browser.
import { layoutState, layoutAction } from "../lib/report-layout";
import { campaignBoards } from "../lib/campaign-boards";
import { campaignLayoutAction } from "../lib/campaign-layout";
import React from "react";
import { createRoot } from "react-dom/client";
import DirectorPage from "../app/page";
import OrchestrationPage from "../app/orchestration/page";
import ReportsPage from "../app/reports/page";
import Page from "../app/campaigns/page";
import ExperimentsPage from "../app/experiments/page";
import DataPage from "../app/data/page";
import DailyPage from "../app/daily/page";
import HistoryPage from "../app/history/page";
import IdeasPage from "../app/ideas/page";
import { ideasState, ideasAction } from "../lib/ideas-api";
import { llmStatus, TASKS, sampleReady, aiState } from "./demo-llm"; // the offline demo has no AI provider
import { dailyApiState, dailyAction } from "../lib/daily-api";
import { historyState } from "../lib/history";
import { agentState, agentDoc, agentAction } from "../lib/agent-api";
import { directorState, directorAction } from "../lib/director-api";
import { orchestrationState, orchestrationAction, vendorState } from "../lib/orchestrator-api";
import { reportsState, reportsAction, getReport } from "../lib/reports-api";
import { templateCsv } from "../lib/vendor-reports";
import Chat from "../app/_components/Chat";
import { buildMarketingDashboard, applyAction } from "../lib/marketing";
import { buildRecommendations, handleRecommendationRequest } from "../lib/recommendations";
import { localAnswer } from "../lib/chat";
import { chartApi, chartCatalogue } from "../lib/chart-api";
import { logMiss, listMisses } from "../lib/chat-misses";
import { aiAnswer } from "../lib/chat-ai";
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
  if (url.includes("/api/campaigns/boards")) {
    try {
      if (init?.method === "POST") { const b = JSON.parse(init.body); return json({ ...(await campaignLayoutAction(b)), boards: await campaignBoards(b?.lang === "ar" ? "ar" : "en") }); }
      return json(await campaignBoards(qlang(url)));
    } catch (e: any) { return json({ error: e.message }); }
  }
  if (url.includes("/api/reports/layout")) {
    try { return json(init?.method === "POST" ? await layoutAction(JSON.parse(init.body)) : await layoutState(qlang(url))); }
    catch (e: any) { return json({ error: e.message }); }
  }
  if (url.includes("/api/reports")) {
    try {
      if (init?.method === "POST") return json(await reportsAction(JSON.parse(init.body)));
      const id = new URL(url, "http://x").searchParams.get("id");
      return json(id ? await getReport(id) : await reportsState(qlang(url)));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/orchestration")) {
    try {
      if (init?.method === "POST") return json(await orchestrationAction(JSON.parse(init.body)));
      const vendor = new URL(url, "http://x").searchParams.get("vendor");
      return json(vendor ? await vendorState(vendor, qlang(url)) : await orchestrationState(qlang(url)));
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
  if (url.includes("/api/daily")) {
    try {
      if (init?.method === "POST") return json(await dailyAction(JSON.parse(init.body)));
      return json(await dailyApiState(qlang(url), new URL(url, "http://x").searchParams.get("date") ?? undefined));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/ideas")) {
    try {
      if (init?.method === "POST") return json(await ideasAction(JSON.parse(init.body)));
      return json(await ideasState(qlang(url)));
    } catch (e: any) {
      return json({ error: e.message });
    }
  }
  if (url.includes("/api/ai")) return json({ status: llmStatus(), tasks: TASKS });
  if (url.includes("/api/history")) {
    try { return json(await historyState(qlang(url))); } catch (e: any) { return json({ error: e.message }); }
  }
  if (url.includes("/api/ingest/vendor-report")) return new Response(await templateCsv(), { headers: { "Content-Type": "text/csv" } });
  if (url.includes("/api/chart")) {
    if (init?.method === "POST") { try { return json(await chartApi(JSON.parse(init.body))); } catch (e: any) { return json({ error: e.message }); } }
    return json(chartCatalogue());
  }
  if (url.includes("/api/chat/miss")) {
    if (init?.method === "POST") { await logMiss({ ...JSON.parse(init.body), source: "USER" }); return json({ ok: true }); }
    return json(await listMisses());
  }
  if (url.includes("/api/chat")) {
    try {
      const { messages, lang } = JSON.parse(init.body);
      const history = (messages as any[]).filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12);
      // Claude app edition: Claude answers with the data tools (viewer's own Claude account); otherwise built-in rules.
      await sampleReady;
      if (llmStatus().enabled) {
        try { return json(await aiAnswer(history, undefined, langOf(lang))); } catch (e) { console.warn("Claude unavailable, using built-in answers", e); }
      }
      const r = await localAnswer(history[history.length - 1].content, undefined, undefined, langOf(lang));
      if (r.missed) await logMiss({ question: history[history.length - 1].content, answer: r.reply, lang: langOf(lang), engine: "rules", source: "AUTO" });
      // Say why Claude didn't answer (Claude app edition only; the offline file keeps the usual footnote).
      const st = aiState(), ar = langOf(lang) === "ar";
      if (st.available) r.note = ({
        not_granted: ar ? "أُجيب بالقواعد المدمجة لأن استخدام Claude لم يُسمح به في هذا العرض. أعيدوا فتح الصفحة واضغطوا «السماح» للحصول على إجابات Claude." : "Answered by built-in rules because Claude wasn't allowed in this view. Reopen the page and choose Allow to get Claude's answers.",
        rate_limited: ar ? "أُجيب بالقواعد المدمجة: بلغ حسابكم في Claude حدّ الاستخدام مؤقتاً. حاولوا بعد قليل." : "Answered by built-in rules: your Claude usage limit was reached for now. Try again in a little while.",
        sampling_disabled: ar ? "أُجيب بالقواعد المدمجة: Claude غير متاح لهذا الحساب أو المؤسسة." : "Answered by built-in rules: Claude isn't available for this account or organization.",
      } as Record<string, string>)[st.lastError ?? ""] ?? (ar ? `أُجيب بالقواعد المدمجة لأن Claude لم يتمكن من الإجابة${st.lastError ? ` (${st.lastError})` : ""}. أعيدوا السؤال للمحاولة مجدداً.` : `Answered by built-in rules because Claude couldn't answer${st.lastError ? ` (${st.lastError})` : ""}. Ask again to retry.`);
      else if (llmStatus().enabled === false && (window as any).claude) r.note = ar ? "أُجيب بالقواعد المدمجة: Claude غير متاح في هذا العرض." : "Answered by built-in rules: Claude isn't available in this view.";
      return json(r);
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
  root.render(<React.Fragment key={path}>{({ "/orchestration": <OrchestrationPage />, "/reports": <ReportsPage />, "/campaigns": <Page />, "/decisions": <OrchestrationPage />, "/experiments": <ExperimentsPage />, "/data": <DataPage />, "/daily": <DailyPage />, "/history": <HistoryPage />, "/ideas": <IdeasPage /> } as Record<string, React.ReactNode>)[path] ?? <DirectorPage />}</React.Fragment>);
};
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a[href^='/']");
  if (!a) return;
  e.preventDefault();
  const [full, hash] = a.getAttribute("href")!.split("#");
  const [path, query] = full.split("?");
  (window as any).__demoQuery = query ?? "";
  try { history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search); } catch {}
  show(path || "/");
});
// The assistant lives outside the page root so it survives navigation.
const chatHost = document.createElement("div");
document.body.appendChild(chatHost);
createRoot(chatHost).render(<Chat />);
show("/");
