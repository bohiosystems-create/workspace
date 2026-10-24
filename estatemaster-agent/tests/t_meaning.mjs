// The meaning test: the app's picture carries what the cells mean, not only what they hold. One synthetic workbook per kind of meaning
// (gen/gen_meaning.py), each figure computed independently there (golden/meaning.json): a sheet's money unit (SAR '000), a quarterly
// timeline and its period inputs, a case switch that holds a word, the roles that make a direction certain or not, a fund's own words,
// and the engine's gaps. Each tool that reads the meaning is checked on it: trace, line over time, map card, hold vs sell, the debug's
// direction, no-effect and phasing checks, the what-if on a case, the headline names.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/meaning.json',import.meta.url),'utf8'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,400):''))};
const near=(a,e,tol=1e-6)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(2500);
  return p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);for(let i=0;i<40&&!(x.map&&x.map.proof);i++)await new Promise(r=>setTimeout(r,250));return{ngaps:e&&e.ngaps,loErr:e&&e.loErr}})};
const debug=()=>p.evaluate(async()=>{const x=latestExport();const a={checks:[],steps:[]};try{await auEvidence(x,a)}catch(e){a.checks.push({level:'error',code:'crash',text:String(e&&e.message||e)})}return a.checks.map(c=>({l:c.level,code:c.code,cell:c.cell,t:c.text}))});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

// 1. a sheet's money unit: every amount read from a sheet in SAR '000 is said in currency, wherever it is shown
await up('mean_scale_sar.xlsx');let r=await p.evaluate(async()=>{const x=latestExport(),st=async()=>{};const t=await a33Trace(x,{figure:'Net profit'},st);const L=await a33Covenant(x,{lines:['Loan balance']},st);const c=L.out?a33CovOut(x,L):{md:''};
  return{sc:xcSheetUnit(x,"'Cash Flow'!A1"),out:x.out,trace:t.t?a33TraceOut(x,t).md:'',line:c.md,chart:(c.charts||[])[0]&&{unit:c.charts[0].unit,values:c.charts[0].values},card:mapCard(x).replace(/<[^>]+>/g,' ')}});
ok(r.sc===G.scale.scale&&near(r.out.net_profit,G.scale.net_profit_sar)&&near(r.out.peak_debt,G.scale.peak_debt_sar),'the sheet heading (SAR \'000) sets each amount\'s unit: the headlines in SAR',{sc:r.sc,out:r.out});
ok(/Net profit \(Returns!B2\) = SAR 50(\.00)?M\*\* \(the cells on Returns are in thousands of SAR\)/.test(r.trace),'the trace says a money figure in currency, with the sheet\'s unit',r.trace.slice(0,200));
ok(/highest SAR 80(\.00)?M/.test(r.line)&&/Peak SAR 80(\.00)?M in year 2; repaid in full by year 3/.test(r.line)&&r.chart&&r.chart.unit==='SAR M'&&JSON.stringify(r.chart.values)===JSON.stringify(G.scale.balance_sar.map(v=>+(v/1e6).toFixed(2))),'the loan balance over time in SAR, its peak and the year it is repaid, the chart in SAR M',{line:r.line.slice(0,300),chart:r.chart});
ok(/SAR 50\.00M/.test(r.card)&&/SAR 80\.00M/.test(r.card),'the model map card states the amounts in currency, not in thousands',r.card.slice(0,300));

// 2. a quarterly timeline: calendar constants are not inputs, period inputs move in whole quarters inside the timeline, exits in quarters
await up('mean_period_qtr.xlsx');r=await p.evaluate(async()=>{const x=latestExport();const s=await xcQ(()=>xcCall({op:'signature',inputs:['Inputs!B4'],whole:['Inputs!B4'],hmax:12,outputs:['Returns!B1']}));
  const bad0=svBad({label:'Acquisition quarter',cell:'Inputs!B4',value:2,pct:false},'periods',-2),bad1=svBad({label:'Exit quarter',cell:'Inputs!B5',value:10,pct:false},'periods',3);
  const h=await a33HoldSell(x,{points:[8,12],unit:'quarter',cell:'Inputs!B5'},async()=>{});return{per:xcPeriod(x),B:xcBounds(x),fc:(x.inputs||[]).filter(i=>i.fconst).map(i=>i.label),sig:s.signature[0],bad0,bad1,timing:xcTimingIn(x,x.inputs.find(i=>i.cell==='Inputs!B4')),h:h.rows?{rows:h.rows.map(z=>[z.y,z.v[0],z.past]),md:a33HoldSellOut(x,h).md}:h}});
