// Rounds 11-20 at the desk, no AI connected (the rules are the fallback): five synthetic models of new kinds (fixtures/models/r11_*.xlsx,
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
// round 16: R$ is BRL; a date change reads as dates; a timing change that pushes revenue past the timeline is flagged; portfolio DSCR / equity from each model's results area
await up('r16_mall_brl');t(await p.evaluate(()=>(latestExport().meta||{}).currency)==='BRL','R$ reads as BRL');
await up('r16_hall_usd');r=await ask('first month to 46599');t(/2027-01-31 → 2027-07-31/.test(r.txt),'a date change shows dates: '+(r.txt.match(/First month[^A-Z]{0,40}/)||[''])[0]);
await up('r16_wafi_sar');r=await ask('construction to 11 quarters');t(/after the model’s last period/.test(r.txt),'a timing change that drops revenue off the timeline is flagged');
await up('r11_solar_eur');await p.waitForTimeout(800);await up('r11_ppp_kwd');await p.waitForTimeout(800);
r=await ask('which project has the lowest DSCR?');t(/Lowest DSCR: /.test(r.txt)&&/CAMPO SOLAR/.test(r.txt)&&/JAHRA/.test(r.txt),'portfolio “lowest DSCR” from each model’s own results: '+r.txt.slice(0,200));
r=await ask('total equity across the portfolio');t(/Equity invested/.test(r.txt)&&/not counted/.test(r.txt),'portfolio equity: the models that report it, the rest named: '+r.txt.slice(0,200));
// round 17: a lender model's own names (Lender IRR, Lender MOIC), not "Levered IRR / Equity multiple"; a percentage cell in the results reads as a percentage
await up('r17_lender_usd');r=await ask("what's our IRR?");t(/Lender IRR 12\.70%/.test(r.txt)&&!/Levered IRR/.test(r.txt)&&!/\(1\.54x\)/.test(r.txt),'a lender model’s figures under its own names: '+r.txt.slice(0,160));
await up('r17_pbsa_hkd');r=await ask("what's the going-in yield?");t(/Income secured by nominations 59\.10%/.test(r.txt),'a percentage cell among the results reads as a percentage');
// round 18: a monthly circular JV (interest on last month's balance, a fee on its own total) recalculates like Excel; INDIRECT picking a
// named case; results on a Debt sheet are read and goal-sought (gearing, LLCR); “EUR/PLN exchange rate” is an input, not a unit; a switch
// whose label lists the cases is not a case line; a figure labelled in PLN on a EUR model is in PLN; a change across three hotel sheets
const stubAI=reads=>p.evaluate(rd=>{window.__cp0=window.__cp0||calcPair;window.__ar0=window.__ar0||xcAiRead;calcPair=()=>[{p:'anthropic',model:'stand-in'},{p:'openai',model:'stand-in'}];xcAiRead=async()=>({by:'AI',changes:rd})},reads);
const unstub=()=>p.evaluate(()=>{if(window.__cp0){calcPair=window.__cp0;xcAiRead=window.__ar0}});
await up('r18_jv_usd');{const e=await p.evaluate(async()=>{const e=await xcEngine(latestExport());return{ok:e.ok,pct:e.pct,iter:e.iter}});t(e.ok&&e.pct===100&&e.iter>1000,'a monthly circular JV reproduces 100% of the workbook: '+JSON.stringify(e))}
r=await ask('hard costs 8% over');t(/72,000,000 → 77,760,000/.test(r.txt)&&/USD 107\.36M (→ )?USD 114\.54M/.test(r.txt),'a what-if on the circular JV is computed: '+(r.txt.match(/Total development cost[^A-Z]{0,40}/)||[''])[0]);
r=await ask("what's the GP promote worth?");t(/GP promote \(\$\) USD 8\.17M/.test(r.txt)&&(r.txt.match(/LP equity multiple 1\.81x/g)||[]).length===1,'the GP promote is read from the results, the LP multiple listed once: '+r.txt.slice(0,240));
await up('r18_indir_gbp');{const e=await p.evaluate(async()=>(await xcEngine(latestExport())).pct);t(e===100,'INDIRECT picking a named case: 100% reproduced ('+e+'%)')}
t(await p.evaluate(async()=>{const [r]=await xcQ(()=>xcCall({op:'run',runs:[[['Inputs!B3','Low']]],read:['Returns!B3']}));return Math.abs(r[0]-0.0020)<0.0001}),'switching the INDIRECT case to Low recalculates (IRR 0.20%)');
await up('r18_fx_pln');t(await p.evaluate(()=>(latestExport().inputs||[]).some(i=>i.cell==='Inputs!B9'&&/EUR\/PLN/.test(i.label))),'“EUR/PLN exchange rate” is read as an input');
r=await ask("what's the profit in euros?");t(/Total cost in PLN PLN 329\.32M/.test(r.txt),'a figure labelled in PLN on a EUR model is in PLN: '+(r.txt.match(/Total cost in PLN [^;]{0,20}/)||[''])[0]);
t(await p.evaluate(async()=>{const r=await xcSolve('EUR/PLN exchange rate','net_profit',0,async()=>{},'Inputs!B9');return r.ok&&r.to==='3.69'}),'goal seek on the exchange rate for a zero profit: 3.69');
await up('r18_sculpt_gbp');t(await p.evaluate(async()=>{const r=await xcSolve('Target DSCR','Gearing (loan to price)',65,async()=>{},'Inputs!B10');return r.ok&&r.to==='1.18'&&r.oname==='Gearing (loan to price)'&&r.gotS==='65.00%'}),'goal seek on an output beyond the headline (gearing 65%): DSCR 1.18, never swapped for the IRR');
r=await ask("what's the LLCR?");t(/LLCR 1\.25x/.test(r.txt),'a Debt sheet’s LLCR is among the model’s figures: '+(r.txt.match(/LLCR[^;]{0,12}/)||['none'])[0]);
await up('r18_mixed_sar');t(await p.evaluate(()=>!XC_SCEN.test('Active scenario (1 Base, 2 Downside, 3 Upside)')&&!XC_SCEN.test('Case (Base, Low or High)')&&XC_SCEN.test('Exit yield · Downside')),'a switch whose label lists the cases is not a case line');
await stubAI([{label:'Active scenario (1 Base, 2 Downside, 3 Upside)',cell:'Inputs!B3',kind:'to',value:2,sure:true},{label:'Exit yield · Downside',cell:'Scenarios!C5',kind:'to',value:7.5,sure:true}]);
{const d=await p.evaluate(async()=>{const r=await xcTest([{text:'downside but keep the base exit yield'}],async()=>{});return r&&r.desc});t(d&&/Scenarios!C5 8\.5% → 7\.5%/.test(d.join(' ')),'“downside but keep the base exit yield” moves the downside’s exit yield, the case being switched to: '+JSON.stringify(d))}
await stubAI([{label:'Discount rate',cell:'Inputs!B15',kind:'to',value:12,sure:true}]);
{const r2=await p.evaluate(async()=>{window.LASTQ="what's the NPV at 12%?";const r=await xcTest([{text:"what's the NPV at 12%?"}],async()=>{});return(r.extra||[]).map(e=>e.label)});t(r2.some(l=>/NPV/.test(l)),'the figure the question names (NPV) is among the outputs shown: '+JSON.stringify(r2))}
await up('r18_hotels_eur');await stubAI([{label:'Occupancy',cell:'Lisbon!B5',cells:['Lisbon!B5','Porto!B5','Madrid!B5'],kind:'pts',value:3,sure:true}]);
{const d=await p.evaluate(async()=>{const r=await xcTest([{text:'occupancy +3 pts across all three hotels'}],async()=>{});return r&&r.desc});t(d&&/Porto!B5 74% → 77%/.test(d.join(' '))&&/Madrid!B5 80% → 83%/.test(d.join(' ')),'a change across three hotel sheets lists each one: '+JSON.stringify(d))}
await unstub();
// a what-if that writes text (“2.0%” into a rate the model keeps as text and reads with VALUE(SUBSTITUTE(…))) stays text: 2%, not 0.02% (LibreOffice: equity multiple 1.5208)
await up('desk_btr_usd');t(await p.evaluate(async()=>{const x=latestExport();const [a,b]=await xcQ(()=>xcCall({op:'run',runs:[[['Inputs!B16','2.0%']],[]],read:[x.cells.equity_multiple]}));return Math.abs(a[0]-1.520772882)<1e-6&&Math.abs(b[0]-1.6530686908)<1e-6}),'a text what-if stays text in the engine, and the base restores');
// rounds 19-20: OFFSET with a shift read from a cell (a capital-call lag); DATEDIF units in lower case around nested functions; XNPV on
// dates made by EOMONTH; a goal seek on a percentage output by its own number format; a negative input may cross zero in a goal seek;
// a headline in another currency stays among the other results; a currency pair is a line, not a unit; text results are read
const eng=async m=>{await up(m);return p.evaluate(async()=>(await xcEngine(latestExport())).pct)};
t(await eng('r19_fund_eur')===100,'a fund with OFFSET(…,0,-lag) reproduces 100% of the workbook');
t(await p.evaluate(async()=>{const r=await xcSolve('Gross multiple · Milan offices','LP net IRR',14,async()=>{},'Deals!E2');return r.ok&&r.to==='2.11'}),'goal seek on the LP net IRR (XIRR on dated quarters): Milan at 2.11x');
t(await eng('r19_tenancy_gbp')===100,'DATEDIF(…,"m") around nested functions: 100% reproduced');
await up('r19_hedge_gbp');{const x=await p.evaluate(()=>{const x=latestExport();return{np:'net_profit' in (x.cells||{}),drift:(x.inputs||[]).some(i=>/GBP\/USD drift/.test(i.label))}});t(!x.np&&x.drift,'a USD net profit on a GBP asset is not its GBP headline; “GBP/USD drift a year” is an input: '+JSON.stringify(x))}
t(await p.evaluate(async()=>{const r=await xcSolve('GBP/USD drift a year','Levered IRR (USD, hedged)',6,async()=>{},'Inputs!B13');return r.ok&&parseFloat(r.to)>0}),'a goal seek on a negative input (−1% drift) may cross zero');
t(await eng('r20_egypt_egp')===100,'XNPV on dates made by EOMONTH: 100% reproduced');
t(await p.evaluate(async()=>{const r=await xcSolve('Discount rate','NPV at the discount rate (EGP)',0,async()=>{},'Inputs!B13');return r.ok&&r.to==='20.94%'&&!/^-/.test(r.gotS)}),'goal seek: the discount rate that makes the NPV zero is the IRR (20.94%)');
await up('r20_reit_sgd');t(await p.evaluate(async()=>{const r=await xcSolve('Acquisition cap rate','AFFO per unit CAGR (years 1-5)',8,async()=>{},'Inputs!B11');return r.ok&&r.to==='7.10%'}),'a percentage output read by its number format: AFFO CAGR 8% at a 7.10% acquisition cap rate');
await up('r20_refi_usd');{const m=await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x);return(x.more||[]).map(r=>r.label+'='+r.v)});t(m.includes('Refinance sized by=LTV')&&m.some(l=>/^Minimum DSCR=/.test(l)),'a text result is read, and is never a column heading: '+m.slice(0,6).join(' | '))}
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();
