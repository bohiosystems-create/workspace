// What the northbound integrations are set up to reach (no secrets): shown in the operator's cockpit and the API.
import { cmmsLabel, cmmsSystems } from "./cmms";
import { emailTo } from "./notify";
import { envJson } from "./http";

export type Hook = { url: string; secret?: string; events?: string[]; facilities?: string[] };
export const webhooks = () => envJson<Hook[]>("WEBHOOKS", []).filter((h) => h && /^https?:\/\//.test(h.url));
export const appUrl = () => process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

/** What is configured, for the cockpit and the API (no secrets). */
export function integrationsConfigured() {
  return {
    cmms: cmmsSystems().map((c) => ({ kind: c.kind, name: cmmsLabel(c), facilities: c.facilities ?? "all" })),
    teams: !!(process.env.TEAMS_WEBHOOK_URL || process.env.TEAMS_WEBHOOKS),
    email: emailTo().length > 0,
    webhooks: webhooks().map((h) => ({ host: new URL(h.url).host, events: h.events ?? ["*"] })),
    api: !!process.env.ORCH_API_TOKEN,
  };
}

