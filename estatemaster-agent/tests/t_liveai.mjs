// Nightly live-AI evaluation: the app with a real AI behind it (the server's own proxy, api/llm.js, with the ANTHROPIC_API_KEY of the
// run), on the synthetic models whose answers LibreOffice gave (fixtures/golden/props.json). Three scores:
//  1. reading: each headline the model map names is the golden cell (levered vs unlevered vs an LP's figure, in every layout);
//  2. questions: each golden change asked in two phrasings (the model's own label, and a director's words); the answer must state the
//     IRRs LibreOffice gives, to two decimals, and must name the cell the change belongs in (which cell the AI picked).
// Without a key the run is skipped (exit 0). Fails when any score is below its bar (LIVEAI_BAR, default 0.9).
import {chromium} from 'playwright';import fs from 'fs';import {createRequire} from 'module';
if(!process.env.ANTHROPIC_API_KEY){console.log('SKIP | no ANTHROPIC_API_KEY: the live-AI evaluation needs a key (a GitHub secret)');process.exit(0)}
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/props.json',import.meta.url).pathname,'utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',BAR=+(process.env.LIVEAI_BAR||0.9);
const llm=createRequire(import.meta.url)('../api/llm.js');
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
// the page's AI calls go to the real proxy, run here as the server runs it
await p.route('**/api/llm',async r=>{const q=r.request();let body={};try{body=JSON.parse(q.postData()||'{}')}catch(e){}
  const req={method:q.method(),headers:{...q.headers(),'x-forwarded-for':'127.0.0.1'},body,query:{}};let status=200;const hd={},chunks=[];
  const res={setHeader(k,v){hd[String(k).toLowerCase()]=String(v)},getHeader(k){return hd[String(k).toLowerCase()]},writeHead(s,h){status=s;Object.assign(hd,h||{})},write(c){chunks.push(Buffer.from(c))},flushHeaders(){},end(c){if(c)chunks.push(Buffer.from(c));this.done=true},
    get statusCode(){return status},set statusCode(s){status=s}};
  try{await llm(req,res)}catch(e){return r.fulfill({status:500,body:String(e.message)})}
  return r.fulfill({status,headers:hd,body:Buffer.concat(chunks)})});
