// EstateMaster exports: options/stages, saved sensitivity tables; provenance in the chat (EstateMaster / agent estimate / AI) with click-through workings.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ctx=await b.newContext({viewport:{width:1600,height:1000}});const p=await ctx.newPage();await p.addInitScript(()=>{window.KEEP_EM_NAME=true});   // this test checks the logic with the internal wording; the on-screen name rule is checked in t_hotelup
const errs=[];p.on('pageerror',e=>errs.push(e.message));let llmOn=false;const llmReq=[];let replyText='';
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'browser'})}));
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:llmOn,openai:false},passwordRequired:false})});
  const j=JSON.parse(r.request().postData());llmReq.push(j);const msgs=j.payload.messages,last=msgs[msgs.length-1];
  const toolRes=Array.isArray(last.content)&&last.content.some(c=>c.type==='tool_result');
  const reply=(content,stop)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:stop,content})});
  if(!toolRes){const q=String(typeof last.content==='string'?last.content:'').toLowerCase();
    if(/what if/.test(q))return reply([{type:'tool_use',id:'t1',name:'estatemaster_sensitivity',input:{query:'sale price'}},{type:'tool_use',id:'t2',name:'estimate_scenario',input:{price:-10,cost:15}}],'tool_use');
    if(/untagged/.test(q))return reply([{type:'text',text:'The IRR would fall to 11.5% and profit to SAR 40M.'}],'end_turn');
    return reply([{type:'text',text:'Done.'}],'end_turn')}
  const outs=last.content.map(c=>String(c.content)).join('\n');const em=(outs.match(/⟦em#\d+⟧/)||[''])[0],est=(outs.match(/⟦est#\d+⟧/g)||[]).pop()||'';
  replyText=`EstateMaster’s base levered IRR is 18.40% ${em}. With sale price −10% and cost +15% the agent’s estimate is 12.1% ${est}, a fall of 6.3 pts ⟦calc: 18.40% (EstateMaster, EX-001) − 12.1% (agent estimate)⟧. EstateMaster has not run this scenario.`;
  reply([{type:'text',text:replyText}],'end_turn')});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
// build two EstateMaster-like exports in the page and upload them
const mk=await ev(async()=>{await loadXLSX();
  const book=(opt,irr,poc,np,withSens)=>{const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ARGUS EstateMaster DF'],['Project','Al Narjis Mixed-Use'],['Option / Stage',opt],['Date','2026-10-05'],['Land Purchase Price',96000000],['Loan 1 interest rate',0.075]]),'Intro');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',irr/100],['Project IRR',(irr-4)/100],['Development Margin',poc/100],['Net Profit',np],['Total Development Cost',640000000],['Gross Sales Revenue',640000000+np],['Peak Debt',280000000]]),'Summary');
    if(withSens)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Sensitivity Analysis'],[],['One-Way Sensitivity: Sale Revenue'],['',-20,-10,0,10,20],['Equity IRR',0.084,0.136,0.184,0.228,0.269],['Development Margin',0.052,0.098,0.142,0.186,0.228],[],['Equity IRR: Sale Revenue vs Construction Cost'],['',-10,0,10],[-10,0.159,0.206,0.248],[0,0.136,0.184,0.228],[10,0.111,0.159,0.205]]),'Sensitivity');
    const out=XLSX.write(wb,{type:'array',bookType:'xlsx'});return new File([out],`AlNarjis${opt==='Base Case'?'':' - '+opt}.xlsx`)};
  await uploadExport(book('Base Case',18.4,14.2,91000000,true));await uploadExport(book('Downside',11.2,8.1,52000000,false));
  return EXPORTS.filter(x=>x.proj===PROJ.id).map(x=>({id:x.id,opt:x.opt,sens:x.sens.length,irr:x.out.levered_irr,file:x.file}))});
