// Arabic, end to end, in both editions: an Arabic development model (fixtures/models/ar_dev.xlsx, gen/gen_arabic.py: Arabic sheet names with
// spaces, Arabic labels, SAR, cases named in Arabic) read and mapped; what-ifs asked in Arabic with Arabic-Indic digits, recalculated
// exactly (LibreOffice: fixtures/golden/arabic.json); the direction a sentence states in Arabic checked against the AI's reading; an Arabic
// answer laid out right to left; and (the Jadwa edition) the murabaha facility agreement in Arabic, as a Word file and as a PDF whose
// Arabic comes out with letters out of order, read into provisions with their modelling implications and proved on the workbook: a limit,
// a rate, a covenant line period by period, and a repayment date written in the Hijri calendar on a day that does not exist.
// The AI is mocked: its readings are built from the fixtures' own text. Synthetic fixtures only.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/arabic.json',import.meta.url),'utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,700):''))};const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Number.isFinite(e)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const MAP={headlines:[{key:'levered_irr',cell:"'العوائد'!B3",label:'معدل العائد الداخلي بعد التمويل',definition:'equity IRR after the murabaha facility'},{key:'unlevered_irr',cell:"'العوائد'!B4",label:'معدل العائد الداخلي قبل التمويل',definition:'project IRR before financing'},{key:'net_profit',cell:"'العوائد'!B5",label:'صافي الربح',definition:'the project’s net profit after financing'},{key:'profit_on_cost',cell:"'العوائد'!B6",label:'العائد على التكلفة',definition:'project profit over total cost'},{key:'equity_multiple',cell:"'العوائد'!B7",label:'مضاعف حقوق الملكية',definition:'equity multiple'}],
  units:[{sheet:'التدفقات النقدية',scale:1,currency:'SAR',evidence:"'التدفقات النقدية'!A1"}],scenario:{switch:"'المدخلات'!B3",names:['أساسي','متحفظ']},timeline:{sheet:'التدفقات النقدية',period:'year',first:"'التدفقات النقدية'!C3",count:5},cashflows:[{irr:'levered_irr',row:"'التدفقات النقدية'!C18:G18"},{irr:'unlevered_irr',row:"'التدفقات النقدية'!C12:G12"}],hold:{cell:"'المدخلات'!B13",unit:'years'}};
// the readers of the agreement: quotes verbatim from the Word file's own text (correct Arabic), so on the PDF they hold only word by word on letters
const Q={ltc:'يلتزم المموّل بتوفير تسهيل مرابحة لا يتجاوز مبلغه خمسين بالمائة (50%) من إجمالي تكلفة المشروع',rate:'يستحق للمموّل ربح المرابحة بمعدل ٧٫٥٪ سنوياً على الرصيد القائم',fee:'يدفع العميل للمموّل رسوم ترتيب بنسبة واحد بالمائة (1%) من مبلغ التسهيل عند التوقيع',
  repay:'يلتزم العميل بسداد كامل رصيد التسهيل والأرباح المستحقة في موعد أقصاه ٣٠ جمادى الآخرة ١٤٥٢هـ',cov:'يتعهد العميل بألا يتجاوز رصيد التسهيل شاملاً الأرباح المرسملة خمسين بالمائة (50%) من إجمالي تكلفة المشروع في أي وقت',law:'تخضع هذه الاتفاقية للأنظمة المعمول بها في المملكة العربية السعودية وأحكام الشريعة الإسلامية'};
const PROV=[{topic:'Loan to cost limit',clause:'2.1',quote:Q.ltc,implication:'The facility drawn must stay within 50% of the total project cost: the model’s loan-to-cost input must not exceed it.',check:{type:'max',value:50,unit:'%',measure:'loan to cost'}},
  {topic:'Profit rate',clause:'2.2',quote:Q.rate,implication:'Murabaha profit accrues at 7.5% a year on the balance and is capitalised: the model’s profit rate must be 7.5%.',check:{type:'value',value:7.5,unit:'%',measure:'murabaha profit rate a year'}},
  {topic:'Final repayment date',clause:'3.1',quote:Q.repay,implication:'The whole balance with its profit must be repaid by the final date: the model’s repayment must fall by then.',check:{type:'date',date:'2030-10-28',date_kind:'by',calendar:'hijri',hijri:{y:1452,m:6,d:30},measure:'final repayment'}},
  {topic:'Balance covenant',clause:'3.2',quote:Q.cov,implication:'The facility balance with its capitalised profit must stay within 50% of total project cost at all times: a line the model must respect in every year.',check:{type:'row_max',value:50,unit:'%',measure:'facility balance to total project cost'}},
  {topic:'Governing law',clause:'4.1',quote:Q.law,implication:'Saudi law and Sharia: no figure of the model changes.',check:{type:'none'}}];
