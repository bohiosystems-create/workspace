// Generates the sample material under public/samples/: documents to upload into the agent for testing.
//   node scripts/samples.mjs
// Two packs, both fictional:
//   1. kinan-marina-walk/   a complete project pack for "New project" (brief, area schedule, setting-out, P6 programme,
//                           narrative, logistics, structural basis, geotech, drawing register, procurement log, risk register)
//   2. kinan-heights-docs/  site documents for the live Kinan Heights project (RFI, NCR, method statement, inspection
//                           request, weekly report, delivery note, permit to work, safety observation, minutes, change
//                           notice, material submittal, cube results) plus a WhatsApp test script.
// Every file in a pack is written from the same tables, so the documents agree with each other.
import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public", "samples");
const DATA_DATE = "2026-10-14";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const add = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const p6 = (iso) => { const [y, m, d] = iso.split("-"); return `${d}-${MON[Number(m) - 1]}-${y.slice(2)}`; };
const nice = (iso) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${LONG[Number(m) - 1]} ${y}`; };
const csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n") + "\n";
const sar = (n) => `SAR ${n.toLocaleString("en-US")}`;

// =====================================================================================================================
// 1. KINAN MARINA WALK — Al Khobar. Site 420 m east–west × 300 m north–south; the marina basin is NORTH of the site.
// Setting-out grid: origin at the SOUTH-WEST corner, Easting east, Northing north (the convention the agent converts).
// =====================================================================================================================
const SITE = { w: 420, d: 300 };
const NTP = "2025-11-01";
const B = [
  // ref, name, use, storeys, basements, floor-to-floor, E, N (SW corner), w, d, GFA, units
  ["MT1", "Marina Tower 1", "Residential", 40, 3, 3.40, 60, 200, 44, 44, 64800, "286 apartments"],
  ["MT2", "Marina Tower 2", "Residential", 36, 3, 3.40, 130, 205, 42, 42, 54200, "248 apartments"],
  ["OF1", "Marina Office Tower", "Office", 22, 2, 3.90, 300, 210, 52, 36, 38600, "31,000 m² NLA"],
  ["HB1", "Boutique Hotel", "Hotel", 12, 1, 3.50, 200, 222, 70, 28, 21400, "148 keys"],
  ["RP1", "Marina Retail Promenade", "Retail", 2, 1, 5.60, 60, 150, 220, 32, 13900, "38 units + 14 F&B"],
  ["CC1", "Conference & Cultural Centre", "Cultural", 3, 0, 5.00, 300, 120, 90, 60, 14200, "1,200-seat hall"],
  ["CP1", "Marina Car Park", "Parking", 5, 0, 3.00, 320, 20, 80, 50, 19600, "780 bays"],
  ["CL1", "Marina Club & Spa", "Leisure", 2, 0, 4.20, 40, 80, 48, 36, 3100, "members' club"],
  ["MQ1", "Marina Mosque", "Mosque", 1, 0, 7.00, 370, 250, 34, 34, 1150, "800 worshippers"],
  ["UT1", "Substation & Chiller Plant", "Utility", 1, 0, 5.00, 380, 180, 28, 18, 500, "2 × 3 MVA · 3,600 TR"],
  ...Array.from({ length: 10 }, (_, i) => [`V${String(i + 1).padStart(2, "0")}`, `Waterfront Villa ${i + 1}`, "Villa", 3, 0, 3.30, 30 + i * 18, 20, 15, 20, 720, "1 home"]),
].map(([ref, name, use, floors, bas, ftf, e, n, w, d, gfa, units]) => ({ ref, name, use, floors, bas, ftf, e, n, w, d, gfa, units }));

// Phase windows per building [substructure, structure, façade, fit-out, handover]. Written against the real calendar.
const PH = ["SUB", "STR", "FAC", "FIT", "HO"];
const PHN = { SUB: "piling, excavation & raft", STR: "superstructure", FAC: "façade", FIT: "MEP, fit-out & finishes", HO: "testing, commissioning & handover" };
const PROG = {
  MT1: [["2026-01-15", "2026-08-15"], ["2026-08-16", "2027-11-30"], ["2027-02-01", "2028-02-28"], ["2027-05-01", "2028-09-30"], ["2028-10-01", "2028-12-15"]],
  MT2: [["2026-02-15", "2026-09-10"], ["2026-09-11", "2027-10-31"], ["2027-03-01", "2028-01-31"], ["2027-06-01", "2028-08-31"], ["2028-09-01", "2028-11-15"]],
  OF1: [["2026-03-01", "2026-08-31"], ["2026-09-01", "2027-07-15"], ["2027-01-15", "2027-10-31"], ["2027-04-01", "2028-03-31"], ["2028-04-01", "2028-05-31"]],
  HB1: [["2026-05-01", "2026-09-30"], ["2026-10-01", "2027-06-30"], ["2027-03-01", "2027-10-15"], ["2027-06-01", "2028-06-30"], ["2028-07-01", "2028-09-30"]],
  RP1: [["2026-02-01", "2026-07-31"], ["2026-08-01", "2027-02-28"], ["2027-01-15", "2027-07-31"], ["2027-04-01", "2028-04-30"], ["2028-05-01", "2028-06-30"]],
  CC1: [["2026-09-01", "2027-01-31"], ["2027-02-01", "2027-10-31"], ["2027-08-01", "2028-01-31"], ["2027-11-01", "2028-08-31"], ["2028-09-01", "2028-10-31"]],
  CP1: [["2026-10-01", "2026-12-31"], ["2027-01-01", "2027-07-31"], ["2027-06-01", "2027-09-30"], ["2027-08-01", "2027-12-31"], ["2028-01-01", "2028-01-31"]],
  CL1: [["2027-01-01", "2027-03-15"], ["2027-03-16", "2027-08-31"], ["2027-07-01", "2027-11-30"], ["2027-10-01", "2028-04-30"], ["2028-05-01", "2028-06-15"]],
  MQ1: [["2027-03-01", "2027-05-15"], ["2027-05-16", "2027-12-15"], ["2027-10-01", "2028-03-31"], ["2028-01-01", "2028-07-31"], ["2028-08-01", "2028-09-15"]],
  UT1: [["2026-06-01", "2026-07-31"], ["2026-08-01", "2026-11-15"], ["2026-10-15", "2026-12-31"], ["2026-11-15", "2027-04-30"], ["2027-05-01", "2027-05-31"]],
};
for (let i = 1; i <= 10; i++) { const s = add("2027-01-10", (i - 1) * 18); PROG[`V${String(i).padStart(2, "0")}`] = [[s, add(s, 28)], [add(s, 29), add(s, 100)], [add(s, 85), add(s, 130)], [add(s, 115), add(s, 205)], [add(s, 206), add(s, 222)]]; }
// Progress at the data date where it differs from plan: Marina Tower 1 frame ahead, Office Tower frame behind (raft
// redesign after the geotech surprise, RFI-OF1-021), Promenade façade behind (sample rejected).
const ACTUAL = { "MT1-STR-20": 31, "OF1-STR-20": 14, "RP1-FAC-30": 8, "RP1-STR-20": 94 };
const CRITICAL = new Set(["MW-M-000", "MW-EN-010", "MW-MAR-020", "OF1-SUB-10", "OF1-STR-20", "OF1-FAC-30", "OF1-FIT-40", "OF1-HO-50", "MW-M-900"]);
const SLIP = { "OF1-STR-20": 24, "OF1-FAC-30": 24, "OF1-FIT-40": 24, "OF1-HO-50": 24, "RP1-FAC-30": 12, "RP1-FIT-40": 6 };

function programme() {
  const rows = [];
  const pct = (id, s, f) => ACTUAL[id] ?? (DATA_DATE < s ? 0 : DATA_DATE >= f ? 100 : Math.round((days(s, DATA_DATE) / Math.max(1, days(s, f) + 1)) * 100));
  const row = (id, name, wbs, bs, bf, preds, opts = {}) => {
    const slip = SLIP[id] ?? 0, s = add(bs, opts.slipStart ? slip : 0), f = add(bf, slip);
    const p = opts.ms ? (DATA_DATE >= f ? 100 : 0) : pct(id, s, f);
    const dur = opts.ms ? 0 : days(s, f) + 1, rem = Math.round(dur * (100 - p) / 100);
    const A = (d) => (p === 100 || (p > 0 && d === s) ? `${p6(d)} A` : p6(d));
    const float = CRITICAL.has(id) ? -24 : opts.float ?? (id.startsWith("V") ? 61 : 18 + Math.round(days(f, "2028-12-15") / 12));
    rows.push([id, name, wbs, dur, rem, A(s), p === 100 ? `${p6(f)} A` : p6(f), p6(bs), p6(bf), float, CRITICAL.has(id) ? "Yes" : "No", preds, `${p}%`]);
  };
  row("MW-M-000", "Notice to Proceed", "MW.0", NTP, NTP, "", { ms: true });
  row("MW-EN-010", "Site mobilisation, hoarding, offices & enabling works", "MW.0.1", NTP, add(NTP, 59), "MW-M-000 FS");
  row("MW-MAR-020", "Marina basin — sheet-pile quay wall & dredging (north edge)", "MW.0.2", "2025-12-01", "2026-06-30", "MW-EN-010 SS+30", { float: 0 });
  row("MW-MAR-030", "Breakwater & promenade deck (marine works)", "MW.0.3", "2026-04-01", "2027-03-31", "MW-MAR-020 SS+120", { float: 95 });
  row("MW-INF-040", "Primary infrastructure — roads, drainage, utility corridor", "MW.0.4", "2026-03-01", "2027-06-30", "MW-EN-010 FS", { float: 140 });
  B.forEach((b, i) => PROG[b.ref].forEach(([s, f], k) => {
    const ph = PH[k], id = `${b.ref}-${ph}-${(k + 1) * 10}`;
    const name = k === 1 ? `${b.name} — superstructure ${b.floors > 1 ? `L1–L${b.floors}` : "frame & roof"}${b.bas ? ` (+B${b.bas}–B1)` : ""}`
      : k === 2 ? `${b.name} — ${/Residential|Hotel|Office/.test(b.use) ? "unitised curtain wall" : "cladding & glazing"}`
      : `${b.name} — ${PHN[ph]}`;
    const preds = k === 0 ? `MW-EN-010 SS+${days(NTP, s) - 1}` : k === 1 ? `${b.ref}-SUB-10 FS` : k === 2 || k === 3 ? `${b.ref}-STR-20 SS+${days(PROG[b.ref][1][0], s)}, ${b.ref}-STR-20 FF+${days(PROG[b.ref][1][1], f)}` : `${b.ref}-FAC-30 FS, ${b.ref}-FIT-40 FS${/MT|OF|HB|RP|CC/.test(b.ref) ? ", MW-M-500 FS" : ""}`;
    row(id, name, `MW.${i + 1}.${k + 1}`, s, f, preds, { slipStart: k > 1 });
  }));
  row("MW-M-500", "Permanent power — SEC energisation of the substation", "MW.21", add(PROG.UT1[4][1], 14), add(PROG.UT1[4][1], 14), "UT1-HO-50 FS+14", { ms: true, float: 160 });
  row("MW-LS-600", "Landscape, marina walk & public realm", "MW.22", "2027-09-01", "2028-09-30", "MW-MAR-030 FS, RP1-FAC-30 FS", { float: 60 });
  row("MW-M-900", "Practical completion — Phase 1 (towers, office, promenade, hotel)", "MW.23", "2028-12-15", "2028-12-15", "MT1-HO-50 FS, MT2-HO-50 FS, OF1-HO-50 FS, HB1-HO-50 FS, RP1-HO-50 FS", { ms: true });
  return rows;
}

function marinaPack() {
  const files = {};
  const gfa = B.reduce((s, b) => s + b.gfa, 0);
  files["MW-PM-001 Project Brief.md"] = `# Kinan Marina Walk — Project Brief (MW-PM-001, Rev C)

