// A model synced from the exports folder shows its ORIGINAL workbook (fetched from the server), not the agent's reproduction.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto('http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const b64=fs.readFileSync(sp+'v2_export.xlsx').toString('base64');
const r=await p.evaluate(async b64=>{DAILYSRV={stress:null};let asked=null;window.dailyApi=async a=>{if(a&&a.action==='workbook'){asked=a.file;return{name:a.file,data:b64}}if(a&&a.action==='models')return{models:[{key:'df cs046 build to hold',file:'DF_CS046 - Build to Hold.xlsx',name:'Build to Hold Industrial',out:{levered_irr:12.32,profit_on_cost:8},inputs:[],meta:{title:'Build to Hold Industrial'},at:'2026-10-13T10:00:00Z'}]};return{}};
  await syncModelsFromServer();const bth=Object.values(PROJECTS).find(p=>/build to hold/i.test(p.name));switchProject(bth.id);showTab('model');await renderWbPreview();
  for(let i=0;i<30&&!/sheets/.test($('#exWb').textContent.replace(/agent/,''))||i<3;i++)await new Promise(r=>setTimeout(r,200));await new Promise(r=>setTimeout(r,500));
  const t=$('#exWb').textContent;return{asked,t,repro:/reproduction/.test(t),real:/Equity IRR \(geared\)|Build to Hold Equity/.test(t)}},b64);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.asked==='DF_CS046 - Build to Hold.xlsx','the app asks the server for the original workbook');t(r.real&&!r.repro,'the preview shows the original cells, not the reproduction: '+r.t.slice(0,140));
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_wbsrv:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
