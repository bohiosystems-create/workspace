/**
 * Demo document pack for the 3D Studio: a fictional second project, "Kinan Bay Residences", Jeddah.
 * Seven files written the way real project documents look (a brief, an area schedule, a surveyor's setting-out
 * file, a P6 programme export, a logistics plan, a structural design basis, a drawing register). Nothing here is a
 * 3D model: the Studio has to read these and build one. All files are generated from the one table below so they
 * agree with each other, as a well-run project's documents would.
 *
 * Survey convention used by the documents: Easting from the site's west boundary, Northing from its SOUTH boundary
 * (the 3D site grid measures z from the north edge, so readers must convert: z = 260 − Northing − depth).
 */
export interface MockDoc { name: string; mime: string; text: string }

const SITE = { w: 360, d: 260 };
type B = { ref: string; name: string; use: string; floors: number; ftf: number; bas: number; e: number; n: number; w: number; d: number; gfa: number; units: string };
const B0: B[] = [
  { ref: "T1", name: "Bay Tower 1", use: "Residential", floors: 34, ftf: 3.35, bas: 2, e: 40, n: 170, w: 42, d: 42, gfa: 51200, units: "238 apartments" },
  { ref: "T2", name: "Bay Tower 2", use: "Residential", floors: 28, ftf: 3.35, bas: 2, e: 100, n: 172, w: 40, d: 38, gfa: 38900, units: "182 apartments" },
  { ref: "H1", name: "Waterfront Hotel", use: "Hotel", floors: 16, ftf: 3.6, bas: 1, e: 175, n: 182, w: 62, d: 30, gfa: 27400, units: "214 keys" },
  { ref: "P1", name: "Bay Retail Podium", use: "Retail", floors: 3, ftf: 5.4, bas: 2, e: 40, n: 120, w: 160, d: 40, gfa: 17600, units: "46 units + F&B" },
  { ref: "MS", name: "Multi-Storey Car Park", use: "Parking", floors: 6, ftf: 3.1, bas: 0, e: 270, n: 30, w: 70, d: 45, gfa: 18400, units: "720 bays" },
  { ref: "SC", name: "Community School", use: "School", floors: 3, ftf: 4.0, bas: 0, e: 180, n: 30, w: 72, d: 34, gfa: 6900, units: "24 classrooms" },
  { ref: "MQ", name: "Bay Mosque", use: "Mosque", floors: 1, ftf: 6.5, bas: 0, e: 285, n: 185, w: 30, d: 30, gfa: 900, units: "650 worshippers" },
  { ref: "UT", name: "Substation & Utility Building", use: "Utility", floors: 1, ftf: 5.0, bas: 0, e: 290, n: 120, w: 26, d: 16, gfa: 420, units: "2 × 2.5 MVA" },
  ...Array.from({ length: 8 }, (_, i) => ({ ref: `TH0${i + 1}`, name: `Townhouse ${i + 1}`, use: "Townhouse", floors: 3, ftf: 3.3, bas: 0, e: 26 + i * 16, n: 40, w: 13, d: 18, gfa: 610, units: "1 home" })),
];

