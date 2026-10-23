// Round 40, a CIO's day across both editions (the journey in fixtures-free words: portfolio triage, a combined stress and the covenants
// under it, a grid, a trace, a debug and the CIO's verdict on it, an extension, a new line, a contract, reports in Arabic, a roll-up).
// What it found, each checked here, every figure against LibreOffice (fixtures/golden/r40_nakheel.json, arabic.json):
//  - the AI reader was shown only the first 160 inputs, so on a model with three cases SAIBOR was cut off and a 4-change stress ran with 3;
//    a clause the AI leaves out now goes back to it once
//  - the covenant line after a stress was read on the workbook as uploaded (LTV "never breaches" while the stress breaches it); its breaches were named
//    by period number (66, 67…) on a sheet that counts months, while the model dates them on its cash flow sheet
//  - a number written inside a formula on a sheet whose name needs quotes ('Cash Flow', 'التدفقات النقدية') was overwritten by the number
//  - the extension carried a sales share written in each period's formula into the new periods (sales past 100%), and missed the exit
//    input the model map proved; a line added like another went outside its block and broke the model, which was kept as the model;
//    the new workbook then came without its headline figures (the answer showed 24.49% → —) until a second map reading landed
//  - an Arabic sheet name unquoted in a formula (المدخلات!B10) was taken for the host sheet and shifted
//  - the trace listed a model's case table (Base, Upside, Downside) as series over time, each named after its Downside column
//  - "debug this model" ran only the export checks; the CIO's verdict on a finding had nowhere to go
//  - a weekly schedule asked for Monday ran on Sunday; a fund roll-up's answer was lost when it switched projects; a report built on an
//    uploaded workbook described the demo fund; a units note ("All amounts in EUR") became the project's name
// Changes to a model's structure are Jadwa's only: KINAN relies on EstateMaster, Jadwa on the Excel workbook.
// The AI is a stand-in (no API credit): it makes the calls a strong model would make; every figure is the workbook's.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/arabic.json',import.meta.url),'utf8')),N=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/r40_nakheel.json',import.meta.url),'utf8'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,600):''))};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Number.isFinite(e)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const MAP_AR={headlines:[{key:'levered_irr',cell:"'العوائد'!B3",label:'معدل العائد الداخلي بعد التمويل',definition:'equity IRR'},{key:'unlevered_irr',cell:"'العوائد'!B4",label:'معدل العائد الداخلي قبل التمويل',definition:'project IRR'},{key:'net_profit',cell:"'العوائد'!B5",label:'صافي الربح',definition:'profit'}],
  units:[{sheet:'التدفقات النقدية',scale:1,currency:'SAR',evidence:"'التدفقات النقدية'!A1"}],scenario:{switch:"'المدخلات'!B3",names:['أساسي','متحفظ']},timeline:{sheet:'التدفقات النقدية',period:'year',first:"'التدفقات النقدية'!C3",count:5},cashflows:[{irr:'levered_irr',row:"'التدفقات النقدية'!C18:G18"}],hold:{cell:"'المدخلات'!B13",unit:'years'}};
