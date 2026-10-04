import type { Location } from "./types";

/**
 * Detailed site plan, authored in plan units. 1 unit = 0.5 m, so the
 * 1600 x 1000 sheet covers an 800 m x 500 m plot.
 *
 * Shapes are grouped into toggleable layers and carry an optional `loc`
 * (location id) so a tap on the shape selects that place.
 */
export const PLAN = { w: 1600, h: 1000, metresPerUnit: 0.5 };

/** Geo-reference: lets the phone's GPS dot land on the plan. */
export const GEO = {
  // plan (0,0) top-left corner, WGS84. Plan x -> east, plan y -> south.
  originLat: 24.7742,
  originLon: 46.6738,
};

export type Layer =
  | "base" | "roads" | "buildings" | "temp" | "cranes" | "utilities" | "hse" | "landscape" | "grid";

export interface Shape {
  layer: Layer;
  t: "rect" | "poly" | "circle" | "line" | "text";
  cls: string;
  loc?: string;
  // rect
  x?: number; y?: number; w?: number; h?: number; rot?: number;
  // poly / line
  pts?: [number, number][];
  // circle
  cx?: number; cy?: number; r?: number;
  // text
  text?: string; size?: number; detail?: 1 | 2 | 3; // detail = min zoom tier
  /** the label must fit this width (plan units): it is shortened, then hidden, when it would spill out */
  fit?: number;
}

const S: Shape[] = [];
const L: Location[] = [];
const add = (s: Shape) => S.push(s);
const loc = (l: Location) => L.push(l);

// ------------------------------------------------------------ site & boundary
loc({ id: "site", name: "Kinan Heights — Whole Site", type: "site", x: 800, y: 500 });
add({ layer: "base", t: "poly", cls: "plot", pts: [[80, 60], [1520, 60], [1540, 80], [1540, 920], [1520, 940], [80, 940], [60, 920], [60, 80]] });
add({ layer: "base", t: "poly", cls: "fence", pts: [[100, 80], [1500, 80], [1520, 100], [1520, 900], [1500, 920], [100, 920], [80, 900], [80, 100], [100, 80]] });
add({ layer: "base", t: "text", cls: "lbl-big", x: 800, y: 42, text: "KINAN HEIGHTS — MIXED-USE DEVELOPMENT · RIYADH", size: 20, detail: 1 });

// Phase zones
loc({ id: "z-p1", name: "Phase 1 — Towers, Podium & Hotel", type: "zone", x: 520, y: 330 });
loc({ id: "z-p2", name: "Phase 2 — Villas & Club", type: "zone", x: 1200, y: 340 });
loc({ id: "z-log", name: "Logistics & Site Facilities Zone", type: "zone", x: 480, y: 760 });
add({ layer: "base", t: "rect", cls: "zone z1", loc: "z-p1", x: 140, y: 100, w: 740, h: 440 });
add({ layer: "base", t: "rect", cls: "zone z2", loc: "z-p2", x: 890, y: 100, w: 610, h: 440 });
add({ layer: "base", t: "rect", cls: "zone z3", loc: "z-log", x: 140, y: 590, w: 1000, h: 310 });
add({ layer: "base", t: "text", cls: "lbl-zone", x: 160, y: 122, text: "PHASE 1", size: 14, detail: 1 });
add({ layer: "base", t: "text", cls: "lbl-zone", x: 910, y: 122, text: "PHASE 2", size: 14, detail: 1 });
add({ layer: "base", t: "text", cls: "lbl-zone", x: 160, y: 612, text: "LOGISTICS & SITE FACILITIES", size: 14, detail: 1 });

// ------------------------------------------------------------ grid
const cols = "ABCDEFGH".split("");
cols.forEach((c, i) => {
  const x = 280 + i * 70;
  add({ layer: "grid", t: "line", cls: "gridline", pts: [[x, 120], [x, 535]] });
  add({ layer: "grid", t: "text", cls: "lbl-grid", x, y: 113, text: c, size: 9, detail: 2 });
});
for (let i = 1; i <= 6; i++) {
  const y = 130 + (i - 1) * 75;
  add({ layer: "grid", t: "line", cls: "gridline", pts: [[255, y], [790, y]] });
  add({ layer: "grid", t: "text", cls: "lbl-grid", x: 245, y: y + 3, text: String(i), size: 9, detail: 2 });
}

