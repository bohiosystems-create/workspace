// Nothing the deck highlights is cut: on every slide of every report deck, each item the narration lights up (with its outline)
// stays inside the slide, in KINAN and in Jadwa (whose own look adds its styles), at a laptop and a wide screen.
import {chromium} from 'playwright';import {spawn,execSync} from 'child_process';import fs from 'fs';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
// Jadwa's look is applied at build time: its own build is served for the Jadwa half
const APP=new globalThis.URL('..',import.meta.url).pathname,JD=APP+'dist/jadwa-readonly';if(!fs.existsSync(JD+'/index.html'))execSync('python3 tools/build_options.py',{cwd:APP,stdio:'ignore'});
const srv=spawn('python3',['-m','http.server','4096','-d',JD],{stdio:'ignore'});await new Promise(r=>setTimeout(r,1500));const jbase=process.env.JADWA_URL||'http://localhost:4096/';
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,600):''))}};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
for(const [brand,url] of [['KINAN',base],['Jadwa',jbase]])for(const vp of [{width:1366,height:768},{width:1920,height:1080}]){
  const p=await b.newPage({viewport:vp});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
  await p.goto(url);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);await p.evaluate(()=>showTab('report'));await p.waitForTimeout(500);
  await p.click('#rplay');await p.waitForTimeout(1500);await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
  const r=await p.evaluate(async()=>{const cut=[];let slides=0;try{kPause&&kPause()}catch(e){}
    for(let i=0;i<(KP&&KP.deck?KP.deck.slides.length:0);i++){try{kGo(i)}catch(e){continue}await new Promise(z=>setTimeout(z,700));const sl=document.querySelector('.kd-slide');if(!sl)continue;slides++;
      const box=sl.getBoundingClientRect();for(const n of sl.querySelectorAll('[data-fig]')){if(!(n instanceof HTMLElement)||!['DIV','LI'].includes(n.tagName))continue;
        sl.querySelectorAll('.kd-focus').forEach(x=>x.classList.remove('kd-focus'));n.classList.add('kd-focus');const q=n.getBoundingClientRect();if(!q.width)continue;
        const ring=2;if(q.left-ring<box.left-0.5||q.right+ring>box.right+0.5)cut.push({slide:i,txt:n.textContent.trim().slice(0,40),over:Math.round(Math.max(box.left-(q.left-ring),(q.right+ring)-box.right))})}}
    return{slides,cut}});
  ok(r.slides>3&&!r.cut.length,`${brand} ${vp.width}px: every highlighted item on ${r.slides} slides stays inside the slide`,r.cut.slice(0,6));
  ok(!errs.length,`${brand} ${vp.width}px: no page errors`,errs);await p.close()}
await b.close();srv.kill();console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);
