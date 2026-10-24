// The request contract, as properties over every tool the AI can call. Each tool is classified (a test fails on a tool nobody classified):
// the tools that read the model's figures run on the version the request asks for ("after that change", a currency the model was converted
// to), every engine run of the answer carrying that version's cells and the answer saying which version; without such words nothing is
// carried over; a project the user names is the one answered; a solved amount in a converted currency is the same solve times the rate.
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




const {p,S,up,ask}=await open(false);
// the inventory: every tool of the agent, classified
const ENGINE={solve_for_target:{assumption:'Stabilised ADR',metric:'levered_irr',target:7.6},hold_sell_curve:{points:[9,10],unit:'year'},sensitivity_grid:{x:{label:'Stabilised ADR',values:[700,780]},y:{label:'Stabilised occupancy',values:[70,74]},metric:'levered_irr'},
  tornado:{metric:'levered_irr',top:3,inputs:[{label:'Stabilised ADR'},{label:'Exit EBITDA multiple'}]},joint_sensitivity:{levers:[{label:'Stabilised ADR',down:5,up:5,unit:'pct',downside:'down'},{label:'Exit EBITDA multiple',down:5,up:5,unit:'pct',downside:'down'}],metric:'levered_irr',points:3},
  optimise:{lever:{label:'Loan to cost',min:40,max:60},objective:{metric:'levered_irr',goal:'max'},constraints:[]},monte_carlo:{variables:[{label:'Stabilised ADR',low:650,high:850}],metric:'levered_irr',runs:200},
  feasibility_study:{},trace_figure:{figure:'Levered IRR'},line_over_time:{lines:['Loan balance']}};
const STRUCT=['add_structure','add_model_line','shorten_cashflow','quarterly_view','restore_version','extend_cashflow','fix_model_to_contract','download_excel','test_assumptions','shift_timing','convert_currency','explain_return_change'];
const CROSS=['fund_combine','whatif_all_projects','compare_projects','regenerate_daily_report'];
const OTHER=['get_status','set_assumptions','reset_sandbox','check_in_estatemaster','search_model_lines','set_model_line','generate_stress_scenarios','verify_worst_scenarios','run_stress_tests','run_sensitivity','headroom','market_check','zoning_check','align_to_market','read_outlook','apply_email_changes','explain_change','schedule_report','send_report','build_report','create_report','design_report','estimate_scenario','export_assumptions','market_benchmark','set_jurisdiction','fund_compliance','document_terms','answer_clarification','compare_versions','debug_feedback','check_estatemaster_export','email_assumption_flags','estatemaster_results','estatemaster_sensitivity','make_chart','get_series','exchange_rate','play_report','query_data','extract_from_estatemaster','list_model_assumptions','set_model_assumption','capital_structure','calculate','set_location','set_hurdle','set_fund_terms','list_excel_files','read_excel','suggest_assumptions','napkin_feasibility','detail_napkin','napkin_to_model','create_model','list_approvals','promote_scenario'];
const names=await p.evaluate(()=>TOOLS.map(t=>t.name));const known=new Set([...Object.keys(ENGINE),...STRUCT,...CROSS,...OTHER]);
ok(names.every(n=>known.has(n)),'every tool of the agent is classified for the request contract (a new tool must be placed here)',names.filter(n=>!known.has(n)));
await up('r39_fund_waterfall_eur.xlsx',{wait:180000});await up('r41_hotel_aed.xlsx',{wait:180000});
// every engine message of an answer is recorded
await p.evaluate(()=>{window.ZZRUNS=[];const f=xcCall0;window.xcCall0=xcCall0=(m,o)=>{try{window.ZZRUNS.push(JSON.parse(JSON.stringify({op:m.op,runs:m.runs||null,refs:m.refs||null})))}catch(e){}return f(m,o)}});
const RD=[{re:/^Interest rate/,kind:'to',value:7.5}];
await ask('base','On Marina Bay, what if the interest rate is 7.5%?',{plan:[['test_assumptions',{changes:['Interest rate 7.5%']}]],read:RD});
const v=await p.evaluate(()=>window.CHAINVER);ok(/·V\d+$/.test(v||''),'a what-if is recorded as the version to follow up on',v);
/* a run carries the what-if when it holds its cell: at its value, or at a value the tool itself is testing for that cell */
const has702=r=>(r||[]).some(([c])=>/C\$?23$/.test(String(c)));const at75=r=>(r||[]).some(([c,val])=>/C\$?23$/.test(String(c))&&Math.abs(val-0.075)<1e-12);
for(const [tool,args] of Object.entries(ENGINE)){
  for(const follow of [true,false]){await p.evaluate(()=>{window.ZZRUNS=[]});
    const q=(follow?'After that change, ':'On the workbook as uploaded, ')+tool.replace(/_/g,' ')+'.';
    const a=await ask(tool,q,{plan:[[tool,args]],wait:300000});const R=await p.evaluate(()=>window.ZZRUNS);const runs=R.filter(m=>m.op==='run'),gets=R.filter(m=>m.op==='get');
    if(follow){const all=runs.length&&runs.every(m=>(m.runs||[]).every(has702))&&runs.some(m=>(m.runs||[]).some(at75));const noted=/is the workbook as it is, not/.test(a.t);
      ok((all&&!gets.length)||(!runs.length&&noted)||noted&&runs.every(m=>(m.runs||[]).every(has702)),`${tool}: after a what-if, every engine run of the answer carries it (${runs.length} runs, ${gets.length} plain reads)${noted?', and a part that cannot is said':''}`,{bad:runs.filter(m=>!(m.runs||[]).every(has702)).length,t:a.t.slice(0,200)});
      ok(new RegExp('on '+v.replace(/[·.]/g,'.')).test(a.t)||!runs.length,`${tool}: the answer says the version it is on (${v})`,a.t.slice(-300))}
    else ok(!runs.some(m=>(m.runs||[]).some(at75)),`${tool}: without follow-up words nothing of the last what-if is carried over`,runs.filter(m=>(m.runs||[]).some(at75)).length)}}
