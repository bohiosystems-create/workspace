// Rounds 11-14 at the desk, no AI connected (the rules are the fallback): five synthetic models of new kinds (fixtures/models/r11_*.xlsx,
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
// round 13: a circular model (interest capitalised, Excel's iteration on) recalculates like Excel; one cell, one key in the engine; AI "to B" on a switch is text
await up('r13_storage_circular_usd');{const e=await p.evaluate(async()=>{const e=await xcEngine(latestExport());return{ok:e.ok,pct:e.pct,iter:e.iter}});t(e.ok&&e.pct===100&&e.iter>0,'a circular model reproduces 100% of Excel with iteration: '+JSON.stringify(e))}
r=await ask('hard costs 10% over');t(/9,800,000 → 10,780,000/.test(r.txt)&&/12\.92%|12\.9\d%/.test(r.txt),'a what-if on the circular model is computed: '+(r.txt.match(/Profit on cost[^A-Z]{0,40}/)||[''])[0]);
await up('desk_office_refurb_gbp');{const o=await p.evaluate(async()=>{await xcTest([{text:'Arden Legal renewal probability to 0%'}],async()=>{});const r=await xcTest([{text:'renewal probability 50% across the board'}],async()=>{});return r&&r.desc&&r.desc[0]});t(/60% → 50%/.test(o||''),'after another what-if, the change starts from the model’s own 60%: '+o)}
await up('desk_tower_options_sar');t(await p.evaluate(()=>{const z=xcAiPlan(latestExport(),{label:'Selected option (A or B)',kind:'to',value:'B',sure:true},'AI');return !!(z&&z.p.kind==='text'&&z.p.s==='B')}),'an AI reading “to B” on a switch is a text change');
t(await p.evaluate(()=>{const z=xcAiPlan(latestExport(),{label:'Construction period',kind:'to',value:4,sure:true},'AI');return !!(z&&/Construction period/.test(z.p.inp.label))}),'an AI label without a cell on a model with Option A / B lines still resolves');
// round 14: a named month is that month; the AI's 12 cells are all changed even where the reader listed 8; ₹ crore read and shown in full rupees
await up('r14_season_eur');{const o=await p.evaluate(async()=>{const x=latestExport();const one=(await xcSeries(x,{cell:'Seasonality!I4',label:'Occupancy · Aug'})).length;const cells='BCDEFGHIJKLM'.split('').map(c=>'Seasonality!'+c+'4');const st=[];const r=await xcTest([{text:'occupancy +2 pts across the year'}],async s=>st.push(String(s)));return{one,desc:r&&r.desc&&r.desc[0]}});t(o.one===1,'August alone is one cell: '+JSON.stringify(o))}
t(await p.evaluate(()=>{const x=latestExport();const cells='BCDEFGHIJKLM'.split('').map(c=>'Seasonality!'+c+'4');const xa={...x,inputs:[...x.inputs,...cells.filter(c=>!x.inputs.some(i=>i.cell===c)).map(c=>({label:'Occupancy · '+c,cell:c,value:0.5,pct:true}))]};const z=xcAiPlan(xa,{label:'Occupancy',cell:cells[0],cells,kind:'pts',value:2,sure:true},'AI');return !!(z&&z.p.cells&&z.p.cells.length===12)}),'the AI’s 12 named cells are kept as one change');
await up('r14_plots_inr');{const c=await p.evaluate(()=>(latestExport().meta||{}).currency);t(c==='INR','₹ crore model reads as INR: '+c)}
r=await ask('land cost to 210');t(/190 → 210/.test(r.txt)&&!/INR 0\.00M/.test(r.txt),'a what-if on the crore model shows full amounts, not 0.00M: '+(r.txt.match(/Net profit[^A-Z]{0,40}/)||[''])[0]);
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();
