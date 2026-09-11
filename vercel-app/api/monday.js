/* Monday endpoint used by the Bohio UI.
 *
 * It previously created an item and posted an update and nothing else, so a
 * change made in Bohio never moved a status or a date on the board and was
 * never recorded anywhere both sides could read. It now goes through the same
 * client and the same shared record as the WhatsApp webhook, so a manual
 * change in Bohio is visible on Monday and over WhatsApp.
 */
const {configured,syncToMonday,clean}=require('./_monday');
const {applyChange}=require('./_state');

const ALLOWED=new Set(['deliverable_verified','schedule_change','comment']);
const reply=(res,code,body)=>{res.status(code);res.setHeader('Content-Type','application/json; charset=utf-8');return res.send(JSON.stringify(body));};

module.exports=async function handler(req,res){
  if(req.method==='GET'){
    const ok=configured();
    return reply(res,200,{configured:ok,boardId:ok?process.env.MONDAY_BOARD_ID:'',
      boardUrl:ok?`https://monday.com/boards/${process.env.MONDAY_BOARD_ID}`:'',
      mode:'Comments post to the board; status moves only for a verified deliverable'});
  }
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  if(!configured())return reply(res,503,{error:'Monday is not configured. Add MONDAY_API_TOKEN and MONDAY_BOARD_ID in Vercel.'});

  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const action=clean(body.action,40);
  if(!ALLOWED.has(action))return reply(res,400,{error:'Unknown action.'});
  const taskId=clean(body.taskId,40),taskName=clean(body.taskName,180),detail=clean(body.detail,900);
  if(!taskId||!taskName||!detail)return reply(res,400,{error:'taskId, taskName and detail are required.'});

  const verified=action==='deliverable_verified';
  const dateChange=action==='schedule_change';
  try{
    const result=await syncToMonday({
      taskId,taskName,detail,
      reporter:clean(body.reporterRole||'Planner / Project Manager',80),
      evidenceUrl:clean(body.evidenceUrl,500),
      statusLabel:verified?clean(body.statusLabel||'Done',40):'',
      proposedFinish:clean(body.proposedFinish||'',10),
      verified:verified||dateChange
    });
    /* record it where Bohio, Monday and WhatsApp all read from */
    try{
      await applyChange(taskId,{
        status:verified?clean(body.statusLabel||'Done',40):undefined,
        plannedFinish:dateChange?clean(body.proposedFinish||'',10)||undefined:undefined,
        mondayItemId:result.itemId||undefined
      },'bohio',clean(body.reporterRole||'Bohio user',80));
    }catch{}
    return reply(res,200,{ok:true,...result});
  }catch(error){ return reply(res,502,{error:clean(error.message,500)}); }
};
