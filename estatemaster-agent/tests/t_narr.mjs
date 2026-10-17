// Narration: hidden script (not the slide text), figure highlight in sync with ElevenLabs timestamps, Arabic, voice menu,
// data-library blocks, new report on the spot from the designer chat, no bell, no sandbox card.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=full',tag=process.argv[3]||'full';
const sr=8000,n=sr*1.2|0,wav=Buffer.alloc(44+n);wav.write('RIFF',0);wav.writeUInt32LE(36+n,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(n,40);wav.fill(128,44);
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--autoplay-policy=no-user-gesture-required']});const ctx=await b.newContext({viewport:{width:1440,height:1000}});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));const voiceReq=[];let llmReq=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?sp+'pptx/package/dist/pptxgen.bundle.js':sp+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>{const u=r.request().url();if(r.request().method()==='GET'){if(/list=1/.test(u))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({voices:[{id:'JBFqnCBsd6RMkjVDRZzb',name:'George',labels:{accent:'British',gender:'male',use_case:'narration'},preview:'https://example.invalid/g.mp3'},{id:'AZnzlk1XvdvUeBnXmlld',name:'Hamid',labels:{accent:'Arabic',gender:'male',language:'ar'},preview:''},{id:'EXAVITQu4vr4xnSDxMaL',name:'Sarah',labels:{accent:'American',gender:'female'},preview:''}],voice:'21m00Tcm4TlvDq8ikWAM',model:'eleven_multilingual_v2'})});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,provider:'elevenlabs',model:'eleven_multilingual_v2',voice:'21m00Tcm4TlvDq8ikWAM'})})}
  const bj=JSON.parse(r.request().postData());voiceReq.push(bj);const chars=[...bj.text],starts=chars.map((c,i)=>+(i/chars.length*1.2).toFixed(3));
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_base64:wav.toString('base64'),mime:'audio/wav',alignment:{characters:chars,character_start_times_seconds:starts}})})});
let llmOn=false;
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:llmOn,openai:false},passwordRequired:false})});
  const j=JSON.parse(r.request().postData());llmReq.push(j);const tool=(j.payload.tools||[])[0];
  if(tool&&tool.name==='write_narration'){const brief=JSON.parse(j.payload.messages[0].content.replace(/^Deck:\n/,''));const slides=brief.map(s=>({i:s.i,say:s.items&&s.items.length?`Let me show you ${s.title}. [[0]]The one that matters here is ${s.items[0].what}: it tells the story of this slide.`:`Now, ${s.title}.`}));
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t1',name:'write_narration',input:{slides}}]})})}
  if(tool&&tool.name==='update_report')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t2',name:'update_report',input:{new_report:true,name:'Treasury stress view',audience:'CFO',purpose:'See how funding holds under past episodes',tone:'board',blocks:['kpis','scenario_library','covenant_history','macro_context'],slides:[{block:'scenario_library',kind:'table'}],options:{max_slides:8,dividers:false,narrative:false,headline:true,closing:true},summary:'Four sections for the CFO.'}}]})});
  /* the agent on the Reports page (AI first): a request for a new report is a create_report call, as a real model makes it */
  {const ms=j.payload.messages||[],last=ms[ms.length-1];if((j.payload.tools||[]).some(t=>t.name==='create_report')&&last&&last.role==='user'&&typeof last.content==='string'&&/treasury stress report/i.test(last.content))
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t3',name:'create_report',input:{description:last.content}}]})})}
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'text',text:'ok'}]})})});
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,260)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
ck('no bell, no sandbox card',await ev(()=>!document.querySelector('#bellBtn')&&!document.querySelector('#bellPanel')&&getComputedStyle(document.querySelector('#sbCard')).display==='none'),'');
// data library
const dl=await ev(()=>({cat:DS.catalogue().length,card:!$('#dsCat'),blocks:Object.keys(DS_BLOCKS).length,q:dsQuery('funds','opportunity').slice(0,80),sc:buildDeck('scenarios').slides.map(s=>s.kind).join(','),tr:/<table/.test(RPTS.track.fn()),tools:TOOLS.some(t=>t.name==='query_data')}));
ck('data library: no card on Reports any more (moved to Market data), blocks, query, new built-in reports',dl.cat>=8&&dl.card&&dl.blocks>=15&&/Opportunity Fund II/.test(dl.q)&&/hbars/.test(dl.sc)&&dl.tr&&dl.tools,JSON.stringify(dl).slice(0,200));
await p.evaluate(()=>showTab('report'));await p.fill('#ask','past projects hittin');await p.evaluate(()=>$$('.rp-win.on').forEach(m=>m.classList.remove('on')));await p.click('#send');await p.waitForTimeout(1200);
ck('chat answers from the data library',/Hittin Plaza/.test(await p.textContent('#msgs .msg.agent:last-child .body')),(await p.textContent('#msgs .msg.agent:last-child .body')).slice(0,120));
// built-in script: not the slide text, figures tagged
const sc=await ev(()=>{const d=buildDeck('ic');const S=kScriptDeck(d,RPTS.ic);return{n:S.length,cover:S[0][0].t,head:S[1].map(g=>[g.t,g.f]),literal:S.some((segs,i)=>kSegText(segs)===d.slides[i].say&&!['closing'].includes(d.slides[i].kind)),figs:S.flat().filter(g=>g.f).length,labels:kFigLabels(d.slides[1])}});
ck('built-in script speaks about the figures, not the slide text',sc.n>5&&/Let’s walk through/.test(sc.cover)&&!/Committee Pack/i.test(sc.cover)&&sc.head.some(g=>/comes in at .* percent/.test(g[0])&&g[1]==='Levered IRR')&&sc.figs>=8,JSON.stringify(sc).slice(0,300));
// play: script hidden, figure highlighted in sync with the timestamps
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(400);await ev(()=>{RSEL='ic';renderReportList();renderReport()});
await p.click('#rplay');await p.waitForTimeout(1200);
ck('captions on by default (as in the marketing agent)',await ev(()=>document.querySelector('.kd-cc').style.visibility!=='hidden'&&KP.cc),'');
await ev(()=>kGo(1));await p.waitForTimeout(700);
const f0=await ev(()=>({figs:document.querySelectorAll('.kd-enter [data-fig]').length,focus:document.querySelector('.kd-enter .kd-focus')&&document.querySelector('.kd-enter .kd-focus').dataset.fig,dim:document.querySelector('.kd-enter').classList.contains('kd-dimmed')}));
await p.waitForTimeout(500);const f1=await ev(()=>document.querySelector('.kd-enter .kd-focus')&&document.querySelector('.kd-enter .kd-focus').dataset.fig);
await p.screenshot({path:`${sp}narr_${tag}_focus.png`});
ck('headline: stats carry figure anchors; the spoken figure glows and moves with the audio',f0.figs>=4&&(f0.focus||f1)&&f1!==f0.focus||(f0.focus&&f0.dim),JSON.stringify({f0,f1}));
ck('ElevenLabs asked with timestamps and continuity text',voiceReq.some(r=>r.timestamps===true)&&voiceReq.some(r=>r.next_text||r.previous_text),JSON.stringify(voiceReq[0]||{}).slice(0,160));
// voice menu
await p.click('[data-act=vmenu]');await p.waitForTimeout(600);
const vm=await ev(()=>({rows:document.querySelectorAll('.kd-vm-row').length,lang:document.querySelectorAll('[data-vlang]').length,first:document.querySelector('.kd-vm-row b').textContent}));
ck('voice menu lists the account voices with a language switch',vm.rows===3&&vm.lang===2,JSON.stringify(vm));
await p.click('[data-vpick="JBFqnCBsd6RMkjVDRZzb"]');await p.waitForTimeout(200);await ev(()=>kGo(2));await p.waitForTimeout(600);
ck('chosen voice goes into the next request',voiceReq.at(-1).voice==='JBFqnCBsd6RMkjVDRZzb'&&/George/.test(await ev(()=>document.querySelector('[data-act=vmenu]').textContent)),voiceReq.at(-1).voice);
// Arabic
await p.click('[data-vlang=ar]');await p.waitForTimeout(900);
const ar=await ev(()=>({lang:kLang(),dir:document.querySelector('.kd-cc').dir,first:document.querySelector('.kd-vm-row')?document.querySelector('.kd-vm-row b').textContent:'',seg:KP.segs[0].t}));
ck('Arabic narration: script in Arabic, captions RTL',ar.lang==='ar'&&ar.dir==='rtl'&&/[؀-ۿ]/.test(ar.seg)&&/[؀-ۿ]/.test(voiceReq.at(-1).text),JSON.stringify(ar).slice(0,200));
await p.click('[data-act=vmenu]');await p.waitForTimeout(400);const ord=await ev(()=>document.querySelector('.kd-vm-row b').textContent);ck('Arabic-labelled voice listed first',ord==='Hamid',ord);
await p.click('[data-vpick="AZnzlk1XvdvUeBnXmlld"]');await p.waitForTimeout(200);await ev(()=>kGo(3));await p.waitForTimeout(600);
ck('Arabic voice choice kept separately from English',voiceReq.at(-1).voice==='AZnzlk1XvdvUeBnXmlld'&&voiceReq.at(-1).lang==='ar'&&(await ev(()=>JSON.parse(localStorage.getItem('bohioVoice')).id))==='JBFqnCBsd6RMkjVDRZzb',JSON.stringify(voiceReq.at(-1)).slice(0,120));
await p.click('[data-vlang=en]');await p.waitForTimeout(600);
// CC shows the script segment
await p.waitForTimeout(200);ck('CC shows the current script line',await ev(()=>document.querySelector('.kd-cc').style.visibility!=='hidden'&&document.querySelector('.kd-cc').textContent.length>10),await ev(()=>document.querySelector('.kd-cc').textContent.slice(0,80)));
await p.keyboard.press('Escape');await p.waitForTimeout(300);
// AI script writer (Fable) + new report on the spot
llmOn=true;await p.reload();await p.waitForTimeout(1200);await p.evaluate(()=>toggleDock(true));ck('AI on',await ev(()=>apiOn()),'');
llmReq=[];await p.evaluate(()=>showTab('report'));await ev(()=>{RSEL='lender';renderReportList();renderReport()});await p.click('#rplay');await p.waitForTimeout(2500);
const ai=await ev(()=>({ai:KP.script.ai,model:KP.script.model,seg:KP.script.segs[1]&&KP.script.segs[1][1]}));
const nr=llmReq.find(r=>r.payload.tools&&r.payload.tools[0].name==='write_narration');
ck('AI script written by Fable 5.1 from the deck brief, figure-tagged',ai.ai&&/Fable/.test(ai.model)&&ai.seg&&ai.seg.f&&nr.payload.model==='claude-fable-5-1'&&/You are a presenter, not a reader/.test(nr.payload.system)&&/\[\[ref\]\]/.test(nr.payload.system)&&/American English, always/.test(nr.payload.system),JSON.stringify(ai).slice(0,200));
await p.keyboard.press('Escape');await p.waitForTimeout(300);
await p.evaluate(()=>{showTab('report');toggleDock(true)});await p.fill('#ask','create a treasury stress report for the CFO: scenario library, covenants and the macro picture');await p.click('#send');await p.waitForTimeout(2500);
const cr=await ev(()=>({name:RPTS[RSEL].name,aud:RPTS[RSEL].aud,blocks:RPTS[RSEL].blocks,sl:RPTS[RSEL].slides,reply:$('#msgs .msg.agent:last-child').textContent,builtin:!!RPTS[RSEL].builtin,n:Object.keys(RPTS).length}));
ck('designer chat creates a new report on the spot (API)',cr.name==='Treasury stress view'&&cr.aud==='CFO'&&cr.blocks.includes('scenario_library')&&cr.sl.scenario_library==='table'&&/created|create_report/.test(cr.reply)&&!cr.builtin,JSON.stringify(cr).slice(0,260));
await p.evaluate(()=>showTab('report'));await p.fill('#ask','build me a new report for the board on funding risk');await p.evaluate(()=>$$('.rp-win.on').forEach(m=>m.classList.remove('on')));await p.click('#send');await p.waitForTimeout(1500);
{const body=await p.textContent('#msgs .msg.agent:last-child .body');const viaAI=llmReq.some(j=>j.payload.tools&&j.payload.tools.some(t=>(t.name||(t.function&&t.function.name))==='create_report'));ck('the chat on the Reports page creates a report through the AI designer',/New report: Treasury stress view|Treasury stress view created/.test(body)||viaAI,body.slice(0,120))}
// without AI: rules engine still creates one
llmOn=false;await p.reload();await p.waitForTimeout(1000);await p.evaluate(()=>toggleDock(true));await p.evaluate(()=>showTab('report'));await p.fill('#ask','new report for the lender with covenants, drawdowns and the stress tests as a table');await p.click('#send');await p.waitForTimeout(1500);
const cr2=await ev(()=>({aud:RPTS[RSEL].aud,blocks:RPTS[RSEL].blocks,sl:RPTS[RSEL].slides}));
ck('rules engine creates a report without AI',cr2.aud==='Murabaha lender'&&cr2.blocks.includes('covenants')&&cr2.sl.stress_table==='table',JSON.stringify(cr2));
const stt=await ev(()=>selfTest().filter(r=>!r.info).map(r=>[r.ok,r.name,r.detail]));ck('selfTest 24',stt.every(r=>r[0])&&stt.length===24,JSON.stringify(stt.filter(r=>!r[0]))+' n='+stt.length);
ck('no page errors',!errs.length,errs.join(' | '));
for(const r of R)console.log(r.join('  '));await b.close();
