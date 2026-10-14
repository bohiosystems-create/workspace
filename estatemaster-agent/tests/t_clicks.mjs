// Click every safe button on every page and catch any error a customer would trigger.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;const URL=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:900},acceptDownloads:true});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,200)));p.on('dialog',d=>d.dismiss().catch(()=>{}));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
await p.goto(URL);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1800);const tabs=await p.evaluate(()=>[...GTABS,...MTABS].map(t=>t[0]));let clicked=0;const where=[];
for(const t of tabs){await p.evaluate(t=>showTab(t),t);await p.waitForTimeout(500);
  const n=await p.evaluate(()=>{const S=/delete|remove|reject|approve|send|log ?out|reset|clear|forget|run now|test send|upload|propose|create|regenerate|schedule|play|read|record|🎤/i;window.__BTN=[...document.querySelectorAll('.pane.on button, .pane.on .btn')].filter(e=>e.offsetParent!==null&&!e.disabled&&!S.test(e.textContent+' '+(e.title||'')));return __BTN.length});
  for(let i=0;i<Math.min(n,40);i++){const before=errs.length;const label=await p.evaluate(i=>{const e=window.__BTN[i];if(!e||!e.isConnected||e.offsetParent===null)return null;const l=(e.textContent||e.title||'').trim().slice(0,30);try{e.click()}catch(x){}return l},i);if(label==null)continue;clicked++;await p.waitForTimeout(250);
    await p.keyboard.press('Escape');await p.evaluate(()=>{document.querySelectorAll('.modal.on,.rp-win.on,#xlWin.on,#figWin.on,.disp-win.on,#dbgWin.on').forEach(m=>m.classList.remove('on'));try{if(typeof closeDeck==='function'&&KP)closeDeck()}catch(e){}});
    if(errs.length>before)where.push(`${t} · “${label}”: ${errs.slice(before).join(' | ')}`);await p.evaluate(t=>showTab(t),t)}}
console.log(where.length?where.join('\n'):'no errors');console.log(`t_clicks ${tag}: ${clicked} buttons clicked, ${where.length} with errors`);await b.close();
