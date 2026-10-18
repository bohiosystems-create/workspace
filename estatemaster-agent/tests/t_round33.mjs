// Round 33: the analyst's toolkit on an uploaded workbook. Every figure is checked against LibreOffice (the same workbook with the change
// made by hand and recalculated) or against a hand calculation in Python of the same structure (fixtures/gen/gen33.py, synthetic).
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),ctx=await b.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),p=await ctx.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));const TOOLS=[];
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const user=JSON.stringify(pl.messages);const u0=String((pl.messages.find(m=>m.role==='user')||{}).content||'');
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');
  if(/sort the inputs that changed/.test(sys)){const g={};for(const m of u0.matchAll(/^(c\d+): (.+?) \(/gm))g[m[1]]=/rent/i.test(m[2])?'revenue':/interest/i.test(m[2])?'financing':/construction|cost/i.test(m[2])?'cost':'other';return reply(JSON.stringify({groups:g}))}
  if(/amounts of money/.test(sys)){const ids=[...u0.matchAll(/^(g\d+): (.+)$/gm)].filter(m=>!/percent|%|year|occupancy|hold|period|dscr|ltv|covenant|share|rate|growth/i.test(m[2])).map(m=>m[1]);return reply(JSON.stringify({money:ids}))}
  if(/compare real estate model assumptions with the market/.test(sys))return reply(JSON.stringify({rows:[{assumption:'Exit cap rate',ours:'7.00%',market_low:'7.25%',market_high:'8.00%',unit:'',verdict:'aggressive',source:'Test market report',url:'https://example.org',date:'2026-06'}]}));
  if(/You read a sentence/.test(sys)){const line=u0.split('\n').find(l=>/exit cap/i.test(l));const cell=line?line.split('|')[1].trim():'';return reply(JSON.stringify({changes:cell?[{label:'Exit cap rate',cell,kind:'pts',value:0.5,sure:true}]:[]}))}
  if(pl.tools&&j.provider==='anthropic'){const last=pl.messages[pl.messages.length-1];const lt=JSON.stringify(last);
    if(!/tool_result/.test(lt)&&/sell in year/i.test(lt)){TOOLS.push('hold_sell_curve');return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'h1',name:'hold_sell_curve',input:{from_year:6,to_year:12}}],stop_reason:'tool_use'})})}
    if(/tool_result/.test(lt))return reply('Here is the result, below.')}
  reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,320):''))};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500);return p.evaluate(async()=>{const x=latestExport();const r=await xcEngine(x);await xcCacheMore(x);return{id:x.id,pct:r&&r.pct,out:x.out,proj:PROJ.id}})};
const A=(tool,args,q)=>p.evaluate(async([tool,args,q])=>{window.LASTQ=q||'';const o=await handle(q||'','web','Investment Director',{k:'a33',tool,args});return{plain:o.plain||'',html:(o.html||'')+(o.keep||''),chart:o.chart||null}},[tool,args,q]);
const num=(s,re)=>{const m=String(s).match(re);return m?+m[1].replace(/,/g,''):NaN};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const w0=await up('r33_waha_sar.xlsx');ok(w0.pct===100&&near(w0.out.levered_irr,15.343073610135,1e-4),'the fund development reads exactly',JSON.stringify(w0.out).slice(0,200));

// 1. hold versus sell: through the AI, every exit year recalculated (LibreOffice: 17.38% in year 6 … 15.34% in year 10)
await p.evaluate(()=>{toggleDock(true);webAsk('What is the IRR if we sell in year 6, 7, 8 … 12?')});
await p.waitForFunction(()=>/Best exit/.test(([...document.querySelectorAll('#msgs .msg.agent')].pop()||{}).innerText||''),null,{timeout:40000}).catch(()=>{});
const hs=await p.evaluate(()=>{const m=[...document.querySelectorAll('#msgs .msg.agent')].pop();return{t:m.innerText,ch:!!m.querySelector('.kchart')}});
ok(TOOLS[0]==='hold_sell_curve'&&/Best exit on Levered IRR: year 6 \(17\.38%\)/.test(hs.t)&&/\b7\b[^\n]*16\.59%/.test(hs.t)&&/\b9\b[^\n]*15\.65%/.test(hs.t)&&/past the model’s last period/.test(hs.t)&&hs.ch,'hold versus sell: each exit year exact (17.38%, 16.59%, 15.65% as LibreOffice), years past the model flagged, charted',hs.t.slice(0,500));

// 3. DSCR and LTV by year against the model's own covenants
let r=await A('line_over_time',{lines:['DSCR','LTV']},'show DSCR and LTV by year against the covenants: when do we breach?');
ok(/breaches the minimum of 1\.25x in 2029\**\s*\(worst 1\.16x\)/.test(r.plain)&&/LTV[^\n]*breaches the maximum of 60\.00% in 2029/.test(r.plain)&&/Minimum DSCR covenant, Inputs!B11/.test(r.plain)&&(r.html.match(/class="kchart"/g)||[]).length===2,'DSCR and LTV over time against the covenants found in the model: the breach year named, two charts',r.plain.slice(0,400));

