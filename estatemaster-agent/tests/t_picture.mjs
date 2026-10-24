// The one picture of the workbook: the app's picture is never thinner than the workbook. One synthetic workbook per Excel feature
// (gen/gen_picture.py), each figure computed independently there (golden/picture.json): a loop (iterative calculation), an Excel table,
// a SEQUENCE spill, dates typed as plain serials, a cross-sheet array formula, a merged header, defined names, an external link. For each,
// the picture holds every cell as the engine holds it, every labelled result is an output, the figures recalculate to the hand calculation,
// and the debug reads the picture (no live input called unused, an error traced to its cause).
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/picture.json',import.meta.url),'utf8'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,400):''))};
const near=(a,e,tol=1e-6)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const key=r=>String(r).replace(/'/g,'').replace(/\$/g,'');
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(3000);return p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return x.id})};
/* the picture, the engine's view of some cells, a recalculation with some cells set, the reader's inputs and the debug's findings */
const look=(refs,runs,read)=>p.evaluate(async({refs,runs,read})=>{const x=latestExport();const P=await xcQ(()=>xcCall({op:'picture',fresh:true}));const pr=await xcQ(()=>xcCall({op:'prec',refs}));
  const R=runs?await xcQ(()=>xcCall({op:'run',runs,read})):null;const a={checks:[],steps:[]};try{await auEvidence(x,a)}catch(e){a.checks.push({level:'error',code:'crash',text:String(e&&e.message||e)})}
  return{n:P.n,circ:P.circ,outs:P.outputs.map(o=>({ref:o.ref,label:o.label,v:o.v,kind:o.kind,err:o.err})),recs:P.records.map(r=>({name:r.name,rows:r.rows.map(z=>z.key)})),dates:P.dateCells,spill:P.cells.filter(c=>c.spill).map(c=>[c.ref,c.v]),
    cells:P.cells.map(c=>[c.ref,c.v,c.f||'',c.circ?1:0]),pr:pr.map(z=>({k:z.k,f:z.f,dep:z.dep})),R,out:x.out,inputs:x.inputs.map(i=>({label:i.label,value:i.value,rec:i.rec||0,cell:i.cell})),checks:a.checks.map(c=>c.level+' '+c.code+' '+c.text)}},{refs,runs,read});
const outOf=(r,lab)=>r.outs.find(o=>o.label===lab)||{};
const unusedIn=r=>r.checks.filter(t=>/unused|no effect|without effect|does not move|not read/i.test(t));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

// 1. the loop: the circular cell keeps its formula in the picture, the input feeding the loop has dependents, the fixed point is exact
await up('pic_loop_sar.xlsx');let r=await look(['Inputs!B2','Inputs!B3','Loop!B2'],[[],[['Inputs!B3',0.1]]],['Returns!B1','Returns!B2']);
let c=r.cells.find(z=>key(z[0])==='Loop!B2')||[];
ok(c[3]===1&&/^=Inputs!B3\*\(B1\+B2\/2\)$/i.test(c[2])&&r.circ.map(key).includes('Loop!B2'),'the circular cell is in the picture with its formula, marked as a loop',c);
ok(r.pr.every(z=>z.dep>=1)&&/B2\/2/.test(r.pr[2].f||''),'the inputs feeding the loop have dependents, and the loop cell is held with its formula',r.pr);
ok(near(outOf(r,'Interest cost').v,G.loop.interest,1e-7)&&near(outOf(r,'Total debt').v,G.loop.total_debt,1e-7)&&outOf(r,'Covenant').v===G.loop.covenant&&outOf(r,'Covenant').kind==='text','the loop settles on the exact fixed point (interest 8.33M, total debt 110.33M)',[outOf(r,'Interest cost').v,outOf(r,'Total debt').v]);
ok(near(r.R[1][1],0.1*100e6/(1-0.05),1e-7)&&near(r.R[0][0],G.loop.total_debt,1e-7),'a what-if through the loop recalculates to the new fixed point (rate 10%: interest 10.53M)',r.R);
ok(unusedIn(r).length===0,'the debug calls no live input unused on a model whose inputs feed only the loop',unusedIn(r));
r=await p.evaluate(()=>xcQ(()=>xcCall({op:'run',runs:[[],[['Inputs!B3',0.02]]],read:['Returns!B3','Loop!B5']})));
ok(r[0][0]===G.loop.covenant&&r[0][1]===G.loop.covenant&&r[1][0]==='Within','a text result downstream of the loop (“Breached”) keeps its text through the iteration, and flips with a what-if',r);

