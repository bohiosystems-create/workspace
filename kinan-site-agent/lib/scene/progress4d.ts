import type { Activity } from "../types";

/**
 * 4D state of the site: what stands on each footprint on a given date, derived only from the schedule.
 * Used by the 3D model and its timeline. Pure and cheap: called on every frame while the timeline plays.
 *
 * Every number here is a fraction (0..1) of a real activity in the programme, so the model shows the sequence a site
 * actually follows: shoring → excavation → piles → raft → basement slabs → ground slab; then per level columns and
 * core walls → falsework and formwork → rebar and PT → pour → cure and strip, with the core jump-form two levels ahead;
 * unitised façade panels going in zone by zone; MEP first fix, blockwork and fit-out floor by floor; lifts, roof plant,
 * testing and the certificate; cranes erected, climbing with the frame and dismantled after topping out.
 */

const DAY = 86400000;
const t = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
/** 0 before the start, 1 at/after the finish, linear in between. */
export function frac(a: Activity | undefined, date: number) {
  if (!a) return 0;
  const s = t(a.start), f = t(a.finish) + DAY;
  return date <= s ? 0 : date >= f ? 1 : (date - s) / (f - s);
}

/** Sub-phase of the level being cast, from its progress: what the deck looks like on a given day of the cycle. */
export type Phase = "none" | "columns" | "formwork" | "rebar" | "pour" | "cure";
export function phaseOf(active: number): Phase {
  if (active <= 0) return "none";
  if (active < 0.3) return "columns";
  if (active < 0.55) return "formwork";
  if (active < 0.8) return "rebar";
  if (active < 0.92) return "pour";
  return "cure";
}
/** Progress inside the current sub-phase (0..1). */
export function phaseT(active: number) {
  const b = active < 0.3 ? [0, 0.3] : active < 0.55 ? [0.3, 0.55] : active < 0.8 ? [0.55, 0.8] : active < 0.92 ? [0.8, 0.92] : [0.92, 1];
  return Math.max(0, Math.min(1, (active - b[0]) / (b[1] - b[0])));
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
  // ---- the finer sequence
  /** Bored piles done (0..1) and the raft poured (0..1) — before the first level. */
  piles: number; raft: number;
  /** Core walls reached (in levels, fractional): the jump-form runs ~2 levels ahead of the slabs. */
  core: number;
  /** Levels with PT stressed; levels with MEP first fix under way / done; levels with blockwork done. */
  pt: number; mepActive: number; mep: number; blk: number;
  /** The façade zone going in now: its first level (1-based) and its progress, or null. */
  facadeZone: { from: number; to: number; f: number } | null;
  /** Roof plant/BMU (0..1), lifts (0..1), testing & commissioning (0..1), completion certificate. */
  roof: number; lifts: number; tc: number; cert: boolean;
}
export interface VillaState { built: number; active: number; enclosed: boolean; finished: boolean; handedOver: boolean; mep: number; fin: number; snag: number }
export interface CraneState { up: boolean; erect: number; /** height of the top of the mast in floors of the building it serves */ floors: number; /** dismantling progress after topping out (0 = standing, 1 = gone) */ down: number }
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
  // ---- the finer sequence
  /** Secant-pile shoring wall round the pit (0..1), waterproofing of the pit (0..1), basement ramp fit-out (0..1). */
  shoring: number; waterproof: number; ramp: number;
  /** Basement slab under way (fractional level, e.g. 1.4 = B2 slab 40 % cast). */
  basementActive: number;
  /** Road sub-base / base course (0..1) before the asphalt in `roads`. */
  roadsBase: number;
  /** Utilities corridor trench (0..1), storm drainage (0..1). */
  utilities: number; storm: number;
  /** Podium atrium steel (0..1), escalators (0..1); club pool (0..1). */
  atriumSteel: number; escalators: number; pool: number;
  /** Hoists dismantled once the towers are fitted out. */
  hoistsDown: boolean;
  /** Hoarding down, plot opened up at completion. */
  handedOver: boolean;
  /** Activities in progress on the date and an estimate of the people on site. */
  activeCount: number; manpower: number;
  /** Planned % complete on the date (duration-weighted, all activities). */
  planned: number;
  /** Running totals: levels cast across the towers, concrete poured (m³, estimate), façade zones done. */
  levelsCast: number; concrete: number; facadeZones: number;
}

export interface Index { byId: Map<string, Activity>; levels: Map<string, Activity[]>; facade: Map<string, Activity[]>; fitout: Map<string, Activity[]>; pt: Map<string, Activity[]>; mep: Map<string, Activity[]>; blk: Map<string, Activity[]>; all: Activity[]; totalDays: number }

