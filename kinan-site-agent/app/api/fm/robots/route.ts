import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publishAfter } from "@/lib/integrations/outbound";
import { getRepo } from "@/lib/store";
import { act } from "@/lib/fm/api";
import { HAS_OPERATIONS } from "@/lib/edition";
import type { RobotReport } from "@/lib/fm/types";
import { fmToday } from "@/lib/fm/engine";
import { analyseImages, MAX_IMAGE_BYTES, type DroneImage } from "@/lib/robots/vision";
import { serverLlm } from "@/lib/llmConfig";
import { ack, outbox } from "@/lib/robots/dispatch";
import { parserFor } from "@/lib/robots/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports from real robot fleets, whoever made them: a vendor's API bridge or data platform posts what a robot is doing
// and what it found, in one common shape (SETUP §8f). Findings become work like any robot's.
// POST /api/fm/robots   Authorization: Bearer <ROBOT_INGEST_TOKEN>
//   { "robot": "Patrol-1" | "<vendor id>", "source": "…", "status"?: "on_mission", "battery"?: 64, "zone"?: "Laydown (contractors)",
//     "findings"?: [{ "asset"?: "PL-01", "sensor": "sonar", "label": "Free span 13.1 m at KP 3.2", "value": 13.1, "unit": "m", "limit": 12, "severity": "high", "at"?: ISO, "image"?: "…" }] }
//   "images"?: [{ "base64": "…", "mime": "image/jpeg", "asset"?: "PL-01", "zone"?: "Airfield", "purpose"?: "inspection" | "security", "note"?: "…" }]
//     up to 4 per report, 4 MB each: the AI vision model reads them into findings and security alerts (lib/robots/vision.ts)
//   or { "reports": [ …up to 50 of those… ] }
// The machines' own formats, read into that shape (lib/robots/protocols):
//   { "protocol": "vda5050", "robot": "FOD-1", "state": {…VDA 5050 state…} }        from the fleet bridge
//   { "protocol": "dji", "robot": "Drone-A1", "method": "flighttask_progress" | "osd", "data": {…} }   from the fleet bridge
//   POST /api/fm/robots?protocol=orbit     an Orbit webhook as Orbit sends it
//   POST /api/fm/robots?protocol=security  a security robot's alarm (robot, type, message, zone, videoUrl)
// The fleet bridge also collects its commands and acknowledges them:
//   GET  /api/fm/robots?outbox=1[&protocol=vda5050|dji]   -> { commands: [{ commandId, robotId, missionId, protocol, messages: [{ topic, payload }] }] }
//   POST /api/fm/robots { "acks": [{ "commandId": "…", "ok": true, "note": "…" }] }
// Token: ROBOT_INGEST_TOKEN (fleets, webhooks) or FLEET_BRIDGE_TOKEN (the bridge).
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Either token lets a caller in; without one set, the endpoint is off. */
function gate(req: Request): NextResponse | null {
  if (!HAS_OPERATIONS) return NextResponse.json({ error: "Facility operations are not part of this edition." }, { status: 404 });
  const tokens = [process.env.ROBOT_INGEST_TOKEN ?? "", process.env.FLEET_BRIDGE_TOKEN ?? ""].filter((t) => t.length >= 16);
  if (!tokens.length) return NextResponse.json({ error: "Robot reports are not switched on: set ROBOT_INGEST_TOKEN or FLEET_BRIDGE_TOKEN (16+ characters)." }, { status: 503 });
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return tokens.some((t) => same(got, t)) ? null : NextResponse.json({ error: "Wrong or missing token." }, { status: 401 });
}

export async function GET(req: Request) {
  const no = gate(req); if (no) return no;
  const q = new URL(req.url).searchParams;
  if (!q.get("outbox")) return NextResponse.json({ error: "GET ?outbox=1 lists the commands waiting for the fleet bridge." }, { status: 400 });
  return NextResponse.json({ commands: outbox((await getRepo()).db, q.get("protocol") ?? undefined) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const no = gate(req); if (no) return no;
  let body: { reports?: RobotReport[]; acks?: { commandId: string; ok: boolean; note?: string }[]; protocol?: string } & Partial<RobotReport>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Send JSON." }, { status: 400 }); }
  const repo = await getRepo();
  if (Array.isArray(body.acks)) { const out = ack(repo.db, body.acks); await repo.save(); await publishAfter(repo); return NextResponse.json({ results: out }); }
  const protocol = String(new URL(req.url).searchParams.get("protocol") ?? body.protocol ?? "");
  let raw: RobotReport[];
  if (protocol) {
    // each machine's adapter converts its own format into the common report (lib/robots/adapter.ts, parse())
    const r = parserFor(protocol)?.(body as Record<string, unknown>) ?? null;
    if (!r) return NextResponse.json({ error: `Not a ${protocol} message this endpoint can read (protocols: vda5050, dji, orbit, security — see the comment at the top of app/api/fm/robots/route.ts).` }, { status: 400 });
    raw = [r];
  } else raw = Array.isArray(body.reports) ? body.reports : [body as RobotReport];
  const reports = raw.slice(0, 50) as (RobotReport & { images?: DroneImage[] })[];
  const results: { ok: boolean; message?: string; error?: string; images?: string[] }[] = [];
  for (const report of reports) {
    try {
      // pictures first: the AI reads them into findings and alerts, added to what the fleet reported itself
      const imgs = (Array.isArray(report?.images) ? report.images : []).slice(0, 4).filter((x) => x && typeof x.base64 === "string" && /^image\/(jpeg|png|webp|gif)$/.test(String(x.mime)) && x.base64.length * 0.75 <= MAX_IMAGE_BYTES);
      let notes: string[] = [];
      if (imgs.length) {
        const d = fmToday(repo.db), r = d.robots.find((x) => x.id === report.robot || x.externalId === report.robot || x.name.toLowerCase() === String(report.robot ?? "").toLowerCase());
        if (!r) throw new Error(`No robot ${report.robot} in the fleet.`);
        const f = d.facilities.find((x) => x.id === r.facilityId)!;
        const seen = await analyseImages(serverLlm(), { facility: f.name, sector: f.sector, robot: `${r.name} (${r.vendor})`, zones: d.zones.filter((z) => z.facilityId === f.id).map((z) => z.name) }, imgs);
        report.findings = [...(report.findings ?? []), ...seen.findings];
        report.alerts = [...(report.alerts ?? []), ...seen.alerts];
        notes = [`${imgs.length} image${imgs.length > 1 ? "s" : ""} read: ${seen.findings.length} finding${seen.findings.length === 1 ? "" : "s"}, ${seen.alerts.length} alert${seen.alerts.length === 1 ? "" : "s"}`, ...seen.errors];
      }
      const { images: _drop, ...plain } = report; void _drop;
      results.push({ ok: true, message: act(repo.db, { action: "robot_report", report: plain }, String(report?.source ?? "Robot fleet").slice(0, 60), "web", null).message, ...(notes.length ? { images: notes } : {}) });
    } catch (e) { results.push({ ok: false, error: (e as Error).message }); }
  }
  if (results.some((r) => r.ok)) { await repo.save(); await publishAfter(repo); }
  return NextResponse.json({ results }, { status: results.every((r) => r.ok) ? 200 : results.some((r) => r.ok) ? 207 : 400 });
}
