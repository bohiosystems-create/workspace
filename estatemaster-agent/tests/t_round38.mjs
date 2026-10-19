// Round 38: a data-centre development (fixtures/models/r45_datacenter_usd.xlsx, fixtures/gen/gen45.py): the IRRs read from a KEY METRICS
// matrix (Unlevered / Levered rows by EQUITY MULTIPLE · IRR · NET PROFIT columns); after a what-if each IRR is run again on its own cash
// flow (the model map's proved line) and must give the figure the workbook reports; a map pointing at the wrong line is flagged in the
// answer, never passed on; a change to the hold input is not re-run on a line whose end it moves (no AI connected).
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{}})}):r.fulfill({status:503,body:'{}'}));
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r45_datacenter_usd.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');
for(let i=0;i<120;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}
const ask=q=>p.evaluate(async q=>{const st=[];try{const r=await execute(q,'web','Investment Director',async s=>st.push(typeof s==='string'?s:JSON.stringify(s)));return{a:String((r.out&&r.out.plain)||''),st:st.filter(s=>/Cash-flow check/.test(s)).join(' ')}}catch(e){return{a:'THROW '+e.message,st:''}}},q);
{const m=await p.evaluate(()=>{const x=latestExport();return{c:x.cells,cf:x.map.cashflows,pr:x.map.proof}});
  t(m.c.unlevered_irr==='Underwriting!J5'&&m.c.levered_irr==='Underwriting!J6','the IRRs are read from the KEY METRICS matrix: '+JSON.stringify(m.c));
  t(m.pr['cf:levered_irr']==='ok'&&m.pr['cf:unlevered_irr']==='ok'&&m.cf.every(c=>c.ppy===0),'each IRR is proved on its own dated cash flow (XIRR over OFFSET): '+JSON.stringify(m.cf))}
// LibreOffice: exit cap 6.25% → 7% gives unlevered 13.2722473738181%, levered 20.2066908606734%
{const r=await ask('What if the exit cap rate is 7%?');
  t(/Unlevered IRR: 15\.42% → \*\*13\.27%\*\*/.test(r.a)&&/Levered IRR: 25\.08% → \*\*20\.21%\*\*/.test(r.a),'an exit-cap what-if moves both IRRs as LibreOffice: '+r.a.replace(/\s+/g,' ').slice(0,200));
  t(/Levered IRR reproduced by its own cash flow \(Underwriting!S112:CY112: 20\.21%\)/.test(r.st)&&/Unlevered IRR reproduced by its own cash flow \(Underwriting!S104:CY104: 13\.27%\)/.test(r.st)&&!/⚠/.test(r.a),'after the change each IRR is reproduced by its own cash flow: '+r.st)}
{const r=await ask('What if the sale month is 60?');t(/Sale Month: Underwriting!E8 72 → 60/.test(r.a)&&!r.st,'a change to the hold input is not re-run on a line whose end it moves: '+(r.st||r.a.replace(/\s+/g,' ').slice(0,120)))}
// the map pointing the levered IRR at the unlevered line: the answer says the figure is not reproduced
await p.evaluate(()=>{const c=latestExport().map.cashflows.find(c=>c.irr==='levered_irr');c.row=c.row.replace(/112/g,'104')});
{const r=await ask('What if the exit cap rate is 7.25%?');t(/Levered IRR NOT reproduced/.test(r.st)&&/⚠ Levered IRR: its own cash flow \(Underwriting!S104:CY104\) gives [\d.]+% after the change, the workbook reports [\d.]+%/.test(r.a),'an IRR its own line does not give is flagged in the answer: '+r.a.replace(/\s+/g,' ').slice(0,220))}
t(!errs.length,'no page errors: '+errs.join(' | '));console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
