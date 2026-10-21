// Documents as a source (the Jadwa edition): a lease and a term sheet are read into terms, each proved by its own quote on the page,
// matched to the workbook's input cells, applied as an exact what-if whose version keeps the provenance, shown in the report and
// answered from the chat. The AI is mocked: its reading is built from the fixture's own text. Synthetic fixtures only.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();
await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
const LEASE=[['rent','Annual base rent',30000000,'SAR','annual base rent of SAR 30,000,000',1],['escalation','Rent escalation',4,'%','escalate by 4% per annum',1],['lease_term','Lease term',10,'years','a term of ten (10) years',1],['rent_free','Rent-free period',6,'months','rent-free period of 6 months',2],['other','Operating cost cap',20,'% of rent','operating costs are capped at 20% of the rent',2]];
const TS=[['margin','Profit margin',6.5,'%','margin of 6.5% per annum',1],['ltv','Maximum LTV',60,'%','maximum LTV of 60%',1],['other','Minimum DSCR',1.3,'x','minimum DSCR of 1.30x',1]];
await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
  let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,sys=String(pl.system||(pl.messages&&pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u=String(((pl.messages||[]).filter(m=>m.role==='user').pop()||{}).content||'');
  let t='{}';
  if(/You read a real estate document/.test(sys)){const items=(/LEASE AGREEMENT/.test(u)?LEASE:TS).map(([kind,label,value,unit,quote,page])=>({kind,label,value,unit,quote,page}));t=JSON.stringify({doc_type:/LEASE AGREEMENT/.test(u)?'lease':'term sheet',title:'Al Waha',date:'2026',parties:'Al Waha Development Company',items})}
  else if(/You read a sentence/.test(sys)){const sent=(u.match(/Sentence: (.*)$/m)||[])[1]||'';const lines=u.split('\n').filter(l=>/\|/.test(l));const pick=re=>lines.find(l=>re.test(l.split('|')[0]));const line=/base rent/i.test(sent)?pick(/stabilised rent/i):/escalation/i.test(sent)?pick(/rent growth/i):/lease term/i.test(sent)?pick(/hold period/i):/margin/i.test(sent)?pick(/interest rate/i):/ltv/i.test(sent)?pick(/ltv covenant/i):/operating/i.test(sent)?pick(/operating costs/i):null;
    const m=sent.match(/to ([\d.,]+)/);const val=m?+m[1].replace(/,/g,''):NaN;t=JSON.stringify({changes:line?[{label:line.split('|')[0].trim(),cell:line.split('|')[1].trim(),kind:/%/.test(line.split('|')[2]||'')?'to':'to',value:val,sure:true}]:[]})}
  else if(/You audit an exact/.test(sys))t='{"verdict":"agree","why":"ok","results":[]}';
  const oa=/openai/.test(r.request().url())||body.provider==='openai';r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})})});
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,320):''))};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r33_waha_sar.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:40000});await p.click('#npCreate');await p.waitForTimeout(3500);
await p.evaluate(async()=>{await xcEngine(latestExport())});await p.evaluate(()=>showTab('em'));await p.waitForTimeout(800);
ok(await p.evaluate(()=>!document.querySelector('#docCard').hidden),'the Documents card shows on the modelling page of an uploaded workbook (Jadwa edition)');
await p.setInputFiles('#docFile',[D+'lease_waha.pdf']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===1,null,{timeout:60000}).catch(()=>{});
let docs=await p.evaluate(()=>DOCS[PROJ.id]||[]);let it=docs[0]&&docs[0].items||[];
ok(docs.length===1&&docs[0].pages===2&&docs[0].type==='lease','the lease PDF is read page by page',JSON.stringify({n:docs.length,pages:docs[0]&&docs[0].pages}));
ok(it.length===5&&it.every(z=>z.proved),'every term’s quote is found verbatim on the page it names',JSON.stringify(it.map(z=>[z.label,z.page,z.proved])));
const rent=it.find(z=>z.kind==='rent'),esc=it.find(z=>z.kind==='escalation');
ok(rent&&rent.cell==='Inputs!B4'&&/matches/.test(rent.status),'the base rent is matched to Inputs!B4 and matches the model',JSON.stringify(rent));
ok(esc&&esc.cell==='Inputs!B5'&&/differs/.test(esc.status),'the 4% escalation is matched to Rent growth (3%) and marked as differing',JSON.stringify(esc));
ok(it.find(z=>z.kind==='other'&&/operating/i.test(z.label)).status==='not an input'||it.find(z=>z.kind==='other'&&/operating/i.test(z.label)).cell,'a term the model has no input for is said so',JSON.stringify(it.find(z=>z.kind==='other')));
// apply the escalation: an exact what-if, the version keeps the document, page and quote
const ei=it.indexOf(esc);await p.evaluate(sel=>document.querySelector(sel).click(),`[data-docapply="${docs[0].id}:${ei}"]`);await p.waitForFunction(()=>{const x=latestExport();return (MVERS[PROJ.id]||[]).some(v=>!v.base&&v.ex===x.id&&v.src)},null,{timeout:90000}).catch(()=>{});
const v=await p.evaluate(()=>{const x=latestExport();return (MVERS[PROJ.id]||[]).filter(z=>!z.base&&z.ex===x.id).pop()||null});
ok(v&&v.src&&v.src.doc==='lease_waha.pdf'&&v.src.page===1&&/4%/.test(v.src.quote)&&/per lease_waha\.pdf/.test(v.label)&&Number.isFinite((v.out||{}).levered_irr),'applied as an exact what-if; the version records the document, page and quote',JSON.stringify(v&&{label:v.label,src:v.src,irr:v.out&&v.out.levered_irr}));
const flow=await p.evaluate(()=>(MVERS[PROJ.id]||[]).filter(z=>!z.base).map(z=>z.out&&z.out.levered_irr));
ok(flow.length&&Math.abs(flow[flow.length-1]-15.343)>0.05,'the recalculated IRR moved from the uploaded 15.34% (rent growth 3% → 4%)',JSON.stringify(flow));
// the term sheet: a second document, the margin differs (6.5% against 6%)
await p.setInputFiles('#docFile',[D+'termsheet_waha.pdf']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===2,null,{timeout:60000}).catch(()=>{});
docs=await p.evaluate(()=>DOCS[PROJ.id]||[]);const ts=docs[1]&&docs[1].items||[];const mg=ts.find(z=>z.kind==='margin');
ok(docs.length===2&&mg&&mg.cell==='Inputs!B10'&&/differs/.test(mg.status),'the term sheet’s 6.5% margin is matched to the interest rate (6%) and differs',JSON.stringify(mg));
// the report block and the chat
const rep=await p.evaluate(()=>{RPTS.zz={name:'Deal evidence',aud:'IC',blocks:['wb_documents','wb_whatifs']};return reportDoc('zz')});
ok(/Terms from the documents/.test(rep)&&/lease_waha\.pdf/.test(rep)&&/escalate by 4% per annum/.test(rep)&&/Inputs!B5/.test(rep)&&/termsheet_waha\.pdf/.test(rep),'the report carries every term with its quote, page, model cell and status',rep.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,200));
ok(/per lease_waha\.pdf p\.1/.test(rep),'the what-if list names the document the change came from');
const a=await p.evaluate(async()=>{const o=await handle('What does the lease say about escalation?','web','Investment Director');return o.plain||''});
ok(/4/.test(a)&&/escalate by 4% per annum/.test(a)&&/lease_waha\.pdf, p\.1/.test(a),'the chat answers from the document with the quote and the page',a.slice(0,300));
const a2=await p.evaluate(async()=>{const o=await handle('what does the term sheet say','web','Investment Director',{k:'docq',q:'what does the term sheet say'});return o.plain||''});
ok(/6\.5/.test(a2)&&/termsheet_waha\.pdf/.test(a2),'the tool route answers too',a2.slice(0,200));
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
