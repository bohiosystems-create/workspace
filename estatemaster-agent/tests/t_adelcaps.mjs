// The five capabilities of the Adel demo, each run as the chat runs it, against LibreOffice's figures:
//  1. department updates: two changes in one sentence each take their own cell ([cells: C11, C18] → C11 and C18), an absolute level on a
//     line kept per case (“construction cost SAR 6,450”) goes to the case the model runs on, and the bridge between the uploaded model and a
//     newer one groups a construction period under timing;
//  2. model debug: a typed-over period, a period of a row calculated differently, a total stopping one cell short and a leasable area typed
//     with an extra zero are found, each with the formula or value to put back, on a model seeded with them (fixtures/models/
//     demo_nakheel_adel_review.xlsx), and nothing is flagged on the clean model;
//  3. a joint stress where costs go up in the downside moves them up (it used to move only the inputs whose downside is down);
//  4. a past report (fixtures/docs/adel_past_report.pdf) teaches the house style: its sections in order become the new report's titles, and
//     its words (Equity IRR, Return on cost) replace the app's in the report and the deck;
//  5. budget against actual on a fund (fixtures/models/adel_fund_budget_2025.xlsx → adel_fund_actual_2025.xlsx): the fund IRR bridged
//     input by input, each asset named, capex under costs, money moves signed in SAR M;
//  and the daily report edited in words: a section added right after another, one removed and one added in a sentence, one moved.
import {chromium} from 'playwright';
const M=n=>new globalThis.URL('./fixtures/models/'+n,import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,d)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(c||d===undefined?'':' → '+(typeof d==='string'?d:JSON.stringify(d)).slice(0,500)))};
const errs=[];
async function open(file){const p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',file);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(2500);
  await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x)});return p}
const run=(p,q,tool,args)=>p.evaluate(async([q,tool,args])=>{window.LASTQ=q;window.ASKED=q;try{const it=tool==='estimate'?{k:'estimate',text:args}:toolIntent0(tool,args);const o=await handle(q,'web','Investment Director',it);return String((o&&o.plain)||'')}catch(e){return 'THROW '+e.message}},[q,tool,args]);

// 1. department updates
let p=await open(M('demo_nakheel_adel.xlsx'));
let a=await run(p,'Development Team: construction now takes 33 months and the tender came in at SAR 6,450 per sqm.','estimate','construction period 33 months and construction cost SAR 6,450 per sqm');
ok(/Inputs!C11 30 → 33/.test(a)&&/Inputs!C18 6,200 → 6,450/.test(a)&&a.includes('Levered IRR: 14.11% → **12.28%**'),'two department changes in one sentence, each on its own line: levered IRR 12.28% as LibreOffice gives it',a.slice(0,300));
a=await run(p,'Sales Team update','estimate','average price per apartment SAR 1,820,000 and months to sell out 26 [cells: Inputs!C24, Inputs!C26]');
ok(/Inputs!C24 1,750,000 → 1,820,000/.test(a)&&/Inputs!C26 30 → 26/.test(a)&&!/C24…C26/.test(a)&&a.includes('→ **15.40%**'),'two changes and two cells: one cell each, in the order written',a.slice(0,300));
a=await run(p,'construction cost to SAR 6,450','estimate','construction cost to SAR 6,450');
ok(/Construction cost \(SAR per sqm GFA\) · Base: Inputs!C18 6,200 → 6,450/.test(a),'a level on a line kept per case goes to the case the model runs on (Base)',a.slice(0,240));
ok(await p.evaluate(()=>a33Group('Construction period (months)')==='timing'&&a33Group('Capital expenditure in 2025 (SAR)')==='cost'),'a construction period is timing in a bridge, capital expenditure a cost');

// 3. joint stress, costs up in the downside
a=await run(p,'Office rents −10%, construction cost +8% and SAIBOR +100 bps together','joint_sensitivity',{levers:[{label:'Office rent',cell:'Inputs!C35',down:10,up:0,unit:'pct',downside:'down'},{label:'Construction cost',cell:'Inputs!C18',up:8,down:0,unit:'pct',downside:'up'},{label:'SAIBOR',cell:'Inputs!C57',up:100,down:0,unit:'bps',downside:'up'}],metric:'levered_irr'});
ok(/\| 100% downside \| 1,215 \| 6,696 \| 6\.45% \| 8\.97% \|/.test(a),'the joint downside moves rent down, cost and SAIBOR up: 8.97% as LibreOffice gives it',a.slice(0,700));

