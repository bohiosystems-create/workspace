import type { Category, Db, Doc, Note } from "./types";
import { SEED_LOCATIONS } from "./siteplan";

const day = (n: number) => new Date(Date.UTC(2026, 8, 30) - n * 86400000).toISOString();

let i = 0;
function doc(p: {
  title: string; category: Category; discipline?: string; revision?: string; locationId: string;
  summary: string; text: string; tags?: string[]; by?: string; ago?: number; drawing?: string; pin?: [number, number];
}): Doc {
  i++;
  const gen = p.drawing ? { kind: p.drawing, label: p.title } : undefined;
  return {
    id: `d_seed${String(i).padStart(2, "0")}`,
    title: p.title, category: p.category, discipline: p.discipline, revision: p.revision,
    locationId: p.locationId, pin: p.pin ? { x: p.pin[0], y: p.pin[1] } : undefined,
    filename: gen ? `${p.title.replace(/\W+/g, "_")}.svg` : `${p.title.replace(/\W+/g, "_")}.txt`,
    mime: gen ? "image/svg+xml" : "text/plain",
    size: 48_000, summary: p.summary, text: p.text, tags: p.tags ?? [],
    uploadedAt: day(p.ago ?? 10), uploadedBy: p.by ?? "Document Control", generated: gen,
  };
}

