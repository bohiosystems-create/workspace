import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
// a slow AI (the script takes 20 s) and a voice service that takes 900 ms per clip
const voiceReq=[];await p.route('**/api/llm',async r=>{await new Promise(x=>setTimeout(x,20000));r.fulfill({status:200,contentType:'application/json',body:'{}'})});
await p.route('**/api/voice',async r=>{const body=r.request().postDataJSON()||{};if(body.check||!body.text){r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,mode:'eleven',voices:[]})});return}voiceReq.push({t:Date.now(),text:body.text.slice(0,40)});await new Promise(x=>setTimeout(x,900));r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_base64:fs.readFileSync(sp+'silence.b64','utf8').trim(),mime:'audio/wav',alignment:{characters:[],character_start_times_seconds:[]}})})});
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
await p.evaluate(()=>{AI.keys={anthropic:'k'};AI.pass='';KVOICE.checked=true;KVOICE.mode='eleven';KVOICE.cache=new Map();showTab('report')});
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
await p.waitForTimeout(2500);// the report page prepared the opening clips
const pre=voiceReq.length;ok(pre>=1,'clips fetched ahead while the AI script is still being written: '+pre);
const t0=Date.now();await p.evaluate(()=>{openDeck(buildDeck(RSEL))});
const started=await p.waitForFunction(()=>KAUDIO&&!KAUDIO.paused,null,{timeout:8000}).then(()=>Date.now()-t0).catch(()=>null);
ok(started!=null&&started<2500,'first slide speaks within '+started+' ms (no wait for the AI script)');
await p.waitForTimeout(800);const t1=Date.now();await p.evaluate(()=>kGo(1));const s2=await p.waitForFunction(()=>KAUDIO&&!KAUDIO.paused&&KP.i===1,null,{timeout:6000}).then(()=>Date.now()-t1).catch(()=>null);
ok(s2!=null&&s2<400,'next slide speaks within '+s2+' ms of turning (clip pre-fetched)');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
