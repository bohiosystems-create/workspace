// End to end: an upload with EstateMaster's cash flow gets exact IRRs everywhere (proof, AI tests, chat, stress); without it the chat asks.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const T=JSON.parse(fs.readFileSync(sp+'cfref/truth.json'));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const b64=fs.readFileSync(sp+'cfref/ref_export.xlsx').toString('base64');
const r1=await p.evaluate(async b64=>{await loadXLSX();const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));await uploadExport(new File([bin],'Reference Tower.xlsx'));for(let i=0;i<40;i++){const x=latestExport();if(x.audit&&x.audit.status==='done')break;await new Promise(r=>setTimeout(r,150))}
  const x=latestExport();return{proj:PROJ.name,cf:!!x.cf,log:(x.audit&&x.audit.log||[]).map(l=>l.text),dbg:$('#dbgWBody')?$('#dbgWBody').textContent:''}},b64);
t(r1.cf&&r1.log.some(l=>/IRR proof: EstateMaster’s cash flow .* reproduces its own IRR .*levered 24\.65% = 24\.6501%.*every IRR change will be computed exactly/.test(l)),'the debug window proves the IRR from EstateMaster’s own cash flow: '+(r1.log.find(l=>/IRR proof/.test(l))||'').slice(0,240));
// the AI is wrong on purpose: the exact figure is what the user sees
const r2=await p.evaluate(async()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';setHurdle(18,'typed');window.checkerAgent=async()=>({model:'c',verdicts:[],summary:''});const o=latestExport().out;
  window.callOne=async()=>({text:JSON.stringify({method:'m',results:[{metric:'levered_irr',base:o.levered_irr,value:20,working:'w'},{metric:'profit_on_cost',base:o.profit_on_cost,value:18,working:'w'},{metric:'net_profit',base:o.net_profit,value:100e6,working:'w'}]})});
  const res=await aiCrossCheck([{label:'Sale price',from:'SAR 13,500/sqm',to:'SAR 12,150/sqm'}]);const g=k=>res.metrics.find(m=>m.k===k)||{};return{lev:g('levered_irr').value,levSt:g('levered_irr').status,ai:g('levered_irr').ai,warn:g('levered_irr').warn,poc:g('profit_on_cost').value,np:g('net_profit').value,un:g('unlevered_irr').value,html:testHTML(res).replace(/<[^>]+>/g,' ')}});
t(Math.abs(r2.lev-T.price10.lirr)<0.01&&r2.levSt==='exact','AI test of a −10% price: the levered IRR shown is the exact '+r2.lev.toFixed(3)+'% (truth '+T.price10.lirr.toFixed(3)+'%), not the AI’s '+r2.ai+'%');
t(Math.abs(r2.un-T.price10.uirr)<0.01&&Math.abs(r2.poc-T.price10.poc)<0.01&&Math.abs(r2.np-T.price10.np)<1e3,'unlevered IRR, profit on cost and net profit exact too ('+r2.un.toFixed(3)+'%, '+r2.poc.toFixed(3)+'%, '+(r2.np/1e6).toFixed(2)+'M vs truth '+T.price10.uirr.toFixed(3)+'%, '+T.price10.poc.toFixed(3)+'%, '+(T.price10.np/1e6).toFixed(2)+'M)');
t(r2.warn&&/exact, from EstateMaster’s cash flow|exact, computed from/.test(r2.html)&&/Exact:/.test(r2.html),'the AI’s wrong estimate is flagged and the result is labelled exact');
// a change so severe that no IRR exists: reported as such, never the AI's number
const r2b=await p.evaluate(async()=>{const a=await aiCrossCheck([{text:'sale price −20%, construction cost +20% and a 12-month delay'}]);const res=await aiCrossCheck([{text:'sale price −30% and construction cost +20%'}]);const m=res.metrics.find(z=>z.k==='levered_irr')||{};return{neg:(a.metrics.find(z=>z.k==='levered_irr')||{}).value,v:m.value,flag:m.flag,ai:m.ai,ck:(m.checks||[]).join(' ')}});
t(Math.abs(r2b.neg-(-52.304))<0.01,'a deep loss with an IRR (price −20%, cost +20%, 12-month delay): exact '+(r2b.neg||0).toFixed(3)+'% (truth −52.304%)');
t(!Number.isFinite(r2b.v)&&r2b.flag&&/no IRR exists/.test(r2b.ck),'a change where the equity loses money: “no IRR exists”, not the AI’s '+r2b.ai+'%: '+r2b.ck.slice(0,160));
// chat what-if without AI, and the local stress tests
const r3=await p.evaluate(async()=>{AI.keys={};window.calcPair=()=>[];const out={};for(const [k,q] of [['cost15','what if construction cost rises 15%'],['delay6','what if there is a 6 month delay'],['combo','what if sale price drops 5%, construction cost rises 10% and a 3 month delay']]){CLARIFY=null;const r=await handle(q,'web','director');out[k]=(r.html||r.text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')}return out});
for(const k of ['cost15','delay6','combo']){const m=r3[k].match(/Levered IRR [\d.]+% xlsx → (-?[\d.]+)%/);t(m&&Math.abs(+m[1]-T[k].lirr)<0.01,`chat what-if ${k}: ${m?m[1]:'?'}% vs truth ${T[k].lirr.toFixed(2)}%`)}
// no cash flow: the chat asks (never assumes)
const r4=await p.evaluate(async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Cash Flow Title','No Flow Park'],['Equity IRR',0.16],['Project IRR',0.12],['Development Margin',0.15],['Net Development Profit',60e6],['Total Development Cost',400e6],['Gross Sales Revenue',460e6],['Peak Debt',200e6]]),'Summary');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'No Flow Park.xlsx'));for(let i=0;i<40&&!(CLARIFY&&CLARIFY.qs.some(q=>q.id==='cashflow'));i++)await new Promise(r=>setTimeout(r,150));const x=latestExport();
  return{qs:CLARIFY&&CLARIFY.qs.map(q=>q.id),gb:genBench(x,{cost:10})}});
t(r4.qs&&r4.qs.includes('cashflow')&&r4.qs.includes('land')&&r4.qs.includes('rate'),'no cash flow: the chat asks for it, and for the land cost and finance rate instead of assuming them: '+JSON.stringify(r4.qs));
t(!Number.isFinite(r4.gb.levered_irr)&&!Number.isFinite(r4.gb.profit_on_cost)&&/not computed/.test(r4.gb.method),'and nothing that depends on them is computed meanwhile: '+r4.gb.method);
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_cfapp:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