export function seedDb(): Db {
  const docs: Doc[] = [
    doc({ title: "Typical Floor Plan — Tower A L12", category: "Drawing", discipline: "ARC", revision: "C", locationId: "tower-a-l12",
      drawing: "floorplan", summary: "Typical residential floor, 8 apartments per floor around central core.",
      text: "Tower A Level 12. 8 apartments (2×studio, 2×1BR, 2×2BR, 2×3BR). Core: 4 lifts, stairs S1/S2, 2 MEP shafts. Floor-to-floor 3.6 m. Corridor width 1.8 m. Fire compartment boundaries at core walls (120 min). Balcony slab step-down 50 mm.",
      tags: ["floor plan", "apartments", "core"], ago: 14, pin: [385, 235] }),
    doc({ title: "Slab Framing & PT Layout — Tower A L12", category: "Drawing", discipline: "STR", revision: "D", locationId: "tower-a-l12",
      drawing: "structural", summary: "250 mm PT slab, 900×900 columns, C60/75 core walls.",
      text: "Slab thickness 250 mm post-tensioned, f'c 50 MPa. Columns 900×900 mm C60/75 up to L20, then 800×800 C50. Core walls 300 mm slip-formed. Cover 40 mm soffit, 30 mm top. PT stressing at 7 days once cylinder strength ≥25 MPa. Tendon layout banded in E-W direction, distributed N-S. Revision D adds extra trimmer bars at lift pit opening.",
      tags: ["slab", "post-tensioned", "PT", "thickness", "columns", "rebar"], ago: 9, pin: [405, 250] }),
    doc({ title: "MEP Coordination Plan — Tower A L12", category: "Drawing", discipline: "MEP", revision: "B", locationId: "tower-a-l12",
      drawing: "mep", summary: "Coordinated services: CHW, fire main, power tray, drainage.",
      text: "Chilled water CHWS/R Ø150 runs corridor ceiling at +3.05 m. Fire wet riser Ø100 in riser room. Power tray 300×50 at +2.85 m. Clash noted at grid C/3: CHW pipe vs PT beam — sleeve through beam approved by structural, see RFI-0142. Drainage Ø110 falls 1:80 to shaft.",
      tags: ["clash", "chilled water", "fire", "services", "coordination"], ago: 6 }),
    doc({ title: "Typical Floor Plan — Tower B L20", category: "Drawing", discipline: "ARC", revision: "B", locationId: "tower-b-l20",
      drawing: "floorplan", summary: "Tower B typical floor, 6 apartments.", text: "Tower B Level 20. 6 apartments, larger 3BR layouts. Two lifts serving each lobby. Refuge area at L20 (mid-height refuge floor).",
      tags: ["floor plan", "refuge"], ago: 20 }),
    doc({ title: "Building Section 1-1 — Tower A", category: "Drawing", discipline: "ARC", revision: "C", locationId: "tower-a",
      drawing: "section", summary: "Typical section, floor-to-floor heights.", text: "Section through core. Typical f-f 3.60 m. Ground lobby 6.0 m double-height. Transfer slab at L3. Roof plant room +155.4 m.",
      tags: ["section", "height", "levels"], ago: 25 }),
    doc({ title: "Site Logistics Plan — Rev F", category: "Drawing", discipline: "CIV", revision: "F", locationId: "site",
      drawing: "logistics", summary: "Traffic routes, laydown, crane radii.", text: "One-way perimeter ring road anti-clockwise. Gate 2 for trucks only (no pedestrians). TC1/TC2 radii overlap over podium — tower crane interference zone protocol applies. Laydown 1 formwork, Laydown 3 precast. Muster points M1/M2.",
      tags: ["logistics", "traffic", "crane", "laydown"], ago: 4 }),

    doc({ title: "Concrete Specification — Section 03 30 00", category: "Specification", discipline: "STR", revision: "A", locationId: "site",
      summary: "Structural concrete grades, slump, curing, testing frequency.",
      text: "Grades: C60/75 core & columns to L20, C50 slabs, C40 podium slab, C35 blinding. Max w/c 0.40. Slump at pour 180±30 mm (SCC for cores 650±50 mm flow). Cement CEM I + 30% GGBS. Curing: 7 days wet curing minimum, curing compound on vertical elements. Test cubes: 1 set (6 cubes) per 50 m³ or per pour, whichever is more frequent; 3 at 7 d, 3 at 28 d. Max concrete temperature at placing 32°C — summer pours night only between 22:00 and 06:00.",
      tags: ["concrete", "grade", "slump", "curing", "cube", "temperature"], ago: 120 }),
    doc({ title: "Waterproofing Specification — Basement", category: "Specification", discipline: "ARC", revision: "B", locationId: "basement",
      summary: "Crystalline admixture + HDPE membrane system for raft and walls.",
      text: "Raft: crystalline admixture 1% by cement weight plus 2 mm HDPE pre-applied membrane under blinding. Walls: post-applied 4 mm torch-on membrane + 50 mm protection board. Water stops: PVC 250 mm at all construction joints, hydrophilic strips at pipe penetrations. Flood test 72 hours on B1 podium transfer slab before screed. Ground water table at -4.5 m from natural ground level.",
      tags: ["waterproofing", "membrane", "raft", "flood test", "water"], ago: 90 }),

    doc({ title: "RFI-0142 — CHW pipe vs PT beam at C/3 (L12)", category: "RFI", discipline: "MEP", locationId: "tower-a-l12", revision: "1",
      summary: "MEP requests beam sleeve at grid C/3. Structural response: approved with trimmer bars.",
      text: "Raised by MEP subcontractor 02-Sep. Query: CHW Ø150 pipe clashes with PT beam B12 at C/3, L12 (typical for L8–L18). Response (Structural EOR, 09-Sep): 200 mm sleeve permitted in web at mid-span only, min 450 mm clear from support; add 2T16 trimmer bars each side; PT tendons to be deviated — do not cut tendons. Status: CLOSED for L12; L13+ to follow same detail. Cost impact: nil. Time impact: nil.",
      tags: ["RFI", "clash", "beam", "sleeve", "PT"], by: "MEP Coordinator", ago: 21 }),
    doc({ title: "RFI-0157 — Façade bracket embed position, Tower B", category: "RFI", discipline: "ARC", locationId: "tower-b", revision: "0",
      summary: "Façade contractor queries cast-in channel tolerance. Awaiting response.",
      text: "Façade contractor requests confirmation of cast-in channel tolerance ±10 mm vs. ±5 mm shown on drawing A-520. Channels already cast on L2–L9 at ±10 mm. Status: OPEN — awaiting architect response, due 05-Oct. If ±5 mm is enforced, 38 channels on L2–L9 require remedial drill-and-anchor.",
      tags: ["RFI", "facade", "embed", "tolerance", "open"], by: "Façade Coordinator", ago: 6 }),

    doc({ title: "ITR — Rebar & Formwork Inspection, Tower A L12 Slab", category: "Inspection", discipline: "QA", locationId: "tower-a-l12", revision: "1",
      summary: "Pre-pour inspection passed with 3 minor comments closed on site.",
      text: "Inspection 28-Sep-2026, Tower A L12 slab. Inspected by QA/QC & Consultant. Rebar: spacing OK, cover blocks 40 mm verified, lap lengths 50d. Comments: (1) 3 × chairs missing near edge C/6 — corrected; (2) PT anchors need additional spiral at D/2 — corrected; (3) sleeve at C/3 not yet boxed — corrected. Formwork: levels ±5 mm, propping to drawing. Outcome: APPROVED TO POUR 29-Sep. Concrete C50, 312 m³, pump TC1 area.",
      tags: ["inspection", "pre-pour", "rebar", "formwork", "approved"], by: "QA/QC Engineer", ago: 2 }),
    doc({ title: "ITR — Post-tension Stressing Record, Tower A L11", category: "Inspection", discipline: "QA", locationId: "tower-a-l11", revision: "1",
      summary: "Stressing completed, elongations within ±7%.", text: "Stressing 25-Sep L11. Strength at stressing 31 MPa (≥25). 96 tendons, average elongation +3.1%, max +5.8%, all within ±7%. Grouting scheduled 27-Sep. Notes: two tendons at grid D/5 showed 6.4% — accepted by PT specialist.",
      tags: ["post-tension", "stressing", "elongation"], by: "PT Specialist", ago: 5 }),
    doc({ title: "Concrete Cube Results — Raft Tower B (28-day)", category: "Inspection", discipline: "QA", locationId: "tower-b-b3", revision: "1",
      summary: "All 28-day cubes exceed C50 target.", text: "Raft pour Tower B, 62 cube sets. 28-day mean 67.4 MPa, min 61.0 MPa vs. characteristic 50 MPa. All pass. Lab: Kinan Materials Testing Lab.",
      tags: ["cubes", "concrete", "raft", "strength"], by: "Materials Engineer", ago: 40 }),

    doc({ title: "Method Statement — Tower Crane TC1/TC2 Interference Zone", category: "Method Statement", discipline: "HSE", locationId: "tc1", revision: "2",
      summary: "Protocol for overlapping crane slew envelopes above the podium.",
      text: "TC1 and TC2 jibs overlap over the podium. TC2 jib lower by 6 m; slew limiters programmed. No simultaneous lifts inside overlap zone; radio call & confirmation required. Max wind for lifting 38 km/h (hold), 50 km/h stop. Banksman required at all times. Lifts >80% SWL need lift plan approved by Lifting Supervisor.",
      tags: ["crane", "lifting", "wind", "interference", "slew"], by: "HSE Manager", ago: 30 }),
    doc({ title: "Method Statement — Night Concrete Pours (Summer)", category: "Method Statement", discipline: "STR", locationId: "batching", revision: "1",
      summary: "Hot-weather concreting controls.", text: "Pours 22:00–06:00 when ambient >35°C. Chilled mixing water + ice; aggregate shaded & sprayed. Max placing temperature 32°C, tested each truck. Fog misting after finishing; curing compound within 30 min. Night lighting 150 lux min.",
      tags: ["hot weather", "concrete", "night", "temperature"], ago: 60 }),

    doc({ title: "Permit to Work — Hot Works, Podium L2", category: "Permit", discipline: "HSE", locationId: "podium-l2", revision: "",
      summary: "Active hot-work permit for steel welding at atrium edge.", text: "PTW-HW-0931. Area: Podium L2 atrium edge. Valid 29-Sep 07:00–17:00. Fire watch 60 min post work. Extinguishers ×2 + fire blanket. Gas test n/a. Issuer: Area Supervisor. Status: ACTIVE.",
      tags: ["permit", "hot work", "welding", "active"], by: "Area Supervisor", ago: 1 }),
    doc({ title: "HSE Weekly Inspection — Week 39", category: "HSE", discipline: "HSE", locationId: "site", revision: "",
      summary: "2 high-priority findings: edge protection at Tower B L31, housekeeping at Laydown 2.",
      text: "Week 39 inspection. Findings: (HIGH) Tower B L31 edge protection gap on east face 1.4 m — rectified same day; (HIGH) Laydown 2 unsecured pipe stacks >1.5 m; (MED) 3 missing fire extinguisher inspection tags, Labour Camp; (LOW) signage faded at Gate 2. LTI-free days: 212. TRIR 0.41.",
      tags: ["HSE", "edge protection", "housekeeping", "findings", "safety"], by: "HSE Manager", ago: 3 }),
    doc({ title: "Fire Pump House — Commissioning Test Record", category: "Inspection", discipline: "MEP", locationId: "fire-point", revision: "1",
      summary: "Temporary fire pump 150% flow test passed.", text: "Duty pump 2850 L/min @ 7 bar passes; 150% flow at 65% pressure passes. Jockey pump cut-in 6.5 bar. Civil Defence witnessed. Valid till 31-Dec-2026.",
      tags: ["fire", "pump", "test", "civil defence"], ago: 50 }),

    doc({ title: "Submittal — Lift Package (Tower A/B), Approved as Noted", category: "Submittal", discipline: "MEP", locationId: "tower-a", revision: "2",
      summary: "Lift supplier submittal approved with comments.", text: "Tower A: 4 lifts at 2.5 m/s. Pit depth 2.6 m; overhead 6.2 m; machine-room-less. Approved as noted: provide firefighter lift per SBC 801; landing door finish per interior design. Delivery sequence: Tower A rails from L20 upward Jan-2027.",
      tags: ["lift", "submittal", "MAS", "approved"], ago: 35 }),
    doc({ title: "Material Approval — Rebar Grade 60 (Mill Certificates)", category: "Submittal", discipline: "STR", locationId: "rebar-yard", revision: "1",
      summary: "Mill certs for batch lot 26-0912.", text: "Grade 60 (420 MPa) rebar; Ø10–Ø40; yield 452–489 MPa, UTS/YS ≥1.25; elongation ≥14%. Lot 26-0912: 480 t delivered, 12 samples tested at lab — pass.",
      tags: ["rebar", "mill certificate", "steel"], ago: 18 }),

    doc({ title: "Weekly Progress Meeting #118 Minutes", category: "Minutes", locationId: "site-office", revision: "",
      summary: "Progress, constraints, decisions for week ending 26-Sep.", text: "Attendees: PM, Dev Manager, Consultant, MEPC. Progress: Tower A L12 slab poured 29-Sep (plan 28-Sep, +1d). Tower B L31 core. Hotel C raft complete. Decisions: (1) proceed to L13 with RFI-0142 detail; (2) façade RFI-0157 escalation; (3) request Dev Manager site walk Wed for podium atrium edge. Constraints: hoist B downtime 2 days for inspection; labour +40 from camp phase 2.",
      tags: ["minutes", "progress", "actions"], by: "Project Manager", ago: 4 }),
    doc({ title: "Snag List — Villa D1–D4 (Pre-handover)", category: "Snag List", discipline: "QA", locationId: "villas-d", revision: "",
      summary: "42 open snags across 4 show villas.", text: "D1: 11 open (paint touch-up, door alignment, AC grill). D2: 9 open. D3: 12 open (tile lippage in master bath). D4: 10 open. Priority: D3 tile lippage before client walkthrough 12-Oct. Total 42; closed 118.",
      tags: ["snag", "handover", "villa", "defects"], by: "QA Engineer", ago: 7 }),
    doc({ title: "Variation Order VO-023 — Podium Atrium Extra Glazing", category: "Variation", discipline: "ARC", locationId: "podium", revision: "",
      summary: "SAR 1.84M extra glazing; pending client approval.", text: "Additional 380 m² of structural glazing at atrium per client request. Cost SAR 1,840,000; 21 day extension claimed (EOT). Status: SUBMITTED, awaiting Dev Manager decision.",
      tags: ["variation", "cost", "glazing", "claim"], by: "Commercial Manager", ago: 8 }),
    doc({ title: "Substation Energisation Plan (33/11 kV)", category: "Other", discipline: "MEP", locationId: "substation", revision: "A",
      summary: "SEC energisation steps and dates.", text: "SEC inspection 15-Oct; HV cable test (VLF) done 18-Sep; Energisation target 28-Oct. Transformers 2 × 2.5 MVA. Earth resistance 0.8 Ω.",
      tags: ["electrical", "SEC", "energisation", "transformer"], ago: 12 }),
    doc({ title: "STP Design Basis & Capacity", category: "Specification", discipline: "CIV", locationId: "stp", revision: "0",
      summary: "1,200 m³/day MBR plant.", text: "MBR plant 1,200 m³/day; effluent TSS <5 mg/L reuse for irrigation & cooling makeup. Structure: 3 tanks (anoxic, aerobic, MBR). Commissioning Q2-2027.",
      tags: ["STP", "sewage", "capacity", "MBR"], ago: 70 }),
    doc({ title: "Underground Services Coordination — Main Spine", category: "Drawing", discipline: "CIV", locationId: "util-corridor", revision: "C",
      drawing: "logistics", summary: "Duct bank and pipe crossings along the spine road.", text: "Duct bank 6-way 11 kV at -1.2 m; water Ø300 DI at -1.5 m; sewer Ø400 at -2.8 m; telecom 4-way at -0.8 m. Crossing clash at MH-S2 resolved by lowering telecom. Keep 1.0 m horizontal clearance between power and water.",
      tags: ["utilities", "duct bank", "crossing", "underground"], ago: 16 }),
  ];

  const notes: Note[] = [
    { id: "n_seed1", docId: "d_seed02", locationId: "tower-a-l12", text: "Confirm trimmer bars at lift pit opening before L13 pour.", kind: "instruction", status: "open", author: "Dev Manager", createdAt: day(3), at: { x: 0.43, y: 0.33 }, via: "manual" },
    { id: "n_seed2", locationId: "laydown-2", text: "Pipe stacks over 1.5 m — re-stack today, HSE flagged.", kind: "issue", status: "open", author: "Dev Manager", createdAt: day(2), via: "manual" },
    { id: "n_seed3", docId: "d_seed10", text: "Need decision from architect by Friday or façade install slips.", kind: "issue", status: "open", author: "Dev Manager", createdAt: day(1), via: "manual" },
  ];

  return {
    project: { name: "Kinan Heights", client: "Kinan", code: "KH-2026" },
    locations: SEED_LOCATIONS.map((l) => ({ ...l })),
    docs,
    notes,
  };
}
