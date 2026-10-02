import type { Activity } from "../types";
import { DATA_DATE, addDays, daysBetween, int, rng } from "./util";

/**
 * Level-3 construction programme for Kinan Heights (~540 activities).
 * Dates are consistent with the seeded documents (e.g. Tower A L12 slab
 * poured 29-Sep-2026, Tower B core at L31, Hotel C raft complete).
 */
const C = {
  main: "Al-Bunyan Contracting (Main Contractor)",
  mep: "Gulf Integrated MEP Services",
  facade: "Skyline Façade Systems",
  lifts: "Vertex Lifts Arabia",
  pt: "PT-Tech Post-Tensioning",
  fitout: "Diwan Interiors",
  infra: "Najd Infrastructure Works",
  land: "Wahat Landscaping",
  elec: "Gulf Integrated MEP Services (HV)",
};

const r = rng(42);
const out: Activity[] = [];

function act(a: {
  id: string; name: string; wbs: string; loc: string; trade: string; contractor: string;
  s: string; f: string; bs?: string; bf?: string; critical?: boolean; preds?: string[]; milestone?: boolean;
}): Activity {
  const bs = a.bs ?? a.s, bf = a.bf ?? a.f;
  let percent: number, status: Activity["status"];
  if (a.f <= DATA_DATE) { percent = 100; status = "completed"; }
  else if (a.s > DATA_DATE) { percent = 0; status = "not_started"; }
  else {
    const tot = Math.max(1, daysBetween(a.s, a.f));
    percent = Math.min(99, Math.max(1, Math.round((daysBetween(a.s, DATA_DATE) / tot) * 100)));
    status = "in_progress";
  }
  const slip = daysBetween(bf, a.f);
  const totalFloat = a.critical ? (slip > 0 ? -slip : 0) : int(r, 4, 45);
  const x: Activity = {
    id: a.id, name: a.name, wbs: a.wbs, locationId: a.loc, trade: a.trade, contractor: a.contractor,
    baselineStart: bs, baselineFinish: bf, start: a.s, finish: a.f, percent, status,
    critical: !!a.critical, totalFloat, predecessors: a.preds ?? [], milestone: a.milestone,
  };
  out.push(x);
  return x;
}
const ms = (id: string, name: string, wbs: string, loc: string, f: string, bf: string, preds: string[] = [], critical = true) =>
  act({ id, name, wbs, loc, trade: "Milestone", contractor: "Kinan PMO", s: f, f, bs: bf, bf, critical, preds, milestone: true });

// ---------------------------------------------------------------- 0. project milestones & enabling
ms("M-000", "Notice to Proceed", "0.1", "site", "2025-03-01", "2025-03-01");
act({ id: "EN-010", name: "Site mobilisation, hoarding & site offices", wbs: "0.2.1", loc: "site-office", trade: "Enabling", contractor: C.main, s: "2025-03-02", f: "2025-04-15", preds: ["M-000"] });
act({ id: "EN-020", name: "Labour camp phase 1 (480 beds)", wbs: "0.2.2", loc: "labour-camp", trade: "Enabling", contractor: C.main, s: "2025-03-15", f: "2025-06-10" });
act({ id: "EN-021", name: "Labour camp phase 2 (+240 beds)", wbs: "0.2.2", loc: "labour-camp", trade: "Enabling", contractor: C.main, s: "2026-08-01", f: "2026-10-20", bf: "2026-09-30" });
act({ id: "EN-030", name: "Batching plant installation & trial mixes", wbs: "0.2.3", loc: "batching", trade: "Enabling", contractor: C.main, s: "2025-04-01", f: "2025-05-20" });
act({ id: "EN-040", name: "Tower cranes TC1/TC2 erection & load test", wbs: "0.2.4", loc: "tc1", trade: "Enabling", contractor: C.main, s: "2025-10-20", f: "2025-11-15" });
act({ id: "EN-041", name: "Tower crane TC3 erection & load test (Hotel C)", wbs: "0.2.4", loc: "tc3", trade: "Enabling", contractor: C.main, s: "2026-08-25", f: "2026-09-12", bf: "2026-08-20" });
act({ id: "EN-050", name: "Material hoists A/B installation", wbs: "0.2.5", loc: "hoist-a", trade: "Enabling", contractor: C.main, s: "2026-06-01", f: "2026-06-20" });

