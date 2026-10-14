// (1) Uploaded models get a deterministic benchmark: profit arithmetic exact, IRR from a cash flow calibrated to EstateMaster's own IRR.
// (2) An unusual layout makes the agent ask in the main chat; chips, a cell reference and a typed value are applied and the checks re-run.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
const g=await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Cash Flow Title','Rabwa Towers'],['Land Purchase Price',90000000],['Loan 1 interest rate',0.07]]),'Input');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR (geared)',0.18],['Project IRR (ungeared)',0.14],['Development Margin',0.20],['Net Development Profit',100000000],['Total Development Cost',500000000],['Gross Sales Revenue',600000000],['Peak Debt',300000000]]),'Summary');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'Rabwa Towers.xlsx'));await new Promise(r=>setTimeout(r,400));const x=latestExport(),c=genCalib(x);
  const pr=genBench(x,{price:-10}),co=genBench(x,{cost:10}),dl=genBench(x,{delay:12}),rt=genBench(x,{rate:2});
  const chk=(chg,k,v)=>calcChecks({x,changes:[{text:chg}],metrics:[{k,value:v}],rounds:[]}).findings.some(f=>f.code==='replica');
  return{fin:c.fin,proj:PROJ.name,fromExport:!!PROJ.fromExport,calOk:c.ok,N:c.N,pr,co,dl,rt,base:x.out,far:chk('sale price −10%','profit_on_cost',15),near:chk('sale price −10%','profit_on_cost',8.2),irrFar:chk('sale price −10%','levered_irr',x.out.levered_irr+1)}});
t(g.fromExport&&g.calOk,'an uploaded model ('+g.proj+') gets a cash flow calibrated to EstateMaster’s own IRR (build period '+(g.N*3).toFixed(0)+' months)');
t(Math.abs(g.pr.net_profit-(40e6-g.pr.dF))<1&&Math.abs(g.pr.dF)<2e6&&Math.abs(g.pr.profit_on_cost-(40e6-g.pr.dF)/(500e6+g.pr.dF)*100)<1e-6,'sale price −10%: net profit 100M − 60M − the extra interest from slower repayment ('+(g.pr.dF/1e6).toFixed(2)+'M), profit on cost exact: '+(g.pr.net_profit/1e6).toFixed(2)+'M, '+g.pr.profit_on_cost.toFixed(2)+'%');
{const dC=0.1*(410e6-g.fin)+g.co.dF,e=(100e6-dC)/(500e6+dC)*100;t(g.fin>0&&Math.abs(g.co.profit_on_cost-e)<1e-6,'construction cost +10% on the construction spend only (410M less the '+(g.fin/1e6).toFixed(1)+'M finance inside the total): profit on cost '+g.co.profit_on_cost.toFixed(2)+'% = (100M − '+(dC/1e6).toFixed(1)+'M) ÷ (500M + '+(dC/1e6).toFixed(1)+'M)')}
t(g.pr.levered_irr<g.base.levered_irr&&g.dl.levered_irr<g.base.levered_irr&&g.rt.levered_irr<g.base.levered_irr&&Math.abs(g.rt.unlevered_irr-g.base.unlevered_irr)<1e-6,'IRR benchmark moves the right way (price −10% → '+g.pr.levered_irr.toFixed(2)+'%, 12-month delay → '+g.dl.levered_irr.toFixed(2)+'%, rate +2 pts → '+g.rt.levered_irr.toFixed(2)+'%, project IRR unchanged by the rate)');
t(g.far&&!g.near,'an AI profit on cost of 15% for a −10% price is flagged against the exact ~8%; 8.2% passes');t(g.irrFar,'an AI IRR that rises on a price cut is far from the calibrated benchmark and flagged');
// (2) clarification in the chat
const c1=await p.evaluate(async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Cash Flow Title','Odd Layout Park']]),'Input');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR',0.15],['Development Margin',0.0109],['Net Development Profit',137994090],['Total Development Cost',95144755],[],[],[],['Sales (GDV)',null,233138845]]),'Summary');
  try{toggleDock(false)}catch(e){}CLARIFY=null;await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'Odd Layout Park.xlsx'));for(let i=0;i<40&&!(CLARIFY&&CLARIFY.xid===latestExport().id);i++)await new Promise(r=>setTimeout(r,200));
  const last=$$('#msgs .msg.agent').slice(-1)[0];return{dock:DOCK.open,clar:!!CLARIFY,qs:CLARIFY&&CLARIFY.qs.map(q=>q.id),txt:last?last.textContent:''}});
t(c1.dock&&c1.clar,'an unusual layout opens the chat on the right with questions: '+JSON.stringify(c1.qs));t(/Profit on cost reads 1\.09%/.test(c1.txt)&&/145\.0[34]%/.test(c1.txt)&&/could not find \*?\*?Gross revenue|could not find Gross revenue/.test(c1.txt.replace(/\*/g,'')),'it names the conflict (1.09% vs 145.03%) and the missing revenue');
await p.locator('[data-cla^="Use 145"]').click();await p.waitForTimeout(800);
const c2=await p.evaluate(()=>({poc:latestExport().out.profit_on_cost,msg:$$('#msgs .msg.agent').slice(-1)[0].textContent,open:CLARIFY&&CLARIFY.qs.map(q=>q.id)}));
t(Math.abs(c2.poc-145.03)<0.01&&/applied/.test(c2.msg),'a chip answer is applied: profit on cost now '+c2.poc+'%');
await p.fill('#ask','gross revenue is Summary!C8');await p.click('#send');await p.waitForTimeout(900);
const c3=await p.evaluate(()=>({rev:latestExport().out.gross_revenue,cell:(latestExport().cells||{}).gross_revenue,msg:$$('#msgs .msg.agent').slice(-1)[0].textContent,open:CLARIFY}));
t(c3.rev===233138845&&c3.cell==='Summary!C8','a cell named in plain words is read from the workbook itself: revenue '+c3.rev+' from '+c3.cell);
t(/exact checks now pass|Still/.test(c3.msg),'and the checks run again: '+c3.msg.slice(-160));
// a question asked while a clarification is pending is never read as an answer (it must not overwrite a figure)
const q1=await p.evaluate(async()=>{const x=latestExport();CLARIFY={xid:x.id,qs:layoutQuestions(x).concat([{id:'miss:total_cost',k:'total_cost',q:'total cost?'}])};const tc=x.out.total_cost;await webAsk('what if sale price drops 10% and cost rises 15%?');await new Promise(r=>setTimeout(r,600));const tc2=x.out.total_cost;
  CLARIFY={xid:x.id,qs:[{id:'miss:net_profit',k:'net_profit',q:'net profit?'}]};await webAsk('net profit is 137,994,090');await new Promise(r=>setTimeout(r,300));return{tc,tc2,np:x.out.net_profit}});
t(q1.tc===q1.tc2,'a what-if question asked during a clarification does not touch the model ('+q1.tc+' → '+q1.tc2+')');t(q1.np===137994090,'a plain answer (“net profit is 137,994,090”) is applied');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_genclar:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
