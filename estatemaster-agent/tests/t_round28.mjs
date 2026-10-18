// Round 28: the AI's named figure ("net IRR") wins over other words in the question; a sale value is not a timing input; a table's
// heading row is not the project's name; long names are kept whole; an acronym in brackets keeps its capitals.
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
const up2=async m=>{await up(m);return p.evaluate(()=>({name:PROJ.name,ccy:CCY()}))};
let e=await up2('r28_debt_usd.xlsx');e=await up2('r28_eltif_eur.xlsx');ok(e.name==='EUROPA INFRA & REAL ASSETS ELTIF – SEMI-LIQUID, MONTHLY (EUR)','a long name is kept whole, with its closing bracket',e.name);
await up2('r28_fof_usd.xlsx');e=await up2('r28_cma_sar.xlsx');ok(/AL DIRIYAH GATE/.test(e.name)&&!/Cost \(SAR\)/.test(e.name),'a table’s heading row (Project | Cost (SAR) | Build years) is not the project’s name',e.name);
let a=await test('villas sell for SAR 280m',{changes:[{label:'Villas phase 1 · Sale value (SAR)',cell:'Projects!D2',kind:'to',value:280000000,sure:true}]});
ok(/Projects!D2 305,000,000 → 280,000,000/.test(a)&&!/goes past the model/.test(a),'a sale value is not read as a year past the model’s end',a.slice(0,300));
ok(/Sale value \(SAR\)/i.test(a)&&!/\(Sar\)/.test(a),'an acronym in brackets keeps its capitals',a.slice(0,200));
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain},[q,input]);
a=await ask('compare the debt fund and the fund of funds on net IRR',{asked:'net IRR',agg:'max',projects:['HARBOUR LENDING FUND II – REAL ESTATE DEBT (USD m)','SUMMIT GLOBAL REAL ESTATE FUND OF FUNDS (USD)']});
ok(/HARBOUR/.test(a)&&/SUMMIT/.test(a)&&/6\.1/.test(a)&&/16\.1/.test(a)&&!/peak debt/i.test(a),'“net IRR” named by the AI is the net IRR, not the “debt” in the question',a.slice(0,400));
a=await ask('NAV per unit of the CMA fund and the class A return of the ELTIF',{asked:'NAV per unit',agg:'table',projects:['AL DIRIYAH GATE REAL ESTATE FUND – PRIVATE FUND, CMA (SAR)','EUROPA INFRA & REAL ASSETS ELTIF – SEMI-LIQUID, MONTHLY (EUR)']});
ok(/NAV per unit[^\n]*12\.7/.test(a)&&/Class A return[^\n]*3\.8/.test(a),'figures across two funds: NAV per unit (CMA) and class A return (ELTIF)',a.slice(0,400));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
