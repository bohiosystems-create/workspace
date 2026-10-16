// Rounds 11-12 at the desk, no AI connected (the rules are the fallback): five synthetic models of new kinds (fixtures/models/r11_*.xlsx,
// made by fixtures/gen/gen11.py). Guards: the currency the model states (a row of PMT results Excel formatted as "$" does not make a
// EUR or KWD model dollars; NZ$ is NZD); the model's own figures are read on its uploaded inputs, never on the last what-if the
// engine holds; "0.58m" on a line in EUR m is 0.58; "what PPA price gets the equity to 12%" is a goal seek, not PPA = 12; a goal-seek
// result is tagged as solved on the workbook; "fund bids 5.5%" is not a data-library query; a figure question reads the model.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}):r.fulfill({status:503,body:'{}'}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
let pass=0,fail=0;const t=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);await p.evaluate(()=>xcEngine(latestExport()))};
const ask=q=>p.evaluate(async q=>{CLARIFY=null;const r=await handle(q,'web','director');return{k:(route(q).it||{}).k,txt:(r.html||r.text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')}},q);
for(const [m,c] of [['r11_solar_eur','EUR'],['r11_ppp_kwd','KWD'],['r11_rv_nzd','NZD'],['r11_lab_usd','USD']]){await up(m);const ccy=await p.evaluate(()=>(latestExport().meta||{}).currency);t(ccy===c,`${m}: currency ${ccy} (the model says ${c})`)}
await up('r11_solar_eur');
let r=await ask('degradation to 0.5%');r=await ask("what's min DSCR?");t(r.k==='emresults'&&/Minimum DSCR 1\.37x/.test(r.txt),'after a what-if, “what’s min DSCR?” reads the model’s own 1.37x: '+(r.txt.match(/Minimum DSCR [\d.]+x/)||[''])[0]);
t(!/\d{5,}\.\d\dx/.test(r.txt),'money in the results is not shown as a multiple ("Total capex …x")');
r=await ask('capex 0.58m per MWp');t(/0\.62 → 0\.58\b/.test(r.txt),'“capex 0.58m” on a line in EUR m: 0.62 → 0.58: '+(r.txt.match(/Capex[^|]{0,60}/)||[''])[0]);
r=await ask('what PPA price gets the equity to 12%?');t(r.k==='xsolve'&&/52\.74/.test(r.txt)&&!/52 → 12\b/.test(r.txt),'“what PPA price gets the equity to 12%” is a goal seek: '+r.txt.slice(0,120));
t(await p.evaluate(()=>WORK.slice(-3).some(w=>w.kind==='wb')),'the solved figure is tagged as solved on the workbook, not AI arithmetic');
await up('r11_ffund_sek');
r=await ask('fund bids 5.5%');t(r.k!=='dsquery'&&!/Coupon on funded costs/.test(r.txt),'“fund bids 5.5%” is not a data-library query, nor the coupon: '+r.txt.slice(0,120));
r=await ask('what yield can the fund pay for a 15% profit on cost?');t(r.k==='xsolve','a target question with “fund” in it is a goal seek ('+r.k+')');
await up('r11_ppp_kwd');r=await ask("what's the min DSCR?");t(r.k==='emresults'&&/Minimum DSCR 1\.59x/.test(r.txt),'figure question without AI reads the model: '+(r.txt.match(/Minimum DSCR [\d.]+x/)||[''])[0]);
r=await ask('lifecycle at 1.5% of capex');t(/1\.2% → 1\.5%/.test(r.txt),'a model with its own “capex” words keeps them: lifecycle 1.2% → 1.5%');
// round 12: a tariff table's “First hour” and “Each extra hour” are two fields, not a series; a date result reads as a date; “rank by IRR” counts project IRRs
await up('r12_park_aed');t((await p.evaluate(async()=>(await xcSeries(latestExport(),{cell:'Tariffs!B2',label:'First hour'})).length))===1,'a tariff row is not a time series: only Tariffs!B2 changes');
r=await ask('weekend occupancy to 85%');t(/78% → 85%/.test(r.txt),'the park model still answers a plain what-if');
await up('r12_tower_sar');r=await ask("what's the NPV?");t(/Completion date 2029-07/.test(r.txt)&&!/Completion date 47,?300/.test(r.txt),'a date in the results is shown as a date: '+(r.txt.match(/Completion date \S+/)||[''])[0]);
await up('r12_towns_cad');r=await ask('rank my deals by IRR');t(/project IRR/.test(r.txt)&&/MAPLE RIDGE/.test(r.txt),'ranking by IRR counts the models that only have a project IRR, labelled');
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();
