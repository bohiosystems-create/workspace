const {getMedia}=require('./_store');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).send('Method not allowed');
  try{
    const raw=req.query?.id||new URL(req.url,'http://localhost').searchParams.get('id'),id=String(raw||'');
    if(!/^[a-f0-9-]{20,64}$/i.test(id))return res.status(400).send('Invalid evidence reference');
    const record=await getMedia(id);
    if(!record)return res.status(404).send('Evidence not found');
    const baseType=String(record.contentType||'').split(';')[0].trim(),allowed=/^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|webm|wav|x-m4a))$/i.test(baseType)?baseType:'application/octet-stream';
    res.setHeader('Content-Type',allowed);
    res.setHeader('Content-Disposition',`inline; filename="${String(record.fileName||'whatsapp-evidence').replace(/["\r\n]/g,'')}"`);
    res.setHeader('Cache-Control','private, max-age=3600');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.status(200).send(Buffer.from(record.data,'base64'));
  }catch(error){return res.status(503).send(error.message);}
};
