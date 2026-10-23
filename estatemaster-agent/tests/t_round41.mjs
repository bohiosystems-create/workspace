// Round 41, a harder CIO day (fixtures-free words: six hard models in KINAN, a chain of changes to one Jadwa model). What it found, each checked:
//  - a workbook whose formulas carry no stored results (written by a script) was refused as "no returns sheet": its empty results (<v/>)
//    were not recognised; it is now recalculated once on upload and the user told (fixtures/gen/gen_r41cio.py, LibreOffice golden)
//  - a returns page headed "KEY RETURN METRICS" named the project; a Tokyo hotel and a London care home were asked the Saudi / UAE question;
//    a 1.35% yen loan rate was flagged as outside 2–15%
//  - the debug called "Purchase price" up → IRR down and "Loan to cost" up → IRR up likely errors (a price paid is a cost; leverage has no
//    right direction) and flagged a hold in whole years as a broken threshold
//  - "sell in month 30, 36 or 42" was rounded to years, and a sale timed after completion past the model's end was shown as the best exit
//  - a conversion that converted nothing showed yen figures under SAR
//  - a report created with a name became "Custom report", and a report named that does not exist was swapped for the IC pack
//  - a question asked while the agent was answering was dropped
//  - Jadwa: the extension answer said "not computed" for figures it had, and no warning when the longer cash flow changes sign twice;
//    "Make this the model" showed no figures; a new line did not shift a map row named without quotes; verdicts did not follow a model
//    into its new version; there was no way back to an earlier workbook, and "which versions are kept" did not say where
// The AI is a stand-in (no API credit): it makes the calls a strong model would make; every figure is the workbook's.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/r41_palm.json',import.meta.url),'utf8'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,600):''))};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Number.isFinite(e)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const MAP_AR={headlines:[{key:'levered_irr',cell:"'العوائد'!B3",label:'معدل العائد الداخلي بعد التمويل',definition:'equity IRR'},{key:'unlevered_irr',cell:"'العوائد'!B4",label:'معدل العائد الداخلي قبل التمويل',definition:'project IRR'},{key:'net_profit',cell:"'العوائد'!B5",label:'صافي الربح',definition:'profit'}],
  units:[{sheet:'التدفقات النقدية',scale:1,currency:'SAR',evidence:"'التدفقات النقدية'!A1"}],scenario:{switch:"'المدخلات'!B3",names:['أساسي','متحفظ']},timeline:{sheet:'التدفقات النقدية',period:'year',first:"'التدفقات النقدية'!C3",count:5},cashflows:[{irr:'levered_irr',row:"'التدفقات النقدية'!C18:G18"}],hold:{cell:"'المدخلات'!B13",unit:'years'}};
const Q={ltc:'يلتزم المموّل بتوفير تسهيل مرابحة لا يتجاوز مبلغه خمسين بالمائة (50%) من إجمالي تكلفة المشروع',rate:'يستحق للمموّل ربح المرابحة بمعدل ٧٫٥٪ سنوياً على الرصيد القائم',
  repay:'يلتزم العميل بسداد كامل رصيد التسهيل والأرباح المستحقة في موعد أقصاه ٣٠ جمادى الآخرة ١٤٥٢هـ',cov:'يتعهد العميل بألا يتجاوز رصيد التسهيل شاملاً الأرباح المرسملة خمسين بالمائة (50%) من إجمالي تكلفة المشروع في أي وقت'};
const PROV=[{topic:'Loan to cost limit',clause:'2.1',quote:Q.ltc,quote_en:'The financier shall provide a murabaha facility not exceeding fifty per cent (50%) of the total project cost',implication:'The model’s loan to cost must not exceed 50%.',check:{type:'max',value:50,unit:'%'}},
  {topic:'Profit rate',clause:'2.2',quote:Q.rate,quote_en:'Murabaha profit is due to the financier at 7.5% a year on the outstanding balance',implication:'The model’s profit rate must be 7.5%.',check:{type:'value',value:7.5,unit:'%'}},
  {topic:'Final repayment date',clause:'3.1',quote:Q.repay,quote_en:'The client shall repay the full facility balance and accrued profit no later than 30 Jumada al-Akhirah 1452 AH',implication:'Repayment must fall by the final date.',check:{type:'date',date:'2030-10-28',date_kind:'by',calendar:'hijri',hijri:{y:1452,m:6,d:30}}},
  {topic:'Balance covenant',clause:'3.2',quote:Q.cov,quote_en:'The client undertakes that the facility balance, including capitalised profit, shall not exceed fifty per cent (50%) of the total project cost at any time',implication:'The balance to cost line must stay within 50% every year.',check:{type:'row_max',value:50,unit:'%'}}];
