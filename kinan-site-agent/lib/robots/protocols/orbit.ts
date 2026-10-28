// Boston Dynamics Spot through Orbit, the fleet software Spot sites run on-premises. Spot's routes (Autowalk missions)
// are recorded on site in Orbit; the core does not draw them. A mission is dispatched as "run that recorded mission on
// that robot now", by Orbit's REST API, straight from the core (no message bus needed); Orbit's webhooks bring back
// what each run found. Configured in ORBIT (JSON): {"url": "https://orbit.site.local", "token": "…",
// "dispatchPath": "…", "missions": {"kgpp:utl": "<mission uuid>"}, "driver": "Bohio"}. The dispatch path and body
// differ between Orbit releases: take them from your Orbit's API reference (Settings → API) — nothing is sent until it
// is set. Webhook payloads are read leniently (robot, run status, anomalies) for the same reason. Not yet run against
// an Orbit instance.
import type { Mission, Robot } from "../types";
import type { RobotReport } from "../../fm/types";

export interface OrbitConfig { url: string; token?: string; dispatchPath?: string; missions?: Record<string, string>; driver?: string }
export function orbitConfig(env: Record<string, string | undefined> = process.env): OrbitConfig | null {
  try { const c = JSON.parse(env.ORBIT ?? "null") as OrbitConfig | null; return c && /^https?:\/\//.test(c.url ?? "") ? c : null; } catch { return null; }
}

/** The request that runs a recorded mission on a robot, or why it can't be sent. */
export function orbitDispatch(m: Mission, r: Robot, c: OrbitConfig): { url: string; init: RequestInit } | { error: string } {
  const w = m.waypoints[0], mission = (w?.assetId && c.missions?.[w.assetId]) || (w && c.missions?.[w.zone]);
  if (!c.dispatchPath) return { error: "ORBIT.dispatchPath is not set — take it from your Orbit's API reference" };
  if (!mission) return { error: `No recorded Orbit mission for ${w?.zone ?? "this route"} — record it in Orbit and add it to ORBIT.missions` };
  return { url: `${c.url.replace(/\/+$/, "")}${c.dispatchPath}`, init: { method: "POST", headers: { "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
    body: JSON.stringify({ robotNickname: r.externalId ?? r.name, missionUuid: mission, driverId: c.driver ?? "Bohio", deleteMission: false, forceAcquireEstop: false, skipInitialization: false, externalId: m.id }) } };
}

/** An Orbit webhook (a run finished, an anomaly found), read into the common report. */
export function orbitWebhookToReport(body: Record<string, unknown>): RobotReport | null {
  const b = body as { robot?: string; robotNickname?: string; type?: string; status?: string; data?: Record<string, unknown>; anomalies?: unknown[]; alerts?: unknown[] };
  const data = (b.data ?? {}) as { robotNickname?: string; status?: string; anomalies?: unknown[]; alerts?: unknown[] };
  const robot = b.robotNickname ?? b.robot ?? data.robotNickname;
  if (!robot) return null;
  const items = [...(b.anomalies ?? []), ...(b.alerts ?? []), ...(data.anomalies ?? []), ...(data.alerts ?? [])] as { title?: string; name?: string; description?: string; severity?: string | number; value?: number; unit?: string; asset?: string }[];
  const sev = (s: unknown): "info" | "low" | "medium" | "high" | "critical" => { const t = String(s ?? "").toLowerCase(); return /crit|4|5/.test(t) ? "critical" : /high|3/.test(t) ? "high" : /med|warn|2/.test(t) ? "medium" : /low|1/.test(t) ? "low" : "medium"; };
  return { robot, source: "Orbit", findings: items.filter((x) => x && (x.title || x.name || x.description)).slice(0, 20).map((x) => ({ sensor: "visual" as const, label: String(x.title ?? x.name ?? x.description).slice(0, 200), value: typeof x.value === "number" ? x.value : 1, unit: String(x.unit ?? ""), severity: sev(x.severity), ...(x.asset ? { asset: String(x.asset) } : {}) })) };
}
