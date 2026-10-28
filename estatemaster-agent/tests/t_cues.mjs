// Every figure and bullet the voice names lights up as it is spoken; "riyals" goes to the voice as "ree-yaals".
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const SEC=6,sr=8000,n=sr*SEC,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--autoplay-policy=no-user-gesture-required']});const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));const said=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,provider:'elevenlabs',model:'eleven_multilingual_v2',riyal:'ree-yaals'})});
  const bj=JSON.parse(r.request().postData());said.push(bj.text);const ch=[...bj.text];r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_base64:wav.toString('base64'),mime:'audio/wav',alignment:{characters:ch,character_start_times_seconds:ch.map((c,i)=>+(i/ch.length*SEC).toFixed(3))}})})});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
ck('speech text: the currency after the amount as SAR (as in the marketing agent), symbols spelled out',await ev(()=>kSpeech('Net profit SAR 130M, 22.4% IRR, 1.54x, in Saudi riyals')==='Net profit 130 million SAR, 22.4 percent irr, 1.54 times, in SAR'),await ev(()=>kSpeech('Net profit SAR 130M, 22.4% IRR, 1.54x, in Saudi riyals')));
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(400);await p.click('#rplay');await p.waitForTimeout(800);
async function watch(i,ms){await ev(i=>kGo(i),i);const seen=[];let seenCount=0;const t0=Date.now();while(Date.now()-t0<ms){const f=await ev(()=>{const n=document.querySelector('.kd-enter .kd-focus');return n?n.getAttribute('data-fig'):null});if(f&&seen.at(-1)!==f)seen.push(f);seenCount=Math.max(seenCount,await ev(()=>document.querySelectorAll('.kd-enter .kd-seen').length));await p.waitForTimeout(120)}watch.seen=seenCount;return seen}
// headline: four stats and the bullet points, in spoken order
let s1=await watch(1,SEC*1000+1800);
ck('headline: each stat and each bullet lights as it is spoken, in order',s1.includes('Levered IRR')&&s1.includes('Profit on cost')&&s1.includes('Net profit')&&s1.includes('Equity multiple')&&s1.filter(x=>/^point/.test(x)).length>=2&&s1.indexOf('Levered IRR')<s1.indexOf('Profit on cost')&&s1.indexOf('Profit on cost')<s1.indexOf('Net profit'),s1.join(' → '));
await p.screenshot({path:sp+'cue_headline.png'});
ck('discussed figures stay readable (seen), the rest dimmed',watch.seen>=4,watch.seen);
const voiceText=said.find(t=>/levered IRR/i.test(t))||'';
ck('voice receives the amount then "SAR", never "riyals"',/\d( million| billion| thousand)? SAR\b/.test(said.join(' '))&&!/\briyals?\b/i.test(said.join(' '))&&!/\bSAR \d/.test(said.join(' ')),voiceText.slice(0,160));
await p.waitForTimeout(300);ck('captions (on by default) keep the written text',!/ree-yaals/.test(await ev(()=>document.querySelector('.kd-cc').textContent)),await ev(()=>document.querySelector('.kd-cc').textContent.slice(0,90)));
// every slide kind: what lights up while it plays
const kinds=await ev(()=>KP.deck.slides.map(s=>s.kind));const want={bridge:4,hbars:2,list:2,gauges:2,donut:2,columns:2,table:2,tower:1,line:1};const got={};
for(const [k,min] of Object.entries(want)){const i=kinds.indexOf(k);if(i<0)continue;const s=await watch(i,SEC*1000+1500);got[k]=s;ck(`${k}: ${min}+ figures light up in turn`,s.length>=min,s.join(' → '))}
const li=kinds.indexOf('list');if(li>=0){await ev(i=>kGo(i),li);await p.waitForTimeout(SEC*500);await p.screenshot({path:sp+'cue_list.png'})}
const bi=kinds.indexOf('bridge');if(bi>=0){await ev(i=>kGo(i),bi);await p.waitForTimeout(SEC*600);await p.screenshot({path:sp+'cue_bridge.png'})}
// browser voice fallback: same cues by pacing
await ev(()=>{KVOICE.mode='none'});await ev(()=>kGo(0));await p.waitForTimeout(300);const dur=await ev(()=>{kGo(1);return KP.dur});const s2=await watch(1,dur);ck('without a voice, the same figures light up by pacing',s2.length>=4,s2.join(' → '));
await p.keyboard.press('Escape');
ck('no page errors',!errs.length,errs.join(' | '));
for(const r of R)console.log(r.join('  '));await b.close();
