import { ConflictError, enc, store } from "../storage";
import { getRepo, readJson, writeJson } from "../store";
import { deliverMail, outlookCredsSet, outlookMode, outlookSender } from "../outlook";
import { readGenerated } from "../generated";
import { reports } from "./engine";
import { getInbox } from "../inbox";
import { narrateDeck } from "../deck/narration";

/** Reports on the server: records in the app's storage (Vercel Blob or disk), mail through Outlook. */
export const serverReports = () => reports({
  get: async <T,>(key: string) => (await readJson<T>(key))?.value ?? null,
  put: (key, value) => writeJson(key, value),
  // A create-only lock object; a lock older than 5 minutes is taken to be from a crashed run and broken.
  async lock(name, fn) {
    const st = store(), key = `reports/lock-${name}.json`;
    const take = () => st.write(key, enc(JSON.stringify({ at: Date.now() })), "application/json", null);
    try { await take(); } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      const cur = await readJson<{ at: number }>(key);
      if (cur && Date.now() - cur.value.at < 5 * 60_000) return null;
      await st.remove(key);
      try { await take(); } catch { return null; }
    }
    try { return await fn(); } finally { await st.remove(key).catch(() => undefined); }
  },
  db: async () => (await getRepo()).db,
  projects: async () => (await readGenerated()).projects,
  emails: async () => (await getInbox()).emails,
  send: deliverMail,
  // ▶ Play: the AI writes the presenter's script (same rules as the marketing agent)
  narrate: (deck, o) => narrateDeck(deck, { timeoutMs: o.timeoutMs }),
  env: {
    mode: outlookMode(), creds: outlookCredsSet(), sender: outlookSender(), senderSet: !!process.env.OUTLOOK_SENDER,
    cron: !!process.env.REPORTS_CRON_KEY, allowedDomains: process.env.REPORTS_ALLOWED_DOMAINS, allowedRecipients: process.env.REPORTS_ALLOWED_RECIPIENTS,
    // "Open the app" in the brief: APP_URL, else the Vercel production domain
    appUrl: process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null),
  },
});