// a project the user names is the one answered
const pf=await p.evaluate(()=>Object.values(PROJECTS).find(z=>/AURORA/i.test(z.name)).id);await p.evaluate(id=>switchProject(id,true,true),pf);await p.waitForTimeout(1200);
let a=await ask('proj','What is the levered IRR of Marina Bay?',{plan:[['estatemaster_results',{}]]});
const now=await p.evaluate(()=>PROJ.name);ok(/MARINA/i.test(now)&&/7\.60%/.test(a.t)&&!/12\.07%/.test(a.t),'a project named from another page is the one answered, and the answer says so',{now,t:a.t.slice(0,240)});
await p.evaluate(id=>switchProject(id,true,true),pf);await p.waitForTimeout(1200);
a=await ask('cross','Compare Marina Bay and Aurora side by side.',{plan:[['compare_projects',{}]]});ok(await p.evaluate(id=>PROJ.id===id,pf),'a question across projects does not move the page');
// currency: a solve in the converted currency is the same solve times the rate
const ph=await p.evaluate(()=>Object.values(PROJECTS).find(z=>/MARINA/i.test(z.name)).id);await p.evaluate(id=>switchProject(id,true,true),ph);await p.waitForTimeout(1200);
const num=t=>+((t.match(/Stabilised ADR for Levered IRR = 10\.00%: ([\d,.]+)/)||[])[1]||'').replace(/,/g,'');
a=await ask('aed','What ADR gives a 10% levered IRR?',{plan:[['solve_for_target',{assumption:'Stabilised ADR',metric:'levered_irr',target:10}]],wait:300000});const aed=num(a.t);
await ask('fx','Show Marina Bay in US dollars at 3.6725 dirhams to the dollar.',{plan:[['convert_currency',{to:'USD',from:'AED',rate:1/3.6725}]],wait:300000});
a=await ask('usd','In dollars, what ADR gives a 10% levered IRR?',{plan:[['solve_for_target',{assumption:'Stabilised ADR',metric:'levered_irr',target:10}]],wait:300000});const usd=num(a.t);
ok(aed>0&&Math.abs(usd-aed/3.6725)<=0.01,`the ADR solved in dollars is the dirham ADR at the rate: ${usd} = ${aed} / 3.6725`,a.t.slice(0,240));
a=await ask('eur','In euros, what ADR gives a 10% levered IRR?',{plan:[['solve_for_target',{assumption:'Stabilised ADR',metric:'levered_irr',target:10}]],wait:300000});
ok(/Asked in EUR/.test(a.t),'a currency the model was never converted to is said under the answer, not assumed',a.t.slice(-260));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
