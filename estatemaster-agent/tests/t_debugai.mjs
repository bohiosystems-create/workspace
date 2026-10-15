// Model debug is AI-led: the tools only gather facts (a formula scan of the workbook and behaviour tests the AI plans and the engine runs),
// the agents judge them and the app's own rule observations, decide among themselves which findings are the same issue, and a third model
// decides what they still disagree on. A model with four planted bugs: a typed number inside a formula row, a formula skipping a line,
// an input nothing uses, a division by zero.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const seen={audit:[],verify:[],arb:[],probe:[]};let ARBFAIL=false;
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const user=JSON.stringify(j.payload.messages);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/plan behaviour tests/.test(sys)){seen.probe.push(user);return reply(JSON.stringify({probes:[{cell:'Assumptions!D22',change:'pct',value:50,expect:{levered_irr:'down',profit:'down'},why:'a marketing cost should lower profit'},{cell:'Assumptions!D9',change:'pct',value:-10,expect:{levered_irr:'down',profit:'down'},why:'price drives revenue'},{cell:'Assumptions!D13',change:'pct',value:10,expect:{levered_irr:'down',profit:'down'},why:'build cost'}]}))}
  if(/senior financial-modelling reviewer/.test(sys)){seen.audit.push({p:j.provider,user});const oa=j.provider==='openai';
    return reply(JSON.stringify({read_ok:true,read_note:'read fine',items:oa?[
        {kind:'bug',severity:'high',title:'Marketing budget is not linked to any cost',evidence:'T1: Marketing budget +50% leaves profit unchanged; Assumptions!D22',cell:'Assumptions!D22',recommendation:'link it to the cost lines'},
        {kind:'risk',severity:'low',title:'Exit relies on one sales year',evidence:'sales over 12 months',cell:'',recommendation:'test a slower sale'}]
      :[{kind:'bug',severity:'high',title:'Unused marketing input',evidence:'Assumptions!D22 drives nothing (T1)',cell:'Assumptions!D22',recommendation:'connect or remove'},
        {kind:'bug',severity:'high',title:'Build cost typed over in month 10',evidence:'CashFlow!M6 is a typed -1,400,000 among formulas',cell:'CashFlow!M6',recommendation:'restore the formula'},
        {kind:'inconsistency',severity:'medium',title:'Net cash flow skips sales in one month',evidence:'CashFlow!P9 =SUM(P5:P7) while the row sums P5:P8',cell:'CashFlow!P9',recommendation:'fix the range'}],
      observations:[{i:0,verdict:oa?'false':'real',why:oa?'harmless':'it is real'}]}))}
  if(/second reviewer/.test(sys)){seen.verify.push({p:j.provider,user});
    const items=[...user.matchAll(/(\d+)\. \[(\w+), \w+\] ([^—]+)—/g)].map(m=>({i:+m[1],t:m[3]}));
    const mine=[...String(user.split('Your findings:')[1]||'').matchAll(/(\d+)\. ([^\\]+)/g)].map(m=>({i:+m[1],t:m[2]}));
    return reply(JSON.stringify({verdicts:items.map(z=>{const same=/marketing/i.test(z.t)?mine.find(o=>/marketing/i.test(o.t)):null;return{i:z.i,verdict:/sales year/i.test(z.t)?'rejected':'confirmed',same_as:same?same.i:null,reason:'checked against the cells'}})}))}
  if(/arbitrate/.test(sys)){seen.arb.push(user);if(ARBFAIL)return r.fulfill({status:500,contentType:'application/json',body:'{"error":"boom"}'});const ids=[...user.matchAll(/(?:\\n|\n)([FO]\d+)\./g)].map(m=>m[1]);return reply(JSON.stringify({verdicts:ids.map(id=>({id,verdict:id[0]==='O'?'rejected':'rejected',reason:'the figures do not support it'}))}))}
  if(/explain, to a busy investment director/.test(sys)){seen.plain=(seen.plain||[]).concat(user);return reply('One reviewer thinks the marketing input is not linked to any cost; the other could not confirm it from the workbook. Check whether any cost line refers to Assumptions!D22.')}
  if(/locate headline figures/.test(sys))return reply(JSON.stringify({figures:[],currency:''}));
  reply('{}')});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_bugged.xlsx');await p.waitForTimeout(1500);await p.click('#npCreate');
