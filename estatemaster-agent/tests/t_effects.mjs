// Effects from the files, and meaning carried into what a builder writes, as properties over every tool that changes the model's
// structure (the app's own list, STRUCT_TOOLS: a new builder fails here until it has a case). After each change: the answer states what
// changed read from the two workbooks; every headline figure is the value at the model's own headline cell on the new workbook (one
// name, one figure); an overlay on a quarterly model reproduces the model's own IRR before giving its own; "move the exit" is said as it
// happened; charts speak the unit the user asked in.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
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
  const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),p=await ctx.newPage();if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
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
      for(const z of S.read){const all=lines.filter(l=>z.re.test(l.split('|')[0].trim()));for(const l of (z.all?all:all.slice(0,1)))ch.push({label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:z.kind,value:z.value,sure:true})}return reply(JSON.stringify({changes:ch}))}
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
  return{p,S,DB,errs,up,ask,ev,ctx}}





const {p,S,up,ask,errs}=await open(true);
const CASES={add_model_line:{q:'Add a penthouse unit type like the 3-bed: 12 units, 220 sqm, rent 19,500 a month.',a:{copy_of:'3-bed',label:'Penthouse',values:{'Units':12,'Size (sqm)':220,'Rent (a month)':19500}}},
  extend_cashflow:{q:'Extend the cash flow by 2 years and move the exit to the new end.',a:{years:2,exit:'move',constants:'hold'}},
  add_structure:{q:'Add zakat at 2.5% on positive equity cash flow.',a:{structure:'tax',rate:2.5,base:'equity_positive',label:'Zakat'}},
  quarterly_view:{q:'Show the cash flow in quarters.',a:{}},
  restore_version:{q:'Go back to the model before that.',a:{version:'previous'}}};
const ELSEWHERE={fix_model_to_contract:'t_fixcontract / t_round40 (a contract is needed)'};
const ST=await p.evaluate(()=>STRUCT_TOOLS.slice());
ok(ST.every(t=>CASES[t]||ELSEWHERE[t]),'every structure-changing tool has a case here (a new builder must get one)',ST.filter(t=>!CASES[t]&&!ELSEWHERE[t]));
await up('r43_btr_sar.xlsx',{wait:180000});
const headCheck=()=>p.evaluate(async()=>{const x=latestExport();await xcEngine(x);const ks=Object.keys(x.cells||{}).filter(k=>MET[k]&&x.cells[k]&&Number.isFinite(+(x.out||{})[k]));
  const v=await xcQ(()=>xcCall({op:'get',refs:ks.map(k=>x.cells[k])}));return ks.map((k,i)=>{const raw=v[i],o=+x.out[k],pct=a33Pct?a33Pct(k):/irr|on_cost/.test(k);const want=typeof raw==='number'?(pct?raw*100:raw):NaN;return{k,cell:x.cells[k],out:o,cellv:want,ok:Number.isFinite(want)&&(pct?Math.abs(o-want)<1e-4:Math.abs(o/want-1)<1e-6||Math.abs(o-want)<1e-6||Math.abs(o/(want*1000)-1)<1e-6)}})});
for(const t of ['add_model_line','extend_cashflow','add_structure','quarterly_view','restore_version']){const c=CASES[t];const n0=await p.evaluate(()=>EXPORTS.length);
  const a=await ask(t,c.q,{plan:[[t,c.a]],wait:400000});const made=await p.evaluate(n0=>EXPORTS.length>n0&&!!EXPORTS[EXPORTS.length-1].derivedFrom,n0);
  ok(!made||/What changed in the workbook, read from the two files/.test(a.t),`${t}: the answer states what changed, read from the two workbooks`,a.t.slice(-400));
  if(made){const H=await headCheck();ok(H.length&&H.every(h=>h.ok),`${t}: every headline figure is the value at the model's own headline cell on the new workbook`,H)}
  if(t==='extend_cashflow')ok(/stays at 28|Exit quarter \(Assumptions!C\d+ = 2[89]\)/.test(a.t)&&!/Exit moved to the new last period/.test(a.t),'“move the exit”: the answer says the sale stays at quarter 28, timed by its own input, and claims no move',a.t.slice(0,600));
  if(t==='add_structure')ok(/Equity IRR as modelled\s*\|?\s*24\.61%/.test(a.t)||/as modelled 24\.61%/.test(a.t),'a zakat overlay on a quarterly model reproduces the model’s own levered IRR (24.61%) before giving its own',a.t.slice(0,400))}
// charts speak the unit asked
const a=await ask('hold','Compare selling at quarter 24, 28 and 32 on the levered IRR.',{plan:[['hold_sell_curve',{points:[24,28,32],unit:'quarter'}]],wait:400000});
const ch=await p.evaluate(()=>{const s=[...document.querySelectorAll('#msgs .msg.agent')].pop();return s?s.innerText:''});
ok(/Quarter 24/.test(ch)&&!/Year 7\b/.test(ch),'a hold-vs-sell chart asked in quarters is labelled in quarters',ch.slice(-500));
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
