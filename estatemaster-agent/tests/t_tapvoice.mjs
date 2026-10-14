// When the browser blocks sound, the slide holds and asks for a tap; it never skips ahead in silence.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const sr=8000,n=sr*20,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true,"model":"eleven_v3","voice":"v1"}'});return r.fulfill({status:200,contentType:'audio/wav',body:wav})});
await p.route('**/api/llm',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}));
await p.goto('http://localhost:4090/?mode=readonly');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bohioVoiceLang','en')});await p.reload();await p.waitForTimeout(1200);
// the first play() is refused as the browser would without a fresh tap
await p.evaluate(()=>{const PL=HTMLMediaElement.prototype.play;let n=0;HTMLMediaElement.prototype.play=function(){if(n++===0)return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));return PL.apply(this,arguments)};showTab('report');RSEL='ic';renderReportList();renderReport()});
await p.waitForTimeout(300);await p.click('#rplay');await p.waitForTimeout(14000);
const s1=await p.evaluate(()=>({i:KP.i,tap:!!KP.root.querySelector('.kd-tap:not([hidden])'),sp:KP.speaking}));
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(s1.i===0&&s1.tap&&s1.sp,'sound blocked: after 14 s the slide still holds (slide '+s1.i+') and shows “Tap to start the voice”');
await p.click('.kd-tap');await p.waitForTimeout(1500);const s2=await p.evaluate(()=>({i:KP.i,playing:[...KALL].filter(a=>!a.paused&&!a.ended).length,tap:!!KP.root.querySelector('.kd-tap:not([hidden])')}));
t(s2.playing===1&&!s2.tap&&s2.i===0,'one tap: the voice starts on the same slide');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_tapvoice:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
