// Reports on an uploaded model: every report holds only that model's figures. No section computed on the demo replica, no demo project's
// change requests or market flags, no replica figure standing in for one the model lacks, no NaN or 0 for a missing figure, no "Riyadh"
// on a model elsewhere; the daily report names each model's own IRR and currency; "schedule the daily report" picks the daily report.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?F+'pptx/package/dist/pptxgen.bundle.js':F+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}):r.fulfill({status:503,body:'{}'}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
let pass=0,fail=0;const t=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'models/'+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500);await p.evaluate(()=>xcEngine(latestExport()))};
for(const [m,ccy,wi] of [['r11_solar_eur','EUR','PPA price to 48'],['r14_plots_inr','INR','land cost to 210'],['r15_cogp_usd','USD','project equity multiple to 2.3']]){await up(m);await p.evaluate(async q=>{await handle(q,'web','director')},wi);
  const r=await p.evaluate(()=>{const out={};for(const k of Object.keys(RPTS)){if(k==='daily'||k==='track'||k==='funds')continue;const tx=String(RPTS[k].fn()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');const dk=JSON.stringify(buildDeck(k).slides);const all=tx+' '+dk;
    out[k]={leak:(all.match(/.{0,50}(\bSAR\b|Narjis|SAIBOR|Riyadh|CR-1\d\d).{0,30}/)||[''])[0],nan:(all.match(/.{0,50}(NaN|undefined|Infinity).{0,30}/)||[''])[0]}}return{out,cr:runSuggestions('test',true).length}});
  const leaks=Object.entries(r.out).filter(([k,v])=>v.leak),nans=Object.entries(r.out).filter(([k,v])=>v.nan);
  t(!leaks.length,`${m}: no demo project, SAR, SAIBOR, Riyadh or demo change request in any report: `+JSON.stringify(leaks.slice(0,2)));
  t(!nans.length,`${m}: no NaN / undefined in any report or deck: `+JSON.stringify(nans.slice(0,2)));
  t(r.cr===0,`${m}: the demo suggestion engine files nothing against an uploaded model`)}
const d=await p.evaluate(()=>{const dk=buildDeck('daily',{});const heads=JSON.stringify(dk.slides);return{nan:/NaN|undefined/.test(heads),plotsIRR:/SARJAPUR[^"]*"[^]*?Project IRR/.test(heads)}});
t(!d.nan,'the daily report has no NaN');
const sc=await p.evaluate(()=>parseSchedule('schedule the daily report every morning at 7').k);t(sc==='daily','“schedule the daily report every morning at 7” picks the daily report: '+sc);
// reports an investment manager designs on an uploaded JV (no AI: the rules engine): a demo-engine section (facility, covenants, fund terms)
// shows the workbook's own debt or investor figures instead of vanishing, and the reply says so; the name and audience said are kept;
// email, schedule and Play act on a custom report named by its own name
await up('r18_jv_usd');
{const L=await p.evaluate(async()=>{const r=await designNewReport('New report for the construction lender: facility, drawdowns, covenant tests and peak debt, all as tables','IM','Workspace');const d=JSON.stringify(buildDeck(r.k).slides),doc=reportDoc(r.k);
  return{aud:RPTS[r.k].aud,skip:(r.skip||[]).join(' '),deck:/Workbook · Debt and cover/.test(d)&&/Peak debt/.test(d)&&/USD 59\.04M/.test(d),doc:/Debt and cover/.test(doc)&&/59\.04/.test(doc)}});
  t(L.deck&&L.doc,'lender pack on an uploaded model: the workbook’s debt figures (peak debt USD 59.04M) stand in for facility and covenants, deck and document');
  t(/full EstateMaster model/.test(L.skip),'the designer says which sections come from the full EstateMaster model and what shows instead');t(/lender/i.test(L.aud)&&!/murabaha/i.test(L.aud),'a lender on a USD model is not a “Murabaha lender”: '+L.aud)}
{const L=await p.evaluate(async()=>{const r=await designNewReport('Build me an LP quarterly update: our returns vs the LPs, the waterfall and distributions by year, max 8 slides','IM','Workspace');const d=JSON.stringify(buildDeck(r.k).slides)+reportDoc(r.k);
  return{k:r.k,name:RPTS[r.k].name,aud:RPTS[r.k].aud,lp:/LP IRR/.test(d)&&/GP promote/.test(d)}});
  t(L.name==='LP quarterly update'&&/LP/.test(L.aud),'a new report keeps the name and audience said: '+L.name+' / '+L.aud);t(L.lp,'the LP update holds the workbook’s LP IRR and GP promote');
  const rt=await p.evaluate(k=>['email the LP quarterly update to ir@example.com','schedule the LP quarterly update every quarter on the 5th at 9am','play the LP quarterly update'].map(q=>{const i=route(q).it||{};return[i.k,(i.o&&i.o.k)||i.kind]}),L.k);
  t(rt[0][0]==='sendreport'&&rt[1][0]==='schedule'&&rt[2][0]==='play'&&rt.every(z=>z[1]===L.k),'email, schedule and Play act on the custom report by its own name: '+JSON.stringify(rt))}
// the lender section carries the loan balance by period from the cash flow sheet, as a line, and the report headline uses the model's own name
await up('r21_ppp_gbp');{const L=await p.evaluate(async()=>{const x=latestExport();await xcCacheMore(x);const r=await designNewReport('New report for the senior lenders: debt, DSCR and LLCR','IM','Workspace');const d=buildDeck(r.k).slides;const ln=d.find(s=>s.kind==='line'&&/Debt balance|Loan balance/i.test(s.title));
  return{dr:x.debtRow&&x.debtRow.label,ln:ln&&ln.title,n:ln&&ln.values.length,head:(buildDeck('ic').slides.find(s=>s.kind==='gauges')||{items:[]}).items.map(i=>i.label)}});
  t(/Debt balance/i.test(L.dr||''),'the loan balance row is read from the cash flow sheet: '+L.dr);t(!!L.ln&&L.n>=20,'the lender pack shows the debt balance by period as a line: '+L.ln+' ('+L.n+' periods)');
  t(L.head.some(h=>/Equity IRR/.test(h)),'the report headline uses the model’s own name for its IRR: '+L.head.join(', '))}
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();
