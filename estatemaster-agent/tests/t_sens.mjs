// The AI sensitivity table (pinpoint → cross-checked grid, clarifying questions), the Daily feed's live effects with
// follow-ups, upload → ask right away, the Market data page, the tab order.
import {chromium} from 'playwright';
import fs from 'fs';
import {createRequire} from 'module';const require=createRequire(import.meta.url);
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const XLSX=require(sp+'package/xlsx.js');
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ctx=await b.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);
let llm=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
// the AI: pinpoint (asks about "price" once), the grid calc (two slightly different tables), the cross-check test, the chat
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());llm.push(j);const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const msgs=JSON.stringify(j.payload.messages);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/pin down which single assumption/.test(sys)){const axis=/the X axis/.test(msgs)?'x':'y';
    if(axis==='y'&&/Y axis: \\"price\\"/.test(msgs)&&!/Answers to your questions/.test(msgs))return reply(JSON.stringify({sure:false,question:'Which price do you mean?',options:['Sale price','Land Purchase Price'],note:'two prices are listed'}));
    return reply(JSON.stringify({assumption:axis==='x'?'Construction Cost':'Sale price',kind:'pct',unit:'%',shifts:[-20,-10,0,10,20],sure:true,note:'ok'}))}
  if(/two-way sensitivity table/.test(sys)){const d=j.provider==='openai'?0.03:0;const m=/Return a grid of (\d+) rows × (\d+) columns/.exec(msgs);const rows=+m[1],cols=+m[2];
    const grid=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,k)=>+(18.4-(k-(cols-1)/2)*1.5+(i-(rows-1)/2)*2+d+(j.provider==='openai'&&i===0&&k===cols-1?3:0)+(i===1&&k===cols-1?3:0)).toFixed(2)));
    return reply(JSON.stringify({method:'Each cell from EstateMaster sensitivity tables, interpolated.',grid,cells:'The hurdle breaks when cost rises 10% with prices down 10%.',difference:'we differ on the top-right cell; the other analyst is right'}))}
  if(/senior real estate development finance analyst/.test(sys)){const d=j.provider==='openai'?0.03:0;const tb=+((/levered_irr \(Levered IRR\) = ([\d.]+)%/.exec(msgs)||[])[1]||18.4);return reply(JSON.stringify({method:'Hand calculation from the export figures.',results:[{metric:'levered_irr',base:tb,value:+(tb-1.5-(tb>18?8:0)+d).toFixed(2),working:'IRR falls with the delay'},{metric:'profit_on_cost',base:14.2,value:13.1+d,working:'margin down'},{metric:'net_profit',base:120000000,value:112000000,working:'profit down'}]}))}
  if(/About CR-/.test(msgs))return reply('About that change: my reading is that the delay costs 1.5 points ⟦calc: 18.4% − 16.9%⟧ of IRR.');if(j.payload.tools)return reply('ok');
  return reply('About that change: my reading is that the delay costs 1.5 points ⟦calc: 18.4% − 16.9%⟧ of IRR.')});
