import type { Delivery, MaterialRequest, ProcurementPackage, PurchaseOrder, StockItem, Supplier } from "../types";
import { SCHEDULE } from "./schedule";
import { DATA_DATE, addDays, int, pick, rng } from "./util";

const r = rng(2026);
// All supplier names are fictional demo data.
export const SUPPLIERS: Supplier[] = ([
  ["Najd Steel Supply", "Rebar & structural steel"], ["Qimma Concrete Products", "Ready-mix & precast"], ["Arabian Cement Logistics", "Cement & GGBS"],
  ["PT-Tech Post-Tensioning", "PT strand & anchorages"], ["Formwork Systems Arabia", "Formwork & shoring"], ["Skyline Façade Systems", "Unitised curtain wall"],
  ["Desert Glass Industries", "Structural glazing"], ["Vertex Lifts Arabia", "Lifts & escalators"], ["Coolwave HVAC Trading", "Chillers & AHUs"],
  ["Gulf Pipe & Valve", "Pipes, valves & fittings"], ["Riyadh Cable Co. (demo)", "LV/HV cables"], ["Al-Noor Switchgear", "LV panels & switchgear"],
  ["SafeGuard Fire Systems", "Sprinklers & fire alarm"], ["Hajar Stone & Tile", "Tiles & stone"], ["Diwan Interiors", "Joinery & fit-out"],
  ["Sahara Waterproofing", "Membranes & coatings"], ["Watan Blocks", "Concrete blocks"], ["Gypsum Boards KSA (demo)", "Drywall & ceilings"],
  ["Oasis Sanitaryware", "Sanitaryware & fittings"], ["BrightLite Lighting", "Light fittings"], ["Najd Infrastructure Works", "Pipes & precast manholes"],
  ["Wahat Landscaping", "Landscape & irrigation"], ["Transformers Arabia (demo)", "Transformers & RMUs"], ["Site Services Rental", "Plant & equipment hire"],
] as const).map(([name, category], i) => ({
  id: `SUP-${String(i + 1).padStart(3, "0")}`, name, category, contact: pick(r, ["Sales Manager", "Key Account Manager", "Projects Director"]),
  phone: `+966 11 000 ${String(1100 + i * 7).padStart(4, "0")}`, rating: Math.round((3 + r() * 2) * 10) / 10, prequalified: i !== 17,
}));
const sup = (name: string) => SUPPLIERS.find((s) => s.name.startsWith(name))!.id;
const actFinish = (id: string) => SCHEDULE.find((a) => a.id === id)?.start ?? DATA_DATE;

