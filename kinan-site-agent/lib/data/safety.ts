import type { Incident, Permit, RiskAssessment, SafetyRequirement } from "../types";
import { DATA_DATE, addDays, int, pick, rng } from "./util";

const HSE_PLAN = "Project HSE Plan KH-HSE-PLN-001 rev 4";
type Q = Omit<SafetyRequirement, "id">;
const base = ["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves"];
const reqs: Q[] = [
  // working at height
  { topic: "Working at height", requirement: "Edge protection on all open slab edges, voids and shafts: top rail ≥1.0 m, mid-rail and 150 mm toe board; must withstand 0.9 kN point load. Removal only under permit and replaced same shift.", appliesTo: ["slab", "structure", "tower-a", "tower-b", "hotel-c", "edge"], permit: "Work at Height Permit (when removing edge protection)", ppe: base, source: HSE_PLAN + " §7.2", critical: true },
  { topic: "Working at height", requirement: "Full-body harness with double lanyard and 100% tie-off above 1.8 m where collective protection is not possible; anchors rated ≥15 kN or engineered lifelines.", appliesTo: ["height", "facade", "roof", "scaffold"], ppe: [...base, "Full-body harness"], source: HSE_PLAN + " §7.3", critical: true },
  { topic: "Working at height", requirement: "Scaffolds erected and inspected by competent scaffolder; tag system: GREEN = safe, YELLOW = restricted (harness), RED = do not use. Re-inspect every 7 days and after high winds.", appliesTo: ["scaffold", "facade", "finishes"], ppe: base, source: HSE_PLAN + " §7.5", critical: true },
  { topic: "Working at height", requirement: "Mobile elevating work platforms: trained operator, ground conditions checked, no use in wind > 45 km/h, harness attached inside boom-type MEWPs.", appliesTo: ["mewp", "podium", "atrium"], ppe: [...base, "Full-body harness"], source: HSE_PLAN + " §7.6", critical: false },
  { topic: "Working at height", requirement: "Floor openings > 300 mm covered with secured, marked covers able to take 2× expected load, or barricaded.", appliesTo: ["slab", "structure", "mep"], ppe: base, source: HSE_PLAN + " §7.2", critical: true },
  { topic: "Falling objects", requirement: "Drop zones barricaded below façade installation and tower edges; debris netting/catch fans at tower perimeter 2 floors below working deck; tools tethered above 2 m.", appliesTo: ["facade", "tower-a", "tower-b", "edge"], ppe: base, source: HSE_PLAN + " §7.8", critical: true },
  // lifting
  { topic: "Lifting operations", requirement: "Every lift planned by a competent person; lifts > 80% of SWL, tandem or over occupied areas require a written lift plan approved by the Lifting Supervisor.", appliesTo: ["lifting", "crane", "tc1", "tc2", "tc3", "precast"], permit: "Critical Lift Permit (>80% SWL)", ppe: base, source: "Method Statement — Tower Crane TC1/TC2 Interference Zone rev 2", critical: true },
  { topic: "Lifting operations", requirement: "Wind limits: hold lifts at 38 km/h; stop all crane operations at 50 km/h and slew to free-weathervane. Anemometer readings logged hourly.", appliesTo: ["crane", "tc1", "tc2", "tc3", "lifting", "wind"], ppe: base, source: "Method Statement — Tower Crane TC1/TC2 Interference Zone rev 2", critical: true },
  { topic: "Lifting operations", requirement: "TC1/TC2 overlap zone above podium: no simultaneous lifts inside overlap; radio call & confirmation; slew limiters must be functional (tested daily).", appliesTo: ["tc1", "tc2", "podium", "crane"], ppe: base, source: "Method Statement — Tower Crane TC1/TC2 Interference Zone rev 2", critical: true },
  { topic: "Lifting operations", requirement: "Certified banksman/signaller for every crane lift; no personnel under suspended loads; tag lines for loads > 1 t.", appliesTo: ["lifting", "crane"], ppe: base, source: HSE_PLAN + " §9.4", critical: true },
  { topic: "Lifting operations", requirement: "Lifting accessories colour-coded for the current quarter (Q4 2026 = BLUE) after inspection; non-coded slings quarantined.", appliesTo: ["lifting", "rebar-yard", "laydown-1", "laydown-3"], ppe: base, source: HSE_PLAN + " §9.6", critical: false },
  { topic: "Hoists", requirement: "Material/passenger hoists inspected weekly by competent person and after any alteration; landing gates interlocked; max load posted at each landing.", appliesTo: ["hoist-a", "hoist-b", "hoist"], ppe: base, source: HSE_PLAN + " §9.8", critical: true },
  // hot work / fire
  { topic: "Hot work", requirement: "Hot work permit for welding, cutting, grinding outside designated workshop; 11 m combustibles cleared or covered; 2 extinguishers + fire blanket; fire watch for 60 min after work ends.", appliesTo: ["hot work", "welding", "steel", "atrium", "podium"], permit: "Hot Work Permit", ppe: [...base, "Welding shield", "Leather gloves", "FR overalls"], source: HSE_PLAN + " §11.2", critical: true },
  { topic: "Fire safety", requirement: "Temporary wet riser charged to within 2 floors of the working deck in towers; extinguishers at each stair landing; fire points every 30 m on site.", appliesTo: ["tower-a", "tower-b", "hotel-c", "fire"], ppe: base, source: "Civil Defense construction requirements / " + HSE_PLAN, critical: true },
  { topic: "Fire safety", requirement: "Flammables stored in ventilated, shaded, bunded store ≥ 10 m from buildings; no smoking except designated areas.", appliesTo: ["store", "laydown-2"], ppe: base, source: HSE_PLAN + " §11.5", critical: false },
  // excavation / confined spaces
  { topic: "Excavation", requirement: "Excavations > 1.2 m deep: shoring, benching or battering designed by engineer; edge barriers 1 m back; daily inspection; ladder access every 15 m.", appliesTo: ["excavation", "util-corridor", "stp", "trench"], permit: "Excavation Permit (with services clearance)", ppe: base, source: HSE_PLAN + " §12.1", critical: true },
  { topic: "Excavation", requirement: "Underground services scanned (CAT & Genny / GPR) and marked before any digging; hand-dig within 1 m of known services; 11 kV duct bank: hand-dig only within 1.5 m.", appliesTo: ["excavation", "util-corridor", "substation"], permit: "Excavation Permit", ppe: base, source: HSE_PLAN + " §12.3", critical: true },
  { topic: "Confined space", requirement: "Entry to manholes, tanks, lift pits, STP tanks only with permit, gas test (O₂ 19.5–23.5%, H₂S < 10 ppm, LEL < 10%), continuous monitoring, attendant and rescue plan.", appliesTo: ["confined", "stp", "water-tank", "lift pit", "manhole"], permit: "Confined Space Entry Permit", ppe: [...base, "Gas detector", "Rescue harness"], source: HSE_PLAN + " §13", critical: true },
  // electrical
  { topic: "Electrical", requirement: "Lock-out/tag-out before work on any electrical system; only authorised electricians; temporary DBs with RCD 30 mA, inspected and tagged monthly.", appliesTo: ["electrical", "mep", "substation"], permit: "Electrical Isolation (LOTO) Permit", ppe: [...base, "Insulated gloves (where live work authorised)"], source: HSE_PLAN + " §14", critical: true },
  { topic: "Electrical", requirement: "HV areas (substation) — Senior Authorised Person controls access; HV permit-to-work and earthing schedule; SEC procedures apply after energisation (28-Oct-2026).", appliesTo: ["substation", "hv"], permit: "HV Permit-to-Work", ppe: [...base, "Arc-flash PPE (cat. as assessed)"], source: HSE_PLAN + " §14.6", critical: true },
  // concrete / PT
  { topic: "Concrete pumping", requirement: "Exclusion zone around pump boom & outriggers; outrigger pads on firm ground; boom not within 6 m of overhead lines; line blockage procedure — never open pressurised line.", appliesTo: ["concrete", "pump", "slab", "batching"], ppe: [...base, "Face shield (cleaning)"], source: HSE_PLAN + " §15.1", critical: true },
  { topic: "Post-tensioning", requirement: "No one stands behind jacks or anchorages during stressing; barricade 3 m behind live end; warning signs at slab edge below; only PT specialist operatives.", appliesTo: ["pt", "post-tension", "stressing", "slab"], ppe: [...base, "Face shield"], source: "PT method statement / " + HSE_PLAN, critical: true },
  { topic: "Formwork", requirement: "Formwork & propping erected to approved design; striking only after engineer's release (cube results); back-propping maintained 2 levels below casting level.", appliesTo: ["formwork", "slab", "structure"], ppe: base, source: HSE_PLAN + " §15.4", critical: true },
  // heat & health
  { topic: "Heat stress", requirement: "Summer midday ban 12:00–15:00 for outdoor work in direct sun (MHRSD, ~15 Jun–15 Sep). Outside ban: WBGT monitored hourly; work/rest regime per WBGT band; cool shaded rest areas & chilled water every 100 m; buddy system.", appliesTo: ["heat", "outdoor", "slab", "roof", "facade", "concrete", "site"], ppe: [...base, "Cooling vest (WBGT > 32)"], source: "MHRSD midday ban / " + HSE_PLAN + " §17", critical: true },
  { topic: "Health", requirement: "First aiders ratio 1:50 workers per shift; site clinic staffed during all shifts; ambulance access to all areas kept clear.", appliesTo: ["site", "firstaid"], ppe: base, source: HSE_PLAN + " §18", critical: false },
  { topic: "Noise & dust", requirement: "Hearing protection in zones > 85 dB(A) (batching plant, breakers, cutting); silica dust controls (wet cutting, extraction); FFP3 masks when dry cutting unavoidable.", appliesTo: ["batching", "cutting", "finishes", "noise", "dust"], ppe: [...base, "Ear defenders", "FFP3 mask"], source: HSE_PLAN + " §19", critical: false },
  // traffic & logistics
  { topic: "Traffic management", requirement: "One-way anti-clockwise perimeter road, 15 km/h site speed limit; pedestrians segregated by barriers; Gate 2 trucks only; reversing only with banksman.", appliesTo: ["r-ring", "r-main", "g2", "deliveries", "logistics"], ppe: base, source: "Site Logistics Plan rev F / TMP rev 3", critical: true },
  { topic: "Traffic management", requirement: "Deliveries booked in a slot at least 24 h ahead via logistics; unbooked trucks turned away at Gate 2; abnormal loads escorted.", appliesTo: ["deliveries", "g2"], ppe: base, source: "Site Logistics Plan rev F", critical: false },
  { topic: "Plant", requirement: "All plant third-party inspected and stickered; operators hold valid certificate; daily pre-use checklist; reversing alarm & camera on dump trucks and loaders.", appliesTo: ["plant", "excavation", "r-main"], ppe: base, source: HSE_PLAN + " §20", critical: false },
  // housekeeping, induction, emergency
  { topic: "Housekeeping", requirement: "Materials stacked ≤ 1.5 m (pipes & bars chocked); walkways 1 m clear; daily clean-up end of shift; waste to segregated skips.", appliesTo: ["laydown-1", "laydown-2", "laydown-3", "rebar-yard", "site"], ppe: base, source: HSE_PLAN + " §21", critical: false },
  { topic: "Induction & training", requirement: "Site induction for all workers & visitors (Arabic/English/Urdu/Hindi/Bengali); daily toolbox talk per crew; task-specific training records before high-risk work.", appliesTo: ["site"], ppe: base, source: HSE_PLAN + " §5", critical: false },
  { topic: "Emergency", requirement: "Emergency muster points M1 (south, near Gate 1) and M2 (east); evacuation siren test weekly (Sunday 10:00); quarterly full drill; tower emergency: use stairs, never hoist.", appliesTo: ["site", "muster-1", "muster-2", "tower-a", "tower-b"], ppe: base, source: "Emergency Response Plan KH-HSE-ERP-002", critical: true },
  { topic: "Night work", requirement: "Minimum 150 lux at task, 50 lux on walkways; additional supervisor and first aider on night shift; fatigue — max 12 h shift incl. breaks.", appliesTo: ["night", "concrete", "slab"], ppe: base, source: "Method Statement — Night Concrete Pours", critical: false },
  { topic: "Façade installation", requirement: "Unitised panels lifted with approved lifting beam; floor-edge installers tied off; exclusion zone at ground below; no installation in wind > 38 km/h at panel level.", appliesTo: ["facade", "tower-a", "tower-b", "curtain wall"], permit: "Work at Height Permit", ppe: [...base, "Full-body harness"], source: "Façade installation MS rev 1", critical: true },
  { topic: "Lift installation", requirement: "Lift shafts: landing openings barricaded with lockable gates; work in shaft under permit; protection deck above work position.", appliesTo: ["lift", "lifts", "shaft"], permit: "Work at Height Permit", ppe: [...base, "Full-body harness"], source: "Lift installation MS / " + HSE_PLAN, critical: true },
  { topic: "Chemicals", requirement: "SDS available at point of use; COSHH assessment for curing compounds, waterproofing primers, solvents; eyewash stations near mixing areas.", appliesTo: ["waterproofing", "basement", "finishes", "chemicals"], ppe: [...base, "Chemical gloves", "Goggles"], source: HSE_PLAN + " §16", critical: false },
  { topic: "Water & pools", requirement: "Pool shell, tanks and STP open tanks: edge protection and lifebuoy; no lone working near open water.", appliesTo: ["club-e", "stp", "water-tank", "pool"], ppe: base, source: HSE_PLAN + " §12.6", critical: false },
  { topic: "Welfare", requirement: "Drinking water, shaded rest areas, toilets within 200 m walking distance on every work front; tower welfare unit every 10 floors.", appliesTo: ["site", "tower-a", "tower-b"], ppe: base, source: HSE_PLAN + " §22", critical: false },
];
export const SAFETY_REQUIREMENTS: SafetyRequirement[] = reqs.map((q, i) => ({ id: `HSR-${String(i + 1).padStart(3, "0")}`, ...q }));

