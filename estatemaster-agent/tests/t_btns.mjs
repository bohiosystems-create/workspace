import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
await p.evaluate(()=>{showTab('report');openSettings('ai');document.querySelector('#setClose').click();openFigWin(document.querySelector('.fig')||Object.assign(document.createElement('b'),{className:'fig',dataset:{k:'em',w:''}}));document.querySelector('#fwClose').click();openTemplates&&openTemplates()});await p.waitForTimeout(1200);
const words=await p.evaluate(()=>[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/^(Close|▶ ?Play|▶ ?Replay|❚❚ ?Pause)$/i.test(t)));
ok(!words.length,'no Close/Play/Pause words on buttons: '+words.join(','));
ok(await p.evaluate(()=>['setClose','tplClose','fwClose'].every(id=>{const b=document.getElementById(id);return b&&b.textContent==='×'&&b.getAttribute('aria-label')==='Close'})),'close buttons are × with an accessible name');
ok(await p.evaluate(()=>document.querySelector('#rplay').textContent==='▶'),'report Play is ▶');
await p.evaluate(()=>document.querySelector('#tplClose').click());
await p.evaluate(()=>{const d=buildDeck('ic');d.noAI=true;openDeck(d);KP.voice=false;KVOICE.mode='none'});await p.waitForTimeout(800);
const st=()=>p.evaluate(()=>{const b=document.querySelector('[data-act=pause]');return b.dataset.st+'|'+b.textContent+'|'+b.title});
ok(/^pause\|❚❚\|Pause$/.test(await st()),'deck shows ❚❚ while playing');await p.click('[data-act=pause]');await p.waitForTimeout(300);
ok(/^play\|▶\|Play$/.test(await st()),'click → ▶ when paused');await p.click('[data-act=pause]');await p.waitForTimeout(300);ok(/^pause/.test(await st()),'click → plays again');
await p.evaluate(()=>{kGo(KP.deck.slides.length-1)});await p.waitForTimeout(18000);   // the last slide's narration, then the 5 s question pause
ok(/^replay\|↻\|Replay$/.test(await st()),'end of deck → ↻ replay: '+await st());await p.click('[data-act=pause]');await p.waitForTimeout(500);ok(await p.evaluate(()=>KP.i===0),'↻ restarts from the first slide');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
