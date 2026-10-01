// Outlook integration via Microsoft Graph.
//
//   mock: nothing leaves the app. The "send" is simulated and labelled as such in the UI.
//   live: client-credentials token (Entra app registration) →
//           OUTLOOK_DELIVERY=send  : POST /users/{sender}/sendMail      (Mail.Send)
//           OUTLOOK_DELIVERY=draft : POST /users/{sender}/messages       (Mail.ReadWrite) — a person then
//                                    reviews and sends it from Outlook.
//
// This module only ever runs AFTER a human has approved the exact revision of the email
// (see lib/recommendations.ts). Plain-text bodies only.
//
// NOTE: written against the Microsoft Graph v1.0 docs; not exercised against a real tenant.

export type MailToSend = { to: string; cc: string[]; subject: string; body: string };
export type SendResult = { delivery: "mock" | "send" | "draft"; providerRef: string };

export const outlookMode = () => (process.env.OUTLOOK_MODE === "live" ? "live" : "mock");
export const outlookDelivery = () => (process.env.OUTLOOK_DELIVERY === "draft" ? "draft" : "send");
export const outlookSender = () => process.env.OUTLOOK_SENDER || "marketing@your-company.com";
export const outlookSenderName = () => process.env.OUTLOOK_SENDER_NAME || "Marketing Team";
export const outlookSenderNameAr = () => process.env.OUTLOOK_SENDER_NAME_AR || "فريق التسويق";
export const defaultCc = () =>
  (process.env.OUTLOOK_CC || "").split(",").map((s) => s.trim()).filter(Boolean);

async function graphToken(): Promise<string> {
  const { MS_TENANT_ID: tenant, MS_CLIENT_ID: id, MS_CLIENT_SECRET: secret } = process.env;
  if (!tenant || !id || !secret) throw new Error("Outlook live mode needs MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET.");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}).`);
  return (await res.json()).access_token;
}

export async function deliverMail(mail: MailToSend): Promise<SendResult> {
  if (outlookMode() === "mock") {
    return { delivery: "mock", providerRef: `mock-${Date.now().toString(36)}` };
  }
  const token = await graphToken();
  const sender = encodeURIComponent(outlookSender());
  const message = {
    subject: mail.subject,
    body: { contentType: "Text", content: mail.body },
    toRecipients: [{ emailAddress: { address: mail.to } }],
    ccRecipients: mail.cc.map((address) => ({ emailAddress: { address } })),
  };
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (outlookDelivery() === "draft") {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/messages`, { method: "POST", headers, body: JSON.stringify(message) });
    if (!res.ok) throw new Error(`Outlook draft creation failed (${res.status}).`);
    const j = await res.json();
    return { delivery: "draft", providerRef: String(j.id ?? "") };
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: "POST", headers, body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (res.status !== 202) throw new Error(`Outlook send failed (${res.status}).`);
  return { delivery: "send", providerRef: res.headers.get("request-id") ?? "accepted" };
}
