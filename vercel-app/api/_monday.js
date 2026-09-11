/* Shared Monday.com client.
 *
 * The original pack could only create an item and post an update. It had no
 * way to change a column and no way to upload a file, which is why a status
 * never moved and a site photo never appeared on the board. Both are added
 * here, alongside a single syncToMonday() that the WhatsApp webhook can call
 * server-side — previously only the browser ever talked to Monday, so a
 * message sent when nobody had Bohio open reached the board not at all.
 */
const API='https://api.monday.com/v2';
const FILE_API='https://api.monday.com/v2/file';
const VERSION='2026-04';

const token=()=>process.env.MONDAY_API_TOKEN||'';
const board=()=>process.env.MONDAY_BOARD_ID||'';
const configured=()=>Boolean(token()&&board());
const STATUS_COL=()=>process.env.MONDAY_STATUS_COLUMN||'status';
const DATE_COL=()=>process.env.MONDAY_DATE_COLUMN||'date';

function clean(v,max=600){return String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max);}

async function graph(query,variables={}){
  const r=await fetch(API,{method:'POST',
    headers:{Authorization:token(),'Content-Type':'application/json','API-Version':VERSION},
    body:JSON.stringify({query,variables})});
  const p=await r.json().catch(()=>({}));
  if(!r.ok||p.errors?.length) throw new Error(p.errors?.map(e=>e.message).join('; ')||`Monday API ${r.status}`);
  return p.data;
}

/* Items carry the activity id in square brackets, e.g. "[tele] Telecoms". */
async function findOrCreateItem(taskId,taskName){
  const data=await graph(
    'query ($board: [ID!]!) { boards(ids: $board) { items_page(limit: 200) { items { id name } } } }',
    {board:[board()]});
  const marker=`[${taskId}]`;
  const items=data.boards?.[0]?.items_page?.items||[];
  const found=items.find(i=>i.name.includes(marker));
  if(found) return found;
  const made=await graph(
    'mutation ($board: ID!, $name: String!) { create_item(board_id: $board, item_name: $name) { id name } }',
    {board:board(),name:`${marker} ${clean(taskName,160)}`});
  return made.create_item;
}

async function postUpdate(itemId,html){
  const r=await graph('mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }',
    {item:itemId,body:html});
  return r.create_update.id;
}

/* The mutation the pack was missing: move the status column. */
async function setStatus(itemId,label){
  if(!label) return null;
  const r=await graph(
    'mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) { change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id } }',
    {board:board(),item:itemId,col:STATUS_COL(),val:JSON.stringify({label:String(label)})});
  return r.change_column_value?.id||null;
}

async function setDate(itemId,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return null;
  const r=await graph(
    'mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) { change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id } }',
    {board:board(),item:itemId,col:DATE_COL(),val:JSON.stringify({date:String(date)})});
  return r.change_column_value?.id||null;
}

/* The other missing piece: put the actual photo on the board.
 * Monday takes files over multipart against /v2/file, not the JSON endpoint. */
async function attachFileToUpdate(updateId,buffer,fileName,contentType){
  if(!updateId||!buffer||!buffer.length) return null;
  const form=new FormData();
  form.append('query',`mutation ($file: File!) { add_file_to_update(update_id: ${Number(updateId)}, file: $file) { id url } }`);
  form.append('map',JSON.stringify({image:'variables.file'}));
  form.append('image',new Blob([buffer],{type:contentType||'application/octet-stream'}),fileName||'evidence');
  const r=await fetch(FILE_API,{method:'POST',headers:{Authorization:token(),'API-Version':VERSION},body:form});
  const p=await r.json().catch(()=>({}));
  if(!r.ok||p.errors?.length) throw new Error(p.errors?.map(e=>e.message).join('; ')||`Monday file upload ${r.status}`);
  return p.data?.add_file_to_update||null;
}

/* One call the webhook can make: find the item, post the update, attach the
 * photo, and move the status — but only when the deliverable is verified,
 * which keeps the original rule that a partial claim never reaches Monday. */
async function syncToMonday({taskId,taskName,detail,reporter,evidenceUrl,statusLabel,proposedFinish,file,verified}){
  if(!configured()) return {ok:false,skipped:'Monday is not configured'};
  const item=await findOrCreateItem(taskId,taskName);
  const label=verified?'Verified deliverable':'Site evidence';
  const html=`<b>Bohio · ${label}</b><br>${clean(detail,900)}<br><br>`+
    `Reported by: ${clean(reporter||'Planner / Project Manager',80)}`+
    (evidenceUrl?`<br>Evidence: ${clean(evidenceUrl,500)}`:'');
  const updateId=await postUpdate(item.id,html);
  let fileResult=null,statusResult=null,dateResult=null;
  if(file&&file.buffer){
    try{ fileResult=await attachFileToUpdate(updateId,file.buffer,file.fileName,file.contentType); }
    catch(e){ fileResult={error:e.message}; }
  }
  if(verified&&statusLabel){
    try{ statusResult=await setStatus(item.id,statusLabel); }
    catch(e){ statusResult={error:e.message}; }
  }
  if(verified&&proposedFinish){
    try{ dateResult=await setDate(item.id,proposedFinish); }
    catch(e){ dateResult={error:e.message}; }
  }
  return {ok:true,itemId:item.id,itemName:item.name,updateId,file:fileResult,status:statusResult,date:dateResult,
    boardUrl:`https://monday.com/boards/${board()}/pulses/${item.id}`};
}

module.exports={configured,graph,findOrCreateItem,postUpdate,setStatus,setDate,attachFileToUpdate,syncToMonday,clean};