// 2. the table: records in the picture (two Anchors apart), each row a record in the reader, structured references recalculate
await up('pic_table_usd.xlsx');r=await look(['Inputs!B2','Leases!B2'],[[],[['Leases!B2',13000]]],['Returns!B1','Returns!B2']);
ok(r.recs.length===1&&r.recs[0].rows.join(',')==='Anchor,Gym,Anchor,Cafe','the Excel table is a set of records keyed by the tenant',r.recs);
const recs=r.inputs.filter(i=>i.rec);ok(recs.length===8&&recs.some(i=>i.label==='Anchor (2) · Area'&&i.value===4000)&&r.inputs.some(i=>i.label==='Rent growth'&&!i.rec),'the reader gives each table row as a record (the second Anchor told apart), the plain inputs as inputs',r.inputs.map(i=>i.label));
ok(near(outOf(r,'Total rent').v,G.table.total_rent)&&outOf(r,'Total area').v===G.table.total_area&&outOf(r,'Total area').kind==='count'&&near(outOf(r,'Rent next year').v,G.table.rent_next),'SUMPRODUCT and SUM over Leases[…] give the hand figures; an area is a count, not money',r.outs);
ok(r.pr[1].dep>=1&&r.R[1][0]===G.table.total_rent+1000*180&&r.R[1][1]===G.table.total_area+1000,'a table cell has dependents through the structured references, and a change to it recalculates the totals',{dep:r.pr[1].dep,R:r.R});
ok(!r.checks.some(t=>/duplicate/i.test(t)&&/Anchor/.test(t)),'two tenants with the same name are not a “duplicate input”',r.checks.filter(t=>/duplicate/i.test(t)));

// 3. the spill: the cells SEQUENCE spilled into are in the picture as the engine's, never as typed inputs
await up('pic_spill_usd.xlsx');r=await look(['Inputs!B2','Cash Flow!B1'],[[],[['Inputs!B3',0.05]]],['Returns!B1','Returns!B2']);
ok(r.spill.map(z=>key(z[0])).join(',')===G.spill.spilled.join(',')&&r.spill.every((z,i)=>z[1]===i+2)&&r.n.typed===3,'the seven spilled cells are in the picture as spilled, and the typed count is the three inputs',{spill:r.spill,n:r.n});
ok(r.inputs.length===3&&!r.inputs.some(i=>/Year/.test(i.label)),'the spilled years are not read as inputs',r.inputs.map(i=>i.label));
ok(near(outOf(r,'Total rent').v,G.spill.total_rent)&&near(outOf(r,'NPV').v,G.spill.npv)&&r.pr[0].dep===8,'the rows under the spill recalculate to the hand figures; the rent input feeds all eight years',{outs:r.outs,dep:r.pr[0].dep});
const rent5=[...Array(8)].map((_,i)=>100000*1.05**i);ok(near(r.R[1][0],rent5.reduce((s,x)=>s+x,0))&&near(r.R[1][1],rent5.reduce((s,x,t)=>s+x/1.08**(t+1),0)),'a what-if on the growth recalculates through the spill',r.R);

// 4. dates by value: plain serials in General format are dates (the first of the run too), a timeline, not assumptions; XNPV is exact
await up('pic_dates_usd.xlsx');r=await look(['Inputs!B2','Cash Flow!B1'],null,null);
ok(r.dates.map(key).join(',')===G.dates.dateCells.join(','),'the six serials are read as dates by value, the first of the run included',r.dates);
ok(!r.inputs.some(i=>/^Date/.test(i.label)||i.value===46387),'the date row is a timeline, not an assumption',r.inputs.map(i=>i.label+'='+i.value));
ok(near(outOf(r,'NPV at the discount rate').v,G.dates.xnpv,1e-7),'XNPV on the serial dates gives the hand figure',outOf(r,'NPV at the discount rate').v);