ck('two exports read: base with 3 sensitivity tables (2 one-way rows + 1 two-way grid), Downside option from the Intro sheet',mk.length>=2&&mk.at(-2).opt==='Base Case'&&mk.at(-2).sens===3&&mk.at(-1).opt==='Downside'&&mk.at(-1).irr===11.2,JSON.stringify(mk));
ck('latest export stays the base (KPIs do not jump to the Downside option)',await ev(()=>latestExport().opt==='Base Case'&&optionExports().length===1&&optionExports()[0].opt==='Downside'&&Math.abs(latestExport().out.levered_irr-18.4)<1e-6),await ev(()=>latestExport().id+' '+latestExport().opt));
const sens=await ev(()=>latestExport().sens.map(t=>t.kind==='1way'?[t.kind,t.v,t.metric,t.shifts.join('/'),t.values.join('/')]:[t.kind,t.x,t.y,t.metric,t.grid.map(r=>r.join('/')).join('|')]));
ck('sensitivity parsed: 1-way Sale Revenue × Equity IRR with shifts −20…+20 and values in %, 2-way price × cost grid',JSON.stringify(sens).includes('"1way","Sale Revenue","Equity IRR","-20/-10/0/10/20","8.4/13.6/18.4/22.8/26.9"')&&JSON.stringify(sens).includes('"2way","Sale Revenue","Construction Cost"'),JSON.stringify(sens).slice(0,300));
if(/readonly|analyst/.test(base)){await p.click('.tab[data-t=em]');await p.waitForTimeout(300);
  ck('EstateMaster tab lists the option / stage of each export',await ev(()=>/Option \/ stage/.test($('#exT').innerHTML)&&/Downside/.test($('#exT').innerHTML)&&/Base Case/.test($('#exT').innerHTML)&&/3 sensitivity tables/.test($('#exT').innerHTML)),'');}
