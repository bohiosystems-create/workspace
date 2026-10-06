import type { Category } from "../types";

/** Design basis reports, plans and specification sections authored as searchable documents. */
export interface DesignDoc { title: string; category: Category; discipline: string; revision: string; locationId: string; summary: string; text: string; tags: string[]; by: string; ago: number }
const d = (title: string, category: Category, discipline: string, revision: string, locationId: string, summary: string, text: string, tags: string[], by = "Document Control", ago = 60): DesignDoc =>
  ({ title, category, discipline, revision, locationId, summary, text, tags, by, ago });

export const DESIGN_DOCS: DesignDoc[] = [
  d("Project Execution Plan KH-PMO-PEP-001", "Other", "PMO", "3", "site", "Scope, organisation, phasing, key dates and governance for Kinan Heights.",
    `Scope: 2 residential towers (Tower A 42 floors, Tower B 36 floors), 18-floor 5-star hotel (Block C), 4-level retail podium, amenity club, 12 villas, mosque, substation, STP, infrastructure. GFA ≈ 412,000 m². Contract value SAR 2.68 bn (design & build, main contractor Al-Bunyan Contracting).
Key dates: NTP 01-Mar-2025; Tower B topping out Nov-2026; Tower A topping out (baseline Apr-2027, forecast May-2027); permanent power 28-Oct-2026; villas D1–D4 handover Oct-2026; retail shell & core Jul/Aug-2027; Civil Defense final inspection Apr-2028 (baseline); practical completion 30-Jun-2028 (baseline), forecast 31-Jul-2028.
Governance: weekly progress meeting (Wednesday), monthly client steering committee, fortnightly design coordination, daily 07:00 HSE/production stand-up. Change control: all variations through VO process; Dev Manager approves up to SAR 2M, Project Director above.
Reporting: monthly progress report by 5th working day; schedule updated weekly (data date Thursday).`, ["execution plan", "scope", "key dates", "governance", "milestones"], "Project Director", 400),
  d("Structural Design Basis Report KH-STR-DBR-001", "Specification", "STR", "D", "site", "Codes, loads, materials and structural systems for all buildings.",
    `Codes: SBC 301 (loads), SBC 303 (foundations), SBC 304 (concrete); wind tunnel study for towers.
Superimposed loads: residential 2.0 kPa live + 1.5 kPa SDL; corridors/lobbies 4.8 kPa; retail 4.8 kPa; plant rooms 7.5 kPa; roof 1.0 kPa + plant. Car park 2.5 kPa.
Towers: RC core + perimeter columns; 250 mm PT flat slabs (f'c 50 MPa); columns 900×900 C60/75 to L20, 800×800 C50 above; transfer slab at L3 (1.8 m thick); core walls 300–600 mm slip-formed. Outrigger at L21 (refuge floor) in Tower A.
Hotel C: RC frame, 225 mm PT slabs, transfer at L2 over ballroom (2.2 m deep beams).
Foundations: Tower A piled raft 3.2 m on 186 Ø1200 bored piles (L=28 m); Tower B 3.0 m raft on 164 piles. Groundwater -4.5 m below NGL; basement designed for uplift.
Durability: sulfate exposure below ground — GGBS 30–50%, max w/c 0.40; cover 50 mm to earth faces, 40 mm soffits, 30 mm top of slab.
Deflection limits: span/250 total, span/500 after partitions; façade interface differential movement ±15 mm.`, ["design basis", "loads", "slab", "columns", "foundations", "piles", "transfer", "structure"], "Structural EOR", 300),
  d("MEP Design Basis Report KH-MEP-DBR-001", "Specification", "MEP", "C", "site", "Design conditions, cooling, power, water and drainage strategy.",
    `Outdoor design: 46 °C DB / 20 °C WB summer (Riyadh), 4 °C winter. Indoor: 23 ± 1.5 °C, 50% RH max.
Cooling: central chilled-water plant at podium roof — 4 × 1,250 TR water-cooled chillers (N+1), primary-variable flow, 6/13 °C. Towers: FCUs per apartment; AHUs for lobbies with energy recovery.
Power: 33/11 kV substation, 2 × 2.5 MVA at site level plus building transformers; standby generators 3 × 2 MVA for life safety & essential loads; ATS for fire pumps.
Water: potable tank 2 days storage; tower pressure zones with PRV stations every ~12 floors; hot water by heat-pump.
Drainage: separate soil & waste; storm to attenuation then Ø900 RCP outfall; STP (MBR 1,200 m³/day) — treated effluent for irrigation & cooling make-up.
BMS: BACnet/IP across all buildings; smart metering per apartment.`, ["MEP", "cooling", "chillers", "power", "water", "design conditions", "BMS"], "MEP Consultant", 300),
  d("Fire & Life Safety Strategy KH-FLS-RPT-001", "Specification", "FIRE", "E", "site", "Fire strategy: compartments, egress, refuge floors, smoke control, firefighting.",
    `Codes: SBC 801 / SBC 201 / Civil Defense requirements. All buildings fully sprinklered (light hazard residential, ordinary hazard retail/car park).
Towers: 2 pressurised stairs; refuge floors at Tower A L21 & L35, Tower B L20; 2 h fire-rated cores & shafts; firefighting lift per tower with lobby; wet risers.
Podium: atrium smoke exhaust (mechanical, 8 air changes equivalent), smoke curtains at atrium edges; travel distance limits per occupancy.
Hotel: sleeping risk — voice alarm, 1 h corridor walls, self-closing doors FD30 to rooms.
Fire-stopping: all service penetrations through compartment walls/floors sealed with tested systems — inspection & tagging before ceilings close.
Fire department access: 6 m fire lanes around towers, hydrants max 90 m spacing, fire command centre at Tower A ground.
Construction phase: temporary wet riser within 2 floors of working deck; extinguishers each level.`, ["fire", "refuge", "smoke control", "sprinklers", "compartmentation", "egress", "firestopping"], "Fire Consultant", 200),
  d("Façade Performance Specification KH-FAC-SPC-001", "Specification", "FAC", "C", "site", "Unitised curtain wall performance, tolerances, testing.",
    `System: unitised curtain wall, 1.5 m module, floor-to-floor 3.6 m, double-glazed low-E IGU (SHGC ≤ 0.25, U ≤ 1.8 W/m²K) per energy compliance.
Wind load per wind tunnel (cladding pressures up to ±3.4 kPa at corners). Water tightness 600 Pa static; air permeability 1.5 m³/h·m² at 600 Pa.
Tolerances: embed/cast-in channels ±5 mm in-plane (drawing A-520) — see RFI-0157 for ±10 mm query; bracket adjustment ±25 mm.
Performance mock-up (PMU) testing passed 2026-03. Site water test on 2% of installed joints (hose test).
Installation: from floor using monorail/spider crane; panels stored vertical on A-frames in Laydown 2.`, ["facade", "curtain wall", "tolerance", "embeds", "glazing", "testing"], "Façade Consultant", 260),
  d("Vertical Transportation Report KH-VT-RPT-001", "Specification", "MEP", "B", "tower-a", "Lift numbers, speeds, handling capacity.",
    `Tower A: 6 passenger lifts 2.5 m/s (1,350 kg), 1 firefighting lift 2.5 m/s, 1 service lift. Tower B: 5 passenger + 1 firefighting + 1 service. Hotel C: 4 guest, 2 service. Podium: 12 escalators, 4 shuttle lifts.
Handling capacity ≥ 12% in 5 min; average interval ≤ 40 s. Machine-room-less traction, destination dispatch in towers.
Installation: rails from L20 upward from Jan-2027 (Tower A), firefighting lift commissioning before Civil Defense inspection.`, ["lifts", "elevators", "escalators", "vertical transportation"], "Lift Consultant", 240),
  d("Geotechnical Investigation Report KH-GEO-RPT-001", "Specification", "CIV", "1", "basement", "Ground conditions, groundwater, pile capacities.",
    `Stratigraphy: 0–3 m silty sand fill; 3–9 m medium dense sand; 9–20 m weathered limestone; >20 m limestone (UCS 8–25 MPa). Groundwater -4.5 m below NGL (seasonal +0.5 m).
Sulfate & chloride: moderate — sulfate-resisting measures required. Pile design: Ø1200 bored piles, working load 9,500 kN, socket ≥ 8 m in limestone. Load tests: 2 preliminary static (2.5× WL) passed; dynamic tests on 5% of working piles.`, ["geotechnical", "soil", "groundwater", "piles", "foundations"], "Geotechnical Engineer", 600),
  d("HSE Plan KH-HSE-PLN-001", "HSE", "HSE", "4", "site", "Project HSE management system — rules, permits, training, emergency.",
    `Policy: zero harm. Organisation: HSE Manager, 22 HSE officers (1 per 100 workers), first aiders 1:50.
Permit-to-work types: Hot Work, Work at Height (edge protection removal), Confined Space, Excavation, Electrical LOTO, HV, Critical Lift, Night Works.
Key rules: edge protection §7.2, harness above 1.8 m §7.3, scaffold tagging §7.5, lifting §9, hot work §11, excavation §12, confined spaces §13, electrical §14, concrete & PT §15, heat stress §17 (midday ban 12:00–15:00 in summer; WBGT regime), traffic §20, housekeeping §21.
Monitoring: daily inspections, weekly HSE inspection report, monthly HSE committee, KPIs (TRIR, LTIFR, near-miss reporting rate).
Incident reporting: all incidents/near misses reported within 1 h to HSE officer; investigation within 48 h.`, ["HSE plan", "permits", "rules", "safety", "heat stress", "PPE"], "HSE Manager", 200),
  d("Emergency Response Plan KH-HSE-ERP-002", "HSE", "HSE", "2", "site", "Evacuation, muster, medical emergency, fire, tower rescue.",
    `Alarm: site siren (continuous = evacuate). Muster points: M1 south near Gate 1, M2 east. Headcount by area supervisors using biometric attendance list.
Medical: call site clinic (ext. 997 on site radio ch. 3), clinic dispatches; external ambulance via Gate 1 (Gate 3 emergency access east).
Tower emergency: evacuate by stairs only (never hoist); casualty at height — rescue team with stretcher & hoist-down kit; crane basket only with lift plan.
Fire: raise alarm, use extinguisher only if trained & safe, Civil Defense 998 called by Security Control.
Drills: weekly siren test Sunday 10:00, quarterly evacuation drill (last 21-Sep-2026).`, ["emergency", "evacuation", "muster", "rescue", "fire", "first aid"], "HSE Manager", 150),
  d("Quality Management Plan KH-QA-QMP-001", "Inspection", "QA", "3", "site", "ITPs, hold points, NCR process, testing frequencies.",
    `ITPs per activity with hold (H) & witness (W) points; consultant notified 24 h before hold points via inspection request (IR).
Concrete: 1 set of 6 cubes per 50 m³ or per pour; slump each truck; temperature ≤ 32 °C at placing. Rebar: mill certs per lot + 1 tensile test per 50 t.
NCR process: raised by QA/consultant → contractor proposes disposition within 7 days → EOR approves repair → closed after verification.
Pre-pour checklist signed by QA, MEP, PT and consultant before any slab pour.`, ["quality", "ITP", "NCR", "testing", "hold point"], "QA/QC Manager", 250),
  d("Procurement Plan KH-PRC-PLN-001", "Other", "PMO", "2", "site", "Packaging strategy, long-lead items, approval levels, ERP integration.",
    `28 procurement packages; long-lead: façade (16 wks), lifts (26 wks), chillers (22 wks), BMU (30 wks), LV switchgear (18 wks), transformers (30 wks).
Approval: MR → procurement → technical approval (MAS) → commercial approval → PO in ERP. Dev Manager approval for packages > SAR 10M or any VO.
Required-on-site dates derived from the programme (need date = activity start − 7 days). Weekly long-lead tracker in progress meeting.
ERP: POs and GRNs live in the purchasing system; the onsite agent reads PO/delivery status from it (sync) and raises draft material requests.`, ["procurement", "long lead", "approval", "packages", "ERP"], "Procurement Manager", 230),
  d("Traffic Management Plan rev 3", "Method Statement", "CIV", "3", "g2", "Gate usage, routes, delivery booking, speed limits.",
    `Gate 1: personnel & visitors only. Gate 2: materials & heavy vehicles (booked slots, 24 h notice). Gate 3: emergency access only.
One-way anti-clockwise perimeter ring road, 15 km/h. Main haul road E-W two-way with banksmen at crossings.
Concrete trucks: night route via King Fahd Branch Road during summer pours. No queuing on public road — holding area inside Gate 2 for 6 trucks.
Abnormal loads (crane sections, transformers, precast) need escort permit and 72 h notice.`, ["traffic", "gates", "deliveries", "logistics", "route"], "Logistics Manager", 120),
  d("Lift Plan LP-0412 — Rooftop chiller frame (TC2)", "Method Statement", "HSE", "1", "tc2", "Critical lift 6.8 t at 31 m radius (86% SWL).",
    `Load 6.8 t incl. rigging; radius 31 m; TC2 capacity at 31 m = 7.9 t → 86% SWL (critical lift). Wind limit for this lift 30 km/h. Exclusion zone below path; TC1 parked outside overlap. Rigging: 4-leg chain sling 10 t, shackles 8.5 t. Approved by Lifting Supervisor.`, ["lift plan", "critical lift", "crane", "chiller"], "Lifting Supervisor", 3),
  d("Monthly Progress Report — September 2026", "Minutes", "PMO", "", "site-office", "Overall progress 46.8% vs 49.2% planned; key risks and look-ahead.",
    `Overall physical progress 46.8% (plan 49.2%). Tower A: L12 slab complete, cycle 8 days vs 7-day baseline — forecast topping-out 4 weeks late unless cycle recovered. Tower B: L29 slab, core L31 — 3 days behind. Hotel C: raft complete 20-Sep (26 days late) — recovery plan with TC3 now commissioned. Podium: MEP 62%, atrium glazing VO-023 decision required (21-day EOT claim). Villas: D1–D4 snagging, client walkthrough 12-Oct.
Procurement risks: Tower A façade batch 4 (+18 days), BMU RFQ late (+35 days), atrium glazing evaluation pending VO-023.
HSE: 212 LTI-free days, TRIR 0.41; two HIGH findings week 39 closed/being closed.
Cash flow: certified to date SAR 1.21 bn (45%).`, ["progress", "monthly report", "risks", "status", "look-ahead"], "Planning Manager", 1),
];

