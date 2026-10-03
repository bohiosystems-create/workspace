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

  if (fails.length) console.log(fails.join("\n"));
  console.log(`\n${pass}/${pass + fails.length} chart engine checks passed.`);
  process.exit(fails.length ? 1 : 0);
})();
