// Chart engine checks: the open-ended query language (lib/chart-query.ts) computes the same numbers as the rest of
// the app, transforms add up, and bad queries fail with a useful message. Run: npm run chart:eval
import { buildChatContext } from "../lib/chat";
import { runChartQuery, type ChartQuery } from "../lib/chart-query";
import { buildChart } from "../lib/charts";

(async () => {
  const c = await buildChatContext("en");
  let pass = 0; const fails: string[] = [];
  const ok = (name: string, cond: boolean, got?: unknown) => { if (cond) pass++; else fails.push(`✗ ${name}${got !== undefined ? ` — got ${JSON.stringify(got).slice(0, 200)}` : ""}`); };
  const run = (q: ChartQuery) => runChartQuery(q, c.q, "en") as any;
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

  // Same numbers as the built-in charts and the brief.
  const a = run({ dataset: "campaigns", type: "pie", x: "vendor", measures: ["sum(sales)"], period: "year to date" });
  const b = buildChart({ metric: "sales", groupBy: "vendor", type: "pie" }, c.q, "en") as any;
  ok("revenue by vendor matches the built-in chart", JSON.stringify(a.values) === JSON.stringify(b.values), [a.values, b.values]);
  ok("pie total 134", Math.round(a.total) === 134, a.total);
  const y = run({ dataset: "campaigns", x: "year", measures: ["sum(sales)"], filters: [{ field: "status", op: "=", value: "past" }] });
  ok("2023–2025 history sales ≈ 1,014M", Math.abs(sum(y.series[0].values) - 1014.4) < 1.5, sum(y.series[0].values));
  // Transforms.
  const sh = run({ dataset: "leads", x: "city", series: "buyerType", measures: ["count()"], transform: "share" });
  ok("share: each city adds to 100%", sh.labels.every((_: string, i: number) => Math.abs(sum(sh.series.map((s: any) => s.values[i])) - 100) < 0.6), sh.series.map((s: any) => s.values[0]));
  const cu = run({ dataset: "campaigns", x: "month", measures: ["sum(sales)"], transform: "cumulative", period: "2025" });
  const plain = run({ dataset: "campaigns", x: "month", measures: ["sum(sales)"], period: "2025" });
  ok("cumulative ends at the year's total", Math.abs(cu.series[0].values.at(-1) - sum(plain.series[0].values)) < 1.5, [cu.series[0].values.at(-1), sum(plain.series[0].values)]);
  const ix = run({ dataset: "market", x: "month", series: "district", measures: ["avg(price_per_sqm)"], transform: "index" });
  ok("index starts at 100", ix.series.every((s: any) => s.values[0] === 100), ix.series.map((s: any) => s.values[0]));
  // Shapes and types.
  ok("stacked split by channel", run({ dataset: "campaigns", type: "stacked", x: "year", series: "channel", measures: ["sum(spend)"] }).series.length >= 6);
  ok("series capped at 8 (Other)", run({ dataset: "campaigns", x: "year", series: "campaign", measures: ["sum(spend)"] }).series.length === 8);
  ok("scatter has points", run({ dataset: "campaigns", type: "scatter", x: "vendor", measures: ["sum(spend)", "sum(sales)"], period: "2026" }).points?.length === 6);
  ok("kpi figures", run({ dataset: "campaigns", measures: ["sum(spend)", "sum(sales)", "cost_to_sales"], period: "2025" }).type === "kpi");
  ok("pie of a ratio becomes bars", run({ dataset: "campaigns", type: "pie", x: "vendor", measures: ["cost_to_sales"] }).type === "bar");
  ok("named measure cpql in SAR", run({ dataset: "creatives", x: "message", measures: ["cpql"] }).unit === "SAR");
  ok("formula equals named measure", JSON.stringify(run({ dataset: "campaigns", x: "channel", measures: ["sum(spend)/(sum(sales)*1000)*100"] }).series[0].values) === JSON.stringify(run({ dataset: "campaigns", x: "channel", measures: ["cost_to_sales"] }).series[0].values));
  ok("score is averaged, no total", run({ dataset: "vendors", x: "vendor", measures: ["score"] }).total === null);
  ok("filters: in + >", run({ dataset: "invoices", x: "vendor", measures: ["sum(outstanding)"], filters: [{ field: "payment", op: "in", value: ["Unpaid", "Partly paid"] }, { field: "amount", op: ">", value: 50 }] }).labels?.length > 0);
  ok("last 6 months period", run({ dataset: "campaigns", x: "month", measures: ["sum(spend)"], period: "last 6 months" }).labels?.length === 6);
  ok("Arabic labels", (runChartQuery({ dataset: "campaigns", x: "vendor", measures: ["sum(sales)"] }, (await buildChatContext("ar")).q, "ar") as any).title.includes("حسب"));
  // Errors that guide the AI.
  ok("unknown field lists the valid ones", /Dimensions: .*vendor/.test(run({ dataset: "campaigns", x: "vendr", measures: ["sum(spend)"] }).error ?? ""));
  ok("bad formula is reported", /expected/.test(run({ dataset: "campaigns", x: "vendor", measures: ["sum(spend"] }).error ?? ""));
  ok("mixed units refused", /one axis/.test(run({ dataset: "campaigns", x: "vendor", measures: ["sum(spend)", "sum(sales)"] }).error ?? ""));
  ok("no eval: code is not executed", /unknown function|unexpected/.test(run({ dataset: "campaigns", x: "vendor", measures: ["constructor(1)"] }).error ?? ""));
  ok("unknown dataset", /Use one of/.test(run({ dataset: "x", measures: ["count()"] } as any).error ?? ""));

  // Demo coverage: every use case shown in the demo has data behind it (≥ 2 points, no error).
  const COVER: [string, ChartQuery][] = [
    ["Revenue by vendor (pie)", { dataset: "campaigns", type: "pie", x: "vendor", measures: ["sum(sales)"], period: "year to date" }],
    ["Spend by year and channel", { dataset: "campaigns", type: "stacked", x: "year", series: "channel", measures: ["sum(spend)"] }],
    ["Ramadan 2026 vs past Ramadans", { dataset: "campaigns", x: "year", measures: ["cost_to_sales"], filters: [{ field: "season", op: "=", value: "RAMADAN" }] }],
    ["Cost to sales by quarter per project", { dataset: "campaigns", type: "line", x: "quarter", series: "project", measures: ["cost_to_sales"] }],
    ["Monthly leads funnel 2026", { dataset: "campaigns", x: "month", measures: ["sum(leads)", "sum(qualified)", "sum(viewings)", "sum(contracts)"], period: "2026" }],
    ["CRM vs reported sales", { dataset: "campaigns", type: "grouped", x: "vendor", measures: ["sum(sales)", "sum(reported_sales)"], filters: [{ field: "status", op: "=", value: "live" }] }],
    ["Buyer types by year", { dataset: "leads", type: "stacked", x: "year", series: "buyerType", measures: ["count()"], transform: "share" }],
    ["Investors' share in past Ramadan campaigns", { dataset: "leads", x: "year", measures: ["count()"], filters: [{ field: "season", op: "=", value: "RAMADAN" }, { field: "buyerType", op: "=", value: "Investor" }] }],
    ["Response time by year", { dataset: "leads", type: "stacked", x: "year", series: "responseBand", measures: ["count()"], transform: "share" }],
    ["Why we lose leads, by year", { dataset: "leads", type: "stacked", x: "year", series: "lostReason", measures: ["count()"], filters: [{ field: "stage", op: "=", value: "LOST" }] }],
    ["Creatives by message", { dataset: "creatives", x: "message", measures: ["cpql"] }],
    ["Paid to vendors by year", { dataset: "invoices", type: "stacked", x: "year", series: "vendor", measures: ["sum(paid)"] }],
    ["Outstanding by vendor", { dataset: "invoices", x: "vendor", measures: ["sum(outstanding)"], filters: [{ field: "source", op: "=", value: "oracle" }] }],
    ["Vendors: past sales incl. past vendors", { dataset: "vendors", type: "hbar", x: "vendor", measures: ["past_sales"], filters: [{ field: "past_sales", op: ">", value: 0 }] }],
    ["Vendors by status", { dataset: "vendors", x: "status", measures: ["count()"] }],
    ["Market prices since 2023", { dataset: "market", type: "line", x: "quarter", series: "district", measures: ["avg(price_per_sqm)"] }],
    ["Mortgage rate trend", { dataset: "mortgage", type: "line", x: "quarter", measures: ["avg(rate)"] }],
    ["Competitor ads since 2025", { dataset: "competitors", type: "line", x: "month", series: "competitor", measures: ["sum(ads)"] }],
    ["Late deliverables by vendor", { dataset: "deliverables", x: "vendor", measures: ["sum(late)"], filters: [{ field: "late", op: ">", value: 0 }] }],
    ["On-time rate by vendor", { dataset: "deliverables", x: "vendor", measures: ["sum(on_time)/count()*100"] }],
    ["Work orders by kind", { dataset: "work_orders", x: "kind", measures: ["count()"] }],
    ["Recommendations by type and severity", { dataset: "recommendations", type: "stacked", x: "type", series: "severity", measures: ["count()"] }],
    ["Money at stake by vendor", { dataset: "recommendations", x: "vendor", measures: ["sum(impact)"] }],
    ["Daily check by severity", { dataset: "daily_check", x: "severity", measures: ["count()"] }],
    ["Target vs actual by month", { dataset: "targets", type: "grouped", x: "month", measures: ["sum(target)", "sum(actual)"], to: "2026-05" }],
    ["% of target by project", { dataset: "targets", x: "project", measures: ["sum(actual)/sum(target)*100"], to: "2026-05" }],
    ["Budget plan change by vendor", { dataset: "budget_plan", x: "vendor", measures: ["sum(change)"] }],
    ["Meta spend by agency", { dataset: "meta", type: "pie", x: "agency", measures: ["sum(spend)"] }],
  ];
  for (const [name, q] of COVER) {
    const r = run(q);
    const n = r.error ? 0 : r.points?.length ?? r.labels?.length ?? 0;
    const real = r.error ? false : (r.series ?? [{ values: r.values }]).some((s: any) => s.values.filter((v: any) => v !== null && v !== 0).length >= (r.type === "kpi" ? 1 : 2));
    ok(`demo use case: ${name}`, !r.error && n >= 2 && real, r.error ?? { n, values: r.series?.map((s: any) => s.values) });
  }
  // Meta revenue (the question that produced the wrong charts) and chart-type guard rails.
  const mr = run({ dataset: "meta", type: "line", x: "month", measures: ["sum(revenue)"], period: "last six months" });
  ok("Meta revenue, last six months: 6 months, Dec 2025 = 0, total ≈ 18.6M", mr.labels?.length === 6 && mr.series?.[0]?.values[0] === 0 && Math.abs(sum(mr.series?.[0]?.values ?? []) - 18.6) < 0.3, [mr.labels, mr.series?.[0]?.values]);
  ok("Meta revenue never exceeds its campaigns' CRM sales", (() => { const lv = run({ dataset: "campaigns", measures: ["sum(sales)"], filters: [{ field: "code", op: "in", value: ["ASH-SEARCH-26", "AND-OFFPLAN-26", "ASH-CREATOR-26", "AND-CREATOR-26"] }] }); return sum(mr.series[0].values) <= lv.series[0].values[0]; })());
  ok("line over categories becomes bars", run({ dataset: "campaigns", type: "line", x: "channel", measures: ["sum(sales)"] }).type === "bar");
  ok("Meta chart title says Meta", /^Meta ads/.test(mr.title));

  // The deeper data keeps the live demo numbers: history leads add up to the history, invoices archive to its spend.
  const hl = run({ dataset: "leads", measures: ["count()"], filters: [{ field: "status", op: "=", value: "past" }] });
  ok("past leads = history leads (63,260)", hl.series?.[0]?.values[0] === 63260, hl.series?.[0]?.values);
  const hi = run({ dataset: "invoices", measures: ["sum(amount)"], filters: [{ field: "source", op: "=", value: "history" }] });
  ok("archive invoices = history spend (SAR 14,780K)", Math.abs((hi.series?.[0]?.values[0] ?? 0) - 14780) < 2, hi.series?.[0]?.values);
  const mk = run({ dataset: "market", x: "month", measures: ["avg(price_per_sqm)"], filters: [{ field: "district", op: "=", value: "Jeddah South" }], from: "2025-01" });
  ok("market 2025+ unchanged by the extension", mk.labels?.length === 17);

  if (fails.length) console.log(fails.join("\n"));
  console.log(`\n${pass}/${pass + fails.length} chart engine checks passed.`);
  process.exit(fails.length ? 1 : 0);
})();
