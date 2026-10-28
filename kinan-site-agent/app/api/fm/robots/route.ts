import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getRepo } from "@/lib/store";
import { act } from "@/lib/fm/api";
import { HAS_OPERATIONS } from "@/lib/edition";
import type { RobotReport } from "@/lib/fm/types";
import { fmToday } from "@/lib/fm/engine";
import { analyseImages, MAX_IMAGE_BYTES, type DroneImage } from "@/lib/robots/vision";
import { serverLlm } from "@/lib/llmConfig";

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
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  if (!HAS_OPERATIONS) return NextResponse.json({ error: "Facility operations are not part of this edition." }, { status: 404 });
  const token = process.env.ROBOT_INGEST_TOKEN ?? "";
  if (token.length < 16) return NextResponse.json({ error: "Robot reports are not switched on: set ROBOT_INGEST_TOKEN (16+ characters)." }, { status: 503 });
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!same(got, token)) return NextResponse.json({ error: "Wrong or missing token." }, { status: 401 });
  let body: { reports?: RobotReport[] } & Partial<RobotReport>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Send JSON." }, { status: 400 }); }
  const reports = (Array.isArray(body.reports) ? body.reports : [body as RobotReport]).slice(0, 50) as (RobotReport & { images?: DroneImage[] })[];
  const repo = await getRepo();
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
  if (results.some((r) => r.ok)) await repo.save();
  return NextResponse.json({ results }, { status: results.every((r) => r.ok) ? 200 : results.some((r) => r.ok) ? 207 : 400 });
}
