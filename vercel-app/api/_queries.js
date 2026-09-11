/* On-site retrieval: what a planner or foreman actually asks over WhatsApp.
 *
 * One table, every entry carrying many phrasings, matched fuzzily so typos and
 * different wordings all land. Adding a question means adding a row here.
 * `f` receives the whole context so an answer can use the schedule, the
 * deliverables, the live shared state and the delay engine together.
 */
const M=require('./_match');
const D=require('./_delays');
const K=require('./_knowledge');

const pad=n=>String(n);
const line=(...p)=>p.filter(Boolean).join('\n');
const bullets=a=>a.join('\n');

/* find the activity a message is talking about */
/* Words that appear in an activity name but carry no identity on their own —
 * "who is on site" must not resolve to "Mobilization & Site Setup". */
const GENERIC=new Set(['site','setup','works','work','network','system','and','the','installation']);
function findTask(text,C){
  const q=M.norm(text);
  let best=null,sc=0;
  C.schedule.forEach(([id,name])=>{
    let n=0;
    M.norm(name).split(' ').filter(w=>w.length>3&&!GENERIC.has(w)).forEach(w=>{ if(q.includes(w)) n+=w.length; });
    if(id.length>2&&new RegExp('(^|[^a-z])'+M.norm(id)+'([^a-z]|$)').test(q)) n+=8;
    if(n>sc){sc=n;best={id,name};}
  });
  return sc>=6?best:null;
}
const stateOf=(C,id)=>(C.state||{})[id]||{};
const rowOf=(C,id)=>C.schedule.find(r=>r[0]===id);

