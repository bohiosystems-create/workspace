import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getRepo } from "@/lib/store";
import { act } from "@/lib/fm/api";
import { HAS_OPERATIONS } from "@/lib/edition";
import type { RobotReport } from "@/lib/fm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports from real robot fleets, whoever made them: a vendor's API bridge or data platform posts what a robot is doing
// and what it found, in one common shape (SETUP §8f). Findings become work like any robot's.
// POST /api/fm/robots   Authorization: Bearer <ROBOT_INGEST_TOKEN>
//   { "robot": "Patrol-1" | "<vendor id>", "source": "…", "status"?: "on_mission", "battery"?: 64, "zone"?: "Laydown (contractors)",
//     "findings"?: [{ "asset"?: "PL-01", "sensor": "sonar", "label": "Free span 13.1 m at KP 3.2", "value": 13.1, "unit": "m", "limit": 12, "severity": "high", "at"?: ISO, "image"?: "…" }] }
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
  const reports = (Array.isArray(body.reports) ? body.reports : [body as RobotReport]).slice(0, 50);
  const repo = await getRepo();
  const results = reports.map((report) => { try { return { ok: true, message: act(repo.db, { action: "robot_report", report }, String(report?.source ?? "Robot fleet").slice(0, 60), "web", null).message }; } catch (e) { return { ok: false, error: (e as Error).message }; } });
  if (results.some((r) => r.ok)) await repo.save();
  return NextResponse.json({ results }, { status: results.every((r) => r.ok) ? 200 : results.some((r) => r.ok) ? 207 : 400 });
}