async function open(jadwa){const S={plan:[],read:[],reads:[],audit:null,lastAudit:''};const ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
  await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
    let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,msgs=pl.messages||[];const sys=String(pl.system&&pl.system.map?pl.system.map(z=>z.text||'').join('\n'):pl.system||(msgs[0]&&msgs[0].role==='system'?msgs[0].content:''));
    const txt=c=>typeof c==='string'?c:Array.isArray(c)?c.map(z=>z.text||(z.type==='tool_result'?JSON.stringify(z.content):'')).join('\n'):'';const u=txt(((msgs.filter(m=>m.role==='user').pop())||{}).content);const oa=/openai/.test(r.request().url())||body.provider==='openai';
    const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
    if(pl.tools&&pl.tools.length){if(oa)return reply('Noted.');let k=msgs.length-1;while(k>=0&&!(msgs[k].role==='user'&&!/tool_result/.test(JSON.stringify(msgs[k].content))))k--;const n=msgs.slice(k+1).filter(m=>m.role==='assistant'&&/tool_use/.test(JSON.stringify(m.content))).length;
      if(n<S.plan.length)return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'t'+n,name:S.plan[n][0],input:S.plan[n][1]||{}}],stop_reason:'tool_use'})});
      const res=msgs.slice(k+1).filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content.filter(z=>z.type==='tool_result').map(z=>typeof z.content==='string'?z.content:Array.isArray(z.content)?z.content.map(q=>q.text||'').join('\n'):JSON.stringify(z.content)):[]);
      return reply(res.length?'From the tools, on the workbook:\n\n'+res.map(z=>z.slice(0,3000)).join('\n\n'):'Noted.')}   /* a strong model relays what the tools found */
    if(/You read a sentence/.test(sys)){S.reads.push(u);const lines=u.split('\n').filter(l=>/\|/.test(l));const second=/your reading leaves out/.test(u);const ch=[];
      for(const z of S.read){if(z.late&&!second)continue;const l=lines.find(l=>z.re.test(l.split('|')[0]));if(l)ch.push({label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:z.kind,value:z.value,sure:true})}return reply(JSON.stringify({changes:ch}))}
    if(/You decide which typed input cells/.test(sys))return reply('{"complete":true,"add":[],"drop":[],"why":"ok"}');
    if(/You set the range over which each input/.test(sys)){const out=[];for(const m of u.matchAll(/^((?:'[^']+'|[^\s|!]+)![A-Z]+\d+) \| ([^|]+) \| .*units allowed: ([a-z]+)/gm))out.push({cell:m[1],unit:m[3],down:m[3]==='bps'?50:m[3]==='periods'?1:5,up:m[3]==='bps'?50:m[3]==='periods'?1:5,why:'typical'});return reply(JSON.stringify({ranges:out}))}
    if(/You map the structure of a real estate financial model laid out as a grid of cells\. Each line/.test(sys))return reply(/العوائد/.test(u)?JSON.stringify(MAP_AR):/Business Bay/.test(u)?JSON.stringify({headlines:[{key:'unlevered_irr',cell:'Returns!B3',label:'Unlevered IRR',definition:'the project’s IRR'},{key:'net_profit',cell:'Returns!B4',label:'Net profit',definition:'the project’s profit'}],
      jurisdiction:{value:'UAE_ONSHORE',confidence:'high',evidence:[{cell:'Inputs!B2',text:'Business Bay, Dubai'},{cell:'Inputs!A4',text:'Dubai Land Department transfer fee'}]}}):'{}');
    if(/senior financial-modelling reviewer/.test(sys)){S.lastAudit=u;return reply(JSON.stringify(S.audit||{read_ok:true,read_note:'read',items:[],observations:[]}))}
    if(/second reviewer/.test(sys))return reply(JSON.stringify({verdicts:[...u.matchAll(/(\d+)\. \[(\w+), \w+\]/g)].map(m=>({i:+m[1],verdict:'confirmed',same_as:null,reason:'checked'}))}));
    if(/You audit an exact|You review|You check a feasibility/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[],"ok":true,"issues":[]}');
    if(/You audit the arithmetic|independent checker/.test(sys))return reply('{"items":[],"verdict":"agree"}');
    if(/You plan behaviour tests/.test(sys))return reply('{"probes":[]}');
    return reply('{}')});
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
  const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:60000}).catch(()=>{});await p.click('#npCreate');await p.waitForFunction(()=>{const x=latestExport();return x&&x.map},null,{timeout:90000}).catch(()=>{});await p.waitForTimeout(1500);return p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return{id:x.id,name:PROJ.name}})};
  const ask=async(text,o={})=>{S.plan=o.plan||[];S.read=o.read||[];const n0=await p.evaluate(()=>document.querySelectorAll('#msgs .msg.agent').length);await p.evaluate(t=>{toggleDock(true);webAsk(t)},text);await p.waitForTimeout(400);await p.waitForFunction(()=>!busy,null,{timeout:o.wait||240000}).catch(()=>{});await p.waitForTimeout(o.settle||1500);
    return p.evaluate(n0=>{const M=[...document.querySelectorAll('#msgs .msg.agent')].slice(n0);return{t:M.map(m=>m.innerText).join('\n'),h:M.map(m=>m.innerHTML).join('\n')}},n0)};   /* every message the question brought, not only the last */
  return{p,S,errs,up,ask}}

