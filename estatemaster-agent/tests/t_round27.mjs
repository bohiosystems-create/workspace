// Round 27: funds and dashboards with no IRR line are projects (mutual fund, REIT, open-ended fund, a JV dashboard with values left of
// their labels); kCHF and ₹ crore lines take a figure in full units at their own scale; a level 1,000 times off is asked; the AI's label
// must match the cell it names; INDIRECT over a text-built address; a date moved by calendar months; the daily report in each project's
// currency and Riyadh benchmarks only for Saudi models; short acronyms (DPI) match only themselves.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));let READ=null;
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||'');const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify(READ));if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000)};
const test=async(q,read)=>{READ=read;return p.evaluate(async q=>{try{const r=await aiCrossCheck([{text:q}],async()=>{},undefined,{quiet:true});return testPlain(r).replace(/\*+/g,'')}catch(e){return 'ERR '+e.message}},q)};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

const up2=async m=>{await up(m);return p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);await xcCacheMore(x);return{name:PROJ.name,pct:e&&e.pct,ccy:CCY(),more:(x.more||[]).map(r=>r.label),out:x.out}})};
for(const [m,want] of [['r27_jv_eur.xlsx',/Capital partner multiple/],['r27_mutual_usd.xlsx',/Total expense ratio/],['r27_reit_sar.xlsx',/Dividend yield on the unit price/],['r27_openend_eur.xlsx',/Quarters gated/]]){
  const e=await up2(m);ok(e.pct===100&&!/PUNE|ZURICH/.test(e.name)&&e.more.some(l=>want.test(l)),`${m}: a model with no IRR line is its own project, its results read`,JSON.stringify({name:e.name,pct:e.pct,more:e.more.slice(0,4)}))}
let e=await up2('r27_zurich_chf.xlsx');ok(e.ccy==='CHF'&&Math.abs(e.out.net_profit-38160830.85)<5,'kCHF: the currency is CHF and the net profit 38.16M, not 38,161',JSON.stringify({ccy:e.ccy,np:e.out.net_profit}));
let a=await test('rent CHF 3.1m',{changes:[{label:'Rent a year (kCHF)',cell:'Inputs!B4',kind:'to',value:3100000,sure:true}]});ok(/Inputs!B4 2,950 → 3,100\b/.test(a)&&!/10055|3,100,000/.test(a),'“CHF 3.1m” on a line in kCHF is 3,100',a.slice(0,200));
ok(!/\(38'161\)/.test(a),'a label does not carry its value written with apostrophes',a.slice(a.indexOf('Net profit'),a.indexOf('Net profit')+60));
await up2('r27_pune_inr.xlsx');a=await test('land ₹180 crore',{changes:[{label:'Land (₹ crore)',cell:'Inputs!B7',kind:'to',value:1800000000,sure:true}]});ok(/Inputs!B7 165 → 180\b/.test(a),'“₹180 crore” on a line in crore is 180',a.slice(0,200));
a=await test('management fee 1%',{changes:[{label:'Management fee a year',cell:'Inputs!B7',kind:'to',value:1,sure:true}]});ok(!/Inputs!B7 165 → 1\b/.test(a),'the AI naming a cell whose label is another line (“Management fee” at Land) is not set',a.slice(0,200));
a=await test('build cost 4,120,000,000',{changes:[{label:'Construction cost (₹ crore)',cell:'Inputs!B6',kind:'to',value:4120000000,sure:false}]});ok(!/Exact recalculation/.test(a)&&!/Inputs!B6 412 → 4,120,000,000/.test(a),'a level 1,000 times the cell is never set as it stands',a.slice(0,200));
e=await up2('r27_landbank_sar.xlsx');ok(e.pct===100,'INDIRECT("\'Cash Flow\'!C"&a&":C"&b) is an OFFSET window: 100%',JSON.stringify(e).slice(0,120));
a=await test('sell over years 2 to 8',{changes:[{label:'Last year of sales',cell:'Inputs!B8',kind:'to',value:8,sure:true}]});ok(/Sales in the selling window \(SAR\): SAR 518\.19M → /.test(a),'moving the window moves the INDIRECT sum',a.slice(0,400));
await up2('r27_park_usd.xlsx');a=await test('fit-out runs a month longer',{changes:[{label:'Fit-out end',cell:'Inputs!B9',kind:'months',value:1,sure:true}]});ok(/2027-05-28 → 2027-06-28/.test(a)&&/Fit-out working days: 85 → 106/.test(a),'a date moved by a month is the same day next month; the working days follow',a.slice(0,300));
await up2('r27_closed_eur.xlsx');
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain},[q,input]);
a=await ask('TVPI and DPI of the closed-ended fund',{asked:'TVPI',agg:'table',projects:['MERIDIAN REAL ESTATE FUND III – CLOSED-ENDED (EUR)']});ok(/TVPI at year 10 1\.78x/.test(a)&&/DPI at year 5 0\.44x/.test(a)&&!/Premium or discount|WALE/.test(a),'“DPI” matches the DPI line only; both figures answered',a.slice(0,400));
const d=await p.evaluate(()=>{const t=String(dailyLocalHtml()).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');return{z:/SEEFELD[^·]*market[^·]*aggressive/.test(t)||/Exit cap rate \/ yield: 3\.85% market/.test(t),narjis:(t.match(/Net profit [A-Z]{3} [\d.,]+M on a total cost of [A-Z]{3} [\d.,]+M/g)||[])}});
ok(!d.z,'a Zurich office is not compared with the Riyadh market',JSON.stringify(d));ok(d.narjis.length>=1&&d.narjis.every(s=>/SAR 129/.test(s)),'the daily report gives each project’s figures in its own currency',JSON.stringify(d.narjis));
const d2=await p.evaluate(()=>{const t=String(dailyLocalHtml()).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');const h=t.match(/Headline figures · ([^·]+?) · EstateMaster export (EX-\d+) (?:Levered|Project) IRR ([\d.]+)%/);const x=latestExport();const hx=h&&EXPORTS.find(e=>e.id===h[2]);return{hok:!!h&&!!hx&&Math.abs((hx.out.levered_irr??hx.out.unlevered_irr)-(+h[3]))<0.06&&PROJECTS[hx.proj].name.trim()===h[1].trim(),tab:/Al Narjis Mixed-Use EX-001[^|]{0,80}SAR 129\.67M/.test(t)&&!/(EUR|CHF|USD) 129\.67M/.test(t),head:h&&[h[1],h[2]],irr:x.out.levered_irr,id:x.id}});
ok(d2.tab,'the all-models table gives the demo project in SAR, whatever project is open',JSON.stringify(d2));
ok(d2.hok,'the daily headline names the project and export its figures come from',JSON.stringify(d2));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
