// What a drone or robot camera saw. Fleets that send pictures rather than readings (a drone's inspection photos, a
// thermal frame, a patrol camera's snapshot) post them with their report (app/api/fm/robots); the AI vision model reads
// each one for the facility and the purpose — inspection: damage, corrosion, leaks, hot spots, lamps out, debris;
// security: people, vehicles, drones, animals, a damaged fence — and what it finds becomes findings (raised as work,
// like any robot's) and security alerts (answered by the orchestrator). Nothing is invented: an image that shows
// nothing of note gives nothing. Needs an AI provider (ANTHROPIC_API_KEY and/or OPENAI_API_KEY).
import { routeAndRun, availableProviders } from "../core/llm/router";
import type { LlmConfig } from "../core/llm/types";
import type { RobotReport, SecurityAlert } from "../fm/types";

export interface DroneImage { base64: string; mime: string; asset?: string; zone?: string; purpose?: "inspection" | "security"; note?: string }
type Finding = NonNullable<RobotReport["findings"]>[number];
type Alert = { kind: SecurityAlert["kind"]; text: string; zone?: string };

const SENSORS = ["visual", "thermal", "intrusion", "fod"] as const, SEV = ["info", "low", "medium", "high", "critical"] as const, KINDS = ["fence", "person", "vehicle", "drone", "camera", "fod", "wildlife"] as const;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Read the images of one report: findings and alerts, each tied to the image's asset and area. */
export async function analyseImages(cfg: LlmConfig, place: { facility: string; sector: string; robot: string; zones: string[] }, images: DroneImage[]): Promise<{ findings: Finding[]; alerts: Alert[]; errors: string[] }> {
  const out = { findings: [] as Finding[], alerts: [] as Alert[], errors: [] as string[] };
  if (!availableProviders(cfg).length) { out.errors.push("Image analysis needs an AI provider (ANTHROPIC_API_KEY and/or OPENAI_API_KEY)."); return out; }
  for (const [i, img] of images.entries()) {
    try {
      const { out: o } = await routeAndRun(cfg, {
        system: "You read images from inspection and security robots and drones at industrial facilities and airports. Report only what is clearly visible; never guess readings you cannot see. Reply with JSON only.",
        history: [{ role: "user", content: `Facility: ${place.facility} (${place.sector}). Robot: ${place.robot}. Purpose: ${img.purpose ?? "inspection"}.${img.asset ? ` Asset in view: ${img.asset}.` : ""}${img.zone ? ` Area: ${img.zone}.` : ""}${img.note ? ` Note from the fleet: ${img.note}.` : ""}
Areas of the facility: ${place.zones.join(", ")}.
Return ONLY JSON: {"findings": [{"sensor": one of ${JSON.stringify(SENSORS)}, "label": "what is wrong and where, one line", "severity": one of ${JSON.stringify(SEV)}, "value": number or null (a temperature, a count, a size — only if readable), "unit": string}], "alerts": [{"kind": one of ${JSON.stringify(KINDS)}, "text": "what is seen, one line"}]}
Inspection: corrosion, cracks, leaks or stains, hot spots, missing or out lamps, damaged insulation, debris on runways or roads. Security: people or vehicles where they should not be, a drone, animals on an airfield, a damaged fence or door. Empty arrays when nothing is of note.` }],
        attachments: [{ mime: img.mime, base64: img.base64, name: `image-${i + 1}` }],
        tools: [], exec: async () => "", maxTurns: 1, maxTokens: 900,
      }, { tier: "main", reason: "robot image analysis" });
      const raw = o.text, j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      for (const f of Array.isArray(j.findings) ? j.findings.slice(0, 10) : []) {
        if (!SENSORS.includes(f?.sensor) || !SEV.includes(f?.severity) || !String(f?.label ?? "").trim()) continue;
        out.findings.push({ sensor: f.sensor, label: String(f.label).slice(0, 200), severity: f.severity, value: typeof f.value === "number" && Number.isFinite(f.value) ? f.value : 1, unit: String(f.unit ?? "").slice(0, 20), ...(img.asset ? { asset: img.asset } : {}), image: `AI-read image ${i + 1} from ${place.robot}` });
      }
      for (const a of Array.isArray(j.alerts) ? j.alerts.slice(0, 5) : []) if (KINDS.includes(a?.kind) && String(a?.text ?? "").trim()) out.alerts.push({ kind: a.kind, text: String(a.text).slice(0, 200), ...(img.zone ? { zone: img.zone } : {}) });
    } catch (e) { out.errors.push(`Image ${i + 1}: ${(e as Error).message.slice(0, 160)}`); }
  }
  return out;
}
