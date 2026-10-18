// On an uploaded workbook the figure is the exact recalculation, and the two agents still audit it and talk: both agree → the exact
// figure stands, reviewed; one queries → they confront, the third model decides; found flawed → the figure stays but is flagged,
// with a discrepancy entry showing who said what.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let MODE='agree',calls=[];
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const user=JSON.stringify(j.payload.messages);calls.push({p:j.provider,m:j.payload.model,sys:sys.slice(0,40)});
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify({changes:[{label:'ADR',cell:'OpCashFlow!H12',kind:'pct',value:-10,sure:true}]}));   // the AI's reading of “ADR -10%”
  if(/third analyst/.test(sys))return reply(JSON.stringify(MODE==='flawed'?{right:'flawed',why:'OpCashFlow!H12 is the year-1 ADR only; later years grow from it, so the cut applies, but occupancy was not meant to move',who:'2'}:{right:'recalculation',why:'OpCashFlow!H12 is the ADR assumption and every year grows from it: the right cell',who:'1'}));
  if(/locate headline figures/.test(sys))return reply(JSON.stringify({figures:[{key:'levered_irr',cell:'Summary!H7',label:'Limited Partner / IRR',scale:1},{key:'unlevered_irr',cell:'Summary!H5',label:'Unlevered Returns / IRR',scale:1}],currency:'EUR'}));
  if(/senior financial-modelling reviewer/.test(sys))return reply(JSON.stringify({read_ok:true,read_note:'read fine',items:[]}));
  if(/audit an exact recalculation/.test(sys)){const rev=/Confront the two audits/.test(user);const q=j.provider==='openai'&&(MODE==='query'||MODE==='flawed'||(MODE==='withdraw'&&!rev));
    return reply(JSON.stringify({verdict:q?'query':'agree',why:q?'H12 may be the year-1 ADR only: later years may hold their own ADR':'OpCashFlow!H12 is the ADR, a 10% cut and the right direction',results:[{metric:'levered_irr',value:j.provider==='openai'?18.5:19.1,working:'hand estimate'},{metric:'unlevered_irr',value:13.4,working:'hand estimate'}]}))}
  reply('ok')});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