export const PPE_MATRIX: Record<string, string[]> = {
  "General site (minimum)": base,
  "Working at height > 1.8 m": [...base, "Full-body harness, double lanyard"],
  "Welding / cutting": [...base, "Welding shield", "Leather gauntlets", "FR overalls"],
  "Concrete pour / pump cleaning": [...base, "Rubber boots", "Face shield"],
  "Batching plant": [...base, "Ear defenders", "Dust mask FFP2"],
  "Confined space": [...base, "4-gas detector", "Rescue harness", "Breathing apparatus (as assessed)"],
  "HV electrical": [...base, "Arc-flash suit (category as assessed)", "Insulated gloves"],
  "Chemical handling": [...base, "Chemical gloves", "Goggles", "Apron"],
  "Visitors": ["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses"],
};

const ra = (activity: string, hazards: string[], controls: string[], initialRisk: RiskAssessment["initialRisk"], residualRisk: RiskAssessment["residualRisk"], owner: string, reviewed: string): RiskAssessment => ({ id: "", activity, hazards, controls, initialRisk, residualRisk, owner, reviewed });
export const RISKS: RiskAssessment[] = [
  ra("Tower slab cycle (formwork, rebar, pour)", ["Fall from height at edge", "Falling objects", "Formwork collapse", "Heat stress"], ["Perimeter screens 2 floors", "Back-propping 2 levels", "Pour sequence approved", "WBGT monitoring"], "High", "Medium", "Construction Manager — Towers", "2026-09-01"),
  ra("Post-tension stressing", ["Tendon/anchor failure — projectile", "Hydraulic injection"], ["3 m exclusion behind jacks", "Calibrated jacks", "Specialist operatives only"], "High", "Low", "PT Specialist", "2026-08-20"),
  ra("Tower crane operations (TC1/TC2/TC3)", ["Collision in overlap zone", "Dropped load", "High wind"], ["Slew limiters", "Radio protocol", "Wind limits 38/50 km/h", "Lift plans >80% SWL"], "High", "Medium", "Lifting Supervisor", "2026-09-10"),
  ra("Unitised façade installation", ["Fall from floor edge", "Panel drop", "Wind on panel"], ["Tie-off to engineered anchors", "Ground exclusion zone", "Wind stop 38 km/h"], "High", "Medium", "Façade Package Manager", "2026-08-15"),
  ra("Lift installation in shafts", ["Fall down shaft", "Falling objects in shaft", "Crush by moving car"], ["Lockable landing gates", "Protection decks", "LOTO on lift motor"], "High", "Low", "Vertex Lifts Supervisor", "2026-09-05"),
  ra("Atrium roof steel & glazing", ["Fall through atrium void", "Hot work fire", "Glass breakage"], ["Safety nets under atrium", "Hot work permits", "Vacuum lifters certified"], "High", "Medium", "Steel Package Manager", "2026-09-12"),
  ra("Deep excavation & utilities", ["Collapse", "Service strike (11 kV)", "Plant–person contact"], ["Engineered shoring", "Service scans & hand-dig", "Banksmen"], "High", "Medium", "Infrastructure Manager", "2026-07-30"),
  ra("Confined space — STP tanks & manholes", ["Oxygen deficiency", "H₂S", "Drowning"], ["Permit & gas test", "Continuous monitoring", "Rescue team on standby"], "High", "Low", "MEP Supervisor", "2026-08-01"),
  ra("HV substation energisation", ["Electrocution", "Arc flash"], ["SAP control", "HV PTW & earthing", "SEC witness"], "High", "Low", "Electrical Engineer (HV)", "2026-09-25"),
  ra("Summer night concrete pours", ["Fatigue", "Poor visibility", "Traffic at night"], ["150 lux lighting", "Shift limits", "Night supervisor"], "Medium", "Low", "Concrete Manager", "2026-06-01"),
  ra("Rebar fabrication & handling", ["Cuts & crush", "Manual handling", "Unstable stacks"], ["Stack ≤1.5 m", "Machine guards", "Mechanical handling"], "Medium", "Low", "Rebar Yard Supervisor", "2026-05-20"),
  ra("Basement waterproofing (torch-on)", ["Fire", "Burns", "Fumes in confined areas"], ["Hot work permit", "Ventilation", "Extinguisher at each torch"], "Medium", "Low", "Waterproofing Supervisor", "2025-10-01"),
  ra("MEP first fix in towers", ["Ladders/MEWP falls", "Electrical", "Manual handling of pipes"], ["Podium steps, not ladders", "LOTO", "Team lifts"], "Medium", "Low", "MEP Manager", "2026-09-01"),
  ra("Deliveries & site traffic", ["Vehicle–pedestrian collision", "Reversing", "Queueing on public road"], ["Segregated walkways", "Banksmen", "Booked slots"], "High", "Medium", "Logistics Manager", "2026-08-10"),
  ra("Villa finishes & handover", ["Slips & trips", "Dust", "Chemical exposure"], ["Housekeeping", "Extraction", "SDS & PPE"], "Low", "Low", "Villa Area Manager", "2026-09-15"),
  ra("Labour camp operations", ["Fire in accommodation", "Heat", "Food hygiene"], ["Fire alarm & extinguishers", "Cooling", "Kitchen inspections"], "Medium", "Low", "Camp Manager", "2026-09-20"),
  ra("Pool & water tank works", ["Drowning", "Fall into tank", "Confined space"], ["Edge protection", "Permit", "Lifebuoy"], "Medium", "Low", "Infrastructure Manager", "2026-09-18"),
  ra("Batching plant operation", ["Noise", "Dust", "Entanglement in conveyors"], ["Guards & e-stops", "Ear defenders", "Dust suppression"], "Medium", "Low", "Batching Plant Manager", "2026-07-15"),
];
RISKS.forEach((x, i) => (x.id = `RA-${String(i + 1).padStart(3, "0")}`));

