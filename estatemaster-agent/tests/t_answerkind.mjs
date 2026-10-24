// The answer-kind family: every kind of answer a request can ask for (a figure, a what-if, a goal seek, a sensitivity, a hold-or-sell,
// a chart, a comparison across projects, the versions, a trace, a document's terms, a report, a covenant), generated over the uploaded
// models' own inputs with the kind known by construction, routed by the rules (no AI). Each prompt must be read as its kind, or say it
// is not answered (the honest "needs the AI"); a reading of another kind given in its place is the failure this family is about. The
// gate is probed where the reading is final (handle, after an uploaded workbook's rewrites), so no tool runs. AK_POOL=holdout uses
// phrasings never used while the classifier was written.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const HOLD=process.env.AK_POOL==='holdout';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1400,height:900}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
for(const f of ['office_k.xlsx','c43_jv_circ_sar.xlsx']){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/'+f);await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3500)}
const M=await p.evaluate(()=>{const xs=EXPORTS.filter(e=>e.src==='file');return xs.map(x=>({proj:x.proj,name:PROJECTS[x.proj].name.replace(/\s*[·(–-].*$/,'').trim(),ins:(x.inputs||[]).filter(i=>Number.isFinite(i.value)&&i.value).map(i=>({l:String(i.label).replace(/\s*·.*$/,''),v:i.value,pct:!!i.pct}))}))});
let seed=4949;const R=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};const pick=a=>a[Math.floor(R()*a.length)];
const fmt=i=>i.pct?(+(i.v*1.1).toFixed(2))+'%':Math.abs(i.v)<=1.5?String(+(i.v*1.1).toFixed(4)):Math.round(i.v*1.1).toLocaleString('en-GB');
// [kind(s) that count as read right, template]; P project, L/L2 inputs, v a value, n a number
const T0=[
 [['whatif'],(P,L,L2)=>`On ${P}: ${L.l} up 10%.`],[['whatif'],(P,L)=>`What if ${L.l.toLowerCase()} down 10% on ${P}?`],[['whatif'],(P,L)=>`${P}, ${L.l} ${fmt(L)}, what are the returns?`],[['whatif'],(P,L)=>`On ${P}: ${L.l} ${fmt(L)}.`],
 [['solve'],(P,L)=>`On ${P}, what ${L.l} gives a ${pick([10,12,15,18])}% levered IRR?`],[['solve'],(P,L)=>`On ${P}, what ${L.l} gives a net profit of zero?`],[['solve'],P=>`On ${P}, the residual land value for a 20% profit on cost.`],[['solve'],(P,L)=>`How far can ${L.l.toLowerCase()} fall on ${P} before the profit is zero?`],
 [['sensitivity'],P=>`What drives the levered IRR most on ${P}?`],[['sensitivity'],P=>`${P}: tornado on the levered IRR, every input by the same ±10%.`],[['sensitivity'],(P,L,L2)=>`On ${P}, a grid of ${L.l} against ${L2.l} on the levered IRR.`],[['sensitivity'],(P,L,L2)=>`On ${P}, a Monte Carlo of ${L.l} ±10% and ${L2.l} ±15%, 200 runs.`],[['sensitivity'],P=>`On ${P}, which assumptions matter most for the net profit?`],
 [['hold'],P=>`On ${P}, when should we sell: years 5 to 8?`],[['hold'],P=>`${P}: hold or sell, exits from year 6 to 10?`],
 [['chart'],P=>`Chart ${P}'s levered IRR by version.`],[['chart'],P=>`Chart the cash flow to equity of ${P}.`],[['chart','covenant'],P=>`Show ${P}'s loan balance year by year.`],
 [['compare'],()=>`Which project has the best levered IRR?`],[['compare'],()=>`Compare all projects in one table.`],
 [['versions'],P=>`Which versions of ${P} are kept?`],[['versions'],P=>`Compare the versions of ${P}.`],[['versions'],P=>`Why did ${P}'s levered IRR move from the uploaded model to now?`],
 [['trace'],P=>`Where does ${P}'s levered IRR come from?`],[['trace'],P=>`How is the net profit of ${P} calculated?`],
 [['document'],()=>`Quote the preferred return clause.`],[['document'],()=>`What does the lease say about the rent escalation?`],[['document'],()=>`Does the model comply with the agreement?`],[['document'],()=>`Set the margin as the term sheet says.`],[['document'],()=>`What is the LP net IRR with every difference corrected?`],[['document'],()=>`Which clause sets the profit rate?`],
 [['report'],P=>`Build the IC pack for ${P}.`],[['report'],P=>`Now the lender pack for ${P}.`],[['report'],P=>`Build the investor report for ${P}.`],
 [['covenant','chart'],P=>`On ${P}, the loan balance over time against a cap of 85 million.`],[['covenant'],()=>`Is the DSCR covenant met?`],
 [['figure'],P=>`What are ${P}'s headline returns?`],[['figure'],P=>`What is the levered IRR of ${P}?`],
];
// phrasings never used while the classifier was written: the measure of how far it reads beyond them
const T1=[
 [['whatif'],(P,L)=>`Run ${P} with ${L.l.toLowerCase()} 10% higher.`],[['whatif'],(P,L)=>`Bump ${L.l.toLowerCase()} by a tenth on ${P} and show me the IRR.`],[['whatif'],(P,L)=>`${P} — set ${L.l} at ${fmt(L)} and rerun.`],
 [['solve'],(P,L)=>`Find the ${L.l.toLowerCase()} that takes ${P} to a 14% levered IRR.`],[['solve'],(P,L)=>`How low can ${L.l.toLowerCase()} go on ${P} and still clear 12%?`],[['solve'],P=>`What can we afford to pay for the land on ${P} at a 20% margin?`],
 [['sensitivity'],P=>`Rank ${P}'s inputs by their impact on the IRR.`],[['sensitivity'],P=>`Which levers move ${P}'s returns the most?`],[['sensitivity'],(P,L,L2)=>`Two-way table on ${P}: ${L.l} vs ${L2.l}.`],
 [['hold'],P=>`What's the optimal exit year for ${P}?`],[['hold'],P=>`Should ${P} be sold in year 6 or held to year 9?`],
 [['chart'],P=>`Plot ${P}'s equity cash flows.`],[['chart'],P=>`Graph the debt balance on ${P}.`],
 [['compare'],()=>`Rank the projects by IRR.`],[['compare'],()=>`Side-by-side table of every deal.`],
 [['versions'],P=>`What changed between the versions of ${P}?`],[['versions'],P=>`List the saved versions for ${P}.`],
 [['trace'],P=>`Walk me through how ${P}'s IRR is built up.`],[['trace'],P=>`Explain where ${P}'s profit figure comes from.`],
 [['document'],()=>`What does the LPA say about the catch-up?`],[['document'],()=>`Is the model in line with the facility agreement?`],[['document'],()=>`Read me the escalation clause from the lease.`],
 [['report'],P=>`Prepare a board memo on ${P}.`],[['report'],P=>`Put together the lender report for ${P}.`],
 [['covenant'],P=>`Does ${P}'s LTV stay under 60% throughout?`],[['covenant'],P=>`Check ${P}'s DSCR against 1.25x.`],
 [['figure'],P=>`Give me ${P}'s key returns.`],[['figure'],P=>`What's ${P}'s equity multiple?`],
];
// a second pool, written before the vocabulary was extended from the first and run only after: the measure that stays fair
const T2=[
 [['whatif'],(P,L)=>`Model ${P} assuming ${L.l.toLowerCase()} comes in 15% below plan.`],[['whatif'],(P,L)=>`Re-run ${P} using ${L.l} of ${fmt(L)}.`],[['whatif'],(P,L)=>`Shock ${L.l.toLowerCase()} down 20% on ${P}.`],
 [['solve'],(P,L)=>`At what ${L.l.toLowerCase()} does ${P} hit a 16% levered IRR?`],[['solve'],(P,L)=>`Back-solve ${L.l.toLowerCase()} on ${P} for a 1.8x multiple.`],[['solve'],P=>`What's the maximum land price on ${P} for a 15% margin?`],
 [['sensitivity'],P=>`Sensitise ${P}'s IRR to its main inputs.`],[['sensitivity'],(P,L)=>`How sensitive is ${P} to ${L.l.toLowerCase()}?`],[['sensitivity'],P=>`Stress test ${P}'s key assumptions.`],
 [['hold'],P=>`Compare exiting ${P} in year 5 versus year 8.`],[['hold'],P=>`Is it better to sell ${P} early or hold it longer?`],
 [['chart'],P=>`Draw ${P}'s annual cash flow.`],[['chart'],P=>`Visualise the debt profile for ${P}.`],
 [['compare'],()=>`Line up all the deals on IRR and multiple.`],[['compare'],()=>`Which of our projects performs worst?`],
 [['versions'],P=>`Show me the change history of ${P}'s model.`],[['versions'],P=>`How does the latest version of ${P} differ from the first?`],
 [['trace'],P=>`Break down how ${P}'s net profit is derived.`],[['trace'],P=>`What feeds ${P}'s levered IRR?`],
 [['document'],()=>`Summarise the key terms in the term sheet.`],[['document'],()=>`Does the lease allow a rent-free period?`],[['document'],()=>`Align the model to the LPA.`],
 [['report'],P=>`Draft an investment memo for ${P}.`],[['report'],P=>`Generate the quarterly investor update for ${P}.`],
 [['covenant'],P=>`Will ${P} breach its DSCR covenant?`],[['covenant'],P=>`How much headroom is there on ${P}'s LTV limit?`],
 [['figure'],P=>`Remind me of ${P}'s IRR.`],[['figure'],P=>`What profit does ${P} make?`],
];
const TT=process.env.AK_POOL==='holdout2'?T2:HOLD?T1:T0;const prompts=[];
for(const m of M)for(const [kinds,f] of TT){const L=pick(m.ins),L2=pick(m.ins.filter(i=>i!==L));prompts.push({kinds,q:f(m.name,L,L2),proj:m.proj})}
await p.evaluate(()=>{const orig=kindGate;window.__kg=null;window.kindGate=(text,it)=>{const r=orig(text,it);const a=askedKind(text);window.__kg={k:it.k,tool:it.tool,got:intentKind(it),asked:[...a.kinds],must:a.must,fired:!!r};return{say:'(probe: stopped at the gate)',gap:'(probe)',asked:'',got:''}}});
const res={right:[],honest:[],wrong:[],before:[]};
for(const z of prompts){const r=await p.evaluate(async({q,proj})=>{if(PROJ.id!==proj)switchProject(proj);window.__kg=null;window.GAPS=[];window.ASKED=q;let o=null;try{o=await handle(q,'web','analyst')}catch(e){return{err:String(e&&e.message||e)}}return{kg:window.__kg,txt:String((o&&(o.plain||o.text))||'').slice(0,160)}},z);
  const kg=r.kg,tag=`“${z.q}” [${z.kinds}]`;
  if(r.err){res.wrong.push(`${tag}: crashed ${r.err}`);continue}
  if(!kg){if(/no replica model|needs an ai|cannot read this request|not answering/i.test(r.txt))res.honest.push(`${tag}: said not answered before the gate`);else res.before.push(`${tag}: answered before the gate: ${r.txt}`);continue}
  if(kg.fired||kg.got===null)res.honest.push(`${tag}: ${kg.k}${kg.tool?'/'+kg.tool:''} → not answered (asked ${kg.asked}${kg.must?' must '+kg.must:''})`);
  else if(z.kinds.includes(kg.got))res.right.push(tag);
  else res.wrong.push(`${tag}: read as ${kg.got} (${kg.k}${kg.tool?'/'+kg.tool:''}), asked read as [${kg.asked}]`)}
const n=prompts.length;
t(!res.wrong.length,`no request answered with another kind (${process.env.AK_POOL||'listed'} phrasings, ${n} prompts): ${res.wrong.length} wrong `+res.wrong.slice(0,12).join(' | '));
t(!res.before.length,`every request reaches the kind check: ${res.before.length} answered before it `+res.before.slice(0,6).join(' | '));
t(true,`read as asked ${res.right.length} of ${n}; said not answered ${res.honest.length} `+res.honest.slice(0,40).join(' | '));
t(!errs.length,'no page errors '+errs.slice(0,3).join(' | '));
console.log(ok.join('\n'));await b.close();process.exit(ok.some(z=>z.startsWith('FAIL'))?1:0);