// CSI specification sections (key requirements only)
const S = (sec: string, title: string, disc: string, text: string, tags: string[]) => d(`Specification ${sec} — ${title}`, "Specification", disc, "A", "site", text.split(".")[0] + ".", text, ["spec", sec, ...tags], "Document Control", 420);
DESIGN_DOCS.push(
  S("03 38 00", "Post-Tensioned Concrete", "STR", "Unbonded/bonded PT per EOR design; strand 15.2 mm 1860 MPa low-relaxation. Stressing when concrete ≥ 25 MPa (min 7 days for typical slabs, 3 days for initial 20% stress allowed by EOR). Elongations within ±7% of calculated. Grouting within 7 days of stressing; grout strength ≥ 30 MPa. Tendon profiles checked before pour (chairs every 1 m).", ["PT", "stressing", "tendons", "grout"]),
  S("03 41 00", "Precast Structural Concrete", "STR", "Precast stairs and hollow-core planks from approved plant; lifting inserts rated 4× working load; bearing ≥ 75 mm; erection tolerance ±10 mm.", ["precast", "stairs"]),
  S("04 22 00", "Concrete Unit Masonry", "ARC", "Hollow blocks 200 mm (7 MPa), thermal blocks for external walls; mortar M4; movement joints every 6 m; lintels bearing 200 mm; wall ties to columns every 3rd course.", ["blockwork", "masonry"]),
  S("05 12 00", "Structural Steel Framing", "STR", "Steel S355; bolts grade 8.8/10.9 pre-loaded at slip-critical joints; welding to AWS D1.1 by qualified welders; 100% visual and 10% UT on full-penetration welds; fire protection intumescent 90 min to atrium roof steel.", ["steel", "atrium", "welding"]),
  S("07 13 00", "Sheet Waterproofing", "ARC", "Basement: 2 mm HDPE pre-applied under raft; walls 4 mm torch-on + protection board; podium decks: liquid PU membrane; flood test 72 h before screed; laps ≥ 100 mm.", ["waterproofing", "membrane", "flood test"]),
  S("07 84 00", "Firestopping", "FIRE", "Tested firestopping systems matching wall/floor rating (2 h at cores & shafts); each penetration labelled with system ID; 100% inspection by fire consultant before ceilings close.", ["firestopping", "penetrations", "fire"]),
  S("08 44 13", "Glazed Curtain Walls", "FAC", "See Façade Performance Specification KH-FAC-SPC-001; anchors stainless A4; structural silicone two-part with adhesion tests per batch.", ["facade", "curtain wall", "silicone"]),
  S("09 29 00", "Gypsum Board", "ARC", "12.5 mm standard, 15 mm fire-rated (type F) in corridors and shafts, moisture-resistant in wet areas; studs 600 mm c/c; deflection head track at slab soffit.", ["drywall", "gypsum", "partitions"]),
  S("09 30 00", "Tiling", "ARC", "Porcelain 600×1200 rectified; lippage ≤ 1 mm (≤ 0.8 mm in wet areas); adhesive C2TE S1; movement joints at perimeter and every 25 m²; falls to drains 1:100.", ["tiling", "lippage", "porcelain"]),
  S("14 21 00", "Electric Traction Elevators", "MEP", "MRL traction lifts 2.5 m/s; firefighting lifts to EN 81-72; destination dispatch; car finishes per interior design; witness test by third party before Civil Defense inspection.", ["lifts", "elevators"]),
  S("21 13 13", "Wet-Pipe Sprinkler Systems", "FIRE", "Design to NFPA 13 as referenced by SBC 801: light hazard 4.1 mm/min over 139 m², ordinary hazard group 2 8.1 mm/min over 139 m²; hydrostatic test 13.8 bar for 2 h; hangers max 3.7 m spacing.", ["sprinklers", "fire", "hydrostatic test"]),
  S("22 11 16", "Domestic Water Piping", "PLB", "PPR PN20 for apartments; copper type L in plant rooms; pressure test 1.5× working (min 10 bar) for 2 h; disinfection & bacteriological test before handover.", ["plumbing", "water", "pressure test"]),
  S("23 64 00", "Packaged Water Chillers", "HVAC", "Water-cooled centrifugal 1,250 TR, IPLV ≤ 0.40 kW/TR, R-1233zd/R-514A low-GWP refrigerant; factory witness test; vibration isolation; refrigerant leak detection in plant room.", ["chillers", "HVAC", "cooling"]),
  S("26 24 16", "Panelboards", "ELE", "Form 4 type 2 main panels; floor DBs with 30 mA RCD on socket circuits; IP54 in plant rooms; thermographic survey at T&C.", ["panels", "electrical", "RCD"]),
  S("28 31 00", "Fire Detection and Alarm", "FIRE", "Addressable analogue system networked across buildings; voice evacuation in hotel & podium; detectors in all habitable rooms & corridors; interfaces to lifts, AHUs, smoke control and access doors; cause-and-effect matrix tested 100%.", ["fire alarm", "detectors", "voice evacuation"]),
  S("31 23 00", "Excavation and Fill", "CIV", "Excavation to formation with engineer's inspection; fill in 200 mm layers compacted to 95% MDD (modified Proctor); field density test every 500 m² per layer.", ["excavation", "compaction", "fill"]),
  S("32 12 16", "Asphalt Paving", "CIV", "Base course 250 mm aggregate (98% MDD); binder 60 mm + wearing 50 mm; polymer-modified bitumen for heavy-duty roads; core tests every 1,000 m².", ["asphalt", "roads", "paving"]),
  S("33 41 00", "Storm Utility Drainage Piping", "CIV", "RCP class III Ø600–Ø900; bedding class B; CCTV survey of all lines before handover; manholes precast with step irons.", ["storm drainage", "RCP", "CCTV"]),
);