const r = rng(99);
const PT: [string, string, string[], string][] = [
  ["Hot Work Permit", "podium-l2", ["Fire watch 60 min post work", "2 extinguishers + fire blanket"], "Steel welding at atrium edge"],
  ["Hot Work Permit", "tower-a-l11", ["Fire watch 60 min", "Combustibles cleared 11 m"], "Cutting of PT anchor tails"],
  ["Hot Work Permit", "hotel-c", ["Fire watch 60 min"], "Embed plate welding at raft"],
  ["Work at Height Permit", "tower-b-l29", ["Harness 100% tie-off", "Exclusion zone at ground below"], "Temporary removal of edge protection for façade bracket survey"],
  ["Work at Height Permit", "tower-a-l4", ["Harness 100% tie-off"], "Façade zone 1 panel installation"],
  ["Work at Height Permit", "podium", ["MEWP operator certified", "Nets under atrium"], "Atrium roof steel connections"],
  ["Critical Lift Permit (>80% SWL)", "tc2", ["Lift plan LP-0412", "Wind < 30 km/h"], "Lift of 6.8 t rooftop chiller frame (Tower B)"],
  ["Critical Lift Permit (>80% SWL)", "tc3", ["Lift plan LP-0418"], "Precast stair flight lifts Hotel C"],
  ["Confined Space Entry Permit", "stp", ["Gas test hourly", "Attendant present", "Rescue tripod"], "Inspection of MBR tank formwork"],
  ["Confined Space Entry Permit", "water-tank", ["Gas test", "Forced ventilation"], "Internal coating inspection — fire water tank"],
  ["Excavation Permit", "util-corridor", ["Services scanned", "Hand-dig within 1.5 m of duct bank"], "Telecom crossing at MH-S2"],
  ["Excavation Permit", "stp", ["Shoring inspected daily"], "Overflow chamber excavation"],
  ["Electrical Isolation (LOTO) Permit", "tower-a-l8", ["LOTO on DB-A8-T1"], "Temporary lighting circuit modification"],
  ["HV Permit-to-Work", "substation", ["SAP: Senior Authorised Person present", "Earthing schedule ES-03"], "Transformer T2 termination checks before SEC inspection"],
  ["Night Works Permit", "batching", ["Lighting 150 lux", "Noise monitoring at boundary"], "Night pour Tower A L13 slab"],
  ["Hot Work Permit", "laydown-2", ["Fire watch 60 min"], "Pipe fabrication outside workshop"],
  ["Work at Height Permit", "tower-b-l31", ["Edge protection reinstated same shift"], "Core formwork climbing"],
  ["Confined Space Entry Permit", "tower-a-b3", ["Gas test", "Attendant"], "Lift pit waterproofing Tower A"],
];
export const PERMITS: Permit[] = PT.map(([type, loc, conditions, description], i) => {
  const from = addDays(DATA_DATE, i < 11 ? -int(r, 0, 1) : -int(r, 3, 20));
  const status: Permit["status"] = i < 11 ? "Active" : i === 11 ? "Suspended" : i === 17 ? "Requested" : "Closed";
  return {
    id: `PTW-${type.split(" ")[0].slice(0, 2).toUpperCase()}-${String(931 + i).padStart(4, "0")}`, type, locationId: loc, description,
    issuer: pick(r, ["Area Supervisor — Towers", "Area Supervisor — Podium", "HSE Officer", "Infrastructure Supervisor"]),
    holder: pick(r, ["Al-Bunyan foreman", "Gulf MEP supervisor", "Skyline Façade supervisor", "PT-Tech supervisor", "Najd Infrastructure foreman"]),
    validFrom: from + " 07:00", validTo: from + (type.startsWith("Night") ? " 23:59" : " 17:00"), status, conditions,
  };
});