// programme: [substructure, structure, façade, fit-out, handover] as [start, finish]
const D = (s: string) => s;
const PROG: Record<string, [string, string][]> = {
  T1: [[D("2026-03-01"), D("2026-08-31")], [D("2026-09-01"), D("2027-10-15")], [D("2027-03-01"), D("2028-01-31")], [D("2027-06-01"), D("2028-08-31")], [D("2028-09-01"), D("2028-11-30")]],
  T2: [["2026-04-01", "2026-09-15"], ["2026-09-16", "2027-08-31"], ["2027-02-01", "2027-12-15"], ["2027-05-01", "2028-06-30"], ["2028-07-01", "2028-09-30"]],
  H1: [["2026-06-01", "2026-11-30"], ["2026-12-01", "2027-09-30"], ["2027-05-01", "2028-02-28"], ["2027-08-01", "2028-11-30"], ["2028-12-01", "2029-02-28"]],
  P1: [["2026-03-15", "2026-09-30"], ["2026-10-01", "2027-04-30"], ["2027-03-01", "2027-10-31"], ["2027-06-01", "2028-09-30"], ["2028-10-01", "2028-12-31"]],
  MS: [["2026-09-01", "2026-12-15"], ["2026-12-16", "2027-06-30"], ["2027-05-01", "2027-09-30"], ["2027-08-01", "2027-12-31"], ["2028-01-01", "2028-01-31"]],
  SC: [["2027-01-01", "2027-03-31"], ["2027-04-01", "2027-09-30"], ["2027-08-01", "2027-12-31"], ["2027-11-01", "2028-05-31"], ["2028-06-01", "2028-07-31"]],
  MQ: [["2027-02-01", "2027-04-15"], ["2027-04-16", "2027-10-31"], ["2027-09-01", "2028-01-31"], ["2027-12-01", "2028-05-31"], ["2028-06-01", "2028-07-15"]],
  UT: [["2026-11-01", "2026-12-31"], ["2027-01-01", "2027-03-31"], ["2027-03-01", "2027-05-31"], ["2027-04-01", "2027-08-31"], ["2027-09-01", "2027-09-15"]],
};
const add = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
for (let i = 1; i <= 8; i++) { const s = add("2026-12-01", (i - 1) * 21); PROG[`TH0${i}`] = [[s, add(s, 30)], [add(s, 31), add(s, 105)], [add(s, 90), add(s, 135)], [add(s, 120), add(s, 210)], [add(s, 211), add(s, 230)]]; }
const DATA_DATE = "2027-05-01";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p6 = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${MON[Number(m) - 1]}-${y.slice(2)}`; };
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

function brief(): string {
  return `# Kinan Bay Residences — Project Brief (KB-PM-001, Rev C)

**Client:** Kinan Bay Development Co. (fictional — demo dataset)  ·  **Location:** North Corniche, Jeddah  ·  **Data date for reporting:** 1 May 2027

## Site
A rectangular waterfront plot of **${SITE.w} m east–west by ${SITE.d} m north–south** (9.36 ha). The Corniche is to the west, the sea to the north-west.
All coordinates in the project documents use the **site setting-out grid: origin at the south-west corner of the plot, Easting increasing east, Northing increasing north**, in metres.

## Development
Mixed-use waterfront community of ${B0.length} buildings, ~162,000 m² GFA:

- **Bay Tower 1** (34 storeys, residential) and **Bay Tower 2** (28 storeys, residential) on the northern edge, west of centre, facing the sea.
- **Waterfront Hotel** (16 storeys, 214 keys) east of the towers along the north edge.
- **Bay Retail Podium** (3 storeys, retail and F&B) directly south of the towers, linking them at ground level.
- **Bay Mosque** in the north-east corner; **Substation & Utility Building** on the east side.
- Along the south: a row of **eight 3-storey townhouses** in the south-west, the **Community School** in the south-centre and the **Multi-Storey Car Park** (6 levels, 720 bays) in the south-east.
- A central landscaped park between the townhouses and the central boulevard.

Footprints, levels and exact setting-out are in the Area Schedule (KB-AR-SCH-001) and the Setting-Out schedule (KB-SV-SO-001).

## Programme
Notice to proceed 1 February 2026; practical completion **30 June 2029** (Waterfront Hotel opening). The baseline programme is the P6 export KB-PL-PRG-001.

