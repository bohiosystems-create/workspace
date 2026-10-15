// Settings → System check: a score and one row per dependency (server, AI, voice, Outlook, schedule, model, browser, hurdle), red with a fix line
// when something is wrong, and a deep check that makes a real AI call per provider and a real synthesis in both languages.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let openaiOk=false;const J=o=>({status:200,contentType:'application/json',body:JSON.stringify(o)});
await p.route('**/api/health',r=>r.fulfill(J({ok:true,commit:'abc1234',region:'fra1',build:'dev'})));
await p.route('**/api/mail',r=>r.fulfill(J({configured:false,domains:[]})));
await p.route('**/api/voice**',r=>{const u=r.request().url();if(r.request().method()==='POST')return r.fulfill({status:200,contentType:'audio/mpeg',body:Buffer.alloc(4000,1)});if(/check=1/.test(u))return r.fulfill(J({ok:true,used:12000,limit:100000}));return r.fulfill(J({enabled:true,voice:'abc',voiceAr:'def',stt:'elevenlabs'}))});
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill(J({providers:{anthropic:true,openai:true},passwordRequired:false}));const j=JSON.parse(r.request().postData());
  if(j.provider==='openai'&&!openaiOk)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'You exceeded your current quota, please check your plan and billing details'}})});
  return r.fulfill(J(j.provider==='openai'?{choices:[{message:{content:'OK'}}]}:{model:j.payload.model,content:[{type:'text',text:'OK'}]}))});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openSettings('check'));await p.waitForFunction(()=>!SC.busy&&SC.at,null,{timeout:20000});
let s=await ev(()=>({score:$('#scScore').innerText,rows:[...document.querySelectorAll('#scRows .sc-row')].map(r=>r.className.replace('sc-row sc-','')+':'+r.querySelector('b').textContent),on:$('#set_check').classList.contains('on'),nav:$('#setModal [data-set=check]').classList.contains('on')}));
t(s.on&&s.nav,'the System check tab opens in Settings');
t(/^\d+\n/.test(s.score)&&/ready · .* to decide · .* to fix/.test(s.score),'a score tile: '+s.score.replace(/\n/g,' · '));
for(const k of ['Server','AI','Voice (ElevenLabs)','Outlook (Microsoft 365)','Morning report','Model loaded','Browser storage','Hurdle'])t(s.rows.some(r=>r.endsWith(':'+k)),'row '+k+': '+(s.rows.find(r=>r.endsWith(':'+k))||'missing'));
t(s.rows.some(r=>r==='warn:Outlook (Microsoft 365)')&&s.rows.some(r=>r==='ok:Server'),'simulated Outlook is amber, the server green');
const fx=await ev(()=>[...document.querySelectorAll('#scRows .sc-warn .fx')].map(e=>e.textContent));t(fx.length>=1,'amber rows carry a fix line: '+fx[0]);
// deep: a real call per provider; OpenAI out of credit shows red with the reason, the voice synthesises in both languages
await p.click('#scDeep');await p.waitForFunction(()=>!SC.busy&&SC.deep,null,{timeout:60000});
s=await ev(()=>({rows:[...document.querySelectorAll('#scRows .sc-row')].map(r=>r.className.replace('sc-row sc-','')+':'+r.querySelector('b').textContent+' — '+r.querySelector('.d').textContent.slice(0,80)),fix:[...document.querySelectorAll('#scRows .sc-fail .fx')].map(e=>e.textContent),score:$('#scScore').innerText}));
t(s.rows.some(r=>/^ok:Claude — .*answered in \d+ ms/.test(r)),'deep: Claude called for real: '+s.rows.find(r=>/Claude/.test(r)));
t(s.rows.some(r=>/^fail:OpenAI — Did not answer: OpenAI is out of API credit/.test(r))&&s.fix.some(f=>/Top up/.test(f)),'deep: OpenAI out of credit is red with the reason and the fix: '+s.rows.find(r=>/OpenAI/.test(r)));
t(s.rows.some(r=>/^ok:English speech — Synthesised/.test(r))&&s.rows.some(r=>/^ok:Arabic speech/.test(r)),'deep: speech synthesised in English and Arabic');
t(/deep check/.test(s.score)&&/1 to fix/.test(s.score),'score says deep check with 1 to fix: '+s.score.replace(/\n/g,' · '));
await p.screenshot({path:sp+'../syscheck.png'});
openaiOk=true;await p.click('#scDeep');await p.waitForFunction(()=>!SC.busy,null,{timeout:60000});s=await ev(()=>$('#scScore').innerText);t(/0 to fix/.test(s),'after the top-up the deep check is clean: '+s.replace(/\n/g,' · '));
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
