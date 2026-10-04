import type { Activity } from "../types";

/**
 * 4D state of the site: what stands on each footprint on a given date, derived only from the schedule.
 * Used by the 3D model and its timeline. Pure and cheap: called on every frame while the timeline plays.
 */

const DAY = 86400000;
const t = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
/** 0 before the start, 1 at/after the finish, linear in between. */
export function frac(a: Activity | undefined, date: number) {
  if (!a) return 0;
  const s = t(a.start), f = t(a.finish) + DAY;
  return date <= s ? 0 : date >= f ? 1 : (date - s) / (f - s);
}

export interface StructState {
  /** Fully cast levels above ground. */
  built: number;
  /** Progress (0..1) of the level being cast now (0 when none). */
  active: number;
  /** Floors with curtain wall / cladding installed, from the bottom (fractional while a zone is going in). */
  glazed: number;
  /** Floors fitted out (lit at night). */
  fitted: number;
  /** Structure complete (roof plant appears). */
  topped: boolean;
}
export interface VillaState { built: number; active: number; enclosed: boolean; finished: boolean; handedOver: boolean }
export interface CraneState { up: boolean; erect: number; /** height of the top of the mast in floors of the building it serves */ floors: number }
export interface SiteState {
  date: string;
  /** Before notice to proceed: an empty plot. */
  mobilised: number;
  excavation: number;
  basementLevels: number;
  groundSlab: boolean;
  struct: Record<string, StructState>;
  villas: Record<string, VillaState>;
  cranes: Record<string, CraneState>;
  hoists: boolean;
  temp: { offices: number; camp1: number; camp2: number; batching: number };
  services: Record<string, number>;
  roads: number;
  landscape: number;
}

export interface Index { byId: Map<string, Activity>; levels: Map<string, Activity[]>; facade: Map<string, Activity[]>; fitout: Map<string, Activity[]> }

/** Pre-index the schedule once (activities by id, per-level structure / façade / fit-out lists per building). */
export function indexSchedule(schedule: Activity[]): Index {
  const byId = new Map(schedule.map((a) => [a.id, a]));
  const levels = new Map<string, Activity[]>(), facade = new Map<string, Activity[]>(), fitout = new Map<string, Activity[]>();
  const add = (m: Map<string, Activity[]>, k: string, a: Activity) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); };
  for (const a of schedule) {
    const lv = /^(.+)-l(\d+)$/.exec(a.locationId);
    if (/-STR-L\d+$/.test(a.id) && lv) add(levels, lv[1], a);
    if (/-FAC-Z\d+$/.test(a.id) && lv) add(facade, lv[1], a);
    if (/-FIN-L\d+$/.test(a.id) && lv) add(fitout, lv[1], a);
  }
  for (const m of [levels, facade, fitout]) for (const xs of m.values()) xs.sort((x, y) => x.finish.localeCompare(y.finish));
  return { byId, levels, facade, fitout };
}

const TOWERS: Record<string, { floors: number; code: string }> = { "tower-a": { floors: 42, code: "TA" }, "tower-b": { floors: 36, code: "TB" }, "hotel-c": { floors: 18, code: "HC" } };
const CRANES: Record<string, { erect: string; tower: string; code: string }> = { tc1: { erect: "EN-040", tower: "tower-a", code: "TA" }, tc2: { erect: "EN-040", tower: "tower-b", code: "TB" }, tc3: { erect: "EN-041", tower: "hotel-c", code: "HC" } };

export function siteAt(ix: Index, dateIso: string): SiteState {
  const d = t(dateIso) + DAY / 2;
  const A = (id: string) => ix.byId.get(id);
  const F = (id: string) => frac(A(id), d);
  const struct: Record<string, StructState> = {};

  // Towers and the club: per-level structure, façade zones of 4 levels, per-level fit-out.
  for (const id of [...Object.keys(TOWERS), "club-e"]) {
    const lv = ix.levels.get(id) ?? [];
    const built = lv.filter((a) => frac(a, d) >= 1).length;
    const next = lv.find((a) => frac(a, d) < 1);
    const active = next ? frac(next, d) : 0;
    let glazed = 0;
    for (const z of ix.facade.get(id) ?? []) {
      const m = /\(L(\d+)–L(\d+)\)/.exec(z.name);
      const n = m ? Number(m[2]) - Number(m[1]) + 1 : 4;
      glazed += n * frac(z, d);
    }
    let fitted = (ix.fitout.get(id) ?? []).filter((a) => frac(a, d) >= 1).length;
    if (id === "club-e") { const f = F("CE-FIN"); glazed = f * 3; fitted = f >= 1 ? 3 : 0; }
    const floors = id === "club-e" ? 3 : TOWERS[id].floors;
    struct[id] = { built, active, glazed: Math.min(glazed, built), fitted, topped: built >= floors };
  }
  // Podium: one structure activity for four levels, per-level finishes, cladding with the atrium glazing.
  {
    const p = F("PD-STR") * 4, built = Math.floor(p + 1e-9);
    const fin = [1, 2, 3, 4].filter((n) => F(`PD-FIN-L${n}`) >= 1).length;
    struct.podium = { built, active: built < 4 ? p - built : 0, glazed: Math.min(built, 4 * Math.max(F("PD-ATR-GLZ"), F("PD-FIN-L1") > 0 ? 0.5 + F("PD-FIN-L4") / 2 : 0)), fitted: fin, topped: built >= 4 };
  }
  const villas: Record<string, VillaState> = {};
  for (let v = 1; v <= 12; v++) {
    const s = F(`VD${v}-STR`) * 2, built = Math.floor(s + 1e-9);
    villas[`villa-${v}`] = { built, active: built < 2 ? s - built : 0, enclosed: F(`VD${v}-MEP`) >= 1, finished: F(`VD${v}-FIN`) >= 1, handedOver: F(`VD${v}-HO`) >= 1 };
  }
  const cranes: Record<string, CraneState> = {};
  for (const [id, c] of Object.entries(CRANES)) {
    const erect = F(c.erect), topped = A(`${c.code}-M10`);
    const gone = topped ? d > t(topped.finish) + 45 * DAY : false;
    const s = struct[c.tower];
    cranes[id] = { up: erect > 0 && !gone, erect, floors: Math.min(TOWERS[c.tower].floors + 3, (s?.built ?? 0) + 4) };
  }
  return {
    date: dateIso.slice(0, 10),
    mobilised: F("EN-010"),
    excavation: F("SB-010"),
    basementLevels: ["SB-1B3", "SB-1B2", "SB-1B1"].filter((id) => F(id) >= 1).length,
    groundSlab: F("SB-200") >= 1,
    struct, villas, cranes,
    hoists: F("EN-050") >= 1,
    temp: { offices: F("EN-010"), camp1: F("EN-020"), camp2: F("EN-021"), batching: F("EN-030") },
    services: { substation: F("IN-030"), stp: F("IN-040"), "water-tank": F("IN-050"), mosque: F("IN-060") },
    roads: F("IN-071"),
    landscape: F("IN-080"),
  };
}

/** Stable key per footprint so the scene only rebuilds what changed. */
export function structKey(s: StructState) { return `${s.built}|${Math.round(s.active * 4)}|${Math.round(s.glazed * 2)}|${s.fitted}|${s.topped}`; }
