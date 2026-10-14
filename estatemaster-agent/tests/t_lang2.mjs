import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,n)=>console.log((c?'PASS ':'FAIL ')+n);let llm=[],voice=0;
// a 1-second silent wav as the ElevenLabs clip
const wav=(()=>{const sr=8000,n=sr*6,buf=Buffer.alloc(44+n);buf.write('RIFF',0);buf.writeUInt32LE(36+n,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(sr,24);buf.writeUInt32LE(sr,28);buf.writeUInt16LE(1,32);buf.writeUInt16LE(8,34);buf.write('data',36);buf.writeUInt32LE(n,40);buf.fill(128,44);return buf})();
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true,"model":"eleven_v3","voice":"v1"}'});voice++;return r.fulfill({status:200,contentType:'audio/wav',body:wav})});
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());llm.push(j);const P=j.payload,sys=P.system||((P.messages[0]||{}).role==='system'?P.messages[0].content:'');
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:P.model,content:[{type:'text',text}]})});
  if(/translate the text of a real estate investment report/.test(sys)){const batch=JSON.parse(P.messages[P.messages.length-1].content);return reply(JSON.stringify({t:batch.map(t=>'ع '+t.replace(/[A-Za-z]+/g,'كلمة'))}))}
  if(P.tools&&P.tools[0]&&/narration/.test(P.tools[0].name||'')){const lang=/Arabic|العربية/.test(sys)?'ar':'en';const n=(sys.match(/(\d+) slides/)||[])[1]||12;const slides=Array.from({length:+n},(_,i)=>({i,say:lang==='ar'?'شريحة رقم '+(i+1)+' تعرض الأرقام الرئيسية للمشروع بشكل واضح ومختصر.':'Slide number '+(i+1)+' shows the key figures of the project in a clear and short way.'}));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'tool_use',id:'t1',name:P.tools[0].name,input:{slides}}]})})}
  return reply('ok')});