function mock(p,SEEN){return p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
  let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,sys=String(pl.system||(pl.messages&&pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u=String(((pl.messages||[]).filter(m=>m.role==='user').pop()||{}).content||'');
  const oa=/openai/.test(r.request().url())||body.provider==='openai';let t='{}';const reply=x=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:x},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:x}],stop_reason:'end_turn'})});
  if(pl.tools&&pl.tools.length){SEEN.agent=sys;return reply('معدل العائد الداخلي بعد التمويل **24.49%** (العوائد!B3)، وصافي الربح **SAR 40.16M**.')}
  if(/You map the structure of a real estate financial model laid out as a grid of cells\. Each line/.test(sys))t=JSON.stringify(MAP);
  else if(/You read a sentence/.test(sys)){SEEN.read.push(u.match(/Sentence: (.*)$/m)[1]);const sent=u.match(/Sentence: (.*)$/m)[1];const lines=u.split('\n').filter(l=>/\|/.test(l));const line=w=>lines.find(l=>w.every(x=>l.includes(x)));
    if(/سعر البيع/.test(sent)){const l=line(['سعر البيع','أساسي']);t=JSON.stringify({changes:[{label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:'pct',value:-10,sure:true}]})}
    else if(/تكلفة البناء/.test(sent)){const l=line(['تكلفة البناء']);t=JSON.stringify({changes:[{label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:'pct',value:SEEN.flip?-5:5,sure:true}]})}
    else if(/^set /.test(sent)){const ch=[];for(const part of sent.split(/\s+and\s+/)){const m=part.match(/set (.+?) to ([\d.,]+)(%?)/);if(!m)continue;const l=lines.find(z=>z.split('|')[0].trim()===m[1].trim());if(l)ch.push({label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:'to',value:+m[2],sure:true})}t=JSON.stringify({changes:ch})}
    else if(/المتحفظ/.test(sent)){const l=line(['السيناريو']);t=JSON.stringify({changes:[{label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:'to',value:2,sure:true}]})}}
  else if(/You classify a document/.test(sys))t=JSON.stringify({contract:true,category:'financing',doc_type:'murabaha facility agreement',language:'ar'});
  else if(/You read a contract that governs/.test(sys)){SEEN.contract.push({oa,u});const sec=q=>{const m=[...u.matchAll(/\[page (\d+)(?: · §([^\]]+))?\]\n([\s\S]*?)(?=\n\n\[page |\s*$)/g)].find(z=>z[3].includes(q.slice(0,25)));return m?+m[1]:1};
    t=JSON.stringify({doc_type:'murabaha facility agreement',fund:'مشروع حي النرجس السكني',parties:'Al Riyada Bank (financier) and Al Narjis Real Estate Development (client)',date:'',terms:[],definitions:[],
      fees:[{name:'arrangement fee',rate:1,basis:'facility amount',quote:Q.fee,page:sec(Q.fee),article:'2.3'}],provisions:(oa?PROV.slice(0,4):PROV).map(z=>({...z,page:sec(z.quote)}))})}
  else if(/You map the terms of a fund agreement/.test(sys)){SEEN.map=u;t=JSON.stringify({cells:{},fees:{'arrangement fee':null},provisions:{1:{cell:'المدخلات!B11'},2:{cell:'المدخلات!B12'},3:{row:'التدفقات النقدية|15'},4:{row:'التدفقات النقدية|17'},5:{cell:null,row:null}},rows:{}})}
  else if(/You audit an exact/.test(sys))t='{"verdict":"agree","why":"ok","results":[]}';
  reply(t)})}
