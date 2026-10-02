import type { RouteInfo } from "../../types";
import { runAnthropic } from "./anthropic";
import { runOpenAI } from "./openai";
import type { LlmConfig, LoopInput, LoopOutput, Provider, Target, Tier } from "./types";

/**
 * Built-in routing between Anthropic and OpenAI.
 *
 *  fast  short lookups ("where is TC1", "open the L12 plan", "PO-4500123?")
 *  main  normal questions that need a few tool calls
 *  deep  analysis: comparisons, delay/claim/risk reasoning, reports, long multi-part asks
 *
 * Each tier has an ordered candidate list (provider:model). The first provider
 * with a key wins; on any error the next candidate is tried (cross-provider
 * fallback). Requests carrying PDFs prefer Anthropic (native PDF + images in
 * tool results).
 */
export const DEFAULT_ROUTES: Record<Tier, Target[]> = {
  fast: [{ provider: "openai", model: "gpt-5-mini" }, { provider: "anthropic", model: "claude-haiku-4-5-20251001" }],
  main: [{ provider: "anthropic", model: "claude-sonnet-5-5" }, { provider: "openai", model: "gpt-5" }],
  deep: [{ provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openai", model: "gpt-5" }],
};

/** "openai:gpt-5-mini, anthropic:claude-haiku-4-5-20251001" → Target[] */
export function parseRoute(s: string | undefined, fallback: Target[]): Target[] {
  if (!s?.trim()) return fallback;
  const out = s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(":");
    const provider = x.slice(0, i).trim().toLowerCase() as Provider;
    return { provider, model: x.slice(i + 1).trim() };
  }).filter((t) => (t.provider === "anthropic" || t.provider === "openai") && t.model);
  return out.length ? out : fallback;
}

const DEEP = /\b(compare|comparison|analy[sz]e|analysis|why|impact|root cause|risk|recommend|should we|options?|trade-?off|claim|eot|extension of time|delay analysis|critical path|forecast|report|summari[sz]e (the )?(week|month|project|programme|schedule)|draft|write (a|an|the) |explain how|what if|recovery plan|cash ?flow|variance)\b/i;
const FAST = /^(where( is|'s)|show|open|pull up|display|locate|find|who is|who's|call|phone|contact|list|what time|when is|is there|any|po[- ]?\d|note|leave a note|log|issue:|instruction:|status of|next delivery|deliveries today)\b/i;

export function classify(text: string, o: { hasMedia?: boolean; turns?: number } = {}): { tier: Tier; reason: string } {
  const t = text.trim();
  const questions = (t.match(/\?/g) ?? []).length;
  if (DEEP.test(t)) return { tier: "deep", reason: "analysis / reasoning request" };
  if (t.length > 260 || questions > 2) return { tier: "deep", reason: "long or multi-part request" };
  if (o.hasMedia) return { tier: "main", reason: "has photo/document attachment" };
  if (t.length <= 90 && FAST.test(t)) return { tier: "fast", reason: "short lookup / command" };
  return { tier: "main", reason: "standard question" };
}

const has = (cfg: LlmConfig, p: Provider) => (p === "anthropic" ? !!cfg.anthropic?.apiKey : !!cfg.openai?.apiKey);
export const availableProviders = (cfg: LlmConfig): Provider[] => (["anthropic", "openai"] as Provider[]).filter((p) => has(cfg, p));

export function candidates(cfg: LlmConfig, tier: Tier, o: { hasPdf?: boolean } = {}): Target[] {
  let list = [...cfg.routes[tier]];
  // Ensure each available provider appears at least once as a fallback.
  for (const p of availableProviders(cfg)) if (!list.some((t) => t.provider === p)) list.push(DEFAULT_ROUTES[tier].find((t) => t.provider === p)!);
  if (cfg.mode !== "auto") list.sort((a, b) => Number(b.provider === cfg.mode) - Number(a.provider === cfg.mode));
  if (o.hasPdf) list.sort((a, b) => Number(b.provider === "anthropic") - Number(a.provider === "anthropic"));
  list = list.filter((t) => has(cfg, t.provider));
  return cfg.fallback ? list : list.slice(0, 1);
}

export async function routeAndRun(cfg: LlmConfig, inp: LoopInput, o: { tier?: Tier; reason?: string; hasPdf?: boolean } = {}): Promise<{ out: LoopOutput; route: RouteInfo }> {
  const lastUser = [...inp.history].reverse().find((m) => m.role === "user")?.content ?? "";
  const c = o.tier ? { tier: o.tier, reason: o.reason ?? "forced" } : classify(lastUser, { hasMedia: !!inp.attachments?.length, turns: inp.history.length });
  const list = candidates(cfg, c.tier, { hasPdf: o.hasPdf || inp.attachments?.some((a) => a.mime === "application/pdf") });
  if (!list.length) throw new Error("No AI provider configured (set ANTHROPIC_API_KEY and/or OPENAI_API_KEY).");
  const failed: NonNullable<RouteInfo["fallbackFrom"]> = [];
  for (const t of list) {
    const t0 = Date.now();
    if (inp.deadline && inp.deadline - t0 < 4000) { failed.push({ provider: t.provider, model: t.model, error: "skipped — out of time" }); continue; }
    try {
      const out = t.provider === "anthropic" ? await runAnthropic(cfg, t.model, inp) : await runOpenAI(cfg, t.model, inp);
      return { out, route: { provider: t.provider, model: t.model, tier: c.tier, reason: c.reason + (cfg.mode !== "auto" ? ` · prefer ${cfg.mode}` : ""), fallbackFrom: failed.length ? failed : undefined, ms: Date.now() - t0 } };
    } catch (e) {
      failed.push({ provider: t.provider, model: t.model, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }
  const err = new Error(`All AI providers failed: ${failed.map((f) => `${f.provider}/${f.model}: ${f.error}`).join(" | ")}`);
  (err as Error & { failed?: typeof failed }).failed = failed;
  throw err;
}

/** Build config from environment variables (server) or a settings object (browser). */
export function configFrom(env: Record<string, string | undefined>, browser = false): LlmConfig {
  const mode = (env.LLM_MODE ?? "auto").toLowerCase();
  return {
    anthropic: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL } : undefined,
    openai: env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, reasoningEffort: env.OPENAI_REASONING_EFFORT ?? "low", transcribeModel: env.OPENAI_TRANSCRIBE_MODEL } : undefined,
    mode: mode === "anthropic" || mode === "openai" ? mode : "auto",
    routes: {
      fast: parseRoute(env.LLM_ROUTE_FAST, DEFAULT_ROUTES.fast),
      main: parseRoute(env.LLM_ROUTE_MAIN ?? (env.ANTHROPIC_MODEL ? `anthropic:${env.ANTHROPIC_MODEL},openai:gpt-5` : undefined), DEFAULT_ROUTES.main),
      deep: parseRoute(env.LLM_ROUTE_DEEP, DEFAULT_ROUTES.deep),
    },
    fallback: (env.LLM_FALLBACK ?? "true").toLowerCase() !== "false",
    browser,
    timeoutMs: Number(env.LLM_TIMEOUT_MS) || 60_000,
  };
}
