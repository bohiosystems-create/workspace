/**
 * Demo document pack for the 3D Studio: a fictional second project, "Kinan Bay Residences", Jeddah.
 * Eight files written the way real project documents look (a brief, an area schedule, a surveyor's setting-out
 * file, a P6 programme update with logic, float and progress, its monthly narrative, a logistics plan, a structural design basis, a drawing register). Nothing here is a
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

// Baseline programme: [substructure, structure, façade, fit-out, handover] as [start, finish]. Written on the original
// calendar and moved by SHIFT so the data date (1 Oct 2026) is "now" for the demo, in step with Kinan Heights.
const SHIFT = -212;
const add = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PROG0: Record<string, [string, string][]> = {
  T1: [["2026-03-01", "2026-08-31"], ["2026-09-01", "2027-10-15"], ["2027-03-01", "2028-01-31"], ["2027-06-01", "2028-08-31"], ["2028-09-01", "2028-11-30"]],
  T2: [["2026-04-01", "2026-09-15"], ["2026-09-16", "2027-08-31"], ["2027-02-01", "2027-12-15"], ["2027-05-01", "2028-06-30"], ["2028-07-01", "2028-09-30"]],
  H1: [["2026-06-01", "2026-11-30"], ["2026-12-01", "2027-09-30"], ["2027-05-01", "2028-02-28"], ["2027-08-01", "2028-11-30"], ["2028-12-01", "2029-02-28"]],
  P1: [["2026-03-15", "2026-09-30"], ["2026-10-01", "2027-04-30"], ["2027-03-01", "2027-10-31"], ["2027-06-01", "2028-09-30"], ["2028-10-01", "2028-12-31"]],
  MS: [["2026-09-01", "2026-12-15"], ["2026-12-16", "2027-06-30"], ["2027-05-01", "2027-09-30"], ["2027-08-01", "2027-12-31"], ["2028-01-01", "2028-01-31"]],
  SC: [["2027-01-01", "2027-03-31"], ["2027-04-01", "2027-09-30"], ["2027-08-01", "2027-12-31"], ["2027-11-01", "2028-05-31"], ["2028-06-01", "2028-07-31"]],
  MQ: [["2027-02-01", "2027-04-15"], ["2027-04-16", "2027-10-31"], ["2027-09-01", "2028-01-31"], ["2027-12-01", "2028-05-31"], ["2028-06-01", "2028-07-15"]],
  UT: [["2026-11-01", "2026-12-31"], ["2027-01-01", "2027-03-31"], ["2027-03-01", "2027-05-31"], ["2027-04-01", "2027-08-31"], ["2027-09-01", "2027-09-15"]],
};
for (let i = 1; i <= 8; i++) { const s = add("2026-12-01", (i - 1) * 21); PROG0[`TH0${i}`] = [[s, add(s, 30)], [add(s, 31), add(s, 105)], [add(s, 90), add(s, 135)], [add(s, 120), add(s, 210)], [add(s, 211), add(s, 230)]]; }
const PROG: Record<string, [string, string][]> = Object.fromEntries(Object.entries(PROG0).map(([k, v]) => [k, v.map(([a, b]) => [add(a, SHIFT), add(b, SHIFT)] as [string, string])]));
const NTP = "2025-07-01", DATA_DATE = "2026-10-01";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p6 = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${MON[Number(m) - 1]}-${y.slice(2)}`; };
const nice = (iso: string) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m) - 1]} ${y}`; };

// ------------------------------------------------------------------ the programme, scheduled with real logic (CPM)
// Day numbers from NTP; finish dates are inclusive. FS: successor starts the day after the predecessor finishes (+lag);
// SS: successor starts lag days after the predecessor starts; FF: successor finishes lag days after the predecessor. Baseline = early dates of the baseline network.
// Progress at the data date and the forecast come from a second pass with the actual progress below; total float is
// measured against the contract completion date (the baseline finish), so a late critical path shows negative float.
type Rel = { id: string; type: "FS" | "SS" | "FF"; lag: number };
type Act = { id: string; name: string; wbs: string; dur: number; preds: Rel[]; ms?: boolean; b?: string; k?: number };
const day = (iso: string) => Math.round((Date.parse(iso) - Date.parse(NTP)) / 86400000);
const iso = (n: number) => add(NTP, n);
const PH = [["SUB", "piling, excavation & raft"], ["STR", "superstructure"], ["FAC", "façade"], ["FIT", "MEP, fit-out & finishes"], ["HO", "testing, commissioning & handover"]];
const actId = (b: string, k: number) => `${b}-${PH[k][0]}-${(k + 1) * 10}`;
/** Actual % complete at the data date where it differs from the plan: Hotel frame behind (transfer slab at L2 redesigned,
 *  RFI-H1-044), Tower 2 façade mock-up retest, Tower 1 frame slightly ahead. */