**Client:** Kinan Marina Development Co. (fictional — demo dataset)  ·  **Location:** Corniche, Al Khobar, Eastern Province  ·  **Data date for reporting:** ${nice(DATA_DATE)}

## 1. The site
A rectangular reclaimed plot of **${SITE.w} m east–west by ${SITE.d} m north–south** (${(SITE.w * SITE.d / 10000).toFixed(2)} ha) on the Al Khobar corniche. The **marina basin is to the north** of the site; the Corniche road runs along the **south** boundary; King Fahd Causeway approach to the east.
All coordinates in the project documents use the **site setting-out grid: origin at the south-west corner of the plot, Easting increasing east, Northing increasing north**, in metres. Site datum 0.000 = +2.40 m above Jeddah Mean Sea Level (reclaimed platform level).

## 2. The development
A mixed-use marina quarter of ${B.length} buildings, about ${Math.round(gfa / 1000)},000 m² GFA:

- **Marina Tower 1** (40 storeys, 286 apartments) and **Marina Tower 2** (36 storeys, 248 apartments) on the water's edge, north-west of centre, both over a shared three-level basement.
- **Marina Office Tower** (22 storeys, 31,000 m² NLA) in the north-east, the tallest commercial building on the Al Khobar corniche when complete.
- **Boutique Hotel** (12 storeys, 148 keys) between the towers and the office, facing the basin.
- **Marina Retail Promenade** (2 storeys, 220 m long) south of the residential towers, forming the marina walk with 38 shops and 14 restaurants.
- **Conference & Cultural Centre** (3 storeys, 1,200-seat hall) south of the office tower.
- **Marina Car Park** (5 levels, 780 bays) in the south-east corner; **Marina Club & Spa** in the west; **Marina Mosque** in the north-east corner; **Substation & Chiller Plant** on the east side.
- A row of **ten 3-storey waterfront villas** along the south-west boundary.

Footprints, levels and exact setting-out are in the Area Schedule (MW-AR-SCH-001) and the Setting-Out schedule (MW-SV-SO-001). The programme is MW-PL-PRG-001 (Primavera P6 export, update UP-11) with its narrative MW-PL-NAR-001.

## 3. Programme
Notice to Proceed **${nice(NTP)}**. Contract practical completion of Phase 1 (towers, office, hotel, promenade) **15 December 2028**; the remaining buildings follow by October 2028 except the villas, handed over in batches from mid-2027.
Status at the data date: marine works complete, Tower 1 frame at L12 (ahead of plan), Tower 2 frame at L8, Office Tower frame behind by 24 days after the raft redesign (RFI-OF1-021), Promenade façade sample rejected (resubmission due 28 October 2026).

## 4. Contracts and budget
- Main contractor: **Bunyan Sharq Contracting** (design-and-build for the superstructure packages). Marine works: **Gulf Marine Works**. Façades: **Skyline Façade Systems** (towers, office) and **Desert Glass Industries** (promenade, cultural centre). MEP: **Gulf Integrated MEP Services**.
- Contract value **${sar(3_140_000_000)}** (Phase 1 ${sar(2_410_000_000)}); approved variations to date ${sar(38_600_000)} (1.2 %); contingency remaining ${sar(91_000_000)}.
- Payment: monthly interim certificates, 10 % retention to 5 % at taking-over.

## 5. Key people
| Role | Name | Organisation |
|---|---|---|
| Project Director | Nasser Al-Dossari | Kinan (client) |
| Development Manager | Development Manager | Kinan (client) |
| Design Manager | Hala Mubarak | Kinan (client) |
| Commercial Manager | Omar Siddiqui | Kinan (client) |
| Project Manager | Rashid Al-Amri | Bunyan Sharq Contracting |
| Construction Manager — Towers | Peter Okafor | Bunyan Sharq Contracting |
| Marine Works Manager | Lars Henriksen | Gulf Marine Works |
| HSE Manager | Noura Al-Shehri | Bunyan Sharq Contracting |

## 6. Top risks (see MW-RM-001)
1. Office Tower raft redesign has consumed the float on the critical path (−24 days). Recovery plan: second formwork set and a 7-day cycle from L4.
2. Promenade façade: glass sample rejected for colour; a second supplier is being prequalified.
3. Tower crane TC2 jib overlaps the hotel plot: lifting plan and zoning required before the hotel frame starts.
4. Summer concreting: night pours for all slabs over 400 m³ from May to September.
5. Marina basin water quality during dredging — environmental permit condition 7, monthly monitoring.