/** Pre-index the schedule once (activities by id, per-level structure / façade / fit-out lists per building). */
export function indexSchedule(schedule: Activity[]): Index {
  const byId = new Map(schedule.map((a) => [a.id, a]));
  const levels = new Map<string, Activity[]>(), facade = new Map<string, Activity[]>(), fitout = new Map<string, Activity[]>(), pt = new Map<string, Activity[]>(), mep = new Map<string, Activity[]>(), blk = new Map<string, Activity[]>();
  const add = (m: Map<string, Activity[]>, k: string, a: Activity) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); };
  let totalDays = 0;
  for (const a of schedule) {
    const lv = /^(.+)-l(\d+)$/.exec(a.locationId);
    if (/-STR-L\d+$/.test(a.id) && lv) add(levels, lv[1], a);
    if (/-FAC-Z\d+$/.test(a.id) && lv) add(facade, lv[1], a);
    if (/-FIN-L\d+$/.test(a.id) && lv) add(fitout, lv[1], a);
    if (/-PT-L\d+$/.test(a.id) && lv) add(pt, lv[1], a);
    if (/-MEP-L\d+$/.test(a.id) && lv) add(mep, lv[1], a);
    if (/-BLK-L\d+$/.test(a.id) && lv) add(blk, lv[1], a);
    if (!a.milestone) totalDays += Math.max(1, (t(a.finish) - t(a.start)) / DAY + 1);
  }
  for (const m of [levels, facade, fitout, pt, mep, blk]) for (const xs of m.values()) xs.sort((x, y) => x.finish.localeCompare(y.finish));
  return { byId, levels, facade, fitout, pt, mep, blk, all: schedule, totalDays };
}

const TOWERS: Record<string, { floors: number; code: string; area: number }> = { "tower-a": { floors: 42, code: "TA", area: 1500 }, "tower-b": { floors: 36, code: "TB", area: 1400 }, "hotel-c": { floors: 18, code: "HC", area: 1700 } };
const CRANES: Record<string, { erect: string; tower: string; code: string }> = { tc1: { erect: "EN-040", tower: "tower-a", code: "TA" }, tc2: { erect: "EN-040", tower: "tower-b", code: "TB" }, tc3: { erect: "EN-041", tower: "hotel-c", code: "HC" } };
/** People a trade puts on site per activity in progress (rough, for the model's crowd and the HUD). */
const CREW: Record<string, number> = { Structure: 38, Concrete: 30, Earthworks: 18, Piling: 14, "Post-tensioning": 8, MEP: 22, Finishes: 26, Façade: 16, Steel: 12, Lifts: 6, "T&C": 5, Infrastructure: 20, Electrical: 8, Landscape: 24, Enabling: 20, Waterproofing: 10, Building: 20, Milestone: 0, Authorities: 0 };

