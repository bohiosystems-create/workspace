// Kinan connector — how the AI Director of Marketing feeds Kinan's CRM (Yardi) and Kinan's AI agent.
//
// OUT (outbox, KinanEvent): every event is stored first, then delivered; failures are retried and audited.
//   KINAN_MODE=mock     events are recorded as delivered, nothing leaves the app (default)
//   KINAN_MODE=webhook  POST to KINAN_AGENT_WEBHOOK_URL, body signed with HMAC-SHA256 (KINAN_WEBHOOK_SECRET)
//                       headers: X-Bohio-Event, X-Bohio-Delivery, X-Bohio-Signature: sha256=<hex>
//   YARDI_MODE=mock | live — Yardi delivery (guest-card activities / marketing sources) is NOT implemented:
//                       it needs Kinan's Yardi interface licence and credentials. See docs/kinan-integration.md.
// IN (for Kinan's agent): GET /api/kinan/context (priorities, lead-source quality, campaign codes, tasks) and
//   POST /api/kinan/feedback (follow-up outcomes, task completion), both with x-api-key: KINAN_API_KEY.
//
// Events that lead to a customer being contacted (lead follow-ups) are only created after a named person
// approves the task; informational events (source quality, plan, brief, campaign status) flow automatically.
import { prisma } from "./prisma";
import { type Lang, tx, an } from "./i18n";

export type KinanEventType =
  | "lead.followup_requested" | "lead_source.quality" | "director.plan_approved"
  | "campaign.status_changed" | "brief.daily" | "vendor.decision";
export type KinanTarget = "AGENT" | "YARDI";

export const kinanMode = () => (process.env.KINAN_MODE === "webhook" ? "webhook" : "mock");
export const yardiMode = () => (process.env.YARDI_MODE === "live" ? "live" : "mock");
const MAX_ATTEMPTS = 5;

async function hmacHex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deliver(e: { id: string; type: string; target: string; payload: string; createdAt: Date }): Promise<{ mode: string }> {
  if (e.target === "YARDI") {
    if (yardiMode() === "mock") return { mode: "mock" };
    throw new Error("Yardi delivery is not implemented yet (needs Kinan's Yardi interface credentials) — see docs/kinan-integration.md.");
  }
  if (kinanMode() === "mock") return { mode: "mock" };
  const url = process.env.KINAN_AGENT_WEBHOOK_URL, secret = process.env.KINAN_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("KINAN_MODE=webhook needs KINAN_AGENT_WEBHOOK_URL and KINAN_WEBHOOK_SECRET.");
  const body = JSON.stringify({ id: e.id, type: e.type, createdAt: e.createdAt.toISOString(), payload: JSON.parse(e.payload) });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bohio-Event": e.type, "X-Bohio-Delivery": e.id, "X-Bohio-Signature": `sha256=${await hmacHex(secret, body)}` },
    body,
  });
  if (!res.ok) throw new Error(`Kinan agent webhook returned ${res.status}.`);
  return { mode: "webhook" };
}

async function attempt(id: string) {
  const e = (await prisma.kinanEvent.findMany()).find((x) => x.id === id);
  if (!e || e.status === "DELIVERED") return;
  try {
    const r = await deliver(e);
    await prisma.kinanEvent.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), attempts: e.attempts + 1, mode: r.mode, lastError: null } });
  } catch (err: any) {
    await prisma.kinanEvent.update({ where: { id }, data: { status: "FAILED", attempts: e.attempts + 1, lastError: String(err?.message ?? err).slice(0, 300) } });
  }
}

/** Store an event in the outbox and try to deliver it straight away. */
export async function queueKinanEvent(type: KinanEventType, target: KinanTarget, payload: unknown, approvedBy?: string) {
  const e = await prisma.kinanEvent.create({ data: { type, target, payload: JSON.stringify(payload), approvedBy: approvedBy ?? null } });
  await attempt(e.id);
  return e.id;
}

