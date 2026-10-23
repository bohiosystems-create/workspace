// A model and a contract that disagree, and the AI fixing the workbook (the Jadwa edition): the Arabic development model
// (fixtures/models/ar_dev.xlsx) and its murabaha facility agreement (fixtures/docs/murabaha_ar.docx, gen/gen_arabic.py). The contract is
// read with the Saudi fund pack (fundpack/: its glossary, the Umm al-Qura table, CMA limits): quotes carry their English translation, the
// agreement's dual date is checked against Umm al-Qura. Then "Fix the workbook to the agreement": the AI proposes edits, each is checked
// for certain (a typed input for a value, a formula that computes; a result cell refused), the fixed workbook is written, recalculated and
// becomes the model, and the agreement is checked again on it. A covenant breach is the user's decision: chosen with a click, the AI fixes
// it as decided and the re-check shows it cured. Every figure against LibreOffice (fixtures/golden/arabic.json). The AI is mocked.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/arabic.json',import.meta.url),'utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,700):''))};const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Number.isFinite(e)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const MAP={headlines:[{key:'levered_irr',cell:"'العوائد'!B3",label:'معدل العائد الداخلي بعد التمويل',definition:'equity IRR after the murabaha facility'},{key:'unlevered_irr',cell:"'العوائد'!B4",label:'معدل العائد الداخلي قبل التمويل',definition:'project IRR before financing'},{key:'net_profit',cell:"'العوائد'!B5",label:'صافي الربح',definition:'net profit'}],
  units:[{sheet:'التدفقات النقدية',scale:1,currency:'SAR',evidence:"'التدفقات النقدية'!A1"}],scenario:{switch:"'المدخلات'!B3",names:['أساسي','متحفظ']},timeline:{sheet:'التدفقات النقدية',period:'year',first:"'التدفقات النقدية'!C3",count:5},cashflows:[{irr:'levered_irr',row:"'التدفقات النقدية'!C18:G18"}],hold:{cell:"'المدخلات'!B13",unit:'years'}};
const Q={ltc:'يلتزم المموّل بتوفير تسهيل مرابحة لا يتجاوز مبلغه خمسين بالمائة (50%) من إجمالي تكلفة المشروع',rate:'يستحق للمموّل ربح المرابحة بمعدل ٧٫٥٪ سنوياً على الرصيد القائم',
  repay:'يلتزم العميل بسداد كامل رصيد التسهيل والأرباح المستحقة في موعد أقصاه ٣٠ جمادى الآخرة ١٤٥٢هـ',cov:'يتعهد العميل بألا يتجاوز رصيد التسهيل شاملاً الأرباح المرسملة خمسين بالمائة (50%) من إجمالي تكلفة المشروع في أي وقت'};
const PROV=[{topic:'Loan to cost limit',clause:'2.1',quote:Q.ltc,quote_en:'The financier shall provide a murabaha facility not exceeding fifty per cent (50%) of the total project cost',implication:'The model’s loan to cost must not exceed 50%.',check:{type:'max',value:50,unit:'%'}},
  {topic:'Profit rate',clause:'2.2',quote:Q.rate,quote_en:'Murabaha profit is due to the financier at 7.5% a year on the outstanding balance',implication:'The model’s profit rate must be 7.5%.',check:{type:'value',value:7.5,unit:'%'}},
  {topic:'Final repayment date',clause:'3.1',quote:Q.repay,quote_en:'The client shall repay the full facility balance and accrued profit no later than 30 Jumada al-Akhirah 1452 AH',implication:'Repayment must fall by the final date.',check:{type:'date',date:'2030-10-28',date_kind:'by',calendar:'hijri',hijri:{y:1452,m:6,d:30}}},
  {topic:'Balance covenant',clause:'3.2',quote:Q.cov,quote_en:'The client undertakes that the facility balance, including capitalised profit, shall not exceed fifty per cent (50%) of the total project cost at any time',implication:'The balance to cost line must stay within 50% every year.',check:{type:'row_max',value:50,unit:'%'}}];
