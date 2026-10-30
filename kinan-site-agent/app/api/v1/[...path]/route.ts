import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { act } from "@/lib/fm/api";
import { fmToday } from "@/lib/fm/engine";
import { exceptions } from "@/lib/fm/exceptions";
import { HAS_OPERATIONS } from "@/lib/edition";
import { bearerOk } from "@/lib/integrations/http";
import { publishAfter } from "@/lib/integrations/outbound";
import { integrationsConfigured } from "@/lib/integrations/status";
import { toFleet } from "@/lib/robots/dispatch";
import { adapterFor } from "@/lib/robots/adapter";
import { complaintInsights } from "@/lib/fm/complaints";
import { predictions } from "@/lib/fm/predict";
import { ingestReadings, pdmReport } from "@/lib/fm/pdm";
import { scoreJobs, teamPlan } from "@/lib/fm/priority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The core's REST API, for the customer's systems (their CMMS, SOC, data platform, BI). Bearer ORCH_API_TOKEN.
//
// GET  /api/v1/sites                         facilities
// GET  /api/v1/assets?site=kgpp              assets (tag, class, status, criticality, condition, zone)
// GET  /api/v1/robots?site=                  robots: kind, vendor, adapter, status, battery, control, mission
// GET  /api/v1/robots/{id}                   one robot through its adapter: status (live where the vendor answers), capabilities, results
// GET  /api/v1/jobs?site=&status=            work orders (people, crews, robots on them)
// GET  /api/v1/missions?site=&status=        robot missions
// GET  /api/v1/findings?site=&since=ISO      what robots found
// GET  /api/v1/alerts?site=&status=          security alerts (intrusion, drones, FOD, wildlife…)
// GET  /api/v1/exceptions?site=              what the automation couldn't finish (the operator's queue)
// GET  /api/v1/integrations                  what is configured and what was sent lately
// POST /api/v1/jobs                          raise a work order from their system: {site, asset, title, detail?, priority?, type?, externalId?}
// POST /api/v1/jobs/{id}                     their system moved one of ours: {status?, note?, assignee?, externalId?, faultFound?: confirmed|not_found}
// GET  /api/v1/complaints?site=&status=      tenants' complaints, with the analysis (clusters, categories, repeat, time to resolve)
// POST /api/v1/complaints                    a complaint from a tenant portal, helpdesk or QR form: {site, text, from, where?, contact?, channel?}
// GET  /api/v1/predictions?site=             equipment heading for its limit, and when (remaining life P10/P50/P90, probability, diagnosis)
// GET  /api/v1/health?site=                  the predictive engine: every asset's health, failure probability, diagnosis, risk in SAR, backtest
// POST /api/v1/readings                      the plant historian's readings: {site?, readings: [{asset, key, at, value}]} (up to 5,000 a call)
// GET  /api/v1/team-plan?site=               every open job scored with its reasons; each technician's now and next
// Everything else is refused. Changes are recorded as made by "the customer's system" and go through the same rules as
// the app's (a job can't start before its permit and gas test, and so on).
const ok = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const no = (error: string, status = 400) => ok({ error }, status);

