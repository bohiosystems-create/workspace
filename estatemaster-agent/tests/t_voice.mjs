// ▶ Play with ElevenLabs (mocked /api/voice), the ambient scene, the bridge and tower slides, read-aloud mode.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=full',tag=process.argv[3]||'full';
// a 0.4 s silent WAV so the Audio element really plays and ends
const sr=8000,n=sr*0.4|0,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--autoplay-policy=no-user-gesture-required']});const ctx=await b.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));let voiceCalls=0,voiceTexts=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?sp+'pptx/package/dist/pptxgen.bundle.js':sp+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,provider:'elevenlabs',model:'eleven_multilingual_v2'})});voiceCalls++;const bj=JSON.parse(r.request().postData());voiceTexts.push(bj.text);if(bj.timestamps){const chars=[...bj.text],starts=chars.map((c,i)=>+(i/chars.length*0.4).toFixed(3));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_base64:wav.toString('base64'),mime:'audio/wav',alignment:{characters:chars,character_start_times_seconds:starts}})})}r.fulfill({status:200,contentType:'audio/wav',body:wav})});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,220)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(600);
const kinds=await ev(()=>buildDeck('ic').slides.map(s=>s.kind));
ck('IC deck has the profit bridge and the sources/uses tower',kinds.includes('bridge')&&kinds.includes('tower'),kinds.join(','));
const doc=await ev(()=>({bridge:!!document.querySelector('#report .k-chart svg path[d]')&&/Profit bridge|From gross revenue/.test($('#report').textContent),tower:/Sources and uses|Where the money comes from/.test($('#report').textContent),spark:document.querySelectorAll('#report svg').length}));
ck('report document shows the bridge and the tower',doc.bridge&&doc.tower,JSON.stringify(doc));
await p.click('#rplay');await p.waitForTimeout(1800);
ck('ambient scene: drifting lights, grid, grain',await ev(()=>!!document.querySelector('.kd-ambient .a')&&!!document.querySelector('.kd-grid')&&!!document.querySelector('.kd-grain')),'');
await p.waitForTimeout(800);
const vb=await ev(()=>document.querySelector('[data-act=voice]').textContent);ck('voice button: the speaker icon',vb==='🔊',vb);
await p.waitForTimeout(1500);
ck('narration requested from /api/voice (cover) and the next slide preloaded',voiceCalls>=2&&voiceTexts.some(t=>/Let’s walk through/.test(t))&&!voiceTexts.some(t=>/Committee pack/i.test(t))&&voiceTexts.some(t=>/levered (IRR|I R R) comes in at/.test(t)),`${voiceCalls} calls: ${voiceTexts.map(t=>t.slice(0,40)).join(' | ')}`);
// auto-advance after the audio ended (0.4 s audio, 4.5 s minimum show)
await p.waitForTimeout(5500);ck('auto-advances after the narration ends',(await ev(()=>KP.i))>=1,'slide '+(await ev(()=>KP.i+1)));
const bi=kinds.indexOf('bridge');await ev(i=>kGo(i),bi);await p.waitForTimeout(2600);await p.screenshot({path:`${sp}play_${tag}_bridge.png`});
{const bg=await ev(()=>({g:document.querySelectorAll('.kd-enter .kd-spring').length,c:document.querySelectorAll('.kd-enter line[stroke-dasharray="5 5"]').length}));ck('bridge drawn: extruded steps with connectors',bg.g>=5&&bg.c>=bg.g-1,JSON.stringify(bg))}
const ti=kinds.indexOf('tower');await ev(i=>kGo(i),ti);await p.waitForTimeout(2800);await p.screenshot({path:`${sp}play_${tag}_tower.png`});
ck('tower drawn: stacked extruded segments for uses and sources',(await ev(()=>document.querySelectorAll('.kd-enter .kd-spring').length))>=7,'');
await ev(()=>kGo(1));await p.waitForTimeout(600);await p.keyboard.press(' ');await p.waitForTimeout(2000);
const sb=await (await p.$('.kd-enter .kd-stat')).boundingBox();await p.mouse.move(sb.x+sb.width*.3,sb.y+sb.height*.3);await p.waitForTimeout(300);
ck('stat blocks stay still under the pointer',!/perspective/.test(await ev(()=>document.querySelector('.kd-enter .kd-stat').style.transform)),await ev(()=>document.querySelector('.kd-enter .kd-stat').style.transform));
ck('net profit stat has a sparkline',await ev(()=>!!document.querySelector('.kd-enter .kd-stat svg path[pathLength]')),'');
ck('background does not follow the pointer',await ev(()=>!document.querySelector('.kd-root').style.getPropertyValue('--kd-px')),'');
await p.screenshot({path:`${sp}play_${tag}_headline2.png`});
// mute → timer mode; unmute → ElevenLabs again
await p.keyboard.press(' ');await p.waitForTimeout(200);await p.click('[data-act=voice]');const vb2=await ev(()=>document.querySelector('[data-act=voice]').textContent);await p.click('[data-act=voice]');
ck('voice toggles',vb2==='🔇'&&/🔊/.test(await ev(()=>document.querySelector('[data-act=voice]').textContent)),vb2);
await p.keyboard.press('Escape');await p.waitForTimeout(300);
// read-aloud mode on the document
const c0=voiceCalls;await p.click('#rread');await p.waitForTimeout(1200);
const rd=await ev(()=>({on:!!KR,btn:$('#rread').textContent,live:!!document.querySelector('#report .k-live')}));
ck('Read mode: live section highlighted, narration running',rd.on&&/Stop/.test(rd.btn)&&rd.live&&voiceCalls>c0,JSON.stringify(rd)+' calls '+(voiceCalls-c0));
await p.waitForTimeout(6500);const prog=await ev(()=>({i:KR&&KR.i,sec:document.querySelector('#report .k-live')&&document.querySelector('#report .k-live').className}));
ck('Read mode moves through the sections',prog.i>=1&&/k-sec/.test(prog.sec||''),JSON.stringify(prog));
await p.screenshot({path:`${sp}read_${tag}.png`});
await p.click('#rread');ck('Read stops',!(await ev(()=>!!KR||!!document.querySelector('#report .k-live'))),'');
// PowerPoint still builds with the new kinds
await p.click('#rplay');await p.waitForTimeout(800);const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('[data-act=pptx]')]);const f=sp+'dl_v_'+dl.suggestedFilename();await dl.saveAs(f);
ck('PowerPoint with bridge and tower',fs.statSync(f).size>20000,`${Math.round(fs.statSync(f).size/1024)} KB`);await p.keyboard.press('Escape');
const stt=await ev(()=>selfTest().filter(r=>!r.info).map(r=>[r.ok,r.name,r.detail]));ck('selfTest',stt.every(r=>r[0])&&stt.length===24,JSON.stringify(stt.filter(r=>!r[0])));
ck('no page errors',!errs.length,errs.join(' | '));
for(const r of R)console.log(r.join('  '));await b.close();
