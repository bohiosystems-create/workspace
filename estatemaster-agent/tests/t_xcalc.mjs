// Exact recalculation: the uploaded workbook's own formulas are recalculated in the browser, so a what-if returns what Excel
// (and Claude for Excel) return for the same change, every time. Hotel model, ADR −10%: Unlevered 13.18%, Levered 18.84%,
// LP 17.47%, Sponsor 27.53%; MOIC 2.38x / 3.22x / 2.93x / 5.77x. Plus a two-way table by recalculation and an exact goal seek.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
// the engine: loads the workbook and reproduces Excel's own stored results before it is trusted
const t0=Date.now();const eng=await ev(()=>xcEngine(latestExport()));
t(eng&&eng.ok&&eng.match===eng.tot&&eng.tot>60000,`engine reproduces Excel’s own results: ${eng&&eng.match} of ${eng&&eng.tot} (${eng&&eng.formulas} formulas, ${Math.round((Date.now()-t0)/1000)} s)`);
t(await ev(async()=>!!(await wbLoad('raw:'+latestExport().id))),'the original file is kept in this browser (IndexedDB)');
// the chat: what if ADR −10% → the same figures as Claude for Excel
const n0=await ev(()=>document.querySelectorAll('#msgs .msg').length);await ev(()=>webAsk('what if ADR drops 10%?'));
await p.waitForFunction(n=>[...document.querySelectorAll('#msgs .msg')].slice(n).some(e=>/Exact recalculation|recalculat/i.test(e.innerText)&&/18\.\d\d%/.test(e.innerText)),n0,{timeout:120000}).catch(()=>{});
const ans=await ev(n=>[...document.querySelectorAll('#msgs .msg')].slice(n).map(e=>e.innerText).join(' | '),n0);
for(const [l,v] of [['Unlevered IRR','13.18%'],['Levered IRR','18.84%']])t(new RegExp(l+'[^|]*?'+v.replace('.','\\.')).test(ans),`${l} ${v} (Claude for Excel: ${v.slice(0,4)}%)`);
for(const v of ['17.47%','27.53%','2.38x','3.22x','2.93x','5.77x'])t(ans.includes(v),`limited partner / sponsor / MOIC: ${v}`);
t(/OpCashFlow!H12/.test(ans)&&/125\b/.test(ans)&&/112\.5/.test(ans),'says which cell changed and how: OpCashFlow!H12 125 → 112.5');
t(!/SAR/.test(ans),'no SAR on a dollar model');
// the same question again: the same figures (no AI involved)
const n1=await ev(()=>document.querySelectorAll('#msgs .msg').length);await ev(()=>webAsk('what if ADR drops 10%?'));
await p.waitForFunction(n=>[...document.querySelectorAll('#msgs .msg')].slice(n).some(e=>/18\.\d\d%/.test(e.innerText)),n1,{timeout:120000}).catch(()=>{});
const ans2=await ev(n=>[...document.querySelectorAll('#msgs .msg')].slice(n).map(e=>e.innerText).join(' | '),n1);t(/18\.84%/.test(ans2)&&/13\.18%/.test(ans2),'asked twice: identical result');
// occupancy is typed once per year: a −5 pts change moves every year's cell
const r2=await ev(async()=>{const r=await xcTest([{text:'occupancy -5 pts'}],async()=>{});return r&&{d:r.desc,m:r.metrics.map(m=>[m.k,+m.value.toFixed(2)])}});
t(r2&&/\((\d+) cells\)/.test(r2.d[0])&&+r2.d[0].match(/\((\d+) cells\)/)[1]>=6&&/68%.*63%/.test(r2.d[0]),'occupancy −5 pts changes every yearly cell 68% → 63%: '+(r2&&r2.d[0]));
t(r2&&r2.m.some(([k,v])=>k==='levered_irr'&&Math.abs(v-21.92)<0.01),'occupancy −5 pts: levered IRR 21.92% '+JSON.stringify(r2&&r2.m));
// a percentage shifted by a bare %: the agent asks instead of assuming
const amb=await ev(async()=>{const r=await xcTest([{text:'occupancy -5%'}],async()=>{});return r&&r.ask?r.ask.question:''});t(/points.*or.*of it/.test(amb),'occupancy −5%: asks points or relative: '+amb);
// a two-way table by recalculation
const tc=await ev(async()=>{const r=await xcTest([{text:'ADR down 10%'}],async()=>{});const m=r.metrics.find(z=>z.k==='total_cost');return m&&[m.base,m.value]});t(tc&&tc[0]>0&&tc[1]>0,'total cost keeps the sign the reader shows (positive) '+JSON.stringify(tc));
const wq=await ev(async()=>{const r=await xcTest([{text:'ADR drops 10%'}],async()=>{});return r&&r.desc&&r.desc[0]});t(/125 → 112\.5/.test(wq||''),'“drops” is a fall: '+wq);
const both=await ev(async()=>{const r=await xcTest([{text:'ADR up or down 10%'}],async()=>{});return r&&r.ask&&r.ask.question});t(/up or down/.test(both||''),'up and down in one sentence: asks '+both);
const g=await ev(async()=>{const r=await xcSensGrid({assumption:'ADR',kind:'pct',shifts:[-10,0]},{assumption:'Occupancy',kind:'pts',shifts:[0,-5]},'levered_irr',async()=>{});return r&&{g:r.grid.map(x=>x.map(v=>+v.toFixed(2))),xc:r.xc}});
t(g&&g.xc&&Math.abs(g.g[0][0]-18.84)<0.01&&Math.abs(g.g[0][1]-24.05)<0.01&&Math.abs(g.g[1][1]-21.92)<0.01,'sensitivity grid by recalculation '+JSON.stringify(g));
// goal seek: the ADR for a 20% levered IRR, then checked by recalculating at that ADR
const gs=await ev(async()=>{const r=await xcSolve('ADR','levered_irr',20,async()=>{});return r});
t(gs&&gs.ok&&Math.abs(gs.got-20)<0.01,'goal seek: ADR '+(gs&&gs.to)+' gives levered IRR '+(gs&&gs.got&&gs.got.toFixed(3))+'% in '+(gs&&gs.n)+' recalculations '+(gs&&gs.why||''));
const pm=await ev(()=>[parseMods('sale price 10% lower').price,parseMods('sale price drops 10%').price,parseMods('construction cost 15% higher').cost]);t(pm[0]===-10&&pm[1]===-10&&pm[2]===15,'direction after the figure: “10% lower” is −10 '+JSON.stringify(pm));
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
