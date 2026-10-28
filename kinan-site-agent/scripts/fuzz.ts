// The "sloppy director" test: every tool, called the way a busy person relayed by a model calls it — empty, huge,
// oddly worded, out of range, the wrong type, accents and Arabic, dates as words, windows given backwards, approve
// everything — and checked for what must always hold:
//   1. the answer is valid JSON, within the size the model is given (14,000 characters);
//   2. it is either a real answer or a clear refusal (an error the agent can take to the user), never a crash leaking
//      through ("Cannot read properties of undefined") or junk in the data ("NaN", "undefined", "Invalid Date");
//   3. after every change, the programme's rules hold (lib/core/invariants.ts), and at the end the daily roll gives
//      back the same programme (progress and approvals stay);
//   4. a list of known cases gets the right answer or the right refusal.
// No AI key is needed: the tools are called directly. Runs on every change (npm run fuzz) and in CI.
//
//   npm run fuzz                 # default 40 random calls per tool
//   npm run fuzz -- --n 200 --seed 7
import { seedDb } from "../lib/seed";
import { runTool, TOOL_DEFS, type Repo, type ToolCtx, type ToolDef } from "../lib/core/tools";
import { FM_TOOLS } from "../lib/fm/tools";
import { demoEmails } from "../lib/core/emails";
import { canApprove, directory, findByPhone, type Person } from "../lib/auth/people";
import { checkProgramme, checkReplay, shot } from "../lib/core/invariants";
import { completionDate } from "../lib/core/updates";
import { HAS_OPERATIONS } from "../lib/edition";
import fs from "node:fs";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = arg("n", 40), MAX = 14_000;
let seed = arg("seed", 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const db = seedDb();
const repo: Repo = { db, save: () => undefined, emails: async () => ({ mode: "demo", mailbox: "demo", lastSync: null, error: null, emails: demoEmails(db.data) }) } as Repo;
const director = findByPhone(db, "966500000101")!;
const ctx = (user: Person | null = director): ToolCtx => ({ author: user?.name ?? "Site", actions: [], channel: "web", user, fm: { facilityId: "krsd" } });
const DEFS: ToolDef[] = [...TOOL_DEFS.filter((t) => !t.name.startsWith("fm_")), ...(FM_TOOLS as ToolDef[])];

// ---------------------------------------------------------------- sloppy values, by what the field expects
const today = db.data.meta.dataDate;
const TEXT = ["", "   ", "x", "façade", "facade delay", "Tower A level 12", "برج أ", "PO-4500136", "TA-STR-L17", "'; DROP TABLE x; --", "<script>alert(1)</script>", "null", "\u0000\u0007", "a".repeat(5000), "word ".repeat(40), 12, ["Tower", "A"], { x: 1 }, null, true];
const NUMS = [-1, 0, 1, 3.7, 60, 100, 140, 1e9, -1e9, "60%", "60 percent", "1,200", "abc", "", "NaN", "Infinity", null, [5], { n: 1 }, true];
const DATES = [today, "today", "tomorrow", "yesterday", "2026-02-30", "23/10/2026", "next Tuesday", "1999-01-01", "2099-12-31", `${today}T08:00:00Z`, "2026-13-01", "", 20261023];
const BOOLS = [true, false, "yes", "no", "maybe", 1, 0, "true", null];
const variants = (e: string[]) => [...e, ...e.map((x) => x.toUpperCase()), ...e.map((x) => x.replace(/_/g, " ")), "done", "in progress", "on hold", "blocked", "whatever", "", 7];

type S = { type?: string; enum?: string[]; format?: string; items?: S; properties?: Record<string, S>; required?: string[] };
function sloppy(s: S): unknown {
  if (s.enum) return pick(variants(s.enum));
  if (s.format === "date") return pick(DATES);
  switch (s.type) {
    case "number": case "integer": return pick(NUMS);
    case "boolean": return pick(BOOLS);
    case "array": return pick([[], ["doc_nope"], "doc_a, doc_b", Array.from({ length: 80 }, (_, i) => `d${i}`), null, s.items?.properties ? [randomInput(s)] : ["x"]]);
    case "object": return randomInput(s);
    default: return pick(TEXT);
  }
}
function randomInput(s: S): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, ps] of Object.entries(s.properties ?? {})) if (rnd() < 0.6) o[k] = sloppy(ps);
  if (rnd() < 0.15) o.unexpected_field = "ignored?";
  return o;
}