// 5. a cross-sheet array formula: the picture holds it, the rent roll's cells have dependents through it, the figures are exact
await up('pic_xarr_sar.xlsx');r=await look(['Rent roll!B2','Rent roll!C5','Inputs!B2'],[[],[['Rent roll!B2',50]]],['Returns!B1','Returns!B2']);
c=r.cells.find(z=>key(z[0])==='Cash Flow!B1')||[];
ok(/SUM\('Rent roll'!B2:B5\*'Rent roll'!C2:C5\)/i.test(c[2])&&c[1]===G.xarr.gross,'the array formula over another sheet is in the picture with its gross rent',c);
ok(r.pr.every(z=>z.dep>=1),'every rent-roll cell and the vacancy have dependents through the array formula',r.pr);
ok(near(outOf(r,'Net rent').v,G.xarr.net)&&outOf(r,'Units').v===G.xarr.units&&near(r.R[1][0],(G.xarr.gross+10*30000)*0.95)&&r.R[1][1]===G.xarr.units+10,'net rent and units as by hand, and a what-if on one unit count recalculates through the array',{outs:r.outs,R:r.R});
ok(r.inputs.filter(i=>i.rec).length===8,'the rent roll rows are records',r.inputs.map(i=>i.label));

// 6. a merged two-row header: the inputs under it are read by their own labels, profit on cost (a ratio formula) is a percentage
await up('pic_merged_sar.xlsx');r=await look(['Inputs!B3','Inputs!B6'],[[],[['Inputs!B6',0.08]]],['Returns!B1','Returns!B2','Returns!B3']);
ok(r.inputs.map(i=>i.label).join(',')==='GFA,Cost per sqm,Rent per sqm,Exit yield'&&!r.inputs.some(i=>/Item|Value|MERGED/i.test(i.label)),'the four inputs under the merged header are read by their labels, the headers are not inputs',r.inputs.map(i=>i.label));
ok(outOf(r,'Profit on cost').kind==='pct'&&near(outOf(r,'Profit on cost').v,G.merged.poc)&&near(r.out.profit_on_cost,G.merged.poc*100,1e-5),'profit on cost, a ratio formula in General format, is a percentage (185.71%), in the picture and in the headline',{pic:outOf(r,'Profit on cost'),out:r.out});
ok(near(outOf(r,'Value on completion').v,G.merged.value)&&near(r.R[1][2],20000*900/0.08/90e6-1),'the value and a what-if on the exit yield are exact',{v:outOf(r,'Value on completion').v,R:r.R});
const upl=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n'));
ok(/Profit on cost 185\.71%/.test(upl),'the upload message says 185.71%, not 1.86%',(upl.match(/Profit on cost [^\n·]*/)||[])[0]);

// 7. defined names: inputs read through names have dependents, the IRR over a named range is exact, a what-if through a name recalculates
await up('pic_names_usd.xlsx');r=await look(['Inputs!B2','Inputs!B3','Inputs!B5'],[[],[['Inputs!B2',28e6]]],['Returns!B1','Returns!B2']);
ok(r.pr.every(z=>z.dep>=1),'the inputs the formulas reach only by name have dependents',r.pr);
ok(near(outOf(r,'Unlevered IRR').v,G.names.irr,1e-7)&&outOf(r,'Unlevered IRR').kind==='pct'&&near(outOf(r,'Net profit').v,G.names.profit)&&near(r.out.unlevered_irr,G.names.irr*100,1e-5),'IRR(CF) over the named range and the profit are the hand figures, the IRR as a percentage',{outs:r.outs,out:r.out});
const irrOf=cf=>{let lo=-0.9,hi=1;for(let i=0;i<300;i++){const m=(lo+hi)/2,v=cf.reduce((s,x,t)=>s+x/(1+m)**t,0);v>0?lo=m:hi=m}return lo};
const cf2=[-28e6,...[1,2,3,4,5].map(y=>2.4e6*1.02**(y-1))];cf2[5]+=2.4e6*1.02**5/0.065;
ok(near(r.R[1][0],irrOf(cf2),1e-7)&&near(r.R[1][1],cf2.reduce((s,x)=>s+x,0)),'a what-if on the price reaches the IRR through the name',r.R);
ok(unusedIn(r).length===0,'no input read only through a name is called unused',unusedIn(r));

// 8. an external link: the cell is in the picture with its error, and the debug names the other workbook as the cause
await up('pic_extlink_usd.xlsx');r=await look(['Inputs!B2'],null,null);
const mr=outOf(r,'Market rent');ok(mr.err==='#REF!'&&r.n.errors===1&&outOf(r,'Area').v===G.extlink.area,'the headline reading another workbook is in the picture as #REF!, the other output as its figure',r.outs);
ok(r.checks.some(t=>/^error .*Market rent.*#REF!.*reads another workbook \(Market\.xlsx\), which this file does not carry/.test(t)),'the debug traces the error to the external link, naming the workbook',r.checks.filter(t=>/Market/.test(t)));
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
