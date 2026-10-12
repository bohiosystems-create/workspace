/**
 * The project's Outlook inbox — emails from contractors on project updates, read through Microsoft Graph.
 *
 *   demo (default): a seeded inbox from the project's contractors, so the agent can be shown without a mailbox.
 *   live: OUTLOOK_INBOX_MODE=live — the same Entra app as the daily report (MS_TENANT_ID / MS_CLIENT_ID /
 *         MS_CLIENT_SECRET) with the Microsoft Graph *application* permission Mail.Read, reading
 *         OUTLOOK_INBOX (default OUTLOOK_SENDER), folder OUTLOOK_INBOX_FOLDER (default Inbox).
 *         OUTLOOK_INBOX_DOMAINS="albunyan.com,skyline.com" keeps only mail from those domains (contractors).
 *
 * Synced mail is kept in storage (inbox/emails.json), newest 400, and refreshed at most every 5 minutes when the
 * agent or the app asks for it. The agent only reads mail; it never sends, moves or deletes anything.
 */
import { CONTACTS } from "./data/people";
import { demoEmails, plainText, type Email, type InboxState } from "./core/emails";
import { readJson, writeJson } from "./store";

const KEY = "inbox/emails.json";
const FRESH_MS = 5 * 60_000;
export const inboxMode = () => ((process.env.OUTLOOK_INBOX_MODE ?? "").toLowerCase() === "live" ? "live" : "demo");
export const inboxMailbox = () => process.env.OUTLOOK_INBOX || process.env.OUTLOOK_SENDER || "projectupdates@kinan.example";
// overridable for tests and sovereign clouds
const LOGIN = () => (process.env.MS_LOGIN_BASE || "https://login.microsoftonline.com").replace(/\/$/, "");
const GRAPH = () => (process.env.MS_GRAPH_BASE || "https://graph.microsoft.com").replace(/\/$/, "");
const domains = () => (process.env.OUTLOOK_INBOX_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);

async function graphToken(): Promise<string> {
  const { MS_TENANT_ID: tenant, MS_CLIENT_ID: id, MS_CLIENT_SECRET: secret } = process.env;
  if (!tenant || !id || !secret) throw new Error("Live inbox needs MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET.");
  const r = await fetch(`${LOGIN()}/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Microsoft sign-in failed (${r.status}).`);
  return (await r.json()).access_token;
}

/** Company for a sender: the project directory first, else the domain ("skyline-facade.com" → "Skyline Facade"). */
function companyOf(address: string, name: string) {
  const a = address.toLowerCase();
  const c = CONTACTS.find((x) => x.email.toLowerCase() === a || (name && x.name.toLowerCase() === name.toLowerCase()));
  if (c) return c.company;
  const dom = a.split("@")[1] ?? "";
  return dom.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) || dom;
}

interface GraphMessage { id: string; receivedDateTime: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { address?: string } }[];
  body?: { contentType?: string; content?: string }; hasAttachments?: boolean; conversationId?: string; importance?: string; webLink?: string }

async function fetchLive(since: string | null): Promise<Email[]> {
  const token = await graphToken();
  const folder = encodeURIComponent(process.env.OUTLOOK_INBOX_FOLDER || "Inbox");
  const after = since ?? new Date(Date.now() - 60 * 86400_000).toISOString();
  const qs = new URLSearchParams({
    $select: "id,receivedDateTime,subject,from,toRecipients,body,hasAttachments,conversationId,importance,webLink",
    $filter: `receivedDateTime ge ${after}`, $orderby: "receivedDateTime desc", $top: "50",
  });
  let url: string | null = `${GRAPH()}/v1.0/users/${encodeURIComponent(inboxMailbox())}/mailFolders/${folder}/messages?${qs}`;
  const out: Email[] = [];
  const keep = domains();
  for (let page = 0; url && page < 6; page++) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
    if (r.status === 403) throw new Error("Outlook refused to read the mailbox (403): grant the app the Microsoft Graph application permission Mail.Read with admin consent, and allow it on this mailbox.");
    if (r.status === 404) throw new Error(`Mailbox or folder not found: ${inboxMailbox()} / ${decodeURIComponent(folder)}.`);
    if (!r.ok) throw new Error(`Outlook read failed (${r.status}).`);
    const j = (await r.json()) as { value: GraphMessage[]; "@odata.nextLink"?: string };
    for (const g of j.value) {
      const address = g.from?.emailAddress?.address ?? "", name = g.from?.emailAddress?.name ?? address;
      if (keep.length && !keep.some((d) => address.toLowerCase().endsWith("@" + d) || address.toLowerCase().endsWith("." + d))) continue;
      const atts = g.hasAttachments ? await attachmentNames(token, g.id).catch(() => []) : [];
      out.push({
        id: g.id, received: g.receivedDateTime, from: address, fromName: name, company: companyOf(address, name),
        to: (g.toRecipients ?? []).map((t) => t.emailAddress?.address ?? "").filter(Boolean),
        subject: g.subject || "(no subject)", text: plainText(g.body?.content ?? "", (g.body?.contentType ?? "").toLowerCase() === "html"),
        attachments: atts, conversationId: g.conversationId, importance: (g.importance as Email["importance"]) ?? "normal", webLink: g.webLink,
      });
    }
    url = j["@odata.nextLink"] ?? null;
  }
  return out;
}
async function attachmentNames(token: string, id: string): Promise<string[]> {
  const r = await fetch(`${GRAPH()}/v1.0/users/${encodeURIComponent(inboxMailbox())}/messages/${id}/attachments?$select=name,isInline`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const j = (await r.json()) as { value: { name: string; isInline?: boolean }[] };
  return j.value.filter((a) => !a.isInline).map((a) => a.name).slice(0, 10);
}

/** The inbox, synced from Outlook when stale (or when `force`). Never throws: errors are kept on the state. */
export async function getInbox(force = false): Promise<InboxState> {
  const mode = inboxMode(), mailbox = inboxMailbox();
  if (mode === "demo") return { mode, mailbox, lastSync: null, error: null, emails: demoEmails() };
  const cur = (await readJson<InboxState>(KEY))?.value;
  const base: InboxState = cur && cur.mode === "live" && cur.mailbox === mailbox ? cur : { mode, mailbox, lastSync: null, error: null, emails: [] };
  if (!force && base.lastSync && Date.now() - Date.parse(base.lastSync) < FRESH_MS) return base;
  try {
    const since = base.emails[0]?.received ?? null;
    const fresh = await fetchLive(since);
    const byId = new Map(base.emails.map((e) => [e.id, e]));
    for (const e of fresh) byId.set(e.id, e);
    const next: InboxState = { mode, mailbox, lastSync: new Date().toISOString(), error: null, emails: [...byId.values()].sort((a, b) => b.received.localeCompare(a.received)).slice(0, 400) };
    await writeJson(KEY, next);
    return next;
  } catch (e) {
    const next = { ...base, error: e instanceof Error ? e.message : String(e), lastSync: base.lastSync };
    await writeJson(KEY, next).catch(() => undefined);
    return next;
  }
}