const INC: [Incident["type"], string, string, string, string][] = [
  ["Near Miss", "tower-b-l31", "Unsecured plywood sheet lifted by wind, landed inside barricaded zone.", "Material not secured at end of shift", "Tie-down check added to end-of-shift checklist"],
  ["Unsafe Condition", "tower-b-l31", "1.4 m gap in edge protection on east face.", "Edge protection removed for formwork and not reinstated", "Rectified same day; supervisor briefed; permit control reinforced"],
  ["First Aid", "rebar-yard", "Worker cut hand on rebar end while carrying bars.", "Gloves not worn; rebar caps missing", "Caps on all protruding bars; toolbox talk"],
  ["Near Miss", "g2", "Truck reversed without banksman near Gate 2 queue.", "Banksman on break, no relief", "Relief banksman rota; reversing camera mandatory"],
  ["Property Damage", "laydown-1", "Telehandler struck formwork stack.", "Poor visibility, stacks too high", "Stack height limit enforced at 1.5 m"],
  ["First Aid", "tower-a-l10", "Minor eye irritation from concrete splash.", "Glasses removed during pour", "Face shields for pump line cleaning"],
  ["Near Miss", "tc1", "TC1 and TC2 slewed into overlap simultaneously; limiter stopped TC2.", "Radio call not confirmed", "Re-briefing of protocol; daily limiter test log"],
  ["Environmental", "batching", "Cement slurry overflow from washout pit.", "Pit not emptied", "Daily pit inspection; second settlement pit"],
  ["Unsafe Condition", "laydown-2", "Pipe stacks over 1.5 m, unchocked.", "Delivery offloaded without supervision", "Re-stacked; logistics to attend offloads"],
  ["Medical Treatment", "labour-camp", "Heat exhaustion symptoms, worker treated at clinic.", "Worked through rest period", "Supervisors to enforce work/rest; buddy system"],
  ["Near Miss", "util-corridor", "Excavator bucket within 0.5 m of 11 kV duct bank marker.", "Marker displaced", "Hand-dig zone fenced; re-scan before restart"],
  ["First Aid", "villa-3", "Slip on wet tiles during cleaning.", "No wet-floor signage", "Signage + cleaning schedule"],
  ["Unsafe Condition", "hoist-b", "Hoist B landing gate interlock defective at L18.", "Wear on interlock switch", "Hoist B out of service 2 days for inspection; switch replaced"],
  ["Near Miss", "podium-l2", "Hot work sparks fell through atrium void near insulation.", "Fire blanket not covering void", "Spark containment screens required on atrium hot work"],
];
export const INCIDENTS: Incident[] = Array.from({ length: 30 }, (_, i) => {
  const [type, loc, description, rootCause, actions] = INC[i % INC.length];
  return { id: `INC-2026-${String(41 + i).padStart(3, "0")}`, date: addDays(DATA_DATE, -(i * 7 + int(r, 0, 5))), type, locationId: loc, description, rootCause, actions, status: i < 3 ? "Open" : "Closed" };
});

export const SAFETY_STATS = {
  manhoursToDate: 4_812_000, manhoursThisMonth: 386_400, workforceToday: 2_214, ltiFreeDays: 212,
  trir: 0.41, ltifr: 0.04, nearMissesYtd: 118, toolboxTalksThisWeek: 1_064, inductionsThisMonth: 312,
  hseObservationsOpen: 23, lastDrill: "2026-09-21", nextDrill: "2026-12-14",
};