const SEEN={fix:[]};
const ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
  let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,sys=String(pl.system||(pl.messages&&pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u=String(((pl.messages||[]).filter(m=>m.role==='user').pop()||{}).content||'');
  const oa=/openai/.test(r.request().url())||body.provider==='openai';let t='{}';
  if(/You map the structure of a real estate financial model laid out as a grid of cells\. Each line/.test(sys))t=JSON.stringify(MAP);
  else if(/You classify a document/.test(sys))t=JSON.stringify({contract:true,category:'financing',doc_type:'murabaha facility agreement',language:'ar'});
  else if(/You read a contract that governs/.test(sys)){SEEN.reader=sys;const sec=q=>{const m=[...u.matchAll(/\[page (\d+)(?: · §([^\]]+))?\]\n([\s\S]*?)(?=\n\n\[page |\s*$)/g)].find(z=>z[3].includes(q.slice(0,25)));return m?+m[1]:1};
    t=JSON.stringify({doc_type:'murabaha facility agreement',fund:'',parties:'Al Riyada Bank and Al Narjis Development',terms:[],definitions:[],fund_kind:'other',provisions:PROV.map(z=>({...z,page:sec(z.quote)}))})}
  else if(/You map the terms of a fund agreement/.test(sys))t=JSON.stringify({cells:{},provisions:{1:{cell:'المدخلات!B11'},2:{cell:'المدخلات!B12'},3:{row:'التدفقات النقدية|15'},4:{row:'التدفقات النقدية|17'}},rows:{}});
  else if(/You fix a financial model/.test(sys)){SEEN.fix.push(u);const decided=/The user's decisions:\n- prov:4: Lower loan to cost to 42%/.test(u);
    t=JSON.stringify(decided?{fixes:[{finding:'prov:2',kind:'set',cell:'المدخلات!B12',value:0.075,why:'The agreement sets the profit rate at 7.5% a year.',why_ar:'تنص الاتفاقية على معدل ربح 7.5% سنوياً.'},{finding:'prov:4',kind:'set',cell:'المدخلات!B11',value:0.42,why:'As decided: loan to cost lowered to 42%, keeping the balance within 50% of cost.'}],decisions:[{finding:'prov:3',question:'Repay by 27 October 2030?',options:['Repay in 2029 (period 3)','Keep 2031 and ask the bank for an extension']}],cannot:[]}
      :{fixes:[{finding:'prov:2',kind:'set',cell:'المدخلات!B12',value:0.075,why:'The agreement sets the profit rate at 7.5% a year.',why_ar:'تنص الاتفاقية على معدل ربح 7.5% سنوياً.'},
        {finding:'prov:2',kind:'formula',cell:"'التدفقات النقدية'!D14",formula:"=C16*'المدخلات'!B12",why:'Profit accrues on the opening balance at the facility’s rate.'},
        {finding:'prov:4',kind:'set',cell:"'العوائد'!B3",value:0.2,why:'(a result: must be refused)'},{finding:'prov:9',kind:'set',cell:'المدخلات!B6',value:1,why:'(no such finding: must be refused)'}],
        decisions:[{finding:'prov:3',question:'Repay by 27 October 2030?',question_ar:'هل يتم السداد قبل 27 أكتوبر 2030؟',options:['Repay in 2029 (period 3)','Keep 2031 and ask the bank for an extension']},{finding:'prov:4',question:'How should the balance stay within 50% of cost?',options:['Lower loan to cost to 42%','Inject equity instead']}],cannot:[]})}
  else if(/You audit an exact/.test(sys))t='{"verdict":"agree","why":"ok","results":[]}';
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})})});
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'ar_dev.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:40000});await p.click('#npCreate');
await p.waitForFunction(()=>{const x=latestExport();return x&&x.map&&x.map.proof&&x.map.proof['h:levered_irr']==='ok'},null,{timeout:60000}).catch(()=>{});await p.evaluate(async()=>{await xcEngine(latestExport())});
await p.evaluate(()=>showTab('em'));await p.waitForTimeout(500);
// the pack itself
const pk=await p.evaluate(()=>({terms:FP.terms.filter(t=>t[8]==='KSA').length,months:FP.uq.len.length,cma:FP.cma.length,h:[hijriToGreg(1446,11,23),hijriToGreg(1448,3,4),hijriToGreg(1452,6,30),hijriToGreg(1500,12,30)],g:gregToHijri('2025-05-21'),
  cma1:fpCmaChecks('public_reif',[{field:'financing.max_borrowing_pct',value:60,quote:'q'}]),cma2:fpCmaChecks('private_re_fund',[{field:'financing.max_borrowing_pct',value:60,quote:'q'}]),gl:/Management Fee = أتعاب الإدارة/.test(fpGloss())}));
