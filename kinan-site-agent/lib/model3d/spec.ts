/**
 * ProjectModelSpec: the contract between project documents and the 3D engine. An AI model (Claude, OpenAI, Gemini)
 * or the offline parser reads the documents and fills this in; `normalizeSpec` makes any result safe to render;
 * `specAt` gives each building's 4D state (floors cast, clad, fitted out) on any date.
 *
 * Coordinates are metres on the site grid: x = east from the site's west edge, z = south from its north edge.
 */

export type Use = "residential" | "office" | "hotel" | "retail" | "townhouse" | "amenity" | "parking" | "school" | "mosque" | "utility";
export type Phase = "substructure" | "structure" | "facade" | "fitout" | "handover";

export interface SpecBuilding {
  id: string; name: string; use: Use;
  /** footprint: west edge x, north edge z, width (east–west) w, depth (north–south) d, metres */
  x: number; z: number; w: number; d: number;
  floors: number; storeyHeight: number; basements?: number;
  /** where this came from, e.g. "KB-AR-SCH-001 Area Schedule.csv row T1" */
  source?: string; confidence?: "high" | "medium" | "low";
}
export interface SpecActivity { id?: string; building: string; phase: Phase; name?: string; start: string; finish: string; source?: string }
export interface ProjectModelSpec {
  name: string; location?: string; client?: string;
  site: { width: number; depth: number };
  roads: { name: string; points: [number, number][]; width: number }[];
  zones: { name: string; kind: "laydown" | "compound" | "parking" | "landscape" | "other"; x: number; z: number; w: number; d: number }[];
  gates: { name: string; x: number; z: number }[];
  cranes: { id: string; x: number; z: number; radius: number; building?: string }[];
  buildings: SpecBuilding[];
  schedule: { start: string; finish: string; dataDate: string; activities: SpecActivity[] };
  assumptions: string[];
  sources: { file: string; used: string }[];
}

/** JSON Schema given to the AI models (tool input / response format). */
export const SPEC_SCHEMA = {
  type: "object",
  required: ["name", "site", "buildings", "schedule"],
  properties: {
    name: { type: "string", description: "Project name" },
    location: { type: "string" }, client: { type: "string" },
    site: { type: "object", required: ["width", "depth"], properties: { width: { type: "number", description: "east–west extent, m" }, depth: { type: "number", description: "north–south extent, m" } } },
    roads: { type: "array", items: { type: "object", required: ["name", "points", "width"], properties: { name: { type: "string" }, width: { type: "number" }, points: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, description: "centreline [x,z] in site metres" } } } },
    zones: { type: "array", items: { type: "object", required: ["name", "kind", "x", "z", "w", "d"], properties: { name: { type: "string" }, kind: { type: "string", enum: ["laydown", "compound", "parking", "landscape", "other"] }, x: { type: "number" }, z: { type: "number" }, w: { type: "number" }, d: { type: "number" } } } },
    gates: { type: "array", items: { type: "object", required: ["name", "x", "z"], properties: { name: { type: "string" }, x: { type: "number" }, z: { type: "number" } } } },
    cranes: { type: "array", items: { type: "object", required: ["id", "x", "z", "radius"], properties: { id: { type: "string" }, x: { type: "number" }, z: { type: "number" }, radius: { type: "number" }, building: { type: "string" } } } },
    buildings: { type: "array", items: { type: "object", required: ["id", "name", "use", "x", "z", "w", "d", "floors", "storeyHeight"], properties: {
      id: { type: "string" }, name: { type: "string" },
      use: { type: "string", enum: ["residential", "office", "hotel", "retail", "townhouse", "amenity", "parking", "school", "mosque", "utility"] },
      x: { type: "number", description: "west edge, m east of the site's west boundary" }, z: { type: "number", description: "north edge, m south of the site's north boundary" },
      w: { type: "number", description: "east–west width, m" }, d: { type: "number", description: "north–south depth, m" },
      floors: { type: "integer" }, storeyHeight: { type: "number" }, basements: { type: "integer" },
      source: { type: "string", description: "document and row/section used" }, confidence: { type: "string", enum: ["high", "medium", "low"] } } } },
    schedule: { type: "object", required: ["start", "finish", "dataDate", "activities"], properties: {
      start: { type: "string", description: "YYYY-MM-DD" }, finish: { type: "string" }, dataDate: { type: "string" },
      activities: { type: "array", items: { type: "object", required: ["building", "phase", "start", "finish"], properties: {
        id: { type: "string" }, building: { type: "string", description: "building id" }, name: { type: "string" },
        phase: { type: "string", enum: ["substructure", "structure", "facade", "fitout", "handover"] }, start: { type: "string" }, finish: { type: "string" }, source: { type: "string" } } } } } },
    assumptions: { type: "array", items: { type: "string" }, description: "anything inferred rather than read from a document" },
    sources: { type: "array", items: { type: "object", required: ["file", "used"], properties: { file: { type: "string" }, used: { type: "string" } } } },
  },
} as const;

