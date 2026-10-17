// Round 23: Excel tables and LET, aggregates over computed OFFSET windows, random draws, results shown in their cell's own format,
// and portfolio answers that find the figure the question names. Models: tests/fixtures/models/r23_* (gen23.py).
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));let READ=null;
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||'');const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify(READ));if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000)};
const eng=()=>p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);await xcCacheMore(x);return{ok:e.ok,pct:e.pct,note:xcFnNote(x),more:(x.more||[]).map(r=>({l:r.label,v:r.v,s:xcFmtX(r,r.v),rand:!!r.rand}))}});
const test=async(q,read)=>{READ=read;return p.evaluate(async q=>{try{const r=await aiCrossCheck([{text:q}],async()=>{},undefined,{quiet:true});return testPlain(r)}catch(e){return 'ERR '+e.message}},q)};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

await up('r23_modern_usd.xlsx');let e=await eng();
ok(e.ok&&e.pct===100,'an Excel 365 model with a table (UnitMix[Units]) and LET is reproduced 100%',JSON.stringify(e).slice(0,200));
ok(e.more.some(r=>r.l==='Largest unit type'&&r.v==='PH')&&e.more.some(r=>/floors 10/.test(r.l)&&r.v===48),'XLOOKUP and FILTER on the table give Excel’s results',JSON.stringify(e.more).slice(0,300));
ok(e.more.some(r=>/Sellable area/.test(r.l)&&/^282,500$/.test(r.s)),'an area in sq ft is a number, not money',JSON.stringify(e.more.find(r=>/Sellable/.test(r.l))));
let a=await test('80 studios',{changes:[{label:'Studio · Units',cell:'Units!B2',kind:'to',value:80,sure:true}]});ok(/Gross revenue[^:]*: USD 274\.16M → \*\*USD 283\.10M/.test(a),'a change in a table row moves the structured-reference totals',a.slice(0,240));
await up('r23_glease_gbp.xlsx');e=await eng();ok(e.ok&&e.pct===100,'NPV over an OFFSET window of computed size is reproduced (leasehold value)',JSON.stringify(e).slice(0,160));
ok(e.more.some(r=>r.l==='Last rent date'&&r.s==='2124-12-25'),'a date result is shown as a date (2124-12-25), past 2100',JSON.stringify(e.more.find(r=>/date/.test(r.l))));
a=await test('review every 3 years',{changes:[{label:'Review every (years)',cell:'Inputs!B9',kind:'to',value:3,sure:true}]});ok(!/last period/.test(a),'a review frequency is not a timing change: no timing warning',a.slice(0,200));
a=await test('value the leasehold at year 25',{changes:[{label:'Leasehold valuation year',cell:'Inputs!B12',kind:'to',value:25,sure:true}]});ok(/Leasehold value at the valuation year \(£\): GBP 129\.68M → \*\*GBP 196\.62M/.test(a),'the leasehold value moves with its valuation year (Excel’s figure)',a.slice(0,260));
await up('r23_berlin_eur.xlsx');a=await test('rent cap 10% over three years',{changes:[{label:'Rent cap (max increase over 3 years)',cell:'Inputs!B8',kind:'to',value:10,sure:true}]});
ok(/Reversion at exit: 2\.08% → \*\*13\.\d\d%/.test(a),'a result in a % cell is shown as a percentage in a what-if',a.match(/Reversion[^\n]*/)?.[0]);
await up('r23_risk_sar.xlsx');e=await eng();ok(e.ok&&e.pct===100&&/Random draws: RAND \(Risk!B2\)/.test(e.note),'RAND cells are left out of the trust check and named as random draws',JSON.stringify(e).slice(0,300));
ok(e.more.filter(r=>/Simulated|Draw|Overrun|Random/.test(r.l)).every(r=>r.rand),'every result depending on RAND is marked as a random draw',JSON.stringify(e.more.map(r=>r.l+':'+r.rand)));
a=await test('overrun volatility 20%',{changes:[{label:'Cost overrun volatility (risk sheet)',cell:'Inputs!B8',kind:'to',value:20,sure:true}]});ok(!/Overrun:/.test(a)&&/random draws/i.test(a),'a random draw is never shown as a result that moved',a.slice(0,300));
const res=await p.evaluate(async()=>{const o=await handle("what's the simulated profit?",'wa','analyst',{k:'emresults'});return o.plain});ok(/Simulated profit[^;]*random draw/.test(res),'the results answer marks a random draw',res.match(/Simulated profit[^;]*/)?.[0]);
// the portfolio finds the figure the question names (freeholder value, not the yield on it), and both of two
const pa=await p.evaluate(async()=>{const o=await handle('freehold value and leasehold value of the ground lease','wa','analyst',{k:'projects',text:'freehold value and leasehold value of the ground lease',byAI:'x',asked:'freehold value',agg:'table'});return o.plain});
ok(/Freeholder value \(XNPV[^)]*\) GBP 28\.81M/.test(pa)&&/Leasehold value at the valuation year \(£\) GBP 129\.68M/.test(pa)&&!/Initial yield/.test(pa),'portfolio: the freeholder value and the leasehold value, not the yield on freehold value',pa.slice(0,400));
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}console.log('\n'+pass+' pass, '+fail+' fail');await b.close();
