// The four shared layers, held as properties over every caller the code itself lists, so a fix cannot land on one path and miss the
// others: (A) every builder reads the export's figures through its view, so a report, a deck, an email or a section built "after that
// change" carries that version's figures; the project a question names (one word, or its Arabic name) and the case it names are applied;
// (B) every number from a request or a document reaches the cell in the cell's own unit and scale through qtyTo/qtyRange, and a result
// stored as a whole percent is shown as it is; (C) every reader of what the documents state reads the one term store; (D) every goal
// seek searches past the points where the model gives no figure. The static scans fail on a new path that bypasses a layer.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const SRC=fs.readFileSync(new globalThis.URL('../index.html',import.meta.url),'utf8');
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,600):''))};
const count=(s,re)=>(s.match(re)||[]).length;

// ---- static scans: the paths that must go through each layer, read from the source ----
{const i=SRC.indexOf('/* ---- Layer A:'),j=SRC.indexOf('function addExport(');const layerA=SRC.slice(i,j);const outside=SRC.slice(0,i)+SRC.slice(j);
  ok(i>0&&j>i&&count(layerA,/out0/g)>=4&&count(outside,/\bout0\b/g)===0,'A: the raw uploaded figures (out0) are read only inside the view layer',{inside:count(layerA,/out0/g),outside:count(outside,/\bout0\b/g)});
  const pushes=[...SRC.matchAll(/EXPORTS\.push\(([^)]{0,40})/g)].map(m=>m[1]);ok(pushes.length>=2&&pushes.every(a=>/^x$|xvDefine\(/.test(a)),'A: every export enters the list through xvDefine (a view on its figures)',pushes);
  ok(/function a33Chain\(x\)\{const v=CTX&&CTX\.applied/.test(SRC)&&!/function a33Chain\(x\)\{const q=String\(window\.ASKED/.test(SRC),'A: the analyst toolkit follows the request contract, not its own reading of the words')}
{const i=SRC.indexOf('async function a33Lever'),j=SRC.indexOf('function a33OptOut');const reg=SRC.slice(i,j);
  const div=count(reg,/\/\s*100\b/g),mul=count(reg,/\*\s*100\b/g),calls=count(SRC,/\bqty(To|Range)\(/g);
  ok(div<=6&&mul<=12,`B: no new percent arithmetic in the toolkit outside qtyTo/qtyRange (${div} “/100”, ${mul} “*100”; the move arithmetic of svOne and the screening estimate are the ones allowed)`);
  ok(calls>=12,`B: the one conversion is called from every number-taking tool (${calls} calls)`);
  ok(/function show=|const show=\(t,v\)=>t\.type==='share'\?fundPct\(\+v\)/.test(SRC),'B: the agreement register shows a share as the agreement states it (1% is 1%)')}
{const n=count(SRC,/DOCS\[/g),rd=count(SRC,/\bdoc(Terms|Docs)\(/g);ok(n<=12&&rd>=6,`C: the documents' lists are read through the one term store (${n} direct touches, all in the store's own functions; ${rd} readers of docTerms/docDocs)`);
  ok(!/function docAnswer\(q\)\{const L=DOCS\[/.test(SRC),'C: the chat answer reads the term store, not the lease list alone')}
{ok(count(SRC,/\bxcBracket\(/g)>=3&&!/for\(let k=0;k<=8;k\+\+\)pts\.push/.test(SRC),'D: every goal seek brackets its target through xcBracket (no private scan left)')}

const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
const LEASE=[['rent','Annual base rent',30000000,'SAR','annual base rent of SAR 30,000,000',1],['escalation','Rent escalation',4,'%','escalate by 4% per annum',1],['lease_term','Lease term',10,'years','a term of ten (10) years',1],['rent_free','Rent-free period',6,'months','rent-free period of 6 months',2]];
const TS=[['margin','Profit margin',6.5,'%','margin of 6.5% per annum',1],['ltv','Maximum LTV',60,'%','maximum LTV of 60%',1],['other','Minimum DSCR',1.3,'x','minimum DSCR of 1.30x',1]];
async function open(){const S={plan:[],read:[]};const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),p=await ctx.newPage();await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
  await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
    let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,msgs=pl.messages||[];const sys=String(pl.system&&pl.system.map?pl.system.map(z=>z.text||'').join('\n'):pl.system||(msgs[0]&&msgs[0].role==='system'?msgs[0].content:''));
    const txt=c=>typeof c==='string'?c:Array.isArray(c)?c.map(z=>z.text||(z.type==='tool_result'?JSON.stringify(z.content):'')).join('\n'):'';const u=txt(((msgs.filter(m=>m.role==='user').pop())||{}).content);const oa=/openai/.test(r.request().url())||body.provider==='openai';
    const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
    if(pl.tools&&pl.tools.length){if(oa)return reply('Noted.');let k=msgs.length-1;while(k>=0&&!(msgs[k].role==='user'&&!/tool_result/.test(JSON.stringify(msgs[k].content))))k--;const n=msgs.slice(k+1).filter(m=>m.role==='assistant'&&/tool_use/.test(JSON.stringify(m.content))).length;
      if(n<S.plan.length)return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'t'+n,name:S.plan[n][0],input:S.plan[n][1]||{}}],stop_reason:'tool_use'})});
      const res=msgs.slice(k+1).filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content.filter(z=>z.type==='tool_result').map(z=>typeof z.content==='string'?z.content:Array.isArray(z.content)?z.content.map(q=>q.text||'').join('\n'):JSON.stringify(z.content)):[]);
      return reply(res.length?'From the tools, on the workbook:\n\n'+res.map(z=>z.slice(0,3000)).join('\n\n'):'Noted.')}
    if(/You read a real estate document/.test(sys)){const items=(/LEASE AGREEMENT/.test(u)?LEASE:TS).map(([kind,label,value,unit,quote,page])=>({kind,label,value,unit,quote,page}));return reply(JSON.stringify({doc_type:/LEASE AGREEMENT/.test(u)?'lease':'term sheet',title:'Al Waha',date:'2026',parties:'Al Waha Development Company',items}))}
    if(/You classify a document/.test(sys))return reply(JSON.stringify({contract:false,category:'lease',doc_type:'lease',language:'en'}));
    if(/You read a sentence/.test(sys)){const sent=(u.match(/Sentence: (.*)$/m)||[])[1]||'';const lines=u.split('\n').filter(l=>/\|/.test(l));const ch=[];
      for(const z of S.read){const all=lines.filter(l=>z.re.test(l.split('|')[0].trim()));for(const l of all.slice(0,1))ch.push({label:l.split('|')[0].trim(),cell:l.split('|')[1].trim(),kind:z.kind,value:z.value,sure:true})}
      if(!ch.length){const pick=re=>lines.find(l=>re.test(l.split('|')[0]));const line=/base rent/i.test(sent)?pick(/stabilised rent/i):/escalation/i.test(sent)?pick(/rent growth/i):/lease term/i.test(sent)?pick(/hold period/i):/margin/i.test(sent)?pick(/interest rate/i):/ltv/i.test(sent)?pick(/ltv covenant/i):null;const m=sent.match(/to ([\d.,]+)/);if(line)ch.push({label:line.split('|')[0].trim(),cell:line.split('|')[1].trim(),kind:'to',value:m?+m[1].replace(/,/g,''):NaN,sure:true})}
      return reply(JSON.stringify({changes:ch}))}
    if(/You decide which typed input cells/.test(sys))return reply('{"complete":true,"add":[],"drop":[],"why":"ok"}');
    if(/You set the range over which each input/.test(sys)){const out=[];for(const m of u.matchAll(/^((?:'[^']+'|[^\s|!]+)![A-Z]+\d+) \| ([^|]+) \| .*units allowed: ([a-z]+)/gm))out.push({cell:m[1],unit:m[3],down:m[3]==='bps'?50:m[3]==='periods'?1:5,up:m[3]==='bps'?50:m[3]==='periods'?1:5,why:'typical'});return reply(JSON.stringify({ranges:out}))}
    if(/You audit an exact|You review|You check a feasibility/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[],"ok":true,"issues":[]}');
    if(/senior financial-modelling reviewer/.test(sys))return reply('{"read_ok":true,"read_note":"read","items":[],"observations":[]}');
    if(/second reviewer/.test(sys))return reply('{"verdicts":[]}');
    return reply('{}')});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
  const up=async(f,o={})=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:90000}).catch(()=>{});await p.click('#npCreate');
    await p.waitForFunction(()=>{const x=latestExport();return x&&x.map},null,{timeout:o.wait||150000}).catch(()=>{});await p.waitForTimeout(o.extra||1500);
    return p.evaluate(async()=>{const x=latestExport();try{await xcEngine(x)}catch(z){}return{id:x.id,file:x.file,name:PROJ.name,proj:PROJ.id,out:x.out}})};
  const doc=async f=>{const n0=await p.evaluate(()=>(DOCS[PROJ.id]||[]).length);await p.evaluate(()=>{try{showTab('em')}catch(e){}});await p.waitForTimeout(400);await p.setInputFiles('#docFile',[D+f]);await p.waitForFunction(n0=>(DOCS[PROJ.id]||[]).length>n0,n0,{timeout:120000}).catch(()=>{});await p.waitForTimeout(1500)};
  const ask=async(step,text,o={})=>{S.plan=o.plan||[];S.read=o.read||[];const n0=await p.evaluate(()=>document.querySelectorAll('#msgs .msg.agent').length);
    await p.evaluate(t=>{toggleDock(true);webAsk(t)},text);await p.waitForTimeout(400);await p.waitForFunction(()=>!busy,null,{timeout:o.wait||300000}).catch(()=>{});await p.waitForTimeout(o.settle||1500);
    return p.evaluate(n0=>{const M=[...document.querySelectorAll('#msgs .msg.agent')].slice(n0);return{t:M.map(m=>m.innerText).join('\n')}},n0)};
  return{p,S,errs,up,doc,ask}}
const {p,S,errs,up,doc,ask}=await open();
const RD=(re,kind,value)=>({re,kind,value});

// ---- A: the view, over every builder the code lists (BLOCKS, RPTS, the email, the deck's figures) ----
await up('r39_fund_waterfall_eur.xlsx');const H=await up('r41_hotel_aed.xlsx');
let a=await ask('wi','On Marina Bay, what if the interest rate is 7.5%?',{plan:[['test_assumptions',{changes:['Interest rate 7.5%']}]],read:[RD(/^Interest rate/,'to',7.5)]});
const V=await p.evaluate(()=>{const x=latestExport();const v=(MVERS[x.proj]||[]).filter(z=>!z.base&&z.ex===x.id).pop();return v?{id:v.id,irr:v.out.levered_irr,base:x.out0.levered_irr}:null});
ok(V&&Number.isFinite(V.irr)&&Math.abs(V.irr-V.base)>0.05,'a what-if is recorded as a version with its own levered IRR',V);
const fmt=v=>v.toFixed(2)+'%';
const views=await p.evaluate(({vid})=>{const x=latestExport();const strip=h=>{const d=document.createElement('div');d.innerHTML=h;return d.innerText.replace(/\s+/g,' ')};const run=()=>{const o={};
    for(const k of Object.keys(BLOCKS)){if(BLOCK_SCOPE[k]==='portfolio')continue;try{o['block:'+k]=strip(BLOCKS[k].fn())}catch(e){o['block:'+k]='ERR '+e.message}}
    for(const id of Object.keys(RPTS)){if(id==='daily')continue;try{RSEL=id;renderReport();o['report:'+id]=strip(document.querySelector('#report').innerHTML)}catch(e){o['report:'+id]='ERR '+e.message}}
    for(const id of Object.keys(RPTS)){if(id==='daily')continue;try{o['email:'+id]=strip(reportEmail(id))}catch(e){o['email:'+id]='ERR '+e.message}}
    o['deck:figures']=String(kFigures().irr.toFixed(2))+'%';return o};
  xvSet(x,null);const A=run();const v=(MVERS[x.proj]||[]).find(z=>z.id===vid);xvSet(x,v);const B=run();xvSet(x,null);return{A,B}},{vid:V.id});
/* records of the uploaded file or of history keep the uploaded figure by nature: the change memory, the versions list, the debug findings at upload, the checks on the version */
const HIST=/^block:(changelog|wb_whatifs|wb_debug|export_checks|kpis_prev)$/;
const carry=Object.keys(views.A).filter(k=>views.A[k].includes(fmt(V.base))&&!HIST.test(k));
const wrong=carry.filter(k=>!views.B[k].includes(fmt(V.irr))||(k.startsWith('block:')&&views.B[k].includes(fmt(V.base))));
ok(carry.length>=6&&!wrong.length,`A: every builder that shows the levered IRR (${carry.length} of ${Object.keys(views.A).length} views: sections, reports, emails, the deck) shows the version's figure under its view, never the uploaded one`,wrong.slice(0,8));
a=await ask('ic2','Build the IC pack after that change.',{plan:[['build_report',{kind:'ic'}]],wait:300000});
ok(new RegExp('on '+V.id.replace(/[·.]/g,'.')).test(a.t)&&a.t.includes(fmt(V.irr))&&!a.t.includes('Levered IRR '+fmt(V.base)),'A: a report asked “after that change” is built on that version and says so',a.t.slice(0,300));
a=await ask('ic1','Build the IC pack.',{plan:[['build_report',{kind:'ic'}]],wait:300000});
ok(a.t.includes('Levered IRR '+fmt(V.base))&&!a.t.includes(fmt(V.irr)),'A: the same report asked without follow-up words is the workbook as uploaded',a.t.slice(0,300));
a=await ask('now','Now the lender pack for Marina Bay.',{plan:[['build_report',{kind:'lender'}]],wait:300000});
ok(!/no earlier what-if/.test(a.t),'A: an opening “Now” is not a follow-up on the last what-if',a.t.slice(-200));
// the project a question names: one distinctive word, or its Arabic name
a=await ask('aurora','On Aurora, build the investor report.',{plan:[['build_report',{kind:'investor'}]],wait:300000});
ok(/AURORA/i.test(await p.evaluate(()=>PROJ.name))&&/12\.07%|8\.30%/.test(a.t)&&!/7\.60%/.test(a.t),'A: “On Aurora, …” moves to the fund named by one word and builds on its figures',a.t.slice(0,240));
ok(/LP IRR 8\.30%/.test(a.t)&&a.t.indexOf('LP IRR')<a.t.indexOf('Levered IRR'),'A: an investor pack leads with the LPs’ own figure',a.t.slice(0,240));
await p.evaluate(()=>{const P=Object.values(PROJECTS).find(z=>/MARINA/i.test(z.name));P.nameAr='مارينا باي'});
a=await ask('ar','ما هو معدل العائد الداخلي بعد التمويل لمشروع مارينا باي؟',{plan:[['estatemaster_results',{}]]});
ok(/MARINA/i.test(await p.evaluate(()=>PROJ.name))&&/7\.60%/.test(a.t),'A: a project named in Arabic (its name from the model map) is the one answered',a.t.slice(0,200));
// the case a question names, on a workbook whose switch holds a word
await up('c44_phased_sar.xlsx',{wait:180000});
a=await ask('case','On Al Bahr, what drives the levered IRR, on the Downside case?',{plan:[['tornado',{metric:'levered_irr',top:3}]],wait:300000});
ok(/Downside case/.test(a.t)&&!/No input moves this result/.test(a.t)&&/Residential sale price per sqm · Downside/.test(a.t)&&!/no earlier what-if/.test(a.t),'A: the case named in the question runs the tool (the text switch set to its word), and the case’s own inputs are the ones ranked',a.t.slice(0,400));

// ---- B: every number from outside reaches the cell in its unit and scale ----
let a1=await ask('cov1','On Al Bahr, the loan balance by month against a cap of 85 million riyals.',{plan:[['line_over_time',{lines:['Loan balance'],covenant:85000000,direction:'max'}]]});
let a2=await ask('cov2','On Al Bahr, the loan balance by month against a cap of 85,000 thousand.',{plan:[['line_over_time',{lines:['Loan balance'],covenant:85000,direction:'max'}]]});
ok(/never breaches the maximum of SAR 85M/.test(a1.t)&&/never breaches the maximum of SAR 85M/.test(a2.t)&&/is read as/.test(a1.t),'B: a covenant given in riyals on a sheet in thousands is read in the sheet’s unit (and said), the same answer as one given in thousands',{a1:a1.t.slice(0,220),a2:a2.t.slice(0,220)});
await p.evaluate(()=>{const P=Object.values(PROJECTS).find(z=>/MARINA/i.test(z.name));switchProject(P.id,true,true)});await p.waitForTimeout(800);
a1=await ask('mc1','On Marina Bay, a Monte Carlo of the interest rate 6–7%, 40 runs.',{plan:[['monte_carlo',{variables:[{label:'Interest rate',low:6,high:7}],runs:40,metric:'levered_irr'}]],wait:300000});
a2=await ask('mc2','On Marina Bay, a Monte Carlo of the interest rate 0.06–0.07, 40 runs.',{plan:[['monte_carlo',{variables:[{label:'Interest rate',low:0.06,high:0.07}],runs:40,metric:'levered_irr'}]],wait:300000});
const med=t=>(t.match(/median ([\d.]+)%/)||[])[1];
ok(med(a1.t)&&med(a1.t)===med(a2.t)&&+med(a1.t)>3&&/40 scenarios/.test(a1.t),`B: a range given in percent for a cell that holds a fraction gives the same draws as the fraction (median ${med(a1.t)}%), and 40 runs are 40`,{a1:a1.t.slice(0,160),a2:a2.t.slice(0,160)});
a=await ask('uni','On Marina Bay, what drives the levered IRR, every input by the same ±10%?',{plan:[['tornado',{metric:'levered_irr',top:6,uniform:{by:10,unit:'pct'}}]],wait:300000});
ok(/Exit EBITDA multiple[^\n]*12\.15 to 14\.85/.test(a.t)&&!/3\.5 to 23\.5/.test(a.t),'B: “every input by the same ±10%” is ±10% on the exit multiple too, not ±10 units',a.t.slice(0,500));
await up('office_k.xlsx');
a=await ask('poc','On Main Street Office, a grid of sale price 600, 680, 760 against hard cost 290, 320, 350 on profit on cost.',{plan:[['sensitivity_grid',{x:{label:'Sale price',values:[600,680,760]},y:{label:'Hard cost',values:[290,320,350]},metric:'profit_on_cost'}]],wait:300000});
ok(/44\.81%/.test(a.t)&&!/4480/.test(a.t),'B: a result the workbook stores as a whole percent (44.81) is shown as it is, never ×100',a.t.slice(0,300));
await p.evaluate(()=>{const P=Object.values(PROJECTS).find(z=>/AL BAHR/i.test(z.name));switchProject(P.id,true,true)});await p.waitForTimeout(800);
a=await ask('res','On Al Bahr, the residual land value for a 20% profit on cost.',{plan:[['feasibility_study',{target_profit_on_cost:20}]],wait:400000});
ok(/Residual land value for 20% profit on cost: SAR 120(\.00)?M → SAR \d/.test(a.t)&&!/SAR 0\.12M/.test(a.t),'B: a land cost typed in thousands is shown as the amount it means (SAR 120M, not 0.12M)',a.t.match(/Residual land value[^\n]*/)||a.t.slice(-300));

// ---- C: the one term store, read by the chat, the covenant check and the report ----
await up('r33_waha_sar.xlsx');await doc('lease_waha.pdf');await doc('termsheet_waha.pdf');
a=await ask('rf','Which clause sets the rent-free period?',{plan:[['document_terms',{question:'Which clause sets the rent-free period?'}]]});
ok(/1 term in the documents answer that/.test(a.t)&&/rent-free period of 6 months/.test(a.t)&&!/Annual base rent/.test(a.t),'C: a question about one term answers with that term and its quote, not the whole list',a.t.slice(0,300));
a=await ask('dscr','Does the model match the term sheet?',{plan:[['document_terms',{question:''}]]});
ok(/Minimum DSCR[^\n]*worst 1\.16x against 1\.30x/.test(a.t)&&/breached/.test(a.t),'C: a covenant the term sheet states is checked on the line it binds (DSCR 1.16x against 1.30x), not shown as “—”',a.t.match(/Minimum DSCR[^\n]*/)||a.t.slice(0,300));
await p.evaluate(()=>{DOCS[PROJ.id].push({id:'Dtest',name:'lpa_test.pdf',at:new Date().toISOString(),ex:latestExport().id,kind:'fund',category:'fund',type:'lpa',pages:8,reg:[{key:'catchup',label:'GP catch-up',doc:'50%',quote:'fifty per cent (50%) to the General Partner until it has received 20% of the profits',page:5,article:'4.1(c)',status:'matches',cell:'Assumptions!C11',model:'50%'}],items:[],provisions:[],terms:[]})});
a=await ask('cu','Quote the catch-up clause.',{plan:[['document_terms',{question:'Quote the catch-up clause.'}]]});
ok(/GP catch-up/.test(a.t)&&/fifty per cent \(50%\) to the General Partner/.test(a.t)&&/art\. 4\.1\(c\)|§4\.1\(c\)|p\.5/.test(a.t),'C: an agreement’s register is read by the same chat answer, with the clause and the quote',a.t.slice(0,300));
const rep=await p.evaluate(()=>{const PL=rpPlan(RPTS.lender.blocks);RSEL='lender';renderReport();return{shown:PL.shown,html:document.querySelector('#report').innerText.replace(/\s+/g,' ')}});
ok(rep.shown.includes('wb_documents')&&/Terms from the documents/.test(rep.html)&&/minimum DSCR of 1\.30x/.test(rep.html)&&/GP catch-up/.test(rep.html),'C: a pack built on a model with documents carries their terms (lease, term sheet and agreement alike)',rep.shown);
a=await ask('cov3','Is the DSCR covenant met?',{plan:[['line_over_time',{lines:['DSCR']}]]});
ok(/minimum of 1\.25x/.test(a.t)&&/termsheet_waha\.pdf states 1\.3/.test(a.t),'C: a covenant check with no covenant given tests the model’s own covenant input and says the term sheet states another (1.30x)',a.t.slice(-400));

// ---- D: the search goes past the points where the model gives no figure ----
await p.evaluate(()=>{const P=Object.values(PROJECTS).find(z=>/MARINA/i.test(z.name));switchProject(P.id,true,true)});await p.waitForTimeout(800);
a=await ask('zero','On Marina Bay, how far can ADR fall before the levered IRR hits zero?',{plan:[['solve_for_target',{assumption:'Stabilised ADR',metric:'levered_irr',target:0}]],wait:400000});
const adr=+((a.t.match(/Stabilised ADR for Levered IRR = 0\.00%: ([\d,.]+)/)||[])[1]||'').replace(/,/g,'');
ok(adr>560&&adr<610&&!/does not reach/.test(a.t),`D: the ADR at which the levered IRR is zero is found (${adr}, between the points where the model gives no IRR and today's 780), not “does not reach”`,a.t.slice(0,300));
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