## 7. Authorities
Building permits issued for all Phase 1 buildings (Al Khobar Municipality, Balady). Marine works permit from the Ministry of Transport (ports). Civil defence (fire) approval of the towers' fire strategy received 3 August 2026; the hotel's is pending a smoke-control review.
`;

  files["MW-AR-SCH-001 Area Schedule.csv"] = csv([["Building Ref", "Building Name", "Use", "Storeys Above Ground", "Basement Levels", "Floor-to-Floor (m)", "Footprint E-W (m)", "Footprint N-S (m)", "GFA (m2)", "Units / Keys", "Overall Height (m)"],
    ...B.map((b) => [b.ref, b.name, b.use, b.floors, b.bas, b.ftf.toFixed(2), b.w, b.d, b.gfa, b.units, (b.floors * b.ftf + (b.floors > 10 ? 6 : 1.5)).toFixed(1)])]);

  const so = [["Point ID", "Building Ref", "Corner", "Easting", "Northing", "SSL"]];
  let pid = 100;
  for (const b of B) {
    const ssl = b.bas ? `+0.${b.ref === "OF1" ? "450" : "300"}` : "+0.150";
    for (const [c, de, dn] of [["SW", 0, 0], ["SE", b.w, 0], ["NE", b.w, b.d], ["NW", 0, b.d]]) so.push([`SO-${pid++}`, b.ref, c, (b.e + de).toFixed(3), (b.n + dn).toFixed(3), ssl]);
  }
  files["MW-SV-SO-001 Setting-Out Coordinates.csv"] = `# MW-SV-SO-001 Setting-out schedule — building corners. Grid origin: SW corner of site. Units: m. Levels: SSL (m) above site datum. Surveyed by Sharq Survey Services, Rev 3, ${p6("2026-09-20")}.\n` + csv(so);

  const rows = programme();
  files["MW-PL-PRG-001 Programme Update UP-11 (P6 export).csv"] = `# Primavera P6 export — Kinan Marina Walk — Layout "Update UP-11" — Baseline BL-01 — Data Date ${p6(DATA_DATE)}\n# Start / Finish = actual (A) or forecast; BL = baseline BL-01; Total Float in calendar days against the contract completion (BL-01 practical completion 15-Dec-28)\n`
    + csv([["Activity ID", "Activity Name", "WBS", "Original Duration", "Remaining Duration", "Start", "Finish", "BL Start", "BL Finish", "Total Float", "Critical", "Predecessors", "Activity % Complete"], ...rows]);

  const done = rows.filter((r) => r[12] === "100%").length, started = rows.filter((r) => r[12] !== "0%" && r[12] !== "100%").length;
  files["MW-PL-NAR-001 Programme Narrative UP-11.md"] = `# Kinan Marina Walk — Programme Narrative, Update UP-11 (MW-PL-NAR-001)

**Data date:** ${nice(DATA_DATE)} · **Baseline:** BL-01 (contract) · **Activities:** ${rows.length} (${done} complete, ${started} in progress)

## Overall
Planned progress 27.9 %, earned 26.4 % (−1.5 %). The critical path runs through the **Office Tower**: raft → frame → curtain wall → fit-out → handover → Phase 1 practical completion. It is **24 days late** after the raft was redesigned (RFI-OF1-021: a 1.8 m lens of soft marine clay found under grid 4–6 where the boreholes showed sand; the raft went from 1.6 m to 2.2 m thick with 48 extra bored piles). The contractor's recovery plan — a second formwork set and a 7-day floor cycle from L4 — is accepted in principle and will be reflected in UP-12.

## By building
- **Marina Tower 1** — frame at L12 (31 % of superstructure vs 25 % planned). 7-day cycle holding. Façade unit production started at Skyline's Dammam plant; first batch (120 units) due 12 January 2027.
- **Marina Tower 2** — frame at L8 (planned L8). Core slipform at L11. No issues.
- **Marina Office Tower** — raft poured 29 September 2026 (1,920 m³ in one night pour). Columns to L1 in progress. −24 days; see above.
- **Boutique Hotel** — piling complete (166 piles), pile cap excavation 60 %. Smoke-control review with civil defence is a risk to the fit-out start.
- **Marina Retail Promenade** — frame 94 % (last bay at the east end awaiting the chiller plant connection trench). Façade mock-up **rejected** on 6 October for glass colour (sample MS-RP1-014); resubmission 28 October. Façade start slips 12 days; the promenade handover still holds 60 days of float.
- **Conference & Cultural Centre** — piling started 1 September; 212 of 380 piles done.
- **Marina Car Park** — enabling works; start of piling 1 October as planned.
- **Villas** — start January 2027; design complete, tender returned.
- **Substation & Chiller Plant** — frame complete; cladding in progress; SEC energisation forecast 14 June 2027 (milestone MW-M-500).
- **Marine works** — quay wall and dredging complete (MW-MAR-020, 30 June 2026). Breakwater 55 %.

## Next period (to 14 November 2026)
Tower 1 L13–L16; Tower 2 L9–L12; Office Tower L1–L2; hotel pile caps complete; promenade façade resubmission; cultural centre piling 80 %.
`;

  files["MW-LG-001 Site Logistics Plan.md"] = `# Site Logistics Plan — MW-LG-001 Rev C
Coordinates: site setting-out grid (Easting, Northing), metres, origin at the SW corner of the site. The marina basin is north of the site; the Corniche road is south.

## Roads
- **Perimeter loop road**, two-way, 9 m wide. Centreline: (15, 15) → (405, 15) → (405, 285) → (15, 285) → (15, 15).
- **Central avenue**, 14 m wide, east–west, the future marina walk service road. Centreline: (15, 110) → (405, 110).
- **Hotel access road**, 8 m wide, north–south. Centreline: (260, 110) → (260, 285).

## Gates
- **Gate 1** (personnel and visitors, south, off the Corniche) at (210, 0). Turnstiles, induction room, 400 lockers.
- **Gate 2** (materials and heavy vehicles, east) at (420, 60). Weighbridge and wheel wash inside the gate.
- **Gate 3** (marine works, north-east) at (400, 300). Barge landing.

## Tower cranes
| Crane | Position (E, N) | Jib radius | Hook height | Serves |
|---|---|---|---|---|
| TC1 | (112, 246) | 60 m | 165 m | Marina Tower 1 |
| TC2 | (180, 250) | 55 m | 150 m | Marina Tower 2 and hotel (shared, zoned) |
| TC3 | (356, 230) | 50 m | 110 m | Marina Office Tower |
| TC4 | (170, 150) | 45 m | 40 m | Retail Promenade (dismantled March 2027) |

## Zones
- **Laydown A** (rebar, formwork, façade units): E 230–290, N 120–160.
- **Laydown B** (MEP, pipes, cable drums): E 330–400, N 70–110.
- **Batching plant** (2 × 120 m³/h): E 360–410, N 20–60. Silos 4 × 100 t.
- **Contractor's compound** (offices, welfare, clinic, 1,200-person canteen): E 20–60, N 120–180.
- **Marine compound** (Gulf Marine Works): E 380–420, N 260–300.
- **Public realm / marina walk** (landscape, from 2027): E 60–280, N 182–200.
`;

  files["MW-ST-DBR-001 Structural Design Basis.md"] = `# Structural Design Basis — MW-ST-DBR-001 Rev 2

## Codes
SBC 301 (loads), SBC 304 (concrete), SBC 306 (steel), SBC 303 (soils and foundations); ACI 318-19 and ASCE 7-16 where SBC refers to them. Wind: 3-second gust 162 km/h, exposure D (open water to the north). Seismic: SBC 301 zone, Ss = 0.12 g, S1 = 0.04 g, site class D.

## Towers (MT1, MT2)
- Reinforced concrete flat-plate residential towers: 280 mm post-tensioned flat slabs (bonded PT, 15.2 mm strand), 650 × 1,600 mm perimeter columns tapering to 500 × 1,200 mm above L30, central core with 400–600 mm walls.
- Floor-to-floor 3.40 m; podium levels (L1–L2) 5.00 m. Outrigger level at L20 (MT1) and L18 (MT2).
- Foundation: 2.5 m raft on 1,200 mm bored piles to 42 m (MT1: 164 piles; MT2: 146 piles). Shared basement B1–B3 under both towers, 10.2 m deep, secant pile wall with two rows of ground anchors.
- Concrete: columns and core C60 to L20 then C50; slabs C40; raft C40 with 60 % GGBS for heat of hydration.

## Office Tower (OF1)
- Composite steel frame: 350 mm composite deck on cellular beams, 3.90 m floor-to-floor, concrete core. Raft 2.2 m (revised, RFI-OF1-021) on 1,000 mm piles to 38 m plus 48 additional piles under grids 4–6.
- Perimeter columns at 9.0 m centres; 12 m clear spans; floor plate 52 × 36 m.

## Promenade, cultural centre, hotel, car park
- Promenade: RC frame, 9 × 9 m grid, 5.60 m floor-to-floor, 300 mm PT slab roof with landscape loading 10 kN/m².
- Cultural centre: long-span steel roof trusses (60 m) on RC walls; hall floor raked precast.
- Hotel: RC flat slab, 3.50 m, transfer slab at L1 (1,200 mm) over the ballroom.
- Car park: precast double-tee system, 3.00 m, 16 m clear bays.

## Durability
Marine exposure XS3 for all elements below +3.5 m: 75 mm cover, C40 minimum with 50 % GGBS, crystalline waterproofing to the basement raft and walls, cathodic protection to the quay wall sheet piles.
`;

  files["MW-GE-001 Geotechnical Summary.md"] = `# Geotechnical Investigation Summary — MW-GE-001 (Sharq Geo Consultants, Rev 1 + Addendum A)

Twenty-two boreholes to 50 m, 9 CPTs, 6 pumping tests. Reclaimed platform 1.8–2.6 m of hydraulically placed sand over 3–5 m of beach sand, then interbedded calcarenite and sand to 35–40 m over dense sand and weak rock.
Groundwater at +0.4 m (tidal, 0.3 m range). Chlorides 19,000 mg/l, sulphates 2,600 mg/l: exposure class XS3 / aggressive.

**Addendum A (12 August 2026):** during pile boring for the Office Tower a 1.8 m lens of very soft marine clay was found between 9.5 m and 11.3 m under grids 4–6, not seen in boreholes BH-14 and BH-15. Pile lengths under those grids increased to 38 m; the raft was thickened to 2.2 m with 48 extra piles (RFI-OF1-021). Settlement estimate revised to 28 mm total, 12 mm differential, within the 1:500 criterion.

Pile design loads: 1,200 mm — 9,800 kN (towers); 1,000 mm — 6,400 kN (office, hotel); 750 mm — 3,200 kN (promenade, cultural centre). Static load tests: 6 preliminary (all passed), working tests 1 % of piles.
`;

  files["MW-DC-REG-001 Drawing Register.csv"] = csv([["Drawing No", "Title", "Discipline", "Building", "Rev", "Status", "Issued"],
    ["MW-A-001", "Master Plan & Site Layout", "ARC", "Site", "F", "IFC", "2026-05-14"],
    ["MW-A-010", "Setting-Out Plan", "ARC", "Site", "D", "IFC", "2026-05-14"],
    ["MW-A-101", "Marina Tower 1 — Typical Floor Plan L5–L30", "ARC", "MT1", "C", "IFC", "2026-06-02"],
    ["MW-A-102", "Marina Tower 1 — Building Sections", "ARC", "MT1", "C", "IFC", "2026-06-02"],
    ["MW-A-201", "Marina Tower 2 — Typical Floor Plan L5–L28", "ARC", "MT2", "B", "IFC", "2026-06-20"],
    ["MW-A-301", "Marina Office Tower — Typical Floor Plan", "ARC", "OF1", "B", "IFC", "2026-07-08"],
    ["MW-A-401", "Boutique Hotel — Floor Plans L1–L12", "ARC", "HB1", "A", "IFC", "2026-08-01"],
    ["MW-A-501", "Retail Promenade — Ground & First Floor Plans", "ARC", "RP1", "D", "IFC", "2026-04-28"],
    ["MW-A-510", "Retail Promenade — Façade Elevations & Glass Schedule", "ARC", "RP1", "E", "IFC (glass under resubmission)", "2026-09-30"],
    ["MW-A-601", "Conference & Cultural Centre — Plans", "ARC", "CC1", "B", "IFC", "2026-08-15"],
    ["MW-A-701", "Marina Car Park — Typical Level", "ARC", "CP1", "A", "IFC", "2026-09-01"],
    ["MW-A-801", "Waterfront Villas — Type V1 Plans & Elevations", "ARC", "V01–V10", "B", "Tender", "2026-09-15"],
    ["MW-S-001", "Foundation Layout — Towers & Shared Basement", "STR", "MT1/MT2", "D", "IFC", "2026-01-10"],
    ["MW-S-101", "Marina Tower 1 — Typical PT Slab Layout", "STR", "MT1", "C", "IFC", "2026-06-02"],
    ["MW-S-301", "Marina Office Tower — Raft Plan & Details (revised)", "STR", "OF1", "E", "IFC (RFI-OF1-021)", "2026-08-25"],
    ["MW-S-302", "Marina Office Tower — Composite Floor Framing", "STR", "OF1", "B", "IFC", "2026-07-08"],
    ["MW-M-001", "Site Utilities & District Cooling Network", "MEP", "Site", "C", "IFC", "2026-03-30"],
    ["MW-M-101", "Marina Tower 1 — MEP Coordination L5–L30", "MEP", "MT1", "B", "IFC", "2026-06-25"],
    ["MW-C-001", "Marine Works — Quay Wall & Dredging", "CIV", "Site", "C", "As-built", "2026-07-15"],
    ["MW-L-001", "Logistics Plan Rev C", "CIV", "Site", "C", "Current", "2026-09-01"],
  ]);

  files["MW-PR-LOG-001 Procurement Log.csv"] = csv([["Package", "Description", "Trade", "Supplier", "Budget (SAR)", "Committed (SAR)", "Status", "Lead Time (weeks)", "Need-by Activity", "Need-by Date", "Forecast Delivery", "Slip (days)", "Notes"],
    ["MW-PKG-01", "Reinforcement steel (all buildings)", "Structure", "Najd Steel Supply", 118000000, 104200000, "Delivering", 4, "MT1-STR-20", "2026-08-16", "ongoing call-offs", 0, "480 t per batch; mill certificates per heat"],
    ["MW-PKG-02", "Ready-mix top-up to batching plant", "Structure", "Qimma Concrete Products", 64000000, 58900000, "Delivering", 1, "MT1-STR-20", "2026-08-16", "ongoing", 0, "Night pours over 400 m³ May–Sep"],
    ["MW-PKG-03", "Post-tensioning materials & specialist", "Structure", "PT-Tech Post-Tensioning", 17200000, 16800000, "Delivering", 6, "MT1-STR-20", "2026-08-16", "ongoing", 0, ""],
    ["MW-PKG-04", "Structural steel — Office Tower frame", "Structure", "Sharq Steel Fabricators", 86000000, 84100000, "Fabricating", 14, "OF1-STR-20", "2026-09-01", "2026-11-20", 0, "First 4 floors in the yard; erection from L1 Nov"],
    ["MW-PKG-05", "Unitised curtain wall — Marina Towers 1 & 2", "Façade", "Skyline Façade Systems", 236000000, 231500000, "Manufacturing", 18, "MT1-FAC-30", "2027-02-01", "2027-01-12", -20, "Batch 1 of 120 units; PMU passed 22 Sep"],
    ["MW-PKG-06", "Unitised curtain wall — Office Tower", "Façade", "Skyline Façade Systems", 98000000, 96200000, "Design", 18, "OF1-FAC-30", "2027-02-08", "2027-02-01", -7, "Shop drawings 70 % approved"],
    ["MW-PKG-07", "Promenade & cultural centre glazing", "Façade", "Desert Glass Industries", 42000000, 39800000, "Sample rejected", 12, "RP1-FAC-30", "2027-01-27", "2027-02-15", 19, "Glass colour sample MS-RP1-014 rejected 6 Oct; second supplier being prequalified"],
    ["MW-PKG-08", "Lifts — towers, office, hotel (34 no.)", "Lifts", "Vertex Lifts Arabia", 92000000, 90600000, "Manufacturing", 28, "MT1-FIT-40", "2027-05-01", "2027-04-10", -21, ""],
    ["MW-PKG-09", "District cooling plant — 3 × 1,200 TR chillers", "MEP", "Coolwave HVAC Trading", 41000000, 40200000, "Manufacturing", 24, "UT1-FIT-40", "2026-11-15", "2026-12-05", 20, "Factory test moved to 10 Nov; interim chillers hired"],
    ["MW-PKG-10", "Transformers & RMUs (2 × 3 MVA)", "Electrical", "Transformers Arabia (demo)", 9800000, 9600000, "Delivered", 20, "UT1-FIT-40", "2026-11-15", "2026-10-02", -44, "On site, in the substation"],
    ["MW-PKG-11", "LV/HV cables", "Electrical", "Riyadh Cable Co. (demo)", 33000000, 21700000, "Delivering", 8, "MT1-FIT-40", "2027-05-01", "ongoing", 0, ""],
    ["MW-PKG-12", "Marine fenders, pontoons & mooring", "Marine", "Gulf Marine Works", 27000000, 27000000, "Delivering", 16, "MW-MAR-030", "2027-03-31", "2027-02-20", -39, ""],
    ["MW-PKG-13", "Hotel FF&E", "Fit-out", "Diwan Interiors", 38000000, 0, "Tender", 22, "HB1-FIT-40", "2028-01-15", "", 0, "Tender returns 30 Nov 2026"],
    ["MW-PKG-14", "Landscape & marina walk hard landscape", "Landscape", "Wahat Landscaping", 56000000, 0, "Tender", 10, "MW-LS-600", "2027-09-01", "", 0, ""],
  ]);

  files["MW-RM-001 Risk Register.csv"] = csv([["ID", "Risk", "Cause", "Effect", "Likelihood (1-5)", "Impact (1-5)", "Score", "Owner", "Response", "Status", "Review"],
    ["R-01", "Office Tower critical path late", "Raft redesign after soft clay lens (RFI-OF1-021)", "−24 days to Phase 1 completion; LDs SAR 420k/day", 4, 5, 20, "Rashid Al-Amri", "Second formwork set, 7-day cycle from L4, steel erection two floors ahead", "Open", "2026-10-28"],
    ["R-02", "Promenade façade glass colour", "Sample MS-RP1-014 rejected", "Façade start +12 days; possible supplier change", 3, 3, 9, "Hala Mubarak", "Resubmission 28 Oct; prequalify second supplier", "Open", "2026-10-28"],
    ["R-03", "Crane TC2 overlap with hotel plot", "Shared crane zoning", "Hotel frame start delayed if zoning not agreed", 3, 3, 9, "Peter Okafor", "Anti-collision system, lifting plan by 15 Nov", "Open", "2026-11-15"],
    ["R-04", "Summer concreting quality", "Ambient over 40 °C", "Thermal cracking of rafts and slabs", 3, 4, 12, "QA/QC Manager", "Night pours, chilled water, 60 % GGBS for rafts", "Mitigated", "2027-04-01"],
    ["R-05", "Marina water quality", "Dredging plume", "Environmental permit condition 7 breach; stop-work", 2, 4, 8, "Lars Henriksen", "Silt curtains, monthly monitoring (all within limits)", "Closed", "2026-07-15"],
    ["R-06", "District cooling late", "Chiller factory test slipped", "Fit-out commissioning delayed", 3, 3, 9, "MEP Manager", "Interim chillers hired for first fix testing", "Open", "2026-11-10"],
    ["R-07", "Hotel smoke-control approval", "Civil defence review pending", "Hotel fit-out start at risk", 2, 4, 8, "Authorities Manager", "Fire engineer meeting 20 Oct", "Open", "2026-10-20"],
    ["R-08", "Labour availability (Hajj / Ramadan 2027)", "Seasonal reduction", "Productivity −20 % for 6 weeks", 4, 2, 8, "Rashid Al-Amri", "Camp expansion +600 beds; advance bookings", "Open", "2027-01-15"],
  ]);

  files["README — how to use this pack.md"] = `# Kinan Marina Walk — sample project pack

A complete, consistent set of project documents for a fictional second project. Use it to test **New project** in the Onsite Agent: the AI reads these files and builds the 4D model and programme from them.

How to test:
1. Projects → **New project** → drop this folder (or the zip) on the upload area → **Create project**. Watch the timer: the documents are read by the AI every time.
2. Check **What it read**: ${B.length} buildings, site ${SITE.w} × ${SITE.d} m, the data date ${nice(DATA_DATE)}, and the −24-day critical path through the Office Tower.
3. Play the 4D model. Marina Tower 1 should be at about L12, Tower 2 at L8, the office raft just poured, the promenade frame nearly complete.
4. Ask the agent: "What is on the critical path?", "Why is the office tower late?", "Which packages have slipped?", "When is the promenade façade resubmission?"

Files: project brief · area schedule · setting-out coordinates · P6 programme export (UP-11, ${programme().length} activities with baseline, float, logic and progress) · programme narrative · site logistics plan · structural design basis · geotechnical summary · drawing register · procurement log · risk register.
`;
  return files;
}

