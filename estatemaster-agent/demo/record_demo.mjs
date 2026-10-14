// Records the 30-second demo: upload → agents debug the model → a what-if in the chat (exact) → stress tables → the board deck. Captions name each step.
import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';import fs from 'fs';
const sp='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/';const out=sp+(process.env.RECDIR||'rec')+'/';fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const url=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const VID0=Date.now();const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}},deviceScaleFactor:1});const p=await ctx.newPage();
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('**/api/llm**',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})}):r.fulfill({status:404,body:''}));
await p.goto(url);await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.waitForTimeout(900);
const cap=async(t)=>p.evaluate(t=>{let c=document.getElementById('recCap');if(!c){c=document.createElement('div');c.id='recCap';c.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;background:rgba(46,46,47,.92);color:#fff;font:600 17px/1.3 Montserrat,Segoe UI,Arial,sans-serif;padding:12px 22px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);letter-spacing:.01em;pointer-events:none;transition:opacity .25s';document.body.appendChild(c)}c.style.opacity=t?'1':'0';if(t)c.textContent=t},t);
const T0=Date.now();const OFF=(T0-VID0)/1000;const at=ms=>p.waitForTimeout(Math.max(0,T0+ms-Date.now()));
// 0–4 s: the Daily feed
await cap('1 · The Daily feed: every proposed change with its impact, worked out and checked');await p.evaluate(()=>showTab('appr'));await at(3800);
// 4–12 s: upload and the debug window
await cap('2 · Upload an EstateMaster export: two AI agents debug it, a third arbitrates');await p.evaluate(()=>showTab(RO?'em':'model'));await at(5200);
const b64=fs.readFileSync(sp+'cfref/ref_export.xlsx').toString('base64');
await p.evaluate(async b64=>{await loadXLSX();AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';
  // the two review agents answer as the real ones would, so the debug window fills in the recording
  window.callOne=async(pr,model,sys,msgs)=>{const u=msgs[0].content;await new Promise(r=>setTimeout(r,1100));
    if(sys===AUDIT_SYS)return{text:JSON.stringify({read_ok:true,read_note:'Read correctly: 3 sheets, monthly cash flow, outputs reconcile with the Summary.',items:pr==='anthropic'?[{kind:'risk',severity:'medium',title:'Contingency of 3% is thin for a tower of this size',evidence:'Inputs: construction contingency 3%',cell:'Inputs!C14',recommendation:'Test 5% in the downside case'}]:[{kind:'risk',severity:'medium',title:'Construction contingency at 3% looks low',evidence:'Inputs!C14 = 3%',cell:'Inputs!C14',recommendation:'Consider 5%'}]})};
    if(sys===AUDIT_VERIFY_SYS){const ids=[...u.matchAll(/\n(\d+)\. \[/g)].map(m=>+m[1]);return{text:JSON.stringify({verdicts:ids.map(i=>({i,verdict:'confirmed',reason:'the cell holds 3%; 5–10% is usual for a tower'}))})}}
    if(sys===AUDIT_ARB_SYS){const ids=[...u.matchAll(/\n(\d+)\. \[/g)].map(m=>+m[1]);return{text:JSON.stringify({verdicts:ids.map(i=>({i,verdict:'confirmed',reason:'agreed'}))})}}
    return{text:'ok'}};const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));uploadExport(new File([bin],'Reference Tower.xlsx'))},b64);
await at(8200);await cap('3 · The IRR is proved from EstateMaster’s own cash flow before anything is computed');await at(12500);
// 12–19 s: chat what-if, exact
await p.evaluate(()=>{const w=document.getElementById('dbgWin');if(w)w.classList.remove('on');AI.keys={};window.calcPair=()=>[];showTab('report');toggleDock(true)});await cap('4 · Ask a what-if in plain words: the answer is exact, not an AI guess');await at(13200);
await p.fill('#ask','what if sale price drops 10% and construction cost rises 5%?');await at(14400);await p.click('#send');await at(19000);
// 19–24 s: stress
await cap('5 · Sensitivity tables and stress tests on the same cash flow');await p.evaluate(()=>{showTab('scen');toggleDock(false)});await at(22700);
// 23–31 s: the deck
await cap('6 · Press ▶ Play for a narrated board deck, in English or Arabic');await at(22800);console.log('deck:',await p.evaluate(()=>{try{showTab('report');const d=buildDeck('ic');d.noAI=true;openDeck(d);KP.voice=false;KVOICE.mode='none';return 'ok'}catch(e){return e.message}}));
await at(24400);await p.evaluate(()=>kGo(3));await at(27400);await p.evaluate(()=>kGo(6));await at(30600);await cap('');await at(31200);
await ctx.close();await b.close();const f=fs.readdirSync(out).find(x=>x.endsWith('.webm'));fs.writeFileSync(out+'offset.txt',String(OFF));console.log('recorded',out+f,fs.statSync(out+f).size,'offset',OFF.toFixed(2));