const QUERIES=[

/* ---------------- programme ---------------- */
{id:'delays',title:'Delay outlook',
 keys:['where are delays likely','where will we be late','what is likely to slip','likely delays',
   'what could delay','where are the delays','risk of delay','what will be late','delay outlook',
   'what is at risk','where is the risk','anything going to be late','delay forecast','what worries you',
   'biggest risks','where are we exposed','what should i watch'],
 f:C=>{const r=D.likelyDelays(C.schedule,C.state).slice(0,6);
   return r.length?'BOHIO DELAY OUTLOOK\n\n'+r.map(a=>`• ${a.name}  +${a.slip}d (${a.level})\n  ${a.reasons[0]||'no single driver'}`).join('\n\n')
     +'\n\nDriven by purchasing cycles, deliverables not keeping pace, and any finish already moved.'
     :'BOHIO DELAY OUTLOOK\n\nNothing is currently forecast to slip.';}},

{id:'purchasing',title:'Purchasing risk',
 keys:['purchasing','procurement risk','purchase order','lead time','what is not ordered','buying cycle',
   'po risk','not been ordered','hasnt been ordered','nothing ordered','no order raised','what needs ordering',
   'still to order','supply risk','material risk','when will materials arrive','order status','tender status',
   'what is out to tender','have we ordered'],
 f:C=>{const r=D.purchasingRisk(C.schedule,C.state);
   if(!r.length) return 'BOHIO PURCHASING\n\nEvery package has enough cycle left before it is needed.';
   return 'BOHIO PURCHASING RISK\n\n'+r.map(a=>`• ${a.name}  +${a.procSlip}d\n  ${a.procurement.ref||'no order raised'} · ${a.procurement.state.replace('_',' ')}\n  ${a.reasons[0]}`).join('\n\n');}},

{id:'behind',title:'Progress against pace',
 keys:['falling behind','behind schedule','micro tasks','deliverables behind','what is slipping',
   'not keeping pace','which tasks are behind','are we on track','how are we doing','progress against plan',
   'what is late','anything behind','off pace','slipping quietly'],
 f:C=>{const r=D.fallingBehind(C.schedule,C.state);
   if(!r.length) return 'BOHIO PROGRESS\n\nEvery started activity is keeping pace with its dates.';
   return 'BOHIO FALLING BEHIND\n\n'+r.map(a=>`• ${a.name}\n  ${a.verified}/5 verified, about ${Math.round(a.expected*5)}/5 expected by now\n  roughly ${a.impliedSlip}d of drift if it continues`).join('\n\n')
     +'\n\nNo date has been moved on these; the deliverables are simply not keeping pace.';}},

{id:'contractor',title:'Contractor delay load',
 keys:['which contractor','contractor carrying','worst contractor','who is causing delays','contractor delays',
   'which subcontractor','who is behind','contractor performance','who is the problem','which company is late',
   'who carries the most delay','compare contractors','contractor comparison','who is worst'],
 f:C=>{const r=D.contractorLoad(C.schedule,C.state,C.contractorNames).filter(c=>c.activities);
   const w=r[0];
   if(!w||!w.slipDays) return 'BOHIO CONTRACTOR LOAD\n\nNo contractor is carrying measurable slippage.';
   return 'BOHIO CONTRACTOR LOAD\n\n'+r.slice(0,6).map(c=>
     `${c.slipDays?'•':'◦'} ${c.name}\n  ${c.slipDays}d across ${c.activities} activit${c.activities===1?'y':'ies'}`+
     `${c.late?`, ${c.late} at 7d or worse`:''}${c.behind?`, ${c.behind} behind pace`:''}`+
     `${c.items.length?`\n  ${c.items.slice(0,3).join('; ')}`:''}`).join('\n\n')
     +`\n\n${w.name} is carrying the most, ${w.slipDays} days in total.`;}},

{id:'critical',title:'Critical work',
 keys:['what is critical','critical path','what cannot slip','most important','priority work',
   'what matters most','driving the programme','what drives the date'],
 f:C=>{const r=D.assessAll(C.schedule,C.state).filter(a=>a.slip>=7).sort((a,b)=>b.slip-a.slip);
   if(!r.length) return 'BOHIO CRITICAL\n\nNothing is carrying seven days or more of exposure.';
   return 'BOHIO CRITICAL\n\n'+r.map(a=>`• ${a.name} — +${a.slip}d\n  ${a.reasons[0]||''}`).join('\n\n');}},

{id:'next',title:'Starting soon',
 keys:['what starts next','what is next','coming up','what starts soon','upcoming work','next activities',
   'what is due to start','whats coming','next up','forward look'],
 f:C=>{const today=D.DATA_DATE();
   const r=C.schedule.map(row=>{const t=Date.parse(row[3]),n=Date.parse(today);
     return {row,days:(Number.isFinite(t)&&Number.isFinite(n))?Math.round((t-n)/86400000):null};}).filter(x=>x.days!==null)
     .filter(x=>x.days>=-14&&x.days<=60).sort((a,b)=>a.days-b.days);
   if(!r.length) return 'BOHIO LOOK AHEAD\n\nNothing starts in the next 60 days.';
   return 'BOHIO LOOK AHEAD\n\n'+r.map(x=>{const [id,name,c]=x.row;
     const p=D.PROCUREMENT[id]||{};
     return `• ${name}\n  ${x.days<0?`started ${-x.days}d ago`:`starts in ${x.days}d`} · ${(C.contractorNames||{})[c]||'Unassigned'}`+
       (p.state&&p.state!=='na'?`\n  procurement: ${p.state.replace('_',' ')}${p.ref?' '+p.ref:''}`:'');}).join('\n\n');}},

/* ---------------- one activity ---------------- */
{id:'activity',title:'Activity detail',
 keys:['status of','how is','tell me about','detail on','information on','what is happening with',
   'update on','where are we with','progress on','state of'],
 f:(C,text)=>{const t=findTask(text,C); if(!t) return null;
   const row=rowOf(C,t.id),st=stateOf(C,t.id),a=D.assess(row,C.state||{});
   const task=C.taskById(t.id);
   return line(`${t.name.toUpperCase()}`,'',
     `Planned: ${row[3]} to ${row[4]}`,
     st.plannedFinish&&st.plannedFinish!==row[4]?`Live finish: ${st.plannedFinish}`:'',
     `Contractor: ${(C.contractorNames||{})[row[2]]||'Unassigned'}`,
     `Deliverables verified: ${row[5]}/5`,
     st.status?`Status: ${st.status}${st.origin?` (last changed on ${st.origin==='monday'?'Monday':'Bohio'})`:''}`:'Status: not recorded',
     a.slip>0?`Exposure: +${a.slip}d (${a.level})`:'Exposure: clear',
     a.reasons.length?`\n${a.reasons.map(x=>'• '+x).join('\n')}`:'',
     task?`\nDeliverables:\n${task.deliverables.map((d,i)=>`${i<row[5]?'✅':'⬜'} ${d[1]} — ${Number(d[2]).toLocaleString()} ${d[3]}`).join('\n')}`:'');}},

{id:'deliverables',title:'Deliverables',
 keys:['what are the deliverables','deliverables for','what do i need to deliver','what is measured',
   'targets for','what counts as complete','acceptance criteria','how is it measured','what evidence is needed',
   'what do i have to submit'],
 f:(C,text)=>{const t=findTask(text,C); const task=t?C.taskById(t.id):null;
   if(!task) return null;
   const row=rowOf(C,t.id);
   return `${t.name.toUpperCase()} — DELIVERABLES\n\n`+task.deliverables.map((d,i)=>
     `${i<row[5]?'✅':'⬜'} ${d[1]}\n   Target ${Number(d[2]).toLocaleString()} ${d[3]}\n   Accept with ${d[4]}`).join('\n\n');}},

{id:'canstart',title:'Clear to start',
 keys:['can i start','ready to start','clear to begin','am i clear to start','can we begin','is it clear',
   'any hold on','anything stopping','blocked','can we proceed','ok to start'],
 f:(C,text)=>{const t=findTask(text,C); if(!t) return null;
   const row=rowOf(C,t.id),a=D.assess(row,C.state||{}),st=stateOf(C,t.id);
   const p=D.PROCUREMENT[t.id]||{};
   return line(`${t.name.toUpperCase()} — CLEAR TO START?`,'',
     `Planned start ${row[3]}`,
     st.status?`Currently ${st.status}`:'No status recorded',
     p.state&&p.state!=='na'?`Procurement ${p.state.replace('_',' ')}${p.ref?' ('+p.ref+')':''}${a.procSlip>0?` — ${a.procSlip}d short of cycle`:' — cycle fits'}`:'',
     a.slip>0?`Exposure +${a.slip}d`:'No exposure recorded',
     '',
     'Before starting: permit valid, drawing and method statement approved, survey control confirmed, materials on site.');}},

/* ---------------- live state ---------------- */
{id:'livestatus',title:'Live status',
 keys:['live status','status of everything','overall status','whole project status','status report',
   'where are we','how is the project','project status','give me the status','current position','summary'],
 f:C=>{const rows=C.schedule.map(([id,name])=>{const st=stateOf(C,id);
     return `${st.status?'•':'◦'} ${name}\n   ${st.status||'no status recorded'}${st.plannedFinish?` · finish ${st.plannedFinish}`:''}${st.origin?` · last changed on ${st.origin==='monday'?'Monday':'Bohio'}`:''}`;}).join('\n');
   return 'BOHIO LIVE STATUS\n\n'+rows+'\n\nThis is the shared record. A change made on Monday or in Bohio shows here.';}},

{id:'changes',title:'Recent changes',
 keys:['what changed','recent changes','what has happened','any updates','what is new','latest changes',
   'who changed what','change log','history','what did they change','activity log'],
 f:async C=>{const log=await C.changes(12);
   if(!log.length) return 'BOHIO RECENT CHANGES\n\nNothing has changed yet on either platform.';
   return 'BOHIO RECENT CHANGES\n\n'+log.map(c=>{const t=C.taskById(c.taskId);
     return `• ${t?t.name:c.taskId}\n  ${c.changed.map(x=>`${x.field}: ${x.from??'—'} → ${x.to}`).join(', ')}\n  by ${c.actor||'unknown'} on ${c.origin==='monday'?'Monday':'Bohio'} · ${String(c.at||'').slice(0,16).replace('T',' ')}`;}).join('\n\n');}},

{id:'evidence',title:'Evidence',
 keys:['what evidence','what photos','any photos','show me the photos','what is attached','evidence on',
   'photos on','attachments','pictures on','has anyone uploaded','what has been sent','proof'],
 f:C=>{const rows=C.schedule.map(([id,name])=>({id,name,st:stateOf(C,id)}))
     .filter(r=>(r.st.photos||[]).length||r.st.photoCount);
   if(!rows.length) return 'BOHIO EVIDENCE\n\nNo photos are recorded on either platform yet. Send one here, or attach it on the Monday item — both show up.';
   return 'BOHIO EVIDENCE\n\n'+rows.map(r=>{const ph=r.st.photos||[];
     return `• ${r.name} — ${ph.length||r.st.photoCount} item(s)\n`+
       (ph.length?ph.slice(0,4).map(p=>`  ${p.name||'photo'} (added on ${p.origin==='monday'?'Monday':'WhatsApp'})`).join('\n'):'  counted from the Monday item');}).join('\n\n');}},

/* ---------------- people and site ---------------- */
{id:'whoworks',title:'Who is on site',
 keys:['who is working','who is on site','which crew','whose area','who is here','which contractor is here',
   'who is doing this','who owns this','whose work is this','which team'],
 f:(C,text)=>{const t=findTask(text,C);
   if(t){const row=rowOf(C,t.id);
     return `${t.name.toUpperCase()}\n\n${(C.contractorNames||{})[row[2]]||'Unassigned'}\nPlanned ${row[3]} to ${row[4]}`;}
   const today=D.DATA_DATE();
   const live=C.schedule.filter(r=>new Date(r[3])<=new Date(today)&&new Date(r[4])>=new Date(today));
   if(!live.length) return 'BOHIO ON SITE\n\nNo activity is inside its planned window today.';
   return 'BOHIO ON SITE\n\n'+live.map(r=>`• ${r[1]}\n  ${(C.contractorNames||{})[r[2]]||'Unassigned'} · ${r[5]}/5 verified`).join('\n\n');}},
];