type PkgIn = [string, string, string, string, number, number, ProcurementPackage["status"], number, string, number, string, [string, string, number][]];
// [id, name, trade, supplier, budget SAR, committed, status, leadWeeks, need-by activity, forecast slip days, notes, catalogue(item, unit, unitPrice)]
const PKG: PkgIn[] = [
  ["PKG-01", "Reinforcement steel (all buildings)", "Structure", "Najd Steel", 96_000_000, 88_400_000, "Delivering", 4, "TA-STR-L13", -10, "Call-off contract, 480 t per batch; mill certs required per lot.", [["Rebar Grade 60 Ø12", "t", 3150], ["Rebar Grade 60 Ø16", "t", 3120], ["Rebar Grade 60 Ø25", "t", 3090], ["Rebar Grade 60 Ø32", "t", 3110], ["Tie wire", "roll", 18]]],
  ["PKG-02", "Ready-mix concrete supply (top-up to batching plant)", "Structure", "Qimma", 58_000_000, 52_300_000, "Delivering", 1, "TA-STR-L13", 0, "Used when on-site plant is at capacity; night pours in summer.", [["C50 concrete", "m³", 365], ["C60/75 concrete", "m³", 445], ["C40 concrete", "m³", 330]]],
  ["PKG-03", "Cement & GGBS for batching plant", "Structure", "Arabian Cement", 21_000_000, 19_600_000, "Delivering", 1, "TA-STR-L13", 0, "Bulk tankers to silos; 7-day stock minimum.", [["OPC cement (bulk)", "t", 285], ["GGBS (bulk)", "t", 260]]],
  ["PKG-04", "Post-tensioning materials & specialist", "Structure", "PT-Tech", 14_500_000, 13_900_000, "Delivering", 6, "TA-PT-L13", 0, "Strand, anchorages, ducts; stressing crews.", [["PT strand 15.2 mm", "t", 5200], ["Anchorage sets", "no", 210], ["Flat ducts", "m", 9]]],
  ["PKG-05", "Formwork & shoring systems", "Structure", "Formwork Systems", 18_000_000, 17_200_000, "Complete", 8, "TA-STR-L4", 0, "Table forms + climbing system for cores.", [["Table form set", "set", 48_000], ["Props", "no", 120]]],
  ["PKG-06", "Unitised curtain wall — Tower A", "Façade", "Skyline", 142_000_000, 139_500_000, "Manufacturing", 16, "TA-FAC-Z4", 18, "Panels from factory in batches of 120; batch 4 delayed by glass supply.", [["Unitised panel type A1", "no", 14_800], ["Unitised panel type A2 (corner)", "no", 17_900], ["Brackets & embeds", "set", 420]]],
  ["PKG-07", "Unitised curtain wall — Tower B", "Façade", "Skyline", 121_000_000, 118_800_000, "Delivering", 16, "TB-FAC-Z8", 0, "Embeds RFI-0157 tolerance issue L2–L9.", [["Unitised panel type B1", "no", 14_200], ["Brackets & embeds", "set", 410]]],
  ["PKG-08", "Atrium structural glazing (incl. VO-023)", "Façade", "Desert Glass", 9_600_000, 7_760_000, "Evaluation", 14, "PD-ATR-GLZ", 21, "VO-023 adds 380 m² (SAR 1.84M) — awaiting Dev Manager decision; long lead.", [["Laminated low-E structural glass", "m²", 2_650], ["Spider fittings", "no", 380]]],
  ["PKG-09", "Lifts — Tower A & B (16 no.)", "Lifts", "Vertex", 64_000_000, 63_100_000, "Manufacturing", 26, "TA-LIFT", 0, "Rails from L20 upward Jan-2027; firefighter lift per SBC 801.", [["Passenger lift 2.5 m/s", "no", 3_650_000], ["Firefighting lift", "no", 4_100_000]]],
  ["PKG-10", "Escalators — Podium (12 no.)", "Lifts", "Vertex", 11_400_000, 11_100_000, "Manufacturing", 20, "PD-ESC", 0, "", [["Escalator 30° 1000 mm", "no", 925_000]]],
  ["PKG-11", "Chillers & district cooling plant equipment", "MEP", "Coolwave", 38_000_000, 36_900_000, "Manufacturing", 22, "TA-ROOF", -14, "4 × 1,250 TR chillers; factory witness test Nov-2026.", [["Water-cooled chiller 1,250 TR", "no", 7_400_000], ["Cooling tower cell", "no", 690_000]]],
  ["PKG-12", "AHUs & FCUs", "MEP", "Coolwave", 26_000_000, 24_200_000, "Delivering", 14, "TA-MEP-L13", 0, "", [["FCU 2-pipe", "no", 3_100], ["AHU 20,000 cfm", "no", 168_000]]],
  ["PKG-13", "Pipes, valves & fittings", "MEP", "Gulf Pipe", 31_000_000, 22_400_000, "Delivering", 6, "TA-MEP-L13", 0, "", [["Steel pipe Sch40 Ø150", "m", 310], ["PPR pipe Ø32", "m", 22], ["Butterfly valve Ø150", "no", 1_950], ["uPVC drainage Ø110", "m", 46]]],
  ["PKG-14", "LV/HV cables", "Electrical", "Riyadh Cable", 29_000_000, 25_800_000, "Delivering", 8, "TA-MEP-L13", 0, "", [["XLPE 4C×240 mm² LV", "m", 410], ["11 kV XLPE 3C×300 mm²", "m", 980], ["Cat6A cable", "box", 640]]],
  ["PKG-15", "LV switchgear & panels", "Electrical", "Al-Noor", 22_000_000, 21_400_000, "Manufacturing", 18, "TA-TC", 0, "", [["Main LV panel 4000 A", "no", 1_150_000], ["Floor DB", "no", 14_500]]],
  ["PKG-16", "Transformers & RMUs (substation)", "Electrical", "Transformers Arabia", 8_800_000, 8_650_000, "Complete", 30, "IN-030", 0, "Installed; SEC inspection 15-Oct.", [["Transformer 2.5 MVA 11/0.4 kV", "no", 1_850_000], ["RMU 11 kV", "no", 410_000]]],
  ["PKG-17", "Fire protection (sprinklers, fire alarm, pumps)", "MEP", "SafeGuard", 34_000_000, 32_100_000, "Delivering", 12, "TA-MEP-L13", 0, "Civil Defense-licensed contractor.", [["Sprinkler head pendent K5.6", "no", 38], ["Addressable smoke detector", "no", 210], ["Fire pump set 2,850 L/min", "no", 690_000]]],
  ["PKG-18", "Waterproofing & membranes", "Finishes", "Sahara", 7_200_000, 6_900_000, "Delivering", 4, "CE-POOL", 0, "", [["HDPE membrane 2 mm", "m²", 62], ["Torch-on membrane 4 mm", "m²", 48], ["Crystalline admixture", "kg", 19]]],
  ["PKG-19", "Blockwork", "Finishes", "Watan", 12_000_000, 10_100_000, "Delivering", 2, "TA-BLK-L4", 0, "", [["Hollow block 200 mm", "no", 4.6], ["Thermal block 200 mm", "no", 7.9]]],
  ["PKG-20", "Drywall & ceilings", "Finishes", "Gypsum Boards", 16_000_000, 9_300_000, "Awarded", 6, "TA-BLK-L1", 0, "Supplier not yet prequalified — QA audit scheduled.", [["Gypsum board 12.5 mm", "m²", 24], ["Fire-rated board 15 mm", "m²", 36], ["Ceiling grid", "m²", 31]]],
  ["PKG-21", "Tiles & stone", "Finishes", "Hajar", 41_000_000, 33_600_000, "Manufacturing", 12, "TA-FIN-L1", 0, "Marble from Italy for lobbies; porcelain local.", [["Porcelain tile 600×1200", "m²", 118], ["Marble slab 20 mm", "m²", 690]]],
  ["PKG-22", "Joinery, doors & kitchens", "Finishes", "Diwan", 52_000_000, 47_000_000, "Manufacturing", 16, "TA-FIN-L1", 0, "", [["Apartment entrance door FD60", "no", 4_900], ["Kitchen set type K2", "set", 38_000]]],
  ["PKG-23", "Sanitaryware & fittings", "Finishes", "Oasis", 18_000_000, 14_700_000, "Awarded", 10, "TA-FIN-L1", 0, "", [["WC wall-hung set", "no", 2_300], ["Basin mixer", "no", 690]]],
  ["PKG-24", "Light fittings", "Electrical", "BrightLite", 15_000_000, 6_200_000, "RFQ", 12, "TA-FIN-L1", 0, "RFQ closes 12-Oct-2026.", [["LED downlight 12 W", "no", 95]]],
  ["PKG-25", "Infrastructure pipes & manholes", "Infrastructure", "Najd Infrastructure", 23_000_000, 21_900_000, "Delivering", 6, "IN-010", 0, "", [["RCP Ø900", "m", 840], ["uPVC sewer Ø400", "m", 260], ["DI pipe Ø300", "m", 690], ["Precast manhole 1.5 m", "no", 7_400]]],
  ["PKG-26", "Landscape & irrigation", "Landscape", "Wahat", 27_000_000, 0, "Planning", 20, "IN-080", 0, "Tender docs in preparation.", [["Date palm 4 m clear trunk", "no", 4_400]]],
  ["PKG-27", "BMU (building maintenance units)", "Façade", "Skyline", 12_500_000, 0, "RFQ", 30, "TA-ROOF", 35, "Long lead; RFQ late — risk to Tower A roof works.", [["BMU track-mounted", "no", 5_800_000]]],
  ["PKG-28", "Plant & equipment hire", "Enabling", "Site Services", 14_000_000, 12_600_000, "Delivering", 1, "EN-010", 0, "Monthly call-off.", [["Telehandler 17 m (month)", "month", 21_000], ["MEWP 26 m (month)", "month", 16_500], ["Generator 500 kVA (month)", "month", 24_000]]],
];
export const PACKAGES: ProcurementPackage[] = PKG.map(([id, name, trade, s, budget, committed, status, leadTimeWeeks, act, slip, notes]) => {
  const requiredOnSite = addDays(actFinish(act), -7);
  return { id, name, trade, supplierId: sup(s), budget, committed, status, leadTimeWeeks, requiredOnSite, forecastOnSite: addDays(requiredOnSite, slip), activityId: act, notes };
});

