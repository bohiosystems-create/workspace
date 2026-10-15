// Accuracy against an independent referee: 61 what-ifs in three sets on four different models (US hotel in $, UK residential in £, US office in
// $000s, Saudi mixed-use in SAR with whole-number percentages, two phases and a start date), answered by KINAN and compared with LibreOffice recalculating the same workbooks (fixtures/bench/*_truth.json, made with
// fixtures/bench/referee_libreoffice.py). Every answer must match within 1 bp on IRRs and profit on cost and 1 bp of value on money;
// a sentence that names no single line of the model must be asked about, never answered wrongly.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);let errs=[];
const conv=(name,k,v)=>v==null?null:/^office/.test(name)?(k==='net_profit'?v*1000:v):(['levered_irr','unlevered_irr','profit_on_cost'].includes(k)?v*100:v);
let exact=0,n=0;const SETS=process.env.ACC_SETS?process.env.ACC_SETS.split(','):['resi','office','hotel','waha','resi2','office2','hotel2','waha3','resi3','office3','hotel3'];
for(const name of SETS){const job=JSON.parse(fs.readFileSync(sp+'bench/'+name+'.json','utf8').replace(/MODELS\//g,sp+'models/'));const T=JSON.parse(fs.readFileSync(sp+'bench/'+name+'_truth.json'));
  const cx=await b.newContext({viewport:{width:1400,height:900}});const p=await cx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
  await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
  await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',job.file);await p.waitForTimeout(1500);await p.click('#npCreate');await p.waitForTimeout(3000);
  const eng=await p.evaluate(async()=>{const e=await xcEngine(latestExport());return{ok:e.ok,tot:e.tot,match:e.match}});t(eng.ok&&eng.match===eng.tot,`${name}: engine reproduces ${eng.match} of ${eng.tot} stored results`);
  for(let i=0;i<job.scenarios.length;i++){const sc=job.scenarios[i];n++;
    const r=await p.evaluate(async([text,keys])=>{const t=await xcTest([{text}],async()=>{});return !t?{none:true}:t.ask?{ask:t.ask.question}:{desc:t.desc,v:Object.fromEntries(keys.map(k=>{const m=t.metrics.find(z=>z.k===k);return[k,m?m.value:null]}))}},[sc.name,job.keys]);
    if(sc.ambiguous){t(!!r.ask,`${name} · “${sc.name}”: ambiguous → asked, not guessed`);if(r.ask)exact++;continue}
    let worst=0,cmp=0;job.keys.forEach((k,j)=>{const tv=conv(name,k,T[i][j]),kv=r.v&&r.v[k];if(tv==null||kv==null)return;cmp++;const e=['levered_irr','unlevered_irr','profit_on_cost'].includes(k)?Math.abs(kv-tv)*100:Math.abs(kv-tv)/Math.max(1,Math.abs(tv))*1e4;worst=Math.max(worst,e)});
    const good=r.v&&cmp===job.keys.filter((k,j)=>T[i][j]!=null).length&&worst<=1;if(good)exact++;
    t(good,`${name} · “${sc.name}”: ${r.v?`within ${worst.toFixed(4)} bps of the referee`:JSON.stringify(r).slice(0,140)}${r.desc?' · '+r.desc.join('; '):''}`)}
  await cx.close()}
t(exact===n,`accuracy: ${exact} of ${n} answered exactly or correctly asked`);t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
