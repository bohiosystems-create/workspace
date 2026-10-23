// Round 32: "extend the cash flow by N years" on any uploaded workbook. The workbook itself gets the new periods (columns or rows), each line's
// formula carried on, the totals, IRR and NPV ranges, names and charts stretched to the new end, input curves read by period lengthened, and the
// model recalculated exactly. What the workbook does not settle is asked with clickable answers, never assumed: numbers typed in the last
// period, the exit in the last period (and a hold-period input), how long a period is. Expected figures are worked out by hand (Python) and
// match LibreOffice on the extended files.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),ctx=await b.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),p=await ctx.newPage();await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'})   /* changes to a model's structure are Jadwa's (KINAN's models change in EstateMaster) */;await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));const TOOLS=[];
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const user=JSON.stringify(pl.messages);
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');
  /* the stand-in agent: it reads the request and calls extend_cashflow with only what the user said */
  if(pl.tools&&j.provider==='anthropic'){const last=pl.messages[pl.messages.length-1];const lt=JSON.stringify(last);
    if(!/tool_result/.test(lt)&&/xtend the cash flow/i.test(lt)){const m=lt.match(/by (\d+) years?/);const input={years:m?+m[1]:1};if(/keep the last period.s typed values/.test(lt))input.constants='hold';if(/set the typed values to zero/.test(lt))input.constants='zero';if(/move the exit to the new last period/.test(lt))input.exit='move';if(/keep the exit where it is/.test(lt))input.exit='keep';TOOLS.push(input);
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'t'+TOOLS.length,name:'extend_cashflow',input}],stop_reason:'tool_use'})})}
    if(/tool_result/.test(lt))return reply(/before I extend/i.test(lt)?'I need two answers before I extend it, below.':'Extended: the figures are below.')}
  reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500);return p.evaluate(async()=>{const x=latestExport();const r=await xcEngine(x);return{id:x.id,pct:r&&r.pct,out:x.out}})};
const ext=a=>p.evaluate(async a=>{const o=await handle('','web','Investment Director',{k:'xextend',...a});const x=latestExport();return{plain:o.plain,html:o.html,keep:o.keep||'',id:x.id,file:x.file,out:x.out,ext:x.extended||null}},a);
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