const USES: Use[] = ["residential", "office", "hotel", "retail", "townhouse", "amenity", "parking", "school", "mosque", "utility"];
const PHASES: Phase[] = ["substructure", "structure", "facade", "fitout", "handover"];
const DEFAULT_STOREY: Record<Use, number> = { residential: 3.4, office: 4, hotel: 3.5, retail: 5.5, townhouse: 3.3, amenity: 4.5, parking: 3.1, school: 4, mosque: 6, utility: 4.5 };
const num = (v: unknown, d: number) => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? n : d; };
const iso = (v: unknown) => { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : ""; };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Make any extracted spec safe to render: types, ranges, defaults, unique ids, buildings inside the site. */
export function normalizeSpec(raw: unknown): { spec: ProjectModelSpec; warnings: string[] } {
  const w: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const site = { width: clamp(num(r.site?.width, 300), 40, 3000), depth: clamp(num(r.site?.depth, 200), 40, 3000) };
  const ids = new Set<string>();
  const buildings: SpecBuilding[] = (Array.isArray(r.buildings) ? r.buildings : []).map((b: any, i: number) => {
    const use: Use = USES.includes(b?.use) ? b.use : "residential";
    let id = String(b?.id ?? `B${i + 1}`).trim().slice(0, 24) || `B${i + 1}`;
    while (ids.has(id)) id += "'";
    ids.add(id);
    const bw = clamp(num(b?.w, 30), 4, site.width), bd = clamp(num(b?.d, 30), 4, site.depth);
    const x = clamp(num(b?.x, 10), 0, site.width - bw), z = clamp(num(b?.z, 10), 0, site.depth - bd);
    if (x !== num(b?.x, x) || z !== num(b?.z, z)) w.push(`${id}: moved inside the site boundary`);
    return { id, name: String(b?.name ?? id).slice(0, 60), use, x, z, w: bw, d: bd,
      floors: Math.round(clamp(num(b?.floors, 4), 1, 120)), storeyHeight: clamp(num(b?.storeyHeight, DEFAULT_STOREY[use]), 2.6, 12),
      basements: Math.round(clamp(num(b?.basements, 0), 0, 8)), source: b?.source ? String(b.source).slice(0, 160) : undefined,
      confidence: ["high", "medium", "low"].includes(b?.confidence) ? b.confidence : undefined };
  });
  if (!buildings.length) w.push("No buildings found in the documents");
  const byId = new Set(buildings.map((b) => b.id));
  const findB = (ref: string) => (byId.has(ref) ? ref : buildings.find((b) => b.name.toLowerCase() === ref.toLowerCase() || ref.toLowerCase().includes(b.id.toLowerCase()))?.id);
  const acts: SpecActivity[] = [];
  for (const a of Array.isArray(r.schedule?.activities) ? r.schedule.activities : []) {
    const b = findB(String(a?.building ?? "")); const s = iso(a?.start), f = iso(a?.finish);
    if (!b || !s || !f || !PHASES.includes(a?.phase)) continue;
    acts.push({ id: a?.id ? String(a.id) : undefined, building: b, phase: a.phase, name: a?.name ? String(a.name).slice(0, 120) : undefined, start: s <= f ? s : f, finish: s <= f ? f : s, source: a?.source ? String(a.source) : undefined });
  }
  // buildings without any activity get an assumed programme so they still appear in 4D
  const all = acts.flatMap((a) => [a.start, a.finish]).sort();
  let start = iso(r.schedule?.start) || all[0] || new Date().toISOString().slice(0, 10);
  let finish = iso(r.schedule?.finish) || all[all.length - 1] || addDays(start, 900);
  if (finish <= start) finish = addDays(start, 900);
  for (const b of buildings) if (!acts.some((a) => a.building === b.id && a.phase === "structure")) {
    const s0 = addDays(start, 60), sf = addDays(s0, Math.max(60, b.floors * 9));
    acts.push({ building: b.id, phase: "structure", start: s0, finish: sf, name: "Assumed structure" }, { building: b.id, phase: "facade", start: addDays(sf, -Math.round(b.floors * 4)), finish: addDays(sf, 60) }, { building: b.id, phase: "fitout", start: addDays(sf, 30), finish: addDays(sf, 200) });
    w.push(`${b.id}: no structure activity in the programme — a programme was assumed`);
  }
  const dataDate = iso(r.schedule?.dataDate) || new Date().toISOString().slice(0, 10);
  start = [start, ...acts.map((a) => a.start)].sort()[0]; finish = [finish, ...acts.map((a) => a.finish)].sort().slice(-1)[0];
  const pts = (p: any): [number, number][] => (Array.isArray(p) ? p : []).map((q: any) => [clamp(num(q?.[0], 0), -50, site.width + 50), clamp(num(q?.[1], 0), -50, site.depth + 50)] as [number, number]).filter((_: unknown, i: number) => i < 40);
  const roads = (Array.isArray(r.roads) ? r.roads : []).map((x: any) => ({ name: String(x?.name ?? "Road"), width: clamp(num(x?.width, 8), 3, 40), points: pts(x?.points) })).filter((x: { points: unknown[] }) => x.points.length >= 2);
  const zones = (Array.isArray(r.zones) ? r.zones : []).map((x: any) => ({ name: String(x?.name ?? "Zone"), kind: ["laydown", "compound", "parking", "landscape", "other"].includes(x?.kind) ? x.kind : "other", x: num(x?.x, 0), z: num(x?.z, 0), w: clamp(num(x?.w, 20), 2, site.width), d: clamp(num(x?.d, 20), 2, site.depth) }));
  const gates = (Array.isArray(r.gates) ? r.gates : []).map((x: any) => ({ name: String(x?.name ?? "Gate"), x: num(x?.x, 0), z: num(x?.z, 0) }));
  let cranes = (Array.isArray(r.cranes) ? r.cranes : []).map((x: any, i: number) => ({ id: String(x?.id ?? `TC${i + 1}`), x: num(x?.x, 0), z: num(x?.z, 0), radius: clamp(num(x?.radius, 50), 15, 90), building: x?.building ? findB(String(x.building)) : undefined }));
  if (!cranes.length) {
    cranes = buildings.filter((b) => b.floors >= 8).map((b, i) => ({ id: `TC${i + 1}`, x: b.x + b.w + 6, z: b.z + b.d / 2, radius: Math.max(35, Math.min(70, Math.max(b.w, b.d) * 1.2)), building: b.id }));
    if (cranes.length) w.push("Tower cranes placed automatically next to buildings of 8+ floors");
  }
  return {
    spec: {
      name: String(r.name ?? "Generated project").slice(0, 80), location: r.location ? String(r.location) : undefined, client: r.client ? String(r.client) : undefined,
      site, roads, zones, gates, cranes, buildings, schedule: { start, finish, dataDate, activities: acts },
      assumptions: (Array.isArray(r.assumptions) ? r.assumptions : []).map(String).slice(0, 30),
      sources: (Array.isArray(r.sources) ? r.sources : []).map((s: any) => ({ file: String(s?.file ?? ""), used: String(s?.used ?? "") })).slice(0, 30),
    },
    warnings: w,
  };
}
export function addDays(isoDate: string, n: number) { const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ------------------------------------------------------------------ 4D
const DAY = 86400000;
const frac = (a: SpecActivity | undefined, t: number) => { if (!a) return 0; const s = Date.parse(a.start), f = Date.parse(a.finish) + DAY; return t <= s ? 0 : t >= f ? 1 : (t - s) / (f - s); };
export interface BuildingState { built: number; active: number; glazed: number; fitted: number; topped: boolean; started: boolean; handedOver: boolean }
/** State of every building on a date: structure rises linearly through its structure activity, cladding and fit-out follow. */
export function specAt(spec: ProjectModelSpec, date: string): Record<string, BuildingState> {
  const t = Date.parse(date) + DAY / 2;
  const out: Record<string, BuildingState> = {};
  for (const b of spec.buildings) {
    const of = (p: Phase) => spec.schedule.activities.filter((a) => a.building === b.id && a.phase === p);
    const span = (p: Phase) => { const xs = of(p); if (!xs.length) return undefined; return { building: b.id, phase: p, start: xs.map((a) => a.start).sort()[0], finish: xs.map((a) => a.finish).sort().slice(-1)[0] } as SpecActivity; };
    const st = frac(span("structure"), t) * b.floors, built = Math.floor(st + 1e-9);
    out[b.id] = {
      built, active: built < b.floors ? st - built : 0,
      glazed: Math.min(built, frac(span("facade"), t) * b.floors), fitted: Math.floor(frac(span("fitout"), t) * b.floors),
      topped: built >= b.floors, started: frac(span("substructure"), t) > 0 || st > 0, handedOver: frac(span("handover"), t) >= 1,
    };
  }
  return out;
}
