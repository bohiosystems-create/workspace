import type { DrawingSheet } from "../types";
import { SCHEDULE } from "./schedule";
import { DATA_DATE, addDays, int, pick, rng } from "./util";

/** Drawing register: every level of every building × discipline, plus site-wide sheets. */
const r = rng(7);
const DISC: { d: DrawingSheet["discipline"]; series: number; title: string }[] = [
  { d: "ARC", series: 200, title: "General arrangement plan" },
  { d: "STR", series: 100, title: "Slab framing & reinforcement" },
  { d: "HVAC", series: 300, title: "HVAC ductwork & chilled water" },
  { d: "PLB", series: 400, title: "Plumbing & drainage" },
  { d: "ELE", series: 500, title: "Power, lighting & containment" },
  { d: "FIRE", series: 600, title: "Sprinklers, fire alarm & smoke control" },
];
const BLD = [
  { id: "tower-a", code: "TA", name: "Tower A", floors: 42, basements: true },
  { id: "tower-b", code: "TB", name: "Tower B", floors: 36, basements: true },
  { id: "hotel-c", code: "HC", name: "Hotel Block C", floors: 18, basements: true },
  { id: "podium", code: "PD", name: "Podium & Retail", floors: 4, basements: true },
  { id: "club-e", code: "CE", name: "Amenity Club E", floors: 3, basements: false },
];
const REASONS = [
  "Issued for approval", "Consultant comments incorporated", "Issued for construction",
  "Coordination update (clash resolution)", "RFI response incorporated", "Client change — layout revision",
  "Updated to approved shop drawings", "Civil Defense comments incorporated",
];
const LINKED: Record<string, string> = {
  "KH-TA-ARC-201-L12": "d_seed01", "KH-TA-STR-101-L12": "d_seed02", "KH-TA-HVAC-301-L12": "d_seed03", "KH-TB-ARC-201-L20": "d_seed04",
};
const letters = "ABCDEFGH";
const slabDone = (id: string) => SCHEDULE.find((a) => a.id === id);

const out: DrawingSheet[] = [];
function sheet(o: Omit<DrawingSheet, "history"> & { revCount: number }) {
  const history: DrawingSheet["history"] = [];
  let issued = addDays(o.issued, -int(r, 60, 200));
  for (let i = 0; i < o.revCount; i++) {
    const reason = i === 0 ? "Issued for approval" : i === o.revCount - 1 && o.status === "IFC" ? "Issued for construction" : pick(r, REASONS.slice(1));
    history.push({ revision: letters[i], issued, reason });
    issued = addDays(issued, int(r, 20, 70));
  }
  const last = history[history.length - 1];
  const { revCount, ...rest } = o;
  void revCount;
  out.push({ ...rest, revision: last.revision, issued: last.issued > DATA_DATE ? DATA_DATE : last.issued, history, docId: LINKED[o.sheet] ?? o.docId });
}

