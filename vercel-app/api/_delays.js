/* Delay analysis.
 *
 * Answers three questions the planner actually asks: where is a delay likely
 * to appear next, which micro-tasks are quietly falling behind, and is one
 * contractor carrying more of the slippage than the others.
 *
 * It reasons over three things the system already holds: the planned dates in
 * PROJECT_SCHEDULE, how many of each activity's five deliverables have been
 * verified, and the live record in _state (status and any moved finish date).
 * Procurement is added here because the pack had no purchasing data at all,
 * and a lead time that outruns the time left before a start date is the most
 * common cause of a delay that has not surfaced yet.
 */

const DAY=86400000;
const DATA_DATE=()=>process.env.BOHIO_DATA_DATE||'2026-09-09';

/* Award and delivery lead time in calendar days, by procurement state. */
const LEAD={awarded:14,tender:45,not_started:75,na:0};

/* Purchasing position per activity. poRef empty means nothing raised. */
const PROCUREMENT={
  mob  :{state:'awarded',     ref:'PO-1001', items:'Welfare cabins, hoarding, security'},
  earth:{state:'awarded',     ref:'PO-1002', items:'Plant hire, haulage, disposal'},
  drain:{state:'awarded',     ref:'PO-1003', items:'uPVC pipe, catchpits, headwalls'},
  water:{state:'awarded',     ref:'PO-1004', items:'HDPE main, valves, chambers'},
  duct :{state:'tender',      ref:'TND-2011',items:'11kV cable, ductbank concrete'},
  tele :{state:'tender',      ref:'TND-2012',items:'Fibre subduct, chambers'},
  sub  :{state:'awarded',     ref:'PO-1005', items:'Type 1 sub-base, kerbs'},
  asph :{state:'not_started', ref:'',        items:'Bitumen, binder and wearing course'},
  light:{state:'not_started', ref:'',        items:'Columns, luminaires, feeder cable'},
  land :{state:'tender',      ref:'TND-3021',items:'Topsoil, planting, irrigation'},
};

/* A missing or unreadable date must never become NaN: it would travel all the
 * way into a WhatsApp reply as "+NaNd". Every date comparison returns null
 * when it cannot be computed, and callers treat null as "unknown". */
const parseDate=d=>{const t=Date.parse(String(d||''));return Number.isFinite(t)?t:null;};
const days=(a,b)=>{const A=parseDate(a),B=parseDate(b);return (A===null||B===null)?null:Math.round((B-A)/DAY);};
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const num=(n,fallback=0)=>Number.isFinite(n)?n:fallback;

/* How far through an activity we should be, by date. */
function expectedFraction(start,finish,today){
  const total=days(start,finish);
  if(total===null) return null;
  if(total<=0) return 1;
  const elapsed=days(start,today);
  if(elapsed===null) return null;
  return clamp(elapsed/total,0,1);
}