async function open(jadwa){const S={plan:[],read:[],reads:[],calls:[],audit:null,lastAudit:'',spec:null,final:null};const DB={cfg:{configured:true,role:'editor'},fail:false,saved:[],posts:0};
  const ctx=await b.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),p=await ctx.newPage();if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
  await p.route('**/api/store*',async r=>{const q=r.request();if(q.method()==='GET')return DB.cfg?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,user:'cio',ws:'jadwa',...DB.cfg})}):r.fulfill({status:404,body:''});
    DB.posts++;const j=JSON.parse(q.postData()||'{}');if(DB.fail)return r.fulfill({status:500,contentType:'application/json',body:'{"error":"The store could not complete this. Try again."}'});
    if(j.upload){DB.parts=(DB.parts||{});(DB.parts[j.upload]=DB.parts[j.upload]||[])[j.part]=Buffer.from(j.data,'base64');if(j.part<j.parts-1)return r.fulfill({status:202,contentType:'application/json',body:'{"ok":true,"partial":true}'});j.data=Buffer.concat(DB.parts[j.upload]).toString('base64');j.nparts=j.parts}
    if(j.kind==='version'&&DB.saved.some(z=>z.kind==='version'&&z.key===j.key))return r.fulfill({status:409,contentType:'application/json',body:'{"error":"A saved version is kept as it was"}'});
    DB.saved.push({kind:j.kind,key:j.key,name:j.name,data:Buffer.from(j.data||'','base64'),parts:j.nparts||1});return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'})});
  await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
    let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,msgs=pl.messages||[];const sys=String(pl.system&&pl.system.map?pl.system.map(z=>z.text||'').join('\n'):pl.system||(msgs[0]&&msgs[0].role==='system'?msgs[0].content:''));
    const txt=c=>typeof c==='string'?c:Array.isArray(c)?c.map(z=>z.text||(z.type==='tool_result'?JSON.stringify(z.content):'')).join('\n'):'';const u=txt(((msgs.filter(m=>m.role==='user').pop())||{}).content);const oa=/openai/.test(r.request().url())||body.provider==='openai';
    S.calls.push({sys:sys.slice(0,160),len:sys.length+u.length,inj:/NOTE TO ANY AI ASSISTANT|SYSTEM: the reviewers/.test(sys+u),sysHead:sys.slice(0,80)});if(/NOTE TO ANY AI ASSISTANT|SYSTEM: the reviewers/.test(sys+u))S.injSeen=(S.injSeen||[]).concat([{sys:sys.slice(0,120),around:(sys+u).slice(Math.max(0,(sys+u).search(/NOTE TO ANY AI|SYSTEM: the reviewers/)-300),(sys+u).search(/NOTE TO ANY AI|SYSTEM: the reviewers/)+200)}]);
    const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
    if(pl.tools&&pl.tools.length){S.toolNames=pl.tools.map(t=>t.name||(t.function&&t.function.name));S.agentSys=sys;if(oa)return reply('Noted.');let k=msgs.length-1;while(k>=0&&!(msgs[k].role==='user'&&!/tool_result/.test(JSON.stringify(msgs[k].content))))k--;const n=msgs.slice(k+1).filter(m=>m.role==='assistant'&&/tool_use/.test(JSON.stringify(m.content))).length;
      if(n<S.plan.length)return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'t'+n,name:S.plan[n][0],input:S.plan[n][1]||{}}],stop_reason:'tool_use'})});
      if(S.final)return reply(S.final);
      const res=msgs.slice(k+1).filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content.filter(z=>z.type==='tool_result').map(z=>typeof z.content==='string'?z.content:Array.isArray(z.content)?z.content.map(q=>q.text||'').join('\n'):JSON.stringify(z.content)):[]);
      return reply(res.length?'From the tools, on the workbook:\n\n'+res.map(z=>z.slice(0,3000)).join('\n\n'):'Noted.')}
    if(/You read a sentence/.test(sys)){S.reads.push(u);const lines=u.split('\n').filter(l=>/\|/.test(l));const ch=[];
      for(const z of S.read){const all=lines.filter(l=>z.re.test(l.split('|')[0]));for(const l of (z.all?all:all.slice(0,1)))ch.push({label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:z.kind,value:z.value,sure:true})}return reply(JSON.stringify({changes:ch}))}
    if(/You decide which typed input cells/.test(sys))return reply('{"complete":true,"add":[],"drop":[],"why":"ok"}');
    if(/You set the range over which each input/.test(sys)){const out=[];for(const m of u.matchAll(/^((?:'[^']+'|[^\s|!]+)![A-Z]+\d+) \| ([^|]+) \| .*units allowed: ([a-z]+)/gm))out.push({cell:m[1],unit:m[3],down:m[3]==='bps'?50:m[3]==='periods'?1:5,up:m[3]==='bps'?50:m[3]==='periods'?1:5,why:'typical'});return reply(JSON.stringify({ranges:out}))}
    if(/You map the structure of a real estate financial model laid out as a grid of cells\. Each line/.test(sys))return reply(/العوائد/.test(u)?JSON.stringify(MAP_AR):/Business Bay/.test(u)?JSON.stringify({headlines:[{key:'unlevered_irr',cell:'Returns!B3',label:'Unlevered IRR',definition:'project IRR'},{key:'net_profit',cell:'Returns!B4',label:'Net profit',definition:'profit'}],jurisdiction:{value:'UAE_ONSHORE',confidence:'high',evidence:[{cell:'Inputs!B2',text:'Business Bay, Dubai'}]}}):'{}');
    if(/You classify a document/.test(sys))return reply(JSON.stringify({contract:true,category:'financing',doc_type:'murabaha facility agreement',language:'ar'}));
    if(/You read a contract that governs/.test(sys)){const sec=q=>{const m=[...u.matchAll(/\[page (\d+)(?: · §([^\]]+))?\]\n([\s\S]*?)(?=\n\n\[page |\s*$)/g)].find(z=>z[3].includes(q.slice(0,25)));return m?+m[1]:1};
      return reply(JSON.stringify({doc_type:'murabaha facility agreement',fund:'',parties:'Al Riyada Bank and Al Narjis Development',terms:[],definitions:[],fund_kind:'other',provisions:PROV.map(z=>({...z,page:sec(z.quote)}))}))}
    if(/You map the terms of a fund agreement/.test(sys))return reply(JSON.stringify({cells:{},provisions:{1:{cell:'المدخلات!B11'},2:{cell:'المدخلات!B12'},3:{row:'التدفقات النقدية|15'},4:{row:'التدفقات النقدية|17'}},rows:{}}));
    if(/You fix a financial model/.test(sys)){const decided=/prov:4: Lower loan to cost to 42%/.test(u);
      return reply(JSON.stringify({fixes:[{finding:'prov:2',kind:'set',cell:'المدخلات!B12',value:0.075,why:'The agreement sets the profit rate at 7.5% a year.'}].concat(decided?[{finding:'prov:4',kind:'set',cell:'المدخلات!B11',value:0.42,why:'As decided: loan to cost 42%.'}]:[]),
        decisions:decided?[]:[{finding:'prov:4',question:'How should the balance stay within 50% of cost?',options:['Lower loan to cost to 42%','Inject equity instead']}],cannot:[]}))}
    if(/senior financial-modelling reviewer/.test(sys)){S.lastAudit=u;return reply(JSON.stringify(S.audit||{read_ok:true,read_note:'read',items:[],observations:[]}))}
    if(/second reviewer/.test(sys))return reply(JSON.stringify({verdicts:[...u.matchAll(/(\d+)\. \[(\w+), \w+\]/g)].map(m=>({i:+m[1],verdict:'confirmed',same_as:null,reason:'checked'}))}));
    if(/report designer|You design a report|design reports/i.test(sys)&&S.spec)return reply(JSON.stringify(S.spec));
    if(/exchange rate|currency rate/i.test(sys))return reply('{}');
    if(/You audit an exact|You review|You check a feasibility/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[],"ok":true,"issues":[]}');
    if(/You audit the arithmetic|independent checker/.test(sys))return reply('{"items":[],"verdict":"agree"}');
    if(/You plan behaviour tests/.test(sys))return reply('{"probes":[]}');
    if(/translat/i.test(sys))return reply(u);
    return reply('{}')});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
  const up=async(f,o={})=>{const path=f.startsWith('/')?f:F+f;await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',path);await p.waitForSelector('#npCreate:not([disabled])',{timeout:90000}).catch(()=>{});await p.click('#npCreate');
    await p.waitForFunction(()=>{const x=latestExport();return x&&x.map},null,{timeout:o.wait||120000}).catch(()=>{});await p.waitForTimeout(o.extra||1500);
    return p.evaluate(async()=>{const x=latestExport();let e=null;try{e=await xcEngine(x)}catch(z){}return{id:x.id,file:x.file,name:PROJ.name,proj:PROJ.id,out:x.out,eng:e&&{ok:e.ok,pct:e.pct},checks:(typeof exportChecks==='function'?exportChecks(x):[]).filter(c=>c.level!=='ok').map(c=>c.level+': '+c.text).slice(0,8),map:x.map&&x.map.proof,jur:x.jurisdiction,jurAsk:!!x.jurAsk}})};
  const ask=async(step,text,o={})=>{S.plan=o.plan||[];S.read=o.read||[];S.final=o.final||null;const n0=await p.evaluate(()=>document.querySelectorAll('#msgs .msg.agent').length);
    await p.evaluate(t=>{toggleDock(true);webAsk(t)},text);await p.waitForTimeout(400);await p.waitForFunction(()=>!busy,null,{timeout:o.wait||300000}).catch(()=>{});await p.waitForTimeout(o.settle||1800);
    const a=await p.evaluate(n0=>{const M=[...document.querySelectorAll('#msgs .msg.agent')].slice(n0);return{t:M.map(m=>m.innerText).join('\n'),h:M.map(m=>m.innerHTML).join('\n')}},n0);return a};
  const ev=async(step,fn,arg)=>{let x;try{x=await p.evaluate(fn,arg)}catch(e){x={error:e.message}}return x};
  return{p,S,DB,errs,up,ask,ev}}

// ================= KINAN =================
{const {p,S,errs,up,ask}=await open(false);
  const pm=await up('r41_palm_usd.xlsx');const note=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n'));
  ok(near(pm.out.levered_irr/100,G.palm_base[0],1e-6)&&near(pm.out.net_profit,G.palm_base[2],1e-6)&&/saved without its formulas’ results/.test(note),'a workbook written by a script (formulas with no stored results) becomes a project: recalculated once, the user told, levered IRR 75.01% as LibreOffice gives it',pm.out);
  const r35=await up('r35_dev_monthly_usd.xlsx');ok(r35.name==='HARBOUR VIEW RETAIL (USD)','a returns page headed “KEY RETURN METRICS” does not name the project: the scheme’s own title does',r35.name);
  const r25=await up('r25_hotel_jpy.xlsx');ok(r25.jur==='other'&&!r25.jurAsk&&!r25.checks.some(c=>/Loan rate/.test(c)),'a Tokyo hotel is not asked the Saudi / UAE question, and a 1.35% yen loan rate is not out of range',r25);
  const r18=await up('r18_sculpt_gbp.xlsx');ok(r18.jur==='other'&&!r18.jurAsk,'nor a London care portfolio');
  let a=await ask('debug','Debug this model.',{plan:[['check_estatemaster_export',{}]],wait:400000});
  ok(/Model debug of r18_sculpt_gbp/.test(a.t)&&!/Purchase price[^\n]*should move it the other way/.test(a.t)&&!/move of “Hold \(years\)”/.test(a.t),'the debug does not call a purchase price moving the IRR down a likely error, nor flag a hold in whole years as a threshold',a.t.slice(0,500));
  await p.evaluate(id=>switchProject(id),r35.proj);
  a=await ask('months','What is the IRR if we sell in month 30, 36 or 42?',{plan:[['hold_sell_curve',{from_year:2.5,to_year:3.5}]]});
  ok(/2\.5 \(month 30\)/.test(a.t)&&/3\.5 \(month 42\)/.test(a.t)&&/the sale falls after the model’s last period/.test(a.t)&&!/\d\.\d{6,}/.test(a.t)&&!/Best exit on [^:]+: year 3 \(-/.test(a.t),'months 30, 36 and 42 are run as asked, and a sale past the model’s end is said so, never shown as the best exit',a.t.slice(0,500));
  await p.evaluate(id=>switchProject(id),r25.proj);
  a=await ask('fx','Use 0.0245 SAR per yen.',{plan:[['convert_currency',{to:'SAR',rate:0.0245}]]});
  ok(/Nothing was converted/.test(a.t)&&!/SAR 14,014/.test(a.t),'a conversion that converts nothing says so, and never shows yen figures under SAR',a.t.slice(0,300));
  S.spec=null;a=await ask('report','A board pack across the portfolio.',{plan:[['create_report',{name:'Board pack · portfolio',blocks:['kpis','wb_factsheet']}]],wait:300000});
  const rn=await p.evaluate(()=>Object.values(RPTS).map(r=>r.name));
  a=await ask('report2','Build the quarterly LP pack.',{plan:[['build_report',{kind:'Quarterly LP pack'}]]});
  ok(rn.includes('Board pack · portfolio')&&/There is no report called “Quarterly LP pack”/.test(a.t)&&!/Investment Committee pack ready/.test(a.t),'a report keeps the name it was created with, and a report that does not exist is said so, not swapped for the IC pack',{rn:rn.slice(-3),t:a.t.slice(0,200)});
  S.plan=[];await p.evaluate(()=>{toggleDock(true);busy=true;webAsk('And the net profit?');setTimeout(()=>{busy=false},1500)});   /* asked while another answer is running */
  await p.waitForFunction(()=>{const M=[...document.querySelectorAll('#msgs .msg')];const i=M.findIndex(m=>/And the net profit\?/.test(m.innerText));return i>=0&&M.slice(i+1).some(m=>/agent/.test(m.className)&&/Worked/.test(m.innerText))},null,{timeout:120000}).catch(()=>{});await p.waitForTimeout(1000);
  const qs=await p.evaluate(()=>{const M=[...document.querySelectorAll('#msgs .msg')];const i=M.findIndex(m=>/And the net profit\?/.test(m.innerText));const A=M.slice(i+1).filter(m=>/agent/.test(m.className));return{user:i>=0,noted:A.some(m=>/Noted: I answer this/.test(m.innerText)),answered:A.some(m=>/Worked/.test(m.innerText))}});
  ok(qs.user&&qs.noted&&qs.answered,'a question asked while the agent is answering is kept and answered next, not dropped',qs);
  ok(!(S.toolNames||[]).includes('restore_version')&&!(S.toolNames||[]).includes('extend_cashflow'),'KINAN is not offered the tools that change a model’s structure, nor going back to an earlier workbook');
  ok(errs.length===0,'KINAN: no page errors',errs.join(' | '))}

// ================= Jadwa: a chain of changes, each earlier workbook kept =================
{const {p,S,DB,errs,up,ask}=await open(true);
  const a0=await up('ar_dev.xlsx');await p.evaluate(()=>{const x=latestExport();const e=document.querySelector(`[data-jurset="${x.id}|KSA_CMA"]`);if(e)e.click()});
  const orig=fs.readFileSync(F+'ar_dev.xlsx');
  let a=await ask('extend','Extend the cash flow by 2 years.',{plan:[['extend_cashflow',{years:2}]],wait:300000});
  a=await ask('extend2','Zero for the sales after the last year, and move the exit to the new last year.',{plan:[['extend_cashflow',{years:2,constants:'zero',exit:'move'}]],wait:300000});
  const v1=DB.saved.find(z=>z.kind==='version'&&!/ record$/.test(z.key));
  ok(v1&&v1.data.equals(orig)&&/kept in the company database as “ar_dev v1/.test(a.t),'before the extension the model as it was is kept in the company database, byte for byte, and the answer says so',v1&&v1.key);
  ok(/Extended by 2 years: Levered IRR 24\.49% → \d/.test(a.t)&&!/not computed/.test(a.t)&&/changes sign 2 times/.test(a.t),'the extension answer gives its figures at once, and warns that the longer cash flow to equity changes sign twice (its IRR is not unique)',a.t.slice(0,700));
  S.audit={read_ok:true,read_note:'read',items:[{kind:'risk',severity:'medium',title:'Repayment falls after the agreement date',evidence:"'التدفقات النقدية'!G15 repays in 2031",cell:"'التدفقات النقدية'!G15",recommendation:'repay by 2030 or extend'}],observations:[]};
  await p.evaluate(()=>{latestExport().audit=null});await ask('debug','Debug this model.',{plan:[['check_estatemaster_export',{}]],wait:400000});
  await ask('verdict','The 2031 repayment is agreed with the bank: not an issue.',{plan:[['debug_feedback',{cell:"'التدفقات النقدية'!G15",verdict:'false_alarm',why:'agreed with the bank'}]]});
  a=await ask('line','Add an arrangement fee line like the development management fee.',{plan:[['add_model_line',{copy_of:'رسوم إدارة التطوير',label:'رسوم الترتيب',sheet:'التدفقات النقدية',copy_values:true}]],wait:300000});
  const ln=await p.evaluate(()=>{const x=latestExport();return{file:x.file,out:x.out,cf:((x.map||{}).cashflows||[]).map(c=>c.row),ver:(x.auUser||[]).map(q=>q.cell)}});
  ok(/رسوم الترتيب added/.test(ln.file)&&Number.isFinite(ln.out.levered_irr)&&ln.cf.every(r=>/19:/.test(r))&&ln.ver.includes("'التدفقات النقدية'!G16"),'a new line above them moves the map’s cash-flow row and the CIO’s verdict down with it (row 18 → 19, G15 → G16)',ln);
  const before=await p.evaluate(()=>latestExport().id);
  a=await ask('undo','Go back to the model before the new line.',{plan:[['restore_version',{version:'previous'}]],wait:300000});
  const rs=await p.evaluate(()=>{const x=latestExport();return{id:x.id,from:x.restoredFrom,out:x.out,par:(EXPORTS.find(z=>z.id===x.restoredFrom)||{}).out}});
  ok(rs.from&&rs.id!==before&&near(rs.out.levered_irr,rs.par.levered_irr,1e-9)&&/is the model again/.test(a.t)&&DB.saved.filter(z=>z.kind==='version'&&!/ record$/.test(z.key)).length===3,'“go back” makes the earlier workbook the model again, with its own figures, and keeps the one it replaces first',rs);
  a=await ask('versions','Which versions of this model are kept, and where?',{plan:[['compare_versions',{}]]});
  ok(/The model’s workbooks, oldest first: .*ar_dev\.xlsx \(kept in the company database as “ar_dev v1/.test(a.t)&&/\(the model now\)/.test(a.t),'“which versions are kept” lists every workbook of the model and where each is kept',a.t.slice(0,400));
  a=await ask('refi','Add a refinance at 60% LTV in year 4 at 7%, cap rate 7.5%.',{plan:[['add_structure',{structure:'refinance',year:'4',ltv:60,rate:7,cap_rate:7.5}]],wait:300000});
  ok(/no value line and no net operating income line/.test(a.t)&&/7\.5% cap rate has nothing to value/.test(a.t),'a refinance on a development sold in parts asks for the line it is valued on, not for the cap rate the user gave',a.t.slice(0,300));
  a=await ask('whatif','What if the sale price drops 5%?',{plan:[['test_assumptions',{changes:['سعر البيع -5%']}]],read:[{re:/سعر البيع/,kind:'pct',value:-5}]});
  const vv=await p.evaluate(()=>window.LASTVER);await p.evaluate(v=>addMsg('agent',xlBtn(v)),vv);await p.click('#msgs .msg.agent:last-child [data-mvpush]');
  await p.waitForFunction(()=>/is now the model|Not changed/.test(([...document.querySelectorAll('#msgs .msg.agent')].pop()||{}).innerText||''),null,{timeout:120000}).catch(()=>{});
  const pu=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].pop().innerText);
  ok(/is now the model/.test(pu)&&/Levered IRR -?[\d.]+% → -?[\d.]+%/.test(pu),'“Make this the model” shows the figures of the new model',pu.slice(0,300));
  ok(errs.length===0,'Jadwa: no page errors',errs.join(' | '))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
