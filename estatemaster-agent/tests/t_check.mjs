// Checks on the AI's own calculations: arithmetic, direction, EstateMaster's sensitivity table as the benchmark, and the
// independent checker; flagged figures say so on the Assumptions tab and in the Daily feed.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);let MODE='bad',models=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');models.push(j.payload.model);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/independent checker of a financial calculation/.test(sys))return reply(JSON.stringify({verdicts:[{metric:'levered_irr',ok:MODE==='good',issue:MODE==='good'?'':'the IRR working double counts the sales-cost saving',severity:'error'},{metric:'profit_on_cost',ok:true,issue:'',severity:'warn'},{metric:'net_profit',ok:true,issue:'',severity:'warn'}],summary:MODE==='good'?'The workings are consistent with the export.':'The IRR is overstated.'}));
  if(/senior real estate development finance analyst/.test(sys)){const d=j.provider==='openai'?0.1:0;
    if(MODE==='bad')return reply(JSON.stringify({method:'Hand calculation.',results:[{metric:'levered_irr',value:28.5+d,working:'w'},{metric:'profit_on_cost',value:30+d,working:'w'},{metric:'net_profit',value:100000000,working:'w'}]}));
    return reply(JSON.stringify({method:'Hand calculation from the export and its sensitivity table.',results:[{metric:'levered_irr',value:18.2+d,working:'w'},{metric:'profit_on_cost',value:17.9+d,working:'w'},{metric:'net_profit',value:100000000,working:'w'}]}))}
  reply('ok')});
const ev=(f,a)=>p.evaluate(f,a);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
// a sensitivity table from EstateMaster on the export: the benchmark
await ev(()=>{const x=latestExport();x.sens=[{kind:'1way',v:'Sale Price',metric:'Equity IRR',mk:'irr',shifts:[-20,-10,0,10,20],values:[15,18,21.5,24,27],sheet:'Sens'}]});
const bad=await ev(async()=>{const steps=[];const r=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(s));const m=Object.fromEntries(r.metrics.map(m=>[m.k,m]));const w=k=>WORK.find(x=>x.id===m[k].work).text;return{steps,irr:{flag:m.levered_irr.flag,checks:m.levered_irr.checks,w:w('levered_irr')},poc:{flag:m.profit_on_cost.flag,checks:m.profit_on_cost.checks},np:{flag:m.net_profit.flag,warn:m.net_profit.warn},checker:r.checker.model,html:testHTML(r)}});
ck('arithmetic check: profit on cost that does not reconcile with net profit / total cost is flagged',bad.poc.flag&&bad.poc.checks.some(t=>/does not reconcile/.test(t)),JSON.stringify(bad.poc));
ck('direction check: the IRR improving on an adverse change (a price cut) is flagged',bad.irr.flag&&bad.irr.checks.some(t=>/improves .* although every change tested is adverse/.test(t)),JSON.stringify(bad.irr.checks));
ck('EstateMaster’s own sensitivity table is the benchmark: the AI’s IRR is well off the table’s 18.00% at −10%',bad.irr.checks.some(t=>/sensitivity table .* points to 18\.00% at -10%/.test(t))&&/interpolated between its cells/.test(bad.irr.w),bad.irr.checks.join(' | '));
ck('the independent checker is a third model (not one of the two calculators) and its issue is recorded',/Opus/.test(bad.checker)&&bad.irr.checks.some(t=>/Checker panel \(.*Opus.*\): .*double counts/.test(t))&&/Independent checker: /.test(bad.irr.w),bad.checker);
ck('the working says FLAGGED and lists every check; the steps show the checks and the checker',/FLAGGED: do not rely/.test(bad.irr.w)&&/Checks on this figure:/.test(bad.irr.w)&&bad.steps.some(s=>/Checks on the result: \d+ finding/.test(s))&&bad.steps.some(s=>/Checker panel \(.*\): 1 issue raised/.test(s)),bad.steps.join(' | '));
ck('the Assumptions tab marks flagged figures',(bad.html.match(/⚠ flagged/g)||[]).length>=2&&/independent checker/.test(bad.html),'');
// a clean calculation
MODE='good';
const good=await ev(async()=>{const r=await aiCrossCheck([{text:'sale price −10%'}]);const m=Object.fromEntries(r.metrics.map(m=>[m.k,m]));const w=WORK.find(x=>x.id===m.levered_irr.work).text;return{flags:r.metrics.map(m=>!!m.flag),warns:r.metrics.map(m=>!!m.warn),w,html:testHTML(r)}});
ck('a consistent calculation within the EstateMaster table passes: no flag, checks recorded, checker named',!good.flags.some(Boolean)&&!good.warns.some(Boolean)&&/Arithmetic, direction and bounds hold\./.test(good.w)&&/Independent checker: .*Opus/.test(good.w)&&!/⚠ flagged/.test(good.html),good.w.slice(-400));
// the Daily feed shows the flags
for(let i=0;i<30;i++){if(await ev(()=>APQ.filter(c=>c.status==='pending').length>=12&&APQ.filter(c=>c.status==='pending').every(c=>c.ai||c.aiErr)))break;await p.waitForTimeout(500)}
MODE='bad';await ev(()=>{APQ.forEach(c=>{delete c.ai;delete c.aiErr})});await ev(()=>showTab('appr'));for(let i=0;i<40;i++){await p.waitForTimeout(500);const done=await ev(()=>{const cards=[...document.querySelectorAll('#apList .em')];return cards.length&&APQ.filter(c=>c.status==='pending').every(c=>c.ai&&!c.aiBusy)&&cards.every(c=>/⚠ (flagged|failed a check)/.test(c.textContent))});if(done&&i>=12)break}
const fd=await ev(()=>{const cards=[...document.querySelectorAll('#apList .em')];return{n:cards.length,flagged:cards.filter(c=>/⚠ (flagged|failed a check)/.test(c.textContent)).length,checked:cards.filter(c=>/Estimated by .*checked by/.test(c.textContent)).length}});
ck('Daily feed cards show flagged figures and name the checks',fd.n>0&&fd.flagged===fd.n&&fd.checked===fd.n,JSON.stringify(fd));
ck('the flag survives a reload (kept with the change)',await ev(()=>{const m=JSON.parse(localStorage.getItem(MEMKEY));return m.APQ.filter(c=>c.status==='pending'&&c.ai).every(c=>c.ai.metrics.some(x=>x.flag)&&c.ai.checker)}),'');
ck('no haiku anywhere in the routing',!models.some(m=>/haiku/.test(m||'')),[...new Set(models)].join(','));
ck('no page errors',!errs.length,errs.join(' | ').slice(0,300));
console.log(R.map(r=>r.join(' | ')).join('\n'));console.log(`t_check ${tag}: ${R.filter(r=>r[0]==='PASS').length} pass ${R.filter(r=>r[0]==='FAIL').length?'FAIL '+R.filter(r=>r[0]==='FAIL').map(r=>r[1]).join(' / '):''}`);
await b.close();
