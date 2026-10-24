// The wall between the demo model and an uploaded workbook, as a property over every section and every report: with an uploaded
// model open, nothing shown may move when the demo model's assumptions move. Each section is called directly (any path: report, deck,
// email, translation), and each report is rendered whole. Two sessions: the demo model as shipped, and the demo model moved before any
// upload (so a copy of demo data made when a project is created is caught too); every view of each uploaded project must be the same in
// both. The demo project itself is the control: its views must differ.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const errs=[];
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,500):''))};

const FILES=['r39_fund_waterfall_eur.xlsx','r41_hotel_aed.xlsx','r43_btr_sar.xlsx'];
async function session(moved){const p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  // the demo model moved: every number of the replica's base, register, sales and actuals 9% up, the sandbox moved, results recalculated
  if(moved)await p.evaluate(()=>{for(const k of Object.keys(BASE))if(typeof BASE[k]==='number')BASE[k]*=1.09;for(const l of REG)if(typeof l.base==='number')l.base*=1.09;
    for(const o of [SOLD,ACT])for(const r of Object.values(o))for(const f of Object.keys(r))if(typeof r[f]==='number')r[f]*=1.09;baseRes=run({});S=Object.fromEntries(Object.keys(VARS).map(k=>[k,VARS[k].kind==='pct'?7:0.5]));
    try{stressRes=computeStress();computeTornado();computeHeadroom()}catch(e){}LASTX=snapshot()});
  const views=()=>p.evaluate(()=>{const strip=h=>{const d=document.createElement('div');d.innerHTML=h;return d.innerText.replace(/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}|\d{1,2} \w{3} \d{4},? \d{2}:\d{2}|\d{2}:\d{2}/g,'').replace(/\s+/g,' ')};const out={};
    for(const k of Object.keys(BLOCKS)){if(BLOCK_SCOPE[k]==='portfolio')continue;try{out['block:'+k]=strip(BLOCKS[k].fn())}catch(e){out['block:'+k]='ERR '+e.message}}
    for(const id of Object.keys(RPTS)){if(id==='daily')continue;try{RSEL=id;renderReport();out['report:'+id]=strip(document.querySelector('#report').innerHTML)}catch(e){out['report:'+id]='ERR '+e.message}}return out});
  const res={demo:await views()};
  for(const f of FILES){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:90000}).catch(()=>{});await p.click('#npCreate');
    await p.waitForFunction(()=>{const x=latestExport();return x&&x.src==='file'&&x.map},null,{timeout:120000}).catch(()=>{});await p.waitForTimeout(800);
    await p.evaluate(async()=>{const x=latestExport();try{await xcEngine(x);await xcCacheMore(x)}catch(e){}});res[f]=await views()}
  await p.close();return res}
const A=await session(false),B=await session(true);
const diff=(x,y)=>Object.keys(x).filter(k=>x[k]!==y[k]);
const dd=diff(A.demo,B.demo);ok(dd.length>=5,`control: the demo project's own views follow the demo model (${dd.length} of them differ)`,dd.slice(0,6));
for(const f of FILES){const d=diff(A[f],B[f]);ok(!d.length,`${f}: no section and no report differs when the demo model differs (${Object.keys(A[f]).length} views)`,d.slice(0,10).map(k=>k+': '+String(B[f][k]).slice(0,140)));
  const leak=Object.entries(B[f]).filter(([k,v])=>/Murabaha facility|Al Narjis|Jadwa co-invest/.test(v)).map(([k])=>k);ok(!leak.length,`${f}: no view names the demo project's facility, partners or plot`,leak.slice(0,10))}
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
