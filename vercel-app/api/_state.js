/* Shared task state — the thing the pack never had.
 *
 * Bohio, Monday and WhatsApp each held their own idea of a task. Nothing
 * reconciled them, so a manual edit on either side was invisible to the
 * other and WhatsApp answered from a hardcoded constant. This module is the
 * one record they all read and write, stored in Upstash next to the updates.
 *
 * Every write carries an origin and a revision. A change that arrived FROM
 * Monday is recorded but never pushed back to Monday, which is what stops
 * the two sides echoing each other forever.
 */
const KEY='bohio:state:tasks';
const LOG='bohio:state:changes';

const local=()=>process.env.LOCAL_DEMO==='1';
if(local()){ global.__bohioState=global.__bohioState||{}; global.__bohioLog=global.__bohioLog||[]; }

async function redis(parts){
  const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token) throw new Error('Shared state storage is not configured');
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(parts)});
  if(!r.ok) throw new Error(`Storage returned ${r.status}`);
  const p=await r.json();
  if(p.error) throw new Error(p.error);
  return p.result;
}

async function getState(){
  if(local()) return global.__bohioState;
  const raw=await redis(['GET',KEY]);
  if(!raw) return {};
  try{ return JSON.parse(raw)||{}; }catch{ return {}; }
}
async function putState(state){
  if(local()){ global.__bohioState=state; return; }
  await redis(['SET',KEY,JSON.stringify(state)]);
}
async function pushChange(entry){
  if(local()){ global.__bohioLog.unshift(entry); global.__bohioLog=global.__bohioLog.slice(0,200); return; }
  await redis(['LPUSH',LOG,JSON.stringify(entry)]);
  await redis(['LTRIM',LOG,'0','199']);
}
async function listChanges(limit=40){
  if(local()) return global.__bohioLog.slice(0,limit);
  const rows=await redis(['LRANGE',LOG,'0',String(limit-1)]);
  return (rows||[]).map(r=>{try{return JSON.parse(r);}catch{return null;}}).filter(Boolean);
}

const FIELDS=['status','pct','plannedStart','plannedFinish','owner','mondayItemId'];

/* Apply a change and record where it came from. Returns the fields that
 * actually moved, so a caller can decide whether anything needs pushing. */
async function applyChange(taskId,patch,origin,actor){
  if(!taskId) return {changed:[],state:null};
  const state=await getState();
  const cur=state[taskId]||{taskId,rev:0};
  const changed=[];
  FIELDS.forEach(f=>{
    if(patch[f]===undefined||patch[f]===null||patch[f]==='') return;
    if(String(cur[f])===String(patch[f])) return;
    changed.push({field:f,from:cur[f]===undefined?null:cur[f],to:patch[f]});
    cur[f]=patch[f];
  });
  if(!changed.length) return {changed:[],state:cur};
  cur.rev=(cur.rev||0)+1;
  cur.updatedAt=new Date().toISOString();
  cur.origin=origin||'bohio';
  cur.actor=actor||'';
  state[taskId]=cur;
  await putState(state);
  await pushChange({taskId,changed,origin:cur.origin,actor:cur.actor,at:cur.updatedAt,rev:cur.rev});
  return {changed,state:cur};
}

/* Merge a board read. Anything that differs is recorded with origin monday,
 * so it will not be written back. */
async function mergeFromMonday(items){
  const applied=[];
  for(const it of items||[]){
    if(!it.taskId) continue;
    const r=await applyChange(it.taskId,{
      status:it.status,plannedStart:it.plannedStart,plannedFinish:it.plannedFinish,
      owner:it.owner,mondayItemId:it.mondayItemId
    },'monday',it.actor||'Monday board');
    if(r.changed.length) applied.push({taskId:it.taskId,changed:r.changed});
  }
  return applied;
}

module.exports={getState,applyChange,mergeFromMonday,listChanges,FIELDS};
