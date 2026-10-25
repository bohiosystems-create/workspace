// The live-AI test on a budget: the app with a real Claude behind it (the server's own proxy, api/llm.js, Anthropic only: OpenAI is off
// for the run), asked prompts across what-ifs, sensitivities, reports and documents, each scored against LibreOffice's figures
// (fixtures/golden/props.json, sens2.json, aibudget.json) as right, flagged (the app said it could not, asked back, or marked a figure
// as not computed) or confidently wrong (figures stated, the right ones missing, nothing flagged); every call's cost is taken from the
// usage the API returns, at list prices, and charged to the prompt that caused it (uploads and document readings to set-up).
//  1. A one-call probe: a key without credit stops the run here, before anything is spent on prompts.
//  2. Calibration: 5 prompts, one or two of each kind, give the cost of a prompt of each kind.
//  3. The main run: as many prompts as the rest of the budget holds at the calibrated cost (AIB_MIN to AIB_MAX, default 25 to 35),
//     picked in turn across the kinds. The proxy refuses any call past the budget (AIB_BUDGET, dollars, default 12).
// Writes the per-prompt table to AIB_OUT (default aibudget.json) and a summary in markdown (to GITHUB_STEP_SUMMARY in CI).
// Without ANTHROPIC_API_KEY the run is skipped (exit 0). Exit 1 only when the run stopped (no credit, a crash); the scores are a report.
import {chromium} from 'playwright';import fs from 'fs';import {createRequire} from 'module';
if(!process.env.ANTHROPIC_API_KEY){console.log('SKIP | no ANTHROPIC_API_KEY: the budgeted live-AI test needs a key (a GitHub secret)');process.exit(0)}
delete process.env.OPENAI_API_KEY;   // Anthropic only: the page is told OpenAI has no key, and the proxy is never asked for it
const U=p=>new globalThis.URL(p,import.meta.url).pathname,F=U('./fixtures/models/'),D=U('./fixtures/docs/');
const PROPS=JSON.parse(fs.readFileSync(U('./fixtures/golden/props.json'),'utf8')),S2=JSON.parse(fs.readFileSync(U('./fixtures/golden/sens2.json'),'utf8')),AB=JSON.parse(fs.readFileSync(U('./fixtures/golden/aibudget.json'),'utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',BUDGET=+(process.env.AIB_BUDGET||12),NMIN=+(process.env.AIB_MIN||25),NMAX=+(process.env.AIB_MAX||35),OUT=process.env.AIB_OUT||'aibudget.json';
const llm=createRequire(import.meta.url)('../api/llm.js');
// list prices, dollars per million tokens: input, output, cache write (5 minutes), cache read
const PRICE={opus:[4,20,5,0.2],sonnet:[2,10,2.5,0.2],fable:[10,50,12.5,0.25]};const priceOf=m=>/sonnet/i.test(m)?PRICE.sonnet:/opus/i.test(m)?PRICE.opus:PRICE.fable;   // an unknown model is charged at the dearest
const costOf=(m,u)=>{const p=priceOf(m||'');return((u.input_tokens||0)*p[0]+(u.output_tokens||0)*p[1]+(u.cache_creation_input_tokens||0)*p[2]+(u.cache_read_input_tokens||0)*p[3])/1e6};
let spent=0,bucket='setup',inflight=0,lastDone=Date.now();const B={},calls=[];
const charge=(m,u)=>{const c=costOf(m,u);spent+=c;const z=B[bucket]||(B[bucket]={cost:0,calls:0,models:{}});z.cost+=c;z.calls++;z.models[m]=(z.models[m]||0)+1;calls.push({bucket,model:m,cost:c,u})};
// the usage of a reply: one JSON body, or a stream (message_start carries the input side, message_delta the output)
function usageOf(body,ct){const s=body.toString('utf8');if(/event-stream/.test(ct||'')){let m='',u={};for(const l of s.split('\n')){if(!l.startsWith('data:'))continue;let e;try{e=JSON.parse(l.slice(5))}catch(_){continue}
    if(e.type==='message_start'&&e.message){m=e.message.model||m;Object.assign(u,e.message.usage||{})}if(e.type==='message_delta'&&e.usage)for(const[k,v]of Object.entries(e.usage))if(v!=null)u[k]=v}return{m,u}}
  try{const j=JSON.parse(s);return{m:j.model||'',u:j.usage||{},err:j.error&&(j.error.message||j.error)}}catch(_){return{m:'',u:{}}}}
async function proxy(method,body){const req={method,headers:{'content-type':'application/json','x-forwarded-for':'127.0.0.1'},body,query:{}};let status=200;const hd={},chunks=[];
  const res={setHeader(k,v){hd[String(k).toLowerCase()]=String(v)},getHeader(k){return hd[String(k).toLowerCase()]},writeHead(s,h){status=s;Object.assign(hd,h||{})},write(c){chunks.push(Buffer.from(c))},flushHeaders(){},end(c){if(c)chunks.push(Buffer.from(c))},get statusCode(){return status},set statusCode(s){status=s}};
  await llm(req,res);return{status,hd,body:Buffer.concat(chunks)}}
const CREDIT=/credit balance is too low|out of (?:API )?credit|billing/i;let refused=0,openaiAsked=0,creditOut=false;

// 1. the probe
{const r=await proxy('POST',{provider:'anthropic',task:'answer',payload:{model:'claude-sonnet-5-5',max_tokens:16,messages:[{role:'user',content:'Reply with the word ok.'}]}});const {m,u,err}=usageOf(r.body,r.hd['content-type']);
  if(r.status!==200){const msg=String(err||r.body.toString('utf8')).slice(0,300);console.log(`STOPPED | the probe call failed (${r.status}): ${msg}`);
    fs.writeFileSync(OUT,JSON.stringify({stopped:CREDIT.test(msg)?'no credit':'probe failed',status:r.status,msg},null,1));
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Budgeted live-AI test: stopped before any prompt\n\nThe probe call failed (${r.status}): ${msg}\n`);process.exit(1)}
  bucket='probe';charge(m||'claude-sonnet-5-5',u);console.log(`probe: ${m} answered, $${spent.toFixed(4)}`)}

const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const errs=[];
async function newPage(jadwa){const ctx=await b.newContext({viewport:{width:1400,height:900}});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
  await p.route('**/api/llm',async r=>{const q=r.request();let body={};try{body=JSON.parse(q.postData()||'{}')}catch(e){}
    if(q.method()==='GET'){const o=await proxy('GET',{});return r.fulfill({status:o.status,headers:o.hd,body:o.body})}
    if(body.provider!=='anthropic'){openaiAsked++;return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'No server key for openai (off for this test).'})})}
    if(spent>=BUDGET){refused++;return r.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'Test budget reached: no more AI calls in this run.'})})}
    inflight++;try{const o=await proxy('POST',body);const {m,u,err}=usageOf(o.body,o.hd['content-type']);if(o.status===200)charge(m||(body.payload&&body.payload.model)||'',u);else if(CREDIT.test(String(err||'')))creditOut=true;
      return r.fulfill({status:o.status,headers:o.hd,body:o.body})}catch(e){return r.fulfill({status:500,body:String(e.message)})}finally{inflight--;lastDone=Date.now()}});
  await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('em_map2','1')});await p.reload();await p.waitForTimeout(1500);return p}
// the calls an answer sets off after it returns (the two audits) belong to that answer: wait until the proxy is quiet
async function settle(){const t0=Date.now();while(Date.now()-t0<120000){if(!inflight&&Date.now()-lastDone>4000)return;await new Promise(z=>setTimeout(z,500))}}
const PAGES={};
async function project(model){if(PAGES[model])return PAGES[model];bucket='setup:'+model;const jad=model==='r33_waha_sar';const p=await newPage(jad);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+model+'.xlsx');await p.waitForTimeout(2500);await p.click('#npCreate');
  for(let i=0;i<240;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}
  if(jad){await p.evaluate(async()=>{await xcEngine(latestExport())});await p.evaluate(()=>showTab('em'));await p.waitForTimeout(800);
    for(const [k,d] of [[1,'lease_waha.pdf'],[2,'termsheet_waha.pdf']]){await p.setInputFiles('#docFile',[D+d]);await p.waitForFunction(k=>(DOCS[PROJ.id]||[]).length>=k,k,{timeout:180000}).catch(()=>{})}}
  await settle();const labs=await p.evaluate(()=>{const x=latestExport();return (x.inputs||[]).filter(i=>i.cell).map(i=>({cell:String(i.cell).replace(/['$]/g,''),label:String(i.label).replace(/\s*·.*$/,'').replace(/[:\s]+$/,''),pct:!!i.pct}))});
  return PAGES[model]={p,labs}}
const pc=v=>+(v*100).toFixed(2);

// the prompts: kind, model, the words (built from the model's own labels where a label is needed), and what the answer must state
// want: {pct:[fractions]} every one stated as a percentage to the precision written; {re:[regex]} words or figures that must appear
const P=[];const add=(kind,model,q,want,id)=>P.push({id:id||kind[0]+(P.filter(z=>z.kind===kind).length+1),kind,model,q,want});
const W=(model,ci,phr)=>{const g=PROPS[model],[[cell,v],w]=g.changes[ci],ks=Object.fromEntries(Object.entries(g.key).map(([k,c])=>[c.replace(/'/g,''),k]));
  const want=w.filter((_,j)=>['unlevered_irr','levered_irr'].includes(ks[g.read[j].replace(/'/g,'')]));add('what-if',model,{cell,v,phr},{pct:want})};
const SP=a=>({pct:a});
// calibration (5): two what-ifs, a sensitivity, a report, a document
W('r22_dc_usd',0,1);add('sensitivity','sens2_sar','Run a sensitivity of the levered IRR to construction cost at SAR 540m, 570m, 600m, 630m and 660m.',SP(['540000000.0','570000000.0','600000000.0','630000000.0','660000000.0'].map(k=>S2.cost[k])));
add('report','r41_hotel_aed','Prepare a board memo on this project, with its returns.',SP(PROPS.r41_hotel_aed.base));add('document','r33_waha_sar','What does the lease say about rent escalation, and does the model use the same rate?',{pct:[0.04,0.03]});W('r38_stnl_usd',2,0);
const CAL=P.length;
// the main pool, in the order it is drawn across the kinds
W('r41_hotel_aed',0,1);W('r43_btr_sar',1,0);W('r45_datacenter_usd',0,1);W('r42_office_gbp',0,0);W('r46_stnl_qsr_aed',1,1);W('r20_refi_usd',0,0);W('r40_offplan_sar',0,1);W('r22_dc_usd',1,0);W('r39_fund_waterfall_eur',0,1);W('r43_btr_sar',3,1);W('r41_hotel_aed',1,0);
add('sensitivity','sens2_sar','How does the levered IRR move with the exit yield from 6.5% to 7.5% in 25 bp steps?',SP(['0.065','0.0675','0.07','0.0725','0.075'].map(k=>S2.yield[k])));
add('sensitivity','sens2_sar','Two-way grid of the levered IRR: base rent per sqm at 120, 150 and 180 against exit yield at 6.5%, 7% and 7.5%.',SP([120,150,180].flatMap(r=>['0.065','0.07','0.075'].map(y=>S2.grid[r+'|'+y]))));
add('sensitivity','sens2_sar','At what construction cost does the debt cap start to bind?',{re:[/572[.,]\d|572\s*(?:m|million)/i]});
add('sensitivity','sens2_sar','The full downside: rent down 10%, exit yield up 50 bps and construction cost up 10% together. What is the levered IRR, and what does each move do on its own?',SP([S2.joint_down,...S2.joint_solo]));
add('sensitivity','sens2_sar','What is the levered IRR on the Downside case?',SP([S2.downside_case]));
add('sensitivity','sens2_sar','What is the levered IRR if we exit in year 6, 7, 9 or 10 instead of year 8?',SP(['6','7','9','10'].map(k=>S2.exit[k])));
add('sensitivity','sens2_sar','At what base rent per sqm does the DSCR cash trap start to bite?',{re:[/\b130(?:[.,]0+)?\b/]});
add('sensitivity','sens2_sar','Professional fees at 7.2% and at 8.8% of construction cost: what is the levered IRR in each case?',SP([S2.fees['0.072'],S2.fees['0.088']]));
add('report','r22_dc_usd','Build the IC pack for this project.',SP(PROPS.r22_dc_usd.base));
add('report','r38_stnl_usd','Put together the lender report for this project.',SP(PROPS.r38_stnl_usd.base));
add('report','sens2_sar','Write the investor report for this project, with a sensitivity of the levered IRR to construction cost at SAR 540m and 660m.',SP([S2.base,S2.cost['540000000.0'],S2.cost['660000000.0']]));
add('report','r43_btr_sar','Draft an investment memo for the board on this project.',SP(PROPS.r43_btr_sar.base));
add('report','r33_waha_sar','Prepare an IC memo on this project that sets the lease and term sheet terms against the model.',{pct:[...AB.base,0.04,0.065]});
add('document','r33_waha_sar','Does the term sheet margin match the interest rate in the model?',{pct:[0.065,0.06]});
add('document','r33_waha_sar','Apply the lease escalation to the model: what are the unlevered and levered IRRs?',SP(AB.escalation_4));
add('document','r33_waha_sar','If the interest rate followed the term sheet, what would the levered IRR be?',SP([AB.margin_65[1]]));
add('document','r33_waha_sar','What is the minimum DSCR in the term sheet, and what covenant does the model use?',{re:[/1\.30?\s*x|1\.30?\b/i,/1\.25/]});
add('document','r33_waha_sar','How long is the rent-free period in the lease?',{re:[/\b6\s*months|six(?:\s*\(6\))?\s*months/i]});
add('document','r33_waha_sar','What is the maximum LTV in the term sheet, and does the model assume the same?',{pct:[0.6]});
// a director's words or the model's own label for a what-if
function words(z,labs){const L=labs.find(l=>l.cell===z.q.cell);if(!L)return null;const val=L.pct?(+(z.q.v*100).toFixed(4))+'%':z.q.v.toLocaleString('en-US');
  return z.q.phr?`What do the returns look like with ${L.label.toLowerCase()} at ${val}? Give me both IRRs.`:`If ${L.label} is ${val}, what are the unlevered and levered IRRs?`}

const FLAG=/not computed|not as asked|could not|cannot|can't|unable|not answer|needs? (?:the|an) ai|no ai|before (?:I|the workbook is) recalculat|reply with|which (?:one|of (?:these|them))|one answer from you|please confirm|\bestimate\b|not (?:in|found in) the (?:model|workbook)|left out/i;
const ASKED=/one answer from you|before (?:I|the workbook is) recalculat|(?:choice )?buttons? (?:below|under)|Reply with:|which one should|which of (?:these|them)/i;
function score(z,o){const t=o.replace(/⟦[^⟧]*⟧/g,'');const nums=[...t.matchAll(/(-?\d+(?:\.(\d+))?)\s*%/g)].map(m=>({n:parseFloat(m[1]),d:(m[2]||'').length}));
  const hit=w=>nums.some(x=>Math.abs(x.n-w*100)<=(x.d>=2?0.006:x.d===1?0.051:0.51));
  const miss=[...(z.want.pct||[]).filter(w=>!hit(w)).map(w=>pc(w)+'%'),...(z.want.re||[]).filter(r=>!r.test(t)).map(r=>String(r))];
  const flagged=FLAG.test(t)||/^THROW/.test(o);const figures=nums.length>0||/\d/.test(t);
  return{miss,verdict:!miss.length&&!/Not computed/.test(t)?'right':flagged||!figures?'flagged':'confidently wrong'}}   // the right figure marked by the app as not computed (an AI's own guess) is not right

const R=[];
async function run(z){if(spent>=BUDGET){R.push({...z,verdict:'not run (budget)',cost:0});return}
  const {p,labs}=await project(z.model);let q=typeof z.q==='string'?z.q:words(z,labs);if(!q){R.push({...z,q:JSON.stringify(z.q),verdict:'not run (no label for the cell)',cost:0});return}
  bucket=z.id;const t0=Date.now();const ask=q=>p.evaluate(async q=>{try{const r=await Promise.race([execute(q,'web','Investment Director',async()=>{}),new Promise((_,j)=>setTimeout(()=>j(new Error('no answer in 6 minutes')),360000))]);
      const o=r.out||{};const h=String((o.html||'')+(o.keep||'')).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ');
      return{txt:[r.final,o.plain,h].filter(Boolean).join('\n').replace(/[ \t]+/g,' '),lane:r.r&&r.r.lane,kind:r.kind}}catch(e){return{txt:'THROW '+e.message}}},q);
  let a=await ask(q),asked=false;
  if(z.kind==='what-if'&&ASKED.test(a.txt)){asked=true;a=await ask(`Change ${z.q.cell} only (the cell the model runs on), to ${z.q.v}.`)}   // answered once, as a user would, naming the cell
  await settle();const s=score(z,a.txt),c=(B[z.id]||{cost:0}).cost;
  R.push({id:z.id,kind:z.kind,model:z.model,q,verdict:creditOut?'not run (credit ran out)':s.verdict,miss:s.miss,asked,cost:c,calls:(B[z.id]||{}).calls||0,models:(B[z.id]||{}).models||{},secs:Math.round((Date.now()-t0)/1000),lane:a.lane,kind_ans:a.kind,answer:a.txt.slice(0,4000)});
  const r=R[R.length-1];console.log(`${r.verdict.toUpperCase().padEnd(17)} | ${r.id} ${r.kind} ${r.model} $${c.toFixed(3)} ${r.secs}s | ${q}${r.miss.length?' | missing '+r.miss.join(', '):''} | ${a.txt.replace(/\s+/g,' ').slice(0,240)}`)}

let stopped=null;
try{
  console.log(`budget $${BUDGET}; calibration: ${CAL} prompts`);for(const z of P.slice(0,CAL)){await run(z);if(creditOut)throw new Error('the API key ran out of credit during the run')}
  const avg={};for(const k of ['what-if','sensitivity','report','document']){const xs=R.filter(r=>r.kind===k&&r.cost>0).map(r=>r.cost);avg[k]=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
  const all=R.filter(r=>r.cost>0).map(r=>r.cost),mean=all.reduce((a,b)=>a+b,0)/Math.max(1,all.length);for(const k in avg)if(avg[k]==null)avg[k]=mean;
  // the set-up of a model not yet open is charged too: the calibration's mean set-up
  const sets=Object.entries(B).filter(([k])=>k.startsWith('setup:')).map(([,v])=>v.cost),setup=sets.reduce((a,b)=>a+b,0)/Math.max(1,sets.length);
  const pool=P.slice(CAL),byKind=k=>pool.filter(z=>z.kind===k),order=[];const qs=['what-if','sensitivity','report','document'].map(byKind);
  for(let i=0;order.length<pool.length;i++)for(const q of qs)if(q[i])order.push(q[i]);   // in turn across the kinds
  let left=BUDGET-spent,pick=[];const opened=new Set(Object.keys(PAGES));for(const z of order){const est=avg[z.kind]*1.15+(opened.has(z.model)?0:setup);if(pick.length>=NMAX||est>left*0.95)continue;pick.push(z);left-=est;opened.add(z.model)}
  console.log(`calibration: $${spent.toFixed(2)} spent; per prompt ${Object.entries(avg).map(([k,v])=>k+' $'+v.toFixed(3)).join(', ')}; set-up per model $${setup.toFixed(3)}`);
  console.log(`main run: ${pick.length} prompts (${['what-if','sensitivity','report','document'].map(k=>k+' '+pick.filter(z=>z.kind===k).length).join(', ')})${pick.length<NMIN?` — fewer than ${NMIN}: the budget holds no more at the calibrated cost`:''}`);
  const seq=[...new Set(pick.map(z=>z.model))].flatMap(m=>pick.filter(z=>z.model===m));   // one model at a time, so each is opened once
  for(const z of seq){await run(z);if(creditOut)throw new Error('the API key ran out of credit during the run')}
}catch(e){stopped=String(e&&e.message||e);console.log('STOPPED | '+(e&&e.stack||e))}
await b.close();

const done=R.filter(r=>/^(right|flagged|confidently wrong)$/.test(r.verdict)),cnt=v=>done.filter(r=>r.verdict===v).length,setupCost=Object.entries(B).filter(([k])=>/^setup|^probe/.test(k)).reduce((a,[,v])=>a+v.cost,0);
const kinds=['what-if','sensitivity','report','document'],row=k=>{const xs=done.filter(r=>r.kind===k),c=xs.reduce((a,r)=>a+r.cost,0);return`| ${k} | ${xs.length} | ${xs.filter(r=>r.verdict==='right').length} | ${xs.filter(r=>r.verdict==='flagged').length} | ${xs.filter(r=>r.verdict==='confidently wrong').length} | $${c.toFixed(2)} | $${(c/Math.max(1,xs.length)).toFixed(3)} |`};
const md=[`### Budgeted live-AI test (Anthropic only, budget $${BUDGET})`,'',stopped?`**Stopped:** ${stopped}\n`:'',
  `${done.length} prompts scored (${R.filter(r=>r.id&&P.findIndex(z=>z.id===r.id)<CAL).length} calibration): **${cnt('right')} right, ${cnt('flagged')} flagged, ${cnt('confidently wrong')} confidently wrong**. Spent $${spent.toFixed(2)} ($${setupCost.toFixed(2)} on the probe, model uploads and document readings). OpenAI calls refused: ${openaiAsked}; calls refused at the budget: ${refused}; page errors: ${errs.length}.`,'',
  '| kind | prompts | right | flagged | confidently wrong | cost | per prompt |','|---|---|---|---|---|---|---|',...kinds.map(row),'',
  '| # | kind | model | prompt | verdict | missing | cost | calls | s |','|---|---|---|---|---|---|---|---|---|',
  ...R.map(r=>`| ${r.id} | ${r.kind} | ${r.model} | ${String(r.q).replace(/\|/g,'/')} | ${r.verdict}${r.asked?' (asked back)':''} | ${(r.miss||[]).join(', ')} | $${(r.cost||0).toFixed(3)} | ${r.calls||0} | ${r.secs||''} |`)].join('\n');
fs.writeFileSync(OUT,JSON.stringify({budget:BUDGET,spent,setupCost,openaiAsked,refused,stopped,errs,buckets:B,results:R},null,1));
console.log('\n'+md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
process.exit(stopped?1:0);
