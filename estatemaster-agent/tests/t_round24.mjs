// Round 24: a rate typed as a bare fraction read as a percentage, inputs in a table named by floor codes, Excel tables with this-row
// references, a replacement life is not a timing change, portfolio answers (a figure under the model's own name counts in a total,
// the last phrase naming the project, project names with punctuation), the loan balance read from an “Opening debt” row.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));let READ=null;
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||'');const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify(READ));if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000)};
const test=async(q,read)=>{READ=read;return p.evaluate(async q=>{try{const r=await aiCrossCheck([{text:q}],async()=>{},undefined,{quiet:true});return testPlain(r)}catch(e){return 'ERR '+e.message}},q)};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

await up('r24_lab_usd.xlsx');
const ins=await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return{ok:XC.info[x.id].ok,labs:(x.inputs||[]).map(i=>i.cell+' '+i.label)}});
ok(ins.ok&&ins.labs.includes('Floors!D6 L5 · Rent Premium'),'a table of floors named by their codes (L1…L5) is read as inputs; this-row references reproduce 100%',JSON.stringify(ins).slice(0,300));
let a=await test('L5 premium 12%',{changes:[{label:'L5 · Rent premium',cell:'Floors!D6',kind:'to',value:12,sure:true}]});
ok(/Floors!D6 8% → 12%/.test(a)&&!/1,398|423/.test(a),'“12%” on a cell holding 0.08 is 12%, never 1,200%',a.slice(0,240));
ok(/Area \(sq ft\)/.test(ins.labs.join(' ')),'small words stay small in a header (Area (sq ft))',ins.labs.find(l=>/Area/.test(l)));
await up('r24_farm_sar.xlsx');a=await test('irrigation lasts 15 years',{changes:[{label:'Irrigation life (years)',cell:'Inputs!B11',kind:'to',value:15,sure:true}]});
ok(!/last period/.test(a),'a replacement life is not a timing change: no timing warning',a.slice(0,200));
await up('r24_toll_eur.xlsx');const dr=await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x);return x.debtRow&&{sheet:x.debtRow.sheet,label:x.debtRow.label}});
ok(dr&&/Opening debt/.test(dr.label),'the loan balance by period is read from an “Opening debt” row',JSON.stringify(dr));
await up('r24_mall_aed.xlsx');
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain},[q,input]);
a=await ask('NPV and payback of the farm',{asked:'NPV',agg:'table'});ok(/NPV at the discount rate[^\n]*SAR 186\.76M/.test(a)&&/Payback year/.test(a),'both figures of “NPV and payback of the farm”',a.slice(0,400));
a=await ask("compare the toll road's IRR with the mall",{metric:'levered_irr',agg:'max'});ok(/A-17/.test(a)&&/WASL[^\n]*\d%/.test(a.split('Not in')[0])&&!/KENDALL|WADI/.test(a),'a comparison of two named projects, one name carrying a comma (“REGIONAL MALL,”)',a.slice(0,300));
a=await ask('total revenue across the book',{metric:'gross_revenue',agg:'sum'});ok(/Revenue over 30 years/.test(a)&&/Revenue over the concession/.test(a),'a model’s revenue under its own name counts in a total, and is named',a.slice(0,500));
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}console.log('\n'+pass+' pass, '+fail+' fail');await b.close();