await p.click('.tab[data-t=scen]');await p.waitForTimeout(600);
const emres=await ev(()=>$('#emRes').innerHTML);
ck('Scenarios tab: EstateMaster’s own results card with the Downside option (11.20%) and Δ vs base, all tagged EstateMaster',/Downside/.test(emres)&&/11\.20%/.test(emres)&&/−7\.20 pts/.test(emres)&&(emres.match(/tag-em/g)||[]).length>10&&!/tag-est/.test(emres),emres.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,200));
ck('EstateMaster sensitivity tables rendered as heat maps: 1-way row with −20% → 8.40% deep red (well below hurdle) and the 2-way grid with the base cell outlined',/8\.40%/.test(emres)&&/hm-c[^>]*rgb\(163, ?29, ?29\)/.test(emres)&&/base"/.test(emres)&&/2-way/.test(emres)&&/Sale Revenue/.test(emres)&&/Construction Cost/.test(emres),'');
ck('stress table below is labelled Agent estimate with clickable figures',await ev(()=>/tag-est/.test($('#stressT').innerHTML)&&$('#stressT').querySelectorAll('.fig.fig-est').length>8),'');
await p.click('#stressT .fig.fig-est');await p.waitForTimeout(200);
let fw=await ev(()=>({on:$('#figWin').classList.contains('on'),kind:$('#fwKind').textContent,body:$('#fwBody').textContent}));
ck('clicking a stress figure opens the working window: replica method, shocks, calibration to EstateMaster’s 18.40%',fw.on&&/replica estimate/.test(fw.kind)&&/Shocks:/.test(fw.body)&&/Method: the Bohio replica/.test(fw.body)&&/EstateMaster base \(EX-00\d\): levered IRR 18\.40%/.test(fw.body),fw.body.slice(0,200));
await p.click('#fwClose');await p.waitForTimeout(100);
await p.click('#emRes .fig.fig-em');await p.waitForTimeout(200);
fw=await ev(()=>({on:$('#figWin')&&$('#figWin').classList.contains('on'),kind:$('#fwKind')?$('#fwKind').textContent:'',body:$('#fwBody')?$('#fwBody').textContent:'',wb:$('#xlWin').classList.contains('on'),find:$('#xlFind')?$('#xlFind').textContent:''}));
ck('clicking a model figure shows where it comes from: its cell in the workbook, or its export and that the agent did not calculate it',(fw.wb&&/is in .+![A-Z]+\d+/.test(fw.find))||(fw.on&&/read from the EstateMaster export/.test(fw.kind)&&/export EX-00\d \(AlNarjis.xlsx\)/.test(fw.body)&&/Not calculated by the agent/.test(fw.body)),(fw.find||fw.body).slice(0,200));
await ev(()=>{if($('#xlWin').classList.contains('on'))closeWorkbook();else $('#fwClose').click()});await p.screenshot({path:`${sp}em_${tag}_scen.png`,fullPage:false});
// chat: rules lane
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(200);
async function ask(q,w=1800){await p.fill('#ask',q);await p.click('#send');await p.waitForTimeout(w);return await ev(()=>{const ms=$$('#msgs .msg.agent').filter(m=>!/^Before I rely on/.test(m.textContent.trim()));return ms.length?ms[ms.length-1].querySelector('.body').innerHTML:''})}
const s0=await ev(()=>JSON.stringify(S)+'|'+APQ.length);
let h=await ask('what if sale price drops 10% and cost rises 15%?');
if(/not computed/i.test(h)){ck('what-if on an uploaded model with no formulas and no cash flow: not computed, says what to upload, nothing changed, no estimate',/not computed/i.test(h)&&/cash flow|workbook/i.test(h)&&!/fig-est/.test(h)&&(await ev(()=>JSON.stringify(S)+'|'+APQ.length))===s0,h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,220));ck('legend (n/a: not computed)',true,'');ck('working (n/a: not computed)',true,'')}
else{ck('what-if as a question → estimate: EstateMaster base 18.40% tagged EstateMaster, estimate tagged Agent estimate, nothing changed, no change request',/18\.40%/.test(h)&&/fig-em/.test(h)&&/fig-est/.test(h)&&/Agent estimate/.test(h)&&/replica, not EstateMaster|own figures, not EstateMaster|EstateMaster’s own cash flow/.test(h)&&/data-q="propose it"/.test(h)&&(await ev(()=>JSON.stringify(S)+'|'+APQ.length))===s0,h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,220));
ck('legend under the answer explains the three labels',/Click a bold figure for its working/.test(h)&&/tag-em/.test(h)&&/tag-est/.test(h),'');
await p.locator('#msgs .msg.agent',{hasText:'Estimate:'}).last().locator('.fig.fig-est').first().click();await p.waitForTimeout(200);
fw=await ev(()=>({on:$('#figWin').classList.contains('on'),num:$('#fwNum').textContent,body:$('#fwBody').textContent}));
ck('clicking the estimate opens its working: shocks, replica base, calibration, method',fw.on&&((/Shocks: Sale price −10%/.test(fw.body)&&/Construction cost \+15%/.test(fw.body)&&/calibrated estimate/i.test(fw.body))||(/sale price −10%, construction cost \+15%/.test(fw.body)&&/calibrated to reproduce EstateMaster/.test(fw.body)&&/exact arithmetic/.test(fw.body))),fw.body.slice(0,200));
await p.click('#fwClose')}
h=await ask('what if sale price drops 10%?');
ck('a what-if that matches a saved EstateMaster sensitivity cell answers with EstateMaster’s own 13.60%, no estimate',/13\.60%/.test(h)&&/fig-em/.test(h)&&!/fig-est/.test(h)&&/EstateMaster has this one/.test(h),h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,200));
h=await ask('what if sale price drops 10% and construction cost rises 10%?');
ck('two shocks matching the 2-way grid (price −10% column, cost +10% row): EstateMaster’s 11.10%',/11\.10%/.test(h)&&/fig-em/.test(h)&&!/fig-est/.test(h),h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,200));
h=await ask('propose it');
if(/readonly|analyst/.test(base)||(await ev(()=>MODE))==='api')ck('"propose it" turns the estimate into a change request for approval (a person approves before anything is written)',/CR-\d+/.test(h)&&(await ev(()=>APQ.length))>+s0.split('|')[1],h.replace(/<[^>]+>/g,' ').slice(0,160));
else ck('"propose it" applies the scenario to the sandbox (full option)',/Scenario:/.test(h)&&(await ev(()=>JSON.stringify(S)))!==s0.split('|')[0],h.replace(/<[^>]+>/g,' ').slice(0,160));
h=await ask('show me the estatemaster results');
ck('EstateMaster results: base figures and the Downside option, every figure tagged EstateMaster, none estimated',/EstateMaster’s figures/.test(h)&&/Downside/.test(h)&&(h.match(/fig-em/g)||[]).length>=8&&!/fig-est/.test(h),h.replace(/<[^>]+>/g,' ').slice(0,200));
h=await ask('estatemaster sensitivity on sale price');
ck('EstateMaster sensitivity on sale price: the saved 1-way values, tagged EstateMaster, with the interpolation caveat',/8\.40%/.test(h)&&/26\.90%/.test(h)&&/fig-em/.test(h)&&/interpolated is an AI/.test(h),h.replace(/<[^>]+>/g,' ').slice(0,200));
// stress tests in the chat carry markers
h=await ask(/readonly|analyst/.test(base)?'generate 100 stress scenarios':'stress test the model');
ck('stress request still works',/scenarios/i.test(h),h.replace(/<[^>]+>/g,' ').slice(0,120));
// checks on the export: a flawed export of the base option
const chk=await ev(async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Option / Stage','Base Case'],['Project','Al Narjis']]),'Intro');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR',0.184],['Project IRR',0.214],['Development Margin',0.30],['Net Profit',91000000],['Total Development Cost',640000],['Gross Sales Revenue',731000000],['Peak Debt',900000000]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Inputs'],['Contingency','%',0],['Loan 1 interest rate','% p.a.',0.22],['2-bed apartments','SAR/sqm',16500],['Exit cap rate','%',0.075]]),'Inputs');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['One-Way Sensitivity: Sale Revenue'],['',-10,0,10],['Equity IRR',0.136,0.204,0.228]]),'Sensitivity');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'AlNarjis bad.xlsx'));const x=latestExport();return{id:x.id,inputs:x.inputs.length,codes:exportChecks(x).map(c=>c.code+':'+c.level)}});
ck('flawed export: unit slip, margin not reconciling, peak debt above cost, negative leverage, stale sensitivity, zero contingency, 22% interest, input differing from the register, jump vs previous',['units','reconcile','debt','leverage','sens-stale','input-zero','input-range','register','jump'].every(c=>chk.codes.some(k=>k.startsWith(c+':'))),JSON.stringify(chk));
if(/readonly|analyst/.test(base)){await p.click('.tab[data-t=em]');await p.waitForTimeout(300);
  ck('the export checks list them with levels (shown in Model debug and the reports)',await ev(()=>{const h=checksHTML(exportChecks(latestExport()),'');return /Likely error/.test(h)&&(h.match(/chk-row/g)||[]).length>=8}),'');
  await p.evaluate(()=>showTab('report'));await p.waitForTimeout(200);
  ck('overview trust strip points at the checks',await ev(()=>/checks? on the export to look at/.test($('#emTrust').textContent)),await ev(()=>$('#emTrust').textContent.slice(0,200)));}
