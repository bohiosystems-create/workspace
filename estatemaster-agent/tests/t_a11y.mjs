// Accessibility: axe (WCAG 2.1 AA) finds nothing on any page, settings, chat or deck; feed rows open from the keyboard; every field has a name
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const AXE=fs.readFileSync(sp+'axe/package/axe.min.js','utf8');
const url=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(url);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.addScriptTag({content:AXE});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const bad=[];
const scan=async n=>{const r=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']},resultTypes:['violations']})).violations.map(v=>v.id+'×'+v.nodes.length));if(r.length)bad.push(n+': '+r.join(','))};
for(const v of await p.evaluate(()=>Object.keys(TAB_INTRO))){await p.evaluate(v=>showTab(v),v);await p.waitForTimeout(450);await scan(v)}
await p.evaluate(()=>openSettings('ai'));await p.waitForTimeout(800);await scan('settings');await p.evaluate(()=>closeSettings());
await p.evaluate(()=>toggleDock(true));await p.waitForTimeout(800);await scan('chat');await p.evaluate(()=>toggleDock(false));
t(!bad.length,'axe WCAG 2.1 AA: no violation on any page, settings or chat '+bad.join(' | '));
await p.evaluate(()=>showTab('appr'));await p.waitForTimeout(500);
const kb=await p.evaluate(async()=>{const it=document.querySelector('.feed-item:not(.open)');const r=it.querySelector('.fi-car');r.focus();const f=document.activeElement===r;r.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(x=>setTimeout(x,300));const c=it.querySelector('.fi-car');return{f,open:it.classList.contains('open'),exp:c.getAttribute('aria-expanded'),role:c.getAttribute('role'),name:c.getAttribute('aria-label').slice(0,40)}});
t(kb.f&&kb.open&&kb.exp==='true'&&kb.role==='button','a feed row opens from the keyboard (Tab to its details control, Enter) '+JSON.stringify(kb));
const unnamed=await p.evaluate(()=>[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e=>!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!(e.id&&document.querySelector(`label[for="${e.id}"]`))&&!e.closest('label')).map(e=>e.id||e.className).slice(0,5));
t(!unnamed.length,'every field has an accessible name '+unnamed.join(','));
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));await b.close();
