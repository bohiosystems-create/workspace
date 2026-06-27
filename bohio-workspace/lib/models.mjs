/* ============================================================================
   Per-task model routing for Karaya.

   Each AI call in the app can name the kind of work it is (a "task"); this maps
   that task to the most appropriate Claude model:

     • Opus   — heavy reasoning: deal screening, IC memos, negotiation, deal
                structuring. Accuracy matters most.
     • Sonnet — conversational / mid-weight: workspace chat, agent replies,
                file Q&A, opportunity summaries. Fast and capable.
     • Haiku  — quick one-liners: the model-build insight line, suggestions.
                Cheapest and fastest.

   Resolution precedence (most specific wins):
     1. an explicit per-call model  (tier alias 'opus'|'sonnet'|'haiku', or a
        full model id)
     2. the task's tier             (TASK_TIER, overridable via env
        ANTHROPIC_TASK_MODELS as JSON, e.g. {"home_chat":"opus"})
     3. ANTHROPIC_MODEL env         (default for untagged/unknown tasks)
     4. Opus                        (final fallback)

   Concrete model ids per tier are overridable via env
   (ANTHROPIC_MODEL_OPUS / _SONNET / _HAIKU) for easy version bumps.
   ========================================================================== */
export const TIERS = {
  opus: process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-8',
  sonnet: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6',
  haiku: process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5-20251001',
};

export const TASK_TIER = {
  // heavy reasoning → Opus
  screening: 'opus',
  ic_memo: 'opus',
  negotiation: 'opus',
  deal_structure: 'opus',
  // conversational / mid-weight → Sonnet
  home_chat: 'sonnet',
  agent_chat: 'sonnet',
  file_qa: 'sonnet',
  opportunity_summary: 'sonnet',
  fund_agent: 'sonnet',
  screening_chat: 'sonnet',
  // quick one-liners → Haiku
  quick_insight: 'haiku',
  suggestion: 'haiku',
};

const DEFAULT_TIER = 'opus';

let TASK_OVERRIDE = {};
try {
  if (process.env.ANTHROPIC_TASK_MODELS) TASK_OVERRIDE = JSON.parse(process.env.ANTHROPIC_TASK_MODELS);
} catch { /* ignore malformed override */ }

function tierToModel(tier) {
  return TIERS[tier] || tier; // allow a raw model id in an override value
}

export function resolveModel(task, explicit) {
  if (explicit) {
    if (TIERS[explicit]) return TIERS[explicit];
    if (typeof explicit === 'string' && explicit.includes('-')) return explicit; // looks like a model id
  }
  if (task) {
    const tier = TASK_OVERRIDE[task] || TASK_TIER[task];
    if (tier) return tierToModel(tier);
  }
  return process.env.ANTHROPIC_MODEL || TIERS[DEFAULT_TIER];
}

// For /api/health — a human-readable view of the active routing.
export function routingTable() {
  const merged = { ...TASK_TIER, ...TASK_OVERRIDE };
  const out = {};
  for (const [task, tier] of Object.entries(merged)) out[task] = tierToModel(tier);
  return { tiers: TIERS, tasks: out, default: process.env.ANTHROPIC_MODEL || TIERS[DEFAULT_TIER] };
}
