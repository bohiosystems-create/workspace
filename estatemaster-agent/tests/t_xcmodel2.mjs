// Nothing in the exact recalculation is tied to one model. A second, very different workbook (UK residential in GBP, inputs on
// one sheet with percentages as fractions, IRR()/NPV formulas, returns sheet first) goes through the same path: the engine
// reproduces every stored result, a what-if names the cell set, a percentage input moves in points or bps, a month input in
// months, "to" sets a value, a goal seek solves, a table recalculates; and a values-only EstateMaster export falls back cleanly.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=analyst');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_uk.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3000);
// lands on Financial modelling with the returns sheet previewed, in analyst mode too
t(await ev(()=>{const x=document.querySelector('.tab.on');return x&&x.dataset.t==='em'}),'a new model lands on Financial modelling');
const prev=await ev(()=>{const e=document.querySelector('#exWb');return e?e.innerText.slice(0,160):''});t(/Preview of “Returns”/.test(prev),'the preview opens on the sheet holding the returns, not the first sheet: '+prev.replace(/\n/g,' | ').slice(0,100));
const x=await ev(()=>{const x=latestExport();return{out:x.out,cells:x.cells,ccy:x.meta&&x.meta.currency,n:(x.inputs||[]).length}});
t(x.ccy==='GBP'&&Math.abs(x.out.levered_irr-25.2)<5&&x.cells.levered_irr==='Returns!D9','read: GBP, levered IRR at Returns!D9: '+JSON.stringify(x).slice(0,200));
// the engine reproduces every stored result of this workbook too
const eng=await ev(()=>xcEngine(latestExport()));t(eng&&eng.ok&&eng.match===eng.tot&&eng.tot>300,`engine reproduces ${eng&&eng.match} of ${eng&&eng.tot} results`);
const base=await ev(()=>({...latestExport().out}));
// a % change on a money input, with the direction after the figure
let r=await ev(async()=>{const r=await xcTest([{text:'sales price 10% lower'}],async()=>{});return r&&{d:r.desc,m:Object.fromEntries(r.metrics.map(m=>[m.k,+m.value.toFixed(3)]))}});
t(r&&/Assumptions!D9 8,500 → 7,650/.test(r.d[0]),'sales price 10% lower: the cell and its new value: '+(r&&r.d[0]));
t(r&&r.m.levered_irr<base.levered_irr&&r.m.profit_on_cost<base.profit_on_cost&&r.m.net_profit<base.net_profit,'returns fall: '+JSON.stringify(r&&r.m));
const gdv=10200*7650,prof=await ev(async()=>{const r=await xcTest([{text:'sales price -10%'}],async()=>{});const g=r.extra.find(z=>/gross development value/i.test(z.label));return{np:r.metrics.find(m=>m.k==='net_profit').value,tc:r.metrics.find(m=>m.k==='total_cost').value,gdv:g&&g.value}});
t(Math.abs(prof.np-(gdv-prof.tc))<1,'net profit = GDV − total cost exactly after the change ('+Math.round(prof.np)+' vs '+Math.round(gdv-prof.tc)+')');
// a fraction-typed percentage: bps and points move the cell by the right amount
r=await ev(async()=>{const a=await xcTest([{text:'interest rate +50 bps'}],async()=>{});const b=await xcTest([{text:'loan to cost -5 pts'}],async()=>{});return{a:a.desc[0],b:b.desc[0],ai:a.metrics.find(m=>m.k==='levered_irr').value}});
t(/7\.5% → 8%/.test(r.a),'+50 bps on 7.5% → 8%: '+r.a);t(/65% → 60%/.test(r.b),'−5 pts on 65% → 60%: '+r.b);t(r.ai<base.levered_irr,'dearer debt lowers the levered IRR');
// a bare % on a percentage input: asked, never assumed
const amb=await ev(async()=>{const r=await xcTest([{text:'contingency +2%'}],async()=>{});return r&&r.ask?r.ask.question:''});t(/points.*or.*of it/.test(amb),'contingency +2%: asks points or relative');
// months on a period input; "to" on a money input; two changes in one sentence
r=await ev(async()=>{const a=await xcTest([{text:'build period +6 months'}],async()=>{});const b=await xcTest([{text:'land cost to 30,000,000'}],async()=>{});const c=await xcTest([{text:'what if sales price drops 5% and build cost rises 10%?'}],async()=>{});return{a:a.desc[0],b:b.desc[0],c:c.desc,ci:c.metrics.find(m=>m.k==='levered_irr').value}});
t(/24 → 30/.test(r.a),'build period +6 months → 30: '+r.a);t(/25,000,000 → 30,000,000/.test(r.b),'land cost to 30,000,000: '+r.b);
t(r.c.length===2&&/7,650|8,075/.test(r.c[0])&&/2,800 → 3,080/.test(r.c[1])&&r.ci<base.levered_irr,'two changes in one what-if, both set: '+JSON.stringify(r.c));
// goal seek on a cost input for a profit-on-cost target, checked by the recalculation at the answer
const gs=await ev(async()=>xcSolve('build cost','profit_on_cost',20,async()=>{}));t(gs&&gs.ok&&Math.abs(gs.got-20)<0.01&&/Assumptions!D13/.test(gs.cell),'goal seek: build cost '+(gs&&gs.to)+' for profit on cost 20% ('+(gs&&gs.got&&gs.got.toFixed(3))+'%)'+(gs&&gs.why||''));
// a two-way table by recalculation, sales price × build cost, centre cell = base
const g=await ev(async()=>{const r=await xcSensGrid({assumption:'sales price',kind:'pct',shifts:[-10,0,10]},{assumption:'build cost',kind:'pct',shifts:[-10,0,10]},'profit_on_cost',async()=>{});return r&&{c:r.grid[1][1],lo:r.grid[2][0],hi:r.grid[0][2],xc:r.xc}});
t(g&&g.xc&&Math.abs(g.c-base.profit_on_cost)<0.01&&g.lo<g.c&&g.hi>g.c,'table: centre = base, corners move the right way '+JSON.stringify(g));
// no chat question about the cash flow or funding when the workbook answers IRRs exactly
const qs=await ev(()=>layoutQuestions(latestExport()).map(q=>q.id));t(!qs.includes('cashflow')&&!qs.includes('funding')&&!qs.includes('land'),'no cash-flow / funding / land questions: the workbook itself recalculates: '+JSON.stringify(qs));
// a values-only EstateMaster export: the engine declines and everything falls back without an error
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'v2_export.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
const e2=await ev(async()=>{const x=latestExport();const e=await xcEngine(x);const r=await xcTest([{text:'sale price -10%'}],async()=>{});return{ok:e&&e.ok,tot:e&&e.tot,can:xcCan(x),r}});
t(e2&&!e2.ok&&e2.tot===0&&!e2.can&&e2.r===null,'values-only export: engine not trusted, xcTest null, no error: '+JSON.stringify(e2).slice(0,120));
const nc=await ev(async()=>{try{await aiCrossCheck([{text:'sale price -10%'}],async()=>{});return{ok:true}}catch(e){return{msg:e.message,nc:!!e.notComputed}}});
t(nc.nc&&/^Not computed/.test(nc.msg)&&/values only, no formulas/.test(nc.msg)&&/I do not estimate/.test(nc.msg),'a values-only export is never estimated: '+nc.msg);
const ns=await ev(async()=>{try{await aiSensGrid({assumption:'sale price',kind:'pct',shifts:[-10,0,10]},{assumption:'construction cost',kind:'pct',shifts:[-10,0,10]},'levered_irr',async()=>{});return{ok:true}}catch(e){return{msg:e.message}}});
t(/^Not computed/.test(ns.msg||''),'nor is a sensitivity table: '+(ns.msg||'').slice(0,80));
// a third model: a US pro forma in $000s with percentages typed as whole numbers; the reader shows full dollars, the recalculation follows the same scale
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/office_k.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
const k=await ev(async()=>{const x=latestExport();const e=await xcEngine(x);const a=await xcTest([{text:'sale price -10%'}],async()=>{});const b=await xcTest([{text:'loan to cost +5 pts'}],async()=>{});const c=await xcTest([{text:'hold +6 months'}],async()=>{});const g=await xcSolve('sale price','profit_on_cost',30,async()=>{});
  const M=r=>Object.fromEntries(r.metrics.map(m=>[m.k,[+m.base.toFixed(2),+m.value.toFixed(2)]]));return{ok:e.ok,tot:e.tot,match:e.match,a:M(a),ad:a.desc[0],bd:b.desc[0],cd:c.desc[0],g:{to:g.to,got:g.got&&+g.got.toFixed(3),why:g.why}}});
t(k.ok&&k.match===k.tot,'$000s model: engine reproduces every result');
t(k.a.gross_revenue&&k.a.gross_revenue[0]===100640000&&k.a.gross_revenue[1]===90576000&&k.a.net_profit[1]===21076000,'$000s model: figures stay in full dollars after the change: '+JSON.stringify(k.a.gross_revenue)+' '+JSON.stringify(k.a.net_profit));
t(k.a.profit_on_cost&&Math.abs(k.a.profit_on_cost[0]-44.81)<0.01&&Math.abs(k.a.profit_on_cost[1]-30.32)<0.01,'a percentage typed as a whole number (44.8) is not multiplied by 100: '+JSON.stringify(k.a.profit_on_cost));
t(/680 → 612/.test(k.ad)&&/60%? → 65%?/.test(k.bd)&&/30 → 36/.test(k.cd),'cells set: '+[k.ad,k.bd,k.cd].join(' | '));
t(k.g.got!=null&&Math.abs(k.g.got-30)<0.01,'goal seek on the $000s model: sale price '+k.g.to+' for profit on cost 30% ('+k.g.got+'%) '+(k.g.why||''));
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
