// The five functions on one workbook, each feeding the others (the Jadwa edition): the Arabic development model (fixtures/models/ar_dev.xlsx)
// and its murabaha facility agreement (fixtures/docs/murabaha_ar.docx). Documents: the agreement is read and checked against the model
// (its balance covenant breached in 2029 and 2030). Financial modelling: a what-if that lowers the loan to cost says it cures the covenant;
// the workbook is fixed to the agreement and becomes the model. Debugging: the model debug runs again on the fixed workbook, and its
// reviewers (and the calculation AI) are told the regime and where the contract stands. Sensitivity: a tornado on the fixed workbook reads
// the covenant line in every run and names the ranges that break it; a what-if past the limit says so. Reporting: the deal-evidence report
// and the deck carry the sensitivity, the what-ifs, the documents and the debug, with no buttons. Every figure against LibreOffice
// (fixtures/golden/arabic.json). The AI is mocked.
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
const SEEN={fix:[],audit:[]};
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
  else if(/You read a sentence/.test(sys)){const sent=u.match(/Sentence: (.*)$/m)[1];const l=u.split('\n').find(z=>/\|/.test(z)&&z.includes('نسبة التمويل إلى التكلفة'));const m=sent.match(/by ([+-]?\d+) points/);
    t=JSON.stringify(l&&m?{changes:[{label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:'pts',value:+m[1],sure:true}]}:{changes:[]})}
  else if(/senior financial-modelling reviewer/.test(sys)){SEEN.audit.push(u);t=JSON.stringify({read_ok:true,read_note:'read fine',items:[{kind:'risk',severity:'medium',title:'Covenant headroom is thin in 2030',evidence:"'التدفقات النقدية'!F17 is 49.88% against the agreement's 50%",cell:"'التدفقات النقدية'!F17",recommendation:'test a higher loan to cost against clause 3.2'}],observations:[]})}
  else if(/second reviewer/.test(sys))t=JSON.stringify({verdicts:[...u.matchAll(/(\d+)\. \[(\w+), \w+\]/g)].map(m=>({i:+m[1],verdict:'confirmed',same_as:null,reason:'checked'}))});
  else if(/You audit an exact/.test(sys))t='{"verdict":"agree","why":"ok","results":[]}';
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})})});
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'ar_dev.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:40000});await p.click('#npCreate');
await p.waitForFunction(()=>{const x=latestExport();return x&&x.map&&x.map.proof&&x.map.proof['h:levered_irr']==='ok'},null,{timeout:60000}).catch(()=>{});await p.evaluate(async()=>{await xcEngine(latestExport())});
await p.evaluate(()=>showTab('em'));await p.waitForTimeout(500);
const I="'المدخلات'!",x0=await p.evaluate(()=>latestExport().id);
await p.setInputFiles('#docFile',[D+'murabaha_ar.docx']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===1&&(DOCS[PROJ.id][0].reg||[]).length,null,{timeout:120000}).catch(()=>{});
const R0=await p.evaluate(()=>Object.fromEntries(DOCS[PROJ.id][0].reg.map(r=>[r.key,r.status])));
ok(R0['prov:4']==='breached in 2 periods','documents: the agreement is read and its balance covenant found breached on the model',R0);
// documents → modelling and debugging: what every AI that reviews or calculates on the model is told
const c0=await p.evaluate(()=>calcContext(latestExport()));
ok(/Regime: /.test(c0)&&/Contracts read for this model: murabaha_ar\.docx/.test(c0)&&/Balance covenant/.test(c0)&&/breached in 2 periods/.test(c0),'documents → debugging and modelling: the calculation and debug AIs are told the regime and where the contract stands',c0.split('\n').filter(l=>/Regime|Contracts read/.test(l)).join(' / '));
const CL=await p.evaluate(()=>contractLimits(latestExport()));
ok(CL.length===2&&CL.some(c=>c.key==='prov:4'&&c.refs.length===5&&c.op==='max'&&c.lim===50&&c.pct)&&CL.some(c=>c.key==='prov:1'&&c.refs.length===1),'the contract’s limits the other functions test: the 50% balance covenant on its line (5 periods), the 50% loan-to-cost cap on its cell',CL.map(c=>({k:c.key,refs:c.refs,per:c.per})));
// modelling ← documents: a what-if that cures the covenant says so
const wi=(text)=>p.evaluate(async text=>{const steps=[];const r=await xcTest([{text}],async s=>steps.push(typeof s==='string'?s:JSON.stringify(s)));return r&&!r.ask?{contract:r.contract||'',irr:(r.metrics.find(m=>m.k==='levered_irr')||{}).value,ex:r.x&&r.x.id,steps,html:xcTestHTML(r)}:{ask:r&&r.ask}},text);
let w=await wi('loan to cost down by -8 points');
ok(w.ex===x0&&near(w.irr/100,G.integ_ltc42[0],1e-9),'modelling: loan to cost 50% → 42% recalculated exactly (levered IRR as LibreOffice gives it)',{irr:w.irr,g:G.integ_ltc42[0]});
ok(/Balance covenant \(murabaha_ar\.docx .*\): this change cures it \(it was breached in 2029 \(54\.88%\), 2030 \(58\.72%\)\)/.test(w.contract)&&/Against the contracts/.test(w.steps.join(' '))&&/⚖ Against the contracts/.test(w.html),'modelling ← documents: the what-if says it cures the balance covenant, with the periods and figures it breached in (LibreOffice: 54.88%, 58.72%)',w.contract);
// documents → modelling: the workbook fixed to the agreement becomes the model
await p.evaluate(async()=>{await handle('','web','Investment Director',{k:'fundfix',answers:{'prov:4':'Lower loan to cost to 42%'}})});
await p.waitForFunction(()=>{const d=DOCS[PROJ.id][0];return d.fix&&d.fix.x2&&latestExport().id===d.fix.x2},null,{timeout:300000}).catch(()=>{});
const f=await p.evaluate(()=>JSON.parse(JSON.stringify(DOCS[PROJ.id][0].fix)));const x2=f&&f.x2;
ok(x2&&near(f.after.net,G.fix42[0],1e-9)&&f.results.find(z=>z.key==='prov:4').after==='within the limit in every period','the workbook fixed to the agreement (profit rate 7.5%, loan to cost 42%): the covenant holds, levered IRR as LibreOffice gives it',f&&{after:f.after,res:f.results});
// debugging ← modelling and documents: the debug runs again on the fixed workbook, told the regime and the contract's standing on it
await p.waitForFunction(id=>{const x=EXPORTS.find(z=>z.id===id);return x&&x.audit&&x.audit.status!=='running'},x2,{timeout:240000}).catch(()=>{});
const au=await p.evaluate(id=>{const x=EXPORTS.find(z=>z.id===id);return{st:x.audit&&x.audit.status,items:(x.audit&&x.audit.ai&&x.audit.ai.items||[]).length}},x2);
const last=SEEN.audit[SEEN.audit.length-1]||'';
ok(au.items>=1&&SEEN.audit.length>=2&&/aligned with murabaha_ar/.test(last)&&/Regime: /.test(last)&&/Contracts read for this model: murabaha_ar\.docx/.test(last)&&!/Balance covenant[^;]*breached/.test(last.split('Contracts read for this model')[1]||''),'debugging: the model debug runs again on the fixed workbook, its reviewers told the regime and the contract as it stands there (the covenant no longer open)',{au,ctx:(last.match(/Contracts read for this model[^\n]*/)||[''])[0].slice(0,300)});
// sensitivity ← documents: the tornado reads the covenant line in every run
const A=(tool,args)=>p.evaluate(async([tool,args])=>{const o=await handle('','web','Investment Director',{k:'a33',tool,args});const r=window.A33LAST;window.A33LAST=null;return{plain:o.plain||'',html:o.html||'',r:r&&!r.ask?{v0:r.v0,ls:r.ls.map(l=>({cell:l.cell,lo:l.lo,hi:l.hi})),cov:sensCovLines(r)}:null}},[tool,args]);
const T=await A('tornado',{inputs:[{cell:I+'B11',unit:'pct',down:5,up:5},{cell:I+'B12',unit:'bps',down:100,up:100}],points:3});
const lB11=T.r&&T.r.ls.find(l=>/B11$/.test(l.cell)),lB12=T.r&&T.r.ls.find(l=>/B12$/.test(l.cell));
ok(T.r&&near(T.r.v0,G.fix42[0],1e-9)&&lB11&&near(lB11.hi,G.integ_fix_ltc441[0],1e-9)&&lB12&&near(lB12.hi,G.integ_fix_rate85[0],1e-9),'sensitivity: the tornado runs on the fixed workbook, each end exact (loan to cost 44.1%, profit rate 8.5%, as LibreOffice gives them)',T.r&&{v0:T.r.v0,ls:T.r.ls});
ok(/\*\*Against the contracts\*\*/.test(T.plain)&&/Balance covenant \(murabaha_ar\.docx .*at most 50%\): holds around the base; broken by /.test(T.plain)&&/نسبة التمويل إلى التكلفة at 44\.10% \(2030 \(52\.37%\)\)/.test(T.plain)&&/معدل ربح المرابحة at 8\.50% \(2030 \(51%\)\)/.test(T.plain),'sensitivity ← documents: the tornado says the covenant holds around the base and which ends break it, with the period and figure (LibreOffice: 52.37% at 44.1% loan to cost, 51% at an 8.5% rate)',(T.plain.match(/\*\*Against the contracts\*\*[\s\S]*?(?=\n\n|\n\*\*)/)||[''])[0]);
// modelling ← documents, on the fixed workbook: a what-if past the limit
w=await wi('loan to cost up by 3 points');
ok(w.ex===x2&&near(w.irr/100,G.integ_fix_ltc45[0],1e-9)&&/Balance covenant .*: breached by this change, in 2030 \(53\.44%\)/.test(w.contract),'modelling: on the fixed workbook, loan to cost 45% breaks the covenant in 2030 at 53.44%, as LibreOffice gives it, and the answer says so',w.contract);
// reporting: the deal evidence carries all of it, with no buttons
const rep=await p.evaluate(()=>{let id=Object.keys(RPTS).find(k=>/Deal evidence/.test(RPTS[k].name)&&RPTS[k].builtin);if(!id){id='zz';RPTS.zz={name:'Deal evidence',aud:'IC',blocks:['wb_factsheet','wb_documents','wb_sensitivity','wb_whatifs','wb_debug']}}const html=reportDoc(id);const d=buildDeck(id,{});return{id,blocks:RPTS[id].blocks,html,kinds:d.slides.map(s=>s.kind+':'+(s.kicker||'')),say:d.slides.map(s=>s.say||'').join(' | ')}});
const txt=rep.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
if(rep.id!=='zz')ok(['wb_documents','wb_sensitivity','wb_whatifs','wb_debug'].every(b=>rep.blocks.includes(b)),'reporting: the Jadwa deal-evidence report carries the documents, the sensitivity, the what-ifs and the debug',rep.blocks);
ok(/What moves .* most/.test(txt)&&txt.includes(lB11?String(Math.round(G.integ_fix_ltc441[0]*10000)/100):'x')&&/Against the contracts: .*Balance covenant .*2030 \(52\.37%\)/.test(txt),'reporting ← sensitivity: the tornado’s exact figures and the covenant it breaks are in the report',txt.slice(txt.indexOf('What moves'),txt.indexOf('What moves')+400));
ok(/Covenant headroom is thin in 2030/.test(txt)&&/likely bug/.test(txt),'reporting ← debugging: the model debug’s findings, with their cells',txt.slice(txt.indexOf('likely bug')-10,txt.indexOf('likely bug')+200));
ok(/Balance covenant/.test(txt)&&/نسبة التمويل إلى التكلفة 42% → 45% 21\.29%/.test(txt)&&!/no approved change in between/.test(txt),'reporting ← documents and modelling: the agreement’s terms and the what-if on the fixed workbook (21.29%, as LibreOffice gives it); the fix itself is not flagged as an unapproved change',txt.slice(txt.indexOf('What-ifs'),txt.indexOf('What-ifs')+300));
ok(!/data-fundfix|data-cfixdec|data-a33a|<button|class="chips"/.test(rep.html),'the report has no buttons or chips');
ok(rep.kinds.some(k=>/Sensitivity/.test(k))&&rep.kinds.some(k=>/Model debug/.test(k))&&/Against the contracts/.test(rep.say),'reporting: the deck has a sensitivity slide (with the covenant) and a debug slide',rep.kinds);
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
