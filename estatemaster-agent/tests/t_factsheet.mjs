// The fact sheet and the portfolio allocation blocks: the model on one page from its own cells, and the models' shares of the
// portfolio by total cost (one currency only; mixed currencies are said, never converted silently). Synthetic fixtures.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true}})}):r.fulfill({status:503,body:'{}'}));
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForTimeout(1500);await p.click('#npCreate');await p.waitForTimeout(3000);return p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return{id:x.id,out:x.out}})};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await up('r33_waha_sar.xlsx');await p.waitForTimeout(2500);
const R=()=>p.evaluate(()=>{RPTS.zz={name:'Fact sheet test',aud:'Investment committee',blocks:['wb_factsheet','portfolio_allocation']};const html=reportDoc('zz');const d=buildDeck('zz',{doc:true});return{html,kinds:d.slides.map(s=>s.kind),donut:d.slides.find(s=>s.kind==='donut')||null}});
let r=await R();
ok(/Fact sheet \(from the workbook\)/.test(r.html)&&/Levered IRR/.test(r.html)&&/15\.34%/.test(r.html)&&/Summary!|Returns!|!/.test(r.html),'the fact sheet lists the workbook’s headline figures with their cells',r.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,300));
ok(/Timeline|Units on|Case the model runs on/.test(r.html),'the fact sheet carries the map entries (timeline, units, case)',r.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').match(/Timeline.{0,80}|Units on.{0,80}/)||'none');
ok(r.donut&&r.donut.labels.length===2,'the demo model and the upload: two shares',JSON.stringify(r.donut&&r.donut.labels));
await up('r34_fund_sar.xlsx');await p.waitForTimeout(2500);r=await R();
const a=await p.evaluate(()=>portfolioAlloc());
ok(!a.err&&a.rows.length===3&&Math.abs(a.rows.reduce((t,r)=>t+r.share,0)-100)<1e-9&&a.cy==='SAR','three SAR models: shares of the total cost add to 100%',JSON.stringify(a).slice(0,200));
ok(r.donut&&r.donut.labels.length===3&&/SAR M/.test(r.donut.unit),'the allocation is a donut slide in the deck',JSON.stringify(r.donut).slice(0,200));
await up('r32_hold_usd.xlsx');await p.waitForTimeout(2500);r=await R();
ok(/different currencies \(.*USD.*\)|different currencies \(.*SAR.*\)/.test(r.html)&&!r.donut,'a USD model added: shares not computed, the currencies named',r.html.replace(/<[^>]+>/g,' ').match(/different currencies[^.]*\./)||'none');
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
