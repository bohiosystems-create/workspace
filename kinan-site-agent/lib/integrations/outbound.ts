// The northbound side of the core: after every change, what happened goes on to the customer's systems.
//
//   work orders      → their maintenance system (SAP PM, Maximo, a CAFM — cmms.ts)
//   notify events    → Teams and email (notify.ts), from the rules ("gas read → tell the control room on Teams")
//   everything else  → signed webhooks to whoever subscribed (env WEBHOOKS), for their own dashboards, SOC or data lake:
//       [{"url":"https://soc.example.com/hooks/bohio","secret":"…","events":["alert.*","finding.created"]}]
//     Each POST carries {id, type, at, facilityId, data}; headers X-Bohio-Event, X-Bohio-Delivery and X-Bohio-Signature
//     (t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body"> with the subscriber's secret).
//
// It works through the change log from a cursor (db.outboundCursor), so it doesn't matter which door a change came in
// by (the app, the agent, WhatsApp, the fleet bridge): each event is handled once. Every attempt is logged in
// db.integrationLog; failures show in the operator's exceptions queue. With nothing configured, it only moves the cursor.
import type { Db } from "../types";
import type { FmEvent } from "../fm/types";
import { fmToday } from "../fm/engine";
import { eventFacility } from "../fm/api";
import { cmmsSync, cmmsSystems, type Sent } from "./cmms";
import { teamsUrl, toEmail, toTeams } from "./notify";
import { send, short, signature } from "./http";
import { appUrl, webhooks, type Hook } from "./status";

/** The changes not yet handled, oldest first. The first run takes the last two minutes: older history is not replayed. */
function pending(db: Db): FmEvent[] {
  const log = db.fmLog ?? [];
  const c = db.outboundCursor ?? { id: "", at: new Date(Date.now() - 2 * 60_000).toISOString() };
  const i = log.findIndex((e) => e.id === c.id);
  return i >= 0 ? log.slice(i + 1) : log.filter((e) => e.at > c.at);
}

/** The webhook event type for a change, or null for the ones subscribers don't need (bridge plumbing, policy). */
function hookType(e: FmEvent): string | null {
  switch (e.kind) {
    case "wo_create": return "work_order.created";
    case "wo_update": return "work_order.updated";
    case "security_alert": return "alert.created";
    case "security_update": return "alert.updated";
    case "mission_create": return "mission.created";
    case "mission_update": case "mission_pilot": return "mission.updated";
    case "robot_report": return e.report.findings?.length ? "finding.created" : e.report.mission?.status ? "mission.updated" : e.report.alerts?.length ? "alert.created" : null;
    case "robot_estop": return "robot.estop";
    case "dispatch_result": return e.sent ? null : "exception.created";
    case "action": return "decision.made";
    case "notify": return "notification";
    case "asset_status": return "asset.updated";
    default: return null;
  }
}
const wants = (h: Hook, type: string, facilityId?: string) =>
  (!h.facilities?.length || (facilityId && h.facilities.includes(facilityId))) && (!h.events?.length || h.events.some((p) => p === "*" || p === type || (p.endsWith(".*") && type.startsWith(p.slice(0, -1)))));

export async function publish(db: Db): Promise<number> {
  const evs = pending(db);
  if (!evs.length) return 0;
  db.outboundCursor = { id: evs[evs.length - 1].id, at: evs[evs.length - 1].at }; // claimed before sending: handled once
  const hooks = webhooks(), cmms = cmmsSystems().length > 0;
  if (!hooks.length && !cmms && !evs.some((e) => e.kind === "notify")) return 0;
  const d = fmToday(db), link = appUrl();
  const log = (target: string, what: string, s: Sent, facilityId?: string, subject?: string) =>
    (db.integrationLog ??= []).push({ id: `IL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), target, what: short(what, 120), ok: s.ok, note: short(s.note, 240), ...(facilityId ? { facilityId } : {}), ...(s.ref ? { ref: s.ref } : {}), ...(subject ? { subject } : {}) });
  const guard = async (p: () => Promise<Sent | null>): Promise<Sent | null> => { try { return await p(); } catch (e) { return { ok: false, note: (e as Error).name === "TimeoutError" ? "no answer in 8 s" : (e as Error).message }; } };
  let n = 0;
  for (const e of evs) {
    const facilityId = eventFacility(d, e);
    // work orders into the maintenance system
    if (cmms && (e.kind === "wo_create" || (e.kind === "wo_update" && e.patch.status))) {
      const w = d.workOrders.find((x) => x.id === (e.kind === "wo_create" ? e.wo.id : e.woId));
      if (w) for (const r of await cmmsSync(db, d, w, e.kind === "wo_create" ? "created" : "updated")) { log(r.target, `${w.id} ${e.kind === "wo_create" ? "created" : `→ ${w.status}`}`, r.sent, w.facilityId, w.id); n++; }
    }
    // people, by the channel the rule chose
    if (e.kind === "notify") {
      const s = await guard(() => (e.via === "teams" ? toTeams(e.facilityId, e.title, e.text, [], link || undefined) : toEmail(e.title, e.text, e.to, link || undefined)));
      log(e.via === "teams" ? "Teams" : "Email", e.title, s ?? { ok: false, note: e.via === "teams" ? (teamsUrl(e.facilityId) ? "not sent" : "No Teams webhook set (TEAMS_WEBHOOK_URL)") : "No address to email (ALERT_EMAIL_TO)" }, e.facilityId); n++;
    }
    // subscribers
    const type = hookType(e);
    if (type) for (const h of hooks.filter((x) => wants(x, type, facilityId))) {
      const data = e.kind === "wo_update" ? { ...e, workOrder: d.workOrders.find((x) => x.id === e.woId) } : e;
      const body = JSON.stringify({ id: e.id, type, at: e.at, facilityId, data });
      const s = await guard(async () => { const r = await send(h.url, { method: "POST", headers: { "content-type": "application/json", "x-bohio-event": type, "x-bohio-delivery": e.id, ...(h.secret ? { "x-bohio-signature": await signature(h.secret, body) } : {}) }, body }); return r.ok ? { ok: true, note: `${r.status}` } : { ok: false, note: `${r.status}: ${short(r.text)}` }; });
      log(`Webhook ${new URL(h.url).host}`, `${type} ${e.summary}`, s!, facilityId); n++;
    }
  }
  if (db.integrationLog && db.integrationLog.length > 300) db.integrationLog = db.integrationLog.slice(-300);
  return n;
}

/** Run the northbound integrations after the response has gone (Vercel keeps the function alive for it), then save. */
export async function publishAfter(repo: { db: Db; save: () => unknown }) {
  const run = async () => { try { if (await publish(repo.db)) await repo.save(); } catch (e) { console.error("outbound:", (e as Error).message); } };
  try { const { after } = await import("next/server"); after(run); } catch { await run(); } // outside a request (scripts, tests)
}
