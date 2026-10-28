// The Adel demo model (fixtures/models/demo_nakheel_adel.xlsx, gen/gen_demo.py --adel: a monthly mixed-use development with Base / Upside /
// Downside columns, a hold counted from completion, a Murabaha with a DSCR covenant) run through the tools of the Adel demo script, each figure
// against LibreOffice (golden/demo_adel.json). Holds three fixes found on it:
//  - a case table's heading 50 rows above its last lines still makes those lines case lines (SAIBOR · Base), so a grid moves the live case
//    instead of asking how a "period" line should move;
//  - "exit in year N" on a hold counted after completion sells in year N (the hold set to N − 2.5 years), not N + 2.5;
//  - a result the model repeats on two sheets (Dashboard and Returns) is listed once in a what-if.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/demo_nakheel_adel.xlsx',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/demo_adel.json',import.meta.url),'utf8'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,400):''))};
const pct=v=>(v*100).toFixed(2)+'%';
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(2500);
const up=await p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);await xcCacheMore(x);return{pct:e&&e.pct,lev:x.out.levered_irr}});
ok(up.pct===100&&Math.abs(up.lev-G.base.lev*100)<1e-3,'the workbook uploads and the engine reproduces Excel’s own results',up);
const run=(q,tool,args)=>p.evaluate(async([q,tool,args])=>{window.LASTQ=q;window.ASKED=q;try{const it=tool==='estimate'?{k:'estimate',text:args}:toolIntent0(tool,args);const o=await handle(q,'web','Investment Director',it);return String((o&&o.plain)||'')}catch(e){return 'THROW '+e.message}},[q,tool,args]);

// 1. every line of the case table is a case line, however far below its heading (Live · Base · Upside · Downside on row 7, SAIBOR on row 57)
const cs=await p.evaluate(()=>{const x=latestExport();return['C18','C51','C56','C57','C61'].map(c=>((x.inputs||[]).find(i=>String(i.cell).replace(/'/g,'')==='Inputs!'+c)||{}).label||'')});
ok(cs.every(l=>/· Base$/.test(l)),'lines 50 rows below the case heading are read as the Base case column',cs);

// 2. the grid moves the live case of SAIBOR and construction cost; its corners are LibreOffice's
let a=await run('Give me a grid of levered IRR: SAIBOR from 4.5% to 6.5% against construction cost from -10% to +10%.','sensitivity_grid',{x:{label:'SAIBOR',cell:'Inputs!C57',values:[0.045,0.05,0.055,0.06,0.065]},y:{label:'Construction cost (SAR per sqm GFA)',cell:'Inputs!C18',values:[5580,5890,6200,6510,6820]},metric:'levered_irr'});
ok(!/typed period by period/.test(a)&&a.includes(`from ${pct(G.g_hi.lev)} to ${pct(G.g_lo.lev)}`),'the SAIBOR × construction cost grid runs without asking, its corners as LibreOffice gives them',a.slice(0,240));

// 3. exit years on a hold counted from completion: year N is a sale in year N
a=await run('What is the levered IRR if we exit in year 5, 6, 7 or 8?','hold_sell_curve',{points:[5,6,7,8]});
const row=y=>(a.match(new RegExp(`\\n\\| ${y}( \\(model\\))? \\| ([^|]+)\\|`))||[])[2]||'';
ok(row(5).trim()===pct(G.exit5.lev)&&row(8).trim()===pct(G.exit8.lev)&&/\| 6 \(model\) \| 14\.11%/.test(a),'exit in year 5 and year 8 are LibreOffice’s figures for a hold of 30 and 66 months, year 6 is the model as it stands',{y5:row(5),y8:row(8)});
ok(/counts from year 2\.5/.test(a),'the answer says the hold counts from completion (year 2.5)',a.slice(-400));

// 4. the what-ifs of the script, against LibreOffice, each result listed once
a=await run('What happens to the returns if construction costs rise 10%?','estimate','Construction cost +10% [cells: Inputs!C18]');
ok(a.includes(`Levered IRR: 14.11% → **${pct(G.cost10.lev)}**`)&&a.includes(`Minimum DSCR`)&&a.includes(`→ **${G.cost10.mindscr.toFixed(2)}x**`),'construction cost +10%: the levered IRR and the minimum DSCR as LibreOffice gives them',a.slice(0,300));
const lines=a.split('\n').filter(l=>/→/.test(l)).map(l=>l.replace(/\s*·\s*(Dashboard|Returns)\b/,'').replace(/:.*/,''));
ok(new Set(lines).size===lines.length,'no result is listed twice (the Dashboard repeating the Returns sheet)',lines.filter((l,i)=>lines.indexOf(l)!==i));
a=await run('After that change, is the 1.25x DSCR covenant breached?','line_over_time',{lines:['DSCR'],covenant:1.25,direction:'min'});
ok(/Under EX-\d+·V\d/.test(a)&&/breaches the minimum of 1\.25x/.test(a)&&a.includes(`(worst ${G.cost10.mindscr.toFixed(2)}x)`),'“after that change”: the covenant is read on the what-if, and it breaches',a.slice(0,260));
a=await run('What if construction takes 6 months longer?','estimate','Construction period +6 months [cells: Inputs!C11]');
ok(a.includes(`→ **${pct(G.build36.lev)}**`),'construction 6 months longer: the levered IRR as LibreOffice gives it',a.slice(0,200));
a=await run('How far can the apartment price fall before the levered IRR drops to 12%?','solve_for_target',{assumption:'Average price per apartment',cell:'Inputs!C24',metric:'levered_irr',target:12});
ok(/\*\*1,587,384\.93\*\*/.test(a)&&Math.abs(G.price_gs.lev-0.12)<1e-6,'the goal seek on the apartment price: 1,587,385, where LibreOffice gives exactly 12.00%',a.slice(0,200));
a=await run('Switch the model to the downside case: what happens to the levered IRR and the minimum DSCR?','estimate','Case running 3 [cells: Inputs!C5]');
ok(a.includes(`→ **${pct(G.downside.lev)}**`)&&a.includes(`→ **${G.downside.mindscr.toFixed(2)}x**`),'the downside case: the levered IRR and the minimum DSCR as LibreOffice gives them',a.slice(0,300));
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
