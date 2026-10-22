// The structural model debug on a model with nine planted defects (fixtures/models/audit_bugs.xlsx, synthetic): an input nothing
// reads, a SUM one row short, a row whose last period skips the growth, a typed number at the end of the cash-flow row, a dashboard
// figure typed over, an S-curve at 95%, the model's own check row not zero, a cost wired to raise profit, a year header that jumps.
// Each is found from the workbook's own graph, each proposed fix carries its exact effect on the outputs, the agents get the facts and
// may look things up before judging, the brief names the model type, and the reviewer's verdict on a finding is kept.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const seen={audit:[],sys:[],lookups:[]};
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const msgs=j.payload.messages;const user=JSON.stringify(msgs);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/plan behaviour tests/.test(sys))return reply(JSON.stringify({probes:[]}));
  if(/senior financial-modelling reviewer/.test(sys)){seen.sys.push(sys);seen.audit.push({p:j.provider,user,n:msgs.length});
    // Claude asks to look up the short total and the typed cash-flow cell first; OpenAI answers at once
    if(j.provider==='anthropic'&&!msgs.some(m=>m.role==='assistant'))return reply(JSON.stringify({lookups:[{op:'region',ref:'Model!F15'},{op:'trace',ref:'Model!L25'},{op:'whatif',sets:[['Inputs!B3',440000]]}]}));
    const last=String(msgs[msgs.length-1].content||'');if(/^LOOKUP RESULTS/.test(last))seen.lookups.push(last);
    return reply(JSON.stringify({read_ok:true,read_note:'read',items:[{kind:'bug',severity:'high',title:'Total cost leaves marketing out',evidence:'Model!F15 =SUM(F10:F13) while F14 holds marketing',cell:'Model!F15',recommendation:'extend the SUM'}],observations:[]}))}
  if(/second reviewer/.test(sys))return reply(JSON.stringify({verdicts:[]}));
  if(/arbitrate/.test(sys))return reply(JSON.stringify({verdicts:[]}));
  if(/explain, to a busy investment director/.test(sys))return reply('The total cost formula leaves the marketing line out.');
  if(/locate headline figures/.test(sys))return reply(JSON.stringify({figures:[],currency:''}));
  reply('{}')});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+String(typeof d==='string'?d:JSON.stringify(d)).slice(0,400):''))}};
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/audit_bugs.xlsx');await p.waitForTimeout(1500);await p.click('#npCreate');
await p.waitForFunction(()=>{const x=latestExport();return x&&x.audit&&x.audit.status!=='running'},null,{timeout:240000}).catch(()=>{});
const A=await p.evaluate(()=>{const a=latestExport().audit;return{status:a.status,err:a.err,struct:a.struct,checks:a.checks.map(c=>({l:c.level,code:c.code,cell:c.cell,t:c.text})),log:a.log.map(l=>l.text),items:(a.ai&&a.ai.items||[]).map(z=>({t:z.title,by:z.by}))}});
ok(A.status==='done','the debug finished: '+(A.err||''));
const by=code=>A.checks.filter(c=>c.code===code);
ok(by('unused-input').some(c=>c.cell==='Inputs!B9'&&c.l==='error'),'planted 1: the input nothing reads (Rent growth, Inputs!B9) is a likely error, from the dependency graph',by('unused-input'));
{const r=by('range-short');ok(r.length>=1&&r.every(c=>/stops one cell before Model![F-L]14/.test(c.t))&&r.some(c=>c.l==='error'&&/Levered IRR .* → /.test(c.t)),'planted 2: the SUM one row short of its block is found with its exact effect on the levered IRR',r.map(c=>c.t.slice(0,160)))}
{const e=by('row-end');ok(e.some(c=>c.cell==='Model!L18'&&c.l==='note'&&/No output moves/.test(c.t)),'planted 3: the last period skipping the growth is found; nothing reads it, so it is a note',e.map(c=>c.cell+' '+c.l));
  ok(e.some(c=>c.cell==='Model!L25'&&c.l==='error'&&/typed 150,?000/.test(c.t)&&/Levered IRR .* → /.test(c.t)),'planted 4: the typed number at the end of the cash-flow row, with its effect on the IRR',e.filter(c=>c.cell==='Model!L25').map(c=>c.t));
  ok(e.some(c=>c.cell==='Model!E18'&&c.l==='note'),'a first period that differs from its row is a note, not an error (a seed value is normal)')}