const ACTUAL: Record<string, number> = { "H1-STR-20": 42, "T2-FAC-30": 15, "T1-STR-20": 61 };

function network(): Act[] {
  const A: Act[] = [
    { id: "KB-M-000", name: "Notice to Proceed", wbs: "KB.0", dur: 0, preds: [], ms: true },
    { id: "KB-EN-010", name: "Site mobilisation, hoarding & enabling works", wbs: "KB.0.1", dur: 45, preds: [{ id: "KB-M-000", type: "FS", lag: 0 }] },
  ];
  const big = ["T1", "T2", "H1", "P1", "MS", "SC", "MQ"];
  B0.forEach((b, i) => PROG[b.ref].forEach(([s, f], k) => {
    const id = actId(b.ref, k);
    const name = k === 1 ? `${b.name} — superstructure ${b.floors > 1 ? `L1–L${b.floors}` : "frame & dome"}` : k === 2 ? `${b.name} — ${b.use === "Residential" || b.use === "Hotel" ? "unitised curtain wall" : "cladding & glazing"}` : `${b.name} — ${PH[k][1]}`;
    const [s1, f1] = PROG[b.ref][1];
    const preds: Rel[] = k === 0 ? [{ id: "KB-EN-010", type: "SS", lag: day(s) - day(NTP) }]
      : k === 1 ? [{ id: actId(b.ref, 0), type: "FS", lag: 0 }]
      : k === 2 || k === 3 ? [{ id: actId(b.ref, 1), type: "SS", lag: day(s) - day(s1) }, { id: actId(b.ref, 1), type: "FF", lag: day(f) - day(f1) }]
      : [{ id: actId(b.ref, 2), type: "FS", lag: 0 }, { id: actId(b.ref, 3), type: "FS", lag: 0 }, ...(big.includes(b.ref) ? [{ id: "KB-M-500", type: "FS" as const, lag: 0 }] : [])];
    A.push({ id, name, wbs: `KB.${i + 1}.${k + 1}`, dur: day(f) - day(s) + 1, preds, b: b.ref, k });
  }));
  A.push({ id: "KB-M-500", name: "Permanent power — SEC energisation of the substation", wbs: "KB.8", dur: 0, preds: [{ id: actId("UT", 4), type: "FS", lag: 14 }], ms: true });
  const p1fac = PROG.P1[2][1];
  A.push({ id: "KB-IN-900", name: "External works, roads & landscaping", wbs: "KB.9", dur: 240, preds: [{ id: actId("P1", 2), type: "FS", lag: day(add(PROG.P1[2][1], 31)) - day(p1fac) - 1 }] });
  A.push({ id: "KB-M-990", name: "Practical completion — Kinan Bay Residences", wbs: "KB.9", dur: 0, ms: true,
    preds: [...B0.map((b) => ({ id: actId(b.ref, 4), type: "FS" as const, lag: 0 })), { id: "KB-IN-900", type: "FS", lag: 0 }] });
  return A;
}

interface Sched { es: number; ef: number; ls: number; lf: number }
/** Forward pass (with optional progress at the data date) and backward pass from a completion day. */
function cpm(A: Act[], progress?: { dd: number; pct: (a: Act, es: number) => number }, mustFinish?: number) {
  const by = new Map(A.map((a) => [a.id, a])), out = new Map<string, Sched & { pct: number; as?: number; af?: number }>();
  const order: Act[] = [], seen = new Set<string>();
  const visit = (a: Act) => { if (seen.has(a.id)) return; seen.add(a.id); a.preds.forEach((p) => visit(by.get(p.id)!)); order.push(a); };
  A.forEach(visit);
  for (const a of order) {
    const d = a.ms ? 0 : a.dur;
    let es = 0;
    for (const p of a.preds) { if (p.type === "FF") continue; const q = out.get(p.id)!; es = Math.max(es, p.type === "FS" ? q.ef + (by.get(p.id)!.ms ? 0 : 1) + p.lag : q.es + p.lag); }
    let ef = es + Math.max(0, d - 1), pct = 0, as: number | undefined, af: number | undefined;
    if (progress) {
      pct = progress.pct(a, es);
      if (pct >= 100) { as = es; af = ef; }
      else if (pct > 0) { as = es; ef = Math.max(progress.dd, progress.dd + Math.ceil(d * (1 - pct / 100)) - 1); }
      else if (es < progress.dd) { es = progress.dd; ef = es + Math.max(0, d - 1); }
    }
    // finish-to-finish: the activity cannot finish before its predecessor (+lag); a not-started one moves, a running one stretches
    if (pct < 100) for (const p of a.preds) if (p.type === "FF") { const need = out.get(p.id)!.ef + p.lag; if (need > ef) { ef = need; if (!(pct > 0)) es = ef - Math.max(0, d - 1); } }
    out.set(a.id, { es, ef, ls: 0, lf: 0, pct, as, af });
  }
  const end = mustFinish ?? Math.max(...[...out.values()].map((x) => x.ef));
  for (const a of [...order].reverse()) {
    const me = out.get(a.id)!;
    let lf = end;
    for (const s of A) for (const r of s.preds) {
      if (r.id !== a.id) continue;
      const q = out.get(s.id)!;
      // mirror of the forward pass: FS s.es ≥ a.ef + gap + lag; SS s.es ≥ a.es + lag; FF s.ef ≥ a.ef + lag
      lf = Math.min(lf, r.type === "FS" ? q.ls - (a.ms ? 0 : 1) - r.lag : r.type === "FF" ? q.lf - r.lag : q.ls - r.lag + (me.ef - me.es));
    }
    me.lf = lf; me.ls = lf - (me.ef - me.es);
  }
  return { out, end };
}

