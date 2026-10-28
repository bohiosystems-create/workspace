// Work orders into the customer's maintenance system, so the job the orchestrator raised (a robot's finding, an alarm,
// a technician's report) lives where the customer's planners already work. One or more systems, set in env CMMS:
//
//   [{"kind":"maximo","url":"https://maximo.example.com/maximo","apiKey":"…","siteId":"KGPP","facilities":["kgpp"]},
//    {"kind":"sap","url":"https://sap.example.com","user":"…","password":"…","plant":"1000","workCenter":"MECH","orderType":"PM01"},
//    {"kind":"cafm","url":"https://cafm.example.com/hooks/bohio","secret":"…"}]
//
//   maximo  IBM Maximo REST/OSLC: POST /oslc/os/mxwo creates the work order (status WAPPR); status changes go through
//           the changeStatus web method (in progress → INPRG, done → COMP).
//   sap     SAP S/4HANA PM, OData API_MAINTENANCEORDER: fetches the CSRF token, then POSTs the maintenance order. Status
//           changes are not sent (SAP's order business transactions differ by customer); SAP can send them to us instead
//           (POST /api/v1/work-orders/{id}).
//   cafm    any CAFM/CMMS with a webhook: we POST the work order as JSON, signed (header X-Bohio-Signature), and read
//           {"id"} back as its reference.
// Without "facilities", a system takes every facility's work orders. Every attempt is logged (db.integrationLog).
import type { Db } from "../types";
import type { FmData, WorkOrder } from "../fm/types";
import { envJson, send, short, signature } from "./http";

export type CmmsConfig =
  | { kind: "maximo"; url: string; apiKey: string; siteId?: string; facilities?: string[]; name?: string }
  | { kind: "sap"; url: string; user: string; password: string; plant?: string; workCenter?: string; orderType?: string; facilities?: string[]; name?: string }
  | { kind: "cafm"; url: string; secret?: string; facilities?: string[]; name?: string };

export const cmmsSystems = (): CmmsConfig[] => {
  const c = envJson<CmmsConfig | CmmsConfig[] | null>("CMMS", null);
  return (Array.isArray(c) ? c : c ? [c] : []).filter((x) => x && typeof x.url === "string" && ["maximo", "sap", "cafm"].includes(x.kind));
};
export const cmmsLabel = (c: CmmsConfig) => c.name ?? { maximo: "Maximo", sap: "SAP PM", cafm: "CAFM" }[c.kind];
const serves = (c: CmmsConfig, facilityId: string) => !c.facilities?.length || c.facilities.includes(facilityId);
const base = (u: string) => u.replace(/\/+$/, "");

export type Sent = { ok: boolean; note: string; ref?: string };

function woFacts(d: FmData, w: WorkOrder) {
  const a = d.assets.find((x) => x.id === w.assetId);
  return { tag: a?.tag ?? w.assetId, assetName: a?.name ?? "", zone: a?.zone ?? "", prio: Number(w.priority.replace(/\D/g, "")) || 3 };
}

async function maximoCreate(c: Extract<CmmsConfig, { kind: "maximo" }>, d: FmData, w: WorkOrder): Promise<Sent> {
  const f = woFacts(d, w);
  const r = await send(`${base(c.url)}/oslc/os/mxwo?lean=1`, {
    method: "POST",
    headers: { apikey: c.apiKey, "content-type": "application/json", properties: "wonum,workorderid,href" },
    body: JSON.stringify({ siteid: c.siteId ?? w.facilityId.toUpperCase(), description: short(w.title, 100), description_longdescription: w.detail || w.title, assetnum: f.tag,
      worktype: w.type === "PM" ? "PM" : "CM", wopriority: f.prio, status: "WAPPR", externalrefid: w.id, reportedby: "BOHIO", targcompdate: `${w.due}T17:00:00` }),
  });
  if (!r.ok) return { ok: false, note: `Maximo ${r.status}: ${short(r.text)}` };
  const j = JSON.parse(r.text || "{}");
  return { ok: true, note: `Created in Maximo${j.wonum ? ` as ${j.wonum}` : ""}`, ref: j.href ?? r.headers.get("location") ?? j.wonum };
}
async function maximoStatus(c: Extract<CmmsConfig, { kind: "maximo" }>, href: string, status: WorkOrder["status"]): Promise<Sent | null> {
  const to = status === "in_progress" ? "INPRG" : status === "done" ? "COMP" : null;
  if (!to || !/^https?:/.test(href)) return null;
  const r = await send(`${href}${href.includes("?") ? "&" : "?"}action=wsmethod:changeStatus&lean=1`, { method: "POST", headers: { apikey: c.apiKey, "content-type": "application/json", "x-method-override": "PATCH" }, body: JSON.stringify({ status: to, memo: "Bohio" }) });
  return r.ok ? { ok: true, note: `Maximo status ${to}`, ref: href } : { ok: false, note: `Maximo ${r.status}: ${short(r.text)}`, ref: href };
}