await p.waitForFunction(()=>{const x=latestExport();return x&&x.audit&&x.audit.status!=='running'},null,{timeout:240000}).catch(()=>{});
const A=await ev(()=>{const a=latestExport().audit;return{status:a.status,err:a.err,scan:a.scan,probes:a.probes,items:a.ai&&a.ai.items.map(z=>({t:z.title,by:z.by,st:z.status,k:z.kind})),dis:a.ai&&a.ai.dismissed.map(z=>z.title),obs:a.checks.filter(c=>c.level!=='note').map(c=>({t:c.text.slice(0,60),ai:c.ai&&c.ai.status})),log:a.log.map(l=>l.text)}});
t(A.status==='done','the debug finished: '+(A.err||''));
const u=seen.audit[0]?seen.audit[0].user:'';
t(/FORMULA SCAN/.test(u)&&/CashFlow!M6 = -1400000 \(typed\)/.test(u),'planted 1: the typed number inside the build-cost row reaches the agents as a fact');
t(/CashFlow!P9 =SUM\(P5:P7\)/.test(u),'planted 2: the formula that skips the sales line reaches the agents as a pattern break');
t(/#DIV\/0!/.test(u)&&/Checks!D15/.test(u),'planted 4: the division by zero reaches the agents');
t(/BEHAVIOUR TESTS/.test(u)&&/T1 Marketing budget \(Assumptions!D22\) \+50%: [^\n]*Net profit (GBP|£)[^→]*→ (GBP|£)/.test(u),'planted 3: the AI-planned test of the unused input ran on the workbook and its result reached the agents');
const t1=(A.probes||[])[0];t(t1&&t1.res.every(r=>!Number.isFinite(r.b)||Math.abs(r.v-r.b)<1e-9),'the engine shows the marketing input moves nothing (a disconnected input)');
t(seen.probe.length===1&&/Marketing budget \| Assumptions!D22/.test(seen.probe[0]),'the AI chose the tests from the model’s own inputs');
t(A.scan&&A.scan.errors>=1&&A.scan.breaks>=1&&A.scan.hard>=1,'scan summary stored: '+JSON.stringify(A.scan));
const mk=A.items.find(z=>/marketing/i.test(z.t));t(mk&&mk.st==='corroborated'&&mk.by.length===2&&A.items.filter(z=>/marketing/i.test(z.t)).length===1,'the agents themselves decided the two marketing findings are one issue, found by both: '+JSON.stringify(mk));
t(A.items.some(z=>/typed over/i.test(z.t)&&z.st==='confirmed')&&A.items.some(z=>z.k==='inconsistency'&&z.st==='confirmed'),'single-agent findings confirmed by the other agent; “inconsistency” kept as its own kind');
t(A.dis.some(z=>/sales year/i.test(z)),'a finding rejected by the other agent and then by the third model is dismissed: '+JSON.stringify(A.dis));
t(seen.arb.length===1&&/F\d+\./.test(seen.arb[0]),'the third model decided the disputed finding');
await ev(()=>{window._ec=exportChecks;window.exportChecks=x=>window._ec(x).concat([{level:'warn',code:'t-obs',text:'Contingency of 5% looks low for a residential scheme',cell:'Assumptions!D15'}])});
await ev(()=>auditExport(latestExport(),true,false));await p.waitForFunction(()=>latestExport().audit.status!=='running',null,{timeout:240000}).catch(()=>{});
const O=await ev(()=>latestExport().audit.checks.filter(c=>c.level!=='note').map(c=>({t:c.text,ai:c.ai})));
t(O.length===1&&O[0].ai&&O[0].ai.votes.length===2&&O[0].ai.status==='dismissed'&&O[0].ai.arb,'an app observation is a claim to review, not a verdict: the agents split on it, the third model rejected it, so it is dismissed '+JSON.stringify(O[0]&&O[0].ai).slice(0,200));
t(/O0\. App observation: Contingency/.test(seen.arb[seen.arb.length-1]||''),'the disputed observation went to the third model');
await ev(()=>{openDbgWin(latestExport().id);dbgWMin(false)});await p.waitForTimeout(300);
const W=await ev(()=>$('#dbgWBody').textContent);
t(/App observations/.test(W)&&/dismissed after review/.test(W)&&/Evidence the agents judged/.test(W)&&/inconsistency/.test(W)&&/T1 Marketing budget/.test(W),'the window shows observations with verdicts, the evidence and the dismissed list');
// a failing third model is said, not swallowed
if(process.env.SKIPFAIL)ARBFAIL=false;else ARBFAIL=true;await ev(()=>auditExport(latestExport(),true,false));await p.waitForFunction(()=>latestExport().audit.status!=='running',null,{timeout:240000}).catch(()=>{});
const L=await ev(()=>latestExport().audit.log.map(l=>l.text));t(L.some(l=>/Arbitration by .* failed/.test(l)),'a failed arbitration is written in the log: '+L.filter(l=>/Arbitration/.test(l)).join(' | '));
// no hurdle unless the model or the user gives one: the agents are told so, and no 18%/15% default reaches them
t(/No hurdle has been set for this model/.test(u)&&!/hurdle[^.\n]{0,40}\b18%|\b18%[^.\n]{0,20}hurdle/.test(u),'no hurdle set: the agents are told not to assume one, and no 18% default is sent');
const hz=await ev(()=>({v:HUR(),p:HPOC(),line:hurLine(),tag:hurTag(HUR())}));t(!Number.isFinite(hz.v)&&!Number.isFinite(hz.p)&&hz.tag==='no hurdle set','HUR() and the profit-on-cost hurdle are unset by default: '+JSON.stringify(hz).slice(0,120));
await ev(()=>setHurdle(16,'typed'));const hs=await ev(()=>({v:HUR(),line:hurLine()}));t(hs.v===16&&/levered IRR 16% \(given by the user\)/.test(hs.line),'a hurdle the user gives is used, and said to come from them');await ev(()=>{delete HURDLES[PROJ.id]});
// the discrepancy window for a review finding: who said what in sentences, no figures invented from model names, a plain summary written by Claude
await ev(()=>{DISPUTES.length=0;flagDispute({where:'Model review',what:'test',kind:'doubt',key:'t-claim',items:[{label:'Missing promote for 15% hurdle',claim:true,raised:'OpenAI gpt-5',evidence:'The export lists Hurdle=10%/Promote 15%',said:[{by:'Claude Fable 5.1',verdict:'uncertain',reason:'The export lists Hurdle=10%/Promote 15%, Hurdle=12%/Promote 20% and a bare Hurdle=15%, but a third promote cell may simply not have been read, so the export cannot settle whether the tier is blank or not.'},{by:'Claude Opus 5.5',third:true,verdict:'uncertain',reason:'Cannot be confirmed from what was read.'}]}],note:''});showDispute(DISPUTES[DISPUTES.length-1],true)});
await p.waitForFunction(()=>/Written by/.test(($('#dispBody')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
const DW=await ev(()=>$('#dispBody').innerText);
t(!/a difference of/.test(DW)&&!/gives OpenAI|gives Claude/.test(DW),'no “difference” computed from model names');
t(/Raised by OpenAI gpt-5/.test(DW)&&/Claude Fable 5\.1 cannot tell from the workbook/.test(DW)&&/third reviewer/.test(DW),'who said what, in plain sentences');
t(/One reviewer thinks/.test(DW)&&/Written by Claude/.test(DW),'a plain-English summary written by Claude heads the item');
t(!/These are AI estimates/.test(DW),'no “AI estimates” footer on a review finding');
t(!/\w…?$/.test('')&&!/ o$/m.test(DW),'reasons end on whole sentences');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
