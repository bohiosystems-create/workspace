import type { Contact, Ncr } from "../types";
import { DATA_DATE, addDays } from "./util";

// Fictional names and placeholder numbers — replace with the real project directory.
const c = (name: string, role: string, company: string, n: number, area?: string): Contact =>
  ({ name, role, company, phone: `+966 50 000 ${String(n).padStart(4, "0")}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, area });
export const CONTACTS: Contact[] = [
  c("Faisal Al-Harbi", "Project Director", "Kinan (Client)", 101),
  c("Development Manager", "Development Manager", "Kinan (Client)", 102, "Whole site"),
  c("Rania Haddad", "Design Manager", "Kinan (Client)", 103),
  c("Omar Siddiqui", "Commercial Manager", "Kinan (Client)", 104),
  c("Lina Al-Qahtani", "Authorities & Permits Manager", "Kinan (Client)", 105),
  c("Ahmed Saleh", "Project Manager", "Al-Bunyan Contracting", 201),
  c("Karim Mansour", "Construction Manager — Towers", "Al-Bunyan Contracting", 202, "Tower A / Tower B"),
  c("Yousef Darwish", "Construction Manager — Hotel & Podium", "Al-Bunyan Contracting", 203, "Hotel C / Podium"),
  c("Sanjay Menon", "HSE Manager", "Al-Bunyan Contracting", 204),
  c("Tariq Aziz", "HSE Officer (night shift)", "Al-Bunyan Contracting", 205),
  c("Maria Santos", "QA/QC Manager", "Al-Bunyan Contracting", 206),
  c("Bilal Khan", "Lifting Supervisor", "Al-Bunyan Contracting", 207, "TC1 / TC2 / TC3"),
  c("Hassan Nouri", "Logistics Manager", "Al-Bunyan Contracting", 208, "Gates, laydown"),
  c("Ibrahim Al-Zahrani", "Procurement Manager", "Al-Bunyan Contracting", 209),
  c("Peter Novak", "Planning Manager", "Al-Bunyan Contracting", 210),
  c("Nadia Farouk", "Document Controller", "Al-Bunyan Contracting", 211),
  c("Rashid Al-Mutairi", "Batching Plant Manager", "Al-Bunyan Contracting", 212, "Batching plant"),
  c("Ali Raza", "Camp Manager", "Al-Bunyan Contracting", 213, "Labour camp"),
  c("George Thomas", "MEP Manager", "Gulf Integrated MEP Services", 301),
  c("Sami Haddad", "MEP Coordinator", "Gulf Integrated MEP Services", 302),
  c("Ahmed Kamal", "Electrical Engineer (HV)", "Gulf Integrated MEP Services", 303, "Substation"),
  c("Daniel Lee", "Façade Package Manager", "Skyline Façade Systems", 401),
  c("Marco Bianchi", "Façade Coordinator", "Skyline Façade Systems", 402),
  c("Huang Wei", "Lift Project Manager", "Vertex Lifts Arabia", 501),
  c("Mustafa Ali", "PT Specialist", "PT-Tech Post-Tensioning", 601),
  c("Dr. Samir Khalil", "Structural Engineer of Record", "Design Consultant (demo)", 701),
  c("Eng. Laila Nasser", "Resident Engineer", "Supervision Consultant (demo)", 702),
  c("Eng. Kareem Fathy", "Fire & Life Safety Consultant", "Design Consultant (demo)", 703),
  c("Site Clinic", "Doctor / Nurse on duty", "Al-Bunyan Contracting", 997, "First aid clinic"),
  c("Site Security Control", "Security Control Room (24/7)", "Al-Bunyan Contracting", 998, "Gate 1"),
  c("Emergency — Civil Defense", "Public emergency number", "Civil Defense", 998, "Dial 998"),
  c("Emergency — Red Crescent (ambulance)", "Public emergency number", "Saudi Red Crescent", 997, "Dial 997"),
];
CONTACTS[CONTACTS.length - 2].phone = "998";
CONTACTS[CONTACTS.length - 1].phone = "997";

const n = (id: number, title: string, loc: string, ago: number, by: string, contractor: string, severity: Ncr["severity"], status: Ncr["status"], disposition: string): Ncr =>
  ({ id: `NCR-${String(id).padStart(4, "0")}`, title, locationId: loc, raised: addDays(DATA_DATE, -ago), by, contractor, severity, status, disposition, due: addDays(DATA_DATE, -ago + 14) });
export const NCRS: Ncr[] = [
  n(88, "Honeycombing at core wall Tower B L27 (grid C/3)", "tower-b-l27", 12, "Resident Engineer", "Al-Bunyan Contracting", "Minor", "Open", "Repair with approved micro-concrete; method statement to be submitted"),
  n(87, "Façade embeds L2–L9 Tower B cast at ±10 mm vs ±5 mm specified", "tower-b", 18, "Façade Consultant", "Al-Bunyan Contracting", "Major", "Open", "Pending RFI-0157 response — possible drill-and-anchor remedial for 38 channels"),
  n(86, "Concrete cover 28 mm measured at Tower A L9 slab soffit (40 mm required)", "tower-a-l9", 26, "QA/QC Manager", "Al-Bunyan Contracting", "Major", "Open", "Cover-meter survey of full bay; structural assessment by EOR"),
  n(85, "Fire-stopping missing at riser penetrations Tower A L5–L6", "tower-a-l5", 30, "Fire Consultant", "Gulf Integrated MEP Services", "Major", "Open", "Install approved fire-stopping system; re-inspect before ceiling close-up"),
  n(84, "Tile lippage > 1 mm in master bath, Villa D3", "villa-3", 9, "QA Engineer", "Diwan Interiors", "Minor", "Open", "Re-lay affected tiles before client walkthrough 12-Oct"),
  n(83, "Rebar lap length short at Hotel C raft starter bars (35d vs 50d)", "hotel-c", 40, "Resident Engineer", "Al-Bunyan Contracting", "Major", "Closed", "Couplers installed per EOR sketch SK-HC-014"),
  n(82, "Unapproved gypsum board brand delivered to Tower A L4 mock-up", "tower-a-l4", 22, "QA/QC Manager", "Diwan Interiors", "Minor", "Open", "Reject; material approval MAS-DW-03 pending — supplier prequalification audit"),
  n(81, "Waterproofing membrane damaged at B1 podium slab (flood test leak)", "tower-a-b1", 55, "Resident Engineer", "Sahara Waterproofing", "Major", "Closed", "Patched and re-tested 72 h — pass"),
  n(80, "PT duct crushed at Tower A L10 before pour", "tower-a-l10", 60, "PT Specialist", "Al-Bunyan Contracting", "Minor", "Closed", "Duct replaced before pour"),
  n(79, "Sprinkler pipe hangers spacing exceeded at Podium L1", "podium-l1", 35, "Fire Consultant", "SafeGuard Fire Systems", "Minor", "Closed", "Additional hangers installed"),
  n(78, "Cube result 47.2 MPa (C50) — Tower B L24 slab bay 3", "tower-b-l24", 70, "Materials Engineer", "Al-Bunyan Contracting", "Major", "Closed", "Cores taken: 56.8 MPa equivalent — accepted by EOR"),
  n(77, "Manhole MH-S2 invert level 60 mm high", "util-corridor", 44, "Infrastructure Engineer", "Najd Infrastructure Works", "Minor", "Closed", "Benching rebuilt to correct invert"),
  n(76, "Earthing resistance at temporary DB-T7 above limit", "laydown-2", 15, "Electrical Engineer (HV)", "Gulf Integrated MEP Services", "Minor", "Open", "Additional earth rod; re-test"),
  n(75, "Damaged unitised panel (cracked glass) received in batch 3", "laydown-2", 20, "Façade Coordinator", "Skyline Façade Systems", "Minor", "Open", "Return to factory; replacement in batch 5"),
];