// ================= KINAN: the model with three cases, a combined stress and the covenants under it =================
{const {p,S,errs,up,ask}=await open(false);
  const r39=await up('r39_fund_waterfall_eur.xlsx');ok(!/amounts in/i.test(r39.name)&&/AURORA REAL ESTATE FUND I/i.test(r39.name),'a units note (“All amounts in EUR”) is not the project’s name: the title above it is, without its sheet word',r39.name);
  await up('demo_nakheel_gate_v2.xlsx');
  // the stress: four changes, SAIBOR named in the listing the AI gets, and a clause it leaves out sent back to it
  let a=await ask('Construction cost +12%, apartment prices −8%, construction 6 months longer and SAIBOR +150 bps, all together. Do we breach the covenants, and when?',
    {plan:[['test_assumptions',{changes:['construction cost +12%','average price per apartment -8%','construction period +6 months','SAIBOR +150 bps']}],['line_over_time',{lines:['DSCR','LTV'],version:'latest'}]],
     read:[{re:/Construction cost/i,kind:'pct',value:12},{re:/Average price per apartment/i,kind:'pct',value:-8},{re:/Construction period/i,kind:'abs',value:6},{re:/SAIBOR/,kind:'pts',value:1.5,late:true}]});
  ok(S.reads.length>=1&&/SAIBOR \| Inputs!C57/.test(S.reads[0]),'the AI reader is shown every line the sentence names (SAIBOR, row 57 of a model with three cases), not the first 160 inputs');
  ok(S.reads.length>=2&&/SAIBOR[^\n]*Inputs!C57\), which your reading leaves out/.test(S.reads[1]),'a clause the AI left out (SAIBOR +150 bps, read by the rules) goes back to it once, and it reads the sentence again',S.reads[1]&&S.reads[1].slice(-300));
  const v=await p.evaluate(()=>{const x=latestExport();const V=(MVERS[PROJ.id]||[]).filter(z=>!z.base&&z.ex===x.id);return V[V.length-1]||null});
  ok(v&&v.sets.length>=4&&near(v.out.levered_irr/100,N.k3[0],1e-6),'all four changes run together: levered IRR 3.09%, as LibreOffice gives it (3 changes would give 4.58%)',v&&{sets:v.sets,irr:v.out.levered_irr});
  ok(/Under EX-\d+·V\d+/.test(a.t)&&/LTV[^\n]*breaches the maximum of 60\.00%[^\n]*worst 61\.44%/.test(a.t)&&/DSCR[^\n]*worst 0\.96x/.test(a.t),'the covenants are read under the stress, not on the workbook as uploaded: LTV breaches 60% (worst 61.44%), DSCR worst 0.96x, as LibreOffice gives them',a.t.slice(a.t.indexOf('Under'),a.t.indexOf('Under')+500));
  ok(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d/.test(a.t.slice(a.t.indexOf('Under'))),'the breach periods are named by their dates, not their period numbers',a.t.slice(a.t.indexOf('Under'),a.t.indexOf('Under')+700));
  // the grid: the same input in three case columns resolves to the case the model runs on; −15 to +5 in “pct” are moves, not prices
  a=await ask('Grid: apartment price −15% to +5% against construction cost −5% to +15%, on levered IRR.',{plan:[['sensitivity_grid',{x:{label:'Average price per apartment',low:-15,high:5,unit:'pct',steps:5},y:{label:'Construction cost (SAR per sqm GFA)',low:-5,high:15,unit:'pct',steps:5},metric:'levered_irr'}]]});
  ok(!/Which one\?/.test(a.t)&&/Average price per apartment \(SAR\) · Base/.test(a.t)&&/1,445,000/.test(a.t)&&!/cannot be negative/.test(a.t),'the grid takes the Base column (the case the model runs on) and moves the price −15% to +5% (1,445,000 at the low end), never treating −15 as a price',a.t.slice(0,400));
  // the trace names the typed inputs the figure depends on
  a=await ask('Where does the levered IRR come from?',{plan:[['trace_figure',{figure:'Levered IRR',depth:3}]]});
  ok(/It depends on \d+ lines? of typed numbers/.test(a.t)&&/set per case: [^\n]*(Construction cost|Average price per apartment)/.test(a.t)&&!/· (Base|Upside|Downside) \(\d+ cells/.test(a.t)&&!/Total 0/.test(a.t),'the trace lists the typed inputs the IRR depends on, however deep; a line typed once per case is an input set per case, not a series named after its Downside column',a.t.slice(0,3000));
  // a weekly schedule on the day asked; a pegged rate without a lookup
  a=await ask('Send the IC pack every Monday at 7am.',{plan:[['schedule_report',{report:'ic',cadence:'weekly',day_of_week:'Monday',time:'07:00'}]]});
  ok(/Weekly · Mon 07:00/.test(a.t),'“every Monday” runs on Monday (a day named in words is read, not defaulted to Sunday)',a.t.slice(0,200));
  const fx=await p.evaluate(async()=>{const r=await fxRate('AED','SAR');return r});ok(near(fx.rate,3.75/3.6725,1e-6)&&/CBUAE/.test(fx.source)&&/SAMA/.test(fx.source),'AED→SAR comes from the two central banks’ fixed pegs, with no lookup',fx);
  // KINAN's models are EstateMaster's: a change to their structure is made there, never written here
  a=await ask('Extend the cash flow by 2 years and add a refinance in year 4.',{plan:[['extend_cashflow',{years:2}],['add_structure',{structure:'refinance',year:'4',ltv:60,rate:7}]]});
  const nx=await p.evaluate(()=>EXPORTS.filter(x=>/extended by|refinanc/i.test(x.file||'')).length);
  ok(/In KINAN a model is changed at its source/.test(a.t)&&/what-if/.test(a.t)&&nx===0,'KINAN does not change a model’s structure (extend, add a sheet): it says the change is made in the source model and offers a what-if',a.t.slice(0,300));
  ok(errs.length===0,'KINAN: no page errors',errs.join(' | '))}