async function open(jadwa){const ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));const SEEN={read:[],contract:[],map:null,agent:''};await mock(p,SEEN);
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'ar_dev.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:40000});const info=await p.evaluate(()=>document.querySelector('#npInfo').textContent);await p.click('#npCreate');
  await p.waitForFunction(()=>{const x=latestExport();return x&&x.map&&x.map.proof&&x.map.proof['h:levered_irr']==='ok'},null,{timeout:60000}).catch(()=>{});await p.evaluate(async()=>{await xcEngine(latestExport())});return{p,SEEN,errs,info}}

// ---- the Kinan edition: the workbook, what-ifs in Arabic, an Arabic answer ----
{const {p,SEEN,errs,info}=await open(false);
  const x=await p.evaluate(()=>{const x=latestExport();return{inputs:(x.inputs||[]).map(i=>[i.label,i.cell,i.value]),cells:x.cells,out:x.out,cur:x.meta&&x.meta.currency,type:x.meta&&x.meta.type,proof:x.map&&x.map.proof,names:x.map&&x.map.scenario&&x.map.scenario.names}});
  ok(/SAR/.test(info)&&/residential/.test(info)&&/11 assumptions|1[0-9] assumptions/.test(info),'the upload reads the Arabic workbook: its currency from “ريال سعودي”, its type from “السكني”, its assumptions under their Arabic labels',info);
  ok(['سعر البيع للمتر المربع · أساسي','معدل ربح المرابحة','نسبة التمويل إلى التكلفة'].every(l=>x.inputs.some(i=>i[0]===l))&&x.inputs.some(i=>i[0]==='معدل ربح المرابحة'&&/^'?المدخلات'?!B12$/.test(i[1])),'each typed input keeps its Arabic label and its cell on the Arabic-named sheet',x.inputs.slice(0,6));
  ok(near(x.out.levered_irr/100,G.base[0],1e-4)&&near(x.out.net_profit,G.base[2],1e-6)&&['h:levered_irr','cf:levered_irr','h:net_profit','scenario','hold'].every(k=>x.proof[k]==='ok'),'the AI maps the Arabic headlines, the case switch, the cash flows behind each IRR and the hold input; each proved on the workbook (levered IRR 24.49%, as LibreOffice)',{out:x.out,proof:x.proof});
  ok(x.names&&x.names.join()==='أساسي,متحفظ','the cases keep their Arabic names',x.names);
  const run=(text,flip)=>p.evaluate(async([text,flip])=>{window.__flip=flip;const steps=[];const r=await xcTest([{text}],async s=>steps.push(typeof s==='string'?s:JSON.stringify(s)));return r?(r.ask?{ask:r.ask}:{desc:r.desc,res:r.res||null,v:(()=>{const x=latestExport();const V=(MVERS[PROJ.id]||[]).filter(z=>!z.base&&z.ex===x.id);return V.length?V[V.length-1]:null})()}):{none:true}},[text,flip]);
  let r=await run('ماذا لو انخفض سعر البيع ١٠٪؟');const v1=r.v;
  ok(SEEN.read.length&&/10%/.test(SEEN.read[0])&&!/[٠-٩٪]/.test(SEEN.read[0]),'the sentence reaches the AI with its Arabic-Indic digits and percent sign read as 10%',SEEN.read[0]);
  ok(v1&&(v1.sets||[]).some(s=>/B4$/.test(s[0])&&near(s[1],5850))&&v1.out&&near(v1.out.levered_irr/100,G.price_m10[0],1e-4),'“ماذا لو انخفض سعر البيع ١٠٪؟”: the base sale price 6,500 → 5,850, recalculated exactly: levered IRR 10.69% (LibreOffice)',{sets:v1&&v1.sets,out:v1&&v1.out});
  await p.evaluate(()=>{});SEEN.flip=true;r=await run('ماذا لو ارتفعت تكلفة البناء ٥٪');
  ok(r.ask&&/Two readings/.test(r.ask.question)&&(r.ask.options||[]).length===2,'the sentence says the cost rises (ارتفعت) and the AI lowers it: the two readings are put to the user, never chosen',r.ask);
  SEEN.flip=false;r=await run('ماذا لو ارتفعت تكلفة البناء ٥٪ مرة أخرى');
  ok(r.v&&(r.v.sets||[]).some(s=>/B7$/.test(s[0])&&near(s[1],3360))&&near(r.v.out.levered_irr/100,G.cost_p5[0],1e-4),'read the right way, the cost rises 5% (3,200 → 3,360): levered IRR 20.61% (LibreOffice)',r.v&&{sets:r.v.sets,out:r.v.out});
  r=await run('شغّل السيناريو المتحفظ');
  ok(r.v&&(r.v.sets||[]).some(s=>/B3$/.test(s[0])&&s[1]===2)&&near(r.v.out.levered_irr/100,G.downside[0],1e-4),'“شغّل السيناريو المتحفظ”: the switch to case 2 (متحفظ), levered IRR 9.39% (LibreOffice)',r.v&&{sets:r.v.sets,out:r.v.out});
  const u=await p.evaluate(()=>({n:XC_AR_NEG.test('انخفض الإيجار')&&!XC_AR_POS.test('انخفض الإيجار'),p:XC_AR_POS.test('زيادة التكلفة')&&!XC_AR_NEG.test('زيادة التكلفة'),d:arNorm('٧٫٥٪ و ١٬٢٥٠')}));
  ok(u.n&&u.p&&u.d==='7.5% و 1,250','the direction words and the Arabic number signs are read as such',u);
  // an Arabic question to the agent: its instructions carry the Arabic terms, and the answer is laid out right to left
  await p.evaluate(()=>{toggleDock(true);webAsk('ما هو معدل العائد الداخلي بعد التمويل؟')});await p.waitForFunction(()=>{const b=[...document.querySelectorAll('#msgs .msg.agent .body')].pop();return b&&/24\.49/.test(b.textContent)},null,{timeout:60000}).catch(()=>{});
  const chat=await p.evaluate(()=>{const u=[...document.querySelectorAll('#msgs .msg.user')].pop(),a=[...document.querySelectorAll('#msgs .msg.agent .body')].pop();return{u:u&&u.getAttribute('dir'),a:a&&a.getAttribute('dir'),t:a&&a.textContent}});
  ok(/Modern Standard Arabic/.test(SEEN.agent)&&/معدل العائد الداخلي/.test(SEEN.agent)&&/نسبة تغطية خدمة الدين/.test(SEEN.agent)&&/Western digits/.test(SEEN.agent),'the agent is told how to write Arabic: Saudi finance terms, Western digits, cell references in Latin characters',SEEN.agent.slice(SEEN.agent.indexOf('In Arabic'),SEEN.agent.indexOf('In Arabic')+200));
  ok(chat.u==='rtl'&&chat.a==='rtl'&&/24\.49%/.test(chat.t),'the Arabic question and the Arabic answer are laid out right to left',chat);
  // with no AI connected, an Arabic question is not guessed at by the English rules
  const noai=await p.evaluate(async()=>{const k={...AI.keys};AI.keys.anthropic='';AI.keys.openai='';const was=window.apiOn;try{const r=await execute('ماذا لو انخفض الإيجار ١٠٪؟','web','Investment Director',async()=>{});return r.out.plain}finally{AI.keys.anthropic=k.anthropic;AI.keys.openai=k.openai}});
  ok(/no AI is connected/.test(noai)&&/الذكاء الاصطناعي/.test(noai),'with no AI connected, an Arabic question gets a plain answer in both languages, and the rules guess nothing',noai);
  ok(errs.length===0,'no page errors (Kinan edition)',errs.join(' | '));await p.close()}