async function sapCreate(c: Extract<CmmsConfig, { kind: "sap" }>, d: FmData, w: WorkOrder): Promise<Sent> {
  const f = woFacts(d, w), svc = `${base(c.url)}/sap/opu/odata/sap/API_MAINTENANCEORDER`;
  const auth = `Basic ${btoa(`${c.user}:${c.password}`)}`;
  // SAP's OData services want a CSRF token (and the session cookie it came with) on every change
  const t = await send(`${svc}/`, { headers: { authorization: auth, "x-csrf-token": "Fetch", accept: "application/json" } });
  const token = t.headers.get("x-csrf-token");
  if (!token) return { ok: false, note: `SAP: no CSRF token (${t.status} ${short(t.text, 80)})` };
  const cookie = (t.headers.getSetCookie?.() ?? []).map((x) => x.split(";")[0]).join("; ");
  const r = await send(`${svc}/MaintenanceOrder`, {
    method: "POST",
    headers: { authorization: auth, "x-csrf-token": token, ...(cookie ? { cookie } : {}), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ MaintenanceOrderType: c.orderType ?? (w.type === "PM" ? "PM02" : "PM01"), MaintenanceOrderDesc: short(w.title, 40), MaintenancePlanningPlant: c.plant, MainWorkCenter: c.workCenter,
      MaintPriority: String(Math.min(4, f.prio)), TechnicalObject: f.tag, MaintOrdBasicEndDate: `/Date(${Date.parse(`${w.due}T00:00:00Z`)})/` }),
  });
  if (!r.ok) return { ok: false, note: `SAP ${r.status}: ${short(r.text)}` };
  const j = JSON.parse(r.text || "{}");
  const no = j?.d?.MaintenanceOrder ?? j?.MaintenanceOrder;
  return { ok: true, note: `Created in SAP PM${no ? ` as order ${no}` : ""}`, ref: no };
}

async function cafmSend(c: Extract<CmmsConfig, { kind: "cafm" }>, d: FmData, w: WorkOrder, event: string): Promise<Sent> {
  const f = woFacts(d, w);
  const body = JSON.stringify({ event, at: new Date().toISOString(), workOrder: { id: w.id, facility: d.facilities.find((x) => x.id === w.facilityId)?.name, facilityId: w.facilityId, asset: f.tag, assetName: f.assetName, zone: f.zone,
    type: w.type, priority: w.priority, status: w.status, title: w.title, detail: w.detail, due: w.due, raised: w.raised, assignee: d.technicians.find((t) => t.id === w.assignee)?.name, crew: w.crew, robot: d.robots.find((r) => r.id === w.robot)?.name, holdReason: w.holdReason } });
  const r = await send(c.url, { method: "POST", headers: { "content-type": "application/json", "x-bohio-event": event, ...(c.secret ? { "x-bohio-signature": await signature(c.secret, body) } : {}) }, body });
  if (!r.ok) return { ok: false, note: `${cmmsLabel(c)} ${r.status}: ${short(r.text)}` };
  let ref: string | undefined; try { ref = JSON.parse(r.text)?.id; } catch { /* a receiver that answers without JSON */ }
  return { ok: true, note: `${event === "work_order.created" ? "Created" : "Updated"} in ${cmmsLabel(c)}`, ref: ref ? String(ref) : undefined };
}

/** Send a new work order (or a status change of one we sent) to every maintenance system that takes its facility. */
export async function cmmsSync(db: Db, d: FmData, w: WorkOrder, change: "created" | "updated"): Promise<{ target: string; sent: Sent }[]> {
  const out: { target: string; sent: Sent }[] = [];
  for (const c of cmmsSystems().filter((x) => serves(x, w.facilityId))) {
    const target = cmmsLabel(c);
    const ref = [...(db.integrationLog ?? [])].reverse().find((x) => x.target === target && x.subject === w.id && x.ok && x.ref)?.ref;
    try {
      const sent = change === "created"
        ? c.kind === "maximo" ? await maximoCreate(c, d, w) : c.kind === "sap" ? await sapCreate(c, d, w) : await cafmSend(c, d, w, "work_order.created")
        : c.kind === "maximo" ? (ref ? await maximoStatus(c, ref, w.status) : null) : c.kind === "cafm" ? await cafmSend(c, d, w, "work_order.updated") : null;
      if (sent) out.push({ target, sent });
    } catch (e) { out.push({ target, sent: { ok: false, note: `${target}: ${(e as Error).name === "TimeoutError" ? "no answer in 8 s" : (e as Error).message}` } }); }
  }
  return out;
}