ok(r.per==='quarter'&&r.B.first===G.period.first&&r.B.last===G.period.last,'the timeline is read as quarters 1 to 12',{per:r.per,B:r.B});
ok(!r.fc.some(l=>/the 3 in|the 4 in|the 0\.25 in/.test(l)),'the 3 months in EDATE(start,3*(q-1)) and the 4 in ^(1/4) are calendar facts, not inputs',r.fc);
ok(r.timing&&r.sig&&r.sig.whole&&Number.isFinite(r.sig.moves[0])&&r.sig.moves[0]!==0,'an acquisition quarter moves by one whole quarter in the signature (never 2 → 1.98)',r.sig);
ok(/before the model’s first period \(1\)/.test(r.bad0)&&/past the model’s last period \(12\)/.test(r.bad1),'a period input cannot be moved before quarter 1 or past quarter 12',{bad0:r.bad0,bad1:r.bad1});
ok(r.h.rows&&near(r.h.rows[0][1],G.period.irr_exit_8,1e-7)&&near(r.h.rows[1][1],G.period.irr_exit_12,1e-7)&&/Exit quarter/.test(r.h.md)&&/\| 8 \|/.test(r.h.md),'exits asked in quarters (8 and 12) are run and shown in quarters, each IRR exact',r.h.rows||r.h);
let D=await debug();
ok(!D.some(c=>c.code==='direction'&&/NOI yield/.test(c.t)),'an NOI yield on cost is income: its rise lifting the IRR is no “direction” error',D.filter(c=>c.code==='direction').map(c=>c.t));

// 3. a case switch that holds a word: found and proved, run by name, its other cases tested under their own case
await up('mean_case_txt.xlsx');r=await p.evaluate(async()=>{const x=latestExport();const cc=xcCaseChange(x,{text:'Run the Downside case'});const [[b,v]]=[await xcQ(()=>xcCall({op:'run',runs:[[['Inputs!B2','Downside']]],read:['Returns!B1','Returns!B2']}))][0];
  return{sw:svSwitch(x),proof:x.map&&x.map.proof&&x.map.proof.scenario,cc:cc&&{cell:cc.cells[0],kind:cc.kind,s:cc.s},b,v,labels:x.inputs.map(i=>i.label)}});
ok(r.proof==='ok'&&r.sw&&r.sw.text&&r.sw.cell==='Inputs!B2'&&JSON.stringify(r.sw.names)===JSON.stringify(G.case.names)&&r.sw.value==='Base','the switch holding “Base” is found from the MATCH that reads it and proved by moving the results',r.sw);
ok(r.cc&&r.cc.cell==='Inputs!B2'&&r.cc.kind==='text'&&r.cc.s==='Downside','“Run the Downside case” sets the switch to “Downside”',r.cc);
ok(near(r.b,G.case.down_irr,1e-7)&&near(r.v,G.case.down_profit),'the Downside case recalculates to the hand figures',{b:r.b,v:r.v});
ok(r.labels.includes('Price')&&r.labels.includes('Hold (years)')&&!r.labels.some(l=>/^(Price|Hold \(years\)) · /.test(l)),'single inputs under the case table are not labelled with its “Base” column',r.labels);
D=await debug();
ok(D.some(c=>c.code==='case-inputs'&&/Downside: Rent · Downside, Exit yield · Downside/.test(c.t))&&!D.some(c=>c.code==='no-effect'),'the Downside column is tested under its own case: a case input, not a broken path',D.map(c=>c.code+' '+c.t.slice(0,120)));