// ---------------------------------------------------------------- what must always hold
const failures: { tool: string; input: unknown; problem: string }[] = [];
const fail = (tool: string, input: unknown, problem: string) => failures.push({ tool, input, problem });
const LEAK = /Cannot read propert|is not a function|is not defined|Unexpected token|Maximum call stack|\[object Object\]|TypeError|ReferenceError|RangeError/;
const JUNK = /"(NaN|undefined|Invalid Date)"|: ?NaN\b|NaN%|undefined%|Invalid Date/;
let calls = 0, refusals = 0;

async function call(name: string, input: unknown, user: Person | null = director): Promise<Record<string, any>> {
  const before = shot(db.data), pc0 = completionDate(db.data);
  let r: unknown;
  try { r = await runTool(repo, name, input as Record<string, unknown>, ctx(user)); }
  catch (e) { fail(name, input, `threw: ${(e as Error).message}`); return {}; }
  calls++;
  const text = typeof r === "string" ? r : Array.isArray(r) && r[0]?.type === "text" ? String(r[0].text) : JSON.stringify(r);
  if (text.length > MAX) fail(name, input, `answer is ${text.length} characters (limit ${MAX})`);
  let o: Record<string, any>;
  try { o = JSON.parse(text); } catch { fail(name, input, `not valid JSON: ${text.slice(0, 120)}`); return {}; }
  if (!o || typeof o !== "object") { fail(name, input, `not an object: ${text.slice(0, 80)}`); return {}; }
  if ("error" in o) {
    refusals++;
    if (typeof o.error !== "string" || o.error.length < 10) fail(name, input, `unclear refusal: ${JSON.stringify(o.error)}`);
    else if (LEAK.test(o.error)) fail(name, input, `a crash reached the agent: ${o.error.slice(0, 160)}`);
  }
  if (JUNK.test(text)) fail(name, input, `junk in the answer: ${JUNK.exec(text)![0]} in ${text.slice(Math.max(0, JUNK.exec(text)!.index - 80), JUNK.exec(text)!.index + 40)}`);
  for (const p of checkProgramme(db.data, before)) fail(name, input, `programme rule: ${p}`);
  if (completionDate(db.data) < pc0) fail(name, input, "practical completion moved earlier");
  return o;
}

