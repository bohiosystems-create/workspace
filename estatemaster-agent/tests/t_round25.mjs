// Round 25: VALUE() of a number typed as text ("1,250"), percentages typed as whole numbers in a 0.0"%" format, a cost typed as text,
// a text scenario switch beside a note, a value in $000s, results in their own currency and decimals (¥, $000s, 0.0), labels without
// their value, a portfolio question naming two figures in another word order, an area is not money.
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

await up('r25_hmo_gbp.xlsx');
let e=await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return XC.info[x.id]});ok(e.ok&&e.pct===100,'VALUE("1,250") as Excel reads it: the engine reproduces 100%',JSON.stringify(e).slice(0,120));
let a=await test('mortgage rate 6%',{changes:[{label:'Mortgage rate',cell:'Appraisal!B12',kind:'to',value:6,sure:true}]});const irr=t=>{const m=t.match(/Equity IRR: ([\d.]+)% → ([\d.]+)%/);return m?[+m[1],+m[2]]:null};
let r=irr(a);ok(/Appraisal!B12 5\.4%? → 6%?/.test(a)&&!/540|0\.06/.test(a)&&r&&r[1]<r[0],'a rate typed as 5.4 in a 0.00"%" cell goes to 6, and a dearer mortgage lowers the IRR',a.slice(0,240));
a=await test('rent growth 5%',{changes:[{label:'Rent growth a year',cell:'Appraisal!B7',kind:'to',value:5,sure:true}]});r=irr(a);ok(/Appraisal!B7 4%? → 5%?/.test(a)&&r&&r[1]>r[0],'growth typed as 4 goes to 5, and the IRR rises',a.slice(0,200));
a=await test('conversion £1,500 a room',{changes:[{label:'Conversion cost per room (£)',cell:'Appraisal!B9',kind:'to',value:1500,sure:true}]});r=irr(a);ok(/1,250 → 1,500/.test(a)&&r&&r[1]<r[0],'a cost typed as text (“1,250”) is changed and kept as text',a.slice(0,220));
await up('r25_logi_eur.xlsx');a=await test('run the downside scenario',{changes:[{label:'Scenario',cell:'Inputs!B3',kind:'to',value:'Downside',sure:true}]});
ok(/Inputs!B3 Base → Downside/.test(a)&&/Unlevered IRR: 14\.54% → 9\.84%/.test(a),'a text scenario switch with a note beside it is an input the AI can set',a.slice(0,220));
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain},[q,input]);
await up('r25_mf_usd.xlsx');a=await test('renovation cost $18k a unit',{changes:[{label:'Renovation cost per unit ($000s)',cell:'Assumptions!B7',kind:'to',value:18000,sure:true}]});
ok(/Assumptions!B7 14\.5 → 18\b/.test(a)&&!/Which one/.test(a),'“$18k” on a line in $000s is 18 there, without a question',a.slice(0,200));
a=await test('rents $1,950 a unit',{changes:[{label:'Average rent per unit a month ($)',cell:'Assumptions!B4',kind:'to',value:1950,sure:true}]});
ok(/GP promote \(\$000s\): USD 9\.05M → USD 12\.84M/.test(a)&&!/9,054\.288/.test(a),'a result in $000s is shown as money (USD 9.05M), not 9,054.288',a.slice(0,400));
await up('r25_hotel_jpy.xlsx');a=await test('ADR ¥20,000',{changes:[{label:'ADR, year 1 (¥)',cell:'Inputs!B5',kind:'to',value:20000,sure:true}]});
ok(/RevPAR, year 3 \(¥\): ¥16,306 → ¥17,623/.test(a)&&!/\(¥14,014/.test(a),'a yen figure is shown as ¥16,306, and a label does not carry its value',a.slice(0,300));
a=await ask('WAULT and the North area of the logistics portfolio',{asked:'WAULT',agg:'table'});
ok(/WAULT \(years\) 4\.0/.test(a)&&/Area in the North \(sqm\) 103,000/.test(a)&&!/EUR 103,000/.test(a),'both figures, the second named in another word order; an area is not money',a.slice(0,500));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
