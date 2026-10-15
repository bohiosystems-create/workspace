// Cross-model: Reports and the Daily feed in the left menu, model pages in the top menu; the feed and the daily report
// cover every model; a change of another model is costed on that model's export and approving it opens that model.
import {chromium} from 'playwright';import fs from 'fs';import {createRequire} from 'module';const require=createRequire(import.meta.url);
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const XLSX=require(sp+'package/xlsx.js');
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1600,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,260)]);let calcs=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const msgs=JSON.stringify(j.payload.messages);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/senior real estate development finance analyst/.test(sys)){calcs.push(msgs);return reply(JSON.stringify({method:'Hand calculation.',results:[{metric:'levered_irr',value:16.9,working:'w'},{metric:'profit_on_cost',value:13.1,working:'w'},{metric:'net_profit',value:112000000,working:'w'}]}))}
  reply('ok')});
const ev=(f,a)=>p.evaluate(f,a);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ui=await ev(()=>({vis:[...document.querySelectorAll('.tabs .tab')].filter(t=>t.offsetParent!==null).map(t=>t.textContent),chip:$('#tabModel').textContent,nav:[...document.querySelectorAll('#prNav .pr-nav-i')].map(n=>n.textContent),land:document.querySelector('.pane.on').id,title:$('#kTitle').textContent}));
ck('landing on the Daily feed (all models); left menu: Reports and Daily feed, then the models; top menu: the model’s name and its own pages',ui.land==='p-appr'&&/all models/.test(ui.title)&&/Reports/.test(ui.nav[0])&&/Daily feed/.test(ui.nav[1])&&/Al Narjis/.test(ui.chip)&&!ui.vis.some(t=>/Reports|Daily feed/.test(t))&&!ui.vis.some(t=>/^Assumptions$/.test(t))&&ui.vis.some(t=>/Financial modelling/.test(t)),JSON.stringify(ui));
// a second model from an export
const wbx=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wbx,XLSX.utils.aoa_to_sheet([['Al Rabie Court Summary'],['Total Development Cost',null,'SAR',401000000],['Total Revenue',null,'SAR',486000000],['Net Development Profit',null,'SAR',85000000],['Development Margin (on cost)',null,'%',21.2],['Equity IRR',null,'%',24.1]]),'Summary');
XLSX.utils.book_append_sheet(wbx,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',9800,'SAR/sqm'],['Construction Cost',250000000]]),'Input');const fx=sp+'t_xm.xlsx';XLSX.writeFile(wbx,fx);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',fx);await p.waitForTimeout(900);await p.click('#npCreate');await p.waitForTimeout(900);await ev(()=>toggleDock(false));
const rab=await ev(()=>PROJ.id),rabName=await ev(()=>PROJ.name),RN=new RegExp(rabName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
ck('the top menu follows the selected model',await ev(()=>$('#tabModel').textContent.includes(PROJ.name)&&document.querySelector('.tab.on')&&document.querySelector('.tab.on').offsetParent!==null),await ev(()=>$('#tabModel').textContent));
// a change proposed on Al Rabie Court, then back to Al Narjis
const cid=await ev(()=>raiseCR('manual','Sales (test)','Approval needed: 3% discount on 10 villas',[{t:'mods',mods:{price:-1}}],{channel:'Workspace',why:'10 villas unsold'}).id);
await ev(()=>switchProject('narjis'));await ev(()=>showTab('appr'));await p.waitForTimeout(5000);
const fd=await ev(id=>{const cards=[...document.querySelectorAll('#apList .em')];const c=cards.find(x=>x.textContent.includes(id));return{n:cards.length,models:[...new Set(cards.map(x=>(x.querySelector('.top b')||{}).textContent))],c:c?{model:(c.querySelector('.top b')||{}).textContent,eff:/Effect if approved/.test(c.textContent),nc:/not computed/i.test(c.textContent)&&/upload|cash flow|workbook/i.test(c.textContent)}:null}},cid);
ck('Daily feed across models: the cards name their model; the other model’s change is costed on its own workbook, or says it is not computed and what to upload (values-only export: never estimated)',fd.models.length>=2&&fd.c&&RN.test(fd.c.model)&&(fd.c.eff||fd.c.nc),JSON.stringify(fd));
ck('no AI estimate was asked for the other model’s change (its export has no formulas and no cash flow)',!calcs.some(m=>RN.test(m)&&/24\.1/.test(m)&&/Changes to test/.test(m)),calcs.length+' calc calls');
ck('Daily feed is open with no model tab highlighted; left menu marks Daily feed',await ev(()=>document.body.classList.contains('gpage')&&$('#prNav .pr-nav-i.on')&&/Daily feed/.test($('#prNav .pr-nav-i.on').textContent)),'');
// the daily report covers every model
const rep=await ev(()=>({m:BLOCKS.models_today.fn(),f:BLOCKS.feed_today.fn(),blocks:RPTS.daily.blocks.join()}));
ck('the daily report: To know today across models, then a table of every model (EstateMaster’s figures, checks, decisions)',/^feed_today,models_today,kpis_prev,export_checks_all,stress_today/.test(rep.blocks)&&/Al Narjis/.test(rep.m)&&RN.test(rep.m)&&/fig-em/.test(rep.m)&&/<th>Model<\/th>/.test(rep.f)&&RN.test(rep.f),rep.blocks);
// approving the other model's change opens that model (read-only: no Approve anywhere, and approval is refused)
if(await ev(()=>MODE==='readonly')){ck('read-only: no Approve button in the feed and approving is refused',await ev(id=>!document.querySelector(`[data-apr="${id}"]`)&&!!approveCR(id).err&&APQ.find(c=>c.id===id).status==='pending',cid),'');}
else{await ev(id=>{const b=document.querySelector(`[data-apr="${id}"]`);b.click()},cid);await p.waitForTimeout(500);
ck('approving a change of another model opens that model and approves it there',await ev(([id,rab])=>PROJ.id===rab&&APQ.find(c=>c.id===id).status==='approved',[cid,rab]),await ev(id=>[PROJ.id,APQ.find(c=>c.id===id).status].join(),cid));}
// left menu navigation
await p.mouse.move(4,500);await p.waitForTimeout(400);await p.click('#prNav [data-gtab=report]');await p.waitForTimeout(400);
ck('the left menu opens Reports (all models)',await ev(()=>$('#p-report').classList.contains('on')),'');
await p.mouse.move(4,500);await p.waitForTimeout(400);await p.click('#prList [data-proj=narjis]');await p.waitForTimeout(500);
ck('clicking a model opens that model’s first page in the top menu',await ev(()=>PROJ.id==='narjis'&&!document.body.classList.contains('gpage')&&document.querySelector('.tab.on').dataset.t===MTABS[0][0]),await ev(()=>document.querySelector('.tab.on')&&document.querySelector('.tab.on').dataset.t));
ck('no page errors',!errs.length,errs.join(' | ').slice(0,300));
console.log(R.map(r=>r.join(' | ')).join('\n'));console.log(`t_xmodel ${tag}: ${R.filter(r=>r[0]==='PASS').length} pass ${R.filter(r=>r[0]==='FAIL').length?'FAIL '+R.filter(r=>r[0]==='FAIL').map(r=>r[1]).join(' / '):''}`);
await b.close();
