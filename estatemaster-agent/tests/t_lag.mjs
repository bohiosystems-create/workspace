// ▶ Play with ElevenLabs (mocked /api/voice), the ambient scene, the bridge and tower slides, read-aloud mode.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=full',tag=process.argv[3]||'full';
// a 0.4 s silent WAV so the Audio element really plays and ends
const sr=8000,n=sr*6|0,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--autoplay-policy=no-user-gesture-required']});const ctx=await b.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));let voiceCalls=0,voiceTexts=[],voiceBodies=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?sp+'pptx/package/dist/pptxgen.bundle.js':sp+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,provider:'elevenlabs',model:'eleven_multilingual_v2'})});voiceCalls++;const bj=JSON.parse(r.request().postData());voiceBodies.push(bj);await new Promise(z=>setTimeout(z,1500));voiceTexts.push(bj.text);if(bj.timestamps){const chars=[...bj.text],starts=chars.map((c,i)=>+(i/chars.length*0.4).toFixed(3));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_base64:wav.toString('base64'),mime:'audio/wav',alignment:{characters:chars,character_start_times_seconds:starts}})})}r.fulfill({status:200,contentType:'audio/wav',body:wav})});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,220)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(600);await p.click('#rplay');await p.waitForTimeout(4500);
const n1=voiceBodies.length;
// turn the slide by hand and measure how long until its voice plays
const lag=await ev(()=>new Promise(ok=>{const t0=performance.now();kGo(KP.i+1);const iv=setInterval(()=>{if(KAUDIO&&!KAUDIO.paused&&KAUDIO.currentTime>0){clearInterval(iv);ok(Math.round(performance.now()-t0))}},20);setTimeout(()=>{clearInterval(iv);ok(-1)},8000)}));
ck('the next two slides are fetched ahead (ElevenLabs answers in 1.5 s here)',n1>=3,`${n1} voice requests before turning`);
ck('after a slide turns its voice starts at once (preloaded), not after the ElevenLabs round trip',lag>=0&&lag<700,lag+' ms');
await ev(()=>{KP.script.pending=new Promise(()=>{});KP.scriptWaited=true});
const lag2=await ev(()=>new Promise(ok=>{const t0=performance.now();kGo(KP.i+1);const iv=setInterval(()=>{if(KAUDIO&&!KAUDIO.paused&&KAUDIO.currentTime>0){clearInterval(iv);ok(Math.round(performance.now()-t0))}},20);setTimeout(()=>{clearInterval(iv);ok(-1)},15000)}));
ck('a later slide never waits for the AI script (only the first slide waits, at most 6 s)',lag2>=0&&lag2<3000,lag2+' ms');
ck('no page errors',!errs.length,errs.join(' | '));
console.log(R.map(r=>r.join(' | ')).join('\n'));await b.close();
