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
           items {
             id name
             column_values { id text value }
             assets { id name url public_url file_extension created_at }
             updates (limit: 20) { id body created_at assets { id name url public_url } }
           }
         }
       }
     }`,{board:[board()]});
  const items=data.boards?.[0]?.items_page?.items||[];
  return items.map(it=>{
    const col=id=>it.column_values.find(c=>c.id===id);
    const s=col(STATUS_COL()), d=col(DATE_COL());
    let plannedFinish='';
    if(d&&d.value){ try{ plannedFinish=JSON.parse(d.value)?.date||''; }catch{} }
    /* Photos attached on the Monday item — on the item itself or on any of
     * its updates. Without this a photo added on the board was invisible in
     * Bohio, which only ever saw evidence that came in over WhatsApp. */
    const own=(it.assets||[]).map(a=>({id:a.id,name:a.name,url:a.public_url||a.url,
      ext:a.file_extension||'',at:a.created_at||'',origin:'monday',via:'item'}));
    const fromUpdates=(it.updates||[]).flatMap(u=>(u.assets||[]).map(a=>({id:a.id,name:a.name,
      url:a.public_url||a.url,ext:'',at:u.created_at||'',origin:'monday',via:'update'})));
    const seen=new Set(),photos=[];
    own.concat(fromUpdates).forEach(a=>{if(a.id&&!seen.has(a.id)){seen.add(a.id);photos.push(a);}});
    return {mondayItemId:it.id,name:it.name,taskId:taskIdFrom(it.name),
      status:s?.text||'',plannedFinish:plannedFinish||d?.text||'',photos,
      updateCount:(it.updates||[]).length};
  }).filter(x=>x.taskId);
}
module.exports={readBoard,taskIdFrom};