/** Retry failed deliveries (manual "Retry" or a scheduled job). */
export async function retryKinanEvents(id?: string) {
  const es = (await prisma.kinanEvent.findMany()).filter((e) => e.status === "FAILED" && e.attempts < MAX_ATTEMPTS && (!id || e.id === id));
  for (const e of es) await attempt(e.id);
  return es.length;
}

export async function kinanOutbox(limit = 30, lang: Lang = "en") {
  const es = await prisma.kinanEvent.findMany();
  return [...es].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((e) => ({
    id: e.id, createdAt: e.createdAt.toISOString(), type: e.type, target: e.target, status: e.status, attempts: e.attempts,
    lastError: e.lastError, mode: e.mode, approvedBy: e.approvedBy, deliveredAt: e.deliveredAt?.toISOString() ?? null,
    summary: summarize(e.type, e.payload, lang),
  }));
}

const REASONS: Record<string, [string, string]> = {
  no_first_response_48h: ["no response within 48h", "بلا رد خلال 48 ساعة"],
  lost_price_or_financing: ["lost on price or financing", "خسارة بسبب السعر أو التمويل"],
};

function summarize(type: string, payload: string, l: Lang = "en") {
  try {
    const p = JSON.parse(payload);
    if (type === "lead.followup_requested") {
      const n = p.leads?.length ?? 0, r = REASONS[p.reason] ?? [p.reason ?? "", p.reason ?? ""];
      return tx(l, `${n} leads · ${r[0]}`, `${an(n, "عميل محتمل واحد", "عميلان محتملان", "عملاء محتملين", "عميلاً محتملاً")} · ${r[1]}`);
    }
    if (type === "lead_source.quality") return tx(l, `${p.sources?.length ?? 0} sources`, `${p.sources?.length ?? 0} مصدراً`);
    if (type === "director.plan_approved") return tx(l, `${p.month} · SAR ${p.totalK}K`, `${p.month} · ${p.totalK} ألف ر.س`);
    if (type === "campaign.status_changed") return `${p.campaignCode ?? p.campaign} → ${p.status}`;
    if (type === "brief.daily") return p.headline ?? "";
    return "";
  } catch { return ""; }
}

/** Kinan's agent reporting back. Lead updates become CRM truth; task completion closes the director's task. */
export async function recordKinanFeedback(b: any) {
  const type = String(b?.type ?? "");
  if (!["lead.contacted", "lead.outcome", "task.done"].includes(type)) throw new Error("type must be lead.contacted | lead.outcome | task.done");
  await prisma.kinanFeedback.create({ data: { type, payload: JSON.stringify(b) } });
  if (type === "task.done" && b.taskId) {
    const t = (await prisma.directorTask.findMany()).find((x) => x.id === String(b.taskId));
    if (t) await prisma.directorTask.update({ where: { id: t.id }, data: { status: "DONE" } });
    return { ok: true, updated: t ? 1 : 0 };
  }
  const lead = (await prisma.crmLead.findMany()).find((l) => l.crmId === String(b.leadId ?? ""));
  if (!lead) return { ok: true, updated: 0 };
  const at = b.at && !Number.isNaN(Date.parse(b.at)) ? new Date(b.at) : new Date();
  const data: Record<string, unknown> = {};
  if (type === "lead.contacted" && !lead.firstResponseAt) { data.firstResponseAt = at; if (lead.stage === "NEW") data.stage = "CONTACTED"; }
  const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING", "RESERVED", "WON", "LOST"];
  if (type === "lead.outcome" && typeof b.stage === "string") {
    if (!STAGES.includes(b.stage.toUpperCase())) throw new Error(`stage must be one of ${STAGES.join(", ")}`);
    data.stage = b.stage.toUpperCase();
    if (typeof b.dealValueM === "number") data.dealValueM = b.dealValueM;
  }
  if (Object.keys(data).length) await prisma.crmLead.update({ where: { id: lead.id }, data });
  return { ok: true, updated: Object.keys(data).length ? 1 : 0 };
}