export function siteAt(ix: Index, dateIso: string): SiteState {
  const d = t(dateIso) + DAY / 2;
  const A = (id: string) => ix.byId.get(id);
  const F = (id: string) => frac(A(id), d);
  const struct: Record<string, StructState> = {};
  const count = (xs: Activity[] | undefined) => (xs ?? []).filter((a) => frac(a, d) >= 1).length;
  let levelsCast = 0, concrete = 0, facadeZones = 0;

  // Towers and the club: per-level structure, façade zones of 4 levels, per-level fit-out.
  for (const id of [...Object.keys(TOWERS), "club-e"]) {
    const lv = ix.levels.get(id) ?? [];
    const built = lv.filter((a) => frac(a, d) >= 1).length;
    const next = lv.find((a) => frac(a, d) < 1);
    const active = next ? frac(next, d) : 0;
    let glazed = 0; let facadeZone: StructState["facadeZone"] = null;
    for (const z of ix.facade.get(id) ?? []) {
      const m = /\(L(\d+)–L(\d+)\)/.exec(z.name);
      const from = m ? Number(m[1]) : 1, to = m ? Number(m[2]) : 4, n = to - from + 1;
      const f = frac(z, d);
      glazed += n * f;
      if (f >= 1) facadeZones++;
      if (f > 0 && f < 1 && !facadeZone) facadeZone = { from, to, f };
    }
    let fitted = count(ix.fitout.get(id));
    const tw = TOWERS[id];
    const floors = id === "club-e" ? 3 : tw.floors;
    let piles = 1, raft = 1;
    if (id === "tower-a") { piles = F("SB-030"); raft = F("SB-040"); }
    else if (id === "tower-b") { piles = F("SB-031"); raft = F("SB-041"); }
    else if (id === "hotel-c") { const f = F("SB-310"); piles = Math.min(1, f / 0.55); raft = Math.max(0, (f - 0.55) / 0.45); }
    if (id === "club-e") { const f = F("CE-FIN"); glazed = f * 3; fitted = f >= 1 ? 3 : 0; }
    const topped = built >= floors;
    const code = tw?.code;
    const s: StructState = {
      built, active, glazed: Math.min(glazed, built), fitted, topped,
      piles, raft,
      core: id === "club-e" ? built + active : Math.min(floors + 0.5, built + active + (built > 0 || active > 0 ? 2 : 0)),
      pt: count(ix.pt.get(id)),
      mepActive: (ix.mep.get(id) ?? []).filter((a) => { const f = frac(a, d); return f > 0 && f < 1; }).length,
      mep: count(ix.mep.get(id)), blk: count(ix.blk.get(id)),
      facadeZone,
      roof: code ? F(`${code}-ROOF`) : topped ? 1 : 0, lifts: code ? F(`${code}-LIFT`) : 0, tc: code ? F(`${code}-TC`) : 0, cert: code ? F(`${code}-M20`) >= 1 : fitted >= floors,
    };
    struct[id] = s;
    levelsCast += built;
    if (tw) concrete += (built + active * 0.8) * tw.area * 0.42 + raft * (id === "tower-a" ? 4800 : id === "tower-b" ? 4100 : 2600);
  }
  // Podium: one structure activity for four levels, per-level finishes, cladding with the atrium glazing.
  {
    const p = F("PD-STR") * 4, built = Math.floor(p + 1e-9);
    const fin = [1, 2, 3, 4].filter((n) => F(`PD-FIN-L${n}`) >= 1).length;
    const mep = [1, 2, 3, 4].filter((n) => F(`PD-MEP-L${n}`) >= 1).length;
    struct.podium = {
      built, active: built < 4 ? p - built : 0, glazed: Math.min(built, 4 * Math.max(F("PD-ATR-GLZ"), F("PD-FIN-L1") > 0 ? 0.5 + F("PD-FIN-L4") / 2 : 0)), fitted: fin, topped: built >= 4,
      piles: 1, raft: F("SB-200"), core: p, pt: built, mepActive: 0, mep, blk: mep, facadeZone: null, roof: F("PD-ATR-STL"), lifts: F("PD-ESC"), tc: F("PD-TC"), cert: F("PD-TC") >= 1,
    };
    levelsCast += built; concrete += p * 9000 * 0.4;
  }
  const villas: Record<string, VillaState> = {};
  for (let v = 1; v <= 12; v++) {
    const s = F(`VD${v}-STR`) * 2, built = Math.floor(s + 1e-9);
    villas[`villa-${v}`] = { built, active: built < 2 ? s - built : 0, enclosed: F(`VD${v}-MEP`) >= 1, finished: F(`VD${v}-FIN`) >= 1, handedOver: F(`VD${v}-HO`) >= 1, mep: F(`VD${v}-MEP`), fin: F(`VD${v}-FIN`), snag: F(`VD${v}-SNG`) };
    concrete += s * 260;
  }
  const cranes: Record<string, CraneState> = {};
  for (const [id, c] of Object.entries(CRANES)) {
    const erect = F(c.erect), topped = A(`${c.code}-M10`);
    // dismantled over three weeks, starting 25 days after topping out (once the roof slab is stripped)
    const down = topped ? Math.max(0, Math.min(1, (d - (t(topped.finish) + 25 * DAY)) / (21 * DAY))) : 0;
    const s = struct[c.tower];
    cranes[id] = { up: erect > 0 && down < 1, erect, floors: Math.min(TOWERS[c.tower].floors + 3, (s?.built ?? 0) + (s?.active ?? 0) + 4), down };
  }
  // the crowd: activities in progress on the date, weighted by trade
  let activeCount = 0, manpower = 0, plannedDays = 0;
  for (const a of ix.all) {
    const f = frac(a, d);
    if (!a.milestone) plannedDays += f * Math.max(1, (t(a.finish) - t(a.start)) / DAY + 1);
    if (f <= 0 || f >= 1 || a.milestone) continue;
    activeCount++; manpower += CREW[a.trade] ?? 12;
  }
  const basement = ["SB-1B3", "SB-1B2", "SB-1B1"].map(F);
  const basementLevels = basement.filter((f) => f >= 1).length;
  const fitAll = ["tower-a", "tower-b"].every((id) => struct[id].fitted >= TOWERS[id].floors - 2);
  return {
    date: dateIso.slice(0, 10),
    mobilised: F("EN-010"),
    excavation: F("SB-010"),
    basementLevels,
    groundSlab: F("SB-200") >= 1,
    struct, villas, cranes,
    hoists: F("EN-050") >= 1 && !fitAll,
    temp: { offices: F("EN-010"), camp1: F("EN-020"), camp2: F("EN-021"), batching: F("EN-030") },
    services: { substation: F("IN-030"), stp: F("IN-040"), "water-tank": F("IN-050"), mosque: F("IN-060") },
    roads: F("IN-071"),
    landscape: F("IN-080"),
    shoring: F("SB-020"), waterproof: F("SB-050"), ramp: F("SB-300"),
    basementActive: basementLevels + (basementLevels < 3 ? basement[basementLevels] : 0),
    roadsBase: F("IN-070"), utilities: F("IN-010"), storm: F("IN-020"),
    atriumSteel: F("PD-ATR-STL"), escalators: F("PD-ESC"), pool: F("CE-POOL"),
    hoistsDown: fitAll,
    handedOver: F("M-990") >= 1,
    activeCount, manpower: Math.round(manpower),
    planned: ix.totalDays ? Math.round((plannedDays / ix.totalDays) * 1000) / 10 : 0,
    levelsCast, concrete: Math.round(concrete), facadeZones,
  };
}

