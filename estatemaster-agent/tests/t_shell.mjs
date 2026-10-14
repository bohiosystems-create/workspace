// Shell: tabs, settings gear, chat dock on every tab, charts in the chat (rules + AI tool), AI-calc labelling, hover tips.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ctx=await b.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));let llmOn=false;const llmReq=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'browser'})}));
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:llmOn,openai:false},passwordRequired:false})});
  const j=JSON.parse(r.request().postData());llmReq.push(j);const msgs=j.payload.messages,last=msgs[msgs.length-1];
  const toolRes=Array.isArray(last.content)&&last.content.some(c=>c.type==='tool_result');
  if(!toolRes){const q=String(typeof last.content==='string'?last.content:'').toLowerCase();
    if(/overran/.test(q))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t1',name:'query_data',input:{dataset:'past_projects'}}]})});
    if(/compare|chart|plot/.test(q))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t2',name:'make_chart',input:{type:'columns',title:'Cost overrun by project',unit:'%',labels:['Al Rabie Court','Hittin Residences','Al Yasmin Square'],values:[16.2,9.1,12.4],source:'worked out by the AI from query_data past_projects (final cost ÷ budget − 1)'}}]})});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'end_turn',content:[{type:'text',text:'Done.'}]})})}
  const text=/past_projects|Cost overrun/.test(JSON.stringify(last))?'Al Rabie Court overran the most: final cost SAR 412M against a budget of SAR 355M, that is 16.1% ⟦calc⟧ over, or SAR 57M ⟦calc⟧.':'Here is the chart.';
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'end_turn',content:[{type:'text',text}]})})});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
const tabs=await ev(()=>[...document.querySelectorAll('.tab')].map(t=>t.dataset.t));
ck('tabs: no WhatsApp, napkin, Outlook, architecture; one Scenarios & stress tab',!tabs.some(t=>['wa','napkin','inbox','arch','explore','stress'].includes(t))&&tabs.includes('scen')&&!tabs.includes('agent'),tabs.join(','));
ck('chat drawer: opened by the orange Ask button, charcoal head with Close and full screen, stays open across tabs',await ev(()=>{toggleDock(false);const closed=getComputedStyle($('#kdock')).display==='none'&&getComputedStyle($('#dockFab')).display!=='none'&&/Ask/.test($('#dockFab').textContent);$('#dockFab').click();const r=$('#kdock').getBoundingClientRect();const open=getComputedStyle($('#kdock')).display==='flex'&&r.right>innerWidth-40&&/AI agent · financial modelling/i.test($('.chat-head').textContent)&&!!$('#chatClose')&&!!$('#chatFull');showTab('report');const still=getComputedStyle($('#kdock')).display==='flex';showTab('agent');$('#chatFull').click();const full=$('#kdock').classList.contains('full');$('#chatFull').click();return closed&&open&&still&&full}),'');
await p.screenshot({path:`${sp}shell_${tag}_overview.png`});
await p.click('.tab[data-t=scen]');await p.waitForTimeout(800);
ck('Scenarios & stress: the AI sensitivity table (a box by each axis), generator and stress table on one page; no explorer',await ev(()=>!!$('#asX')&&!!$('#asY')&&!$('#etoggle')&&!!$('#sgT')&&!!$('#stressT').innerHTML&&$('#p-scen').classList.contains('on')),'');
await p.screenshot({path:`${sp}shell_${tag}_scen.png`});
// settings gear
await p.click('#engBtn');await p.waitForTimeout(400);
ck('gear opens Settings on AI & routing with the key fields and the routing table',await ev(()=>$('#setModal').classList.contains('on')&&$('#set_ai').classList.contains('on')&&!!$('#set_ai #aiKeyA')&&$('#rtRules').innerHTML.includes('AI')),'');
await p.click('#setModal [data-set=outlook]');await p.waitForTimeout(400);
ck('Outlook lives in Settings: folder list, reader, scan button, alert recipients',await ev(()=>$('#set_outlook').classList.contains('on')&&!!$('#set_outlook #ibList')&&!!$('#set_outlook #ibScan')&&!!$('#set_outlook #alTo')),'');
await p.click('#set_outlook #ibScan');await p.waitForTimeout(1500);ck('scan still works from Settings',await ev(()=>/proposal|change|No new|scanned|email/i.test($('#ibSub').textContent+$('#ibList').textContent)),await ev(()=>$('#ibSub').textContent.slice(0,120)));
await p.screenshot({path:`${sp}shell_${tag}_settings_outlook.png`});
await p.click('#setModal [data-set=arch]');await p.waitForTimeout(300);ck('Architecture in Settings',await ev(()=>$('#set_arch').classList.contains('on')&&$('#set_arch').querySelectorAll('.card').length>=4),'');
await p.click('#setModal [data-set=voice]');await p.waitForTimeout(500);ck('Voice section',await ev(()=>/voice/i.test($('#voiceStat').textContent)),'');
await p.click('#setClose');await p.waitForTimeout(200);ck('settings close',await ev(()=>!$('#setModal').classList.contains('on')),'');
ck('old links still land: showTab(inbox) opens Settings → Outlook; showTab(stress) → Scenarios',await ev(()=>{showTab('inbox');const a=$('#setModal').classList.contains('on')&&$('#set_outlook').classList.contains('on');closeSettings();showTab('stress');const b=$('#p-scen').classList.contains('on');showTab('agent');return a&&b}),'');
// charts in the chat (rules engine)
async function ask(q,w=1800){await p.fill('#ask',q);await p.click('#send');await p.waitForTimeout(w);return await ev(()=>$('#msgs .msg.agent:last-child .body').innerHTML)}
let h=await ask('chart the cash flow by year');
ck('rules: "chart the cash flow by year" draws a 3D column chart in the chat with an export arrow',/kchart/.test(h)&&/<svg/.test(h)&&/data-xport/.test(h)&&/kd-spring|kd-gx/.test(h)&&/model data|estimate/i.test(h),h.replace(/<[^>]+>/g,' ').slice(0,160));
h=await ask('chart the cost breakdown as bars');ck('type override: cost breakdown as bars',/kd-hrow/.test(h)&&!/kd-dseg/.test(h),'');
h=await ask('plot the stress tests');ck('stress tests chart (bars against the hurdle)',/kd-hrow/.test(h)&&/hurdle/.test(h),'');
h=await ask('show the profit bridge');ck('profit bridge → waterfall',/Profit bridge|From gross revenue/.test(h)&&/kd-spring/.test(h),'');
h=await ask('graph saibor');ck('data library series (SAIBOR) as a line',/SAIBOR/.test(h)&&/kd-draw|kd-tracer/.test(h),'');
// hover tip on a chat chart and on a report chart
const tipOK=await ev(async()=>{const t=document.querySelector('#msgs .kchart [data-tip]');if(!t)return 'no target';const r=t.getBoundingClientRect();t.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));await new Promise(r=>setTimeout(r,50));const tip=document.querySelector('.ktip-live');return tip?tip.textContent:'no tip'});
ck('hover on a chat chart shows name and value',/\d/.test(tipOK)&&!/no /.test(tipOK),tipOK);
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(700);
const tipR=await ev(async()=>{const t=document.querySelector('#report .k-chart [data-tip]');if(!t)return 'no target';const r=t.getBoundingClientRect();window.scrollTo(0,Math.max(0,r.top-300));await new Promise(r=>setTimeout(r,100));const r2=t.getBoundingClientRect();t.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r2.left+r2.width/2,clientY:r2.top+r2.height/2}));await new Promise(r=>setTimeout(r,50));const tip=document.querySelector('.ktip-live');return tip?tip.textContent:'no tip'});
ck('hover on a report chart shows name and value',/\d/.test(tipR)&&!/no /.test(tipR),tipR);
ck('gauges carry hover data too',await ev(()=>!!buildDeck('ic').slides.find(s=>s.kind==='gauges')&&/data-tip/.test(kGauges(buildDeck('ic').slides.find(s=>s.kind==='gauges')))),'');
await p.screenshot({path:`${sp}shell_${tag}_chart.png`});
// export
await p.evaluate(()=>showTab('report'));const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}),ev(()=>document.querySelector('#msgs .kchart [data-xport]').click())]);
ck('export arrow downloads the chart',/\.(png|html)$/.test(dl.suggestedFilename()),dl.suggestedFilename());
// AI: reasoning labelled, chart tool
llmOn=true;await p.reload();await p.waitForTimeout(1200);await p.evaluate(()=>toggleDock(true));ck('AI on',await ev(()=>apiOn()),'');
const rt=await ev(()=>route('which past project overran its budget the most, and by how much?'));ck('data question with reasoning routes to the AI, deep tier',rt.lane==='api'&&rt.tier==='deep',JSON.stringify([rt.lane,rt.tier]));
h=await ask('which past project overran its budget the most, and by how much?',3000);
ck('AI answer: figures it worked out carry the AI badge and the note',(h.match(/fig-calc/g)||[]).length>=2&&/calcnote/.test(h)&&/not an EstateMaster figure|Not from EstateMaster/i.test(h),h.replace(/<[^>]+>/g,' ').slice(0,200));
ck('system prompt carries the ⟦calc⟧ rule and chart tools',llmReq.some(r=>/⟦calc: working⟧/.test(r.payload.system)&&r.payload.tools.some(t=>t.name==='make_chart')&&r.payload.tools.some(t=>t.name==='get_series')),'');
h=await ask('compare the cost overrun of the three worst projects in a chart',3000);
const ttl=await ev(()=>($('#msgs .msg.agent:last-child .kchart .kd-h2')||{}).textContent||'');ck('AI make_chart: chart card drawn, flagged as AI-worked-out figures, exportable',/kchart/.test(h)&&/worked out by the AI/i.test(h)&&/Cost overrun by project/.test(ttl)&&/data-xport/.test(h)&&/kd-spring/.test(h),ttl+' | '+h.replace(/<[^>]+>/g,' ').slice(0,120));
await p.screenshot({path:`${sp}shell_${tag}_aichart.png`});
ck('Close hides the drawer and shows the Ask button with the pending count',await ev(()=>{$('#chatClose').click();const hid=getComputedStyle($('#kdock')).display==='none'&&/\d/.test($('#fabN').textContent);toggleDock(true);return hid}),'');
ck('reply shows the engine line under the answer and a Thinking timer while working',await ev(()=>!!document.querySelector('#msgs .msg.agent .kmeta .rt')),'');
const stt=await ev(()=>selfTest().filter(r=>!r.info).map(r=>[r.ok,r.name]));ck('selfTest',stt.every(r=>r[0]),JSON.stringify(stt.filter(r=>!r[0])));
ck('no page errors',!errs.length,errs.join(' | '));
for(const r of R)console.log(r.join('  '));await b.close();