// ---------------------------------------------------------------- 4. known cases: the right answer or the right refusal
type Known = { tool: string; input: Record<string, unknown>; user?: Person | null; expect: (o: Record<string, any>) => string | null };
const refused = (re?: RegExp) => (o: Record<string, any>) => (!o.error ? "should have been refused" : re && !re.test(o.error) ? `refused for the wrong reason: ${o.error}` : null);
const answered = (f?: (o: Record<string, any>) => string | null) => (o: Record<string, any>) => (o.error ? `refused: ${o.error}` : f ? f(o) : null);
const act = (id: string) => db.data.schedule.find((a) => a.id === id)!;
const KNOWN: Known[] = [
  { tool: "update_activity", input: { activity: "TA-STR-L17", state: "in_progress", percent: 140 }, expect: refused(/0–100/) },
  { tool: "update_activity", input: { activity: "TA-STR-L17", state: "in_progress", percent: -5 }, expect: refused(/0–100/) },
  { tool: "update_activity", input: { activity: "TA-STR-L17", state: "half done" }, expect: refused(/state/) },
  { tool: "update_activity", input: { state: "completed" }, expect: refused(/activity/) },
  { tool: "update_activity", input: { activity: "TA-STR-L15", state: "In Progress", percent: "60%" }, expect: answered(() => (act("TA-STR-L15").percent === 60 ? null : `recorded ${act("TA-STR-L15").percent}% instead of 60%`)) },
  { tool: "update_activity", input: { activity: "TA-STR-L15", state: "in_progress", percent: 100 }, expect: answered(() => (act("TA-STR-L15").status === "completed" ? null : "100% in progress was not recorded as completed")) },
  { tool: "update_activity", input: { activity: "TA-STR-L16", state: "done" }, expect: answered(() => (act("TA-STR-L16").status === "completed" ? null : "'done' was not read as completed")) },
  { tool: "create_material_request", input: { item: "Rebar 16 mm", qty: 12, unit: "t", needed_by: "2020-01-01" }, expect: refused(/past/) },
  { tool: "create_material_request", input: { item: "Rebar 16 mm", qty: 12, unit: "t", needed_by: "2026-02-30" }, expect: refused(/date/) },
  { tool: "create_material_request", input: { item: "Rebar 16 mm", qty: -3, unit: "t", needed_by: "tomorrow" }, expect: refused(/qty/) },
  { tool: "create_material_request", input: { item: "Rebar 16 mm", qty: "1,200", unit: "kg", needed_by: "tomorrow" }, expect: answered((o) => (o.created?.qty === 1200 && o.created?.neededBy > today ? null : `created ${JSON.stringify(o.created).slice(0, 120)}`)) },
  { tool: "site_proposals", input: { reject: "expedite:PKG-06", reason: "because" }, expect: refused(/reason/) },
  { tool: "site_proposals", input: { approve: "expedite:PKG-06", reject: "expedite:PKG-06" }, expect: refused(/not both/) },
  { tool: "site_proposals", input: { approve: "low_risk" }, user: null, expect: answered((o) => (o.approved === 0 ? null : "approved without a signed-in user")) },
  { tool: "site_proposals", input: { kind: "night shift" }, expect: refused(/kind/) },
  { tool: "deliveries", input: { from: "2099-01-01", to: today }, expect: answered((o) => (/→/.test(o.window ?? "") && o.window.startsWith(today) ? null : `window ${o.window}`)) },
  { tool: "lookahead", input: { weeks: 50 }, expect: refused(/weeks/) },
  { tool: "lookahead", input: { weeks: "3" }, expect: answered((o) => (o.window ? null : "no window")) },
  { tool: "schedule_query", input: { from: "next Tuesday" }, expect: refused(/date/) },
  { tool: "schedule_query", input: { status: "In Progress", limit: 500 }, expect: refused(/limit/) },
  { tool: "contractor_emails", input: { query: "facade delay" }, expect: answered((o) => (o.emails?.length ? null : "no emails found without the accent")) },
  { tool: "permits", input: { status: "active" }, expect: answered((o) => (Array.isArray(o.permits) && o.permits.length ? null : "no active permits found for 'active'")) },
  { tool: "permits", input: { status: "Active" }, expect: answered((o) => { const c = `${today} 23:59`; const bad = (o.permits ?? []).filter((p: { validTo: string }) => p.validTo.slice(0, 16) < `${today} 00:00`); return bad.length ? `expired permits listed as live: ${bad.map((p: { id: string }) => p.id).join(", ")} (${c})` : null; }) },
  { tool: "hse_overview", input: {}, expect: answered((o) => ((o.activePermits ?? []).some((p: { validTo: string }) => p.validTo.slice(0, 10) < today) ? "hse_overview counts expired permits as live" : null)) },
  { tool: "add_note", input: { text: "", location: "Tower A level 12" }, expect: refused(/text/) },
  { tool: "add_note", input: { text: "x".repeat(3000), location: "Tower A level 12" }, expect: refused(/too long/) },
  { tool: "get_document", input: {}, expect: refused(/id/) },
  { tool: "no_such_tool", input: {}, expect: refused(/Unknown tool/) },
  { tool: "fm_orchestrator", input: { reject: "x", reason: "meh" }, expect: refused(/reason/) },
  { tool: "fm_work_orders", input: { priority: "p1" }, expect: answered((o) => (o.workOrders?.every((w: { priority: string }) => w.priority === "P1") ? null : "priority p1 not read as P1")) },
  { tool: "fm_update_work_order", input: { wo: "WO-W24109", checklist_step: 1.5 }, expect: refused(/whole number/) },
];