/** A full StructState from the five basic numbers (for programmes that give no finer detail, e.g. generated projects). */
export function basicStruct(b: { built: number; active: number; glazed: number; fitted: number; topped: boolean }, floors: number): StructState {
  const started = b.built > 0 || b.active > 0;
  return { ...b, piles: started ? 1 : 0, raft: started ? 1 : 0, core: Math.min(floors + 0.5, b.built + b.active + (started ? 2 : 0)), pt: b.built, mepActive: 0, mep: b.fitted, blk: b.fitted, facadeZone: null, roof: b.topped ? 1 : 0, lifts: b.topped ? 1 : 0, tc: b.fitted >= floors ? 1 : 0, cert: b.fitted >= floors };
}
export function basicVilla(b: { built: number; active: number; enclosed: boolean; finished: boolean; handedOver: boolean }): VillaState {
  return { ...b, mep: b.enclosed ? 1 : 0, fin: b.finished ? 1 : 0, snag: b.handedOver ? 1 : 0 };
}

/** Stable key per footprint so the scene only rebuilds what changed. */
export function structKey(s: StructState) {
  return `${s.built}|${Math.round(s.active * 14)}|${Math.round(s.glazed * 2)}|${s.fitted}|${s.topped}|${Math.round(s.piles * 10)}|${Math.round(s.raft * 6)}|${Math.round(s.core * 3)}|${s.pt}|${s.mep}|${s.mepActive}|${s.blk}|${s.facadeZone ? `${s.facadeZone.from}:${Math.round(s.facadeZone.f * 12)}` : ""}|${Math.round(s.roof * 4)}|${Math.round(s.lifts * 3)}|${Math.round(s.tc * 2)}|${s.cert}`;
}

/** What happened on site around a date: activities that started or finished within `days` of it, the most telling first. */
export interface SiteEvent { kind: "start" | "finish" | "milestone"; date: string; name: string; id: string; loc: string }
export function eventsAround(ix: Index, dateIso: string, days = 4, max = 4): SiteEvent[] {
  const d = t(dateIso);
  const out: (SiteEvent & { w: number })[] = [];
  const weight = (a: Activity, kind: SiteEvent["kind"]) => {
    if (a.milestone) return 100;
    if (/-STR-L\d+$/.test(a.id)) return kind === "finish" ? 40 : 10;
    if (/-FAC-Z\d+$/.test(a.id)) return 55;
    if (/^(EN|SB|IN)-/.test(a.id)) return 60;
    if (/-(ROOF|LIFT|TC)$/.test(a.id)) return 50;
    if (/^PD-|^CE-/.test(a.id)) return 45;
    if (/^VD\d+-(STR|HO)$/.test(a.id)) return 30;
    return 5;
  };
  for (const a of ix.all) {
    const s = t(a.start), f = t(a.finish);
    if (a.milestone) { if (Math.abs(f - d) <= days * DAY) out.push({ kind: "milestone", date: a.finish, name: a.name, id: a.id, loc: a.locationId, w: 100 - Math.abs(f - d) / DAY }); continue; }
    if (Math.abs(f - d) <= days * DAY) out.push({ kind: "finish", date: a.finish, name: a.name, id: a.id, loc: a.locationId, w: weight(a, "finish") - Math.abs(f - d) / DAY });
    else if (Math.abs(s - d) <= days * DAY) out.push({ kind: "start", date: a.start, name: a.name, id: a.id, loc: a.locationId, w: weight(a, "start") - Math.abs(s - d) / DAY });
  }
  return out.sort((p, q) => q.w - p.w).slice(0, max);
}
