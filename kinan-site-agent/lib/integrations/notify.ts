// Telling people outside the app: a Teams channel (an incoming webhook, or a Teams Workflows "when a webhook request is
// received" URL — both take the Adaptive Card message below) and email (Outlook through Microsoft Graph, lib/outlook.ts).
//
//   TEAMS_WEBHOOK_URL   one channel for everything, or
//   TEAMS_WEBHOOKS      {"kgpp": "https://…", "kgia": "https://…", "*": "https://…"} — one per facility, "*" for the rest
//   ALERT_EMAIL_TO      who gets the email alerts (comma-separated), unless a rule names someone; OUTLOOK_MODE=live sends
import { deliverMail } from "../outlook";
import { envJson, send, short } from "./http";
import type { Sent } from "./cmms";

export function teamsUrl(facilityId: string) {
  const per = envJson<Record<string, string>>("TEAMS_WEBHOOKS", {});
  return per[facilityId] ?? per["*"] ?? process.env.TEAMS_WEBHOOK_URL ?? "";
}
export const emailTo = (to?: string) => (to || process.env.ALERT_EMAIL_TO || "").split(",").map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

export async function toTeams(facilityId: string, title: string, text: string, facts: [string, string][] = [], link?: string): Promise<Sent | null> {
  const url = teamsUrl(facilityId);
  if (!url) return null;
  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text, wrap: true },
      ...(facts.length ? [{ type: "FactSet", facts: facts.map(([t, v]) => ({ title: t, value: v })) }] : []),
    ],
    ...(link ? { actions: [{ type: "Action.OpenUrl", title: "Open in Bohio", url: link }] } : {}),
  };
  const r = await send(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }] }) });
  return r.ok ? { ok: true, note: "Posted to Teams" } : { ok: false, note: `Teams ${r.status}: ${short(r.text)}` };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function toEmail(title: string, text: string, to?: string, link?: string): Promise<Sent | null> {
  const [first, ...cc] = emailTo(to);
  if (!first) return null;
  const r = await deliverMail({ to: first, cc, subject: title, body: `<p><b>${esc(title)}</b></p><p>${esc(text)}</p>${link ? `<p><a href="${esc(link)}">Open in Bohio</a></p>` : ""}` });
  return { ok: true, note: r.delivery === "mock" ? `Email to ${[first, ...cc].join(", ")} (mock: OUTLOOK_MODE is not live)` : `Emailed ${[first, ...cc].join(", ")}`, ref: r.providerRef };
}