/* A statement is not a question. "Ductbank trench flooded overnight" must be
 * filed as a comment, not answered with the excavation regulation because it
 * contains the word trench. Retrieval runs only when the message reads as a
 * question or a short lookup with no site-report signal in it. */
const QWORDS=['what','whats','where','who','whose','which','when','why','how','hows','is','are',
  'do','does','did','can','could','should','any','anything','show','list','give','tell','find',
  'send','has','have','status','need'];
const REPORT=/\b(complete|completed|done|finished|installed|poured|accepted|approved|flooded|stopped|delayed|started|damaged|broken|cracked|leaking|failed|arrived|delivered|removed|erected|compacted|tested)\b|\d+\s*(m|m2|m²|m3|m³|mm|units?|t|no|tonnes?|%)\b/i;
function isRetrieval(text){
  if(/\?/.test(text)) return true;
  const n=M.norm(text), words=n.split(' ').filter(Boolean);
  if(!words.length) return false;
  if(QWORDS.some(w=>M.tokEq(words[0],w))) return true;
  return words.length<=4 && !REPORT.test(n);
}

/* Regulations and project details come from the knowledge module, matched the
 * same fuzzy way. */
async function answer(text,C){
  if(!isRetrieval(text)) return null;
  let best=null,bs=0;
  for(const q of QUERIES){ const s=M.score(text,q.keys); if(s>bs){bs=s;best=q;} }
  if(best&&bs>=6){
    const out=await best.f(C,text);
    if(out) return {title:best.title,body:out};
  }
  const reg=K.regulation(text,M); if(reg) return {title:'Site regulation',body:reg};
  const det=K.detail(text,M);     if(det) return {title:'Project information',body:det};
  return null;
}
module.exports={QUERIES,answer,findTask,isRetrieval};