// =====================================================================================================================
// 2. KINAN HEIGHTS — site documents to upload into the live project (Documents tab or WhatsApp)
// =====================================================================================================================
function heightsDocs() {
  const files = {};
  const today = nice(DATA_DATE);
  files["KH-RFI-0163 Trimmer bars at lift pit opening Tower A L14.md"] = `# RFI-0163 — Trimmer bars at the lift-pit opening, Tower A Level 14 slab

**Project:** Kinan Heights (KH-2026) · **Raised by:** Al-Bunyan Contracting (Main Contractor), Karim Mansour, Construction Manager — Towers · **Date:** ${nice(add(DATA_DATE, -2))} · **Response required by:** ${nice(add(DATA_DATE, 3))} · **Discipline:** Structural · **Priority:** High (holds the L14 pour)

## Query
Drawing S-214 Rev C (Slab Framing & PT Layout, Tower A typical L13–L20) shows 2 × T20 trimmer bars each side of the lift-pit opening at grid C/4–C/5. The opening on site is 2,650 mm wide against 2,400 mm on the drawing, because the lift supplier (Vertex Lifts Arabia) increased the shaft clearance in their shop drawing VL-A-114 Rev 2. The PT tendon T-14 and T-15 anchorages now fall 110 mm inside the trimmer zone.

Please confirm: (a) trimmer bar size and number for a 2,650 mm opening; (b) whether tendons T-14/T-15 may be deviated 150 mm west to clear the opening; (c) any additional hairpin bars at the re-entrant corners.

## Related
Note on drawing d_seed02 ("Confirm trimmer bars at lift pit opening before L13 pour"); RFI-0142 (CHW pipe vs PT beam at C/3) — the same zone. Activity TA-STR-L14 (columns, core walls & PT slab) is at 86 % with the pour planned ${nice("2026-10-15")}; TA-PT-L14 stressing ${nice("2026-10-22")}.

## Response (Structural Engineer of Record, ${today})
(a) 3 × T20 each side, 2,400 mm long, plus 2 × T16 top and bottom across the short sides. (b) Yes: deviate T-14 and T-15 by 150 mm west with a minimum radius of 6 m; update the tendon schedule. (c) 2 × T12 hairpins at each re-entrant corner, 1,200 mm legs. Sketch SK-S-214-07 attached. Status: **Answered** — drawing revision S-214 Rev D to follow within 5 days; proceed on the sketch.
`;

  files["KH-NCR-0089 Column cover Tower A L13.md"] = `# NCR-0089 — Reinforcement cover below specification, Tower A Level 13 columns C-7 and C-8

**Project:** Kinan Heights · **Raised by:** Resident Engineer (client's supervision consultant) · **Against:** Al-Bunyan Contracting (Main Contractor) · **Date:** ${nice(add(DATA_DATE, -1))} · **Location:** Tower A, Level 13, grid C/7 and C/8 · **Severity:** Major · **Status:** Open · **Due:** ${nice(add(DATA_DATE, 13))}

## Non-conformance
Cover-meter survey after striking the column formwork on Level 13 measured 22–27 mm cover to the links on the east faces of columns C-7 and C-8, against **40 mm specified** (Concrete Specification 03 30 00 §3.4, exposure XC4). Six readings per face, calibrated Profometer, survey sheet CS-TA-L13-02. Columns are C60, cast ${nice(add(DATA_DATE, -5))} (pour card PC-TA-13-0412). Likely cause: spacers displaced during the pour, column cages not tied to the kicker.

## Disposition proposed by the contractor
Apply a 15 mm polymer-modified cementitious render (Sika MonoTop-412 or equal) to the affected faces after surface preparation, in line with the repair method statement MS-REP-004, and increase spacer frequency to 600 mm on all tower columns. Structural adequacy unaffected (cover is a durability requirement).

## Engineer's decision
Pending: a core sample to confirm actual cover and compaction; then accept the render repair or require removal. Hold on TA-STR-L14 column pours at C-7 and C-8 until spacer arrangement is inspected (ITR-0412).
`;

  files["KH-MS-STR-014 Method Statement PT stressing and grouting Tower A L14.md"] = `# Method Statement MS-STR-014 Rev 1 — Post-tension stressing and grouting, Tower A Level 14 slab

**Contractor:** PT-Tech Post-Tensioning (specialist) for Al-Bunyan Contracting · **Activity:** TA-PT-L14 (PT stressing & grouting, planned ${nice("2026-10-22")}–${nice("2026-10-24")}) · **Prepared by:** PT-Tech site engineer · **Reviewed:** QA/QC Manager (Maria Santos) · **HSE review:** Sanjay Menon · **Status:** Approved with comments, ${today}

## 1. Scope
Stressing of 142 bonded tendons (15.2 mm, 4-strand flat ducts) in the Level 14 flat slab (280 mm), followed by grouting. Tendons T-14 and T-15 deviated per RFI-0163.

## 2. Sequence
1. Cube results: stressing only when the slab concrete reaches **32 MPa** (stressing strength) — cubes from pour PC-TA-14, tested at the site lab (see KH-LAB-CC-1407 for the L13 slab as reference).
2. Remove pocket formers, check anchorages and wedges, mark strands for elongation.
3. Stress in the sequence shown on PT shop drawing PT-A-14 Rev B: banded tendons first (north–south), then distributed (east–west), 25 % then 100 % of jacking force (0.8 fpu = 195 kN per strand).
4. Record elongation per strand; tolerance **±7 % of theoretical** (individual) and ±5 % (group). Out-of-tolerance tendons: hold, inform the PT designer, do not cut strands.
5. Cut strands 20 mm from the wedges, seal with epoxy cap, pack pockets with non-shrink grout.
6. Grout within 7 days of stressing: 0.42 w/c with expanding admixture, fluidity 12–25 s (flow cone), bleed < 2 %. Vent sequence low to high; grout until consistent grout flows from the vents.

## 3. Plant and people
Two 250 kN mono-strand jacks (calibrated within 6 months, certificates attached), two colloidal grout mixers, one PT supervisor, four technicians, one QA inspector.

## 4. Safety
Exclusion zone 1.5 m behind every live anchorage, no one in line with the jack; stressing stops when wind exceeds 38 km/h at L14; edge protection in place before pocket formers are removed; permit to work for the grouting pump near the hoist landing.

## 5. Hold points
H1 cube strength before stressing (QA) · H2 elongation records reviewed before cutting strands (PT designer) · H3 grout test cubes and fluidity before grouting (QA).
`;

  files["KH-ITR-0412 Inspection request rebar and formwork Tower A L14 slab.md"] = `# Inspection & Test Request ITR-0412 — Reinforcement, PT and formwork before pour, Tower A Level 14 slab

**Raised by:** Al-Bunyan Contracting, QA/QC (Maria Santos) · **Inspection by:** Resident Engineer's team · **Requested for:** ${nice(add(DATA_DATE, 1))}, 06:00 · **Activity:** TA-STR-L14 (86 %) · **Pour:** PC-TA-14, 410 m³ C40, night pour (Method Statement — Night Concrete Pours)

| Check | Reference | Contractor | Engineer |
|---|---|---|---|
| Formwork level, line and props | S-214 Rev C, formwork design FS-A-14 | ✔ | |
| Bottom mesh and cover (40 mm spacers at 600 mm) | S-214, NCR-0089 (spacers) | ✔ | |
| PT tendon profiles and chairs (heights at 1 m centres) | PT-A-14 Rev B | ✔ | |
| Tendons T-14/T-15 deviated 150 mm west; trimmers 3 × T20 at lift pit | RFI-0163 / SK-S-214-07 | ✔ | |
| Anchorage pockets, bursting reinforcement | PT-A-14 | ✔ | |
| MEP sleeves and embeds (CHW Ø150 sleeve at C/3 per RFI-0142) | MEP Coordination Plan L14 | ✔ | |
| Column starter bars, core wall couplers | S-210 | ✔ | |
| Edge protection and access | HSE | ✔ | |

Contractor's comment: 142 tendons placed; 38 chairs replaced after the survey; sleeve at C/3 relocated 60 mm. Request release of the pour for ${nice(add(DATA_DATE, 1))} 20:00.
Engineer's result: ______ (Accepted / Accepted with comments / Rejected)
`;

  files["KH-WPR-041 Weekly progress report week 41.md"] = `# Kinan Heights — Weekly Progress Report No. 41

**Period:** ${nice(add(DATA_DATE, -7))} to ${today} · **Issued by:** Al-Bunyan Contracting, Ahmed Saleh (Project Manager) · **To:** Kinan Development Manager

## 1. Summary
Overall physical progress **46.8 %** against **49.2 %** planned (−2.4 %). The critical path is still Tower A's frame: the L14 slab pours on ${nice(add(DATA_DATE, 1))}, one day later than last week's forecast after RFI-0163 (trimmer bars) was answered today. Tower B is on programme. Hotel Block C frame is 9 days late at L4 (transfer beams). The podium atrium roof steel is 85 % and will finish on ${nice("2026-10-20")}.

## 2. By area
- **Tower A** — L13 columns complete (NCR-0089 raised on two columns: cover). L14 slab reinforcement and PT 86 %, ITR-0412 booked. Façade zone 2 (L5–L8) 70 % installed; zone 3 starts ${nice("2026-10-20")}. Fit-out L2 97 %, L3 55 %, L4 started.
- **Tower B** — L32 slab poured; roof slab next week. Façade zone 7 complete, zone 8 (L29–L32) from ${nice("2026-11-11")}. NCR-0087 (embeds ±10 mm) still open pending RFI-0157.
- **Hotel Block C** — L4 transfer beams cast; L5 formwork. Recovery: second table-form set arrives ${nice(add(DATA_DATE, 4))}.
- **Podium** — atrium roof steel 85 %; glazing package (VO-023, +380 m²) awaiting the Development Manager's approval (see KH-CN-031).
- **Villas D** — villas 1–6 roofs complete; 7–12 at first floor.
- **Infrastructure** — utility corridor 72 %; STP civil works complete; SEC substation energisation still ${nice("2026-12-10")}.

## 3. Procurement
Rebar call-off PO-4500123 batch 6 received (delivery note KH-DN-00231). Façade batch 4 for Tower A still +18 days (glass). Chillers factory witness test confirmed 12 November. BMU RFQ +35 days: three bids received this week.

## 4. Manpower and plant
Average 2,860 workers/day (peak 3,040 on ${nice(add(DATA_DATE, -3))}); 3 tower cranes, 2 hoists, 1 batching plant at 92 % utilisation. 41 night-shift pours this quarter.

## 5. HSE
1 near miss (INC-2026-041, unsecured plywood, Tower B L31), 0 LTIs, 1.42 million safe hours since the last LTI. Heat-stress plan ends 15 October. Observation KH-HSE-OBS-0338 raised on edge protection at Tower B L31.

## 6. Quality
NCRs open: 6 (2 major). ITRs this week: 38 raised, 34 accepted, 2 rejected, 2 pending. Cube results for the L13 slab all above 40 MPa at 28 days (KH-LAB-CC-1407).

## 7. Look-ahead (weeks 42–43)
Tower A L14 pour, L14 PT stressing (${nice("2026-10-22")}), L15 columns; Tower B roof slab; Hotel L5 slab; atrium roof steel complete; façade zone 3 start; chiller FAT.
`;

  files["KH-DN-00231 Delivery note rebar PO-4500123.csv"] = `# Delivery note DN-00231 — Najd Steel Supply to Kinan Heights — against PO-4500123 (PKG-01 Reinforcement steel), call-off batch 6
# Delivered ${p6(add(DATA_DATE, -1))} 22:40, slot 22:00–00:00, Gate 2, unloaded at the rebar yard. Vehicle: flatbed 3-axle, plate 7412 RKA. Received by: Hassan Nouri (Logistics). GRN: GRN-27418
` + csv([["Line", "Item", "Grade", "Diameter (mm)", "Length (m)", "Bundles", "Weight (t)", "Heat No", "Mill Certificate", "Condition"],
    [1, "Rebar Grade 60", "ASTM A615 Gr 60", 16, 12, 24, 38.4, "H-26-4471", "MC-4471-A", "OK"],
    [2, "Rebar Grade 60", "ASTM A615 Gr 60", 20, 12, 18, 42.6, "H-26-4472", "MC-4472-A", "OK"],
    [3, "Rebar Grade 60", "ASTM A615 Gr 60", 25, 12, 12, 44.1, "H-26-4480", "MC-4480-A", "OK"],
    [4, "Rebar Grade 60", "ASTM A615 Gr 60", 12, 12, 10, 10.6, "H-26-4466", "MC-4466-A", "2 bundles surface rust, accepted (light)"],
    [5, "Rebar Grade 60", "ASTM A615 Gr 60", 32, 12, 6, 28.9, "H-26-4483", "MC-4483-A", "OK"],
  ]) + `# Total 164.6 t. Short delivery: 8 bundles Ø10 (12.5 t) not loaded — to follow on batch 7, ${p6(add(DATA_DATE, 6))}. Tested samples: 3 per diameter sent to the site lab (tensile, bend).\n`;

  files["KH-PTW-2026-1187 Permit to work hot work atrium roof steel.md"] = `# Permit to Work PTW-2026-1187 — Hot work (welding and cutting), atrium roof steel, Podium Level 2

**Issued to:** Al-Bunyan Contracting steel crew (foreman: R. Villanueva) · **Activity:** PD-ATR-STL (atrium roof steel & edge protection, 85 %) · **Location:** Podium L2, atrium roof, grid P4–P9 · **Valid:** ${today} 06:00 to 18:00 (single shift; re-issue for the night shift) · **Issued by:** Sanjay Menon (HSE Manager) · **Authorised by:** Yousef Darwish (Construction Manager — Hotel & Podium)

## Work
Site welding of 14 splice plates on the atrium roof trusses T3–T6 and cutting of edge-protection posts.

## Conditions
- Fire watch for the duration and 60 minutes after; two 9 kg CO₂ extinguishers and a fire blanket at each work point; combustibles removed 10 m around.
- Gas cylinders upright and secured on trolleys, flashback arrestors fitted, hoses inspected (tag HS-0931).
- Welders' hot-work training valid (cards checked); welding screens at the atrium edge, fume extraction at the enclosed truss ends.
- Work at height: double lanyards clipped to the static line SL-ATR-02; edge protection complete before removing the temporary guardrail.
- Stop work if wind exceeds 40 km/h at roof level or if the podium-roof glazing crews are working below (coordinate with Skyline).
- Isolation: none required. Gas test: not required (open roof).

## Sign-off
Hot-work equipment checked ✔ · Fire watch briefed ✔ · Area cleared ✔ · **Permit closed at:** ______ · Fire watch completed at: ______
`;

  files["KH-HSE-OBS-0338 Safety observation edge protection Tower B L31.md"] = `# Safety Observation OBS-0338 — Edge protection removed and not reinstated, Tower B Level 31 (north edge)

**Observed by:** Tariq Aziz (HSE Officer, night shift) · **Date/time:** ${nice(add(DATA_DATE, -1))}, 23:20 · **Location:** Tower B, Level 31, north slab edge between grids B/2 and B/5 (about 18 m) · **Category:** Unsafe condition — fall from height · **Risk:** High · **Status:** Open, immediate action taken

## What was observed
A section of the slab-edge guardrail had been removed to land the façade unit cassette by crane TC2 and was not reinstated after the lift. Two formwork carpenters were working within 2 m of the open edge without harnesses clipped on. This is the same level as near miss INC-2026-041 (unsecured plywood, ${nice("2026-10-10")}).

## Immediate action
Work stopped, the two workers moved back, guardrail reinstated by 23:45, toolbox talk given at the start of the next shift (28 attendees).

## Root cause (preliminary)
No permit or barrier-removal tag was used for the lift; the façade lifting supervisor and the formwork foreman did not hand over the edge. The lifting plan for façade cassettes does not include guardrail reinstatement as a step.

## Actions
1. Add "guardrail reinstated and checked" as a sign-off step on the façade lifting plan (Bilal Khan, Lifting Supervisor) — due ${nice(add(DATA_DATE, 2))}.
2. Barrier-removal tags issued to all lifting supervisors (Sanjay Menon) — due ${nice(add(DATA_DATE, 1))}.
3. Weekly night-shift edge inspection on all live floors of Tower A and B (Tariq Aziz) — ongoing.
`;

  files["KH-MOM-PM-038 Progress meeting minutes 38.md"] = `# Progress Meeting No. 38 — Minutes

**Date:** ${nice(add(DATA_DATE, -1))}, 10:00–12:10, site office · **Chair:** Development Manager (Kinan) · **Present:** Faisal Al-Harbi (Project Director, Kinan), Rania Haddad (Design Manager, Kinan), Omar Siddiqui (Commercial Manager, Kinan), Lina Al-Qahtani (Authorities, Kinan), Ahmed Saleh (PM, Al-Bunyan), Karim Mansour (CM Towers, Al-Bunyan), Yousef Darwish (CM Hotel & Podium, Al-Bunyan), Maria Santos (QA/QC, Al-Bunyan), Sanjay Menon (HSE, Al-Bunyan), Skyline Façade Systems (project manager), Gulf Integrated MEP Services (project manager) · **Apologies:** Vertex Lifts Arabia

| # | Item | Discussion | Action | By | Due |
|---|---|---|---|---|---|
| 38.1 | Progress | 46.8 % vs 49.2 % planned. Critical path Tower A frame; hotel 9 days late. Contractor to present the recovery programme for Hotel Block C. | Recovery programme for Hotel C | Ahmed Saleh | ${nice(add(DATA_DATE, 6))} |
| 38.2 | RFI-0163 | Trimmer bars at the L14 lift pit: EOR to answer by ${nice(add(DATA_DATE, 3))} so the L14 pour is not delayed. (Answered ${today}.) | Issue S-214 Rev D | Rania Haddad | ${nice(add(DATA_DATE, 5))} |
| 38.3 | NCR-0089 | Column cover Tower A L13: core sample this week; render repair likely acceptable. Spacer frequency increased site-wide. | Core sample and report | Maria Santos | ${nice(add(DATA_DATE, 4))} |
| 38.4 | NCR-0087 / RFI-0157 | Tower B embeds ±10 mm: façade consultant to confirm whether 38 channels need drill-and-anchor remedials. Zone 8 start (${nice("2026-11-11")}) at risk. | Response to RFI-0157 | Rania Haddad | ${nice(add(DATA_DATE, 7))} |
| 38.5 | VO-023 | Atrium glazing +380 m² (SAR 1.84 M): change notice KH-CN-031 presented; Commercial recommends approval; glazing start ${nice("2026-11-15")} needs the order placed by ${nice(add(DATA_DATE, 9))}. | Decision on VO-023 | Development Manager | ${nice(add(DATA_DATE, 7))} |
| 38.6 | Façade batch 4 | Tower A façade batch 4 +18 days (glass from the Chinese supplier). Skyline to re-sequence zone 4 panels from batch 5 stock. | Re-sequencing proposal | Skyline PM | ${nice(add(DATA_DATE, 5))} |
| 38.7 | Chillers | Factory witness test 12 November, Coolwave Jebel Ali. Kinan to attend (2 people). | Travel booking | Development Manager | ${nice(add(DATA_DATE, 14))} |
| 38.8 | BMU | RFQ +35 days; three bids in. Technical evaluation next week. | Evaluation report | Omar Siddiqui | ${nice(add(DATA_DATE, 10))} |
| 38.9 | HSE | Near miss INC-2026-041 and observation OBS-0338 on Tower B L31 — same level, same week. Client asked for a stand-down on edge protection on all live floors. | Stand-down talks, all crews | Sanjay Menon | ${nice(add(DATA_DATE, 2))} |
| 38.10 | Permits | Hotel civil defence approval for the revised fire strategy: submitted, response expected in 3 weeks. | Follow up with civil defence | Lina Al-Qahtani | ${nice(add(DATA_DATE, 21))} |
| 38.11 | Next meeting | ${nice(add(DATA_DATE, 6))}, 10:00. | | | |
`;

  files["KH-CN-031 Change notice VO-023 atrium glazing.md"] = `# Change Notice CN-031 — Variation Order VO-023: Atrium structural glazing, additional 380 m²

**Project:** Kinan Heights · **Raised by:** Omar Siddiqui (Commercial Manager, Kinan) · **Date:** ${nice(add(DATA_DATE, -3))} · **Status:** For approval by the Development Manager · **Decision needed by:** ${nice(add(DATA_DATE, 9))} (to hold the glazing start ${nice("2026-11-15")})

## Change
The architect's revision of the podium atrium roof (drawing A-301 Rev G) extends the structural glazing from the original 1,120 m² to 1,500 m² to close the east gable, replacing the aluminium louvres originally shown. Affects package PKG-08 (Atrium structural glazing, Desert Glass Industries) and activity PD-ATR-GLZ.

## Cost
| Item | SAR |
|---|---|
| Additional structural glazing 380 m² at 4,210/m² | 1,599,800 |
| Additional secondary steel and brackets | 164,000 |
| Design and engineering (Desert Glass) | 48,000 |
| Preliminaries and attendance (Al-Bunyan, 1.8 %) | 32,600 |
| **Total** | **1,844,400** |

Budget: within the design-development allowance (SAR 6.5 M, of which SAR 3.9 M committed). No change to contingency.

## Time
No change to the completion date if ordered by ${nice(add(DATA_DATE, 9))}: the extra panels are fabricated in the same production slot. After that date, 2 weeks per week of delay on PD-ATR-GLZ (float 21 days).

## Recommendation
Approve VO-023 at SAR 1,844,400 against the design-development allowance. Instruct Al-Bunyan to place the order with Desert Glass Industries; PKG-08 committed value becomes SAR 9,604,400.

Approved / Rejected: ____________ Development Manager, date ______
`;

  files["KH-MAT-SUB-0271 Material submittal facade panel glass batch 4.md"] = `# Material Submittal MS-0271 Rev B — Insulated glass units for unitised panel type A, Tower A façade batch 4 (zone 4, L13–L16)

**Submitted by:** Skyline Façade Systems · **Package:** PKG-06 (Unitised curtain wall — Tower A) · **Activity:** TA-FAC-Z4 (start ${nice("2026-11-21")}) · **Date:** ${nice(add(DATA_DATE, -4))} · **Review:** Rania Haddad (Design Manager) with the façade consultant · **Status:** Rev A rejected ${nice(add(DATA_DATE, -12))} (manufacturer change not supported by test data); Rev B under review

## Product
Double-glazed unit 8 mm low-E coated (Sunergy-type, neutral grey) HS + 16 mm argon + 8.8 mm laminated clear, warm-edge spacer, U-value 1.5 W/m²K, SHGC 0.26, VLT 48 %, acoustic Rw 38 dB. Manufacturer changed from the batch 1–3 supplier to **Jinhua Glass (demo)** because of the 18-day delay on batch 4.

## Supporting documents
Coating performance certificate, EN 1279 unit test reports (Parts 2, 3 and 4), colour comparison against the approved zone 1–3 glass (ΔE 1.2, within the 2.0 limit), thermal stress analysis for the east elevation, 3 physical samples 300 × 300 mm delivered to the site office.

## Consultant's comments (Rev B)
1. Colour: acceptable, confirm on the visual mock-up at L13 before full installation.
2. Provide the heat-soak test certificate for the heat-strengthened outer lite.
3. Warranty: 10 years on sealed units from the new manufacturer, assigned to Kinan.
Recommendation: **Approve as noted** subject to items 2 and 3 before shipment.
`;

  files["KH-LAB-CC-1407 Concrete cube results Tower A L13 slab.csv"] = `# Site laboratory — concrete compressive strength report CC-1407 — Kinan Heights
# Element: Tower A Level 13 PT slab (pour PC-TA-13-0398, ${p6(add(DATA_DATE, -9))} night pour, 396 m³). Mix: C40/20 PT, 30 % GGBS, w/c 0.38, slump 180 ± 30. Supplier: on-site batching plant + Qimma top-up (PO-4500124). Cured: water tank 20 ± 2 °C. Tested by: site lab (ISO 17025 scope), witnessed by the Resident Engineer's inspector.
# Acceptance: mean of 3 at 28 days ≥ 44 MPa and no individual below 36 MPa (spec 03 30 00 §2.6). Stressing strength 32 MPa.
` + csv([["Set", "Truck", "Cast Time", "Slump (mm)", "Temp (°C)", "Age (days)", "Cube 1 (MPa)", "Cube 2 (MPa)", "Cube 3 (MPa)", "Mean (MPa)", "Result"],
    ["S1", "QC-118", "21:40", 190, 29.5, 3, 24.8, 25.1, 24.2, 24.7, "info"], ["S1", "QC-118", "21:40", 190, 29.5, 7, 34.6, 35.0, 33.9, 34.5, "stressing OK (≥32)"], ["S1", "QC-118", "21:40", 190, 29.5, 28, 50.2, 49.6, 51.0, 50.3, "PASS"],
    ["S2", "QC-124", "23:05", 175, 28.8, 3, 23.9, 24.4, 24.0, 24.1, "info"], ["S2", "QC-124", "23:05", 175, 28.8, 7, 33.1, 33.8, 32.6, 33.2, "stressing OK (≥32)"], ["S2", "QC-124", "23:05", 175, 28.8, 28, 48.4, 47.9, 49.1, 48.5, "PASS"],
    ["S3", "QC-131", "00:30", 200, 29.1, 3, 22.7, 23.3, 22.9, 23.0, "info"], ["S3", "QC-131", "00:30", 200, 29.1, 7, 31.4, 32.2, 31.9, 31.8, "below 32 — stressing delayed 1 day"], ["S3", "QC-131", "00:30", 200, 29.1, 28, 46.1, 45.7, 46.8, 46.2, "PASS"],
    ["S4", "QC-139", "02:10", 185, 28.2, 3, 24.1, 24.6, 23.8, 24.2, "info"], ["S4", "QC-139", "02:10", 185, 28.2, 7, 34.0, 34.4, 33.5, 34.0, "stressing OK (≥32)"], ["S4", "QC-139", "02:10", 185, 28.2, 28, 49.0, 49.8, 48.7, 49.2, "PASS"],
  ]) + "# Conclusion: all four sets pass at 28 days (mean 48.5 MPa). Set S3 reached stressing strength at 8 days; the L13 stressing was moved one day. Report signed: site lab manager, ${p6(add(DATA_DATE, -1))}.\n".replace("${p6(add(DATA_DATE, -1))}", p6(add(DATA_DATE, -1)));

  files["KH-WA-TEST WhatsApp test script.md"] = `# WhatsApp test script — Kinan Heights

Send these from a phone that is on the allowed list (SETUP.md §6). Each line is one message; the expected behaviour is in brackets. Use the documents in this folder as attachments where a file is named.

## Start
1. \`hi\` → the project list; reply \`1\` or \`Kinan Heights\`.
2. \`what's late on the critical path?\` → Tower A frame, Hotel Block C, with the activities named.

## Progress updates (text)
3. \`Tower A L14 slab at 95%, pour tonight\` → TA-STR-L14 moves to 95 %, confirmation with the activity id.
4. \`mark TA-STR-L14 as completed\` → the activity closes on today's date; L15 columns are next.
5. \`hotel block C level 4 transfer beams done\` → the agent finds HC-STR-L4, asks to confirm if several activities match.
6. \`Tower B zone 8 facade pending, embeds not fixed\` → TB-FAC-Z8 stays not started, note recorded with the reason.

## Voice notes (say these; they are transcribed by ElevenLabs)
7. "Atrium roof steel is at ninety percent, the last two trusses go up tomorrow." → PD-ATR-STL updated to 90 %.
8. In Arabic: "بلاطة الدور الرابع عشر في البرج أ اكتملت اليوم" → TA-STR-L14 completed.

## Photos (evidence)
9. A photo of a slab with the caption \`Tower A L14 PT tendons placed, ready for ITR\` → filed as evidence on TA-STR-L14, the AI reading names the stage and any safety issues.
10. A photo with no caption → the agent describes it and suggests the activity; reply \`yes\` to file it, or \`log safety\` if it shows a hazard.

## Documents
11. Send \`KH-RFI-0163 ...md\` as a file with the caption \`file under Tower A L14\` → stored in Documents, summarised, pinned to Tower A L14.
12. \`what does RFI-0163 say about the tendons?\` → T-14/T-15 deviated 150 mm west, 3 × T20 trimmers.

## Questions from the data
13. \`which deliveries are delayed this week and what do they block?\`
14. \`show me the PT layout for tower A level 12\` → opens d_seed02.
15. \`order 20 tonnes of Ø16 rebar for Tower A L15 by 20 October\` → a material request is created against PKG-01.
`;

  files["README — how to use these documents.md"] = `# Kinan Heights — sample site documents

Twelve documents written for the live demo project, dated to the data date (${today}), each tied to real activities, people, NCRs, RFIs, purchase orders and locations in the seeded site, so the agent can cross-reference them.

| File | Upload where | Then ask the agent |
|---|---|---|
| RFI-0163 trimmer bars (Tower A L14) | Documents → Tower A → Level 14 | "What did the engineer answer on RFI-0163?" |
| NCR-0089 column cover (Tower A L13) | Tower A → Level 13 | "Which NCRs are open on Tower A and what holds the L14 columns?" |
| MS-STR-014 PT stressing method statement | Tower A → Level 14 | "What strength is needed before stressing L14?" |
| ITR-0412 inspection request | Tower A → Level 14 | "Is the L14 pour released?" |
| Weekly progress report 41 | Whole site | "Summarise this week's report; what slipped?" |
| Delivery note DN-00231 (PO-4500123) | Rebar yard | "What was short on the last rebar delivery?" |
| Permit to work PTW-2026-1187 | Podium → Level 2 | "What hot work is permitted today and under what conditions?" |
| Safety observation OBS-0338 | Tower B → Level 31 | "What happened on Tower B L31 this week?" |
| Progress meeting minutes 38 | Site office | "What are my actions from the last progress meeting?" |
| Change notice CN-031 (VO-023) | Podium | "Should I approve VO-023 and by when?" |
| Material submittal MS-0271 (façade glass) | Tower A → Level 13 | "Is the batch 4 glass approved?" |
| Cube results CC-1407 (Tower A L13) | Testing lab | "Did the L13 slab pass at 28 days?" |

Upload from **Documents → + (Attach document)** on the site map (pick the location first), or send any file over WhatsApp with a caption that names the place. Every upload is read by the AI: title, category, discipline and a summary are filled in, and the text becomes searchable.

The WhatsApp test script (KH-WA-TEST) lists messages, voice notes and photo captions to try, with the expected behaviour.
`;
  return files;
}