const CI=!!process.env.GITHUB_ACTIONS,note=(lvl,m)=>{if(CI)console.log(`::${lvl}::${String(m).replace(/%/g,'%25').replace(/\r/g,'').replace(/\n/g,'%0A').slice(0,900)}`)};   // GitHub shows these as annotations on the run
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:(fail++,note('warning',m))};
const S={read:[0,0],ask:[0,0],cell:[0,0]};const pc=v=>(v*100).toFixed(2)+'%';
try{
let ONLY=(process.env.LIVEAI_MODELS||'').split(',').filter(Boolean);   // optional: a comma list of model names, for a quick run
if(!ONLY.length&&process.env.LIVEAI_PER_FAMILY){const seen=new Set();ONLY=Object.entries(G).filter(([f,g])=>f[0]!=='_'&&g.key&&g.family&&!seen.has(g.family)&&seen.add(g.family)).map(([f])=>f)}   // the nightly run: one model of each family (the full set is run on demand)
console.log('models: '+(ONLY.length?ONLY.join(', '):'all'));
for(const [f,g] of Object.entries(G)){if(f[0]==='_'||!g.key||(ONLY.length&&!ONLY.includes(f)))continue;
  await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('em_map2','1')});await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f+'.xlsx');await p.waitForTimeout(2500);await p.click('#npCreate');
  for(let i=0;i<240;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}
  const cells=await p.evaluate(()=>{const x=latestExport();return{c:x.cells,by:x.map&&x.map.by}});
  for(const [k,c] of Object.entries(g.key)){const got=String(cells.c[k]||'').replace(/'/g,'');S.read[1]++;if(got===c)S.read[0]++;t(got===c,`${f}: ${k} read from ${c} (${cells.by}): got ${got||'—'}`)}
  const labs=await p.evaluate(cs=>{const x=latestExport();return cs.map(c=>{const i=(x.inputs||[]).find(i=>i.cell&&String(i.cell).replace(/'/g,'').replace(/\$/g,'')===c);return i?{label:String(i.label).replace(/\s*·.*$/,''),pct:!!i.pct}:null})},g.changes.map(c=>c[0][0]));
  for(let i=0;i<g.changes.length;i++){const [[cell,v],wantAll]=g.changes[i],L=labs[i];if(!L)continue;
    const norm=z=>String(z).replace(/['$]/g,''),ks=Object.fromEntries(Object.entries(g.key).map(([k,c2])=>[norm(c2),k])),want=wantAll.filter((w,j)=>['unlevered_irr','levered_irr'].includes(ks[norm(g.read[j])]));   // only the IRRs the question asks for
    if(!want.length)continue;const val=L.pct?(+(v*100).toFixed(4))+'%':v.toLocaleString('en-US');
    const lab=L.label.replace(/[:\s]+$/,''),cellN=norm(cell).toLowerCase();
    // two phrasings of the same change: the model's own label, and the way a director would say it
    for(const q of [`If ${lab} is ${val}, what are the unlevered and levered IRRs?`,`What do the returns look like with ${lab.toLowerCase()} at ${val}? Give me both IRRs.`]){
      let o=await p.evaluate(async q=>{try{const r=await execute(q,'web','Investment Director',async()=>{});return String((r.out&&r.out.plain)||r.final||'')}catch(e){return 'THROW '+e.message}},q);   // an AI-routed answer is `final`, a rules answer `out.plain`
      // a question back (which of several inputs, which case) is the app not assuming: answered as a user would, naming the cell, then scored
      if((/one answer from you|before (?:I|the workbook is) recalculat|(?:choice )?buttons? (?:below|under)|Reply with:|which one should|which of (?:these|them)/i.test(o))||(!/-?\d+(?:\.\d+)?\s*%/.test(o.replace(/⟦[^⟧]*⟧/g,''))&&/\?|which|confirm/i.test(o))){   /* the app's own question words, even when the question quotes the cases' percentages */S.asked=(S.asked||0)+1;o=await p.evaluate(async q=>{try{const r=await execute(q,'web','Investment Director',async()=>{});return String((r.out&&r.out.plain)||r.final||'')}catch(e){return 'THROW '+e.message}},`Change ${cell} only (the cell the model runs on), to ${val}.`)}
      if(/out of API credit|credit balance is too low|billing/i.test(o))throw new Error('the API key has no credit left (Anthropic billing): add credit in the Claude Console and run again; the scores so far are not a measure of the app');   // an outage is not a wrong answer
      const nums=[...o.replace(/⟦[^⟧]*⟧/g,'').matchAll(/-?\d+(?:\.\d+)?\s*%/g)].map(m=>parseFloat(m[0]));   // every percentage the answer states
      const ok=want.every(w=>nums.some(n=>Math.abs(n-w*100)<=0.006))&&!/Not computed/.test(o);   /* the right figure stated but flagged by the app as not computed (an AI's own guess) is not a pass */S.ask[1]++;if(ok)S.ask[0]++;t(ok,`${f}: “${q}” → ${want.map(pc).join(', ')} expected: ${o.replace(/\s+/g,' ').slice(0,220)}`);
      const hit=norm(o).toLowerCase().includes(cellN);S.cell[1]++;if(hit)S.cell[0]++;t(hit,`${f}: “${q}” changes ${cell}: ${hit?'yes':'the answer names another cell or none'}`)}}}
}catch(e){note('error','live-AI run stopped: '+(e&&e.stack||e));console.log('STOPPED | '+(e&&e.stack||e));fail++}
const rs=S.read[0]/Math.max(1,S.read[1]),as=S.ask[0]/Math.max(1,S.ask[1]),cs=S.cell[0]/Math.max(1,S.cell[1]);
note('notice',`questions back answered: ${S.asked||0}; reading ${S.read[0]}/${S.read[1]}, figures ${S.ask[0]}/${S.ask[1]}, cell chosen ${S.cell[0]}/${S.cell[1]}, page errors ${errs.length}`);console.log(`\nLIVE-AI SCORES: reading ${S.read[0]}/${S.read[1]} (${(rs*100).toFixed(0)}%), figures ${S.ask[0]}/${S.ask[1]} (${(as*100).toFixed(0)}%), cell chosen ${S.cell[0]}/${S.cell[1]} (${(cs*100).toFixed(0)}%), bar ${(BAR*100).toFixed(0)}%`);
t(!errs.length,'no page errors: '+errs.join(' | '));await b.close();process.exit(rs>=BAR&&as>=BAR&&cs>=BAR&&!errs.length?0:1);