// ---------------------------------------------------------------- 5. the work layer: who may direct whom, robots, gas
// at the gas plant: the operations manager (client), the HSE gas tester (client) and a contractor's crew lead
const who = (re: RegExp) => directory(db).find((p) => re.test(p.name))!;
const msg = (o: Record<string, any>) => String(o.error ?? o.message ?? JSON.stringify(o.results ?? o.done ?? o));
async function orchestration() {
  if (!HAS_OPERATIONS) return; // the construction-only edition has no plant
  const majid = who(/Majid Al-Rashid/), noura = who(/Noura Al-Ghamdi/), viktor = who(/Viktor Petrenko/);
  if (!majid || !noura || !viktor) return fail("(work layer)", null, "the gas plant's people are missing from the directory");
  if (canApprove(noura, { domain: "site", risk: "low", kind: "permit_close" }).ok) fail("(work layer)", null, "the gas plant's HSE officer may close a permit on the building site");
  if (!canApprove(noura, { domain: "fm", facilityId: "kgpp", risk: "low", kind: "safety_stop" }).ok) fail("(work layer)", null, "the HSE officer may not stop unsafe work at her own plant");
  if (viktor.orgType !== "contractor" || majid.orgType !== "client") fail("(work layer)", null, `employers: Viktor ${viktor.orgType}, Majid ${majid.orgType}`);
  const cases: { what: string; tool: string; input: Record<string, unknown>; user: Person | null; ok: boolean; re?: RegExp }[] = [
    { what: "a robot that isn't Ex-rated into a hazardous area", tool: "fm_robot_command", input: { robot: "Spot-2", command: "send", zone: "Compression", mission: "inspection_round" }, user: majid, ok: false, re: /certified|Ex-rated/ },
    { what: "a robot that doesn't exist", tool: "fm_robot_command", input: { robot: "Robo-9", command: "estop" }, user: majid, ok: false, re: /No robot/ },
    { what: "a contractor sends a robot", tool: "fm_robot_command", input: { robot: "Ex-2", command: "send", zone: "Compression", mission: "gas_survey" }, user: viktor, ok: false, re: /own staff/ },
    { what: "nobody signed in sends a robot", tool: "fm_robot_command", input: { robot: "Ex-2", command: "send", zone: "Compression", mission: "gas_survey" }, user: null, ok: false, re: /own staff/ },
    { what: "a contractor stops a robot (anyone may)", tool: "fm_robot_command", input: { robot: "Drone-1", command: "estop" }, user: viktor, ok: true },
    { what: "a stopped robot is sent", tool: "fm_robot_command", input: { robot: "Drone-1", command: "send", zone: "Flare", mission: "flare_inspection" }, user: majid, ok: false, re: /emergency stop/ },
    { what: "a contractor releases the stop", tool: "fm_robot_command", input: { robot: "Drone-1", command: "release" }, user: viktor, ok: false, re: /supervisor/ },
    { what: "the manager releases the stop", tool: "fm_robot_command", input: { robot: "Drone-1", command: "release" }, user: majid, ok: true },
    { what: "hot work started before its gas test", tool: "fm_update_work_order", input: { wo: "WO-TAR06", status: "in_progress" }, user: majid, ok: false, re: /gas test/ },
    { what: "a contractor moves another crew's job", tool: "fm_update_work_order", input: { wo: "WO-TAR05", status: "on_hold", hold_reason: "waiting for parts" }, user: viktor, ok: false, re: /job/ },
    { what: "a contractor records a gas test", tool: "fm_gas_test", input: { wo: "WO-TAR06", result: "done" }, user: viktor, ok: false, re: /gas tester|supervisor/ },
    { what: "gas found without a reading", tool: "fm_gas_test", input: { wo: "WO-TAR06", result: "failed" }, user: noura, ok: false, re: /read/ },
    { what: "the gas tester records a clear test", tool: "fm_gas_test", input: { wo: "WO-TAR06", result: "done", reading: "LEL 0 %, H2S 0 ppm, O2 20.9 %" }, user: noura, ok: true },
    { what: "the turnaround", tool: "fm_turnaround", input: { facility: "kgpp" }, user: majid, ok: true },
    { what: "the fleet", tool: "fm_robots", input: { facility: "kgpp" }, user: majid, ok: true },
  ];
  for (const c of cases) {
    const o = await call(c.tool, c.input, c.user);
    if (c.ok && o.error) fail(c.tool, c.input, `${c.what}: refused — ${o.error}`);
    if (!c.ok && !o.error) fail(c.tool, c.input, `${c.what}: should have been refused, got ${msg(o).slice(0, 120)}`);
    if (!c.ok && o.error && c.re && !c.re.test(o.error)) fail(c.tool, c.input, `${c.what}: refused for the wrong reason — ${o.error}`);
  }
  // the turnaround answer names the jobs; the fleet answer lists the five robots
  const tar = await call("fm_turnaround", { facility: "kgpp" }, majid);
  if (!JSON.stringify(tar).includes("WO-TAR06")) fail("fm_turnaround", { facility: "kgpp" }, "the turnaround doesn't list its jobs");
  // a contractor's crew lead can't approve hiring their own company; the operations manager can
  const list = await call("fm_orchestrator", { facility: "kgpp" }, majid);
  const crew = (list.proposals ?? list.actions ?? []).find((a: { id: string; kind?: string }) => /^crew:/.test(a.id));
  if (!crew) fail("fm_orchestrator", { facility: "kgpp" }, "no proposal to assign a contractor crew at the gas plant");
  else {
    const v = await call("fm_orchestrator", { facility: "kgpp", approve: crew.id }, viktor);
    if (!/own company|can't approve|cannot approve|not .*approve|limit/i.test(msg(v))) fail("fm_orchestrator", { approve: crew.id }, `a contractor approved hiring their own crew: ${msg(v).slice(0, 160)}`);
    const m = await call("fm_orchestrator", { facility: "kgpp", approve: crew.id }, majid);
    if (m.error || /can't approve|cannot approve|not allowed/i.test(msg(m))) fail("fm_orchestrator", { approve: crew.id }, `the operations manager couldn't approve the crew: ${msg(m).slice(0, 160)}`);
  }
}

async function main() {
  const t0 = Date.now();
  for (const k of KNOWN) {
    const o = await call(k.tool, k.input, k.user === undefined ? director : k.user);
    const why = k.expect(o);
    if (why) fail(k.tool, k.input, why);
  }
  await orchestration();
  for (const d of DEFS) {
    const s = d.input_schema as S;
    await call(d.name, {});
    await call(d.name, "not an object");
    await call(d.name, Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, ps]) => [k, ps.type === "string" && !ps.enum && !ps.format ? "z".repeat(20_000) : sloppy(ps)])));
    for (let i = 0; i < N; i++) await call(d.name, randomInput(s), pick([director, director, null]));
  }
  // a busy day on site: many real progress reports (late, early, reopened, out of order) with approvals in between —
  // the programme rules are checked after each one, and the roll at the end must give the same programme back
  for (let i = 0; i < Math.max(60, N * 3); i++) {
    const open = db.data.schedule.filter((a) => !a.milestone);
    const a = pick(open);
    const state = pick(["completed", "in_progress", "in_progress", "pending"]);
    await call("update_activity", { activity: a.id, state, ...(rnd() < 0.8 ? { percent: Math.round(rnd() * 100) } : {}), note: "busy day" });
    if (i % 15 === 7) {
      const list = await call("site_proposals", {});
      const p = (list.proposals ?? []).filter((x: { userMayApprove?: { ok: boolean } }) => x.userMayApprove?.ok);
      if (p.length) await call("site_proposals", rnd() < 0.7 ? { approve: pick(p as { id: string }[]).id } : { reject: pick(p as { id: string }[]).id, reason: pick(["not_now", "too_costly", "disagree"]) });
    }
  }
  // the big asks: everything at once, then the roll
  await call("site_proposals", { approve: "low_risk" });
  await call("fm_orchestrator", { facility: "krsd", approve: "low_risk" });
  await call("lookahead", { weeks: 8 });
  await call("schedule_query", { limit: 100 });
  await call("drawing_register", { limit: 100 });
  await call("search_project", { query: "a" });
  for (const p of await checkReplay(db.data)) fail("(daily roll)", null, p);
  // and tomorrow's roll: what was reported done stays done, and completion does not come earlier
  {
    const { rollToToday } = await import("../lib/data");
    const { addDays } = await import("../lib/data/util");
    const next = rollToToday(structuredClone(db.data), addDays(today, 1));
    const by = new Map(next?.schedule.map((a) => [a.id, a]) ?? []);
    if (!next) fail("(next day)", null, "the roll did not run");
    else {
      for (const a of db.data.schedule) if (a.status === "completed" && by.get(a.id)?.status !== "completed") fail("(next day)", null, `${a.id} was completed, is ${by.get(a.id)?.status} the next day`);
      if (completionDate(next) < completionDate(db.data)) fail("(next day)", null, `practical completion ${completionDate(db.data)} → ${completionDate(next)}`);
      // what was approved yesterday is still in force: closed permits stay closed, approved requests stay approved
      for (const x of (db.data.decisions ?? []).filter((y) => y.decision === "approved")) for (const p of x.patches) {
        if (p.t === "permit" && p.status && next.safety.permits.find((q) => q.id === p.id)?.status !== p.status) fail("(next day)", null, `${x.actionId}: permit ${p.id} is no longer ${p.status}`);
        if (p.t === "mr_status" && next.procurement.requests.find((q) => q.id === p.id)?.status !== p.status) fail("(next day)", null, `${x.actionId}: ${p.id} is no longer ${p.status}`);
      }
    }
  }
  if (process.env.FUZZ_DUMP) fs.writeFileSync(process.env.FUZZ_DUMP, JSON.stringify(db.data));

  const lines = [
    `# Sloppy director: ${failures.length ? `${failures.length} FAILED` : "all passed"}`,
    `${calls} tool calls over ${DEFS.length} tools (${refusals} clear refusals), ${KNOWN.length} known cases, ${db.data.updates?.length ?? 0} progress reports and ${db.data.decisions?.length ?? 0} decisions checked against the programme rules and the daily roll — ${((Date.now() - t0) / 1000).toFixed(1)} s, seed ${arg("seed", 1)}.`,
    ...failures.slice(0, 60).map((f) => `- **${f.tool}** ${JSON.stringify(f.input)?.slice(0, 160)} — ${f.problem}`),
    ...(failures.length > 60 ? [`- … ${failures.length - 60} more`] : []),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