## Construction logistics
See KB-LG-001: perimeter loop road, central boulevard, two gates, three tower cranes, laydown and contractor's compound.
`;
}
function areaSchedule(): string {
  const rows = ["Building Ref,Building Name,Use,Storeys Above Ground,Basement Levels,Floor-to-Floor (m),Footprint E-W (m),Footprint N-S (m),GFA (m2),Units / Keys"];
  for (const b of B0) rows.push(`${b.ref},${b.name},${b.use},${b.floors},${b.bas},${b.ftf.toFixed(2)},${b.w},${b.d},${b.gfa},"${b.units}"`);
  return rows.join("\n") + "\n";
}
function settingOut(): string {
  const rows = ["# KB-SV-SO-001 Setting-out schedule — building corners. Grid origin: SW corner of site. Units: m. Levels: SSL (m).", "Point ID,Building Ref,Corner,Easting,Northing,SSL"];
  let n = 100;
  for (const b of B0) {
    for (const [c, e, nn] of [["SW", b.e, b.n], ["SE", b.e + b.w, b.n], ["NE", b.e + b.w, b.n + b.d], ["NW", b.e, b.n + b.d]] as const) rows.push(`SO-${n++},${b.ref},${c},${e.toFixed(3)},${nn.toFixed(3)},${b.ref.startsWith("TH") ? "+0.450" : "+0.300"}`);
  }
  return rows.join("\n") + "\n";
}
function programme(): string {
  const rows = [`# Primavera P6 export — Kinan Bay Residences — Baseline BL-02 — Data Date ${p6(DATA_DATE)}`, "Activity ID,Activity Name,WBS,Original Duration,Start,Finish,Total Float,Activity % Complete"];
  rows.push(`KB-M-000,Notice to Proceed,KB.0,0,${p6("2026-02-01")},${p6("2026-02-01")},0,100%`);
  rows.push(`KB-EN-010,"Site mobilisation & hoarding",KB.0.1,43,${p6("2026-02-01")},${p6("2026-03-15")},0,100%`);
  const phases = [["SUB", "piling, excavation & raft"], ["STR", "superstructure"], ["FAC", "façade"], ["FIT", "MEP, fit-out & finishes"], ["HO", "testing, commissioning & handover"]];
  const t = Date.parse(DATA_DATE);
  B0.forEach((b, i) => {
    PROG[b.ref].forEach(([s, f], k) => {
      const name = k === 1 ? `${b.name} — superstructure ${b.floors > 1 ? `L1–L${b.floors}` : "frame & dome"}` : k === 2 ? `${b.name} — ${b.use === "Residential" || b.use === "Hotel" ? "unitised curtain wall" : "cladding & glazing"}` : `${b.name} — ${phases[k][1]}`;
      const pct = Math.max(0, Math.min(100, Math.round(((t - Date.parse(s)) / (Date.parse(f) - Date.parse(s))) * 100)));
      rows.push(`${b.ref}-${phases[k][0]}-${(k + 1) * 10},"${name}",KB.${i + 1}.${k + 1},${days(s, f)},${p6(s)},${p6(f)},${k === 1 && b.ref === "H1" ? 0 : 12 + i},${pct}%`);
    });
  });
  rows.push(`KB-IN-900,"External works & landscaping",KB.9,300,${p6("2028-06-01")},${p6("2029-03-31")},20,0%`);
  rows.push(`KB-M-990,Practical completion,KB.9,0,${p6("2029-06-30")},${p6("2029-06-30")},0,0%`);
  return rows.join("\n") + "\n";
}
function logistics(): string {
  return `# Site Logistics Plan — KB-LG-001 Rev B
Coordinates: site setting-out grid (Easting, Northing), metres, origin at the SW corner of the site.

## Roads
- **Perimeter loop road**, two-way, 9 m wide. Centreline: (20, 20) → (340, 20) → (340, 240) → (20, 240) → (20, 20).
- **Central boulevard**, 12 m wide, east–west. Centreline: (20, 100) → (340, 100).
- **School service road**, 8 m wide, north–south. Centreline: (165, 100) → (165, 20).

## Gates
- **Gate A** (personnel, west, off the Corniche service road) at (0, 100).
- **Gate B** (materials and heavy vehicles, south) at (230, 0). Weighbridge inside the gate.

## Tower cranes
| Crane | Position (E, N) | Jib radius | Serves |
|---|---|---|---|
| TC1 | (91, 212) | 55 m | Bay Tower 1 |
| TC2 | (150, 192) | 50 m | Bay Tower 2 |
| TC3 | (206, 172) | 45 m | Waterfront Hotel |

## Zones
- **Laydown A** (rebar, formwork, façade units): E 215–255, N 108–138.
- **Contractor's compound** (offices, welfare, stores): E 255–280, N 140–170.
- **Central park** (landscape, from 2028): E 26–151, N 62–92.
`;
}
function design(): string {
  return `KB-ST-DBR-001  STRUCTURAL DESIGN BASIS — KINAN BAY RESIDENCES  (Rev B)

1. Towers T1 and T2: RC core and flat-plate PT slabs, 250 mm. Floor-to-floor 3.35 m typical; ground floor 5.0 m (taken as typical for massing).
   Two basement levels under T1, T2 and the podium (shared basement, 3.6 m per level). Piled raft, 1200 mm bored piles.
2. Waterfront Hotel H1: RC frame, 3.60 m floor-to-floor, one basement. Transfer level at L2.
3. Retail podium P1: long-span PT beams, 5.40 m floor-to-floor, 3 storeys.
4. MSCP: precast double-tees on RC frame, 3.10 m split-level, 6 levels.
5. School, mosque, utility building, townhouses: RC frame on pad footings. Mosque prayer hall clear height 6.5 m with central dome.
6. Design life 50 years; exposure class XS3 (marine) — 50 mm cover to external elements.
`;
}
function register(): string {
  const rows = ["Sheet No.,Title,Discipline,Rev,Status,Date"];
  const sheets = [["KB-AR-001", "Site masterplan", "ARC"], ["KB-AR-010", "Site setting-out plan", "ARC"], ["KB-AR-T1-201", "Bay Tower 1 typical floor plan", "ARC"], ["KB-AR-T1-301", "Bay Tower 1 elevations", "ARC"], ["KB-AR-T2-201", "Bay Tower 2 typical floor plan", "ARC"], ["KB-AR-H1-201", "Hotel typical guest floor", "ARC"], ["KB-AR-P1-101", "Podium ground floor plan", "ARC"], ["KB-ST-T1-110", "T1 raft and pile layout", "STR"], ["KB-ST-T1-210", "T1 typical PT slab", "STR"], ["KB-ST-MS-101", "MSCP precast layout", "STR"], ["KB-ME-T1-401", "T1 MEP risers", "MEP"], ["KB-FA-T1-501", "T1 curtain wall setting-out", "FAC"], ["KB-LS-001", "Landscape masterplan", "LAN"], ["KB-CV-001", "External roads and drainage", "CIV"]];
  sheets.forEach(([n, t, d], i) => rows.push(`${n},${t},${d},${String.fromCharCode(66 + (i % 3))},${i % 4 ? "IFC" : "IFA"},${p6(add("2026-06-01", i * 17))}`));
  return rows.join("\n") + "\n";
}

export const MOCK_PROJECT = { name: "Kinan Bay Residences", location: "North Corniche, Jeddah" };
export function mockDocs(): MockDoc[] {
  return [
    { name: "KB-PM-001 Project Brief.md", mime: "text/markdown", text: brief() },
    { name: "KB-AR-SCH-001 Area Schedule.csv", mime: "text/csv", text: areaSchedule() },
    { name: "KB-SV-SO-001 Setting-Out Coordinates.csv", mime: "text/csv", text: settingOut() },
    { name: "KB-PL-PRG-001 Baseline Programme (P6 export).csv", mime: "text/csv", text: programme() },
    { name: "KB-LG-001 Site Logistics Plan.md", mime: "text/markdown", text: logistics() },
    { name: "KB-ST-DBR-001 Structural Design Basis.txt", mime: "text/plain", text: design() },
    { name: "KB-DC-REG-001 Drawing Register.csv", mime: "text/csv", text: register() },
  ];
}
