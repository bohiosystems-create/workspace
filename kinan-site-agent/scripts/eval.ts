// Runs the agent's exam (evals/cases.ts) against the AI providers configured in the environment, on a fresh copy of
// the day's demo data for every question, and reports what passed, what failed and why, with speed per provider.
//   npm run eval                       every case, with the providers in the environment (ANTHROPIC_API_KEY / OPENAI_API_KEY)
//   npm run eval -- --provider openai  one provider (anthropic | openai), or "both" to compare them side by side
//   npm run eval -- --only fm-         cases whose id starts with this
//   EVAL_MIN=0.85                      fail (exit 1) below this pass rate — for CI
// Results: evals/results/<time>-<provider>.json and evals/results/latest.md
import fs from "node:fs";
import path from "node:path";
import { seedDb } from "../lib/seed";
import { runAgent, type AgentContext } from "../lib/core/agent";
import type { Repo } from "../lib/core/tools";
import { configFrom } from "../lib/core/llm/router";
import { demoEmails } from "../lib/core/emails";
import { findById } from "../lib/auth/people";
import { fmToday } from "../lib/fm/engine";
import type { Db } from "../lib/types";
import { CASES, type Case } from "../evals/cases";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const providerArg = (arg("provider") ?? "auto").toLowerCase();
const only = arg("only");
const MIN = Number(process.env.EVAL_MIN ?? 0.8);
const CONCURRENCY = Math.max(1, Number(arg("concurrency") ?? 3));

/** Ids the agent may quote: anything else that looks like one was invented. */
function knownIds(db: Db): Set<string> {
  const d = db.data, f = fmToday(db);
  return new Set([
    ...d.procurement.pos.map((x) => x.po), ...d.procurement.packages.map((x) => x.id), ...d.procurement.requests.map((x) => x.id), ...d.procurement.deliveries.map((x) => x.id),
    ...d.quality.ncrs.map((x) => x.id), ...d.safety.permits.map((x) => x.id), ...f.workOrders.map((x) => x.id), ...f.alarms.map((x) => x.id),
  ]);
}
const ID_RE = /\b(PO-\d{7}|PKG-\d{2}|MR-\d{3}|DN-\d{5}|NCR-\d{4}|PTW-[A-Z]{2}-\d{4}|WO-[EWA]\d{5}|AL-[EWA]\d{3})\b/g;

interface Result { id: string; area: string; provider: string; pass: boolean; fails: string[]; tools: string[]; ms: number; model?: string; reply: string }

async function runCase(c: Case, provider: string): Promise<Result> {
  const db = seedDb();
  const exp = c.expect(db);
  const repo: Repo = { db, save: () => undefined, emails: async () => ({ mode: "demo", mailbox: "demo", lastSync: null, error: null, emails: demoEmails(db.data) }) };
  const env = { ...process.env, ...(provider === "auto" ? {} : { LLM_MODE: provider, LLM_FALLBACK: "false" }) } as Record<string, string | undefined>;
  const tools: string[] = [];
  const user = c.user ? findById(db, c.user) ?? null : null;
  const ctx: AgentContext = { author: user?.name ?? "Eval", user, channel: c.area === "field" ? "field" : "web", fm: c.fm, aiOnly: true, deadline: Date.now() + 120_000, onTool: (n) => tools.push(n) };
  const t0 = Date.now();
  const fails: string[] = [];
  let reply = "", model: string | undefined;
  try {
    const r = await runAgent(repo, [{ role: "user", content: c.ask }], ctx, configFrom(env));
    reply = r.reply; model = `${r.route.provider}:${r.route.model}`;
  } catch (e) { fails.push(`no answer: ${(e as Error).message}`); }
  const low = reply.toLowerCase();
  if (reply) {
    if (exp.tools && !exp.tools.some((t) => tools.includes(t))) fails.push(`expected a tool: ${exp.tools.join(" | ")} (used: ${tools.join(", ") || "none"})`);
    for (const m of exp.mentions ?? []) if (typeof m === "string" ? !low.includes(m.toLowerCase()) : !m.test(reply)) fails.push(`missing: ${m}`);
    for (const f of exp.forbid ?? []) if (f.test(reply)) fails.push(`must not say: ${f}`);
    const ids = knownIds(db);
    const invented = [...new Set(reply.match(ID_RE) ?? [])].filter((x) => !ids.has(x) && !c.ask.includes(x));
    if (invented.length) fails.push(`invented id(s): ${invented.join(", ")}`);
    const after = exp.after?.(db);
    if (after) fails.push(after);
  }
  return { id: c.id, area: c.area, provider, pass: !fails.length, fails, tools, ms: Date.now() - t0, model, reply };
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}

async function main() {
  const cases = CASES.filter((c) => !only || c.id.startsWith(only));
  const have = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY };
  const providers = providerArg === "both" ? (["anthropic", "openai"] as const).filter((p) => have[p]) : [providerArg];
  if (!have.anthropic && !have.openai) { console.error("No AI provider: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY."); process.exit(2); }
  const dir = path.join(process.cwd(), "evals", "results");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const md: string[] = [`# Agent eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "", `${cases.length} cases on the demo data of ${seedDb().data.meta.dataDate}.`, ""];
  let worst = 1;
  for (const p of providers) {
    console.log(`\n=== ${p} · ${cases.length} cases`);
    const rs = await pool(cases, CONCURRENCY, async (c) => { const r = await runCase(c, p); console.log(`${r.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(26)} ${String(Math.round(r.ms / 100) / 10).padStart(5)} s  ${r.fails.join(" · ").slice(0, 160)}`); return r; });
    const passed = rs.filter((r) => r.pass).length, rate = passed / rs.length;
    worst = Math.min(worst, rate);
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
    const byArea = [...new Set(rs.map((r) => r.area))].map((a) => { const xs = rs.filter((r) => r.area === a); return `${a} ${xs.filter((r) => r.pass).length}/${xs.length}`; }).join(" · ");
    console.log(`--- ${p}: ${passed}/${rs.length} passed (${Math.round(rate * 100)}%) · median ${Math.round(ms[Math.floor(ms.length / 2)] / 100) / 10} s · ${byArea}`);
    fs.writeFileSync(path.join(dir, `${stamp}-${p}.json`), JSON.stringify({ provider: p, at: new Date().toISOString(), passed, total: rs.length, results: rs }, null, 2));
    md.push(`## ${p}: ${passed}/${rs.length} passed (${Math.round(rate * 100)}%)`, "", `Median ${Math.round(ms[Math.floor(ms.length / 2)] / 100) / 10} s · slowest ${Math.round(ms[ms.length - 1] / 100) / 10} s · ${byArea}`, "", "| Case | Area | Result | Time | Tools | Why it failed |", "|---|---|---|---|---|---|",
      ...rs.map((r) => `| ${r.id} | ${r.area} | ${r.pass ? "pass" : "**fail**"} | ${Math.round(r.ms / 100) / 10} s | ${r.tools.join(", ")} | ${r.fails.join("; ").replace(/\|/g, "/")} |`), "");
  }
  fs.writeFileSync(path.join(dir, "latest.md"), md.join("\n"));
  console.log(`\nReport: evals/results/latest.md`);
  if (worst < MIN) { console.error(`Pass rate ${Math.round(worst * 100)}% is below EVAL_MIN ${Math.round(MIN * 100)}%.`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(2); });
