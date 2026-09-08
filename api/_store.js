const KEY='bohio:whatsapp:updates';
const MEDIA_PREFIX='bohio:whatsapp:media:';

async function command(parts){
  const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new Error('Shared update storage is not configured');
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(parts)});
  if(!response.ok)throw new Error(`Storage returned ${response.status}`);
  const payload=await response.json();
  if(payload.error)throw new Error(payload.error);
  return payload.result;
}

async function appendUpdate(update){
  if(process.env.LOCAL_DEMO==='1'){global.__bohioUpdates=global.__bohioUpdates||[];global.__bohioUpdates.unshift(update);global.__bohioUpdates=global.__bohioUpdates.slice(0,200);return;}
  await command(['LPUSH',KEY,JSON.stringify(update)]);
  await command(['LTRIM',KEY,'0','199']);
}

async function listUpdates(){
  if(process.env.LOCAL_DEMO==='1')return global.__bohioUpdates||[];
  const rows=await command(['LRANGE',KEY,'0','199']);
  return (rows||[]).map(row=>{try{return JSON.parse(row);}catch{return null;}}).filter(Boolean);
}

async function storeMedia(id,buffer,contentType,fileName){
  if(!id||!buffer)return null;
  const maxBytes=Number(process.env.WHATSAPP_MEDIA_MAX_BYTES)||4*1024*1024;
  if(buffer.length>maxBytes)throw new Error(`WhatsApp media exceeds the ${Math.round(maxBytes/1024/1024)} MB evidence limit`);
  const record={contentType:String(contentType||'application/octet-stream'),fileName:String(fileName||'whatsapp-evidence'),data:buffer.toString('base64'),storedAt:new Date().toISOString()};
  if(process.env.LOCAL_DEMO==='1'){global.__bohioMedia=global.__bohioMedia||new Map();global.__bohioMedia.set(id,record);return id;}
  await command(['SET',MEDIA_PREFIX+id,JSON.stringify(record),'EX',String(Number(process.env.WHATSAPP_MEDIA_TTL_SECONDS)||604800)]);
  return id;
}

async function getMedia(id){
  if(!id)return null;
  if(process.env.LOCAL_DEMO==='1')return global.__bohioMedia?.get(id)||null;
  const row=await command(['GET',MEDIA_PREFIX+id]);
  if(!row)return null;
  try{return JSON.parse(row);}catch{return null;}
}

module.exports={appendUpdate,listUpdates,storeMedia,getMedia};