// ---- the Jadwa edition: the Arabic murabaha agreement, as a Word file and as a PDF ----
{const {p,SEEN,errs}=await open(true);
  await p.evaluate(()=>showTab('em'));await p.waitForTimeout(600);
  await p.setInputFiles('#docFile',[D+'murabaha_ar.docx']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===1,null,{timeout:120000}).catch(()=>{});
  const doc=await p.evaluate(()=>{const d=(DOCS[PROJ.id]||[])[0];return d?JSON.parse(JSON.stringify(d)):null});
  ok(doc&&doc.kind==='fund'&&doc.category==='financing'&&doc.type==='murabaha facility agreement'&&doc.lang==='ar'&&doc.provisions.length===5,'the AI classifies the Arabic Word file as a financing agreement and reads five provisions, each on its quote',doc&&{cat:doc.category,type:doc.type,lang:doc.lang,n:doc.provisions&&doc.provisions.length,limits:doc.limits});
  ok(SEEN.contract.length===2&&SEEN.contract.every(z=>/\[page \d+ · §2\.2\]/.test(z.u)&&/٧٫٥٪/.test(z.u)),'both readers get the Arabic text by clause (§2.2), its Arabic-Indic digits as written',SEEN.contract.map(z=>z.u.slice(0,120)));
  ok(doc&&doc.provisions.every(z=>z.lab&&!z.loose)&&doc.provisions[4].oneReader,'every quote stands word for word in its clause; the provision only one reader gave is kept with its reader named',doc&&doc.provisions.map(z=>[z.lab,z.loose,z.oneReader]));
  const R=doc?Object.fromEntries(doc.reg.map(r=>[r.key,r])):{};const st=k=>R[k]&&R[k].status;
  ok(st('prov:1')==='within the limit'&&/50/.test(R['prov:1'].model),'loan to cost at most 50%: the model’s 50% is within the limit',R['prov:1']&&{st:st('prov:1'),model:R['prov:1'].model});
  ok(st('prov:2')==='differs'&&/7/.test(R['prov:2'].model)&&R['prov:2'].effect&&near(R['prov:2'].effect.net,G.rate75[0],1e-9),'the profit rate is 7% in the model, ٧٫٥٪ in the agreement; corrected: levered IRR 23.78% (LibreOffice)',R['prov:2']&&{model:R['prov:2'].model,effect:R['prov:2'].effect});
  ok(st('prov:3')==='later than the agreement'&&/does not exist/.test(R['prov:3'].note)&&/29 days/.test(R['prov:3'].note)&&/27 October 2030/.test(R['prov:3'].note)&&/28 October 2030/.test(R['prov:3'].note)&&/2031/.test(R['prov:3'].model),'30 Jumada al-Akhirah 1452 does not exist (29 days by Umm al-Qura): it means 27 or 28 October 2030, and the model repays in 2031, later either way',R['prov:3']&&{model:R['prov:3'].model,note:R['prov:3'].note});
  ok(st('prov:4')==='breached in 2 periods'&&R['prov:4'].breaches.map(z=>z.per).join()==='2029,2030'&&near(R['prov:4'].breaches[0].v/100,G.bal_cost[2],1e-9)&&near(R['prov:4'].breaches[1].v/100,G.bal_cost[3],1e-9),'the balance covenant: the model’s own line is above 50% in 2029 (54.88%) and 2030 (58.72%), as LibreOffice gives them',R['prov:4']&&{note:R['prov:4'].note,b:R['prov:4'].breaches});
  ok(st('prov:5')==='not in the model'&&st('fee:arrangement fee')==='not in the model','governing law and the arrangement fee: not in the model, said so',[st('prov:5'),st('fee:arrangement fee')]);
  ok(/Other provisions:\n1: Loan to cost limit — max 50%/.test(SEEN.map||'')&&/4: Balance covenant — row_max 50%/.test(SEEN.map||''),'the mapping call is given each provision with what it checks',(SEEN.map||'').slice((SEEN.map||'').indexOf('Other provisions'),(SEEN.map||'').indexOf('Other provisions')+260));
  const html=await p.evaluate(()=>document.querySelector('#docList').innerHTML);const txt=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(/financing agreement \(murabaha facility agreement\)/.test(txt)&&/§2\.2/.test(txt)&&/dir="auto"[^>]*>“يستحق للمموّل/.test(html)&&/capitalised: the model’s profit rate must be 7\.5%/.test(txt)&&/breached in 2 periods/.test(txt)&&/later than the agreement/.test(txt),'the Documents card: the contract’s kind, clauses, Arabic quotes laid out in their own direction, each implication, the breaches and the date',txt.slice(0,400));
  // the same agreement as a PDF: the readers quote correct Arabic; the PDF's text has letters out of order, so the quotes hold word by word on letters
  await p.setInputFiles('#docFile',[D+'murabaha_ar.pdf']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===2,null,{timeout:120000}).catch(()=>{});
  const pdf=await p.evaluate(()=>{const d=(DOCS[PROJ.id]||[])[1];return d?JSON.parse(JSON.stringify(d)):null});
  const pt=await p.evaluate(async b64=>{const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const pg=await docPdfText(bin.buffer,5);return pg.map(z=>z.text).join('\n')},fs.readFileSync(D+'murabaha_ar.pdf').toString('base64'));
  ok(!pt.includes(Q.ltc.slice(0,40))&&/خمسني|تسهيالت|يلزتم/.test(pt),'the PDF’s text has the usual Arabic artefacts (خمسين as خمسني, تسهيلات as تسهيالت): no quote is found in it word for word',pt.slice(0,200));
  ok(pdf&&pdf.provisions.length===5&&pdf.provisions.filter(z=>z.loose).length>=4,'yet every provision is proved on the PDF, each quote word for word on the letters its words hold',pdf&&pdf.provisions.map(z=>[z.topic,z.loose]));
  const PR=pdf?Object.fromEntries(pdf.reg.map(r=>[r.key,r])):{};
  ok(PR['prov:2']&&PR['prov:2'].status==='differs'&&PR['prov:4']&&PR['prov:4'].status==='breached in 2 periods'&&PR['prov:3']&&PR['prov:3'].status==='later than the agreement','the PDF gives the same findings as the Word file',pdf&&pdf.reg.map(r=>r.key+':'+r.status));
  const neg=await p.evaluate(t=>({other:docArProve(t,'يلتزم المموّل بتوفير تسهيل مرابحة لا يتجاوز مبلغه ستين بالمائة (60%) من إجمالي تكلفة المشروع'),short:docArProve(t,'خمسين بالمائة')}),pt);
  ok(!neg.other&&!neg.short,'a quote with one word changed (ستين for خمسين, 60%) is not proved on the PDF, nor a short phrase',neg);
  const u=await p.evaluate(()=>({rev:docQuoteNum('بمعدل ٥٫٧٪ سنوياً',7.5),ok:docQuoteNum('بمعدل ٧٫٥٪ سنوياً',7.5),amt:docQuoteNum('رسوم قدرها ١٬٥٠٠٬٠٠٠ ريال',1500000),words:docQuoteNum('خمسين بالمائة من التكلفة في عام 2027',50),miss:docQuoteNum('at 8% a year from 2027',9),
    h:[hijriToGreg(1452,6,29),hijriToGreg(1452,7,1),hijriToGreg(1452,6,30),hijriToGreg(1447,9,1)],ppy:fundPPY({per:[1449,1450,1451]})}));
  ok(!u.rev.ok&&/reverse/.test(u.rev.why)&&u.ok.ok&&u.amt.ok&&u.words.ok&&!u.miss.ok,'a value is checked against the numbers its clause writes: a number whose digits a PDF may have reversed (٥٫٧ read as 7.5) is put to the user; a value written only in words is not flagged',u);
  ok(u.h.join()==='2030-10-27,2030-10-28,,2026-02-18','Hijri days by the Umm al-Qura calendar: 29 Jumada al-Akhirah 1452 = 27 October 2030, 1 Rajab = 28 October, 30 Jumada al-Akhirah 1452 none, 1 Ramadan 1447 = 18 February 2026',u.h);
  ok(near(u.ppy,365.2425/354.36707,1e-12),'a timeline in Hijri years: an annual rate compounds over 1.0307 of its periods',u.ppy);
  const md=await p.evaluate(()=>fundAnswer('').plain);
  ok(/murabaha_ar\.docx/.test(md)&&/Profit rate/.test(md)&&/breached in 2 periods/.test(md)&&/23\.78%/.test(md),'the chat answers from the register: what differs, the breaches and the corrected IRR',md.slice(0,300));
  await p.evaluate(()=>document.querySelector('[data-fundapply]').click());await p.waitForFunction(()=>{const x=latestExport();return (MVERS[PROJ.id]||[]).some(v=>!v.base&&v.ex===x.id&&v.src&&/murabaha_ar/.test(v.src.doc))},null,{timeout:120000}).catch(()=>{});
  const v=await p.evaluate(()=>{const x=latestExport();return (MVERS[PROJ.id]||[]).filter(z=>!z.base&&z.ex===x.id).pop()||null});
  ok(v&&v.src&&(v.sets||[]).length===1&&/B12$/.test(v.sets[0][0])&&near(v.sets[0][1],0.075)&&near(v.out.levered_irr/100,G.rate75[0],1e-4),'applied: the profit rate set to 7.5% on the workbook, levered IRR recalculated to 23.78%, the version naming the agreement',v&&{sets:v.sets,out:v.out,label:v.label});
  ok(errs.length===0,'no page errors (Jadwa edition)',errs.join(' | '));await p.close()}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
