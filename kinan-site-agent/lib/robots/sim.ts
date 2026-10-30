// The simulated fleet: where each robot is, its battery, how far each mission has gone and what it has found — worked
// out from the missions and the clock, so it needs no process running in the background (it works the same on a
// serverless host, in the standalone page and in tests). A robot reads the same equipment readings as the control
// room: what it "finds" is what is really out of range at the places on its route.
import type { Asset, FmData, Reading } from "../fm/types";
import type { Capability, Finding, Mission, Robot, Waypoint } from "./types";

const MIN = 60_000;
const RETURN_MIN = 10, CHARGE_PER_MIN = 1.2, DRAIN = 90; // % of the battery a full-endurance mission uses

/** The simulated clock: the data date with today's time of day (so a frozen demo date still runs through its day). */
export function simNow(date: string, now = Date.now()): number {
  const t = new Date(now);
  return Date.parse(`${date}T00:00:00Z`) + (t.getUTCHours() * 60 + t.getUTCMinutes()) * MIN + t.getUTCSeconds() * 1000;
}

const HEAT = new Set(["brg", "dt", "mtr", "temp", "exh", "oil", "wdg", "stack"]);
const SOUND = new Set(["vib", "sgas"]);
const GAS = new Set(["lel", "h2s"]);

/** How close a reading is to its limit: 1 = at the limit, above 1 = beyond it. */
export function nearLimit(r: Reading): number {
  if (r.high !== undefined && r.value !== 0) return r.high > 0 ? r.value / r.high : r.high / r.value;
  if (r.low !== undefined && r.value !== 0) return r.low > 0 ? r.low / r.value : r.value / r.low;
  return 0;
}
const severityOf = (x: number): Finding["severity"] | null => (x >= 1.3 ? "critical" : x >= 1 ? "high" : x >= 0.88 ? "medium" : x >= 0.8 ? "low" : null);

/** What a check of this kind reads at a waypoint. */
function readingsFor(d: FmData, wp: Waypoint, cap: Capability): { a: Asset; r: Reading }[] {
  const a = wp.assetId ? d.assets.find((x) => x.id === wp.assetId) : undefined;
  const zoneName = d.zones.find((z) => z.id === wp.zone)?.name;
  const mine = (keys: Set<string>) => (a ? a.readings.filter((r) => keys.has(r.key)).map((r) => ({ a, r })) : []);
  switch (cap) {
    case "thermal": return mine(HEAT);
    case "acoustic": return mine(SOUND);
    case "ut_thickness": case "mfl": case "eddy_current": return a ? a.readings.filter((r) => r.key === "wall").map((r) => ({ a, r })) : [];
    case "visual": return a && (a.class === "flare" || a.class === "ccr") ? a.readings.filter((r) => r.key === "pilot" || r.key === "lamps").map((r) => ({ a, r })) : [];
    case "sonar": return a ? a.readings.filter((r) => r.key === "span").map((r) => ({ a, r })) : [];
    case "gas": // the gas detectors in the area (the robot's own sensor reads what they read)
      return d.assets.filter((x) => x.class === "detector" && (x.id === a?.id || x.zone === zoneName)).flatMap((x) => x.readings.filter((r) => GAS.has(r.key)).map((r) => ({ a: x, r })));
    default: return [];
  }
}

/** A reading as it was at a moment: before a repair, the value it had then. */
export const readingAt = (r: Reading, at: number): Reading => (r.was && at < Date.parse(r.was.until) ? { ...r, value: r.was.value } : r);

function findingsAt(d: FmData, m: Mission, r: Robot, wp: Waypoint, i: number, at: number, seen: Set<string>): Finding[] {
  const out: Finding[] = [];
  for (const cap of wp.checks) {
    if (!r.capabilities.includes(cap)) continue;
    for (const { a, r: now } of readingsFor(d, wp, cap)) {
      const rd = readingAt(now, at);
      const sev = severityOf(nearLimit(rd));
      const key = `${a.id}:${rd.key}`;
      if (!sev || seen.has(key)) continue;
      seen.add(key);
      const limit = rd.high ?? rd.low;
      out.push({ id: `${m.id}:${i}:${rd.key}`, missionId: m.id, robotId: r.id, facilityId: m.facilityId, zone: wp.zone, assetId: a.id, at: new Date(at).toISOString(), sensor: cap,
        label: `${rd.name} ${rd.value}${rd.unit ? ` ${rd.unit}` : ""} at ${a.tag}${limit !== undefined ? ` (limit ${limit}${rd.unit ? ` ${rd.unit}` : ""})` : ""}`, value: rd.value, unit: rd.unit, limit, severity: sev,
        image: `${cap === "thermal" ? "thermal" : cap === "ut_thickness" ? "thickness map" : cap === "mfl" ? "metal-loss map" : cap === "eddy_current" ? "eddy-current scan" : cap === "sonar" ? "sonar scan" : "photo"} — ${a.tag}` });
    }
  }
  return out;
}