// ---------------------------------------------------------------- 1. substructure
act({ id: "SB-010", name: "Bulk excavation to -14.5 m (Phase 1 basement)", wbs: "1.1.1", loc: "basement", trade: "Earthworks", contractor: C.main, s: "2025-04-10", f: "2025-07-30", critical: true, preds: ["EN-010"] });
act({ id: "SB-020", name: "Secant pile shoring wall & anchors", wbs: "1.1.2", loc: "basement", trade: "Piling", contractor: C.main, s: "2025-03-20", f: "2025-06-30", critical: true });
act({ id: "SB-030", name: "Bored piles Tower A (186 no. Ø1200)", wbs: "1.1.3", loc: "tower-a", trade: "Piling", contractor: C.main, s: "2025-07-01", f: "2025-08-25", critical: true, preds: ["SB-010"] });
act({ id: "SB-031", name: "Bored piles Tower B (164 no. Ø1200)", wbs: "1.1.3", loc: "tower-b", trade: "Piling", contractor: C.main, s: "2025-06-20", f: "2025-08-10", preds: ["SB-010"] });
act({ id: "SB-040", name: "Raft foundation Tower A (3.2 m, 4,800 m³)", wbs: "1.1.4", loc: "tower-a-b3", trade: "Concrete", contractor: C.main, s: "2025-09-01", f: "2025-10-05", critical: true, preds: ["SB-030"] });
act({ id: "SB-041", name: "Raft foundation Tower B (3.0 m, 4,100 m³)", wbs: "1.1.4", loc: "tower-b-b3", trade: "Concrete", contractor: C.main, s: "2025-08-15", f: "2025-09-10", preds: ["SB-031"] });
act({ id: "SB-050", name: "Basement waterproofing (HDPE + crystalline)", wbs: "1.1.5", loc: "basement", trade: "Waterproofing", contractor: C.main, s: "2025-08-10", f: "2025-12-20", preds: ["SB-010"] });
for (const [lv, s, f] of [["B3", "2025-10-06", "2025-11-20"], ["B2", "2025-11-21", "2026-01-10"], ["B1", "2026-01-11", "2026-02-25"]] as const) {
  act({ id: `SB-1${lv}`, name: `Basement ${lv} slab & walls (Phase 1)`, wbs: "1.2", loc: `tower-a-${lv.toLowerCase()}`, trade: "Concrete", contractor: C.main, s, f, critical: true });
}
act({ id: "SB-200", name: "Ground floor transfer slab — podium", wbs: "1.3", loc: "podium-g", trade: "Concrete", contractor: C.main, s: "2026-02-26", f: "2026-04-10", critical: true, preds: ["SB-1B1"] });
act({ id: "SB-300", name: "Basement ramp & podium car-park MEP rough-in", wbs: "1.4", loc: "ramp", trade: "MEP", contractor: C.mep, s: "2026-05-01", f: "2026-11-30" });
act({ id: "SB-310", name: "Hotel C excavation, piling & raft", wbs: "1.5", loc: "hotel-c", trade: "Concrete", contractor: C.main, s: "2026-04-01", f: "2026-09-20", bf: "2026-08-25", preds: ["EN-030"] });