/** Baseline and forecast, worked out once. */
const PLAN = (() => {
  const A = network(), dd = day(DATA_DATE);
  const base = cpm(A);
  const planned = (a: Act) => { const b = base.out.get(a.id)!; return a.ms ? (b.ef < dd ? 100 : 0) : b.ef < dd ? 100 : b.es >= dd ? 0 : Math.round(((dd - b.es) / a.dur) * 100); };
  const fc = cpm(A, { dd, pct: (a) => ACTUAL[a.id] ?? planned(a) }, base.end);
  return { A, base, fc, dd };
})();

function programme(): string {
  const { A, base, fc } = PLAN;
  const rows = [`# Primavera P6 export — Kinan Bay Residences — Layout "Update UP-15" — Baseline BL-02 — Data Date ${p6(DATA_DATE)}`,
    "# Start / Finish = actual (A) or forecast; BL = baseline BL-02; Total Float in calendar days against the contract completion (BL-02 practical completion)",
    "Activity ID,Activity Name,WBS,Original Duration,Remaining Duration,Start,Finish,BL Start,BL Finish,Total Float,Critical,Predecessors,Activity % Complete"];
  for (const a of A) {
    const f = fc.out.get(a.id)!, b = base.out.get(a.id)!;
    const tf = f.lf - f.ef, rem = f.pct >= 100 ? 0 : a.ms ? 0 : f.ef - Math.max(f.es, PLAN.dd) + 1;
    const st = `${p6(iso(f.es))}${f.as !== undefined ? " A" : ""}`, fi = `${p6(iso(f.ef))}${f.af !== undefined ? " A" : ""}`;
    const preds = a.preds.map((p) => `${p.id} ${p.type}${p.lag ? (p.lag > 0 ? `+${p.lag}` : p.lag) : ""}`).join("; ");
    const done = f.pct >= 100; // P6 leaves float blank on completed work
    rows.push([a.id, `"${a.name}"`, a.wbs, a.ms ? 0 : a.dur, rem, st, fi, p6(iso(b.es)), p6(iso(b.ef)), done ? "" : tf, !done && tf <= 0 ? "Yes" : "No", `"${preds}"`, `${f.pct}%`].join(","));
  }
  return rows.join("\n") + "\n";
}
const PC = () => ({ base: iso(PLAN.base.out.get("KB-M-990")!.ef), fc: iso(PLAN.fc.out.get("KB-M-990")!.ef) });

function brief(): string {
  return `# Kinan Bay Residences — Project Brief (KB-PM-001, Rev D)

**Client:** Kinan Bay Development Co. (fictional — demo dataset)  ·  **Location:** North Corniche, Jeddah  ·  **Data date for reporting:** ${nice(DATA_DATE)}

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
Notice to proceed ${nice(NTP)}; contract practical completion **${nice(PC().base)}** (Waterfront Hotel opening). The programme is the P6 update KB-PL-PRG-001 against baseline BL-02; the critical path and current forecast are explained in the programme narrative KB-PL-NAR-001.

## Construction logistics
See KB-LG-001: perimeter loop road, central boulevard, two gates, three tower cranes, laydown and contractor's compound.
`;
}

