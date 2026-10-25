// Reporting leans on the AI for words, never for figures: every report gets an AI narrative when an AI is connected, and every number in
// that narrative must be one the report shows (a stand-in AI writes right and wrong numbers on purpose). And an AI provider out of
// credit is set aside: the rules answer at once, said once, and the provider is tried again when asked.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1400,height:900}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
let calls=0;
await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true}}'});calls++;
  return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'}})})});
await p.route('**/api/**',r=>r.fallback());
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/office_k.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3500);

// 1. the check itself, to the precision written
const U=await p.evaluate(()=>({
  round:narrCheck('A levered IRR of 7% and a net profit of USD 31M.','Levered IRR 7.17% · Net profit USD 31.14M').map(z=>z.s),
  exact:narrCheck('Net profit is USD 31.14M.','Net Profit USD 31.14M').map(z=>z.s),
  wrongPct:narrCheck('The IRR is 9.5%.','Levered IRR 7.17%').map(z=>z.s),
  pctNotMoney:narrCheck('A margin of 31.14%.','Net profit USD 31.14M').map(z=>z.s),
  words:narrCheck('Two paragraphs; 4 sentences in 2026.','Levered IRR 7.17%').map(z=>z.s)}));
t(!U.round.length&&!U.exact.length,'a number written to fewer decimals than the report shows is the report’s: '+JSON.stringify(U));
t(U.wrongPct.length===1&&U.pctNotMoney.length===1,'a number the report does not hold is caught, and a percent never matches an amount: '+JSON.stringify(U));
t(!U.words.length,'small counts and years are words, not figures: '+JSON.stringify(U.words));

// 2. a stand-in AI writes the narrative: right numbers stay, a wrong one twice is dropped with a note, a wrong one corrected on retry is used
const run=async(drafts)=>p.evaluate(async drafts=>{AI.keys.anthropic='sk-a';let i=0;window.complete=async()=>({text:drafts[Math.min(i++,drafts.length-1)],p:'anthropic',model:'claude-opus-5-5'});
  window.GAPS=[];RSEL='ic';const r=await postProcess('narrative',null,'deep');const n=NARRS.ic;return{text:n.text,note:n.note||'',asked:i,gaps:window.GAPS.slice()}},drafts);
const plainIRR=await p.evaluate(()=>{RSEL='ic';return RPTS.ic.fn().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')});
const irr=(plainIRR.match(/(\d+\.\d+)%/)||[])[1]||'7.17';
let n1=await run([`Summary: The scheme returns a levered IRR of ${irr}%. It is a small office.\nRationale: The returns hold.`]);
t(n1.text.includes(irr+'%')&&!n1.note&&n1.asked===1,'a narrative whose numbers the report shows is kept as written, asked once: '+JSON.stringify(n1).slice(0,240));
let n2=await run([`Summary: The levered IRR is ${irr}%. The IRR beats the 25.5% hurdle comfortably.\nRationale: Hold.`]);
t(!/25\.5%/.test(n2.text)&&n2.text.includes(irr+'%')&&/25\.5%/.test(n2.note)&&n2.asked===2&&n2.gaps.some(g=>/25\.5%/.test(g)),'a number the report does not hold, written again on retry, is left out with its sentence and said: '+JSON.stringify(n2).slice(0,300));
let n3=await run([`Summary: The IRR is 31.9%.\nRationale: Hold.`,`Summary: The levered IRR is ${irr}%.\nRationale: Hold.`]);
t(n3.text.includes(irr+'%')&&!/31\.9/.test(n3.text)&&!n3.note&&n3.asked===2,'a wrong number corrected on the one retry: the corrected draft is used: '+JSON.stringify(n3).slice(0,240));
const shown=await p.evaluate(()=>{RSEL='ic';renderReport();return(document.querySelector('#report')||document.body).textContent});
t(/checked against them/.test(shown),'the report says its narrative’s numbers are checked against its figures');

// 3. every report gets a narrative when an AI is connected (no template switch needed)
const made=await p.evaluate(async()=>{aiCreditRetry();AI.keys.anthropic='sk-a';   /* the stand-in API is out of credit for every call; the upload's own AI reading set it aside */window.complete=async()=>({text:'Summary: A lender view.\nRationale: Hold.',p:'anthropic',model:'claude-opus-5-5'});for(const k of Object.keys(NARRS))delete NARRS[k];
  const o=await handle('','web','analyst',{k:'report',kind:'lender'});o.fx();for(let i=0;i<40&&!NARRS.lender;i++)await new Promise(r=>setTimeout(r,100));return{has:!!NARRS.lender,opt:!!(RPTS.lender.opts&&RPTS.lender.opts.narrative),keys:Object.keys(NARRS),rsel:RSEL,api:apiOn(),k:o.plain&&o.plain.slice(0,80)}});
t(made.has,'a report built without the narrative switch still gets the AI narrative: '+JSON.stringify(made));
// only the user's own words turn it off: the designer's narrative switch is off by default, an explicit “no narrative” is not
const off=await p.evaluate(async()=>{const sp=t=>specFromAI({blocks:['wb_figures'],options:{narrative:false}},t).opts.noNarrative;const words={no:sp('Build the lender pack without a narrative.'),drop:sp('Remove the narrative from that report.'),with:sp('Add a narrative.'),plain:sp('Make it shorter.')};
  applySpec('lender',{opts:{noNarrative:true}},'test','test');RSEL='lender';renderReport();const shown=/Narrative \(AI draft\)/.test((document.querySelector('#report')||document.body).innerHTML);
  delete NARRS.lender;let asked=0;window.complete=async()=>{asked++;return{text:'Summary: x.',p:'anthropic',model:'m'}};rpNarrSoon('lender');await new Promise(r=>setTimeout(r,300));applySpec('lender',{opts:{noNarrative:false}},'test','test');return{words,shown,asked}});
t(off.words.no===true&&off.words.drop===true&&off.words.with===false&&off.words.plain===undefined&&!off.shown&&!off.asked,'an explicit “no narrative” turns it off (not shown, not written); any other request leaves it on: '+JSON.stringify(off));

// 4. out of credit: the first question tries the AI and falls back with a note; the next goes straight to the rules; asking again tries it
const ask=async q=>p.evaluate(async q=>{window.GAPS=[];const res=await execute(q,'web','analyst',async()=>{});return{kind:res.kind,gaps:window.GAPS.slice()}},q);
await p.evaluate(()=>{AI.keys={anthropic:'sk-a'};delete window.complete;aiCreditRetry()});calls=0;
const a1=await ask('What is the levered IRR?');const c1=calls;
const a2=await ask('What is the net profit?');const c2=calls-c1;
t(c1>=1&&a1.kind==='rules'&&a1.gaps.some(g=>/out of API credit/.test(g)),'the first question tries the AI, gets “out of credit” and the rules answer, said: '+JSON.stringify({c1,a1}).slice(0,240));
t(c2===0&&a2.kind==='rules'&&!a2.gaps.some(g=>/out of API credit/.test(g)),'the next question goes straight to the rules, no AI call and no repeated note: '+JSON.stringify({c2,a2}).slice(0,200));
await p.evaluate(()=>aiCreditRetry());const c3=calls;await ask('What is the levered IRR?');
t(calls>c3,'“try again” in Settings (or 15 minutes) sends the next question to the AI again');
t(!errs.length,'no page errors '+errs.slice(0,3).join(' | '));
console.log(ok.join('\n'));await b.close();process.exit(ok.some(z=>z.startsWith('FAIL'))?1:0);
