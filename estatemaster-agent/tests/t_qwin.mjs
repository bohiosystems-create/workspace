// Question pause: 5 s at the end of every slide, title included (6 s clip per slide).
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,n)=>console.log((c?'PASS ':'FAIL ')+n);
const sr=8000,n=sr*6,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true,"model":"eleven_v3","voice":"v1"}'});return r.fulfill({status:200,contentType:'audio/wav',body:wav})});
await p.route('**/api/llm',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}));
await p.goto('http://localhost:4090/?mode=readonly');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bohioVoiceLang','en')});await p.reload();await p.waitForTimeout(1200);
await p.evaluate(()=>{showTab('report');RSEL='ic';renderReportList();renderReport()});await p.waitForTimeout(300);await p.click('#rplay');
const t0=Date.now(),starts={},cueOn={};
while(Date.now()-t0<30000){const s=await p.evaluate(()=>({i:KP?KP.i:-1,cue:!!(KP&&KP.root.querySelector('.kd-qcue.on'))}));if(!(s.i in starts))starts[s.i]=Date.now()-t0;if(s.cue)cueOn[s.i]=1;if(s.i>=2)break;await p.waitForTimeout(200)}
const d0=starts[1]-starts[0],d1=starts[2]-starts[1];
ok(cueOn[0],'question prompt shown after the title slide');ok(cueOn[1],'question prompt shown after slide 2');
ok(d0>=10500,'title slide waits 5 s for questions after its 6 s narration: '+d0+' ms');ok(d1>=10500,'slide 2 waits 5 s for questions after its narration: '+d1+' ms');ok(Math.abs(d1-d0)<2500,'the same pause on every slide: '+(d1-d0)+' ms');
ok(!errs.length,'no page errors '+errs.join(';'));await b.close();
