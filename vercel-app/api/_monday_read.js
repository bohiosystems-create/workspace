/* Reading the board back. The pack only ever wrote to Monday; nothing read
 * from it, so a manual edit on the board was invisible everywhere else. */
const {graph}=require('./_monday');

const board=()=>process.env.MONDAY_BOARD_ID||'';
const STATUS_COL=()=>process.env.MONDAY_STATUS_COLUMN||'status';
const DATE_COL=()=>process.env.MONDAY_DATE_COLUMN||'date';

/* Items are named "[taskId] Task name", which is how Bohio and the board
 * are tied together. */
function taskIdFrom(name){ const m=/\[([^\]]+)\]/.exec(String(name||'')); return m?m[1].trim():''; }

async function readBoard(){
  const data=await graph(
    `query ($board: [ID!]!) {
       boards(ids: $board) {
         items_page(limit: 200) {
           items { id name column_values { id text value } }
         }
       }
     }`,{board:[board()]});
  const items=data.boards?.[0]?.items_page?.items||[];
  return items.map(it=>{
    const col=id=>it.column_values.find(c=>c.id===id);
    const s=col(STATUS_COL()), d=col(DATE_COL());
    let plannedFinish='';
    if(d&&d.value){ try{ plannedFinish=JSON.parse(d.value)?.date||''; }catch{} }
    return {mondayItemId:it.id,name:it.name,taskId:taskIdFrom(it.name),
      status:s?.text||'',plannedFinish:plannedFinish||d?.text||''};
  }).filter(x=>x.taskId);
}
module.exports={readBoard,taskIdFrom};
