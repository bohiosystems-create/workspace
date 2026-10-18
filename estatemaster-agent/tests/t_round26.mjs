// Round 26: INDIRECT picking a scenario sheet by name, sheet names in Arabic written without quotes, array constants inside CHOOSE
// and SUMPRODUCT, INDEX(x,0), a two-currency model's headline in its own currency, reviewers told which cells a follow-up builds on,
// the AI names the projects compared, a figure asked as “its exit year”.
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

const eng=async m=>{await up(m);return p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);return{pct:e.pct,ok:e.ok,iter:e.iter,out:x.out,found:x.found}})};
let e=await eng('r26_storage_usd.xlsx');ok(e.ok&&e.pct===100&&e.iter===0,'INDIRECT(Inputs!B3&"!B4") picks the scenario sheet; MATCH(TRUE,INDEX(row>=0.85,0),0): 100%, no false loops',JSON.stringify(e).slice(0,160));
let a=await test('run the downside case',{changes:[{label:'Scenario sheet',cell:'Inputs!B3',kind:'to',value:'Downside',sure:true}]});ok(/Base → Downside/.test(a)&&/Unlevered IRR: 11\.51% → /.test(a),'switching the scenario sheet recalculates through INDIRECT',a.slice(0,200));
e=await eng('r26_riyadh_sar.xlsx');ok(e.ok&&e.pct===100,'Arabic sheet names written without quotes (المدخلات!$B$3): 100%',JSON.stringify(e).slice(0,160));
a=await test('margin 300bps',{changes:[{label:'Margin (bps)',cell:"'المدخلات'!B11",kind:'to',value:300,sure:true}]});ok(/275 → 300/.test(a)&&/Finance rate: 8\.20% → 8\.45%/.test(a),'a margin in bps moves the finance rate by 25 bps',a.slice(0,300));
e=await eng('r26_care_gbp.xlsx');ok(e.ok&&e.pct===100,'array constants in SUMPRODUCT({0.45,0.35,0.2},CHOOSE({1,2,3},…)), defined names, FLOOR and CEILING: 100%',JSON.stringify(e).slice(0,160));
a=await p.evaluate(async()=>{const o=await handle('what occupancy gets the IRR to 9%?','wa','analyst',{k:'xsolve',assumption:'Occupancy',cell:'Assumptions!B7',metric:'Unlevered IRR',target:9,text:'what occupancy gets the IRR to 9%?'});return o.plain});
ok(/closest to 9\.00%/.test(a)&&/8\.90%/.test(a)&&!/Solved exactly/.test(a),'a goal seek on a model that steps says the target is not reached exactly (88.33% gives 8.90%)',a.slice(0,260));
e=await eng('r26_breaker_aed.xlsx');ok(e.ok&&e.pct===100,'a circular loan with a circuit breaker converges to the fixed point',JSON.stringify(e).slice(0,160));
a=await test('switch the circuit breaker off',{changes:[{label:'Circuit breaker (1 = interest on, 0 = off)',cell:'Inputs!B3',kind:'to',value:0,sure:true}]});ok(/Inputs!B3 1 → 0\b/.test(a)&&/Levered IRR: 21\.14% → 27\.99%/.test(a),'circuit breaker off: no interest, IRR as computed independently (27.99%)',a.slice(0,240));
e=await eng('r26_fx_eurusd.xlsx');ok(/USD/.test(e.found.levered_irr||'')&&/USD/.test(e.found.net_profit||''),'a EUR asset in a USD fund: the headline IRR and profit are the USD lines',JSON.stringify(e.found));
const rv=await p.evaluate(async()=>{let user='';const real=window.callOne;window.callOne=async(pp,m,sys,msgs)=>{if(/You audit an exact recalculation/.test(sys))user=msgs[0].content;return{text:'{"verdict":"agree","why":"ok","results":[]}'}};
  try{const x=latestExport();await xcEngine(x);const xr={x,changes:[{text:'and the hedge cost 1.5% on top'}],desc:['on top of V2'],metrics:[],sets:[['Inputs!B10',1.05],['Inputs!B11',0.015]],chainSets:['Inputs!B10'],chainOf:'EX-9·V2'};await xcReview(xr,async()=>{},{quiet:true})}catch(err){}window.callOne=real;return user});
ok(/Each cell set[^\n]*Inputs!B11/.test(rv)&&!/Each cell set[^\n]*Inputs!B10/.test(rv)&&/Already set in version EX-9·V2[^\n]*Inputs!B10/.test(rv),'reviewers see which cells the follow-up builds on, apart from the change asked',rv.slice(rv.indexOf('Each cell'),rv.indexOf('Each cell')+300));
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain},[q,input]);
a=await ask('compare the storage and the care home on IRR',{metric:'levered_irr',agg:'max',projects:['HARBORVIEW SELF STORAGE – LEASE-UP, MONTHLY (USD)','BIRCHWOOD GRANGE – SENIOR LIVING (GBP)']});
ok(/HARBORVIEW/.test(a)&&/BIRCHWOOD/.test(a)&&!/LUMI|CREEK|NAKHEEL/.test(a.split('Not in')[0]),'a comparison uses the projects the AI names (“the care home” is Birchwood Grange)',a.slice(0,300));
a=await ask('finance rate of the Riyadh project and its exit year',{asked:'finance rate',agg:'table'});ok(/Finance rate 8\.20%/.test(a)&&/Exit year 6\b/.test(a),'both figures: the finance rate and “its exit year”',a.slice(0,500));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