// 4. roles: a direction is certain only on a path that is all cost or all revenue
await up('mean_roles.xlsx');D=await debug();const dir=D.filter(c=>c.code==='direction');
ok(dir.length&&dir.every(c=>c.cell===G.roles.planted),'the rent uplift taken off the cash flow is the only direction error',dir.map(c=>c.cell+' '+c.t.slice(0,80)));
ok(!dir.some(c=>G.roles.not_direction.includes(c.cell)),'a price that also drives the NOI, and a GFA that only drives the fit-out cost, are not called wrong-signed',dir.map(c=>c.cell));

// 5. a fund's own words: its “Gross IRR” keeps its name in answers; an FX table is read by its currency codes
await up('mean_fund_vocab.xlsx');r=await p.evaluate(async()=>{const x=latestExport();const t=await xcQ(()=>xcCall({op:'tree',ref:'Returns!B3',depth:3,max:30}));const L=[];const w=n=>{if(n.typed)L.push(n.label);(n.kids||[]).forEach(w)};w(t);
  const msg=[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n');return{lab:metLabel(x,'levered_irr'),lp:x.out.lp_irr,gross:x.out.levered_irr,leaves:L,msg:(msg.match(/Gross IRR [\d.]+%/)||[''])[0]}});
ok(r.lab==='Gross IRR'&&r.msg==='Gross IRR 11.94%'&&near(r.gross,G.fund.gross*100,1e-5)&&near(r.lp,G.fund.lp*100,1e-5),'the fund\'s gross IRR is called “Gross IRR” at upload and in answers, with the figure as by hand',r);
ok(r.leaves.some(l=>/^SAR · Per USD$/.test(l)),'the FX rate is named by its currency code and its column (“SAR · Per USD”)',r.leaves);

// 6. the engine's gaps: an IRR over a name built on OFFSET, a row picked by INDIRECT from a list of sheet names, a function the engine
//    lacks (said as not computed here, never as the workbook's error), an IRR Excel's start guess does not reach (the rate found, a guess tested)
r=await up('mean_engine.xlsx');const eg=r;r=await p.evaluate(async()=>{const g=await xcQ(()=>xcCall({op:'get',refs:['Returns!B1','Returns!B2','Returns!B3','Returns!B4']}));return{g}});D=await debug();
ok(near(r.g[0],G.engine.irr,1e-9)&&r.g[1]===G.engine.profit,'IRR over a name defined with OFFSET, and two deal rows picked by INDIRECT from their sheet names, give the hand figures (12%, 540)',r.g);
const nc=D.find(c=>c.code==='not-computed');ok(eg.ngaps>=1&&nc&&/“Rent forecast” \(Returns!B3\) is not computed here: it uses TREND, which the formula engine in this browser does not have\. It is not an error of the workbook/.test(nc.t)&&!D.some(c=>c.code==='error-root'&&/Rent forecast/.test(c.t)),'TREND (which Excel computes) is said as not computed here, not as the workbook\'s #NAME?',nc&&nc.t);
ok(!D.some(c=>c.code==='no-effect'&&/Rent history/.test(c.t)),'the input read only by that cell is not called a broken path',D.filter(c=>c.code==='no-effect').map(c=>c.t.slice(0,80)));
const nu=D.find(c=>/Monthly IRR/.test(c.t));const m=nu&&nu.t.match(/a rate exists \(([\d.]+)% a period\)/);
ok(r.g[3]&&r.g[3].err==='#NUM!'&&m&&near(+m[1]/100,G.engine.monthly_rate,1e-5)&&/Fix: give the IRR a starting guess near that rate: Returns!B4 as =IRR\('Cash Flow'!B6:BI6,0\.031\)/.test(nu.t),'an IRR Excel\'s 10% guess does not reach: #NUM! as Excel gives it, the rate that exists named, and a tested guess as the fix',nu&&nu.t);
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