function narrative(): string {
  const { A, base, fc, dd } = PLAN, pc = PC(), slip = Math.round((Date.parse(pc.fc) - Date.parse(pc.base)) / 86400000);
  const crit = A.filter((a) => { const f = fc.out.get(a.id)!; return f.lf - f.ef <= 0 && f.pct < 100; });
  const tf = (id: string) => { const f = fc.out.get(id)!; return f.lf - f.ef; };
  const pctOf = (id: string) => fc.out.get(id)!.pct;
  const planPct = (id: string) => { const a = A.find((x) => x.id === id)!, b = base.out.get(id)!; return b.ef < dd ? 100 : b.es >= dd ? 0 : Math.round(((dd - b.es) / a.dur) * 100); };
  const bldFloat = B0.map((b) => ({ b, f: tf(actId(b.ref, 4)) })).sort((p, q) => p.f - q.f);
  return `# Kinan Bay Residences — Monthly Programme Narrative (KB-PL-NAR-001, Update UP-15)

**Data date:** ${nice(DATA_DATE)}  ·  **Baseline:** BL-02  ·  **Contract practical completion:** ${nice(pc.base)}  ·  **Forecast practical completion:** ${nice(pc.fc)} (${slip > 0 ? `${slip} days late` : "on time"})

## Critical path
The longest path runs through the **Waterfront Hotel**: piling and raft → superstructure → MEP, fit-out & finishes → testing, commissioning & handover → practical completion. Every one of these activities has ${slip > 0 ? `**${-slip} days** of total float (negative: the path is ${slip} days behind the contract date)` : "zero total float"}; a day lost on any of them moves practical completion.

| Activity | Forecast finish | Total float | Progress (actual / plan) |
|---|---|---|---|
${crit.filter((a) => !a.ms).map((a) => `| ${a.id} ${a.name} | ${nice(iso(fc.out.get(a.id)!.ef))} | ${tf(a.id)} d | ${pctOf(a.id)}% / ${planPct(a.id)}% |`).join("\n")}

## Main variances this period
- **H1-STR-20 Waterfront Hotel superstructure** — ${pctOf("H1-STR-20")}% complete against ${planPct("H1-STR-20")}% planned. The L2 transfer slab was redesigned after RFI-H1-044 (column grid clash with the ballroom), costing three weeks of cycle time. Recovery: second slab-formwork set and six-day working on the hotel from November; target to recover 10–14 days by topping out.
- **T2-FAC-30 Bay Tower 2 unitised curtain wall** — ${pctOf("T2-FAC-30")}% against ${planPct("T2-FAC-30")}% planned: the visual mock-up failed the water test and is being re-tested. Not critical: it still has ${tf("T2-FAC-30")} days of float.
- **T1-STR-20 Bay Tower 1 superstructure** — ${pctOf("T1-STR-20")}% against ${planPct("T1-STR-20")}% planned: slightly ahead on a 6-day floor cycle (${tf("T1-STR-20")} days of float).

## Float by building (handover activity, days)
${bldFloat.map(({ b, f }) => `- ${b.name}: ${f} d`).join("\n")}

## Near-critical
Permanent power (KB-M-500, SEC energisation of the substation) must be in place before any building is commissioned. It has ${tf("KB-M-500")} days of float; the SEC inspection date is being tracked weekly.
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
  sheets.forEach(([n, t, d], i) => rows.push(`${n},${t},${d},${String.fromCharCode(66 + (i % 3))},${i % 4 ? "IFC" : "IFA"},${p6(add("2025-11-01", i * 17))}`));
  return rows.join("\n") + "\n";
}

export const MOCK_PROJECT = { name: "Kinan Bay Residences", location: "North Corniche, Jeddah" };
export function mockDocs(): MockDoc[] {
  return [
    { name: "KB-PM-001 Project Brief.md", mime: "text/markdown", text: brief() },
    { name: "KB-AR-SCH-001 Area Schedule.csv", mime: "text/csv", text: areaSchedule() },
    { name: "KB-SV-SO-001 Setting-Out Coordinates.csv", mime: "text/csv", text: settingOut() },
    { name: "KB-PL-PRG-001 Programme Update UP-15 (P6 export).csv", mime: "text/csv", text: programme() },
    { name: "KB-PL-NAR-001 Programme Narrative.md", mime: "text/markdown", text: narrative() },
    { name: "KB-LG-001 Site Logistics Plan.md", mime: "text/markdown", text: logistics() },
    { name: "KB-ST-DBR-001 Structural Design Basis.txt", mime: "text/plain", text: design() },
    { name: "KB-DC-REG-001 Drawing Register.csv", mime: "text/csv", text: register() },
  ];
}
