// The phrases an investment manager types, on ten synthetic models of different kinds (fixtures/models/desk_*.xlsx, made by
// fixtures/gen/*.py): each must change exactly the line meant, or ask. Guards the misreads found at the desk: a plural that
// widened a change to a whole column, a unit phrase that moved rent growth to 2000%, “murabaha at 7%” on the LTC, a header cell
// taken for the option switch, a bps margin moved by 0.5, the presale deposit taken for the share presold.
import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const C={condo_usd:[['presales only 35%','Presold before construction: Assumptions!B7 55% → 35%'],['hard costs $500 a foot','Hard cost per gsf: Assumptions!B3 465 → 500']],
 groundlease_qar:[['starting rent 5.8m','Initial ground rent (QAR p.a.): Lease!B3 6,200,000 → 5,800,000'],['reviews every 3 years instead','Review every (years): Lease!B5 5 → 3']],
 masterplan_aed:[['build costs up 8% across all phases','Build Cost (Aed/Sqm) (all 3 rows): Phasing!F4…F6 (3 cells) 10,400 → 11,232'],['push phase 2 back a year','Phase 2 · Start Year: Phasing!C5 3 → 4'],['drop phase 3','Phase 3 · Include (1/0): Phasing!G6 1 → 0']],
 conversion_gbp:[['planning odds are more like 50/50','Probability of planning consent: Inputs!B4 65% → 50%'],['flats at 410k','Average flat price: Inputs!B6 395,000 → 410,000']],
 refi_chf:[['margin 50 bps wider','Credit margin (bps): Assumptions!B7 165 → 215'],['margin to 200 bps','Credit margin (bps): Assumptions!B7 165 → 200']],
 tower_options_sar:[['murabaha at 7%','Profit rate · Option A: Options!C17 6.5% → 7%'],['switch to option B','Selected option (A or B): Options!C3 A → B'],['haircut the sale price by 7.5%','Residential sale price · Option A: Options!C7 14,200 → 13,135']],
 office_refurb_gbp:[['ERVs 5% lower','Erv (£/Sq Ft) (all 5 rows)'],['hold for 8 years','HORIZON']],
 btr_usd:[['rents $2,000 a home','Rent per home per month: Inputs!B4 2,150 → 2,000'],['rent growth 2%','Rent growth: Inputs!B16 3.0% → 2.0%']],
 student_gbp:[['weekly rents £10 lower','Weekly rent · Base: Assumptions!C3 215 → 205'],['what if we refi a year later?','Refinance year · Base: Assumptions!C13 3 → 4'],['run the downside case','Active case (1 = Base, 2 = Downside, 3 = Upside): Control!C3 1 → 2'],['opex per bed up 15%','Operating costs · Base: Assumptions!C7 2,900 → 3,335']],
 fund_eur:[['carry at 15%','Carried interest: Fund!B15 20% → 15%'],['Lyon equity goes to 50m','Lyon DC · Equity In (Eur M): Assets!B4 42 → 50'],['Milan exit slips to year 6','Milan last-mile · Exit Year: Assets!D6 5 → 6'],['Rotterdam only exits at 1.6x','Rotterdam XXL · Exit Multiple On Equity: Assets!E5 1.8 → 1.6']]};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}):r.fulfill({status:503,body:'{}'}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
for(const [m,qs] of Object.entries(C)){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'desk_'+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);
  for(const [q,want] of qs){const r=await p.evaluate(async q=>{try{const res=await aiCrossCheck([{text:q}],async()=>{},undefined,{quiet:true});return (res.horizon?'HORIZON ':'')+res.desc.join(' ; ')}catch(e){return 'ASK/ERR: '+String(e.message).slice(0,160)}},q);
    ok(r.includes(want),`${m} · “${q}” → ${r.slice(0,150)}`)}}
ok(!errs.length,'no page errors: '+errs.join(' | ').slice(0,200));console.log(`\n${pass} pass, ${fail} fail`);await b.close();