export const POS: PurchaseOrder[] = [];
export const DELIVERIES: Delivery[] = [];
const LOC_FOR: Record<string, string> = { Structure: "rebar-yard", Façade: "laydown-2", Lifts: "laydown-2", MEP: "laydown-2", Electrical: "laydown-2", Finishes: "laydown-1", Infrastructure: "laydown-3", Landscape: "laydown-3", Enabling: "store" };
let poN = 4500120, dlN = 1;
for (const [id, , trade, s, , committed, status, , , slip, , cat] of PKG) {
  if (committed === 0) continue;
  const nPo = status === "Delivering" ? int(r, 2, 4) : int(r, 1, 2);
  for (let k = 0; k < nPo; k++) {
    const date = addDays(DATA_DATE, -int(r, 20, 420));
    const lines = cat.slice(0, int(r, 1, cat.length)).map(([item, unit, price], li) => {
      const qty = unit === "t" ? int(r, 80, 600) : unit === "m³" ? int(r, 400, 3000) : unit === "m" ? int(r, 200, 4000) : unit === "m²" ? int(r, 300, 6000) : unit === "no" ? (price > 100_000 ? int(r, 1, 6) : int(r, 20, 1500)) : int(r, 5, 200);
      const delivered = status === "Complete" ? qty : status === "Delivering" ? Math.round(qty * (k < nPo - 1 ? 1 : r() * 0.8)) : 0;
      return { line: (li + 1) * 10, item, qty, unit, unitPrice: price, delivered };
    });
    const allIn = lines.every((l) => l.delivered >= l.qty), some = lines.some((l) => l.delivered > 0);
    const po: PurchaseOrder = { po: `PO-${poN++}`, packageId: id, supplierId: sup(s), date, currency: "SAR", status: allIn ? (status === "Complete" ? "Closed" : "Delivered") : some ? "Partially Delivered" : "Open", lines, source: "demo" };
    POS.push(po);
    // deliveries: past received + upcoming
    const pastN = some ? int(r, 1, 3) : 0;
    for (let d = 0; d < pastN; d++) {
      DELIVERIES.push({ id: `DN-${String(dlN++).padStart(5, "0")}`, po: po.po, date: addDays(DATA_DATE, -int(r, 1, 60)), slot: pick(r, ["06:00–08:00", "08:00–10:00", "22:00–00:00"]), gate: "Gate 2", locationId: LOC_FOR[trade], items: lines.map((l) => l.item).slice(0, 2).join(", "), status: r() < 0.06 ? "Rejected" : "Received", vehicle: pick(r, ["Trailer 40 ft", "Flatbed", "Tanker", "Low-bed (escort)"]), grn: `GRN-${int(r, 20000, 29999)}` });
    }
    if (!allIn && status !== "Awarded" && status !== "Evaluation") {
      const late = slip > 0 && r() < 0.6;
      DELIVERIES.push({ id: `DN-${String(dlN++).padStart(5, "0")}`, po: po.po, date: addDays(DATA_DATE, int(r, 0, 14)), slot: pick(r, ["06:00–08:00", "08:00–10:00", "10:00–12:00", "22:00–00:00"]), gate: "Gate 2", locationId: LOC_FOR[trade], items: lines.map((l) => l.item).slice(0, 2).join(", "), status: late ? "Delayed" : pick(r, ["Scheduled", "Scheduled", "In Transit"]), vehicle: pick(r, ["Trailer 40 ft", "Flatbed", "Tanker", "Low-bed (escort)"]), remarks: late ? `Supplier advises ${slip} days slip` : undefined });
    }
  }
}
DELIVERIES.sort((a, b) => a.date.localeCompare(b.date));

