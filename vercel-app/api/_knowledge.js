/* Project details and site regulations, answerable over WhatsApp.
 *
 * Every regulatory answer carries the caveat that it is indicative: these are
 * safety-critical numbers and the current edition and the project's own fire
 * strategy govern, not this reply.
 */
const PROJECT={
  name:'Bohio Infrastructure Package', code:'BOH-INF-014',
  client:'Bohio Systems LTD', consultant:'Khatib & Alami', contractor:'Nesma & Partners',
  location:'Al Khumrah, South Jeddah', value:'SAR 48.6m', form:'FIDIC Red Book 1999',
  start:'06 Jan 2026', finish:'11 Dec 2026',
  contacts:[
    ['Project Director','Yousef Al-Harbi','+966 55 214 8890'],
    ['Site Engineer (Civils)','Sara Al-Otaibi','+966 55 331 7742'],
    ['Site Engineer (Electrical)','Rami Haddad','+966 56 908 1123'],
    ['QA/QC Manager','Mohammed Zahrani','+966 50 774 2210'],
    ['Resident Engineer','Elena Marquez','+966 54 662 0091'],
    ['HSE Manager','Khalid Saleh','+966 55 019 4477'],
  ],
  hse:{emergency:'999 · site control +966 55 019 4477',
    clinic:'Site clinic — Gate 2, Portakabin C3',
    assembly:'Assembly Point A — north of the batching plant',
    ppe:'Hard hat, hi-vis, steel toe, eye protection. Gloves for rebar and kerb laying.',
    permits:'Hot works · confined space · excavation over 1.2 m · live LV/HV · lifting'},
  logistics:{gate:'Gate 2 (Al Khumrah Road), deliveries 06:00–16:00',
    hours:'Sat–Thu 06:00–18:00, Friday closed. Night works need 48 hours notice.',
    laydown:'Laydown B, east of the substation plot',
    batching:'On-site plant, 40 m³/h, 90 minutes maximum haul to pour'},
};

const CAVEAT='\n\nIndicative only — confirm against the current edition and this project’s own drawings and method statements before relying on it.';

const REGS=[
 {keys:['fire exit','exit width','escape door','escape width'],t:'Fire exit and escape width',
  b:'Escape route widths by occupancy: 750 mm up to 60 people, 850 mm up to 110, 1050 mm up to 220, then 5 mm per person above that.'},
 {keys:['travel distance','distance to exit','escape distance'],t:'Escape travel distance',
  b:'18 m where escape is in one direction only; 45 m where there is more than one direction. Confirm against the fire strategy for the specific area.'},
 {keys:['excavation','trench','shoring','dig depth','support the trench'],t:'Excavation support',
  b:'Support, batter or bench any excavation where a collapse could injure — in practice from about 1.2 m. Inspect at the start of every shift and after any fall of material. Edge protection and safe access every 25 m. Keep spoil and plant back from the edge.'},
 {keys:['scaffold','scaffolding','tower inspection'],t:'Scaffold',
  b:'Inspect before first use, then every 7 days, and after any alteration or adverse weather. Guardrail 950 mm minimum, toe board 150 mm, gap under 470 mm. Handover certificate and tags before use.'},
 {keys:['work at height','fall protection','edge protection'],t:'Work at height',
  b:'Avoid, prevent, then mitigate, in that order. Guardrail 950 mm minimum with an intermediate rail. Rescue plan wherever fall arrest is used.'},
 {keys:['lifting','crane','loler','lift plan'],t:'Lifting operations',
  b:'Thorough examination every 12 months, or 6 months for equipment lifting people. Every lift planned by an appointed person and supervised. Check exclusion zones and wind limits before each lift.'},
 {keys:['noise','decibel','hearing protection'],t:'Noise at work',
  b:'80 dB(A) lower action value, hearing protection provided. 85 dB(A) upper action value, protection mandatory and zones marked. 87 dB(A) exposure limit taking protection into account.'},
 {keys:['confined space','tank entry','manhole entry','chamber entry'],t:'Confined space',
  b:'Avoid entry where the work can be done another way. Safe system of work, gas testing, a top man and a rescue plan. Permit to work for every entry.'},
 {keys:['asbestos','acm'],t:'Asbestos',
  b:'Refurbishment and demolition survey before any intrusive work. Licensed contractor for most insulation and board removal. Stop immediately and report anything unexpected.'},
 {keys:['compaction','mdd','density spec','proctor'],t:'Compaction',
  b:'Fill in 250 mm layers to a minimum 95% MDD. Sub-base Type 1, 300 mm compacted, CBR at least 80%.'},
 {keys:['concrete cover','concrete grade','ductbank concrete'],t:'Concrete to ductbank',
  b:'C25/30 surround with 75 mm cover and red oxide dye.'},
 {keys:['pressure test','water main test','hydro test'],t:'Pressure testing',
  b:'HDPE PE100 PN16. Test at 1.5 times working pressure and hold for 2 hours.'},
 {keys:['welfare','toilet','canteen','rest facilities'],t:'Site welfare',
  b:'Toilets and washing with hot and cold water, drinking water, changing and rest facilities, available from day one and kept clean.'},
 {keys:['permit to work','ptw','what permits','permit required'],t:'Permits to work',
  b:'Required for hot works, confined space, excavation over 1.2 m, live LV/HV work and lifting operations.'},
 {keys:['ppe','protective equipment','hard hat'],t:'PPE',
  b:PROJECT.hse.ppe},
 {keys:['emergency','ambulance','accident','assembly point','first aid'],t:'Emergency',
  b:`Call ${PROJECT.hse.emergency}. ${PROJECT.hse.clinic}. ${PROJECT.hse.assembly}.`,noCaveat:true},
];

const DETAILS=[
 {keys:['project details','contract','who is the client','about the project','project overview'],
  f:()=>`BOHIO PROJECT\n\n${PROJECT.name} (${PROJECT.code})\nClient: ${PROJECT.client}\nConsultant: ${PROJECT.consultant}\nContractor: ${PROJECT.contractor}\nLocation: ${PROJECT.location}\nValue: ${PROJECT.value} · ${PROJECT.form}\nPeriod: ${PROJECT.start} to ${PROJECT.finish}`},
 {keys:['who do i call','who to call','contacts','phone number','contact details','who is the','call','telephone','number for'],
  f:()=>`BOHIO CONTACTS\n\n`+PROJECT.contacts.map(([r,n,p])=>`${n} — ${r}\n${p}`).join('\n\n')},
 {keys:['working hours','site hours','delivery gate','laydown','logistics','deliveries'],
  f:()=>`SITE LOGISTICS\n\nGate: ${PROJECT.logistics.gate}\nHours: ${PROJECT.logistics.hours}\nLaydown: ${PROJECT.logistics.laydown}\nConcrete: ${PROJECT.logistics.batching}`},
];

function regulation(text,match){
  const hit=match.pick(text,REGS,6);
  if(!hit) return null;
  return `${hit.t.toUpperCase()}\n\n${hit.b}`+(hit.noCaveat?'':CAVEAT);
}
function detail(text,match){
  const hit=match.pick(text,DETAILS,6);
  return hit?hit.f():null;
}
module.exports={PROJECT,REGS,DETAILS,regulation,detail};