for (const b of BLD) {
  const levels: { key: string; label: string; loc: string; n: number }[] = [];
  if (b.basements) for (const k of ["B3", "B2", "B1"]) levels.push({ key: k, label: `Basement ${k}`, loc: `${b.id}-${k.toLowerCase()}`, n: -1 });
  levels.push({ key: "G", label: "Ground", loc: `${b.id}-g`, n: 0 });
  for (let n = 1; n <= b.floors; n++) levels.push({ key: `L${n}`, label: `Level ${n}`, loc: `${b.id}-l${n}`, n });
  levels.push({ key: "RF", label: "Roof", loc: `${b.id}-roof`, n: b.floors + 1 });
  for (const lv of levels) {
    const slab = slabDone(`${b.code}-STR-L${Math.max(1, Math.min(lv.n, b.floors))}`);
    const near = !slab || slab.finish <= addDays(DATA_DATE, 60) || lv.n <= 0;
    for (const d of DISC) {
      const sheetNo = `KH-${b.code}-${d.d}-${d.series + 1}-${lv.key}`;
      let status: DrawingSheet["status"] = "IFC";
      if (!near && (d.d === "HVAC" || d.d === "PLB" || d.d === "ELE" || d.d === "FIRE")) status = r() < 0.55 ? "IFA" : "Under Review";
      if (b.id === "podium" && d.d === "STR") status = "As-Built";
      const revCount = status === "IFC" || status === "As-Built" ? int(r, 3, d.d === "STR" ? 5 : 4) : int(r, 1, 2);
      sheet({
        sheet: sheetNo, title: `${b.name} — ${lv.label} — ${d.title}`, discipline: d.d, locationId: lv.loc,
        revision: "", status, issued: addDays(DATA_DATE, -int(r, 5, 240)), revCount,
      });
    }
  }
  // elevations & sections
  for (const [i, e] of ["North", "South", "East", "West"].entries())
    sheet({ sheet: `KH-${b.code}-FAC-70${i + 1}`, title: `${b.name} — ${e} elevation & façade setting-out`, discipline: "FAC", locationId: b.id, revision: "", status: "IFC", issued: addDays(DATA_DATE, -int(r, 30, 200)), revCount: int(r, 3, 5) });
  sheet({ sheet: `KH-${b.code}-ARC-301`, title: `${b.name} — Building section 1-1`, discipline: "ARC", locationId: b.id, revision: "", status: "IFC", issued: addDays(DATA_DATE, -int(r, 30, 200)), revCount: 3, docId: b.id === "tower-a" ? "d_seed05" : undefined });
}
// site-wide
const site: [string, string, DrawingSheet["discipline"], string, string?][] = [
  ["KH-SITE-CIV-001", "Site logistics plan", "CIV", "site", "d_seed06"],
  ["KH-SITE-CIV-010", "Overall site plan & setting-out", "CIV", "site"],
  ["KH-SITE-CIV-020", "Grading & levels plan", "CIV", "site"],
  ["KH-SITE-CIV-030", "Roads & pavement layout", "CIV", "r-main"],
  ["KH-SITE-CIV-040", "Storm drainage layout", "CIV", "util-corridor"],
  ["KH-SITE-CIV-041", "Sewer network & manhole schedule", "CIV", "util-corridor"],
  ["KH-SITE-CIV-042", "Potable & fire water network", "CIV", "util-corridor"],
  ["KH-SITE-CIV-050", "Underground services coordination — main spine", "CIV", "util-corridor", "d_seed26"],
  ["KH-SITE-ELE-001", "11 kV ring main & duct bank routing", "ELE", "substation"],
  ["KH-SITE-ELE-010", "Substation general arrangement", "ELE", "substation"],
  ["KH-SITE-ELE-020", "External lighting layout", "ELE", "site"],
  ["KH-SITE-PLB-010", "STP process & GA", "PLB", "stp"],
  ["KH-SITE-PLB-020", "Water tank GA & sections", "PLB", "water-tank"],
  ["KH-SITE-FIRE-001", "Fire access roads & hydrant layout", "FIRE", "site"],
  ["KH-SITE-LAN-001", "Landscape master plan", "LAN", "site"],
  ["KH-SITE-LAN-010", "Irrigation layout", "LAN", "site"],
  ["KH-SITE-ARC-900", "Mosque GA plans & elevations", "ARC", "mosque"],
];
for (const [s, t, d, loc, docId] of site) sheet({ sheet: s, title: t, discipline: d, locationId: loc, revision: "", status: "IFC", issued: addDays(DATA_DATE, -int(r, 10, 200)), revCount: int(r, 3, 6), docId });
for (let v = 1; v <= 12; v++)
  for (const d of ["ARC", "STR", "ELE"] as const)
    sheet({ sheet: `KH-VD${v}-${d}-001`, title: `Villa D${v} — ${d === "ARC" ? "plans, elevations & sections" : d === "STR" ? "foundations & slab" : "power & lighting"}`, discipline: d, locationId: `villa-${v}`, revision: "", status: v <= 4 ? "As-Built" : "IFC", issued: addDays(DATA_DATE, -int(r, 30, 300)), revCount: int(r, 2, 4) });

export const REGISTER: DrawingSheet[] = out;