// ------------------------------------------------------------ roads
loc({ id: "r-ring", name: "Perimeter Ring Road", type: "road", x: 800, y: 910 });
loc({ id: "r-main", name: "Main Haul Road (E-W)", type: "road", x: 800, y: 560 });
loc({ id: "r-spine", name: "North-South Spine Road", type: "road", x: 885, y: 330 });
const road = (x: number, y: number, w: number, h: number, id?: string) =>
  add({ layer: "roads", t: "rect", cls: "road", loc: id, x, y, w, h });
road(90, 880, 1420, 28, "r-ring");        // south ring
road(90, 90, 28, 820, "r-ring");          // west ring
road(1472, 90, 28, 820, "r-ring");        // east ring
road(90, 90, 1420, 28, "r-ring");         // north ring
road(118, 548, 1354, 32, "r-main");       // main haul road
road(871, 118, 28, 430, "r-spine");       // spine
road(1140, 580, 26, 300);                 // east link
road(430, 580, 26, 300);                  // west link
// road centre-lines
add({ layer: "roads", t: "line", cls: "cl", pts: [[118, 564], [1472, 564]] });
add({ layer: "roads", t: "line", cls: "cl", pts: [[885, 118], [885, 548]] });
add({ layer: "roads", t: "line", cls: "cl", pts: [[90, 894], [1510, 894]] });
add({ layer: "roads", t: "text", cls: "lbl-road", x: 620, y: 569, text: "MAIN HAUL ROAD →", size: 9, detail: 2 });
add({ layer: "roads", t: "text", cls: "lbl-road", x: 1050, y: 899, text: "← PERIMETER RING ROAD (ONE-WAY) ←", size: 9, detail: 2 });
add({ layer: "base", t: "rect", cls: "public-road", x: 0, y: 950, w: 1600, h: 50 });
add({ layer: "base", t: "text", cls: "lbl-road", x: 800, y: 975, text: "KING FAHD BRANCH ROAD (PUBLIC)  ·  60 m R.O.W.", size: 12, detail: 1 });

// ------------------------------------------------------------ gates
const gate = (id: string, name: string, x: number, y: number, al: string[] = []) => {
  loc({ id, name, type: "gate", x, y, aliases: al });
  add({ layer: "hse", t: "rect", cls: "gate", loc: id, x: x - 22, y: y - 8, w: 44, h: 16 });
  add({ layer: "hse", t: "text", cls: "lbl-gate", x, y: y + 3, text: name.split(" — ")[0], size: 8, detail: 1 });
};
gate("g1", "Gate 1 — Main (Personnel & Visitors)", 600, 934, ["main gate", "entrance"]);
gate("g2", "Gate 2 — Materials & Heavy Vehicles", 1150, 934, ["materials gate", "truck gate"]);
gate("g3", "Gate 3 — Emergency Access", 1514, 500, ["emergency gate"]);
add({ layer: "hse", t: "rect", cls: "guard", x: 560, y: 908, w: 26, h: 18 });
add({ layer: "hse", t: "rect", cls: "guard", x: 1100, y: 908, w: 26, h: 18 });
add({ layer: "temp", t: "rect", cls: "wash", loc: "wheel-wash", x: 1128, y: 850, w: 46, h: 22 });
loc({ id: "wheel-wash", name: "Wheel Wash Bay", type: "temp", x: 1151, y: 861 });
add({ layer: "temp", t: "text", cls: "lbl-s", x: 1151, y: 845, text: "Wheel wash", size: 7, detail: 3 });

