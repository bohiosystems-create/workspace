const SP=(__dirname+'/fixtures/'),API=__dirname+'/../api/';
const Module=require('module');const orig=Module._resolveFilename;Module._resolveFilename=function(r,...a){if(r==='xlsx')return SP+'package/xlsx.js';return orig.call(this,r,...a)};
const XLSX=require(SP+'package/xlsx.js');Object.assign(process.env,{MS_TENANT_ID:'t',MS_CLIENT_ID:'c',MS_CLIENT_SECRET:'s',EXPORTS_FOLDER:'/sites/h:/sites/Bohio:/drive/root:/Exports'});
const mk=(irr,title)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[title],['Equity IRR',null,'%',irr],['Net Development Profit',null,'SAR',50e6],['Total Development Cost',null,'SAR',500e6]]),'Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Land Purchase Price',90000000,'SAR']]),'Input');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'})};
const files={f1:mk(0.1232,'Build to Hold Industrial'),f2:mk(0.11,'AWJ Rabwa'),f3:mk(0.10,'AWJ Rabwa')};
global.fetch=async(url,o={})=>{url=String(url);const json=b=>({ok:true,status:200,json:async()=>b,text:async()=>JSON.stringify(b)});
  if(url.includes('/oauth2/v2.0/token'))return json({access_token:'tok'});
  if(url.includes('/Exports:/children'))return json({value:[{id:'f1',name:'DF_CS046 - Build to Hold.xlsx',lastModifiedDateTime:'2026-10-12T10:00:00Z',file:{}},{id:'f2',name:'AWJ Master v2.xlsx',lastModifiedDateTime:'2026-10-12T12:00:00Z',file:{}},{id:'f3',name:'AWJ Master.xlsx',lastModifiedDateTime:'2026-10-10T12:00:00Z',file:{}},{id:'f4',name:'AWJ Master - Downside.xlsx',lastModifiedDateTime:'2026-10-12T13:00:00Z',file:{}}]});
  const m=url.match(/items\/(f\d)\/content/);if(m){const b=files[m[1]]||files.f1;return{ok:true,status:200,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}}
  if(/\/sites\/h:\/sites\/Bohio\?/.test(url))return json({id:'h,s1,w1'});return json({})};
(async()=>{const cron=require(API+'cron.js');const G=require(API+'_lib/graph.js');const tok='tok';const r=await cron.listModels(tok);
  const names=r.models.map(m=>m.file);const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m);
  ok(r.models.length===2,'one model per file name, option files left out: '+names.join(' | '));
  ok(names.includes('AWJ Master v2.xlsx')&&!names.includes('AWJ Master.xlsx'),'the latest version of each model');
  const b=r.models.find(m=>/Build/.test(m.file));ok(b&&Math.abs(b.out.levered_irr-12.32)<1e-9&&b.inputs.length===1,'each read in full: outputs and inputs');})().catch(e=>console.log('ERR',e.message));
