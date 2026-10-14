// ▶ Play with the marketing agent's logic: script rules + [[ref]] marks, greeting, spoken dates / British English,
// questions during the presentation (typed here; voice goes through /api/voice transcribe), answers with AI-calc tags.
import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1600,height:1000}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,300)]);
let llm=[],voice=[];
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'browser'})});voice.push(JSON.parse(r.request().postData()));r.fulfill({status:501,contentType:'application/json',body:'{"error":"no voice"}'})});
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());llm.push(j);const tools=j.payload.tools||[];
  if(tools[0]&&tools[0].name==='write_narration'){const brief=JSON.parse(j.payload.messages[0].content.replace(/^Deck:\n/,''));
    const slides=brief.map(s=>({i:s.i,say:s.items&&s.items.length>1?`Here is ${s.title}. [[1]]The second item matters most, and I would analyze it closely. [[0]]The first is steady.`:`Good morning. This is ${s.title}, as of 05/10/2026.`}));
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,stop_reason:'tool_use',content:[{type:'tool_use',id:'t1',name:'write_narration',input:{slides}}]})})}
  if(j.task==='answer'){const text='Let me answer your question about the margin. My reading is that construction is the driver, and the margin sits 0.8 points ⟦calc: 15% − 14.2%⟧ under the hurdle. Shall we carry on?';
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,content:[{type:'text',text}]})})}
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'text',text:'ok'}]})})});
const ev=(f,a)=>p.evaluate(f,a);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
ck('the Daily feed is the landing page; Reports is first in the left menu',await ev(()=>document.querySelector('#prNav [data-gtab]').dataset.gtab==='report'&&$('#p-appr').classList.contains('on')),'');
// spoken English
const sp1=await ev(()=>{localStorage.setItem('bohioVoiceLang','en');return[kSpeech('We will analyze it on 5 Oct 2026; the IRR is 18.40% vs 18% — up 0.70 pts.'),kSpeech('Monday, 5 October '+new Date().getFullYear()+' and Jun–Oct'),kSpeech('SAR 130.0M · color')]});
ck('spoken English: American spelling, dates said the American way, symbols said, riyals',/analyze/.test(sp1[0])&&/October fifth/.test(sp1[0])&&/versus/.test(sp1[0])&&/points/.test(sp1[0])&&/18\.4 percent/.test(sp1[0])&&/October fifth(?!,)/.test(sp1[1])&&/June to October/.test(sp1[1])&&/130 million SAR/.test(sp1[2])&&/color/.test(sp1[2]),sp1.join(' || '));
// play: AI script with [[ref]] marks
await ev(()=>{showTab('report');RSEL='ic';renderReport()});await p.click('#rplay');await p.waitForTimeout(2500);
const nr=llm.find(j=>j.payload.tools&&j.payload.tools[0].name==='write_narration');
ck('script prompt: the marketing agent’s rules (presenter not reader, lead with the change, [[ref]] marks, American English, no greeting, 30–70 words)',nr&&/You are a presenter, not a reader/.test(nr.payload.system)&&/Lead with the change/.test(nr.payload.system)&&/\[\[ref\]\]/.test(nr.payload.system)&&/American English, always/.test(nr.payload.system)&&/Do not greet/.test(nr.payload.system)&&/30 to 70 words/.test(nr.payload.system)&&nr.payload.model==='claude-fable-5-1',nr?nr.payload.system.slice(0,120):'no request');
const brief=JSON.parse(nr.payload.messages[0].content.replace(/^Deck:\n/,''));
ck('brief: items with refs and what changed since the previous export (options 2 and 3)',brief.some(s=>s.items&&s.items.length&&s.items[0].ref===0)&&(/mode=full/.test(base)||brief.some(s=>Array.isArray(s.changedSinceLastExport)&&/first export|Compared with/.test(s.changedSinceLastExport[0]))),JSON.stringify(brief.find(s=>s.changedSinceLastExport)||{}).slice(0,200));
const sc=await ev(()=>{const k=KP.script.segs.findIndex(g=>g&&g.length===3);return{k,segs:KP.script.segs[k],labels:kFigLabels(KP.deck.slides[k]),ai:KP.script.ai}});
ck('[[ref]] marks become segments about those items (in the order spoken), American spelling applied',sc.ai&&sc.segs&&sc.segs[1].f===sc.labels[1]&&sc.segs[2].f===sc.labels[0]&&sc.segs[0].f===null&&/analyze/.test(sc.segs[1].t),JSON.stringify(sc).slice(0,300));
const g=await ev(()=>({first:KP.segs[0].t,second:(KP.segs[1]||{}).t||''}));
ck('the first slide opens with the greeting for the time it is played (the script’s own greeting removed)',/^Good (morning|afternoon|evening)\.$/.test(g.first)&&!/Good morning/.test(g.second),JSON.stringify(g));
// a typed question while paused → taken at once, answered aloud, AI tagged, then on to the next slide
await ev(()=>kPause());const i0=await ev(()=>KP.i);
await p.click('[data-act=asktype]');await p.waitForTimeout(400);
ck('💬 Ask opens the question box; 🎤 only with ElevenLabs (as in the marketing agent)',await ev(()=>[...KP.root.querySelectorAll('[data-act=ask]')].every(b=>b.style.display==='none'))&&await ev(()=>!KP.root.querySelector('.kd-qa').hidden),'');
await p.fill('.kd-qa-form input','Why is the margin under the hurdle?');await p.press('.kd-qa-form input','Enter');await p.waitForTimeout(900);
const qa=await ev(()=>({st:KP.qa.state,q:KP.root.querySelector('.kd-qa-q').textContent,a:KP.root.querySelector('.kd-qa-a').innerHTML,hist:KP.qa.history.length}));
const aq=llm.find(j=>j.task==='answer'&&/checking it landed/.test(j.payload.system||''));
ck('the question goes to the quick answer tier (Sonnet 5.5) with the slides so far and the slide on screen marked',aq&&aq.payload.model==='claude-sonnet-5-5'&&/Variation seed/.test(JSON.stringify(aq.payload.messages))&&/checking it landed/.test(aq.payload.system)&&/Why is the margin under the hurdle/.test(JSON.stringify(aq.payload.messages))&&/>> Slide/.test(JSON.stringify(aq.payload.messages))&&/never repeat the question verbatim/.test(aq.payload.system)&&/⟦calc/.test(aq.payload.system),aq?aq.payload.model:'none');
ck('the answer is shown with its AI tagged (clickable), and kept in the history',/fig-calc/.test(qa.a)&&/0\.8 points/.test(qa.a)&&/AI/.test(qa.a)&&qa.hist===1&&/margin/.test(qa.q),JSON.stringify(qa).slice(0,260));
await p.waitForTimeout(3500);
ck('after the answer: six seconds for a follow-up, with the box open',await ev(i0=>KP.qa.state==='follow'&&KP.i===i0&&!KP.root.querySelector('.kd-qa').hidden&&/Any other question/.test(KP.root.querySelector('.kd-qa-st').textContent),i0),await ev(()=>KP.qa.state));
await p.waitForTimeout(9000);
ck('no follow-up: a varied move-on line, then the slide it was asked on carries on (asked while paused, as in the marketing agent)',await ev(i0=>KP&&KP.i===i0&&KP.playing&&!KP.qa.state&&KLINES.moveOn.en.length===6,i0),await ev(()=>KP&&[KP.i,KP.playing,KP.qa.state].join()));
// typing a question holds the deck at the end of the slide
await ev(()=>{const b=KP.root.querySelector('.kd-qa');b.hidden=false;KP.root.querySelector('.kd-qa-form input').value='What about'});const i1=await ev(()=>KP.i);
await ev(()=>{clearTimeout(KP.timer);kStopVoice();if(KP.pace){KP.pace();KP.pace=null}KP.dur=300;kStartTimer()});await p.waitForTimeout(6500);
ck('a question being written holds the deck at the end of the slide',await ev(i1=>KP.i===i1&&KP.qa.hold===i1&&!KP.playing&&/Paused for your question/.test(KP.root.querySelector('.kd-qa-st').textContent),i1),await ev(()=>[KP.i,KP.qa.hold,KP.playing].join()));
await p.click('[data-act=qaclose]');await p.waitForTimeout(300);
ck('closing the box carries on to the next slide',await ev(i1=>KP.i===i1+1&&KP.playing&&KP.qa.hold==null,i1),await ev(()=>[KP.i,KP.qa.hold,KP.playing].join()));
ck('stock lines rotate',await ev(()=>{const a=kStock('bridge'),b=kStock('bridge');return a!==b&&KLINES.bridge.en.includes(a)}),'');
ck('voice button is just the speaker icon',await ev(()=>{const b=document.querySelector('[data-act=voice]');return b.style.display==='none'||/^(🔊|🔇)$/.test(b.textContent)}),'');
// a question while playing waits for the end of the slide
await ev(()=>kAskQ('And the peak debt?'));ck('asked while playing: waits for the end of the slide (the question shown, no note)',await ev(()=>KP.qa.state==='waiting'&&/peak debt/.test(KP.root.querySelector('.kd-qa-q').textContent)&&!KP.root.querySelector('.kd-qa-st').textContent),await ev(()=>KP.qa.state));
await p.keyboard.press('Escape');await p.waitForTimeout(300);
ck('no page errors',!errs.length,errs.join(' | ').slice(0,300));
console.log(R.map(r=>r.join(' | ')).join('\n'));console.log(`t_play ${tag}: ${R.filter(r=>r[0]==='PASS').length} pass ${R.filter(r=>r[0]==='FAIL').length?'FAIL '+R.filter(r=>r[0]==='FAIL').map(r=>r[1]).join(' / '):''}`);
await b.close();