await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bohioVoiceLang','en')});await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>{window.__speak=0;const o=speechSynthesis.speak.bind(speechSynthesis);speechSynthesis.speak=u=>{window.__speak++;o(u)};showTab('report');RSEL='ic';renderReportList();renderReport()});
await p.waitForTimeout(2500);
// 1. the report bar, marketing style
const bar=await p.evaluate(()=>({langs:[...document.querySelectorAll('#rpLang .btn')].map(b=>b.textContent),tools:[...document.querySelectorAll('.rp-tools .btn')].map(b=>b.textContent.trim()),playBg:getComputedStyle(document.querySelector('#rplay')).backgroundColor}));
ok(bar.langs.join('|')==='English|العربية'&&bar.tools[0]==='▶'&&bar.tools.includes('Download PDF')&&bar.tools.includes('Download PowerPoint')&&/241, 90, 34/.test(bar.playBg),'report bar: language toggle, small download buttons, orange ▶: '+bar.tools.join(' · '));
await p.locator('.card:has(#rpTitle)').screenshot({path:sp+'rp_bar.png'});
// 2. Arabic pre-built in the background, instant toggle
await p.waitForTimeout(2500);
ok(await p.evaluate(()=>!!rpArabicReady('ic')),'the Arabic version of the IC pack was built in the background');
await p.click('[data-rplang="ar"]');await p.waitForTimeout(300);
const ar=await p.evaluate(()=>({rtl:$('#report').classList.contains('rtl'),txt:$('#report').textContent.slice(0,80),note:$('#rpLangNote').style.display,vl:localStorage.getItem('bohioVoiceLang')}));
ok(ar.rtl&&/ع /.test(ar.txt)&&ar.note==='none'&&ar.vl==='ar','the toggle swaps to Arabic at once (right-to-left, no wait) and sets the narration language');
await p.click('[data-rplang="en"]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>!$('#report').classList.contains('rtl')&&/Investment Committee|Headline/.test($('#report').textContent)),'and back to English at once');
// 3. play mode: one voice only, pause stops it, language button switches with the pre-written script
await p.click('#rplay');await p.waitForTimeout(3500);
const v1=await p.evaluate(()=>({speak:window.__speak,playing:[...KALL].filter(a=>!a.paused).length,all:KALL.size,mode:KVOICE.mode}));
ok(v1.speak===0&&v1.playing<=1&&v1.mode==='eleven','ElevenLabs only: no browser voice, at most one clip playing: '+JSON.stringify(v1));
await p.click('.kd-root [data-act=pause]');await p.waitForTimeout(400);
ok(await p.evaluate(()=>[...KALL].every(a=>a.paused)&&speechSynthesis.speaking===false),'pause silences everything');
await p.click('.kd-root [data-act=pause]');await p.waitForTimeout(800);
ok(await p.evaluate(()=>[...KALL].filter(a=>!a.paused).length<=1),'resume plays one clip');
const arReady=await p.evaluate(()=>[...KS_DONE.keys()].some(k=>/\|ar$/.test(k))&&[...KS_DONE.keys()].some(k=>/\|en$/.test(k)));
ok(arReady,'both language scripts were written ahead');
await p.click('.kd-root [data-act=lang]');await p.waitForTimeout(1200);
const sw=await p.evaluate(()=>({lang:kLang(),cc:(document.querySelector('.kd-cc')||{}).dir,txt:(document.querySelector('.kd-cc')||{}).textContent||'',btn:document.querySelector('.kd-root [data-act=lang]').textContent,playing:[...KALL].filter(a=>!a.paused).length}));
ok(sw.lang==='ar'&&sw.cc==='rtl'&&/شريحة|صباح|مساء/.test(sw.txt)&&sw.btn==='EN'&&sw.playing<=1,'the deck language button switches to Arabic narration at once: '+JSON.stringify(sw).slice(0,160));
await p.waitForTimeout(800);const sl=await p.evaluate(()=>({rtl:document.querySelector('.kd-root').classList.contains('kd-rtl'),deckLang:KP.deck.lang,txt:document.querySelector('.kd-slide').innerText.slice(0,200),title:KP.deck.slides[KP.i].title}));
ok(sl.rtl&&sl.deckLang==='ar'&&/ع /.test(sl.txt),'the slides themselves are in Arabic (translated deck, right-to-left): '+JSON.stringify(sl).slice(0,160));
await p.evaluate(()=>closeDeck());await p.waitForTimeout(300);await p.click('#rplay');await p.waitForTimeout(1500);
ok(await p.evaluate(()=>KP.deck.lang==='ar'&&document.querySelector('.kd-root').classList.contains('kd-rtl')&&/ع /.test(document.querySelector('.kd-slide').innerText)),'with Arabic selected, ▶ opens the Arabic deck at once (pre-built)');
await p.click('.kd-root [data-act=lang]');await p.waitForTimeout(800);
ok(await p.evaluate(()=>KP.deck.lang!=='ar'&&!document.querySelector('.kd-root').classList.contains('kd-rtl')&&!/ع /.test(document.querySelector('.kd-slide').innerText)),'and back to the English deck at once');
// 4. donut: hover does not move the segment
await p.evaluate(()=>{closeDeck();openDeck(buildDeck('ic'))});await p.waitForTimeout(600);
const di=await p.evaluate(()=>KP.deck.slides.findIndex(s=>s.kind==='donut'));
if(di>=0){await p.evaluate(i=>{KP.playing=false;kGo(i)},di);await p.waitForTimeout(2500);const seg=p.locator('.kd-root .kd-dseg').first();const b1=await seg.boundingBox();await p.mouse.move(b1.x+b1.width/2,b1.y+b1.height/2);await p.waitForTimeout(500);const b2=await seg.boundingBox();
  ok(Math.abs(b1.y-b2.y)<1&&Math.abs(b1.x-b2.x)<1,'donut segment stays put on hover (no flicker): '+JSON.stringify({before:b1.y,after:b2.y}))}else console.log('SKIP no donut slide');
await p.evaluate(()=>closeDeck());
console.log('voice calls',voice,'errs',errs);await b.close();
