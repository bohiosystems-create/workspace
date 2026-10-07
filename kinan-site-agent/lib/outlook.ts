// Outlook via Microsoft Graph — the same module as the other Kinan agents.
//
//   mock: nothing leaves the app. The "send" is simulated and labelled as such on the Daily report page.
//   live: client-credentials token (Entra app registration with Mail.Send) →
//         POST /users/{OUTLOOK_SENDER}/sendMail
//
// The only caller is the daily status report (lib/reports), which goes to internal addresses only and is always
// sent, never left as a draft.
//
// NOTE: written against the Microsoft Graph v1.0 docs; not exercised against a real tenant.

export type MailAttachment = { name: string; contentType: string; content: string };
export type MailToSend = { to: string; cc: string[]; subject: string; body: string; attachments?: MailAttachment[] };
export type SendResult = { delivery: "mock" | "send"; providerRef: string };

export const outlookMode = () => (process.env.OUTLOOK_MODE === "live" ? "live" : "mock");
export const outlookSender = () => process.env.OUTLOOK_SENDER || "onsite@your-company.com";
export const outlookCredsSet = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);

async function graphToken(): Promise<string> {
  const { MS_TENANT_ID: tenant, MS_CLIENT_ID: id, MS_CLIENT_SECRET: secret } = process.env;
  if (!tenant || !id || !secret) throw new Error("Outlook live mode needs MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET.");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}).`);
  return (await res.json()).access_token;
}

export async function deliverMail(mail: MailToSend): Promise<SendResult> {
  if (outlookMode() === "mock") return { delivery: "mock", providerRef: `mock-${Date.now().toString(36)}` };
  const token = await graphToken();
  const message = {
    subject: mail.subject,
    body: { contentType: "HTML", content: mail.body },
    toRecipients: [{ emailAddress: { address: mail.to } }],
    ccRecipients: mail.cc.map((address) => ({ emailAddress: { address } })),
    ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: Buffer.from(a.content, "utf8").toString("base64"),
    })) } : {}),
  };
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(outlookSender())}/sendMail`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (res.status !== 202) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Outlook send failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }
  return { delivery: "send", providerRef: res.headers.get("request-id") ?? "accepted" };
}