const ev=(f,a)=>p.evaluate(f,a);
await p.addInitScript(()=>{setInterval(()=>{const w=document.querySelector('#dispWin');if(w)w.classList.remove('on')},250)});/*autoDismiss*/await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
// tabs
const tabs=await ev(()=>[...document.querySelectorAll('.tab')].map(t=>t.dataset.t));
ck('top menu: the model’s own pages (Financial modelling, Assumptions, Market data, Scenarios & stress); Reports and Daily feed in the left menu',await ev(()=>{const vis=[...document.querySelectorAll('.tab')].filter(t=>t.offsetParent!==null).map(t=>t.dataset.t);return vis.join()===MTABS.map(x=>x[0]).join()&&!vis.includes('report')&&!vis.includes('appr')&&[...document.querySelectorAll('#prNav .pr-nav-i[data-gtab]')].map(x=>x.dataset.gtab).join()==='report,appr'}),tabs.join(','));
// market data page
await p.evaluate(()=>{const w=document.querySelector('#dispWin');if(w)w.classList.remove('on')});await p.click('.tab[data-t=mktdata]');await p.waitForTimeout(400);
const mk=await ev(()=>({cards:[...document.querySelectorAll('#mkdGrid .card h2')].map(h=>h.textContent),rows:document.querySelectorAll('#mkdGrid table tr').length,lib:!!document.querySelector('#dsCat')}));
ck('Market data: transactions, rentals, demographics, regulations, FARs by plot, benchmarks; the data library is gone from Reports',['Transactions','Rentals','Demographics','Regulations','FARs by plot'].every(n=>mk.cards.includes(n))&&mk.rows>30&&!mk.lib,JSON.stringify(mk));
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-mkdl=tx]')]);const f=sp+'dl_'+dl.suggestedFilename();await dl.saveAs(f);const wb=XLSX.readFile(f);const ws=wb.Sheets[wb.SheetNames[0]];const aoa=XLSX.utils.sheet_to_json(ws,{header:1});
ck('Transactions download: Excel with every row and a SAR/sqm column',/market_data_Transactions/.test(dl.suggestedFilename())&&aoa.length===161&&aoa[0].includes('sar_per_sqm'),`${dl.suggestedFilename()} ${aoa.length} rows`);
const [dl2]=await Promise.all([p.waitForEvent('download'),p.click('[data-mkdl=all]')]);const f2=sp+'dl_'+dl2.suggestedFilename();await dl2.saveAs(f2);const wb2=XLSX.readFile(f2);
ck('All sheets download: one sheet per table incl. demographics',wb2.SheetNames.length===6&&wb2.SheetNames.includes('Demographics')&&XLSX.utils.sheet_to_json(wb2.Sheets.Demographics).length===12,wb2.SheetNames.join(','));
// stress page: the explorer is gone, the sensitivity table is there
await p.click('.tab[data-t=scen]');await p.waitForTimeout(400);
ck('stress page: no autonomous explorer, no heat selects; the sensitivity table with a box by each axis',await ev(()=>!document.querySelector('#etoggle')&&!document.querySelector('#hx')&&!/Autonomous explorer/.test($('#p-scen').textContent)&&!!$('#asX')&&!!$('#asY')&&/X axis/.test($('#aiSensCard').textContent)&&/Y axis/.test($('#aiSensCard').textContent)),'');
await p.evaluate(()=>setHurdle(18,'typed'));await p.fill('#asN','5');await p.fill('#asX','construction cost');await p.fill('#asY','price');await p.click('#asGo');await p.waitForTimeout(1500);
const q=await ev(()=>({q:$('#asQ').textContent,opts:[...document.querySelectorAll('[data-asopt]')].map(o=>o.dataset.asopt),grid:!!document.querySelector('#asGrid .hm')}));
ck('unsure which price: the agent asks, with options, before calculating',/Which price do you mean/.test(q.q)&&q.opts.includes('Sale price')&&!q.grid,JSON.stringify(q));
await p.click('[data-asopt="Sale price"]');await p.waitForTimeout(2500);
const g=await ev(()=>{const cells=[...document.querySelectorAll('#asGrid .hm .c')];return{n:cells.length,calc:cells.filter(c=>c.querySelector('.fig-calc')).length,em:cells.filter(c=>c.classList.contains('base')&&c.querySelector('.fig-em')).length,apart:cells.filter(c=>c.classList.contains('apart')).length,odd:AS.res.odd,hx:[...document.querySelectorAll('#asGrid .hm .h')].slice(1,6).map(h=>h.textContent).join(' '),note:$('#asGrid .calcnote').textContent,steps:$('#asSteps').textContent}});
ck('the table: 5×5 cells by Claude and OpenAI (AI, clickable), EstateMaster’s base cell outlined, review round on the cell they disagreed on',g.n===25&&g.calc===24&&g.em===1&&g.apart===2&&g.odd===1&&/\+20%/.test(g.hx)&&/cross-checked/.test(g.note)&&/reviews the other/.test(g.steps)&&/Where it breaks/.test(g.note),JSON.stringify(g));
const pin=llm.filter(j=>/pin down which single assumption/.test(j.payload.system||''));const sysOf=j=>j.payload.system||(j.payload.messages&&j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const calc=llm.filter(j=>/two-way sensitivity table/.test(sysOf(j)));
ck('routing: pinpoint on the smart tier, the grid on the calc tier for both providers (no haiku), the answer fed back to the agent',pin.length>=3&&/Answers to your questions/.test(JSON.stringify(pin[pin.length-1].payload.messages))&&calc.some(j=>j.provider==='anthropic')&&calc.some(j=>j.provider==='openai')&&calc.every(j=>j.task==='calc')&&!llm.some(j=>/haiku/.test(j.payload.model||'')),`${pin.length} pin, ${calc.length} calc; ${[...new Set(calc.map(j=>j.payload.model))].join('/')}`);
await p.click('#asGrid .hm .c .fig-calc');await p.waitForTimeout(300);
ck('clicking a cell opens the working: both models’ figures and the method',await ev(()=>$('#figWin').classList.contains('on')&&/Claude|GPT/.test($('#fwBody').textContent)&&/Method/.test($('#fwBody').textContent)),await ev(()=>$('#fwBody').textContent.slice(0,200)));
await p.click('#fwClose');
// the daily feed: every pending change gets its effect worked out when its card is opened, with a follow-up box
await p.evaluate(()=>{showTab('appr');crEffectsKick(pendingCRs())});await p.waitForTimeout(4000);
const fd=await ev(()=>{const cards=[...document.querySelectorAll('#apList .em')];return{n:cards.length,done:cards.filter(c=>/Effect if approved/.test(c.textContent)).length,calc:cards.filter(c=>c.querySelector('.cr-ai .fig-calc')).length,em:cards.filter(c=>c.querySelector('.cr-ai .fig-em')).length,ask:cards.filter(c=>c.querySelector('[data-crq] input')).length,below:cards.filter(c=>/below hurdle/.test(c.textContent)).length,sub:$('#apSub').textContent}});
ck('Daily feed: the effect of every pending change is worked out by Claude and OpenAI and shown live (EstateMaster now → AI estimate, clickable), with a follow-up box',fd.n>0&&fd.done===fd.n&&fd.calc===fd.n&&fd.em===fd.n&&fd.ask===fd.n&&fd.below===fd.n&&/\d+ (to decide|changes? to review)/.test(fd.sub),JSON.stringify(fd));
// the approval use cases from the emails: a discount on a batch of units, a buyer incentive, rent-free; each with why and the modelled impact
const uc=await ev(()=>{const cards=[...document.querySelectorAll('#apList .em')];const f=t=>cards.find(c=>new RegExp(t).test(c.textContent));const d=f('5% discount on 24 apartments'),inc=f('half the transfer tax'),rf=f('6 months rent-free');return{d:!!d,why:d&&/Why.*24 podium-facing 2-beds unsold/.test(d.textContent),price:d&&/Sale price/.test(d.textContent),imp:d&&/Effect if approved/.test(d.textContent)&&!!d.querySelector('.cr-ai .fig-calc'),read:d&&/How the AI read it/.test(d.textContent),inc:!!inc&&/Why/.test(inc.textContent),rf:!!rf&&/Retail rent/.test(rf.textContent)}});
ck('sales asks approval for a 5% discount on 24 units: flagged in the Daily feed as a blended sale-price change, with why and the modelled impact',uc.d&&uc.why&&uc.price&&uc.imp&&uc.read,JSON.stringify(uc));
ck('buyer incentive and rent-free requests are covered the same way',uc.inc&&uc.rf,JSON.stringify(uc));
const blk=await ev(()=>BLOCKS.email_flags.fn());
ck('the daily report lists each email change with why and the impact on IRR, profit on cost and net profit (AI, clickable)',/<th>Why<\/th>/.test(blk)&&/Impact if approved/.test(blk)&&/24 podium-facing/.test(blk)&&/Profit on cost/.test(blk)&&/Net profit/.test(blk)&&(blk.match(/fig-calc/g)||[]).length>=9,blk.replace(/<[^>]+>/g,' ').slice(0,200));
const crId=await ev(()=>{const f=document.querySelector('[data-crq]');const fi=f.closest('.feed-item');if(fi&&!fi.classList.contains('open'))fi.querySelector('.fi-row').click();return f.dataset.crq});await p.waitForTimeout(300);
await p.fill(`[data-crq="${crId}"] input`,'and with a 6-month delay?');await p.press(`[data-crq="${crId}"] input`,'Enter');await p.waitForTimeout(1500);
const fu=await ev(()=>({open:document.body.classList.contains('chatopen'),user:[...document.querySelectorAll('#msgs .msg.user')].map(m=>m.textContent).pop(),agent:[...document.querySelectorAll('#msgs .msg.agent .body')].map(m=>m.innerHTML).pop()}));
ck('a follow-up goes to the chat with the change and the AI estimate as context; the answer tags its own arithmetic',fu.open&&new RegExp('About '+crId).test(fu.user)&&/AI estimate if approved/.test(fu.user)&&/6-month delay/.test(fu.user)&&/fig-calc/.test(fu.agent||''),JSON.stringify(fu).slice(0,300));
ck('the daily report block lists the AI estimate of the IRR for each email proposal',await ev(()=>/Impact if approved/.test(BLOCKS.email_flags.fn())&&/fig-calc/.test(BLOCKS.email_flags.fn())),'');
ck('the effect survives a reload (kept with the change request)',await ev(()=>{const m=JSON.parse(localStorage.getItem(MEMKEY));return m.APQ.filter(c=>c.status==='pending').every(c=>c.ai&&c.ai.metrics.length&&c.ai.metrics[0].wt)}),'');
// upload a model → the chat opens on it
const wbx=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wbx,XLSX.utils.aoa_to_sheet([['Al Rabie Court Summary'],[],['Total Development Cost',null,'SAR',401000000],['Total Revenue',null,'SAR',486000000],['Net Development Profit',null,'SAR',85000000],['Development Margin (on cost)',null,'%',21.2],['Project IRR',null,'%',19.5],['Equity IRR',null,'%',24.1]]),'Summary');
XLSX.utils.book_append_sheet(wbx,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['PRELIMINARY'],['Cash Flow Title','Al Rabie Court'],['Site Area',12000,'SqM'],['CONSTRUCTION COSTS'],['Construction Cost',250000000],['Contingency','5.00%']]),'Input');
const fx=sp+'t_sens_export.xlsx';XLSX.writeFile(wbx,fx);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',fx);await p.waitForTimeout(900);await p.click('#npCreate');await p.waitForTimeout(900);
const up=await ev(()=>({open:document.body.classList.contains('chatopen'),last:[...document.querySelectorAll('#msgs .msg.agent .body')].map(m=>m.innerHTML).pop()||'',tab:document.querySelector('.tab.on').dataset.t,proj:PROJ.fromExport}));
ck('upload a model: the chat opens on it right away with EstateMaster’s figures tagged and questions to start from',up.open&&up.proj&&/Al Rabie Court/.test(up.last)&&/fig-em/.test(up.last)&&(up.last.match(/qchip/g)||[]).length>=4&&/4 assumptions/.test(up.last),up.last.replace(/<[^>]+>/g,' ').slice(0,200));
await p.click('#msgs .qchip');await p.waitForTimeout(1200);
ck('a suggested question is asked',await ev(()=>[...document.querySelectorAll('#msgs .msg.user')].some(m=>/main assumptions behind/.test(m.textContent))),'');
ck('the agent has export_assumptions to answer on the export’s inputs',await ev(()=>TOOLS.some(t=>t.name==='export_assumptions')&&!TOOLS.some(t=>t.name==='start_explorer')&&/export_assumptions/.test(sysPrompt('web','Investment Director'))),'');
// any Excel model (not an EstateMaster export): read sheet by sheet, the chat opens on it, a question is answered from its cells
const wbm=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wbm,XLSX.utils.aoa_to_sheet([['Inputs'],['Land cost',45000000],['Build cost per sqm',4200],['GFA',31000],['Sale price per sqm',11500],['Exit cap rate',0.0775]]),'Inputs');
XLSX.utils.book_append_sheet(wbm,XLSX.utils.aoa_to_sheet([['Year',2026,2027,2028],['Spend',-60000000,-90000000,-20000000],['Sales',0,120000000,240000000]]),'Cash flow');const fxm=sp+'t_sens_model.xlsx';XLSX.writeFile(wbm,fxm);
await ev(()=>{toggleDock(false);openNewProject()});await p.setInputFiles('#npFile',fxm);await p.waitForTimeout(900);
const npi=await ev(()=>({info:$('#npInfo').textContent,btn:$('#npCreate').textContent,dis:$('#npCreate').disabled}));
ck('a workbook that is not an export: read sheet by sheet and offered as an Excel model to ask about',/Not an? (EstateMaster|model) export/.test(npi.info)&&/Inputs \(6 rows\)/.test(npi.info)&&/Cash flow/.test(npi.info)&&npi.btn==='Load and ask'&&!npi.dis,JSON.stringify(npi).slice(0,240));
const nProj=await ev(()=>Object.keys(PROJECTS).length);await p.click('#npCreate');await p.waitForTimeout(800);
const lm=await ev(()=>({open:document.body.classList.contains('chatopen'),last:[...document.querySelectorAll('#msgs .msg.agent .body')].map(m=>m.innerHTML).pop()||'',files:FILES.map(f=>f.name),n:Object.keys(PROJECTS).length}));
ck('the chat opens on the model right away: sheets listed, questions to start from, no project created',lm.open&&/t_sens_model\.xlsx/.test(lm.last)&&/Cash flow/.test(lm.last)&&(lm.last.match(/qchip/g)||[]).length>=4&&lm.files.includes('t_sens_model.xlsx')&&lm.n===nProj,lm.last.replace(/<[^>]+>/g,' ').slice(0,200));
llm=[];await p.fill('#ask','What is the land cost in this model?');await p.press('#ask','Enter');await p.waitForTimeout(1500);
ck('a question on it goes to the AI with the workbook in context (read_excel tool)',llm.some(j=>/t_sens_model\.xlsx/.test(JSON.stringify(j.payload))&&/read_excel/.test(JSON.stringify(j.payload.tools||''))),llm.length+' calls');
ck('no page errors',!errs.length,errs.join(' | ').slice(0,300));
console.log(R.map(r=>r.join(' | ')).join('\n'));console.log(`t_sens ${tag}: ${R.filter(r=>r[0]==='PASS').length} pass ${R.filter(r=>r[0]==='FAIL').length?'FAIL '+R.filter(r=>r[0]==='FAIL').map(r=>r[1]).join(' / '):''}`);
await b.close();