// =====================================================================================================================
function writePack(dir, files, zipName) {
  const root = path.join(OUT, dir);
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
  const z = {};
  for (const [name, text] of Object.entries(files)) { fs.writeFileSync(path.join(root, name), text); z[`${dir}/${name}`] = strToU8(text); }
  const zip = zipSync(z, { level: 6 });
  fs.writeFileSync(path.join(OUT, zipName), zip);
  return { n: Object.keys(files).length, bytes: Object.values(files).reduce((s, t) => s + Buffer.byteLength(t), 0), zip: zip.length };
}
fs.mkdirSync(OUT, { recursive: true });
const a = writePack("kinan-marina-walk", marinaPack(), "kinan-marina-walk-pack.zip");
const b = writePack("kinan-heights-docs", heightsDocs(), "kinan-heights-site-docs.zip");
fs.writeFileSync(path.join(OUT, "index.md"), `# Sample material for testing the Onsite Agent

- **kinan-marina-walk-pack.zip** — a complete project pack (${a.n} documents) for *New project*: the AI reads it and builds the 4D model. Also unpacked in kinan-marina-walk/.
- **kinan-heights-site-docs.zip** — ${b.n} site documents for the live Kinan Heights project (RFI, NCR, method statement, inspection request, weekly report, delivery note, permit, safety observation, minutes, change notice, submittal, cube results) plus a WhatsApp test script. Also unpacked in kinan-heights-docs/.

Regenerate with \`node scripts/samples.mjs\`. Everything is fictional.
`);
console.log(`marina pack: ${a.n} files, ${(a.bytes / 1024).toFixed(0)} KB (zip ${(a.zip / 1024).toFixed(0)} KB); heights docs: ${b.n} files, ${(b.bytes / 1024).toFixed(0)} KB (zip ${(b.zip / 1024).toFixed(0)} KB)`);