// 1. an annual hold model: asks (typed capex in the last year; the hold period that times the sale), clickable, then extends exactly
const h0=await up('r32_hold_usd.xlsx');ok(h0.pct===100,'the hold model reads exactly',JSON.stringify(h0).slice(0,200));
await p.evaluate(()=>{toggleDock(true);webAsk('Extend the cash flow by 5 years')});
await p.waitForFunction(()=>document.querySelectorAll('#msgs [data-xext]').length>=4,null,{timeout:30000}).catch(()=>{});
const q=await p.evaluate(()=>{const m=[...document.querySelectorAll('#msgs .msg.agent')].pop();return{t:m?m.innerText:'',n:document.querySelectorAll('#msgs [data-xext]').length,vis:[...document.querySelectorAll('#msgs [data-xext]')].every(c=>c.getBoundingClientRect().width>0)}});
ok(q.n>=4&&q.vis&&/Capital expenditure \(-100,000\)/.test(q.t)&&/Hold period \(years\)” is 10/.test(q.t)&&/Summary!B5 reads the last period/.test(q.t),'nothing assumed: the typed capex and the exit timed by the hold period are asked, with clickable answers',q.t.slice(0,400));
ok(TOOLS.length===1&&TOOLS[0].years===5&&!TOOLS[0].constants&&!TOOLS[0].exit,'the AI called extend_cashflow with only what the user said',JSON.stringify(TOOLS));
const before=await p.evaluate(()=>latestExport().id);
await p.evaluate(()=>{const c=[...document.querySelectorAll('#msgs [data-xext="constants"]')].reverse().find(z=>z.dataset.xv==='hold');c.click()});
await p.evaluate(()=>{const c=[...document.querySelectorAll('#msgs [data-xext="exit"]')].reverse().find(z=>z.dataset.xv==='move');c.click()});
await p.waitForFunction(b=>latestExport().id!==b&&latestExport().extended&&[...document.querySelectorAll('#msgs .msg.agent')].pop().querySelector('[data-xcxdl]'),before,{timeout:40000}).catch(()=>{});
const h1=await p.evaluate(()=>{const x=latestExport(),m=[...document.querySelectorAll('#msgs .msg.agent')].pop();return{file:x.file,out:x.out,ext:x.extended,html:m?m.innerHTML:'',txt:m?m.innerText:''}});
ok(TOOLS.length===2&&TOOLS[1].constants==='hold'&&TOOLS[1].exit==='move','the two clicks went back to the AI as one request, and it passed both answers',JSON.stringify(TOOLS[1]));
if(!h1.ext)console.log('LAST:',h1.txt.slice(0,800));ok(/ - extended by 5 years\.xlsx$/.test(h1.file||'')&&near(h1.out.unlevered_irr,7.625112549873825,1e-5)&&near(h1.out.net_profit,16297350.361000441,1e-9),'extended by 5 years with the sale moved to year 15: IRR 7.22% → 7.63% and net profit, exactly as worked out by hand',JSON.stringify({f:h1.file,irr:h1.out.unlevered_irr,np:h1.out.net_profit}));
ok(/data-xcxdl=/.test(h1.html)&&/class="kchart"/.test(h1.html),'the answer carries the before/after chart and the extended Excel',h1.html.length);
const wb=await p.evaluate(async()=>{const x=latestExport();const buf=await xcRaw(x);await loadXLSX();const w=XLSX.read(buf,{type:'array',cellFormula:true});const c=w.Sheets['Cash Flow'],s=w.Sheets.Summary,i=w.Sheets.Inputs;return{r4:c.R4&&c.R4.f,r5:c.R5&&c.R5.v,r10:c.R10&&c.R10.v,r11:c.R11&&c.R11.f,s13:c.S13&&c.S13.f,irr:s.B2&&s.B2.f,irrv:s.B2&&s.B2.v,exit:s.B5&&s.B5.f,hold:i.B7&&i.B7.v}});
ok(wb.r4==='Q4+1'&&wb.r5===2040&&wb.r10===-100000&&/^IF\(R\$4=Inputs!\$B\$7,R9/.test(wb.r11||'')&&wb.s13==='SUM(C13:R13)'&&wb.irr==="IRR('Cash Flow'!C13:R13)"&&wb.exit==="'Cash Flow'!R11"&&wb.hold===15&&near(wb.irrv,0.07625112549873825,1e-8),'the workbook given back: formulas carried on, the year row and the typed capex continued, the total and the IRR stretched, the exit cell and the hold period moved, results stored',JSON.stringify(wb));

// the platform's own sheet view shows the extended workbook, and it goes back to Excel again
const g=await p.evaluate(async()=>{const x=latestExport();const g=WBCACHE[x.id]||await wbLoad(x.id);const sh=g.sheets.find(s=>s.name==='Cash Flow');const at=(r,c)=>sh.cells.find(z=>z[0]===r&&z[1]===c)||null;const m=[...document.querySelectorAll('#msgs .msg.agent')].map(z=>z.querySelector('[data-openwbat]')).filter(Boolean).pop();m.click();await new Promise(z=>setTimeout(z,1200));return{cols:sh.cols,yr:at(4,17),sale:at(10,17),at:m.dataset.openwbat,view:(document.body.innerText.match(/2040/g)||[]).length}});
ok(g.cols>=19&&g.yr&&g.yr[2]==='2040'&&g.sale&&/^=IF\(R\$4=Inputs!\$B\$7,R9/.test(g.sale[3])&&g.view>=1,'the sheet in the platform shows the new years, their formulas and values',JSON.stringify(g).slice(0,300));
await p.keyboard.press('Escape').catch(()=>{});
const xl=await p.evaluate(async()=>{const o=await handle('give me the excel','web','Investment Director',{k:'xldl'});return o.html+(o.keep||'')});
const [dlv]=await Promise.all([p.waitForEvent('download',{timeout:15000}).catch(()=>null),p.evaluate(h=>{const d=document.createElement('div');d.innerHTML=h;document.body.appendChild(d);d.querySelector('[data-xcxdl]').click()},xl)]);
let dx=null;if(dlv){const fs=await import('fs');const path=await dlv.path();const X=(await import('module')).createRequire(import.meta.url)('../vendor/xlsx-0.18.5.full.min.js');const w=X.read(fs.readFileSync(path),{cellFormula:true});dx={name:dlv.suggestedFilename(),irr:w.Sheets.Summary.B2.f,v:w.Sheets.Summary.B2.v,r5:w.Sheets['Cash Flow'].R5.v}}
ok(dx&&/extended by 5 years\.xlsx$/.test(dx.name)&&dx.irr==="IRR('Cash Flow'!C13:R13)"&&near(dx.v,0.07625112549873825,1e-8)&&dx.r5===2040,'“export to Excel” gives the extended workbook back, formulas and results in it',JSON.stringify(dx));

// 2. quarterly, dated, the sale and the loan repayment written in the last quarter only, XIRR over the dates, a trailing four-quarter window
await up('r32_qtr_eur.xlsx');let r=await ext({years:2});
ok(/Sale proceeds, Loan repayment have their own formula there/.test(r.plain)&&/Summary!B4 reads the last period/.test(r.plain)&&!r.ext,'the last quarter’s own formulas (the sale, the repayment) are asked about, not moved silently',r.plain.slice(0,300));
r=await ext({years:2,exit:'move'});
ok(near(r.out.levered_irr,32.69406912599434,1e-5)&&near(r.out.net_profit,14462828.011125606,1e-9),'8 new quarters with the exit moved to the new last quarter: XIRR and profit exact',JSON.stringify({irr:r.out.levered_irr,np:r.out.net_profit}));

// 3. a timeline down the rows, with a totals row under it
const v0=await up('r32_vert_gbp.xlsx');r=await ext({years:3});
ok(v0.pct===100&&near(r.out.unlevered_irr,6.740064883645147,1e-5)&&/Annual: 3 new years \(rows 13–15\)/.test(r.plain),'years down the rows: three rows inserted above the totals, IRR exact',JSON.stringify({irr:r.out.unlevered_irr,p:r.plain.slice(0,200)}));

// 4. a circular JV model whose cash ends at its sale: the extra months are zero, so every return is unchanged
const j0=await up('r18_jv_usd.xlsx');r=await ext({years:3});
ok(j0.pct===100&&['levered_irr','unlevered_irr','lp_irr','net_profit'].every(k=>!Number.isFinite(j0.out[k])||near(r.out[k],j0.out[k],1e-6)),'a circular JV model extended past its sale: returns unchanged, as they must be',JSON.stringify({b:j0.out.levered_irr,a:r.out.levered_irr,bp:j0.out.net_profit,ap:r.out.net_profit}));

// 5. a rate curve read by period (INDEX(Curves!$B$2:$B$41,quarter)): lengthened with the timeline, its last rate kept as asked
const c0=await up('r19_capstack_usd.xlsx');r=await ext({years:3});
ok(/SOFR forward \(3\.41%\)/.test(r.plain)&&/new periods/.test(r.plain),'the curve’s typed rates are asked about too',r.plain.slice(0,240));
r=await ext({years:3,constants:'hold'});
ok(/Curves: 12 new values for the new periods of Cash Flow/.test(r.plain)&&Object.keys(c0.out).every(k=>!Number.isFinite(c0.out[k])||Number.isFinite(r.out[k])),'the curve is lengthened, so no figure becomes “not computed”',r.plain.slice(0,300));

// 6. without an AI: the sentence is still read, and the clicked answers are used
const it=await p.evaluate(()=>[intent('extend the cash flow by 2 years'),intent('Extend the cash flow by 3 years: keep the last period’s typed values in the new periods; move the exit to the new last period.'),intent('add 8 quarters to the model')]);
ok(it[0].k==='xextend'&&it[0].years===2&&it[1].constants==='hold'&&it[1].exit==='move'&&it[2].k==='xextend'&&it[2].years===2,'the rules read the request when no AI answers',JSON.stringify(it));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