const centre = (d: FmData, zoneId: string) => { const z = d.zones.find((x) => x.id === zoneId); return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: 0, y: 0 }; };

/** Brings robots and missions to the moment `now`: status, battery, position, progress and findings. */
export function simulate(d: FmData, now: number, real: Set<string> = new Set()) {
  const dayStart = Date.parse(`${d.date}T00:00:00Z`) - 3 * 60 * MIN; // local midnight (Riyadh)
  for (const r of d.robots) {
    if (real.has(r.id)) { if (r.estop) r.status = "estop"; continue; } // a connected robot: its reports say where it is
    const ms = d.missions.filter((m) => m.robotId === r.id).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    let battery = 100, free = dayStart, lastEnd = 0;
    const dock = centre(d, r.dock);
    Object.assign(r, { status: "docked", zone: r.dock, x: dock.x, y: dock.y, missionId: undefined });
    for (const m of ms) {
      const start = Date.parse(m.started ?? m.plannedStart);
      if (now < start) { if (m.status === "running") m.status = "planned"; continue; }
      // a robot a person pilots doesn't move without its pilot: the mission waits
      if (r.autonomy === "remote" && !m.pilotId && m.status === "planned") { m.note = "Waiting for a pilot"; continue; }
      if (m.status === "aborted" && (!m.ended || Date.parse(m.ended) <= start)) continue; // cancelled before it began
      const dur = m.durationMin * MIN, end = start + dur;
      const stop = m.status === "aborted" || m.status === "paused" || m.status === "failed" ? Math.min(end, Date.parse(m.ended ?? new Date(now).toISOString())) : end;
      const cut = Math.min(now, stop);
      battery = Math.min(100, battery + Math.max(0, (start - free) / MIN) * CHARGE_PER_MIN);
      const frac = Math.max(0, Math.min(1, (cut - start) / dur));
      const n = m.waypoints.length;
      // a route reads each place half-way through its leg; a watch (one place, the whole time) reads from arrival
      const arrive = (i: number) => (m.kind === "gas_watch" ? Math.min(1, 3 / m.durationMin) : (i + 0.5) / n);
      const reached = m.waypoints.filter((_, i) => frac >= arrive(i)).length;
      const seen = new Set<string>();
      m.findings = m.waypoints.slice(0, reached).flatMap((wp, i) => findingsAt(d, m, r, wp, i, start + arrive(i) * dur, seen));
      m.progress = Math.round(frac * 100) / 100; m.at = reached - 1;
      battery = Math.max(0, battery - (DRAIN * (cut - start)) / MIN / r.enduranceMin);
      free = cut + RETURN_MIN * MIN; lastEnd = cut;
      if (m.status === "planned" || m.status === "running") {
        if (cut >= end) { m.status = "done"; m.ended = new Date(end).toISOString(); m.started ??= m.plannedStart; }
        else {
          m.status = "running"; m.started ??= m.plannedStart;
          const k = Math.min(n - 1, Math.floor(frac * n)), a = centre(d, m.waypoints[k].zone), b = centre(d, m.waypoints[Math.min(n - 1, k + 1)].zone), t = frac * n - k;
          Object.assign(r, { status: "on_mission", missionId: m.id, zone: m.waypoints[k].zone, x: a.x + (b.x - a.x) * t * 0.5, y: a.y + (b.y - a.y) * t * 0.5 });
        }
      }
    }
    if (r.status !== "on_mission") {
      const since = (now - lastEnd) / MIN;
      if (lastEnd && since < RETURN_MIN) r.status = "returning";
      else { battery = Math.min(100, battery + Math.max(0, (now - free) / MIN) * CHARGE_PER_MIN); r.status = battery < 97 ? "charging" : "docked"; }
    }
    r.battery = Math.round(battery);
    if (r.estop) { r.status = "estop"; r.note = r.note ?? "Emergency stop — released by a person on site"; }
  }
  // a robot on a real fleet is where its last report put it (lib/fm/engine.ts applies the reports after this)
  // what people did with the findings
  for (const m of d.missions) for (const f of m.findings) { const a = d.findingAcks[f.id]; if (a) { f.acknowledged = true; if (a.woId) f.woId = a.woId; } }
}

/** Every finding today, newest first. */
export const findings = (d: FmData, facilityId?: string) => d.missions.filter((m) => !facilityId || m.facilityId === facilityId).flatMap((m) => m.findings).sort((a, b) => b.at.localeCompare(a.at));
