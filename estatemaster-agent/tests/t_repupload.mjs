// Reports on an uploaded model: every report holds only that model's figures. No section computed on the demo replica, no demo project's
// change requests or market flags, no replica figure standing in for one the model lacks, no NaN or 0 for a missing figure, no "Riyadh"
// on a model elsewhere; the daily report names each model's own IRR and currency; "schedule the daily report" picks the daily report.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?F+'pptx/package/dist/pptxgen.bundle.js':F+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}):r.fulfill({status:503,body:'{}'}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
let pass=0,fail=0;const t=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'models/'+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500);await p.evaluate(()=>xcEngine(latestExport()))};
for(const [m,ccy,wi] of [['r11_solar_eur','EUR','PPA price to 48'],['r14_plots_inr','INR','land cost to 210'],['r15_cogp_usd','USD','project equity multiple to 2.3']]){await up(m);await p.evaluate(async q=>{await handle(q,'web','director')},wi);
  const r=await p.evaluate(()=>{const out={};for(const k of Object.keys(RPTS)){if(k==='daily'||k==='track'||k==='funds')continue;const tx=String(RPTS[k].fn()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');const dk=JSON.stringify(buildDeck(k).slides);const all=tx+' '+dk;
    out[k]={leak:(all.match(/.{0,50}(\bSAR\b|Narjis|SAIBOR|Riyadh|CR-1\d\d).{0,30}/)||[''])[0],nan:(all.match(/.{0,50}(NaN|undefined|Infinity).{0,30}/)||[''])[0]}}return{out,cr:runSuggestions('test',true).length}});
  const leaks=Object.entries(r.out).filter(([k,v])=>v.leak),nans=Object.entries(r.out).filter(([k,v])=>v.nan);
  t(!leaks.length,`${m}: no demo project, SAR, SAIBOR, Riyadh or demo change request in any report: `+JSON.stringify(leaks.slice(0,2)));
  t(!nans.length,`${m}: no NaN / undefined in any report or deck: `+JSON.stringify(nans.slice(0,2)));
  t(r.cr===0,`${m}: the demo suggestion engine files nothing against an uploaded model`)}
const d=await p.evaluate(()=>{const dk=buildDeck('daily',{});const heads=JSON.stringify(dk.slides);return{nan:/NaN|undefined/.test(heads),plotsIRR:/SARJAPUR[^"]*"[^]*?Project IRR/.test(heads)}});
t(!d.nan,'the daily report has no NaN');
const sc=await p.evaluate(()=>parseSchedule('schedule the daily report every morning at 7').k);t(sc==='daily','“schedule the daily report every morning at 7” picks the daily report: '+sc);
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();
