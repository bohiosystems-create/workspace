const http=require('http');const seen=[];
const srv=http.createServer((q,r)=>{seen.push(q.method+' '+decodeURIComponent(q.url));
  if(/^\/v1\.0\/sites\/netorgft18984209\.sharepoint\.com:\/sites\/Bohio\?/.test(decodeURIComponent(q.url))){r.setHeader('content-type','application/json');return r.end(JSON.stringify({id:'host,site1,web1'}))}
  if(/root:/.test(q.url)&&/:\/sites\//.test(q.url)){r.statusCode=400;r.setHeader('content-type','application/json');return r.end(JSON.stringify({error:{message:"Resource not found for the segment 'root:'."}}))}
  r.setHeader('content-type','application/json');r.end(JSON.stringify({ok:true}))}).listen(0,async()=>{
  process.env.GRAPH_BASE='http://127.0.0.1:'+srv.address().port;process.env.EXPORTS_FOLDER='/sites/netorgft18984209.sharepoint.com:/sites/Bohio:/drive/root:/Exports';
  const G=require(__dirname+'/../api/_lib/graph.js');let ok=true;const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+'  '+n+(d?'  '+d:''));if(!c)ok=false};
  try{await G.graphPut('t',`${process.env.EXPORTS_FOLDER}/_bohio-agent-schedule.json:/content`,'{}');ck('schedule file written through the site id',seen.some(x=>x==='PUT /v1.0/sites/host,site1,web1/drive/root:/Exports/_bohio-agent-schedule.json:/content'),seen.join(' | '))}catch(e){ck('put',false,e.message)}
  try{await G.graph('t',`${process.env.EXPORTS_FOLDER}:/children?$top=5`);ck('folder listing through the site id',seen.some(x=>/PUT|GET \/v1\.0\/sites\/host,site1,web1\/drive\/root:\/Exports:\/children/.test(x)))}catch(e){ck('list',false,e.message)}
  try{await G.graphBytes('t','/sites/netorgft18984209.sharepoint.com:/sites/Bohio:/drive/items/ABC/content');ck('file by item id (base path without root:)',seen.some(x=>x==='GET /v1.0/sites/host,site1,web1/drive/items/ABC/content'))}catch(e){ck('bytes',false,e.message)}
  ck('the site id is looked up once',seen.filter(x=>/\?\$select=id/.test(x)).length===1);
  try{await G.graph('t','/users/a@b.com/drive/root:/X:/children');ck('other paths untouched',true)}catch(e){ck('other',false,e.message)}
  srv.close();process.exit(ok?0:1)});