// 4. the hardcoded construction schedule a year later (LibreOffice: levered IRR 18.04%)
r=await A('shift_timing',{lines:['Construction cost'],periods:12,unit:'months'});
ok(/Levered IRR 15\.34% → 18\.04%/.test(r.plain)&&/3 typed cells rewritten|cells rewritten/.test(r.plain)&&/data-xcdl=/.test(r.html),'a typed schedule moved a year later: every cell moved, IRR as LibreOffice, Excel with the change',r.plain.slice(0,300));
r=await A('shift_timing',{lines:['Construction cost'],periods:6,unit:'months'});ok(/6 months is 0\.5 of a period/.test(r.plain)&&/data-a33a="prorata"/.test(r.html),'half a period on an annual model: asked, with a clickable answer',r.plain.slice(0,200));

// 5. a two-way grid
r=await A('sensitivity_grid',{x:{label:'Exit cap rate',cell:'Inputs!B7'},y:{label:'Stabilised rent',cell:'Inputs!B4'},metric:'levered_irr'});
ok(/<table class="mdt a33grid">/.test(r.html)&&(r.html.match(/<td /g)||[]).length===25&&/15\.34%/.test(r.html),'a 5 × 5 grid, every cell recalculated, today’s case in it',r.plain.slice(0,200));

// 6. optimisation under a covenant (the DSCR binds at a loan to cost of 51.2%, LibreOffice: 14.85%)
r=await A('optimise',{lever:{label:'Loan to cost',cell:'Inputs!B9',min:0.3,max:0.7},objective:{metric:'levered_irr',goal:'max'},constraints:[{metric:'DSCR',op:'>=',value:1.25}]});
ok(/Loan to cost at 51\.20%/.test(r.plain)&&/14\.85%/.test(r.plain)&&/binding constraint/.test(r.plain),'the best leverage under the DSCR covenant: 51.20% loan to cost, IRR 14.85%, the covenant binding',r.plain.slice(0,300));
r=await A('optimise',{lever:{label:'Loan to cost',cell:'Inputs!B9'},objective:{metric:'levered_irr'},constraints:[{metric:'DSCR',op:'>=',value:1.25}]});ok(/Between which values may Loan to cost/.test(r.plain),'no range given: asked, never assumed');

// 9. Monte Carlo: reproducible, centred on the model
r=await A('monte_carlo',{variables:[{label:'Stabilised rent',cell:'Inputs!B4',pct_range:10},{label:'Exit cap rate',cell:'Inputs!B7',pct_range:10}],runs:400,hurdle:15});const r2=await A('monte_carlo',{variables:[{label:'Stabilised rent',cell:'Inputs!B4',pct_range:10},{label:'Exit cap rate',cell:'Inputs!B7',pct_range:10}],runs:400,hurdle:15});
const med=num(r.plain,/median ([\d.]+)%/);ok(/chance Levered IRR ends below 15\.00%/.test(r.plain)&&med>14&&med<17&&r.plain===r2.plain&&r.chart&&r.chart.values.reduce((s,v)=>s+v,0)===400,'Monte Carlo: 400 exact recalculations, the probability of missing 15%, the same answer every time',r.plain.slice(0,200));

// 7/8/15. structures added as sheets (hand calculations: mezz 16.22%, waterfall LP 13.37% / GP 26.57%, zakat 15.11%)
r=await A('add_structure',{structure:'mezzanine',size_pct:10,rate:12});ok(/How is the mezzanine interest paid/.test(r.plain)&&/data-a33a="rolled"/.test(r.html),'mezzanine terms the user did not give: asked with answers');
r=await A('add_structure',{structure:'mezzanine',size_pct:10,rate:12,interest:'rolled',draw:'prorata'});
ok(/equity IRR 15\.34% → 16\.22%/.test(r.plain)&&/Mezzanine lender IRR \| 12\.00%/.test(r.plain)&&/Check: the IRR of that line equals/.test(r.plain)&&/data-xcxdl=/.test(r.html),'a 10% mezzanine at 12%: added as a sheet of formulas, equity IRR 16.22% and lender 12.00% as by hand',r.plain.slice(0,300));
await up('r33_waha_sar.xlsx');
r=await A('add_structure',{structure:'waterfall',lp_share:90,pref:8,promote:20,catch_up:1});
ok(/LP IRR 15\.34% → 13\.37%/.test(r.plain)&&/GP IRR \| 26\.57%/.test(r.plain),'a 90/10 waterfall, 8% pref, full catch-up, 20% promote: LP 13.37%, GP 26.57% as by hand',r.plain.slice(0,300));
await up('r33_waha_sar.xlsx');
r=await A('add_structure',{structure:'tax',label:'Zakat',rate:2.5,base:'noi'});ok(/equity IRR 15\.34% → 15\.11%/.test(r.plain)&&/Total paid \| SAR 3\.91M/.test(r.plain),'zakat at 2.5% of NOI added as a line: IRR 15.11%, SAR 3.91M paid, as by hand',r.plain.slice(0,300));
const sh=await p.evaluate(async()=>{const x=latestExport();const g=WBCACHE[x.id]||await wbLoad(x.id);return g.sheets.map(s=>s.name)});ok(sh.includes('Zakat'),'the added sheet is on the platform’s sheets',JSON.stringify(sh));

