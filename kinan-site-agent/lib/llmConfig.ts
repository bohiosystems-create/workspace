import { configFrom } from "./core/llm/router";
import type { LlmConfig } from "./core/llm/types";

/** Server-side AI configuration, read from environment variables on every call (hot-reloadable). */
export function serverLlm(): LlmConfig {
  return configFrom(process.env as Record<string, string | undefined>);
}