// ---------------------------------------------------------------- tower generator
function tower(o: {
  code: string; loc: string; name: string; floors: number; wbs: string;
  slabFinish: (n: number) => string; baselineFinish: (n: number) => string; cycle: number; critical: boolean;
}) {
  let prev = "SB-200";
  for (let n = 1; n <= o.floors; n++) {
    const f = o.slabFinish(n), bf = o.baselineFinish(n), cyc = n <= 3 ? 13 : o.cycle - 1;
    const slab = act({
      id: `${o.code}-STR-L${n}`, name: `${o.name} L${n} — columns, core walls & PT slab`, wbs: `${o.wbs}.1.${n}`,
      loc: `${o.loc}-l${n}`, trade: "Structure", contractor: C.main, s: addDays(f, -cyc), f, bs: addDays(bf, -cyc), bf,
      critical: o.critical, preds: [prev],
    });
    prev = slab.id;
    const pt = act({ id: `${o.code}-PT-L${n}`, name: `${o.name} L${n} — PT stressing & grouting`, wbs: `${o.wbs}.1.${n}`, loc: `${o.loc}-l${n}`, trade: "Post-tensioning", contractor: C.pt, s: addDays(f, 7), f: addDays(f, 9), bs: addDays(bf, 7), bf: addDays(bf, 9), preds: [slab.id] });
    const mep = act({ id: `${o.code}-MEP-L${n}`, name: `${o.name} L${n} — MEP first fix (HVAC, plumbing, electrical, fire)`, wbs: `${o.wbs}.3.${n}`, loc: `${o.loc}-l${n}`, trade: "MEP", contractor: C.mep, s: addDays(f, 30), f: addDays(f, 48), bs: addDays(bf, 28), bf: addDays(bf, 46), preds: [pt.id] });
    const dw = act({ id: `${o.code}-BLK-L${n}`, name: `${o.name} L${n} — blockwork, drywall & ceilings`, wbs: `${o.wbs}.4.${n}`, loc: `${o.loc}-l${n}`, trade: "Finishes", contractor: C.fitout, s: addDays(f, 45), f: addDays(f, 66), bs: addDays(bf, 42), bf: addDays(bf, 62), preds: [mep.id] });
    act({ id: `${o.code}-FIN-L${n}`, name: `${o.name} L${n} — fit-out, tiling, joinery & second fix`, wbs: `${o.wbs}.5.${n}`, loc: `${o.loc}-l${n}`, trade: "Finishes", contractor: C.fitout, s: addDays(f, 75), f: addDays(f, 108), bs: addDays(bf, 70), bf: addDays(bf, 100), preds: [dw.id] });
  }
  // façade zones of 4 levels
  for (let z = 0; z * 4 < o.floors; z++) {
    const lo = z * 4 + 1, hi = Math.min(o.floors, lo + 3), f = o.slabFinish(hi), bf = o.baselineFinish(hi);
    act({ id: `${o.code}-FAC-Z${z + 1}`, name: `${o.name} façade zone ${z + 1} (L${lo}–L${hi}) — unitised curtain wall`, wbs: `${o.wbs}.2.${z + 1}`, loc: `${o.loc}-l${lo}`, trade: "Façade", contractor: C.facade, s: addDays(f, 21), f: addDays(f, 46), bs: addDays(bf, 21), bf: addDays(bf, 44), critical: o.critical && hi > 12, preds: [`${o.code}-STR-L${hi}`] });
  }
  const top = o.slabFinish(o.floors), btop = o.baselineFinish(o.floors);
  ms(`${o.code}-M10`, `${o.name} topping out`, `${o.wbs}.9`, `${o.loc}-roof`, addDays(top, 1), addDays(btop, 1), [`${o.code}-STR-L${o.floors}`], o.critical);
  act({ id: `${o.code}-ROOF`, name: `${o.name} roof plant, BMU & waterproofing`, wbs: `${o.wbs}.6`, loc: `${o.loc}-roof`, trade: "MEP", contractor: C.mep, s: addDays(top, 10), f: addDays(top, 70), bs: addDays(btop, 10), bf: addDays(btop, 65), preds: [`${o.code}-M10`] });
  act({ id: `${o.code}-LIFT`, name: `${o.name} lift installation (rails, cars, landing doors)`, wbs: `${o.wbs}.7`, loc: o.loc, trade: "Lifts", contractor: C.lifts, s: addDays(top, -120), f: addDays(top, 120), bs: addDays(btop, -120), bf: addDays(btop, 100), critical: o.critical, preds: [`${o.code}-STR-L${Math.min(20, o.floors)}`] });
  act({ id: `${o.code}-TC`, name: `${o.name} testing & commissioning (MEP, fire, BMS)`, wbs: `${o.wbs}.8`, loc: o.loc, trade: "T&C", contractor: C.mep, s: addDays(top, 130), f: addDays(top, 220), bs: addDays(btop, 110), bf: addDays(btop, 190), critical: o.critical, preds: [`${o.code}-LIFT`, `${o.code}-ROOF`] });
  ms(`${o.code}-M20`, `${o.name} Civil Defense completion certificate`, `${o.wbs}.9`, o.loc, addDays(top, 235), addDays(btop, 200), [`${o.code}-TC`], o.critical);
}

