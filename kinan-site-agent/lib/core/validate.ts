// One check at the tool boundary, for every tool. The model relays a busy person ("140%", "next Tuesday", "in
// progress", "p1"), so a tool's input is checked against the description the model already sees (its input_schema:
// types, allowed values, ranges, dates, required fields) before the tool runs. What can be read safely is normalised
// ("60%" → 60, "In Progress" → in_progress, "done" → completed, "tomorrow" → a date, a window given backwards is turned
// round); anything else comes back as a clear refusal that names the field and what is allowed, so the agent asks the
// user instead of recording a guess. The tools themselves no longer each check their own inputs.
import { fold } from "./query";

type Schema = {
  type?: string; description?: string; enum?: string[]; format?: string;
  minimum?: number; maximum?: number; exclusiveMinimum?: number; maxLength?: number; maxItems?: number;
  items?: Schema; properties?: Record<string, Schema>; required?: string[];
};
export interface CheckCtx { /** the data date: "today" for the project, and the earliest date a need-by can be */ today: string; tool?: string }
export type Checked = { input: Record<string, unknown> } | { error: string; field?: string; allowed?: unknown[] };

const ASK = "Ask the user what they meant.";
const MAX_TEXT = 4000, MAX_ITEMS = 50;

// words people use for the same state, matched to whichever of them the field allows
const SAME = [
  ["completed", "done", "finished", "complete", "closed out"],
  ["in_progress", "started", "ongoing", "underway", "wip", "progressing", "in hand", "working"],
  ["pending", "blocked", "stuck", "waiting", "on_hold", "hold", "paused", "delayed"],
  ["on_hold", "hold", "paused", "waiting", "blocked", "stuck"],
  ["not_started", "not started", "planned", "future"],
];
const key = (s: string) => fold(s).trim().replace(/[\s_-]+/g, "_");
function matchEnum(v: string, allowed: string[]): string | undefined {
  const k = key(v);
  const exact = allowed.find((a) => key(a) === k);
  if (exact) return exact;
  for (const g of SAME) if (g.some((w) => key(w) === k)) { const hit = allowed.find((a) => g.some((w) => key(w) === key(a))); if (hit) return hit; }
  return undefined;
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function readDate(v: string, today: string): string | undefined {
  const s = v.trim().toLowerCase();
  if (s === "today" || s === "now") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (s === "yesterday") return addDays(today, -1);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(s);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}`, d = new Date(iso + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined; // 2026-02-30 is not a date
}
function readNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/,/g, "").replace(/\s*(%|percent|pct)$/i, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  return Number(s);
}

class Refusal { constructor(public error: string, public field: string, public allowed?: unknown[]) {} }

function one(s: Schema, v: unknown, field: string, ctx: CheckCtx): unknown {
  const what = s.description ? ` (${s.description})` : "";
  switch (s.type) {
    case "number": case "integer": {
      const n = readNumber(v);
      if (n === undefined) throw new Refusal(`"${field}" must be a number${what}, not ${JSON.stringify(v).slice(0, 60)}. ${ASK}`, field);
      if (s.type === "integer" && !Number.isInteger(n)) throw new Refusal(`"${field}" must be a whole number, not ${n}. ${ASK}`, field);
      if (s.minimum !== undefined && n < s.minimum || s.maximum !== undefined && n > s.maximum)
        throw new Refusal(`"${field}" must be ${s.minimum ?? "…"}–${s.maximum ?? "…"}, not ${n}. ${ASK}`, field);
      if (s.exclusiveMinimum !== undefined && n <= s.exclusiveMinimum) throw new Refusal(`"${field}" must be more than ${s.exclusiveMinimum}, not ${n}. ${ASK}`, field);
      return n;
    }
    case "boolean": {
      if (typeof v === "boolean") return v;
      const k = key(String(v));
      if (["true", "yes", "y", "1", "on"].includes(k)) return true;
      if (["false", "no", "n", "0", "off"].includes(k)) return false;
      throw new Refusal(`"${field}" must be true or false.`, field);
    }
    case "array": {
      const xs = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/).filter(Boolean) : [v];
      if (xs.length > (s.maxItems ?? MAX_ITEMS)) throw new Refusal(`"${field}" has ${xs.length} entries; at most ${s.maxItems ?? MAX_ITEMS} at a time.`, field);
      return xs.filter((x) => x !== null && x !== undefined && x !== "").map((x, i) => (s.items ? one(s.items, x, `${field}[${i}]`, ctx) : x));
    }
    case "object": {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Refusal(`"${field}" must be an object.`, field);
      return checkObject(s, v as Record<string, unknown>, ctx, `${field}.`);
    }
    default: { // string
      if (typeof v === "object") {
        if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) v = v.join(" ");
        else throw new Refusal(`"${field}" must be text.`, field);
      }
      let t = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim(); // control characters are never meant
      if (t.length > (s.maxLength ?? MAX_TEXT)) throw new Refusal(`"${field}" is too long (${t.length} characters, at most ${s.maxLength ?? MAX_TEXT}). Shorten it or split it.`, field);
      if (s.format === "date") {
        const d = readDate(t, ctx.today);
        if (!d) throw new Refusal(`"${field}" must be a date as YYYY-MM-DD (today is ${ctx.today}), not "${t.slice(0, 40)}". Work out the date, or ask the user.`, field);
        t = d;
      }
      if (s.enum) {
        const e = matchEnum(t, s.enum);
        if (!e) throw new Refusal(`"${field}" must be one of: ${s.enum.join(", ")} — not "${t.slice(0, 40)}". ${ASK}`, field, s.enum);
        t = e;
      }
      return t;
    }
  }
}

function checkObject(s: Schema, input: Record<string, unknown>, ctx: CheckCtx, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = s.properties ?? {};
  for (const [k, ps] of Object.entries(props)) {
    const v = input[k];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) continue; // left out
    const x = one(ps, v, prefix + k, ctx);
    if (x !== "") out[k] = x;
  }
  for (const r of s.required ?? []) if (out[r] === undefined) throw new Refusal(`"${prefix + r}" is missing${props[r]?.description ? ` (${props[r].description})` : ""}. ${ASK}`, prefix + r);
  return out; // anything the schema doesn't describe is dropped: a tool never acts on a field it didn't declare
}

/** Rules between fields, which a schema alone cannot say. */
function across(tool: string | undefined, x: Record<string, unknown>, ctx: CheckCtx) {
  // a window given the wrong way round
  for (const [a, b] of [["from", "to"], ["since", "until"]] as const)
    if (typeof x[a] === "string" && typeof x[b] === "string" && /^\d{4}-/.test(x[a] as string) && (x[a] as string) > (x[b] as string)) [x[a], x[b]] = [x[b], x[a]];
  if (tool === "create_material_request" && typeof x.needed_by === "string" && x.needed_by < ctx.today)
    throw new Refusal(`needed_by ${x.needed_by} is in the past (today is ${ctx.today}). Ask the user for the date it's needed.`, "needed_by");
  if ((tool === "site_proposals" || tool === "fm_orchestrator") && x.approve && x.reject)
    throw new Refusal("Approve or reject — not both in one call.", "approve");
  if ((tool === "site_proposals" || tool === "fm_orchestrator") && x.reason && !x.reject) delete x.reason;
}

/** Check (and normalise) one tool call's input against its schema. */
export function checkInput(schema: { properties?: Record<string, unknown>; required?: string[] }, input: unknown, ctx: CheckCtx): Checked {
  try {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const x = checkObject(schema as Schema, raw, ctx);
    across(ctx.tool, x, ctx);
    return { input: x };
  } catch (e) {
    if (e instanceof Refusal) return { error: e.error, field: e.field, ...(e.allowed ? { allowed: e.allowed } : {}) };
    throw e;
  }
}