export const REQUESTS: MaterialRequest[] = ([
  ["Rebar Ø32 — Tower A L14–L16 columns", 120, "t", 10, "tower-a-l14", "Construction Manager — Towers", "Approved"],
  ["Spacer blocks 40 mm", 20_000, "no", 4, "rebar-yard", "Rebar Yard Supervisor", "Ordered"],
  ["Fire-rated sealant (firestopping)", 600, "tube", 12, "tower-a-l8", "MEP Supervisor", "Submitted"],
  ["Temporary edge protection posts", 300, "no", 3, "tower-b-l31", "Area Supervisor — Towers", "Approved"],
  ["Debris netting", 1_200, "m²", 5, "tower-a-l12", "HSE Officer", "Submitted"],
  ["Ice for concrete (night pours)", 40, "t", 2, "batching", "Batching Plant Manager", "Ordered"],
  ["Pipe chocks & stacking frames", 60, "no", 2, "laydown-2", "Logistics Manager", "Draft"],
  ["Curing compound", 80, "drum", 6, "hotel-c", "Concrete Manager", "Submitted"],
  ["Gypsum board 12.5 mm (mock-up)", 400, "m²", 14, "tower-a-l4", "Finishes Manager", "Rejected"],
  ["Waterproofing primer", 50, "drum", 7, "club-e", "Waterproofing Supervisor", "Approved"],
  ["Hoist landing gate interlocks (spares)", 6, "no", 5, "hoist-b", "Plant Manager", "Ordered"],
  ["Chilled water for rest areas", 2_000, "carton", 1, "site", "HSE Officer", "Approved"],
] as const).map(([item, qty, unit, inDays, loc, by, status], i) => ({
  id: `MR-${String(301 + i)}`, item, qty, unit, neededBy: addDays(DATA_DATE, inDays), locationId: loc, requestedBy: by,
  created: addDays(DATA_DATE, -int(r, 0, 10)), status, notes: undefined,
}));

export const STOCK: StockItem[] = ([
  ["Rebar Grade 60 (all sizes)", 612, "t", "rebar-yard", 300], ["OPC cement (silo)", 940, "t", "batching", 700], ["GGBS (silo)", 380, "t", "batching", 300],
  ["PT strand 15.2 mm", 38, "t", "laydown-1", 25], ["Table forms (sets free)", 6, "set", "laydown-1", 4], ["Unitised panels — Tower A", 86, "no", "laydown-2", 120],
  ["Unitised panels — Tower B", 214, "no", "laydown-2", 120], ["Precast stair flights", 22, "no", "laydown-3", 12], ["RCP Ø900", 160, "m", "laydown-3", 100],
  ["Concrete blocks 200 mm", 41_000, "no", "laydown-1", 30_000], ["Diesel", 18_000, "L", "store", 20_000], ["Fire extinguishers (spare)", 34, "no", "store", 40],
  ["Spacer blocks 40 mm", 2_500, "no", "rebar-yard", 10_000], ["Ice (cold store)", 6, "t", "batching", 10],
] as const).map(([item, qty, unit, loc, min]) => ({ item, qty, unit, locationId: loc, min, updated: DATA_DATE }));