// Tower A: L12 poured 29-Sep-2026; 8-day cycle achieved vs 7-day baseline from L13.
tower({
  code: "TA", loc: "tower-a", name: "Tower A", floors: 42, wbs: "2", cycle: 8, critical: true,
  slabFinish: (n) => (n >= 4 ? addDays("2026-09-29", (n - 12) * 8) : addDays("2026-09-29", (4 - 12) * 8 - (4 - n) * 14)),
  baselineFinish: (n) => (n <= 12 ? addDays("2026-09-28", (n - 12) * 8) : addDays("2026-09-28", (n - 12) * 7)),
});
// Tower B: ahead — L29 slab 30-Sep-2026, 7-day cycle; 3 days behind baseline.
tower({
  code: "TB", loc: "tower-b", name: "Tower B", floors: 36, wbs: "3", cycle: 7, critical: false,
  slabFinish: (n) => (n >= 4 ? addDays("2026-09-30", (n - 29) * 7) : addDays("2026-09-30", (4 - 29) * 7 - (4 - n) * 14)),
  baselineFinish: (n) => (n >= 4 ? addDays("2026-09-27", (n - 29) * 7) : addDays("2026-09-27", (4 - 29) * 7 - (4 - n) * 14)),
});
// Hotel C: raft late (20-Sep vs 25-Aug), superstructure from mid-Oct at 10-day cycle.
tower({
  code: "HC", loc: "hotel-c", name: "Hotel Block C", floors: 18, wbs: "4", cycle: 10, critical: false,
  slabFinish: (n) => addDays("2026-10-14", (n - 1) * 10 + (n > 3 ? 0 : 0)),
  baselineFinish: (n) => addDays("2026-09-16", (n - 1) * 10),
});

// ---------------------------------------------------------------- podium & retail
const P = "5";
act({ id: "PD-STR", name: "Podium L1–L4 structure", wbs: `${P}.1`, loc: "podium", trade: "Structure", contractor: C.main, s: "2026-04-11", f: "2026-07-20", critical: true, preds: ["SB-200"] });
for (let n = 1; n <= 4; n++) {
  act({ id: `PD-MEP-L${n}`, name: `Podium L${n} — MEP first fix & retail risers`, wbs: `${P}.2.${n}`, loc: `podium-l${n}`, trade: "MEP", contractor: C.mep, s: addDays("2026-07-01", n * 14), f: addDays("2026-10-15", n * 14), bf: addDays("2026-10-01", n * 14) });
  act({ id: `PD-FIN-L${n}`, name: `Podium L${n} — mall common areas finishes`, wbs: `${P}.3.${n}`, loc: `podium-l${n}`, trade: "Finishes", contractor: C.fitout, s: addDays("2026-11-01", n * 14), f: addDays("2027-03-15", n * 14) });
}
act({ id: "PD-ATR-STL", name: "Atrium roof steel & edge protection", wbs: `${P}.4`, loc: "podium-l2", trade: "Steel", contractor: C.main, s: "2026-09-10", f: "2026-10-20", bf: "2026-10-10" });
act({ id: "PD-ATR-GLZ", name: "Atrium structural glazing (incl. VO-023 extra 380 m², pending approval)", wbs: `${P}.4`, loc: "podium", trade: "Façade", contractor: C.facade, s: "2026-11-15", f: "2027-01-31", bf: "2027-01-10", critical: true, preds: ["PD-ATR-STL"] });
act({ id: "PD-ESC", name: "Podium escalators (12 no.) installation", wbs: `${P}.5`, loc: "podium", trade: "Lifts", contractor: C.lifts, s: "2026-12-01", f: "2027-04-15" });
act({ id: "PD-TC", name: "Podium T&C and tenant handover readiness", wbs: `${P}.6`, loc: "podium", trade: "T&C", contractor: C.mep, s: "2027-04-01", f: "2027-07-31" });
ms("PD-M10", "Retail tenant fit-out access (shell & core handover)", `${P}.9`, "podium", "2027-08-01", "2027-07-15", ["PD-TC"]);

// ---------------------------------------------------------------- amenity club
for (let n = 1; n <= 3; n++) act({ id: `CE-STR-L${n}`, name: `Amenity Club L${n} structure`, wbs: "6.1", loc: `club-e-l${n}`, trade: "Structure", contractor: C.main, s: addDays("2026-08-20", (n - 1) * 21), f: addDays("2026-09-12", (n - 1) * 21) });
act({ id: "CE-POOL", name: "Pool shell, waterproofing & filtration plant", wbs: "6.2", loc: "club-e", trade: "Concrete", contractor: C.main, s: "2026-10-15", f: "2027-01-20" });
act({ id: "CE-FIN", name: "Amenity Club fit-out (gym, spa, lobby)", wbs: "6.3", loc: "club-e", trade: "Finishes", contractor: C.fitout, s: "2027-02-01", f: "2027-08-30" });