// ------------------------------------------------------------ buildings
export interface B { id: string; name: string; x: number; y: number; w: number; h: number; floors: number; use: string; cls: string; alias?: string[] }
export const BUILDINGS: B[] = [
  { id: "tower-a", name: "Tower A", x: 300, y: 150, w: 170, h: 170, floors: 42, use: "Residential tower", cls: "bld res", alias: ["TA", "tower 1"] },
  { id: "tower-b", name: "Tower B", x: 560, y: 150, w: 170, h: 170, floors: 36, use: "Residential tower", cls: "bld res", alias: ["TB", "tower 2"] },
  { id: "podium", name: "Podium & Retail", x: 280, y: 340, w: 470, h: 170, floors: 4, use: "Retail podium", cls: "bld ret", alias: ["mall", "retail"] },
  { id: "hotel-c", name: "Hotel Block C", x: 920, y: 150, w: 220, h: 160, floors: 18, use: "5-star hotel", cls: "bld hot", alias: ["hotel"] },
  { id: "club-e", name: "Amenity Club E", x: 920, y: 350, w: 200, h: 120, floors: 3, use: "Clubhouse, pool & gym", cls: "bld ame", alias: ["clubhouse"] },
];
const levelsFor = (b: B): { id: string; name: string }[] => {
  const out: { id: string; name: string }[] = [];
  if (b.id !== "club-e") for (const n of ["B3", "B2", "B1"]) out.push({ id: `${b.id}-${n.toLowerCase()}`, name: `${b.name} — Basement ${n.slice(1)} (${n})` });
  out.push({ id: `${b.id}-g`, name: `${b.name} — Ground Level` });
  for (let i = 1; i <= b.floors; i++) out.push({ id: `${b.id}-l${i}`, name: `${b.name} — Level ${i}` });
  out.push({ id: `${b.id}-roof`, name: `${b.name} — Roof` });
  return out;
};
for (const b of BUILDINGS) {
  loc({ id: b.id, name: b.name, type: "building", x: b.x + b.w / 2, y: b.y + b.h / 2, aliases: b.alias });
  add({ layer: "buildings", t: "rect", cls: b.cls, loc: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
  add({ layer: "buildings", t: "text", cls: "lbl-b", x: b.x + b.w / 2, y: b.y + 20, text: b.name.toUpperCase(), size: 13, detail: 1, fit: b.w - 8 });
  add({ layer: "buildings", t: "text", cls: "lbl-s", x: b.x + b.w / 2, y: b.y + 34, text: `${b.use} · ${b.floors} lvls`, size: 8, detail: 2, fit: b.w - 8 });
  for (const lv of levelsFor(b)) loc({ id: lv.id, name: lv.name, type: "level", parentId: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 });
}
// Tower cores + columns (detail)
for (const b of BUILDINGS.slice(0, 2)) {
  add({ layer: "buildings", t: "rect", cls: "core", x: b.x + b.w / 2 - 25, y: b.y + b.h / 2 - 28, w: 50, h: 56 });
  add({ layer: "buildings", t: "text", cls: "lbl-s", x: b.x + b.w / 2, y: b.y + b.h / 2 + 46, text: "Core", size: 7, detail: 3 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    add({ layer: "buildings", t: "rect", cls: "col", x: b.x + 14 + i * 47, y: b.y + 14 + j * 47, w: 5, h: 5 });
  }
}
// Podium retail units
for (let i = 0; i < 8; i++) {
  add({ layer: "buildings", t: "rect", cls: "unit", x: 286 + i * 57.5, y: 346, w: 52, h: 38 });
  add({ layer: "buildings", t: "rect", cls: "unit", x: 286 + i * 57.5, y: 466, w: 52, h: 38 });
}
add({ layer: "buildings", t: "text", cls: "lbl-s", x: 515, y: 450, text: "Atrium", size: 8, detail: 3 });
// Basement footprint (dashed)
loc({ id: "basement", name: "Basement Car Park (3 levels) — Footprint", type: "zone", x: 520, y: 330, aliases: ["basement", "car park", "parking"] });
add({ layer: "buildings", t: "rect", cls: "basement", loc: "basement", x: 255, y: 125, w: 520, h: 410 });
add({ layer: "buildings", t: "text", cls: "lbl-s", x: 262, y: 138, text: "Basement footprint (B1–B3)", size: 8, detail: 2 });
loc({ id: "ramp", name: "Basement Ramp", type: "room", parentId: "basement", x: 790, y: 520, aliases: ["ramp"] });
add({ layer: "buildings", t: "poly", cls: "ramp", loc: "ramp", pts: [[755, 500], [815, 500], [815, 540], [755, 540]] });
add({ layer: "buildings", t: "text", cls: "lbl-s", x: 785, y: 523, text: "Ramp ↘", size: 7, detail: 3 });

// Villas cluster D — 3 rows x 4
loc({ id: "villas-d", name: "Villa Cluster D", type: "building", x: 1310, y: 270, aliases: ["villas"] });
export const VILLAS: { id: string; x: number; y: number; w: number; h: number }[] = [];
let vn = 1;
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
  const id = `villa-${vn}`;
  const x = 1200 + c * 68, y = 135 + r * 100;
  loc({ id, name: `Villa D${vn}`, type: "building", parentId: "villas-d", x: x + 25, y: y + 30 });
  VILLAS.push({ id, x, y, w: 52, h: 60 });
  add({ layer: "buildings", t: "rect", cls: "bld villa", loc: id, x, y, w: 52, h: 60 });
  add({ layer: "buildings", t: "rect", cls: "pool", x: x + 12, y: y + 64, w: 28, h: 12 });
  add({ layer: "buildings", t: "text", cls: "lbl-s", x: x + 26, y: y + 34, text: `D${vn}`, size: 10, detail: 2, fit: 50 });
  vn++;
}
add({ layer: "buildings", t: "text", cls: "lbl-b", x: 1310, y: 122, text: "VILLA CLUSTER D", size: 11, detail: 1 });

// Permanent services
const svc = (id: string, name: string, x: number, y: number, w: number, h: number, cls: string, al: string[] = []) => {
  loc({ id, name, type: "utility", x: x + w / 2, y: y + h / 2, aliases: al });
  add({ layer: "buildings", t: "rect", cls, loc: id, x, y, w, h });
  add({ layer: "buildings", t: "text", cls: "lbl-s", x: x + w / 2, y: y + h / 2 + 3, text: name, size: 8, detail: 2, fit: w - 6 });
};
svc("substation", "Substation (33/11 kV)", 1200, 620, 90, 60, "bld util", ["transformer", "electrical substation", "SEC"]);
svc("stp", "STP", 1340, 720, 120, 110, "bld util", ["sewage treatment", "sewage plant"]);
svc("water-tank", "Water Tank", 1200, 740, 100, 90, "bld util", ["reservoir", "fire water tank"]);
svc("mosque", "Mosque", 1320, 600, 100, 80, "bld civic", ["prayer hall"]);

// ------------------------------------------------------------ temporary works
const tmp = (id: string, name: string, x: number, y: number, w: number, h: number, cls: string, type: Location["type"] = "temp", al: string[] = []) => {
  loc({ id, name, type, x: x + w / 2, y: y + h / 2, aliases: al });
  add({ layer: "temp", t: "rect", cls, loc: id, x, y, w, h });
  add({ layer: "temp", t: "text", cls: "lbl-s", x: x + w / 2, y: y + h / 2 + 3, text: name, size: 8, detail: 2, fit: w - 6 });
};
tmp("site-office", "Site Offices", 160, 640, 140, 70, "tmp office", "temp", ["site office", "PM office", "cabins"]);
tmp("labour-camp", "Labour Camp", 160, 740, 240, 130, "tmp camp", "temp", ["camp", "accommodation"]);
for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++)
  add({ layer: "temp", t: "rect", cls: "cabin", x: 170 + i * 58, y: 770 + j * 50, w: 50, h: 34 });
tmp("batching", "Batching Plant", 480, 740, 130, 120, "tmp batch", "temp", ["concrete plant", "batch plant"]);
add({ layer: "temp", t: "circle", cls: "silo", cx: 505, cy: 770, r: 10 });
add({ layer: "temp", t: "circle", cls: "silo", cx: 535, cy: 770, r: 10 });
tmp("rebar-yard", "Rebar Fabrication Yard", 640, 740, 150, 120, "tmp yard", "yard", ["rebar", "steel yard", "bar bending"]);
tmp("laydown-1", "Laydown Area 1 — Formwork", 830, 620, 160, 100, "tmp yard", "yard", ["formwork yard"]);
tmp("laydown-2", "Laydown Area 2 — MEP & Façade", 830, 740, 160, 110, "tmp yard", "yard", ["MEP store", "facade store"]);
tmp("laydown-3", "Laydown Area 3 — Precast", 1010, 620, 100, 230, "tmp yard", "yard", ["precast yard"]);
tmp("waste-yard", "Waste Segregation Yard", 480, 620, 100, 70, "tmp waste", "temp", ["waste", "skips"]);
tmp("store", "Main Store & Workshop", 330, 640, 100, 70, "tmp office", "temp", ["workshop", "warehouse"]);
tmp("testing-lab", "Materials Testing Lab", 600, 620, 100, 70, "tmp office", "temp", ["lab", "cube testing"]);
// temp roads/parking
for (let i = 0; i < 10; i++) add({ layer: "temp", t: "rect", cls: "bay", x: 330 + i * 10, y: 725, w: 8, h: 14 });
add({ layer: "temp", t: "text", cls: "lbl-s", x: 380, y: 722, text: "Staff parking", size: 7, detail: 3 });

// ------------------------------------------------------------ cranes
const crane = (id: string, name: string, x: number, y: number, r: number, al: string[]) => {
  loc({ id, name, type: "crane", x, y, aliases: al });
  add({ layer: "cranes", t: "circle", cls: "crane-r", cx: x, cy: y, r });
  add({ layer: "cranes", t: "circle", cls: "crane", loc: id, cx: x, cy: y, r: 7 });
  add({ layer: "cranes", t: "text", cls: "lbl-c", x, y: y - 11, text: name.split(" — ")[0], size: 9, detail: 1 });
};
crane("tc1", "TC1 — Tower Crane (Tower A)", 492, 235, 120, ["crane 1", "tower crane 1"]);
crane("tc2", "TC2 — Tower Crane (Tower B)", 540, 235, 120, ["crane 2", "tower crane 2"]);
crane("tc3", "TC3 — Tower Crane (Hotel C)", 1000, 330, 110, ["crane 3", "tower crane 3"]);
loc({ id: "hoist-a", name: "Material Hoist — Tower A", type: "crane", x: 290, y: 235, aliases: ["hoist a"] });
loc({ id: "hoist-b", name: "Material Hoist — Tower B", type: "crane", x: 740, y: 235, aliases: ["hoist b"] });
for (const [id, x, y] of [["hoist-a", 290, 235], ["hoist-b", 740, 235]] as const) {
  add({ layer: "cranes", t: "rect", cls: "hoist", loc: id, x: x - 6, y: y - 10, w: 12, h: 20 });
  add({ layer: "cranes", t: "text", cls: "lbl-s", x, y: y + 22, text: "Hoist", size: 7, detail: 3 });
}
add({ layer: "cranes", t: "rect", cls: "pump", x: 480, y: 530, w: 34, h: 12 });
add({ layer: "cranes", t: "text", cls: "lbl-s", x: 497, y: 556, text: "Concrete pump", size: 7, detail: 3 });

// ------------------------------------------------------------ utilities (underground)
const pl = (cls: string, pts: [number, number][]) => add({ layer: "utilities", t: "line", cls, pts });
pl("u-water", [[600, 908], [600, 600], [830, 600], [830, 540], [885, 540], [885, 330]]);
pl("u-water", [[885, 330], [760, 330], [760, 235]]);
pl("u-water", [[885, 330], [1060, 330], [1060, 300]]);
pl("u-sewer", [[1400, 830], [1400, 700], [1160, 700], [1160, 560], [885, 560]]);
pl("u-sewer", [[885, 560], [520, 560], [520, 540]]);
pl("u-storm", [[130, 870], [130, 600], [400, 600], [400, 535]]);
pl("u-storm", [[1490, 120], [1490, 500], [1180, 500]]);
pl("u-power", [[1245, 620], [1245, 560], [885, 560], [885, 340], [750, 340]]);
pl("u-power", [[1245, 560], [1245, 470], [1060, 470]]);
pl("u-power", [[1245, 560], [1245, 440], [1340, 440], [1340, 330]]);
pl("u-tel", [[600, 920], [620, 590], [880, 590], [880, 350]]);
pl("u-fire", [[1200, 785], [1180, 785], [1180, 580], [860, 580], [860, 340]]);
const mh = (x: number, y: number, k: string) => add({ layer: "utilities", t: "circle", cls: `mh ${k}`, cx: x, cy: y, r: 4 });
mh(830, 600, "w"); mh(1160, 700, "s"); mh(1160, 560, "s"); mh(520, 560, "s"); mh(400, 600, "st");
mh(1245, 560, "p"); mh(885, 340, "p"); mh(1180, 500, "st"); mh(880, 590, "t");
add({ layer: "utilities", t: "text", cls: "lbl-u w", x: 640, y: 596, text: "Water Ø300 DI", size: 8, detail: 3 });
add({ layer: "utilities", t: "text", cls: "lbl-u s", x: 1010, y: 556, text: "Sewer Ø400 uPVC", size: 8, detail: 3 });
add({ layer: "utilities", t: "text", cls: "lbl-u st", x: 250, y: 596, text: "Storm Ø900 RCP", size: 8, detail: 3 });
add({ layer: "utilities", t: "text", cls: "lbl-u p", x: 1050, y: 556, text: "11 kV duct bank", size: 8, detail: 3 });
add({ layer: "utilities", t: "text", cls: "lbl-u t", x: 700, y: 586, text: "Telecom", size: 8, detail: 3 });
loc({ id: "util-corridor", name: "Underground Utilities Corridor", type: "utility", x: 885, y: 450, aliases: ["services", "duct bank", "underground services"] });

// ------------------------------------------------------------ HSE
const hse = (id: string, name: string, x: number, y: number, short: string, al: string[] = []) => {
  loc({ id, name, type: "temp", x, y, aliases: al });
  add({ layer: "hse", t: "circle", cls: "hse-pt", loc: id, cx: x, cy: y, r: 9 });
  add({ layer: "hse", t: "text", cls: "lbl-h", x, y: y + 3, text: short, size: 9, detail: 1 });
};
hse("muster-1", "Emergency Muster Point 1", 500, 906 - 0, "M1", ["assembly point 1"]);
hse("muster-2", "Emergency Muster Point 2", 1420, 530, "M2", ["assembly point 2"]);
hse("firstaid", "First Aid Clinic", 320, 614, "+", ["clinic", "medical"]);
hse("fire-point", "Fire Fighting Pump House", 1170, 640, "F", ["fire pump"]);
add({ layer: "hse", t: "text", cls: "lbl-s", x: 500, y: 892, text: "Muster 1", size: 7, detail: 3 });

// ------------------------------------------------------------ landscape
const tree = (x: number, y: number) => add({ layer: "landscape", t: "circle", cls: "tree", cx: x, cy: y, r: 5 });
for (let i = 0; i < 26; i++) tree(150 + i * 50, 100 + (i % 2) * 5);
for (let j = 0; j < 12; j++) { tree(1484, 140 + j * 60); }
add({ layer: "landscape", t: "rect", cls: "garden", x: 1150, y: 330, w: 40, h: 140 });
add({ layer: "landscape", t: "rect", cls: "garden", x: 780, y: 330, w: 60, h: 160 });

export const SHAPES = S;
export const SEED_LOCATIONS: Location[] = L;
export const LAYER_DEFS: { id: Layer; label: string; on: boolean }[] = [
  { id: "buildings", label: "Buildings", on: true },
  { id: "roads", label: "Roads", on: true },
  { id: "temp", label: "Temp works", on: true },
  { id: "cranes", label: "Cranes", on: true },
  { id: "hse", label: "HSE & Gates", on: true },
  { id: "utilities", label: "Utilities", on: false },
  { id: "grid", label: "Grid", on: false },
  { id: "landscape", label: "Landscape", on: true },
];

/** Convert GPS to plan units using the geo-reference (flat-earth approx). */
export function gpsToPlan(lat: number, lon: number): { x: number; y: number } {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((GEO.originLat * Math.PI) / 180);
  const east = (lon - GEO.originLon) * mPerDegLon;
  const south = (GEO.originLat - lat) * mPerDegLat;
  return { x: east / PLAN.metresPerUnit, y: south / PLAN.metresPerUnit };
}

/** Smallest named shape containing a plan point (falls back to the whole site). */
export function locationAt(x: number, y: number): string {
  let best: { id: string; area: number } | null = null;
  for (const s of SHAPES) {
    if (s.t !== "rect" || !s.loc || s.x === undefined) continue;
    if (x >= s.x && x <= s.x + s.w! && y >= s.y! && y <= s.y! + s.h!) {
      const area = s.w! * s.h!;
      if (!best || area < best.area) best = { id: s.loc, area };
    }
  }
  return best?.id ?? "site";
}
