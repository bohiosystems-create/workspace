// Round 22: what the desk session and the LibreOffice sweep found, kept fixed. Engine (functions with Excel's rules on fractional
// arguments, negative INT, TEXT formats, 31 December of leap years, backward OFFSET windows) is covered by the fn_battery model
// in tools/sweep; here: what-if answers, portfolio answers and the lender document on the round 22 models.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));let READ=null;
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||'');const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify(READ));if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000)};
const test=async(q,read)=>{READ=read;return p.evaluate(async q=>{const st=[];try{const r=await aiCrossCheck([{text:q}],async s=>st.push(typeof s==='string'?s:(s.who+': '+(s.text||''))),undefined,{quiet:true});return{plain:testPlain(r),steps:st.join(' | ')}}catch(e){return{plain:'ERR '+e.message,steps:st.join(' | ')}}},q)};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

await up('r22_branded_aed.xlsx');
let r=await test('start in Q1 2027',{changes:[{label:'Model start',cell:'Inputs!B3',kind:'to',value:46477,sure:true}]});
ok(!/last period/.test(r.plain),'a date input not labelled “date” never trips the timing warning',r.plain.slice(0,200));
await up('r22_second_eur.xlsx');
r=await test('report at June 2030',{changes:[{label:'Reporting date',cell:'Fund!B10',kind:'to',value:47664,sure:true}]});
ok(/DPI at the reporting date/.test(r.plain)&&/RVPI at the reporting date/.test(r.plain)&&!/No result moved/.test(r.plain),'every result that moves is shown; “no result moved” only when none did',r.plain.slice(0,300));
ok(/reads it as Reporting date to \(2031-06-30 → 2030-06-30\)/.test(r.steps),'the AI reading of a date is shown as dates',r.steps.slice(0,200));
r=await test('discounts 5 points tighter',{changes:[{label:'Discount to NAV',cell:'Interests!D2',kind:'pts',value:-5,sure:true,cells:['Interests!D2','Interests!D3']}]});
ok(/\(12% → 7%\)/.test(r.steps),'a rate typed as a bare fraction reads back right (12% → 7%, not −4.88%)',r.steps.slice(0,200));
ok(/Discount To NAV/.test(await p.evaluate(()=>(latestExport().inputs||[]).find(i=>i.cell==='Interests!D2').label)),'a table header keeps its acronym (Discount To NAV)');
await up('r22_dc_usd.xlsx');
r=await test('hold to quarter 40',{changes:[{label:'Exit quarter',cell:'Inputs!B23',kind:'to',value:40,sure:true}]});
ok(/reaches the model’s last period/.test(r.plain)&&!/returns are understated/.test(r.plain),'the timing warning says only what is certain',r.plain.slice(0,220));
await up('r21_ppp_gbp.xlsx');await up('r22_sukuk_sar.xlsx');await up('r21_fundc_usd.xlsx');
const ask=async(q,input)=>p.evaluate(async([q,input])=>{const o=await handle(q,'wa','analyst',{k:'projects',text:q,byAI:'x',...input});return o.plain+' '+(typeof provNote==='function'?provNote(o.plain):'')},[q,input]);
let a=await ask('which projects have a cash trap or covenant breach?',{asked:'cash trap or covenant',agg:'table'});
ok(/Cash swept|cash sweep/i.test(a)&&/DSCR|LLCR|coverage/i.test(a),'two figures named: both answered (cash sweep for the cash trap; cover for the covenant)',a.slice(0,400));
a=await ask('zakat and tax paid across the book',{asked:'zakat and tax',agg:'table'});ok(/Zakat paid/.test(a)&&/Tax paid/.test(a),'zakat and tax: both answered',a.slice(0,300));
ok(!/carry no label/.test(a),'no false “figures carry no label” warning on the models’ own figures',a.slice(-200));
a=await ask('total peak debt across all projects',{metric:'peak_debt',agg:'sum'});ok(!/Narjis[^.]{0,40}SAR 136/.test(a)&&/demo project\) is left out/.test(a),'the demo project is not added into a portfolio total (“all” is not “Al Narjis”)',a.slice(0,300));
a=await ask("compare the data centre's levered IRR with the sukuk community",{metric:'levered_irr',agg:'max'});ok(/NORTHGATE/.test(a)&&/RAWDAT/.test(a)&&!/RIVERSIDE/.test(a),'a comparison of two named projects answers on those two',a.slice(0,300));
// the lender document carries the loan balance by period (the deck already did); on the fund it is the fund's own facility
await p.evaluate(()=>{const id=Object.values(PROJECTS).find(z=>/ATLAS/i.test(z.name)).id;switchProject(id,true)});await p.waitForTimeout(1500);
const doc=await p.evaluate(()=>String(BLOCKS.wb_debt.fn()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));ok(/Facility balance by period/.test(doc)&&/peak/.test(doc)&&!/Loan balance by period/.test(doc),'the lender document shows the fund’s facility balance by period, not a deal’s loan',doc.slice(0,300));
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}console.log('\n'+pass+' pass, '+fail+' fail');await b.close();