await ev(()=>xcEngine(latestExport()));
const run=async()=>ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'ADR -10%'}],async s=>steps.push(s));return{steps,xc:res.xc,review:res.review,arbBy:res.arbBy,m:res.metrics.find(m=>m.k==='levered_irr'),names:res.names,exch:(res.exchange||[]).map(e=>e.who+': '+e.text.slice(0,60)),html:testHTML(res)}});
// 1. both agree
let r=await run();
t(r.xc&&Math.abs(r.m.value-18.84)<0.01&&r.m.status==='exact'&&!r.m.warn,'the figure is the exact recalculation (18.84%), not an estimate');
t(r.review&&r.review.status==='agree'&&r.review.by.length===2,'both agents audited and agree: '+JSON.stringify(r.review));
t(r.steps.some(s=>s&&s.who==='Workbook recalculation')&&r.steps.filter(s=>s&&s.who&&/Claude|OpenAI|GPT|gpt/i.test(s.who)).length>=2,'the recalculation and each agent speak in the chat box: '+JSON.stringify(r.steps.filter(s=>s&&s.who).map(s=>s.who+' · '+(s.result||'').slice(0,40))));
t(!r.arbBy&&!calls.some(c=>/third analyst/.test(c.sys)),'no third model when both agree');
let tb=await ev(()=>{const b=[...document.querySelectorAll('#msgs .msg.talkbox')].pop();return b?{n:b.querySelectorAll('.st.talk').length,sum:(b.querySelector('.tb-sum')||{}).textContent||''}:null});
t(tb&&tb.n>=3&&/agree/.test(tb.sum),'chat box: conversation and a one-line close: '+JSON.stringify(tb));
// 2. a query withdrawn after the confrontation: no dispute left, so no third model
calls=[];MODE='withdraw';r=await run();
t(r.review&&r.review.status==='agree'&&r.review.after==='review'&&!r.arbBy&&r.steps.some(s=>typeof s==='string'&&/confront, then a third model/.test(s)),'a query withdrawn after confronting: agreed, no third model needed: '+JSON.stringify(r.review));
// 3. a query that stands: the third model decides, and upholds the recalculation
calls=[];MODE='query';r=await run();
t(r.review&&r.review.status==='stands'&&r.arbBy&&!r.names.includes(r.arbBy),`a query brings in a third model that is neither (${r.arbBy}); it upholds: `+JSON.stringify(r.review).slice(0,200));
t(Math.abs(r.m.value-18.84)<0.01&&!r.m.warn,'the exact figure is kept, unflagged');
t(r.steps.some(s=>typeof s==='string'&&/confront, then a third model/.test(s))&&r.steps.some(s=>s&&s.who==='Verdict'),'confrontation announced and a verdict spoken');
// 3. the query is upheld as flawed: the figure stays but is flagged, and a discrepancy entry lists who said what
calls=[];MODE='flawed';await ev(()=>{DISPUTES.length=0});r=await run();
t(r.review&&r.review.status==='flawed'&&r.m.warn&&Math.abs(r.m.value-18.84)<0.01,'found flawed: exact figure kept but flagged '+JSON.stringify(r.m.checks));
const d=await ev(()=>DISPUTES.length?{where:DISPUTES[DISPUTES.length-1].where,note:DISPUTES[DISPUTES.length-1].note,ex:DISPUTES[DISPUTES.length-1].exchange.map(e=>e.who)}:null);
t(d&&d.where==='Exact recalculation'&&/Verdict/.test(d.note)&&d.ex.includes('Workbook recalculation')&&d.ex.includes('Verdict'),'discrepancy entry with the exchange: '+JSON.stringify(d).slice(0,300));
t(/>questioned</.test(r.html)&&/Questioned:<\/b>/.test(r.html)&&/Claude Opus 5.5/.test(r.html),'the result card says the figure is questioned and by whom');
// the AI reader of the workbook: where it points at a different cell, or a different currency, the user decides; the rules never win silently
await p.waitForFunction(()=>{const x=latestExport();return x.audit&&x.audit.status!=='running'},null,{timeout:60000}).catch(()=>{});
const lq=await ev(()=>{const x=latestExport();return{c:x.audit.cellConflicts,ccy:x.audit.ccyConflict,qs:layoutQuestions(x).map(q=>[q.id,q.q,q.opts])}});
t(lq.c&&lq.c.levered_irr&&lq.c.levered_irr.ai==='Summary!H7'&&!lq.c.unlevered_irr,'AI reader: a different cell with a different value is a conflict; the same cell is not: '+JSON.stringify(lq.c));
t(lq.qs.some(q=>q[0]==='cell:levered_irr'&&/Summary!H6 \(24\.05%\)/.test(q[1])&&/Summary!H7 \(22\.08%\)/.test(q[1])),'the chat asks which cell, showing both cells and values: '+JSON.stringify(lq.qs.find(q=>q[0]==='cell:levered_irr')));
t(lq.ccy&&lq.ccy.ai==='EUR'&&lq.qs.some(q=>q[0]==='ccy'&&/USD/.test(q[1])&&/EUR/.test(q[1])),'and which currency: '+JSON.stringify(lq.qs.find(q=>q[0]==='ccy')));
const ans=await ev(async()=>{const x=latestExport();CLARIFY={xid:x.id,qs:layoutQuestions(x)};await answerLayout('Levered IRR = Summary!H6');await answerLayout('USD');return{cell:x.cells.levered_irr,v:x.out.levered_irr,ccy:x.meta.currency,left:layoutQuestions(x).map(q=>q.id)}});
t(ans.cell==='Summary!H6'&&Math.abs(ans.v-24.05)<0.01&&ans.ccy==='USD'&&!ans.left.includes('cell:levered_irr')&&!ans.left.includes('ccy'),'answers settle both: '+JSON.stringify(ans));
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