function gate(req: Request) {
  if (!HAS_OPERATIONS) return no("Facility operations are not part of this edition.", 404);
  if (!process.env.ORCH_API_TOKEN) return no("The API is off: set ORCH_API_TOKEN (16+ characters) on the server.", 503);
  if (!bearerOk(req, process.env.ORCH_API_TOKEN)) return no("Send Authorization: Bearer <ORCH_API_TOKEN>.", 401);
  return null;
}
type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  const g = gate(req); if (g) return g;
  const [what, id] = (await params).path, q = new URL(req.url).searchParams;
  const db = (await getRepo()).db, d = fmToday(db);
  const site = q.get("site") ?? q.get("facility") ?? undefined, status = q.get("status") ?? undefined, since = q.get("since") ?? undefined;
  const here = (fid: string) => !site || fid === site;
  const name = (rid?: string) => d.robots.find((r) => r.id === rid)?.name;
  switch (what) {
    case "sites": return ok({ sites: d.facilities.map((f) => ({ id: f.id, name: f.name, sector: f.sector })) });
    case "assets": return ok({ assets: d.assets.filter((a) => here(a.facilityId) && (!id || a.id === id || a.tag === id)).map((a) => ({ id: a.id, tag: a.tag, name: a.name, site: a.facilityId, class: a.class, status: a.status, criticality: a.criticality, condition: a.condition, zone: a.zone, nextPm: a.nextPm })) });
    case "robots": if (id) {
      // one robot through its adapter: status() asked now (live for pull connections), capabilities(), results' route
      const r = d.robots.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase() || x.externalId === id);
      if (!r || !here(r.facilityId)) return no(`No robot ${id}.`, 404);
      const ad = adapterFor(r), [status, results] = await Promise.all([ad.status(r), ad.results(r, since)]);
      return ok({ robot: { id: r.id, name: r.name, site: r.facilityId, kind: r.kind, vendor: r.vendor, model: r.model, externalId: r.externalId }, adapter: ad.name, mode: ad.mode, status, capabilities: ad.capabilities(r), results });
    } else return ok({ robots: d.robots.filter((r) => here(r.facilityId)).map((r) => ({ id: r.id, name: r.name, site: r.facilityId, kind: r.kind, vendor: r.vendor, model: r.model, adapter: r.adapter ?? "sim", externalId: r.externalId, status: r.status, battery: r.battery, zone: r.zone, control: r.autonomy ?? "policy", estop: !!r.estop, missionId: r.missionId, lastReport: r.lastReport })) });
    case "jobs": return ok({ jobs: d.workOrders.filter((w) => here(w.facilityId) && (!status || w.status === status) && (!id || w.id === id)).map((w) => ({ id: w.id, site: w.facilityId, asset: d.assets.find((a) => a.id === w.assetId)?.tag, type: w.type, priority: w.priority, status: w.status, title: w.title, detail: w.detail, raised: w.raised, due: w.due, holdReason: w.holdReason,
      assignee: d.technicians.find((t) => t.id === w.assignee)?.name, crew: w.crew, robot: name(w.robot), missionId: w.missionId, support: w.support?.map((s) => ({ robot: name(s.robotId), role: s.role })), source: w.source })) });
    case "missions": return ok({ missions: d.missions.filter((m) => here(m.facilityId) && (!status || m.status === status) && (!id || m.id === id)).map((m) => ({ id: m.id, site: m.facilityId, robot: name(m.robotId), kind: m.kind, title: m.title, status: m.status, plannedStart: m.plannedStart, started: m.started, ended: m.ended, progress: m.progress, workOrder: m.woId, findings: m.findings.length })) });
    case "findings": return ok({ findings: d.missions.filter((m) => here(m.facilityId)).flatMap((m) => m.findings).filter((f) => !since || f.at >= since).map((f) => ({ ...f, robot: name(f.robotId), asset: d.assets.find((a) => a.id === f.assetId)?.tag })) });
    case "alerts": return ok({ alerts: d.securityAlerts.filter((a) => here(a.facilityId) && (!status || a.status === status)) });
    case "exceptions": return ok({ exceptions: d.facilities.filter((f) => here(f.id)).flatMap((f) => exceptions(db, d, f.id).map((x) => ({ site: f.id, ...x }))) });
    case "complaints": return ok({ complaints: d.complaints.filter((c) => here(c.facilityId) && (!status || c.status === status)).sort((a, b) => b.at.localeCompare(a.at)), ...(site ? { analysis: complaintInsights(d, site) } : {}) });
    case "predictions": return ok({ predictions: predictions(d, site).map(({ trend: _t, ...p }) => p) });
    case "health": {
      const fids = d.facilities.filter((f) => here(f.id)).map((f) => f.id);
      return ok({ sites: fids.map((fid) => { const r = pdmReport(d, fid); return { site: fid, atRisk: r.atRisk, expectedLoss30d: r.expectedLoss, sources: r.sources, backtest: { ...r.backtest, examples: undefined }, feedback: r.feedback,
        assets: r.assets.map(({ series, ...a }) => ({ ...a, readings: series.map(({ values: _v, projection: _p, logMu: _m, logSd: _s, ...x }) => x) })) }; }) });
    }
    case "team-plan": if (!site) return no("Which site? ?site=kgia");
      return ok({ jobs: scoreJobs(d, site), plan: teamPlan(d, site) });
    case "integrations": return ok({ configured: integrationsConfigured(), sent: (db.integrationLog ?? []).slice(-50).reverse() });
    default: return no("Unknown resource: sites, assets, robots, jobs, missions, findings, alerts, exceptions, complaints, predictions, team-plan, integrations.", 404);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const g = gate(req); if (g) return g;
  const [what, id] = (await params).path;
  if (what !== "jobs" && what !== "complaints" && what !== "readings") return no("POST takes /api/v1/jobs (raise one), /api/v1/jobs/{id} (update one), /api/v1/complaints (log one) or /api/v1/readings (the historian's readings).", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return no("Send JSON."); }
  if (what === "readings") {
    if (!Array.isArray(b.readings) || !b.readings.length) return no("Send {readings: [{asset, key, at, value}, …]}.");
    const repo = await getRepo(), d = fmToday(repo.db);
    const r = ingestReadings((repo.db.fmHistory ??= {}), d.assets, b.readings, typeof b.site === "string" ? b.site : undefined);
    if (r.accepted) await repo.save();
    return ok({ ok: r.accepted > 0, ...r }, r.accepted ? 202 : 422);
  }
  const repo = await getRepo(), str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).slice(0, 2000) : undefined);
  const by = `${str("system") ?? "Customer system"}${str("externalId") ? ` (${str("externalId")})` : ""}`.slice(0, 60);
  try {
    const r = what === "complaints"
      ? act(repo.db, { action: "complaint", facilityId: str("site"), complaint: { text: str("text"), from: str("from") ?? "Tenant portal", where: str("where"), contact: str("contact"), channel: (str("channel") as never) ?? "api" } }, by, "web", null)
      : id
      ? act(repo.db, { action: "wo_update", woId: id, status: str("status") as never, note: str("note"), assignee: str("assignee"), holdReason: str("holdReason"), pdmOutcome: str("faultFound") as never }, by, "web", null)
      : act(repo.db, { action: "wo_create", facilityId: str("site"), asset: str("asset") ?? "", title: str("title"), detail: str("detail"), priority: str("priority") as never, type: str("type") as never, note: str("externalId") ? `External reference ${str("externalId")}` : undefined }, by, "web", null);
    await toFleet(repo.db, r.events);
    await repo.save();
    await publishAfter(repo);
    const wo = r.events.find((e) => e.kind === "wo_create");
    const cmp = r.events.find((e) => e.kind === "complaint_create");
    return ok({ ok: true, message: r.message, ...(wo && wo.kind === "wo_create" ? { id: wo.wo.id } : {}), ...(cmp && cmp.kind === "complaint_create" ? { id: cmp.complaint.id, category: cmp.complaint.category, linkedTo: cmp.complaint.woId } : {}) }, id ? 200 : 201);
  } catch (e) { return no((e as Error).message, 422); }
}
