// Nightly live-AI evaluation: the app with a real AI behind it (the server's own proxy, api/llm.js, with the ANTHROPIC_API_KEY of the
// run), on the synthetic models whose answers LibreOffice gave (fixtures/golden/props.json). Two scores:
//  1. reading: each headline the model map names is the golden cell (levered vs unlevered vs an LP's figure, in every layout);
//  2. questions: each golden change asked in plain words ("If the exit cap rate is 7.50%, what are the IRRs?"), the answer must state
//     the IRRs LibreOffice gives, to two decimals.
// Without a key the run is skipped (exit 0). Fails when either score is below its bar (LIVEAI_BAR, default 0.9).
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
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
const S={read:[0,0],ask:[0,0]};const pc=v=>(v*100).toFixed(2)+'%';
for(const [f,g] of Object.entries(G)){if(f[0]==='_'||!g.key)continue;
  await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('em_map2','1')});await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f+'.xlsx');await p.waitForTimeout(2500);await p.click('#npCreate');
  for(let i=0;i<240;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}
  const cells=await p.evaluate(()=>{const x=latestExport();return{c:x.cells,by:x.map&&x.map.by}});
  for(const [k,c] of Object.entries(g.key)){const got=String(cells.c[k]||'').replace(/'/g,'');S.read[1]++;if(got===c)S.read[0]++;t(got===c,`${f}: ${k} read from ${c} (${cells.by}): got ${got||'—'}`)}
  const labs=await p.evaluate(cs=>{const x=latestExport();return cs.map(c=>{const i=(x.inputs||[]).find(i=>i.cell&&String(i.cell).replace(/'/g,'').replace(/\$/g,'')===c);return i?{label:String(i.label).replace(/\s*·.*$/,''),pct:!!i.pct}:null})},g.changes.map(c=>c[0][0]));
  for(let i=0;i<g.changes.length;i++){const [[cell,v],want]=g.changes[i],L=labs[i];if(!L)continue;const val=L.pct?(+(v*100).toFixed(4))+'%':v.toLocaleString('en-US');
    const q=`If ${L.label.replace(/[:\s]+$/,'')} is ${val}, what are the unlevered and levered IRRs?`;
    const o=await p.evaluate(async q=>{try{const r=await execute(q,'web','Investment Director',async()=>{});return String(r.out.plain||'')}catch(e){return 'THROW '+e.message}},q);
    const ok=want.every(w=>o.includes(pc(w)));S.ask[1]++;if(ok)S.ask[0]++;t(ok,`${f}: “${q}” → ${want.map(pc).join(', ')} expected: ${o.replace(/\s+/g,' ').slice(0,220)}`)}}
const rs=S.read[0]/Math.max(1,S.read[1]),as=S.ask[0]/Math.max(1,S.ask[1]);
console.log(`\nLIVE-AI SCORES: reading ${S.read[0]}/${S.read[1]} (${(rs*100).toFixed(0)}%), questions ${S.ask[0]}/${S.ask[1]} (${(as*100).toFixed(0)}%), bar ${(BAR*100).toFixed(0)}%`);
t(!errs.length,'no page errors: '+errs.join(' | '));await b.close();process.exit(rs>=BAR&&as>=BAR&&!errs.length?0:1);
