// Round 37: a model with no IRR at all (an open-ended fund reported by NAV: fixtures/models/r44_nav_fund_sar.xlsx, fixtures/gen/gen44.py).
// No IRR is made up from "Total return"; asked for one, the answer says the model has none and names what it reports; a what-if moves
// NAV per unit and total return exactly as LibreOffice does (no AI connected).
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{}})}):r.fulfill({status:503,body:'{}'}));
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r44_nav_fund_sar.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(4000);
const ask=q=>p.evaluate(async q=>{window.LASTQ=q;try{const r=await execute(q,'web','Investment Director',async()=>{});return String(r.out.plain||'')}catch(e){return 'THROW '+e.message}},q);
{const c=await p.evaluate(()=>latestExport().cells);t(!c.levered_irr&&!c.unlevered_irr&&!c.lp_irr,'no IRR is read from a model that has none: '+JSON.stringify(c))}
{const a=await ask('What is the levered IRR?');t(/model has no IRR/.test(a)&&/NAV per unit/.test(a)&&!/levered IRR[^.]*\d+\.\d+%/i.test(a),'asked for the levered IRR, the answer says the model has none and names what it reports: '+a.slice(0,200))}
// LibreOffice: Riyadh logistics park cap rate 6.75% → 7.5% gives NAV per unit 11.2907033706456, total return 9.52133602137017%
{const a=await ask('What happens to NAV per unit if the Riyadh logistics park cap rate goes to 7.5%?');
  t(/NAV per unit \(year 1\): 11\.8221 → \*\*11\.2907\*\*/.test(a)&&/Total return \(a year\): 9\.18% → \*\*9\.52%\*\*/.test(a),'a cap-rate what-if moves NAV per unit and total return as LibreOffice: '+a.replace(/\s+/g,' ').slice(0,260))}
{const r=await p.evaluate(async()=>{const x=latestExport();const [v]=await xcQ(()=>xcCall({op:'run',runs:[[['Portfolio!C11',800000000]]],read:["'Fund Report'!C5","'Fund Report'!C9","'Fund Report'!C12"]}));return v});
  t(Math.abs(r[0]-10.5625449322933)<1e-6&&Math.abs(r[1]-0.0957397684149582)<1e-9&&Math.abs(r[2]/1350626559.45539-1)<1e-9,'more fund debt: NAV per unit, total return and NAV exactly as LibreOffice: '+r.join(', '))}
t(!errs.length,'no page errors: '+errs.join(' | '));console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
