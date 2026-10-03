import { buildChatContext } from "../lib/chat";
(async () => {
  const c = await buildChatContext("en");
  const h: any = c.history;
  console.log("history leads total:", h.rows.reduce((s: number, r: any) => s + r.leads, 0), "rows", h.rows.length);
  const d: any = c.director, o: any = c.orch, r: any = c.recs;
  console.log("targets keys:", Object.keys(d.targets), JSON.stringify(d.targets.byAsset[0]).slice(0, 300));
  console.log("targets monthly?", JSON.stringify(d.targets).slice(0, 600));
  console.log("plan line:", JSON.stringify(d.plan.lines[0]).slice(0, 300));
  console.log("deliverable:", o.deliverables.length, JSON.stringify(o.deliverables[0]).slice(0, 400));
  console.log("order:", o.orders.length, JSON.stringify(o.orders[0]).slice(0, 400));
  console.log("rec:", r.recommendations.length, JSON.stringify(r.recommendations[0]).slice(0, 400));
  console.log("daily:", Object.keys(c.daily as any), JSON.stringify((c.daily as any).items?.[0] ?? (c.daily as any).recommendations?.[0]).slice(0, 400));
  console.log("meta campaign:", c.meta?.campaigns.length, JSON.stringify(c.meta?.campaigns[0]).slice(0, 400));
  console.log("agent keys:", Object.keys(c.agent));
  console.log("bench:", JSON.stringify((c.agent as any).bench).slice(0, 500));
  console.log("trials:", JSON.stringify((c.agent as any).trials ?? (c.agent as any).experiments).slice(0, 400));
})();
