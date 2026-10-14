// Oct 14 fixes: unique ids (workbook subtitle, deck chart defs), the speaking flag of an interrupted slide never stalls the next one, exports card header fits a phone
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const url=process.argv[2]||'http://localhost:4090/?mode=analyst';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(url);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
// 1. no duplicate ids on any page
const dups=await p.evaluate(async()=>{const out=new Set();for(const tb of Object.keys(TAB_INTRO)){try{showTab(tb)}catch(e){}await new Promise(r=>setTimeout(r,100));const ids={};document.querySelectorAll('[id]').forEach(e=>{ids[e.id]=(ids[e.id]||0)+1});Object.entries(ids).filter(([k,v])=>v>1).forEach(([k])=>out.add(k))}return[...out]});
t(!dups.length,'no duplicate element ids across every page: '+(dups.join(',')||'none'));
// 2. the workbook window's subtitle is its own; the model-lines count keeps its text
const wb=await p.evaluate(async()=>{showTab(RO?'em':'model');renderAll();const before=($('#xlSub')||{}).textContent;try{renderWbPreview()}catch(e){}const lx=latestExport(PROJ.id),key='synth:'+(lx?lx.id:'replica:'+PROJ.id);let sub='';try{await openWorkbook(key);sub=($('#xlWSub')||{}).textContent||''}catch(e){sub='ERR '+e.message}return{before,after:($('#xlSub')||{}).textContent,sub}});
t(wb.before===wb.after&&/model lines/.test(wb.after||''),'opening the workbook leaves the model-lines count intact: '+JSON.stringify(wb.after).slice(0,60));
t(/read|EX-|synth/.test(wb.sub),'the workbook window shows its own subtitle: '+wb.sub.slice(0,70));
// 3. deck: chart gradients defined once; an interrupted slide does not stall the last one
const deck=await p.evaluate(async()=>{try{closeWorkbook&&closeWorkbook()}catch(e){}const d=buildDeck('ic');d.noAI=true;openDeck(d);KP.voice=false;KVOICE.mode='none';await new Promise(r=>setTimeout(r,800));
  let n=0,charts=0;for(let i=0;i<KP.deck.slides.length;i++){kGo(i);await new Promise(r=>setTimeout(r,120));n=Math.max(n,document.querySelectorAll('.kd-root #kdGlow').length);charts+=document.querySelectorAll('.kd-root [filter*="kdGlow"],.kd-root [fill*="kdArea"]').length}kGo(KP.deck.slides.length-1);
  const t0=Date.now();let st='';while(Date.now()-t0<20000){await new Promise(r=>setTimeout(r,500));st=document.querySelector('[data-act=pause]').dataset.st;if(st==='replay')break}return{n,charts,st,took:Date.now()-t0,speaking:KP.speaking}});
t(deck.n===1&&deck.charts>0,`deck chart defs once (${deck.n}) and used by ${deck.charts} chart elements`);
t(deck.st==='replay'&&deck.took<15000,`after an interrupted slide the last slide ends and offers replay in ${(deck.took/1000).toFixed(1)}s (speaking flag ${deck.speaking})`);
await p.evaluate(()=>closeDeck());
// 4. phone width: the exports card header with its two buttons does not overflow
await p.setViewportSize({width:390,height:800});await p.evaluate(()=>{showTab(RO?'em':'model')});await p.waitForTimeout(400);
const ov=await p.evaluate(()=>{const h=$('#exUp').closest('.sbhead'),c=h.closest('.card');const r=h.getBoundingClientRect(),cr=c.getBoundingClientRect();return{over:r.right>cr.right+1||$('#exDbg').getBoundingClientRect().right>cr.right+1,scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
t(!ov.over&&ov.scroll<=0,'390px: exports card header fits, no horizontal page scroll '+JSON.stringify(ov));
// 5. Escape closes a modal and the Model debug window
await p.setViewportSize({width:1440,height:900});const esc=await p.evaluate(()=>{$('#setModal').classList.add('on');return true});await p.keyboard.press('Escape');await p.waitForTimeout(150);
const esc1=await p.evaluate(()=>!$('#setModal').classList.contains('on'));await p.evaluate(()=>openDbgWin(null));await p.waitForTimeout(100);const open1=await p.evaluate(()=>$('#dbgWin').classList.contains('on'));await p.keyboard.press('Escape');await p.waitForTimeout(150);
const esc2=await p.evaluate(()=>!$('#dbgWin').classList.contains('on'));t(esc1&&open1&&esc2,`Escape closes the settings window (${esc1}) and the Model debug window (${esc2})`);
t(!errs.length,'no page errors '+errs.join('; '));
console.log(ok.join('\n'));await b.close();
