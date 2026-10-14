// t_fail — Failure states: every outside service fails one way (500, hang, network down), the main flows run, and nothing may stay stuck, blank or silent.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const url=process.argv[2]||'http://localhost:4090/?mode=readonly';const only=(process.argv[3]&&!/^(readonly|analyst|api)$/.test(process.argv[3]))?process.argv[3]:'';const OK=[];
const MODES={
  'llm-500':r=>/\/api\/llm/.test(r.request().url())&&r.request().method()==='POST'?r.fulfill({status:500,contentType:'application/json',body:'{"error":"upstream failed"}'}):null,
  'llm-hang':r=>/\/api\/llm/.test(r.request().url())&&r.request().method()==='POST'?new Promise(()=>{}):null,
  'llm-badjson':r=>/\/api\/llm/.test(r.request().url())&&r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{"content":[{"type":"text","text":"not json at all {"}]}'}):null,
  'all-api-500':r=>/\/api\//.test(r.request().url())?r.fulfill({status:500,contentType:'text/html',body:'<html>Internal Server Error</html>'}):null,
  'offline':r=>/\/api\//.test(r.request().url())?r.abort('internetdisconnected'):null,
};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
for(const [mode,fn] of Object.entries(MODES)){if(only&&mode!==only)continue;
  const p=await b.newPage({viewport:{width:1440,height:900}});if(mode==='llm-hang')await p.addInitScript(()=>{window.POST_LIMIT_MS=8000});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p.route('**/api/**',async r=>{if(/\/api\/llm/.test(r.request().url())&&r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});const x=fn(r);if(x)return x;return r.fulfill({status:404,body:''})});
  await p.goto(url);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  const issues=[];const stuck=async(where,ms)=>{await p.waitForTimeout(ms);const s=await p.evaluate(()=>{const vis=e=>!!(e.offsetParent||e.getClientRects().length);return{spin:[...document.querySelectorAll('.spin')].filter(vis).map(e=>(e.closest('[id]')||{}).id||e.parentElement.className).slice(0,4),est:[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&vis(e)&&/^(estimating…|thinking…|working…|loading…)$/i.test(e.textContent.trim())).map(e=>(e.closest('[data-fi],[id]')||{}).id||(e.closest('[data-fi]')||{}).dataset?.fi||e.className).slice(0,4)}});if(s.spin.length||s.est.length)issues.push(`${where}: still busy after ${ms/1000}s ${JSON.stringify(s)}`)};
  // 1. Daily feed: the impact estimates must resolve (or say why not)
  await p.evaluate(()=>showTab('appr'));await stuck('daily feed',mode==='llm-hang'?40000:12000);
  // 2. chat: a what-if and a free question get an answer or a clear error
  await p.evaluate(()=>toggleDock(true));for(const q of ['what if sale price drops 10%?','why is the levered IRR below the hurdle?']){const n0=await p.evaluate(()=>document.querySelectorAll('#msgs .msg.agent').length);await p.fill('#ask',q);await p.click('#send');await p.waitForTimeout(mode==='llm-hang'?30000:9000);
    const r=await p.evaluate(n0=>{const m=[...document.querySelectorAll('#msgs .msg.agent')];const last=m[m.length-1];return{n:m.length-n0,txt:last?last.innerText.replace(/\s+/g,' ').slice(0,140):''}},n0);if(r.n<1||!r.txt||/^\s*$/.test(r.txt))issues.push(`chat "${q}": no answer`);else if(/thinking|working on it/i.test(r.txt)&&r.txt.length<40)issues.push(`chat "${q}": stuck on "${r.txt}"`);else void(`   chat "${q.slice(0,24)}" → ${r.txt.slice(0,110)}`)}
  await p.evaluate(()=>toggleDock(false));
  // 3. upload an export: the debug must finish (done or stopped with a reason)
  const b64=fs.readFileSync(sp+'cfref/ref_export.xlsx').toString('base64');
  await p.evaluate(async b64=>{await loadXLSX();AI.keys.anthropic='';AI.keys.openai='';const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));uploadExport(new File([bin],'Reference Tower.xlsx'))},b64);
  await p.waitForTimeout(mode==='llm-hang'?40000:12000);const au=await p.evaluate(()=>{const x=latestExport();return{st:x.audit&&x.audit.status,err:x.audit&&x.audit.err,body:($('#dbgWBody')||{}).innerText?.slice(0,90)}});if(!au.st||au.st==='running')issues.push('upload debug: still running '+JSON.stringify(au));else void 0;
  // 4. stress tests and sensitivity table
  await p.evaluate(()=>{const w=document.getElementById('dbgWin');if(w)w.classList.remove('on');showTab('scen')});await p.waitForTimeout(300);try{await p.fill('#asX','construction cost');await p.fill('#asY','sale price');await p.click('#asGo')}catch(e){issues.push('sensitivity inputs: '+e.message.slice(0,60))}await stuck('sensitivity table',mode==='llm-hang'?40000:12000);
  // 5. deck with narration on
  await p.evaluate(()=>{const d=buildDeck('ic');openDeck(d)});await p.waitForTimeout(9000);const dk=await p.evaluate(()=>({i:KP&&KP.i,tap:!!document.querySelector('.kd-tap.on,.kd-needtap.on')}));await p.evaluate(()=>closeDeck());
  OK.push(`${issues.length||errs.length?'FAIL':'PASS'} | ${mode}: daily feed, chat, upload debug, sensitivity table and deck all finish with a clear outcome${issues.length?' — '+issues.join(' ; '):''}${errs.length?' — errors: '+[...new Set(errs)].slice(0,3).join(' | '):''}`);await p.close()}
console.log(OK.join('\n'));await b.close();