ok(by('typed-over').some(c=>c.cell==='Dashboard!B6'&&/typed (SAR 0\.31M|310,?000)/.test(c.t)),'planted 5: the dashboard figure typed over where the column holds formulas',by('typed-over'));
ok(by('phasing').some(c=>/S-curve/.test(c.t)&&/95\.0%/.test(c.t)&&c.l==='error'),'planted 6: the S-curve adds to 95%',by('phasing'));
ok(by('check-row').some(c=>c.cell==='Checks!B3'&&c.l==='error')&&!by('check-row').some(c=>/Net profit check/.test(c.t)),'planted 7: the model’s own check row is not zero (and a figure named “…check” is not mistaken for one)',by('check-row'));
ok(by('direction').some(c=>c.cell==='Inputs!B3'&&/Net profit up/.test(c.t)&&c.l==='error'),'planted 8: construction cost up moves net profit up: a certain fact, called an error',by('direction').map(c=>c.cell+' '+c.t.slice(0,90)));
ok(by('timeline').some(c=>/jumps/.test(c.t)&&/step 2/.test(c.t)),'planted 9: the year header that jumps 2029',by('timeline'));
ok(by('no-effect').some(c=>c.cell==='Inputs!B6'),'the marketing rate feeds cells but moves no output (the short SUM leaves its line out): a warning',by('no-effect'));
ok(!by('direction').some(c=>c.cell==='Inputs!B7'),'the sale price moving profit up is right, not flagged');
ok(A.struct&&A.struct.signature>=8,'every numeric input was moved 1% for the signature: '+JSON.stringify(A.struct));
const u=seen.audit[0]?seen.audit[0].user:'';
ok(/STRUCTURAL AUDIT/.test(u)&&/unused input: Rent growth/.test(u)&&/range stops short: Model!F15/.test(u),'the agents receive the structural facts with the effects');
ok(seen.sys[0]&&/This is a DEVELOPMENT model/.test(seen.sys[0])&&/reviewing an Excel financial model/.test(seen.sys[0]),'the brief names the model type with its checklist and reviews an Excel model, not an EstateMaster export');
ok(seen.lookups.length===1&&/REGION around Model!F15/.test(seen.lookups[0])&&/TRACE Model!L25: value 150000; formula \(typed\)/.test(seen.lookups[0])&&/WHAT-IF Inputs!B3=440000: Levered IRR/.test(seen.lookups[0]),'an agent looked up a region, a cell’s graph and a what-if before judging, and got exact answers',seen.lookups[0]&&seen.lookups[0].slice(0,400));
ok(A.log.some(l=>/looks up 3 things/.test(l)),'the lookup round is in the log');
ok(A.items.some(z=>/marketing out/.test(z.t)),'the agents’ findings stand after the lookup round');
// the reviewer's verdict on a finding is kept with the corrections
await p.evaluate(()=>{openDbgWin(latestExport().id);dbgWMin(false)});await p.waitForTimeout(300);
const nb=await p.locator('#dbgWBody [data-aufb="false"]').count();ok(nb>=5,'each observation and finding offers a verdict (real / false alarm): '+nb);
await p.locator('#dbgWBody [data-aufb="false"]').first().click();await p.waitForTimeout(200);
const fb=await p.evaluate(()=>{const a=latestExport().audit;const L=JSON.parse(localStorage.getItem('em_corrections')||'[]');return{user:a.checks.filter(c=>c.user).map(c=>c.code+':'+c.user),log:L.filter(e=>/^audit-/.test(e.kind)).map(e=>e.kind+' '+e.to+' '+e.proved)}});
ok(fb.user.length===1&&fb.user[0].endsWith(':false')&&fb.log.length===1&&/^audit-check false development$/.test(fb.log[0]),'the verdict is kept on the finding and logged with the corrections, with the model family',fb);
const W=await p.evaluate(()=>$('#dbgWBody').textContent);ok(/you: false alarm/.test(W),'the window shows the reviewer’s verdict');
ok(!errs.length,'no page errors',errs);
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