// 13. where a figure comes from
await up('r33_waha_sar.xlsx');r=await A('trace_figure',{figure:'levered_irr'});ok(/Returns!B3/.test(r.plain)&&/data-openwbat=/.test(r.html)&&/Inputs!B9|Inputs!B10/.test(r.html),'the levered IRR traced through its formulas to the typed inputs, every cell clickable',r.plain.slice(0,200));

// 14. the model in USD (the SAR peg; the IRR must not move)
r=await A('convert_currency',{to:'USD'});ok(/IRRs are unchanged/.test(r.plain)&&/SAMA fixed peg/.test(r.plain)&&/Net profit \| SAR 231\.16M \| USD 61\.64M/.test(r.plain),'the model in USD at the peg: every money line converted (the IRR does not move), profit USD 61.64M',r.plain.slice(0,400));

// 12. a line added to the model (a tenant in the office rent roll)
await up('r30_office_usd.xlsx');r=await A('add_model_line',{copy_of:'Speculative tenant',label:'New tenant',values:{'Area (SF)':3000,'Rent / SF / yr':33}});
const al=await p.evaluate(async()=>{const x=latestExport();const buf=await xcRaw(x);await loadXLSX();const w=XLSX.read(buf,{type:'array',cellFormula:true});const s=w.Sheets.Underwriting;return{a19:s.A19&&s.A19.v,d19:s.D19&&s.D19.f,d20:s.D20&&s.D20.f,d20v:s.D20&&s.D20.v}});
ok(al.a19==='New tenant'&&al.d19==='B19*C19'&&al.d20==='SUM(D15:D19)'&&al.d20v===1359000,'a tenant added under the rent roll: its formula copied, the total stretched to include it (1,359,000)',JSON.stringify(al));

// 2. why the IRR moved between two uploads (LibreOffice: 15.34% → 16.84%)
await up('r33_waha_sar.xlsx');const b64=fs.readFileSync(F+'r33_waha_v2_sar.xlsx').toString('base64');
await p.evaluate(async b=>{const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));await uploadExport(new File([u],'r33_waha_v2_sar.xlsx'));await xcEngine(latestExport())},b64);
r=await A('explain_return_change',{});const steps=r.chart&&r.chart.steps||[];
ok(/Levered IRR went from 15\.34% to 16\.84%/.test(r.plain)&&/Revenue/.test(r.plain)&&/Financing/.test(r.plain)&&/Costs/.test(r.plain)&&steps.length>=5&&Math.abs(steps.filter(s=>!s.total).reduce((t,s)=>t+s.v,0)-(16.84493442-15.34307361))<0.01,'the bridge between two uploads: rent, construction cost and the rate as separate steps that add up exactly',r.plain.slice(0,400));

// 11. shortened to 7 years (LibreOffice: 16.59%)
await up('r33_waha_sar.xlsx');r=await A('shorten_cashflow',{years:7});ok(/Levered IRR 15\.34% → 16\.59%/.test(r.plain)&&/zero after year 7/.test(r.plain),'the model shortened to 7 years through its hold period, nothing left after it',r.plain.slice(0,300));
r=await A('quarterly_view',{method:'even'});ok(/On quarters the equity IRR is [\d.]+%, against 15\.34% on years/.test(r.plain),'the annual cash flow in quarters, the IRR on quarterly flows next to the annual one',r.plain.slice(0,200));

// 10. market comparison: every figure with a source
r=await A('market_benchmark',{assumptions:[{label:'Exit cap rate',value:'7.00%'}],location:'Riyadh'});ok(/Exit cap rate is more optimistic than the market/.test(r.plain)&&/Test market report, 2026-06/.test(r.plain),'market ranges come with their source and date',r.plain.slice(0,200));

// 16/17. the projects together: a USD hold model and the SAR development (by hand: fund IRR 13.08%)
await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await up('r33_waha_sar.xlsx');await up('r32_hold_usd.xlsx');r=await A('fund_combine',{currency:'SAR'});
ok(/IRR 13\.08%/.test(r.plain)&&/USD→SAR 3\.75/.test(r.plain)&&r.chart&&r.chart.labels[0]==='2025','two projects in two currencies combined by calendar year: fund IRR 13.08% as by hand',r.plain.slice(0,300));
r=await A('whatif_all_projects',{change:'exit cap rate +50 bps'});ok(/exit cap rate \+50 bps” on \d+ projects/.test(r.plain)&&(r.plain.match(/\| [\d.]+% \| [\d.]+%/g)||[]).length>=2,'one change on every project, each workbook recalculated',r.plain.slice(0,400));

ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