// 4. house style from a past report
await p.evaluate(()=>showTab('report'));await p.setInputFiles('#rhFile',new globalThis.URL('./fixtures/docs/adel_past_report.pdf',import.meta.url).pathname);
await p.waitForFunction(()=>window.RHOUSE||(typeof RHOUSE!=='undefined'&&RHOUSE),null,{timeout:60000}).catch(()=>{});
const h=await p.evaluate(()=>typeof RHOUSE!=='undefined'&&RHOUSE?{heads:RHOUSE.heads,terms:RHOUSE.terms,title:RHOUSE.title}:null);
ok(h&&h.heads.join('|')==='Executive Summary|Project Returns|Financing and Covenants|Sensitivity and Risk|Scenario Analysis|Development Budget and Cash Flow|Next Steps'&&h.title==='Monthly Project Report','the past report’s sections, in order, and its title',h);
ok(h&&h.terms.some(([o,t])=>o==='Levered IRR'&&t==='Equity IRR')&&h.terms.some(([o,t])=>o==='Profit on cost'&&t==='Return on cost'),'its words for the app’s figures',h&&h.terms);
a=await p.evaluate(async()=>{const q='Build this month’s project report in our house style.';const o=await handle(q,'web','Investment Director',toolIntent0('create_report',{name:'',audience:'Investment Committee',description:q,blocks:[],house_style:true}));return String(o.plain)});
const r=await p.evaluate(()=>{const R=RPTS[RSEL];renderReport();const d=document.querySelector('#report');return{name:R.name,heads:[...d.querySelectorAll('.k-sec .k-sh')].map(e=>e.textContent),old:/Levered IRR|Profit on cost/.test(d.innerText),neu:/Equity IRR/.test(d.innerText)&&/Return on cost/.test(d.innerText),deck:JSON.stringify(buildDeck(RSEL).slides)}});
ok(r.name==='Monthly Project Report'&&['Executive Summary','Project Returns','Financing and Covenants','Sensitivity and Risk','Scenario Analysis','Development Budget and Cash Flow'].every((t,i)=>r.heads.filter(z=>!/^Key figures|^Not in this/.test(z))[i]===t),'the new report has the past report’s sections, titles and order',{name:r.name,heads:r.heads});
ok(!r.old&&r.neu&&!/Levered IRR/.test(r.deck)&&/Equity IRR/.test(r.deck),'the report and its deck speak the house’s words',a.slice(0,300));
ok(/Next Steps section has no source in the model/.test(a),'the past report’s section with no source in the model is named',a.slice(0,400));

// daily report edited in words
const secs=()=>p.evaluate(()=>{RSEL='daily';renderReport();return[...document.querySelectorAll('#report .k-sec .k-sh')].map(e=>e.textContent)});
const ed=ins=>p.evaluate(async ins=>{const o=await handle(ins,'web','Investment Director',toolIntent0('design_report',{report:'daily',instruction:ins}));return String(o.plain)},ins);
await ed('Add the debt and covenant headroom right after the list of models.');let S=await secs();
ok(S[S.indexOf('All financial models')+1]==='Debt and cover (from the workbook)'&&!S.includes('Facility summary'),'daily: the workbook’s debt section added right after the list of models',S);
await ed('Remove the assumptions-versus-market section and add the model debug findings at the end.');S=await secs();
ok(!S.includes('Assumptions vs market')&&S.includes('Model debug: findings on the workbook'),'daily: one section removed and one added in a sentence',S);
await ed('Put the stress tests first.');S=await secs();
ok(/^Stress tests run before the report/.test(S.filter(z=>!/^Headline/.test(z))[0])&&S.filter(z=>/^Stress tests/.test(z)).length===1,'daily: a section moved, not added again',S);
await p.close();

// 2. model debug on the seeded model and the clean one
const dbg=async f=>{const q=await open(M(f));const c=await q.evaluate(async()=>{const x=latestExport();const a={checks:[],steps:[]};await auEvidence(x,a);return a.checks.filter(c=>c.level!=='note').map(c=>({code:c.code,cell:c.cell,text:c.text}))});await q.close();return c};
let c=await dbg('demo_nakheel_adel_review.xlsx');const has=(code,cell,re)=>c.some(z=>z.code===code&&String(z.cell).replace(/'/g,'')===cell&&re.test(z.text));
ok(has('typed-over','Cash Flow!AQ43',/Fix: 'Cash Flow'!AQ43 =OfficeGLA\*OfficeRent\/12\*AQ39\*AQ40\*AQ41/),'debug: the office rent typed over in one month, with its formula to put back',c);
ok(has('row-break','Cash Flow!BA45',/Fix: 'Cash Flow'!BA45 =BA42\+BA43-BA44/),'debug: one month of NOI calculated without its costs',c);
ok(has('range-short','Cash Flow!B24',/=SUM\(C24:AF24\) stops one cell before.*Fix: 'Cash Flow'!B24 =SUM\(C24:AG24\)/),'debug: a total stopping one cell short',c);
ok(has('area-typo','Inputs!C34',/410,000.*Inputs!D34 \(Upside\) holds 41,000: a zero typed twice\. Fix: Inputs!C34 41,000/),'debug: a leasable area with an extra zero, against the building and its other cases',c);
c=await dbg('demo_nakheel_adel.xlsx');ok(!c.length,'debug: nothing flagged on the clean model',c);

// 5. fund budget against actual
p=await open(M('adel_fund_budget_2025.xlsx'));const n0=await p.evaluate(()=>EXPORTS.length);
await p.setInputFiles('#exFile',M('adel_fund_actual_2025.xlsx'));await p.waitForFunction(n=>EXPORTS.length>n&&!!latestExport().cells,n0,{timeout:120000}).catch(()=>{});await p.waitForTimeout(2500);
await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x)});
a=await run(p,'Compare the budget with the actual 2025 results: why did the fund IRR move?','explain_return_change',{});
ok(/Fund IRR \(net, to unitholders\) went from 11\.50% to 11\.12%/.test(a)&&/Occupancy in 2025 · Al Olaya Office Tower 90\.00% → 86\.00%/.test(a)&&/Costs \(\d\): [^\n]*Capital expenditure in 2025 \(SAR\) · Al Olaya Office Tower/.test(a),'budget vs actual: the fund IRR bridged input by input, each asset named, capex under costs',a.slice(0,1500));
a=await run(p,'And the 2025 distributions?','explain_return_change',{metric:'Distributions to unitholders 2025 (SAR)'});
ok(/SAR 43\.79M to SAR 37\.1M? \(−SAR 6\.68M\)/.test(a)&&!/SAR -/.test(a),'budget vs actual: distributions, money moves signed in SAR M',a.slice(0,700));
await p.close();
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
