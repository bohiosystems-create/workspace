/* GET  /api/sync        pull the board into shared state and report the diff
 * POST /api/sync        record a manual Bohio edit and push it to Monday
 *
 * Either direction lands in the same record, so WhatsApp and both UIs read
 * the same thing afterwards.
 */
const {mergeFromMonday,applyChange,getState,listChanges}=require('./_state');
const {readBoard}=require('./_monday_read');
const {configured,syncToMonday}=require('./_monday');

const json=(res,code,body)=>{res.status(code);res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.send(JSON.stringify(body));};

module.exports=async function handler(req,res){
  try{
    if(req.method==='GET'){
      if(!configured()) return json(res,503,{ok:false,error:'Monday is not configured'});
      const items=await readBoard();
      const applied=await mergeFromMonday(items);
      return json(res,200,{ok:true,direction:'monday->bohio',itemsRead:items.length,
        changed:applied,state:await getState(),changes:await listChanges(20)});
    }
    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const taskId=String(b.taskId||'').slice(0,40);
      if(!taskId) return json(res,400,{ok:false,error:'taskId is required'});
      const patch={status:b.status,pct:b.pct,plannedStart:b.plannedStart,
        plannedFinish:b.plannedFinish,owner:b.owner};
      const r=await applyChange(taskId,patch,'bohio',String(b.actor||'Bohio user').slice(0,80));
      if(!r.changed.length) return json(res,200,{ok:true,changed:[],note:'No field changed'});
      let pushed={ok:false,skipped:'Monday is not configured'};
      if(configured()){
        try{
          pushed=await syncToMonday({taskId,taskName:String(b.taskName||taskId).slice(0,160),
            detail:`Manual change in Bohio: `+r.changed.map(c=>`${c.field} ${c.from??'—'} → ${c.to}`).join(', '),
            reporter:String(b.actor||'Bohio user').slice(0,80),
            statusLabel:b.status||'',proposedFinish:b.plannedFinish||'',verified:true});
        }catch(e){ pushed={ok:false,error:e.message}; }
      }
      return json(res,200,{ok:true,direction:'bohio->monday',changed:r.changed,monday:pushed});
    }
    return json(res,405,{ok:false,error:'Method not allowed'});
  }catch(e){ return json(res,502,{ok:false,error:e.message}); }
};