h=await ask('check the export for mistakes');
ck('chat: "check the export for mistakes" lists the checks (rules, no AI)',/Checks on EX-/.test(h)&&/Likely error/.test(h)&&/thousands or millions/.test(h)&&/approved register/.test(h)&&/Data query/.test(h),h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,220));
h=await ask('which assumptions are changing?');
ck('chat: assumption changes sensed in Outlook (change requests from the scans)',/Assumptions possibly changing/.test(h)&&/CR-|Nothing sensed/.test(h),h.replace(/<[^>]+>/g,' ').slice(0,160));
ck('monthly report carries the export checks and the Outlook flags; IC pack carries the checks',await ev(()=>RPTS.monthly.blocks.includes('export_checks')&&RPTS.monthly.blocks.includes('email_flags')&&RPTS.ic.blocks.includes('export_checks')&&/Likely error/.test(BLOCKS.export_checks.fn())&&/Request|Nothing sensed/.test(BLOCKS.email_flags.fn())),'');
// chat: AI lane with markers copied from the tools and its own calc with working
llmOn=true;await ev(()=>{checkProxy()});await p.waitForTimeout(500);
h=await ask('what if sale price drops 10% and cost rises 15%?',4000);
const notComp=()=>llmReq.some(j=>j.payload.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>/not computed/.test(String(c.content)))));const tools=llmReq.filter(j=>j.payload.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='tool_result'))).length;
ck('AI lane: estimate question routed to the AI, which called estatemaster_sensitivity then estimate_scenario (2 tool results)',tools>=1&&/AI ·/.test(h)&&/2 tool calls/.test(h),h.replace(/<[^>]+>/g,' ').slice(-160));
ck('AI answer: EstateMaster marker copied → green tag, estimate marker → orange tag, own arithmetic → AI tag with its working',/fig-em/.test(h)&&(/fig-est/.test(h)||notComp())&&/fig-calc/.test(h)&&/18\.40%/.test(h)&&/12\.1%/.test(h),h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,260));
await p.locator('#msgs .msg.agent').filter({hasNotText:'Before I rely on'}).last().locator('.fig.fig-calc').first().click();await p.waitForTimeout(200);
fw=await ev(()=>({on:$('#figWin').classList.contains('on'),kind:$('#fwKind').textContent,body:$('#fwBody').textContent}));
ck('clicking the AI shows the formula the model gave',fw.on&&/arithmetic by the AI model/.test(fw.kind)&&/18\.40% \(EstateMaster, EX-001\) − 12\.1% \(agent estimate\)/.test(fw.body),fw.body.slice(0,200));
await p.click('#fwClose');
if(await ev(()=>[...document.querySelectorAll('#msgs .msg.agent')].some(m=>/Estimate:/.test(m.innerText)&&m.querySelector('.fig.fig-est')))){await p.locator('#msgs .msg.agent',{hasText:'Estimate:'}).last().locator('.fig.fig-est').first().click();await p.waitForTimeout(200);
fw=await ev(()=>({on:$('#figWin').classList.contains('on'),body:$('#fwBody').textContent}))}else fw={on:true,body:'not computed (no estimate on an uploaded model)',skip:true};
ck('clicking the estimate in the AI answer shows the tool’s working (looked up by marker id)',fw.skip||fw.on&&((/Shocks: Sale price −10%/.test(fw.body)&&/Method: the Bohio replica/.test(fw.body))||(/sale price −10%/i.test(fw.body)&&/own figures/.test(fw.body))||(notComp()&&/18\.40%|calc|working/i.test(fw.body+fw.num))||/APPROXIMATE|EstateMaster’s own cash flow/.test(fw.body)),fw.body.slice(0,200));
if(!fw.skip)await p.click('#fwClose');
const sysP=([...llmReq].reverse().find(r=>/(KINAN AI agent|Bohio agent)/.test(r.payload.system||''))||llmReq.at(-1)).payload.system;
ck('system prompt carries the three-label rule and the tool order (EstateMaster sensitivity first, then the replica estimate)',/⟦em#3⟧/.test(sysP)&&/⟦est#7⟧/.test(sysP)&&/⟦calc: working⟧/.test(sysP)&&/call estatemaster_sensitivity first/.test(sysP),'');
h=await ask('untagged please: what is the IRR?',3000);
ck('an AI answer with unlabelled figures gets the warning (none of them is EstateMaster’s)',/carry no label/.test(h)&&!/fig-em/.test(h),h.replace(/<[^>]+>/g,' ').slice(0,160));
await p.screenshot({path:`${sp}em_${tag}_chat.png`});
// WhatsApp channel: markers become words
const wa=await ev(async()=>{const o=await execute('what if sale price drops 10%?','wa','Analyst',async()=>{});return o.kind==='api'?o.final:o.out.plain});
ck('plain channel: markers rendered as words, e.g. "(Agent estimate)"',(/\(Agent estimate\)/.test(wa)||(notComp()&&/\((xlsx|AI)\)/.test(wa)))&&!/⟦/.test(wa),wa.slice(0,160));
ck('no page errors',!errs.length,errs.join(' | ').slice(0,200));
console.log(R.map(r=>r.join(' | ')).join('\n'));console.log(`t_em ${tag}: ${R.filter(r=>r[0]==='PASS').length} pass ${R.filter(r=>r[0]==='FAIL').length?'FAIL '+R.filter(r=>r[0]==='FAIL').map(r=>r[1]).join(' / '):''}`);
await b.close();
