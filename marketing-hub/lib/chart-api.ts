// POST /api/chart — charts for any caller (the app, a BI tool, a script):
//   { query: ChartQuery }            → that chart, computed from the data
//   { queries: ChartQuery[] }        → several charts
//   { prompt: "…" }                  → the AI turns the request into queries (any number of charts), the app computes
//                                      them; without an AI key the built-in reading of the request is used
// GET /api/chart → the catalogue of datasets, fields, named measures, chart types and transforms.
import { buildChatContext } from "./chat";
import { runChartQuery, chartSchema, chartSchemaText, chartDigest, type ChartQuery, chartFromText } from "./chart-query";
import { buildChart, chartRequestFromText } from "./charts";
import { llmStatus, runLlm } from "./llm";
import { type Lang, looksArabic } from "./i18n";
import type { ChartSpec } from "./charts";

const PLANNER = `You turn a request for charts about a Saudi real-estate developer's marketing into chart queries for an engine that computes every number from the data. Reply with ONLY a JSON array of queries (one per chart asked for; usually one), no prose.
Query fields: dataset, type (pie, donut, bar, hbar, stacked, stackedh, grouped, line, area, scatter, table, kpi), x (dimension), series (optional split dimension), measures (formulas: sum/avg/min/max/median/count/distinct of fields with + - * /, or named measures), filters [{field, op (=, !=, in, not_in, >, >=, <, <=, between, contains), value}], period ("2025", "Q1 2026", "last month", "last 6 months", "year to date") or from/to (YYYY-MM), transform (share, cumulative, index, change, change_pct, rank), sort (value_desc, value_asc, label), limit, title (in the request's language).
Rules: revenue = sum(sales) (CRM contracted sales, SAR M); spend is SAR K; one chart = one unit (never mix SAR K and SAR M); pies only for parts of one total; time on x → line/area/stacked; >8 series fold into Other.
Datasets:
`;

export async function chartApi(body: any, uiLang?: Lang): Promise<{ charts: ChartSpec[]; queries: ChartQuery[]; engine: string; errors?: string[] }> {
  const text = typeof body?.prompt === "string" ? body.prompt : "";
  const lang: Lang = body?.lang === "ar" || body?.lang === "en" ? body.lang : looksArabic(text) ? "ar" : uiLang ?? "en";
  const ctx = await buildChatContext(lang);
  const run = (qs: ChartQuery[]) => qs.map((q) => ({ q, r: runChartQuery(q, ctx.q, lang) }));

  if (body?.query || Array.isArray(body?.queries)) {
    const qs: ChartQuery[] = body.query ? [body.query] : body.queries.slice(0, 12);
    const out = run(qs);
    return { charts: out.filter((x) => !("error" in x.r)).map((x) => x.r as ChartSpec), queries: qs, engine: "query", errors: out.filter((x) => "error" in x.r).map((x) => (x.r as any).error) };
  }
  if (!text.trim()) throw new Error("Send { prompt }, { query } or { queries }. GET /api/chart lists the datasets and fields.");

  if (llmStatus().enabled) {
    let errors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await runLlm({
          task: "analysis", system: PLANNER + chartSchemaText(),
          messages: [{ role: "user", content: attempt ? `${text}\n\nYour previous queries failed: ${errors.join(" | ")}. Fix them.` : text }], maxTokens: 1500,
        });
        const json = res.text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)?.[0];
        if (!json) { errors = ["no JSON in the reply"]; continue; }
        const parsed = JSON.parse(json);
        const qs: ChartQuery[] = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, 8);
        const out = run(qs);
        const ok = out.filter((x) => !("error" in x.r));
        errors = out.filter((x) => "error" in x.r).map((x) => (x.r as any).error);
        if (ok.length) return { charts: ok.map((x) => x.r as ChartSpec), queries: ok.map((x) => x.q), engine: res.provider, ...(errors.length ? { errors } : {}) };
      } catch (e: any) { errors = [e?.message ?? String(e)]; }
    }
  }
  const spec = chartFromText(text, ctx.q, lang);
  if ("error" in spec) throw new Error(spec.error);
  return { charts: [spec], queries: [], engine: "rules" };
}

export const chartCatalogue = () => chartSchema();
export { chartDigest };