ok(pk.terms===126&&pk.months===1740&&pk.cma>=20&&pk.gl,'the Saudi fund pack is in the app: 126 bilingual terms, 1,740 Umm al-Qura months, the CMA limits',pk);
ok(pk.h[0]==='2025-05-21'&&pk.h[1]==='2026-08-17'&&pk.h[2]===null&&pk.g&&pk.g.y===1446&&pk.g.m===11&&pk.g.d===23,'the official anchors: 23/11/1446 AH = 21 May 2025 (CMA resolution 1-54-2025), 4 Rabi al-Awwal 1448 = 17 August 2026 (Umm al-Qura gazette), and back',pk.h);
ok(!pk.cma1[0].ok&&pk.cma1[0].applies&&pk.cma2[0].applies===false,'a public fund borrowing 60% of its assets breaches the CMA’s 50% (art. 41(b)); a private fund gets it as information only',pk.cma1[0]);
await p.setInputFiles('#docFile',[D+'murabaha_ar.docx']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===1&&(DOCS[PROJ.id][0].reg||[]).length,null,{timeout:120000}).catch(()=>{});
const doc=await p.evaluate(()=>JSON.parse(JSON.stringify(DOCS[PROJ.id][0])));
ok(/Management Fee = أتعاب الإدارة/.test(SEEN.reader||'')&&/quote_en/.test(SEEN.reader||'')&&/financing\.max_borrowing_pct/.test(SEEN.reader||''),'the readers get the pack’s glossary, are asked for each Arabic quote’s translation and for the values the CMA regulates');
const dd=(doc.dualDates||[])[0];
ok(dd&&!dd.ok&&dd.uq==='2026-08-17'&&dd.g==='2026-08-18','the agreement’s dual date (١٤٤٨/٠٣/٠٤هـ الموافق ٢٠٢٦/٠٨/١٨م) is checked against Umm al-Qura: that Hijri day is 17 August 2026, not the 18th',doc.dualDates);
const html0=await p.evaluate(()=>document.querySelector('#docList').innerHTML.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
ok(/4 Rabi al-Awwal 1448 AH is 17 August 2026 by the Umm al-Qura calendar; the agreement pairs it with 18 August 2026/.test(html0)&&/Murabaha profit is due to the financier at 7\.5% a year/.test(html0),'the card says it, and shows each Arabic quote’s English translation',html0.slice(html0.indexOf('In the agreement itself'),html0.indexOf('In the agreement itself')+200));
const R=Object.fromEntries(doc.reg.map(r=>[r.key,r.status]));
ok(R['prov:2']==='differs'&&R['prov:4']==='breached in 2 periods'&&R['prov:3']==='later than the agreement','before the fix: the profit rate differs, the balance covenant is breached, the repayment is late',R);
// fix the workbook to the agreement
await p.evaluate(()=>document.querySelector('[data-fundfix]').click());await p.waitForFunction(()=>{const d=DOCS[PROJ.id][0];return d.fix&&d.fix.x2},null,{timeout:120000}).catch(()=>{});
let f=await p.evaluate(()=>JSON.parse(JSON.stringify(DOCS[PROJ.id][0].fix)));
ok(SEEN.fix.length===1&&/prov:2: Profit rate/.test(SEEN.fix[0])&&/prov:4: Balance covenant/.test(SEEN.fix[0])&&/line التدفقات النقدية\|17/.test(SEEN.fix[0])&&/=E16\/\(-SUM\(\$C\$10:\$G\$10\)\) = 0\.54879/.test(SEEN.fix[0])&&/=IF\(G\$4='المدخلات'!\$B\$13/.test(SEEN.fix[0])&&/Murabaha profit is due/.test(SEEN.fix[0]),'the AI is given every inconsistency with the contract’s words and translation, and the formulas of the lines involved',SEEN.fix[0]&&SEEN.fix[0].slice(0,500));
ok(f&&f.fixes.length===2&&f.fixes.some(z=>z.kind==='set'&&/B12$/.test(z.cell)&&near(z.v,0.075))&&f.fixes.some(z=>z.kind==='formula'&&/D14$/.test(z.cell)),'the profit rate (a typed input) and a formula are accepted',f&&f.fixes);
ok(f&&f.rejected.length===2&&f.rejected.some(z=>/B3$/.test(z.cell)&&/not a typed input/.test(z.why))&&f.rejected.some(z=>z.finding==='prov:9'&&/no finding/.test(z.why)),'an edit to a result cell (the IRR itself) and an edit answering no finding are refused, each with the reason',f&&f.rejected);
ok(f&&/ar_dev - aligned with murabaha_ar\.xlsx/.test(f.file)&&near(f.after.net,G.rate75[0],1e-9)&&near(f.before.net,G.base[0],1e-9),'the fixed workbook is written and becomes the model: levered IRR 24.49% → 23.78%, as LibreOffice gives it',f&&{file:f.file,before:f.before,after:f.after});
const res=f?Object.fromEntries(f.results.map(z=>[z.key,z.after])):{};
ok(res['prov:2']==='matches'&&res['prov:4']==='breached in 2 periods'&&res['prov:3']==='later than the agreement','the agreement checked again on the fixed workbook: the profit rate now matches; the covenant and the date are still open (decisions, not edits)',f&&f.results);
const wb=await p.evaluate(async id=>{const x=EXPORTS.find(z=>z.id===id);const buf=await xcRaw(x);await loadXLSX();const w=XLSX.read(buf,{type:'array',cellFormula:true});const a=w.Sheets['المدخلات'].B12,c=w.Sheets['التدفقات النقدية'].D14;return{b12:a&&a.v,d14:c&&c.f,latest:latestExport().id===id}},f.x2);
ok(near(wb.b12,0.075)&&wb.d14==="C16*'المدخلات'!B12"&&wb.latest,'the downloadable .xlsx holds the new value and the new formula, and is the project’s model now',wb);
ok(f&&f.decisions.length===2&&f.decisions[1].options[0]==='Lower loan to cost to 42%','the covenant and the date come back as decisions, with options to click',f&&f.decisions);
// the user decides: loan to cost to 42%
await p.evaluate(()=>{const c=[...document.querySelectorAll('[data-cfixdec]')].find(z=>/42%/.test(z.textContent));c.click()});await p.waitForFunction(n=>{const d=DOCS[PROJ.id][0];return d.fix&&d.fix.answers&&d.fix.answers['prov:4']&&d.fix.x2&&d.fix.fixes.length===2&&d.fix.fixes.some(z=>/B11$/.test(z.cell))},null,{timeout:300000}).catch(()=>{});
f=await p.evaluate(()=>JSON.parse(JSON.stringify(DOCS[PROJ.id][0].fix)));const res2=f?Object.fromEntries(f.results.map(z=>[z.key,z.after])):{};
ok(SEEN.fix.length===2&&/The user's decisions:\n- prov:4: Lower loan to cost to 42%/.test(SEEN.fix[1]),'the decision goes back to the AI with the findings');
ok(res2['prov:4']==='within the limit in every period'&&res2['prov:2']==='matches'&&res2['prov:1']!=='above the limit'&&near(f.after.net,G.fix42[0],1e-9),'fixed as decided: loan to cost 42%, the covenant within 50% in every year (peak 49.88%), levered IRR 20.10%, as LibreOffice gives them',{results:f&&f.results,after:f&&f.after});
const dl=await p.evaluate(()=>!!document.querySelector('#docList [data-xcxdl]'));
const md=await p.evaluate(async()=>{const o=await handle('','web','Investment Director',{k:'fundfix',answers:DOCS[PROJ.id][0].fix.answers});return o.plain});
ok(dl&&/The workbook fixed to the agreement/.test(md)&&/B11: 0\.5 → 0\.42/.test(md),'a download link for the fixed workbook, and the agent can run the same fix from the chat',md.slice(0,300));
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