// ---------------------------------------------------------------- villas
const vStages: [string, string, number][] = [["STR", "structure", 90], ["MEP", "MEP & blockwork", 70], ["FIN", "finishes & landscaping", 80], ["SNG", "snagging & client walkthrough", 30]];
for (let v = 1; v <= 12; v++) {
  let s = addDays("2025-11-01", (v - 1) * 21);
  const slip = v <= 4 ? 7 : v <= 8 ? 12 : 18;
  let prev = "";
  for (const [k, label, dur] of vStages) {
    const f = addDays(s, dur);
    const a = act({ id: `VD${v}-${k}`, name: `Villa D${v} — ${label}`, wbs: `7.${v}`, loc: `villa-${v}`, trade: k === "STR" ? "Structure" : k === "MEP" ? "MEP" : "Finishes", contractor: k === "MEP" ? C.mep : C.main, s, f, bs: addDays(s, -slip), bf: addDays(f, -slip), preds: prev ? [prev] : [] });
    prev = a.id; s = addDays(f, 1);
  }
  ms(`VD${v}-HO`, `Villa D${v} handover to client`, `7.${v}`, `villa-${v}`, addDays(s, 5), addDays(s, 5 - slip), [prev], false);
}

// ---------------------------------------------------------------- infrastructure & utilities
const I = "8";
act({ id: "IN-010", name: "Underground utilities corridor (water, sewer, duct bank)", wbs: `${I}.1`, loc: "util-corridor", trade: "Infrastructure", contractor: C.infra, s: "2026-03-01", f: "2026-11-30", bf: "2026-10-31" });
act({ id: "IN-020", name: "Storm drainage Ø900 RCP & attenuation", wbs: `${I}.2`, loc: "util-corridor", trade: "Infrastructure", contractor: C.infra, s: "2026-05-01", f: "2026-12-15" });
act({ id: "IN-030", name: "Substation building & 2×2.5 MVA transformers", wbs: `${I}.3`, loc: "substation", trade: "Electrical", contractor: C.elec, s: "2026-02-01", f: "2026-09-25" });
act({ id: "IN-031", name: "SEC inspection of substation", wbs: `${I}.3`, loc: "substation", trade: "Electrical", contractor: C.elec, s: "2026-10-15", f: "2026-10-15", critical: true, preds: ["IN-030"] });
ms("IN-M32", "Substation energisation (permanent power)", `${I}.3`, "substation", "2026-10-28", "2026-10-28", ["IN-031"]);
act({ id: "IN-040", name: "STP (MBR, 1,200 m³/day) civil works", wbs: `${I}.4`, loc: "stp", trade: "Infrastructure", contractor: C.infra, s: "2026-06-01", f: "2027-01-31" });
act({ id: "IN-041", name: "STP equipment install & commissioning", wbs: `${I}.4`, loc: "stp", trade: "MEP", contractor: C.mep, s: "2027-02-01", f: "2027-06-15" });
act({ id: "IN-050", name: "Fire water & potable water tanks", wbs: `${I}.5`, loc: "water-tank", trade: "Concrete", contractor: C.infra, s: "2026-04-01", f: "2026-10-10" });
act({ id: "IN-060", name: "Mosque structure & finishes", wbs: `${I}.6`, loc: "mosque", trade: "Building", contractor: C.main, s: "2026-07-01", f: "2027-03-31" });
act({ id: "IN-070", name: "Internal roads — subgrade & base course", wbs: `${I}.7`, loc: "r-main", trade: "Infrastructure", contractor: C.infra, s: "2027-03-01", f: "2027-08-31" });
act({ id: "IN-071", name: "Internal roads — asphalt wearing course & marking", wbs: `${I}.7`, loc: "r-main", trade: "Infrastructure", contractor: C.infra, s: "2028-01-10", f: "2028-03-15" });
act({ id: "IN-080", name: "Hard & soft landscaping, irrigation", wbs: `${I}.8`, loc: "z-p2", trade: "Landscape", contractor: C.land, s: "2027-09-01", f: "2028-04-30" });
act({ id: "IN-090", name: "NWC water connection & SEC permanent supply agreements", wbs: `${I}.9`, loc: "site", trade: "Authorities", contractor: "Kinan PMO", s: "2026-08-01", f: "2027-02-28" });

// ---------------------------------------------------------------- completion
ms("M-900", "Civil Defense final inspection — whole development", "9.1", "site", "2028-05-20", "2028-04-20", ["TA-M20", "TB-M20", "HC-M20"]);
ms("M-990", "Practical completion — Kinan Heights", "9.2", "site", "2028-07-31", "2028-06-30", ["M-900"]);

export const SCHEDULE: Activity[] = out;