// ================= Jadwa: the Arabic development, its extension, a new line, the debug and the roll-up =================
{const {p,S,errs,up,ask}=await open(true);
  await up('ar_dev.xlsx');await p.waitForTimeout(3000);await p.evaluate(()=>{const x=latestExport();const e=document.querySelector(`[data-jurset="${x.id}|KSA_CMA"]`);if(e)e.click()});   /* the CIO answers the regime question */
  // a number written in a formula on a sheet whose name needs quotes moves as that number
  const c8=await p.evaluate(async()=>{const x=latestExport();const c=(x.inputs||[]).find(i=>i.fconst&&/C8$/.test(i.cell));const [r]=await a33Runs([[[c.cell,0.295]]],[x.cells.levered_irr,c.cell]);return{cell:c.cell,r}});
  ok(near(c8.r[0],G.r40_c8_0295[0],1e-9)&&near(c8.r[1],G.r40_c8_0295[1],1e-9),'the 30% written in a formula on ‘التدفقات النقدية’ moved to 29.5%: the cell keeps its formula (−37.76M) and the IRR is 24.93%, as LibreOffice gives them',c8);
  // the tornado: the repayment year in whole periods within the timeline, the formula number moved as a number
  let a=await ask('What drives the levered IRR?',{plan:[['tornado',{metric:'levered_irr'}]],wait:300000});
  const T=await p.evaluate(()=>{const x=latestExport();return x.tornado?x.tornado.rows.map(r=>({label:r.label,cell:r.cell,from:r.from,to:r.to,lo:r.lo,hi:r.hi})):null});
  const yr=T&&T.find(r=>/B13$/.test(r.cell)),c8r=T&&T.find(r=>/C8$/.test(r.cell));
  ok(yr&&/^[34]$/.test(yr.from)&&yr.to==='5'&&/cannot go past the model’s last period \(5\)/.test(a.t),'the repayment year (the hold input the map proved) moves in whole years and never past the model’s last period',yr);
  ok(!c8r||(Number.isFinite(c8r.lo)&&Number.isFinite(c8r.hi)&&Math.abs(c8r.lo-c8r.hi)>1e-6&&Math.abs(c8r.lo-0.2449)<0.05),'a number in a formula moves as that number in the tornado (its ends close to today’s IRR, not 54% both ends)',c8r);
  // the extension: the sales share written in each period's formula and the exit are asked, then the extension is exact
  a=await ask('Extend the cash flow by 2 years.',{plan:[['extend_cashflow',{years:2}]],wait:300000});
  ok(/إيرادات المبيعات \(0\.3 in its formula\)/.test(a.t)&&/“سنة السداد” is 5/.test(a.t)&&/Move the exit to the new last period \(سنة السداد 5 → 7\)/.test(a.t),'extending asks about the sales share written in each period’s formula and about the repayment year the map proved, before writing anything',a.t.slice(0,600));
  a=await ask('Zero for the sales after the last year, and move the exit to the new last year.',{plan:[['extend_cashflow',{years:2,constants:'zero',exit:'move'}]],wait:300000});
  await p.waitForFunction(()=>{const x=latestExport();return x&&/extended by/.test(x.file)&&x.out&&Number.isFinite(x.out.levered_irr)},null,{timeout:90000}).catch(()=>{});
  const ext=await p.evaluate(()=>{const x=latestExport();return{file:x.file,out:x.out,derived:x.derivedFrom,checks:exportChecks(x).map(c=>c.level+': '+c.text)}});
  ok(/extended by 2 years/.test(ext.file)&&near(ext.out.levered_irr/100,G.r40_extend7[0],1e-6)&&near(ext.out.net_profit,G.r40_extend7[2],1e-6),'extended by two years with no sales after the last and the exit moved: levered IRR 38.35% and net profit SAR 22.42M, as LibreOffice gives the same model built for seven years',ext.out);
  ok(!ext.checks.some(c=>/no approved change in between/.test(c)),'the extended workbook is not flagged as an unapproved change: the user asked for it',ext.checks);
  const cards=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].slice(-2).map(m=>m.innerText).join('\n'));
  ok(!/Which regulation and tax regime does .*extended by 2 years/.test(cards),'the extended workbook does not ask the regime question again');
  // a line added like another: inside its block, the inputs it reads kept, the model whole
  await p.evaluate(async()=>{const x=EXPORTS.find(z=>z.file==='ar_dev.xlsx');if(x)await xcEngine(x)});
  const sw=await p.evaluate(()=>{const x=EXPORTS.find(z=>z.file==='ar_dev.xlsx');EXPORTS.splice(EXPORTS.indexOf(x),1);EXPORTS.push(x);return latestExport().file});
  a=await ask('Add an arrangement fee line like the development management fee.',{plan:[['add_model_line',{copy_of:'رسوم إدارة التطوير',label:'رسوم الترتيب',sheet:'التدفقات النقدية',copy_values:true}]],wait:300000});
  const al=await p.evaluate(()=>{const x=latestExport();return{file:x.file,out:x.out}});
  ok(sw==='ar_dev.xlsx'&&/رسوم الترتيب added/.test(al.file)&&near(al.out.levered_irr/100,G.r40_addline[0],1e-6)&&/a new row 10, copying row 9/.test(a.t),'the new line goes inside its cost block (row 10, before the total), reads the same inputs sheet, and the model stays whole: levered IRR 24.43%, as LibreOffice gives it',{al,t:a.t.slice(0,200)});
  // the debug from the chat: the reviewers' findings with their cells; the CIO's verdict kept and given to the next debug
  S.audit={read_ok:true,read_note:'read',items:[{kind:'risk',severity:'medium',title:'Repayment falls after the agreement date',evidence:"'التدفقات النقدية'!G15 repays in 2031",cell:"'التدفقات النقدية'!G15",recommendation:'repay by 2030 or extend'}],observations:[]};
  await p.evaluate(()=>{const x=latestExport();x.audit=null});
  a=await ask('Debug this model.',{plan:[['check_estatemaster_export',{}]],wait:300000});
  ok(/Model debug of /.test(a.t)&&/Repayment falls after the agreement date \('التدفقات النقدية'!G15\)/.test(a.t),'“debug this model” returns the model debug: the reviewers’ findings with their cells, then the checks',a.t.slice(0,400));
  a=await ask('The 2031 repayment is agreed with the bank: not an issue.',{plan:[['debug_feedback',{cell:"'التدفقات النقدية'!G15",verdict:'false_alarm',why:'agreed with the bank'}]]});
  ok(/Noted on .*: “Repayment falls after the agreement date”.* is not an issue: agreed with the bank/.test(a.t),'the CIO’s verdict on a finding is recorded from the chat',a.t.slice(0,300));
  await p.evaluate(()=>{const x=latestExport();x.audit=null});a=await ask('Debug it again.',{plan:[['check_estatemaster_export',{}]],wait:300000});
  ok(/The user’s verdicts on earlier debug findings[^\n]*G15 Repayment falls after the agreement date: not an issue \(agreed with the bank\)/.test(S.lastAudit)&&/Known and not an issue \(your verdict\): 'التدفقات النقدية'!G15 — agreed with the bank/.test(a.t),'the next debug’s reviewers are told the verdict, and the finding is listed as known, not raised as new',a.t.slice(0,500));
  // a report in Arabic, from the workbook's own figures
  a=await ask('The lender report in Arabic.',{plan:[['build_report',{kind:'lender',lang:'ar'}]]});const rl=await p.evaluate(()=>RPLANG);
  ok(rl==='ar'&&/built from .*\.xlsx/.test(a.t)&&/In Arabic: the AI translates/.test(a.t)&&!/Fund LP net IRR|Peak debt .* in Q/.test(a.t),'a report asked in Arabic switches the report to Arabic, and is described from the workbook’s own figures, never the demo model’s',a.t.slice(0,400));
  // the roll-up keeps its answer, with the exposure by regime
  await up('uae_dubai.xlsx');a=await ask('Across our models, the exposure to Saudi versus the UAE and the combined IRR in SAR.',{plan:[['fund_combine',{currency:'SAR'}]],wait:300000});
  ok(/projects together/.test(a.t)&&/By regime \(each project's own peak equity\): /.test(a.t)&&/UAE onshore/.test(a.t),'the roll-up’s answer stays in the conversation (the projects it reads are switched quietly), with the exposure by regime',a.t.slice(0,400));
  // a formula in the chat keeps its multiplication signs
  const md=await p.evaluate(()=>mdLite("=C16*'المدخلات'!$B$12 → =C16*'المدخلات'!B12 and *bold*"));ok(/C16\*'المدخلات'!\$B\$12 → =C16\*'المدخلات'!B12/.test(md)&&/<b>bold<\/b>/.test(md),'a formula’s * signs are not taken for emphasis',md);
  ok(errs.length===0,'Jadwa: no page errors',errs.join(' | '))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