/* One activity, fully assessed. */
function assess(row,state){
  const [id,name,contractor,plannedStart,plannedFinish,verified]=row;
  const today=DATA_DATE();
  const st=state[id]||{};
  const liveFinish=st.plannedFinish||plannedFinish;
  const datesUsable=parseDate(plannedStart)!==null&&parseDate(plannedFinish)!==null;
  const sinceStart=days(plannedStart,today);
  const started=sinceStart!==null&&sinceStart>=0;
  const expectedRaw=expectedFraction(plannedStart,plannedFinish,today);
  const expected=num(expectedRaw,0);
  const actual=clamp((Number(verified)||0)/5,0,1);     // a bad verified count cannot exceed 1
  const deficit=expectedRaw===null?0:Math.max(0,expected-actual);
  const duration=Math.max(1,num(days(plannedStart,plannedFinish),1));

  /* Slippage already declared by a moved finish date. */
  const declaredSlip=Math.max(0,num(days(plannedFinish,liveFinish),0));

  /* Slippage implied by the deliverables not keeping pace. A micro-task
   * falling behind shows up here long before anyone moves a date. */
  const impliedSlip=(started&&datesUsable)?Math.round(deficit*duration):0;

  /* Procurement: does the lead time still fit before the activity starts? */
  const p=PROCUREMENT[id]||{state:'na',ref:'',items:''};
  const lead=LEAD[p.state]??0;
  const untilStart=num(days(today,plannedStart),0);
  const procSlip=(p.state==='na'||actual>=1||!datesUsable)?0:Math.max(0,lead-Math.max(0,untilStart));

  const reasons=[];
  if(procSlip>0){
    reasons.push(p.state==='not_started'
      ? `Nothing raised for ${p.items.toLowerCase()}; a typical ${lead}-day cycle against ${untilStart<0?'a start already passed':`${untilStart} days to start`}.`
      : `${p.ref} is ${p.state==='tender'?'still out to tender':'awarded'}; ${lead} days of cycle against ${untilStart<0?'a start already passed':`${untilStart} days to start`}.`);
  }
  if(impliedSlip>0) reasons.push(`${verified} of 5 deliverables verified where the dates imply about ${Math.round(expected*5)}.`);
  if(declaredSlip>0) reasons.push(`Finish already moved from ${plannedFinish} to ${liveFinish}.`);
  if(st.status&&/stuck|hold|block/i.test(st.status)) reasons.push(`Marked ${st.status} on ${st.origin==='monday'?'Monday':'Bohio'}.`);

  if(!datesUsable) reasons.push('Planned dates are missing or unreadable, so no forecast was made.');
  const slip=num(Math.max(declaredSlip,impliedSlip,procSlip),0);
  const level=slip>=21?'critical':slip>=7?'at risk':slip>0?'watch':'clear';
  return {id,name,contractor,plannedStart,plannedFinish,liveFinish,verified:Number(verified)||0,
    status:st.status||'',expected,actual,deficit,declaredSlip,impliedSlip,procSlip,slip,level,
    datesUsable,procurement:{...p,lead,untilStart},reasons,started};
}

function assessAll(schedule,state){ return schedule.map(r=>assess(r,state||{})); }

/* Where is a delay likely to appear next: things not yet late, but on
 * course to be, ranked by how much and how soon. */
function likelyDelays(schedule,state){
  return assessAll(schedule,state)
    .filter(a=>a.slip>0)
    .sort((a,b)=>b.slip-a.slip||num(days(DATA_DATE(),a.plannedStart),0)-num(days(DATA_DATE(),b.plannedStart),0));
}

/* Micro-tasks quietly falling behind: deliverables not keeping pace with the
 * dates, whether or not anyone has moved a date. */
function fallingBehind(schedule,state){
  return assessAll(schedule,state)
    .filter(a=>a.started&&a.deficit>0.05&&a.actual<1)
    .sort((a,b)=>b.deficit-a.deficit);
}

/* Purchasing cycles that no longer fit. */
function purchasingRisk(schedule,state){
  return assessAll(schedule,state)
    .filter(a=>a.procSlip>0)
    .sort((a,b)=>b.procSlip-a.procSlip);
}

/* Is one contractor carrying more of it than the others. */
function contractorLoad(schedule,state,names){
  const byC={};
  assessAll(schedule,state).forEach(a=>{
    const key=a.contractor||'unassigned';
    const c=byC[key]=byC[key]||{contractor:key,name:(names||{})[key]||'Unassigned',
      activities:0,slipDays:0,late:0,behind:0,worst:null,items:[]};
    c.activities++; c.slipDays+=a.slip;
    if(a.slip>=7) c.late++;
    if(a.deficit>0.05&&a.started) c.behind++;
    if(!c.worst||a.slip>c.worst.slip) c.worst=a;
    if(a.slip>0) c.items.push(`${a.name} +${a.slip}d`);
  });
  return Object.values(byC)
    .map(c=>({...c,avgSlip:c.activities?Math.round(c.slipDays/c.activities):0}))
    .sort((a,b)=>b.slipDays-a.slipDays||b.late-a.late);
}

module.exports={assess,assessAll,likelyDelays,fallingBehind,purchasingRisk,contractorLoad,PROCUREMENT,LEAD,DATA_DATE};
