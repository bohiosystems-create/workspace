/* Monday calls this when something changes on the board, which is what makes
 * a manual edit there show up in Bohio and over WhatsApp.
 *
 * Set it in Monday: Integrations > Webhooks > "When a column changes" >
 * https://YOUR-PROJECT.vercel.app/api/monday-webhook
 * Monday first POSTs {"challenge": "..."} and expects it echoed back.
 *
 * A change recorded here is stamped origin "monday" and is never pushed back,
 * so the two sides cannot echo each other.
 */
const {applyChange}=require('./_state');
const {taskIdFrom}=require('./_monday_read');

const json=(res,code,body)=>{res.status(code);res.setHeader('Content-Type','application/json');return res.send(JSON.stringify(body));};

module.exports=async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  let body={};
  try{ body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}); }catch{}
  if(body.challenge) return json(res,200,{challenge:body.challenge});   // handshake

  const secret=process.env.MONDAY_WEBHOOK_SECRET||'';
  if(secret && req.headers['authorization']!==secret) return json(res,403,{error:'Invalid webhook signature'});

  try{
    const e=body.event||{};
    const taskId=taskIdFrom(e.pulseName)||'';
    if(!taskId) return json(res,200,{ok:true,ignored:'Item name carries no [taskId]'});
    const patch={mondayItemId:String(e.pulseId||'')};
    const label=e.value?.label?.text||e.value?.text||'';
    if(e.columnId===(process.env.MONDAY_STATUS_COLUMN||'status')&&label) patch.status=label;
    if(e.columnId===(process.env.MONDAY_DATE_COLUMN||'date')&&e.value?.date) patch.plannedFinish=e.value.date;
    const r=await applyChange(taskId,patch,'monday',e.userId?`Monday user ${e.userId}`:'Monday board');
    return json(res,200,{ok:true,taskId,changed:r.changed});
  }catch(err){ return json(res,200,{ok:false,error:err.message}); }
};
