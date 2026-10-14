// Financial audit fixes: model horizon, line-test direction, financing-only checks, one-sided metrics, sensitivity re-anchor, trend on month axes.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('console',m=>{if(m.text().startsWith('DBG'))console.log(m.text())});p.on('pageerror',e=>errs.push(e.message));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=full');await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const R={};window.flagDispute=window.flagDispute||(()=>{});const FD=[];const fd0=flagDispute;window.flagDispute=x=>{FD.push(x)};
  // 1. a 3-year delay keeps every figure finite; returns fall as the delay grows
  const m0=run({}),m36=model({...BASE,delay:36}),m48=model({...BASE,delay:48});R.delay={rev:Number.isFinite(m36.rev)&&Number.isFinite(m48.rev),irrDown:m48.irr<m36.irr&&m36.irr<m0.irr,poc:m48.poc<m0.poc};
  R.cap0=Number.isFinite(model({...BASE,cap:0}).rev);
  // 2. a line test (from → to) now gets a direction: sale price down while the IRR goes up is caught
  const x={out:{levered_irr:20,unlevered_irr:15,profit_on_cost:25,net_profit:1e8,total_cost:4e8,gross_revenue:5e8},inputs:[],id:'t'};Object.assign(x,{proj:PROJ.id,at:new Date().toISOString(),file:'t.xlsx'});EXPORTS.push(x);if(latestExport()!==x)throw new Error('export not picked: '+JSON.stringify(baseOpt(PROJ.id)));const o=x.out;
  R.txt=chgText({label:'Sale price',from:'8,500 SAR/sqm',to:'8,000'});
  const c1=calcChecks({x,changes:[{label:'Sale price',from:'8,500 SAR/sqm',to:'8,000'}],metrics:[{k:'levered_irr',value:o.levered_irr+2}],rounds:[]});R.dirLine=c1.findings.some(f=>/improves/.test(f.text));
  // 3. financing-only: the project IRR must not move
  const c2=calcChecks({x,changes:[{label:'Interest rate',from:'6.5%',to:'8%'}],metrics:[{k:'levered_irr',value:o.levered_irr-1},{k:'unlevered_irr',value:o.unlevered_irr-1.5}],rounds:[]});R.finOnly=c2.findings.some(f=>/project\) IRR moves/.test(f.text));
  const c3=calcChecks({x,changes:[{label:'Interest rate',from:'6.5%',to:'8%'}],metrics:[{k:'levered_irr',value:o.levered_irr-1},{k:'unlevered_irr',value:o.unlevered_irr}],rounds:[]});R.finOnlyOk=!c3.findings.length;
  const c4=calcChecks({x,changes:[{text:'construction cost +10%'}],metrics:[{k:'unlevered_irr',value:o.unlevered_irr+1}],rounds:[]});R.unlevDir=c4.findings.some(f=>f.k==='unlevered_irr'&&/improves/.test(f.text));
  // 4. a figure only one model returns is kept (not dropped), marked not cross-checked
  window.calcPair=()=>[{p:'anthropic',model:'a'},{p:'openai',model:'b'}];let n=0;
  window.callOne=async(pp,mm,sys)=>{if(/independent checker/.test(sys))return{text:'{"verdicts":[],"summary":"ok"}'};n++;const base=[{metric:'levered_irr',base:o.levered_irr,value:o.levered_irr-1,working:'w'},{metric:'profit_on_cost',base:o.profit_on_cost,value:o.profit_on_cost-2,working:'w'}];if(pp==='anthropic')base.push({metric:'peak_debt',base:o.peak_debt||1e8,value:(o.peak_debt||1e8)*1.05,working:'w'});return{text:JSON.stringify({method:'m',results:base})}};
  const cc=await aiCrossCheck([{text:'construction cost +5%'}]);R.oneSided=cc.metrics.find(z=>z.k==='peak_debt');R.oneSided=R.oneSided&&R.oneSided.status;
  // 5. sensitivity: one model offset by +3 pts everywhere is re-anchored, flagged, and then agrees
  const X={assumption:'Sale price',kind:'pct',shifts:[-10,0,10]},Y={assumption:'Construction cost',kind:'pct',shifts:[-10,0,10]},b0=o.levered_irr;
  const grid=off=>[[b0-1,b0+2,b0+5],[b0-3,b0,b0+3],[b0-5,b0-2,b0+1]].map(rw=>rw.map(v=>+(v+off).toFixed(2)));
  window.callOne=async(pp)=>({text:JSON.stringify({method:'m',grid:grid(pp==='openai'?3:0)})});FD.length=0;
  const sg=await aiSensGrid(X,Y,'levered_irr');console.log('DBG',JSON.stringify({base:sg.base,names:sg.names,st:sg.status,off:sg.baseOff,g:sg.grid}));R.reanch={off:(sg.baseOff||[]).map(z=>z.n).join(),allAgree:sg.status.flat().every(s=>s==='agree'||s==='em'),flagged:FD.some(f=>/base cell/.test(f.what))};
  // 6. trend check now works on a months axis: a delay that raises the IRR is caught
  const Xm={assumption:'Construction delay',kind:'months',shifts:[0,3,6]},Ym={assumption:'Construction cost',kind:'pct',shifts:[-10,0,10]};
  window.callOne=async()=>({text:JSON.stringify({method:'m',grid:[[b0+2,b0+3,b0+4],[b0,b0+1,b0+2],[b0-2,b0-1,b0]]})});const sm=await aiSensGrid(Xm,Ym,'levered_irr');R.monthsOdd=sm.odd;
  return R});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.delay.rev&&r.delay.irrDown&&r.delay.poc,'long delays (36/48 months) stay finite and keep lowering the returns '+JSON.stringify(r.delay));t(r.cap0,'a zero cap rate no longer breaks the model');
t(/−5\.9%, lower/.test(r.txt),'line test gets its signed change: '+r.txt);t(r.dirLine,'line test: price down but IRR up is caught');
t(r.finOnly,'financing-only change: a moving project IRR is caught');t(r.finOnlyOk,'financing-only change with the project IRR unchanged passes');t(r.unlevDir,'unlevered IRR direction is checked for cost changes');
t(r.oneSided==='single','a figure only one model returned is kept as not cross-checked ('+r.oneSided+')');
t(r.reanch.off==='OpenAI b'||/b/.test(r.reanch.off),'offset model identified: '+r.reanch.off);t(r.reanch.allAgree,'after re-anchoring the two tables agree');t(r.reanch.flagged,'the offset is flagged in the pop-up');
t(r.monthsOdd>0,'trend check on a months axis catches a delay that raises the IRR ('+r.monthsOdd+' cells)');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_finaudit:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
